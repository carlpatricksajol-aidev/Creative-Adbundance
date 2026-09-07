/**
 * fetch-scraped-ads.js — Foreplay-sourced ads (knowledge_scraped_ad).
 *
 * Competitive research context for the observation harvest step. NOT for dedup.
 * Long-running ads (high run_days) are a weak positive signal that the format
 * is working somewhere, so we sort by run_days DESC by default.
 *
 * Usage:
 *   node scripts/fetch-scraped-ads.js --advertiser "the colostrum brand"
 *   node scripts/fetch-scraped-ads.js --query "colostrum"           # matches ad's query field
 *   node scripts/fetch-scraped-ads.js --niche "wellness" --limit 20
 *   node scripts/fetch-scraped-ads.js --advertiser "..." --min-run-days 30
 *   node scripts/fetch-scraped-ads.js --platform meta --live-only
 *   node scripts/fetch-scraped-ads.js --format md
 *
 * Excludes rows with excluded_reason IS NOT NULL (test runs etc.).
 */

const { query, parseArgs, emit, run } = require('./db');

async function main() {
  const args = parseArgs(process.argv);
  const advertiser = args.advertiser || null;
  const q = args.query || null;
  const niche = args.niche || null;
  const platform = args.platform || null;
  const minRunDays = Number.isFinite(+args['min-run-days']) ? +args['min-run-days'] : 0;
  const liveOnly = Boolean(args['live-only']);
  const limit = Number.isFinite(+args.limit) ? +args.limit : 25;
  const format = args.format === 'md' ? 'md' : 'json';

  if (!advertiser && !q && !niche) {
    process.stderr.write(
      'Provide at least one filter: --advertiser, --query, or --niche.\n' +
      'Use --limit to cap results (default 25).\n'
    );
    process.exit(2);
  }

  const rows = await query(
    `SELECT
       scraped_ad_id,
       source,
       platform,
       query,
       cohort,
       advertiser,
       headline,
       description,
       cta,
       format,
       video_duration,
       run_days,
       launched,
       live,
       transcript,
       drivers,
       persona,
       niches,
       platforms,
       foreplay_url
     FROM public.knowledge_scraped_ad
     WHERE excluded_reason IS NULL
       AND ($1::text IS NULL OR advertiser ILIKE '%' || $1 || '%')
       AND ($2::text IS NULL OR query ILIKE '%' || $2 || '%')
       AND ($3::text IS NULL OR niches::text ILIKE '%' || $3 || '%')
       AND ($4::text IS NULL OR platform = $4)
       AND ($5::boolean IS NOT TRUE OR live IS TRUE)
       AND COALESCE(run_days, 0) >= $6
     ORDER BY run_days DESC NULLS LAST, fetched_at DESC
     LIMIT $7`,
    [advertiser, q, niche, platform, liveOnly, minRunDays, limit]
  );

  if (format === 'json') {
    emit({
      source: 'knowledge_scraped_ad',
      note: 'Competitive research context — inspiration + tension surface only. No spend or conversion data behind these rows.',
      filters: { advertiser, query: q, niche, platform, live_only: liveOnly, min_run_days: minRunDays, limit },
      count: rows.length,
      ads: rows,
    });
    return;
  }

  const lines = [];
  lines.push(`# Scraped ads (${rows.length})`);
  lines.push('_Sorted by run_days DESC. Adoption/longevity signal only — no performance data._');
  lines.push('');
  for (const a of rows) {
    const meta = [
      a.advertiser || 'unknown advertiser',
      a.platform,
      a.run_days ? `${a.run_days}d live` : null,
      a.live === false ? 'ended' : null,
    ].filter(Boolean).join(' · ');
    lines.push(`## ${a.headline || '(no headline)'}  \`${meta}\``);
    if (a.description) lines.push(a.description);
    if (a.transcript) {
      const t = a.transcript.length > 600 ? a.transcript.slice(0, 600) + '…' : a.transcript;
      lines.push('');
      lines.push('**Transcript (excerpt):**');
      lines.push(t);
    }
    if (a.cta) lines.push(`**CTA:** ${a.cta}`);
    if (a.foreplay_url) lines.push(`[Foreplay](${a.foreplay_url})`);
    lines.push('');
  }
  process.stdout.write(lines.join('\n'));
}

run(main);
