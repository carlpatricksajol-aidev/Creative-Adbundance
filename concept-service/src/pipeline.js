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

async function vehicleMenu(usedLines, opts = {}) {
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
    const pick = opts.all ? rows : rows.slice(0, VEHICLE_SAMPLE);
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
      rows: pick.map((v) => ({ id: v.vehicle_id, name: v.name, path: v.production_path || null, proven: Array.isArray(v.proven_by) ? v.proven_by.length : 0 })),
      md: (opts.all ? 'THE VEHICLE BANK, all ' + pick.length + ' of the ' + total : 'THE VEHICLE BANK, a fresh random sample of ' + pick.length + ' of the ' + total) +
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
/* A sibling skill in the same checkout, read fresh like the concept skill. */
const SKILLS_ROOT = process.env.SKILLS_ROOT || path.dirname(SKILL_DIR);
function otherSkill(skill, file) {
  const p = path.join(SKILLS_ROOT, skill, file);
  try { return fs.readFileSync(p, 'utf8'); }
  catch { throw new Error(`missing ${skill}/${file} at ${p}. Is the repo checked out and up to date?`); }
}

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
          /* ChatGPT's classifier (Sept 2026): a format with no situation under
             it is the failure mode Batches 20-22 shipped nine times. */
          kind: { type: 'string', enum: ['CONCEPT', 'FORMAT', 'DEMO', 'PRODUCT_WALKTHROUGH'] },
          /* the edits required, as instructions to the Creative Director. The
             reviewer no longer returns a rewritten concept: reviewers judge, the
             CD rewrites, which is the skill's own loop. */
          change_log: { type: 'string' },
        },
        required: ['num', 'verdict', 'kind', 'change_log'],
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
          /* The premise, established here before a vehicle is chosen or a word
             of the concept is written, so the writer receives it rather than
             inventing it mid-sentence. From ChatGPT's read of Batches 20-22
             (Sept 2026): the concepts had mechanics and no premise. */
          creative_engine: { type: 'string', enum: ['social_tension', 'behavioral', 'visual_structural'] },
          tension: { type: 'string' },
          open_loop: { type: 'string' },
          creative_leap: { type: 'string' },
          product_role: { type: 'string' },
          payoff: { type: 'string' },
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
          'observation', 'insight_family', 'persuasion_job', 'chronology', 'visualizations', 'chosen',
          'creative_engine', 'tension', 'open_loop', 'creative_leap', 'product_role', 'payoff'],
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
/* A shot is not a situation. Batch 22's chosen "situations" read "a fixed
   hallway camera captures a creator hiding a watch" and "a direct desk view
   focuses on a regular collectible": cinematography, which passed the product
   check because it named no product. A situation is a person and what they
   think, ask, accuse, assume or feel. */
