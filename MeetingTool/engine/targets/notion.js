/* Notion tasks writer — action_item and asset_request become rows in the team tasks database.
 *
 * `create` only. This target never edits an existing page, which is exactly why these item
 * types are safe to auto-apply: the worst case is a task nobody needed, which costs one click
 * to archive. Compare Brand Brain, where the worst case is silently losing a client's rule.
 *
 * Property names are configurable because Notion databases get renamed. If a property does not
 * exist on the database the API rejects the whole page, so unknown properties are stripped
 * against the live schema before sending.
 *
 * Env: NOTION_TOKEN, NOTION_TASKS_DB,
 *      NOTION_PROP_TITLE (default "Name"), _OWNER ("Owner"), _DUE ("Due"),
 *      _BRAND ("Brand"), _STATUS ("Status"), _SOURCE ("Source")
 */

const API = "https://api.notion.com/v1";
const VERSION = "2022-06-28";

let schemaCache = null; // { dbId, props: Map<name, type> } — one fetch per process

function cfg(env = process.env) {
  const token = env.NOTION_TOKEN;
  const db = env.NOTION_TASKS_DB;
  if (!token) throw new Error("missing env NOTION_TOKEN");
  if (!db) throw new Error("missing env NOTION_TASKS_DB");
  return {
    token, db,
    title: env.NOTION_PROP_TITLE || "Name",
    owner: env.NOTION_PROP_OWNER || "Owner",
    due: env.NOTION_PROP_DUE || "Due",
    brand: env.NOTION_PROP_BRAND || "Brand",
    status: env.NOTION_PROP_STATUS || "Status",
    source: env.NOTION_PROP_SOURCE || "Source",
  };
}

async function notion(path, init = {}, env) {
  const { token } = cfg(env);
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "notion-version": VERSION,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`notion ${res.status} ${init.method || "GET"} ${path}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

/** Live property types, so we only send properties that exist and in the right shape. */
async function getSchema(env) {
  const { db } = cfg(env);
  if (schemaCache?.dbId === db) return schemaCache;
  const meta = await notion(`/databases/${db}`, {}, env);
  const props = new Map(Object.entries(meta.properties || {}).map(([name, p]) => [name, p.type]));
  schemaCache = { dbId: db, props };
  return schemaCache;
}

/** Build a Notion value of whatever type the database declares for that property. */
function valueFor(type, raw) {
  const text = String(raw ?? "").slice(0, 1900);
  switch (type) {
    case "title": return { title: [{ text: { content: text } }] };
    case "rich_text": return { rich_text: [{ text: { content: text } }] };
    case "select": return text ? { select: { name: text } } : null;
    case "multi_select": return text ? { multi_select: [{ name: text }] } : null;
    case "status": return text ? { status: { name: text } } : null;
    case "date": return /^\d{4}-\d{2}-\d{2}$/.test(text) ? { date: { start: text } } : null;
    case "checkbox": return { checkbox: Boolean(raw) };
    case "url": return text ? { url: text } : null;
    default: return null; // people/relation need ids we do not have — left for the human
  }
}

export async function applyTask(item, ctx = {}, env = process.env) {
  const c = cfg(env);
  const { props } = await getSchema(env);
  const v = item.write?.value || {};

  const wanted = [
    [c.title, v.title || item.title],
    [c.owner, v.assignee || item.assignee],
    [c.due, v.dueDate || item.dueDate],
    [c.brand, ctx.brand],
    [c.status, env.NOTION_DEFAULT_STATUS || "Not started"],
    [c.source, "AI Meeting Tool"],
  ];

  const properties = {};
  for (const [name, raw] of wanted) {
    if (raw == null || raw === "") continue;
    const type = props.get(name);
    if (!type) continue;                       // property renamed or absent — skip, do not fail the write
    const built = valueFor(type, raw);
    if (built) properties[name] = built;
  }
  if (!properties[c.title]) properties[c.title] = { title: [{ text: { content: item.title } }] };

  // Body: the detail plus the verbatim quote that produced the task, so whoever picks it up
  // can see who asked for it without opening the meeting.
  const quote = item.evidence?.[0];
  const children = [
    v.detail && { object: "block", type: "paragraph", paragraph: { rich_text: [{ text: { content: String(v.detail).slice(0, 1900) } }] } },
    quote && {
      object: "block", type: "quote",
      quote: { rich_text: [{ text: { content: `"${quote.quote}" — ${quote.speaker || "unknown"}${ctx.meetingTitle ? `, ${ctx.meetingTitle}` : ""}`.slice(0, 1900) } }] },
    },
  ].filter(Boolean);

  const page = await notion("/pages", {
    method: "POST",
    body: JSON.stringify({ parent: { database_id: c.db }, properties, children }),
  }, env);

  return { pageId: page.id, url: page.url };
}
