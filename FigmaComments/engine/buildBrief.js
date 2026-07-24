/* Assemble + self-check the final brief (validates against brief.schema.json by construction). */

import { resolveCommentToAd, sectionLabelForAd } from "./resolve.js";
import { cmpDate } from "./thread.js";

const TYPES = ["copy", "value-prop", "design", "compliance", "question", "approval", "other"];
const ROUTES = ["designer", "strategist", "copywriter", "account", "none"];
const PRIOS = ["high", "medium", "low"];

/* Inputs:
 *   key         file key
 *   url         canonical figma url
 *   fileJson    GET /v1/files/:key
 *   comments    raw comments array (incl replies)
 *   built       buildIndex() result { index, topLevelAds, pages }
 *   threadInfo  buildThreads() result { threads, byClient, totals }
 *   classification { perThread: Map(commentId -> {type,route,priority,action,themeId}), themes: [...] }
 *   thumbnails  { nodeId: url|null }
 *
 * Returns the brief object. */
export function buildBrief({ key, url, fileJson, comments, built, threadInfo, classification, thumbnails }) {
  const { threads, byClient, totals } = threadInfo;
  const { perThread, themes } = classification;
  const isClientByKey = new Map(byClient.map((c) => [authorKey(c.handle, c.userId), c.isClient]));

  // --- resolve every thread to an ad (or unplaced) ---
  const adBuckets = new Map(); // nodeId -> { entry, threads: [] }
  const unplaced = [];

  for (const th of threads) {
    const cls = perThread.get(String(th.top.id)) || {};
    const threadObj = toThreadObject(th, cls, isClientByKey);
    const { ad } = resolveCommentToAd(th.top, built);
    if (!ad) { unplaced.push(threadObj); continue; }
    if (!adBuckets.has(ad.id)) adBuckets.set(ad.id, { entry: ad, threads: [] });
    adBuckets.get(ad.id).threads.push(threadObj);
  }

  // --- ads in canvas reading order: page order, then frame y, then x ---
  const ads = [...adBuckets.values()]
    .sort((a, b) => readingOrder(a.entry, b.entry))
    .map(({ entry, threads: thr }) => {
      // threads within an ad: oldest first (stable, matches comment creation order)
      thr.sort((x, y) => cmpDate(x.createdAt, y.createdAt));
      return {
        nodeId: entry.id,
        name: entry.name,
        page: entry.pageName,
        sectionLabel: sectionLabelForAd(entry, built),
        thumbnailUrl: thumbnails && thumbnails[entry.id] != null ? thumbnails[entry.id] : null,
        openCount: thr.filter((t) => !t.resolved).length,
        threads: thr,
      };
    });

  // --- stats ---
  const openThreads = threads.filter((t) => !t.resolved).length;
  const resolvedThreads = threads.filter((t) => t.resolved).length;
  const byType = Object.fromEntries(TYPES.map((t) => [t, 0]));
  const byRoute = Object.fromEntries(ROUTES.map((r) => [r, 0]));
  for (const th of threads) {
    const cls = perThread.get(String(th.top.id)) || {};
    const type = TYPES.includes(cls.type) ? cls.type : "other";
    const route = ROUTES.includes(cls.route) ? cls.route : "account";
    byType[type] += 1;
    byRoute[route] += 1;
  }

  // --- cursor: latest activity across ALL comments incl replies AND resolved-state changes ---
  const cursor = computeCursor(comments, threads);

  // --- batchLabel: the page most comments cluster on (or null) ---
  const batchLabel = deriveBatchLabel(ads);

  const brief = {
    schemaVersion: 1,
    file: {
      key,
      name: fileJson && fileJson.name ? fileJson.name : key,
      url: url || `https://www.figma.com/design/${key}/`,
      lastModified: normDate(fileJson && fileJson.lastModified) || cursor.latestActivityAt || nowISO(),
      batchLabel,
    },
    generatedAt: nowISO(),
    cursor,
    stats: {
      totalComments: totals.totalComments,
      totalThreads: totals.totalThreads,
      openThreads,
      resolvedThreads,
      byClient: byClient.map((c) => ({
        handle: c.handle,
        userId: c.userId != null ? c.userId : null,
        count: c.count,
        isClient: !!c.isClient,
      })),
      byType,
      byRoute,
    },
    themes: (themes || []).map((t) => ({
      id: t.id,
      label: t.label,
      type: TYPES.includes(t.type) ? t.type : "other",
      route: ROUTES.includes(t.route) ? t.route : "strategist",
      priority: PRIOS.includes(t.priority) ? t.priority : "medium",
      summary: t.summary || "",
      threadIds: (t.threadIds || []).map(String),
      adRefs: t.adRefs || [],
    })),
    ads,
    unplaced,
  };

  selfCheck(brief);
  return brief;
}

