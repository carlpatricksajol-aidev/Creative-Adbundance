'use strict';
/*
 * One-time-ish migration: static-ads `brand_brain` -> the relational Knowledge
 * Layer, so the concept generator can read one store instead of three.
 *
 * WHY THIS EXISTS. brand_brain holds 84 rows of deep, hand-curated brand
 * knowledge - named ICPs, tone pillars, exact hex values, compliance rulings,
 * real CPA figures. It is the agency's actual brand memory. The Knowledge
 * Layer is the better SHAPE (clients -> brands -> versioned snapshots, with
 * colours, fonts, voice traits and compliance rules as real rows) but only has
 * 7 brands in it. Switching the generator's reader without moving this content
 * first would take 77 clients from a full dossier to nothing.
 *
 * MERGE RULES, in one line: brand_brain never overwrites anything.
 *
 * The 7 brands already in the Knowledge Layer were built by
 * client-data-extraction from real documents into structured rows. That is
 * better material than brand_brain's free text, so every write here is
 * `coalesce(existing, incoming)` - blanks get filled, nothing gets replaced.
 * Re-running is therefore safe and idempotent.
 *
 * MULTI-BRAND CLIENTS. 12 of the 84 rows have brand_name != client_name
 * (Scale Media/Scale, Delta Children/Bellini, PharmaNutra/SiderAL...). The
 * relational shape handles those properly for the first time: one client row,
 * a brand row per brand. brand_brain could only ever hold them flat.
 *
 * Usage:
 *   node scripts/migrate-brand-brain-to-knowledge-layer.js --dry
 *   node scripts/migrate-brand-brain-to-knowledge-layer.js --commit
 *
 * Needs SUPABASE_URL + SUPABASE_ANON_KEY (to read brand_brain) and
 * SUPABASE_KNOWLEDGE_LAYER_URL (to write). Inside the concept-service
 * container all three are already set.
 */

const { Client } = require('pg');

const SRC_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SRC_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY || '';
const KL_URL = process.env.SUPABASE_KNOWLEDGE_LAYER_URL || '';

const DRY = !process.argv.includes('--commit');

/* Straight across. Anything not listed has a better home as real rows
   (colours, fonts, voice traits, compliance rules) and is left for
   client-data-extraction to fill properly rather than shoved into text. */
const MAP = {
  industry: 'category',
  key_offer: 'value_prop',
  product_benefits: 'proof_points_text',   // handled specially: column is text[]
  core_pain_points: 'pain_points',
  target_personas: 'target_audience',
  competitors: 'competitive_frame',
  brand_tone: 'voice_summary',
  brand_personality: 'positioning',
  brand_guidelines: 'guidelines',
  winning_concepts: 'winning_concepts',
  losing_patterns: 'losing_patterns',
  notes: 'notes',
};

const slugify = (s) =>
  String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'untitled';

const clean = (v) => {
  const s = String(v == null ? '' : v).trim();
  return s ? s : null;
};

/* A handful of client_name values are whole sentences rather than names - one
   is "Scale (Scale.tech) - Beyond Collagen sits under the Live Conscious brand
   and must follow Live Conscious branding guidelines". Slugging that produces
   a 60-character slug that is stable but meaningless, so cut at the first
   sentence-ish boundary and keep the rest, which is genuinely a note. */