const SHOT_SCENE = /\b(cameras?|shots?|framing|angles?|close-?ups?|top-?down|overhead|lens|footage|captures?|captured|b-?roll|cut to|cutaway|desk view|hallway view|pov|montage|split-?screen|green-?screen|voice-?over|time-?lapse)\b/i;
function humanSituation(text, brandName) {
  const t = String(text || '');
  if (!t.trim()) return 'empty';
  if (brandName && new RegExp(brandName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(t)) return `names the brand`;
  const sh = t.match(SHOT_SCENE);
  if (sh) return `the situation is a shot, not a scene ("${sh[0]}")`;
  const m = t.match(PRODUCT_SCENE);
  return m ? `the product is the scene ("${m[0]}")` : null;
}

/* ChatGPT's read of Batches 20-22 (Sept 2026), as code, on the WRITTEN
   concept: every shipped beat 1 opened on a screen, every beat 5 ended on
   evidence left visible, the titles named formats ("Voice Memo Object
   Handoff", "Desk Evidence Board"), and interface vocabulary had become the
   language of the concepts. Same shape as the harness issues, so a draft that
   still fails after the rewrite is replaced from the reserve, never flagged. */
/* A format title names the device: either a production device anywhere in
   the title (green screen, voice memo, POV, montage, split screen) or a
   format noun in title position, as the last word or before a colon ("Group
   Chat Exit Check", "Comment Stitch: Did It Arrive?", "Desk Evidence Board").
   The same words inside a sentence are a story ("The Reveal Was Too Fast",
   "I Check Every Character"), which Batch 24 taught the hard way. */
const FORMAT_DEVICE = /\b(green-?screen|split-?screen|voice ?(memo|note)|pov|montage|walkthrough|carousel|time-?lapse|podcast|tutorial|explainer|breakdown|demo|hand-?off)\b/i;
const FORMAT_NOUN = /\b(reply|stitch|replay|check|test|board|reveal|review|reaction|unboxing|haul)$/i;
function formatTitle(title) {
  const t = String(title || '').trim();
  const dev = t.match(FORMAT_DEVICE);
  if (dev) return dev[0];                       // a production device anywhere is always a format
  const head = t.split(':')[0].trim().replace(/[?.!,]+$/, '');
  if (head.split(/\s+/).filter(Boolean).length > 5) return null;   // a sentence, not a label
  const noun = head.match(FORMAT_NOUN);         // a format noun ending a short label
  return noun ? noun[0] : null;
}
const INTERFACE_TERMS = /\b(records?|account( screen| page| value| action)?|screens?|shipping (path|update|status|label)|available (account )?(value|choices|options|paths)|listed (contents|items|details)|item variations?|item list|categor(y|ies)( page| menu| view)?|pack (page|details?|record|list)|(offer|options?|category|main|side|nav(igation)?) ?menus?|menus?|saved page|the phone shows|phone screen|notifications?|browsing|tabs?|checkout|balance|listing)\b/i;
/* the offer menu (keep it, ship it, cash out) is product talk too: Batch 23
   put it in all three shipped concepts */
const OFFER_MENU = /\b(cash[- ]?out|crypto|withdraw(al)?|payout|sell[- ]back|keep,? ship|keep it, ship it|keep or ship|ship or keep)\b/i;
/* ChatGPT's PRODUCT_SCENE_DENSITY (Sept 2026): one normalised answer to "is
   this beat about the product, its interface or its offer", used by the
   density check, the beat-1 and beat-5 checks and the rewrite guard alike,
   so nothing slips through on a synonym the way "The Saved Page Hearing" did. */
function brandRegex(brandName) { return brandName ? new RegExp(String(brandName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null; }
function productScene(text, brandRe) {
  const t = String(text || '');
  return INTERFACE_TERMS.test(t) || PRODUCT_SCENE.test(t) || OFFER_MENU.test(t) || Boolean(brandRe && brandRe.test(t));
}
const ENGINES = ['social_tension', 'behavioral', 'visual_structural'];
const ENGINE_FLAVOURS = {
  social_tension: 'someone doubts, someone accuses, someone challenges, someone misunderstands, someone feels sorry for the persona',
  behavioral: 'a collector habit, a shopping ritual, a weird routine, a decision behaviour, an obsession of the persona',
  visual_structural: 'a comment response, a screen mechanic, a physical-proof mechanic, a platform-native format, an unexpected visual structure',
};
/* ChatGPT (Sept 2026): "producer language should describe the execution, not
   replace the human motivation". A narrative beat that names the camera, the
   frame or the cut is describing the shoot; that belongs in Design
   Components. "The creator places the saved page in front of the camera" is
   producer language; "His friend asks why he has looked at the same page
   twice and still won't open it" is the same beat, alive. */
const APPARATUS = /\b(cameras?|the frame|framing|close-?ups?|macro|footage|b-?roll|clips?|cut(s|ting)? (to|away)|cutaways?|split-?screen|green-?screen|montage|voice-?over|time-?lapse|on-?screen text|captions?|the video|the shot|(fixed|static|locked-?off|wide|overhead|quick) (views?|angles?|frames?)|views? show)\b/i;
/* "the creator" is the first thing on ChatGPT's producer-language list, and
   Batch 25 shipped it twice ("The creator explains that his friend assumed he
   had spent resale money"). It is the production role standing in for the
   person: in the story he is he, his friend, the coworker. A persona noun is
   left alone, since the concept they praised said "the collector". */
const PRODUCTION_ROLE = /\b(the|a) (creator|talent|actor|presenter|subject|model|spokesperson|voice ?actor)\b/i;
/* and a beat whose subject is a thing rather than a person: "The product
   appears", "A phone screen shows", "The PackDraw item enters the story",
   "Three polished reveal clips play". A person as the subject is fine, which
   is why the noun list holds no people. */
const OBJECT_SUBJECT = /^\s*(?:the|a|an|one|two|three|four|five|six|several|a few|multiple)\s+(?:\w+\s+){0,2}?(phones?|screens?|products?|items?|packages?|box(?:es)?|packs?|pages?|accounts?|apps?|labels?|clips?|photos?|videos?|cameras?|footage|reveals?|notifications?)\b/i;
/* ChatGPT on The Box As Evidence: "The story only needs one strong piece of
   proof", where that concept stacked a shipping label, the original
   packaging, three photos and an inspection. Distinct proof artefacts, not
   mentions. */
const PROOF_ARTEFACTS = [
  [/\b(shipping label|label)\b/i, 'the label'],
  [/\b(original packaging|packaging)\b/i, 'the packaging'],
  [/\bbox(es)?\b/i, 'the box'],
  [/\bphotos?\b/i, 'photos'],
  [/\bscreenshots?\b/i, 'a screenshot'],
  [/\b(receipts?|invoices?)\b/i, 'a receipt'],
  [/\b(records?|order history|tracking)\b/i, 'a record'],
];
const HUMAN_BEAT = /\b(says?|said|asks?|asked|laughs?|looks?|admits?|shrugs?|grins?|nods?|replies|reply|answers?|hands?|pauses?|smiles?|realises?|realizes?|stares?|sighs?|mutters?|whispers?|shouts?|texts? back|calls?)\b/i;
function premiseLint(c, brandName) {
  const issues = [];
  const add = (code, field, detail) => issues.push({ code, field, detail });
  const beats = Array.isArray(c.narrative) ? c.narrative.map((b) => String(b || '')) : [];
  const brandRe = brandRegex(brandName);
  const productish = (t) => productScene(t, brandRe);
  const t = String(c.title || '');
  const ft = formatTitle(t);
  if (ft) add('format_title', 'title', `"${t}" says how the ad is made ("${ft}"), not why anyone would watch it. The title is the situation or the line a person says; the format belongs in Design Components.`);
  /* the description is client-facing prose, so producer language shows there
     too and nothing was reading it */
  const desc = String(c.desc || '');
  const dapp = (desc.match(APPARATUS) || [])[0] || (desc.match(PRODUCTION_ROLE) || [])[0];
  if (dapp) add('producer_voice_desc', 'desc', `the description says "${dapp}". The description is what we are making for a person to read: name the situation and the people, and leave the camera, the cut and "the creator" to Design Components.`);
  if (beats.length) {
    if (productish(beats[0])) add('product_first_beat', 'narrative', `beat 1 opens on the product or a screen: "${beats[0].slice(0, 110)}". It must open on the human trigger from the package: a person, a question, an accusation, a look.`);
    const last = beats[beats.length - 1];
    if (productish(last) && !HUMAN_BEAT.test(last)) add('screen_payoff', 'narrative', `the last beat ends on evidence left visible, not on a human payoff: "${last.slice(0, 110)}". End on what a person says or does that resolves the tension.`);
    const dense = beats.filter(productish).length;
    if (dense >= 3) add('product_scene_density', 'narrative', `${dense} of ${beats.length} beats are about the product, its interface or its offer menu (page, pack, screen, record, keep / ship / cash out). The product is proven once, with the physical item or one spoken line about where it came from; after that the beats belong to the people. Two product beats at most.`);
    const menu = beats.filter((b) => OFFER_MENU.test(b)).length;
    if (menu >= 2) add('offer_menu_repeat', 'narrative', `the keep / ship / cash-out menu appears in ${menu} beats. It is product talk: once at most, or leave it to Design Components.`);
    const app = beats.map((b, i) => [i + 1, (b.match(APPARATUS) || [])[0]]).filter(([, m]) => m);
    if (app.length) add('producer_voice', 'narrative', `${app.map(([i, m]) => `beat ${i} names "${m}"`).join(', ')}. The narrative is what happens between the people; the camera, the cut and the caption belong in Design Components.`);
    const role = beats.map((b, i) => [i + 1, (b.match(PRODUCTION_ROLE) || [])[0]]).filter(([, m]) => m);
    if (role.length) add('production_role', 'narrative', `${role.map(([i, m]) => `beat ${i} calls him "${m}"`).join(', ')}. In the story he is "he", and the others are "his friend", "his roommate", "the coworker". "The creator" is the person who shoots it, which is a Design Components word.`);
    const objs = beats.map((b, i) => [i + 1, (b.match(OBJECT_SUBJECT) || [])[1]]).filter(([, m]) => m);
    if (objs.length) add('object_subject', 'narrative', `${objs.map(([i, m]) => `beat ${i} opens with "${m}" as the subject`).join(', ')}. A person does the thing: "he", "his friend", "his roommate", not "the product appears".`);
    const found = PROOF_ARTEFACTS.filter(([re]) => beats.some((b) => re.test(b))).map(([, name]) => name);
    if (found.length >= 3) add('proof_stacking', 'narrative', `the concept stacks ${found.length} pieces of proof (${found.join(', ')}). One strong piece is the whole point: the physical item, or one spoken line about where it came from. Cut the rest to Design Components.`);
  }
  return issues;
}

/* ChatGPT's Premise Strength Gate (Sept 2026). "A concept can technically be
   classified as CONCEPT and still be boring." So the premise is scored before
   the Creative Director is allowed to write a word, on the five questions
   ChatGPT set, and a weak one is sharpened or replaced rather than polished.
   The floor is theirs too: premise, open loop and watch-without-brand below 4
   are rejected. */
const PREMISE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    slots: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          slot: { type: 'integer' },
          human_premise: { type: 'integer' },        // a specific person in a specific situation
          watch_without_brand: { type: 'integer' },  // would you watch the opening with the brand gone
          open_loop: { type: 'integer' },            // is there something you need resolved
          social_truth: { type: 'integer' },         // could a real person live this
          product_necessity: { type: 'integer' },    // does the product resolve it or just appear in it
          verdict: { type: 'string', enum: ['PASS', 'SHARPEN', 'REPLACE'] },
          why: { type: 'string' },
          sharper_situation: { type: 'string' },
          sharper_trigger: { type: 'string' },
          sharper_tension: { type: 'string' },
          sharper_open_loop: { type: 'string' },
          sharper_creative_leap: { type: 'string' },
          sharper_product_role: { type: 'string' },
          sharper_payoff: { type: 'string' },
        },
        required: ['slot', 'human_premise', 'watch_without_brand', 'open_loop', 'social_truth',
          'product_necessity', 'verdict', 'why', 'sharper_situation', 'sharper_trigger',
          'sharper_tension', 'sharper_open_loop', 'sharper_creative_leap', 'sharper_product_role',
          'sharper_payoff'],
      },
    },
  },
  required: ['slots'],
};
const PREMISE_FLOOR = 4;
const PREMISE_KEYS = ['human_premise', 'watch_without_brand', 'open_loop', 'social_truth', 'product_necessity'];
const GATE_KEYS = ['human_premise', 'open_loop', 'watch_without_brand'];   // the three ChatGPT rejects on
function premiseTotal(g) { return PREMISE_KEYS.reduce((a, k) => a + (Number(g && g[k]) || 0), 0); }
function premiseFails(g) {
  if (!g) return null;
  const bad = GATE_KEYS.filter((k) => (Number(g[k]) || 0) < PREMISE_FLOOR).map((k) => `${k.replace(/_/g, ' ')} ${Number(g[k]) || 0}/5`);
  return bad.length ? bad.join(', ') : null;
}
function slotPremiseMd(sl) {
  const ch = sl.chosen || {};
  return `Slot ${sl.slot} (engine ${sl.creative_engine}, persona ${sl.persona})
  Persuasion job: ${sl.persuasion_job}
  Situation: ${ch.situation}
  Trigger: ${ch.trigger}
  Tension: ${sl.tension}
  Open loop: ${sl.open_loop}
  Creative leap: ${sl.creative_leap}
  Product role: ${sl.product_role}
  Payoff: ${sl.payoff}`;
}
async function stagePremiseGate({ snapshot, slots, brandName, count, log, ask }) {
  log('Premise strength gate', 'running');
  const askGate = (list, round) => ask({
    system: `You are the senior creative strategist on this account, scoring premises before anything is written. You are not looking at finished concepts and you do not judge wording, production or compliance: you judge whether there is an idea here worth watching.
${HOUSE_RULES}`,
    prompt: `${snapshot}

Score each premise below, 1 to 5 on each question. 5 is the approved library's best, 1 is a
product walkthrough with a person standing next to it.

1. human_premise: is there a specific person in a specific situation, not a category of person doing a category of thing?
2. watch_without_brand: delete ${brandName} entirely. Would you watch the opening anyway?
3. open_loop: is there something you need to see resolved before you can scroll on?
4. social_truth: does this feel like something a real person actually experiences and retells?
5. product_necessity: does ${brandName} genuinely resolve the situation, or does it merely appear inside it?

A premise can be clean, sensible and correctly built and still be a 3: ordinary is the failure
mode here, not wrongness. Score the idea as a stranger scrolling would meet it.

Then, for every premise that is not a 5 across the board, push the conflict harder and return the
sharper version in sharper_situation, sharper_tension, sharper_open_loop and sharper_payoff. Being
sharper means someone is more wrong, more sure, or more openly doubting, and the viewer has a
question they need answered: "my friend said I would keep literally anything I opened, so I wrote
down the one thing I would actually want first" is sharper than "he writes down what he would
keep", because now there is a test and the video answers it. Keep the same persona, persuasion
job, selling argument and engine. The situation stays a sentence about a person and never a
camera, a shot, a screen or the product. Verdict PASS if it needs nothing, SHARPEN if your
sharper version fixes it, REPLACE if the premise has nothing under it at all. When you sharpen,
return the whole premise, trigger, tension, open loop, creative leap, product role and payoff
together, so nothing is left describing the scene you just replaced.${round > 1 ? '\n\nThese are the sharpened premises from the first pass. Score them as they now stand.' : ''}

THE PREMISES:
${list.map(slotPremiseMd).join('\n\n')}`,
    schema: PREMISE_SCHEMA,
    model: REVIEW_MODEL,
    maxTokens: 32000,
  });

  const apply = (sl, g) => {                       // the sharper premise, if it is really a situation
    if (!g.sharper_situation || humanSituation(g.sharper_situation, brandName)) return false;
    sl.chosen = { ...(sl.chosen || {}), situation: g.sharper_situation, why: `Sharpened by the premise gate: ${g.why}` };
    if (g.sharper_trigger) sl.chosen.trigger = g.sharper_trigger;
    if (g.sharper_tension) sl.tension = g.sharper_tension;
    if (g.sharper_open_loop) sl.open_loop = g.sharper_open_loop;
    if (g.sharper_creative_leap) sl.creative_leap = g.sharper_creative_leap;
    if (g.sharper_product_role) sl.product_role = g.sharper_product_role;
    if (g.sharper_payoff) sl.payoff = g.sharper_payoff;
    return true;
  };
  const swap = (sl) => {                           // or a different visualization from its own list
    const alt = (sl.visualizations || []).find((v) => v.deletable_brand_pass && !humanSituation(v.situation, brandName) && v.situation !== (sl.chosen || {}).situation);
    if (!alt) return false;
    sl.chosen = { label: alt.label, situation: alt.situation, trigger: alt.trigger, why: 'Swapped by the premise gate: the first premise scored below the floor.' };
    return true;
  };

  const first = await askGate(slots, 1);
  const gOf = new Map((first.slots || []).map((g) => [Number(g.slot), g]));
  for (const sl of slots) sl.premise_gate = gOf.get(Number(sl.slot)) || null;
  let sharpened = 0; let swapped = 0; let reverted = 0;
  /* No score is not a bad score. A slot the reviewer omitted is left exactly
     as the situation stage chose it: not sharpened, not swapped, not dropped. */
  const unscored = slots.filter((sl) => !sl.premise_gate);
  const weak = slots.filter((sl) => sl.premise_gate && (premiseFails(sl.premise_gate) || sl.premise_gate.verdict !== 'PASS'));
  const before = new Map(weak.map((sl) => [sl, { chosen: sl.chosen, tension: sl.tension, open_loop: sl.open_loop, payoff: sl.payoff, creative_leap: sl.creative_leap, product_role: sl.product_role, gate: sl.premise_gate }]));
  const changed = new Set();
  for (const sl of weak) {
    const g = sl.premise_gate || {};
    /* REPLACE means there is nothing under this premise to sharpen, so it is
       swapped for a different visualization rather than reworded. The verdict
       used to be written down and never read. */
    if (String(g.verdict || '').toUpperCase() === 'REPLACE' && swap(sl)) { swapped++; changed.add(sl); continue; }
    if (apply(sl, g)) { sharpened++; changed.add(sl); }
    else if (premiseFails(g) && swap(sl)) { swapped++; changed.add(sl); }
  }
  const changedList = weak.filter((sl) => changed.has(sl));
  if (changedList.length) {                        // only what actually changed is re-scored
    const again = await askGate(changedList, 2);
    const g2 = new Map((again.slots || []).map((g) => [Number(g.slot), g]));
    for (const sl of changedList) {
      const was = before.get(sl);
      /* a changed premise the second pass skipped has no score of its own, and
         the first-pass score belongs to the premise it replaced, so the
         original stands rather than being judged on the wrong evidence */
      if (!g2.has(Number(sl.slot))) {
        sl.chosen = was.chosen; sl.tension = was.tension; sl.open_loop = was.open_loop; sl.payoff = was.payoff;
        sl.creative_leap = was.creative_leap; sl.product_role = was.product_role;
        sl.premise_gate = was.gate; reverted++;
        continue;
      }
      const now = g2.get(Number(sl.slot));
      /* sharper is a claim, not a fact: if the rewritten premise scores worse
         than the one it replaced, the original stands */
      if (premiseTotal(now) < premiseTotal(was.gate)) {
        sl.chosen = was.chosen; sl.tension = was.tension; sl.open_loop = was.open_loop; sl.payoff = was.payoff;
        sl.creative_leap = was.creative_leap; sl.product_role = was.product_role;
        sl.premise_gate = was.gate; reverted++;
      } else sl.premise_gate = now;
    }
  }

  /* Below the floor after the second pass, and the pool can spare it: drop it
     rather than let the writer polish it. Never below count + 2, so the
     reserve still has depth. */
  const floor = Math.max(Number(count) + 2, 3);
  const ranked = slots.slice().sort((a, b) => premiseTotal(b.premise_gate) - premiseTotal(a.premise_gate));
  const dropped = [];
  for (const sl of ranked.slice().reverse()) {
    if (ranked.length - dropped.length <= floor) break;
    if (premiseFails(sl.premise_gate)) dropped.push(sl);
  }
  const kept = slots.filter((sl) => !dropped.includes(sl));
  const scores = kept.map((sl) => premiseTotal(sl.premise_gate));
  log('Premise strength gate', 'done',
    `${slots.length} premises scored out of 25` +
    (unscored.length ? `; ${unscored.length} the reviewer did not score, left as chosen` : '') +
    (sharpened ? `; ${sharpened} sharpened` : '') +
    (swapped ? `; ${swapped} swapped for an alternate` : '') +
    (reverted ? `; ${reverted} sharpened version scored worse and was reverted` : '') +
    (dropped.length ? `; ${dropped.length} dropped below the floor (${dropped.map((sl) => `slot ${sl.slot}: ${premiseFails(sl.premise_gate)}`).join('; ')})` : '') +
    `; kept ${scores.join('/')}` +
    (kept.filter((sl) => premiseFails(sl.premise_gate)).length ? `; ${kept.filter((sl) => premiseFails(sl.premise_gate)).length} kept below the floor because the pool could not spare them` : ''));
  return kept;
}

