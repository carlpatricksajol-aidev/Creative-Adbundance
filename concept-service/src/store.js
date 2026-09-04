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
const SCRIPTS = path.join(DATA, 'scripts');
const HARVESTS = path.join(DATA, 'harvests');
const FOOTAGE = path.join(DATA, 'footage');
const NOTIFS = path.join(DATA, 'notifications.json');

for (const d of [DATA, RUNS, BATCHES, STORIES, SCRIPTS, HARVESTS, FOOTAGE]) fs.mkdirSync(d, { recursive: true });

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
/* Ids arrive from the page, so they never reach a path unfiltered. */
const safeId = (s) => String(s || '').replace(/[^A-Za-z0-9._-]/g, '').replace(/^\.+/, '').slice(0, 120);
const runFile = (id) => path.join(RUNS, `${safeId(id)}.json`);

function writeJSON(p, obj) {
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, p);           // atomic, so a poll never reads a half-written file
}

function newRun({ id, client, count, requestedBy, kind, from }) {
  const run = {
    id, client, count, requestedBy: requestedBy || 'unknown',
    /* Concepts, scripts and storyboards all run through the same run record so
       the page can follow any of them with one poll. Default keeps every run
       written before this field existed reading as a concept run. */
    kind: kind || 'concepts',
    from: from || null,
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
  out.title = out.title || 'Untitled';
  out.status = out.status || 'Draft';
  out.scenes = out.scenes || [];
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
        /* A record written before storyboards were grouped by batch holds a
           single flat scene list; read it as one unnamed concept. */
        const cps = Array.isArray(s.concepts) ? s.concepts
                  : (s.scenes || []).length ? [{ heading: '', scenes: s.scenes }] : [];
        /* The concept numbers on this page, so the concept board and the script
           can link straight back to the storyboard that covers them. */
        const nums = cps
          .map((cp) => (String(cp.heading || '').match(/^\s*(\d{1,3})(?=[^\d]|$)/) || [])[1])
          .filter(Boolean);
        return { id: s.id, client: s.client, title: s.title || 'Untitled',
                 batch: s.batch || '', creator: s.creator || '', status: s.status || 'Draft',
                 dropbox: s.dropbox || '', outputFolder: s.outputFolder || '',
                 concepts: cps.length, nums,
                 scenes: cps.reduce((a, cp) => a + (cp.scenes || []).length, 0),
                 savedAt: s.savedAt, savedBy: s.savedBy || '', archived: Boolean(s.archived) };
      } catch { return null; }
    })
    .filter(Boolean)
    .filter((s) => !s.archived)
    .filter((s) => !want || slug(s.client) === want)
    .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
}

/* Newest first. Used both by the frontend's batch picker and by the library
   check, which needs the titles of everything already shipped for a client. */
/* ---------- audience harvests ----------
 * What real customers actually said, found by the audience-harvest skill and
 * posted here. Research is written by an agent and read by the service, the
 * same split research.js already documents, so this only ever stores what it
 * is given and never goes looking itself.
 *
 * Newest per client wins. A harvest ages: the behaviour it describes moves on,
 * so a run reports how old the one it used is rather than treating it as
 * timeless.
 */
function saveHarvest(rec) {
  const id = `${slug(rec.client)}-${Date.now()}`;
  const out = {
    id,
    savedAt: new Date().toISOString(),
    client: rec.client,
    persona: rec.persona || '',
    observations: Array.isArray(rec.observations) ? rec.observations : [],
    families: rec.families || [],
    coverage: rec.coverage || null,
    notes: rec.notes || '',
    markdown: rec.markdown || '',
    harvestedBy: rec.harvestedBy || 'audience-harvest',
  };
  writeJSON(path.join(HARVESTS, `${id}.json`), out);
  return out;
}

function listHarvests(client) {
  const want = client ? slug(client) : null;
  return fs.readdirSync(HARVESTS)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try { return JSON.parse(fs.readFileSync(path.join(HARVESTS, f), 'utf8')); }
      catch { return null; }
    })
    .filter(Boolean)
    .filter((h) => !want || slug(h.client) === want)
    .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
}

/* The one a run should use: newest for this client, or null. */
function latestHarvest(client) {
  return listHarvests(client)[0] || null;
}

