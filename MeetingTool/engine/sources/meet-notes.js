/* Google Meet "Notes by Gemini" doc -> the engine's transcript shape.
 *
 * This is the capture adapter that made the Chrome extension unnecessary. Every Meet on the
 * creativeadbundance.com Workspace already writes one of these to Drive, and it contains BOTH
 * Gemini's structured notes AND the full verbatim transcript with speaker labels:
 *
 *   # 📝 Notes
 *   ## <meeting title>
 *   Invited <a@b.com> [Name](mailto:name@c.com)
 *   ### Summary        ...prose...
 *   ### Decisions      - **Title** detail
 *   ### Next steps     - \[Owner\] Task: detail
 *   ### Details        - **Topic**: prose ([00:01:26](link))
 *   # 📝 Transcript
 *   ### 00:00:00
 *   **Carl Sajol:** Yeah. All good. How are you?
 *   **Khushbu Desai:** What's
 *   ### Transcription ended after 00:20:33
 *
 * WHY WE PARSE THE TRANSCRIPT AND NOT THE NOTES: Gemini's notes are a paraphrase. They carry no
 * verbatim quotes, so every item derived from them would fail the evidence check in reconcile.js
 * and be deleted — correctly. The transcript is the evidence. The notes are passed to the
 * extractor separately as a *hint* (they are a good recall aid and cost nothing), but a quote
 * still has to exist in the transcript for anything to reach your backend.
 *
 * Timestamps are section headings, not per-utterance, so every line in a section carries that
 * section's start. That is precise enough to jump a reviewer to the right minute, which is all
 * `atSec` is for.
 */

/** The one-hash heading that starts the transcript half. Matched on the word, not the emoji —
 *  the emoji survives Drive's export inconsistently and is not worth depending on. */
const TRANSCRIPT_HEAD = /^#\s+[^\n]*Transcript/m;
const TIME_HEAD = /^#{2,4}\s*\**\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*\**\s*$/;
const SPEAKER = /^\*\*(.+?):?\*\*\s*(.*)$/;      // **Carl Sajol:** text
const ENDED = /Transcription ended after/i;

/** Google Meet adds a pseudo-participant when someone shares their screen — literally
 *  "eric mann's Presentation", and sometimes "eric mann's Presentation's Presentation" when a
 *  share is restarted. It has no email, so the domain rule would classify it as an outside
 *  guest and let a screen-share label outrank a real internal speaker in the extractor's
 *  client-outranks-internal rule. Seen on a real meeting the first time this ran. */
const PRESENTATION = /['’]s Presentation(['’]s Presentation)*$/i;
/** Pure back-channel: sounds, not words. Anything with lexical content survives. */
const FILLER = /^(?:(?:mhm+|hmm+|mm+|uh+|um+|ah+|oh+|huh|uh[\s-]?huh|mm[\s-]?hmm)[\s.,!?]*)+$/i;

const clean = (s) => s.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();

const toSec = (hms) => {
  const p = hms.split(":").map(Number);
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
};

/** Attendees: `Invited <kbd172102@gmail.com> [Carl Sajol](mailto:carl@creativeadbundance.com)`.
 *
 *  Two sources, because neither is complete on its own. The invite line has reliable EMAILS but
 *  external guests often appear as a bare address (`kbd172102@gmail.com`) with no display name,
 *  which is useless for matching a transcript speaker. The transcript has reliable DISPLAY NAMES
 *  ("Khushbu Desai") but no addresses. So: roles come from the email domain, names come from the
 *  transcript, and a speaker who is not a known agency person is treated as external.
 *
 *  Getting this right matters downstream — the extractor is told a client's instruction outranks
 *  an internal person's speculation, and that rule is only as good as this list.
 */
