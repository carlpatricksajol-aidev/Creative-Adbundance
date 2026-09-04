'use strict';
/*
 * The script writer's pipeline, as code. Same stages, same order and the same
 * reference files as running the ad-script-writer skill by hand: intake,
 * concept contracts, the Script Writer pass, then the Creative Strategist's
 * 10-parameter DR review with a revision loop, then the batch swap test.
 *
 * The craft lives in the skill's reference files, not in here. This file only
 * sequences the stages and holds them to a shape, exactly like pipeline.js.
 *
 * Input is an APPROVED concept batch. Scripts are numbered off the concept
 * number, so concept 001 is script 001 and the whole ecosystem keeps one join
 * key from concept through script to storyboard to footage.
 */

const fs = require('fs');
const path = require('path');
const { ask } = require('./llm');
const brand = require('./dossier');
const { canonNum, numSet } = require('./num');

const SKILL_DIR = process.env.SCRIPT_SKILL_DIR ||
  '/srv/repo/.claude/skills/ad-script-writer';

function ref(name) {
  const p = path.join(SKILL_DIR, 'references', name);
  try { return fs.readFileSync(p, 'utf8'); }
  catch { throw new Error(`missing script skill reference ${name} at ${p}. Is the repo checked out and up to date?`); }
}

/* The skill itself, whole, exactly as the concept pipeline now does. The model
   was getting the reference files and a summary of the method; the document
   that DEFINES the method never reached it, and the difference between the two
   is the difference Carl saw between a Claude Web session and the ecosystem. */
function skillDoc() {
  const p = path.join(SKILL_DIR, 'SKILL.md');
  try { return fs.readFileSync(p, 'utf8'); }
  catch { throw new Error(`missing SKILL.md at ${p}. Is the repo checked out and up to date?`); }
}

const SKILL_PREFACE = `THE SKILL YOU ARE EXECUTING, in full. This is the source of truth for the
method. The mechanical steps it describes (file output, folder layout, rendering, Notion pages) are
handled by the service around you, so ignore instructions about producing files; everything about
METHOD, JUDGMENT, FORMATS and QUALITY is yours to follow exactly. Where these instructions and the
shorter notes below ever disagree, the skill wins.`;

/* --------------------------------------------------------------- schemas ---- */

/* hooks[].line/.dir and script[].vo/.dir are the shapes the OS scripts surface
   already renders. Do not rename them without changing that renderer. */
const SCRIPT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    num: { type: 'string' },
    title: { type: 'string' },
    contract: { type: 'string' },
    filename: { type: 'string' },
    hooks: {
      type: 'array', minItems: 3, maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string' },
          overlay: { type: 'string' },
          line: { type: 'string' },
          dir: { type: 'string' },
        },
        required: ['label', 'overlay', 'line', 'dir'],
      },
    },
    script: {
      type: 'array', minItems: 4, maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          vo: { type: 'string' },
          dir: { type: 'string' },
          overlay: { type: 'string' },
        },
        required: ['vo', 'dir'],
      },
    },
    offer_placement: { type: 'string' },
    product_intro: { type: 'string' },
    hero_proof: { type: 'string' },
    cta_type: { type: 'string' },
  },
  required: ['num', 'title', 'contract', 'filename', 'hooks', 'script',
    'offer_placement', 'product_intro', 'hero_proof', 'cta_type'],
};

const CONTRACTS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    contracts: {
      type: 'array', minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          num: { type: 'string' },
          title: { type: 'string' },
          contract: { type: 'string' },
          promise: { type: 'string' },
          proof: { type: 'string' },
        },
        required: ['num', 'title', 'contract', 'promise', 'proof'],
      },
    },
    proof_points: { type: 'array', items: { type: 'string' } },
    offer: { type: 'string' },
    restricted_terms: { type: 'array', items: { type: 'string' } },
  },
  required: ['contracts', 'proof_points', 'offer', 'restricted_terms'],
};

const DRAFT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    scripts: { type: 'array', items: SCRIPT, minItems: 1 },
  },
  required: ['scripts'],
};

/* The ten parameters are fixed by the skill. Four carry a threshold of 8 and
   the rest 7, which is enforced in code below rather than trusted to the
   model's arithmetic. */
