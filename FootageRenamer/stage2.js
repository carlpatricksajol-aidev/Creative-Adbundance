#!/usr/bin/env node
/* Footage Renamer - Stage 2 (production, self-contained).
 *
 *   node stage2.js <notion_page_id>
 *
 * For one Notion job page: read the storyboard + Dropbox upload link, download each clip, sample
 * frames (ffmpeg), match it to a storyboard shot (OpenRouter / Gemini Flash), rename per the
 * convention (POV decided from the actual footage), upload the renamed set into the team's own
 * Dropbox, write a report, and update the Notion row. Big files never enter n8n - they stream to
 * a temp dir here. Config comes from env (see CFG); nothing secret lives in this file.
 *
 * Mirrors FootageRenamer/lib/rename.js (kept in sync; that file has the unit tests).
 */
const https = require("https"), fs = require("fs"), os = require("os"), path = require("path");
const { spawnSync } = require("child_process");

const CFG = {
  refresh: process.env.DROPBOX_REFRESH_TOKEN, appKey: process.env.DROPBOX_APP_KEY, appSecret: process.env.DROPBOX_APP_SECRET,
  orKey: process.env.OPENROUTER_API_KEY, model: process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash",
  notion: process.env.NOTION_TOKEN, db: process.env.NOTION_DB || "388acb83-16dd-80f5-977e-f0aaa68bc0f2",
  outputRoot: process.env.OUTPUT_ROOT || "/AI Renamer",
  clientOverride: process.env.CLIENT, creatorOverride: process.env.CREATOR,
  confidence: parseFloat(process.env.CONFIDENCE || "0.6"),
  ffmpeg: process.env.FFMPEG || "ffmpeg", ffprobe: process.env.FFPROBE || "ffprobe",
};
const PAGE = process.argv[2]; // a page id processes one job; no arg = poll the DB for Status=Queued
for (const k of ["refresh", "appKey", "appSecret", "orKey", "notion"]) if (!CFG[k]) { console.error("missing env for: " + k); process.exit(2); }

