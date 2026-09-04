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
const store = require('./store');
const { canonNum, numSet } = require('./num');

const SKILL_DIR = process.env.SKILL_DIR ||
  '/srv/repo/.claude/skills/ad-concept-generator';

function ref(name) {
  const p = path.join(SKILL_DIR, 'references', name);
  try { return fs.readFileSync(p, 'utf8'); }
  catch { throw new Error(`missing skill reference ${name} at ${p}. Is the repo checked out and up to date?`); }
}

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
    narrative: V6
      ? { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 }
      : { type: 'array', items: { type: 'string' }, minItems: 5, maxItems: 6 },
    design: V6
      ? { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 }
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
  },
  required: V6
    ? ['num', 'title', 'logline', 'observation', 'insight_family', 'vehicle',
      'persuasion_job', 'awareness', 'lane', 'dur', 'desc', 'hooks', 'narrative', 'design',
      'objective', 'persona', 'selling_argument', 'thumb_stop', 'performance_ready', 'talent']
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
  },
  required: ['objectives', 'personas', 'selling_arguments', 'allocation', 'north_star', 'gaps'],
};

/* v6 Feedback Review Agent. 18 checks, distilled from real producer feedback.
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
          concept: CONCEPT,
        },
        required: ['num', 'verdict', 'failed_checks', 'note', 'concept'],
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
- Never invent a number. Any figure must come from the brand snapshot. If a proof point
  would normally go somewhere and the snapshot does not have it, write a placeholder that
  names what is needed, for example "insert the current Trustpilot rating".
- Obey the snapshot's compliance_notes, dos_and_donts and creative_boundaries as hard gates.
- Plain speech. No "unlock", no "elevate", no "game-changer", no agency register.
`;

/* v6 Step Zero. Nothing creative happens until a business objective and a
   persona have been chosen for every slot in the batch. The output prints as
   the deck's North Star slide and becomes the contract check 18 verifies. */
