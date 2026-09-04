'use strict';
/*
 * Commission a fresh marketing report before a batch of concepts is written.
 *
 * WHY THIS EXISTS. Ricardo generated ten concepts for PackDraw and the result
 * did not make sense. It was not the generator misbehaving: this is everything
 * it knew about the brand at the time.
 *
 *   category                 Online mystery-box / case-opening (gambling-adjacent)
 *   messaging_pillars        EMPTY
 *   creative_hook_territory  EMPTY      <- the concept angles themselves
 *   watch_outs               EMPTY
 *   proof_points             1 item
 *   compliance rules         0          <- on a gambling-adjacent brand
 *   marketing plan           none, 0 personas, 0 research findings
 *
 * It was asked to write ads for a gambling-adjacent brand with no guardrails
 * and no angle territory, so it invented. Across the whole roster only 1 of 86
 * active brands had a marketing plan on file, because the report was a manual
 * agent with no trigger anywhere in the OS, and it had been run twice ever.
 *
 * The marketing report writes exactly the fields that were empty:
 * creative_hook_territory, watch_outs, messaging_pillars, proof_points, the
 * compliance rules and the plan itself. So Carl's rule is now the rule: every
 * batch of concepts commissions fresh research first, and the run says so.
 *
 * HOW IT WORKS. The report is an agent in adbundance-os, not in this service.
 * The runner watches a queue folder on the shared vault volume, which this
 * service already writes to for onboarding, so the whole exchange is files:
 *
 *   1. write system/queue/<uuid>.json  {skill: 'marketing-report', args:{client}}
 *   2. the runner runs it and writes system/runs/<uuid>.json, keyed by the SAME
 *      uuid, so there is no guessing which run was ours
 *   3. the runner auto-chains marketing-report-knowledge, which writes a
 *      proposal to system/actions/<id>.json with status "pending"
 *   4. we approve it and queue execute-action, which is the only path that
 *      writes to the Knowledge Layer
 *   5. we wait for status "executed", and only then does the generator resolve
 *      the brand, now with the new facts in it
 *
 * ON APPROVING IT OURSELVES. Step 4 is normally a human on the Actions page.
 * Carl's call, and it is safe in one specific and verified way: the upsert is
 * fill-blanks-only (knowledgeLayerDb.js, "Fill blanks, never replace"), so it
 * can populate PackDraw's empty fields but cannot overwrite a fact already on
 * file. Only a proposal this run itself commissioned is ever approved here,
 * matched on the run id, so an unrelated proposal sitting in the queue is
 * never swept along with it.
 */

const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');

const VAULT_ROOT = process.env.VAULT_ROOT || '/vault';
const QUEUE = () => path.join(VAULT_ROOT, 'system', 'queue');
const RUNS = () => path.join(VAULT_ROOT, 'system', 'runs');
const ACTIONS = () => path.join(VAULT_ROOT, 'system', 'actions');

/* Measured on the two reports that have ever run: the report itself took 2m12s
   and 2m22s, the knowledge pass 2 to 3 minutes, the write about a minute. The
   ceiling is generous because the alternative to waiting is generating the
   batch blind, which is the thing this file exists to stop. */
const REPORT_TIMEOUT_MS = Number(process.env.REPORT_TIMEOUT_MS || 15 * 60 * 1000);
const POLL_MS = 5000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };

const queueMounted = () => fs.existsSync(QUEUE());

/* Written to a temp name and renamed, so the runner never picks up a file that
   is still being written. Same convention onboarding.js uses. */
