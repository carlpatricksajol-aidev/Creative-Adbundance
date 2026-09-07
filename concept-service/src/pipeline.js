'use strict';
/*
 * The generator's own pipeline, as code. Same stages, same order and the same
 * reference files as running the skill by hand: harvest, Creative Director
 * pass, Creative Strategist gate per concept, then the batch composition check.
 *
 * The craft lives in the skill's reference files, not in here. This file only
 * sequences the stages and holds them to a shape. If Ricardo changes the craft,
 * he changes the skill and this picks it up on the next run.
 */

const fs = require('fs');
const path = require('path');
const { ask, askText, REVIEW_MODEL } = require('./llm');
/* The snapshot now comes from the Knowledge Layer, not a flat brand_brain
   row: the same knowledge in the shapes the skill actually asks for, plus
   the client's own marketing plan, which brand_brain never carried. */
const brand = require('./dossier');
const research = require('./research');
const store = require('./store');
const harness = require('./harness');
const knowledge = require('./knowledge');
const { canonNum, numSet } = require('./num');

const SKILL_DIR = process.env.SKILL_DIR ||
  '/srv/repo/.claude/skills/ad-concept-generator';

/* Ricardo's vehicle rule, second cut. The first cut told the writer to
   "source each concept's vehicle from this sample" and handed the sample to
   the strategist too, and Batch 6 showed what that buys: concepts built
   around vehicles, objectives written about the creative itself instead of a
   commercial outcome, and catalog ids quoted in a client deck. The menu now
   goes to the WRITER only, explicitly subordinate to the skill's own flow
   (objective -> persona -> argument -> observation -> vehicle, the vehicle
   LAST), and the vehicles this client's earlier batches already used come off
   the menu by id and are banned by name, because the dedup memory carries
   titles and observations but never the vehicle, which is how the same
   two-hander kept coming back wearing a different room. */
const VEHICLE_SAMPLE = 30;

async function vehicleMenu(usedLines) {
  const u = process.env.SUPABASE_URL, k = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!u || !k) return null;
  try {
    const res = await fetch(u + '/rest/v1/knowledge_vehicle_bank?select=vehicle_id,name,description,production_path,mechanic_summary,hook_strategy,proven_by,needs_review,duration&needs_review=not.is.true',
      { headers: { apikey: k, authorization: 'Bearer ' + k }, signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    let rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) return null;
    /* ids quoted in earlier concepts ("Match Cut (#201)") leave the menu */
    const used = new Set((String((usedLines || []).join(' ')).match(/#(\d+)/g) || [])
      .map((m) => Number(m.slice(1))));
    const total = rows.length;
    const banned = rows.filter((v) => used.has(Number(v.vehicle_id))).length;
    rows = rows.filter((v) => !used.has(Number(v.vehicle_id)));
    if (!rows.length) return null;
    /* Fisher-Yates: a draw, not a page */
    for (let i = rows.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = rows[i]; rows[i] = rows[j]; rows[j] = t;
    }
    const pick = rows.slice(0, VEHICLE_SAMPLE);
    /* the fields the skill's own fetch-vehicles.js renders: mechanic, hook
       strategy, and how many approved concepts have backed the vehicle */
    const lines = pick.map(function (v) {
      const proven = Array.isArray(v.proven_by) ? v.proven_by.length : 0;
      return '- ' + v.name + (proven ? ' (proven ' + proven + 'x)' : '') + ' [' + (v.production_path || 'any path') +
        (v.duration ? ', ' + v.duration : '') + ']: ' + String(v.description || '').slice(0, 140) +
        (v.mechanic_summary ? ' Mechanic: ' + String(v.mechanic_summary).slice(0, 120) : '') +
        (v.hook_strategy ? ' Hook strategy: ' + String(v.hook_strategy).slice(0, 100) : '');
    }).join('\n');
    /* Carl's ruling (2026-09-05): Batch 4 and 5 were skill + references +
       Supabase and NOTHING else, and they were good. Every rulebook bolted on
       after the skill competed with it and visibly bent the output (Batch 6
       onward). So the menu carries Ricardo's two rules and not one word more;
       the skill is the only method voice. Vehicles this client already used
       are filtered out SILENTLY - the model never sees a ban list, the menu
       simply does not offer them. */
    return {
      count: pick.length,
      total,
      banned,
      md: 'THE VEHICLE BANK, a fresh random sample of ' + pick.length + ' of the ' + total +
        ' curated vehicles on file, for when a concept needs a vehicle:\n' + lines + '\n\n' +
        'One rule from the creative director: source vehicles from this random sample rather than ' +
        'defaulting to the same familiar formats; no two concepts in the batch share a vehicle family.',
    };
  } catch { return null; }
}

function ref(name) {
  const p = path.join(SKILL_DIR, 'references', name);
  try { return fs.readFileSync(p, 'utf8'); }
  catch { throw new Error(`missing skill reference ${name} at ${p}. Is the repo checked out and up to date?`); }
}

/* The skill itself, whole. For months the service read only the reference
   files and re-told the process in its own words, and the difference showed:
   the same data given to a Claude Web session running the real SKILL.md
   produced good concepts while the service produced, in Carl's words, "just
   words". A summary of a craft document is not the craft document. The
   generative stages get the original; the review gates keep the reviewer docs
   that were written for them. */
function skillDoc() {
  const p = path.join(SKILL_DIR, 'SKILL.md');
  try { return fs.readFileSync(p, 'utf8'); }
  catch { throw new Error(`missing SKILL.md at ${p}. Is the repo checked out and up to date?`); }
}

/* One section of the skill by its heading, so a reviewer stage can be handed
   the skill's own checklist (Step 7's audits, Step 7.5's 22 checks, Step 7.6's
   questions) verbatim, and Ricardo's edits to those lists reach the reviewers
   on the next run with no deploy. Empty when the heading is not found. */
function skillSection(startHeading, endHeading) {
  const doc = skillDoc();
  const i = doc.indexOf(startHeading);
  if (i < 0) return '';
  const j = endHeading ? doc.indexOf(endHeading, i + startHeading.length) : -1;
  return doc.slice(i, j > i ? j : undefined).trim();
}

const SKILL_PREFACE = `THE SKILL YOU ARE EXECUTING, in full. This is the source of truth for what a
concept is and how one is written. The mechanical steps it describes (deck building, file output,
rendering scripts) are handled by the service around you, so ignore instructions about producing
files or slides; everything about METHOD, JUDGMENT, FORMATS, LANES and QUALITY is yours to follow
exactly. Where these instructions and the shorter notes below ever disagree, the skill wins.`;

/* --------------------------------------------------------------- schemas ---- */

/* v6 is the default. CONCEPT_PIPELINE=v4 falls back to the two-agent chain and
   the old slide shape, which is the rollback lever if a v6 run misbehaves in
   front of a client. Nothing else in the service reads that variable. */
const V6 = process.env.CONCEPT_PIPELINE !== 'v4';

/* The v6 slide: exactly 3 narrative bullets, exactly 3 design bullets, and the
   3 hooks now print on the slide instead of being generated and thrown away.
   Every concept also carries the Step Zero triple it was written against, so
   check 18 (strategy alignment) can be verified rather than asserted. */
const CONCEPT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    num: { type: 'string' },
    title: { type: 'string' },
    logline: { type: 'string' },
    observation: { type: 'string' },
    insight_family: { type: 'string' },
    vehicle: { type: 'string' },
    persuasion_job: { type: 'string' },
    awareness: { type: 'string' },
    lane: { type: 'string' },
    dur: { type: 'string' },
    desc: { type: 'string' },
    hooks: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 },
    /* v7.5 slide format: EXACTLY 5 narrative beats and 5 design components */
    narrative: V6
      ? { type: 'array', items: { type: 'string' }, minItems: 5, maxItems: 5 }
      : { type: 'array', items: { type: 'string' }, minItems: 5, maxItems: 6 },
    design: V6
      ? { type: 'array', items: { type: 'string' }, minItems: 5, maxItems: 5 }
      : { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4 },
    /* v6 Step Zero triple, one each, named not invented */
    objective: { type: 'string' },
    persona: { type: 'string' },
    selling_argument: { type: 'string' },
    /* v6 check 16, scored separately because a concept can be creative and
       still weak as a Meta DR ad */
    thumb_stop: { type: 'integer', minimum: 1, maximum: 5 },
    performance_ready: { type: 'integer', minimum: 1, maximum: 5 },
    /* v6 softened the solo-creator rule, so production needs the count */
    talent: { type: 'string' },
    /* which device turns the observation up 25 percent (the skill's intensity
       rule), and the sound-off visual identity, so the harness can cap a
       family and a producer can sort piles without reading the copy */
    intensity_device: { type: 'string' },
    visual_family: { type: 'string' },
  },
  required: V6
    ? ['num', 'title', 'logline', 'observation', 'insight_family', 'vehicle',
      'persuasion_job', 'awareness', 'lane', 'dur', 'desc', 'hooks', 'narrative', 'design',
      'objective', 'persona', 'selling_argument', 'thumb_stop', 'performance_ready', 'talent',
      'intensity_device', 'visual_family']
    : ['num', 'title', 'logline', 'observation', 'insight_family', 'vehicle',
      'persuasion_job', 'awareness', 'lane', 'dur', 'desc', 'hooks', 'narrative', 'design'],
};

const OBS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    observations: {
      type: 'array', minItems: 15, maxItems: 24,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string' },
          insight_family: { type: 'string' },
        },
        required: ['text', 'insight_family'],
      },
    },
    notes: { type: 'string' },
    /* v7.5 Step 4B: the third vehicle pool, ways of capturing a scene that
       already work on the platform for this persona */
    viral_formats: {
      type: 'array', minItems: 5, maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          capture_style: { type: 'string' },
          why_it_fits: { type: 'string' },
        },
        required: ['name', 'capture_style', 'why_it_fits'],
      },
    },
  },
  required: ['observations', 'notes', 'viral_formats'],
};

const BATCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    concepts: { type: 'array', items: CONCEPT, minItems: 1, maxItems: 20 },
    composition_note: { type: 'string' },
  },
  required: ['concepts', 'composition_note'],
};

const GATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reviews: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          num: { type: 'string' },
          verdict: { type: 'string' },
          /* the edits required, as instructions to the Creative Director. The
             reviewer no longer returns a rewritten concept: reviewers judge, the
             CD rewrites, which is the skill's own loop. */
          change_log: { type: 'string' },
        },
        required: ['num', 'verdict', 'change_log'],
      },
    },
  },
  required: ['reviews'],
};

const COMP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdict: { type: 'string' },
    passes: { type: 'array', items: { type: 'string' } },
    shortfalls: { type: 'array', items: { type: 'string' } },
    replace_these: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'passes', 'shortfalls', 'replace_these'],
};

