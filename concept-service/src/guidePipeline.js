/* Phase 2 of the batch shoot package: the remote shooting guide.
 *
 * Until 2026-09-16 the service generated concepts, scripts and storyboards and
 * stopped. The shoot guide, the document a creator actually films from, was a
 * set of hand-typed samples on the OS page, and "Shoot guides" on every real
 * batch said "nothing on file yet" because nothing ever could be.
 *
 * The guide is written FROM the storyboard, never from the concept or the
 * script directly: the storyboard is the source of truth for the shoot, and the
 * skill's Phase 2 says so. Every shot name in a guide is a Footage Name copied
 * off the board, because the footage renamer joins on that exact string when
 * the creator's uploads come back.
 *
 * One guide per creator when the batch has been cast; one per concept when it
 * has not, labelled as uncast rather than given an invented name.
 */
const fs = require('fs');
const path = require('path');
const { ask } = require('./llm');
const brand = require('./dossier');

const SKILL_DIR = process.env.STORY_SKILL_DIR ||
  path.resolve(__dirname, '..', '..', '.claude', 'skills', 'batch-shoot-package');

function ref(name) {
  const p = path.join(SKILL_DIR, 'references', name);
  try { return fs.readFileSync(p, 'utf8'); }
  catch { throw new Error(`missing shoot package reference ${name} at ${p}. Is the repo checked out and up to date?`); }
}
function skillDoc() {
  const p = path.join(SKILL_DIR, 'SKILL.md');
  try { return fs.readFileSync(p, 'utf8'); }
  catch { throw new Error(`missing SKILL.md at ${p}. Is the repo checked out and up to date?`); }
}
/* the Phase 2 section of the skill, by heading; empty is logged, never silent */
function phase2() {
  const doc = skillDoc();
  const i = doc.indexOf('### Phase 2');
  const j = doc.indexOf('### Phase 3', i + 1);
  const out = i >= 0 ? doc.slice(i, j > i ? j : undefined).trim() : '';
  if (!out) console.warn('[guide] batch-shoot-package has no "### Phase 2" section; the guide runs on the whole skill only');
  return out;
}

const SKILL_PREFACE = `THE SKILL YOU ARE EXECUTING, in full. This is the source of truth for what a
shooting guide is and how one is written. Notion writing and the approval gates between phases are
handled by the service around you, so ignore instructions about posting pages or pausing for
approval; everything about CONTENT, STRUCTURE, TONE and what a creator needs to film well is yours
to follow exactly. You are running Phase 2 only. Where these instructions and the shorter notes
below ever disagree, the skill wins.`;

const HOUSE_RULES = `
Hard rules that apply to every stage:
- NO EM DASHES anywhere. Use a comma or a full stop. This is a product rule, not a preference.
- Never invent a claim or a number. Everything spoken comes from the approved script.
- Obey the snapshot's compliance_notes, dos_and_donts and creative_boundaries as hard gates.
- Plain speech, written for a creator holding a phone. Second person, present tense.
- A shot name is the storyboard's Footage Name, copied exactly, character for character. Never
  paraphrase it, never merge two, never invent one the board does not have.
`;

const STR = { type: 'string' };
const LIST = { type: 'array', items: STR, minItems: 1, maxItems: 12 };
const GUIDE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    overview: STR,           // the client overview a creator reads first
    due: STR,                // when footage is due, in the brief's words
    guides: {
      type: 'array', minItems: 1, maxItems: 20,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          concept: STR,      // "NNN_Title", exactly the storyboard heading
          creator: STR,      // the cast creator, or "Uncast" when nobody is named
          dur: STR,
          spec: STR,         // "1 talking head + 6 b-rolls"
          wardrobe: LIST,
          props: LIST,
          gadgets: LIST,
          locations: LIST,
          talkinghead: LIST,
          shots: {
            type: 'array', minItems: 1, maxItems: 40,
            items: { type: 'object', additionalProperties: false,
              properties: { name: STR, why: STR }, required: ['name', 'why'] },
          },
          instructions: {
            type: 'object', additionalProperties: false,
            properties: { tone: STR, delivery: STR, framing: STR, location: STR, audio: STR },
            required: ['tone', 'delivery', 'framing', 'location', 'audio'],
          },
        },
        required: ['concept', 'creator', 'dur', 'spec', 'wardrobe', 'props', 'gadgets',
                   'locations', 'talkinghead', 'shots', 'instructions'],
      },
    },
  },
  required: ['overview', 'due', 'guides'],
};

/* The storyboard, as text the model reads: one section per concept, the
   five-column table as the board holds it. */
function boardText(story) {
  return (story.concepts || []).map((cp) => {
    const rows = (cp.scenes || []).map((sc) =>
      `| ${sc.scene || ''} | ${sc.line || sc.script || ''} | ${sc.overlay || ''} | ${sc.footage || sc.footageName || ''} | ${sc.explain || sc.explanation || ''} |`);
    return `## ${cp.heading}\n**Format:** ${cp.format || ''}\n\n| Scene | Script Line | Overlay | Footage Name | Shot List Explanation |\n|---|---|---|---|---|\n${rows.join('\n')}`;
  }).join('\n\n');
}

