/* Extraction — transcript in, raw items out.
 *
 * This is the ONLY place a language model touches the pipeline. It proposes; it never
 * decides. Everything that determines whether something reaches your Brand Brain — evidence
 * checking, tiering, diffing, idempotency — happens in reconcile.js / changeset.js, in
 * plain code. A model asked nicely complies ~95% of the time, and 95% is not good enough
 * to leave unattended against a client's brand record.
 *
 * Env: OPENROUTER_API_KEY, OPENROUTER_MODEL (default anthropic/claude-haiku-4.5)
 */

import { BRAND_BRAIN_FIELDS } from "./targets/brand-brain.js";
import { fetchRetry } from "./http.js";

const OR_URL = "https://openrouter.ai/api/v1/chat/completions";

// A one-hour meeting is ~9k words / ~12k tokens and fits in a single call. Long workshops
// get chunked with overlap so a decision spoken across a chunk boundary is still seen whole.
const CHUNK_WORDS = 9000;
const OVERLAP_WORDS = 400;

const ITEM_TYPES = [
  "brand_fact",
  "creative_direction",
  "decision",
  "action_item",
  "asset_request",
  "blocker",
  "open_question",
];

/** Render segments as `[mm:ss] Speaker (role): text` — the timestamps come back in evidence. */
export function renderTranscript(segments) {
  return segments
    .map((s) => {
      const t = Math.max(0, Math.round(s.start || 0));
      const mm = String(Math.floor(t / 60)).padStart(2, "0");
      const ss = String(t % 60).padStart(2, "0");
      const who = s.speaker ? `${s.speaker}${s.role ? ` (${s.role})` : ""}` : "Unknown";
      return `[${mm}:${ss}] ${who}: ${(s.text || "").trim()}`;
    })
    .filter((l) => l.length > 12)
    .join("\n");
}

function systemPrompt(meeting) {
  const today = (meeting.startedAt || new Date().toISOString()).slice(0, 10);
  const roster = (meeting.participants || [])
    .map((p) => `- ${p.name} (${p.role})`)
    .join("\n") || "- unknown";

  return `You are the notetaker for Creative Ad-Bundance, a paid-social creative agency. You read a
meeting transcript and extract ONLY the things that should change a system of record.

MEETING
  Title: ${meeting.title || "(untitled)"}
  Type: ${meeting.meetingType || "unknown"}
  Brand/client: ${meeting.brand || "UNRESOLVED"}
  Date: ${today}   (resolve every relative date — "next Tuesday", "end of month" — against this date)
  Participants:
${roster}

WHAT COUNTS
  brand_fact         A durable fact about the client that belongs in the Brand Brain: their tone,
                     offer, audience, pains, benefits, guidelines, creative boundaries, compliance
                     wording. Must be a statement about how things ARE, not a one-off request.
  creative_direction Guidance for making creative: what to try, what to avoid, references, hooks,
                     angles, formats. The kind of note a strategist would paste into a brief.
  decision           A choice that was actually made and closed, with who made it.
  action_item        Someone owes someone something. Needs an owner if one was named.
  asset_request      A specific file/footage/logo/access that is needed from someone.
  blocker            Something stopping work that is not a task anyone in the room can do.
  open_question      Raised, unresolved, needs an answer before work proceeds.

WHAT DOES NOT COUNT — do not emit items for these:
  small talk; restating the agenda; someone thinking out loud and then dropping it; anything
  hypothetical ("we could maybe one day..."); pleasantries; scheduling chatter about the call itself.
  When in doubt, leave it out. A missed item costs a follow-up message. An invented item corrupts
  a client's Brand Brain and nobody notices for weeks.

HARD RULES
  1. EVERY item MUST include at least one evidence quote copied VERBATIM from the transcript —
     character for character, no paraphrase, no ellipsis, no cleaning up grammar. Items whose
     quote cannot be found in the transcript are deleted automatically and never reach anyone.
     If you cannot quote it, do not claim it.
  2. If a topic was decided and then REVERSED later in the call, emit ONE item describing the FINAL
     state, quote the later statement, and say in \`detail\` what it reversed. Never emit the
     abandoned version as if it stood.
  3. A client's instruction outranks an internal person's speculation. If an internal person
     proposes something and the client did not agree, that is at most an open_question.
  4. Never invent numbers, prices, dates, names or claims. If a number was spoken unclearly, quote
     it as heard and lower your confidence.
  5. \`confidence\` is your honest estimate that this item is real and correctly stated: 0.9+ = said
     plainly and unambiguously; 0.6-0.8 = clear intent, some wording judgement; below 0.5 = you are
     guessing, and it will be routed to a human.

BRAND BRAIN FIELDS (brand_fact items only — \`field\` MUST be exactly one of these strings):
${BRAND_BRAIN_FIELDS.map((f) => `  ${f.name} — ${f.desc}`).join("\n")}

OUTPUT
  Return ONE JSON object and nothing else. No markdown fence, no commentary before or after.
  {
    "summary": {
      "headline": "one line, under 100 chars, Slack-ready",
      "narrative": "3-6 sentences: what this meeting was for and what changed because of it",
      "topics": ["short", "topic", "labels"]
    },
    "items": [
      {
        "type": "one of: ${ITEM_TYPES.join(" | ")}",
        "title": "one line a busy person can accept or reject at a glance",
        "subject": "2-3 word slug for what this is ABOUT, e.g. 'athlete angle', 'q4 offer'. Items about the same thing must share the exact same subject — it is how a reversal gets linked to what it reversed",
        "detail": "the fuller version, including any reversal; null if the title says it all",
        "field": "brand_brain field name, ONLY for brand_fact; otherwise null",
        "value": "for brand_fact: the exact text to put in that field. for others: null",
        "assignee": "person named as owner, or null",
        "dueDate": "YYYY-MM-DD resolved against the meeting date, or null",
        "confidence": 0.0-1.0,
        "evidence": [{"speaker": "name or null", "atSec": 123, "quote": "verbatim from the transcript"}]
      }
    ]
  }
  Empty meeting is a legitimate answer: {"summary": {...}, "items": []}.`;
}