const PARAMS = [
  'proof_matching_narrative_promise',
  'offer_placement',
  'product_introduction',
  'differentiation_across_concepts',
  'hook_quality',
  'mechanism_clarity',
  'specificity_and_believability',
  'compliance_safety',
  'visual_proof_integration',
  'cta_strength',
];
const HIGH_BAR = new Set([
  'proof_matching_narrative_promise',
  'offer_placement',
  'product_introduction',
  'differentiation_across_concepts',
]);

const SCORE_PROPS = {};
for (const p of PARAMS) SCORE_PROPS[p] = { type: 'integer', minimum: 1, maximum: 10 };

const REVIEW_SCHEMA = {
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
          scores: {
            type: 'object',
            additionalProperties: false,
            properties: SCORE_PROPS,
            required: PARAMS,
          },
          notes: { type: 'array', items: { type: 'string' } },
          script: SCRIPT,
        },
        required: ['num', 'scores', 'notes', 'script'],
      },
    },
  },
  required: ['reviews'],
};

const SWAP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdict: { type: 'string' },
    collisions: { type: 'array', items: { type: 'string' } },
    reviews: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          num: { type: 'string' },
          note: { type: 'string' },
          script: SCRIPT,
        },
        required: ['num', 'note', 'script'],
      },
    },
  },
  required: ['verdict', 'collisions', 'reviews'],
};

/* ----------------------------------------------------------------- stages ---- */

const HOUSE_RULES = `
Hard rules that apply to every stage:
- NO EM DASHES anywhere. Use a comma or a full stop. This is a product rule, not a preference.
- Never invent a number that is presented as the brand's own result. Proof numbers must come from
  the brand snapshot. Where a proof point is needed and the snapshot has none, write a
  placeholder naming what is needed, for example "insert the current Trustpilot rating".
- Obey the snapshot's compliance_notes, dos_and_donts and creative_boundaries as hard gates.
- Never imply a follower or subscriber count is purchased or numerically guaranteed. Use
  community, real people, discovery, reach.
- Plain speech. No "unlock", no "elevate", no "game-changer", no agency register.
`;

function conceptBrief(concepts) {
  return concepts.map((c) => ({
    num: c.num,
    title: c.title,
    logline: c.logline,
    desc: c.desc,
    vehicle: c.vehicle,
    persuasion_job: c.persuasion_job,
    awareness: c.awareness,
    lane: c.lane,
    dur: c.dur,
    talent: c.talent,
    persona: c.persona,
    selling_argument: c.selling_argument,
    hooks: c.hooks,
    narrative: c.narrative,
    design: c.design,
  }));
}

async function stageContracts({ snapshot, concepts, log, ask }) {
  log('Concept contracts', 'running');
  const out = await ask({
    system: `You are a senior UGC scriptwriter working to the house format.\n\n${SKILL_PREFACE}\n\n${skillDoc()}\n\nYour craft rules:\n\n${ref('writing-rules.md')}\n${HOUSE_RULES}`,
    prompt: `${snapshot}\n\nRun step 2 of the skill, the concept contracts. This is the single most important step and it
happens before a word of script is written.

For EACH concept below write one contract in exactly this shape:
"This ad tests whether [PRODUCT] can [SPECIFIC PROMISE] for [PERSONA], proven by [MEASURABLE
OUTCOME]."

Then split that contract into its promise and its proof, so the review stage can check whether
the finished script's proof actually closes the argument its narrative opens. The proof must be
specific to what the concept is about. A gut concept cannot be proven by "I feel great", a hair
concept cannot be proven by better energy, and nothing is proven by "I love it".

Also pull, from the snapshot only: every substantiated proof point available to this brand, the
current offer in the brand's own words, and any restricted or banned terminology. If the snapshot
carries no offer, say so in the offer field rather than inventing one.

CONCEPTS:\n${JSON.stringify(conceptBrief(concepts), null, 1)}`,
    schema: CONTRACTS_SCHEMA,
    maxTokens: 16000,
  });
  log('Concept contracts', 'done',
    `${out.contracts.length} contract${out.contracts.length === 1 ? '' : 's'} written` +
    (out.proof_points.length ? `, ${out.proof_points.length} substantiated proof point${out.proof_points.length === 1 ? '' : 's'} on file` : ', no substantiated proof on file'));
  return out;
}