/* v6 Step Zero. The Batch Strategy Map is written BEFORE any observation is
   harvested, and every concept is later held to one row of its allocation. */
const STRATEGY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    objectives: {
      type: 'array', minItems: 1, maxItems: 4,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          objective: { type: 'string' },
          why_now: { type: 'string' },
          source: { type: 'string' },
        },
        required: ['objective', 'why_now', 'source'],
      },
    },
    personas: {
      type: 'array', minItems: 2, maxItems: 4,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          persona: { type: 'string' },
          world: { type: 'string' },
        },
        required: ['persona', 'world'],
      },
    },
    selling_arguments: { type: 'array', minItems: 2, items: { type: 'string' } },
    allocation: {
      type: 'array', minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          slots: { type: 'integer', minimum: 1 },
          objective: { type: 'string' },
          persona: { type: 'string' },
          selling_argument: { type: 'string' },
        },
        required: ['slots', 'objective', 'persona', 'selling_argument'],
      },
    },
    north_star: { type: 'string' },
    gaps: { type: 'array', items: { type: 'string' } },
    /* v7.5 Step 0 outputs 5 and 6 */
    duration_mix: { type: 'string' },
    format_mix: { type: 'string' },
  },
  required: ['objectives', 'personas', 'selling_arguments', 'allocation', 'north_star', 'gaps', 'duration_mix', 'format_mix'],
};

/* v6 Feedback Review Agent. 22 checks, distilled from real producer feedback.
   Per concept it returns a verdict and, when it edited, the concept AFTER the
   edit, same as the strategist gate. */
const FEEDBACK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reviews: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          num: { type: 'string' },
          verdict: { type: 'string', enum: ['PASS', 'REWORK', 'KILL'] },
          failed_checks: { type: 'array', items: { type: 'string' } },
          note: { type: 'string' },
        },
        required: ['num', 'verdict', 'failed_checks', 'note'],
      },
    },
    batch_findings: { type: 'array', items: { type: 'string' } },
  },
  required: ['reviews', 'batch_findings'],
};

/* v6.2 Compliance and Alignment Reviewer. Findings cite their source, and
   HARD FAIL is the only verdict that blocks a build. */
const COMPLIANCE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    sources_read: { type: 'array', items: { type: 'string' } },
    sources_missing: { type: 'array', items: { type: 'string' } },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          num: { type: 'string' },
          title: { type: 'string' },
          finding: { type: 'string' },
          source: { type: 'string' },
          severity: { type: 'string', enum: ['HARD FAIL', 'SOFT FAIL'] },
          fix: { type: 'string' },
        },
        required: ['num', 'title', 'finding', 'source', 'severity', 'fix'],
      },
    },
    strategic_gaps: { type: 'array', items: { type: 'string' } },
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          num: { type: 'string' },
          verdict: { type: 'string', enum: ['PASS', 'REWORK', 'KILL'] },
          note: { type: 'string' },
        },
        required: ['num', 'verdict', 'note'],
      },
    },
  },
  required: ['sources_read', 'sources_missing', 'findings', 'strategic_gaps', 'verdicts'],
};

/* ----------------------------------------------------------------- stages ---- */

const HOUSE_RULES = `
Hard rules that apply to every stage:
- NO EM DASHES anywhere. Use a comma or a full stop. This is a product rule, not a preference.
- Never invent a number. Any figure must come from the brand snapshot. If the snapshot does
  not have the figure a beat wants, write the beat without a figure. No placeholders, no
  bracketed notes, no "insert" or "confirm with the account team" on a client-facing card.
- Platform disclaimers and legal wording (age gates, eligibility, responsible-play lines) are
  applied at build from the client's production notes. They are never written into a concept.
- The marketing report's compliance guardrails and the client's PRODUCTION CONSTRAINTS are the
  hard gates. Where the two disagree on a word, the PRODUCTION CONSTRAINTS win: they are the
  account team's later ruling, taken from what the client has already approved. Brand-brain
  notes are background for tone, never a gate and never a claim.
- Plain speech. No "unlock", no "elevate", no "game-changer", no agency register.
`;

/* v6 Step Zero. Nothing creative happens until a business objective and a
   persona have been chosen for every slot in the batch. The output prints as
   the deck's North Star slide and becomes the contract check 18 verifies. */
async function stageStrategy({ snapshot, count, log, ask, researchMd }) {
  log('Strategic analysis', 'running');
  const out = await ask({
    system: `You are the Strategic Analyst. You run Step Zero of the skill, before any observation is harvested and before any concept is written.\n\n${SKILL_PREFACE}\n\n${skillDoc()}\n\nYour craft rules:\n\n${ref('craft-rules.md')}\n${researchMd ? '\nLive market research from the Research Agent. The confidence labels are honest, respect them:\n\n' + researchMd : ''}\n${HOUSE_RULES}`,
    prompt: `${snapshot}\n\nRun Step Zero and produce the Batch Strategy Map for a batch of ${count} concepts.

Reach your answers by asking the guiding questions, not by jumping to what-ifs: who is this for,
what is the goal, what do we want those people to know, how do we enter their world properly,
where do they wake up, what do they carry, what do they reach for.

1. Business objectives. What is this brand trying to accomplish right now? Pull from the
marketing plan, the compliance and product rows and anything explicit in the snapshot. For each
objective say why it is the priority now and name the source line you took it from. If the
snapshot genuinely does not say, put that in gaps rather than inventing a goal.
2. Target personas. Pick 2 to 4 specific personas this batch speaks to. Concrete, not segments:
an age band plus a situation. For each, describe that persona's actual world in one or two
sentences, because the scenarios come from the world, not from the product.
3. Selling arguments to test. The distinct sales arguments this batch should cover. Different
formats carrying the same argument is one test, not three.
4. Allocation. Distribute all ${count} slots across objective by persona by selling argument.
The slots must sum to exactly ${count}.
5. Duration mix, in duration_mix: assigned by story needs per the skill's Step 0, scaled to
${count} concepts. Where the snapshot carries PRODUCTION CONSTRAINTS with a duration band from the
account team, that band is the whole mix and overrides the skill's default split.
6. Format mix, in format_mix: the skill's three lanes (story-testimonial UGC, wild/organic/viral,
traditional DR) with the count per lane for this batch, adjusted to this client's creative
appetite from the approved library where one is on file. Name the lane each allocation row
belongs to.

north_star is the deck's intro slide in two or three plain sentences: over the course of this
deck you will see ideas that hit these objectives, for these audiences, testing these arguments.
gaps names anything a human has to confirm before this batch is safe to build on.`,
    schema: STRATEGY_SCHEMA,
    maxTokens: 16000,
  });
  const slots = out.allocation.reduce((a, r) => a + r.slots, 0);
  log('Strategic analysis', 'done',
    `${out.objectives.length} objective${out.objectives.length === 1 ? '' : 's'}, ` +
    `${out.personas.length} personas, ${out.selling_arguments.length} selling arguments, ` +
    `${slots} slot${slots === 1 ? '' : 's'} allocated` +
    (out.gaps.length ? `, ${out.gaps.length} gap${out.gaps.length === 1 ? '' : 's'} to confirm` : ''));
  return out;
}

/* A harvest rendered for the model, coverage note FIRST so a thin harvest
   reads as thin instead of reading as the whole truth about an audience. The
   quote travels with every line, because the register is the point: a summary
   of how someone talks is not how they talk. */
function harvestBrief(h) {
  if (!h || !(h.observations || []).length) return '';
  const age = Math.round((Date.now() - new Date(h.savedAt).getTime()) / 86400000);
  const cov = h.coverage || {};
  const byFamily = new Map();
  for (const o of h.observations) {
    const k = o.insight_family || 'unfiled';
    if (!byFamily.has(k)) byFamily.set(k, []);
    byFamily.get(k).push(o);
  }
  const sourced = h.observations.filter((o) => o.source_url).length;

  return `AUDIENCE HARVEST for ${h.client}${h.persona ? ', ' + h.persona : ''}.
Harvested ${String(h.savedAt).slice(0, 10)}${age > 1 ? ', ' + age + ' days ago' : ', today'}. ${h.observations.length} observations kept${cov.quotes_collected ? ' from ' + cov.quotes_collected + ' collected' : ''}, ${sourced} carrying a source link.
${cov.sources_searched && cov.sources_searched.length ? 'Searched: ' + cov.sources_searched.join(', ') + '.' : ''}
${cov.sources_skipped && cov.sources_skipped.length ? 'NOT covered: ' + cov.sources_skipped.map((s) => (s.source || s) + (s.why ? ' (' + s.why + ')' : '')).join('; ') + '.' : ''}
${cov.thin && cov.thin.length ? 'Thin: ' + cov.thin.join('; ') + '.' : ''}

These are REAL sentences real people wrote in public. Prefer them over anything you would
otherwise imagine, and keep their nouns and their register when you build on one. Where a family
is thin it is thin in the EVIDENCE, so do not read its absence as proof the behaviour is rare.

${[...byFamily.entries()].map(([fam, obs]) => `### ${fam} (${obs.length})
${obs.map((o) => `- ${o.text}` +
    (o.quote ? `\n  > "${String(o.quote).replace(/\s+/g, ' ').slice(0, 400)}"` : '') +
    (o.source_url ? `\n  ${o.source_platform || 'source'}${o.source_detail ? ', ' + o.source_detail : ''}${o.written_at ? ', ' + o.written_at : ''}. ${o.source_url}` : '')).join('\n')}`).join('\n\n')}`;
}

function strategyBrief(strategy) {
  if (!strategy) return '';
  return `THE BATCH STRATEGY MAP, written at Step Zero. Every concept must be written against one
allocation row and must name that row's objective, persona and selling argument.

Objectives:
${strategy.objectives.map((o) => `- ${o.objective} (why now: ${o.why_now})`).join('\n')}

Personas:
${strategy.personas.map((p) => `- ${p.persona}. Their world: ${p.world}`).join('\n')}

Selling arguments to test: ${strategy.selling_arguments.join('; ')}

Allocation:
${strategy.allocation.map((a) => `- ${a.slots} concept(s): ${a.persona} x ${a.selling_argument} (objective: ${a.objective})`).join('\n')}
${strategy.duration_mix ? '\nDuration mix: ' + strategy.duration_mix : ''}${strategy.format_mix ? '\nFormat mix: ' + strategy.format_mix : ''}
${strategy.gaps.length ? `\nUnconfirmed, do not build a concept that depends on these: ${strategy.gaps.join('; ')}` : ''}`;
}

