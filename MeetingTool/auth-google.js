#!/usr/bin/env node
/* One-time Google consent, per person.
 *
 *   node auth-google.js
 *
 * Opens a Google sign-in, captures the code on a loopback listener, and appends the resulting
 * refresh token to google-tokens.json. Run it once per teammate who organises meetings — Meet
 * notes land in the ORGANISER's Drive, so anyone missing here is invisible to the poller.
 *
 * Loopback, not the old copy-a-code flow: Google killed `urn:ietf:wg:oauth:2.0:oob` in 2022, so
 * a desktop client must redirect to http://127.0.0.1:<port>. That is why this spins a server for
 * about thirty seconds instead of just printing a URL.
 *
 * Run it on your laptop, then copy google-tokens.json to the VPS. It never needs to run there.
 *
 * Setup in Google Cloud (no admin required, and no org policy blocks any of it):
 *   1. APIs & Services -> Enable "Google Drive API"
 *   2. OAuth consent screen -> User type INTERNAL   <- not optional, see below
 *   3. Credentials -> Create credentials -> OAuth client ID -> Desktop app
 *   4. Put the client id + secret in .env as GOOGLE_OAUTH_CLIENT_ID / _SECRET
 *
 * INTERNAL matters: an app left in "Testing" issues refresh tokens that die after 7 days, and
 * the cron would stop silently a week after you set it up.
 */

import "./env.js";
import { createServer } from "node:http";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { AUTH_SCOPES, tokensFile } from "./engine/sources/google-auth.js";

const PORT = Number(process.env.GOOGLE_OAUTH_PORT || 53682);
const REDIRECT = `http://127.0.0.1:${PORT}`;

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in MeetingTool/.env first.");
  console.error("Google Cloud -> Credentials -> Create credentials -> OAuth client ID -> Desktop app");
  process.exit(2);
}

// PKCE. Not strictly required for a confidential desktop client, but it costs four lines and
// closes the window where a local process could race the redirect and steal the code.
//
// The verifier is PERSISTED next to this file. Without that, killing the process (or closing the
// terminal) between opening the URL and approving it strands a perfectly good authorization code:
// Google redirects back with `code=…`, nothing is listening, and the code can never be exchanged
// because the verifier died with the process. With it, `node auth-google.js --exchange <url>`
// finishes the job by hand. Learned the hard way.
const PENDING = join(dirname(fileURLToPath(import.meta.url)), ".oauth-pending.json");

const EXCHANGE_AT = process.argv.indexOf("--exchange");
if (EXCHANGE_AT >= 0) {
  const arg = process.argv[EXCHANGE_AT + 1];
  if (!arg) { console.error("usage: node auth-google.js --exchange <code | full redirect URL>"); process.exit(2); }
  if (!existsSync(PENDING)) { console.error(`no pending sign-in (${PENDING} is missing) — run \`node auth-google.js\` first`); process.exit(2); }
  const pending = JSON.parse(readFileSync(PENDING, "utf8"));
  // Accept either the raw code or the whole "this site can't be reached" URL from the address bar.
  const code = arg.includes("code=") ? new URL(arg.replace(/^127\.0\.0\.1/, "http://127.0.0.1")).searchParams.get("code") : arg;
  await exchange(code, pending.verifier, `http://127.0.0.1:${pending.port}`);
  process.exit(0);
}

const verifier = randomBytes(48).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");
writeFileSync(PENDING, JSON.stringify({ verifier, port: PORT, created: new Date().toISOString() }, null, 2));

const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
Object.entries({
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT,
  response_type: "code",
  scope: AUTH_SCOPES,
  access_type: "offline",     // without this there is no refresh token at all
  prompt: "consent",          // force a refresh token even if they have authorised before
  code_challenge: challenge,
  code_challenge_method: "S256",
}).forEach(([k, v]) => authUrl.searchParams.set(k, v));

console.log("\nOpen this in the browser, signed in as the person whose meetings you want to read:\n");
console.log(authUrl.toString() + "\n");
console.log("  Sign in with the WORKSPACE account (…@" + (process.env.INTERNAL_DOMAIN || "creativeadbundance.com") + ").");
console.log("  A personal @gmail.com account has no Meet notes to read, and an Internal");
console.log("  consent screen will refuse it. Use the account chooser, not a logout.\n");
console.log("  If Google says `Error 400: redirect_uri_mismatch`, the OAuth client is a");
console.log("  \"Web application\", not a \"Desktop app\". Either recreate it as a Desktop app,");
console.log("  or add this EXACT string to its Authorized redirect URIs:\n");
console.log(`      ${REDIRECT}\n`);
console.log(`Waiting for the redirect on ${REDIRECT} …  (ctrl-c to cancel)\n`);

const server = createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  const done = (msg) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<meta charset=utf-8><body style="font:16px system-ui;padding:3rem;max-width:32rem">${msg}</body>`);
  };

  if (error) { done(`<b>Denied:</b> ${error}. You can close this tab.`); console.error(`denied: ${error}`); server.close(); process.exit(1); }
  if (!code) { res.writeHead(404); res.end(); return; }

  try {
    const email = await exchange(code, verifier, REDIRECT);
    done(`<b>Connected as ${email}.</b><br>Token saved. You can close this tab.`);
  } catch (e) {
    console.error(String(e.message || e));
    done(`<b>Failed:</b> ${String(e.message || e)}`);
  } finally {
    server.close();
    setTimeout(() => process.exit(0), 250);
  }
});

server.listen(PORT, "127.0.0.1");

/** Swap an authorization code for a refresh token and store it under the verified email.
 *  Shared by the listener and by `--exchange`, so both paths behave identically. */
async function exchange(code, verifier, redirect) {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      redirect_uri: redirect, grant_type: "authorization_code", code_verifier: verifier,
    }),
  });

  if (!tokenRes.ok) {
    const body = (await tokenRes.text()).slice(0, 300);
    // A code is single-use and lives ~10 minutes. Say so plainly — the fix is to sign in again,
    // not to debug anything.
    if (body.includes("invalid_grant")) {
      throw new Error("that authorization code is expired or already used — run `node auth-google.js` and sign in again");
    }
    throw new Error(`${tokenRes.status}: ${body}`);
  }

  const tok = await tokenRes.json();
  if (!tok.refresh_token) {
    throw new Error("Google returned no refresh_token. Revoke this app at myaccount.google.com/permissions and run again.");
  }

  // Who did they sign in as? The id_token carries the verified email, so we key the store on the
  // real account rather than trusting whatever was typed on a command line.
  const claims = JSON.parse(Buffer.from(tok.id_token.split(".")[1], "base64url").toString());
  const email = claims.email;

  const path = tokensFile();
  const store = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  store[email] = { refresh_token: tok.refresh_token, authorised_at: new Date().toISOString() };
  writeFileSync(path, JSON.stringify(store, null, 2));
  try { rmSync(PENDING, { force: true }); } catch {}

  const domain = process.env.INTERNAL_DOMAIN || "creativeadbundance.com";
  console.log(`\nsaved refresh token for ${email} -> ${path}`);
  if (!email.toLowerCase().endsWith("@" + domain.toLowerCase())) {
    console.log(`WARNING: ${email} is not on @${domain}. Meet notes live in the Workspace account's`);
    console.log(`         Drive, so this token probably has nothing to read. Sign in again as the`);
    console.log(`         Workspace account and this entry can be deleted from ${path}.`);
  }
  console.log(`authorised so far: ${Object.keys(store).join(", ")}`);
  console.log("\nRun again for the next teammate, or `node poll-drive.js --dry` to try it.\n");
  return email;
}
