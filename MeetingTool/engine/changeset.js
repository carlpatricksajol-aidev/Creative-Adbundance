/* Changeset — assemble the contract, and decide what may happen without a human.
 *
 * tierOf() is the safety boundary of the whole tool. It is deliberately boring, deterministic
 * and readable in one screen, because everything else (capture, model, prompt) can change
 * without anyone re-reading it, and this must still hold.
 *
 * The rule that matters most: `set` against a Brand Brain field that already has content is
 * ALWAYS `review`, at any confidence. A meeting is allowed to fill a gap on its own; it is
 * never allowed to quietly replace something a person put there.
 */

import { createHash } from "node:crypto";
import { getBrandRecord } from "./targets/brand-brain.js";

/** Anything in this class goes to a human regardless of confidence. Wrong money/legal/staffing
 *  facts are the expensive kind — the ones that reach a client or a contract. */
const SENSITIVE = /\b(price|pricing|cost|discount|refund|invoice|budget|retainer|contract|terms|legal|lawyer|attorney|compliance|fda|hipaa|gdpr|liability|salary|equity|raise|fire|fired|terminate|resign|nda|lawsuit)\b/i;

const AUTO_MIN = 0.75;        // additive writes below this get eyes on them
const AUTO_FILL_MIN = 0.8;    // filling an EMPTY Brand Brain field is a real write — stricter
const BLOCK_BELOW = 0.5;      // the model itself is unsure: a human decides

const ADDITIVE = new Set(["notion.tasks"]);

/** This tool's OWN append-only tables. Writing here is *recording*, not mutating anyone's system
 *  of record — and the full transcript is already stored in meeting_transcripts either way, so
 *  withholding a note adds no protection and only loses the searchable, structured copy.
 *  So these are never gated on AUTO_APPLY and never blocked by the sensitive screen. */
const OWN_LOG = new Set(["supabase.meeting_notes", "supabase.decisions"]);

export function tierOf(item, { autoApply = true } = {}) {
  const w = item.write;
  const text = [item.title, item.detail, typeof w?.value === "string" ? w.value : w?.value?.title, w?.value?.detail]
    .filter(Boolean).join(" ");
  const sensitive = SENSITIVE.test(text);

  if (item.confidence < BLOCK_BELOW) return { tier: "blocked", reason: `low confidence (${item.confidence.toFixed(2)})` };

  if (w && OWN_LOG.has(w.target)) {
    if (item.supersededBy) return { tier: "review", reason: "a later statement in the same meeting appears to reverse this" };
    return {
      tier: "auto",
      // Still say when something is sensitive — it is recorded, but a person should see it.
      reason: sensitive ? "sensitive topic — recorded in the meeting log only, not written to any system of record" : null,
    };
  }

  if (sensitive) return { tier: "blocked", reason: "money, legal, compliance or staffing — a human owns this" };
  // Something later in the same meeting looks like it reversed this. Both are kept on purpose
  // (see reconcile.js) and a person picks the winner — writing either one automatically would
  // be acting on a conversation that had not finished.
  if (item.supersededBy) return { tier: "review", reason: "a later statement in the same meeting appears to reverse this" };
  if (!w) return { tier: "auto", reason: null };                       // informational, nothing to write
  if (!autoApply) return { tier: "review", reason: null };             // AUTO_APPLY=0 — propose everything

  if (w.target === "supabase.brand_brain") {
    const populated = String(w.previousValue ?? "").trim().length > 0;
    if (populated) return { tier: "review", reason: "field already has content — never overwritten automatically" };
    if (item.confidence < AUTO_FILL_MIN) return { tier: "review", reason: "filling an empty Brand Brain field needs ≥0.80" };
    return { tier: "auto", reason: null };
  }

  if (ADDITIVE.has(w.target)) {
    if (item.confidence < AUTO_MIN) return { tier: "review", reason: `confidence ${item.confidence.toFixed(2)} < ${AUTO_MIN}` };
    return { tier: "auto", reason: null };
  }

  return { tier: "review", reason: "unknown target" };
}

