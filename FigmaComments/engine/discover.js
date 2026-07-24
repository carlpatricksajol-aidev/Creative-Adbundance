#!/usr/bin/env node
/* Discover every client _EXT review file across the team's Figma and add them to the watch list.
 *
 *   node discover.js
 *
 * Any Figma file whose name contains "EXT" (the team's convention for a client-facing EXTernal
 * review file, e.g. ARMRA_EXT) is added to figma_watched_files so the poller picks it up. New
 * files are inserted; existing rows are left untouched (enabled flag, cursor, etc. preserved).
 *
 * Env (VPS only, never the repo):
 *   FIGMA_TOKEN           figd_... PAT (file_content:read + file_comments:read)
 *   SUPABASE_URL          reuse the static-ads project
 *   SUPABASE_SERVICE_KEY  service_role key
 *   TEAM_IDS              csv of Figma team ids (from figma.com/files/team/<TEAM_ID>/...)
 */

const { FIGMA_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY, TEAM_IDS = "" } = process.env;
const FIGMA = "https://api.figma.com/v1";
// "EXT" as its own token (ARMRA_EXT, Brand-EXT, "Brand EXT") but not inside words like "context".
const EXT = /(?:^|[\s_-])ext\b/i;

async function main() {
  for (const k of ["FIGMA_TOKEN", "SUPABASE_URL", "SUPABASE_SERVICE_KEY", "TEAM_IDS"]) {
    if (!process.env[k]) { console.error(`[discover] missing env ${k}`); process.exit(2); }
  }
  const teams = TEAM_IDS.split(",").map((s) => s.trim()).filter(Boolean);
  const found = new Map(); // file_key -> { name, brand }

  for (const team of teams) {
    const proj = await figma(`/teams/${encodeURIComponent(team)}/projects`);
    for (const p of proj.projects || []) {
      const fl = await figma(`/projects/${encodeURIComponent(p.id)}/files`);
      for (const f of fl.files || []) {
        if (f.key && EXT.test(f.name || "")) found.set(f.key, { name: f.name, brand: brandOf(f.name) });
      }
    }
  }

  console.error(`[discover] ${found.size} _EXT file(s) across ${teams.length} team(s)`);
  if (!found.size) return;

  const rows = [...found.entries()].map(([key, v]) => ({
    file_key: key, file_name: v.name, brand: v.brand, enabled: true,
  }));
  await sbUpsert(rows);
  console.error(`[discover] watch list updated (new files inserted, existing left as-is): ${rows.map((r) => r.file_name).join(", ")}`);
}

function brandOf(name) {
  return String(name || "").replace(/[\s_-]*ext.*$/i, "").trim() || String(name || "");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function figma(path, attempt = 0) {
  const r = await fetch(FIGMA + path, { headers: { "X-Figma-Token": FIGMA_TOKEN } });
  if (r.status === 429 && attempt < 4) { await sleep(Math.min(16000, 1000 * 2 ** attempt)); return figma(path, attempt + 1); }
  if (!r.ok) throw new Error(`figma ${path} -> ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// Insert new watched files; ignore-duplicates keeps existing rows' enabled/cursor intact.
async function sbUpsert(rows) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/figma_watched_files?on_conflict=file_key`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`supabase upsert -> ${r.status}: ${(await r.text()).slice(0, 300)}`);
}

main().catch((e) => { console.error(`[discover] FATAL: ${e && e.stack ? e.stack : e}`); process.exit(1); });
