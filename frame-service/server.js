'use strict';
/*
 * frame-service: HTML in, PNG out. Nothing else.
 *
 * WHY IT EXISTS. concept-service runs in node:20-alpine with no browser in it,
 * and the story frame that wraps every concept mockup is HTML. The host has
 * Google Chrome and puppeteer-core already, and pm2 already keeps two other
 * host-side helpers alive for this same reason (research-agent, static-ads),
 * so this follows that pattern rather than adding 250MB of chromium to an
 * image that only needs it for one step.
 *
 * WHY IT IS THIS DUMB. It takes finished HTML and does not know what a brand
 * or a concept is. All the craft, the vault template and the brand data live
 * in concept-service/src/storyframe.js. Keeping this end stupid is what lets
 * it run with its network switched off, which is the whole security argument
 * below.
 *
 * THE SECURITY ARGUMENT, because "render arbitrary HTML" is otherwise a
 * genuinely dangerous thing to expose:
 *
 *   1. IT IS NOT ON THE PUBLIC INTERNET. ufw on this box is inactive, and the
 *      two existing helpers bind to 0.0.0.0, which means they answer the open
 *      internet. This one binds to the docker bridge address only, so the
 *      containers and the box itself can reach it and nobody else can.
 *   2. IT NEEDS A TOKEN, compared in constant time.
 *   3. IT CANNOT MAKE A SINGLE NETWORK REQUEST. Every request the page tries
 *      is aborted unless it is a data: URI, so there is no file:// read, no
 *      http:// fetch to a neighbouring service, and no SSRF, whatever the HTML
 *      asks for. Everything real is inlined by the caller as data: URIs, which
 *      is already how the font, the logo and the still arrive.
 *   4. It renders in a fresh page per request and never evaluates caller script
 *      results, and the page is closed even when the render throws.
 */

const http = require('http');
const crypto = require('crypto');
const puppeteer = require('puppeteer-core');

const PORT = Number(process.env.FRAME_PORT || 3220);
/* The docker bridge, not 0.0.0.0. See point 1 above. */
const HOST = process.env.FRAME_HOST || '172.17.0.1';
const TOKEN = process.env.FRAME_SERVICE_TOKEN || '';
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome-stable';

/* A framed story is roughly 3.5MB of HTML once the still, the logo and the
   font are inlined as base64. 24MB leaves room and still bounds the request. */
const MAX_HTML = 24 * 1024 * 1024;
const RENDER_TIMEOUT_MS = 45 * 1000;
/* Chrome is the memory hog on this box, and static-ads already holds 560MB.
   Two at a time keeps the peak predictable; the caller renders a batch
   sequentially anyway. */
const MAX_CONCURRENT = Number(process.env.FRAME_CONCURRENCY || 2);

if (!TOKEN) {
  console.error('frame-service refuses to start without FRAME_SERVICE_TOKEN');
  process.exit(1);
}

const json = (res, code, obj) => {
  const b = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, { 'content-type': 'application/json', 'content-length': b.length });
  res.end(b);
};

/* Constant time, and length-safe: timingSafeEqual throws on a length mismatch,
   so the lengths are compared first and the result is still not early-returned
   in a way that leaks which byte differed. */
function tokenOk(req) {
  const h = String(req.headers.authorization || '');
  const got = h.startsWith('Bearer ') ? h.slice(7) : '';
  const a = Buffer.from(got), b = Buffer.from(TOKEN);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/* ------------------------------------------------------------- the browser --- */

/* One browser, reused. Launching costs about 800ms cold and 190ms warm, and a
   batch of five frames should not pay that five times. If chrome dies the
   handle is dropped so the next request launches a fresh one rather than
   failing forever on a corpse. */
let browser = null;
let launching = null;

async function getBrowser() {
  if (browser && browser.connected) return browser;
  if (launching) return launching;
  launching = puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: [
      '--no-sandbox',                  // running as root on a VPS
      '--disable-dev-shm-usage',       // /dev/shm here is too small for chrome's default
      '--disable-gpu',
      '--disable-extensions',
      '--font-render-hinting=none',    // identical glyph rasterisation run to run
      '--force-color-profile=srgb',    // so a colour never shifts between renders
      '--hide-scrollbars',
    ],
  }).then((b) => {
    browser = b;
    launching = null;
    b.on('disconnected', () => { if (browser === b) browser = null; });
    console.log('chrome up');
    return b;
  }).catch((e) => {
    launching = null;
    throw e;
  });
  return launching;
}

let inFlight = 0;