export function parseParticipants(notesText, speakers = [], internalDomain = "creativeadbundance.com") {
  const line = (notesText.match(/^Invited\s+(.+)$/m) || [])[1] || "";
  const domain = "@" + internalDomain.toLowerCase();
  const internalNames = new Set();
  const out = new Map();

  for (const m of line.matchAll(/\[([^\]]+)\]\(mailto:([^)]+)\)/g)) {
    const name = m[1].trim();
    const isInternal = m[2].trim().toLowerCase().endsWith(domain);
    if (isInternal) internalNames.add(name.toLowerCase());
    out.set(name.toLowerCase(), { name, role: isInternal ? "internal" : "client" });
  }

  // Everyone who actually spoke. Matched to an invited name where possible; otherwise external —
  // an unrecognised voice on an agency call is a guest, and guessing "internal" would let a
  // stranger's offhand remark outrank the client's.
  for (const s of speakers) {
    const key = s.toLowerCase();
    if (out.has(key)) continue;
    if (PRESENTATION.test(s)) {
      // A screen share, not a person. Inherit the sharer's role so their narration is not
      // mistaken for an outside guest's.
      const owner = s.replace(PRESENTATION, "").trim().toLowerCase();
      out.set(key, { name: s, role: out.get(owner)?.role || (internalNames.has(owner) ? "internal" : "unknown") });
      continue;
    }
    out.set(key, { name: s, role: internalNames.has(key) ? "internal" : "client" });
  }

  // Drop bare-address placeholders once a real speaker name covers the same person.
  const named = [...out.values()].filter((p) => !/^[\w.+-]+@/.test(p.name) && !/^\w+\d{4,}$/.test(p.name));
  return named.length ? named : [...out.values()];
}