/* ---------- naming logic (mirror of lib/rename.js) ---------- */
const deriveSlug = (n) => String(n || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const sceneKey = (id) => deriveSlug(id);
const lineSlug = (l, m = 4) => String(l || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean).slice(0, m).join("_");
function splitShots(cell) { const raw = String(cell || "").trim(); if (!raw || !/[a-z0-9]/i.test(raw)) return []; return raw.split(/[+,]/).map(s => s.trim()).filter(Boolean).map(footage_name => ({ footage_name, slug: deriveSlug(footage_name) })); }
function applyPov(slug, p) { if (p == null) return slug; if (!/^(1stpov|3rdpov)_/i.test(slug)) return slug; return (p ? "3rdpov_" : "1stpov_") + slug.replace(/^(1stpov|3rdpov)_/i, ""); }
function parseStoryboardTable(rows) { if (!rows || rows.length < 2) return []; const cellsOf = r => Array.isArray(r) ? r : (r && r.table_row ? r.table_row.cells.map(c => c.map(t => t.plain_text || "").join("")) : []); const h = cellsOf(rows[0]).map(x => String(x).trim().toLowerCase()); const col = n => h.indexOf(n); const ci = { scene: col("scene"), line: col("script line"), overlay: col("overlay"), footage: col("footage name"), desc: col("shot list explanation") }; const out = []; for (let i = 1; i < rows.length; i++) { const c = cellsOf(rows[i]); const g = j => j >= 0 ? String(c[j] || "").trim() : ""; const s = g(ci.scene); if (!s) continue; out.push({ scene: s, line: g(ci.line), overlay: g(ci.overlay), footage_name: g(ci.footage), shot_list_explanation: g(ci.desc) }); } return out; }
function normalizeScenes(scenes) { return (scenes || []).map(s => { const desc = s.shot_list_explanation || s.description || ""; const shots = (s.shots && s.shots.length) ? s.shots.map(sh => ({ footage_name: sh.footage_name, slug: sh.slug || deriveSlug(sh.footage_name), description: sh.description || desc || "" })) : splitShots(s.footage_name).map(sh => Object.assign({}, sh, { description: desc })); const type = s.type || (shots.length ? "broll" : "talkinghead"); return { scene: s.scene, key: sceneKey(s.scene), type, line: s.line || "", overlay: s.overlay || "", shots }; }); }
const extOf = f => { const m = String(f || "").match(/\.[a-z0-9]+$/i); return m ? m[0].toLowerCase() : ""; };
const fmtC = c => c == null ? "n/a" : Number(c).toFixed(2);
function planJob(scenesRaw, matches, opts = {}) {
  const thr = opts.confidenceThreshold == null ? 0.6 : opts.confidenceThreshold;
  const scenes = normalizeScenes(scenesRaw), byId = {}; scenes.forEach(s => byId[s.scene] = s);
  const renames = [], flagged = [], usedSlug = {}, usedTake = {};
  const ok = m => (m.confidence == null ? 1 : m.confidence) >= thr && m.scene;
  for (const m of matches.filter(ok)) {
    const ext = extOf(m.file), sc = byId[m.scene];
    if (!sc) { flagged.push({ file: m.file, reason: `matched unknown scene "${m.scene}"`, confidence: m.confidence }); continue; }
    if (sc.type === "talkinghead" || m.type === "talkinghead") {
      const n = usedTake[sc.key] = (usedTake[sc.key] || 0) + 1;
      renames.push({ from: m.file, to: `${sc.key}_${lineSlug(sc.line)}_take${n}${ext}`, folder: "aroll", scene: m.scene, confidence: m.confidence });
    } else {
      const base = m.shot_slug || (sc.shots[0] && sc.shots[0].slug);
      if (!base) { flagged.push({ file: m.file, reason: `b-roll match to "${m.scene}" with no shot slug`, confidence: m.confidence }); continue; }
      const slug = applyPov(base, m.person_in_frame), n = usedSlug[slug] = (usedSlug[slug] || 0) + 1;
      renames.push({ from: m.file, to: n === 1 ? `${slug}${ext}` : `${slug}_v${n}${ext}`, folder: "broll", scene: m.scene, shot_slug: base, confidence: m.confidence });
    }
  }
  for (const m of matches.filter(x => !ok(x))) flagged.push({ file: m.file, reason: m.scene ? `low confidence (${fmtC(m.confidence)}) for "${m.scene}"` : "no scene match", confidence: m.confidence });
  const matchedSlugs = new Set(renames.filter(r => r.shot_slug).map(r => r.shot_slug)), matchedTalk = new Set(renames.filter(r => r.folder === "aroll").map(r => r.scene)), missing = [];
  for (const s of scenes) if (s.type === "talkinghead") { if (!matchedTalk.has(s.scene)) missing.push({ scene: s.scene, type: "talkinghead", line: s.line }); }
    else for (const sh of s.shots) if (!matchedSlugs.has(sh.slug)) missing.push({ scene: s.scene, type: "broll", footage_name: sh.footage_name, slug: sh.slug });
  return { renames, missing, flagged, report: buildReport({ client: opts.client, creator: opts.creator, renames, missing, flagged }) };
}
function buildReport({ client, creator, renames, missing, flagged }) {
  const L = [`# ${client || "?"} / ${creator || "?"} - footage rename report`, "", `Status: ${renames.length} renamed, ${missing.length} missing, ${flagged.length} need review`, "", `## Renamed (${renames.length})`];
  renames.forEach(r => L.push(`- ${r.from}  ->  ${r.folder}/${r.to}  (${r.scene}, conf ${fmtC(r.confidence)})`));
  L.push("", `## Missing shots (${missing.length}) - no clip matched`); missing.forEach(m => L.push(m.type === "talkinghead" ? `- ${m.scene} - talking-head - "${m.line}"` : `- ${m.scene} - b-roll - ${m.slug}  ("${m.footage_name}")`)); if (!missing.length) L.push("- none");
  L.push("", `## Needs review (${flagged.length}) - left with original name`); flagged.forEach(f => L.push(`- ${f.file} - ${f.reason}`)); if (!flagged.length) L.push("- none");
  return L.join("\n") + "\n";
}

/* ---------- http + api helpers ---------- */
function req(opts, body, wantRaw) {
  return new Promise((res, rej) => { const r = https.request(opts, x => { const ch = []; x.on("data", c => ch.push(c)); x.on("end", () => { const b = Buffer.concat(ch); res({ code: x.statusCode, buf: b, json: wantRaw ? null : (() => { try { return JSON.parse(b.toString()); } catch { return b.toString(); } })() }); }); }); r.on("error", rej); if (body) r.write(body); r.end(); });
}
const apiArg = o => JSON.stringify(o).replace(/[^\x20-\x7e]/g, c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
let TOKEN = null;
const dbxRpc = (p, o) => req({ hostname: "api.dropboxapi.com", path: p, method: "POST", headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" } }, JSON.stringify(o));
const dbxContent = (p, arg, body, wantRaw) => req({ hostname: "content.dropboxapi.com", path: p, method: "POST", headers: { Authorization: "Bearer " + TOKEN, "Dropbox-API-Arg": apiArg(arg), "Content-Type": "application/octet-stream" } }, body, wantRaw);
const notionReq = (p, method, body) => req({ hostname: "api.notion.com", path: p, method: method || "GET", headers: { Authorization: "Bearer " + CFG.notion, "Notion-Version": "2022-06-28", "Content-Type": "application/json" } }, body);

async function getToken() {
  const form = `grant_type=refresh_token&refresh_token=${CFG.refresh}&client_id=${CFG.appKey}&client_secret=${CFG.appSecret}`;
  const r = await req({ hostname: "api.dropboxapi.com", path: "/oauth2/token", method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(form) } }, form);
  if (r.code !== 200) throw new Error("dropbox token refresh failed: " + JSON.stringify(r.json));
  TOKEN = r.json.access_token;
}
function dbxDownload(sharedUrl, name, dest) {
  return new Promise((ok, no) => { const r = https.request({ hostname: "content.dropboxapi.com", path: "/2/sharing/get_shared_link_file", method: "POST", headers: { Authorization: "Bearer " + TOKEN, "Dropbox-API-Arg": apiArg({ url: sharedUrl, path: "/" + name }) } }, x => { if (x.statusCode >= 300) { let d = ""; x.on("data", c => d += c); x.on("end", () => no(new Error("download " + x.statusCode + " " + d.slice(0, 150)))); return; } const f = fs.createWriteStream(dest); x.pipe(f); f.on("finish", () => f.close(ok)); f.on("error", no); }); r.on("error", no); r.end(); });
}
async function dbxUpload(destPath, filePath) {
  const size = fs.statSync(filePath).size, CHUNK = 16 * 1024 * 1024;
  if (size <= 140 * 1024 * 1024) {
    const r = await dbxContent("/2/files/upload", { path: destPath, mode: "overwrite", mute: true }, fs.readFileSync(filePath));
    if (r.code >= 300) throw new Error("upload " + r.code + " " + JSON.stringify(r.json)); return;
  }
  const fd = fs.openSync(filePath, "r"); const buf = Buffer.alloc(CHUNK); let offset = 0, sessionId = null;
  const readChunk = () => { const n = fs.readSync(fd, buf, 0, CHUNK, offset); return buf.subarray(0, n); };
  let chunk = readChunk();
  let r = await dbxContent("/2/files/upload_session/start", { close: false }, chunk); sessionId = r.json.session_id; offset += chunk.length;
  while (offset < size) {
    chunk = readChunk();
    const last = offset + chunk.length >= size;
    if (last) { r = await dbxContent("/2/files/upload_session/finish", { cursor: { session_id: sessionId, offset }, commit: { path: destPath, mode: "overwrite", mute: true } }, chunk); if (r.code >= 300) throw new Error("session finish " + r.code + " " + JSON.stringify(r.json)); }
    else { r = await dbxContent("/2/files/upload_session/append_v2", { cursor: { session_id: sessionId, offset }, close: false }, chunk); if (r.code >= 300) throw new Error("session append " + r.code + " " + JSON.stringify(r.json)); }
    offset += chunk.length;
  }
  fs.closeSync(fd);
}
function frames(clip, baseDir, id) {
  const dur = parseFloat(spawnSync(CFG.ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", clip]).stdout.toString().trim()) || 6, out = [];
  for (let i = 1; i <= 5; i++) { const fp = path.join(baseDir, `${id}_f${i}.jpg`); spawnSync(CFG.ffmpeg, ["-nostdin", "-loglevel", "error", "-ss", (dur * i / 6).toFixed(2), "-i", clip, "-frames:v", "1", "-vf", "scale=640:-1", "-q:v", "4", fp, "-y"]); if (fs.existsSync(fp)) { out.push({ type: "image_url", image_url: { url: "data:image/jpeg;base64," + fs.readFileSync(fp).toString("base64") } }); fs.unlinkSync(fp); } }
  return out;
}
async function matchClip(frameParts, candidates, filename) {
  const instruction = `Match this b-roll clip (5 frames sampled across it) to ONE storyboard shot (closed set). Use BOTH the frames and the clip's original filename as evidence for WHICH shot it is (the filename is often descriptive). BUT decide person_in_frame strictly from the frames - the filename's "1stPOV"/"3rdPOV" label is unreliable, ignore it. Original filename: "${filename}". Return STRICT JSON only: {"scene":<scene or null>,"shot_slug":<slug or null>,"confidence":0..1,"person_in_frame":true|false,"on_screen":"<short>"}. person_in_frame=true if the talent's body/face is visible (3rd-person); false if POV/object-only (at most hands). If nothing fits, scene=null and confidence=0. Never invent a slug not listed.\nCandidates:\n` + JSON.stringify(candidates);
  const body = JSON.stringify({ model: CFG.model, temperature: 0, max_tokens: 300, messages: [{ role: "user", content: [{ type: "text", text: instruction }, ...frameParts] }] });
  const r = await req({ hostname: "openrouter.ai", path: "/api/v1/chat/completions", method: "POST", headers: { Authorization: "Bearer " + CFG.orKey, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } }, body);
  return JSON.parse(String(r.json.choices[0].message.content).replace(/```json|```/g, "").trim());
}
const notionText = p => ((p && (p.title || p.rich_text)) || []).map(t => t.plain_text).join("");

async function processPage(PAGE) {
  // 0) claim the job
  await notionReq(`/v1/pages/${PAGE}`, "PATCH", JSON.stringify({ properties: { Status: { select: { name: "Processing" } } } }));
  // 1) Notion job page: props + storyboard
  const page = (await notionReq(`/v1/pages/${PAGE}`)).json;
  const props = page.properties;
  const client = CFG.clientOverride || notionText(props["Client's Name"]) || "Unknown";
  const creator = CFG.creatorOverride || notionText(props["Creator Name"]) || "Unknown";
  const sharedUrl = (props["Dropbox Upload Link"] || {}).url;
  if (!sharedUrl) throw new Error("Notion row has no Dropbox Upload Link");
  const blocks = (await notionReq(`/v1/blocks/${PAGE}/children?page_size=100`)).json;
  const table = blocks.results.find(b => b.type === "table");
  const tableRows = (await notionReq(`/v1/blocks/${table.id}/children?page_size=100`)).json;
  const sceneRows = parseStoryboardTable(tableRows.results);
  const scenes = normalizeScenes(sceneRows);
  const candidates = scenes.flatMap(s => s.shots.map(sh => ({ scene: s.scene, slug: sh.slug, description: sh.description })));
  const OUT = `${CFG.outputRoot}/${client}/${creator}`.replace(/\[|\]/g, "");
  console.log(`page ${PAGE}: ${client}/${creator}, ${scenes.length} scenes / ${candidates.length} shots -> ${OUT}`);

  // 2) list + process clips
  const lf = await dbxRpc("/2/files/list_folder", { path: "", shared_link: { url: sharedUrl } });
  let entries = lf.json.entries || []; let cursor = lf.json;
  while (cursor.has_more) { cursor = (await dbxRpc("/2/files/list_folder/continue", { cursor: cursor.cursor })).json; entries = entries.concat(cursor.entries); }
  const vids = entries.filter(e => /\.(mov|mp4|m4v)$/i.test(e.name));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "fr-"));
  const local = {}, matches = [];
  for (const v of vids) {
    const lp = path.join(work, v.name.replace(/[^a-z0-9.]/gi, "_")); local[v.name] = lp;
    await dbxDownload(sharedUrl, v.name, lp);
    const m = await matchClip(frames(lp, work, v.id.replace(/[^a-z0-9]/gi, "")), candidates, v.name);
    matches.push({ file: v.name, scene: m.scene, shot_slug: m.shot_slug, person_in_frame: m.person_in_frame, confidence: m.confidence, type: "broll" });
    console.log(`  ${v.name} -> ${applyPov(m.shot_slug || "?", m.person_in_frame)} (${fmtC(m.confidence)})`);
  }

  // 3) plan + write output (fresh)
  const plan = planJob(sceneRows, matches, { client, creator, confidenceThreshold: CFG.confidence });
  try { await dbxRpc("/2/files/delete_v2", { path: OUT }); } catch {}
  for (const r of plan.renames) await dbxUpload(`${OUT}/${r.folder}/${r.to}`, local[r.from]);
  await dbxContent("/2/files/upload", { path: `${OUT}/_report.md`, mode: "overwrite", mute: true }, Buffer.from(plan.report));

  // 4) share link
  let link; const sl = await dbxRpc("/2/sharing/create_shared_link_with_settings", { path: OUT });
  link = sl.code === 200 ? sl.json.url : (await dbxRpc("/2/sharing/list_shared_links", { path: OUT })).json.links?.[0]?.url;

  // 5) update Notion + comment
  const status = (plan.missing.length || plan.flagged.length) ? "Needs review" : "Done";
  await notionReq(`/v1/pages/${PAGE}`, "PATCH", JSON.stringify({ properties: { Status: { select: { name: status } }, "Output Folder": { url: link || null } } }));
  await notionReq(`/v1/comments`, "POST", JSON.stringify({ parent: { page_id: PAGE }, rich_text: [{ text: { content: plan.report.slice(0, 1990) } }] }));

  fs.rmSync(work, { recursive: true, force: true });
  console.log(JSON.stringify({ page: PAGE, ok: true, status, output: link, renamed: plan.renames.length, missing: plan.missing.length, flagged: plan.flagged.length }));
}

(async () => {
  await getToken();
  if (PAGE) { await processPage(PAGE); return; }       // one job (n8n / manual)
  // poll mode (cron): process every row whose Status = Queued
  const q = await notionReq(`/v1/databases/${CFG.db}/query`, "POST", JSON.stringify({ filter: { property: "Status", select: { equals: "Queued" } }, page_size: 25 }));
  const rows = q.json.results || [];
  console.log(`poll: ${rows.length} queued row(s)`);
  for (const r of rows) {
    try { await processPage(r.id); }
    catch (e) {
      console.error("page", r.id, "error:", e.message);
      try { await notionReq(`/v1/pages/${r.id}`, "PATCH", JSON.stringify({ properties: { Status: { select: { name: "Error" } } } })); } catch {}
    }
  }
})().catch(e => { console.error("STAGE2 ERROR:", e.message); process.exit(1); });
