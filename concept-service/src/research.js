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

/* Two vocabularies, and they must never be conflated. The skill's own
   libraries.md says so in as many words, and records that mixing them once
   produced a false client-facing claim:
     observed        thin (1-2 brands) -> reported (3-4) -> strong (5+)
                     carries an advertiser_count, drawn from ads really running
     trend_research  trend-thin -> trend-reported -> trend-verified
                     published trend reporting, makes NO claim about how many
                     brands actually run the format
   'strong' was missing from this list, which is the top of the observed
   vocabulary. confRank returned "worse than everything" for it, so the single
   best-evidenced formats in the library sorted last and were then cut by the
   30-row slice. The system was discarding exactly the evidence it most wants. */
const CONF_ORDER = [
  'strong',           // observed in 5+ real advertisers
  'trend-verified',   // corroborated across independent published sources
  'reported',         // observed in 3-4
  'trend-reported',   // one named published source
  'thin',             // observed in 1-2
  'trend-thin',       // one weak source
];
const confRank = (c) => {
  const i = CONF_ORDER.indexOf(String(c || '').toLowerCase());
  return i < 0 ? CONF_ORDER.length : i;
};
/* An observed row is worth more than a trend row at equal confidence, because
   one is an ad somebody paid to run and the other is somebody writing about a
   format. Ties break toward evidence. */
const basisRank = (b) => (String(b || '').toLowerCase() === 'observed' ? 0 : 1);

/*
 * The library is market-level today (cohorts, not clients), so every client's
 * run reads the same current picture of what is working. When Volvo's agent
 * grows per-client runs, filter here.
 */
async function fetchBrief() {
  const [vehicles, editions, probes] = await Promise.all([
    /* evidence_basis is what tells the two vocabularies apart, and without it
       112 web-sourced leads and 18 ad-observed formats reach the model as one
       undifferentiated list. status keeps dormant formats out of a live run.
       The limit sits above the table's real size rather than under it. */
    rest('knowledge_researched_vehicles?select=name,platform,structure,mechanic,why_it_works,ad_adaptability,blurb,confidence,evidence_basis,status,corroborated,advertiser_count,observed_to&status=eq.active&order=retrieved_at.desc.nullslast&limit=400'),
    rest('knowledge_catalog_edition?select=edition_id,ran_at,corpus_ads,formats_total,formats_new,remix_principles,notes&order=ran_at.desc&limit=1'),
    rest('knowledge_research_probe?select=probed_at,platform,cohort,ads,advertisers,verdict&order=probed_at.desc&limit=10'),
  ]);

  if (!vehicles.length && !editions.length) return null;

  /* Real ads first, then strongest evidence, then most recently seen. */
  const ranked = vehicles
    .sort((a, b) => (basisRank(a.evidence_basis) - basisRank(b.evidence_basis)) ||
      (confRank(a.confidence) - confRank(b.confidence)) ||
      String(b.observed_to || '').localeCompare(String(a.observed_to || '')))
    .slice(0, 40);

  const ed = editions[0] || null;
  const observed = vehicles.filter((v) => String(v.evidence_basis || '').toLowerCase() === 'observed').length;

  return {
    vehicles: ranked,
    edition: ed,
    probes,
    totalVehicles: vehicles.length,
    observed,
    researched: vehicles.length - observed,
  };
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

  md += `\n## Researched vehicles (${brief.vehicles.length} of ${brief.totalVehicles} active, real ads first)\n`
      + `Of the ${brief.totalVehicles} active formats, ${brief.observed} were OBSERVED in ads brands actually ran `
      + `and ${brief.researched} come from published trend reporting.\n\n`
      + 'Those are two different kinds of evidence and must not be treated alike. An OBSERVED format carries a '
      + 'count of how many advertisers were seen running it. A RESEARCHED one makes NO claim about that at all, '
      + 'however confident its label sounds, so it is a lead rather than a proven format. Never present a '
      + 'researched format to a client as proven, and never put its evidence claim on a slide.\n\n';

  for (const v of brief.vehicles) {
    /* The label the model sees decides whether it treats the row as proof or
       as a lead, so it says which, in words, rather than leaving it to a
       vocabulary the reader has to already know. */
    const observed = String(v.evidence_basis || '').toLowerCase() === 'observed';
    const basis = observed
      ? `OBSERVED in ${v.advertiser_count || '?'} advertiser${Number(v.advertiser_count) === 1 ? '' : 's'}`
      : 'RESEARCHED, no advertiser count';
    md += `### ${v.name} [${v.platform || '?'} · ${basis} · ${v.confidence || 'unlabelled'}${v.corroborated ? ' · corroborated' : ''}]\n`;
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
