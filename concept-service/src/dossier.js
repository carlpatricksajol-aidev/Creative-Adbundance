'use strict';
/*
 * The brand snapshot the ad-concept-generator skill reads.
 *
 * THE FIVE-TABLE RULE (Carl and Ricardo, 2026-09-10). Every agent in this
 * service reads client information from exactly five Supabase tables in the
 * Heartreel project, and nothing else:
 *
 *   brand_brain                  where all client data lives
 *   marketing_report             the client-specific report, outside data via web search
 *   meeting_summary              all client meeting notes, summarised from the latest data
 *   knowledge_v_concept_approved every approved concept, in table form (knowledge.js)
 *   knowledge_vehicle_bank       approved concepts made generic as vehicles (pipeline.js)
 *
 * This file owns the first three and builds the snapshot from them. Until
 * 2026-09-10 it also read the relational Knowledge Layer in a second Supabase
 * project (brand_snapshots, compliance_rules, products, colours, fonts,
 * marketing_plans, personas, research_findings). Those reads are gone; the
 * record keeps the same shape so nothing downstream breaks, with those
 * fields empty.
 *
 * The one property worth preserving from every earlier builder, preserved
 * here: every section that has nothing in it is named at the end under "do
 * not invent". A model told a field is empty behaves very differently from a
 * model that simply never sees it.
 */

const store = require('./store');

const SB_URL = process.env.SUPABASE_URL || '';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';
const HEADERS = () => ({ apikey: SB_KEY, authorization: 'Bearer ' + SB_KEY });

const configured = () => Boolean(SB_URL && SB_KEY);

