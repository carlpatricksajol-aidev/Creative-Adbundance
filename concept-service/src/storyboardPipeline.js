'use strict';
/*
 * Phase 1 of the batch-shoot-package skill, as code: approved scripts in, a
 * storyboard page out, in the exact shape the OS storyboard editor already
 * saves and the footage renamer already parses.
 *
 * The craft lives in the skill's reference files. What lives HERE, and only
 * here, is the machine contract: the five columns, and the Footage Name rules
 * the renamer depends on. Those are enforced in code after the model answers,
 * because a model that puts a comma in a Footage Name does not produce an
 * error, it produces two phantom shots and a mis-sorted shoot.
 *
 * The scene table columns are Scene, Script Line, Overlay, Footage Name and
 * Shot List Explanation. The renamer matches them by exact name after trim and
 * lowercase, in FootageRenamer/lib/rename.js and again in stage2.js. Never
 * rename one.
 */

const fs = require('fs');
const path = require('path');
const { ask } = require('./llm');
const brand = require('./dossier');

const SKILL_DIR = process.env.STORY_SKILL_DIR ||
  '/srv/repo/.claude/skills/batch-shoot-package';

function ref(name) {
  const p = path.join(SKILL_DIR, 'references', name);
  try { return fs.readFileSync(p, 'utf8'); }
  catch { throw new Error(`missing storyboard skill reference ${name} at ${p}. Is the repo checked out and up to date?`); }
}

/* --------------------------------------------------------------- schemas ---- */

/* scene/line/overlay/footage/shot are the five columns, in the field names the
   OS storyboard editor and store.saveStory already use. */
const SCENE = {
  type: 'object',
  additionalProperties: false,
  properties: {
    scene: { type: 'string' },
    line: { type: 'string' },
    overlay: { type: 'string' },
    footage: { type: 'string' },
    shot: { type: 'string' },
  },
  required: ['scene', 'line', 'overlay', 'footage', 'shot'],
};

const STORY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reusable: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          footage: { type: 'string' },
          shot: { type: 'string' },
        },
        required: ['footage', 'shot'],
      },
    },
    concepts: {
      type: 'array', minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          num: { type: 'string' },
          title: { type: 'string' },
          format: { type: 'string' },
          scenes: { type: 'array', items: SCENE, minItems: 4 },
        },
        required: ['num', 'title', 'format', 'scenes'],
      },
    },
  },
  required: ['reusable', 'concepts'],
};

/* ------------------------------------------------------- the machine contract ---- */

/* Mirrors deriveSlug in FootageRenamer/lib/rename.js. The slug is the join key
   the vision matcher resolves against, so two names that slug the same are
   indistinguishable downstream. */
