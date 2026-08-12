#!/usr/bin/env node
/* Drive poller — the capture layer, now that Meet does the capture for us.
 *
 *   node poll-drive.js            one pass; run it from cron
 *   node poll-drive.js --dry      parse and extract, write nothing anywhere
 *   node poll-drive.js --file <driveFileId>   reprocess one meeting by hand
 *
 * Every Meet on the Workspace writes a "Notes by Gemini" doc to the organiser's Drive, and that
 * doc contains the full verbatim transcript. So there is no audio to capture, no model to run
 * locally, and no consent banner to build — Meet already announces itself. This just watches
 * the folder.
 *
 * Structurally identical to FigmaComments/n8n/poll.js: a cron tick, a cheap listing call, a
 * cursor comparison that skips when nothing changed (so most ticks cost nothing), and the
 * expensive work only on a real change. Two differences worth knowing:
 *   - the cursor is `createdTime` of the newest processed doc, not a content hash — Drive gives
 *     us a monotonic timestamp for free;
 *   - it does not matter if the cursor is wrong. `meetings.external_id` is the Drive file id and
 *     it is UNIQUE, so a replayed file is a no-op rather than a duplicate meeting. The cursor is
 *     a cost optimisation, not the correctness mechanism.
 *
 * Config comes from MeetingTool/.env (see .env.example). Google access is per-person OAuth —
 * run `node auth-google.js` once for each teammate who organises meetings. Everyone in
 * google-tokens.json gets polled; GOOGLE_IMPERSONATE narrows that to a subset if you want it.
 */

import "./env.js";

import { accessToken, subjects } from "./engine/sources/google-auth.js";
import { fetchRetry } from "./engine/http.js";
import { parseMeetDoc } from "./engine/sources/meet-notes.js";
import { listCommentableFiles, listComments, normalizeComment } from "./engine/sources/doc-comments.js";
import { processMeeting } from "./engine/index.js";
import { insert, insertOnce, select, update, upsert } from "./engine/targets/supabase.js";
import { brandIndex, matchBrandFromTitle } from "./engine/targets/brand-brain.js";

const DRY = process.argv.includes("--dry");
// NOT process.argv[indexOf("--file") + 1] — with no --file, indexOf returns -1 and that reads
// argv[0], the node executable path, which then gets sent to Drive as a file id.
const FILE_AT = process.argv.indexOf("--file");
const ONE_FILE = FILE_AT >= 0 ? process.argv[FILE_AT + 1] : null;
const LIMIT_AT = process.argv.indexOf("--limit");
const LIMIT = LIMIT_AT >= 0 ? Number(process.argv[LIMIT_AT + 1]) : Infinity;
const OUT_AT = process.argv.indexOf("--out");
const OUT_DIR = OUT_AT >= 0 ? process.argv[OUT_AT + 1] : null;
const FOLDER_NAME = process.env.MEETING_FOLDER_NAME || "Meet Recordings";
const INTERNAL_DOMAIN = process.env.INTERNAL_DOMAIN || "creativeadbundance.com";

/* ------------------------------------------------------------------ drive */

/** Retries live in engine/http.js so there is ONE place to tune them — the model call and the
 *  Supabase writes hit the same flaky path and need the same treatment. */
async function drive(path, subject, params = {}) {
  const url = new URL(`https://www.googleapis.com/drive/v3/${path}`);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);

  const res = await fetchRetry(
    url,
    { headers: { authorization: `Bearer ${await accessToken(subject)}` } },
    { label: `drive ${path}` }
  );

  if (!res.ok) throw new Error(`drive ${res.status} ${path}: ${(await res.text()).slice(0, 300)}`);
  return res.headers.get("content-type")?.includes("json") ? res.json() : res.text();
}

/** Google Docs export. Markdown keeps the heading structure the parser keys on; plain text
 *  flattens it and loses the `### 00:04:53` time markers, so markdown is not optional. */
const exportDoc = (fileId, subject) => drive(`files/${fileId}/export`, subject, { mimeType: "text/markdown" });

