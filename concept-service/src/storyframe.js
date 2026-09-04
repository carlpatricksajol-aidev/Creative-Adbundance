'use strict';
/*
 * The story ad frame: a generated 9:16 still, wrapped in the platform chrome
 * a client actually recognises, with the brand's own name and logo.
 *
 * Carl designed the frame (plixi-story-ad-mockup-v3.html) and asked for it on
 * every mockup. It lives in the vault beside concept-visualizer.md as
 * story-frame.html, read fresh on every render, so he can iterate on the
 * design without a deploy. This file is the mechanism: it fills the tokens and
 * decides how a logo is presented. It holds no design of its own.
 *
 * The rasterisation happens elsewhere. This container is node:20-alpine with
 * no browser in it, so the HTML goes to a small host-side renderer over the
 * docker bridge, the same way research.js already reaches a host service. See
 * frame-service/.
 *
 * WHY THE AVATAR LOGIC IS THE LONGEST PART OF THIS FILE. The logos are
 * scraped favicons and press assets, and they are not uniform. Measured over a
 * sample of twelve:
 *   - six are WIDE WORDMARKS, ARMRA's being 5:1 at 20556x4114. Cropping one of
 *     those to fill a 30px circle yields a meaningless fragment of a letter
 *     that still reads as a logo. Nothing errors. That is the failure mode
 *     this file exists to prevent.
 *   - one is served as .vnd.microsoft.icon and is actually PNG bytes, so
 *     neither the extension nor the content-type can be trusted. Only the
 *     magic number.
 *   - two are SVG, one is a 270px favicon, the rest are square PNGs.
 *   - and 19 of 86 active brands have no logo_url at all, including Ello and
 *     Accredited Debt Relief, the two most used for testing. The no-logo path
 *     is the common path, not the edge case.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

/* Same vault folder, same read-fresh-every-run contract, as the prompts. */
const FRAME_DIR = process.env.MOCKUP_PROMPT_DIR || '/vault/system/mockup';
const TEMPLATE = 'story-frame.html';
const FONT = 'inter-latin.woff2';

/* The renderer. Named to match the RESEARCH_AGENT_URL precedent. */
const FRAME_URL = process.env.FRAME_SERVICE_URL || 'http://host.docker.internal:3220';
const FRAME_TOKEN = process.env.FRAME_SERVICE_TOKEN || '';

const LOGO_DIR = path.join(process.env.DATA_DIR || '/data', 'logos');
fs.mkdirSync(LOGO_DIR, { recursive: true });

/* The worst real logo measured is 823KB. This cap is for a mis-set logo_url
   pointing at a hero image, not for the honest ones. */
const LOGO_MAX_BYTES = 8 * 1024 * 1024;
const LOGO_TIMEOUT_MS = 12 * 1000;

/* Only the bucket the brands table actually points at. A logo_url is data from
   a table, and a renderer that fetches whatever a table row says is an SSRF
   waiting to happen, so the fetch is restricted here rather than trusted. */
const LOGO_HOST_ALLOW = /(^|\.)supabase\.co$/i;

/* --------------------------------------------------------------- escaping ---- */

/* HTML text and attribute values. Brand names in this dataset include
   "ARDMOR, Inc.", "AutoInsurance.com" and "Business.com", so quotes and
   ampersands are not hypothetical. */
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* A CSS url() is a different context from HTML text, and confusing the two is
   how an injection gets in. A quote or a paren here would close the url() and
   make everything after it live CSS. Only our own data: URIs reach this, and
   it is still escaped, because the line is cheap and the failure is silent. */
