'use strict';
/*
 * Runs and finished batches on disk as JSON. Deliberately not a database: a
 * studio produces a handful of batches a week, the files are readable with cat
 * when something looks wrong, and it adds no new credential to distribute. If
 * this ever needs querying across clients, move it to Postgres then, not now.
 */

const fs = require('fs');
const path = require('path');

const DATA = process.env.DATA_DIR || '/data';
const RUNS = path.join(DATA, 'runs');
const BATCHES = path.join(DATA, 'batches');

for (const d of [DATA, RUNS, BATCHES]) fs.mkdirSync(d, { recursive: true });

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const runFile = (id) => path.join(RUNS, `${id}.json`);

function writeJSON(p, obj) {
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, p);           // atomic, so a poll never reads a half-written file
}

function newRun({ id, client, count, requestedBy }) {
  const run = {
    id, client, count, requestedBy: requestedBy || 'unknown',
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    steps: [],
    error: null,
    batchId: null,
  };
  writeJSON(runFile(id), run);
  return run;
}

function getRun(id) {
  try { return JSON.parse(fs.readFileSync(runFile(id), 'utf8')); }
  catch { return null; }
}

/* Steps are keyed by name so a stage can go running -> done in place, which is
   what the frontend's progress list expects. */
function step(id, name, state, detail) {
  const run = getRun(id);
  if (!run) return;
  const found = run.steps.find((s) => s.name === name);
  if (found) { found.state = state; if (detail) found.detail = detail; }
  else run.steps.push({ name, state, detail: detail || '', at: new Date().toISOString() });
  writeJSON(runFile(id), run);
}

function finishRun(id, patch) {
  const run = getRun(id);
  if (!run) return;
  Object.assign(run, patch, { finishedAt: new Date().toISOString() });
  writeJSON(runFile(id), run);
  return run;
}

function saveBatch(result) {
  const id = `${slug(result.client)}-${Date.now()}`;
  const rec = { id, savedAt: new Date().toISOString(), ...result };
  writeJSON(path.join(BATCHES, `${id}.json`), rec);
  return rec;
}

function getBatch(id) {
  try { return JSON.parse(fs.readFileSync(path.join(BATCHES, `${id}.json`), 'utf8')); }
  catch { return null; }
}

/* Newest first. Used both by the frontend's batch picker and by the library
   check, which needs the titles of everything already shipped for a client. */
function listBatches(client) {
  const want = client ? slug(client) : null;
  return fs.readdirSync(BATCHES)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        const b = JSON.parse(fs.readFileSync(path.join(BATCHES, f), 'utf8'));
        return { id: b.id, client: b.client, savedAt: b.savedAt, count: (b.concepts || []).length,
                 titles: (b.concepts || []).map((c) => c.title) };
      } catch { return null; }
    })
    .filter(Boolean)
    .filter((b) => !want || slug(b.client) === want)
    .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
}

/* What the harvest is told not to repeat. */
function priorTitles(client) {
  const prev = listBatches(client);
  if (!prev.length) return '';
  return prev.map((b) => `${b.client} batch of ${b.savedAt.slice(0, 10)}: ${b.titles.join('; ')}`).join('\n');
}

module.exports = { newRun, getRun, step, finishRun, saveBatch, getBatch, listBatches, priorTitles, DATA };