async function stageVisualize({ snapshot, strategy, observations, viralFormats, poolCount, brief, brandName, prior, log, ask }) {
  log('Message visualization', 'running');
  const obsList = observations.map((o, i) => `${i + 1}. [${o.insight_family}] ${o.text}`).join('\n');
  const formats = (viralFormats || []).map((f, i) => `${i + 1}. ${f.name} (${f.capture_style}): ${f.why_it_fits}`).join('\n');
  const band = brief && brief.duration_min ? `Durations must sit between ${brief.duration_min} and ${brief.duration_max || brief.duration_min + 15} seconds (the client brief).` : 'Follow the Strategy Map duration mix.';
  /* ChatGPT's Change #2 (Sept 2026): the engines are assigned to the slots
     before a situation is generated, round robin, so the pool always holds
     an equal share of each and selection never has to relax the diversity
     rule. Asking the model to "cover all three across the pool" gave Batch
     23 a behavioral-heavy pool. */
  const engineOf = (slot) => ENGINES[((Number(slot) || 1) - 1) % ENGINES.length];
  const engineTable = Array.from({ length: poolCount }, (_, i) => `Slot ${i + 1}: ${engineOf(i + 1)} (${ENGINE_FLAVOURS[engineOf(i + 1)]})`).join('\n');
  const out = await ask({
    system: `You are the Creative Director on this account, running the skill's Message Visualization step before any concept is written.\n\n${SKILL_PREFACE}\n\n${skillDoc()}\n\nYour craft rules:\n\n${ref('craft-rules.md')}\n${HOUSE_RULES}`,
    prompt: `${snapshot}\n${strategy ? '\n' + strategyBrief(strategy) + '\n' : ''}
Observations harvested for this client:
${obsList}
${prior ? `
ALREADY SHIPPED FOR THIS CLIENT. These situations are used up: a new one that puts the same people in the same argument is a repeat, however differently it is written. Take a different moment from the persona's life.
${prior}
` : ''}
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
library appears above, it shows what this client's chosen visualizations look like.

A situation is a sentence about a PERSON and what they think, ask, accuse, assume or feel: "His
coworker thinks he is lying about where his shoes came from." "A friend feels sorry for him
because she thinks he got a bad pull." It is never a camera position, a shot, a frame or a
device. "A fixed hallway camera captures" and "a direct desk view focuses on" are shots, and a
shot is not a story. Test every situation by deleting the brand: if what is left is "someone
scrolls through a menu on a phone", nothing happens and it fails; if what is left is "a coworker
accusing someone of wearing fake shoes", it is still a story and it passes.

Then, for the chosen situation, establish the premise the writer will build from, one plain
sentence each. TENSION: what is at stake between the people in the scene. OPEN LOOP: the
question the viewer needs answered before they can scroll on. CREATIVE LEAP: what makes this
more than a literal picture of the selling argument. PRODUCT ROLE: the one moment the product
enters and what it does there, at the chronology point and never earlier; the physical product
or one spoken line about where it came from is the proof, not an interface. PAYOFF: how the
tension resolves, as something a person says or does, never as a screen left visible.

The slot's CREATIVE ENGINE is assigned, not chosen. Set creative_engine to the assigned value
and keep every visualization for that slot inside its engine, so the alternates differ in
scene, not in engine:
${engineTable}
Do not pick a vehicle and do not write a concept here.`,
    schema: VIS_SCHEMA,
    maxTokens: 48000,
  });
  let slots = out.slots || [];
  for (const sl of slots) sl.creative_engine = engineOf(sl.slot);   // assigned, whatever the model wrote
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
      prompt: `${snapshot}\n\nThese slots failed the skill's human-situation test: every visualization either named the product, the app, an account, a pack, a page or a screen, so the product was the scene, or described a camera, a shot or a frame instead of a person, so there was no scene at all. A visualization is a moment from the persona's LIFE, the kind of thing that happens whether or not the product exists, and the product enters later as the thing that resolves it. Redo Sub-procedures 1 and 2 for exactly these slots, keeping each slot's objective, persona, selling argument, lane, awareness, duration, observation, insight family and persuasion job as given, and choose a visualization that passes.\n\n${still.map((sl) => `Slot ${sl.slot}: ${JSON.stringify({ objective: sl.objective, persona: sl.persona, selling_argument: sl.selling_argument, lane: sl.lane, awareness: sl.awareness, duration_s: sl.duration_s, observation: sl.observation, insight_family: sl.insight_family, persuasion_job: sl.persuasion_job, creative_engine: engineOf(sl.slot) })}\nFailed because: ${humanSituation(sl.chosen && sl.chosen.situation, brandName)}`).join('\n\n')}`,
      schema: VIS_SCHEMA,
      maxTokens: 24000,
    });
    for (const nu of again.slots || []) {
      const i = slots.findIndex((sl) => Number(sl.slot) === Number(nu.slot));
      if (i < 0) continue;
      if (humanSituation(nu.chosen && nu.chosen.situation, brandName)) {
        const alt = (nu.visualizations || []).find((v) => v.deletable_brand_pass && !humanSituation(v.situation, brandName));
        if (alt) nu.chosen = { label: alt.label, situation: alt.situation, trigger: alt.trigger, why: 'Chosen by the code check on the second pass: the first choice failed the human-situation test.' };
      }
      slots[i] = { ...slots[i], ...nu, slot: slots[i].slot, creative_engine: engineOf(slots[i].slot) };
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
      creative_engine: sl.creative_engine || '', tension: sl.tension || '', open_loop: sl.open_loop || '',
      premise_gate: sl.premise_gate || null, premise_gate_total: premiseTotal(sl.premise_gate),
      creative_leap: sl.creative_leap || '', product_role: sl.product_role || '', payoff: sl.payoff || '',
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
Proof object: ${p.proof_object}
Creative engine: ${p.creative_engine || 'unstated'}
THE PREMISE, build the concept from this and in this order:
  Tension: ${p.tension}
  Open loop: ${p.open_loop}
  Creative leap: ${p.creative_leap}
  Product role: ${p.product_role}
  Payoff: ${p.payoff}`;

/* What the writer produces: the slide, nothing else. Strategy tags travel on
   the package and are stitched in by the parse, so the writer never writes
   toward a label. */
const CD_FORMAT = `Deliver the batch as text, in the skill's slide format, exactly as you would in a working
session. For each concept, in this order:
NNN · Title
Description
Narrative: five bullets
Design Components: five bullets
Hooks: three candidate opening lines (internal, for the script phase and the mockup caption)

The title says why someone would watch, never how the ad is made. The format belongs in Design
Components.

The description follows the skill, word for word: a 2 to 3 sentence summary describing the
creative vehicle (UGC, sketch, trend, interview, b-roll montage, ring cam, mockumentary) and how
the brand or product is woven into it. It tells the reader WHAT KIND of ad this is, not WHAT
HAPPENS in it: the story lives in the narrative bullets, never here. No hooks, no dialogue, no
strategy memo. Format, scene, the one core message, where the brand comes in, the one idea
running through it, in plain speech, and stop.

The narrative beats are where the real-life moment lives, in the voice of this standard:

  His friend yanks the drawer open and dumps forty graded cards onto the bed. Says the quiet
  part: none of it is anything you can wear, drive, or use. Guy pulls out his phone, picks a
  pack by theme, and what comes out is a pair of sneakers, on his feet by Friday.

Write the beats and the design bullets in that voice: one plain sentence each, concrete things
people do and say, no agency register. In the beats people are "he", "his friend", "his
roommate", "the coworker", never "the creator", and never the camera or the cut. Beat 1 opens on
the human trigger from the package, never on a screen or the product. The product enters once,
where the package's chronology and product role say. Beat 5 is the payoff: something a person
says or does that resolves the tension. The proof is the physical product, or one spoken line
about where it came from; interface vocabulary only where the persuasion job cannot be answered
without it, and never in beat 1 or beat 5.
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
would say out loud, household gear, a talking head in a kitchen. A familiar format is fine as the
TREATMENT over a human situation, the way the approved library uses it, and is not a defence when
the format is the whole idea: that is the FORMAT verdict and it stands.
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
Then label the draft in kind: CONCEPT (a human situation that is still a story with the brand
deleted, which the product then resolves), FORMAT (a production device with no situation under
it: a green-screen reply, a desk evidence board, a category menu test), DEMO (the product shown
working) or PRODUCT_WALKTHROUGH (interface evidence in sequence). Delete the brand to decide:
"someone scrolls a menu on a phone" is FORMAT; "a coworker accusing someone of wearing fake
shoes" is CONCEPT. Anything that is not CONCEPT is at least EDIT, and your change_log names the
human situation it needs in beat 1 and the payoff it needs in beat 5; FORMAT or
PRODUCT_WALKTHROUGH with no situation under it at all is REJECT.
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
          /* ChatGPT's ranking (Sept 2026): survivors are ranked on the premise,
             not on cleanliness. Each 1 to 5, scored by the senior reviewer. */
          premise_scores: {
            type: 'object',
            additionalProperties: false,
            properties: {
              human_premise: { type: 'integer' }, tension: { type: 'integer' }, open_loop: { type: 'integer' },
              creative_leap: { type: 'integer' }, payoff: { type: 'integer' }, persuasion_job: { type: 'integer' },
              distinctiveness: { type: 'integer' }, production_feasibility: { type: 'integer' }, product_restraint: { type: 'integer' },
            },
            required: ['human_premise', 'tension', 'open_loop', 'creative_leap', 'payoff', 'persuasion_job', 'distinctiveness', 'production_feasibility', 'product_restraint'],
          },
          /* the taste question: would you send this to the client tomorrow */
          send_to_client: { type: 'boolean' },
        },
        required: ['num', 'verdict', 'source', 'note', 'premise_scores', 'send_to_client'],
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

The governing question is taste, not compliance: would you actually send this to the client
tomorrow, under your own name, as one of the three? Answer it in send_to_client. A concept that
passes every check and that you would still not send is a REWRITE, and your note says what is
missing: usually the premise is ordinary, the product keeps talking after it has been proven, or
the payoff is a shrug.