/* ------------------------------------------------------------------ cursor */

async function getCursor(subject) {
  const [row] = await select("meeting_watched_folders", `owner=eq.${encodeURIComponent(subject)}&limit=1`).catch(() => []);
  return row || null;
}

async function setCursor(subject, folderId, iso) {
  const existing = await getCursor(subject);
  if (existing) await update("meeting_watched_folders", `owner=eq.${encodeURIComponent(subject)}`, { folder_id: folderId, last_created_time: iso });
  else await insert("meeting_watched_folders", { owner: subject, folder_id: folderId, last_created_time: iso });
}

/* ------------------------------------------------------------------ notes-only meetings */

/** A meeting where Gemini took notes but nobody turned on transcription.
 *
 * Stored so the meeting exists and is searchable, with Gemini's summary/decisions/next-steps
 * kept verbatim under kind='gemini_notes' — a DIFFERENT kind from every verified item type, so
 * nothing downstream can mistake a paraphrase for something a person actually said. No model
 * call, no changeset, no possibility of reaching a system of record.
 *
 * The fix is a Meet setting, not code: whoever runs the meeting turns on transcription. Until
 * then this is a record of the meeting rather than nothing at all. */
async function recordNotesOnly(file, subject, parsed, seen) {
  const n = parsed.notes || {};
  const body = [
    n.summary ? n.summary : null,
    n.decisions?.length ? "Decisions Gemini recorded:\n" + n.decisions.map((d) => `• ${d}`).join("\n") : null,
    n.nextSteps?.length ? "Next steps Gemini recorded:\n" + n.nextSteps.map((d) => `• ${d}`).join("\n") : null,
  ].filter(Boolean).join("\n\n");

  const why = parsed.emptyTranscript
    ? `nobody spoke${parsed.endedAfter ? ` (meeting lasted ${parsed.endedAfter})` : ""}`
    : "transcription was off";
  console.log(`  notes ${parsed.title || file.name} — ${why}, storing Gemini's notes only`);
  if (DRY) return null;

  const meetingId = seen?.id || crypto.randomUUID();
  if (seen) {
    await update("meetings", `id=eq.${meetingId}`, { status: "ready", error: null });
  } else {
    await insert("meetings", {
      id: meetingId, external_id: file.id, source: "meet", platform: "meet",
      title: parsed.title, brand: null, started_at: file.createdTime,
      participants: parsed.participants, status: "ready", created_by: subject,
    });
  }

  await insertOnce("meeting_notes", {
    meeting_id: meetingId,
    item_id: "notesonly-" + file.id,          // stable, so re-polling is a no-op
    brand: null,
    kind: "gemini_notes",
    title: parsed.title || file.name,
    detail: (parsed.emptyTranscript
        ? `NO SPEECH — the transcript was empty${parsed.endedAfter ? ` (meeting lasted ${parsed.endedAfter})` : ""}. `
        : "UNVERIFIED — transcription was off for this meeting. ")
      + "These are Google Gemini's own notes; none of it could be checked against anything "
      + "actually said, and no items were extracted from it.\n\n" + body,
    evidence: [],
    said_at: file.createdTime,
  }, "item_id").catch((e) => console.error(`  note store failed: ${e.message}`));

  return null;
}

/* ------------------------------------------------------------------ one meeting */

