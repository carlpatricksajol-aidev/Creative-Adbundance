/* Brand Brain writer — Supabase `public.brand_brain`.
 *
 * NOT Airtable. The base hit PUBLIC_API_BILLING_LIMIT_EXCEEDED (the monthly API request cap,
 * separate from the 1,000-record cap) and broke every static-ads run at the lookup node, so
 * Brand Brain moved to Postgres. See "Search Brand Brain (Supabase).js" in the workflow-updates
 * folder and fetchBrand() in static-ads-service/pipeline.js — this file matches both on purpose.
 *
 * The only target in the system that can OVERWRITE something a human wrote, so it is the most
 * guarded: an allow-list of columns, a mandatory read of the current value before any write, and
 * previousValue recorded in the ledger so an overwrite can be undone by hand.
 *
 * Writes with the SERVICE key. The n8n node and the ads pipeline read with the anon key because
 * brand_brain has a public-read RLS policy — but read-only. Nothing public may write here.
 */

import { select, update } from "./supabase.js";

/** Columns a meeting is allowed to change, and what each means to the person filling it in.
 *
 *  Deliberately excluded from this list, even though they exist on the table: primary_color_hex,
 *  secondary_color_hex, accent_color_hex, brand_fonts, logo_urls, folder_id, product_ref_folder,
 *  template_mockup_id, products, website, industry, status, aliases. Those are scraped or
 *  structured values that other tooling owns (bulk-logos.js, set-logo.js, the brand scan). A
 *  client musing "I think our blue is a bit flat" must never repaint primary_color_hex. */
export const BRAND_BRAIN_FIELDS = [
  { name: "brand_tone",          desc: "how the brand speaks — voice, register, words it does and does not use" },
  { name: "brand_personality",   desc: "the character behind the voice — who the brand is if it were a person" },
  { name: "key_offer",           desc: "the current offer/promotion being run, in the words the client uses" },
  { name: "target_personas",     desc: "who the ads are aimed at — demographics, situation, what they already believe" },
  { name: "core_pain_points",    desc: "the problems the customer feels, in the customer's own language" },
  { name: "product_benefits",    desc: "what the product actually does for them; outcomes, not features" },
  { name: "brand_guidelines",    desc: "visual and copy rules: layout do's, mandatory elements, how the brand must look" },
  { name: "creative_boundaries", desc: "what must NEVER appear — banned claims, imagery, comparisons" },
  { name: "dos_and_donts",       desc: "explicit do/don't instructions the client has given about creative" },
  { name: "competitors",         desc: "who the client names as competition, and how they want to be positioned against them" },
  { name: "winning_concepts",    desc: "angles, hooks or formats the client says have worked" },
  { name: "losing_patterns",     desc: "angles, hooks or formats the client says have NOT worked" },
  { name: "compliance_notes",    desc: "legally required or forbidden wording, disclaimers, regulated claims" },
  { name: "notes",               desc: "durable context that does not fit another column" },
];

/** Fields where a new statement ADDS to what is there rather than replacing it. Losing a boundary
 *  the client stated three months ago is worse than a slightly long field. */
const APPENDABLE = new Set([
  "brand_guidelines", "creative_boundaries", "core_pain_points", "product_benefits",
  "dos_and_donts", "competitors", "winning_concepts", "losing_patterns", "compliance_notes", "notes",
]);

/** Identical to the n8n "Search Brand Brain" node and pipeline.js `norm()`. Kept
 *  character-for-character so the meeting tool and the ads pipeline can never disagree about
 *  which row a brand name refers to.
 *
 *  Inherited quirk, on purpose: the n8n node's comment claims "InMyArea.com" and "In My Area"
 *  collapse to the same key. They do not — the trailing "com" survives, so you get "inmyareacom"
 *  vs "inmyarea". Only the alias list bridges that today. Fixing it here alone would make the two
 *  tools resolve differently, which is worse than the bug; fix it in both or neither. */
export const norm = (s) =>
  String(s || "").toLowerCase().replace(/\(.*?\)/g, " ").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "");

/**
 * Resolve a spoken/typed brand name to its brand_brain row.
 * Order matters and mirrors the pipeline: canonical brand_name, then client_name, then the
 * pipe-delimited alias list (|Onsen|GIR|Miracle Made|) — a sister brand is a more specific
 * signal than the parent, so callers pass it first.
 */
export async function resolveBrand(term, env = process.env) {
  const t = norm(term);
  if (!t) return null;

  const index = await select("brand_brain", "select=id,brand_name,client_name,aliases&limit=800", env)
    .catch(async () => select("brand_brain", "select=id,brand_name,client_name&limit=800", env)); // aliases column may not exist yet

  if (!Array.isArray(index) || !index.length) return null;

  const hit =
    index.find((r) => norm(r.brand_name) === t) ||
    index.find((r) => norm(r.client_name) === t) ||
    index.find((r) => String(r.aliases || "").split("|").some((a) => a.trim() && norm(a) === t));

  if (!hit) return null;
  return { id: hit.id, brand: hit.brand_name || hit.client_name, matchedOn: norm(hit.brand_name) === t ? "brand_name" : norm(hit.client_name) === t ? "client_name" : "alias" };
}

/** Current values for the brand row — the "old" side of every diff the dashboard shows. */
export async function getBrandRecord(id, env = process.env) {
  const [row] = await select("brand_brain", `select=*&id=eq.${encodeURIComponent(id)}&limit=1`, env);
  if (!row) throw new Error(`no brand_brain row with id ${id}`);
  return { id: row.id, fields: row };
}

/**
 * Apply one brand_fact item.
 * A `set` against a populated field only ever reaches here after a human clicked Apply — tierOf()
 * keeps it out of the auto lane — and even then the additive columns append rather than replace.
 */
export async function applyBrandFact(item, env = process.env) {
  const { field, value, recordKey } = item.write;
  const id = recordKey?.recordId;
  if (!id) throw new Error("brand_fact write has no brand_brain id — the brand was never resolved");
  if (!BRAND_BRAIN_FIELDS.some((f) => f.name === field)) throw new Error(`${field} is not a writable brand_brain column`);

  const current = await getBrandRecord(id, env);
  const previous = current.fields[field] ?? null;

  let next = value;
  if (previous && APPENDABLE.has(field) && !String(previous).includes(String(value).trim())) {
    next = `${previous}\n\n${value}`.trim();
  }

  if (String(previous ?? "").trim() === String(next).trim()) {
    return { skipped: true, reason: "no change", previousValue: previous, recordId: id };
  }

  await update("brand_brain", `id=eq.${encodeURIComponent(id)}`, { [field]: next }, env);

  return {
    recordId: id,
    field,
    previousValue: previous == null ? null : String(previous),
    newValue: next,
    brand: current.fields.brand_name || current.fields.client_name || null,
  };
}
