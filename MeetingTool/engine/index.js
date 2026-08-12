#!/usr/bin/env node
/* AI Meeting Tool — engine entry point.
 *
 * Library:
 *   processMeeting({ meeting, transcript }) -> { changeset, changesetId, applyResult }
 *
 * CLI (no server, no Supabase writes — for tuning the prompt against a real transcript):
 *   node index.js fixtures/sample-meeting.json --out changeset.json --dry
 *
 * The pipeline is: extract (model) -> reconcile (verify + dedupe + supersede) -> changeset
 * (diff + tier) -> persist -> auto-apply -> notify. Every stage after the first is
 * deterministic, so the same transcript always produces the same proposal.
 */

import { readFileSync, writeFileSync } from "node:fs";

import { extract } from "./extract.js";
import { reconcile } from "./reconcile.js";
import { buildChangeset, notifyText, sha256 } from "./changeset.js";
import { applyChangeset } from "./apply.js";
import { insert, update, upsert } from "./targets/supabase.js";
import { resolveBrand } from "./targets/brand-brain.js";

/** roleOf from the participant roster: client instruction outranks internal speculation. */
function rosterRoleOf(participants = []) {
  const map = new Map(participants.map((p) => [String(p.name || "").toLowerCase(), p.role || "unknown"]));
  return (name) => (name ? map.get(String(name).toLowerCase()) || "unknown" : null);
}

/**
 * @param {object} input
 *   meeting     partial changeset.meeting — at minimum { id, source, startedAt }
 *   transcript  { text, segments[], durationSec?, language?, provider? }
 * @param {object} opts { dry, persist, autoApply, notify, env }
 */
export async function processMeeting(input, opts = {}) {
  const env = opts.env || process.env;
  const dry = Boolean(opts.dry);
  const persist = opts.persist ?? !dry;

  const transcript = { ...input.transcript };
  transcript.sha256 = transcript.sha256 || sha256(transcript.text || "");
  transcript.wordCount = transcript.wordCount ?? (transcript.text || "").split(/\s+/).filter(Boolean).length;

  // Resolve the spoken brand to a public.brand_brain row, using that table's own
  // brand_name -> client_name -> aliases matcher (the same one the static-ads pipeline uses, so
  // the two tools can never disagree about which client a name means). Unresolved is not fatal —
  // notes and tasks still land — but every brand_fact is dropped rather than written to a guess.
  const meeting = { ...input.meeting };
  if (!meeting.brandRecordId && meeting.brand && !dry) {
    const hit = await resolveBrand(meeting.brand, env).catch(() => null);
    if (hit) {
      meeting.brand = hit.brand;
      meeting.brandRecordId = hit.id;
      console.error(`[engine] brand "${hit.brand}" resolved on ${hit.matchedOn}`);
    } else {
      // Null it out rather than keeping the guess. `brand` means "a real brand_brain client",
      // and storing "Carl x Dimple" there would make every per-brand query on meetings and
      // meeting_notes useless. The original text is still in meetings.title.
      console.error(`[engine] "${meeting.brand}" matches no brand_brain row — recording without a brand. Add it to that client's aliases column to attribute it.`);
      meeting.brand = null;
    }
  }

  console.error(`[engine] extracting: ${transcript.wordCount} words, brand=${meeting.brand || "unresolved"}`);
  // input.notes = Google's own meeting notes when the source is Meet. A recall hint only; the
  // evidence check still runs against the transcript.
  const raw = await extract(transcript, meeting, { env, notes: input.notes });

  const { items, dropped } = reconcile(raw.items, {
    meetingId: meeting.id,
    brand: meeting.brand,
    brandRecordId: meeting.brandRecordId,
    transcriptText: transcript.text,
    roleOf: rosterRoleOf(meeting.participants),
    // Unset = action items go to meeting_notes instead of a Notion database nobody confirmed
    // exists. See targetFor() in reconcile.js.
    notionTasks: env.NOTION_TASKS_DB || null,
  });
  console.error(`[engine] ${raw.items.length} proposed -> ${items.length} kept, ${dropped.length} dropped`);

  const changeset = await buildChangeset(
    { meeting, transcript, summary: raw.summary, items, dropped, model: raw.model },
    { env, autoApply: opts.autoApply }
  );

  if (dry || !persist) return { changeset, changesetId: null, applyResult: null };

  // Persist transcript + changeset before applying anything: if a write fails we still have the
  // proposal to retry from, and the dashboard has something to show.
  await upsert("meeting_transcripts", {
    meeting_id: meeting.id,
    text: transcript.text,
    segments: transcript.segments || [],
    word_count: transcript.wordCount,
    language: transcript.language || null,
    provider: transcript.provider || null,
    sha256: transcript.sha256,
  }, env).catch((e) => console.error(`[engine] transcript store failed (continuing): ${e.message}`));

  const row = await insert("meeting_changesets", {
    meeting_id: meeting.id,
    changeset,
    model: raw.model,
    item_count: changeset.stats.total,
    auto_count: changeset.stats.byTier.auto || 0,
    review_count: changeset.stats.byTier.review || 0,
    blocked_count: changeset.stats.byTier.blocked || 0,
  }, env);

  const applyResult = await applyChangeset(changeset, { tiers: ["auto"], appliedBy: "auto", changesetId: row.id, env });
  console.error(`[engine] auto-applied ${applyResult.applied.length}, failed ${applyResult.failed.length}`);

  await update("meetings", `id=eq.${meeting.id}`, {
    status: "ready",
    brand: meeting.brand || null,
    brand_record_id: meeting.brandRecordId || null,
    duration_sec: transcript.durationSec ?? null,
  }, env).catch(() => {});

  if (opts.notify !== false && env.N8N_NOTIFY_URL) {
    const dashboardUrl = env.DASHBOARD_URL ? `${env.DASHBOARD_URL}?m=${meeting.id}` : "";
    await fetch(env.N8N_NOTIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        meetingId: meeting.id,
        brand: meeting.brand,
        title: meeting.title,
        text: notifyText(changeset, dashboardUrl),
        stats: changeset.stats,
        dashboardUrl,
      }),
    }).catch((e) => console.error(`[engine] notify failed (harmless): ${e.message}`));
  }

  return { changeset, changesetId: row.id, applyResult };
}

/* ------------------------------------------------------------------ CLI */

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("index.js")) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const outIdx = args.indexOf("--out");
  const out = outIdx >= 0 ? args[outIdx + 1] : null;

  if (!file) {
    console.error("usage: node index.js <meeting.json> [--out changeset.json] [--dry]");
    process.exit(2);
  }

  const input = JSON.parse(readFileSync(file, "utf8"));
  input.meeting.id ||= "cli-" + Date.now().toString(36);

  processMeeting(input, { dry: args.includes("--dry") })
    .then(({ changeset }) => {
      const json = JSON.stringify(changeset, null, 2);
      if (out) { writeFileSync(out, json); console.error(`[engine] wrote ${out}`); }
      else console.log(json);
      const t = changeset.stats.byTier;
      console.error(`[engine] ${changeset.stats.total} items — auto ${t.auto}, review ${t.review}, blocked ${t.blocked}`);
    })
    .catch((e) => { console.error(e.stack || e); process.exit(1); });
}