/** Gemini's own notes, kept as a recall hint for the extractor — never as evidence. */
export function parseGeminiNotes(notesText) {
  // Sections are `### Name`, but Gemini nests an `## Aligned` heading INSIDE the Decisions
  // section — so stopping at the next `##` would return an empty Decisions block (it did).
  // Terminate only on the next `###` section or the `#` that starts the transcript.
  const section = (name) => {
    const re = new RegExp(`^#{3}\\s*\\**\\s*${name}\\s*\\**\\s*$`, "im");
    const m = notesText.match(re);
    if (!m) return "";
    const rest = notesText.slice(m.index + m[0].length);
    const next = rest.search(/^(?:###\s|#\s)/m);
    return (next < 0 ? rest : rest.slice(0, next)).trim();
  };

  const bullets = (block) =>
    block.split("\n")
      .map((l) => l.trim())
      .filter((l) => /^[-*]\s/.test(l))
      .map((l) => clean(l.replace(/^[-*]\s*/, "").replace(/\\\[/g, "[").replace(/\\\]/g, "]")))
      .filter(Boolean);

  return {
    summary: clean(section("Summary")).slice(0, 2000),
    decisions: bullets(section("Decisions")),
    nextSteps: bullets(section("Next steps")),
  };
}

/** The transcript half -> [{start, end, speaker, text}] in the engine's shape. */
export function parseTranscript(transcriptText) {
  const segments = [];
  let at = 0, speaker = null, buf = [];

  const flush = () => {
    const text = clean(buf.join(" "));
    // Drop only NON-LEXICAL back-channel — "Mhm", "Uh-huh". Deliberately not a length rule:
    // "Correct." is eight characters and is frequently the only evidence that a client confirmed
    // something. Cutting by length would delete the confirmation and keep the noise.
    if (text && !FILLER.test(text)) segments.push({ start: at, end: at, speaker, text });
    buf = [];
  };

  for (const raw of transcriptText.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (ENDED.test(line)) break;

    const t = line.match(TIME_HEAD);
    if (t) { flush(); at = toSec(t[1]); continue; }
    if (/^#{1,4}\s/.test(line)) continue;          // any other heading
    if (/^\*?This editable transcript/i.test(line)) break;

    const s = line.match(SPEAKER);
    if (s) { flush(); speaker = clean(s[1]); buf = s[2] ? [s[2]] : []; continue; }
    if (speaker) buf.push(line);                    // continuation of the current utterance
  }
  flush();

  // Meet interleaves cross-talk, so one person's sentence is often split across three segments
  // by someone saying "Mhm" in the middle. Merging consecutive same-speaker segments inside a
  // section gives the extractor whole sentences to quote — which is what the evidence check
  // then has to match.
  const merged = [];
  for (const seg of segments) {
    const prev = merged[merged.length - 1];
    if (prev && prev.speaker === seg.speaker && prev.start === seg.start) prev.text += " " + seg.text;
    else merged.push({ ...seg });
  }
  return merged;
}

/**
 * @param {string} docText  the whole Gemini notes doc, exported as text/markdown
 * @param {object} opts     { internalDomain }
 * @returns {{title, date, participants, notes, transcript:{text, segments, provider}}}
 */
export function parseMeetDoc(docText, opts = {}) {
  const split = docText.search(TRANSCRIPT_HEAD);
  if (split < 0) {
    // Notes-only doc: "Take notes for me" was on but transcription was not. There is nothing
    // quotable, so NO extracted items can exist — the evidence rule has nothing to check against.
    //
    // But that is a reason not to WRITE to a system of record, not a reason to lose the meeting.
    // (Same correction as unresolved brands.) We return Gemini's own notes, clearly marked as an
    // unverified paraphrase, and the caller records the meeting without running extraction at all.
    // The agency's daily "AI: Workflows" standup is configured this way — ~20 meetings that would
    // otherwise have vanished.
    const notesOnly = {
      notesOnly: true,
      title: (docText.match(/^#{2}\s*\**\s*(.+?)\s*\**\s*$/m) || [])[1]?.trim() || null,
      date: (docText.match(/^\s*(\w{3,9} \d{1,2}, \d{4})\s*$/m) || [])[1] || null,
      participants: parseParticipants(docText, [], opts.internalDomain),
      notes: parseGeminiNotes(docText),
      transcript: null,
    };
    if (opts.allowNotesOnly) return notesOnly;

    const err = new Error("no transcript section in this doc — turn on Meet transcription, not just notes");
    err.code = "NO_TRANSCRIPT";
    err.notesOnly = notesOnly;
    throw err;
  }

  const notesText = docText.slice(0, split);
  const transcriptText = docText.slice(split);

  const title = (notesText.match(/^#{2}\s*\**\s*(.+?)\s*\**\s*$/m) || [])[1]?.trim() || null;
  const date = (notesText.match(/^\s*(\w{3,9} \d{1,2}, \d{4})\s*$/m) || [])[1] || null;

  const segments = parseTranscript(transcriptText);
  const endedAfter = (transcriptText.match(/Transcription ended after\s+(\d{1,2}:\d{2}(?::\d{2})?)/i) || [])[1];

  if (!segments.length) {
    // A transcript heading with nothing under it. Usually someone joined and left — a real case
    // was "Transcription ended after 00:00:08". Nobody spoke, so there is nothing to extract,
    // but that is not an error and must not halt a poll: treat it exactly like a notes-only doc.
    const empty = {
      notesOnly: true,
      emptyTranscript: true,
      endedAfter: endedAfter || null,
      title: (docText.match(/^#{2}\s*\**\s*(.+?)\s*\**\s*$/m) || [])[1]?.trim() || null,
      date: (docText.match(/^\s*(\w{3,9} \d{1,2}, \d{4})\s*$/m) || [])[1] || null,
      participants: parseParticipants(notesText, [], opts.internalDomain),
      notes: parseGeminiNotes(notesText),
      transcript: null,
    };
    if (opts.allowNotesOnly) return empty;

    const err = new Error(`transcript section present but no utterances${endedAfter ? ` — meeting lasted ${endedAfter}` : ""}`);
    err.code = "EMPTY_TRANSCRIPT";
    err.notesOnly = empty;
    throw err;
  }
  const speakers = [...new Set(segments.map((s) => s.speaker).filter(Boolean))];

  const dur = (transcriptText.match(/Transcription ended after\s+(\d{1,2}:\d{2}(?::\d{2})?)/i) || [])[1];

  return {
    title,
    date,
    participants: parseParticipants(notesText, speakers, opts.internalDomain),
    notes: parseGeminiNotes(notesText),
    transcript: {
      text: segments.map((s) => `${s.speaker}: ${s.text}`).join("\n"),
      segments,
      language: "en",
      durationSec: dur ? toSec(dur) : segments[segments.length - 1].start,
      provider: "google-meet-gemini",
    },
  };
}
