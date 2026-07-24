#!/usr/bin/env node
/* Figma Comment Digest — poller. Runs on the VPS cron (single instance via flock).
 *
 *   node poll.js
 *
 * For every enabled row in figma_watched_files it does a CHEAP comments-only fetch, computes
 * a change cursor, and only when it differs from last_cursor does it run the full engine,
 * persist frame thumbnails to Supabase storage, insert a figma_briefs row, advance the cursor,
 * and (optionally) post a Slack "here's what to work on next" ping with a deep link.
 *
 * Env (all from VPS env, NEVER the repo — the repo is public):
 *   SUPABASE_URL           https://<project>.supabase.co   (reuse the static-ads project)
 *   SUPABASE_SERVICE_KEY   service_role key (bypasses RLS; write access)
 *   FIGMA_TOKEN            figd_... PAT (file_content:read + file_comments:read)
 *   OPENROUTER_API_KEY     for classification
 *   INTERNAL_HANDLES       optional csv of internal team handles (else everyone = client)
 *   DASHBOARD_URL          optional, e.g. https://<studio-domain>  (used to build the /revisions link)
 *   SLACK_WEBHOOK_URL      optional incoming-webhook URL; omit to disable Slack
 *   POLL_SKIP_THUMBS       optional "1" to skip thumbnail persistence
 *   OPENROUTER_MODEL       optional model override
 */

import { getComments, getImages } from "./figma.js";
import { generateBrief } from "./generate.js";

const {
  SUPABASE_URL, SUPABASE_SERVICE_KEY, FIGMA_TOKEN, OPENROUTER_API_KEY,
  INTERNAL_HANDLES = "", DASHBOARD_URL = "", SLACK_WEBHOOK_URL = "",
  POLL_SKIP_THUMBS = "", OPENROUTER_MODEL = "google/gemini-2.5-flash",
} = process.env;

const PRIO_RANK = { high: 3, medium: 2, low: 1 };

async function main() {
  for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "FIGMA_TOKEN", "OPENROUTER_API_KEY"]) {
    if (!process.env[k]) { console.error(`[poll] missing env ${k}`); process.exit(2); }
  }
  const files = await sbGet("figma_watched_files?enabled=eq.true&select=file_key,file_name,last_cursor");
  if (!files.length) { console.error("[poll] no enabled files"); return; }
  console.error(`[poll] ${files.length} enabled file(s)`);
  for (const f of files) {
    try { await processFile(f); }
    catch (e) { console.error(`[poll] ${f.file_key} ERROR: ${e && e.stack ? e.stack : e}`); }
  }
}

async function processFile(f) {
  const key = f.file_key;
  // cheap change check: comments only (no file tree, no LLM)
  const comments = await getComments(FIGMA_TOKEN, key);
  const cursor = computeCursor(comments);
  if (cursorsEqual(cursor, f.last_cursor)) {
    console.error(`[poll] ${key}: no change (${cursor.commentCount} comments, ${cursor.resolvedCount} resolved)`);
    return;
  }
  console.error(`[poll] ${key}: change detected -> regenerating`);

  const thumbnailProvider = POLL_SKIP_THUMBS === "1" ? null : makeThumbProvider(key);
  const { brief, fileName } = await generateBrief(key, {
    figmaToken: FIGMA_TOKEN,
    openrouterKey: OPENROUTER_API_KEY,
    internalHandles: INTERNAL_HANDLES,
    model: OPENROUTER_MODEL,
    thumbnailProvider,
    batchScope: process.env.BATCH_SCOPE || "recent",
    log: (m) => console.error(`[poll] ${key}: ${m}`),
  });

  const inserted = await sbInsert("figma_briefs", {
    file_key: key,
    brief,
    comment_count: brief.cursor.commentCount,
    open_count: brief.stats.openThreads,
  });
  await sbPatch("figma_watched_files", `file_key=eq.${encodeURIComponent(key)}`, {
    last_cursor: cursor,
    last_brief_id: inserted.id,
    file_name: f.file_name || fileName,
  });
  console.error(`[poll] ${key}: brief ${inserted.id} — ${brief.stats.openThreads} open, ${brief.themes.length} themes`);

  if (SLACK_WEBHOOK_URL) {
    try { await postSlack(brief, key); }
    catch (e) { console.error(`[poll] ${key}: slack failed: ${e.message}`); }
  }
}

