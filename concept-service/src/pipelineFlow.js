'use strict';
/*
 * The batch pipeline: one record that walks a client's batch from "start" to
 * "delivered", the design Carl and Ricardo approved on Sep 2. Purple stages
 * run on their own; gate stages wait for a person, and nothing below a gate
 * starts until it passes.
 *
 * The record is deliberately lazy about the concepts run: advancing the
 * concept stage fires the existing generator and stores the run id, and every
 * read of the pipeline syncs that stage against the run record. No timers, no
 * queues - a poll of the pipeline IS the observer.
 *
 * Script and storyboard generation wait on Ricardo's agents. Until those land,
 * the stages sit as 'waiting' and a person marks them done by hand - the flow
 * is real end to end today, just with two manual rungs.
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
  { id: 'scripts',      kind: 'agent',  label: 'Scripts' },
  { id: 'script_pass',  kind: 'gate',   label: 'Script pass + client' },
  { id: 'storyboards',  kind: 'agent',  label: 'Storyboards + shoot guides' },
  { id: 'production',   kind: 'manual', label: 'Talent, shoot, footage' },
  { id: 'edit',         kind: 'manual', label: 'Edit, ads, client pass' },
  { id: 'delivered',    kind: 'gate',   label: 'Delivered' },
];
const idx = (id) => STEPS.findIndex((s) => s.id === id);

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

/* the lazy observer: a running concepts stage follows its run record */
function sync(rec) {
  const c = rec.steps && rec.steps.concepts;
  if (c && c.status === 'running' && c.runId) {
    const run = store.getRun(c.runId);
    if (run && run.status === 'done') {
      c.status = 'done';
      c.batchId = run.batchId;
      c.detail = 'Batch ' + (run.batchId || '') + ' is on the board.';
      c.at = new Date().toISOString();
      rec.cur = 'concept_pass';
      save(rec);
    } else if (run && run.status === 'error') {
      c.status = 'error';
      c.detail = run.error || 'the run failed';
      save(rec);
    }
  }
  return rec;
}

/* Passing the current gate (or hand-finishing a manual/agent rung) moves the
   pipeline on. The next auto stage fires immediately; agent stages without
   their agent yet park as 'waiting' so the batch never silently stalls. */
function advance(rec, { by, note, startRunFn }) {
  const cur = rec.steps[rec.cur];
  const def = STEPS[idx(rec.cur)];
  if (!cur || !def) throw Object.assign(new Error('this pipeline has nowhere to go'), { status: 400 });

  cur.status = 'done';
  cur.by = String(by || '').slice(0, 120);
  if (note) cur.note = String(note).slice(0, 1000);
  cur.at = new Date().toISOString();

  const next = STEPS[idx(rec.cur) + 1];
  if (!next) { rec.cur = 'done'; return save(rec); }
  rec.cur = next.id;
  const ns = rec.steps[next.id];

  if (next.id === 'concepts') {
    ns.status = 'running';
    ns.detail = 'The generator is writing. Takes about twenty minutes; this page follows it.';
    ns.at = new Date().toISOString();
    Promise.resolve(startRunFn({ client: rec.client, count: 5, requestedBy: rec.requestedBy || by }))
      .then((runId) => { ns.runId = runId; save(rec); })
      .catch((e) => { ns.status = 'error'; ns.detail = e.message; save(rec); });
  } else if (next.kind === 'agent') {
    ns.status = 'waiting';
    ns.detail = next.id === 'scripts'
      ? "Waiting on Ricardo's script agent (with the compliance checker). Write the scripts in the Scripts area, then mark this rung done."
      : "Waiting on Ricardo's storyboard agent. Build the batch page in Storyboards, then mark this rung done.";
  } else if (next.kind === 'manual') {
    ns.status = 'waiting';
    ns.detail = next.id === 'production'
      ? 'Pick talent, shoot, and run the Footage renamer on the upload. Mark done when the clean folder is in.'
      : 'Assemble the edit, pass the ads through the gate to the client. Mark done when they accept.';
  } else {
    ns.status = 'pending';
  }
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
