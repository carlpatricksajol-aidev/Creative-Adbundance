#!/usr/bin/env node
/* Offline tests for the deterministic core — no API keys, no network, no model.
 *
 *   node engine/test-offline.js
 *
 * These cover the parts that are allowed to write to a client's Brand Brain. The model is
 * stubbed with a canned "extraction" against the real fixture transcript, including the things
 * a model actually gets wrong: an invented quote, a paraphrase, an item with no evidence, a
 * within-meeting reversal, and a pricing discussion that must never auto-apply.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { reconcile, quoteInTranscript, itemId } from "./reconcile.js";
import { tierOf, buildChangeset } from "./changeset.js";
import { parseJsonLoose, repairJson } from "./extract.js";
import { parseMeetDoc } from "./sources/meet-notes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(__dirname, "fixtures", "sample-meeting.json"), "utf8"));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ""}`); }
};

/* --------------------------------------------------------------- quote verification */
console.log("\nquoteInTranscript");
const hay = fixture.transcript.text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
ok("accepts a verbatim quote", quoteInTranscript("Drop it, yeah.", hay));
ok("accepts a quote with different punctuation", quoteInTranscript("we want it warm and plain spoken", hay));
ok("accepts a near-verbatim quote missing one filler word", quoteInTranscript("she is not training for anything", hay));
ok("rejects an invented quote", !quoteInTranscript("Dana said the budget is forty thousand dollars", hay));
ok("rejects a paraphrase", !quoteInTranscript("the client dislikes the sporty creative direction", hay));
ok("rejects a too-short fragment", !quoteInTranscript("yeah", hay));

/* --------------------------------------------------------------- reconcile */
console.log("\nreconcile");
// The canned model output lives in a fixture, not inline here, so engine/test-offline.js and
// demo.js exercise byte-identical input and cannot drift. Each item carries a `_trap` field
// naming what it is there to catch; reconcile ignores unknown fields.
const RAW = JSON.parse(readFileSync(join(__dirname, "fixtures", "extracted-sample.json"), "utf8")).items;

const ctxResolved = {
  meetingId: fixture.meeting.id,
  brand: "ARMRA",
  brandRecordId: "bb-fake-uuid-0001",
  transcriptText: fixture.transcript.text,
  roleOf: (n) => (n === "Dana" ? "client" : "internal"),
};

const { items, dropped } = reconcile(RAW, ctxResolved);
const titles = items.map((i) => i.title);
const reason = (t) => dropped.find((d) => d.title === t)?.reason;

ok("drops the invented free-shipping fact", !titles.includes("Free shipping threshold"), reason("Free shipping threshold"));
ok("  ...as quote-not-in-transcript", reason("Free shipping threshold") === "quote-not-in-transcript", reason("Free shipping threshold"));
ok("drops the paraphrased creative direction", !titles.includes("Avoid sporty visuals"));
ok("drops the no-evidence decision", !titles.includes("Team agreed to move to weekly reviews"));
ok("  ...as no-evidence", reason("Team agreed to move to weekly reviews") === "no-evidence");
ok("drops an unknown Brand Brain field", !titles.includes("Likes teal") && reason("Likes teal") === "unknown-field");
ok("keeps the real persona fact", titles.some((t) => t.includes("exhausted woman")));
ok("keeps the real tone fact", titles.some((t) => t.includes("warm and plain spoken")));

const kept = items.find((i) => i.title.includes("Keep one athlete concept"));
const reversed = items.find((i) => i.title.includes("Drop the athlete angle entirely"));
ok("links the reversal to the earlier decision", kept?.supersedes?.[0] === reversed?.id);
ok("  ...keeps BOTH sides rather than deleting one", Boolean(kept) && Boolean(reversed));
ok("  ...says so on the later item", /Reverses an earlier point/.test(kept?.detail || ""));
ok("  ...and on the earlier one", /appears to reverse this/.test(reversed?.detail || ""));
ok("  ...and the later item carries both sides' quotes", (kept?.evidence?.length || 0) >= 2);
ok("  ...and the reversed item is marked supersededBy", reversed?.supersededBy === kept?.id);
ok("does not link two unrelated decisions",
  !items.find((i) => i.title.includes("Retainer price increase"))?.supersedes?.length);

