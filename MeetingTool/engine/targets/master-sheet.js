/* The master sheet — a real Google Sheet the tool creates, fills and keeps filling.
 *
 * From the 2026-08-12 "AI: Workflows" meeting:
 *   "[Carl Sajol] Create Master Sheet: Develop a centralized document to store and populate
 *    client meeting notes."
 *
 * An earlier attempt exposed CSV endpoints and asked someone to paste =IMPORTDATA formulas.
 * That is a data feed, not a document: nobody had created anything, the result was read-only
 * formula output, and you could not add a column, tick a box or leave a comment without the
 * next refresh wiping it. This creates the actual document and appends to it.
 *
 * Design decisions worth keeping:
 *
 *   - APPEND ONLY, never rewrite. Rows the team adds notes/columns to are never clobbered,
 *     because we only ever add beneath what is there. Cursors in `sync_cursors` remember how
 *     far we got; re-running adds nothing twice.
 *   - valueInputOption RAW. Cell text is stored literally, so a client comment containing
 *     "=IMPORTXML(...)" lands as text. The CSV path needed a manual apostrophe guard for this;
 *     here the API does it properly.
 *   - drive.file scope. The tool can only touch files it created — it made this sheet, so it
 *     can write and share it, and it is incapable of reaching anything else in the owner's Drive.
 *   - The sheet is a MIRROR for humans, not the store. Supabase remains the source of truth;
 *     if the sheet is deleted, the tool makes a new one and refills it from scratch.
 */

import { fetchRetry } from "../http.js";
import { accessToken } from "../sources/google-auth.js";
import { select, upsert } from "./supabase.js";

const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";
const DRIVE = "https://www.googleapis.com/drive/v3/files";

const CURSOR_ID = "master-sheet:id";
const CURSOR_NOTES = "master-sheet:notes";
const CURSOR_COMMENTS = "master-sheet:comments";

/* Tab layouts. Column order is the reading order a person wants: when, who for, what, and the
 * proof — so the sheet answers "what did this client say" without scrolling right. */
export const TABS = {
  "Meeting Notes": ["Date", "Client", "Type", "What was said", "Detail", "Exact quote", "Who said it", "Meeting", "Verified"],
  "Client Comments": ["Date", "Client", "File", "Kind", "Who", "Client/Internal", "Comment", "Left on", "Status", "Replies", "Link"],
  "Meetings": ["Date", "Meeting", "Client", "Transcript?", "Items found", "Words"],
};

async function api(url, subject, init = {}, label = "sheets") {
  const res = await fetchRetry(url, {
    ...init,
    headers: { authorization: `Bearer ${await accessToken(subject)}`, "content-type": "application/json", ...(init.headers || {}) },
  }, { label });
  if (!res.ok) throw new Error(`${label} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

const cursor = async (name) => (await select("sync_cursors", `name=eq.${encodeURIComponent(name)}&limit=1`).catch(() => []))[0]?.value || null;
const setCursor = (name, value) => upsert("sync_cursors", { name, value });

/* ------------------------------------------------------------------ the document */

/** Create the sheet once, remember its id, and hand it to the whole team.
 *  If someone deletes it, the next run notices the 404 and builds a fresh one. */
export async function ensureSheet(subject, env = process.env) {
  const existing = await cursor(CURSOR_ID);
  if (existing) {
    try {
      await api(`${SHEETS}/${existing}?fields=spreadsheetId`, subject, {}, "sheets get");
      return { id: existing, created: false };
    } catch (e) {
      if (!/ 40[34] /.test(e.message)) throw e;
      console.error("[sheet] the stored sheet is gone — creating a new one");
    }
  }

  const title = env.MASTER_SHEET_TITLE || "Master: Client Meeting Notes";
  const made = await api(SHEETS, subject, {
    method: "POST",
    body: JSON.stringify({
      properties: { title },
      sheets: Object.keys(TABS).map((name, i) => ({
        properties: { title: name, index: i, gridProperties: { frozenRowCount: 1 } },
      })),
    }),
  }, "sheets create");

  // Header rows, then bold+freeze them so the sheet is usable the moment it opens.
  for (const [tab, headers] of Object.entries(TABS)) {
    await api(`${SHEETS}/${made.spreadsheetId}/values/${encodeURIComponent(tab)}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      subject, { method: "POST", body: JSON.stringify({ values: [headers] }) }, "sheets header");
  }
  await api(`${SHEETS}/${made.spreadsheetId}:batchUpdate`, subject, {
    method: "POST",
    body: JSON.stringify({
      requests: made.sheets.map((s) => ({
        repeatCell: {
          range: { sheetId: s.properties.sheetId, startRowIndex: 0, endRowIndex: 1 },
          cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.94, green: 0.92, blue: 1 } } },
          fields: "userEnteredFormat(textFormat,backgroundColor)",
        },
      })),
    }),
  }, "sheets format").catch((e) => console.error(`[sheet] formatting skipped: ${e.message.slice(0, 80)}`));

  // Anyone on the Workspace domain can open and edit it — it is a team document, not Carl's.
  const domain = env.INTERNAL_DOMAIN || "creativeadbundance.com";
  await api(`${DRIVE}/${made.spreadsheetId}/permissions?sendNotificationEmail=false`, subject, {
    method: "POST", body: JSON.stringify({ role: "writer", type: "domain", domain }),
  }, "drive share").catch((e) => console.error(`[sheet] domain share failed (owner still has it): ${e.message.slice(0, 90)}`));

  await setCursor(CURSOR_ID, made.spreadsheetId);
  // A brand-new sheet must not inherit old watermarks, or it would start out empty forever.
  await setCursor(CURSOR_NOTES, "");
  await setCursor(CURSOR_COMMENTS, "");
  return { id: made.spreadsheetId, created: true };
}

