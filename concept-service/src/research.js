'use strict';
/*
 * The Marketing Report stage. Per the founders' Workflow V1, the Research Agent
 * (Volvo's adbundance-research-agent) probes Meta, Reddit and TikTok and writes
 * what it finds into the knowledge library in Supabase: researched concept
 * vehicles with evidence and confidence labels, platform probes with honest
 * verdicts, and dated catalog editions.
 *
 * This module READS that library and turns it into the research brief the
 * concept run consumes before anything is written. It never writes: producing
 * research is the agent's job, spending it is ours.
 *
 * The confidence labels travel with every vehicle on purpose. A trend-thin
 * vehicle is a lead, not a fact, and the prompt says so.
 */

const URL_BASE = process.env.SUPABASE_URL || 'https://xakngjsybyytldyqfsmi.supabase.co';
/* The knowledge tables are RLS-hidden from anon (unlike brand_brain), so this
   module needs the service key. Server-side only, never in a page. */
const KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

async function rest(path) {
  if (!KEY) throw new Error('no Supabase key configured');
  const res = await fetch(URL_BASE + '/rest/v1/' + path, {
    headers: { apikey: KEY, Authorization: 'Bearer ' + KEY },
  });
  if (!res.ok) throw new Error(`supabase ${res.status} on ${path.split('?')[0]}`);
  return res.json();
}

const CONF_ORDER = ['trend-verified', 'reported', 'trend-reported', 'thin', 'trend-thin'];
const confRank = (c) => {
  const i = CONF_ORDER.indexOf(String(c || '').toLowerCase());
  return i < 0 ? CONF_ORDER.length : i;
};

/*
 * The library is market-level today (cohorts, not clients), so every client's
 * run reads the same current picture of what is working. When Volvo's agent
 * grows per-client runs, filter here.
 */
async function fetchBrief() {
  const [vehicles, editions, probes] = await Promise.all([
    rest('knowledge_researched_vehicles?select=name,platform,structure,mechanic,why_it_works,ad_adaptability,blurb,confidence,corroborated,advertiser_count,observed_to&order=retrieved_at.desc.nullslast&limit=120'),
    rest('knowledge_catalog_edition?select=edition_id,ran_at,corpus_ads,formats_total,formats_new,remix_principles,notes&order=ran_at.desc&limit=1'),
    rest('knowledge_research_probe?select=probed_at,platform,cohort,ads,advertisers,verdict&order=probed_at.desc&limit=10'),
  ]);

  if (!vehicles.length && !editions.length) return null;

  // strongest evidence first, then most recently observed; cap what we feed in
  const ranked = vehicles
    .sort((a, b) => (confRank(a.confidence) - confRank(b.confidence)) ||
      String(b.observed_to || '').localeCompare(String(a.observed_to || '')))
    .slice(0, 30);

  const ed = editions[0] || null;

  return { vehicles: ranked, edition: ed, probes, totalVehicles: vehicles.length };
}

function toMarkdown(brief) {
  if (!brief) return null;
  let md = '# Marketing research brief, from the Research Agent\'s knowledge library\n\n';

  if (brief.edition) {
    const e = brief.edition;
    md += `Latest catalog edition ${e.edition_id} (${String(e.ran_at).slice(0, 10)}): `
        + `${e.formats_total || 0} formats tracked, ${e.formats_new || 0} new, corpus of ${e.corpus_ads || 0} ads.\n`;
    if (e.remix_principles) md += `\nRemix principles from that edition:\n${e.remix_principles}\n`;
    if (e.notes) md += `\nEdition notes: ${e.notes}\n`;
  }

  if (brief.probes && brief.probes.length) {
    md += '\nRecent platform probes, so you know how solid the ground is:\n';
    for (const p of brief.probes.slice(0, 6)) {
      md += `- ${String(p.probed_at).slice(0, 10)} ${p.platform}${p.cohort ? ' (' + p.cohort + ')' : ''}: `
          + `${p.ads || 0} ads from ${p.advertisers || 0} advertisers. ${p.verdict || ''}\n`;
    }
  }

  md += `\n## Researched vehicles (${brief.vehicles.length} of ${brief.totalVehicles} on file, strongest evidence first)\n`
      + 'Each carries its confidence label. Treat trend-verified and corroborated entries as real; '
      + 'treat thin and trend-thin as leads that still need to earn their place in a concept.\n\n';

  for (const v of brief.vehicles) {
    md += `### ${v.name} [${v.platform || '?'} · ${v.confidence || 'unlabelled'}${v.corroborated ? ' · corroborated' : ''}]\n`;
    if (v.blurb) md += `${v.blurb}\n`;
    if (v.structure) md += `Structure: ${v.structure}\n`;
    if (v.mechanic) md += `Mechanic: ${v.mechanic}\n`;
    if (v.why_it_works) md += `Why it works: ${v.why_it_works}\n`;
    if (v.ad_adaptability) md += `Ad adaptability: ${v.ad_adaptability}\n`;
    md += '\n';
  }
  return md;
}

module.exports = { fetchBrief, toMarkdown };