async function stageWrite({ snapshot, concepts, contracts, batchLabel, log, ask }) {
  log('Script Writer pass', 'running');
  const cmap = new Map((contracts.contracts || []).map((c) => [canonNum(c.num), c]));
  const withContracts = conceptBrief(concepts).map((c) => ({
    ...c, contract: (cmap.get(canonNum(c.num)) || {}).contract || '',
    required_proof: (cmap.get(canonNum(c.num)) || {}).proof || '',
  }));

  const out = await ask({
    system: `You are a senior UGC scriptwriter.\n\n${SKILL_PREFACE}\n\n${skillDoc()}\n\nYour craft rules, with the hook system, offer placement, product-introduction variation, the proof ladder, the overlay system and the CTA rules:\n\n${ref('writing-rules.md')}\n\nThe house output format you are writing into:\n\n${ref('output-format.md')}\n${HOUSE_RULES}`,
    prompt: `${snapshot}\n\nSubstantiated proof points available for this brand: ${contracts.proof_points.length ? contracts.proof_points.join('; ') : '(none on file, use named placeholders)'}
The current offer: ${contracts.offer || '(none on file)'}
Restricted or banned terms: ${contracts.restricted_terms.length ? contracts.restricted_terms.join('; ') : '(none recorded)'}

Run step 3. Write one script per concept below, keeping the concept's number as the script number.

The core failure this step exists to prevent: AI scripts translate the who and the what well and
then collapse on the how and the proof, so every script drifts into the same shape regardless of
what its concept was testing. The contract is the guard against that. Each script's contract
promise stays the dominant message from hook to CTA, and its proof closes the exact argument its
narrative opens.

Per script:
- Three hooks that are three DIFFERENT entry points, not one thought reworded. Different pain,
  goal, persona or root cause. Label each with its angle in the label field, for example
  "Empty Launch / Pain Point". Each hook carries its on-screen overlay and its spoken opening
  line, plus a one-line direction for how it is shot.
- The offer enters EARLY, woven into the product introduction. Never saved for the final line.
  Say where it lands in offer_placement.
- The product introduction VARIES per script and follows that concept's narrative. Never reuse
  "that's where the brand came in" or any single construction across this batch. Name the
  construction you used in product_intro so the batch can be checked for repeats.
- A proof ladder: reach, then engagement, then the business outcome the contract named. Put the
  strongest one in hero_proof.
- The trust or compliance line rides as an overlay on a beat, not as spoken boilerplate in every
  script. Use the overlay field on that beat.
- Visuals are proof, not decoration. A screen-share beat means the numbers on screen carry the
  persuasion; a comment-reply beat means the comment itself carries enough context to work.
- The CTA closes that concept's specific argument first, then broadens the audience callout.
  Name its shape in cta_type.
- filename follows the house token order exactly: Brand_Video_SIZE_LENGTH_Format_###_V#_Batch_LANG,
  using this batch label: ${batchLabel}.

CONCEPTS WITH THEIR CONTRACTS:\n${JSON.stringify(withContracts, null, 1)}`,
    schema: DRAFT_SCHEMA,
    maxTokens: 64000,
  });
  log('Script Writer pass', 'done', `${out.scripts.length} script${out.scripts.length === 1 ? '' : 's'} drafted`);
  return out.scripts;
}

/* Thresholds are checked here, not in the prompt, so a model that scores
   generously cannot talk its way past the gate. */
function failures(scores) {
  const out = [];
  for (const p of PARAMS) {
    const v = scores[p];
    const bar = HIGH_BAR.has(p) ? 8 : 7;
    if (typeof v !== 'number' || v < bar) out.push(`${p} ${v} (needs ${bar})`);
  }
  return out;
}