const appendRows = (id, subject, tab, rows) =>
  rows.length
    ? api(`${SHEETS}/${id}/values/${encodeURIComponent(tab)}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        subject, { method: "POST", body: JSON.stringify({ values: rows }) }, `sheets append ${tab}`)
    : Promise.resolve(null);

/* ------------------------------------------------------------------ row mapping (pure) */

export const noteRow = (n, meetingTitle) => [
  String(n.said_at || n.created_at || "").slice(0, 10),
  n.brand || "—",
  String(n.kind || "").replace(/_/g, " "),
  n.title || "",
  (n.detail || "").slice(0, 4000),
  n.evidence?.[0]?.quote || "",
  n.evidence?.[0]?.speaker || "",
  meetingTitle || "",
  // The most important column in the sheet: whether a human can rely on the row.
  n.kind === "gemini_notes" ? "NO — AI summary, not quoted" : "yes — exact quote",
];

export const commentRow = (c) => [
  String(c.created_time || "").slice(0, 10),
  c.brand || "—",
  c.file_name || "",
  c.doc_kind === "slides" ? "ad concept" : "script",
  c.author || "",
  c.author_role || "",
  (c.content || "").slice(0, 4000),
  (c.anchored_to || "").slice(0, 500),
  c.resolved ? "resolved" : "open",
  (c.replies || []).map((r) => `${r.author}: ${r.content}`).join(" | ").slice(0, 2000),
  c.web_link || "",
];

export const meetingRow = (m, itemCount) => [
  String(m.started_at || "").slice(0, 10),
  m.title || "",
  m.brand || "—",
  m.has_transcript ? "yes" : "no — AI summary only",
  itemCount ?? 0,
  m.words ?? 0,
];

/* ------------------------------------------------------------------ the sync */

export async function syncMasterSheet(subject, env = process.env) {
  const { id, created } = await ensureSheet(subject, env);
  if (created) console.log(`[sheet] created https://docs.google.com/spreadsheets/d/${id}`);

  const [sinceNotes, sinceComments] = await Promise.all([cursor(CURSOR_NOTES), cursor(CURSOR_COMMENTS)]);

  // --- meeting notes ---
  const notes = await select("meeting_notes",
    `select=*&order=created_at.asc&limit=2000${sinceNotes ? `&created_at=gt.${encodeURIComponent(sinceNotes)}` : ""}`);
  let addedNotes = 0;
  if (notes.length) {
    const ids = [...new Set(notes.map((n) => n.meeting_id).filter(Boolean))];
    const meetings = ids.length
      ? await select("meetings", `id=in.(${ids.map((i) => `"${i}"`).join(",")})&select=id,title`).catch(() => [])
      : [];
    const titleOf = new Map(meetings.map((m) => [m.id, m.title]));
    await appendRows(id, subject, "Meeting Notes", notes.map((n) => noteRow(n, titleOf.get(n.meeting_id))));
    await setCursor(CURSOR_NOTES, notes[notes.length - 1].created_at);
    addedNotes = notes.length;
  }

  // --- client comments ---
  const comments = await select("doc_comments",
    `select=*&order=synced_at.asc&limit=2000${sinceComments ? `&synced_at=gt.${encodeURIComponent(sinceComments)}` : ""}`).catch(() => []);
  let addedComments = 0;
  if (comments.length) {
    await appendRows(id, subject, "Client Comments", comments.map(commentRow));
    await setCursor(CURSOR_COMMENTS, comments[comments.length - 1].synced_at);
    addedComments = comments.length;
  }

  return { id, url: `https://docs.google.com/spreadsheets/d/${id}`, created, addedNotes, addedComments };
}