async function stageHarvest({ snapshot, prior, log, ask, researchMd, strategy, harvestMd, categoryMd }) {
  log('Human observation harvest', 'running');
  const out = await ask({
    system: `You are the Creative Director on this account.\n\n${SKILL_PREFACE}\n\n${skillDoc()}\n\nYour craft rules are below.\n\n${ref('craft-rules.md')}\n\nYour libraries, including the observation harvest bank:\n\n${ref('libraries.md')}\n${researchMd ? '\nLive market research from the Research Agent. The confidence labels are honest, respect them:\n\n' + researchMd : ''}\n${HOUSE_RULES}`,
    prompt: `${snapshot}\n${strategy ? '\n' + strategyBrief(strategy) + '\n' : ''}${harvestMd ? '\n' + harvestMd + '\n' : ''}${categoryMd ? '\n' + categoryMd + '\n' : ''}\nALREADY DONE FOR THIS CLIENT, do not reuse these observations:\n${prior || '(nothing on file)'}\n\nRun step 4 of the skill, both halves: A, the human observation harvest, and B, the viral format harvest, before any concept is written.
${harvestMd ? `A real harvest is above, gathered from public sources with a link on every line. START FROM IT.
Carry its observations through in the customer's own words rather than restating them, and spend
your own invention only on the gaps its coverage note admits to. An observation you can trace to a
source outranks one you thought of, every time. Do not silently drop a harvested observation
because a smoother one occurred to you.
` : ''}
Mine 18 to 22 specific human observations for this ICP. Each must be a specific behaviour,
thought, situation, conversation or internet habit someone in this audience would recognise
in one second. Not a benefit. Not an angle. Not a theme.
Then part B, in viral_formats: 5 to 10 viral formats for these personas. Not talking-head
templates: actual ways of capturing a scene that already work on the platform for this audience
(captured moments, character-driven parody, environmental storytelling, meme formats in this
persona's feed, absurdist product involvement, screen-capture-as-story). Name the format, its
capture style, and why it fits this persona's world.
${strategy ? `Harvest from the WORLD OF THE PERSONAS named in the Strategy Map above, persona by
persona. An observation set in a generic kitchen when the persona lives at the gym is the
failure this step exists to prevent. Cover every persona.\n` : ''}Weight the harvest toward the winner set in winning_concepts, but source every observation
from behaviour rather than from strategy documents. Spread across insight families so the
batch can later hold at most two per family. In notes, say which harvest prompts you ran and
which angles you weighted toward.`,
    schema: OBS_SCHEMA,
    maxTokens: 16000,
  });
  log('Human observation harvest', 'done', `${out.observations.length} observations and ${(out.viral_formats || []).length} viral formats harvested`);
  return out;
}

/* The format the Creative Director writes in: the skill's own slide format,
   plus one internal tag block per concept so the parse can fill the fields the
   board and the harness need. This is format, not method; the method is the
   skill, which the writer holds in full. */
/* v7.5 Message Visualization, as its own stage. The skill says: before
   locking a vehicle, produce five or more ways to visualize the message, then
   choose. Inside one overloaded Creative Director call that step was invisible
   and usually skipped, and the path of least resistance is "a creator explains
   the benefit to camera". Here every pool slot gets one observation, one
   persuasion job, 5 to 7 human situations that pass the deletable-brand test,
   and a chosen one with a trigger. */
const VIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    slots: {
      type: 'array', minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          slot: { type: 'integer' },
          objective: { type: 'string' },
          persona: { type: 'string' },
          selling_argument: { type: 'string' },
          lane: { type: 'string' },
          awareness: { type: 'string' },
          duration_s: { type: 'integer' },
          observation: { type: 'string' },
          insight_family: { type: 'string' },
          persuasion_job: { type: 'string' },
          chronology: { type: 'string', enum: ['before', 'during', 'after', 'split'] },
          visualizations: {
            type: 'array', minItems: 5, maxItems: 7,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                label: { type: 'string' },
                situation: { type: 'string' },
                trigger: { type: 'string' },
                deletable_brand_pass: { type: 'boolean' },
              },
              required: ['label', 'situation', 'trigger', 'deletable_brand_pass'],
            },
          },
          chosen: {
            type: 'object',
            additionalProperties: false,
            properties: {
              label: { type: 'string' },
              situation: { type: 'string' },
              trigger: { type: 'string' },
              why: { type: 'string' },
            },
            required: ['label', 'situation', 'trigger', 'why'],
          },
        },
        required: ['slot', 'objective', 'persona', 'selling_argument', 'lane', 'awareness', 'duration_s',
          'observation', 'insight_family', 'persuasion_job', 'chronology', 'visualizations', 'chosen'],
      },
    },
  },
  required: ['slots'],
};

/* The skill's human-situation test, in code: the chosen visualization is a
   scene from the persona's life and must read without the product. Brand
   name, app, account, pack, page, screen, browsing: any of these in the
   situation means the product is the scene, and Batches 21 and 22 shipped
   exactly that. */
const PRODUCT_SCENE = /\b(apps?|accounts?|balance|browsers?|tabs?|pages?|screens?|screen[- ]?record(ing)?|sessions?|packs?|catalogu?e|categor(y|ies)|checkout|records?|withdraw(al|s)?|deposit|notifications?|listing|product (page|detail)s?|platform|website|site)\b/i;
function humanSituation(text, brandName) {
  const t = String(text || '');
  if (!t.trim()) return 'empty';
  if (brandName && new RegExp(brandName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(t)) return `names the brand`;
  const m = t.match(PRODUCT_SCENE);
  return m ? `the product is the scene ("${m[0]}")` : null;
}

async function stageVisualize({ snapshot, strategy, observations, viralFormats, poolCount, brief, brandName, log, ask }) {
  log('Message visualization', 'running');
  const obsList = observations.map((o, i) => `${i + 1}. [${o.insight_family}] ${o.text}`).join('\n');
  const formats = (viralFormats || []).map((f, i) => `${i + 1}. ${f.name} (${f.capture_style}): ${f.why_it_fits}`).join('\n');
  const band = brief && brief.duration_min ? `Durations must sit between ${brief.duration_min} and ${brief.duration_max || brief.duration_min + 15} seconds (the client brief).` : 'Follow the Strategy Map duration mix.';
  const out = await ask({
    system: `You are the Creative Director on this account, running the skill's Message Visualization step before any concept is written.\n\n${SKILL_PREFACE}\n\n${skillDoc()}\n\nYour craft rules:\n\n${ref('craft-rules.md')}\n${HOUSE_RULES}`,
    prompt: `${snapshot}\n${strategy ? '\n' + strategyBrief(strategy) + '\n' : ''}
Observations harvested for this client:
${obsList}
${formats ? `\nViral formats harvested for these personas:\n${formats}\n` : ''}
${skillSection('**Sub-procedure 1: Message Visualization', '**Sub-procedure 3: Vehicle Candidate Search')}

Run Sub-procedures 1 and 2 above for ${poolCount} concept SLOTS, before any vehicle is chosen and
before any concept is written. Take the slots from the Strategy Map: spread them across the
allocation rows in proportion to their slot counts (every row gets at least one) and across the
format-mix lanes. Each slot takes a DIFFERENT observation from the list above, from that persona's
world; never reuse one. Where a row gets more than one slot, those slots are alternates and must
not resemble each other: a different persuasion job, a different kind of scene, a different lane
where the mix allows. ${band}

For each slot: the ONE persuasion job (the single objection or question this ad answers). Then
5 to 7 visualizations of the selling argument, in the spirit of the skill's own list: different
scenes, different capture styles, different angles into the same message, each a moment from the
persona's real life that passes the deletable-brand test and sits 25 percent above real life (a
compliment is not a story, an accusation is). Each carries its trigger, the skill's check 7: why
is this person showing us this right now (accusation, discovery, comparison, challenge,
confession, reaction, social moment). Then choose the strongest for THIS persona's world, say
why, and state the chronology tag (before, during, after or split). Where an approved concept
library appears above, it shows what this client's chosen visualizations look like. Do not pick
a vehicle and do not write a concept here.`,
    schema: VIS_SCHEMA,
    maxTokens: 48000,
  });
  let slots = out.slots || [];
  const vis = slots.reduce((a, sl) => a + (sl.visualizations || []).length, 0);

  /* the human-situation test on every choice; swap, then ask again once */
  let swapped = 0;
  const failing = () => slots.filter((sl) => humanSituation(sl.chosen && sl.chosen.situation, brandName));
  for (const sl of failing()) {
    const alt = (sl.visualizations || []).find((v) => v.deletable_brand_pass && !humanSituation(v.situation, brandName));
    if (alt) {
      sl.chosen = { label: alt.label, situation: alt.situation, trigger: alt.trigger, why: `Chosen by the code check: the first choice ${humanSituation(sl.chosen.situation, brandName)}, and a situation must read without the product.` };
      swapped++;
    }
  }
  let redone = 0;
  const still = failing();
  if (still.length) {
    const again = await ask({
      system: `You are the Creative Director on this account, redoing the skill's Message Visualization step for a few slots.\n\n${SKILL_PREFACE}\n\n${skillDoc()}\n${HOUSE_RULES}`,
      prompt: `${snapshot}\n\nThese slots failed the skill's human-situation test: every visualization named the product, the app, an account, a pack, a page or a screen, so the product was the scene. A visualization is a moment from the persona's LIFE, the kind of thing that happens whether or not the product exists, and the product enters later as the thing that resolves it. Redo Sub-procedures 1 and 2 for exactly these slots, keeping each slot's objective, persona, selling argument, lane, awareness, duration, observation, insight family and persuasion job as given, and choose a visualization that passes.\n\n${still.map((sl) => `Slot ${sl.slot}: ${JSON.stringify({ objective: sl.objective, persona: sl.persona, selling_argument: sl.selling_argument, lane: sl.lane, awareness: sl.awareness, duration_s: sl.duration_s, observation: sl.observation, insight_family: sl.insight_family, persuasion_job: sl.persuasion_job })}\nFailed because: ${humanSituation(sl.chosen && sl.chosen.situation, brandName)}`).join('\n\n')}`,
      schema: VIS_SCHEMA,
      maxTokens: 24000,
    });
    for (const nu of again.slots || []) {
      const i = slots.findIndex((sl) => Number(sl.slot) === Number(nu.slot));
      if (i < 0) continue;
      if (humanSituation(nu.chosen && nu.chosen.situation, brandName)) {
        const alt = (nu.visualizations || []).find((v) => v.deletable_brand_pass && !humanSituation(v.situation, brandName));
        if (alt) nu.chosen = { label: alt.label, situation: alt.situation, trigger: alt.trigger, why: 'Chosen by the code check on the second pass: the first choice named the product.' };
      }
      slots[i] = { ...slots[i], ...nu, slot: slots[i].slot };
      redone++;
    }
  }
  const left = failing().length;
  log('Message visualization', 'done',
    `${slots.length} slots, ${vis} visualizations, one chosen per slot` +
    (swapped ? `; ${swapped} choice${swapped === 1 ? '' : 's'} swapped by the human-situation check` : '') +
    (redone ? `; ${redone} slot${redone === 1 ? '' : 's'} redone` : '') +
    (left ? `; ${left} still name the product` : ''));
  return slots;
}

/* Vehicle Selector. The vehicle menu used to sit inside the writer's prompt,
   so the writer chose shape and story at once and defaulted to a person
   sitting somewhere talking. Now each chosen situation gets scored candidates
   from the three pools the skill names (bank, researched library, harvested
   formats) and a winner with a family, a trigger and a proof object. */
const VEH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    slots: {
      type: 'array', minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          slot: { type: 'integer' },
          keywords: { type: 'array', minItems: 3, maxItems: 5, items: { type: 'string' } },
          candidates: {
            type: 'array', minItems: 3, maxItems: 5,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                vehicle: { type: 'string' },
                family: { type: 'string' },
                source: { type: 'string' },
                message_fit: { type: 'integer', minimum: 1, maximum: 5 },
                persona_fit: { type: 'integer', minimum: 1, maximum: 5 },
                freshness: { type: 'integer', minimum: 1, maximum: 5 },
                producibility: { type: 'integer', minimum: 1, maximum: 5 },
              },
              required: ['vehicle', 'family', 'source', 'message_fit', 'persona_fit', 'freshness', 'producibility'],
            },
          },
          winner: {
            type: 'object',
            additionalProperties: false,
            properties: {
              vehicle: { type: 'string' },
              family: { type: 'string' },
              why: { type: 'string' },
              trigger: { type: 'string' },
              proof_object: { type: 'string' },
              talent: { type: 'string' },
            },
            required: ['vehicle', 'family', 'why', 'trigger', 'proof_object', 'talent'],
          },
        },
        required: ['slot', 'keywords', 'candidates', 'winner'],
      },
    },
  },
  required: ['slots'],
};