async function ingestDoc(file, subject) {
  // external_id is the Drive file id, and meetings.external_id is UNIQUE — this is what makes a
  // replayed poll, a re-run, or an overlapping cron tick harmless.
  //
  // Skip only on status='ready'. An earlier version skipped whenever a row EXISTED, which meant
  // a meeting that failed mid-extraction could never be retried: the row was inserted before
  // processing, so the next run saw it and moved on forever. A half-finished row is resumed by
  // reusing its id, not by creating a second one.
  const [seen] = await select("meetings", `external_id=eq.${encodeURIComponent(file.id)}&limit=1`).catch(() => []);
  if (seen?.status === "ready" && !DRY) { console.log(`  skip  ${file.name} (already ingested)`); return null; }
  if (seen && !DRY) console.log(`  retry ${file.name} (was left in "${seen.status}")`);

  const md = await exportDoc(file.id, subject);

  const parsed = parseMeetDoc(md, { internalDomain: INTERNAL_DOMAIN, allowNotesOnly: true });

  // Transcription was off. Record the meeting and Gemini's own notes — plainly labelled as an
  // unverified paraphrase — and run no extraction at all. Nothing here can reach brand_brain or
  // Notion, because nothing here can be quoted.
  if (parsed.notesOnly) return recordNotesOnly(file, subject, parsed, seen);

  console.log(`  read  ${parsed.title} · ${parsed.transcript.segments.length} segments · ${parsed.participants.map((p) => `${p.name}/${p.role[0]}`).join(" ")}`);

  // A CANDIDATE brand, not a brand. Titles like "ARMRA — creative review" put the client first,
  // so the leading segment is worth trying against brand_brain. But "Carl x Dimple" would also
  // produce a candidate, which is why the engine nulls it when it does not resolve rather than
  // storing it — an unresolved meeting is recorded with no brand, not with a fake one.
  const brandGuess = (parsed.title || "").split(/[—\-–|:]/)[0].trim() || null;
  const meetingId = seen?.id || crypto.randomUUID();

  if (!DRY) {
    if (seen) {
      await update("meetings", `id=eq.${meetingId}`, { status: "extracting", error: null });
    } else {
      await insert("meetings", {
        id: meetingId,
        external_id: file.id,
        source: "meet",
        platform: "meet",
        title: parsed.title,
        brand: null,          // filled in by the engine only if it resolves to a real brand_brain row
        started_at: file.createdTime,
        participants: parsed.participants,
        status: "extracting",
        created_by: subject,
      });
    }
  }

  let changeset;
  try {
    ({ changeset } = await processMeeting(
      {
        meeting: {
          id: meetingId,
          externalId: file.id,
          title: parsed.title,
          source: "meet",
          platform: "meet",
          brand: brandGuess,
          brandRecordId: null,
          meetingType: null,
          startedAt: file.createdTime,
          endedAt: null,
          participants: parsed.participants,
        },
        transcript: parsed.transcript,
        notes: parsed.notes,     // Gemini's own notes, used as a recall hint — never as evidence
      },
      { dry: DRY }
    ));
  } catch (e) {
    // Leave a terminal, self-explaining state. `extracting` forever tells nobody anything, and
    // the retry path above keys on this row not being 'ready'.
    if (!DRY) {
      await update("meetings", `id=eq.${meetingId}`, {
        status: "failed", error: String(e.message || e).slice(0, 500),
      }).catch(() => {});
    }
    throw e;
  }

  const t = changeset.stats.byTier;
  console.log(`  done  ${changeset.stats.total} items — auto ${t.auto}, review ${t.review}, blocked ${t.blocked}, dropped ${changeset.stats.droppedCount}`);

  // `--out <dir>` writes each changeset to disk so a dry run can actually be read, and run
  // through `npm run validate`. Gitignored (*.changeset.json) — these contain meeting content.
  if (OUT_DIR) {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    mkdirSync(OUT_DIR, { recursive: true });
    const slug = (parsed.title || file.id).replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60);
    const path = join(OUT_DIR, `${slug}.changeset.json`);
    writeFileSync(path, JSON.stringify(changeset, null, 2));
    console.log(`  wrote ${path}`);
  }

  return changeset;
}

/* ------------------------------------------------------------------ comments lane
 * Client feedback living as comments on "Brand: Ad Concepts" decks and "Brand: Scripts" docs.
 * No model call anywhere in this lane: the API supplies author, time, verbatim text and the
 * anchored phrase, so rows go straight to doc_comments, idempotent on comment_id. Runs after
 * the meetings lane and never fails the tick — a missing table logs its own fix. */

