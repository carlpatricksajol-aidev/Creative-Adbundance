'use strict';
/*
 * The batch pipeline: one record that walks a client's batch from "start" to
 * "delivered", the design Carl and Ricardo approved on Sep 2. Purple stages
 * run on their own; gate stages wait for a person, and nothing below a gate
 * starts until it passes.
 *
 * The record is deliberately lazy about its generators: advancing onto a
 * generated stage fires that generator and stores the run id, and every read
 * of the pipeline syncs those stages against their run records. No timers, no
 * queues - a poll of the pipeline IS the observer.
 *
 * Concepts, scripts and storyboards are all generated now, each from the
 * artifact the stage above it produced: concepts from the brand record,
 * scripts from the approved concept batch, storyboards from the approved
 * scripts. A stage whose input is missing parks as 'waiting' and says why,
 * rather than firing a generator with nothing to work from.
 */

const fs = require('fs');
const path = require('path');
const store = require('./store');

const DIR = path.join(process.env.DATA_DIR || '/data', 'pipelines');
fs.mkdirSync(DIR, { recursive: true });

const STEPS = [
  { id: 'plan',         kind: 'auto',   label: 'Marketing plan' },
  { id: 'plan_pass',    kind: 'gate',   label: 'Plan pass' },
  { id: 'concepts',     kind: 'auto',   label: 'Concepts' },
  { id: 'concept_pass', kind: 'gate',   label: 'Concept pass + client' },
  { id: 'scripts',      kind: 'auto',   label: 'Scripts' },
  { id: 'script_pass',  kind: 'gate',   label: 'Script pass + client' },
  { id: 'storyboards',  kind: 'auto',   label: 'Storyboards + shoot guides' },
  { id: 'production',   kind: 'manual', label: 'Talent, shoot, footage' },
  { id: 'edit',         kind: 'manual', label: 'Edit, ads, client pass' },
  { id: 'delivered',    kind: 'gate',   label: 'Delivered' },
];
const idx = (id) => STEPS.findIndex((s) => s.id === id);
const nextOf = (id) => STEPS[idx(id) + 1];

/* The three generated rungs, in one table instead of a chain of special cases.
 *
 * The old code fired the generator from `if (next.id === 'concepts')`, keyed on
 * a literal id rather than on kind, so a second auto rung silently landed in
 * the else branch and parked forever. Everything a generated rung needs now
 * lives on its entry here:
 *   fn      which runner the server injected
 *   artifact  the field the finished run writes, copied onto the step so the
 *             rung links to what it produced instead of asserting it happened
 *   input   where this rung's material comes from, and the honest sentence to
 *           show when it is not there yet
 */
const GENERATED = {
  concepts: {
    fn: 'startRunFn',
    artifact: 'batchId',
    running: 'The generator is writing. Takes about twenty minutes; this page follows it.',
    done: (rec, step) => 'Batch ' + (step.batchId || '') + ' is on the board.',
    args: (rec, by) => ({ client: rec.client, count: 5, requestedBy: rec.requestedBy || by }),
  },
  scripts: {
    fn: 'startScriptFn',
    artifact: 'scriptsId',
    running: 'The script writer is drafting, then the DR scorecard reviews every script. This page follows it.',
    done: (rec, step) => 'Scripts are written and reviewed. Open the Scripts area to read them.',
    input: (rec) => {
      const b = rec.steps.concepts && rec.steps.concepts.batchId;
      return b
        ? { ok: true, args: { client: rec.client, batchId: b, requestedBy: rec.requestedBy } }
        : { ok: false, why: 'No approved concept batch is linked to this pipeline yet, so there is nothing to script. Run the concept stage, or write the scripts by hand in the Scripts area and mark this rung done.' };
    },
  },
  storyboards: {
    fn: 'startStoryFn',
    artifact: 'storyId',
    running: 'Building the scene tables from the approved scripts, then checking every Footage Name against the renamer contract.',
    done: (rec, step) => 'The storyboard is built. Open Storyboards to review it before the shoot.',
    input: (rec) => {
      const s = rec.steps.scripts && rec.steps.scripts.scriptsId;
      return s
        ? { ok: true, args: { client: rec.client, scriptsId: s, requestedBy: rec.requestedBy, savedBy: rec.requestedBy } }
        : { ok: false, why: 'No generated scripts are linked to this pipeline yet, so there is nothing to board. Run the script stage, or build the batch page by hand in Storyboards and mark this rung done.' };
    },
  },
};

/* What a manual rung tells the person who lands on it. Shared, because a rung
   can be entered two ways - by a person passing the gate above it, or by the
   observer promoting a finished generator - and both have to say the same
   thing. Keeping one copy is what stopped 'production' arriving blank. */
const MANUAL_DETAIL = {
  production: 'Pick talent, shoot, and run the Footage renamer on the upload. Mark done when the clean folder is in.',
  edit: 'Assemble the edit, pass the ads through the gate to the client. Mark done when they accept.',
};

/* Move the record onto `id` and set that rung up for whoever arrives on it.
   `fns` is empty when the observer does the moving, and no generated rung ever
   directly follows another, so that case only ever enters a gate or a manual
   rung. If that ever stops being true, the rung parks with an honest sentence
   rather than sitting silently pending. */