async function render({ html, selector, scale }) {
  const b = await getBrowser();
  const page = await b.newPage();
  try {
    await page.setViewport({
      width: 480,
      height: 800,
      deviceScaleFactor: Math.min(Math.max(Number(scale) || 4, 1), 6),
    });

    /* Point 3: the page gets no network. Everything it needs is already a
       data: URI, so anything that reaches here is either a mistake or an
       attempt, and both should fail closed rather than resolve. */
    await page.setRequestInterception(true);
    const blocked = [];
    page.on('request', (r) => {
      const u = r.url();
      if (u.startsWith('data:') || u === 'about:blank') return r.continue().catch(() => {});
      blocked.push(u.slice(0, 120));
      r.abort('blockedbyclient').catch(() => {});
    });

    await page.setContent(html, { waitUntil: 'load', timeout: RENDER_TIMEOUT_MS });

    /* The two silent ruiners: the webfont not applied yet, and an image not
       decoded yet. Either one screenshots clean and wrong. */
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => Promise.all(
      Array.from(document.images).map((i) => (i.complete ? null : i.decode().catch(() => null)))
    ));

    const sel = typeof selector === 'string' && /^[.#][A-Za-z][\w-]*$/.test(selector) ? selector : null;
    const el = sel ? await page.$(sel) : null;
    if (sel && !el) throw new Error(`the selector ${sel} matched nothing in the page`);

    /* omitBackground so the frame's own rounded corners come out transparent
       instead of on a white square, which would show as white notches against
       a dark surface. */
    const shot = Buffer.from(await (el || page).screenshot({ type: 'png', omitBackground: true }));
    if (shot.length < 100) throw new Error('the screenshot came back empty');
    return { png: shot, blocked };
  } finally {
    await page.close().catch(() => {});
  }
}

/* ---------------------------------------------------------------- the http --- */

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    return json(res, 200, {
      ok: true,
      chrome: Boolean(browser && browser.connected),
      inFlight,
      concurrency: MAX_CONCURRENT,
    });
  }

  if (req.method !== 'POST' || req.url !== '/render') return json(res, 404, { error: 'not found' });
  if (!tokenOk(req)) return json(res, 401, { error: 'unauthorized' });

  if (inFlight >= MAX_CONCURRENT) {
    res.setHeader('retry-after', '2');
    return json(res, 503, { error: `busy, ${inFlight} renders in flight` });
  }

  let raw = '';
  let over = false;
  req.setEncoding('utf8');
  req.on('data', (c) => {
    if (over) return;
    raw += c;
    if (raw.length > MAX_HTML) { over = true; raw = ''; }
  });

  req.on('end', async () => {
    if (over) return json(res, 413, { error: `the html exceeded ${MAX_HTML / 1048576}MB` });
    let body;
    try { body = JSON.parse(raw); }
    catch { return json(res, 400, { error: 'the body is not valid JSON' }); }
    if (!body || typeof body.html !== 'string' || !body.html.trim()) {
      return json(res, 400, { error: 'html is required' });
    }

    inFlight++;
    const t0 = Date.now();
    try {
      const { png, blocked } = await render(body);
      const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
      /* A blocked request means the caller left something remote in the HTML.
         It is not fatal (the render still produced a PNG) but it is always a
         bug worth seeing in the log rather than discovering in a deck. */
      if (blocked.length) console.log('blocked %d remote request(s): %s', blocked.length, blocked[0]);
      console.log('rendered %dx%d in %dms (%dKB in, %dKB out)',
        w, h, Date.now() - t0, Math.round(raw.length / 1024), Math.round(png.length / 1024));
      res.writeHead(200, {
        'content-type': 'image/png',
        'content-length': png.length,
        'x-frame-dims': `${w}x${h}`,
        'x-blocked-requests': String(blocked.length),
        'cache-control': 'no-store',
      });
      res.end(png);
    } catch (e) {
      console.log('render failed after %dms: %s', Date.now() - t0, e.message);
      json(res, 500, { error: e.message });
    } finally {
      inFlight--;
    }
  });

  req.on('error', () => { /* the socket went away, nothing to answer */ });
});

server.listen(PORT, HOST, () => {
  console.log('frame-service on %s:%d  chrome=%s  concurrency=%d', HOST, PORT, CHROME, MAX_CONCURRENT);
});

/* pm2 restarts on exit, so a clean shutdown just needs chrome not to leak. */
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, async () => {
    server.close();
    if (browser) await browser.close().catch(() => {});
    process.exit(0);
  });
}
