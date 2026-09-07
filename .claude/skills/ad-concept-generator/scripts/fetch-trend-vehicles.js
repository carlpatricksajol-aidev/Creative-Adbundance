/**
 * fetch-trend-vehicles.js — Researched vehicles (knowledge_researched_vehicles).
 *
 * ADOPTION signal only, never performance. See the table's own comments: this
 * data must never be conflated with the proven vehicle bank. The `confidence`
 * field uses two vocabularies that CANNOT be mixed:
 *   - brand-observed (evidence_basis='observed'): thin | reported | strong
 *   - trend-sourced  (evidence_basis='trend_research'): trend-thin | trend-reported | trend-verified
 * We preserve both fields on every row so the CD agent can carry the caveat forward.
 *
 * Usage:
 *   node scripts/fetch-trend-vehicles.js
 *   node scripts/fetch-trend-vehicles.js --platform tiktok
 *   node scripts/fetch-trend-vehicles.js --platform meta --cohort rising
 *   node scripts/fetch-trend-vehicles.js --include-dormant
 *   node scripts/fetch-trend-vehicles.js --format md
 */

const { query, parseArgs, emit, run } = require('./db');

async function main() {
  const args = parseArgs(process.argv);
  const platform = args.platform || null;         // 'tiktok' | 'meta' | null (both)
  const cohort = args.cohort || null;             // 'rising' | 'established' | null
  const includeDormant = Boolean(args['include-dormant']);
  const format = args.format === 'md' ? 'md' : 'json';

  const sql = `
    SELECT
      researched_id,
      name,
      platform,
      channel_type,
      structure,
      mechanic,
      why_it_works,
      ad_adaptability,
      audio,
      cohort,
      advertiser_count,
      confidence,
      evidence_basis,
      signal_type,
      status,
      archetype,
      engine,
      mechanics,
      viewer_behaviors,
      product_integration,
      product_integration_why,
      remixability,
      duration_range,
      observed_period,
      last_seen_period,
      source_title,
      source_url,
      blurb,
      vehicle_id AS promoted_to_vehicle_id
    FROM public.knowledge_researched_vehicles
    WHERE ($1::boolean OR status = 'active')
      AND ($2::text IS NULL OR platform = $2)
      AND ($3::text IS NULL OR cohort = $3)
    ORDER BY
      CASE cohort WHEN 'rising' THEN 0 WHEN 'established' THEN 1 ELSE 2 END,
      CASE confidence
        WHEN 'strong' THEN 0 WHEN 'reported' THEN 1 WHEN 'thin' THEN 2
        WHEN 'trend-verified' THEN 0 WHEN 'trend-reported' THEN 1 WHEN 'trend-thin' THEN 2
        ELSE 3
      END,
      COALESCE(advertiser_count, 0) DESC,
      name ASC
  `;
  const rows = await query(sql, [includeDormant, platform, cohort]);

  if (format === 'json') {
    emit({
      source: 'knowledge_researched_vehicles',
      caveat: 'ADOPTION signal only — never performance data. Confidence vocabularies (observed vs trend_research) must not be mixed.',
      filters: { platform, cohort, include_dormant: includeDormant },
      count: rows.length,
      vehicles: rows,
    });
    return;
  }

  const lines = [];
  lines.push(`# Trend vehicles (researched — ${rows.length} formats)`);
  lines.push('');
  lines.push('**Adoption signal only, not performance.** Ordered rising → established, then by confidence.');
  lines.push('');
  for (const v of rows) {
    const conf = `${v.confidence || '—'} (${v.evidence_basis || '—'})`;
    const brands = v.advertiser_count ? `${v.advertiser_count} advertisers` : 'no brand count';
    lines.push(`## ${v.name}  \`[${v.platform}${v.cohort ? ' · ' + v.cohort : ''} · ${conf} · ${brands}]\``);
    if (v.structure) lines.push(`**Structure:** ${v.structure}`);
    if (v.mechanic) lines.push(`**Mechanic:** ${v.mechanic}`);
    if (v.why_it_works) lines.push(`**Why it works:** ${v.why_it_works}`);
    if (v.ad_adaptability) lines.push(`**For paid creative:** ${v.ad_adaptability}`);
    lines.push('');
  }
  process.stdout.write(lines.join('\n'));
}

run(main);