const persona = items.find((i) => i.type === "brand_fact" && i.write?.field === "target_personas");
ok("brand_fact routes to supabase.brand_brain", persona?.write?.target === "supabase.brand_brain");
ok("brand_fact carries the resolved record id", persona?.write?.recordKey?.recordId === "bb-fake-uuid-0001");
ok("action_item falls back to meeting_notes when no Notion tasks DB is configured",
  items.find((i) => i.type === "action_item")?.write?.target === "supabase.meeting_notes");
ok("  ...and routes to Notion once one IS configured",
  reconcile(RAW, { ...ctxResolved, notionTasks: "some-db-id" })
    .items.find((i) => i.type === "action_item")?.write?.target === "notion.tasks");
ok("blocker routes to meeting_notes", items.find((i) => i.type === "blocker")?.write?.target === "supabase.meeting_notes");
ok("evidence carries the resolved speaker role", persona?.evidence?.[0]?.role === "client");

/* --------------------------------------------------------------- unresolved brand */
console.log("\nunresolved brand");
const unresolved = reconcile(RAW, { ...ctxResolved, brand: null, brandRecordId: null });
// Not knowing WHICH client a fact belongs to is a reason not to write it to a client's record.
// It is not a reason to lose it. Everything still gets recorded in our own append-only log.
const bfUnresolved = unresolved.items.filter((i) => i.type === "brand_fact");
ok("brand facts are KEPT when no brand_brain row matches", bfUnresolved.length > 0);
ok("  ...routed to the meeting log, never to a guessed client",
  bfUnresolved.every((i) => i.write.target === "supabase.meeting_notes"));
ok("  ...nothing is dropped for an unresolved brand",
  !unresolved.dropped.some((d) => d.reason === "unresolved-brand"));
ok("  ...and they remember which column they were headed for",
  bfUnresolved.every((i) => typeof i.write.value.intendedField === "string" && i.write.value.intendedField.length));
ok("tasks and notes still survive", unresolved.items.some((i) => i.type === "action_item"));

/* --------------------------------------------------------------- idempotency */
console.log("\nidempotency");
const a = itemId("m1", "brand_fact", "supabase.brand_brain", "brand_tone:Warm and plain spoken.");
const b = itemId("m1", "brand_fact", "supabase.brand_brain", "brand_tone:  warm and PLAIN spoken!  ");
ok("same fact -> same id regardless of case/punctuation/space", a === b, `${a} vs ${b}`);
ok("different meeting -> different id", a !== itemId("m2", "brand_fact", "supabase.brand_brain", "brand_tone:Warm and plain spoken."));
ok("ids are stable across reconcile runs",
  reconcile(RAW, ctxResolved).items.map((i) => i.id).join() === items.map((i) => i.id).join());

/* --------------------------------------------------------------- tiering */
console.log("\ntierOf");
const mk = (over = {}) => ({ title: "t", detail: null, confidence: 0.9, write: { target: "supabase.meeting_notes", op: "append", value: { title: "t" } }, ...over });
const ext = (over = {}) => ({ title: "t", detail: null, confidence: 0.9, write: { target: "notion.tasks", op: "create", value: { title: "t" } }, ...over });
const bb = (prev, conf = 0.9) => ({ title: "tone", detail: null, confidence: conf, write: { target: "supabase.brand_brain", op: "set", field: "brand_tone", value: "warm", previousValue: prev } });

ok("append-only + high confidence -> auto", tierOf(mk()).tier === "auto");
ok("our own log records even at low confidence", tierOf(mk({ confidence: 0.6 })).tier === "auto");
ok("confidence below 0.5 -> blocked", tierOf(mk({ confidence: 0.3 })).tier === "blocked");
ok("price/contract blocks an EXTERNAL write",
  tierOf(ext({ title: "Retainer price increase for Q4 to be handled with the contract" })).tier === "blocked");
ok("compliance wording blocks an EXTERNAL write",
  tierOf(ext({ title: "Every ad must carry the FDA disclaimer" })).tier === "blocked");
ok("  ...but the same fact is still RECORDED in the meeting log",
  tierOf(mk({ title: "Every ad must carry the FDA disclaimer" })).tier === "auto");
ok("AUTO_APPLY=0 still records to our own meeting log",
  tierOf(mk(), { autoApply: false }).tier === "auto");