/* ---------- per-thread shaping ---------- */
function toThreadObject(th, cls, isClientByKey) {
  const user = th.top.user || {};
  const handle = user.handle || "(unknown)";
  const userId = user.id != null ? String(user.id) : null;
  const type = TYPES.includes(cls.type) ? cls.type : "other";
  const route = ROUTES.includes(cls.route) ? cls.route : "account";
  const action = (route === "designer" || route === "copywriter") ? String(cls.action || "") : "";
  return {
    commentId: String(th.top.id),
    author: {
      handle,
      userId,
      isClient: isClientByKey.get(authorKey(handle, userId)) ?? true,
    },
    createdAt: normDate(th.top.created_at) || nowISO(),
    resolved: !!th.resolved,
    type,
    route,
    priority: PRIOS.includes(cls.priority) ? cls.priority : "medium",
    verbatim: String(th.top.message == null ? "" : th.top.message), // SACRED: never modified
    action,
    themeId: cls.themeId != null ? String(cls.themeId) : null,
    reactionCount: Array.isArray(th.top.reactions) ? th.top.reactions.length : 0,
    replies: th.replies.map((r) => ({
      author: (r.user && r.user.handle) || "(unknown)",
      text: String(r.message == null ? "" : r.message), // reply text is also verbatim
      createdAt: normDate(r.created_at) || nowISO(),
    })),
  };
}

/* ---------- ordering ---------- */
function readingOrder(a, b) {
  if (a.pageOrder !== b.pageOrder) return (a.pageOrder ?? 0) - (b.pageOrder ?? 0);
  const ay = a.absoluteBoundingBox ? a.absoluteBoundingBox.y : 0;
  const by = b.absoluteBoundingBox ? b.absoluteBoundingBox.y : 0;
  if (Math.abs(ay - by) > 1) return ay - by;
  const ax = a.absoluteBoundingBox ? a.absoluteBoundingBox.x : 0;
  const bx = b.absoluteBoundingBox ? b.absoluteBoundingBox.x : 0;
  return ax - bx;
}

/* ---------- cursor ---------- */
function computeCursor(comments, threads) {
  let latestCommentId = null;
  let latestActivity = 0;
  let latestCreated = 0;
  for (const c of comments) {
    const t = Date.parse(c.created_at || "") || 0;
    if (t >= latestCreated) { latestCreated = t; latestCommentId = String(c.id); }
    if (t > latestActivity) latestActivity = t;
  }
  // fold resolved_at into activity so a resolve/unresolve moves the watermark
  for (const th of threads) {
    const r = Date.parse(th.top.resolved_at || "") || 0;
    if (r > latestActivity) latestActivity = r;
  }
  return {
    latestCommentId,
    latestActivityAt: latestActivity ? new Date(latestActivity).toISOString() : null,
    commentCount: comments.length,
  };
}