Then score the premise, 1 to 5 each, as the ranking the selector will use. 5 is the approved
library's best; 1 is a product walkthrough. human_premise (a situation a person would recognise
and repeat), tension (what is at stake between the people), open_loop (the viewer needs to know
what happens), creative_leap (more than a literal picture of the selling argument), payoff (beat
5 resolves the human situation), persuasion_job (it answers the one objection it was built for),
distinctiveness (nothing else in this batch or the approved library is this), production_feasibility
(a creator can shoot it in a day), product_restraint (the product is proven once and then the
people take over: 5 is one product beat, 1 is five). Score the idea, not the wording: a clean
concept with an ordinary premise scores low.

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
production disclaimers, and do not add benefits or products to compensate. A note is never fixed
by adding interface evidence, a screen, a record or a second product mention. A note asking for
brand-specific proof is satisfied by the physical product or one spoken line about where it came
from, at the package's chronology point and never earlier. Beat 1 stays on the human trigger and
beat 5 stays on the human payoff. Plain speech, the way you would pitch it across a table, and every
sentence a note does not touch keeps the Creative Director's words exactly.

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

/* Everything the pipeline reads before a word is written, as one function,
   so the direct mode reads exactly what the pipeline reads: brand record,
   marketing report, client brief, approved library, research, vehicle bank,
   category ads, real harvest, prior batches. Same order, same logs. */
async function intake({ client, prior, priorMeta, log }) {
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
  /* ChatGPT's source hierarchy (Sept 2026): marketing report, then the client
     brief, then the approved concepts, then everything else. The brand brain
     is the "everything else": scraped, capped and the least trustworthy, so
     it goes last. The brief and the approved library are spliced in ahead of
     it rather than appended after it. */
  const BRAIN_HEADING = '\n## BRAND BRAIN, the account record';
  const spliceBeforeBrain = (md, add) => {
    if (!add) return md;
    const at = md.indexOf(BRAIN_HEADING);
    return at > 0 ? md.slice(0, at) + add + md.slice(at) : md + add;
  };
  let snapshot = spliceBeforeBrain(brand.toMarkdown(record), briefMd(brief));
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
  if (approved) snapshot = spliceBeforeBrain(snapshot, '\n\n' + approved.md);

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

  return { record, matched, brief, snapshot, researchMd, vehicles, approved, categoryMd, harvestMd, harvestRec };
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
  /* ChatGPT's source hierarchy (Sept 2026): marketing report, then the client
     brief, then the approved concepts, then everything else. The brand brain
     is the "everything else": scraped, capped and the least trustworthy, so
     it goes last. The brief and the approved library are spliced in ahead of
     it rather than appended after it. */
  const BRAIN_HEADING = '\n## BRAND BRAIN, the account record';
  const spliceBeforeBrain = (md, add) => {
    if (!add) return md;
    const at = md.indexOf(BRAIN_HEADING);
    return at > 0 ? md.slice(0, at) + add + md.slice(at) : md + add;
  };
  let snapshot = spliceBeforeBrain(brand.toMarkdown(record), briefMd(brief));
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
  if (approved) snapshot = spliceBeforeBrain(snapshot, '\n\n' + approved.md);

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
  /* The premise gate rejects premises before the writer sees them, so the
     pool it feeds starts larger than the pool that used to go straight to the
     writer. Batch 28 dropped 4 of 9 and wrote from 5, which left one reserve
     concept for two replacements. Four per shipped concept absorbs the gate's
     rejection rate and still caps at 15. */
  const poolCount = Math.min(15, Math.max(count * 4, count + 4));
  const visSlots = await stageVisualize({
    snapshot, strategy, observations: harvest.observations, viralFormats: harvest.viral_formats,
    poolCount, brief, brandName: record.brand.brand_name, prior, log, ask: trackedAsk,
  });
  /* ChatGPT's gate: the premise is scored and fixed before the Creative
     Director is allowed to write, never after. */
  const gatedSlots = await stagePremiseGate({
    snapshot, slots: visSlots, brandName: record.brand.brand_name, count, log, ask: trackedAsk,
  });
  const vehSlots = await stageVehicles({
    snapshot, visSlots: gatedSlots, vehicles, researchMd, viralFormats: harvest.viral_formats, log, ask: trackedAsk,
  });
  const packages = buildPackages({ visSlots: gatedSlots, vehSlots, startNum });
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
      const issues = harness.lintConcept(c, lintCtx).concat(batchIssues.get(canonNum(c.num)) || [], premiseLint(c, record.brand.brand_name));
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
    v.kind = String(r.kind || 'CONCEPT').toUpperCase();
    if (v.gate !== 'PASS') v.notes.push(`CREATIVE STRATEGIST (${v.gate}): ${r.change_log}`);
    if (v.kind !== 'CONCEPT') v.notes.push(`CREATIVE STRATEGIST: this is a ${v.kind.replace('_', ' ')}, not a concept. Beat 1 must open on the human situation from its package and beat 5 on its payoff; the device moves to Design Components.`);
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
    const ps = r.premise_scores || {};
    v.premise_scores = ps;
    v.premise = Object.values(ps).reduce((a, n) => a + (Number(n) || 0), 0);   // nine dimensions, 45 at most
    v.send = r.send_to_client !== false;
    if (v.final !== 'SHIP') v.notes.push(`FINAL CREATIVE STRATEGY REVIEW (${v.final}, source: ${r.source}): ${r.note}`);
    else if (!v.send) v.notes.push(`FINAL CREATIVE STRATEGY REVIEW (would not send this to the client as it stands): ${r.note}`);
    /* ChatGPT's Open-Loop Gate (Sept 2026), on the written concept rather than
       the premise: below the floor there is nothing the viewer needs resolved,
       or beat 5 does not resolve it, and a concept that only explains a
       decision process is the failure mode. */
    if ((Number(ps.open_loop) || 0) < PREMISE_FLOOR) v.notes.push(`OPEN-LOOP GATE (open loop ${Number(ps.open_loop) || 0}/5): there is nothing here the viewer needs to see resolved. Beats 1 and 2 must raise a question that beat 5 answers, and the question is about the people, not about how the product works.`);
    if ((Number(ps.payoff) || 0) < PREMISE_FLOOR) v.notes.push(`OPEN-LOOP GATE (payoff ${Number(ps.payoff) || 0}/5): beat 5 does not resolve the human situation. End on what a person says or does once the question is answered.`);
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
    /* ChatGPT's ranking (Sept 2026): the premise leads. 45 points of premise
       scores become up to 15 here; the three judges' verdicts add up to 7;
       the penalties are unchanged. The cleanest concept no longer beats the
       most interesting one. */
    sc += (v.premise || 0) / 3;
    /* ChatGPT's priority 5, "rank on premise strength before production
       polish": the gate scored the idea before a word was written, out of 25,
       worth up to 5 here. A clean concept on an ordinary premise now loses to
       an interesting one. */
    sc += (Number((pkgOf.get(canonNum(c.num)) || {}).premise_gate_total) || 0) / 5;
    if (v.send === false) sc -= 2;
    sc += v.gate === 'PASS' ? 2 : v.gate === 'EDIT' ? 1 : 0;
    sc += v.feedback === 'PASS' ? 2 : v.feedback === 'REWORK' ? 1 : 0;
    sc += v.final === 'SHIP' ? 3 : v.final === 'REWRITE' ? 1 : 0;
    sc -= v.hard * 1.5 + v.soft * 0.25;
    sc -= (lint.get(canonNum(c.num)) || []).length * 0.5;
    sc -= !v.kind || v.kind === 'CONCEPT' ? 0 : v.kind === 'DEMO' ? 2 : 3;   // a format is not a concept
    sc += ((Number(c.thumb_stop) || 0) + (Number(c.performance_ready) || 0)) / 10;
    return sc;
  };
  /* The judges are not stable run to run: the same approved concept came
     back 3-of-3 killed on one run and SHIP / REWORK / EDIT on the next. So a
     kill is confirmed before it removes a draft: the final reviewer reads the
     killed drafts once more, and only a second KILL takes one out. */
  let confirmedKill = new Set();
  {
    const candidates = pool.filter(eliminated);
    if (candidates.length) {
      const again = await stageFinalReview({ snapshot, concepts: candidates, strategy, log, ask: trackedAsk, pool: poolInfo, label: 'Final creative strategy review, kill confirmation' });
      for (const r of again.reviews || []) if (r.verdict === 'KILL') confirmedKill.add(canonNum(r.num));
      const spared = candidates.length - confirmedKill.size;
      if (spared) log('Final creative strategy review, kill confirmation', 'done', `${confirmedKill.size} of ${candidates.length} kills confirmed, ${spared} spared and kept in the ranking with the notes`);
    }
  }
  /* ChatGPT's hard constraints (Sept 2026): a format-primary draft cannot
     ship whatever it scores; a rewrite changes wording, not what kind of
     thing it is. Compliance failures and product density are wording, so
     they stay as notes the rewrite must clear, and the recheck below
     replaces whatever still fails. */
  const formatPrimary = (c) => ['FORMAT', 'PRODUCT_WALKTHROUGH'].includes(vOf(c.num).kind);
  /* ChatGPT's Open-Loop Gate as a selection floor: a concept with no open loop
     or no payoff does not ship while anything else can take its place. It is
     never excluded down to fewer than the batch needs, and the log says when
     one shipped below the floor. */
  const loopFloor = (c) => {
    const ps = vOf(c.num).premise_scores;
    if (!ps || !Object.keys(ps).length) return null;   // unscored is not the same as no loop
    const bad = [['open loop', ps.open_loop], ['payoff', ps.payoff]].filter(([, n]) => (Number(n) || 0) < PREMISE_FLOOR);
    return bad.length ? bad.map(([k, n]) => `${k} ${Number(n) || 0}/5`).join(', ') : null;
  };
  const live = pool.filter((c) => !confirmedKill.has(canonNum(c.num)));
  const excluded = live.filter(formatPrimary);
  const byScore = (a, b) => score(b) - score(a);
  /* ChatGPT's governing question is "would I actually send this to a client?",
     so the answer partitions the ranking instead of costing points the judges'
     verdicts can outvote. Batch 26 shipped three concepts the senior reviewer
     would not send and left the one they would in reserve. */
  const wouldSend = (c) => vOf(c.num).send !== false;
  const tier = (c) => (loopFloor(c) ? 2 : 0) + (wouldSend(c) ? 0 : 1);
  const eligible = live.filter((c) => !formatPrimary(c));
  const belowLoop = eligible.filter(loopFloor);
  const notSent = eligible.filter((c) => !wouldSend(c));
  const ranked = eligible.slice().sort((a, b) => tier(a) - tier(b) || byScore(a, b));
  const famOf = (c) => String((pkgOf.get(canonNum(c.num)) || {}).family || c.visual_family || '').toLowerCase().trim();
  const laneOf = (c) => String((pkgOf.get(canonNum(c.num)) || {}).lane || c.lane || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 5);
  /* ChatGPT's diversity rule (Sept 2026): "three different formats" is not
     "three different reasons someone would care". Batches 20, 21 and 22 each
     shipped one engine in three vehicles. Distinct creative engines across the
     shipped set, alongside lanes and vehicle families. */
  const engOf = (c) => String((pkgOf.get(canonNum(c.num)) || {}).creative_engine || '').toLowerCase().trim();
  const survivors = [];
  const usedFam = new Set();
  const usedLane = new Set();
  const usedEng = new Set();
  for (const c of ranked) {                      // the Strategy Map's lanes first: the best of each
    if (survivors.length >= count) break;
    const l = laneOf(c); const f = famOf(c); const e = engOf(c);
    if (!l || usedLane.has(l) || (f && usedFam.has(f)) || (e && usedEng.has(e))) continue;
    survivors.push(c); usedLane.add(l); if (f) usedFam.add(f); if (e) usedEng.add(e);
  }
  for (const c of ranked) {                      // then best first, distinct vehicle families and engines
    if (survivors.length >= count) break;
    if (survivors.includes(c)) continue;
    const f = famOf(c); const e = engOf(c);
    if ((f && usedFam.has(f)) || (e && usedEng.has(e))) continue;
    survivors.push(c); if (f) usedFam.add(f); if (e) usedEng.add(e);
  }
  for (const c of ranked) {                      // short: relax the family rule, keep the engines distinct
    if (survivors.length >= count) break;
    if (survivors.includes(c)) continue;
    const e = engOf(c);
    if (e && usedEng.has(e)) continue;
    survivors.push(c); if (e) usedEng.add(e);
  }
  let relaxed = 0;
  for (const c of ranked) {                      // still short: the best that is left, and say so
    if (survivors.length >= count) break;
    if (!survivors.includes(c)) { survivors.push(c); relaxed++; }
  }
  let reserve = ranked.filter((c) => !survivors.includes(c));
  const killed = pool.filter((c) => confirmedKill.has(canonNum(c.num)));
  log('Selection', 'done',
    `${pool.length} in the pool: ${killed.length} killed by the reviewers, ${survivors.length} kept as the strongest, ${reserve.length} in reserve` +
    (usedEng.size ? `; engines: ${[...usedEng].join(', ')}` : '') +
    (excluded.length ? `; ${excluded.length} excluded as format-primary` : '') +
    (belowLoop.length ? `; ${belowLoop.length} below the open-loop floor (${belowLoop.map((c) => `"${c.title}": ${loopFloor(c)}`).join('; ')})` : '') +
    (notSent.length ? `; ${notSent.length} the senior reviewer would not send as they stand` : '') +
    (survivors.filter((c) => !wouldSend(c)).length ? `; ${survivors.filter((c) => !wouldSend(c)).length} shipped anyway because nothing better was left` : '') +
    (survivors.filter((c) => loopFloor(c)).length ? `; ${survivors.filter((c) => loopFloor(c)).length} shipped below the open-loop floor because nothing else was left` : '') +
    (relaxed ? `; ${relaxed} chosen with the diversity rules relaxed` : '') +
    `; premise scores of the kept: ${survivors.map((c) => vOf(c.num).premise || 0).join('/')}` +
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
    /* The rewrite may not answer a note by adding product evidence. Ricardo's
       doc traced the product-spec register to exactly this loop: judges
       prescribe "brand-specific proof", the rewrite obeys. If a rewritten
       draft mentions the product in more beats than before, or has moved it
       into beat 1, the original stands. */
    const brandRe = brandRegex(record.brand.brand_name);
    const productBeats = (c) => (c.narrative || []).filter((b) => productScene(b, brandRe)).length;
    const firstIsProduct = (c) => productScene((c.narrative || [])[0] || '', brandRe);
    const accepted = [];
    for (const r of rewritten) {
      const before = concepts.find((c) => canonNum(c.num) === canonNum(r.num));
      if (!before) continue;
      if (productBeats(r) > productBeats(before) || (firstIsProduct(r) && !firstIsProduct(before))) {
        log('Creative Director rewrite', 'done', `"${before.title}": rewrite discarded, it answered the notes by adding product evidence (${productBeats(before)} to ${productBeats(r)} beats); the original stands`);
        continue;
      }
      accepted.push(r);
    }
    concepts = mergeByNum(concepts, accepted);
  }

  /* ---- code checks again: a survivor that still fails is replaced, not flagged ---- */
  lint = lintAll(concepts);
  /* Promotion from the reserve keeps the set diverse. Batch 24 shipped two
     visual_structural concepts and two wild-lane concepts because the
     replacement was simply the next in rank: the lane, family and engine
     rules that chose the survivors were not applied to their replacements.
     Prefer, in order: a clean candidate on an unused engine, lane and
     family; then unused engine and family; then unused engine; then any
     clean candidate; then whatever is left. */
  const promote = (why, dropped) => {
    const kept = concepts.filter((c) => c !== dropped);
    const used = (fn) => new Set(kept.map(fn).filter(Boolean));
    const uL = used(laneOf), uF = used(famOf), uE = used(engOf);
    const clean = (c) => !lintAll([c]).size;
    const send = (c) => vOf(c.num).send !== false;
    /* what the senior reviewer would send comes first here too: in Batch 27
       selection honoured the taste question and promotion did not, so a
       replacement was chosen over two concepts the reviewer would have sent. */
    const tiers = [
      (c) => send(c) && !uE.has(engOf(c)) && !uL.has(laneOf(c)) && !uF.has(famOf(c)) && clean(c),
      (c) => send(c) && !uE.has(engOf(c)) && !uF.has(famOf(c)) && clean(c),
      (c) => send(c) && !uE.has(engOf(c)) && clean(c),
      (c) => send(c) && !uE.has(engOf(c)),
      (c) => send(c) && clean(c),
      (c) => send(c),
      (c) => !uE.has(engOf(c)) && clean(c),
      (c) => clean(c),
      () => true,
    ];
    let next = null;
    for (const ok of tiers) { next = reserve.find(ok); if (next) break; }
    if (next) {
      reserve.splice(reserve.indexOf(next), 1);
      log('Selection', 'done', `${why}; "${next.title}" promoted from the reserve (${engOf(next) || 'no engine'}, ${laneOf(next) || 'no lane'}${send(next) ? '' : ', which the senior reviewer would not send'}${clean(next) ? '' : ', still carries code-check notes'})`);
    }
    return next;
  };
  if (lint.size) {
    const kept = [];
    for (const c of concepts) {
      if (!lint.has(canonNum(c.num))) { kept.push(c); continue; }
      const next = promote(`"${c.title}" still fails the code checks after the rewrite (${lint.get(canonNum(c.num)).map((i) => i.code).join(', ')})`, c);
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
      const next = promote(`"${c.title}" ${killNow.has(k) ? 'killed by the final review' : 'still carries a hard compliance fail'} after the rewrite`, c);
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
    pipeline_version: V6 ? 'v8.0.1-opus' : 'v4',
    strategy,
    /* the decisions made before writing, one per pool slot */
    packages,
    visualizations: visSlots.map((sl) => ({ slot: sl.slot, persuasion_job: sl.persuasion_job, chosen: sl.chosen, options: (sl.visualizations || []).map((v) => v.label) })),
    /* the whole pool with every verdict, so the selection can be audited */
    pool: pool.map((c) => {
      const v = vOf(c.num);
      return { num: c.num, title: c.title, gate: v.gate, feedback: v.feedback, final: v.final, hard: v.hard, soft: v.soft,
        lint: (lintAll([c]).get(canonNum(c.num)) || []).map((i) => i.code),
        kind: (V.get(canonNum(c.num)) || {}).kind || null, premise_gate: (pkgOf.get(canonNum(c.num)) || {}).premise_gate || null, premise: (V.get(canonNum(c.num)) || {}).premise || null, premise_scores: (V.get(canonNum(c.num)) || {}).premise_scores || null, send_to_client: (V.get(canonNum(c.num)) || {}).send !== false, outcome: killed.includes(c) ? 'killed' : excluded.includes(c) ? 'excluded_format' : concepts.some((k) => canonNum(k.num) === canonNum(c.num)) ? 'shipped' : 'reserve' };
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


/* The Concept Alignment Review, Ricardo's skill, run as an agent over a batch
   the service just wrote. The skill's deck-building steps do not apply here;
   its method does: every concept against every brand-side source, sourced
   action items graded hard / soft / info, a status per concept, cross-batch
   flags and a keeper set. No unsourced flags, ever. */
const ALIGN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    executive_summary: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'string' } },
    concepts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          num: { type: 'string' },
          title: { type: 'string' },
          status: { type: 'string', enum: ['Keep', 'Reposition', 'Rewrite', 'Rebuild', 'Drop'] },
          persona_match: { type: 'string' },
          action_items: {
            type: 'array', minItems: 1, maxItems: 3,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                severity: { type: 'string', enum: ['hard', 'soft', 'info'] },
                headline: { type: 'string' },
                source: { type: 'string' },
                fix: { type: 'string' },
              },
              required: ['severity', 'headline', 'source', 'fix'],
            },
          },
        },
        required: ['num', 'title', 'status', 'persona_match', 'action_items'],
      },
    },
    cross_batch_flags: {
      type: 'array', maxItems: 4,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          headline: { type: 'string' },
          evidence: { type: 'string' },
          source: { type: 'string' },
          recommendation: { type: 'string' },
        },
        required: ['headline', 'evidence', 'source', 'recommendation'],
      },
    },
    keeper_set: { type: 'array', items: { type: 'string' } },
    held_back: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { num: { type: 'string' }, reason: { type: 'string' } }, required: ['num', 'reason'] } },
  },
  required: ['executive_summary', 'concepts', 'cross_batch_flags', 'keeper_set', 'held_back'],
};

