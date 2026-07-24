/* Figma REST API client (self-contained, zero runtime deps).
 *
 * Auth: PAT via header X-Figma-Token (NOT Authorization: Bearer).
 * Endpoints used (do not invent others):
 *   GET /v1/files/:key/comments
 *   GET /v1/files/:key            (?depth=N optional; we fetch the full tree once)
 *   GET /v1/images/:key?ids=...&format=png&scale=1
 *
 * Node v24 global fetch. 429 -> exponential backoff honoring Retry-After.
 * Clear errors on 403 (bad/missing token) and 404 (bad key).
 */

const BASE = "https://api.figma.com/v1";

/* Accept a raw file key OR a full Figma URL:
 *   https://www.figma.com/design/<KEY>/<name>?...   (new)
 *   https://www.figma.com/file/<KEY>/<name>?...      (legacy)
 * A raw key is [A-Za-z0-9]+ (no slashes). */
export function parseFileKey(urlOrKey) {
  const s = String(urlOrKey || "").trim();
  if (!s) throw new Error("parseFileKey: empty input");
  if (!/[/?]/.test(s) && !/^https?:/i.test(s)) return s; // looks like a raw key
  const m = s.match(/figma\.com\/(?:design|file|board|proto)\/([A-Za-z0-9]+)/i);
  if (!m) throw new Error(`parseFileKey: could not extract a file key from "${s}"`);
  return m[1];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Core GET with token auth, 429 backoff, and typed errors. */
async function figmaGet(token, pathAndQuery, { maxRetries = 5 } = {}) {
  if (!token) throw new Error("FIGMA_TOKEN is required (personal access token, figd_...)");
  const url = BASE + pathAndQuery;
  let attempt = 0;
  for (;;) {
    let resp;
    try {
      resp = await fetch(url, { headers: { "X-Figma-Token": token } });
    } catch (e) {
      // network-level failure: retry a couple of times, then surface
      if (attempt++ < maxRetries) { await sleep(backoffMs(attempt)); continue; }
      throw new Error(`Figma network error for ${pathAndQuery}: ${e.message}`);
    }

    if (resp.status === 429) {
      if (attempt++ >= maxRetries) throw new Error(`Figma rate-limited (429) after ${maxRetries} retries on ${pathAndQuery}`);
      const ra = Number(resp.headers.get("retry-after"));
      const waitMs = Number.isFinite(ra) && ra > 0 ? ra * 1000 : backoffMs(attempt);
      console.error(`[figma] 429 rate limit; waiting ${Math.round(waitMs)}ms (attempt ${attempt}/${maxRetries})`);
      await sleep(waitMs);
      continue;
    }

    const text = await resp.text();
    if (resp.status === 403) throw new Error(`Figma 403 Forbidden on ${pathAndQuery} — token missing/invalid or lacks scopes (need file_content:read + file_comments:read). Body: ${trim(text)}`);
    if (resp.status === 404) throw new Error(`Figma 404 Not Found on ${pathAndQuery} — bad file key or no access. Body: ${trim(text)}`);
    if (resp.status >= 500) {
      if (attempt++ < maxRetries) { console.error(`[figma] ${resp.status} on ${pathAndQuery}; retrying`); await sleep(backoffMs(attempt)); continue; }
      throw new Error(`Figma ${resp.status} on ${pathAndQuery}. Body: ${trim(text)}`);
    }
    if (!resp.ok) throw new Error(`Figma ${resp.status} on ${pathAndQuery}. Body: ${trim(text)}`);

    try { return JSON.parse(text); }
    catch { throw new Error(`Figma returned non-JSON on ${pathAndQuery}: ${trim(text)}`); }
  }
}

// full jitter exponential backoff, capped
function backoffMs(attempt) { return Math.min(30000, 500 * 2 ** attempt) * (0.5 + Math.random() * 0.5); }
const trim = (s) => String(s || "").slice(0, 300);

/* GET /v1/files/:key -> full node tree (fetched once per run). */
export async function getFile(token, key, { depth } = {}) {
  const q = depth ? `?depth=${encodeURIComponent(depth)}` : "";
  return figmaGet(token, `/files/${encodeURIComponent(key)}${q}`);
}

/* GET /v1/files/:key/comments -> { comments: [...] }. No pagination cursor; all in one response. */
export async function getComments(token, key) {
  const data = await figmaGet(token, `/files/${encodeURIComponent(key)}/comments`);
  return Array.isArray(data.comments) ? data.comments : [];
}

/* GET /v1/images/:key?ids=...&format=png&scale=1 -> { err, images: { id: url|null } }.
 * Batches all ids; chunks to keep the query string sane. S3 URLs expire (~1h-24h). */
export async function getImages(token, key, ids, { format = "png", scale = 1, chunkSize = 10 } = {}) {
  const out = {};
  const uniq = [...new Set((ids || []).filter(Boolean))];
  for (let i = 0; i < uniq.length; i += chunkSize) {
    const batch = uniq.slice(i, i + chunkSize);
    const q = `?ids=${batch.map(encodeURIComponent).join(",")}&format=${format}&scale=${scale}`;
    // Rendering many frames in one call makes Figma slow enough to drop the connection.
    // Small batches + per-batch tolerance: one failed batch skips only its own frames.
    try {
      const data = await figmaGet(token, `/images/${encodeURIComponent(key)}${q}`);
      if (data.err) console.error(`[figma] images err for batch @${i}: ${data.err}`);
      Object.assign(out, data.images || {});
    } catch (e) {
      console.error(`[figma] image batch @${i} skipped: ${e.message}`);
      for (const id of batch) if (!(id in out)) out[id] = null;
    }
  }
  return out; // { nodeId: url|null }
}
