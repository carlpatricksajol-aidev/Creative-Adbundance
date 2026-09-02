'use strict';
/*
 * The API behind the "Run for a client" button.
 *
 * A run takes about twenty minutes, which is far longer than any HTTP request
 * should be held open, so POST /run returns a run id immediately and the page
 * polls GET /run/:id. Nothing is queued in memory only: every state change is
 * written to disk, so a restart mid-run leaves a visible failed run rather than
 * a request that never comes back.
 */

const http = require('http');
const store = require('./store');
const brand = require('./dossier');
const pipeline = require('./pipeline');
const research = require('./research');
const onboarding = require('./onboarding');

const PORT = Number(process.env.PORT || 8900);
const TOKEN = process.env.RUN_TOKEN || '';
const ORIGINS = (process.env.ALLOWED_ORIGINS ||
  'https://adbundance-os-client-view.vercel.app').split(',').map((s) => s.trim());
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT || 2);

/* Volvo's research agent, reachable only from this box. The page never talks
   to it directly: this service forwards with the agent's own token, and
   refuses the metered lanes outright so a page bug cannot spend vendor
   credits. Running those stays a deliberate, human act on the server. */
const AGENT_URL = process.env.RESEARCH_AGENT_URL || '';
const AGENT_TOKEN = process.env.RESEARCH_AGENT_TOKEN || '';

async function agentFetch(path, init) {
  if (!AGENT_URL) { const e = new Error('the research agent is not configured on this server'); e.status = 503; throw e; }
  const res = await fetch(AGENT_URL + path, {
    ...init,
    headers: { ...(init && init.headers), authorization: 'Bearer ' + AGENT_TOKEN },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

let active = 0;

const json = (res, code, body) => {
  const s = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(s) });
  res.end(s);
};

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && ORIGINS.includes(origin)) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('vary', 'origin');
  }
  res.setHeader('access-control-allow-headers', 'authorization,content-type,x-file-name');
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
}

/* The page is behind Vercel's password protection, so the token it carries is
   only ever handed to someone already authenticated. This stops a stranger who
   finds the endpoint from spending our tokens; it is not a user identity. */
function authed(req) {
  if (!TOKEN) return false;
  const h = req.headers.authorization || '';
  return h === `Bearer ${TOKEN}`;
}

/* The logo arrives as raw bytes with its own content-type, not JSON — a
   base64 round trip through body() would inflate a 5 MB file by a third for no
   benefit. Capped hard so a stray large POST cannot hold memory here. */
