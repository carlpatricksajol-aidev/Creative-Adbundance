#!/usr/bin/env node
/* See the whole thing work, with no credentials at all.
 *
 *   npm run demo        ->  http://localhost:8791
 *
 * Runs a real Google Meet "Notes by Gemini" document through the real parser, the real evidence
 * check, the real reversal linker and the real tiering rules, then serves the real review
 * dashboard against the result. The ONLY thing stubbed is the model call — extraction is read
 * from engine/fixtures/extracted-sample.json, which is the same canned output the test suite
 * uses, so the demo and the tests cannot drift.
 *
 * The point is to answer "what would I actually be reviewing?" before anyone spends time in the
 * Google Cloud console. Everything you see — the quotes, the old -> new diffs, what auto-applied
 * and what got blocked — is produced by the code that would run in production.
 *
 * Apply/Reject are disabled here: there is no Supabase and no brand_brain to write to. Clicking
 * them returns a 501 that says so.
 */

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseMeetDoc } from "./engine/sources/meet-notes.js";
import { reconcile } from "./engine/reconcile.js";
import { buildChangeset } from "./engine/changeset.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.DEMO_PORT || 8791);
const F = (p) => join(__dirname, "engine", "fixtures", p);

/* A plausible half-filled brand_brain row. `brand_tone` and `creative_boundaries` already have
 * content, so their updates must land in review; `key_offer` and `target_personas` are empty, so
 * they are the only ones eligible to auto-apply. This is what makes the demo show both lanes. */
const BRAND_ROW = {
  id: "bb-demo-0001",
  brand_name: "ARMRA",
  client_name: "ARMRA",
  brand_tone: "Clinical and precise. Lead with the science.",
  creative_boundaries: "No before/after body imagery.",
  key_offer: "",
  target_personas: "",
  compliance_notes: "",
};

async function build() {
  // 1. REAL parse of a real Meet document shape.
  const doc = parseMeetDoc(readFileSync(F("gemini-notes-sample.md"), "utf8"));

  // 2. Stubbed model output (the only stub).
  const extracted = JSON.parse(readFileSync(F("extracted-sample.json"), "utf8"));

  const meeting = {
    id: "demo-0000-0000-0000-000000000001",
    externalId: "demo",
    title: doc.title,
    source: "test",
    platform: "meet",
    brand: BRAND_ROW.brand_name,
    brandRecordId: BRAND_ROW.id,
    meetingType: "client-review",
    startedAt: new Date(Date.parse(doc.date || "2026-08-06") || Date.now()).toISOString(),
    endedAt: null,
    participants: doc.participants,
  };

  // 3. REAL evidence verification, dedupe, reversal linking, id generation.
  const roles = new Map(doc.participants.map((p) => [p.name.toLowerCase(), p.role]));
  const { items, dropped } = reconcile(extracted.items, {
    meetingId: meeting.id,
    brand: meeting.brand,
    brandRecordId: meeting.brandRecordId,
    transcriptText: doc.transcript.text,
    roleOf: (n) => (n ? roles.get(String(n).toLowerCase()) || "unknown" : null),
    notionTasks: null, // unset, so tasks fall back to meeting_notes — as they would today
  });

  // 4. REAL diffing and tiering, against the half-filled brand row above.
  const changeset = await buildChangeset(
    { meeting, transcript: doc.transcript, summary: extracted.summary, items, dropped, model: extracted.model },
    { env: { AUTO_APPLY: "1" }, autoApply: true, brandRecord: BRAND_ROW }
  );

  return { meeting, changeset, doc };
}

const { meeting, changeset, doc } = await build();

// `node demo.js --dump cs.json` writes the changeset and exits, so it can be run through
// `npm run validate` — the full ajv pass against changeset.schema.json.
const dumpIdx = process.argv.indexOf("--dump");
if (dumpIdx >= 0) {
  const { writeFileSync } = await import("node:fs");
  const out = process.argv[dumpIdx + 1] || "changeset.json";
  writeFileSync(out, JSON.stringify(changeset, null, 2));
  console.log(`wrote ${out} — ${changeset.stats.total} items`);
  process.exit(0);
}

/* ------------------------------------------------------------------ tiny server */

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json" };

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const send = (code, body, type = "application/json") =>
    res.writeHead(code, { "content-type": type }).end(typeof body === "string" ? body : JSON.stringify(body));

  // The dashboard's API, served from memory. Same shapes server.js returns.
  if (url.pathname === "/api/meetings") {
    return send(200, [{
      ...meeting, brand_record_id: meeting.brandRecordId, started_at: meeting.startedAt,
      status: "ready", audio_path: null,
      changeset: {
        id: "demo-changeset", meeting_id: meeting.id,
        item_count: changeset.stats.total,
        auto_count: changeset.stats.byTier.auto,
        review_count: changeset.stats.byTier.review,
        blocked_count: changeset.stats.byTier.blocked,
        generated_at: changeset.generatedAt,
      },
    }]);
  }

  if (url.pathname.startsWith("/api/meetings/")) {
    return send(200, {
      meeting: { ...meeting, brand_record_id: meeting.brandRecordId, started_at: meeting.startedAt, status: "ready", audio_path: null },
      changesetId: "demo-changeset",
      changeset,
      // Pretend the auto tier already ran, which is what you would find on a real meeting.
      applied: changeset.items.filter((i) => i.tier === "auto").map((i) => ({
        item_id: i.id, status: "applied", applied_by: "auto", applied_at: changeset.generatedAt, result: {},
      })),
    });
  }

  if (url.pathname.startsWith("/api/changesets/")) {
    return send(501, { error: "demo mode — no Supabase, no brand_brain, nothing to write to. Deploy for real writes." });
  }

  // Static dashboard.
  const file = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
  try {
    const body = readFileSync(join(__dirname, "dashboard", file));
    return res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" }).end(body);
  } catch { return send(404, { error: "not found" }); }
});

server.listen(PORT, () => {
  const t = changeset.stats.byTier;
  console.log(`\n  AI Meeting Tool — demo (no credentials used)\n`);
  console.log(`  meeting      ${changeset.meeting.title}`);
  console.log(`  participants ${doc.participants.map((p) => `${p.name}/${p.role}`).join(", ")}`);
  console.log(`  transcript   ${changeset.transcript.wordCount} words, ${doc.transcript.segments.length} segments, ${changeset.transcript.durationSec}s\n`);
  console.log(`  model proposed ${JSON.parse(readFileSync(F("extracted-sample.json"), "utf8")).items.length} items`);
  console.log(`  code kept      ${changeset.stats.total}  (auto ${t.auto} · review ${t.review} · blocked ${t.blocked})`);
  console.log(`  code discarded ${changeset.stats.droppedCount}:`);
  for (const d of changeset.dropped) console.log(`     - ${d.title}  [${d.reason}]`);
  console.log(`\n  open  http://localhost:${PORT}   (token box: type anything, demo mode ignores it)\n`);
});