async function stageReview({ snapshot, scripts, contracts, cycle, log, ask }) {
  const label = cycle > 1 ? `DR scorecard, revision ${cycle - 1}` : 'DR scorecard review';
  log(label, 'running');
  const groups = [];
  for (let i = 0; i < scripts.length; i += 3) groups.push(scripts.slice(i, i + 3));

  const results = await Promise.all(groups.map((g) => ask({
    system: `You are a senior creative strategist who did NOT write these drafts. You review every script against the 10-parameter direct-response scorecard before anything is delivered.\n\n${SKILL_PREFACE}\n\n${skillDoc()}\n\nThe rubric, with what each score level looks like:\n\n${ref('dr-scorecard.md')}\n\nThe craft rules the scripts were written to:\n\n${ref('writing-rules.md')}\n${HOUSE_RULES}`,
    prompt: `${snapshot}\n\nThe contracts these scripts were written against:\n${JSON.stringify(contracts.contracts, null, 1)}\n\nScore every script on all ten parameters, 1 to 10, independently and without mercy. You are not
the writer defending the work; you are protecting the client relationship and the media budget.

The four parameters that a real client scored lowest on a failed AI batch, and where you should
expect to find the problems, are proof matching the narrative promise, offer placement, product
introduction and differentiation across concepts.

In notes, quote the failing line and prescribe the fix. One note per problem, specific enough
that the writer does not have to guess.

Then return the script AFTER your edits, every field populated, so what leaves this stage is
deliverable. Fix what you scored down. Do not rewrite what is already working.

SCRIPTS:\n${JSON.stringify(g, null, 1)}`,
    schema: REVIEW_SCHEMA,
    maxTokens: 48000,
  })));

  const reviews = results.flatMap((r) => r.reviews || []);
  const byNum = new Map();
  for (const r of reviews) if (r && r.num != null && !byNum.has(canonNum(r.num))) byNum.set(canonNum(r.num), r);

  const out = scripts.map((s) => {
    const r = byNum.get(String(s.num));
    if (!r) return { script: s, scores: null, fails: [], notes: [], unreviewed: true };
    return { script: r.script || s, scores: r.scores, fails: failures(r.scores), notes: r.notes || [] };
  });

  const stillFailing = out.filter((o) => o.fails.length).length;
  log(label, 'done',
    stillFailing
      ? `${out.length - stillFailing} of ${out.length} clear the bar, ${stillFailing} below threshold`
      : `all ${out.length} clear every threshold`);
  return out;
}

async function stageSwap({ snapshot, scripts, log, ask }) {
  log('Batch swap test', 'running');
  const out = await ask({
    system: `You are the same senior creative strategist, now reading the batch as a set.\n\n${SKILL_PREFACE}\n\n${skillDoc()}\n\nYour craft rules:\n\n${ref('writing-rules.md')}\n${HOUSE_RULES}`,
    prompt: `${snapshot}\n\nRun step 5, the batch-level swap test.

For every pair of scripts ask: could these two swap middle sections without anyone noticing? If
yes, the batch has collapsed into the template. Also check that no two scripts share the same
product-introduction construction, and that no two share the same offer phrasing.

List every collision you find, naming both script numbers and what they share. Then rewrite the
offending middles, the mechanism line, the trust line or the proof beat, so each script has a
distinct reason the product matters. Rewrite the WEAKER of a colliding pair, not the stronger.
Return only the scripts you changed, complete and every field populated. If nothing collides,
return an empty reviews array and say so in verdict.

THE BATCH:\n${JSON.stringify(scripts, null, 1)}`,
    schema: SWAP_SCHEMA,
    maxTokens: 48000,
  });
  log('Batch swap test', 'done',
    out.collisions.length
      ? `${out.collisions.length} collision${out.collisions.length === 1 ? '' : 's'}, ${out.reviews.length} rewritten`
      : 'no collisions, every script has its own middle');
  return out;
}

/* ------------------------------------------------------------------- run ---- */

