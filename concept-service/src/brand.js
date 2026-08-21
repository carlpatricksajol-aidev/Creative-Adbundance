'use strict';
/*
 * The brand snapshot that feeds step 1. Same source and same matching rules as
 * the skill's scripts/brand-snapshot.js, so the button and the command line can
 * never disagree about which row a client name resolves to.
 */

const URL_BASE = process.env.SUPABASE_URL || 'https://xakngjsybyytldyqfsmi.supabase.co';
const KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY;

// The fields the skill's intake actually asks for, plus the two that stand in
// for the performance filter. Order matters: it is the order they get rendered.
const FIELDS = [
  'brand_name', 'client_name', 'website', 'industry',
  'products', 'key_offer', 'product_benefits',
  'core_pain_points', 'target_personas', 'competitors',
  'brand_tone', 'brand_personality', 'brand_guidelines',
  'compliance_notes', 'dos_and_donts', 'creative_boundaries',
  'winning_concepts', 'losing_patterns', 'notes',
  'primary_color_hex', 'secondary_color_hex', 'accent_color_hex', 'brand_fonts',
  'confidence',
];

const norm = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function rest(path) {
  if (!KEY) throw new Error('no Supabase key configured (SUPABASE_ANON_KEY or SUPABASE_SERVICE_KEY)');
  const res = await fetch(URL_BASE + '/rest/v1/' + path, {
    headers: { apikey: KEY, Authorization: 'Bearer ' + KEY },
  });
  if (!res.ok) throw new Error(`supabase ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function listBrands() {
  const rows = await rest('brand_brain?select=brand_name,client_name,aliases&order=brand_name.asc');
  return rows.map((r) => ({
    brand_name: r.brand_name,
    client_name: r.client_name || '',
    aliases: String(r.aliases || '').split('|').map((a) => a.trim()).filter(Boolean),
  }));
}

/*
 * Tiered on purpose: exact brand_name, then client_name, then alias. A flat
 * search reports false ambiguity, because some brand names are also other
 * brands' aliases.
 */
async function resolve(name) {
  const want = norm(name);
  if (!want) throw new Error('no client name given');
  const rows = await rest('brand_brain?select=' + FIELDS.join(',') + ',aliases');

  const byBrand = rows.filter((r) => norm(r.brand_name) === want);
  if (byBrand.length === 1) return { row: byBrand[0], matched: 'brand_name' };
  const byClient = rows.filter((r) => norm(r.client_name) === want);
  if (byClient.length === 1) return { row: byClient[0], matched: 'client_name' };
  const byAlias = rows.filter((r) =>
    String(r.aliases || '').split('|').some((a) => norm(a) === want));
  if (byAlias.length === 1) return { row: byAlias[0], matched: 'alias' };

  const hits = byBrand.length || byClient.length || byAlias.length;
  if (hits > 1) {
    const names = [...byBrand, ...byClient, ...byAlias].map((r) => r.brand_name);
    const e = new Error(`"${name}" is ambiguous: ${[...new Set(names)].join(', ')}`);
    e.code = 'AMBIGUOUS';
    throw e;
  }

  const near = rows
    .map((r) => r.brand_name)
    .filter((b) => norm(b).includes(want) || want.includes(norm(b)))
    .slice(0, 5);
  const e = new Error(`no brand matches "${name}"` + (near.length ? `. Did you mean: ${near.join(', ')}` : ''));
  e.code = 'NOT_FOUND';
  throw e;
}

/* Markdown, because that is what the model reads best and what a human can
   sanity-check in the run log. The empty-field line is deliberate: it is the
   guard that stops a colour or a proof point being invented. */
function toMarkdown(row) {
  const filled = [];
  const empty = [];
  for (const f of FIELDS) {
    const v = (row[f] == null ? '' : String(row[f])).trim();
    if (v) filled.push([f, v]); else empty.push(f);
  }
  let md = `# Brand snapshot: ${row.brand_name}\n\n`;
  for (const [f, v] of filled) {
    md += `### ${f.toUpperCase()}\n${v}\n\n`;
  }
  if (empty.length) {
    md += `_Empty in this record (do not invent, ask the client): ${empty.join(', ')}._\n`;
  }
  return md;
}

module.exports = { listBrands, resolve, toMarkdown, FIELDS };