function getHarvest(id) {
  try { return JSON.parse(fs.readFileSync(path.join(HARVESTS, `${safeId(id)}.json`), 'utf8')); }
  catch { return null; }
}

/* ---------- generated scripts ----------
 * Produced by a run, unlike storyboards which can also be authored by hand, so
 * a save is an insert keyed on the run that made it. Shape is the one the OS
 * scripts surface already renders: docs[] with hooks[] and script[].
 */
function saveScripts(result) {
  const id = `${slug(result.client)}-${Date.now()}`;
  const rec = { id, savedAt: new Date().toISOString(), ...result };
  writeJSON(path.join(SCRIPTS, `${id}.json`), rec);
  return rec;
}

function getScripts(id) {
  try { return JSON.parse(fs.readFileSync(path.join(SCRIPTS, `${safeId(id)}.json`), 'utf8')); }
  catch { return null; }
}

function listScripts(client) {
  const want = client ? slug(client) : null;
  return fs.readdirSync(SCRIPTS)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        const b = JSON.parse(fs.readFileSync(path.join(SCRIPTS, f), 'utf8'));
        return {
          id: b.id, client: b.client, batch: b.batch, savedAt: b.savedAt,
          count: (b.docs || []).length,
          titles: (b.docs || []).map((d) => d.title),
          flagged: (b.docs || []).filter((d) => d.flag).length,
        };
      } catch { return null; }
    })
    .filter(Boolean)
    .filter((b) => !want || slug(b.client) === want)
    .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
}

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

/* Footage-renamer jobs. The renamer itself lives in n8n; this is the front
   door and the record of what was asked and what came back, so the page can
   show a job's life without touching Dropbox or Notion. */
const footageFile = (id) => path.join(FOOTAGE, `${safeId(id)}.json`);

function saveFootage(rec) {
  const id = safeId(rec.id) || 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const prev = getFootage(id) || {};
  const out = { ...prev, ...rec, id, updatedAt: new Date().toISOString() };
  out.createdAt = prev.createdAt || out.updatedAt;
  writeJSON(footageFile(id), out);
  return out;
}

function getFootage(id) {
  try { return JSON.parse(fs.readFileSync(footageFile(id), 'utf8')); }
  catch { return null; }
}

function listFootage(client) {
  const want = client ? slug(client) : null;
  return fs.readdirSync(FOOTAGE)
    .filter((f) => f.endsWith('.json'))
    .map((f) => { try { return JSON.parse(fs.readFileSync(path.join(FOOTAGE, f), 'utf8')); } catch { return null; } })
    .filter((j) => j && (!want || slug(j.client || '') === want))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/* Notifications: one file, addressed by name (the same names requestedBy
   carries), capped so it never grows without bound. The bell in the OS polls
   these; read state is per notification. */
function allNotifs() {
  try { return JSON.parse(fs.readFileSync(NOTIFS, 'utf8')); } catch { return []; }
}
function notify({ to, client, text, open }) {
  if (!to || !text) return null;
  const list = allNotifs();
  const n = { id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    to: String(to).slice(0, 120), client: String(client || '').slice(0, 120),
    text: String(text).slice(0, 400), open: String(open || '').slice(0, 60),
    at: new Date().toISOString(), read: false };
  list.unshift(n);
  writeJSON(NOTIFS, list.slice(0, 400));
  return n;
}
function notifsFor(to) {
  const want = String(to || '').toLowerCase();
  return allNotifs().filter((n) => String(n.to).toLowerCase() === want).slice(0, 30);
}
function markNotifsRead(to, ids) {
  const want = String(to || '').toLowerCase();
  const list = allNotifs();
  for (const n of list) {
    if (String(n.to).toLowerCase() !== want) continue;
    if (!ids || ids.includes(n.id)) n.read = true;
  }
  writeJSON(NOTIFS, list);
}

module.exports = { newRun, getRun, step, finishRun, saveBatch, getBatch, listBatches, priorContext,
                   saveScripts, getScripts, listScripts,
                   saveHarvest, listHarvests, latestHarvest, getHarvest,
                   saveStory, getStory, listStories, saveFootage, getFootage, listFootage,
                   notify, notifsFor, markNotifsRead, DATA };
