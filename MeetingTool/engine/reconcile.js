/* Reconcile — where model output stops being trusted and becomes data.
 *
 * Everything here is deterministic. Given the same raw items and the same transcript it
 * always produces the same result, which is what makes the audit ledger meaningful.
 *
 * Order matters: verify evidence -> normalize -> dedupe -> supersede -> id. Verification
 * runs first so a hallucinated item never even gets an id.
 */

import { createHash } from "node:crypto";
import { BRAND_BRAIN_FIELDS } from "./targets/brand-brain.js";

const FIELD_NAMES = new Set(BRAND_BRAIN_FIELDS.map((f) => f.name));
const VALID_TYPES = new Set([
  "brand_fact", "creative_direction", "decision",
  "action_item", "asset_request", "blocker", "open_question",
]);

/** Loose text key: lowercase, strip punctuation and collapse whitespace. Used for both
 *  quote verification and dedupe, so "we'll do it" matches "we will do it" only if it
 *  really is the same string — filler differences still fail, and should. */
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

/** Verbatim-ish check. Exact after normalization, else a token-window match at >=85%, which
 *  forgives a dropped filler word or a transcription hiccup between the model's copy and the
 *  source but rejects anything the model actually composed. */
export function quoteInTranscript(quote, haystackNorm) {
  const q = norm(quote);
  if (q.length < 8) return false;              // too short to be evidence of anything
  if (haystackNorm.includes(q)) return true;

  const qt = q.split(" ");
  if (qt.length < 4) return false;
  const ht = haystackNorm.split(" ");
  const need = Math.ceil(qt.length * 0.85);
  const qset = new Set(qt);

  for (let i = 0; i + qt.length <= ht.length; i++) {
    let hit = 0;
    for (let j = 0; j < qt.length; j++) if (qset.has(ht[i + j])) hit++;
    if (hit >= need) return true;
  }
  return false;
}

/** sha1(meetingId + type + target + value), 16 hex. The idempotency key that
 *  meeting_applied.item_id is UNIQUE on — the reason a re-run cannot double-write. */
export function itemId(meetingId, type, target, value) {
  return createHash("sha1")
    .update([meetingId, type, target || "none", norm(typeof value === "string" ? value : JSON.stringify(value))].join("|"))
    .digest("hex")
    .slice(0, 16);
}

/** Which store handles each item type. brand_fact is the only one that can overwrite.
 *
 *  Tasks are routed by CONFIGURATION, not assumption. The only Notion database this agency
 *  demonstrably runs is "File Renaming Automation" — a per-job video production queue
 *  (Client's Name / Dropbox link / READY? button / Status), not a to-do list with owners and
 *  due dates. So unless someone sets NOTION_TASKS_DB to a real tasks database, action items
 *  land in meeting_notes alongside everything else and surface in the dashboard and the Slack
 *  ping. Better a task in the wrong-ish place than a write to a database that does not exist. */
function targetFor(type, { notion = false } = {}) {
  switch (type) {
    case "brand_fact": return { target: "supabase.brand_brain", op: "set" };
    case "action_item":
    case "asset_request": return notion
      ? { target: "notion.tasks", op: "create" }
      : { target: "supabase.meeting_notes", op: "append" };
    case "decision": return { target: "supabase.decisions", op: "append" };
    case "creative_direction":
    case "blocker":
    case "open_question": return { target: "supabase.meeting_notes", op: "append" };
    default: return null;
  }
}

// Connectives that are long enough to survive the length filter but say nothing about subject.
const STOP = new Set(["from", "with", "that", "this", "they", "them", "have", "been", "will", "into",
  "than", "then", "when", "what", "your", "ours", "about", "should", "would", "could", "make", "made"]);

const contentWords = (s) => new Set(norm(s).split(" ").filter((w) => w.length > 3 && !STOP.has(w)));

/** Subject overlap measured against the SMALLER title, so "drop the athlete angle" and "keep one
 *  athlete concept" register as the same subject even though the second says less. */
const RELATED = (a, b) => {
  const A = contentWords(a), B = contentWords(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const w of B) if (A.has(w)) hit++;
  return hit / Math.min(A.size, B.size);
};
const SAME_SUBJECT = 0.4;

/**
 * @param {Array}  rawItems  straight off extract()
 * @param {object} ctx       { meetingId, brand, brandRecordId, transcriptText, roleOf }
 * @returns {{items: Array, dropped: Array}}
 */
