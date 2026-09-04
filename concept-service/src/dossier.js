'use strict';
/*
 * The brand snapshot the ad-concept-generator skill reads, assembled from the
 * Knowledge Layer instead of a flat brand_brain row.
 *
 * WHY THIS REPLACES brand.js. The skill's step 1 asks for "product + USPs,
 * personas, voice, real proof points, compliance rules, brand accent colour
 * (hex) + font". brand_brain answered that with 24 free-text fields. The
 * Knowledge Layer answers it with the actual shapes: compliance rules as rows
 * with severity and a safe alternative, colours with a role and a hex,
 * products as products, voice traits with an explicit do and don't. Same
 * knowledge, far less for the model to parse out of prose.
 *
 * It also adds the thing brand_brain never had: THE CLIENT'S OWN MARKETING
 * PLAN. Until now the generator read the Research Agent's market-level library
 * and nothing client-specific beyond the brand row, so two clients in the same
 * category got the same strategic grounding. marketing_plans carries the
 * audience, goals, channel and content strategy the Senior Agent wrote for
 * THIS brand, and it lands in the snapshot ahead of the market research.
 *
 * The one property worth preserving from the old builder, and preserved here:
 * every section that has nothing in it is named at the end under "do not
 * invent". A model told a field is empty behaves very differently from a model
 * that simply never sees it.
 */

const { Client } = require('pg');

const KL_URL = process.env.SUPABASE_KNOWLEDGE_LAYER_URL || '';

/* The marketing_report table lives in the Heartreel project, not the Knowledge
   Layer, so it is read over REST with the credentials this service already
   holds rather than through the pool above. */
const SB_URL = process.env.SUPABASE_URL || '';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';

/* The report's columns are the team's to change, and they DID change, hours
   after this was first wired: the thirteen strategy fields became the report
   document's own sections. So nothing here names a content column any more.
   Identifiers are skipped, a preferred order puts the sections a strategist
   reads first at the top, and any column the team adds next week renders
   automatically instead of silently not existing. */
const REPORT_SKIP = new Set(['id', 'brand', 'brand_brain_id', 'created_at', 'updated_at',
  'report_period', 'report_kind', 'subject_type', 'source', 'findings']);
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

/* The Brand Brain row: the free-text account record every strategist works
   from, and the thing Carl pastes into a Claude Web session alongside the
   marketing report. The relational snapshot replaced it for STRUCTURE, but
   these fields have no relational home and were reaching nobody. Order
   matters less than presence; each is capped so one runaway field cannot
   drown the snapshot. */
const BRAIN_FIELDS = [
  ['key_offer', 'KEY OFFER'],
  ['brand_tone', 'BRAND TONE'],
  ['brand_personality', 'BRAND PERSONALITY'],
  ['target_personas', 'TARGET PERSONAS'],
  ['core_pain_points', 'CORE PAIN POINTS'],
  ['product_benefits', 'PRODUCT BENEFITS'],
  ['creative_brief', 'CREATIVE BRIEF'],
  ['dos_and_donts', 'DOS AND DONTS'],
  ['creative_boundaries', 'CREATIVE BOUNDARIES'],
  ['winning_hooks', 'WINNING HOOKS'],
  ['winning_concepts', 'WINNING CONCEPTS'],
  ['losing_patterns', 'LOSING PATTERNS'],
  ['compliance_notes', 'COMPLIANCE NOTES'],
  ['disclaimer_text', 'REQUIRED DISCLAIMER'],
  ['notes', 'ACCOUNT NOTES'],
];
const BRAIN_FIELD_CAP = 2200;

async function fetchBrandBrain(brandName, clientName) {
  if (!SB_URL || !SB_KEY) return null;
  const headers = { apikey: SB_KEY, authorization: 'Bearer ' + SB_KEY };
  for (const name of [brandName, clientName].filter(Boolean)) {
    const q = `${SB_URL}/rest/v1/brand_brain?select=*`
      + `&or=(client_name.ilike.${encodeURIComponent(String(name))},brand_name.ilike.${encodeURIComponent(String(name))})`
      + `&limit=1`;
    try {
      const res = await fetch(q, { headers, signal: AbortSignal.timeout(12000) });
      if (!res.ok) continue;
      const rows = await res.json();
      if (Array.isArray(rows) && rows.length) return rows[0];
    } catch { /* the snapshot is better without it than not at all */ }
  }
  return null;
}