const COMMENT_LOOKBACK_DAYS = Number(process.env.COMMENTS_LOOKBACK_DAYS || 14);
const INTERNAL_HANDLES = (process.env.INTERNAL_HANDLES || "").split(",").map((s) => s.trim()).filter(Boolean);

async function getSyncCursor(name) {
  const [row] = await select("sync_cursors", `name=eq.${encodeURIComponent(name)}&limit=1`).catch(() => []);
  return row?.value || null;
}

async function pollComments(subject) {
  const cursorName = `doc-comments:${subject}`;
  let since;
  try {
    since = await getSyncCursor(cursorName);
  } catch (e) {
    console.log(`  comments lane off — run the schema update (section 9 in schema.sql): ${e.message.slice(0, 80)}`);
    return;
  }
  // First run looks back a fixed window rather than crawling all history; overlap of 60s on
  // later runs is free because rows upsert on comment_id.
  const sinceISO = since
    ? new Date(Date.parse(since) - 60_000).toISOString()
    : new Date(Date.now() - COMMENT_LOOKBACK_DAYS * 864e5).toISOString();

  const files = await listCommentableFiles(subject, sinceISO);
  if (!files.length) { console.log(`  comments: nothing touched since ${sinceISO.slice(0, 16)}`); return; }

  const index = await brandIndex().catch(() => []);
  let stored = 0, seen = 0, newest = since;

  for (const file of files) {
    let comments;
    try {
      comments = await listComments(subject, file.id, sinceISO);
    } catch (e) {
      console.error(`  comments FAIL ${file.name}: ${e.message}`);
      continue;           // one unreadable file must not stall the rest — cursor just won't pass it
    }
    seen += comments.length;

    const brand = matchBrandFromTitle(file.name, index);
    for (const c of comments) {
      const row = normalizeComment(file, c, { internalHandles: INTERNAL_HANDLES });
      row.brand = brand?.brand || null;
      if (DRY) { console.log(`  [dry] ${row.file_name} · ${row.author}/${row.author_role}: "${row.content.slice(0, 60)}"`); continue; }
      try {
        await upsert("doc_comments", row, undefined, "comment_id");
        stored++;
      } catch (e) {
        console.error(`  comments store FAIL (${row.comment_id}): ${e.message.slice(0, 120)}`);
        return;           // storage is broken — stop without advancing the cursor, retry next tick
      }
      if (!newest || String(row.modified_time) > String(newest)) newest = row.modified_time;
    }
    if (!newest || String(file.modifiedTime) > String(newest)) newest = file.modifiedTime;
  }

  console.log(`  comments: ${files.length} file(s) touched, ${seen} comment(s), ${DRY ? "0 stored (dry)" : stored + " upserted"}`);
  if (!DRY && newest && newest !== since) {
    await upsert("sync_cursors", { name: cursorName, value: newest }).catch((e) => console.error(`  cursor save failed: ${e.message.slice(0, 80)}`));
  }
}

/* ------------------------------------------------------------------ one pass */

