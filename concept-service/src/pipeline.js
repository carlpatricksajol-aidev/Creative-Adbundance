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
const { ask } = require('./llm');
/* The snapshot now comes from the Knowledge Layer, not a flat brand_brain
   row: the same knowledge in the shapes the skill actually asks for, plus
   the client's own marketing plan, which brand_brain never carried. */
const brand = require('./dossier');
const research = require('./research');

const SKILL_DIR = process.env.SKILL_DIR ||
  '/srv/repo/.claude/skills/ad-concept-generator';

function ref(name) {
  const p = path.join(SKILL_DIR, 'references', name);
  try { return fs.readFileSync(p, 'utf8'); }
  catch { throw new Error(`missing skill reference ${name} at ${p}. Is the repo checked out and up to date?`); }
}

/* --------------------------------------------------------------- schemas ---- */

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
    narrative: { type: 'array', items: { type: 'string' }, minItems: 5, maxItems: 6 },
    design: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4 },
  },
  required: ['num', 'title', 'logline', 'observation', 'insight_family', 'vehicle',
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
  },
  required: ['observations', 'notes'],
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
          change_log: { type: 'string' },
          concept: CONCEPT,
        },
        required: ['num', 'verdict', 'change_log', 'concept'],
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

/* ----------------------------------------------------------------- stages ---- */

const HOUSE_RULES = `
Hard rules that apply to every stage:
- NO EM DASHES anywhere. Use a comma or a full stop. This is a product rule, not a preference.
- Never invent a number. Any figure must come from the brand snapshot. If a proof point
  would normally go somewhere and the snapshot does not have it, write a placeholder that
  names what is needed, for example "insert the current Trustpilot rating".
- Obey the snapshot's compliance_notes, dos_and_donts and creative_boundaries as hard gates.
- Plain speech. No "unlock", no "elevate", no "game-changer", no agency register.
`;

async function stageHarvest({ snapshot, prior, log, ask, researchMd }) {
  log('Human observation harvest', 'running');
  const out = await ask({
    system: `You are the Creative Director on this account. Your craft rules are below.\n\n${ref('craft-rules.md')}\n\nYour libraries, including the observation harvest bank:\n\n${ref('libraries.md')}\n${researchMd ? '\nLive market research from the Research Agent. The confidence labels are honest, respect them:\n\n' + researchMd : ''}\n${HOUSE_RULES}`,
    prompt: `${snapshot}\n\nALREADY DONE FOR THIS CLIENT, do not reuse these observations:\n${prior || '(nothing on file)'}\n\nRun step 4 of the skill: the human observation harvest, before any concept is written.
Mine 18 to 22 specific human observations for this ICP. Each must be a specific behaviour,
thought, situation, conversation or internet habit someone in this audience would recognise
in one second. Not a benefit. Not an angle. Not a theme.
Weight the harvest toward the winner set in winning_concepts, but source every observation
from behaviour rather than from strategy documents. Spread across insight families so the
batch can later hold at most two per family. In notes, say which harvest prompts you ran and
which angles you weighted toward.`,
    schema: OBS_SCHEMA,
    maxTokens: 16000,
  });
  log('Human observation harvest', 'done', `${out.observations.length} observations harvested`);
  return out;
}

async function stageWrite({ snapshot, prior, observations, count, startNum, log, ask, researchMd }) {
  log('Creative Director pass', 'running');
  const obsList = observations.map((o, i) => `${i + 1}. [${o.insight_family}] ${o.text}`).join('\n');
  const out = await ask({
    system: `You are the Creative Director on this account. Your craft rules:\n\n${ref('craft-rules.md')}\n\nYour libraries:\n\n${ref('libraries.md')}\n${researchMd ? '\nLive market research from the Research Agent. Researched vehicles are fair game for the creative leap, and a trend-verified or corroborated one beats a stale guess. Thin entries are leads, not facts:\n\n' + researchMd : ''}\n${HOUSE_RULES}`,
    prompt: `${snapshot}\n\nALREADY DONE, do not repeat these:\n${prior || '(nothing on file)'}\n\nObservations harvested for this client:\n${obsList}\n\nRun step 5. Write ${count} concepts, numbered from ${startNum} upward.
Per concept, in this order: pick an observation, make ONE creative leap into a specific
vehicle, assign ONE persuasion job, then write it up. Do not dramatise an observation
directly; the vehicle IS the ad.
'logline' is the one human truth the ad is built on, in the customer's voice, one or two
sentences. It is not the hook and not a summary of the ad.
'desc' is what we are making, not why it works: the creator format, the scene, the one core
message, how the brand fits. Plain fifth-grade language, no strategist register.
Batch rules: at most two concepts per insight family, and every prior concept fed in above
counts toward its family's cap, so a family a past batch already used twice is CLOSED;
the sound-off test between every pair.
Composition targets: the v4 quotas in craft-rules assume a 16-concept batch. This batch is
${count}, so scale them proportionally. At 5 that means: at least 1 stat-led using only the
snapshot's own numbers, at least 1 with a second character, at least 1 in a graphic or
animated lane, at most 1 where a trend format is the delivery system, no two concepts in
the same register, and at least two awareness stages represented.
Vary how the product enters and how each concept ends.`,
    schema: BATCH_SCHEMA,
    maxTokens: 64000,
  });
  log('Creative Director pass', 'done', `${out.concepts.length} concepts drafted`);
  return out;
}