async function stageVehicles({ snapshot, visSlots, vehicles, researchMd, viralFormats, log, ask }) {
  log('Vehicle selection', 'running');
  const slotsMd = visSlots.map((sl) =>
    `Slot ${sl.slot}: persona ${sl.persona}. Lane ${sl.lane}. Persuasion job: ${sl.persuasion_job}.\n  Situation: ${sl.chosen.situation}\n  Trigger: ${sl.chosen.trigger}`).join('\n');
  const formats = (viralFormats || []).map((f) => `- ${f.name} (${f.capture_style}): ${f.why_it_fits}`).join('\n');
  const out = await ask({
    system: `You are the Creative Director on this account, running the skill's Vehicle Candidate Search and Fit-Check.\n\n${SKILL_PREFACE}\n\n${skillDoc()}\n\nYour libraries:\n\n${ref('libraries.md')}\n\nYour craft rules:\n\n${ref('craft-rules.md')}\n${HOUSE_RULES}`,
    prompt: `${snapshot}

THE SLOTS, each with its chosen situation:
${slotsMd}

THE THREE VEHICLE POOLS.
${vehicles ? vehicles.md : '(the curated bank is unreachable this run)'}
${researchMd ? '\n' + researchMd : ''}
${formats ? '\nHarvested viral formats:\n' + formats : ''}

${skillSection('**Sub-procedure 3: Vehicle Candidate Search', '**All v6 rules apply, plus:**')}

Run Sub-procedure 3 above for every slot: the 3 to 5 shape keywords from its chosen
visualization, the candidate table (3 to 5 candidates across the three pools, at least one
wild, captured or parody candidate, scored 1 to 5 on the four axes), the winner, and the
Fit-Check. The vehicle is the SHAPE of the video and the visualization is the story: the winner
must carry the chosen situation, not replace it. Apply rule 5 across the slots: if the pattern
default (talking head, sitting in a car, at a desk with a phone) wins more than half of them,
the search has failed; go back and force wild-pool candidates in. No two slots may share a
vehicle family. Name the proof object (the one physical or on-screen thing that carries the
proof) and the talent needed (solo, 2-talent or location shoot).`,
    schema: VEH_SCHEMA,
    maxTokens: 32000,
  });
  const slots = out.slots || [];
  const fams = [...new Set(slots.map((x) => (x.winner && x.winner.family || '').toLowerCase()).filter(Boolean))];
  log('Vehicle selection', 'done', `${slots.length} winners across ${fams.length} vehicle families`);
  return slots;
}

/* One package per slot: everything the writer is allowed to build from. */
function buildPackages({ visSlots, vehSlots, startNum }) {
  const byVeh = new Map(vehSlots.map((v) => [Number(v.slot), v]));
  return visSlots.map((sl, i) => {
    const v = byVeh.get(Number(sl.slot)) || {};
    const w = v.winner || {};
    return {
      num: String(Number(startNum) + i).padStart(3, '0'),
      objective: sl.objective, persona: sl.persona, selling_argument: sl.selling_argument,
      persuasion_job: sl.persuasion_job, lane: sl.lane, awareness: sl.awareness, duration_s: sl.duration_s,
      observation: sl.observation, insight_family: sl.insight_family, chronology: sl.chronology || '',
      situation: sl.chosen.situation, trigger: w.trigger || sl.chosen.trigger, why_situation: sl.chosen.why,
      vehicle: w.vehicle || '', family: w.family || '', why_vehicle: w.why || '',
      proof_object: w.proof_object || '', talent: w.talent || 'solo',
    };
  });
}

const packageMd = (p) => `--- Concept ${p.num} ---
Persona: ${p.persona}
Objective: ${p.objective}
Selling argument: ${p.selling_argument}
Persuasion job (the ONE thing this ad answers): ${p.persuasion_job}
Lane: ${p.lane} · Awareness: ${p.awareness} · Duration: ${p.duration_s} seconds · Talent: ${p.talent}
Observation: ${p.observation} [${p.insight_family}]
The situation: ${p.situation}
Chronology (internal, never on the slide): ${p.chronology || 'unstated'} the pain point
Trigger (why this person is showing us this today): ${p.trigger}
Vehicle (the shape of the video): ${p.vehicle} (family: ${p.family}). ${p.why_vehicle}
Proof object: ${p.proof_object}`;

/* What the writer produces: the slide, nothing else. Strategy tags travel on
   the package and are stitched in by the parse, so the writer never writes
   toward a label. */
const CD_FORMAT = `Deliver the batch as text, in the skill's slide format, exactly as you would in a working
session. For each concept, in this order:
NNN · Title
Description (two or three sentences, structure and brand fit, no hooks, no dialogue)
Narrative: five bullets
Design Components: five bullets
Hooks: three candidate opening lines (internal, for the script phase and the mockup caption)
Beats and design bullets are one plain sentence each, said the way you would say it to a producer.
Nothing else: no tags, no strategy notes, no composition note.`;

/* Lift the Creative Director's text into the fields, word for word, with the
   strategy tags taken from the packages rather than from the writer. */
async function parseBatch({ text, packages, log, ask, label }) {
  const tags = (packages || []).map((p) => `${p.num}: objective="${p.objective}" | persona="${p.persona}" | selling_argument="${p.selling_argument}" | awareness="${p.awareness}" | lane="${p.lane}" | dur="${p.duration_s}s" | vehicle="${p.vehicle}" | visual_family="${p.family}" | observation="${p.observation}" | insight_family="${p.insight_family}" | persuasion_job="${p.persuasion_job}" | intensity_device="${p.trigger}" | talent="${p.talent}"`).join('\n');
  const out = await ask({
    system: `You convert a Creative Director's concept batch, written as text in a fixed slide format, into JSON. You copy; you never rewrite. Title, description, every narrative bullet, every design bullet and every hook are reproduced VERBATIM, character for character. The tag fields for each concept number are GIVEN to you below and are copied exactly as given. logline is the observation restated in the customer's own voice in one sentence; thumb_stop and performance_ready are your honest 1 to 5 read of the text.`,
    prompt: `Convert every concept in this batch, keeping the numbers as written (NNN). 'desc' is the Description paragraph. 'narrative' and 'design' are the five bullets each, in order. 'hooks' are the three hook lines. composition_note is "none".\n\nTAG FIELDS PER CONCEPT (copy exactly):\n${tags}\n\nTHE BATCH TEXT:\n${text}`,
    schema: BATCH_SCHEMA,
    maxTokens: 48000,
    model: REVIEW_MODEL,
  });
  log(label, 'done', `${(out.concepts || []).length} concepts parsed from ${text.length} characters of the Creative Director's text`);
  return out;
}

/* The Creative Director gets less freedom, not more: one package per slot,
   and the job is to make that combination brilliant. The vehicle menu, the
   observation list and the viral formats no longer appear here; they were
   decided upstream. */
async function stageWrite({ snapshot, prior, packages, log, ask, researchMd, strategy, harvestMd, categoryMd }) {
  log('Creative Director pass', 'running');
  const draft = await askText({
    system: `You are the Creative Director on this account.\n\n${SKILL_PREFACE}\n\n${skillDoc()}\n\nYour craft rules:\n\n${ref('craft-rules.md')}\n\nYour libraries:\n\n${ref('libraries.md')}\n${HOUSE_RULES}`,
    prompt: `${snapshot}\n${strategy ? '\n' + strategyBrief(strategy) + '\n' : ''}${harvestMd ? '\n' + harvestMd + '\n' : ''}${categoryMd ? '\n' + categoryMd + '\n' : ''}\nALREADY DONE, do not repeat these:\n${prior || '(nothing on file)'}

Run step 6, the Creative Director pass. Write exactly ${packages.length} concepts, one per package
below, numbered as each package says. Each concept is built from ITS package only: that
observation, that persuasion job, that situation, that trigger, that vehicle, that proof object.
Do not swap in a different situation or vehicle, do not add other benefits or products, and do
not let a second persuasion job in. Every brand fact comes from the snapshot above and nowhere
else. Your job is to make the chosen combination brilliant.

THE PACKAGES:
${packages.map(packageMd).join('\n\n')}

${CD_FORMAT}`,
    maxTokens: 64000,
  });
  log('Creative Director pass', 'done', `${packages.length} concepts written, ${draft.text.length} characters`);
  const out = await parseBatch({ text: draft.text, packages, log, ask, label: 'Creative Director pass, parsed' });
  out.markdown = draft.text;
  if (draft.__usage) out.__usage = draft.__usage;
  return out;
}

/* What the judges are told when they read a candidate pool rather than a
   finished batch. Without this, Batch 20's nine drafts for three slots all
   failed the allocation and collision checks by construction. */