async function run({ client, batch, concepts, batchLabel, log }) {
  const spend = [];
  const baseAsk = ask;
  const trackedAsk = async (args) => {
    const out = await baseAsk(args);
    if (out.__usage) { spend.push(out.__usage); delete out.__usage; }
    return out;
  };

  if (!concepts || !concepts.length) {
    throw new Error('no approved concepts to script. Approve a concept batch first.');
  }

  log('Intake', 'running');
  const { record, matched } = await brand.resolve(client);
  const snapshot = brand.toMarkdown(record);
  log('Intake', 'done',
    `${concepts.length} concept${concepts.length === 1 ? '' : 's'} in scope from ${batchLabel}, ` +
    `snapshot for ${record.brand.brand_name} (matched on ${matched})`);

  const contracts = await stageContracts({ snapshot, concepts, log, ask: trackedAsk });
  let drafts = await stageWrite({ snapshot, concepts, contracts, batchLabel, log, ask: trackedAsk });

  /* Max two revision cycles, then deliver WITH a flag rather than silently
     shipping a weak script or looping forever on a script the model cannot
     lift. Both behaviours are named in the skill. */
  let reviewed = await stageReview({ snapshot, scripts: drafts, contracts, cycle: 1, log, ask: trackedAsk });
  let cycles = 1;
  while (reviewed.some((r) => r.fails.length) && cycles < 3) {
    cycles += 1;
    const failing = reviewed.filter((r) => r.fails.length);
    log('DR scorecard review', 'done',
      `${failing.length} script${failing.length === 1 ? '' : 's'} below threshold, sending back with notes`);
    const revised = await stageReview({
      snapshot, contracts, cycle: cycles, log, ask: trackedAsk,
      scripts: reviewed.map((r) => r.script),
    });
    reviewed = revised;
  }

  const flagged = reviewed.filter((r) => r.fails.length);
  const swap = await stageSwap({ snapshot, scripts: reviewed.map((r) => r.script), log, ask: trackedAsk });

  /* Apply the swap rewrites over the reviewed set, keyed by number, so a
     rewrite can only replace a script and never remove one. */
  const swapped = new Map();
  for (const r of swap.reviews || []) if (r && r.script && r.num != null) swapped.set(String(r.num), r.script);

  const scoreOf = new Map(reviewed.map((r) => [String(r.script.num), r]));
  const docs = reviewed.map((r) => {
    const s = swapped.get(String(r.script.num)) || r.script;
    const rec = scoreOf.get(String(s.num));
    /* The house format opens the body with the interchangeable-hook marker
       rather than a line, and the model returns that beat with an empty vo.
       Empty renders as a blank row, so name it. */
    if (s.script && s.script.length && !String(s.script[0].vo || '').trim()) {
      s.script[0].vo = '*Insert Opening Line*';
      if (!String(s.script[0].dir || '').trim()) {
        s.script[0].dir = 'Whichever of the three hooks is being shot';
      }
    }
    return {
      id: `s${s.num}`,
      no: s.num,
      num: s.num,
      title: s.title,
      contract: s.contract,
      filename: s.filename,
      hooks: s.hooks,
      script: s.script,
      offer_placement: s.offer_placement,
      product_intro: s.product_intro,
      hero_proof: s.hero_proof,
      cta_type: s.cta_type,
      scores: rec ? rec.scores : null,
      /* A script that never cleared the bar says so on the doc, so nobody has
         to take "reviewed" on trust. */
      flag: rec && rec.fails.length
        ? `Below the DR threshold after ${cycles} cycle${cycles === 1 ? '' : 's'}: ${rec.fails.join('; ')}`
        : null,
      notes: rec ? rec.notes : [],
    };
  });

  log('Scripts ready', 'done',
    `${docs.length} script${docs.length === 1 ? '' : 's'}` +
    (flagged.length ? `, ${flagged.length} flagged below threshold` : ', all clear') +
    (swap.collisions.length ? `, ${swap.reviews.length} rewritten after the swap test` : ''));

  return {
    client: record.brand.brand_name,
    batch: batchLabel,
    fromBatch: batch || null,
    by: 'Script generator',
    date: new Date().toISOString().slice(0, 10),
    docs,
    contracts: contracts.contracts,
    offer: contracts.offer,
    proof_points: contracts.proof_points,
    revision_cycles: cycles,
    below_threshold: flagged.map((r) => ({ num: r.script.num, fails: r.fails })),
    swap_test: { verdict: swap.verdict, collisions: swap.collisions },
    cost_usd: Math.round(spend.reduce((a, u) => a + (u && u.cost || 0), 0) * 100) / 100,
  };
}

module.exports = { run };
