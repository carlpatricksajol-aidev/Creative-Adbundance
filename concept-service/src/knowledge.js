'use strict';
/*
 * The knowledge pools the v7.5 skill pulls itself when it runs in the Claude
 * app, fetched here so the ecosystem feeds the model the same material.
 * Ricardo, 2026-09-07: "that concept writer is still writing slop, I think
 * it's not pulling all information correctly." The skill's "Live knowledge
 * base" table names four sources; the service already fed marketing_report,
 * brand_brain and the researched vehicles, and never fed these two:
 *
 *   knowledge_v_concept_approved  (Step 1 tone appetite, Step 2 full dedup)
 *   knowledge_scraped_ad          (Step 4 category context, adoption signal)
 *
 * Both are Heartreel REST, same project as the vehicle bank. Every function
 * degrades honestly: null means "not on file", never a silent empty block.
 */

const U = () => process.env.SUPABASE_URL;
const K = () => process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

async function rest(path) {
  const u = U(), k = K();
  if (!u || !k) return null;
  const res = await fetch(`${u}/rest/v1/${path}`, {
    headers: { apikey: k, authorization: 'Bearer ' + k },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`${path.split('?')[0]} answered ${res.status}`);
  return res.json();
}

const clip = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '...' : t; };
const orIlike = (col, names) => `or=(${names.map((n) => `${col}.ilike.*${encodeURIComponent(String(n).replace(/[%*,()]/g, ''))}*`).join(',')})`;

/* Every approved concept for this client: the approved deck IS the creative
   brief for tone (Step 1), and the library the new batch must not repeat at
   insight-family level (Step 2). */
async function fetchApproved(names, cap = 300) {
  const list = (names || []).filter(Boolean);
  if (!list.length) return null;
  const rows = await rest(`knowledge_v_concept_approved?select=client,product,batch,batch_seq,concept_no,title,funnel_stage,messaging_angle,hook_tactic,message,narrative_beats&${orIlike('client', list)}&order=batch_seq.desc.nullslast,concept_no.asc.nullslast&limit=${cap}`);
  if (!Array.isArray(rows) || !rows.length) return null;
  const lines = rows.map((c) => {
    const bits = [
      `- [${c.batch || 'batch ?'}${c.concept_no ? ' #' + c.concept_no : ''}${c.product ? ', ' + c.product : ''}] "${c.title || 'untitled'}"`,
      c.funnel_stage ? `(${c.funnel_stage})` : '',
      c.messaging_angle ? `angle: ${clip(c.messaging_angle, 90)}.` : '',
      c.hook_tactic ? `hook tactic: ${clip(c.hook_tactic, 70)}.` : '',
      c.message ? clip(c.message, 200) : '',
      Array.isArray(c.narrative_beats) && c.narrative_beats.length ? `Beats: ${clip(c.narrative_beats.slice(0, 2).join(' / '), 220)}` : '',
    ].filter(Boolean);
    return bits.join(' ');
  });
  const clients = [...new Set(rows.map((r) => r.client))];
  return {
    count: rows.length,
    clients,
    md: `## APPROVED CONCEPT LIBRARY for ${clients.join(', ')} (${rows.length} concepts the client has already approved)
The skill's Step 1 and Step 2 read this. It is the creative brief for TONE: the range of subject
matter, format and edge this client has actually said yes to. It is also the library every new
concept must differ from at the level of observation and sound-off visual identity, not just
title. Changing hooks on a vehicle already here is not a new concept.
${lines.join('\n')}`,
  };
}

/* Ads from the adjacent category, Foreplay-sourced. Not the brand's own work,
   not dedup, not performance: what real ads in the neighbourhood are saying,
   with run_days as a weak longevity signal. Bucket: the brand by name first,
   then the category words from the snapshot. */
async function fetchCategoryAds({ names, category, cap = 15 }) {
  const list = (names || []).filter(Boolean);
  const base = 'knowledge_scraped_ad?select=advertiser,platform,query,run_days,headline,description,cta,transcript,persona&excluded_reason=is.null&order=run_days.desc.nullslast';
  let rows = list.length ? await rest(`${base}&or=(${list.map((n) => {
    const v = encodeURIComponent(String(n).replace(/[%*,()]/g, ''));
    return `advertiser.ilike.*${v}*,query.ilike.*${v}*`;
  }).join(',')})&limit=${cap}`) : [];
  const bucket = list.join(' / ');
  /* No category-word fallback: for PackDraw it matched two unrelated ads on
     words like "entertainment" and "online" and fed them as context. A brand
     with no bucket in the table gets none, and the log says so. */
  if (!Array.isArray(rows) || !rows.length) return null;
  const lines = rows.map((a) => {
    const meta = [a.advertiser || 'unknown advertiser', a.platform, a.run_days ? `${a.run_days} days live` : null].filter(Boolean).join(', ');
    return `- ${meta}: ${clip(a.headline, 110) || '(no headline)'}` +
      (a.description ? ` | ${clip(a.description, 160)}` : '') +
      (a.transcript ? ` | transcript: ${clip(a.transcript, 260)}` : '') +
      (a.cta ? ` | CTA: ${clip(a.cta, 40)}` : '');
  });
  return {
    count: rows.length,
    bucket,
    md: `## CATEGORY CONTEXT, ${rows.length} real ads from the adjacent category (bucket: ${bucket})
Step 4's optional pull. Inspiration and tension surface only: what ads around this brand are
saying and how long they have stayed live. Not this brand's own ads, not dedup, not performance
data. Longevity is a weak positive, nothing more.
${lines.join('\n')}`,
  };
}

/* A client-approved deck kept on the brief, rendered the way the view's rows
   are, for a brand the view does not have yet. Same slot, same heading, same
   job: the tone the client has already said yes to, and the library the new
   batch must differ from. */
function approvedFromBrief(brief) {
  const ex = brief && Array.isArray(brief.approved_examples) ? brief.approved_examples.filter((c) => c && c.title) : [];
  if (!ex.length) return null;
  const lines = ex.map((c) => {
    const beats = Array.isArray(c.narrative) ? c.narrative : [];
    const design = Array.isArray(c.design) ? c.design : [];
    return `### ${c.num ? c.num + ' · ' : ''}${c.title}\n${c.desc || ''}\n` +
      (beats.length ? 'Narrative:\n' + beats.map((b) => '- ' + b).join('\n') + '\n' : '') +
      (design.length ? 'Design components:\n' + design.map((d) => '- ' + d).join('\n') + '\n' : '');
  });
  return {
    count: ex.length,
    clients: [brief.client],
    md: `## APPROVED CONCEPT LIBRARY for ${brief.client} (${ex.length} concepts the client's strategist has approved, from the ${brief.approved_source || 'approved deck'})
The skill's Step 1 and Step 2 read this. It is the creative brief for TONE and for FORM: this is what
approved looks like for this client, in register, length and how much of the spot the product is on
screen for. New concepts must differ from these at the level of observation and sound-off visual
identity; they should read as if the same person wrote them.
${lines.join('\n')}`,
  };
}

module.exports = { fetchApproved, fetchCategoryAds, approvedFromBrief };