function standardNote(snapshot) {
  if (!/APPROVED CONCEPT LIBRARY/.test(snapshot || '')) return '';
  return `
THE CLIENT'S STANDARD. The APPROVED CONCEPT LIBRARY above is work this client approved and shot.
It is the bar for every verdict here, not the skill's ideal. Before you fail a concept, find the
approved concept nearest to it and ask whether the client would have failed that one for the same
reason. A trait the approved library also has is never a reason to fail: a story title rather
than a format title, an objection spoken in a character's mouth, an everyday number a person
would say out loud, household gear, a parody of a familiar format, a talking head in a kitchen.
The failing verdict is for a draft clearly below that library: no human situation, a second
persuasion job, a claim the brand record contradicts, a banned term from the brief, or a shoot
the creator could not do at home.
`;
}

function poolNote(pool) {
  if (!pool) return '';
  return `
WHAT YOU ARE READING: a CANDIDATE POOL of ${pool.size} drafts written for ${pool.slots} slots. A
selection step after you keeps the strongest ${pool.slots}, so several drafts here are alternates
for the same allocation row and share persona, objective and selling argument BY DESIGN. Do not
fail a concept for colliding with an alternate, for the pool exceeding an allocation quota, or
for the pool's lane mix; the selection handles those. Judge each concept on its own merits, as
if it were the only draft for its row, and use the batch-level findings to say which alternate
you would keep for each row and why.
`;
}

async function stageGate({ snapshot, concepts, log, ask, pool }) {
  log('Creative Strategist gate', 'running');
  const groups = [];
  for (let i = 0; i < concepts.length; i += 4) groups.push(concepts.slice(i, i + 4));

  const results = await Promise.all(groups.map((g) => ask({
    system: `You are the Creative Strategist, the last gate before a client sees this work. Your reviewer role and scorecard:\n\n${ref('creative-strategist.md')}\n\nThe craft rules you are checking against:\n\n${ref('craft-rules.md')}\n${HOUSE_RULES}`,
    prompt: `${snapshot}\n${standardNote(snapshot)}${poolNote(pool)}\n${skillSection('### 7. Five-audit gate', '### 7.5.')}\n\nBefore anything else, put every concept through these five tests and answer each in your note:
1. Deletable brand: remove the brand; would anyone still watch this scenario?
2. Stealable: swap in a competitor; does the concept survive unchanged?
3. Human situation: can the situation be described without mentioning the product?
4. Creative leap: is it more than a literal visualization of the selling argument?
5. Trigger: why is this person showing us this today?
No trigger at all is the kill-level failure. A NO on tests 1 to 4 is a fix the Creative Director
must make, quoted and prescribed, unless the client's approved library shows the same trait.
Then run the five audits above in order, then your full scorecard on each concept below. Be hard: reject or edit on a title that does
not let a reader picture the ad, a missing creative leap, more than one persuasion job, a
sibling it would look identical to with the sound off, strategist language in the copy,
manufactured cleverness, anything not shootable at home, a design component never set up in
the description or narrative, any compliance breach, or any number not in the snapshot.
Return a verdict per concept (PASS, EDIT or REJECT) and, in change_log, the specific edits the
Creative Director must make, quoting the failing line and prescribing the fix. Do NOT rewrite
the concept yourself: you judge, the Creative Director rewrites. On REJECT, brief the
replacement in one paragraph, keeping the slot's job.

CONCEPTS:\n${JSON.stringify(g, null, 1)}`,
    schema: GATE_SCHEMA,
    model: REVIEW_MODEL,
    maxTokens: 48000,
  })));

  const reviews = results.flatMap((r) => r.reviews || []);
  const counts = reviews.reduce((a, r) => {
    const v = (r.verdict || '').toLowerCase();
    a[v.includes('reject') ? 'replaced' : v.includes('edit') ? 'edited' : 'passed']++;
    return a;
  }, { passed: 0, edited: 0, replaced: 0 });
  log('Creative Strategist gate', 'done',
    `${counts.passed} pass, ${counts.edited} edited, ${counts.replaced} replaced`);
  return reviews;
}

/* v6 Feedback Review Agent. The strategist catches craft; this catches what
   only shows up when a producer sits with the whole batch. Sent the batch
   whole, because 12 of the 22 checks are batch-level. */
async function stageFeedback({ snapshot, concepts, strategy, log, ask, pool }) {
  log('Feedback review, 22 checks', 'running');
  const out = await ask({
    system: `You are the Feedback Review Agent, the fourth agent in the pipeline. You run AFTER the Creative Strategist and BEFORE anything is built. You replay revision patterns learned from real producer feedback across every client batch. Your craft rules:\n\n${ref('craft-rules.md')}\n\nThe strategist scorecard you are layered on top of:\n\n${ref('creative-strategist.md')}\n${HOUSE_RULES}`,
    prompt: `${snapshot}\n${strategy ? '\n' + strategyBrief(strategy) + '\n' : ''}${standardNote(snapshot)}${poolNote(pool)}\n${skillSection('### 7.5. Feedback Review Agent', '### 7.6.')}

Run every check above over this batch, in order, judging the batch-level ones by reading the
whole batch as a set, the way a producer would. You do NOT rewrite: you judge, and the Creative
Director rewrites from your note. So the note is the deliverable: for REWORK, quote the failing
lines and prescribe the fix; for KILL, brief the replacement in one paragraph, keeping the
allocation slot's objective, persona and selling argument.

In failed_checks list the check numbers that failed for that concept. In batch_findings record
the batch-level results, naming the weakest offender wherever a batch-level check failed.

THE BATCH:\n${JSON.stringify(concepts, null, 1)}`,
    schema: FEEDBACK_SCHEMA,
    model: REVIEW_MODEL,
    maxTokens: 64000,
  });
  const reviews = out.reviews || [];
  const t = reviews.reduce((a, r) => { a[r.verdict] = (a[r.verdict] || 0) + 1; return a; }, {});
  log('Feedback review, 22 checks', 'done',
    `${t.PASS || 0} pass, ${t.REWORK || 0} reworked, ${t.KILL || 0} replaced` +
    (out.batch_findings && out.batch_findings.length ? `, ${out.batch_findings.length} batch finding${out.batch_findings.length === 1 ? '' : 's'}` : ''));
  return out;
}

/* v6.2 Compliance and Alignment Reviewer, the last gate before a client sees
   anything. It reads the snapshot as the source of truth and is told to say
   what it could NOT check rather than guess. */
async function stageCompliance({ snapshot, concepts, strategy, log, ask, label }) {
  const name = label || 'Compliance and alignment review';
  log(name, 'running');
  const out = await ask({
    system: `You are the Compliance and Alignment Reviewer, the fifth and final agent before a deck is built. The Feedback Review Agent catches craft problems. You catch FACTUAL, STRATEGIC and COMPLIANCE problems that only surface when the batch is checked against the client's own source of truth. Your craft rules:\n\n${ref('craft-rules.md')}\n${HOUSE_RULES}`,
    prompt: `THE CLIENT'S SOURCE OF TRUTH. This is the brand record, its compliance rows, its products
and its marketing plan. It is the highest authority here and it is all you have; you cannot
open the onboarding deck, the meeting notes or the previous batch's client feedback.

${snapshot}
${strategy ? '\n' + strategyBrief(strategy) + '\n' : ''}${standardNote(snapshot)}
Run your five reviews over the batch below.

1. Concept name accuracy. Every title and number you write in your output is copy-pasted from
the batch, never paraphrased. This review exists because a past review deck paraphrased five
concept names and miscounted the strategic mix, which destroyed its credibility.
2. Factual accuracy against the source of truth. For every concept, extract each factual claim
and check it: is the product named actually a confirmed product in the record, or unlisted and
therefore unauthorised? Does any discount, price or bundle mechanic match a confirmed offer, or
was a number invented? Does the concept need a disclaimer the record requires? Does it use
banned language? Does it promise something the record cannot substantiate? An invented number is
always a HARD FAIL.
3. Strategic coverage. Enumerate every audience, product and testing goal the record names for
this work, then say how many concepts address each. An audience the client explicitly named with
zero concepts covering it is a strategic gap, reported at batch level.
4. Priority alignment. Anything the record states as a priority, a best-performing audience or a
do-not-do, checked against the batch.
5. Continuity. Any direction in the record that carries forward from previous work, checked
against this batch.

Severity: HARD FAIL is reserved for a FACTUAL or COMPLIANCE error: an invented or unsupported
claim, a product or offer the record does not confirm, banned language, or a missing required
disclaimer. Whether a concept fits the batch objective, the persona or the funnel stage is NOT a
compliance matter: put it in strategic_gaps at batch level. The client's own approved concepts
include existing customers telling their stories under a first-deposit objective, and those are
correct. SOFT FAIL needs a caveat or a copy fix but the premise is sound.
Verdicts: KILL for a HARD FAIL, REWORK for a SOFT FAIL, PASS for no findings.

Honesty rules, which matter more than completeness here. Every finding quotes or names its
source line. Every count names the concept numbers behind it rather than asserting a total. List
in sources_read what you actually checked against and in sources_missing every source you could
NOT read, naming the review it weakened, specifically the client onboarding deck's critical
information section, the latest meeting notes and the previous batch's client feedback, none of
which are available to you here. If a review turns up nothing, say so; "no findings, the batch
and the record agree" is a valid and useful answer. Never invent a finding to look thorough.

THE BATCH:\n${JSON.stringify(concepts.map((c) => ({
      num: c.num, title: c.title, desc: c.desc, hooks: c.hooks,
      narrative: c.narrative, design: c.design, objective: c.objective,
      persona: c.persona, selling_argument: c.selling_argument,
      persuasion_job: c.persuasion_job, awareness: c.awareness, lane: c.lane, talent: c.talent,
    })), null, 1)}`,
    schema: COMPLIANCE_SCHEMA,
    model: REVIEW_MODEL,
    maxTokens: 32000,
  });
  const hard = (out.findings || []).filter((f) => f.severity === 'HARD FAIL').length;
  const soft = (out.findings || []).length - hard;
  log(name, 'done',
    (out.findings || []).length
      ? `${hard} hard, ${soft} soft` +
        ((out.strategic_gaps || []).length ? `, ${out.strategic_gaps.length} strategic gap${out.strategic_gaps.length === 1 ? '' : 's'}` : '') +
        ((out.sources_missing || []).length ? `, ${out.sources_missing.length} source${out.sources_missing.length === 1 ? '' : 's'} unavailable` : '')
      : 'no findings, the batch and the brand record agree' +
        ((out.sources_missing || []).length ? `, though ${out.sources_missing.length} source${out.sources_missing.length === 1 ? ' was' : 's were'} unavailable` : ''));
  return out;
}