/* The agency's own review of the generator's output, 2026-09-09, as a source
   the alignment reviewer may cite. Speaker-attributed, the way the skill wants
   its sources. These are the team's standing asks, not a client's. */
const AGENCY_REVIEW_NOTES = `## AGENCY REVIEW NOTES, Creative AdBundance, OS Concept Writer Review call, 2026-09-09
Cite as: CAB review call 9/9: <speaker> — "<quote>"
- Krithika — "the moment I look at the mockup, it is not quite clear what exactly is this concept going to be about. The headline or what the mockup hook says needs to clearly give the idea at the first glance what is the core message."
- Krithika — "all of them need not be a talking head. The podcast has been working for them, street interview has been working for them. We need to look at variety in terms of format: what would be the best match for a specific message."
- Krithika — "the kind of persona that we have chosen, I'm not sure if that's the persona they would be targeting. It could be changed into a different job category so that it's more at par with the customer persona the client wants to target."
- Krithika — "she tells that this many people visited this month, I generated this much revenue, I got this many inquiries, so that it makes it more solid." Ricardo — "So, hard stats."
- Krithika — "will we be able to execute with a UGC creator remotely." Ricardo — "making sure the concepts can be shot by one person."
- Krithika — "setting of more contextual overlays rather than going very broad."
- Ricardo — "the name of the concept needs to be a little more descriptive."
- Ricardo — "the skill creates the personas first and then creates the concept based on those personas. It just generated random personas for each concept."
- Krithika — "it should always generate based on what the critical info says."`;