const cssUrl = (s) => String(s == null ? '' : s)
  .replace(/["'()\\\s]/g, (c) => '\\' + c.charCodeAt(0).toString(16) + ' ');

/* ------------------------------------------------------------- the initials --- */

/* A legal suffix is not an initial and a TLD is not a word:
 *   "ARDMOR, Inc."           -> AR
 *   "AutoInsurance.com"      -> AU
 *   "Accredited Debt Relief" -> AD
 *   "Ello"                   -> EL
 */
const STOPWORDS = new Set(['inc', 'llc', 'ltd', 'co', 'corp', 'corporation',
  'com', 'net', 'org', 'io', 'the', 'and', 'group', 'holdings']);

function initials(name) {
  const words = String(name || '')
    .replace(/\.(com|net|org|io|co|ai|app)\b/gi, ' ')
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w && !STOPWORDS.has(w.toLowerCase()));
  if (!words.length) {
    const bare = String(name || '').replace(/[^A-Za-z0-9]/g, '');
    return bare ? bare.slice(0, 2).toUpperCase() : '?';
  }
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/* The board gives every client a gradient, but that registry lives in the HTML
   page and this service cannot see it. Deriving the hue from the name instead
   keeps it stable for a brand and distinct between brands, with no registry to
   keep in sync and no risk of showing one client another's colour. */
/* WCAG relative luminance for an hsl triple, so the contrast of the initials
   is measured rather than eyeballed against whichever brand happened to look
   fine. */
function relLum(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(f(0)) + 0.7152 * lin(f(8)) + 0.0722 * lin(f(4));
}

const contrastOnWhite = (h, s, l) => 1.05 / (relLum(h, s, l) + 0.05);

function brandGradient(name) {
  const h = crypto.createHash('sha1').update(String(name || '')).digest();
  const hue = Math.round(h[0] * 360 / 256);

  /* THE LIGHTNESS IS SOLVED, NOT FIXED. A flat 50% light stop measures 1.71:1
     against the white initials at hue 60, and 4.87:1 at Ello's hue, so every
     brand used for testing looks correct and some future yellow or lime brand
     ships initials nobody can read, with nothing erroring anywhere. This
     finds the brightest lightness that still clears 4.5:1, so blue stays
     vivid and only the pale hues get darkened. */
  let lo = 12, hi = 50;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (contrastOnWhite(hue, 60, mid) >= 4.5) lo = mid; else hi = mid;
  }
  /* floor, not round: lo is the brightest lightness that still clears the bar,
     so rounding it UP steps back over the bar. Measured, round() put tapouts
     at 4.41:1 and four hues below 4.4. */
  const light = Math.floor(lo);
  const dark = Math.max(10, light - 20);
  return `linear-gradient(145deg,hsl(${hue} 55% ${dark}%),hsl(${hue} 60% ${light}%))`;
}

/* ------------------------------------------------------------ the logo file --- */

/* Geometry from the bytes. The extension and the content-type both lie in this
   dataset, so the magic number is the only input. */
function measure(buf) {
  if (buf.length > 24 && buf.slice(0, 8).toString('latin1') === '\x89PNG\r\n\x1a\n') {
    return { kind: 'png', w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf.length > 6 && buf.readUInt32LE(0) === 0x00010000) {
    /* an .ico holds several sizes; the largest is the one worth rendering */
    const n = buf.readUInt16LE(4);
    let best = { w: 0, h: 0 };
    for (let i = 0; i < n && 6 + i * 16 + 1 < buf.length; i++) {
      const e = 6 + i * 16;
      const w = buf[e] || 256, h = buf[e + 1] || 256;
      if (w * h > best.w * best.h) best = { w, h };
    }
    return { kind: 'ico', ...best };
  }
  const head = buf.slice(0, 2048).toString('utf8');
  if (/<svg[\s>]/i.test(head)) {
    const vb = /viewBox\s*=\s*["']\s*[\d.eE+-]+[,\s]+[\d.eE+-]+[,\s]+([\d.eE+-]+)[,\s]+([\d.eE+-]+)/i.exec(head);
    if (vb) return { kind: 'svg', w: parseFloat(vb[1]), h: parseFloat(vb[2]) };
    const w = /\bwidth\s*=\s*["']?([\d.]+)/i.exec(head);
    const h = /\bheight\s*=\s*["']?([\d.]+)/i.exec(head);
    if (w && h) return { kind: 'svg', w: parseFloat(w[1]), h: parseFloat(h[1]) };
    /* an SVG with no intrinsic size scales to whatever box it is given, which
       for us is a square, so treat it as square */
    return { kind: 'svg', w: 1, h: 1 };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) return { kind: 'jpeg', w: 0, h: 0 };
  if (buf.length > 12 && buf.slice(0, 4).toString('latin1') === 'RIFF'
      && buf.slice(8, 12).toString('latin1') === 'WEBP') return { kind: 'webp', w: 0, h: 0 };
  if (buf.slice(0, 6).toString('latin1').startsWith('GIF8')) return { kind: 'gif', w: 0, h: 0 };
  return { kind: 'unknown', w: 0, h: 0 };
}

/* Mean luminance of a PNG's visible pixels.
 *
 * The plate behind a contained logo cannot be a constant: ARMRA's wordmark
 * measures 0.000 and disappears without a light plate, PackDraw's measures
 * 1.000 and disappeared WITH one. Nothing in the file says which it is, so it
 * is read. 8-bit truecolour with or without alpha covers every real logo seen
 * here; anything else returns null and the caller keeps the safer default.
 */
function meanLuminance(buf) {
  if (buf.length < 26 || buf.slice(0, 8).toString('latin1') !== '\x89PNG\r\n\x1a\n') return null;
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  const depth = buf[24], colorType = buf[25];
  if (depth !== 8 || (colorType !== 2 && colorType !== 6)) return null;
  const ch = colorType === 6 ? 4 : 3;

  const parts = [];
  let p = 8;
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.slice(p + 4, p + 8).toString('latin1');
    if (type === 'IDAT') parts.push(buf.slice(p + 8, p + 8 + len));
    if (type === 'IEND') break;
    p += 12 + len;
  }
  if (!parts.length) return null;

  let raw;
  try { raw = zlib.inflateSync(Buffer.concat(parts)); } catch { return null; }
  const stride = w * ch;
  if (raw.length < (stride + 1) * h) return null;

  /* Rows must be unfiltered in order because each one can reference the row
     above, so there is no shortcut past the decode. Sampling happens after. */
  const prev = Buffer.alloc(stride);
  const cur = Buffer.alloc(stride);
  let sum = 0, seen = 0, opaque = 0, total = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const off = y * (stride + 1) + 1;
    for (let i = 0; i < stride; i++) {
      const x = raw[off + i];
      const a = i >= ch ? cur[i - ch] : 0;
      const b = prev[i];
      const c = i >= ch ? prev[i - ch] : 0;
      let v;
      if (f === 0) v = x;
      else if (f === 1) v = x + a;
      else if (f === 2) v = x + b;
      else if (f === 3) v = x + ((a + b) >> 1);
      else if (f === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else return null;
      cur[i] = v & 0xff;
    }
    /* every fourth row and pixel: an average does not need 80 megapixels of a
       20000 pixel wide wordmark */
    if (y % 4 === 0) {
      for (let x = 0; x < w; x += 4) {
        const i = x * ch;
        total++;
        if ((ch === 4 ? cur[i + 3] : 255) < 24) continue;   // transparent says nothing
        opaque++;
        sum += (0.2126 * cur[i] + 0.7152 * cur[i + 1] + 0.0722 * cur[i + 2]) / 255;
        seen++;
      }
    }
    cur.copy(prev);
  }
  /* cover is what separates a tile from a glyph: a logo that fills its own box
     brings its own background and can have the circle, a glyph on transparency
     needs a plate whatever its aspect ratio. */
  return seen ? { mean: sum / seen, cover: total ? opaque / total : 0 } : null;
}

/* Above this the logo is light enough that a white plate would swallow it. */
const LIGHT_LOGO = 0.62;

const MIME = {
  png: 'image/png', ico: 'image/x-icon', svg: 'image/svg+xml',
  jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
};

/* Fetched once per run, not once per concept: a batch is five frames for one
   brand, and re-downloading the same 823KB file five times is pure waste. The
   cache key is the URL, so a brand changing its logo picks the new one up. */
async function loadLogo(url, log) {
  if (!url) return { buf: null, meta: null, why: 'no logo_url on the brand record' };

  let u;
  try { u = new URL(String(url)); }
  catch { return { buf: null, meta: null, why: 'the logo_url is not a valid URL' }; }
  if (u.protocol !== 'https:' || !LOGO_HOST_ALLOW.test(u.hostname)) {
    return { buf: null, meta: null, why: `the logo_url points outside the brand asset host (${u.hostname})` };
  }

  const key = crypto.createHash('sha1').update(u.href).digest('hex');
  const cached = path.join(LOGO_DIR, key + '.bin');
  if (fs.existsSync(cached)) {
    const buf = fs.readFileSync(cached);
    if (buf.length) return { buf, meta: measure(buf), why: null, cached: true };
  }

  let res;
  try {
    res = await fetch(u.href, { signal: AbortSignal.timeout(LOGO_TIMEOUT_MS) });
  } catch (e) {
    return { buf: null, meta: null, why: `the logo did not download (${e.name === 'TimeoutError' ? 'timed out' : e.message})` };
  }
  if (!res.ok) return { buf: null, meta: null, why: `the logo returned HTTP ${res.status}` };

  const len = Number(res.headers.get('content-length') || 0);
  if (len > LOGO_MAX_BYTES) {
    return { buf: null, meta: null, why: `the logo is ${Math.round(len / 1048576)}MB, over the ${LOGO_MAX_BYTES / 1048576}MB cap` };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) return { buf: null, meta: null, why: 'the logo downloaded empty' };
  if (buf.length > LOGO_MAX_BYTES) {
    return { buf: null, meta: null, why: `the logo is ${Math.round(buf.length / 1048576)}MB, over the cap` };
  }

  const meta = measure(buf);
  if (!MIME[meta.kind]) {
    return { buf: null, meta: null, why: `the logo is not an image this can render (${meta.kind})` };
  }

  try { fs.writeFileSync(cached, buf); } catch { /* cache is a convenience */ }
  return { buf, meta, why: null, cached: false };
}

/* ---------------------------------------------------------------- the avatar --- */

/* The whole point of this function: a wide wordmark must never be cropped into
   the circle, because that silently produces a plausible looking wrong logo. */
function avatarFor({ logoBuf, logoMeta, brandName }) {
  if (!logoBuf) {
    return {
      cls: 'lettermark',
      bg: `background:${brandGradient(brandName)}`,
      content: `<span>${esc(initials(brandName))}</span>`,
      mode: 'lettermark',
      note: 'no logo on file, so the brand initials are used',
    };
  }
  const uri = `data:${MIME[logoMeta.kind]};base64,${logoBuf.toString('base64')}`;
  const ar = logoMeta.h > 0 ? logoMeta.w / logoMeta.h : 0;
  const shot = meanLuminance(logoBuf);
  const lum = shot ? shot.mean : null;
  const cover = shot ? shot.cover : null;

  /* Only a logo that fills its own box earns the circle. Square was never the
     real test: PackDraw's mark is 180x180 and would have passed it, but it is
     59% opaque and pure black, so filling the circle would have put a black
     glyph on the avatar's own near-black and lost it. A tile brings its own
     background; a glyph needs a plate behind it whatever its shape. */
  const squareish = ar >= 0.9 && ar <= 1.1;
  const fillsItsBox = cover == null || cover >= 0.9;
  if (squareish && fillsItsBox) {
    return {
      cls: '', bg: '',
      content: `<img class="fill" src="${uri}" alt="">`,
      mode: 'square',
      note: `square logo ${logoMeta.w}x${logoMeta.h} that fills its own box, so it takes the circle`,
    };
  }
  /* Which plate depends on the logo, not on a guess. A white wordmark on the
     white plate is exactly as invisible as a black one with no plate, and
     PackDraw shipped a blank circle proving it. */
  const light = lum != null && lum > LIGHT_LOGO;
  const shade = light ? ' dark' : '';
  const plate = light ? 'a dark plate' : 'a white plate';
  const measured = lum == null ? 'unmeasurable, so the safer light plate' : `luminance ${lum.toFixed(2)}, so ${plate}`;
  const shape = squareish
    ? `square logo ${logoMeta.w}x${logoMeta.h}, ${Math.round((cover || 0) * 100)}% opaque so it is a glyph rather than a tile`
    : ar >= 1.1
      ? `wide logo ${logoMeta.w}x${logoMeta.h} (${ar.toFixed(1)}:1)`
      : `tall logo ${logoMeta.w}x${logoMeta.h}`;
  return {
    cls: 'plate' + shade, bg: '',
    content: `<img class="fit" src="${uri}" alt="">`,
    mode: light ? 'plate-dark' : 'plate',
    note: `${shape} on ${plate} (${measured})`,
  };
}

/* ---------------------------------------------------------------- the build --- */

const REQUIRED = ['{{FONT_URI}}', '{{CREATIVE_URI}}', '{{BRAND_NAME}}',
  '{{AVATAR_CLASS}}', '{{AVATAR_BG}}', '{{AVATAR_CONTENT}}', '{{SPONSORED}}', '{{CTA}}'];

function readVault(name) {
  const p = path.join(FRAME_DIR, name);
  try { return fs.readFileSync(p); }
  catch {
    const e = new Error(
      `the story frame asset ${name} is missing at ${p}. The frame template and its ` +
      'embedded font live in the vault beside concept-visualizer.md so the design can ' +
      'be changed without a deploy.');
    e.status = 503;
    throw e;
  }
}

function buildHtml({ creativePng, brandName, logoBuf, logoMeta, cta, sponsored }) {
  const template = readVault(TEMPLATE).toString('utf8');

  /* A template that lost a token would still render, and would ship a frame
     carrying whatever the design tool left hardcoded in it, for every client.
     That is exactly the class of silent wrongness worth failing on. */
  const missing = REQUIRED.filter((t) => !template.includes(t));
  if (missing.length) {
    const e = new Error(
      `${TEMPLATE} is missing ${missing.join(', ')}. It was probably replaced with a fresh ` +
      'export. Every token has to survive an edit or the frame would render another ' +
      "brand's details.");
    e.status = 500;
    throw e;
  }

  const font = readVault(FONT);
  const av = avatarFor({ logoBuf, logoMeta, brandName });

  const out = template
    .replace(/\{\{FONT_URI\}\}/g, cssUrl(`data:font/woff2;base64,${font.toString('base64')}`))
    .replace(/\{\{CREATIVE_URI\}\}/g, cssUrl(`data:image/png;base64,${creativePng.toString('base64')}`))
    .replace(/\{\{BRAND_NAME\}\}/g, esc(brandName))
    .replace(/\{\{AVATAR_CLASS\}\}/g, av.cls)
    .replace(/\{\{AVATAR_BG\}\}/g, av.bg)
    /* content last and not escaped: it is markup this file authored, and the
       only external value inside it has already been escaped or base64ed */
    .replace(/\{\{AVATAR_CONTENT\}\}/g, av.content)
    .replace(/\{\{SPONSORED\}\}/g, esc(sponsored || 'Sponsored'))
    .replace(/\{\{CTA\}\}/g, esc(cta || 'Learn More'));

  return { html: out, avatar: av };
}

/* --------------------------------------------------------------- the render --- */

/* One POST to the host renderer. It takes finished HTML rather than the brand
   fields because all the craft, the vault template and the brand data live
   here; the renderer is only a rasteriser, and keeping it that dumb is what
   lets it run with its network switched off. */
async function rasterise(html) {
  if (!FRAME_TOKEN) {
    const e = new Error('FRAME_SERVICE_TOKEN is not set on this server, so frames cannot be rendered');
    e.status = 503; throw e;
  }
  let res;
  try {
    res = await fetch(FRAME_URL + '/render', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + FRAME_TOKEN, 'content-type': 'application/json' },
      body: JSON.stringify({ html, selector: '.frame', scale: 4 }),
      signal: AbortSignal.timeout(60 * 1000),
    });
  } catch (e) {
    const err = new Error(
      e.name === 'TimeoutError'
        ? 'the frame renderer did not answer within 60s'
        : `the frame renderer is unreachable at ${FRAME_URL} (${e.message})`);
    err.status = 503; throw err;
  }
  if (!res.ok) {
    let why = 'HTTP ' + res.status;
    try { const j = await res.json(); if (j && j.error) why = j.error; } catch { /* body may be empty */ }
    throw new Error('the frame renderer refused: ' + why);
  }
  const png = Buffer.from(await res.arrayBuffer());
  if (png.length < 100 || png.slice(0, 8).toString('latin1') !== '\x89PNG\r\n\x1a\n') {
    throw new Error('the frame renderer returned something that is not a PNG');
  }
  return png;
}

/** Wrap one creative in the frame. Returns the framed PNG plus what it did. */
async function frame({ creativePng, brandName, logoBuf, logoMeta, cta, sponsored }) {
  const { html, avatar } = buildHtml({ creativePng, brandName, logoBuf, logoMeta, cta, sponsored });
  const png = await rasterise(html);
  const dims = { w: png.readUInt32BE(16), h: png.readUInt32BE(20) };
  return { png, avatar, dims, htmlBytes: Buffer.byteLength(html) };
}

module.exports = {
  frame, buildHtml, loadLogo, avatarFor, initials, measure, brandGradient, meanLuminance,
  esc, cssUrl, FRAME_DIR, TEMPLATE, FONT, REQUIRED,
};