/* v7.5 Step 7.6, the last gate: a senior social media creative strategist
   reads the finished concepts as written creative and asks "is this any good,
   would I ship it". Verdicts only, every REWRITE or KILL sourced to the brand's
   own material; the Creative Director does the rewriting. */
const FINAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reviews: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          num: { type: 'string' },
          verdict: { type: 'string', enum: ['SHIP', 'REWRITE', 'KILL'] },
          source: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['num', 'verdict', 'source', 'note'],
      },
    },
    batch_verdict: { type: 'string', enum: ['SHIP', 'RESHAPE'] },
    batch_note: { type: 'string' },
  },
  required: ['reviews', 'batch_verdict', 'batch_note'],
};

async function stageFinalReview({ snapshot, concepts, strategy, log, ask, pool, label }) {
  const name = label || 'Final creative strategy review';
  log(name, 'running');
  const out = await ask({
    system: `You are the senior social media creative strategist who runs the last gate, Step 7.6 of the skill. You read finished concepts as written creative about to go to a client, not as inputs to a rubric.\n\n${skillSection('### 7.6. Final Creative Strategy Review', '### 8.')}\n\nThe craft rules the concepts were written to:\n\n${ref('craft-rules.md')}\n${HOUSE_RULES}`,
    prompt: `${snapshot}\n${strategy ? '\n' + strategyBrief(strategy) + '\n' : ''}${standardNote(snapshot)}${poolNote(pool)}\nBefore anything else, put every concept through these five tests and answer each in your note:
1. Deletable brand: remove the brand; would anyone still watch this scenario?
2. Stealable: swap in a competitor; does the concept survive unchanged?
3. Human situation: can the situation be described without mentioning the product?
4. Creative leap: is it more than a literal visualization of the selling argument?
5. Trigger: why is this person showing us this today?
No trigger at all is the kill-level failure. A NO on tests 1 to 4 is a fix the Creative Director
must make, quoted and prescribed, unless the client's approved library shows the same trait.
Then review each concept with the 8 questions and the batch with the batch questions. Every REWRITE or
KILL cites its source: a brand_brain field, a marketing_report line, an approved-library concept or
a compliance rule, quoted where you can. You do NOT rewrite: for REWRITE, quote what fails and
prescribe the fix; for KILL, brief the replacement in one paragraph keeping the slot's objective,
persona and selling argument. Only what you would ship tomorrow is SHIP.

THE BATCH:\n${JSON.stringify(concepts.map((c) => ({
      num: c.num, title: c.title, desc: c.desc, narrative: c.narrative, design: c.design,
      objective: c.objective, persona: c.persona, selling_argument: c.selling_argument,
      awareness: c.awareness, lane: c.lane, dur: c.dur, visual_family: c.visual_family,
    })), null, 1)}`,
    schema: FINAL_SCHEMA,
    model: REVIEW_MODEL,
    maxTokens: 32000,
  });
  const t = (out.reviews || []).reduce((a, r) => { a[r.verdict] = (a[r.verdict] || 0) + 1; return a; }, {});
  log(name, 'done',
    `${t.SHIP || 0} ship, ${t.REWRITE || 0} rewrite, ${t.KILL || 0} kill, batch ${out.batch_verdict}`);
  return out;
}

async function stageComposition({ snapshot, concepts, log, ask }) {
  log('Batch composition check', 'running');
  const brief = concepts.map((c) => ({
    num: c.num, title: c.title, insight_family: c.insight_family,
    vehicle: c.vehicle, persuasion_job: c.persuasion_job,
    awareness: c.awareness, lane: c.lane,
  }));
  const out = await ask({
    system: `You are the Creative Strategist running the batch-level checks. Your role:\n\n${ref('creative-strategist.md')}\n\nThe composition targets:\n\n${ref('craft-rules.md')}\n${HOUSE_RULES}`,
    prompt: `${snapshot}\n\nThe batch after per-concept review:\n${JSON.stringify(brief, null, 1)}\n\nCheck the v4 composition targets, SCALED to this batch's size: the printed quotas in
craft-rules assume 16 concepts, and this batch is ${concepts.length}. At 5 that means at
least 1 stat-led, at least 1 second-character, at least 1 graphic or animated, at most 1
trend-as-delivery-system, no register repeated, at least two awareness stages. The
insight-family cap of two holds at every size. Do not fail a batch of 5 for missing a quota
that only a batch of 16 can hold. Name which concepts satisfy each target. Where the batch
is genuinely short, name the WEAKEST offenders to replace, never the strongest. In
replace_these, give the concept number and a one-line brief for its replacement.`,
    schema: COMP_SCHEMA,
    model: REVIEW_MODEL,
    maxTokens: 16000,
  });
  log('Batch composition check', 'done', out.verdict.slice(0, 90));
  return out;
}

/* The Creative Director's rewrite pass: the skill's own loop. Reviewers judge
   and the code lints; whatever fails comes back HERE, to the persona that wrote
   it, with the notes as binding instructions. Before this the reviewers
   rewrote concepts themselves, and the compliance reviewer's register leaked
   into six of seven end frames. */
async function stageRewrite({ snapshot, strategy, items, round, log, ask, researchMd, harvestMd }) {
  const name = `Creative Director rewrite${round > 1 ? ' ' + round : ''}`;
  log(name, 'running');
  const draft = await askText({
    system: `You are the Creative Director on this account.\n\n${SKILL_PREFACE}\n\n${skillDoc()}\n\nYour craft rules:\n\n${ref('craft-rules.md')}\n\nYour libraries:\n\n${ref('libraries.md')}\n${HOUSE_RULES}`,
    prompt: `${snapshot}\n${strategy ? '\n' + strategyBrief(strategy) + '\n' : ''}${harvestMd ? '\n' + harvestMd + '\n' : ''}
You wrote the batch these concepts come from. The reviewers have judged them and the code checks
have run. The notes under each concept are binding. Rewrite ONLY the concepts below, keeping each
one's number and its package (same observation, persuasion job, situation and vehicle). Fix a note
about a specific line at that line; do not reword around it, do not add hedges, caveats or
production disclaimers, and do not add benefits or products to compensate. Plain speech, the way
you would say it to a producer.

CONCEPTS TO REWRITE, each with its package and its notes:
${items.map((it) => `${packageMd(it.pkg)}\n\nCURRENT DRAFT:\n${JSON.stringify({ title: it.concept.title, desc: it.concept.desc, narrative: it.concept.narrative, design: it.concept.design, hooks: it.concept.hooks }, null, 1)}\nNOTES:\n${it.notes.join('\n')}`).join('\n\n=====\n\n')}

${CD_FORMAT}`,
    maxTokens: 64000,
  });
  log(name, 'done', `${items.length} rewritten, ${draft.text.length} characters`);
  const out = await parseBatch({ text: draft.text, packages: items.map((it) => it.pkg), log, ask, label: name + ', parsed' });
  const rewritten = out.concepts || [];
  if (draft.__usage) rewritten.__usage = draft.__usage;
  return rewritten;
}

/* Replace by concept number, never add or drop: the batch keeps its spine. */
function mergeByNum(concepts, rewritten) {
  const by = new Map();
  for (const c of rewritten || []) if (c && c.num != null) by.set(canonNum(c.num), c);
  return concepts.map((c) => by.get(canonNum(c.num)) || c);
}

/* The client brief, rendered as data the way the report is: short, factual,
   and only where the account team has actually set something. */
function briefMd(brief) {
  if (!brief || !brief.client) return '';
  const lines = [];
  if (brief.duration_min || brief.duration_max) {
    lines.push(`- Duration: ${brief.duration_min || '?'} to ${brief.duration_max || '?'} seconds. Concepts outside this band are rejected by the build checks.`);
  }
  if (brief.locale) lines.push(`- Language: ${brief.locale === 'en-US' ? 'US English, US register' : brief.locale}.`);
  if (Array.isArray(brief.banned) && brief.banned.length) {
    lines.push(`- Words that cannot appear anywhere in paid creative: ${brief.banned.join(', ')}. This list is the whole banned-term list for this client. A word outside it is allowed, including the category's own name when a character says it as an objection; the report's guardrails govern how the brand FRAMES itself, not what a skeptical character is allowed to say.`);
  }
  if (Array.isArray(brief.allowed_spoken) && brief.allowed_spoken.length) {
    lines.push(`- Cleared words: ${brief.allowed_spoken.join(', ')}. The account team has cleared these for a CHARACTER to say as an objection or a misunderstanding, because the client approved concepts that do exactly that, whatever the report's guardrails say about the brand's own language. They are never the brand's framing and never in on-screen copy.`);
  }
  if (brief.production_notes) lines.push(`- Production notes (applied at build, not written into concepts): ${brief.production_notes}`);
  if (!lines.length) return '';
  return `\n\n## PRODUCTION CONSTRAINTS for ${brief.client}, from the account team\n${lines.join('\n')}\n`;
}

/* ------------------------------------------------------------------- run ---- */

/* Merge a reviewer's output back over the batch it reviewed, by concept number.
 *
 * The old code took `reviews.map(r => r.concept)`, so a reviewer that returned
 * three reviews for four concepts silently shipped a batch of three, and a
 * duplicated number shipped twice. Keeping the input as the spine means a
 * reviewer can only ever REPLACE a concept, never make one disappear.
 */
function reconcile(concepts, reviews) {
  const byNum = new Map();
  for (const r of reviews || []) {
    if (r && r.concept && r.num != null && !byNum.has(canonNum(r.num))) {
      byNum.set(canonNum(r.num), r.concept);
    }
  }
  /* a reviewer that answers "001" for concept 1 used to have its revision
     silently dropped here, and the original shipped instead. */
  return concepts.map((c) => byNum.get(canonNum(c.num)) || c);
}

