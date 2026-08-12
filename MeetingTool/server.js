#!/usr/bin/env node
/* AI Meeting Tool — HTTP service.
 *
 * Two ways in, one way through:
 *   /ingest/start + /ingest/chunk + /ingest/finish   the Chrome extension (audio)
 *   /ingest/transcript                                any recorder that already has text
 *                                                     (Zoom cloud, Fathom, Otter, Recall)
 * Both land in the same engine and produce the same changeset.
 *
 * Everything is behind one bearer token (MEETING_TOKEN), the same shape as
 * static-ads-service's WEBHOOK_TOKEN. The dashboard uses it too — it never talks to Supabase
 * directly, because these tables are deny-all by design (see schema.sql).
 *
 * Run: node server.js   (pm2 start server.js --name meeting-tool)
 */

import "./env.js";
import express from "express";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { processMeeting } from "./engine/index.js";
import { transcribeAudio, withRoster } from "./engine/transcribe.js";
import { applyChangeset, rejectItems } from "./engine/apply.js";
import { insert, update, select, uploadAudio, signedAudioUrl } from "./engine/targets/supabase.js";
import { readTokens, saveRefreshToken, webAuthUrl, parseIdTokenEmail } from "./engine/sources/google-auth.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORK = process.env.WORK_DIR || join(__dirname, "work");
const PORT = process.env.PORT || 8790;
const TOKEN = process.env.MEETING_TOKEN || "";
const INTERNAL_DOMAIN = process.env.INTERNAL_DOMAIN || "creativeadbundance.com";

/* Hosted Google consent (/connect). The tool's coverage is exactly the set of people whose
 * refresh tokens it holds — meetings live in the ORGANISER's Drive, so every organiser who has
 * not connected is a blind spot no amount of polling can see into. auth-google.js works but
 * needs the repo and node on the teammate's machine; this gives them a link instead.
 *
 * PUBLIC_URL is what Google redirects back to. Locally the default is fine; deployed it must be
 * the real host, and that exact callback URL must be registered on the OAuth client (a Desktop
 * client accepts localhost callbacks unregistered; an https host needs a Web-application client
 * with the URI listed). */
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const OAUTH_CALLBACK = `${PUBLIC_URL}/oauth/callback`;
const WEB_CLIENT_ID = process.env.GOOGLE_WEB_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID || "";
const WEB_CLIENT_SECRET = process.env.GOOGLE_WEB_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";

// state nonce -> created-at. Ties a callback to a /connect visit that passed the token check,
// which is what lets the callback itself stay tokenless (Google's redirect carries no header).
const pendingStates = new Map();
const sweepStates = () => { const cut = Date.now() - 10 * 60_000; for (const [k, v] of pendingStates) if (v < cut) pendingStates.delete(k); };

mkdirSync(WORK, { recursive: true });

const app = express();
app.use(express.json({ limit: "8mb" }));

/* ------------------------------------------------------------------ auth */

function authed(req, res, next) {
  if (!TOKEN) return next(); // local dev only; always set MEETING_TOKEN on the VPS
  const sent = (req.get("authorization") || "").replace(/^Bearer\s+/i, "") || req.query.t || "";
  const a = Buffer.from(String(sent)), b = Buffer.from(TOKEN);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return res.status(401).json({ error: "bad token" });
  next();
}

/* ------------------------------------------------------------------ job queue
 * Transcription is CPU-bound and this box is shared with n8n, the static-ads service and the
 * video editor (which caps itself at 6 of 8 cores for exactly this reason). One meeting at a
 * time, queued — a call that finishes 90 seconds later than it could is invisible; a box that
 * swaps during someone else's render is not. */

const queue = [];
let running = false;

function enqueue(label, fn) {
  queue.push({ label, fn });
  drain();
  return queue.length + (running ? 1 : 0);
}