/* The brand's strategy snapshot, if one has been written. Matched on the brand
   name and then the client name, case-insensitively, because the roster here
   and the report table are maintained separately and their spelling of the
   same brand does not always agree. */
async function fetchMarketingReport(brandName, clientName) {
  if (!SB_URL || !SB_KEY) return null;
  const headers = { apikey: SB_KEY, authorization: 'Bearer ' + SB_KEY };
  for (const name of [brandName, clientName].filter(Boolean)) {
    /* ilike with no wildcards is case-insensitive equality, so a differently
       cased row still matches and a partial name never does. No other filter:
       report_period was a column for less than a day, and filtering on it made
       every fetch 400 the moment the team removed it. */
    const q = `${SB_URL}/rest/v1/marketing_report`
      + `?select=*&brand=ilike.${encodeURIComponent(String(name))}`
      + `&limit=1`;
    try {
      const res = await fetch(q, { headers, signal: AbortSignal.timeout(12000) });
      if (!res.ok) continue;
      const rows = await res.json();
      if (Array.isArray(rows) && rows.length) return rows[0];
    } catch { /* the snapshot is better without it than not at all */ }
  }
  return null;
}

const configured = () => Boolean(KL_URL);

async function withDb(fn) {
  if (!configured()) {
    const e = new Error('the Knowledge Layer is not configured on this server');
    e.status = 503;
    throw e;
  }
  const c = new Client({ connectionString: KL_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 25000 });
  await c.connect();
  try { return await fn(c); } finally { await c.end().catch(() => {}); }
}

/* Same normalisation brand.js used, so a name that resolved before still
   resolves now: accents folded, punctuation dropped, whitespace collapsed. */
const norm = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** The picker. One entry per brand, with its client for disambiguation. */
async function listBrands() {
  return withDb(async (c) => {
    const { rows } = await c.query(
      `select b.name as brand_name, cl.name as client_name, b.slug,
              (s.id is not null) as has_snapshot
         from brands b
         join clients cl on cl.id = b.client_id
         left join brand_snapshots s on s.brand_id = b.id and s.is_current = true
        where b.is_active
        order by b.name asc`
    );
    return rows.map((r) => ({
      brand_name: r.brand_name,
      client_name: r.client_name === r.brand_name ? '' : r.client_name,
      slug: r.slug,
      ready: r.has_snapshot,
    }));
  });
}

/**
 * Find one brand. Brand name first, then client name, then slug — the same
 * order brand.js used, for the same reason: a client and a brand can share a
 * name and the brand is the more specific answer.
 *
 * Returns { record, matched } or throws a 404-ish error naming what was tried.
 */
async function resolve(query) {
  const want = norm(query);
  if (!want) { const e = new Error('no client given'); e.status = 400; throw e; }

  return withDb(async (c) => {
    const { rows: all } = await c.query(
      `select b.id, b.name as brand_name, b.slug, b.website, b.logo_url,
              cl.name as client_name
         from brands b join clients cl on cl.id = b.client_id
        where b.is_active`
    );

    /* Ambiguity is an error, never a guess. A client with several brands
       (Scale has Beyond Collagen and Live Conscious; Pattern Brands has three)
       must not silently resolve to whichever row came back first — that spends
       twenty minutes and real credits generating for the wrong brand. */
    const only = (matches, how) => {
      if (matches.length === 1) return { hit: matches[0], matched: how };
      if (matches.length > 1) {
        const e = new Error(
          `"${query}" is a client with ${matches.length} brands: ${matches.map((m) => m.brand_name).join(', ')}. Name the brand.`
        );
        e.status = 400;
        throw e;
      }
      return null;
    };

    let found = only(all.filter((r) => norm(r.brand_name) === want), 'brand name')
      || only(all.filter((r) => norm(r.client_name) === want), 'client name')
      || only(all.filter((r) => norm(r.slug) === want), 'slug');
    let hit = found && found.hit;
    let matched = found && found.matched;
    /* Last resort, and deliberately last: a substring match is how the old
       folder search went wrong, so it only runs when nothing exact matched AND
       it is unambiguous. */
    if (!hit) {
      const near = all.filter((r) => norm(r.brand_name).includes(want) || want.includes(norm(r.brand_name)));
      if (near.length === 1) { hit = near[0]; matched = 'partial name'; }
      else if (near.length > 1) {
        const e = new Error(`"${query}" matches ${near.length} brands: ${near.map((n) => n.brand_name).join(', ')}. Use the exact name.`);
        e.status = 400; throw e;
      }
    }
    if (!hit) {
      const e = new Error(`no brand called "${query}" in the Knowledge Layer`);
      e.status = 404; throw e;
    }

    const record = await loadRecord(c, hit);
    return { record, matched };
  });
}