async function stageAlignment({ snapshot, strategy, concepts, log, ask, label }) {
  const name = label || 'Concept alignment review';
  log(name, 'running');
  const out = await ask({
    system: `You are running Creative AdBundance's Concept Alignment Review over a batch the concept generator just wrote, before it reaches anyone. The skill below is your method. You are not building the .pptx here: the deck steps, the design system and the build workflow do not apply. Everything else does, exactly as written: read every source before you flag, the six questions per concept, the severity coding and its proportions, the statuses (Keep / Reposition / Rewrite / Rebuild / Drop, never an ambiguous one), the keeper set with a reason for anything held back, the voice, and above all the sourcing rule: no unsourced flags, ever. A concern you cannot source is not a flag.

${otherSkill('concept-alignment-review', 'SKILL.md')}

How to phrase every SOURCE line:

${otherSkill('concept-alignment-review', 'references/sourcing-cheatsheet.md')}
${HOUSE_RULES}`,
    prompt: `THE BRAND-SIDE SOURCES, everything on file for this client. The marketing report, the client brief from the account team, the approved concept library and the brand record are below; cite them by their section headings.

${snapshot}

${strategy ? strategyBrief(strategy) + '\n\nThe Batch Strategy Map above is a source too: cite it for persona and allocation flags ("Batch Strategy Map, persona 2").\n' : ''}
${AGENCY_REVIEW_NOTES}

THE CONCEPT BATCH TO REVIEW, as written:
${concepts.map((c) => `### ${c.num} · ${c.title}\n${c.desc}\nNarrative:\n${(c.narrative || []).map((b) => '- ' + b).join('\n')}\nDesign components:\n${(c.design || []).map((d) => '- ' + d).join('\n')}\nHooks (internal, the mockup caption comes from these): ${(c.hooks || []).join(' | ')}\nTags: persona="${c.persona}" lane="${c.lane}" vehicle="${c.vehicle}" duration="${c.dur}"`).join('\n\n')}

Run the skill's flag analysis over every concept: (a) the narrative spine and beat order, (b) any voice do or don't line, (c) any claim the record cannot substantiate, or a hard stat the record HAS that the concept leaves on the table, (d) the brief's audience and the Strategy Map's persona for that row, (e) production against a single remote creator at home, (f) protecting what has worked for this client. Then the cross-batch flags: missing audience, missing angle, format concentration (three talking heads is a pattern), banned-language pattern, contradiction with a client statement, production overload. Every concept gets a status and one to three action items with a SOURCE. Every concept number and title you write is copied from the batch, never paraphrased. The keeper set is the concepts you would lead the client call with; hold back with a specific reason, not a vibe.`,
    schema: ALIGN_SCHEMA,
    model: REVIEW_MODEL,
    maxTokens: 32000,
  });
  const st = (out.concepts || []).reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {});
  const hard = (out.concepts || []).reduce((a, r) => a + (r.action_items || []).filter((i) => i.severity === 'hard').length, 0);
  log(name, 'done', `${Object.entries(st).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(', ') || 'no statuses'}; ${hard} hard flag${hard === 1 ? '' : 's'}, ${(out.cross_batch_flags || []).length} cross-batch, keeper set ${(out.keeper_set || []).join(', ') || 'none named'}`);
  return out;
}

/* The direct writer's contract, shared by the first pass and the revision. */
function directSlideContract({ n, startNum, brandName, approved }) {
  return `${n} concept${n === 1 ? '' : 's'}, numbered from ${String(startNum).padStart(3, '0')}, in the slide format and nothing else:
NNN · Title
Description
Narrative: five bullets
Design Components: five bullets
Hooks: three candidate opening lines

The description is two or three sentences a reader can understand the ad from without reading
the beats. The first clause names the kind of ad (the vehicle: UGC talking head, two-hander,
ring cam, sketch). The rest says what the ad is about: the real-life moment and what is at
stake in it, told plainly the way you would pitch it across a table, and where ${brandName}
comes in and what it settles. Not a list of what happens, and not a format label with a vague
story after it; the point of the ad has to be in it.${approved ? ' The APPROVED CONCEPT LIBRARY above shows this client\'s descriptions: write to that shape.' : ''}
Give every concept the same care whether you are writing one or ${n}: each one gets its full
five beats, its full description and its own situation.`;
}

async function liftDirect({ text, brandName, startNum, log, ask, label }) {
  log(label || 'Lift', 'running');
  const lifted = await ask({
    system: `You convert a Creative Director's concept batch, written as text in a slide format, into JSON. You copy; you never rewrite. Title, description, every narrative bullet, every design bullet and every hook are reproduced VERBATIM, character for character. Where the text has fewer than five narrative or design bullets, keep exactly what is there and invent nothing. Keep the concept numbers as written (NNN); number in order of appearance only if the text has none. The tag fields (objective, persona, selling_argument, awareness, lane, dur, vehicle, visual_family, observation, insight_family, persuasion_job) are not in the text: infer each in a few plain words from the concept itself, for the brand ${brandName}. logline is the situation in the customer's own voice in one sentence; thumb_stop and performance_ready are your honest 1 to 5 read of the text. composition_note is "direct".`,
    prompt: `THE BATCH TEXT:\n${text}`,
    schema: BATCH_SCHEMA,
    maxTokens: 48000,
    model: REVIEW_MODEL,
  });
  const concepts = (lifted.concepts || []).map((c, i) => ({ ...c, num: String(String(c.num || '').replace(/\D/g, '') || (startNum + i)).padStart(3, '0') }));
  log(label || 'Lift', 'done', `${concepts.length} concept${concepts.length === 1 ? '' : 's'} lifted verbatim`);
  return { concepts, usage: lifted.__usage };
}

function directCodeChecks({ concepts, brief, snapshot, brandName, log, label }) {
  let flagged = 0; const codes = {};
  try {
    const lintCtx = harness.context({ brief, snapshot, library: store.libraryConcepts(brandName) });
    const batchIssues = harness.lintBatch(concepts, lintCtx);
    for (const c of concepts) {
      const issues = harness.lintConcept(c, lintCtx).concat(batchIssues.get(canonNum(c.num)) || [], premiseLint(c, brandName));
      c.flags = issues.map((i) => ({ code: i.code, field: i.field, detail: i.detail }));
      if (issues.length) flagged++;
      for (const i of issues) codes[i.code] = (codes[i.code] || 0) + 1;
    }
  } catch (err) { log(label || 'Code checks', 'done', 'could not run the checks (' + err.message.slice(0, 80) + ')'); return flagged; }
  log(label || 'Code checks', 'done', flagged
    ? `${flagged} of ${concepts.length} carry flags for a person to read (${Object.entries(codes).map(([k, v]) => `${k} x${v}`).join(', ')})`
    : `every concept clears the checks`);
  return flagged;
}

/* The client evidence pack (Carl, 2026-09-10). Everything below is already in
   the record or on disk; this step only pulls it into one place the writer
   and the reviewers can hold: the verifiable figures and comparisons with
   their source section, what has worked and what has not, and what this
   client has already run. Nothing here is invented: a figure that is not in
   the record does not appear, and the reviewers already fail invented ones. */
const EVIDENCE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    hard_stats: {
      type: 'array', maxItems: 25,
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          figure: { type: 'string' },
          statement: { type: 'string' },
          kind: { type: 'string', enum: ['stat', 'comparison', 'proof', 'offer'] },
          source: { type: 'string' },
          usable_in_paid: { type: 'boolean' },
        },
        required: ['figure', 'statement', 'kind', 'source', 'usable_in_paid'],
      },
    },
    what_worked: { type: 'array', maxItems: 12, items: { type: 'object', additionalProperties: false, properties: { what: { type: 'string' }, why: { type: 'string' }, source: { type: 'string' } }, required: ['what', 'why', 'source'] } },
    what_did_not: { type: 'array', maxItems: 12, items: { type: 'object', additionalProperties: false, properties: { what: { type: 'string' }, source: { type: 'string' } }, required: ['what', 'source'] } },
    competitors: { type: 'array', maxItems: 8, items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, where_we_win: { type: 'string' }, source: { type: 'string' } }, required: ['name', 'where_we_win', 'source'] } },
    open_questions: { type: 'array', maxItems: 8, items: { type: 'string' } },
  },
  required: ['hard_stats', 'what_worked', 'what_did_not', 'competitors', 'open_questions'],
};

async function stageEvidence({ snapshot, client, log, ask }) {
  log('Client evidence pack', 'running');
  /* what this client has already run, from the batches on disk: code, no model */
  const usedVehicles = [...new Set((store.usedVehicles(client, 60) || []).map((v) => String(v).trim()).filter(Boolean))];
  const usedPersonas = [], usedTitles = [], usedFamilies = new Set();
  for (const { concept: c } of store.libraryConcepts(client)) {
    if (c.persona && !usedPersonas.includes(c.persona)) usedPersonas.push(String(c.persona).slice(0, 90));
    if (c.title) usedTitles.push(String(c.title).slice(0, 70));
    if (c.visual_family) usedFamilies.add(String(c.visual_family).toLowerCase().trim());
  }
  let out;
  try {
    out = await ask({
      system: `You compile a client evidence pack for a creative team from the client's own record. You extract; you never invent. Every item carries the section of the record it came from, named the way the heading reads. A figure is only a figure if the record states it; a comparison is only a comparison if the record makes it. If the record has no hard numbers, hard_stats is short and that is the honest answer.`,
      prompt: `THE CLIENT'S RECORD:

${snapshot}

Compile:
1. hard_stats: every verifiable figure, comparison and proof point a paid ad could stand on (customer counts, results, times, prices, guarantees, ratings, "X versus the competitor" claims, mechanism facts). For each: the figure as written, the plain statement it supports, its kind, its source section, and whether it is usable in paid creative given the record's own compliance guardrails.
2. what_worked: formats, angles, hooks, personas or claims the record says performed or the client approved and kept, each with why and its source.
3. what_did_not: what the record says underperformed, was rejected, or is banned, with its source.
4. competitors: named competitors and the record's own statement of where this brand wins against each.
5. open_questions: contradictions inside the record (one section says X, another says not-X) that a person must settle before the claim ships.`,
      schema: EVIDENCE_SCHEMA,
      maxTokens: 16000,
      model: REVIEW_MODEL,
    });
  } catch (err) {
    log('Client evidence pack', 'done', 'could not compile the pack (' + String(err.message || err).slice(0, 80) + '); the run continues on the record alone');
    out = { hard_stats: [], what_worked: [], what_did_not: [], competitors: [], open_questions: [] };
  }
  const usable = out.hard_stats.filter((h) => h.usable_in_paid);
  const md = `## CLIENT EVIDENCE PACK, compiled from the record and this client's own batches
Hard stats on file, usable in paid creative (${usable.length}). Use a figure only as written here, with its source; where a beat needs proof and one of these fits, it belongs there:
${usable.map((h) => `- ${h.figure}: ${h.statement} [${h.kind}; ${h.source}]`).join('\n') || '- none the record can stand behind'}
${out.hard_stats.length > usable.length ? `\nOn file but NOT cleared for paid creative (${out.hard_stats.length - usable.length}): ${out.hard_stats.filter((h) => !h.usable_in_paid).map((h) => h.figure).join('; ')}\n` : ''}
What has worked for this client:
${out.what_worked.map((w) => `- ${w.what}: ${w.why} [${w.source}]`).join('\n') || '- nothing recorded'}

What has not, or is out of bounds:
${out.what_did_not.map((w) => `- ${w.what} [${w.source}]`).join('\n') || '- nothing recorded'}

Competitors and where this brand wins:
${out.competitors.map((c) => `- ${c.name}: ${c.where_we_win} [${c.source}]`).join('\n') || '- none named in the record'}
${out.open_questions.length ? `\nContradictions in the record, unsettled (do not build a claim on either side): ${out.open_questions.join(' | ')}\n` : ''}
Already run for this client, do not repeat (from ${usedTitles.length} earlier concepts):
- Vehicles used: ${usedVehicles.slice(0, 40).join('; ') || 'none on file'}
- Visual families used: ${[...usedFamilies].slice(0, 30).join('; ') || 'none on file'}
- Personas already written for: ${usedPersonas.slice(0, 20).join('; ') || 'none on file'}`;
  log('Client evidence pack', 'done',
    `${usable.length} hard stat${usable.length === 1 ? '' : 's'} usable in paid (${out.hard_stats.length} on file), ${out.what_worked.length} worked, ${out.what_did_not.length} did not, ${out.competitors.length} competitor${out.competitors.length === 1 ? '' : 's'}, ${out.open_questions.length} open question${out.open_questions.length === 1 ? '' : 's'}; ${usedVehicles.length} vehicles and ${usedPersonas.length} personas already run`);
  return { ...out, usedVehicles, usedPersonas, usedFamilies: [...usedFamilies], usedTitles, md };
}

