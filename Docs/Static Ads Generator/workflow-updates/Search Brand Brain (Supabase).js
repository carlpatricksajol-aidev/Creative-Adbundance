// Fetch the brand record from Supabase (replaces the Airtable "Search Brand Brain" node).
//
// WHY: the Airtable base hit PUBLIC_API_BILLING_LIMIT_EXCEEDED (monthly API request cap,
// separate from the 1,000-record cap), which broke every run at this node. Brand Brain now
// lives in Supabase table public.brand_brain.
//
// n8n setup:
//   - Node type: Code, mode = "Run Once for All Items"
//   - KEEP THE NODE NAMED EXACTLY "Search Brand Brain" - downstream nodes reference
//     $('Search Brand Brain'), so renaming it breaks Build KIE AI Prompt and Generate Ad Copy.
//   - Wire it exactly where the Airtable node sat: Decode Reference -> THIS -> (Has Reference? / Search records)
//
// Uses the ANON key on purpose: public.brand_brain has a public-read RLS policy and this key
// is already public in the intake form. No secret needs to live in this node.
//
// LOOKUP: the form's client list has 94 names but they don't match brand_name 1:1 - the form can
// send a parent ("Pattern Brands") or a sister brand ("Onsen", "IL MAKIAGE", "Miracle Made"), and
// spellings vary ("InMyArea.com" vs "In My Area"). So we pull a small index of names+aliases and
// match on a normalised key in JS, rather than a brittle exact-string PostgREST filter.

const SUPABASE_URL = 'https://xakngjsybyytldyqfsmi.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhha25nanN5Ynl5dGxkeXFmc21pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NzAwMjUsImV4cCI6MjA5NDQ0NjAyNX0.Aqm2gv_LUdM4Bo233mNL9AwHmRhwGEEaLGHmNaT-VXk';

const body = $('Webhook1').first().json.body || {};
// A sister brand (e.g. Onsen under Pattern Brands) is the more specific signal, so try it first.
const sister = String(body.sister_brand || '').trim();
const client = String(body.client_name || '').trim();

const EMPTY = {
  client_name: client, brand_name: sister || client, website: '', industry: '', status: '',
  brand_tone: '', brand_personality: '', target_personas: '', core_pain_points: '',
  key_offer: '', products: '', product_benefits: '', brand_guidelines: '',
  creative_boundaries: '', dos_and_donts: '', competitors: '', winning_concepts: '',
  losing_patterns: '', compliance_notes: '', notes: '', primary_color_hex: '',
  secondary_color_hex: '', accent_color_hex: '', brand_fonts: '', default_platforms: '',
  folder_id: '', product_ref_folder: '', template_mockup_id: '', aliases: '',
  logo_urls: [], _brand_found: false, _brand_matched_on: '',
};

if (!client && !sister) return [{ json: EMPTY }];

// "InMyArea.com" / "In My Area" / "in-my-area" all collapse to the same key.
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '');
}

const get = (url) => this.helpers.httpRequest({
  method: 'GET',
  url: url,
  headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
  json: true,
});

let index;
try {
  // Small payload: just the name columns for all brands.
  index = await get(SUPABASE_URL + '/rest/v1/brand_brain?select=id,brand_name,client_name,aliases&limit=500');
} catch (e) {
  // 06_aliases.sql may not have been run yet -> the aliases column won't exist.
  // Fall back to name-only matching rather than failing the whole run.
  try {
    index = await get(SUPABASE_URL + '/rest/v1/brand_brain?select=id,brand_name,client_name&limit=500');
  } catch (e2) {
    return [{ json: Object.assign({}, EMPTY, { _brand_error: String(e2.message || e2) }) }];
  }
}
if (!Array.isArray(index) || index.length === 0) return [{ json: EMPTY }];

function findRow(term) {
  if (!term) return null;
  const t = norm(term);
  if (!t) return null;
  // 1) canonical brand_name
  let hit = index.find(r => norm(r.brand_name) === t);
  if (hit) return { row: hit, how: 'brand_name' };
  // 2) client_name
  hit = index.find(r => norm(r.client_name) === t);
  if (hit) return { row: hit, how: 'client_name' };
  // 3) alias list (stored pipe-delimited: |Onsen|GIR|Miracle Made|)
  hit = index.find(r => String(r.aliases || '').split('|').some(a => a.trim() && norm(a) === t));
  if (hit) return { row: hit, how: 'alias' };
  return null;
}

// sister brand wins over the parent when both are present
const found = findRow(sister) || findRow(client);
if (!found) return [{ json: EMPTY }];

let full;
try {
  const rows = await get(SUPABASE_URL + '/rest/v1/brand_brain?select=*&id=eq.' + encodeURIComponent(found.row.id));
  full = Array.isArray(rows) && rows[0] ? rows[0] : null;
} catch (e) {
  return [{ json: Object.assign({}, EMPTY, { _brand_error: String(e.message || e) }) }];
}
if (!full) return [{ json: EMPTY }];

// Airtable stored logo_urls as an attachment array of { url }. Supabase stores jsonb.
// Normalise so Build KIE AI Prompt's Array.isArray(brain.logo_urls) check still works.
let logos = full.logo_urls;
if (typeof logos === 'string' && logos.trim()) {
  try { logos = JSON.parse(logos); }
  catch (e) { logos = logos.split(/[\s,]+/).filter(Boolean).map(u => ({ url: u })); }
}
if (!Array.isArray(logos)) logos = [];
logos = logos.map(x => (typeof x === 'string' ? { url: x } : x)).filter(x => x && x.url);

return [{
  json: Object.assign({}, EMPTY, full, {
    logo_urls: logos,
    _brand_found: true,
    _brand_matched_on: found.how,
    // keep the operator's chosen client label even when we matched a parent record
    client_name: client || full.client_name,
  }),
}];
