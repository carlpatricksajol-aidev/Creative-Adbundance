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
const STORIES = path.join(DATA, 'storyboards');

for (const d of [DATA, RUNS, BATCHES, STORIES]) fs.mkdirSync(d, { recursive: true });

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
/* Ids arrive from the page, so they never reach a path unfiltered. */
const safeId = (s) => String(s || '').replace(/[^A-Za-z0-9._-]/g, '').replace(/^\.+/, '').slice(0, 120);
const runFile = (id) => path.join(RUNS, `${safeId(id)}.json`);

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
  try { return JSON.parse(fs.readFileSync(path.join(BATCHES, `${safeId(id)}.json`), 'utf8')); }
  catch { return null; }
}

/* ---------- storyboards ----------
 * Authored by hand in the OS rather than produced by a run, so a save is an
 * upsert on an id the page already holds. Shape mirrors the team's Notion job
 * page: the row properties, then the concept and script bodies, then the
 * scene table (Scene / Script Line / Overlay / Footage Name / Shot List
 * Explanation), so what is authored here parses with the same rules the
 * footage renamer already uses.
 */
const storyFile = (id) => path.join(STORIES, `${safeId(id)}.json`);

function saveStory(rec) {
  const id = safeId(rec.id) || `${slug(rec.client || 'untitled')}-${Date.now()}`;
  const prev = getStory(id) || {};
  const out = { ...prev, ...rec, id, savedAt: new Date().toISOString() };
  out.createdAt = prev.createdAt || out.savedAt;
  writeJSON(storyFile(id), out);
  return out;
}

function getStory(id) {
  try { return JSON.parse(fs.readFileSync(storyFile(id), 'utf8')); }
  catch { return null; }
}

/* Newest first. The list carries only what the index table shows, so opening
   the page is one more request and the list stays small. */
function listStories(client) {
  const want = client ? slug(client) : null;
  return fs.readdirSync(STORIES)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        const s = JSON.parse(fs.readFileSync(path.join(STORIES, f), 'utf8'));
        return { id: s.id, client: s.client, title: s.title || 'Untitled',
                 creator: s.creator || '', status: s.status || 'Draft',
                 dropbox: s.dropbox || '', outputFolder: s.outputFolder || '',
                 scenes: (s.scenes || []).length, savedAt: s.savedAt,
                 savedBy: s.savedBy || '', archived: Boolean(s.archived) };
      } catch { return null; }
    })
    .filter(Boolean)
    .filter((s) => !s.archived)
    .filter((s) => !want || slug(s.client) === want)
    .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
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

/* What the harvest is told not to repeat. The skill dedups at OBSERVATION
   level, so each prior concept travels with its observation and insight family
   when it has them, and a title alone only when it does not. Newest batches
   first, capped so a long history cannot crowd the prompt. */
function priorContext(client, capChars = 9000) {
  const prev = listBatches(client);
  if (!prev.length) return { text: '', batches: 0, concepts: 0 };
  let out = [];
  let used = 0;
  let batches = 0;
  let concepts = 0;
  for (const meta of prev) {
    const b = getBatch(meta.id);
    if (!b) continue;
    const lines = (b.concepts || []).map((c) => {
      let l = `- "${c.title}"`;
      if (c.insight_family) l += ` [family: ${c.insight_family}]`;
      if (c.observation) l += ` observation: ${String(c.observation).slice(0, 160)}`;
      else if (c.logline || c.hook) l += ` logline: ${String(c.logline || c.hook).slice(0, 120)}`;
      return l;
    });
    const block = `${b.client}, batch of ${String(b.savedAt).slice(0, 10)} (${lines.length} concepts):\n` + lines.join('\n');
    if (used + block.length > capChars && batches > 0) break;
    out.push(block);
    used += block.length;
    batches++;
    concepts += lines.length;
  }
  return { text: out.join('\n\n'), batches, concepts };
}

module.exports = { newRun, getRun, step, finishRun, saveBatch, getBatch, listBatches, priorContext,
                   saveStory, getStory, listStories, DATA };