async function drain() {
  if (running || !queue.length) return;
  running = true;
  const job = queue.shift();
  console.log(`[queue] start ${job.label} (${queue.length} waiting)`);
  try { await job.fn(); console.log(`[queue] done ${job.label}`); }
  catch (e) { console.error(`[queue] FAILED ${job.label}:`, e.stack || e); }
  finally { running = false; drain(); }
}

/* ------------------------------------------------------------------ health */

// Health lives at /healthz, not /, because / serves the review dashboard — a person opening the
// service URL should get the page, not JSON. Point uptime checks and the Traefik probe here.
app.get("/healthz", (_req, res) =>
  res.json({ ok: true, service: "meeting-tool", queued: queue.length, running, ts: Date.now() })
);

/* ------------------------------------------------------------------ connect a teammate */

const page = (title, body) =>
  `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
   <title>${title}</title>
   <body style="font:16px/1.6 system-ui;max-width:34rem;margin:8vh auto;padding:0 1.5rem;color:#222">
   <h2 style="letter-spacing:-.01em">${title}</h2>${body}</body>`;

// The link to send: /connect?t=<MEETING_TOKEN>. `authed` already accepts ?t, so the same secret
// that opens the dashboard opens this — one credential for the team, not two.
app.get("/connect", authed, (req, res) => {
  const who = Object.keys(readTokens());
  const list = who.length
    ? `<p><b>Already connected:</b></p><ul>${who.map((w) => `<li>${w}</li>`).join("")}</ul>`
    : `<p>Nobody is connected yet.</p>`;

  if (!WEB_CLIENT_ID || !WEB_CLIENT_SECRET) {
    return res.send(page("Connect your meetings", `${list}
      <p><b>Not configured.</b> Set <code>GOOGLE_OAUTH_CLIENT_ID/SECRET</code> (or
      <code>GOOGLE_WEB_CLIENT_ID/SECRET</code>) in <code>.env</code> and restart.</p>`));
  }

  res.send(page("Connect your meetings", `
    <p>Sign in once with your <b>@${INTERNAL_DOMAIN}</b> account and every meeting you organise
    — notes and transcript — will be picked up automatically. Nothing to install, nothing to
    share, and you can revoke it any time at
    <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>.</p>
    <p>Access is <b>read-only</b>: the tool can see your Drive files, never change them.</p>
    <p><a href="/oauth/start?t=${encodeURIComponent(req.query.t || "")}"
       style="display:inline-block;background:#6B47FF;color:#fff;padding:.65rem 1.2rem;border-radius:8px;text-decoration:none;font-weight:600">
       Connect Google account</a></p>${list}`));
});

app.get("/oauth/start", authed, (req, res) => {
  sweepStates();
  const state = randomUUID();
  pendingStates.set(state, Date.now());
  res.redirect(webAuthUrl({ clientId: WEB_CLIENT_ID, redirectUri: OAUTH_CALLBACK, state, domain: INTERNAL_DOMAIN }));
});

