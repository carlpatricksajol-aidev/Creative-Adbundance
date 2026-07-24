/* Resolve a comment's pin to the ad (top-level frame) it belongs to.
 *
 * A "top-level frame / ad" = a direct child of a CANVAS (page) node.
 * The file tree is: document -> children[CANVAS] -> children[top-level frames] -> deep children.
 *
 * Strategy per comment.client_meta:
 *   (a) node_id present -> walk parentId up until the parent is a CANVAS; that node is the ad.
 *   (b) no node_id but x,y present -> hit-test x,y against top-level frames' absoluteBoundingBox.
 *   (c) neither -> unplaced.
 */

/* Build a flat index: nodeId -> { id, name, type, absoluteBoundingBox, parentId, pageName, isTopLevelAd }.
 * Also returns adsByPage: ordered list of top-level frames grouped by page (for reading order + hit-test). */
export function buildIndex(fileJson) {
  const index = new Map();
  const topLevelAds = []; // { nodeId, ...node fields } in document order
  const pages = [];       // { id, name, order } in document order
  const doc = fileJson && fileJson.document;
  const canvases = (doc && Array.isArray(doc.children) ? doc.children : []).filter((n) => n && n.type === "CANVAS");

  canvases.forEach((canvas, pageOrder) => {
    const pageName = canvas.name || "";
    pages.push({ id: canvas.id, name: pageName, order: pageOrder });
    // record the canvas itself (parent = document; we don't index the document node)
    index.set(canvas.id, {
      id: canvas.id, name: pageName, type: "CANVAS",
      absoluteBoundingBox: null, parentId: null, pageName, isCanvas: true, isTopLevelAd: false,
    });

    const topChildren = Array.isArray(canvas.children) ? canvas.children : [];
    topChildren.forEach((frame, frameOrder) => {
      walk(frame, canvas.id, pageName, pageOrder, true, frameOrder);
    });
  });

  function walk(node, parentId, pageName, pageOrder, isTopLevel, siblingOrder) {
    if (!node || !node.id) return;
    const entry = {
      id: node.id,
      name: node.name || "",
      type: node.type || "",
      absoluteBoundingBox: node.absoluteBoundingBox || null,
      parentId,
      pageName,
      pageOrder,
      isCanvas: false,
      isTopLevelAd: !!isTopLevel,
      siblingOrder,
    };
    index.set(node.id, entry);
    if (isTopLevel) topLevelAds.push(entry);
    const kids = Array.isArray(node.children) ? node.children : [];
    kids.forEach((k, i) => walk(k, node.id, pageName, pageOrder, false, i));
  }

  return { index, topLevelAds, pages };
}

/* Walk parentId up until the parent is a CANVAS -> that node is the ad.
 * Returns the ad's index entry, or null if the chain doesn't reach a canvas. */
export function adForNodeId(nodeId, index) {
  let cur = index.get(nodeId);
  if (!cur) return null;                 // node not in tree (deleted / stale pin)
  if (cur.isCanvas) return null;         // pinned to the canvas itself -> not an ad
  // climb until the parent is a canvas
  let guard = 0;
  while (cur && guard++ < 10000) {
    const parent = cur.parentId ? index.get(cur.parentId) : null;
    if (!parent) return cur.isTopLevelAd ? cur : null;
    if (parent.isCanvas) return cur;     // cur is a direct child of a canvas -> the ad
    cur = parent;
  }
  return null;
}

/* Hit-test absolute (x,y) against top-level frames. First containing frame wins;
 * if several contain the point (overlaps), pick the smallest-area one (most specific). */
export function adForPoint(x, y, topLevelAds) {
  let best = null, bestArea = Infinity;
  for (const ad of topLevelAds) {
    const b = ad.absoluteBoundingBox;
    if (!b) continue;
    if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) {
      const area = b.width * b.height;
      if (area < bestArea) { best = ad; bestArea = area; }
    }
  }
  return best;
}

/* Main entry: comment + index -> { ad: entry|null, reason }.
 * ad === null means the caller should place the thread in `unplaced`. */
export function resolveCommentToAd(comment, built) {
  const { index, topLevelAds } = built;
  const cm = comment && comment.client_meta ? comment.client_meta : null;
  if (!cm) return { ad: null, reason: "no client_meta (canvas-level or general comment)" };

  // (a)/(c) node-pinned or region-with-node: try ancestry first
  if (cm.node_id) {
    const ad = adForNodeId(cm.node_id, index);
    if (ad) return { ad, reason: "node-ancestry" };
    // node_id didn't resolve (deleted/stale pin). Fall through to the x,y hit-test if the
    // comment also carries coordinates before giving up — never silently drop a pin.
  }

  // (b) bare canvas x,y — also the fallback when a stale node_id failed above
  if (typeof cm.x === "number" && typeof cm.y === "number") {
    const ad = adForPoint(cm.x, cm.y, topLevelAds);
    if (ad) return { ad, reason: cm.node_id ? "xy-hit-test (stale node_id)" : "xy-hit-test" };
    return { ad: null, reason: `x,y (${cm.x},${cm.y}) not inside any top-level frame` };
  }

  if (cm.node_id) return { ad: null, reason: `node_id ${cm.node_id} not resolvable and no x,y fallback` };
  return { ad: null, reason: "client_meta had neither node_id nor x,y" };
}

/* Nearest section heading for an ad: the nearest TEXT node that sits ABOVE the frame's top edge
 * on the same canvas and horizontally overlaps it. Cheap heuristic; returns null if none.
 * `built.index` holds every node incl. TEXT nodes with bounding boxes. */
export function sectionLabelForAd(adEntry, built) {
  if (!adEntry || !adEntry.absoluteBoundingBox) return null;
  const box = adEntry.absoluteBoundingBox;
  let best = null, bestGap = Infinity;
  for (const n of built.index.values()) {
    if (n.type !== "TEXT") continue;
    if (n.pageName !== adEntry.pageName) continue;
    const b = n.absoluteBoundingBox;
    if (!b) continue;
    const nbBottom = b.y + b.height;
    // must be above the frame's top edge (with a little tolerance)
    const gap = box.y - nbBottom;
    if (gap < -4 || gap > 400) continue; // not above, or too far above
    // horizontal overlap with the frame
    const overlap = Math.min(b.x + b.width, box.x + box.width) - Math.max(b.x, box.x);
    if (overlap <= 0) continue;
    if (gap < bestGap) { bestGap = gap; best = n; }
  }
  return best && best.name ? best.name : null;
}