/* ---------- change cursor ---------- */
function computeCursor(comments) {
  let latest = 0, latestCreated = 0, latestId = null, resolved = 0;
  for (const c of comments) {
    const t = Date.parse(c.created_at || "") || 0;
    if (t > latest) latest = t;
    if (t >= latestCreated) { latestCreated = t; latestId = String(c.id); }
    const r = Date.parse(c.resolved_at || "") || 0;
    if (r > latest) latest = r;
    if (c.resolved_at) resolved++;
  }
  return {
    latestCommentId: latestId,
    latestActivityAt: latest ? new Date(latest).toISOString() : null,
    commentCount: comments.length,
    resolvedCount: resolved,
  };
}
function cursorsEqual(a, b) {
  if (!a || !b) return false;
  return a.commentCount === b.commentCount &&
    a.resolvedCount === b.resolvedCount &&
    a.latestActivityAt === b.latestActivityAt;
}

/* ---------- thumbnails -> Supabase storage ---------- */
function makeThumbProvider(key) {
  return async (adIds) => {
    const figUrls = await getImages(FIGMA_TOKEN, key, adIds); // { nodeId: url|null }
    const stamp = Date.now();
    const out = {};
    for (const [nodeId, url] of Object.entries(figUrls)) {
      if (!url) { out[nodeId] = null; continue; }
      try {
        const resp = await fetch(url);
        if (!resp.ok) { out[nodeId] = null; continue; }
        const bytes = Buffer.from(await resp.arrayBuffer());
        const path = `${key}/${nodeId.replace(/[^\w.-]/g, "_")}-${stamp}.png`;
        out[nodeId] = await uploadThumb(path, bytes);
      } catch { out[nodeId] = null; }
    }
    return out;
  };
}
async function uploadThumb(path, bytes) {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/figma-thumbs/${path}`, {
    method: "POST",
    headers: { ...sbHeaders(), "Content-Type": "image/png", "x-upsert": "true" },
    body: bytes,
  });
  if (!r.ok) throw new Error(`storage upload ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return `${SUPABASE_URL}/storage/v1/object/public/figma-thumbs/${path}`;
}

/* ---------- Slack ---------- */
async function postSlack(brief, key) {
  const f = brief.file, s = brief.stats;
  const themes = [...(brief.themes || [])]
    .sort((a, b) => (PRIO_RANK[b.priority] - PRIO_RANK[a.priority]) || (b.threadIds.length - a.threadIds.length))
    .slice(0, 5);
  const lines = themes.length
    ? themes.map((t) => `• [${t.type}] ${t.label}, ${t.adRefs.length} ad${t.adRefs.length === 1 ? "" : "s"}`).join("\n")
    : "• (no cross-ad themes; see the board for per-ad notes)";
  const link = DASHBOARD_URL ? `${DASHBOARD_URL.replace(/\/$/, "")}/revisions?file=${encodeURIComponent(key)}` : "";
  const text =
    `*New client comments on ${f.name}*${f.batchLabel ? ` (${f.batchLabel})` : ""}\n` +
    `${s.openThreads} open / ${s.resolvedThreads} resolved across ${brief.ads.length} ads\n` +
    `*Top priorities to action:*\n${lines}` +
    (link ? `\n<${link}|Open the review board>` : "");
  const r = await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!r.ok) throw new Error(`slack ${r.status}`);
}

/* ---------- Supabase REST (service_role) ---------- */
function sbHeaders() {
  return { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` };
}
async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders() });
  if (!r.ok) throw new Error(`supabase GET ${path} -> ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
async function sbInsert(table, row) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...sbHeaders(), "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(`supabase INSERT ${table} -> ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return Array.isArray(j) ? j[0] : j;
}
async function sbPatch(table, filter, patch) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: "PATCH",
    headers: { ...sbHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`supabase PATCH ${table} -> ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

main().catch((e) => { console.error(`[poll] FATAL: ${e && e.stack ? e.stack : e}`); process.exit(1); });
