#!/usr/bin/env node
/* Figma Comment Digest — engine CLI.
 *
 *   node index.js <fileKeyOrUrl> [--out path]
 *
 * Reads every client comment on a Figma file and emits a designer revision brief JSON that
 * validates against ../brief.schema.json.
 *
 * Env:
 *   FIGMA_TOKEN        personal access token (figd_...), scopes file_content:read + file_comments:read
 *   OPENROUTER_API_KEY OpenRouter key for classification (google/gemini-2.5-flash)
 *   INTERNAL_HANDLES   optional csv of internal team handles (everyone else is treated as client)
 *   OPENROUTER_MODEL   optional model override
 *
 * DOES NOT persist thumbnails — the S3 URLs from GET /v1/images expire (~1h-24h); persisting them
 * is the automation layer's job. The engine just attaches whatever URL Figma returned.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

import { parseFileKey, getImages } from "./figma.js";
import { generateBrief } from "./generate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const args = process.argv.slice(2);
  const posit = args.filter((a) => !a.startsWith("--"));
  const outIdx = args.indexOf("--out");
  const outArg = outIdx >= 0 ? args[outIdx + 1] : null;
  const target = posit[0];

  if (!target) die("usage: node index.js <fileKeyOrUrl> [--out path]", 2);

  const FIGMA_TOKEN = process.env.FIGMA_TOKEN;
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  if (!FIGMA_TOKEN) die("missing env FIGMA_TOKEN (figd_... PAT with file_content:read + file_comments:read)", 2);
  if (!OPENROUTER_API_KEY) die("missing env OPENROUTER_API_KEY", 2);

  const key = parseFileKey(target);
  console.error(`[engine] file key: ${key}`);

  // Thumbnails are slow (server-side render) and the URLs expire (~1h); the poller persists
  // them to Supabase instead, so --no-thumbs / SKIP_THUMBS=1 skips this stage for the CLI.
  const skipThumbs = process.env.SKIP_THUMBS === "1" || args.includes("--no-thumbs");
  const thumbnailProvider = skipThumbs ? null : (ids) => getImages(FIGMA_TOKEN, key, ids);

  const { brief } = await generateBrief(key, {
    figmaToken: FIGMA_TOKEN,
    openrouterKey: OPENROUTER_API_KEY,
    internalHandles: process.env.INTERNAL_HANDLES,
    model: process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash",
    thumbnailProvider,
    batchScope: process.env.BATCH_SCOPE || "recent",
    log: (m) => console.error(`[engine] ${m}`),
  });

  // 7) write
  const outPath = outArg
    ? resolvePath(process.cwd(), outArg)
    : join(__dirname, "..", "out", `${key}.brief.json`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(brief, null, 2) + "\n");

  console.error(
    `[engine] wrote ${outPath} — ${brief.stats.totalThreads} threads, ` +
    `${brief.stats.openThreads} open / ${brief.stats.resolvedThreads} resolved, ` +
    `${brief.ads.length} ads, ${brief.unplaced.length} unplaced, ${brief.themes.length} themes`,
  );
  // stdout: the path only, so this composes in a pipeline
  process.stdout.write(outPath + "\n");
}

function die(msg, code = 1) { console.error(`[engine] ${msg}`); process.exit(code); }

main().catch((e) => { console.error(`[engine] ERROR: ${e && e.stack ? e.stack : e}`); process.exit(1); });
