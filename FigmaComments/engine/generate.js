/* Core brief generation, shared by the CLI (index.js) and the poller (poll.js).
 *
 * generateBrief(key, opts) runs the whole pipeline: fetch file + comments -> index the
 * tree -> thread + tally -> resolve each pin to its ad -> (optional) thumbnails via a
 * caller-supplied provider -> classify + theme-cluster via OpenRouter -> assemble + self-check.
 *
 * Thumbnails are pluggable via opts.thumbnailProvider(adIds) so the CLI can attach the raw
 * (expiring) Figma render URLs while the poller persists them to Supabase storage first.
 */

import { getFile, getComments } from "./figma.js";
import { buildIndex, resolveCommentToAd } from "./resolve.js";
import { buildThreads, makeIsInternal } from "./thread.js";
import { classifyThreads } from "./classify.js";
import { buildBrief } from "./buildBrief.js";

export async function generateBrief(key, {
  figmaToken,
  openrouterKey,
  internalHandles = "",
  model = "google/gemini-2.5-flash",
  thumbnailProvider = null,   // async (adIds:string[]) => { [nodeId]: url }
  batchScope = "recent",      // "recent" = only the most-recently-commented page; "all" = every page
  log = () => {},
} = {}) {
  if (!figmaToken) throw new Error("generateBrief: figmaToken required");
  if (!openrouterKey) throw new Error("generateBrief: openrouterKey required");

  const [fileJson, comments] = await Promise.all([getFile(figmaToken, key), getComments(figmaToken, key)]);
  log(`${comments.length} comments; file "${fileJson.name}"`);

  const isInternal = makeIsInternal(internalHandles);
  const built = buildIndex(fileJson);
  const fullThreadInfo = buildThreads(comments, isInternal);
  log(`${fullThreadInfo.totals.totalThreads} threads (${built.topLevelAds.length} top-level frames indexed)`);

  // Pick the CURRENT review round: the page (batch) with the newest comment activity. A client
  // _EXT file holds several batch pages; the designer only wants the one being reviewed now.
  const pageOfTop = new Map();
  const pageLatest = new Map();
  for (const th of fullThreadInfo.threads) {
    const { ad } = resolveCommentToAd(th.top, built);
    const page = ad ? ad.pageName : null;
    pageOfTop.set(String(th.top.id), page);
    if (page) {
      const t = Date.parse(th.top.created_at || "") || 0;
      if ((pageLatest.get(page) || 0) < t) pageLatest.set(page, t);
    }
  }
  let targetPage = null, bestT = -1;
  for (const [p, t] of pageLatest) if (t > bestT) { bestT = t; targetPage = p; }

  let threadInfo = fullThreadInfo;
  if (batchScope !== "all" && targetPage && pageLatest.size > 1) {
    const keepTop = new Set();
    for (const th of fullThreadInfo.threads) {
      const page = pageOfTop.get(String(th.top.id));
      if (page === targetPage || page === null) keepTop.add(String(th.top.id)); // keep active batch + unplaced
    }
    const filtered = comments.filter((c) => keepTop.has(c.parent_id ? String(c.parent_id) : String(c.id)));
    threadInfo = buildThreads(filtered, isInternal);
    log(`current batch = "${targetPage}": ${threadInfo.totals.totalThreads} of ${fullThreadInfo.totals.totalThreads} threads`);
  }

  const adIds = new Set();
  const threadForLLM = [];
  for (const th of threadInfo.threads) {
    const { ad } = resolveCommentToAd(th.top, built);
    if (ad) adIds.add(ad.id);
    threadForLLM.push({
      commentId: String(th.top.id),
      adName: ad ? ad.name : "(unplaced)",
      sectionLabel: null,
      verbatim: String(th.top.message == null ? "" : th.top.message),
      replies: th.replies.map((r) => String(r.message == null ? "" : r.message)),
      resolved: !!th.resolved,
    });
  }

  let thumbnails = {};
  if (thumbnailProvider && adIds.size) {
    try { thumbnails = await thumbnailProvider([...adIds]); }
    catch (e) { log(`thumbnails skipped: ${e.message}`); }
  }

  log(`classifying ${threadForLLM.length} threads...`);
  const classification = await classifyThreads(threadForLLM, { apiKey: openrouterKey, model });
  log(`classified; ${classification.themes.length} cross-ad theme(s)`);

  const url = `https://www.figma.com/design/${key}/`;
  const brief = buildBrief({ key, url, fileJson, comments, built, threadInfo, classification, thumbnails });
  return { brief, fileName: fileJson.name };
}