ok("AUTO_APPLY=0 DOES hold back an external write (Notion)",
  tierOf(mk({ write: { target: "notion.tasks", op: "create", value: { title: "t" } } }), { autoApply: false }).tier === "review");
ok("AUTO_APPLY=0 DOES hold back a Brand Brain write",
  tierOf(bb(null, 0.95), { autoApply: false }).tier === "review");
ok("a sensitive topic is still RECORDED in the log, flagged not blocked", (() => {
  const r = tierOf(mk({ title: "Retainer price increase for Q4 to be handled with the contract" }));
  return r.tier === "auto" && /sensitive topic/.test(r.reason || "");
})());
ok("  ...but a sensitive EXTERNAL write is still blocked",
  tierOf({ title: "Retainer price increase for Q4", detail: null, confidence: 0.9,
    write: { target: "notion.tasks", op: "create", value: { title: "x" } } }).tier === "blocked");

ok("EMPTY Brand Brain field + 0.9 -> auto", tierOf(bb(null)).tier === "auto");
ok("EMPTY Brand Brain field + 0.78 -> review", tierOf(bb(null, 0.78)).tier === "review");
ok("POPULATED Brand Brain field -> review even at 0.99", tierOf(bb("clinical and precise", 0.99)).tier === "review");
ok("  ...with the reason spelled out", /never overwritten automatically/.test(tierOf(bb("clinical", 0.99)).reason || ""));
ok("a superseded item never auto-applies", tierOf(mk({ supersededBy: "abc123" })).tier === "review");

/* --------------------------------------------------------------- fail-safe */
console.log("\nfail-safe: Brand Brain unreadable");
const cs = await buildChangeset(
  { meeting: { ...fixture.meeting, brandRecordId: "bb-fake-uuid-0001" }, transcript: fixture.transcript, summary: { headline: "h", narrative: "n" }, items: reconcile(RAW, ctxResolved).items, dropped, model: "test" },
  { env: { AUTO_APPLY: "1" }, autoApply: true }   // no SUPABASE_SERVICE_KEY -> the read throws
);
ok("a brand_fact never auto-applies when the current value is unknown",
  !cs.items.some((i) => i.write?.target === "supabase.brand_brain" && i.tier === "auto"));
ok("  ...and says why", cs.items.some((i) => /could not read the current Brand Brain value/.test(i.blockedReason || "")));
ok("append-only items still auto-apply", cs.items.some((i) => i.tier === "auto"));
ok("stats add up", cs.stats.total === cs.items.length &&
  cs.stats.byTier.auto + cs.stats.byTier.review + cs.stats.byTier.blocked === cs.items.length);

/* --------------------------------------------------------------- salvage parser */
console.log("\nparseJsonLoose");
ok("strips a markdown fence", parseJsonLoose('```json\n{"items":[]}\n```').items.length === 0);
ok("ignores chatter around the object", parseJsonLoose('Here you go:\n{"items":[{"type":"decision"}]}\nHope that helps').items.length === 1);
ok("survives a brace inside a string", parseJsonLoose('{"summary":{"headline":"use the {brand} token"},"items":[]}').summary.headline.includes("{brand}"));
// Real failure from a real meeting: the model wrote a backslash-apostrophe inside a quoted
// transcript line, which JSON forbids, and a whole 3,173-word call was lost to one character.
// Built with String.raw / explicit char codes so the test source itself cannot lie about what
// bytes are being parsed — an earlier version of these tests was mangled by its own escaping.
const BS = String.fromCharCode(92);   // a single backslash
const QT = String.fromCharCode(34);   // a double quote

ok("repairs the invalid \\' escape the model emitted",
  parseJsonLoose(`{"summary":{"headline":"that${BS}'s the plan"},"items":[]}`).summary.headline === "that's the plan");
ok("repairs a raw newline inside a string",
  parseJsonLoose(`{"summary":{"headline":"line one\nline two"},"items":[]}`).summary.headline.includes("line one"));
ok("repairs an unknown \\x escape",
  parseJsonLoose(`{"summary":{"headline":"a${BS}xb"},"items":[]}`).summary.headline === "axb");