const norm = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function rest(path, { timeout = 12000 } = {}) {
  if (!configured()) { const e = new Error('no Supabase URL or key configured on this server'); e.status = 503; throw e; }
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: HEADERS(), signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`supabase ${res.status} on ${path.split('?')[0]}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/* ---- the report ------------------------------------------------------------ */

/* The report's columns are the team's to change, and they DID change, hours
   after this was first wired: the thirteen strategy fields became the report
   document's own sections. So nothing here names a content column any more.
   Identifiers are skipped, a preferred order puts the sections a strategist
   reads first at the top, and any column the team adds next week renders
   automatically instead of silently not existing. */
const REPORT_SKIP = new Set(['id', 'brand', 'brand_brain_id', 'created_at', 'updated_at',
  'report_period', 'report_kind', 'subject_type', 'source', 'findings', 'content_written_at']);
const REPORT_ORDER = ['overview', 'audience', 'audience_core', 'audience_secondary',
  'objectives_and_messaging', 'what_is_working', 'content_strategy', 'channel_strategy',
  'competitive_landscape', 'compliance_guardrails', 'sources_and_open_items'];
/* boundaries render as boundaries, not prose, whatever the column is called */
const REPORT_HARD = new Set(['compliance_guardrails', 'voice_donts']);

const reportTitle = (k) => String(k).replace(/_/g, ' ').toUpperCase();

function reportKeys(row) {
  const keys = Object.keys(row).filter((k) => !REPORT_SKIP.has(k)
    && row[k] != null && String(row[k]).trim() !== '' && String(row[k]) !== '[]');
  return keys.sort((a, b) => {
    const ia = REPORT_ORDER.indexOf(a), ib = REPORT_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}

/* ---- the brand brain ------------------------------------------------------- */

/* The account record every strategist works from. Order matters less than
   presence; each is capped so one runaway field cannot drown the snapshot. */
const BRAIN_FIELDS = [
  ['key_offer', 'KEY OFFER'],
  ['products', 'PRODUCTS'],
  ['brand_tone', 'BRAND TONE'],
  ['brand_personality', 'BRAND PERSONALITY'],
  ['target_personas', 'TARGET PERSONAS'],
  ['core_pain_points', 'CORE PAIN POINTS'],
  ['product_benefits', 'PRODUCT BENEFITS'],
  ['competitors', 'COMPETITORS'],
  ['creative_brief', 'CREATIVE BRIEF'],
  ['brand_guidelines', 'BRAND GUIDELINES'],
  ['dos_and_donts', 'DOS AND DONTS'],
  ['creative_boundaries', 'CREATIVE BOUNDARIES'],
  ['winning_hooks', 'WINNING HOOKS'],
  ['winning_concepts', 'WINNING CONCEPTS'],
  ['winning_ads', 'WINNING ADS'],
  ['losing_patterns', 'LOSING PATTERNS'],
  ['compliance_notes', 'COMPLIANCE NOTES'],
  ['disclaimer_text', 'REQUIRED DISCLAIMER'],
  ['notes', 'ACCOUNT NOTES'],
];
const BRAIN_FIELD_CAP = 2200;

/* The roster: every row of brand_brain, once per call. 90-odd rows, small. */
async function brainRoster() {
  return rest('brand_brain?select=id,brand_name,client_name,aliases,status,website,logo_urls&order=brand_name.asc');
}

async function fetchBrandBrain(id) {
  const rows = await rest(`brand_brain?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

/* ilike with no wildcards is case-insensitive equality, so a differently cased
   row still matches and a partial name never does. */
async function fetchMarketingReport(brandName, clientName) {
  for (const name of [...new Set([brandName, clientName].filter(Boolean))]) {
    try {
      const rows = await rest(`marketing_report?select=*&brand=ilike.${encodeURIComponent(String(name))}&limit=1`);
      if (Array.isArray(rows) && rows.length) return rows[0];
    } catch { /* the snapshot is better without it than not at all */ }
  }
  return null;
}

/* The meeting summary: every client meeting on file, summarised from the
   latest data, with what changed since the one before. Keyed on client_name. */
async function fetchMeetingSummary(brandName, clientName) {
  for (const name of [...new Set([clientName, brandName].filter(Boolean))]) {
    try {
      const rows = await rest(`meeting_summary?select=*&client_name=ilike.${encodeURIComponent(String(name))}&limit=1`);
      if (Array.isArray(rows) && rows.length) return rows[0];
    } catch { /* same */ }
  }
  return null;
}

/* ---- resolving a client name --------------------------------------------- */

async function listBrands() {
  const rows = await brainRoster();
  return rows
    .filter((r) => !r.status || !/inactive|archived|churn|paused|off/i.test(String(r.status)))
    .map((r) => ({
      brand_name: r.brand_name,
      client_name: r.client_name === r.brand_name ? '' : (r.client_name || ''),
      slug: norm(r.brand_name).replace(/\s+/g, '-'),
      ready: true,
    }));
}

/**
 * Find one brand in brand_brain. Brand name first, then client name, then an
 * alias, then an unambiguous partial. Ambiguity is an error, never a guess: a
 * client with several brands must not silently resolve to whichever row came
 * back first, that spends twenty minutes and real credits generating for the
 * wrong brand. Returns { record, matched } or throws a 404-ish error.
 */
async function resolve(query) {
  const want = norm(query);
  if (!want) { const e = new Error('no client given'); e.status = 400; throw e; }
  const all = await brainRoster();
  const aliasesOf = (r) => {
    const a = r.aliases;
    if (Array.isArray(a)) return a;
    if (typeof a === 'string') { try { const j = JSON.parse(a); if (Array.isArray(j)) return j; } catch {} return a.split(/[,;|]/); }
    return [];
  };
  const only = (matches, how) => {
    if (matches.length === 1) return { hit: matches[0], matched: how };
    if (matches.length > 1) {
      const e = new Error(`"${query}" matches ${matches.length} brand_brain rows: ${matches.map((m) => m.brand_name).join(', ')}. Name the brand.`);
      e.status = 400; throw e;
    }
    return null;
  };
  let found = only(all.filter((r) => norm(r.brand_name) === want), 'brand name')
    || only(all.filter((r) => norm(r.client_name) === want), 'client name')
    || only(all.filter((r) => aliasesOf(r).some((a) => norm(a) === want)), 'alias');
  let hit = found && found.hit;
  let matched = found && found.matched;
  if (!hit) {
    const near = all.filter((r) => norm(r.brand_name).includes(want) || want.includes(norm(r.brand_name)));
    if (near.length === 1) { hit = near[0]; matched = 'partial name'; }
    else if (near.length > 1) {
      const e = new Error(`"${query}" matches ${near.length} brands: ${near.map((n) => n.brand_name).join(', ')}. Use the exact name.`);
      e.status = 400; throw e;
    }
  }
  if (!hit) { const e = new Error(`no brand called "${query}" in brand_brain`); e.status = 404; throw e; }

  const brain = await fetchBrandBrain(hit.id);
  const [report, meeting] = await Promise.all([
    fetchMarketingReport(hit.brand_name, hit.client_name),
    fetchMeetingSummary(hit.brand_name, hit.client_name),
  ]);
  const logos = Array.isArray(brain && brain.logo_urls) ? brain.logo_urls
    : (typeof (brain && brain.logo_urls) === 'string' ? String(brain.logo_urls).split(/[\s,]+/).filter(Boolean) : []);
  const brand = {
    id: hit.id,
    brand_name: hit.brand_name,
    client_name: hit.client_name || hit.brand_name,
    website: (brain && brain.website) || hit.website || null,
    logo_url: logos[0] || null,
  };
  /* colours and fonts come from the brain row now; the shape the frame and the
     mockup expect is kept */
  const colors = brain ? [
    brain.primary_color_hex ? { token_name: 'primary', role: 'primary', hex: brain.primary_color_hex } : null,
    brain.secondary_color_hex ? { token_name: 'secondary', role: 'secondary', hex: brain.secondary_color_hex } : null,
    brain.accent_color_hex ? { token_name: 'accent', role: 'accent', hex: brain.accent_color_hex } : null,
  ].filter(Boolean) : [];
  const fonts = brain && brain.brand_fonts
    ? (Array.isArray(brain.brand_fonts) ? brain.brand_fonts : [brain.brand_fonts]).map((f) => (typeof f === 'string' ? { role: 'brand', family: f } : f))
    : [];
  const products = brain && brain.products
    ? (Array.isArray(brain.products) ? brain.products : String(brain.products).split(/\n|;/)).map((p) => (typeof p === 'string' ? { name: p.trim() } : p)).filter((p) => p && p.name)
    : [];
  const record = {
    brand, brain, report, meeting,
    /* the relational fields the record used to carry; empty by design now */
    snap: null, voice: [], rules: [], plan: null, personas: [], findings: [],
    colors, fonts, products,
  };
  return { record, matched };
}

/* The Knowledge Layer rules table is no longer read, so there is nothing to
   dedupe. Kept so callers need not change; returns 0. */
async function dedupeRules() { return 0; }

/* ---- rendering ----------------------------------------------------------- */

const has = (v) => {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  return String(v).trim().length > 0;
};

function toMarkdown(rec) {
  const { brand, report, brain, meeting } = rec;
  const out = [];
  const missing = [];

  out.push(`# Brand snapshot: ${brand.brand_name}`);
  if (brand.client_name && brand.client_name !== brand.brand_name) out.push(`_Client: ${brand.client_name}_`);
  if (has(brand.website)) out.push(`_Website: ${brand.website}_`);
  out.push('');

  /* THE MARKETING REPORT COMES FIRST. It is the most considered thing on file
     about this brand, written per brand rather than assembled from fragments,
     so the model reads it before anything else. */
  if (report) {
    out.push(`## THE MARKETING REPORT, this brand's own`);
    for (const key of reportKeys(report)) {
      const v = report[key];
      const text = typeof v === 'object' ? JSON.stringify(v, null, 1) : String(v);
      out.push(`### ${reportTitle(key)}\n${text}\n`
        + (REPORT_HARD.has(key)
          ? `_These are hard boundaries. A concept that breaks one is rejected, not revised._\n`
          : ''));
    }
  } else {
    missing.push("the brand's marketing report");
  }

  /* THE MEETING SUMMARY. The client's own words, latest first: what they said
     they want, what changed since last time, what is working for them. This is
     the "critical info" the 9/9 review said the writer was not reading. */
  if (meeting && (has(meeting.meeting_summary) || has(meeting.meeting_notes))) {
    const when = meeting.last_meeting_date ? String(meeting.last_meeting_date).slice(0, 10) : null;
    out.push(`## MEETING SUMMARY, the client's own meetings${meeting.meetings_count ? ` (${meeting.meetings_count} on file` : ''}${when ? `${meeting.meetings_count ? ', ' : ' ('}last ${when}` : ''}${meeting.meetings_count || when ? ')' : ''}`);
    out.push('_What the client said, summarised from the latest meeting notes. Where the client said something here that the brand brain below contradicts, the client\'s later word wins; where it contradicts a compliance guardrail in the report above, the guardrail wins._\n');
    if (has(meeting.meeting_summary)) out.push(`### WHERE THINGS STAND\n${String(meeting.meeting_summary).slice(0, 9000)}\n`);
    if (has(meeting.what_changed)) out.push(`### WHAT CHANGED SINCE THE LAST MEETING\n${String(meeting.what_changed).slice(0, 4000)}\n`);
    if (has(meeting.meeting_notes)) out.push(`### MEETINGS ON FILE\n${String(meeting.meeting_notes).slice(0, 1500)}\n`);
  } else {
    missing.push('meeting notes (no meeting_summary row for this client)');
  }

  /* The account record, as the strategists keep it. */
  if (brain) {
    /* Source priority. The marketing report's guardrails outrank the brand
       brain: the brain is onboarding knowledge, the report is the strategy.
       Brain sentences that use a word the client's brief bans for paid
       creative are dropped before the model ever sees them. */
    const brief = store.getBrief(brand.brand_name) || store.getBrief(brand.client_name) || {};
    const banned = (Array.isArray(brief.banned) ? brief.banned : [])
      .map((w) => new RegExp('\\b' + String(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+') + '\\b', 'i'));
    const scrub = (text) => !banned.length ? text
      : text.split(/(?<=[.!?])\s+/).filter((s) => !banned.some((re) => re.test(s))).join(' ');
    /* The two fields that are disclaimer COPY are left out when the report is
       on file: the skill's own slide rule is that disclaimer wording never
       appears in a concept, and those two fields were exactly where the
       strips came from. */
    const webOnly = /AI web research/i.test(String(brain.notes || ''));
    const DISCLAIMER_COPY = new Set(['compliance_notes', 'disclaimer_text']);
    const fields = report ? BRAIN_FIELDS.filter(([key]) => !DISCLAIMER_COPY.has(key)) : BRAIN_FIELDS;
    out.push('## BRAND BRAIN, the account record');
    out.push((report
      ? '_The account record. Where it and the marketing report above disagree, the report and its compliance guardrails win._'
      : '_Onboarding knowledge. No marketing report is on file for this brand, so this is the fullest record available._') +
      (webOnly ? ' _This row was assembled by web research rather than from the client\'s own documents; a specific figure or mechanism that appears only here is a lead to confirm, not a claim to print._' : '') + '\n');
    for (const [key, title] of fields) {
      const v = brain[key];
      if (v == null || String(v).trim() === '' || String(v) === '[]') continue;
      const raw = typeof v === 'object' ? JSON.stringify(v, null, 1) : String(v);
      const text = scrub(raw);
      if (!text.trim()) continue;
      out.push(`### ${title}\n${text.length > BRAIN_FIELD_CAP ? text.slice(0, BRAIN_FIELD_CAP) + ' ...' : text}\n`);
    }
    const visuals = [
      brain.primary_color_hex ? `- primary: ${brain.primary_color_hex}` : null,
      brain.secondary_color_hex ? `- secondary: ${brain.secondary_color_hex}` : null,
      brain.accent_color_hex ? `- accent: ${brain.accent_color_hex}` : null,
      has(brain.brand_fonts) ? `- fonts: ${Array.isArray(brain.brand_fonts) ? brain.brand_fonts.join(', ') : brain.brand_fonts}` : null,
    ].filter(Boolean);
    if (visuals.length) out.push(`### BRAND VISUALS\n${visuals.join('\n')}\n`);
  } else {
    missing.push('the brand brain record');
  }

  if (missing.length) {
    out.push(`_Nothing on file for: ${missing.join(', ')}. Do not invent these; ask the client._`);
  }
  return out.join('\n');
}

module.exports = { configured, listBrands, resolve, toMarkdown, dedupeRules };
