/* Apply — the only code in the system that writes to a backend.
 *
 * At-most-once, by construction:
 *   1. CLAIM   insert meeting_applied {item_id, status:'pending'}. item_id is UNIQUE, so a
 *              re-run, a retried webhook, or a double-clicked Apply collides here and stops.
 *   2. WRITE   call the target.
 *   3. SETTLE  patch the claim to applied/failed with the response and previousValue.
 *
 * Claiming before writing means a crash between 1 and 2 leaves a `pending` row and the write
 * never happens — visible, and safe. Writing first would risk the opposite: the write lands,
 * the ledger does not, and the next run does it again. Given a choice between "might not have
 * happened" and "might have happened twice" against a client's Brand Brain, take the first.
 * Stale `pending` rows are listed by the dashboard and cleared by hand.
 */

import { applyBrandFact } from "./targets/brand-brain.js";
import { applyTask } from "./targets/notion.js";
import { applyNote, insertOnce, update } from "./targets/supabase.js";

const WRITERS = {
  "supabase.brand_brain": (item, ctx, env) => applyBrandFact(item, env),
  "notion.tasks": (item, ctx, env) => applyTask(item, ctx, env),
  "supabase.meeting_notes": (item, ctx, env) => applyNote(item, ctx, env),
  "supabase.decisions": (item, ctx, env) => applyNote(item, ctx, env), // same append-only table, kind = 'decision'
};

/**
 * @param {object} changeset
 * @param {object} opts { only?: string[] itemIds, tiers?: string[], appliedBy: string, changesetId, env }
 * @returns {Promise<{applied: Array, skipped: Array, failed: Array}>}
 */
export async function applyChangeset(changeset, opts = {}) {
  const env = opts.env || process.env;
  const appliedBy = opts.appliedBy || "auto";
  const tiers = new Set(opts.tiers || ["auto"]);
  const only = opts.only ? new Set(opts.only) : null;

  const ctx = {
    meetingId: changeset.meeting.id,
    brand: changeset.meeting.brand,
    brandRecordId: changeset.meeting.brandRecordId,
    meetingTitle: changeset.meeting.title,
    startedAt: changeset.meeting.startedAt,
  };

  const applied = [], skipped = [], failed = [];

  for (const item of changeset.items) {
    // A human clicking Apply on a specific item overrides the tier — that IS the review.
    // Nothing overrides `blocked`: those need a person to do the thing, not to approve it.
    const chosen = only ? only.has(item.id) : tiers.has(item.tier);
    if (!chosen) { skipped.push({ id: item.id, reason: "not selected" }); continue; }
    if (!item.write) { skipped.push({ id: item.id, reason: "informational" }); continue; }
    if (item.tier === "blocked" && !opts.force) { skipped.push({ id: item.id, reason: `blocked: ${item.blockedReason || "needs a human"}` }); continue; }

    const writer = WRITERS[item.write.target];
    if (!writer) { failed.push({ id: item.id, error: `no writer for ${item.write.target}` }); continue; }

    // 1. CLAIM
    let claim;
    try {
      claim = await insertOnce("meeting_applied", {
        item_id: item.id,
        changeset_id: opts.changesetId || null,
        meeting_id: ctx.meetingId,
        item_type: item.type,
        target: item.write.target,
        op: item.write.op,
        payload: item.write,
        previous_value: item.write.previousValue ?? null,
        status: "pending",
        applied_by: appliedBy,
      }, "item_id", env);
    } catch (e) {
      failed.push({ id: item.id, error: `claim failed: ${e.message}` });
      continue;
    }
    if (claim.duplicate) { skipped.push({ id: item.id, reason: "already applied" }); continue; }

    // 2. WRITE  3. SETTLE
    try {
      const result = await writer(item, ctx, env);
      await update("meeting_applied", `item_id=eq.${encodeURIComponent(item.id)}`, {
        status: "applied",   // a writer that reports `skipped` (value already matched) still counts as settled
        result,
        previous_value: result?.previousValue ?? item.write.previousValue ?? null,
      }, env);
      applied.push({ id: item.id, target: item.write.target, result });
    } catch (e) {
      await update("meeting_applied", `item_id=eq.${encodeURIComponent(item.id)}`, {
        status: "failed", error: String(e.message || e).slice(0, 800),
      }, env).catch(() => {});
      failed.push({ id: item.id, target: item.write.target, error: String(e.message || e) });
    }
  }

  return { applied, skipped, failed };
}

/** Human said no. Recorded, not deleted — the accept rate per item type in meeting_applied is
 *  the evidence for promoting a type to auto in phase 4. */
export async function rejectItems(changeset, itemIds, opts = {}) {
  const env = opts.env || process.env;
  const wanted = new Set(itemIds);
  const out = [];
  for (const item of changeset.items) {
    if (!wanted.has(item.id)) continue;
    const { row } = await insertOnce("meeting_applied", {
      item_id: item.id,
      changeset_id: opts.changesetId || null,
      meeting_id: changeset.meeting.id,
      item_type: item.type,
      target: item.write?.target || "none",
      op: item.write?.op || "none",
      payload: item.write || {},
      status: "rejected",
      applied_by: opts.appliedBy || "unknown",
    }, "item_id", env);
    out.push(row?.item_id || item.id);
  }
  return out;
}