/** Fill previousValue on every brand_fact from the live brand_brain row — one read, not one per
 *  item. Without this the dashboard cannot show old -> new, and tierOf cannot tell "filling a
 *  gap" from "overwriting a person". A read failure downgrades to review rather than guessing. */
async function attachPreviousValues(items, brandRecordId, env, injected) {
  const facts = items.filter((i) => i.write?.target === "supabase.brand_brain");
  if (!facts.length || !brandRecordId) return;
  try {
    // `injected` lets the demo and tests supply a brand row instead of hitting Supabase. It is
    // never set in production — poll-drive.js and server.js both leave it undefined.
    const { fields } = injected ? { fields: injected } : await getBrandRecord(brandRecordId, env);
    for (const it of facts) {
      const cur = fields[it.write.field];
      it.write.previousValue = cur == null || cur === "" ? null : String(cur);
    }
  } catch (e) {
    console.error(`[changeset] could not read Brand Brain ${brandRecordId} — every brand_fact stays in review: ${e.message}`);
    for (const it of facts) { it.write.previousValue = null; it._readFailed = true; }
  }
}

/**
 * @param {object} input { meeting, transcript, summary, items, dropped, model }
 * @returns {Promise<object>} a changeset validating against ../changeset.schema.json
 */
export async function buildChangeset(input, opts = {}) {
  const env = opts.env || process.env;
  const autoApply = opts.autoApply ?? env.AUTO_APPLY !== "0";
  const { meeting, transcript, summary, items, dropped = [], model } = input;

  await attachPreviousValues(items, meeting.brandRecordId, env, opts.brandRecord);

  for (const it of items) {
    const { tier, reason } = tierOf(it, { autoApply });
    // A failed Brand Brain read means we do not know what we would be overwriting. Refuse the
    // auto lane rather than assume the field was empty.
    it.tier = it._readFailed && tier === "auto" ? "review" : tier;
    it.blockedReason = it._readFailed && tier === "auto" ? "could not read the current Brand Brain value" : reason;
    delete it._readFailed;
  }

  const byType = {}, byTier = { auto: 0, review: 0, blocked: 0 };
  for (const it of items) {
    byType[it.type] = (byType[it.type] || 0) + 1;
    byTier[it.tier]++;
  }

  return {
    schemaVersion: 1,
    meeting,
    generatedAt: new Date().toISOString(),
    model: model || null,
    transcript: {
      wordCount: transcript.wordCount ?? (transcript.text || "").split(/\s+/).filter(Boolean).length,
      durationSec: transcript.durationSec ?? null,
      language: transcript.language ?? null,
      sha256: transcript.sha256 || sha256(transcript.text || ""),
      provider: transcript.provider ?? null,
    },
    summary: {
      headline: summary?.headline || "Meeting processed",
      narrative: summary?.narrative || "",
      topics: Array.isArray(summary?.topics) ? summary.topics : [],
    },
    items,
    dropped,
    stats: { total: items.length, byType, byTier, droppedCount: dropped.length },
  };
}

export const sha256 = (s) =>
  createHash("sha256").update(String(s).replace(/\s+/g, " ").trim()).digest("hex");

/** The Slack line. Says what happened and what is owed, in that order. */
export function notifyText(changeset, dashboardUrl) {
  const { meeting, stats, summary } = changeset;
  const who = meeting.brand ? ` — ${meeting.brand}` : "";
  const bits = [
    stats.byTier.auto ? `${stats.byTier.auto} applied` : null,
    stats.byTier.review ? `${stats.byTier.review} need review` : null,
    stats.byTier.blocked ? `${stats.byTier.blocked} for a human` : null,
  ].filter(Boolean).join(", ") || "nothing to change";
  return `*${meeting.title || "Meeting"}${who}* — ${bits}.\n${summary.headline}\n${dashboardUrl || ""}`.trim();
}