ok("leaves a legitimate escaped quote alone",
  parseJsonLoose(`{"summary":{"headline":"he said ${BS}${QT}no${BS}${QT}"},"items":[]}`).summary.headline === `he said ${QT}no${QT}`);
ok("leaves a legitimate escaped backslash alone",
  JSON.parse(repairJson(`{"a":"C:${BS}${BS}path"}`)).a === `C:${BS}path`);
ok("repair is a no-op on already-valid JSON",
  repairJson('{"a":"b","c":[1,2]}') === '{"a":"b","c":[1,2]}');
ok("salvages complete items from a truncated completion",
  parseJsonLoose('{"summary":{"headline":"x"},"items":[{"type":"decision","title":"one"},{"type":"decision","title":"tw').items.length === 1);

/* --------------------------------------------------------------- contract conformance
 * The schema is additionalProperties:false in both places that matter, so an internal working
 * field left on an item (the `_at` ordering key, the `_subject` grouping hint) would make every
 * changeset invalid — and nothing would notice until the dashboard or n8n choked on it. This
 * checks key sets directly, so it runs with no ajv install. `npm run validate` is the full pass. */
console.log("\ncontract conformance");
const schema = JSON.parse(readFileSync(join(__dirname, "..", "changeset.schema.json"), "utf8"));

const topAllowed = new Set(Object.keys(schema.properties));
const topMissing = schema.required.filter((k) => !(k in cs));
const topExtra = Object.keys(cs).filter((k) => !topAllowed.has(k));
ok("changeset has every required top-level key", topMissing.length === 0, topMissing.join());
ok("changeset has no undeclared top-level keys", topExtra.length === 0, topExtra.join());

const itemSchema = schema.$defs.item;
const itemAllowed = new Set(Object.keys(itemSchema.properties));
const badItems = cs.items.flatMap((it) => [
  ...itemSchema.required.filter((k) => !(k in it)).map((k) => `${it.id} missing ${k}`),
  ...Object.keys(it).filter((k) => !itemAllowed.has(k)).map((k) => `${it.id} has undeclared ${k}`),
]);
ok("every item matches the item contract exactly", badItems.length === 0, badItems.slice(0, 4).join("; "));
ok("no internal working fields leak out", !cs.items.some((i) => "_at" in i || "_subject" in i));

// meeting.source is set by each capture adapter, so a new adapter can silently violate the
// contract — poll-drive.js shipped `source: "meet"` while the enum still predated it, and only
// a real ajv run on real data caught it. Check every enum on the meeting object, not just items.
const srcEnum = schema.properties.meeting.properties.source.enum;
ok("every capture adapter's `source` is declared in the contract",
  ["meet", "extension", "manual", "test"].every((s) => srcEnum.includes(s)),
  `missing: ${["meet", "extension", "manual", "test"].filter((s) => !srcEnum.includes(s)).join()}`);
ok("the changeset's own source is a declared value", srcEnum.includes(cs.meeting.source), cs.meeting.source);

const tiers = new Set(itemSchema.properties.tier.enum);
const types = new Set(itemSchema.properties.type.enum);
ok("every tier is a declared value", cs.items.every((i) => tiers.has(i.tier)));
ok("every type is a declared value", cs.items.every((i) => types.has(i.type)));
ok("every write target is a declared value",
  cs.items.every((i) => !i.write || schema.$defs.item.properties.write.oneOf[1].properties.target.enum.includes(i.write.target)));
const dropReasons = new Set(schema.properties.dropped.items.properties.reason.enum);
ok("every drop reason is a declared value", cs.dropped.every((d) => dropReasons.has(d.reason)),
  cs.dropped.map((d) => d.reason).filter((r) => !dropReasons.has(r)).join());

/* --------------------------------------------------------------- Google Meet doc parsing
 * The capture layer. Verified against the real structure of a "Notes by Gemini" doc exported
 * from Drive — including the quirks that broke the first version: an `## Aligned` heading
 * nested inside the Decisions section, and external guests appearing as a bare email address
 * with no display name. */
console.log("\nMeet notes parsing");
const meetDoc = readFileSync(join(__dirname, "fixtures", "gemini-notes-sample.md"), "utf8");
const parsed = parseMeetDoc(meetDoc);

