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
const brand = require('./brand');
const pipeline = require('./pipeline');
const research = require('./research');

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
  res.setHeader('access-control-allow-headers', 'authorization,content-type');
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
      const prior = store.priorTitles(client);
      const result = await pipeline.run({ client, count, prior, log });
      const batch = store.saveBatch(result);
      store.finishRun(id, { status: 'done', batchId: batch.id });
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
        body: JSON.stringify({ agent: b.agent, args: b.args || {} }),
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
      const count = Math.min(Math.max(Number(b.count) || 14, 1), 16);
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