async function loadRecord(c, brand) {
  const one = async (sql, p) => (await c.query(sql, p)).rows;

  const [snap] = await one(
    'select * from brand_snapshots where brand_id = $1 and is_current = true limit 1',
    [brand.id]
  );

  /* Sequential, not Promise.all: these all share one pg Client, and firing
     them together makes pg serialise them anyway while warning that it will
     stop doing so in v9. Five small indexed reads cost nothing in series. */
  const products = await one('select name, description from products where brand_id=$1 and is_active order by name', [brand.id]);
  const colors = snap ? await one('select token_name, role, hex, usage from brand_colors where brand_snapshot_id=$1 order by role', [snap.id]) : [];
  const fonts = snap ? await one('select role, family, weights, fallback_stack from brand_fonts where brand_snapshot_id=$1 order by role', [snap.id]) : [];
  const voice = snap ? await one('select trait, definition, do_text, dont_text from brand_voice_traits where brand_snapshot_id=$1', [snap.id]) : [];
  const rules = snap ? await one('select rule, claim_domain, severity, safe_alternative, required_disclaimer from compliance_rules where brand_snapshot_id=$1 order by severity nulls last', [snap.id]) : [];

  /* The client's own plan, when the Senior Agent has written one. Brand-level
     first (the onboarding case); a batch-level plan wins when one exists,
     because it is the more specific instruction. */
  const [plan] = await one(
    `select * from marketing_plans
      where (brand_id = $1 or batch_id in (select id from batches where brand_id = $1))
        and is_current
      order by (batch_id is not null) desc, version desc
      limit 1`,
    [brand.id]
  );

  const personas = plan
    ? await one('select name, profile, priority from personas where marketing_plan_id=$1 order by priority', [plan.id])
    : [];
  const findings = plan
    ? await one('select source, finding_type, content from research_findings where marketing_plan_id=$1', [plan.id])
    : [];

  /* The strategy snapshot and the Brand Brain row. Fetched here so every
     caller of resolve() gets them without knowing where they live. In
     parallel: they come from the same project and neither depends on the
     other. */
  const [report, brain] = await Promise.all([
    fetchMarketingReport(brand.brand_name, brand.client_name),
    fetchBrandBrain(brand.brand_name, brand.client_name),
  ]);

  return { brand, snap: snap || null, colors, fonts, voice, rules, products,
    plan: plan || null, personas, findings, report, brain };
}

/* ---- rendering ----------------------------------------------------------- */

const has = (v) => {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  return String(v).trim().length > 0;
};
const list = (a) => (a || []).map((x) => `- ${x}`).join('\n');
/* jsonb columns hold whatever shape the report gave them, so render generically
   rather than assuming keys that may not be there. */
const kv = (o) => Object.entries(o || {})
  .filter(([, v]) => has(v))
  .map(([k, v]) => `- **${k.replace(/_/g, ' ')}:** ${typeof v === 'object' ? JSON.stringify(v) : v}`)
  .join('\n');