async function run({ client, count = 5, prior = '', priorMeta = null, startNum = 1, log }) {
  const spend = [];
  const baseAsk = ask;
  // every stage call records what it cost, so the batch can say what it spent
  const trackedAsk = async (args) => {
    const out = await baseAsk(args);
    if (out.__usage) { spend.push(out.__usage); delete out.__usage; }
    return out;
  };
  log('Intake and brand analysis', 'running');
  let { record, matched } = await brand.resolve(client);
  /* the report extraction appends compliance rows on every run; take the
     duplicates out of the table before the snapshot is built from it */
  try {
    const removed = await brand.dedupeRules(record.brand && record.brand.id);
    if (removed) { log('Compliance rules', 'done', `${removed} duplicate rule rows removed`); ({ record, matched } = await brand.resolve(client)); }
  } catch (err) { log('Compliance rules', 'done', 'could not dedupe the rules table (' + err.message.slice(0, 60) + ')'); }
  /* the client's brief rides with the snapshot as data, exactly like the report */
  const brief = store.getBrief(record.brand.brand_name) || store.getBrief(client) || {};
  let snapshot = brand.toMarkdown(record) + briefMd(brief);
  /* Say what the snapshot was actually built from. A run grounded in a brand
     with no marketing plan and no compliance rules should say so in the step,
     not read identical to one that had both. */
  const built = [
    record.snap ? 'identity' : null,
    /* First in the list because it is first in the snapshot, and because a run
       that read it should be distinguishable at a glance from one that did
       not. Naming it here is how Carl can tell the marketing_report table is
       actually being used without going and querying it. */
    record.report ? 'the brand strategy snapshot' : null,
    record.plan ? 'marketing plan' : null,
    record.rules.length ? `${record.rules.length} compliance rule${record.rules.length === 1 ? '' : 's'}` : null,
    record.products.length ? `${record.products.length} product${record.products.length === 1 ? '' : 's'}` : null,
    record.colors.length ? 'colours' : null,
    brief.client ? `the client brief (${brief.duration_min || '?'} to ${brief.duration_max || '?'}s, ${(brief.banned || []).length} banned words)` : null,
  ].filter(Boolean);
  log('Intake and brand analysis', 'done',
    `snapshot for ${record.brand.brand_name} (matched on ${matched}) from ${built.length ? built.join(', ') : 'a bare brand row'}`);

  log('Library check', 'done',
    prior
      ? `${priorMeta ? priorMeta.concepts : '?'} prior concepts across ${priorMeta ? priorMeta.batches : '?'} batches fed in, deduping at observation level`
      : 'no prior batch on file, nothing to dedup against');
  const winners = record.snap && record.snap.winning_concepts;
  const losers = record.snap && record.snap.losing_patterns;
  log('Performance filter', 'done',
    (winners ? 'winner set from what has worked' : 'no winner set on file, defaulting') +
    (losers ? ', known losing patterns excluded' : ', nothing on file to exclude'));

  /* The market research library: the Research Agent's catalogue of ad formats,
     which is shared across every client rather than being about this one. It
     used to be logged as "Marketing report", which collided with the step that
     commissions THIS CLIENT'S report in marketingReport.js. Steps are keyed by
     name, so the two were one row and the client report never showed. Absence
     degrades honestly, never silently: the step says what was and was not on
     file. */
  log('Market research library', 'running');
  let researchMd = null;
  try {
    const brief = await research.fetchBrief();
    researchMd = research.toMarkdown(brief, { compact: true });
    log('Market research library', 'done', brief
      ? `${brief.vehicles.length} researched vehicles read` +
        (brief.edition ? `, catalog edition of ${String(brief.edition.ran_at).slice(0, 10)}` : '') +
        `, ${(brief.probes || []).length} recent probes`
      : 'the research library is empty, generating from the brand snapshot alone');
  } catch (err) {
    log('Market research library', 'done',
      'could not reach the research library (' + err.message.slice(0, 80) + '), generating from the brand snapshot alone');
  }

  /* Ricardo's vehicle rule: a fresh random draw from the curated bank every
     run, minus everything this client's earlier batches already used. */
  log('Vehicle bank', 'running');
  let usedVeh = [];
  try { usedVeh = store.usedVehicles(client); } catch {}
  const vehicles = await vehicleMenu(usedVeh);
  log('Vehicle bank', 'done', vehicles
    ? vehicles.count + ' vehicles drawn at random from the ' + vehicles.total + ' on file' +
      (vehicles.banned ? ', ' + vehicles.banned + ' used in earlier batches quietly left out' : '') +
      ', duration rule >30s attached'
    : 'the vehicle bank is unreachable, so the skill\'s own libraries carry the batch alone');

  /* The skill's other two knowledge pools, which the ecosystem never fed:
     the client's approved concepts (Step 1 tone appetite, Step 2 full dedup)
     and the adjacent category's real ads (Step 4 context). Ricardo's "not
     pulling all information correctly" was these. */
  const nameSet = [record.brand.brand_name, record.brand.client_name, client].filter(Boolean);
  log('Approved library', 'running');
  let approved = null;
  try {
    approved = await knowledge.fetchApproved(nameSet);
    /* the view has nothing for a brand until its decks are catalogued; the
       brief can carry the client's approved concepts in the meantime */
    if (!approved) approved = knowledge.approvedFromBrief(brief);
    log('Approved library', 'done', approved
      ? `${approved.count} approved concepts ${approved.clients.join(', ') === brief.client ? 'from the client brief' : 'on file for ' + approved.clients.join(', ')}, read for tone and dedup`
      : 'no approved concepts in the library for this client yet, tone comes from the brand record alone');
  } catch (err) {
    log('Approved library', 'done', 'could not read the approved-concept view (' + err.message.slice(0, 60) + ')');
  }
  if (approved) snapshot += '\n\n' + approved.md;

  log('Category ads', 'running');
  let categoryMd = null;
  try {
    const cat = await knowledge.fetchCategoryAds({ names: nameSet, category: record.snap && record.snap.category });
    if (cat) { categoryMd = cat.md; log('Category ads', 'done', `${cat.count} adjacent-category ads read (bucket: ${cat.bucket}), adoption signal only`); }
    else log('Category ads', 'done', 'no adjacent-category ads on file for this brand or its category');
  } catch (err) {
    log('Category ads', 'done', 'could not read the scraped-ad table (' + err.message.slice(0, 60) + ')');
  }

  /* The audience harvest, if one has been posted for this client. Absence is
     reported honestly rather than passed over: a batch built on imagined
     observations should say so in its own step log. */
  log('Audience harvest', 'running');
  let harvestMd = null;
  let harvestRec = null;
  try {
    harvestRec = store.latestHarvest(client);
    harvestMd = harvestBrief(harvestRec);
    if (harvestMd) {
      const age = Math.round((Date.now() - new Date(harvestRec.savedAt).getTime()) / 86400000);
      const sourced = harvestRec.observations.filter((o) => o.source_url).length;
      log('Audience harvest', 'done',
        `${harvestRec.observations.length} real observations read, ${sourced} with a source link, harvested ${age < 1 ? 'today' : age + ' days ago'}` +
        (age > 90 ? '. Over three months old, the behaviour may have moved on' : ''));
    } else {
      log('Audience harvest', 'done',
        'no harvest on file for this client, so the observations below are the model\'s own rather than sourced from real customers');
    }
  } catch (err) {
    log('Audience harvest', 'done', 'could not read the harvest store (' + err.message.slice(0, 60) + '), generating without it');
  }

  /* The strategist does NOT see the vehicle menu. Step Zero allocates business
     objective x persona x selling argument, and when Batch 6's strategist had
     the menu in front of it the objectives came out as statements about the
     creative instead of the business. The writer picks vehicles; the
     strategist picks what the batch is FOR. */

  const strategy = V6
    ? await stageStrategy({ snapshot, count, log, ask: trackedAsk, researchMd })
    : null;

  const harvest = await stageHarvest({ snapshot, prior, log, ask: trackedAsk, researchMd, strategy, harvestMd, categoryMd });

  /* ---- decide before writing: one package per pool slot ---- */
  const poolCount = Math.min(15, Math.max(count * 3, count + 3));
  const visSlots = await stageVisualize({
    snapshot, strategy, observations: harvest.observations, viralFormats: harvest.viral_formats,
    poolCount, brief, brandName: record.brand.brand_name, log, ask: trackedAsk,
  });
  const vehSlots = await stageVehicles({
    snapshot, visSlots, vehicles, researchMd, viralFormats: harvest.viral_formats, log, ask: trackedAsk,
  });
  const packages = buildPackages({ visSlots, vehSlots, startNum });
  const pkgOf = new Map(packages.map((p) => [canonNum(p.num), p]));

  /* ---- the pool ---- */
  const drafted = await stageWrite({
    snapshot, prior, packages, log, ask: trackedAsk, researchMd, strategy, harvestMd, categoryMd,
  });
  if (drafted.__usage) { spend.push(drafted.__usage); delete drafted.__usage; }
  let pool = drafted.concepts;

  /* ---- judge the pool: code first, then every reviewer, compliance included ---- */
  const lintCtx = harness.context({ brief, snapshot, library: store.libraryConcepts(record.brand.brand_name) });
  const lintAll = (list) => {
    const byNum = new Map();
    const batchIssues = harness.lintBatch(list, lintCtx);
    for (const c of list) {
      const issues = harness.lintConcept(c, lintCtx).concat(batchIssues.get(canonNum(c.num)) || []);
      if (issues.length) byNum.set(canonNum(c.num), issues);
    }
    return byNum;
  };
  const lintSummary = (m) => {
    const codes = {};
    for (const issues of m.values()) for (const i of issues) codes[i.code] = (codes[i.code] || 0) + 1;
    return Object.entries(codes).map(([k, v]) => `${k} x${v}`).join(', ');
  };
  let lint = lintAll(pool);
  log('Code checks', 'done', lint.size
    ? `${lint.size} of ${pool.length} in the pool need a fix: ${lintSummary(lint)}`
    : `every concept in the pool of ${pool.length} clears the code checks`);

  const poolInfo = { size: pool.length, slots: count };
  const reviews = await stageGate({ snapshot, concepts: pool, log, ask: trackedAsk, pool: poolInfo });
  const feedback = await stageFeedback({ snapshot, concepts: pool, strategy, log, ask: trackedAsk, pool: poolInfo });
  let compliance = await stageCompliance({ snapshot, concepts: pool, strategy, log, ask: trackedAsk });
  let finalReview = await stageFinalReview({ snapshot, concepts: pool, strategy, log, ask: trackedAsk, pool: poolInfo });

  /* ---- selection: code, not a model ---- */
  const V = new Map();   // num -> { gate, feedback, final, hard, soft, notes[] }
  const vOf = (num) => { const k = canonNum(num); if (!V.has(k)) V.set(k, { notes: [], hard: 0, soft: 0 }); return V.get(k); };
  for (const r of reviews) {
    const v = vOf(r.num); const t = String(r.verdict || '').toLowerCase();
    v.gate = t.includes('reject') ? 'REJECT' : t.includes('edit') ? 'EDIT' : 'PASS';
    if (v.gate !== 'PASS') v.notes.push(`CREATIVE STRATEGIST (${v.gate}): ${r.change_log}`);
  }
  for (const r of feedback.reviews || []) {
    const v = vOf(r.num); v.feedback = r.verdict || 'PASS';
    if (v.feedback !== 'PASS') v.notes.push(`FEEDBACK REVIEW (${v.feedback}, checks ${(r.failed_checks || []).join(', ') || 'unspecified'}): ${r.note}`);
  }
  for (const f of compliance.findings || []) {
    const v = vOf(f.num);
    if (f.severity === 'HARD FAIL') { v.hard++; v.notes.push(`COMPLIANCE (HARD FAIL, must be fixed or the concept is dropped): ${f.finding} Source: ${f.source}. Fix: ${f.fix}`); }
    else { v.soft++; v.notes.push(`COMPLIANCE (soft): ${f.finding} Fix: ${f.fix}`); }
  }
  for (const r of finalReview.reviews || []) {
    const v = vOf(r.num); v.final = r.verdict || 'SHIP';
    if (v.final !== 'SHIP') v.notes.push(`FINAL CREATIVE STRATEGY REVIEW (${v.final}, source: ${r.source}): ${r.note}`);
  }
  for (const [k, issues] of lint) vOf(k).notes.push('CODE CHECKS FAILED, fix each at the line named:\n' + harness.describe(issues));

  /* A draft leaves the pool only when every judge kills it. Calibrated on
     Ricardo's five approved PackDraw concepts: two of three judges still
     killed one of them (a competitor could run the story, a character says
     "gambling"), and the client's approved work is the standard. A kill from
     one or two judges is a binding note and costs rank, so it rarely ships
     ahead of a clean draft; it just does not disappear on one opinion. */
  const eliminated = (c) => {
    const v = vOf(c.num);
    const kills = (v.gate === 'REJECT' ? 1 : 0) + (v.feedback === 'KILL' ? 1 : 0) + (v.final === 'KILL' ? 1 : 0);
    return kills >= 3;
  };
  const score = (c) => {
    const v = vOf(c.num);
    let sc = 0;
    sc += v.gate === 'PASS' ? 2 : v.gate === 'EDIT' ? 1 : 0;
    sc += v.feedback === 'PASS' ? 2 : v.feedback === 'REWORK' ? 1 : 0;
    sc += v.final === 'SHIP' ? 3 : v.final === 'REWRITE' ? 1 : 0;
    sc -= v.hard * 1.5 + v.soft * 0.25;
    sc -= (lint.get(canonNum(c.num)) || []).length * 0.5;
    sc += ((Number(c.thumb_stop) || 0) + (Number(c.performance_ready) || 0)) / 10;
    return sc;
  };
  const ranked = pool.filter((c) => !eliminated(c)).sort((a, b) => score(b) - score(a));
  const famOf = (c) => String((pkgOf.get(canonNum(c.num)) || {}).family || c.visual_family || '').toLowerCase().trim();
  const laneOf = (c) => String((pkgOf.get(canonNum(c.num)) || {}).lane || c.lane || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 5);
  const survivors = [];
  const usedFam = new Set();
  const usedLane = new Set();
  for (const c of ranked) {                      // the Strategy Map's lanes first: the best of each
    if (survivors.length >= count) break;
    const l = laneOf(c); const f = famOf(c);
    if (!l || usedLane.has(l) || (f && usedFam.has(f))) continue;
    survivors.push(c); usedLane.add(l); if (f) usedFam.add(f);
  }
  for (const c of ranked) {                      // then best first, distinct vehicle families
    if (survivors.length >= count) break;
    if (survivors.includes(c)) continue;
    const f = famOf(c);
    if (f && usedFam.has(f)) continue;
    survivors.push(c); if (f) usedFam.add(f);
  }
  for (const c of ranked) {                      // relax the family rule only if short
    if (survivors.length >= count) break;
    if (!survivors.includes(c)) survivors.push(c);
  }
  let reserve = ranked.filter((c) => !survivors.includes(c));
  const killed = pool.filter(eliminated);
  log('Selection', 'done',
    `${pool.length} in the pool: ${killed.length} killed by the reviewers, ${survivors.length} kept as the strongest, ${reserve.length} in reserve` +
    (survivors.length < count ? `. Only ${survivors.length} of the ${count} asked for survived` : ''));

  /* ---- one rewrite, for survivors that carry notes ---- */
  let concepts = survivors;
  const needs = concepts.filter((c) => vOf(c.num).notes.length);
  let rounds = 0;
  if (needs.length) {
    rounds = 1;
    const items = needs.map((c) => ({ concept: c, notes: vOf(c.num).notes, pkg: pkgOf.get(canonNum(c.num)) || {} }));
    const rewritten = await stageRewrite({ snapshot, strategy, items, round: 1, log, ask: trackedAsk, researchMd, harvestMd });
    if (rewritten.__usage) spend.push(rewritten.__usage);
    concepts = mergeByNum(concepts, rewritten);
  }

  /* ---- code checks again: a survivor that still fails is replaced, not flagged ---- */
  lint = lintAll(concepts);
  const promote = (why) => {
    const next = reserve.shift();
    if (next) log('Selection', 'done', `${why}; "${next.title}" promoted from the reserve`);
    return next;
  };
  if (lint.size) {
    const kept = [];
    for (const c of concepts) {
      if (!lint.has(canonNum(c.num))) { kept.push(c); continue; }
      const next = promote(`"${c.title}" still fails the code checks after the rewrite (${lint.get(canonNum(c.num)).map((i) => i.code).join(', ')})`);
      if (next) kept.push(next);
    }
    concepts = kept;
    lint = lintAll(concepts);
  }
  log('Code checks, survivors', 'done', lint.size
    ? `${lint.size} still failing with the reserve exhausted (${lintSummary(lint)})`
    : `every survivor clears the code checks`);

  /* ---- compliance and final review again, on what will actually ship ---- */
  if (concepts.length) {
    compliance = await stageCompliance({ snapshot, concepts, strategy, log, ask: trackedAsk, label: 'Compliance and alignment review, survivors' });
    finalReview = await stageFinalReview({ snapshot, concepts, strategy, log, ask: trackedAsk, label: 'Final creative strategy review, survivors' });
  } else {
    log('Final creative strategy review, survivors', 'done', 'nothing survived the pool, so there is nothing to review');
  }
  const hardNow = new Map();
  for (const f of compliance.findings || []) if (f.severity === 'HARD FAIL') hardNow.set(canonNum(f.num), `${f.finding} (source: ${f.source}). Fix: ${f.fix}`);
  const killNow = new Map();
  for (const r of finalReview.reviews || []) if (r.verdict === 'KILL') killNow.set(canonNum(r.num), `${r.note} (source: ${r.source})`);
  {
    const kept = [];
    for (const c of concepts) {
      const k = canonNum(c.num);
      if (!hardNow.has(k) && !killNow.has(k)) { kept.push(c); continue; }
      const next = promote(`"${c.title}" ${killNow.has(k) ? 'killed by the final review' : 'still carries a hard compliance fail'} after the rewrite`);
      if (next) kept.push(next);
      else {                                       // reserve exhausted: ship it flagged, never silently
        const f = killNow.get(k) || hardNow.get(k);
        c.flag = c.flag ? `${c.flag} | ${f}` : f;
        kept.push(c);
      }
    }
    concepts = kept;
  }
  /* reviewer opinions that did not kill ride on the concept for the person deciding */
  for (const c of concepts) {
    const r = (finalReview.reviews || []).find((x) => canonNum(x.num) === canonNum(c.num));
    const notes = [];
    if (r && r.verdict === 'REWRITE') notes.push(`Final creative strategy review: ${r.note}`);
    for (const f of compliance.findings || []) if (canonNum(f.num) === canonNum(c.num) && f.severity !== 'HARD FAIL') notes.push(`Compliance (soft): ${f.finding} Fix: ${f.fix}`);
    if (notes.length) c.review_notes = notes;
  }

  const composition = concepts.length ? await stageComposition({ snapshot, concepts, log, ask: trackedAsk }) : null;

  const flagged = concepts.filter((c) => c.flag).length;
  log('Deck ready', 'done',
    `${concepts.length} concepts, 9:16 space reserved` +
    (concepts.length < count ? `, ${count - concepts.length} slot${count - concepts.length === 1 ? '' : 's'} unfilled because the pool ran out of survivors` : '') +
    (flagged ? `, ${flagged} carrying a flag for a human` : ''));

  return {
    client: record.brand.brand_name,
    concepts,
    observations: harvest.observations,
    harvest_notes: harvest.notes,
    composition_note: drafted.composition_note,
    change_log: reviews.map((r) => ({ num: r.num, verdict: r.verdict, note: r.change_log })),
    composition,
    pipeline_version: V6 ? 'v7.5-select' : 'v4',
    strategy,
    /* the decisions made before writing, one per pool slot */
    packages,
    visualizations: visSlots.map((sl) => ({ slot: sl.slot, persuasion_job: sl.persuasion_job, chosen: sl.chosen, options: (sl.visualizations || []).map((v) => v.label) })),
    /* the whole pool with every verdict, so the selection can be audited */
    pool: pool.map((c) => {
      const v = vOf(c.num);
      return { num: c.num, title: c.title, gate: v.gate, feedback: v.feedback, final: v.final, hard: v.hard, soft: v.soft,
        lint: (lintAll([c]).get(canonNum(c.num)) || []).map((i) => i.code),
        outcome: killed.includes(c) ? 'killed' : concepts.some((k) => canonNum(k.num) === canonNum(c.num)) ? 'shipped' : 'reserve' };
    }),
    feedback: {
      batch_findings: feedback.batch_findings,
      reviews: (feedback.reviews || []).map((r) => ({ num: r.num, verdict: r.verdict, failed_checks: r.failed_checks, note: r.note })),
    },
    compliance,
    final_review: {
      batch_verdict: finalReview.batch_verdict, batch_note: finalReview.batch_note,
      reviews: (finalReview.reviews || []).map((r) => ({ num: r.num, verdict: r.verdict, source: r.source, note: r.note })),
    },
    brand_fields: [record.snap, record.plan, record.rules.length, record.products.length].filter(Boolean).length,
    used_marketing_plan: Boolean(record.plan),
    cost_usd: Math.round(spend.reduce((a, u) => a + (u && u.cost || 0), 0) * 100) / 100,
    used_research: Boolean(researchMd),
    used_harvest: Boolean(harvestMd),
    harvest_id: harvestRec ? harvestRec.id : null,
    has_brand_visuals: record.colors.length > 0 && record.fonts.length > 0,
    production_notes: brief.production_notes || null,
    used_approved_library: Boolean(approved),
    used_category_ads: Boolean(categoryMd),
    pool_size: pool.length,
    lint_rounds: rounds,
    lint_remaining: lint.size,
    cd_markdown: (drafted.markdown || '').slice(0, 120000),
  };
}

module.exports = { run, stageGate, stageFeedback, stageFinalReview, stageCompliance, briefMd, poolNote, standardNote };