function enqueue(intent) {
  const dir = QUEUE();
  if (!fs.existsSync(dir)) {
    const e = new Error('the runner queue is not mounted on this server, so no research can be commissioned');
    e.status = 503;
    throw e;
  }
  const tmp = path.join(dir, '.' + intent.id + '.tmp');
  fs.writeFileSync(tmp, JSON.stringify(intent, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, path.join(dir, intent.id + '.json'));
  return intent.id;
}

/* The runner keys its run record by the intent id, so this is an exact match
   rather than a search over recent runs that might belong to someone else. */
async function waitForRun(id, deadline, label, log) {
  let lastState = '';
  while (Date.now() < deadline) {
    const rec = readJson(path.join(RUNS(), id + '.json'));
    if (rec) {
      const st = String(rec.status || '');
      if (st && st !== lastState) { lastState = st; }
      if (st === 'ok') return rec;
      if (st && st !== 'running' && st !== 'queued') {
        const e = new Error(`${label} failed: ${String(rec.summary || st).slice(0, 160)}`);
        e.reportFailed = true;
        throw e;
      }
    }
    await sleep(POLL_MS);
  }
  const e = new Error(`${label} did not finish within ${Math.round(REPORT_TIMEOUT_MS / 60000)} minutes`);
  e.reportFailed = true;
  throw e;
}

/* The proposal the knowledge pass writes. Matched on the run that produced it
   so this can never approve somebody else's pending action. */
async function waitForProposal(sourceRunIds, deadline) {
  while (Date.now() < deadline) {
    let names = [];
    try { names = fs.readdirSync(ACTIONS()); } catch { names = []; }
    for (const n of names) {
      if (!n.endsWith('.json')) continue;
      const rec = readJson(path.join(ACTIONS(), n));
      if (!rec || rec.tool !== 'knowledge_layer') continue;
      if (!sourceRunIds.has(String(rec.source_run_id))) continue;
      return { id: n.slice(0, -'.json'.length), rec, file: path.join(ACTIONS(), n) };
    }
    await sleep(POLL_MS);
  }
  return null;
}

/* Which runs the knowledge pass could have been chained from: the report run
   itself, and any marketing-report-knowledge run the runner started from it. */
function chainedRunIds(reportId) {
  const ids = new Set([String(reportId)]);
  let names = [];
  try { names = fs.readdirSync(RUNS()); } catch { return ids; }
  for (const n of names) {
    if (!n.endsWith('.json')) continue;
    const rec = readJson(path.join(RUNS(), n));
    if (!rec || rec.skill !== 'marketing-report-knowledge') continue;
    /* the chain passes the report's deliverable, so a knowledge run that names
       our report is ours */
    const blob = JSON.stringify(rec.args || {});
    if (blob.includes(String(reportId))) ids.add(String(rec.id));
  }
  return ids;
}

/**
 * Commission the report and wait for its findings to land.
 * Resolves to a summary of what changed, or throws with `.reportFailed` set so
 * the caller can decide whether a batch may still go ahead.
 */
async function commission({ client, requestedBy, log }) {
  const deadline = Date.now() + REPORT_TIMEOUT_MS;

  const reportId = randomUUID();
  enqueue({
    id: reportId,
    skill: 'marketing-report',
    args: { client },
    ts: new Date().toISOString(),
    source: 'concept-run',
    userId: requestedBy || null,
  });
  log('Marketing report', 'running', `commissioned fresh research for ${client}, this takes a few minutes`);

  const report = await waitForRun(reportId, deadline, 'the marketing report', log);
  log('Marketing report', 'running',
    `${String(report.summary || 'report written').slice(0, 90)}. Reading it into the brand record now`);

  /* The runner chains the knowledge pass itself. We wait for its proposal
     rather than queueing a second job, so there is exactly one chain. */
  const found = await waitForProposal(chainedRunIds(reportId), deadline);
  if (!found) {
    const e = new Error('the report was written but its findings never came back as a proposal to approve');
    e.reportFailed = true;
    throw e;
  }

  if (found.rec.status === 'executed') {
    log('Marketing report', 'done', `${String(found.rec.summary || 'findings already on file').slice(0, 110)}`);
    return { reportId, actionId: found.id, summary: found.rec.summary || '' };
  }

  /* Approve only this proposal, then let the deterministic executor do the
     writing. Nothing here touches the database directly. */
  found.rec.status = 'approved';
  found.rec.approved_at = new Date().toISOString();
  found.rec.approved_by = 'concept-run (auto, commissioned by this batch)';
  fs.writeFileSync(found.file, JSON.stringify(found.rec, null, 2) + '\n', 'utf8');

  const execId = randomUUID();
  enqueue({
    id: execId,
    skill: 'execute-action',
    args: { actionId: found.id },
    ts: new Date().toISOString(),
    source: 'concept-run',
    userId: requestedBy || null,
  });
  await waitForRun(execId, deadline, 'writing the findings to the brand record', log);

  /* The executor is the source of truth for whether the write happened. */
  const after = readJson(found.file);
  if (!after || after.status !== 'executed') {
    const e = new Error(`the findings were approved but not written (${(after && after.error) || 'no reason recorded'})`);
    e.reportFailed = true;
    throw e;
  }

  log('Marketing report', 'done', String(after.summary || 'fresh research written to the brand record').slice(0, 130));
  return { reportId, actionId: found.id, summary: after.summary || '' };
}

module.exports = { commission, queueMounted, REPORT_TIMEOUT_MS };
