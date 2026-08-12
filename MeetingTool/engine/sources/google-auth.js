/* Google access tokens — two strategies, tried in order.
 *
 *   1. OAuth refresh tokens, one per person (google-tokens.json)   <- default
 *   2. Service-account JWT with domain-wide delegation             <- only if a key exists
 *
 * Why OAuth is the default: new Google Cloud orgs enforce the `iam.disableServiceAccountKeyCreation`
 * policy, which blocks creating the JSON key a service account needs to sign its own JWT. You can
 * turn that policy off — you own the org — but it exists for a good reason and this repo has
 * already leaked two API keys. A service-account key is a permanent credential that reads every
 * Drive in the domain; a per-person refresh token reads one Drive, is revocable by that person
 * from their own account page, and requires no admin to grant.
 *
 * The consent flow is one click per teammate, run once, via `node auth-google.js`.
 *
 * IMPORTANT: set the OAuth consent screen's User type to **Internal** in Google Cloud. An app in
 * "Testing" issues refresh tokens that expire after 7 days, and the poller would silently stop a
 * week after you set it up — the worst possible failure mode for a cron job.
 *
 * Env:
 *   GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET
 *   GOOGLE_TOKENS_FILE   default ./google-tokens.json  { "carl@…": { "refresh_token": "…" } }
 *   GOOGLE_SA_KEY_FILE   optional fallback: service-account JSON key (needs DWD)
 */

import { createSign } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
export const AUTH_SCOPES = `${DRIVE_SCOPE} openid email`;
const TOKEN_URL = "https://oauth2.googleapis.com/token";

const cache = new Map(); // subject -> { token, exp }

export function tokensFile(env = process.env) {
  // fileURLToPath, not .pathname — the latter leaves a leading slash on Windows drive letters
  // and leaves %20 in any path with a space in it.
  return env.GOOGLE_TOKENS_FILE || fileURLToPath(new URL("../../google-tokens.json", import.meta.url));
}

export function readTokens(env = process.env) {
  const path = tokensFile(env);
  if (!existsSync(path)) return {};
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch (e) { throw new Error(`${path} is not valid JSON: ${e.message}`); }
}

/** Strategy 1 — swap a stored refresh token for an access token. */
async function fromRefreshToken(subject, env) {
  const store = readTokens(env);
  const entry = store[subject] || store[subject?.toLowerCase()];
  if (!entry?.refresh_token) return null;

  const id = env.GOOGLE_OAUTH_CLIENT_ID, secret = env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!id || !secret) throw new Error("google-tokens.json has a token for " + subject + " but GOOGLE_OAUTH_CLIENT_ID/SECRET are not set");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: entry.refresh_token, client_id: id, client_secret: secret }),
  });

  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    // invalid_grant = the person revoked access, changed password, or the app is still in
    // "Testing" and the 7-day token expired. Say which, because the fix differs.
    if (body.includes("invalid_grant")) {
      throw new Error(`refresh token for ${subject} is dead (revoked, or the consent screen is still in Testing — set User type to Internal). Re-run: node auth-google.js`);
    }
    throw new Error(`google token ${res.status} for ${subject}: ${body}`);
  }
  return res.json();
}

/** Strategy 2 — service account impersonating a user. Needs a JSON key, which a default-secure
 *  org blocks; kept for orgs that allow it, since DWD covers everyone without per-person consent. */
async function fromServiceAccount(subject, env) {
  const keyFile = env.GOOGLE_SA_KEY_FILE;
  if (!keyFile || !existsSync(keyFile)) return null;
  const key = JSON.parse(readFileSync(keyFile, "utf8"));

  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: key.client_email, sub: subject, scope: DRIVE_SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600,
  })}`;
  const sig = createSign("RSA-SHA256").update(unsigned).sign(key.private_key, "base64url");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` }),
  });
  if (!res.ok) throw new Error(`google token ${res.status} for ${subject}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

/** Append one person's refresh token to the store. Used by both consent paths — the CLI
 *  loopback flow (auth-google.js) and the hosted /connect flow (server.js) — so the two can
 *  never write different shapes. Returns everyone now connected. */
export function saveRefreshToken(email, refresh_token, env = process.env) {
  const path = tokensFile(env);
  const store = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  store[email] = { refresh_token, authorised_at: new Date().toISOString() };
  writeFileSync(path, JSON.stringify(store, null, 2));
  return Object.keys(store);
}

/** The Google consent URL for the hosted web flow. Pure so it can be tested offline.
 *  `hd` pre-selects the Workspace domain in the account chooser — a hint only, which is why the
 *  callback still verifies the domain on the id_token instead of trusting this. */
export function webAuthUrl({ clientId, redirectUri, state, domain }) {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  Object.entries({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: AUTH_SCOPES,
    access_type: "offline",   // no refresh token without it
    prompt: "consent",        // force one even for someone who authorised before
    state,
    hd: domain,
  }).forEach(([k, v]) => u.searchParams.set(k, v));
  return u.toString();
}

/** Verified identity out of an id_token: { email, hd }. The JWT signature is not re-checked
 *  here because the token arrived over TLS directly from Google's token endpoint in exchange
 *  for a code we minted — there is no third party in that hop to forge it. */
export function parseIdTokenEmail(idToken) {
  const claims = JSON.parse(Buffer.from(String(idToken).split(".")[1], "base64url").toString());
  return { email: claims.email || null, hd: claims.hd || null };
}

export async function accessToken(subject, env = process.env) {
  const hit = cache.get(subject);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;

  const got = (await fromRefreshToken(subject, env)) || (await fromServiceAccount(subject, env));
  if (!got) {
    throw new Error(
      `no Google credential for ${subject}. Run "node auth-google.js" and sign in as ${subject}, ` +
      `or set GOOGLE_SA_KEY_FILE if your org allows service-account keys.`
    );
  }

  cache.set(subject, { token: got.access_token, exp: Date.now() + (got.expires_in || 3600) * 1000 });
  return got.access_token;
}

/** Who we have credentials for. `GOOGLE_IMPERSONATE` still wins when set (service-account mode
 *  has no token file to enumerate), otherwise every authorised person is polled. */
export function subjects(env = process.env) {
  const listed = (env.GOOGLE_IMPERSONATE || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (listed.length) return listed;
  return Object.keys(readTokens(env));
}