/* Vehicle selection per Strategy Map row, from the WHOLE bank (Carl,
   2026-09-10). The writer used to pick a vehicle inside its one pass from a
   random sample of 30; now the skill's Sub-procedure 3 runs as its own step
   over all the bank's vehicles plus the researched ones, the client's used
   vehicles and families are excluded in code, and distinct families across
   the rows are enforced in code. */
const ROW_VEH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    rows: {
      type: 'array', minItems: 1,
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          row: { type: 'integer' },
          keywords: { type: 'array', minItems: 3, maxItems: 5, items: { type: 'string' } },
          candidates: {
            type: 'array', minItems: 3, maxItems: 5,
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                vehicle: { type: 'string' }, family: { type: 'string' }, source: { type: 'string' },
                message_fit: { type: 'integer', minimum: 1, maximum: 5 }, persona_fit: { type: 'integer', minimum: 1, maximum: 5 },
                freshness: { type: 'integer', minimum: 1, maximum: 5 }, producibility: { type: 'integer', minimum: 1, maximum: 5 },
              },
              required: ['vehicle', 'family', 'source', 'message_fit', 'persona_fit', 'freshness', 'producibility'],
            },
          },
          winner: {
            type: 'object', additionalProperties: false,
            properties: { vehicle: { type: 'string' }, family: { type: 'string' }, why: { type: 'string' }, one_creator_at_home: { type: 'boolean' } },
            required: ['vehicle', 'family', 'why', 'one_creator_at_home'],
          },
        },
        required: ['row', 'keywords', 'candidates', 'winner'],
      },
    },
  },
  required: ['rows'],
};