/** Google Meet already writes its own notes above the transcript in the same doc. They are a
 *  paraphrase with no quotes, so they can never be evidence — but they are a genuinely good
 *  recall aid, because Gemini listened to the audio and we are reading rough ASR. Passed as a
 *  checklist, with the evidence rule restated so nothing here can leak through unquoted. */
function notesHint(notes) {
  if (!notes || (!notes.nextSteps?.length && !notes.decisions?.length && !notes.summary)) return "";
  const list = (xs) => (xs || []).slice(0, 25).map((x) => `  - ${x}`).join("\n");
  return `GOOGLE'S OWN NOTES ON THIS MEETING — a paraphrase, NOT evidence.
Use it only as a checklist of things you might otherwise miss. You still may not emit any item
unless you can quote it verbatim from the transcript below. If Google's notes claim something
that is not actually said in the transcript, leave it out: their notes are wrong often enough
that trusting them unquoted is how a client's Brand Brain gets a fact nobody ever stated.
${notes.summary ? `\nSummary: ${notes.summary}\n` : ""}${notes.decisions?.length ? `\nDecisions it spotted:\n${list(notes.decisions)}\n` : ""}${notes.nextSteps?.length ? `\nNext steps it spotted:\n${list(notes.nextSteps)}\n` : ""}
---

`;
}

/** Repair the two ways a model reliably breaks JSON, both of which are fatal to JSON.parse:
 *
 *   1. INVALID ESCAPES. JSON permits only \" \\ \/ \b \f \n \r \t \uXXXX. Models quoting speech
 *      emit \' constantly ("that\'s a hard line"), and occasionally \x or a lone \. Observed on a
 *      real meeting: "Bad escaped character in JSON at position 9126" killed a 3,173-word call.
 *   2. RAW CONTROL CHARACTERS inside strings — a literal newline or tab pasted from a transcript.
 *
 * Scans with string/escape state rather than regexing, so a legitimate \\ or \" is never touched.
 * Only ever called after a normal parse has already failed. */
export function repairJson(s) {
  let out = "", inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc) {
      out += '"\\/bfnrtu'.includes(c) ? "\\" + c : c;  // keep valid escapes, drop the stray backslash
      esc = false;
      continue;
    }
    if (c === "\\" && inStr) { esc = true; continue; }
    if (c === '"') { inStr = !inStr; out += c; continue; }
    if (inStr && c < " ") {
      out += c === "\n" ? "\\n" : c === "\r" ? "\\r" : c === "\t" ? "\\t" : "";
      continue;
    }
    out += c;
  }
  return out;
}

/** JSON.parse, then repair-and-retry. Returns undefined if it is genuinely unparseable. */
function parseOrRepair(text) {
  try { return JSON.parse(text); } catch (e) {
    try {
      const fixed = JSON.parse(repairJson(text));
      console.error(`[extract] repaired malformed JSON from the model (${e.message})`);
      return fixed;
    } catch { return undefined; }
  }
}

/** Strip fences and salvage a JSON object from a truncated or chatty completion.
 *  Bracket-matched rather than regexed, and string-aware so a "}" inside a quote does not
 *  end the object early — the same failure the static-ads director hit on long outputs. */
