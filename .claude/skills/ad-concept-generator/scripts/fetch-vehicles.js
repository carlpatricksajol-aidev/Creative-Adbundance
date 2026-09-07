/**
 * fetch-vehicles.js — Proven vehicle library (knowledge_vehicle_bank).
 *
 * These are the vehicles we've actually shipped and had approved. `proven_by`
 * counts how many approved client concepts back each one — that's the closest
 * thing to a strength signal we have.
 *
 * Usage:
 *   node scripts/fetch-vehicles.js
 *   node scripts/fetch-vehicles.js --min-proven 2         # only vehicles used ≥2x
 *   node scripts/fetch-vehicles.js --include-review       # include needs_review rows
 *   node scripts/fetch-vehicles.js --format md            # markdown block instead of JSON
 *
 * Output: JSON array (default) OR markdown suitable for pasting into the CD agent's context.
 */

const { query, parseArgs, emit, run } = require('./db');

async function main() {
  const args = parseArgs(process.argv);
  const minProven = Number.isFinite(+args['min-proven']) ? +args['min-proven'] : 0;
  const includeReview = Boolean(args['include-review']);
  const format = args.format === 'md' ? 'md' : 'json';

  const sql = `
    SELECT
      vehicle_id,
      name,
      description,
      mechanic_summary,
      hook_strategy,
      production_path,
      narrative_beats,
      design_components,
      duration,
      example_script_text,
      example_script_hooks,
      example_script_source,
      origin,
      COALESCE(jsonb_array_length(proven_by), 0) AS proven_count,
      proven_by,
      needs_review
    FROM public.knowledge_vehicle_bank
    WHERE ($1::boolean OR needs_review IS NOT TRUE)
      AND COALESCE(jsonb_array_length(proven_by), 0) >= $2
    ORDER BY proven_count DESC, name ASC
  `;
  const rows = await query(sql, [includeReview, minProven]);

  if (format === 'json') {
    emit({
      source: 'knowledge_vehicle_bank',
      filters: { min_proven: minProven, include_needs_review: includeReview },
      count: rows.length,
      vehicles: rows,
    });
    return;
  }

  // Markdown mode — trimmed for prompt use.
  const lines = [];
  lines.push(`# Vehicle bank (proven — ${rows.length} vehicles)`);
  lines.push('');
  lines.push('Ordered by proven_count DESC. Each vehicle has been backed by that many approved concepts.');
  lines.push('');
  for (const v of rows) {
    lines.push(`## ${v.name}  \`(proven ${v.proven_count}×)\``);
    if (v.mechanic_summary) lines.push(`**Mechanic:** ${v.mechanic_summary}`);
    if (v.hook_strategy) lines.push(`**Hook strategy:** ${v.hook_strategy}`);
    if (v.description) lines.push(v.description);
    if (v.production_path) lines.push(`_Production: ${v.production_path}${v.duration ? ' · ' + v.duration : ''}_`);
    lines.push('');
  }
  process.stdout.write(lines.join('\n'));
}

run(main);
