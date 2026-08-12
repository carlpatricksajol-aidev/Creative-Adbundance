/* Supabase — the store, and the append-only write target.
 *
 * Plain REST over fetch, no SDK: the Figma engine ships with zero runtime dependencies and
 * this keeps `npm ci` on the VPS to express + dotenv.
 *
 * Every call here uses the SERVICE key. That is safe only because this module never runs in a
 * browser — the dashboard talks to server.js, never to Supabase (see the security note at the
 * top of schema.sql). Do not import this file from anything that gets served to a client.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

import { fetchRetry } from "../http.js";

const BUCKET = "meeting-audio";

function cfg(env = process.env) {
  const url = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_KEY;
  if (!url) throw new Error("missing env SUPABASE_URL");
  if (!key) throw new Error("missing env SUPABASE_SERVICE_KEY");
  return { url, key };
}

async function rest(path, init = {}, env) {
  const { url, key } = cfg(env);
  const res = await fetchRetry(`${url}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  }, { label: `supabase ${init.method || "GET"} ${path.split("?")[0]}` });
  const body = await res.text();
  if (!res.ok) {
    const err = new Error(`supabase ${res.status} ${init.method || "GET"} ${path}: ${body.slice(0, 300)}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body ? JSON.parse(body) : null;
}

export const select = (table, query = "", env) => rest(`/${table}?${query}`, {}, env);

export const insert = (table, row, env) =>
  rest(`/${table}`, { method: "POST", headers: { prefer: "return=representation" }, body: JSON.stringify(row) }, env)
    .then((r) => (Array.isArray(r) ? r[0] : r));

/** Insert-or-replace. Needed wherever a retry can revisit the same primary key — meeting_transcripts
 *  is keyed on meeting_id, so re-processing a meeting that failed after transcription would
 *  otherwise collide and lose the transcript. `onConflict` targets a UNIQUE column that is not
 *  the PK (PostgREST merges on the PK unless told otherwise) — doc_comments merges on comment_id. */
export const upsert = (table, row, env, onConflict) =>
  rest(`/${table}${onConflict ? `?on_conflict=${onConflict}` : ""}`, {
    method: "POST",
    headers: { prefer: "return=representation,resolution=merge-duplicates" },
    body: JSON.stringify(row),
  }, env).then((r) => (Array.isArray(r) ? r[0] : r));

export const update = (table, query, patch, env) =>
  rest(`/${table}?${query}`, { method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify(patch) }, env)
    .then((r) => (Array.isArray(r) ? r[0] : r));

/** Insert, but a UNIQUE violation (23505) resolves instead of throwing — that collision is
 *  the idempotency guard doing its job, not a failure. Returns {row, duplicate}. */
export async function insertOnce(table, row, conflictColumn, env) {
  try {
    return { row: await insert(table, row, env), duplicate: false };
  } catch (e) {
    if (e.status === 409 || String(e.body || "").includes("23505")) {
      const key = encodeURIComponent(row[conflictColumn]);
      const [existing] = await select(table, `${conflictColumn}=eq.${key}&limit=1`, env);
      return { row: existing || null, duplicate: true };
    }
    throw e;
  }
}

/* ------------------------------------------------------------------ append-only target
 * Brand resolution lives in ./brand-brain.js, not here — it has to use brand_brain's own
 * brand_name/client_name/aliases matcher so this tool and the ads pipeline can never disagree
 * about which client a spoken name refers to. */

/** creative_direction | decision | blocker | open_question -> meeting_notes.
 *  Append-only and keyed on item_id, so replaying a meeting is a no-op. */
export async function applyNote(item, ctx = {}, env = process.env) {
  const v = item.write?.value || {};

  // A brand_fact that could not be attributed to a brand_brain row still records the column it
  // was headed for and the value it would have written. That is what makes it promotable later:
  // resolve the brand, and everything needed to apply it is already here.
  const detail = [
    v.detail || item.detail || null,
    v.intendedField ? `[unattributed brand fact → ${v.intendedField}] ${v.intendedValue || ""}`.trim() : null,
    v.assignee ? `Owner: ${v.assignee}` : null,
    v.dueDate ? `Due: ${v.dueDate}` : null,
  ].filter(Boolean).join("\n\n") || null;

  const { row, duplicate } = await insertOnce("meeting_notes", {
    meeting_id: ctx.meetingId || null,
    item_id: item.id,
    brand: ctx.brand || null,
    kind: item.type,
    title: v.title || item.title,
    detail,
    evidence: item.evidence || [],
    said_at: ctx.startedAt || null,
  }, "item_id", env);
  return { noteId: row?.id || null, duplicate };
}

/* ------------------------------------------------------------------ audio (private bucket) */

export async function uploadAudio(meetingId, buffer, env = process.env) {
  const { url, key } = cfg(env);
  const path = `${meetingId}/audio.webm`;
  const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "audio/webm", "x-upsert": "true" },
    body: buffer,
  });
  if (!res.ok) throw new Error(`supabase storage ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return path;
}

/** Short-lived signed URL — the bucket is private, so this is the only way to listen back. */
export async function signedAudioUrl(path, seconds = 300, env = process.env) {
  const { url, key } = cfg(env);
  const res = await fetch(`${url}/storage/v1/object/sign/${BUCKET}/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ expiresIn: seconds }),
  });
  if (!res.ok) return null;
  const { signedURL } = await res.json();
  return `${url}/storage/v1${signedURL}`;
}