const normFam = (x) => String(x || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

async function stageRowVehicles({ snapshot, strategy, evidence, bank, researchMd, log, ask }) {
  log('Vehicle selection', 'running', `Sub-procedure 3 over ${bank ? bank.count : 0} bank vehicles${researchMd ? ' and the researched ones' : ''}`);
  const rows = [];
  (strategy.allocation || []).forEach((a, i) => { for (let k = 0; k < (a.slots || 1); k++) rows.push({ row: rows.length + 1, ...a }); });
  const usedV = new Set((evidence.usedVehicles || []).map((v) => normFam(v)));
  const usedF = new Set((evidence.usedFamilies || []).map(normFam));
  const out = await ask({
    system: `You are the Creative Director on this account, running the skill's Vehicle Candidate Search and Fit-Check for every row of the Batch Strategy Map, before a word of concept is written.\n\n${SKILL_PREFACE}\n\n${skillDoc()}\n\nYour libraries:\n\n${ref('libraries.md')}\n${HOUSE_RULES}`,
    prompt: `${snapshot}

${evidence.md}

${strategyBrief(strategy)}

THE VEHICLE POOLS.
${bank ? bank.md : '(the curated bank is unreachable this run)'}
${researchMd ? '\n' + researchMd : ''}

${skillSection('**Sub-procedure 3: Vehicle Candidate Search', '**All v6 rules apply, plus:**')}

Run Sub-procedure 3 for each of these ${rows.length} rows:
${rows.map((r) => `Row ${r.row}: persona "${r.persona}"; selling argument "${r.selling_argument}"; objective "${r.objective}".`).join('\n')}

For each row: 3 to 5 shape keywords for how that persona's world and that selling argument want
to be seen; a candidate table of 3 to 5 vehicles drawn from the pools above (name them as the
bank names them, source "bank", "researched" or "original"), at least one wild, captured or
parody candidate, scored 1 to 5 on the four axes; the winner and why, and whether one creator can
shoot it at home. Vehicles and visual families listed under "Already run for this client" score
freshness 1 and cannot win. No two rows may share a vehicle family, and the batch as a whole may
not be more than half talking heads or desk-and-phone setups (the skill's rule 5): if the pattern
default wins more than half, redo the table with the wild pool forced in.`,
    schema: ROW_VEH_SCHEMA,
    maxTokens: 32000,
  });
  /* code enforces what the prompt asked for: no used vehicle, no used family,
     no family twice; fall back to the next candidate in score order */
  const takenF = new Set();
  const chosen = rows.map((r) => {
    const o = (out.rows || []).find((x) => Number(x.row) === r.row) || { candidates: [], winner: null };
    const ranked = [...(o.candidates || [])].sort((a, b) => (b.message_fit + b.persona_fit + b.freshness + b.producibility) - (a.message_fit + a.persona_fit + a.freshness + a.producibility));
    const ok = (c) => c && !usedV.has(normFam(c.vehicle)) && !usedF.has(normFam(c.family)) && !takenF.has(normFam(c.family));
    let pick = o.winner && ok(o.winner) ? o.winner : ranked.find(ok) || o.winner || ranked[0] || null;
    const swapped = pick && o.winner && pick.vehicle !== o.winner.vehicle;
    if (pick) takenF.add(normFam(pick.family));
    return { row: r.row, persona: r.persona, selling_argument: r.selling_argument, objective: r.objective, keywords: o.keywords || [],
      vehicle: pick ? pick.vehicle : null, family: pick ? pick.family : null, why: pick ? (pick.why || `next candidate in score order after the winner collided with a used vehicle or family`) : null,
      one_creator_at_home: pick && pick.one_creator_at_home != null ? pick.one_creator_at_home : null, swapped, candidates: o.candidates || [] };
  });
  const fams = new Set(chosen.map((c) => normFam(c.family)).filter(Boolean));
  log('Vehicle selection', 'done', `${chosen.filter((c) => c.vehicle).length} of ${rows.length} rows have a vehicle, ${fams.size} distinct famil${fams.size === 1 ? 'y' : 'ies'}${chosen.some((c) => c.swapped) ? `, ${chosen.filter((c) => c.swapped).length} winner${chosen.filter((c) => c.swapped).length === 1 ? '' : 's'} replaced in code for colliding with a used vehicle or family` : ''}: ${chosen.map((c) => `row ${c.row} ${c.vehicle || 'none'}`).join('; ')}`);
  const md = `## VEHICLE PER ROW, chosen by the vehicle selector from the whole bank (this client's used vehicles and families excluded)
${chosen.map((c) => `- Row ${c.row} (${c.persona}; ${c.selling_argument}): ${c.vehicle || 'no vehicle found'}${c.family ? ` [family: ${c.family}]` : ''}${c.one_creator_at_home === false ? ' (needs more than one creator at home: the writer must bring it back to one)' : ''}. ${c.why || ''}`).join('\n')}
Each concept is written IN its row's vehicle. The vehicle is the shape of the video; the story is the persona's.`;
  return { rows: chosen, md };
}

/* Carl's direct mode (Sept 2026): one long prompt to Opus 5 with the whole
   snapshot and the whole skill, the way the skill runs in Claude web. The
   model does Step Zero, the harvest, the visualization, the vehicle and the
   writing in one head, and nobody edits it afterwards. The deterministic
   checks still run, but they FLAG for a person to read; they never rewrite
   and never replace. */
async function runDirect({ client, count = 1, prior = '', priorMeta = null, startNum = 1, log }) {
  const spend = [];
  const track = (u) => { if (u) spend.push(u); };
  const t0 = Date.now();
  const { record, brief, snapshot, researchMd, vehicles, approved, categoryMd, harvestMd, harvestRec } =
    await intake({ client, prior, priorMeta, log });
  const brandName = record.brand.brand_name;
  const n = Math.min(Math.max(Number(count) || 1, 1), 16);
  const trackedAsk = async (args) => { const o = await ask(args); if (o && o.__usage) { track(o.__usage); delete o.__usage; } return o; };

  /* 0. the client evidence pack: hard stats, what worked, what this client has run */
  const evidence = await stageEvidence({ snapshot, client, log, ask: trackedAsk });
  const snapshotPlus = snapshot + '\n\n' + evidence.md;

  /* 1. Step Zero as its own agent: the Batch Strategy Map, personas first */
  const strategy = await stageStrategy({ snapshot: snapshotPlus, count: n, log, ask: trackedAsk, researchMd });
  const strategyMd = strategyBrief(strategy);

  /* 1b. the vehicle for each row, from the whole bank, in code-enforced distinct families */
  let bankAll = null;
  try { bankAll = await vehicleMenu(store.usedVehicles(client, 60), { all: true }); } catch { bankAll = null; }
  const rowVeh = await stageRowVehicles({ snapshot, strategy, evidence, bank: bankAll, researchMd, log, ask: trackedAsk });

  /* 2. the one pass with the whole skill, written against the map */
  log('Creative Director, one pass', 'running', `one call, the whole skill, ${n} concept${n === 1 ? '' : 's'} against the Strategy Map`);
  const system = `You are the Creative Director on this account.\n\n${SKILL_PREFACE}\n\n${skillDoc()}\n\nYour craft rules:\n\n${ref('craft-rules.md')}\n\nYour libraries:\n\n${ref('libraries.md')}\n\nThe creative strategist's reference:\n\n${ref('creative-strategist.md')}\n${HOUSE_RULES}`;
  const materials = `${snapshot}
${researchMd ? '\n' + researchMd + '\n' : ''}${vehicles ? '\nTHE VEHICLE BANK, researched vehicles you may draw on:\n' + vehicles.md + '\n' : ''}${harvestMd ? '\n' + harvestMd + '\n' : ''}${categoryMd ? '\n' + categoryMd + '\n' : ''}
${evidence.md}

${strategyMd}

${rowVeh.md}

ALREADY DONE FOR THIS CLIENT. Do not repeat these, in idea or in situation:
${prior || '(nothing on file)'}`;
  const prompt = `${materials}

Step Zero has been run by the Strategic Analyst: the Batch Strategy Map above is the map. Write
each concept against ONE allocation row of it: that row's persona is the person in the ad, that
row's selling argument is what the ad is about, and the duration and format mix are the map's.
Sub-procedure 3 has been run too: each row's vehicle is chosen above, from the whole bank with
this client's used vehicles excluded, so build the concept IN that vehicle rather than choosing
another. Where a beat needs proof, the CLIENT EVIDENCE PACK lists the figures the record can
stand behind; use one as written, or none.
Then run the rest of the skill yourself, in this one pass, exactly as you would in a Claude web
session with all of this material in front of you: the observation harvest, message
visualization, the vehicle choice, the writing, and your own review against the skill's checks
before you hand it over. Do all of that work in your head, the way the skill runs silent: no
observation list, no visualizations, no notes, no preamble and no review appear in your answer.
A senior reviewer and an alignment reviewer read what you write next, against the client's
sources; what passes them is what the client sees. The ONLY text you return is
${directSlideContract({ n, startNum, brandName, approved })}`;

  const out = await askText({ system, prompt, maxTokens: 32000 });
  const text = typeof out === 'string' ? out : String((out && (out.text || out.content)) || '');
  track(out && (out.__usage || out.usage));
  log('Creative Director, one pass', 'done', `${text.length} characters in ${Math.round((Date.now() - t0) / 1000)}s`);

  const first = await liftDirect({ text, brandName, startNum, log, ask, label: 'Lift' });
  track(first.usage);
  let concepts = first.concepts;
  directCodeChecks({ concepts, brief, snapshot, brandName, log });

  /* 3. the checkpoints: the skill's Final Creative Strategy Reviewer, then the
        Concept Alignment Review, each its own agent reading the whole batch */
  const rounds = [];
  const judge = async (list, label) => {
    const fin = await stageFinalReview({ snapshot: snapshotPlus, concepts: list, strategy, log, ask: trackedAsk, label: label ? `Final creative strategy review, ${label}` : undefined });
    const align = await stageAlignment({ snapshot: snapshotPlus, strategy, concepts: list, log, ask: trackedAsk, label: label ? `Concept alignment review, ${label}` : undefined });
    const decisions = list.map((c) => {
      const k = canonNum(c.num);
      const f = (fin.reviews || []).find((r) => canonNum(r.num) === k) || {};
      const a = (align.concepts || []).find((r) => canonNum(r.num) === k) || {};
      const hard = (a.action_items || []).filter((i) => i.severity === 'hard');
      const rebuild = f.verdict === 'KILL' || a.status === 'Drop' || a.status === 'Rebuild';
      const rewrite = !rebuild && (f.verdict === 'REWRITE' || a.status === 'Rewrite' || a.status === 'Reposition' || hard.length > 0);
      const notes = [];
      if (f.verdict && f.verdict !== 'SHIP') notes.push(`FINAL CREATIVE STRATEGY REVIEW (${f.verdict}${f.source ? ', source: ' + f.source : ''}): ${f.note}`);
      for (const i of a.action_items || []) if (i.severity !== 'info') notes.push(`ALIGNMENT (${i.severity.toUpperCase()}) ${i.headline} SOURCE: ${i.source} FIX: ${i.fix}`);
      return { num: c.num, final: f.verdict || 'unreviewed', alignment: a.status || 'unreviewed', hard: hard.length, action: rebuild ? 'rebuild' : rewrite ? 'rewrite' : 'ship', notes,
        why: [f.note ? `Senior reviewer: ${f.note}` : null, a.persona_match ? `Persona: ${a.persona_match}` : null].filter(Boolean).join(' ') };
    });
    /* two concepts in one visual family is range failing in code, not a note
       for later: the lower-ranked one is rewritten in a distinct vehicle */
    const seenFam = new Map();
    for (const c of list) {
      const f = normFam(c.visual_family || c.vehicle);
      if (!f) continue;
      if (seenFam.has(f)) {
        const d = decisions.find((x) => canonNum(x.num) === canonNum(c.num));
        if (d && d.action === 'ship') d.action = 'rewrite';
        if (d) d.notes.push(`RANGE (code check): this concept shares the visual family "${c.visual_family || c.vehicle}" with concept ${seenFam.get(f)}. Rewrite it in a distinct vehicle from the VEHICLE PER ROW list or the bank, keeping its persona, selling argument and story.`);
      } else seenFam.set(f, c.num);
    }
    rounds.push({ label: label || 'first read', final_review: fin, alignment: align, decisions });
    return decisions;
  };
  let decisions = await judge(concepts);

  /* 4. one revision by the same Creative Director, then the checkers read the
        changed concepts once more; what still fails ships flagged */
  const toFix = decisions.filter((d) => d.action !== 'ship');
  let revised = [];
  if (toFix.length) {
    log('Creative Director, revision', 'running', `${toFix.filter((d) => d.action === 'rebuild').length} to rebuild, ${toFix.filter((d) => d.action === 'rewrite').length} to rewrite`);
    const items = toFix.map((d) => {
      const c = concepts.find((x) => canonNum(x.num) === canonNum(d.num));
      return `--- ${c.num} · ${c.title} : ${d.action.toUpperCase()} ---
CURRENT:
${c.desc}
Narrative:
${(c.narrative || []).map((b) => '- ' + b).join('\n')}
Design Components:
${(c.design || []).map((x) => '- ' + x).join('\n')}
Hooks: ${(c.hooks || []).join(' | ')}
Strategy Map row it was written against: persona "${c.persona}", selling argument "${c.selling_argument}", lane "${c.lane}".
THE REVIEWERS' NOTES, binding:
${d.notes.join('\n')}`;
    }).join('\n\n');
    const rev = await askText({
      system,
      prompt: `${materials}

You wrote this batch. The Final Creative Strategy Reviewer and the Concept Alignment Reviewer have
read it against the client's sources, and their notes below are binding. Two kinds of work:
REBUILD means the concept is replaced: a new idea on the SAME Strategy Map row (same persona, same
selling argument, same lane and duration), not a repair of the old one, and not a repeat of
anything already done for this client. REWRITE means the same concept with each note answered at
the line it names: fix what is quoted, keep everything the notes do not touch word for word, do
not add hedges or disclaimers, do not add product evidence to answer a note about story, and
where a note asks for a hard stat use only a figure that is in the sources above.
Return ONLY the concepts below, keeping their numbers, as
${directSlideContract({ n: toFix.length, startNum: Number(toFix[0].num), brandName, approved })}

${items}`,
      maxTokens: 32000,
    });
    const rtext = typeof rev === 'string' ? rev : String((rev && (rev.text || rev.content)) || '');
    track(rev && (rev.__usage || rev.usage));
    log('Creative Director, revision', 'done', `${rtext.length} characters`);
    const second = await liftDirect({ text: rtext, brandName, startNum: Number(toFix[0].num), log, ask, label: 'Lift, revision' });
    track(second.usage);
    revised = second.concepts.filter((c) => toFix.some((d) => canonNum(d.num) === canonNum(c.num)));
    if (revised.length) {
      concepts = mergeByNum(concepts, revised);
      directCodeChecks({ concepts, brief, snapshot, brandName, log, label: 'Code checks, after revision' });
      const again = await judge(revised, 'second read');
      decisions = decisions.map((d) => again.find((x) => canonNum(x.num) === canonNum(d.num)) || d);
    } else {
      log('Creative Director, revision', 'error', 'the revision returned no readable concepts, so the first drafts stand with their notes');
    }
  }

  /* 5. the record: what each concept was judged, and why, for a person */
  for (const c of concepts) {
    const d = decisions.find((x) => canonNum(x.num) === canonNum(c.num)) || {};
    c.review = { final: d.final, alignment: d.alignment, hard_flags: d.hard || 0, outcome: d.action === 'ship' ? 'passed' : `still ${d.action} after revision`, why: d.why || '' };
    if (d.action && d.action !== 'ship') {
      c.flag = `${d.final} from the senior reviewer, ${d.alignment} from the alignment review after one revision; read the notes before this ships`;
      c.review_notes = d.notes;
    } else if (d.notes && d.notes.length) {
      c.review_notes = d.notes.filter((x) => x.startsWith('ALIGNMENT (SOFT)'));
    }
  }
  const passed = concepts.filter((c) => c.review && c.review.outcome === 'passed').length;
  log('Deck ready', 'done', `${concepts.length} concept${concepts.length === 1 ? '' : 's'}, ${passed} passed both reviewers${passed < concepts.length ? `, ${concepts.length - passed} carrying a flag for a person` : ''}, 9:16 space reserved`);

  const last = rounds[rounds.length - 1] || {};
  return {
    client: brandName, concepts, pipeline_version: 'v8.3-direct-evidence', mode: 'direct',
    observations: [], harvest_notes: null, composition_note: 'direct', change_log: [], composition: null,
    strategy,
    evidence: { hard_stats: evidence.hard_stats, what_worked: evidence.what_worked, what_did_not: evidence.what_did_not, competitors: evidence.competitors, open_questions: evidence.open_questions, used_vehicles: evidence.usedVehicles, used_personas: evidence.usedPersonas },
    row_vehicles: rowVeh.rows,
    packages: [], visualizations: [],
    pool: concepts.map((c) => ({ num: c.num, title: c.title, outcome: c.review && c.review.outcome === 'passed' ? 'shipped' : 'shipped, flagged', final: c.review && c.review.final, alignment: c.review && c.review.alignment, lint: (c.flags || []).map((f) => f.code), direct: true })),
    feedback: null, compliance: null,
    final_review: rounds[0] ? rounds[0].final_review : null,
    alignment: rounds[0] ? rounds[0].alignment : null,
    review_rounds: rounds.map((r) => ({ label: r.label, decisions: r.decisions, final_review: r.final_review, alignment: r.alignment })),
    revised: revised.map((c) => c.num),
    brand_fields: [record.snap, record.plan, record.rules.length, record.products.length].filter(Boolean).length,
    used_marketing_plan: Boolean(record.plan),
    cost_usd: Math.round(spend.reduce((a, u) => a + (u && u.cost || 0), 0) * 100) / 100,
    used_research: Boolean(researchMd), used_harvest: Boolean(harvestMd), harvest_id: harvestRec ? harvestRec.id : null,
    has_brand_visuals: (record.colors || []).length > 0 && (record.fonts || []).length > 0,
    production_notes: brief.production_notes || null, used_approved_library: Boolean(approved), used_category_ads: Boolean(categoryMd),
    pool_size: concepts.length, lint_rounds: revised.length ? 1 : 0, lint_remaining: concepts.filter((c) => (c.flags || []).length).length,
    cd_markdown: text.slice(0, 120000),
    seconds: Math.round((Date.now() - t0) / 1000),
  };
}

/* Carl's bypass (Sept 2026): a batch written in Claude web, pasted in as text
   in the slide format, becomes the same record a pipeline run produces, so it
   shows in the OS, gets mockups and counts as a batch. Copied verbatim; the
   strategy tags are not in the text, so they are inferred and say so. */
async function importBatch({ client, text, requestedBy, log }) {
  const { record } = await brand.resolve(client);
  const brandName = record.brand.brand_name;
  log('Import', 'running', `${text.length} characters pasted`);
  const out = await ask({
    system: `You convert a Creative Director's concept batch, written as text in a slide format, into JSON. You copy; you never rewrite. Title, description, every narrative bullet, every design bullet and every hook are reproduced VERBATIM, character for character. Where the text has fewer than five narrative or design bullets, keep exactly what is there and invent nothing. Number the concepts NNN in order of appearance if the text does not number them. The tag fields (objective, persona, selling_argument, awareness, lane, dur, vehicle, visual_family, observation, insight_family, persuasion_job) are not in the text: infer each in a few plain words from the concept itself, for the brand ${brandName}. logline is the situation in the customer's own voice in one sentence; thumb_stop and performance_ready are your honest 1 to 5 read of the text. composition_note is "imported".`,
    prompt: `THE BATCH TEXT:\n${text}`,
    schema: BATCH_SCHEMA,
    maxTokens: 48000,
    model: REVIEW_MODEL,
  });
  const concepts = (out.concepts || []).map((c, i) => ({ ...c, num: String(String(c.num || '').replace(/\D/g, '') || (i + 1)).padStart(3, '0') }));
  log('Import', 'done', `${concepts.length} concept${concepts.length === 1 ? '' : 's'} lifted verbatim`);
  return {
    client: brandName, concepts, pipeline_version: 'import-claude-web', imported: true, imported_by: requestedBy || null,
    observations: [], harvest_notes: null, composition_note: 'imported', change_log: [], composition: null, strategy: null,
    packages: [], visualizations: [],
    pool: concepts.map((c) => ({ num: c.num, title: c.title, outcome: 'shipped', imported: true })),
    feedback: null, compliance: null, final_review: null, brand_fields: 0, used_marketing_plan: false,
    cost_usd: Math.round(((out.__usage && out.__usage.cost) || 0) * 100) / 100,
    used_research: false, used_harvest: false, harvest_id: null,
    has_brand_visuals: (record.colors || []).length > 0 && (record.fonts || []).length > 0,
    production_notes: null, used_approved_library: false, used_category_ads: false,
    pool_size: concepts.length, lint_rounds: 0, lint_remaining: 0, cd_markdown: String(text).slice(0, 120000),
  };
}

module.exports = { run, runDirect, importBatch, stageGate, stageFeedback, stageFinalReview, stageCompliance, briefMd, poolNote, standardNote, humanSituation, premiseLint, stagePremiseGate, premiseTotal, premiseFails };