async function stageStrategy({ snapshot, count, log, ask, researchMd }) {
  log('Strategic analysis', 'running');
  const out = await ask({
    system: `You are the Strategic Analyst. You run Step Zero of the skill, before any observation is harvested and before any concept is written. Your craft rules:\n\n${ref('craft-rules.md')}\n${researchMd ? '\nLive market research from the Research Agent. The confidence labels are honest, respect them:\n\n' + researchMd : ''}\n${HOUSE_RULES}`,
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
${strategy.gaps.length ? `\nUnconfirmed, do not build a concept that depends on these: ${strategy.gaps.join('; ')}` : ''}`;
}

async function stageHarvest({ snapshot, prior, log, ask, researchMd, strategy, harvestMd }) {
  log('Human observation harvest', 'running');
  const out = await ask({
    system: `You are the Creative Director on this account. Your craft rules are below.\n\n${ref('craft-rules.md')}\n\nYour libraries, including the observation harvest bank:\n\n${ref('libraries.md')}\n${researchMd ? '\nLive market research from the Research Agent. The confidence labels are honest, respect them:\n\n' + researchMd : ''}\n${HOUSE_RULES}`,
    prompt: `${snapshot}\n${strategy ? '\n' + strategyBrief(strategy) + '\n' : ''}${harvestMd ? '\n' + harvestMd + '\n' : ''}\nALREADY DONE FOR THIS CLIENT, do not reuse these observations:\n${prior || '(nothing on file)'}\n\nRun step 4 of the skill: the human observation harvest, before any concept is written.
${harvestMd ? `A real harvest is above, gathered from public sources with a link on every line. START FROM IT.
Carry its observations through in the customer's own words rather than restating them, and spend
your own invention only on the gaps its coverage note admits to. An observation you can trace to a
source outranks one you thought of, every time. Do not silently drop a harvested observation
because a smoother one occurred to you.
` : ''}
Mine 18 to 22 specific human observations for this ICP. Each must be a specific behaviour,
thought, situation, conversation or internet habit someone in this audience would recognise
in one second. Not a benefit. Not an angle. Not a theme.
${strategy ? `Harvest from the WORLD OF THE PERSONAS named in the Strategy Map above, persona by
persona. An observation set in a generic kitchen when the persona lives at the gym is the
failure this step exists to prevent. Cover every persona.\n` : ''}Weight the harvest toward the winner set in winning_concepts, but source every observation
from behaviour rather than from strategy documents. Spread across insight families so the
batch can later hold at most two per family. In notes, say which harvest prompts you ran and
which angles you weighted toward.`,
    schema: OBS_SCHEMA,
    maxTokens: 16000,
  });
  log('Human observation harvest', 'done', `${out.observations.length} observations harvested`);
  return out;
}

async function stageWrite({ snapshot, prior, observations, count, startNum, log, ask, researchMd, strategy, harvestMd }) {
  log('Creative Director pass', 'running');
  const obsList = observations.map((o, i) => `${i + 1}. [${o.insight_family}] ${o.text}`).join('\n');
  const out = await ask({
    system: `You are the Creative Director on this account. Your craft rules:\n\n${ref('craft-rules.md')}\n\nYour libraries:\n\n${ref('libraries.md')}\n${researchMd ? '\nLive market research from the Research Agent. Researched vehicles are fair game for the creative leap, and a trend-verified or corroborated one beats a stale guess. Thin entries are leads, not facts:\n\n' + researchMd : ''}\n${HOUSE_RULES}`,
    prompt: `${snapshot}\n${strategy ? '\n' + strategyBrief(strategy) + '\n' : ''}${harvestMd ? '\n' + harvestMd + '\n' : ''}\nALREADY DONE, do not repeat these:\n${prior || '(nothing on file)'}\n\nObservations harvested for this client:\n${obsList}\n\nRun step 5. Write ${count} concepts, numbered from ${startNum} upward.
${strategy ? `Work down the allocation. Take one allocation row, pick an observation from THAT
persona's world, then write the concept. Every concept must carry the objective, persona and
selling_argument of the row it was written against, copied exactly as the Strategy Map words
them. A concept that cannot name all three does not exist yet.

The DR spine is mandatory. A creative device is not a concept by itself. The vehicle owns the
first three to five seconds as the HOOK; the spine owns the rest: hook or pattern interrupt,
then the problem or misconception, then the product introduced FAST, then how it works, then
proof or benefit, then price or value where the brand allows it, then the CTA. The three
narrative bullets must show the whole spine, not just the setup. If the interesting setup would
take 70 to 90 percent of the ad and the product gets one line at the end, the concept fails.
Ask per concept: how much useful selling information does the viewer get in 20 to 30 seconds?

Intensity: content must be about 25 percent more intense than real life. A compliment is not a
story, an accusation is. Turn observations up through confrontation, being caught, stakes, a
secret exposed, a competition, or something happening in the background. Every concept must
answer "what about this grabs your interest?" and if the honest answer is "nothing really",
write a different one.

Lead with what the viewer gains, never with the absence of a negative. Never write a hook that
argues against trial. Check that the vehicle's structure matches what is actually being sold
before you assign it: a choose-between mechanic needs something to choose between.

Score every concept on two axes, 1 to 5 and honestly: thumb_stop is whether it stops a scroll in
two seconds, performance_ready is whether it converts. Anything you would score 2 or below on
either axis should not be in the batch, so rewrite it before you return it.

Tag talent as "solo", "2-talent" or "location shoot" so production can plan. Solo at home is the
default, not a law.

` : ''}Per concept, in this order: pick an observation, make ONE creative leap into a specific
vehicle, assign ONE persuasion job, then write it up. Do not dramatise an observation
directly; the vehicle IS the ad.
${V6 ? `'narrative' is EXACTLY 3 action-based bullets: establish the situation, introduce the
product or mechanism or proof, deliver the payoff and turn toward the CTA. Compress several
beats into one bullet where the concept needs it. The narrative must be hook-independent, so it
reads correctly with any of the three hooks.
'design' is EXACTLY 3 bullets: one visual or editing direction, one caption or design direction,
one style or production or duration direction. No UGC boilerplate. Every device named here must
already appear in the description or the narrative.
'hooks' is EXACTLY 3 variants that explore meaningfully different angles into the same concept,
not one sentence reworded three times. Each is a spoken opening line or on-screen overlay, and
the concept must work with any of them.
` : ''}
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

/* v6 Feedback Review Agent. The strategist catches craft; this catches what
   only shows up when a producer sits with the whole batch. Sent the batch
   whole, because 12 of the 18 checks are batch-level. */
async function stageFeedback({ snapshot, concepts, strategy, log, ask }) {
  log('Feedback review, 18 checks', 'running');
  const out = await ask({
    system: `You are the Feedback Review Agent, the fourth agent in the pipeline. You run AFTER the Creative Strategist and BEFORE anything is built. You replay revision patterns learned from real producer feedback across every client batch. Your craft rules:\n\n${ref('craft-rules.md')}\n\nThe strategist scorecard you are layered on top of:\n\n${ref('creative-strategist.md')}\n${HOUSE_RULES}`,
    prompt: `${snapshot}\n${strategy ? '\n' + strategyBrief(strategy) + '\n' : ''}\nRun all 18 checks over this batch, in order. Checks 1, 1b, 2, 7c, 10 and the quota checks are
BATCH-LEVEL: judge them by reading the whole batch as a set, the way a producer would.

1. Batch sameness. Would a producer sort these into distinct piles, or start stacking? Clusters
of 3 or more same-looking concepts fail; the weakest per cluster is the one that goes.
1b. Copy repetition. Read every description and narrative back to back as continuous text. Any
product claim, stat, credential or proof phrase appearing in more than 3 concepts fails. Each
concept leads with ONE primary selling message; the others sit down for that concept.
2. Vehicle library cross-check. At least 30 percent of the batch actively uses a real vehicle,
not a standard talking head with a different topic.
3. Ownability. Strip the brand name out. If a competitor's product drops in unchanged, it fails.
4. Brand-tone calibration. Match the tone range this brand has actually approved. Do not answer
edgy subject matter with elaborate format parody, or warm confessional with deadpan sarcasm.
5. Production feasibility. Solo at home is the default. 2-talent and a realistic external
capture PASS when tagged. A cast of 3 or more, or a location needing permission, FAILS.
6. Seasonal and contextual. Anything tied to a holiday or moment more than 6 weeks out fails.
7. Believable trigger. Why is this person showing me this right now? No trigger, no concept.
7c. Stock beats and skeletons. A beat type recurring across most concepts is a template even
when everything around it varies.
8. Product introduction variety. Three or more concepts entering the product the same way fails.
9. Proof closes the argument the hook opened. Generic proof fails.
10. Outcome ladder spread. Five or more concepts ending on the same kind of result fails.
11. Specificity. At least one number, timeframe, social detail or tangible object per concept.
12. Unpaid-post filter. Would a real person post this without being paid?
13. Pain depth. A broad category instead of a specific human moment fails; push one level deeper.
14. Select, don't rescue. Would a creative director check this off and move into refinement, or
think "there is something here I could rewrite"? The second is a fail.
15. DR spine completeness. Hook, problem, product FAST, mechanism, proof, price where allowed,
CTA. Setup eating 70 to 90 percent of the beats fails. An ending on a clever brand line instead
of a payoff is a REWORK.
16. Dual scoring. Re-score thumb_stop and performance_ready yourself, 1 to 5. Anything at 2 or
below on either axis is a KILL or a REWORK. Report in batch_findings whether the batch average
clears 4 on both axes.
17. Intensity. What about this grabs your interest? Is it worth pulling out a phone for? Weak
answers get the observation turned up 25 percent, not deleted.
18. Strategy alignment. Every concept must name one objective, one persona and one selling
argument from the Strategy Map, the scenario must come from that persona's world, and the
selling argument must differ from at least half the batch.

Then a final compliance scan: read the batch as the brand would before production and flag
unqualified health claims, named competitors, banned language, or unsubstantiated outcomes.

Verdicts: PASS survives all 18. REWORK is fixable without replacing the premise, so return the
concept WITH your fix already applied. KILL is a premise-level failure, so return a REPLACEMENT
concept that keeps the allocation slot's objective, persona and selling argument and fixes what
failed. Either way the concept field comes back complete, every field populated, so the batch
that leaves this stage is buildable.

In failed_checks list the check numbers that failed for that concept. In batch_findings record
the batch-level results, including anything you had to fix by editing the weakest offender.

THE BATCH:\n${JSON.stringify(concepts, null, 1)}`,
    schema: FEEDBACK_SCHEMA,
    maxTokens: 64000,
  });
  const reviews = out.reviews || [];
  const t = reviews.reduce((a, r) => { a[r.verdict] = (a[r.verdict] || 0) + 1; return a; }, {});
  log('Feedback review, 18 checks', 'done',
    `${t.PASS || 0} pass, ${t.REWORK || 0} reworked, ${t.KILL || 0} replaced` +
    (out.batch_findings && out.batch_findings.length ? `, ${out.batch_findings.length} batch finding${out.batch_findings.length === 1 ? '' : 's'}` : ''));
  return out;
}

/* v6.2 Compliance and Alignment Reviewer, the last gate before a client sees
   anything. It reads the snapshot as the source of truth and is told to say
   what it could NOT check rather than guess. */
async function stageCompliance({ snapshot, concepts, strategy, log, ask }) {
  log('Compliance and alignment review', 'running');
  const out = await ask({
    system: `You are the Compliance and Alignment Reviewer, the fifth and final agent before a deck is built. The Feedback Review Agent catches craft problems. You catch FACTUAL, STRATEGIC and COMPLIANCE problems that only surface when the batch is checked against the client's own source of truth. Your craft rules:\n\n${ref('craft-rules.md')}\n${HOUSE_RULES}`,
    prompt: `THE CLIENT'S SOURCE OF TRUTH. This is the brand record, its compliance rows, its products
and its marketing plan. It is the highest authority here and it is all you have; you cannot
open the onboarding deck, the meeting notes or the previous batch's client feedback.

${snapshot}
${strategy ? '\n' + strategyBrief(strategy) + '\n' : ''}
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

Severity: HARD FAIL is a factual or compliance error the concept cannot ship with. SOFT FAIL
needs a caveat or a copy fix but the premise is sound.
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
    maxTokens: 32000,
  });
  const hard = (out.findings || []).filter((f) => f.severity === 'HARD FAIL').length;
  const soft = (out.findings || []).length - hard;
  log('Compliance and alignment review', 'done',
    (out.findings || []).length
      ? `${hard} hard, ${soft} soft` +
        ((out.strategic_gaps || []).length ? `, ${out.strategic_gaps.length} strategic gap${out.strategic_gaps.length === 1 ? '' : 's'}` : '') +
        ((out.sources_missing || []).length ? `, ${out.sources_missing.length} source${out.sources_missing.length === 1 ? '' : 's'} unavailable` : '')
      : 'no findings, the batch and the brand record agree' +
        ((out.sources_missing || []).length ? `, though ${out.sources_missing.length} source${out.sources_missing.length === 1 ? ' was' : 's were'} unavailable` : ''));
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
    maxTokens: 16000,
  });
  log('Batch composition check', 'done', out.verdict.slice(0, 90));
  return out;
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
  const { record, matched } = await brand.resolve(client);
  const snapshot = brand.toMarkdown(record);
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
    researchMd = research.toMarkdown(brief);
    log('Market research library', 'done', brief
      ? `${brief.vehicles.length} researched vehicles read` +
        (brief.edition ? `, catalog edition of ${String(brief.edition.ran_at).slice(0, 10)}` : '') +
        `, ${(brief.probes || []).length} recent probes`
      : 'the research library is empty, generating from the brand snapshot alone');
  } catch (err) {
    log('Market research library', 'done',
      'could not reach the research library (' + err.message.slice(0, 80) + '), generating from the brand snapshot alone');
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

  const strategy = V6
    ? await stageStrategy({ snapshot, count, log, ask: trackedAsk, researchMd })
    : null;

  const harvest = await stageHarvest({ snapshot, prior, log, ask: trackedAsk, researchMd, strategy, harvestMd });
  const drafted = await stageWrite({
    snapshot, prior, observations: harvest.observations, count, startNum,
    log, ask: trackedAsk, researchMd, strategy, harvestMd,
  });
  const reviews = await stageGate({ snapshot, concepts: drafted.concepts, log, ask: trackedAsk });
  let concepts = reconcile(drafted.concepts, reviews);

  let feedback = null;
  let compliance = null;
  if (V6) {
    feedback = await stageFeedback({ snapshot, concepts, strategy, log, ask: trackedAsk });
    concepts = reconcile(concepts, feedback.reviews);
    compliance = await stageCompliance({ snapshot, concepts, strategy, log, ask: trackedAsk });
    /* A hard compliance fail is not allowed to leave quietly. It rides on the
       concept as a flag, which is what the board already renders as "did not
       clear the batch check", so a human sees it on the slide itself. */
    const hard = new Map();
    for (const f of compliance.findings || []) {
      if (f.severity !== 'HARD FAIL') continue;
      hard.set(String(f.num), `${f.finding} (source: ${f.source}). Fix: ${f.fix}`);
    }
    for (const c of concepts) {
      const h = hard.get(canonNum(c.num));
      if (h) c.flag = c.flag ? `${c.flag} | ${h}` : h;
    }
  }

  const composition = await stageComposition({ snapshot, concepts, log, ask: trackedAsk });

  const blocked = concepts.filter((c) => c.flag).length;
  log('Deck ready', 'done',
    `${concepts.length} concepts, 9:16 space reserved` +
    (blocked ? `, ${blocked} carrying a compliance flag for a human` : ''));

  return {
    client: record.brand.brand_name,
    concepts,
    observations: harvest.observations,
    harvest_notes: harvest.notes,
    composition_note: drafted.composition_note,
    change_log: reviews.map((r) => ({ num: r.num, verdict: r.verdict, note: r.change_log })),
    composition,
    pipeline_version: V6 ? 'v6.2' : 'v4',
    strategy,
    feedback: feedback && {
      batch_findings: feedback.batch_findings,
      reviews: (feedback.reviews || []).map((r) => ({
        num: r.num, verdict: r.verdict, failed_checks: r.failed_checks, note: r.note,
      })),
    },
    compliance,
    /* brand_brain carried a single self-reported confidence for the whole
       row. The Knowledge Layer records it per colour and per font instead, so
       what a batch can honestly report is how much of the snapshot was
       actually filled. */
    brand_fields: [record.snap, record.plan, record.rules.length, record.products.length].filter(Boolean).length,
    used_marketing_plan: Boolean(record.plan),
    cost_usd: Math.round(spend.reduce((a, u) => a + (u && u.cost || 0), 0) * 100) / 100,
    used_research: Boolean(researchMd),
    used_harvest: Boolean(harvestMd),
    harvest_id: harvestRec ? harvestRec.id : null,
    has_brand_visuals: record.colors.length > 0 && record.fonts.length > 0,
  };
}

module.exports = { run };