function deriveSlug(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const isTalkingHead = (s) => /^talking[\s_-]*heads?$/i.test(String(s || '').trim());

/* Split the way the renamer splits, so this sees exactly what it will see. */
function splitShots(cell) {
  const raw = String(cell || '').trim();
  if (!raw || !/[a-z0-9]/i.test(raw)) return [];
  if (isTalkingHead(raw)) return [];
  return raw.split(/[+,]/).map((s) => s.trim()).filter(Boolean).filter((s) => !isTalkingHead(s));
}

/* Enforce the contract on the model's output and REPORT every repair, so a
 * silent breakage becomes a visible line in the run log.
 *
 * The repairs, in order of how much damage they prevent:
 *  - a comma inside a Footage Name forks into phantom shots, so commas become
 *    spaces. The skill tells the model to join real multi-shot cells with " + ",
 *    which is why a surviving comma is treated as accidental punctuation.
 *  - a blank Scene cell is silently DROPPED by the renamer, taking its shot
 *    with it, so a blank scene is numbered instead.
 *  - two Footage Names that slug identically collide on lookup, so the second
 *    is suffixed.
 */
function enforce(concepts) {
  const repairs = [];
  const slugOwner = new Map();

  for (const cp of concepts) {
    const scenes = cp.scenes || [];

    /* Scene ids in two passes. The names the model actually wrote are claimed
       FIRST, so a synthetic id for a blank cell can never steal a name a real
       row was using and push it into a rename. */
    const taken = new Set();
    for (const sc of scenes) {
      sc.scene = String(sc.scene || '').trim();
      if (!sc.scene) continue;
      const key = sc.scene.toLowerCase();
      if (taken.has(key)) {
        const was = sc.scene;
        let i = 2;
        while (taken.has(`${was} ${i}`.toLowerCase())) i += 1;
        sc.scene = `${was} ${i}`;
        repairs.push(`${cp.num}: two rows both called "${was}", renamed the second to "${sc.scene}"`);
      }
      taken.add(sc.scene.toLowerCase());
    }
    for (const sc of scenes) {
      if (sc.scene) continue;
      let i = scenes.length;
      while (taken.has(`scene ${i}`)) i += 1;
      sc.scene = `Scene ${i}`;
      taken.add(sc.scene.toLowerCase());
      repairs.push(`${cp.num}: a blank Scene cell would have been dropped with its shot, numbered it "${sc.scene}"`);
    }

    for (const sc of scenes) {
      let f = String(sc.footage || '').trim();

      if (f.includes(',')) {
        const was = f;
        f = f.replace(/\s*,\s*/g, ' ').replace(/\s+/g, ' ').trim();
        repairs.push(`${cp.num} / ${sc.scene}: a comma in "${was}" would have forked into phantom shots, wrote "${f}"`);
      }

      /* Nothing alphanumeric, or any spelling of the marker, means a
         talking-head beat. Normalise it to the one spelling everyone reads so
         nobody has to wonder whether "-" was an omission. */
      if (!f || !/[a-z0-9]/i.test(f) || isTalkingHead(f)) {
        if (f && f !== 'Talking Head') {
          repairs.push(`${cp.num} / ${sc.scene}: Footage Name was "${f}", wrote "Talking Head" so the beat reads as a scene type`);
        }
        f = 'Talking Head';
      }

      /* Rebuild the cell from its parts rather than string-replacing, so one
         shot name being a substring of another cannot corrupt the other. */
      const parts = splitShots(f);
      if (parts.length) {
        const rebuilt = parts.map((shot) => {
          const slug = deriveSlug(shot);
          if (!slug) return shot;
          const owner = slugOwner.get(slug);
          if (owner && owner !== shot) {
            let fixed = `${shot} ${cp.num}`;
            let i = 2;
            while (slugOwner.has(deriveSlug(fixed)) && slugOwner.get(deriveSlug(fixed)) !== fixed) {
              fixed = `${shot} ${cp.num} ${i}`; i += 1;
            }
            repairs.push(`${cp.num} / ${sc.scene}: "${shot}" is the same shot as "${owner}" once slugged, renamed to "${fixed}"`);
            slugOwner.set(deriveSlug(fixed), fixed);
            return fixed;
          }
          if (!owner) slugOwner.set(slug, shot);
          return shot;
        });
        f = rebuilt.join(' + ');
      }
      sc.footage = f;

      sc.line = String(sc.line || '').trim();
      sc.overlay = String(sc.overlay || '').trim();
      sc.shot = String(sc.shot || '').trim();
    }
  }
  return repairs;
}

/* Every unique Footage Name in a concept, with its description. The OS derives
   the Extracted Shot List the same way, so this is only used for the log. */
function shotCount(concepts) {
  const s = new Set();
  for (const cp of concepts) {
    for (const sc of cp.scenes || []) {
      for (const shot of splitShots(sc.footage)) s.add(deriveSlug(shot));
    }
  }
  return s.size;
}

/* ----------------------------------------------------------------- stages ---- */

const HOUSE_RULES = `
Hard rules that apply to every stage:
- NO EM DASHES anywhere. Use a comma or a full stop. This is a product rule, not a preference.
- Never invent a claim or a number. Everything spoken comes from the approved script.
- Obey the snapshot's compliance_notes, dos_and_donts and creative_boundaries as hard gates.
- Plain speech, written for a creator holding a phone.
`;

const CONTRACT_RULES = `
THE MACHINE CONTRACT. The storyboard is parsed by the footage renamer to sort a creator's raw
uploads. These are not style preferences; breaking one mis-sorts a shoot without raising an error.

- Footage Name must NEVER contain a comma. The renamer splits that cell on "+" AND on ",", so
  "kitchen counter, morning light" becomes two shots that were never filmed. Write
  "kitchen counter morning light".
- Join several shots in one scene with " + " and nothing else.
- A talking-head beat has exactly "Talking Head" in Footage Name. It is a scene type, not a shot.
- Every Footage Name must be unique across the whole batch by more than punctuation or case. The
  join key lowercases the name and flattens every run of non-alphanumeric characters to one
  underscore, so "Towel Close-Up" and "towel close up" are the same shot downstream.
- A shot reused in several scenes keeps the IDENTICAL name every time. That is how a creator films
  it once and every scene resolves to that one file.
- Prefix a POV shot with "1stPOV_" for hands or object only, or "3rdPOV_" when the person is in
  frame.
- Scene must never be blank. A row with a blank Scene is dropped, and its shot vanishes with it.
- Keep Footage Names short and physical: what is in frame, not why it is there.
`;

async function stageStoryboard({ snapshot, scripts, batchLabel, log, ask }) {
  log('Storyboards', 'running');
  const out = await ask({
    system: `You are building Phase 1 of the batch shoot package: the storyboards. Your format spec:\n\n${ref('storyboard-format.md')}\n${CONTRACT_RULES}\n${HOUSE_RULES}`,
    prompt: `${snapshot}\n\nBuild the storyboard for ${batchLabel} from the approved scripts below.

One section per script, keeping the script's number. Each section carries a Format line naming
production type, camera style, pacing and duration, then the scene table.

The scene table rows, in this order:
- Hook 1, Hook 2, Hook 3 as the first three rows, one per hook variant in the script. These are
  alternate opens: the creator shoots all three and the editor picks. Script Line is that hook's
  spoken opening line and Overlay is its on-screen text. Footage Name is "Talking Head" unless the
  hook is genuinely visual, in which case give it its own shot.
- Then one row per beat of the script body, as Scene 1, Scene 2 and so on. Script Line is the
  spoken line verbatim from the script. Overlay is the on-screen text for that beat, or empty.
- Then a CTA row for the closing beat.

Footage Name is what the creator has to film for that beat. Shot List Explanation is one line
telling the creator what actually happens on camera, written as an instruction.

Coverage is not optional: every script, every hook and every beat must appear. Where a script beat
does not say where it happens or how it is shot, infer it from the concept's format and the
brand's tone rather than leaving it blank.

In reusable, list the shots that appear in more than one concept, with their descriptions. Those
are the ones a creator films once and reuses, so they must carry the identical Footage Name
everywhere they appear.

THE APPROVED SCRIPTS:\n${JSON.stringify(scripts, null, 1)}`,
    schema: STORY_SCHEMA,
    maxTokens: 64000,
  });
  log('Storyboards', 'done',
    `${out.concepts.length} concept${out.concepts.length === 1 ? '' : 's'} boarded, ` +
    `${out.concepts.reduce((a, c) => a + (c.scenes || []).length, 0)} scenes`);
  return out;
}

/* ------------------------------------------------------------------- run ---- */

async function run({ client, scripts, batchLabel, savedBy, log }) {
  const spend = [];
  const baseAsk = ask;
  const trackedAsk = async (args) => {
    const out = await baseAsk(args);
    if (out.__usage) { spend.push(out.__usage); delete out.__usage; }
    return out;
  };

  if (!scripts || !scripts.length) {
    throw new Error('no approved scripts to board. Generate and approve a scripts batch first.');
  }

  log('Intake', 'running');
  const { record, matched } = await brand.resolve(client);
  const snapshot = brand.toMarkdown(record);
  log('Intake', 'done',
    `${scripts.length} script${scripts.length === 1 ? '' : 's'} in scope from ${batchLabel}, ` +
    `snapshot for ${record.brand.brand_name} (matched on ${matched})`);

  const board = await stageStoryboard({ snapshot, scripts, batchLabel, log, ask: trackedAsk });

  log('Contract check', 'running');
  const repairs = enforce(board.concepts);
  log('Contract check', repairs.length ? 'done' : 'done',
    repairs.length
      ? `${repairs.length} repair${repairs.length === 1 ? '' : 's'} so the renamer parses it: ${repairs.slice(0, 2).join(' | ')}${repairs.length > 2 ? ' ...' : ''}`
      : `${shotCount(board.concepts)} unique shots, every Footage Name safe for the renamer`);

  /* The record shape the OS storyboard editor saves and reads: a page of
     concept sections, each with the five-column scene list. heading is the
     "NNN_Title" the whole ecosystem joins on. */
  const concepts = board.concepts.map((cp) => ({
    heading: `${String(cp.num).padStart(3, '0')}_${cp.title}`,
    product: '',
    format: cp.format,
    done: {},
    scenes: cp.scenes,
  }));

  log('Storyboard ready', 'done',
    `${concepts.length} section${concepts.length === 1 ? '' : 's'}, ${shotCount(board.concepts)} unique shots to film`);

  return {
    client: record.brand.brand_name,
    title: `${record.brand.brand_name} ${batchLabel} Storyboards`,
    batch: batchLabel,
    savedBy: savedBy || 'Storyboard generator',
    concepts,
    reusable: board.reusable,
    repairs,
    shots: shotCount(board.concepts),
    cost_usd: Math.round(spend.reduce((a, u) => a + (u && u.cost || 0), 0) * 100) / 100,
  };
}

module.exports = { run, enforce, deriveSlug, splitShots };