function toMarkdown(rec) {
  const { brand, snap, colors, fonts, voice, rules, products, plan, personas, findings, report, brain } = rec;
  const out = [];
  const missing = [];
  const S = (title, body) => { if (has(body)) out.push(`### ${title}\n${body}\n`); else missing.push(title.toLowerCase()); };

  out.push(`# Brand snapshot: ${brand.brand_name}`);
  if (brand.client_name && brand.client_name !== brand.brand_name) out.push(`_Client: ${brand.client_name}_`);
  out.push('');

  S('WEBSITE', brand.website);

  /* THE STRATEGY SNAPSHOT COMES FIRST. It is the most considered thing on file
     about this brand, written per brand rather than assembled from fragments,
     so the model reads it before anything else. Everything below it is
     supporting detail. */
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

  /* The account record, as the strategists keep it. This is the half of what
     Carl pastes into a working session that the relational tables never
     carried: the do-not list, the hooks that already converted, the brief. */
  if (brain) {
    out.push('## BRAND BRAIN, the account record');
    for (const [key, title] of BRAIN_FIELDS) {
      const v = brain[key];
      if (v == null || String(v).trim() === '' || String(v) === '[]') continue;
      const text = typeof v === 'object' ? JSON.stringify(v, null, 1) : String(v);
      out.push(`### ${title}\n${text.length > BRAIN_FIELD_CAP ? text.slice(0, BRAIN_FIELD_CAP) + ' ...' : text}\n`);
    }
  } else {
    missing.push('the brand brain record');
  }

  S('CATEGORY', snap && snap.category);
  S('POSITIONING', snap && snap.positioning);
  S('KEY OFFER', snap && snap.value_prop);
  S('PRODUCTS', products.length
    ? products.map((p) => `- **${p.name}**${p.description ? ` — ${p.description}` : ''}`).join('\n')
    : null);
  S('PROOF POINTS', snap && has(snap.proof_points) ? list(snap.proof_points) : null);
  S('TARGET PERSONAS', snap && snap.target_audience);
  S('CORE PAIN POINTS', snap && snap.pain_points);
  S('COMPETITORS', snap && snap.competitive_frame);
  S('MESSAGING PILLARS', snap && has(snap.messaging_pillars) ? list(snap.messaging_pillars) : null);
  S('HOOK TERRITORY', snap && has(snap.creative_hook_territory) ? list(snap.creative_hook_territory) : null);

  S('BRAND TONE', snap && snap.voice_summary);
  S('VOICE TRAITS', voice.length
    ? voice.map((v) => `- **${v.trait}**${v.definition ? ` — ${v.definition}` : ''}` +
        `${v.do_text ? `\n  - do: ${v.do_text}` : ''}${v.dont_text ? `\n  - don't: ${v.dont_text}` : ''}`).join('\n')
    : null);
  S('BRAND GUIDELINES', snap && snap.guidelines);

  S('COLOURS', colors.length
    ? colors.map((c) => `- ${c.role || c.token_name}: ${c.hex || '(no hex on file)'}${c.usage ? ` — ${c.usage}` : ''}`).join('\n')
    : null);
  S('FONTS', fonts.length
    ? fonts.map((f) => `- ${f.role || 'font'}: ${f.family}${f.weights ? ` (${f.weights})` : ''}`).join('\n')
    : null);

  /* Compliance is the one section where being wrong is expensive, so it is
     rendered rule by rule with its severity rather than summarised. */
  S('COMPLIANCE RULES', rules.length
    ? rules.map((r) => `- ${r.rule}` +
        `${r.severity ? ` _[${r.severity}]_` : ''}` +
        `${r.safe_alternative ? `\n  - say instead: ${r.safe_alternative}` : ''}` +
        `${r.required_disclaimer ? `\n  - disclaimer required: ${r.required_disclaimer}` : ''}`).join('\n')
    : null);
  S('CREATIVE BOUNDARIES', snap && has(snap.watch_outs) ? list(snap.watch_outs) : null);

  S('WHAT HAS WORKED', snap && snap.winning_concepts);
  S('WHAT HAS NOT', snap && snap.losing_patterns);
  S('NOTES', snap && snap.notes);

  /* The marketing plan goes last and loudest: it is the most recent, most
     client-specific instruction in the whole snapshot, and it is the piece
     that was missing entirely until now. */
  if (plan) {
    out.push('## THE CLIENT\'S CURRENT MARKETING PLAN\n');
    const P = (t, b) => { if (has(b)) out.push(`### ${t}\n${b}\n`); };
    P('AUDIENCE', kv(plan.audience_summary));
    P('GOALS AND OBJECTIVES', kv(plan.goals));
    P('PLATFORM STRATEGY', kv(plan.platform_strategy));
    P('CONTENT STRATEGY', kv(plan.content_strategy));
    P('COMPETITIVE ANALYSIS', kv(plan.competitive_analysis));
    if (personas.length) {
      out.push('### NAMED PERSONAS\n' + personas.map((p) =>
        `- **${p.name}**${p.profile && Object.keys(p.profile).length ? ` — ${JSON.stringify(p.profile)}` : ''}`).join('\n') + '\n');
    }
    if (findings.length) {
      out.push('### RESEARCH FINDINGS\n' + findings.map((f) =>
        `- [${f.finding_type}] ${typeof f.content === 'object' ? JSON.stringify(f.content) : f.content}` +
        `${f.source ? ` _(${f.source})_` : ''}`).join('\n') + '\n');
    }
  } else {
    missing.push('the marketing plan');
  }

  if (missing.length) {
    out.push(`_Nothing on file for: ${missing.join(', ')}. Do not invent these — ask the client._`);
  }
  return out.join('\n');
}

module.exports = { configured, listBrands, resolve, toMarkdown };