async function main() {
  // Everyone we hold a credential for. Meet notes land in the ORGANISER's Drive, so a teammate
  // who books client calls but never ran `node auth-google.js` is invisible to this tool.
  const people = subjects();
  if (!people.length) {
    throw new Error("nobody is authorised yet — run `node auth-google.js` and sign in as each person who organises meetings");
  }

  if (ONE_FILE) {
    const meta = await drive(`files/${ONE_FILE}`, people[0], { fields: "id,name,createdTime" });
    await ingestDoc(meta, people[0]);
    return;
  }

  for (const subject of people) {
    console.log(`[poll] ${subject}`);
    try {
      const cursor = await getCursor(subject);

      let folderId = cursor?.folder_id;
      if (!folderId) {
        const found = await drive("files", subject, {
          q: `name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
          fields: "files(id,name)", pageSize: 5,
        });
        folderId = found.files?.[0]?.id;
        if (!folderId) { console.log(`  no "${FOLDER_NAME}" folder — nothing to watch`); continue; }
      }

      // The cheap call. Most ticks end here having found nothing and spent no model tokens.
      const since = cursor?.last_created_time;
      const listed = await drive("files", subject, {
        q: [`'${folderId}' in parents`, `mimeType = 'application/vnd.google-apps.document'`, `trashed = false`,
            since ? `createdTime > '${since}'` : null].filter(Boolean).join(" and "),
        fields: "files(id,name,createdTime)", orderBy: "createdTime", pageSize: 25,
      });

      // SECOND LANE — meetings someone else organised.
      //
      // Meet writes its notes into the ORGANISER's Drive, so the folder above only ever contains
      // meetings this person booked. The daily "AI: Workflows" standup is organised by joi@ and
      // was invisible for exactly this reason: ~20 meetings, none of them in Carl's folder.
      //
      // Anything shared with an authorised person is fair game. No time filter here on purpose —
      // a doc created last week but shared today would fall the wrong side of the watermark. We
      // list the recent ones and let the cheap `status='ready'` check in ingestDoc skip what is
      // already done, which costs one indexed Supabase lookup and no model tokens.
      const shared = await drive("files", subject, {
        q: ["sharedWithMe = true", `mimeType = 'application/vnd.google-apps.document'`,
            `name contains 'Notes by Gemini'`, "trashed = false"].join(" and "),
        fields: "files(id,name,createdTime)", orderBy: "createdTime desc", pageSize: 60,
      }).catch((e) => { console.error(`  shared-doc lookup failed (continuing with own folder): ${e.message}`); return { files: [] }; });

      const byId = new Map();
      for (const f of [...(listed.files || []), ...(shared.files || [])]) byId.set(f.id, f);
      let files = [...byId.values()].sort((a, b) => String(a.createdTime).localeCompare(String(b.createdTime)));
      if (shared.files?.length) console.log(`  ${listed.files?.length || 0} in own folder, ${shared.files.length} shared by others`);

      // One lookup for everything already finished, instead of one per candidate. The shared lane
      // re-lists the same ~60 docs every tick, so per-file checks would be 60 round trips a tick.
      if (!DRY && files.length) {
        const ids = files.map((f) => `"${f.id}"`).join(",");
        const done = await select("meetings", `external_id=in.(${ids})&status=eq.ready&select=external_id`).catch(() => []);
        const doneIds = new Set(done.map((r) => r.external_id));
        const before = files.length;
        files = files.filter((f) => !doneIds.has(f.id));
        if (before !== files.length) console.log(`  ${before - files.length} already recorded, ${files.length} to do`);
      }
      if (!files.length) { console.log("  nothing new"); continue; }
      console.log(`  ${files.length} new doc(s)`);

      let newest = since;
      let n = 0;
      for (const f of files) {
        // --limit keeps a dry run from grinding through a whole backlog just to show you what
        // the output looks like. Never set in production; the cron wants everything.
        if (++n > LIMIT) { console.log(`  (stopping at --limit ${LIMIT}; ${files.length - LIMIT} more waiting)`); break; }
        // Only ever move the watermark FORWARD. The shared lane has no time filter, so it can
        // legitimately hand us a doc older than the cursor — advancing to that would re-open
        // everything already processed on the next tick.
        try { await ingestDoc(f, subject); if (!newest || String(f.createdTime) > String(newest)) newest = f.createdTime; }
        catch (e) {
          // Stop advancing the cursor at the first genuine failure, so the next tick retries it
          // instead of stepping over it. Same rule as the Figma poller: never move the watermark
          // past something that did not succeed.
          console.error(`  FAIL  ${f.name}: ${e.message}`);
          break;
        }
      }
      if (!DRY && newest && newest !== since) await setCursor(subject, folderId, newest);
    } catch (e) {
      console.error(`[poll] ${subject} failed: ${e.message}`);
    }

    // Comments ride the same tick but their failures stay their own — a broken comments pass
    // must never cost a meeting, and vice versa.
    try { await pollComments(subject); }
    catch (e) { console.error(`[poll] comments for ${subject} failed: ${e.message}`); }
  }
}

main().catch((e) => { console.error(e.stack || e); process.exit(1); });
