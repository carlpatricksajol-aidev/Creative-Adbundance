/* Google Drive comments on Ad Concepts (Slides) and Scripts (Docs) — the second capture source.
 *
 * Decided in the 2026-08-12 "AI: Workflows" meeting: "The tool will also capture client comments
 * and script feedback to ensure previous inputs are applied to new work."
 *
 * Comments are BETTER evidence than meeting extraction, not worse: the Drive API hands us the
 * author, the timestamp, the verbatim text and the exact phrase the comment anchors to
 * (quotedFileContent). Nothing is paraphrased and no model is involved, so nothing here needs
 * the quote-verification step — a comment IS its own quote. Verified against real files before
 * building: "Huckleberry: Ad Concepts" carries a client boundary anchored to the phrase
 * "Sleep Coach"; "Pattern Brands: Ad Concepts" carries 50 comments including client picks.
 *
 * Reads with the same drive.readonly tokens the meeting poller uses — comments.list is covered
 * by that scope, so connecting a teammate covers their decks and docs too, automatically.
 */

import { fetchRetry } from "../http.js";
import { accessToken } from "./google-auth.js";

const FILES_URL = "https://www.googleapis.com/drive/v3/files";

const MIMES = [
  "application/vnd.google-apps.presentation", // Ad Concepts / Onboarding decks
  "application/vnd.google-apps.document",     // Scripts
];

/** Decks and docs touched since the cursor, newest last. Excludes the Gemini meeting notes —
 *  those are the other lane's job. Capped by the caller; Drive orders for us. */
export async function listCommentableFiles(subject, sinceISO, { pageSize = 40 } = {}) {
  const u = new URL(FILES_URL);
  u.searchParams.set("q", [
    `(${MIMES.map((m) => `mimeType = '${m}'`).join(" or ")})`,
    "trashed = false",
    `modifiedTime > '${sinceISO}'`,
    "not name contains 'Notes by Gemini'",
  ].join(" and "));
  u.searchParams.set("fields", "files(id,name,mimeType,modifiedTime,webViewLink)");
  u.searchParams.set("orderBy", "modifiedTime");
  u.searchParams.set("pageSize", String(pageSize));

  const res = await fetchRetry(u, { headers: { authorization: `Bearer ${await accessToken(subject)}` } }, { label: "drive files(comments)" });
  if (!res.ok) throw new Error(`drive files ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).files || [];
}

/** Every comment on one file changed since the cursor, replies included. Deleted ones are
 *  skipped — a retracted comment should not keep feeding the knowledge base. */
export async function listComments(subject, fileId, sinceISO) {
  const out = [];
  let pageToken;
  do {
    const u = new URL(`${FILES_URL}/${fileId}/comments`);
    u.searchParams.set("fields", "nextPageToken,comments(id,author(displayName),content,quotedFileContent(value),resolved,deleted,createdTime,modifiedTime,replies(author(displayName),content,createdTime,deleted))");
    u.searchParams.set("pageSize", "100");
    if (sinceISO) u.searchParams.set("startModifiedTime", sinceISO);
    if (pageToken) u.searchParams.set("pageToken", pageToken);

    const res = await fetchRetry(u, { headers: { authorization: `Bearer ${await accessToken(subject)}` } }, { label: "drive comments" });
    if (!res.ok) throw new Error(`drive comments ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json();
    out.push(...(json.comments || []).filter((c) => !c.deleted));
    pageToken = json.nextPageToken;
  } while (pageToken);
  return out;
}

/** One Drive comment -> one doc_comments row. Pure, so the mapping is testable offline.
 *
 *  Role comes from INTERNAL_HANDLES (csv of display names, same convention as the Figma
 *  digest) because the comments API exposes display names, not emails. Everyone not on the
 *  list is treated as client — on these files an unknown name is a client reviewer, and the
 *  consumers care most about which feedback is the client's word. */
export function normalizeComment(file, c, { internalHandles = [] } = {}) {
  const internal = new Set(internalHandles.map((h) => h.trim().toLowerCase()).filter(Boolean));
  const roleOf = (name) => (name && internal.has(String(name).trim().toLowerCase()) ? "internal" : "client");

  const replies = (c.replies || []).filter((r) => !r.deleted && String(r.content || "").trim());
  return {
    comment_id: c.id,
    file_id: file.id,
    file_name: file.name,
    doc_kind: file.mimeType?.includes("presentation") ? "slides" : "docs",
    web_link: file.webViewLink || null,
    author: c.author?.displayName || null,
    author_role: roleOf(c.author?.displayName),
    content: String(c.content || "").trim(),
    anchored_to: c.quotedFileContent?.value ? String(c.quotedFileContent.value).trim() : null,
    resolved: Boolean(c.resolved),
    replies: replies.map((r) => ({ author: r.author?.displayName || null, role: roleOf(r.author?.displayName), content: String(r.content).trim(), at: r.createdTime || null })),
    created_time: c.createdTime || null,
    modified_time: c.modifiedTime || c.createdTime || null,
  };
}