/* ---------- batch label ---------- */
const NUMWORD = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
function batchNum(w) { const n = parseInt(w, 10); return Number.isFinite(n) ? n : (NUMWORD[String(w).toLowerCase()] || 99); }
function deriveBatchLabel(ads) {
  // count threads per distinct batch number found in page names (a file often spans several batches)
  const batchCounts = new Map();
  for (const ad of ads) {
    const m = (ad.page || "").match(/batch\s*(?:#|no\.?\s*)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten)/i);
    if (m) { const b = cap(m[1]); batchCounts.set(b, (batchCounts.get(b) || 0) + ad.threads.length); }
  }
  if (batchCounts.size === 0) {
    // no "Batch N" pages -> fall back to the most-commented page name
    const counts = new Map();
    for (const ad of ads) counts.set(ad.page, (counts.get(ad.page) || 0) + ad.threads.length);
    let best = null, bestN = 0;
    for (const [page, n] of counts) if (n > bestN) { best = page; bestN = n; }
    return best || null;
  }
  const batches = [...batchCounts.keys()].sort((a, b) => batchNum(a) - batchNum(b));
  return batches.length === 1 ? `Batch ${batches[0]}` : `Batches ${batches.join(", ")}`;
}

/* ---------- self check (schema conformance, fail loud) ---------- */
function selfCheck(b) {
  const fail = (msg) => { throw new Error(`brief self-check failed: ${msg}`); };
  const need = (obj, keys, where) => { for (const k of keys) if (!(k in obj)) fail(`missing ${where}.${k}`); };

  need(b, ["schemaVersion", "file", "generatedAt", "cursor", "stats", "themes", "ads", "unplaced"], "brief");
  if (b.schemaVersion !== 1) fail("schemaVersion must be 1");
  need(b.file, ["key", "name", "url", "lastModified"], "file");
  need(b.cursor, ["latestCommentId", "latestActivityAt", "commentCount"], "cursor");
  need(b.stats, ["totalComments", "totalThreads", "openThreads", "resolvedThreads", "byClient", "byType", "byRoute"], "stats");

  if (!Number.isInteger(b.cursor.commentCount)) fail("cursor.commentCount must be integer");
  for (const s of ["totalComments", "totalThreads", "openThreads", "resolvedThreads"]) if (!Number.isInteger(b.stats[s])) fail(`stats.${s} must be integer`);

  for (const c of b.stats.byClient) { need(c, ["handle", "count"], "stats.byClient[]"); if (!Number.isInteger(c.count)) fail("byClient.count must be integer"); }
  for (const k of Object.keys(b.stats.byType)) if (!Number.isInteger(b.stats.byType[k])) fail(`byType.${k} must be integer`);
  for (const k of Object.keys(b.stats.byRoute)) if (!Number.isInteger(b.stats.byRoute[k])) fail(`byRoute.${k} must be integer`);

  for (const th of b.themes) {
    need(th, ["id", "label", "type", "route", "priority", "summary", "threadIds", "adRefs"], "themes[]");
    enumCheck(th, fail);
  }

  for (const ad of b.ads) {
    need(ad, ["nodeId", "name", "page", "thumbnailUrl", "threads"], "ads[]");
    if (!Array.isArray(ad.threads)) fail("ads[].threads must be array");
    for (const t of ad.threads) checkThread(t, fail);
  }
  for (const t of b.unplaced) checkThread(t, fail);
}

function checkThread(t, fail) {
  const need = (obj, keys, where) => { for (const k of keys) if (!(k in obj)) fail(`missing ${where}.${k}`); };
  need(t, ["commentId", "author", "createdAt", "resolved", "type", "route", "priority", "verbatim", "action", "replies"], "thread");
  need(t.author, ["handle"], "thread.author");
  enumCheck(t, fail);
  if (typeof t.verbatim !== "string") fail("thread.verbatim must be string");
  if (typeof t.action !== "string") fail("thread.action must be string");
  if (t.route !== "designer" && t.route !== "copywriter" && t.action !== "") fail(`thread ${t.commentId}: action must be "" when route=${t.route}`);
  if (!Array.isArray(t.replies)) fail("thread.replies must be array");
  for (const r of t.replies) need(r, ["author", "text", "createdAt"], "reply");
}

function enumCheck(o, fail) {
  if (!TYPES.includes(o.type)) fail(`invalid type "${o.type}"`);
  if (!ROUTES.includes(o.route)) fail(`invalid route "${o.route}"`);
  if (!PRIOS.includes(o.priority)) fail(`invalid priority "${o.priority}"`);
}

/* ---------- small utils ---------- */
function authorKey(handle, userId) { return userId ? `u:${userId}` : `h:${handle}`; }
function normDate(s) { const t = Date.parse(s || ""); return Number.isFinite(t) ? new Date(t).toISOString() : null; }
function nowISO() { return new Date().toISOString(); }
function cap(s) { s = String(s); return s.charAt(0).toUpperCase() + s.slice(1); }