ok("reads the meeting title", parsed.title === "ARMRA — creative review, batch 3", parsed.title);
ok("reads the duration from the end marker", parsed.transcript.durationSec === 331, String(parsed.transcript.durationSec));
ok("parses utterances into segments", parsed.transcript.segments.length > 15, String(parsed.transcript.segments.length));
ok("attaches the section timestamp to each utterance",
  parsed.transcript.segments.some((s) => s.start === 48) && parsed.transcript.segments.some((s) => s.start === 283));
ok("keeps speaker names", parsed.transcript.segments.every((s) => s.speaker));
ok("drops non-lexical back-channel (\"Mhm\")", !parsed.transcript.segments.some((s) => /^mhm\.?$/i.test(s.text)));
ok("  ...but KEEPS a short confirmation (\"Correct.\")",
  parsed.transcript.segments.some((s) => /^correct\.?$/i.test(s.text)));

ok("agency-domain invitees are internal",
  parsed.participants.filter((p) => p.role === "internal").map((p) => p.name).sort().join() === "Carl Sajol,Eric Mann,Kyle Fenerty");
ok("an outside speaker is treated as client",
  parsed.participants.find((p) => p.name === "Dana")?.role === "client");
ok("no bare email addresses leak into the roster",
  !parsed.participants.some((p) => p.name.includes("@")));

ok("Gemini's decisions survive the nested `## Aligned` heading", parsed.notes.decisions.length === 2, String(parsed.notes.decisions.length));
ok("Gemini's next steps are captured", parsed.notes.nextSteps.length === 2);
ok("  ...with the owner bracket unescaped", /^\[Kyle Fenerty\]/.test(parsed.notes.nextSteps[0]), parsed.notes.nextSteps[0]);

// The reason the notes are a hint and not a source: they contain no quotable text.
const meetHay = parsed.transcript.text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
ok("real transcript lines verify as evidence",
  quoteInTranscript("We want it warm and plain spoken. Never clinical, never hypey.", meetHay));
ok("Gemini's paraphrase does NOT verify as evidence",
  !quoteInTranscript(parsed.notes.decisions[0], meetHay), parsed.notes.decisions[0]);

// Notes-only: nothing is quotable, so no items may be extracted — but the meeting is still
// recorded. The agency's daily "AI: Workflows" standup runs this way (notes on, transcription
// off): ~20 meetings that a hard refusal would have thrown away.
const notesOnlyDoc = "# Notes\n## A meeting\n### Summary\nSome notes only.\n";
let noTranscript = null;
try { parseMeetDoc(notesOnlyDoc); } catch (e) { noTranscript = e.code; }
ok("a notes-only doc is refused by default", noTranscript === "NO_TRANSCRIPT", String(noTranscript));
const allowed = parseMeetDoc(notesOnlyDoc, { allowNotesOnly: true });
ok("  ...but returns recordable notes when asked", allowed.notesOnly === true && allowed.transcript === null);
ok("  ...carrying Gemini's summary", /some notes only/i.test(allowed.notes.summary));

// A real one: someone joined and left, so the transcript heading exists with nothing under it.
// This used to throw and HALT the entire poll, leaving later meetings unprocessed.
const emptyDoc = "# Notes\n## Standup\n### Summary\nNothing much.\n"
  + "# **Transcript**\n## **Standup - Transcript**\n### **Transcription ended after 00:00:08**\n";
let emptyCode = null;
try { parseMeetDoc(emptyDoc); } catch (e) { emptyCode = e.code; }
ok("an empty transcript is flagged, not treated as a parse failure", emptyCode === "EMPTY_TRANSCRIPT");
const emptyOk = parseMeetDoc(emptyDoc, { allowNotesOnly: true });
ok("  ...and is recordable rather than fatal", emptyOk.notesOnly === true && emptyOk.emptyTranscript === true);
ok("  ...noting how long the meeting actually lasted", emptyOk.endedAfter === "00:00:08", String(emptyOk.endedAfter));

/* --------------------------------------------------------------- teammate connect flow
 * Coverage = the set of connected accounts, so this flow IS the "shared tool" property. The
 * handlers live in server.js (which cannot be imported here — it listens on import), so the
 * pure pieces live in google-auth.js and are tested directly. */
console.log("\nconnect flow");
const { webAuthUrl, parseIdTokenEmail, saveRefreshToken, readTokens } = await import("./sources/google-auth.js");
const { tmpdir } = await import("node:os");

