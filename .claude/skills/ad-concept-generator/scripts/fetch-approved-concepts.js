/**
 * fetch-approved-concepts.js — Prior approved concepts for one client
 * (knowledge_v_concept_approved).
 *
 * Powers two pipeline steps:
 *   1. Step 1 (Intake) — "Brand creative appetite": read the tone range of
 *      what's already been approved for this brand.
 *   2. Step 2 (Library check / dedup audit): full pass over the existing
 *      library so new concepts bring a different observation + visual identity.
 *
 * Usage:
 *   node scripts/fetch-approved-concepts.js --client "the colostrum brand"
 *   node scripts/fetch-approved-concepts.js --client "the colostrum brand" --product "Colostrum Soda"
 *   node scripts/fetch-approved-concepts.js --client "the colostrum brand" --batch "Batch 5"
 *   node scripts/fetch-approved-concepts.js --client "the colostrum brand" --limit 200
 *   node scripts/fetch-approved-concepts.js --client "the colostrum brand" --format md
 *   node scripts/fetch-approved-concepts.js --list-clients
 *
 * When the client can't be resolved, prints a did-you-mean list of the closest
 * matches from the view.
 */

const { query, parseArgs, emit, run } = require('./db');

async function listClients() {
  const rows = await query(
    `SELECT client, COUNT(*)::int AS n
     FROM public.knowledge_v_concept_approved
     WHERE client IS NOT NULL
     GROUP BY client
     ORDER BY client ASC`
  );
  return rows;
}

async function resolveClient(input) {
  // Try alias table first for canonical spine; fall back to view.
  const aliasHits = await query(
    `SELECT c.name AS client
     FROM public.knowledge_client c
     LEFT JOIN public.knowledge_client_alias a ON a.client_id = c.client_id
     WHERE c.name ILIKE $1
        OR a.alias_raw ILIKE $1
        OR c.slug ILIKE $2
     GROUP BY c.name`,
    [`%${input}%`, `%${input.toLowerCase().replace(/\s+/g, '-')}%`]
  );
  if (aliasHits.length > 0) return aliasHits.map((r) => r.client);

  // Fallback: match directly on the view's client string.
  const viewHits = await query(
    `SELECT DISTINCT client
     FROM public.knowledge_v_concept_approved
     WHERE client ILIKE $1
     ORDER BY client ASC`,
    [`%${input}%`]
  );
  return viewHits.map((r) => r.client);
}

async function main() {
  const args = parseArgs(process.argv);

  if (args['list-clients']) {
    const clients = await listClients();
    emit({ source: 'knowledge_v_concept_approved', clients });
    return;
  }

  const clientInput = args.client;
  const product = args.product || null;
  const batchLabel = args.batch || null;
  const limit = Number.isFinite(+args.limit) ? +args.limit : 500;
  const format = args.format === 'md' ? 'md' : 'json';

  if (!clientInput) {
    process.stderr.write(
      'Missing --client. Use --list-clients to see available names.\n'
    );
    process.exit(2);
  }

  const matches = await resolveClient(clientInput);
  if (matches.length === 0) {
    emit({
      resolved: false,
      input: clientInput,
      suggestion: 'No approved concepts found. Try --list-clients to see all available client names.',
    });
    return;
  }

  const rows = await query(
    `SELECT
       concept_id,
       client,
       product,
       section,
       batch,
       batch_seq,
       concept_no,
       title,
       funnel_stage,
       motivators,
       messaging_angle,
       hook_tactic,
       message,
       narrative_beats,
       deck_url,
       script_url,
       script_title,
       script_hooks,
       script_body
     FROM public.knowledge_v_concept_approved
     WHERE client = ANY($1::text[])
       AND ($2::text IS NULL OR product ILIKE '%' || $2 || '%')
       AND ($3::text IS NULL OR batch ILIKE '%' || $3 || '%')
     ORDER BY batch_seq NULLS LAST, concept_no NULLS LAST, concept_id
     LIMIT $4`,
    [matches, product, batchLabel, limit]
  );

  if (format === 'json') {
    emit({
      source: 'knowledge_v_concept_approved',
      resolved_clients: matches,
      filters: { product, batch: batchLabel, limit },
      count: rows.length,
      concepts: rows,
    });
    return;
  }

  const lines = [];
  lines.push(`# Approved concepts — ${matches.join(', ')} (${rows.length})`);
  if (product || batchLabel) {
    lines.push(`_Filtered: ${[product && `product: ${product}`, batchLabel && `batch: ${batchLabel}`].filter(Boolean).join(' · ')}_`);
  }
  lines.push('');
  for (const c of rows) {
    const label = c.concept_no || c.concept_id;
    lines.push(`## ${label} — ${c.title || '(untitled)'}  \`${c.batch || ''}${c.section ? ' · ' + c.section : ''}\``);
    if (c.funnel_stage) lines.push(`_Funnel: ${c.funnel_stage}_`);
    if (c.messaging_angle) lines.push(`**Messaging angle:** ${c.messaging_angle}`);
    if (c.motivators) lines.push(`**Motivators:** ${c.motivators}`);
    if (c.hook_tactic) lines.push(`**Hook tactic:** ${c.hook_tactic}`);
    if (c.message) lines.push(c.message);
    if (Array.isArray(c.narrative_beats) && c.narrative_beats.length) {
      lines.push('');
      for (const b of c.narrative_beats) lines.push(`- ${b}`);
    }
    lines.push('');
  }
  process.stdout.write(lines.join('\n'));
}

run(main);