app.get("/oauth/callback", async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.send(page("Not connected", `<p>Google said: <b>${String(error)}</b>. Close this tab and try the link again.</p>`));
  if (!state || !pendingStates.has(String(state))) {
    return res.send(page("Link expired", `<p>This sign-in took longer than 10 minutes or was already used. Open the connect link again.</p>`));
  }
  pendingStates.delete(String(state));

  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: String(code), client_id: WEB_CLIENT_ID, client_secret: WEB_CLIENT_SECRET,
        redirect_uri: OAUTH_CALLBACK, grant_type: "authorization_code",
      }),
    });
    if (!r.ok) throw new Error(`token exchange ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const tok = await r.json();

    const { email } = parseIdTokenEmail(tok.id_token);
    // The hd param on the way out is only a hint — this is the enforcement. A personal gmail
    // holds no agency meetings, and storing its token would just be a stray credential.
    if (!email || !email.toLowerCase().endsWith("@" + INTERNAL_DOMAIN.toLowerCase())) {
      return res.send(page("Wrong account", `<p><b>${email || "That account"}</b> is not on
        @${INTERNAL_DOMAIN}. Use the account chooser and pick your work account.</p>`));
    }
    if (!tok.refresh_token) {
      return res.send(page("Almost", `<p>Google returned no offline access for <b>${email}</b>.
        Revoke this app at <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>
        and use the connect link again.</p>`));
    }

    const who = saveRefreshToken(email, tok.refresh_token);
    console.log(`[connect] ${email} connected (${who.length} total)`);
    res.send(page("Connected", `<p><b>${email}</b> is connected. Meetings you organise will
      appear after the next poll — no further action needed, ever.</p>
      <p>Connected so far: ${who.join(", ")}</p>`));
  } catch (e) {
    console.error(`[connect] failed: ${e.message}`);
    res.send(page("Failed", `<p>${String(e.message)}</p><p>Close this tab and try the link again.</p>`));
  }
});

/* ------------------------------------------------------------------ capture: extension */

app.post("/ingest/start", authed, async (req, res) => {
  const b = req.body || {};
  const id = randomUUID();
  try {
    await insert("meetings", {
      id,
      external_id: b.externalId || `ext-${id}`,
      source: "extension",
      platform: b.platform || null,
      title: b.title || null,
      brand: b.brand || null,
      meeting_type: b.meetingType || null,
      started_at: new Date().toISOString(),
      participants: b.participants || [],
      status: "capturing",
      created_by: b.startedBy || null,
    });
  } catch (e) {
    return res.status(500).json({ error: `could not open meeting: ${e.message}` });
  }
  mkdirSync(join(WORK, id), { recursive: true });
  console.log(`[ingest] start ${id} "${b.title || "untitled"}" brand=${b.brand || "-"}`);
  res.json({ meetingId: id });
});

// MediaRecorder timeslice chunks. They are consecutive slices of ONE stream, so appending them
// in order reproduces a valid webm — no remux needed. Out-of-order arrival would corrupt it, so
// each chunk carries its sequence number and a gap fails the finish step loudly.
app.post("/ingest/chunk", authed, express.raw({ type: "*/*", limit: "32mb" }), (req, res) => {
  const id = req.get("x-meeting-id");
  const seq = Number(req.get("x-seq"));
  if (!id || !/^[\w-]{36}$/.test(id)) return res.status(400).json({ error: "bad x-meeting-id" });
  if (!Number.isInteger(seq) || seq < 0) return res.status(400).json({ error: "bad x-seq" });
  const dir = join(WORK, id);
  if (!existsSync(dir)) return res.status(404).json({ error: "unknown meeting — call /ingest/start first" });

  const out = createWriteStream(join(dir, `${String(seq).padStart(5, "0")}.webm`));
  out.end(req.body);
  out.on("finish", () => res.json({ ok: true, seq, bytes: req.body.length }));
  out.on("error", (e) => res.status(500).json({ error: e.message }));
});

app.post("/ingest/finish", authed, async (req, res) => {
  const b = req.body || {};
  const id = b.meetingId;
  const dir = join(WORK, id || "");
  if (!id || !existsSync(dir)) return res.status(404).json({ error: "unknown meeting" });

  const position = enqueue(`meeting ${id}`, () => runAudioJob(id, b));
  await update("meetings", `id=eq.${id}`, {
    status: "transcribing",
    ended_at: new Date().toISOString(),
    participants: b.participants || undefined,
    brand: b.brand || undefined,
    title: b.title || undefined,
  }).catch(() => {});

  // Respond immediately: the extension must not sit waiting on a 10-minute transcription.
  res.status(202).json({ status: "accepted", meetingId: id, position });
});

async function runAudioJob(id, meta) {
  const dir = join(WORK, id);
  const parts = readdirSync(dir).filter((f) => f.endsWith(".webm")).sort();
  if (!parts.length) throw new Error("no audio chunks arrived");

  // A missing sequence number means a chunk upload failed; concatenating around the hole makes
  // a file that decodes into silence-then-garbage, so fail loudly with what is missing instead.
  const nums = parts.map((p) => Number(p.split(".")[0]));
  const missing = [];
  for (let i = 0; i <= Math.max(...nums); i++) if (!nums.includes(i)) missing.push(i);
  if (missing.length) throw new Error(`audio chunks missing: ${missing.join(",")} of 0..${Math.max(...nums)}`);

  const audioPath = join(dir, "audio.webm");
  writeFileSync(audioPath, Buffer.concat(parts.map((p) => readFileSync(join(dir, p)))));
  console.log(`[ingest] ${id}: ${parts.length} chunks joined`);

  let audio_path = null;
  try { audio_path = await uploadAudio(id, await readFile(audioPath)); }
  catch (e) { console.error(`[ingest] audio upload failed (continuing on the local copy): ${e.message}`); }

  await update("meetings", `id=eq.${id}`, { audio_path, status: "transcribing" }).catch(() => {});
  const raw = await transcribeAudio(audioPath);
  const transcript = withRoster(raw, meta.participants || []);

  await update("meetings", `id=eq.${id}`, { status: "extracting" }).catch(() => {});
  const [row] = await select("meetings", `id=eq.${id}&limit=1`);
  await processMeeting({
    meeting: {
      id,
      externalId: row?.external_id || null,
      title: row?.title || meta.title || null,
      source: "extension",
      platform: row?.platform || null,
      brand: row?.brand || meta.brand || null,
      brandRecordId: row?.brand_record_id || null,
      meetingType: row?.meeting_type || null,
      startedAt: row?.started_at || new Date().toISOString(),
      endedAt: new Date().toISOString(),
      participants: row?.participants || meta.participants || [],
    },
    transcript,
  });

  // Local scratch only — the durable copy is in the private bucket.
  rmSync(dir, { recursive: true, force: true });
}

/* ------------------------------------------------------------------ capture: transcript adapter
 * The 50 lines that delete "download it and pass it to us". Point Zoom cloud recording, Fathom,
 * Otter or a Recall.ai bot at this URL and the loop closes with no extension involved.
 *
 * Accepts either {segments:[{start,speaker,text}]} or a plain {text}. external_id makes a
 * retried webhook a no-op instead of a second meeting. */

app.post("/ingest/transcript", authed, async (req, res) => {
  const b = req.body?.body ? req.body.body : req.body || {};
  const text = b.text || (b.segments || []).map((s) => s.text).join(" ");
  if (!text || text.split(/\s+/).length < 25)
    return res.status(400).json({ error: "need `text` or `segments` with something in them" });

  const externalId = b.externalId || b.meetingId || `${b.source || "manual"}-${Date.now()}`;
  const [existing] = await select("meetings", `external_id=eq.${encodeURIComponent(externalId)}&limit=1`).catch(() => []);
  if (existing) {
    const [cs] = await select("meeting_changesets", `meeting_id=eq.${existing.id}&order=generated_at.desc&limit=1`).catch(() => []);
    return res.json({ status: "already ingested", meetingId: existing.id, changesetId: cs?.id || null });
  }

  const id = randomUUID();
  const participants = b.participants || [];
  await insert("meetings", {
    id,
    external_id: externalId,
    source: b.source || "manual",
    platform: b.platform || null,
    title: b.title || null,
    brand: b.brand || null,
    meeting_type: b.meetingType || null,
    started_at: b.startedAt || new Date().toISOString(),
    ended_at: b.endedAt || null,
    participants,
    status: "extracting",
  });

  const transcript = withRoster(
    {
      text,
      segments: b.segments?.length ? b.segments : [{ start: 0, end: 0, speaker: null, text }],
      language: b.language || "en",
      durationSec: b.durationSec ?? null,
      provider: b.provider || b.source || "external",
    },
    participants
  );

  // Small and synchronous enough to answer with the result — one model call, no transcription.
  try {
    const { changeset, changesetId } = await processMeeting({
      meeting: {
        id, externalId, title: b.title || null, source: b.source || "manual",
        platform: b.platform || null, brand: b.brand || null, brandRecordId: null,
        meetingType: b.meetingType || null,
        startedAt: b.startedAt || new Date().toISOString(), endedAt: b.endedAt || null,
        participants,
      },
      transcript,
    });
    res.json({
      meetingId: id, changesetId,
      items: changeset.stats.total, ...changeset.stats.byTier,
      dropped: changeset.stats.droppedCount,
      headline: changeset.summary.headline,
    });
  } catch (e) {
    await update("meetings", `id=eq.${id}`, { status: "failed", error: String(e.message).slice(0, 500) }).catch(() => {});
    res.status(500).json({ error: String(e.message) });
  }
});

/* ------------------------------------------------------------------ review API */

app.get("/api/meetings", authed, async (req, res) => {
  try {
    // Default was 40, which silently hid 43 of 83 meetings once the shared-Drive lane started
    // pulling in everyone else's calls. A daily standup makes this list grow fast — revisit with
    // real pagination past a few hundred, but never let the page quietly show a subset again.
    const limit = Number(req.query.limit) || 300;
    const rows = await select("meetings", `select=*&order=started_at.desc&limit=${limit}`);
    const sets = await select("meeting_changesets", `select=id,meeting_id,item_count,auto_count,review_count,blocked_count,generated_at&order=generated_at.desc&limit=${limit * 2}`);
    const latest = new Map();
    for (const s of sets) if (!latest.has(s.meeting_id)) latest.set(s.meeting_id, s);
    res.json(rows.map((m) => ({ ...m, changeset: latest.get(m.id) || null })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/meetings/:id", authed, async (req, res) => {
  try {
    const [m] = await select("meetings", `id=eq.${req.params.id}&limit=1`);
    if (!m) return res.status(404).json({ error: "no such meeting" });
    const [cs] = await select("meeting_changesets", `meeting_id=eq.${req.params.id}&order=generated_at.desc&limit=1`);
    const applied = await select("meeting_applied", `meeting_id=eq.${req.params.id}&select=item_id,status,result,error,applied_by,applied_at`);
    // Notes-only meetings have no changeset but DO have Gemini's notes recorded. Without this the
    // page said "ready. No changeset yet." and showed nothing — indistinguishable from broken,
    // for a third of the meetings in the list.
    const notes = await select("meeting_notes", `meeting_id=eq.${req.params.id}&select=kind,title,detail,said_at&order=created_at.asc`).catch(() => []);
    res.json({ meeting: m, changesetId: cs?.id || null, changeset: cs?.changeset || null, applied, notes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/changesets/:id/apply", authed, async (req, res) => {
  try {
    const [cs] = await select("meeting_changesets", `id=eq.${req.params.id}&limit=1`);
    if (!cs) return res.status(404).json({ error: "no such changeset" });
    const result = await applyChangeset(cs.changeset, {
      only: req.body?.itemIds,
      appliedBy: req.body?.by || "dashboard",
      changesetId: cs.id,
      force: false, // `blocked` stays blocked: those need a person to act, not to approve
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/changesets/:id/reject", authed, async (req, res) => {
  try {
    const [cs] = await select("meeting_changesets", `id=eq.${req.params.id}&limit=1`);
    if (!cs) return res.status(404).json({ error: "no such changeset" });
    res.json({ rejected: await rejectItems(cs.changeset, req.body?.itemIds || [], { changesetId: cs.id, appliedBy: req.body?.by || "dashboard" }) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/meetings/:id/audio", authed, async (req, res) => {
  const [m] = await select("meetings", `id=eq.${req.params.id}&limit=1`).catch(() => []);
  if (!m?.audio_path) return res.status(404).json({ error: "no audio kept for this meeting" });
  res.json({ url: await signedAudioUrl(m.audio_path, 300) }); // private bucket, 5-minute link
});

/* ------------------------------------------------------------------ dashboard */

app.use("/", express.static(join(__dirname, "dashboard")));

app.listen(PORT, () => {
  console.log(`meeting-tool listening on :${PORT}`);
  if (!TOKEN) console.warn("!! MEETING_TOKEN is not set — every endpoint is open. Never do this on the VPS.");
});