/* Every Footage Name on the board, for the code check after the model. */
function boardNames(story) {
  const out = new Set();
  for (const cp of story.concepts || []) {
    for (const sc of cp.scenes || []) {
      const cell = String(sc.footage || sc.footageName || '');
      for (const part of cell.split('+')) { const n = part.trim(); if (n) out.add(n); }
    }
  }
  return out;
}

async function stageGuide({ snapshot, story, batchLabel, due, log, ask }) {
  log('Shooting guide', 'running', `Phase 2 over ${(story.concepts || []).length} boarded concept${(story.concepts || []).length === 1 ? '' : 's'}`);
  const out = await ask({
    system: `You are building Phase 2 of the batch shoot package: the remote shooting guide.\n\n${SKILL_PREFACE}\n\n${skillDoc()}\n\nPhase 2, the part you are running:\n\n${phase2()}\n\nYour format spec:\n\n${ref('shooting-guide-format.md')}\n${HOUSE_RULES}`,
    prompt: `${snapshot}

THE STORYBOARD FOR ${batchLabel}, the source of truth for this shoot:

${boardText(story)}

Write the remote shooting guide for this batch. One guide per creator if the storyboard or the
snapshot names who is cast; otherwise one guide per concept with creator set to "Uncast". Footage
is due ${due || 'on the date the account team gives the creator'}; put that in \`due\` in plain words.

For each guide: the concept heading exactly as the board writes it; the duration; a one-line spec
(how many talking-head setups and how many b-rolls); wardrobe, props, gadgets and locations as
short lines a creator can act on at home; the talking-head direction; the shot list, where every
\`name\` is a Footage Name copied exactly off the board and \`why\` is the one line that tells the
creator what the shot is for; and the instructions block (tone, delivery, framing, location,
audio). \`overview\` is the client overview the format spec asks for, written for a creator who has
never heard of the brand.`,
    schema: GUIDE_SCHEMA,
    maxTokens: 32000,
  });
  log('Shooting guide', 'done', `${out.guides.length} guide${out.guides.length === 1 ? '' : 's'}, ${out.guides.reduce((a, g) => a + g.shots.length, 0)} shots`);
  return out;
}

/* Code holds the contract the prompt asked for. A shot name the board does
   not have is dropped and reported, never kept: the renamer would file that
   footage as missing while the creator has shot it. */
function enforce(guide, story) {
  const names = boardNames(story);
  const repairs = [];
  const seen = {};
  for (const g of guide.guides) {
    const keep = [];
    for (const sh of g.shots) {
      const n = String(sh.name || '').trim();
      if (names.has(n)) keep.push({ ...sh, name: n });
      else repairs.push(`${g.concept}: dropped shot "${n.slice(0, 60)}", not a Footage Name on the board`);
    }
    g.shots = keep;
    /* the page opens a guide by its creator label, so two uncast guides must
       not share one; the concept number keeps them apart honestly */
    const key = String(g.creator || 'Uncast').trim() || 'Uncast';
    if (seen[key]) {
      const num = (String(g.concept).match(/^\s*(\d{1,3})/) || [])[1];
      g.creator = `${key} ${num ? '(concept ' + num + ')' : '(' + (seen[key] + 1) + ')'}`;
    }
    seen[key] = (seen[key] || 0) + 1;
  }
  return repairs;
}

async function run({ client, story, batchLabel, due, savedBy, log }) {
  const spend = [];
  const trackedAsk = async (args) => {
    const out = await ask(args);
    if (out.__usage) { spend.push(out.__usage); delete out.__usage; }
    return out;
  };
  if (!story || !(story.concepts || []).length) {
    throw new Error('no storyboard to write the guide from. Board the scripts first; the guide follows from the board.');
  }

  log('Intake', 'running');
  const { record, matched } = await brand.resolve(client);
  const snapshot = brand.toMarkdown(record);
  log('Intake', 'done',
    `${story.concepts.length} boarded concept${story.concepts.length === 1 ? '' : 's'} from ${batchLabel}, ` +
    `snapshot for ${record.brand.brand_name} (matched on ${matched})`);

  const guide = await stageGuide({ snapshot, story, batchLabel, due, log, ask: trackedAsk });

  log('Contract check', 'running');
  const repairs = enforce(guide, story);
  log('Contract check', 'done', repairs.length
    ? `${repairs.length} shot${repairs.length === 1 ? '' : 's'} dropped for not matching the board: ${repairs.slice(0, 2).join(' | ')}${repairs.length > 2 ? ' ...' : ''}`
    : 'every shot name matches a Footage Name on the board');

  return {
    client: record.brand.brand_name,
    title: `${record.brand.brand_name} ${batchLabel} Shooting Guide`,
    batch: batchLabel,
    storyId: story.id,
    scripts: `${record.brand.brand_name} ${batchLabel} scripts`,
    by: savedBy || 'Shoot guide generator',
    savedBy: savedBy || 'Shoot guide generator',
    date: new Date().toISOString().slice(0, 10),
    due: guide.due,
    overview: guide.overview,
    guides: guide.guides,
    repairs,
    cost_usd: Math.round(spend.reduce((a, u) => a + (u && u.cost || 0), 0) * 100) / 100,
  };
}

module.exports = { run, enforce, boardText, boardNames, phase2 };