export function reconcile(rawItems, ctx) {
  const hay = norm(ctx.transcriptText || "");
  const dropped = [];
  const kept = [];

  for (const raw of rawItems || []) {
    const type = String(raw?.type || "").trim();
    const title = String(raw?.title || "").trim();

    if (!VALID_TYPES.has(type) || !title) {
      dropped.push({ title: title || "(untitled)", type: type || null, reason: "empty-value" });
      continue;
    }

    // RULE 1 — no quote, no item. Checked against the real transcript, not the model's memory.
    const evidence = (Array.isArray(raw.evidence) ? raw.evidence : [])
      .filter((e) => e && typeof e.quote === "string" && quoteInTranscript(e.quote, hay))
      .map((e) => ({
        speaker: e.speaker || null,
        role: ctx.roleOf ? ctx.roleOf(e.speaker) : null,
        atSec: typeof e.atSec === "number" ? e.atSec : null,
        quote: String(e.quote).trim(),
      }));

    if (!evidence.length) {
      const had = Array.isArray(raw.evidence) && raw.evidence.length;
      dropped.push({ title, type, reason: had ? "quote-not-in-transcript" : "no-evidence" });
      continue;
    }

    const t = targetFor(type, { notion: Boolean(ctx.notionTasks) });
    let write = null;

    if (t && type === "brand_fact") {
      const field = String(raw.field || "").trim();
      const value = String(raw.value || "").trim();
      if (!FIELD_NAMES.has(field)) { dropped.push({ title, type, reason: "unknown-field" }); continue; }
      if (!value) { dropped.push({ title, type, reason: "empty-value" }); continue; }

      if (ctx.brandRecordId) {
        write = {
          target: t.target, op: t.op, field,
          recordKey: { recordId: ctx.brandRecordId },
          value, previousValue: null,         // filled by changeset.js from the live record
        };
      } else {
        // No matching brand_brain row — an internal meeting, or a title the matcher does not
        // recognise. Earlier this DISCARDED the item, which was wrong: not knowing which client
        // a fact belongs to is a reason not to WRITE it to a client's record, not a reason to
        // lose it. Record it in our own append-only log instead, tagged with the column it was
        // headed for, so it stays searchable and can be promoted by hand later.
        write = {
          target: "supabase.meeting_notes", op: "append", field: null,
          recordKey: { brand: ctx.brand || null, meetingId: ctx.meetingId },
          value: {
            title, detail: raw.detail || null, assignee: null, dueDate: null,
            intendedField: field, intendedValue: value,
          },
          previousValue: null,
        };
      }
    } else if (t) {
      write = {
        target: t.target, op: t.op, field: null,
        recordKey: { brand: ctx.brand || null, meetingId: ctx.meetingId },
        value: { title, detail: raw.detail || null, assignee: raw.assignee || null, dueDate: raw.dueDate || null },
        previousValue: null,
      };
    }

    kept.push({
      id: itemId(ctx.meetingId, type, write?.target, write?.field ? `${write.field}:${write.value}` : title),
      type,
      title,
      detail: raw.detail ? String(raw.detail) : null,
      evidence,
      confidence: Math.max(0, Math.min(1, Number(raw.confidence ?? 0.5))),
      tier: "review",           // changeset.js decides for real; never leave it to the model
      blockedReason: null,
      supersedes: [],
      supersededBy: null,
      _subject: raw.subject ? norm(raw.subject) : null,  // grouping hint only — never a decision
      assignee: raw.assignee || null,
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(raw.dueDate || "") ? raw.dueDate : null,
      write,
      _at: evidence.reduce((m, e) => Math.max(m, e.atSec ?? 0), 0), // for supersede ordering
    });
  }

  // Dedupe — same id (chunk overlap re-emitted it) or near-identical title. Keep the more
  // confident copy and union the evidence, so a thing said twice reviews as one item.
  const byId = new Map();
  for (const it of kept) {
    const prev = byId.get(it.id);
    if (!prev) { byId.set(it.id, it); continue; }
    dropped.push({ title: it.title, type: it.type, reason: "duplicate" });
    if (it.confidence > prev.confidence) { it.evidence = [...prev.evidence, ...it.evidence]; byId.set(it.id, it); }
    else prev.evidence = [...prev.evidence, ...it.evidence];
  }
  let items = [...byId.values()];

  // RULE 2 — within-meeting reversal. People decide, then un-decide; the record should show
  // what the meeting actually concluded, not everything anyone floated on the way there.
  //
  // Both items are KEPT. An earlier version of this deleted the superseded one, which is wrong:
  // subject matching is fuzzy, and a false match would silently destroy a real decision. Showing
  // a reviewer two linked items costs two seconds; losing one costs a client relationship. So the
  // later item claims `supersedes`, the earlier is flagged and forced out of the auto lane, and a
  // human decides which stands.
  items.sort((a, b) => a._at - b._at);
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const [earlier, later] = [items[i], items[j]];
      if (earlier.type !== later.type) continue;
      if ((earlier.write?.field || null) !== (later.write?.field || null)) continue;
      // The model may hand us an explicit subject slug; trust it for grouping only.
      const sameSubject = earlier._subject && earlier._subject === later._subject;
      if (!sameSubject && RELATED(earlier.title, later.title) < SAME_SUBJECT) continue;
      if (earlier.supersededBy) continue; // already accounted for by a later statement

      later.supersedes = [...later.supersedes, earlier.id];
      later.detail = [later.detail, `Reverses an earlier point in the same meeting: "${earlier.title}".`]
        .filter(Boolean).join(" ");
      later.evidence = [...later.evidence, ...earlier.evidence];
      earlier.supersededBy = later.id;
      earlier.detail = [earlier.detail, `A later statement in the same meeting appears to reverse this: "${later.title}".`]
        .filter(Boolean).join(" ");
    }
  }

  for (const it of items) { delete it._at; delete it._subject; }
  return { items, dropped };
}