const authUrl = new URL(webAuthUrl({ clientId: "cid-1", redirectUri: "https://x.example/oauth/callback", state: "nonce-9", domain: "creativeadbundance.com" }));
ok("consent URL asks for offline access (no refresh token without it)", authUrl.searchParams.get("access_type") === "offline");
ok("  ...and forces consent so a re-connect still yields one", authUrl.searchParams.get("prompt") === "consent");
ok("  ...and is read-only Drive", /drive\.readonly/.test(authUrl.searchParams.get("scope") || ""));
ok("  ...pre-selecting the Workspace domain", authUrl.searchParams.get("hd") === "creativeadbundance.com");
ok("  ...carrying the state nonce that ties callback to a token-checked visit", authUrl.searchParams.get("state") === "nonce-9");

const fakeJwt = ["e30", Buffer.from(JSON.stringify({ email: "kyle@creativeadbundance.com", hd: "creativeadbundance.com" })).toString("base64url"), "sig"].join(".");
ok("id_token email decodes", parseIdTokenEmail(fakeJwt).email === "kyle@creativeadbundance.com");

const tmpStore = join(tmpdir(), `mt-test-tokens-${Date.now()}.json`);
const env = { GOOGLE_TOKENS_FILE: tmpStore };
saveRefreshToken("eric@creativeadbundance.com", "rt-eric", env);
const roster = saveRefreshToken("kyle@creativeadbundance.com", "rt-kyle", env);
ok("connecting appends rather than replaces", roster.length === 2 && roster.includes("eric@creativeadbundance.com"));
ok("  ...and both consent paths read the same store", readTokens(env)["kyle@creativeadbundance.com"].refresh_token === "rt-kyle");
try { (await import("node:fs")).rmSync(tmpStore, { force: true }); } catch {}

/* --------------------------------------------------------------- doc comments lane
 * Per the 2026-08-12 "AI: Workflows" decision: capture client comments on Ad Concept decks and
 * Script docs. Everything here is pure — the shapes below are copied from real API responses
 * probed before building ("Huckleberry: Ad Concepts", "Brick Scripts Batch 8"). */
console.log("\ndoc comments");
const { matchBrandFromTitle } = await import("./targets/brand-brain.js");
const { normalizeComment } = await import("./sources/doc-comments.js");
const { csvCell, toCsv } = await import("../engine/csv.js");

const IDX = [
  { id: "b1", brand_name: "Huckleberry", client_name: "Huckleberry", aliases: "" },
  { id: "b2", brand_name: "ARMRA", client_name: "ARMRA", aliases: "" },
  { id: "b3", brand_name: "Pattern Brands", client_name: "Pattern Brands", aliases: "|Onsen|GIR|Miracle Made|" },
  { id: "b4", brand_name: "Brick", client_name: "Brick Technology", aliases: "" },
];
const mb = (t) => matchBrandFromTitle(t, IDX)?.brand || null;
ok("'Huckleberry: Ad Concepts' -> Huckleberry", mb("Huckleberry: Ad Concepts") === "Huckleberry");
ok("'ARMRA: Scripts Batch 4, UGC' -> ARMRA", mb("ARMRA: Scripts Batch 4, UGC") === "ARMRA");
ok("'Pattern Brands (GIR & Onsen): Scripts Batch 6 - Ashley' -> Pattern Brands",
  mb("Pattern Brands (GIR & Onsen): Scripts Batch 6 - Ashley") === "Pattern Brands");
ok("alias inside a title resolves ('Onsen hooks doc')", mb("Onsen hooks doc") === "Pattern Brands");
ok("'Brick Scripts Batch 8' -> Brick via token fallback", mb("Brick Scripts Batch 8") === "Brick");
ok("'AI: Workflows' matches no client", mb("AI: Workflows") === null);