function splitClientName(raw) {
  const s = String(raw || '').trim();
  const cut = s.search(/\s+[-–—]\s+|\s+\(/);
  if (cut > 2 && s.length > 40) return { name: s.slice(0, cut).trim(), spill: s.slice(cut).trim() };
  return { name: s, spill: null };
}

async function fetchBrandBrain() {
  const fields = ['brand_name', 'client_name', 'website', 'confidence', ...Object.keys(MAP)].join(',');
  const res = await fetch(`${SRC_URL}/rest/v1/brand_brain?select=${fields}&limit=500`, {
    headers: { apikey: SRC_KEY, authorization: `Bearer ${SRC_KEY}` },
  });
  if (!res.ok) throw new Error(`brand_brain read failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function main() {
  if (!SRC_URL || !SRC_KEY) throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY not set');
  if (!KL_URL) throw new Error('SUPABASE_KNOWLEDGE_LAYER_URL not set');

  const rows = await fetchBrandBrain();
  console.log(`read ${rows.length} rows from brand_brain`);

  const db = new Client({ connectionString: KL_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 60000 });
  await db.connect();

  const before = await db.query(
    'select (select count(*)::int from clients) c, (select count(*)::int from brands) b, (select count(*)::int from brand_snapshots) s'
  );
  console.log(`Knowledge Layer before: ${before.rows[0].c} clients, ${before.rows[0].b} brands, ${before.rows[0].s} snapshots`);
  console.log(DRY ? '\n-- DRY RUN, nothing will be written --\n' : '\n-- COMMITTING --\n');

  const stat = { clients: 0, brands: 0, snapNew: 0, snapFilled: 0, fieldsFilled: 0, skipped: [] };

  if (!DRY) await db.query('BEGIN');
  try {
    for (const r of rows) {
      const { name: clientName, spill } = splitClientName(r.client_name || r.brand_name);
      const brandName = clean(r.brand_name) || clientName;
      if (!clientName) { stat.skipped.push('(no name)'); continue; }

      const clientSlug = slugify(clientName);
      const brandSlug = slugify(brandName);

      if (DRY) {
        const ex = await db.query('select id from brands where slug = $1', [brandSlug]);
        if (!ex.rows.length) stat.brands++;
        continue;
      }

      const { rows: cr } = await db.query(
        `insert into clients (slug, name) values ($1,$2)
         on conflict (slug) do update set name = excluded.name, updated_at = now()
         returning id, (xmax = 0) as inserted`,
        [clientSlug, clientName]
      );
      if (cr[0].inserted) stat.clients++;

      const { rows: br } = await db.query(
        `insert into brands (client_id, slug, name, website)
         values ($1,$2,$3,$4)
         on conflict (slug) do update set
           client_id = excluded.client_id,
           website   = coalesce(brands.website, excluded.website),
           updated_at = now()
         returning id, (xmax = 0) as inserted`,
        [cr[0].id, brandSlug, brandName, clean(r.website)]
      );
      const brandId = br[0].id;
      if (br[0].inserted) stat.brands++;

      // proof_points is text[]; brand_brain's product_benefits is one blob.
      // One element, not an invented split - the author wrote a paragraph.
      const benefits = clean(r.product_benefits);
      const notes = [clean(r.notes), spill ? `From the client_name field: ${spill}` : null]
        .filter(Boolean).join('\n\n') || null;

      const vals = {
        category: clean(r.industry),
        value_prop: clean(r.key_offer),
        pain_points: clean(r.core_pain_points),
        target_audience: clean(r.target_personas),
        competitive_frame: clean(r.competitors),
        voice_summary: clean(r.brand_tone),
        positioning: clean(r.brand_personality),
        guidelines: clean(r.brand_guidelines),
        winning_concepts: clean(r.winning_concepts),
        losing_patterns: clean(r.losing_patterns),
        notes,
      };

      const existing = await db.query(
        'select id from brand_snapshots where brand_id = $1 and version = 1',
        [brandId]
      );
      const isNew = existing.rows.length === 0;

      const { rows: sr } = await db.query(
        `insert into brand_snapshots (
           brand_id, version, is_current, category, positioning, target_audience,
           value_prop, proof_points, competitive_frame, voice_summary,
           pain_points, guidelines, winning_concepts, losing_patterns, notes, source
         ) values ($1,1,true,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'brand_brain-migration')
         on conflict (brand_id, version) do update set
           -- fill blanks only: never replace what an agent extracted from real documents
           category          = coalesce(brand_snapshots.category, excluded.category),
           positioning       = coalesce(brand_snapshots.positioning, excluded.positioning),
           target_audience   = coalesce(brand_snapshots.target_audience, excluded.target_audience),
           value_prop        = coalesce(brand_snapshots.value_prop, excluded.value_prop),
           proof_points      = coalesce(brand_snapshots.proof_points, excluded.proof_points),
           competitive_frame = coalesce(brand_snapshots.competitive_frame, excluded.competitive_frame),
           voice_summary     = coalesce(brand_snapshots.voice_summary, excluded.voice_summary),
           pain_points       = coalesce(brand_snapshots.pain_points, excluded.pain_points),
           guidelines        = coalesce(brand_snapshots.guidelines, excluded.guidelines),
           winning_concepts  = coalesce(brand_snapshots.winning_concepts, excluded.winning_concepts),
           losing_patterns   = coalesce(brand_snapshots.losing_patterns, excluded.losing_patterns),
           notes             = coalesce(brand_snapshots.notes, excluded.notes),
           is_current = true, updated_at = now()
         returning id`,
        [brandId, vals.category, vals.positioning, vals.target_audience, vals.value_prop,
         benefits ? [benefits] : null, vals.competitive_frame, vals.voice_summary,
         vals.pain_points, vals.guidelines, vals.winning_concepts, vals.losing_patterns, vals.notes]
      );
      if (isNew) stat.snapNew++; else stat.snapFilled++;
      stat.fieldsFilled += Object.values(vals).filter(Boolean).length;
      void sr;
    }

    if (!DRY) await db.query('COMMIT');
  } catch (e) {
    if (!DRY) await db.query('ROLLBACK').catch(() => {});
    throw e;
  }

  const after = await db.query(
    'select (select count(*)::int from clients) c, (select count(*)::int from brands) b, (select count(*)::int from brand_snapshots) s'
  );
  console.log(`Knowledge Layer after:  ${after.rows[0].c} clients, ${after.rows[0].b} brands, ${after.rows[0].s} snapshots`);
  console.log(`\nnew clients ${stat.clients}, new brands ${stat.brands}, new snapshots ${stat.snapNew}, existing snapshots topped up ${stat.snapFilled}`);
  if (stat.skipped.length) console.log('skipped:', stat.skipped.join(', '));
  await db.end();
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