function rawBody(req, cap) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > cap) { reject(Object.assign(new Error('that file is too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function body(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', (c) => {
      b += c;
      if (b.length > 1e6) { reject(new Error('body too large')); req.destroy(); }
    });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

async function startRun({ client, count, requestedBy }) {
  const id = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  store.newRun({ id, client, count, requestedBy });

  const log = (name, state, detail) => store.step(id, name, state, detail);

  // Deliberately not awaited: the HTTP response goes back now, the work carries
  // on, and the page follows it through GET /run/:id.
  (async () => {
    active++;
    try {
      const priorCtx = store.priorContext(client);
      const result = await pipeline.run({ client, count, prior: priorCtx.text, priorMeta: priorCtx, log });
      const batch = store.saveBatch(result);
      store.finishRun(id, { status: 'done', batchId: batch.id, cost_usd: result.cost_usd, used_research: result.used_research });
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      log('Failed', 'error', msg.slice(0, 400));
      store.finishRun(id, { status: 'error', error: msg.slice(0, 1000) });
      console.error('[run %s] %s', id, msg);
    } finally {
      active--;
    }
  })();

  return id;
}

const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const url = new URL(req.url, 'http://x');
  const p = url.pathname.replace(/\/+$/, '') || '/';

  try {
    if (p === '/health') {
      return json(res, 200, {
        ok: true, active,
        model: require('./llm').MODEL,
        hasKey: Boolean(process.env.OPENROUTER_API_KEY),
      });
    }

    if (p === '/clients' && req.method === 'GET') {
      if (!authed(req)) return json(res, 401, { error: 'unauthorized' });
      return json(res, 200, { clients: await brand.listBrands() });
    }

    if (p === '/research' && req.method === 'GET') {
      if (!authed(req)) return json(res, 401, { error: 'unauthorized' });
      const brief = await research.fetchBrief();
      return json(res, 200, {
        markdown: research.toMarkdown(brief),
        vehicles: brief ? brief.vehicles : [],
        edition: brief ? brief.edition : null,
        probes: brief ? brief.probes : [],
      });
    }

    if (p === '/research/agents' && req.method === 'GET') {
      if (!authed(req)) return json(res, 401, { error: 'unauthorized' });
      const r = await agentFetch('/agents');
      return json(res, r.status, r.body);
    }

    if (p === '/research/run' && req.method === 'POST') {
      if (!authed(req)) return json(res, 401, { error: 'unauthorized' });
      const b = await body(req);
      const agents = await agentFetch('/agents');
      const found = ((agents.body || {}).agents || []).find((a) => a.name === b.agent);
      if (!found) return json(res, 400, { error: 'unknown research agent: ' + (b.agent || '(none)') });
      if (found.metered) {
        return json(res, 403, {
          error: found.label + ' spends metered vendor credits, so it does not run from the page. Run it with Volvo, deliberately, from the server.',
        });
      }
      const r = await agentFetch('/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // findings persist to the shared knowledge library; without this sink the
        // agent returns them and writes nothing, and the next concept run would
        // never see what this one found
        body: JSON.stringify({ agent: b.agent, args: b.args || {}, sinks: ['knowledge-db'] }),
      });
      return json(res, r.status, r.body);
    }

    if (p.startsWith('/research/run/') && req.method === 'GET') {
      if (!authed(req)) return json(res, 401, { error: 'unauthorized' });
      const r = await agentFetch('/runs/' + encodeURIComponent(p.slice('/research/run/'.length)));
      return json(res, r.status, r.body);
    }

    if (p === '/batches' && req.method === 'GET') {
      if (!authed(req)) return json(res, 401, { error: 'unauthorized' });
      return json(res, 200, { batches: store.listBatches(url.searchParams.get('client')) });
    }

    if (p.startsWith('/batch/') && req.method === 'GET') {
      if (!authed(req)) return json(res, 401, { error: 'unauthorized' });
      const b = store.getBatch(p.slice('/batch/'.length));
      return b ? json(res, 200, b) : json(res, 404, { error: 'no such batch' });
    }

    /* Storyboards are authored in the page, so these three are a plain shared
       document store: list per client, read one, upsert one. No model, no
       spend, so they are safe to call on every keystroke's debounce. */
    /* Onboarding intake. The OS page has no server of its own, so these are
       how a new client reaches the Knowledge Layer and how the Drive read gets
       asked for. See src/onboarding.js for which store and why. */
    if (p === '/onboarding' && req.method === 'GET') {
      if (!authed(req)) return json(res, 401, { error: 'unauthorized' });
      const brands = await onboarding.listIntake();
      return json(res, 200, {
        brands,
        canRunAgent: onboarding.queueMounted(),
        canUploadLogo: onboarding.storageReady(),
      });
    }

    if (p === '/onboarding' && req.method === 'POST') {
      if (!authed(req)) return json(res, 401, { error: 'unauthorized' });
      const b = await body(req);
      const intake = await onboarding.upsertIntake(b);

      let queuedIntentId = null;
      let note = null;
      if (b.runAgent === false) {
        note = 'Saved without running anything, as asked.';
      } else if (!intake.hasSource) {
        /* Nothing named and no folder either — there is literally nothing for
           the agent to open, and the name guess it would fall back to is what
           this form exists to replace. */
        note = 'Saved. Add the creative brief or the onboarding deck to have the agent read them.';
      } else if (!onboarding.queueMounted()) {
        note = 'Saved, but this server cannot reach the runner queue, so nothing was started.';
      } else {
        queuedIntentId = onboarding.queueBootstrap({
          clientName: intake.clientName,
          driveFolderUrl: intake.driveFolderUrl,
          docUrls: intake.docUrls,
          website: intake.website,
          requestedBy: b.requestedBy || null,
        });
      }

      return json(res, 200, {
        ok: true, intake, queuedIntentId, note,
        message: queuedIntentId
          ? 'Reading ' + (intake.docUrls.length
              ? intake.docUrls.length + ' document' + (intake.docUrls.length === 1 ? '' : 's') + ' for ' + intake.brandName
              : intake.brandName + '’s Drive folder')
            + ' now. What it finds needs a pass before it is stored.'
          : note,
      });
    }

    /* Logo upload. The file goes to Storage and only its public URL is kept on
       the brand row, because Storage lives in a different Supabase project
       from the Knowledge Layer. The filename is chosen here, never taken from
       the upload. */
    if (p === '/onboarding/logo' && req.method === 'POST') {
      if (!authed(req)) return json(res, 401, { error: 'unauthorized' });
      const bytes = await rawBody(req, onboarding.MAX_LOGO_BYTES + 1024);
      const out = await onboarding.uploadLogo(
        bytes,
        req.headers['content-type'],
        req.headers['x-file-name'] ? decodeURIComponent(String(req.headers['x-file-name'])) : ''
      );
      return json(res, 200, out);
    }

    /* ---- footage renamer: the OS is the trigger, n8n does the work ------
       POST /footage/run   { client, batch, storyboardId, dropbox, requestedBy }
       GET  /footage?client=            the job list, newest first
       GET  /footage/:id                one job
       POST /footage/result { id, status, folder, renamed, flagged, error }
                            n8n reports back here with the same bearer token.
       If FOOTAGE_WEBHOOK_URL is unset the job is recorded as 'queued' and a
       human runs the renamer as before - the page still shows the request. */
    if (p === '/footage' && req.method === 'GET') {
      if (!authed(req)) return json(res, 401, { error: 'unauthorized' });
      return json(res, 200, { jobs: store.listFootage(url.searchParams.get('client')) });
    }

    if (p === '/footage/run' && req.method === 'POST') {
      if (!authed(req)) return json(res, 401, { error: 'unauthorized' });
      const b = await body(req);
      const str = (v, cap) => String(v == null ? '' : v).slice(0, cap);
      if (!b.client) return json(res, 400, { error: 'client is required' });
      if (!/^https:\/\/(www\.)?dropbox\.com\//.test(String(b.dropbox || ''))) {
        return json(res, 400, { error: 'that does not look like a Dropbox link' });
      }
      const hook = process.env.FOOTAGE_WEBHOOK_URL || '';
      let job = store.saveFootage({
        client: str(b.client, 120), batch: str(b.batch, 120),
        storyboardId: str(b.storyboardId, 120), dropbox: str(b.dropbox, 800),
        requestedBy: str(b.requestedBy, 120),
        status: hook ? 'running' : 'queued',
      });
      if (hook) {
        try {
          const r = await fetch(hook, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ jobId: job.id, client: job.client, batch: job.batch,
              storyboardId: job.storyboardId, dropbox: job.dropbox, requestedBy: job.requestedBy }),
          });
          if (!r.ok) throw new Error('the renamer webhook answered ' + r.status);
        } catch (err) {
          job = store.saveFootage({ id: job.id, status: 'error',
            error: 'could not reach the renamer: ' + (err && err.message ? err.message : err) });
        }
      }
      return json(res, 200, job);
    }

    if (p === '/footage/result' && req.method === 'POST') {
      if (!authed(req)) return json(res, 401, { error: 'unauthorized' });
      const b = await body(req);
      if (!b.id || !store.getFootage(b.id)) return json(res, 404, { error: 'no such footage job' });
      const str = (v, cap) => String(v == null ? '' : v).slice(0, cap);
      const list = (v, cap) => (Array.isArray(v) ? v : []).slice(0, 500).map((x) => str(x, 400));
      const job = store.saveFootage({
        id: b.id,
        status: ['done', 'error', 'running'].includes(b.status) ? b.status : 'done',
        folder: str(b.folder, 800),
        renamed: list(b.renamed),
        flagged: list(b.flagged),
        error: str(b.error, 1000),
      });
      return json(res, 200, job);
    }

    if (p.startsWith('/footage/') && req.method === 'GET') {
      if (!authed(req)) return json(res, 401, { error: 'unauthorized' });
      const j = store.getFootage(decodeURIComponent(p.slice('/footage/'.length)));
      return j ? json(res, 200, j) : json(res, 404, { error: 'no such footage job' });
    }

    if (p === '/storyboards' && req.method === 'GET') {
      if (!authed(req)) return json(res, 401, { error: 'unauthorized' });
      return json(res, 200, { storyboards: store.listStories(url.searchParams.get('client')) });
    }

    if (p.startsWith('/storyboard/') && req.method === 'GET') {
      if (!authed(req)) return json(res, 401, { error: 'unauthorized' });
      const s = store.getStory(decodeURIComponent(p.slice('/storyboard/'.length)));
      return s ? json(res, 200, s) : json(res, 404, { error: 'no such storyboard' });
    }

    if (p === '/storyboard' && req.method === 'POST') {
      if (!authed(req)) return json(res, 401, { error: 'unauthorized' });
      const b = await body(req);
      if (!b.client) return json(res, 400, { error: 'client is required' });
      const str = (v, cap) => String(v == null ? '' : v).slice(0, cap);
      /* Only what the caller actually sent gets written. The page always sends
         the whole record, but a partial call (say, archiving one) must not wipe
         the fields it left out. */
      const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
      /* Last write wins is wrong for a document two strategists can open at
         once. A caller that tells us which version it edited gets a 409 with
         the current record instead of quietly overwriting someone. */
      if (b.id && b.baseSavedAt) {
        const prev = store.getStory(b.id);
        if (prev && prev.savedAt && prev.savedAt > b.baseSavedAt) {
          return json(res, 409, {
            error: 'someone else saved this storyboard after you opened it',
            current: prev,
          });
        }
      }
      const CAPS = { title: 200, batch: 120, creator: 120, dropbox: 800, outputFolder: 800,
                     status: 40, concept: 20000, script: 20000, savedBy: 120 };
      const patch = { id: b.id, client: str(b.client, 120) };
      for (const k of Object.keys(CAPS)) if (has(k)) patch[k] = str(b[k], CAPS[k]);
      if (has('archived')) patch.archived = Boolean(b.archived);
      const scenesOf = (arr) => (Array.isArray(arr) ? arr : []).slice(0, 200).map((s) => ({
        scene: str(s && s.scene, 120),
        line: str(s && s.line, 2000),
        overlay: str(s && s.overlay, 2000),
        footage: str(s && s.footage, 1000),
        shot: str(s && s.shot, 2000),
      }));
      if (has('scenes')) patch.scenes = scenesOf(b.scenes);
      /* One page per batch, many concepts on it, the way the team's Notion
         storyboard page is laid out: a numbered heading, the format line, the
         scene table, and the ticks against the extracted shot list. */
      if (has('concepts')) {
        patch.concepts = (Array.isArray(b.concepts) ? b.concepts : []).slice(0, 60).map((cp) => {
          const done = {};
          if (cp && cp.done && typeof cp.done === 'object') {
            for (const [k, v] of Object.entries(cp.done).slice(0, 400)) {
              if (v) done[String(k).slice(0, 300)] = true;
            }
          }
          return {
            heading: str(cp && cp.heading, 300),
            product: str(cp && cp.product, 200),
            format: str(cp && cp.format, 1000),
            done,
            scenes: scenesOf(cp && cp.scenes),
          };
        });
      }
      return json(res, 200, store.saveStory(patch));
    }

    if (p === '/run' && req.method === 'POST') {
      if (!authed(req)) return json(res, 401, { error: 'unauthorized' });
      if (!process.env.OPENROUTER_API_KEY) {
        return json(res, 503, { error: 'OPENROUTER_API_KEY is not set on the server, so runs cannot start' });
      }
      if (active >= MAX_CONCURRENT) {
        return json(res, 429, { error: `already running ${active} batches, try again when one finishes` });
      }
      const b = await body(req);
      if (!b.client) return json(res, 400, { error: 'client is required' });
      const count = Math.min(Math.max(Number(b.count) || 5, 1), 16);
      // Fail fast on a bad name rather than after a minute of work.
      try { await brand.resolve(b.client); }
      catch (e) { return json(res, 400, { error: e.message }); }
      const id = await startRun({ client: b.client, count, requestedBy: b.requestedBy });
      return json(res, 202, { runId: id });
    }

    if (p.startsWith('/run/') && req.method === 'GET') {
      if (!authed(req)) return json(res, 401, { error: 'unauthorized' });
      const run = store.getRun(p.slice('/run/'.length));
      if (!run) return json(res, 404, { error: 'no such run' });
      const out = { ...run };
      if (run.status === 'done' && run.batchId) out.batch = store.getBatch(run.batchId);
      return json(res, 200, out);
    }

    return json(res, 404, { error: 'not found' });
  } catch (err) {
    console.error(err);
    return json(res, 500, { error: (err && err.message) || 'server error' });
  }
});

server.listen(PORT, () => {
  console.log('concept-service on :%d  model=%s  key=%s  data=%s',
    PORT, require('./llm').MODEL,
    process.env.OPENROUTER_API_KEY ? 'set' : 'MISSING', store.DATA);
  if (!TOKEN) console.warn('RUN_TOKEN is not set: every authenticated route will refuse.');
});
