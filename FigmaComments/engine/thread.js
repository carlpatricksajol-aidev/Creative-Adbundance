/* Group flat comments into threads and compute author / client stats.
 *
 * Figma comments: parent_id === "" => top-level thread; non-empty => a reply to that comment.
 * resolved_at is only meaningful on top-level comments.
 *
 * isClient heuristic: an author is INTERNAL (isClient=false) iff their handle (or "@handle")
 * matches the INTERNAL_HANDLES allowlist (csv from env). Everyone else defaults to client=true.
 */

/* handles: array of raw csv entries from env INTERNAL_HANDLES (may include leading @, mixed case). */
export function makeIsInternal(internalHandlesCsv) {
  const set = new Set(
    String(internalHandlesCsv || "")
      .split(",")
      .map((s) => s.trim().replace(/^@/, "").toLowerCase())
      .filter(Boolean),
  );
  return (handle) => set.has(String(handle || "").replace(/^@/, "").toLowerCase());
}

/* Returns { threads, byClient, totals }.
 * threads: [{ top: comment, replies: [comment...], resolved: bool }] ordered by top.created_at asc.
 * byClient: [{ handle, userId, count, isClient }] sorted by count desc.
 * totals: { totalComments, totalThreads } */
export function buildThreads(comments, isInternal) {
  const byId = new Map();
  for (const c of comments) byId.set(String(c.id), c);

  const tops = [];
  const repliesByParent = new Map();
  for (const c of comments) {
    const pid = c.parent_id || "";
    if (pid === "") tops.push(c);
    else {
      if (!repliesByParent.has(pid)) repliesByParent.set(pid, []);
      repliesByParent.get(pid).push(c);
    }
  }

  const threads = tops
    .map((top) => {
      const replies = (repliesByParent.get(String(top.id)) || [])
        .slice()
        .sort((a, b) => cmpDate(a.created_at, b.created_at));
      return { top, replies, resolved: !!top.resolved_at };
    })
    .sort((a, b) => cmpDate(a.top.created_at, b.top.created_at));

  // author tally across threads AND replies
  const authorMap = new Map(); // userId||handle -> { handle, userId, count }
  for (const c of comments) {
    const user = c.user || {};
    const handle = user.handle || "(unknown)";
    const userId = user.id != null ? String(user.id) : null;
    const k = userId || `h:${handle}`;
    if (!authorMap.has(k)) authorMap.set(k, { handle, userId, count: 0 });
    authorMap.get(k).count += 1;
  }
  const byClient = [...authorMap.values()]
    .map((a) => ({ ...a, isClient: !isInternal(a.handle) }))
    .sort((a, b) => b.count - a.count || a.handle.localeCompare(b.handle));

  return {
    threads,
    byClient,
    totals: { totalComments: comments.length, totalThreads: tops.length },
  };
}

export function cmpDate(a, b) {
  const ta = Date.parse(a || "") || 0;
  const tb = Date.parse(b || "") || 0;
  return ta - tb;
}