function enter(rec, id, fns, by) {
  rec.cur = id;
  const def = STEPS[idx(id)];
  const ns = rec.steps[id];
  if (!def || !ns) return rec;

  const gen = GENERATED[id];
  if (gen) {
    const runner = fns && fns[gen.fn];
    const input = gen.input ? gen.input(rec) : { ok: true, args: gen.args(rec, by) };
    if (!runner) {
      ns.status = 'waiting';
      ns.detail = fns
        ? 'The ' + def.label.toLowerCase() + ' generator is not wired up on this server. Do this rung by hand and mark it done.'
        : 'Ready to generate. Advance this rung to start the ' + def.label.toLowerCase() + ' generator.';
    } else if (!input.ok) {
      ns.status = 'waiting';
      ns.detail = input.why;
    } else {
      ns.status = 'running';
      ns.detail = gen.running;
      ns.at = new Date().toISOString();
      Promise.resolve(runner(input.args))
        .then((runId) => { ns.runId = runId; save(rec); })
        .catch((e) => { ns.status = 'error'; ns.detail = e.message; save(rec); });
    }
  } else if (def.kind === 'manual') {
    ns.status = 'waiting';
    ns.detail = MANUAL_DETAIL[id] || 'Do this rung by hand and mark it done.';
  } else {
    ns.status = 'pending';
  }
  return rec;
}

const safeId = (s) => String(s || '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 120);
const file = (id) => path.join(DIR, `${safeId(id)}.json`);

function writeJSON(p, obj) {
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, p);
}

function save(rec) {
  rec.updatedAt = new Date().toISOString();
  writeJSON(file(rec.id), rec);
  return rec;
}

function get(id) {
  try { return sync(JSON.parse(fs.readFileSync(file(id), 'utf8'))); }
  catch { return null; }
}

function list(client) {
  const want = client ? String(client).toLowerCase() : null;
  return fs.readdirSync(DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch { return null; } })
    .filter((p) => p && (!want || String(p.client).toLowerCase() === want))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .map(sync);
}

function start({ client, requestedBy }) {
  const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const steps = {};
  for (const s of STEPS) steps[s.id] = { status: 'pending' };
  /* The per-batch plan generator is CA-03 and still switched off, so the plan
     stage records that honestly instead of pretending: the concept run reads
     the market-level brief the way it does today. */
  steps.plan = {
    status: 'stub',
    detail: 'The per-batch plan generator is not switched on yet (CA-03). This batch runs on the research library brief; the pass below is your read of that.',
    at: new Date().toISOString(),
  };
  const rec = { id, client: String(client).slice(0, 120), requestedBy: String(requestedBy || '').slice(0, 120),
    createdAt: new Date().toISOString(), cur: 'plan_pass', steps };
  return save(rec);
}

/* The lazy observer. Every generated rung that is running follows its own run
   record, so one poll of the pipeline advances whichever of the three is in
   flight. Only the rung the pipeline is actually sitting on can move it on,
   which keeps a late-finishing run from yanking `cur` backwards. */
function sync(rec) {
  let dirty = false;
  for (const [id, def] of Object.entries(GENERATED)) {
    const step = rec.steps && rec.steps[id];
    if (!step || step.status !== 'running' || !step.runId) continue;
    const run = store.getRun(step.runId);
    if (!run) continue;

    if (run.status === 'done') {
      step.status = 'done';
      if (run[def.artifact]) step[def.artifact] = run[def.artifact];
      step.detail = def.done(rec, step);
      step.at = new Date().toISOString();
      dirty = true;
      if (rec.cur === id) {
        const nx = nextOf(id);
        if (nx) enter(rec, nx.id, null, rec.requestedBy);
        else rec.cur = 'done';
      }
      store.notify({
        to: rec.requestedBy, client: rec.client, open: 'pipeline',
        text: id === 'concepts'
          ? 'The concept generator finished for ' + rec.client + ' - the batch is on the board and the concept pass is yours.'
          : id === 'scripts'
            ? 'The scripts are written for ' + rec.client + ' - the script pass is yours.'
            : 'The storyboard is built for ' + rec.client + ' - review it before the shoot.',
      });
    } else if (run.status === 'error') {
      step.status = 'error';
      step.detail = run.error || 'the run failed';
      dirty = true;
      store.notify({
        to: rec.requestedBy, client: rec.client, open: 'pipeline',
        text: 'The ' + id + ' run for ' + rec.client + ' failed: ' + String(run.error || '').slice(0, 140),
      });
    }
  }
  if (dirty) save(rec);
  return rec;
}

/* Passing the current gate (or hand-finishing a manual rung) moves the
   pipeline on. A generated stage fires its generator immediately, unless the
   artifact it needs is missing, in which case it parks and says so. */
function advance(rec, { by, note, ...fns }) {
  const cur = rec.steps[rec.cur];
  const def = STEPS[idx(rec.cur)];
  if (!cur || !def) throw Object.assign(new Error('this pipeline has nowhere to go'), { status: 400 });

  cur.status = 'done';
  cur.by = String(by || '').slice(0, 120);
  if (note) cur.note = String(note).slice(0, 1000);
  cur.at = new Date().toISOString();

  const next = STEPS[idx(rec.cur) + 1];
  if (!next) { rec.cur = 'done'; return save(rec); }
  enter(rec, next.id, fns || {}, by);
  return save(rec);
}

function sendBack(rec, { by, note }) {
  const cur = rec.steps[rec.cur];
  if (!cur) throw Object.assign(new Error('nothing to send back'), { status: 400 });
  cur.status = 'sent_back';
  cur.by = String(by || '').slice(0, 120);
  cur.note = String(note || '').slice(0, 1000);
  cur.at = new Date().toISOString();
  return save(rec);
}

module.exports = { STEPS, start, get, list, advance, sendBack };