async function stageGate({ snapshot, concepts, log, ask }) {
  log('Creative Strategist gate', 'running');
  const groups = [];
  for (let i = 0; i < concepts.length; i += 4) groups.push(concepts.slice(i, i + 4));

  const results = await Promise.all(groups.map((g) => ask({
    system: `You are the Creative Strategist, the last gate before a client sees this work. Your reviewer role and scorecard:\n\n${ref('creative-strategist.md')}\n\nThe craft rules you are checking against:\n\n${ref('craft-rules.md')}\n${HOUSE_RULES}`,
    prompt: `${snapshot}\n\nRun your full scorecard on each concept below. Be hard: reject or edit on a title that does
not let a reader picture the ad, a missing creative leap, more than one persuasion job, a
sibling it would look identical to with the sound off, strategist language in the copy,
manufactured cleverness, anything not shootable at home, a design component never set up in
the description or narrative, any compliance breach, or any number not in the snapshot.
Return a verdict per concept and the concept AFTER your edits, every field populated. On
reject-and-replace, write a replacement that keeps the slot's job and fixes the failure.

CONCEPTS:\n${JSON.stringify(g, null, 1)}`,
    schema: GATE_SCHEMA,
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
    maxTokens: 16000,
  });
  log('Batch composition check', 'done', out.verdict.slice(0, 90));
  return out;
}

/* ------------------------------------------------------------------- run ---- */

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
  const { record, matched } = await brand.resolve(client);
  const snapshot = brand.toMarkdown(record);
  /* Say what the snapshot was actually built from. A run grounded in a brand
     with no marketing plan and no compliance rules should say so in the step,
     not read identical to one that had both. */
  const built = [
    record.snap ? 'identity' : null,
    record.plan ? 'marketing plan' : null,
    record.rules.length ? `${record.rules.length} compliance rule${record.rules.length === 1 ? '' : 's'}` : null,
    record.products.length ? `${record.products.length} product${record.products.length === 1 ? '' : 's'}` : null,
    record.colors.length ? 'colours' : null,
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

  /* The Marketing report, per Workflow V1: read the Research Agent's library
     before anything creative happens. Absence degrades honestly, never
     silently: the step says exactly what was and was not on file. */
  log('Marketing report', 'running');
  let researchMd = null;
  try {
    const brief = await research.fetchBrief();
    researchMd = research.toMarkdown(brief);
    log('Marketing report', 'done', brief
      ? `${brief.vehicles.length} researched vehicles read` +
        (brief.edition ? `, catalog edition of ${String(brief.edition.ran_at).slice(0, 10)}` : '') +
        `, ${(brief.probes || []).length} recent probes`
      : 'the research library is empty, generating from the brand snapshot alone');
  } catch (err) {
    log('Marketing report', 'done',
      'could not reach the research library (' + err.message.slice(0, 80) + '), generating from the brand snapshot alone');
  }

  const harvest = await stageHarvest({ snapshot, prior, log, ask: trackedAsk, researchMd });
  const drafted = await stageWrite({
    snapshot, prior, observations: harvest.observations, count, startNum, log, ask: trackedAsk, researchMd,
  });
  const reviews = await stageGate({ snapshot, concepts: drafted.concepts, log, ask: trackedAsk });
  const concepts = reviews.map((r) => r.concept).filter(Boolean);
  const composition = await stageComposition({ snapshot, concepts, log, ask: trackedAsk });

  log('Deck ready', 'done', `${concepts.length} concepts, 9:16 space reserved`);

  return {
    client: record.brand.brand_name,
    concepts,
    observations: harvest.observations,
    harvest_notes: harvest.notes,
    composition_note: drafted.composition_note,
    change_log: reviews.map((r) => ({ num: r.num, verdict: r.verdict, note: r.change_log })),
    composition,
    /* brand_brain carried a single self-reported confidence for the whole
       row. The Knowledge Layer records it per colour and per font instead, so
       what a batch can honestly report is how much of the snapshot was
       actually filled. */
    brand_fields: [record.snap, record.plan, record.rules.length, record.products.length].filter(Boolean).length,
    used_marketing_plan: Boolean(record.plan),
    cost_usd: Math.round(spend.reduce((a, u) => a + (u && u.cost || 0), 0) * 100) / 100,
    used_research: Boolean(researchMd),
    has_brand_visuals: record.colors.length > 0 && record.fonts.length > 0,
  };
}

module.exports = { run };