export function parseJsonLoose(raw) {
  if (!raw) throw new Error("empty completion");
  let s = String(raw).trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");

  const start = s.indexOf("{");
  if (start < 0) throw new Error("no JSON object in completion: " + s.slice(0, 200));

  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) { end = i + 1; break; }
  }

  if (end > 0) {
    const parsed = parseOrRepair(s.slice(start, end));
    if (parsed !== undefined) return parsed;
    // Fall through to per-item salvage: one unrepairable item should not lose the meeting.
    console.error("[extract] whole-object parse failed even after repair — salvaging item by item");
  }

  // Truncated mid-object: salvage every COMPLETE item and drop the partial tail, rather than
  // losing the whole meeting to one cut-off string.
  const items = [];
  const arrStart = s.indexOf('"items"');
  if (arrStart > 0) {
    const from = s.indexOf("[", arrStart);
    let d = 0, os = -1, iStr = false, e2 = false;
    for (let i = from; i < s.length; i++) {
      const c = s[i];
      if (e2) { e2 = false; continue; }
      if (c === "\\") { e2 = true; continue; }
      if (c === '"') { iStr = !iStr; continue; }
      if (iStr) continue;
      if (c === "{") { if (d++ === 0) os = i; }
      else if (c === "}") {
        if (--d === 0 && os >= 0) {
          const item = parseOrRepair(s.slice(os, i + 1));
          if (item !== undefined) items.push(item);
          os = -1;
        }
      }
    }
  }
  if (!items.length) throw new Error("unparseable completion: " + s.slice(0, 300));
  console.error(`[extract] completion truncated — salvaged ${items.length} complete items`);
  return { summary: { headline: "(truncated extraction)", narrative: "", topics: [] }, items };
}

async function callModel(system, user, { apiKey, model, maxTokens = 8000 }) {
  const res = await fetchRetry(OR_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "x-title": "creative-adbundance-meeting-tool",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0.1, // extraction, not writing — we want the same answer twice
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  }, { label: `openrouter ${model}` });

  if (!res.ok) throw new Error(`openrouter ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const json = await res.json();
  const choice = json.choices?.[0];
  const text = choice?.message?.content;
  if (!text) throw new Error("openrouter returned no content: " + JSON.stringify(json).slice(0, 300));
  if (choice.finish_reason === "length") console.error("[extract] hit max_tokens — output may be truncated");
  return text;
}

function chunkLines(lines, size, overlap) {
  const chunks = [];
  let cur = [], words = 0;
  for (const line of lines) {
    const w = line.split(/\s+/).length;
    if (words + w > size && cur.length) {
      chunks.push(cur);
      cur = cur.slice(-Math.ceil(overlap / 12)); // ~12 words a line, keeps context across the seam
      words = cur.reduce((n, l) => n + l.split(/\s+/).length, 0);
    }
    cur.push(line);
    words += w;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

/**
 * @param {{segments: Array, text: string}} transcript
 * @param {object} meeting  changeset.meeting (title, brand, participants, startedAt, ...)
 * @returns {Promise<{summary: object, items: Array, model: string}>} RAW model output — not yet trusted
 */
export async function extract(transcript, meeting, opts = {}) {
  const apiKey = opts.apiKey || process.env.OPENROUTER_API_KEY;
  const model = opts.model || process.env.OPENROUTER_MODEL || "anthropic/claude-haiku-4.5";
  if (!apiKey) throw new Error("missing env OPENROUTER_API_KEY");

  const rendered = renderTranscript(transcript.segments || []);
  const lines = rendered.split("\n");
  const chunks = chunkLines(lines, CHUNK_WORDS, OVERLAP_WORDS);
  const system = systemPrompt(meeting);
  const hint = notesHint(opts.notes);

  if (chunks.length === 1) {
    const out = parseJsonLoose(await callModel(system, `${hint}TRANSCRIPT\n\n${rendered}`, { apiKey, model }));
    return { summary: out.summary || {}, items: out.items || [], model };
  }

  // Long meeting: one pass per chunk, then a single merge pass over the summaries only.
  console.error(`[extract] ${lines.length} lines -> ${chunks.length} chunks`);
  const parts = [];
  for (let i = 0; i < chunks.length; i++) {
    const body = `${hint}TRANSCRIPT (part ${i + 1} of ${chunks.length})\n\n${chunks[i].join("\n")}`;
    parts.push(parseJsonLoose(await callModel(system, body, { apiKey, model })));
  }

  const items = parts.flatMap((p) => p.items || []); // reconcile.js dedupes across the overlap
  const merged = await callModel(
    "Merge these partial meeting summaries into one. Return ONLY {\"headline\":..,\"narrative\":..,\"topics\":[..]}.",
    JSON.stringify(parts.map((p) => p.summary).filter(Boolean)),
    { apiKey, model, maxTokens: 1000 }
  ).then(parseJsonLoose).catch(() => parts[0]?.summary || {});

  return { summary: merged, items, model };
}