const FILE = { id: "f1", name: "Huckleberry: Ad Concepts", mimeType: "application/vnd.google-apps.presentation", webViewLink: "https://docs.google.com/x" };
const RAW_COMMENT = {
  id: "c-9", author: { displayName: "Erich Detert" },
  content: 'We will want to avoid using "Sleep Coach" in the video, captions, etc.',
  quotedFileContent: { value: "Sleep Coach" }, resolved: false,
  createdTime: "2026-08-11T10:00:00Z", modifiedTime: "2026-08-11T10:05:00Z",
  replies: [
    { author: { displayName: "Kyle Fenerty" }, content: "Got it, swapping the term.", createdTime: "2026-08-11T11:00:00Z" },
    { author: { displayName: "Ghost" }, content: "", createdTime: "2026-08-11T11:01:00Z" },   // empty reply = noise
  ],
};
const rowC = normalizeComment(FILE, RAW_COMMENT, { internalHandles: ["Kyle Fenerty", "Carl Sajol"] });
ok("comment author outside INTERNAL_HANDLES is a client", rowC.author_role === "client");
ok("reply author on the list is internal", rowC.replies[0].role === "internal");
ok("empty replies are dropped", rowC.replies.length === 1);
ok("the anchored phrase is kept — the built-in evidence", rowC.anchored_to === "Sleep Coach");
ok("deck -> doc_kind slides", rowC.doc_kind === "slides");
ok("idempotency key is Drive's comment id", rowC.comment_id === "c-9");

/* --------------------------------------------------------------- csv for the master sheet */
console.log("\nmaster sheet csv");
ok("commas and quotes are RFC-4180 escaped", csvCell('say "hi", ok') === '"say ""hi"", ok"');
ok("newlines stay inside one quoted cell", csvCell("a\nb") === '"a\nb"');
// The apostrophe goes on BEFORE quote-wrapping, so a formula with quotes/commas becomes
// "'=IMPORTXML(...)" — what matters is that the cell's decoded value starts with ' not =.
ok("a formula cannot reach the sheet as a formula", (() => {
  const cell = csvCell('=IMPORTXML("http://evil","//x")');
  const decoded = cell.startsWith('"') ? cell.slice(1, -1).replace(/""/g, '"') : cell;
  return decoded.startsWith("'=");
})());
ok("plus/minus/at are guarded too", ["+1", "-2", "@x"].every((v) => csvCell(v).startsWith("'")));
ok("plain text passes through untouched", csvCell("Huckleberry") === "Huckleberry");
const sheet = toCsv(["a", "b"], [{ a: "x,y", b: "=SUM(1)" }]);
ok("toCsv emits CRLF rows with escaped cells", sheet === 'a,b\r\n"x,y",\'=SUM(1)\r\n');

// Structural tripwire for a bug that shipped: the meetings lane exits its no-work paths with
// `continue`, so any lane appended AFTER it in the subject loop silently never runs once the
// backlog is drained. Comments must be called before the first `continue` can fire.
const pollerSrc = readFileSync(join(__dirname, "..", "poll-drive.js"), "utf8");
ok("comments lane sits above the meetings lane's early exits",
  pollerSrc.indexOf("await pollComments") < pollerSrc.indexOf('"  nothing new"') ||
  pollerSrc.indexOf("await pollComments") < pollerSrc.indexOf("nothing new"));

/* --------------------------------------------------------------- dashboard is not broken
 * The dashboard is one HTML file with an inline <script>. Nothing type-checks it, no build step
 * touches it, and a single stray character takes the WHOLE page down silently — the browser
 * throws once and every handler is dead, while the page still renders its initial markup and
 * looks merely empty rather than broken.
 *
 * That is not hypothetical: an edit to a hint string wrote `that client's` inside a
 * single-quoted JS string, the apostrophe closed the string, and the review page was inert for
 * several commits. Grepping for the presence of code could not catch it — only parsing can. */
console.log("\ndashboard script");
const dash = readFileSync(join(__dirname, "..", "dashboard", "index.html"), "utf8");
const block = dash.match(/<script>([\s\S]*?)<\/script>/);
ok("dashboard has an inline script block", Boolean(block));
if (block) {
  let parseErr = null;
  try { new Function(block[1]); } catch (e) { parseErr = e.message; }
  ok("dashboard JavaScript parses", parseErr === null, parseErr || "");
}
// The two handlers that make the token box usable — a regression here looks like "the page is
// broken" to whoever is trying to log in.
ok("token box submits on Enter", /addEventListener\(\s*["']keydown["']/.test(dash));
ok("token box loads on paste", /addEventListener\(\s*["']paste["']/.test(dash));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
