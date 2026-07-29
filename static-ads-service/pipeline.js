// ===========================================================================================
// Static Ads Service — concept-first, template-faithful ads that PLACE THE CLIENT'S REAL ASSETS
// (the SELECTED product photo, the real logo, brand colours + fonts) — it never redraws a product.
// Reliable headless version: look at the template, rebuild its skeleton as grounded HTML with the
// real product image + logo dropped in, render, QA, retry, keep only the passers. Node 18+. Keys in .env.
// ===========================================================================================
'use strict';

const E = process.env;
const OR_KEY       = E.OPENROUTER_API_KEY;
const SB_URL       = (E.SUPABASE_URL || 'https://xakngjsybyytldyqfsmi.supabase.co').replace(/\/$/, '');
const SB_KEY       = E.SUPABASE_SERVICE_KEY;
const BUCKET       = E.BUCKET || 'static-ads';
const MODEL_BUILD  = E.MODEL_BUILD  || 'anthropic/claude-opus-4.8';   // reconstruct — needs a strong model
const MODEL_VISION = E.MODEL_VISION || 'anthropic/claude-sonnet-4.5'; // QA (judgment; cheaper is fine)
const MAX_TRIES    = +(E.MAX_TRIES || 3);
const SHIP_SCORE   = +(E.SHIP_SCORE || 7);   // QA score (1-10) an ad must clear to ship
const CONCURRENCY  = +(E.CONCURRENCY || 3);
const puppeteer    = require('puppeteer-core');  // local headless Chrome render — free, no per-image limit
const crypto       = require('crypto');
const { cutoutBuffer } = require('./cutout');    // background knockout for product packshots
const { PNG }      = require('pngjs');            // only to detect an already-transparent product PNG (pure JS)

// ---- tiny helpers -------------------------------------------------------------------------
const log = (...a) => console.log(new Date().toISOString(), ...a);
const norm = (s) => String(s || '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '');
const pick = (o, keys, d = '') => { for (const k of keys) if (o && o[k] != null && String(o[k]).trim() !== '') return o[k]; return d; };
const stripFence = (s) => String(s || '').replace(/^```(?:html|json)?/i, '').replace(/```$/, '').trim();
const jsonOf = (s) => { try { return JSON.parse(stripFence(s).match(/\{[\s\S]*\}/)[0]); } catch (e) { return null; } };
// coerce a field that may arrive as an array, an attachment array [{url}], a JSON-array string, or a
// comma/newline list → a clean array of URL strings.
const asArray = (v) => {
  let a = [];
  if (Array.isArray(v)) a = v;
  else if (v != null && String(v).trim() !== '') {
    const s = String(v).trim();
    if (s[0] === '[') { try { const p = JSON.parse(s); a = Array.isArray(p) ? p : [s]; } catch (e) { a = s.split(/[\n,]+/); } }
    else a = s.split(/[\n,]+/);
  }
  return a.map(x => (typeof x === 'string' ? x : (x && (x.url || x.image_url || x.product_image_url)) || ''))
          .map(x => String(x).trim()).filter(Boolean);
};

// Claude vision accepts JPEG/PNG/GIF/WebP — NOT SVG. Skip SVG URLs from image INPUTS (they still
// render fine in the HTML output; the model places them by URL, it just can't "see" them as vision).
const visionSafe = (u) => !!u && !/\.svg(\?|$)/i.test(String(u));

async function chat(model, messages, max_tokens = 4000, reasoning = null) {
  const body = { model, messages, max_tokens };
  if (reasoning) { body.reasoning = reasoning; body.temperature = 1; } else { body.temperature = 0.4; }
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + OR_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('LLM ' + r.status + ' ' + (await r.text()).slice(0, 200));
  const j = await r.json();
  return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
}

// ---- brand brain lookup (same normalised matching as the n8n node) ------------------------
async function fetchBrand(clientName, sisterBrand) {
  const get = async (u) => {
    const r = await fetch(SB_URL + '/rest/v1/' + u, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
    return r.ok ? r.json() : [];
  };
  let index = await get('brand_brain?select=id,brand_name,client_name,aliases&limit=800');
  const find = (term) => {
    const t = norm(term); if (!t) return null;
    return index.find(r => norm(r.brand_name) === t)
      || index.find(r => norm(r.client_name) === t)
      || index.find(r => String(r.aliases || '').split('|').some(a => a.trim() && norm(a) === t));
  };
  const hit = find(sisterBrand) || find(clientName);
  if (!hit) return { brand_name: clientName || 'The Brand', _found: false };
  const rows = await get('brand_brain?select=*&id=eq.' + encodeURIComponent(hit.id));
  return Object.assign({ _found: true }, (rows && rows[0]) || {});
}

// ---- fonts: resolve the brand's scraped typefaces to Google-hostable families --------------
// Proprietary/foundry fonts aren't on Google Fonts; map the common ones to their closest match so
// the render uses a brand-faithful typeface instead of a system default.
const FONT_MAP = {
  canela: 'Fraunces', gtsuper: 'Fraunces', ppeditorial: 'Fraunces', editorialnew: 'Fraunces', reckless: 'Fraunces',
  tiempos: 'Fraunces', ogg: 'Fraunces', freight: 'Fraunces', domaine: 'Fraunces', signifier: 'Fraunces', recoleta: 'Fraunces',
  garamond: 'EB Garamond', ebgaramond: 'EB Garamond', caslon: 'Libre Caslon Text', times: 'PT Serif', georgia: 'PT Serif',
  merriweather: 'Merriweather', lora: 'Lora', playfair: 'Playfair Display', playfairdisplay: 'Playfair Display',
  sohne: 'Inter', soehne: 'Inter', neuehaas: 'Inter', helvetica: 'Inter', helveticanow: 'Inter', arial: 'Inter',
  founders: 'Inter', foundersgrotesk: 'Inter', aktivgrotesk: 'Inter', suisse: 'Inter', suisseintl: 'Inter', graphik: 'Inter',
  geist: 'Inter', untitledsans: 'Inter', inter: 'Inter', roboto: 'Roboto', worksans: 'Work Sans',
  circular: 'Poppins', gilroy: 'Poppins', futura: 'Poppins', gotham: 'Poppins', gothamrounded: 'Poppins',
  avenir: 'Nunito Sans', avenirnext: 'Nunito Sans', proximanova: 'Nunito Sans', proxima: 'Nunito Sans',
  montserrat: 'Montserrat', poppins: 'Poppins', nunito: 'Nunito', nunitosans: 'Nunito Sans', dmsans: 'DM Sans',
  manrope: 'Manrope', fredoka: 'Fredoka', quicksand: 'Quicksand', sourcesans: 'Source Sans 3', raleway: 'Raleway',
};
const SERIF_HINT = /serif|canela|garamond|caslon|times|georgia|fraunces|playfair|tiempos|reckless|ogg|freight|domaine|signifier|lora|merriweather|editorial|didone|recoleta|slab/i;
function resolveFont(nameRaw) {
  const key = norm(nameRaw); if (!key) return null;
  for (const k in FONT_MAP) if (key.includes(k)) return { family: FONT_MAP[k], serif: SERIF_HINT.test(nameRaw) || SERIF_HINT.test(FONT_MAP[k]) };
  const family = String(nameRaw).trim().replace(/\s+/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  return { family, serif: SERIF_HINT.test(nameRaw) };
}
const KNOWN_GOOGLE = new Set([...Object.values(FONT_MAP), 'Playfair Display', 'Manrope', 'Fraunces', 'Inter', 'Poppins', 'Montserrat', 'Nunito', 'Nunito Sans', 'DM Sans', 'Work Sans', 'Lora', 'Merriweather', 'EB Garamond', 'Libre Caslon Text', 'PT Serif', 'Roboto', 'Fredoka', 'Quicksand', 'Source Sans 3', 'Raleway', 'Cormorant Garamond', 'Spectral']);
function resolveFonts(brandFonts) {
  const names = String(brandFonts || '').split(/[,/;|+]|\band\b/).map(s => s.replace(/[()]/g, ' ').trim()).filter(Boolean).slice(0, 4);
  const resolved = names.map(resolveFont).filter(Boolean);
  const head = resolved.find(r => r.serif) || resolved[0];
  const body = resolved.find(r => !r.serif) || resolved[1] || resolved[0];
  let headFam = head ? head.family : 'Playfair Display';
  let bodyFam = body ? body.family : 'Manrope';
  if (!KNOWN_GOOGLE.has(headFam)) headFam = 'Playfair Display';  // proprietary/unknown → tasteful default that loads
  if (!KNOWN_GOOGLE.has(bodyFam)) bodyFam = 'Manrope';
  const wanted = [...new Set([bodyFam, headFam])];
  // request only 400+700 — every mapped family has these, so the @import can't 400 and drop the font
  const imp = wanted.map(f => `@import url('https://fonts.googleapis.com/css2?family=${f.replace(/\s+/g, '+')}:wght@400;700&display=swap');`).join('\n');
  return { head: `'${headFam}', Georgia, serif`, body: `'${bodyFam}', system-ui, sans-serif`, import: imp };
}

// ---- brand → design tokens (auto-contrast, brand fonts) -----------------------------------
const rgb = (h) => { const n = parseInt(String(h).replace('#', '').slice(0, 6) || '2E6BFF', 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const toHex = (a) => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const lum = (h) => { const [r, g, b] = rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

function tokens(brain) {
  const brand = pick(brain, ['primary_color_hex'], '#2E6BFF');
  const accent = pick(brain, ['accent_color_hex', 'secondary_color_hex'], brand);
  const light = lum(brand) > 0.55;
  const f = resolveFonts(pick(brain, ['brand_fonts'], ''));
  return {
    brand, accent, brand2: toHex(rgb(brand).map(v => v * (light ? 0.86 : 0.78))),
    onbrand: light ? '#12142B' : '#FFFFFF', ink: '#12142B',
    lightBg: toHex(rgb(brand).map(v => v * 0.1 + 255 * 0.9)),
    sans: f.body, serif: f.head, fontImport: f.import,
  };
}
function baseCss(t) {
  return `${t.fontImport}
:root{ --brand:${t.brand}; --brand2:${t.brand2}; --onbrand:${t.onbrand}; --accent:${t.accent};
  --ink:${t.ink}; --sub:#5A6377; --line:#E6EAF2; --light:${t.lightBg}; --paper:#FFFFFF; --green:#12A150; --red:#E5484D; --yellow:#F3E85C; }
*{margin:0;padding:0;box-sizing:border-box} html,body{background:#000}
.stage{width:1080px;height:1080px;position:relative;overflow:hidden;font-family:${t.sans};-webkit-font-smoothing:antialiased;color:var(--ink)}
.serif{font-family:${t.serif}}
img{display:block;max-width:100%}
.product{object-fit:contain;display:block}    /* the REAL product photo — never a drawn shape */
.logo{height:46px;width:auto;object-fit:contain;display:block}
.cta{display:inline-flex;align-items:center;gap:10px;font-weight:800;font-size:23px;padding:15px 30px;border-radius:999px;white-space:nowrap;background:var(--brand);color:var(--onbrand)}`;
}

const STANDARDS = `DESIGN STANDARDS — the authentic, hand-designed bar. This is what separates a real ad from AI slop:
CONCEPT: ONE concept, ONE hook, ONE hero visual, ONE CTA — it must read in under 2 seconds. Decide the single hook FIRST, then compose around it. Do not cram.
HIERARCHY: one dominant focal element (the headline OR the product); everything else clearly subordinate. Big beats small. Use strong scale contrast and confident, intentional whitespace — NEVER evenly-sized, evenly-spaced "form-filling".
TYPE SCALE (in the 1080x1080 frame): headline 72-108px, weight 800-900, tight leading (~1.0), the clear focal point, in the "serif" display face; subhead 30-42px; body / benefit lines 26-34px (NEVER below 24px), weight 500-700; eyebrow/label 18-22px uppercase letter-spaced; CTA 22-28px bold in a pill. When unsure, go LARGER — timid type is the #1 slop tell.
PRODUCT = THE SUBJECT: the real product photo is the HERO — large, roughly 40-55% of the frame in a product-led layout, NEVER a small thumbnail. Handle its background: packshots usually sit on white/light, so NEVER show a hard white rectangle floating on a coloured background. Do ONE of: (a) place it on a panel of the SAME colour as its own background so it blends seamlessly, (b) feature it large / full-bleed so its background becomes part of the composition, or (c) set the whole product zone to that light colour. It must look placed by a designer, not pasted. Use ONE clean product shot as the focal image; don't scatter small product boxes.
LOGO: real logo, correct contrast variant, undistorted, small and tasteful in a corner — it is a mark, not the hero.
COLOUR: a deliberate palette — one dominant brand colour + one accent — with strong contrast; brand fonts only.
ANTI-SLOP: no evenly-tiled cards, no everything-centred, no timid mid-sized text everywhere, no clashing white rectangles, no meaningless decorative objects. Every element earns its place and points to the one message.`;

const RULES = `HARD RULES:
1. FOLLOW THE TEMPLATE'S STRUCTURE. Reconstruct the attached template's layout, concept device, zones and reading order faithfully, so the ad is recognizable as that template rebuilt for this brand. DISCARD the template's original words, product and logo (they belong to a different brand) and fill every zone with THIS brand's real content; the template's original category or brand must NEVER leak in. Execute it to the DESIGN STANDARDS below (readable type, no overlap, product clear).
2. THE PRODUCT: wherever a product belongs, place the REAL product photo with <img src="EXACT_PRODUCT_URL" class="product"> as the HERO (large, integrated per the standards). NEVER draw, illustrate or CSS-build a product; NEVER invent one; NEVER a small pasted white box. If NO product image is provided, build a clean typographic ad with no product.
3. THE LOGO: place the REAL logo <img class="logo"> (correct contrast variant) small in a corner. If none provided, a plain TEXT wordmark — never invent a logo graphic.
4. IMAGES ARE WHITELISTED: the ONLY <img> allowed are the exact product photo URL(s) and logo URL(s) below. No other imagery, no emoji, no stock/fabricated images, no icon fonts. Clean inline-SVG line icons are fine.
5. COPY: every word is THIS brand's real offer, grounded in the material below — specific, never vague filler ("get expert guidance", "find solutions"). Write the hook, subhead, CTA and any support copy yourself. Use copy where it earns impact; do NOT pad zones just to fill them.
6. LAYOUT: build with normal document flow / flexbox / grid in SEPARATE containers — do NOT absolutely-position text on top of other text. Everything inside the 1080x1080 frame with margins; nothing clipped, no text wider than its box, nothing overlaps. (An automated check rejects overlaps, off-frame elements and clipped text — a clean flow layout passes it.)
7. NO FABRICATED SPECIFICS: no invented $ amounts, stats, awards, review counts, or press logos. Soft illustrative ★★★★★ quotes may use a first name + initial only.
8. Crisp HTML only. Output ONLY the <div class="stage" ...>...</div>.`;

// ---- reconstruct: LOOK at the template + the real assets, write grounded HTML --------------
async function reconstruct(templateUrl, brain, assets, lastIssues) {
  const { logoDark, logoLight, name, productImages, productNames, references } = assets;
  const material = [
    `Offer: ${pick(brain, ['key_offer'])}`,
    `Voice: ${pick(brain, ['brand_tone'], 'clear, direct')}`,
    pick(brain, ['product_benefits']) ? `Proof / benefits: ${String(pick(brain, ['product_benefits'])).slice(0, 400)}` : '',
    pick(brain, ['target_personas']) ? `Audience: ${String(pick(brain, ['target_personas'])).slice(0, 300)}` : '',
    pick(brain, ['core_pain_points']) ? `Pain points: ${String(pick(brain, ['core_pain_points'])).slice(0, 300)}` : '',
  ].filter(Boolean).join('\n');

  let txt =
    `Recreate the ATTACHED TEMPLATE as a polished 1080x1080 ad for "${name}". FOLLOW THE TEMPLATE'S LAYOUT FAITHFULLY: the same concept device (e.g. checklist, VS/comparison, product-hero, before/after, handwritten note), the same zones in the same arrangement, the same reading order and visual rhythm. The finished ad must be immediately recognizable as THIS template, rebuilt for ${name}. Then swap ALL of the template's content for this brand: write this brand's real copy in every zone, use this brand's colours and fonts, and drop in the real product photo where the template places its product. Depart from the template ONLY where needed to stay on-brand and to meet the quality standards below (readable type, nothing overlapping, product clear and recognizable).\n\n` +
    `BRAND: ${name}.\n${material}\n\n`;

  if (productImages && productImages.length) {
    txt += `REAL PRODUCT PHOTO(S) — the HERO of the ad, with the background ALREADY REMOVED (transparent PNG). Place the most fitting one LARGE (roughly 40-55% of the frame) with <img class="product"> directly on the ad background — it composites cleanly on ANY colour, so NO panel, card or white box behind it. Give it a generous area; it is the subject. Use the EXACT URL(s); NEVER redraw:\n` +
      productImages.map((u, k) => `  PRODUCT_URL_${k + 1} (${productNames[k] || 'product'}): ${u}`).join('\n') + `\n\n`;
  } else {
    txt += `NO product photo provided — do NOT draw or invent a product. Build a bold typographic ad instead.\n\n`;
  }
  if (logoDark && logoLight) txt += `REAL LOGO — two variants provided; place the ONE that CONTRASTS with the background where the mark sits, as <img class="logo"> with the EXACT URL. Never a dark logo on a dark area or a white logo on a light one:\n  DARK logo (use on LIGHT / neon / cream backgrounds): ${logoDark}\n  WHITE logo (use on DARK backgrounds): ${logoLight}\n\n`;
  else if (logoDark) txt += `REAL LOGO — place with <img src="${logoDark}" class="logo"> where the brand mark sits, on a background it CONTRASTS with. Use this EXACT URL.\n\n`;
  else txt += `No logo asset — use a plain TEXT wordmark "${name}" in the brand font (never invent a logo graphic).\n\n`;

  txt += `First decide the SINGLE hook (the one idea this ad lands), then compose around it. Write the headline, subhead, CTA and any support copy yourself from the offer and pains: specific, bold, on-brand.\n\n` +
    `DESIGN SYSTEM: stage is <div class="stage" style="...">, 1080x1080. CSS vars: --brand --brand2 --onbrand --accent --ink --sub --line --light --paper --green --red --yellow. Body font is the brand sans; class "serif" for the display headline; class "product" for the product <img> (object-fit:contain, size it large); class "logo" for the logo <img>; .cta pill.\n\n` +
    `HARD REQUIREMENTS: headline at least 76px, subhead at least 30px, body at least 26px (an automated check REJECTS text under 20px, any overlap, and anything off the frame). Keep copy SHORT so it fits big. PUNCTUATION: NEVER use em-dashes, en-dashes or hyphens in the copy; use commas and periods only (write "grass fed colostrum, now a soda", not "grass-fed soda").\n\n` +
    `${STANDARDS}\n\n${RULES}\n` +
    (lastIssues ? `\nThe previous attempt FAILED the art-director QA — fix EXACTLY this, keep everything else:\n${lastIssues}\n` : '');

  const parts = [{ type: 'text', text: txt }];
  // NOTE: only RASTER images go to the vision model (SVG 400s the API); SVG assets are still placed
  // via their URL in the text above and render fine in the HTML.
  if (visionSafe(templateUrl)) parts.push({ type: 'text', text: 'TEMPLATE (copy this layout skeleton):' }, { type: 'image_url', image_url: { url: templateUrl } });
  (productImages || []).slice(0, 3).forEach((u, k) => { if (visionSafe(u)) parts.push({ type: 'text', text: `REAL PRODUCT PHOTO ${k + 1} (place this exact image, do not redraw):` }, { type: 'image_url', image_url: { url: u } }); });
  if (visionSafe(logoDark)) parts.push({ type: 'text', text: 'REAL LOGO — dark variant (for light backgrounds):' }, { type: 'image_url', image_url: { url: logoDark } });
  if (visionSafe(logoLight)) parts.push({ type: 'text', text: 'REAL LOGO — white variant (for dark backgrounds):' }, { type: 'image_url', image_url: { url: logoLight } });
  (references || []).slice(0, 2).forEach((u) => parts.push({ type: 'text', text: 'BRAND REFERENCE (style cue only — do NOT copy its product or text):' }, { type: 'image_url', image_url: { url: u } }));

  // Big output budget so the HTML isn't starved by the thinking budget (thinking is separate).
  return stripFence(await chat(MODEL_BUILD, [{ role: 'user', content: parts }], 16000, { max_tokens: +(E.THINK_TOKENS || 6000) }));
}

// ---- render HTML → PNG Buffer via LOCAL headless Chrome (free, unlimited) ------------------
let _browser = null;
async function getBrowser() {
  if (_browser && _browser.isConnected()) return _browser;
  _browser = await puppeteer.launch({
    executablePath: E.CHROME_PATH || undefined,          // set on the VPS (e.g. /usr/bin/chromium)
    channel: E.CHROME_PATH ? undefined : 'chrome',       // else locate an installed Chrome
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--hide-scrollbars'],
  });
  return _browser;
}
// deterministic layout check (runs in the page): catches text that overlaps, overflows its box, or
// spills outside the 1080² frame — the spatial failures a vision QA misses. Returns a list of issues.
function detectLayout() {
  const stage = document.querySelector('.stage');
  if (!stage) return [];
  const sb = stage.getBoundingClientRect();
  const issues = [];
  const nodes = [...stage.querySelectorAll('*')].filter(el => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
    return [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
  });
  const items = nodes.map(el => ({ el, r: el.getBoundingClientRect(), t: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28) }))
    .filter(o => o.r.width > 4 && o.r.height > 4);
  for (const o of items) {
    if (o.r.left < sb.left - 3 || o.r.top < sb.top - 3 || o.r.right > sb.right + 3 || o.r.bottom > sb.bottom + 3)
      issues.push('OUT-OF-FRAME: "' + o.t + '" extends past the canvas edge');
    else if (o.el.scrollWidth > o.el.clientWidth + 6) issues.push('TEXT-OVERFLOW: "' + o.t + '" is wider than its box (spills / clips)');
    const full = (o.el.textContent || '').trim();
    if (full.length >= 24 && full.length <= 140 && !/evaluated|\bFDA\b|diagnose|disease|statement/i.test(full)) {
      const fs = parseFloat(getComputedStyle(o.el).fontSize) || 99;
      if (fs < 20) issues.push('TEXT-TOO-SMALL: "' + o.t + '" is ' + Math.round(fs) + 'px — headline/subhead/body must be big (body 26px+)');
    }
  }
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j];
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
    const oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    const minA = Math.min(a.r.width * a.r.height, b.r.width * b.r.height);
    if (ox > 2 && oy > 2 && ox * oy > 0.28 * minA && minA > 1400) issues.push('OVERLAP: "' + a.t + '" overlaps "' + b.t + '"');
  }
  return [...new Set(issues)].slice(0, 6);
}
async function render(fullHtml) {
  const page = await (await getBrowser()).newPage();
  try {
    await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 2 }); // 2x → crisp 2160² output
    await page.setContent(fullHtml, { waitUntil: 'networkidle0', timeout: 45000 });
    // make sure the external images (product photo, logo) are fully decoded before the screenshot
    await page.evaluate(() => Promise.all(Array.from(document.images).map(i => (i.complete ? Promise.resolve() : i.decode().catch(() => {}))))).catch(() => {});
    const issues = await page.evaluate(detectLayout).catch(() => []);
    const el = await page.$('.stage');
    const buf = await (el || page).screenshot({ type: 'png' });   // PNG Buffer @ 2160²
    return { buf, issues: Array.isArray(issues) ? issues : [] };
  } finally { await page.close().catch(() => {}); }
}

// ---- QA the render against the template (strict, hand-designed bar) ------------------------
async function qa(templateUrl, renderedUrl, brain, flags, productNames) {
  const name = pick(brain, ['brand_name', 'client_name'], 'the brand');
  const subject = (Array.isArray(productNames) && productNames.length) ? productNames.filter(Boolean).join(', ') : '';
  const req = [];
  if (flags && flags.hasProduct) req.push(`the REAL product photo must be the HERO, large (roughly 40-55% of the frame) and integrated; score 4 or below if the product is a small thumbnail, is drawn/illustrated/CSS-built/fabricated, is stretched/clipped, is missing, or sits in a hard white or contrasting rectangle pasted onto the background`);
  if (flags && flags.hasLogo) req.push(`the real logo image must be present and legible (correct contrast variant); score 5 or below if it is missing, distorted, or low-contrast against its background`);
  const content = [
    { type: 'text', text: `You are a TOUGH art director doing QA on this 1080x1080 ad for "${name}"${subject ? `, featuring the client's own chosen product: ${subject}` : ''}. Hold it to a hand-designed, scroll-stopping bar and REJECT AI slop. Return JSON {"score": <integer 1-10; 10=ship-ready hand-designed, 7=good with only minor nits, 6 or below=a designer would redo it>, "issues":[specific, ACTIONABLE fixes with sizes/percentages]}. IMPORTANT: the product shown IS the client's real, chosen product, so NEVER flag it as the wrong product, wrong category, or "not what this brand sells" even if the brand also sells other formats; judge craft only, not product choice. ${req.length ? 'REQUIRED: ' + req.join('; ') + '. ' : ''}Score 6 or below for ANY of: TIMID or too-small type (headline not clearly dominant, or body copy under ~26px that reads small/weak); text that OVERLAPS, is SCATTERED, or has weak hierarchy; a cluttered "every zone filled" look instead of ONE clear concept that reads in 2 seconds; a product that is a small thumbnail or pasted in a clashing white box; a large dead area; generic filler copy ("get expert guidance", "find solutions") instead of specifics; an off-brand colour or a wrong / novelty font; a meaningless decorative object; a fabricated SPECIFIC claim (invented $ figure, statistic, award, press / "as featured in" logo, review count, or a real-looking full name with age/city). ALLOWED (do NOT penalise): soft illustrative ★★★★★ quotes with a first name + initial only; clean inline-SVG line icons; the brand colour as a bold fill. The ad should be a faithful REBUILD of the REFERENCE TEMPLATE below for this brand (same layout, concept device and zones, with the brand's own content); if it abandons the template's structure and invents an unrelated layout, dock 2 points and say so. A BOLD, art-directed, on-brand ad that follows the template with a large integrated product and confident type scores 8-9. Make issues concrete, e.g. "headline ~40px, take it to ~90px"; "product ~15% of frame, make it the hero at ~45%"; "ignores the template: template is a VS comparison but the ad is a single hero".` },
  ];
  if (visionSafe(templateUrl)) content.push({ type: 'text', text: 'REFERENCE TEMPLATE:' }, { type: 'image_url', image_url: { url: templateUrl } });
  content.push({ type: 'text', text: 'RENDERED AD:' }, { type: 'image_url', image_url: { url: renderedUrl } });
  const v = jsonOf(await chat(MODEL_VISION, [{ role: 'user', content }], 800)) || {};
  return { score: typeof v.score === 'number' ? v.score : 0, issues: Array.isArray(v.issues) ? v.issues : ['QA unparseable'] };
}

// ---- own the asset: pull the render, store in Supabase, insert the library row -------------
async function store(buf, path) {
  const up = await fetch(SB_URL + '/storage/v1/object/' + BUCKET + '/' + path, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'image/png', 'x-upsert': 'true' },
    body: buf,
  });
  if (!up.ok) throw new Error('upload ' + up.status + ' ' + (await up.text()).slice(0, 160));
  return SB_URL + '/storage/v1/object/public/' + BUCKET + '/' + path;
}
async function insertRow(imageUrl, brain, meta) {
  const ins = await fetch(SB_URL + '/rest/v1/static_ads', {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({
      brand_name: meta.brand, image_url: imageUrl, variant_index: 1, template_index: meta.i,
      platform: meta.platform || 'Meta / TikTok - Square (1:1)', aspect_ratio: '1:1',
      run_id: meta.runId, qa_score: 9, qa_notes: 'agent-generated, QA-passed',
    }),
  });
  if (!ins.ok) throw new Error('insert ' + ins.status + ' ' + (await ins.text()).slice(0, 160));
}

// true if the image already has a transparent background (client supplied a clean cut-out PNG) —
// then the pipeline uses it EXACTLY as-is instead of re-matting it.
function isAlreadyCut(buf) {
  try {
    if (!(buf[0] === 0x89 && buf[1] === 0x50)) return false; // only PNG carries alpha
    const png = PNG.sync.read(buf);
    const W = png.width, H = png.height, d = png.data, a = (x, y) => d[(y * W + x) * 4 + 3];
    return [a(1, 1), a(W - 2, 1), a(1, H - 2), a(W - 2, H - 2)].filter(v => v < 20).length >= 3;
  } catch (e) { return false; }
}

// fetch a product packshot, knock out its background, cache the transparent PNG in Supabase, return its URL
async function cutoutProduct(url) {
  try {
    if (!url || /\.svg(\?|$)/i.test(url)) return url;
    const key = crypto.createHash('md5').update(url).digest('hex').slice(0, 16);
    const path = `cutouts/${key}.png`;
    const publicUrl = SB_URL + '/storage/v1/object/public/' + BUCKET + '/' + path;
    if ((await fetch(publicUrl, { method: 'HEAD' })).ok) return publicUrl;   // already cut — reuse
    const r = await fetch(url); if (!r.ok) return url;
    const inBuf = Buffer.from(await r.arrayBuffer());
    if (await isAlreadyCut(inBuf)) { log('  product already transparent — using as-is'); return url; }
    const cut = await cutoutBuffer(inBuf);
    if (!cut) { log('  cutout: not a clean packshot, using original'); return url; }
    const out = await store(cut, path);
    log('  cutout: background removed → ' + path);
    return out;
  } catch (e) { log('  cutout failed (' + String(e.message || e).slice(0, 60) + '), using original'); return url; }
}

// ---- produce ONE ad from ONE template (reconstruct → render → QA → retry) ------------------
async function produceOne(templateUrl, brain, tok, assets, meta) {
  const base = baseCss(tok);
  let lastIssues = '';
  let best = { score: 0, url: null };
  const flags = { hasProduct: !!(assets.productImages && assets.productImages.length), hasLogo: !!assets.logoDark };
  for (let t = 1; t <= MAX_TRIES; t++) {
    try {
      let stage = await reconstruct(templateUrl, brain, assets, lastIssues);
      if (!/class=["']stage/.test(stage) || stage.length < 500) { lastIssues = 'Output was empty or a skeleton. Build the COMPLETE ad with real content in every zone.'; log(`  [${meta.i}] try ${t}: empty/skeleton, retrying`); continue; }
      stage = stage.replace(/\s*[—–]\s*/g, ', ').replace(/([A-Za-z0-9]) - ([A-Za-z0-9])/g, '$1, $2'); // strip em/en dashes and dash-hyphens from the copy (never ship them)
      const { buf, issues: layoutIssues } = await render(`<!doctype html><html><head><meta charset="utf8"><style>${base}</style></head><body>${stage}</body></html>`);
      // deterministic layout gate — never ship overlapping / clipped / off-frame / tiny text (vision QA misses these)
      if (layoutIssues.length) { lastIssues = 'LAYOUT ERRORS to fix (use normal flow/flex/grid in separate containers, keep everything inside the frame, make text big):\n' + layoutIssues.map(x => '- ' + x).join('\n'); log(`  [${meta.i}] try ${t}: ${layoutIssues.length} layout issue(s): ${layoutIssues[0].slice(0, 70)}`); continue; }
      // Upload each attempt so QA scores a real https image (the API rejects data: URLs).
      const url = await store(buf, `produced/${norm(meta.brand)}/${meta.runId}-${meta.i}-t${t}.png`);
      const v = await qa(templateUrl, url, brain, flags, assets.productNames);
      log(`  [${meta.i}] try ${t}: score ${v.score}${v.issues && v.issues.length ? ' — ' + v.issues.join('; ').slice(0, 110) : ''}`);
      if (v.score > best.score) best = { score: v.score, url };
      if (v.score >= SHIP_SCORE) break;
      lastIssues = (v.issues || []).map(x => '- ' + x).join('\n');
    } catch (e) { lastIssues = String(e.message || e); log(`  [${meta.i}] error try ${t}: ${lastIssues.slice(0, 140)}`); }
  }
  if (best.url && best.score >= SHIP_SCORE) {
    await insertRow(best.url, brain, meta);
    log(`  [${meta.i}] SHIP (score ${best.score}) → ${best.url}`);
    return { template_url: templateUrl, image_url: best.url, score: best.score };
  }
  log(`  [${meta.i}] DROPPED (best score ${best.score})`);
  return null; // fully-automatic: below the bar → does not ship
}

// ---- auto-select industry-matched templates (when the client does NOT hand-pick) ----------
// The client can just request N ads; we look at their industry and pick N on-industry templates
// (a diverse spread of layout categories, no seasonal/occasion templates) from the 972-row library.
let _templateIndex = null;
async function loadTemplates() {
  if (_templateIndex) return _templateIndex;
  const rows = []; let from = 0;
  while (true) {
    const r = await fetch(`${SB_URL}/rest/v1/creative_os_templates?select=image_url,category,industry_tags&limit=1000&offset=${from}`, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
    const d = r.ok ? await r.json() : [];
    if (!Array.isArray(d) || !d.length) break;
    rows.push(...d); if (d.length < 1000) break; from += 1000;
  }
  _templateIndex = rows.filter(r => r.image_url);
  return _templateIndex;
}
const SEASONAL = /black friday|holiday|mother|father|valentine|christmas|halloween|new year|cyber monday|easter|thanksgiving|prime day/i;
const INDUSTRY_MAP = [
  [/supplement|vitamin|colostrum|collagen|nutrition|probiotic|nootropic|\bliver\b|\bgut\b|peptide|mushroom/i, ['Supplements', 'Health & Wellness']],
  [/fintech|financ|\bdebt\b|lending|\bloan\b|credit|insurance|mortgage|\bbank|invest|\btax\b/i, ['Finance']],
  [/\blaw\b|legal|attorney|lawyer|\bclaim/i, ['Lawyers', 'Professional Services']],
  [/skin|serum|acne|beauty|cosmetic|makeup|lash/i, ['Skincare', 'Beauty', 'Personal Care']],
  [/\bhair\b/i, ['Hair Care', 'Personal Care']],
  [/apparel|clothing|\btee\b|shirt|fashion|\bwear\b/i, ['Apparel']],
  [/food|beverage|\bdrink|coffee|soda|snack|\btea\b|water|wafel|jerky/i, ['Food & Beverage']],
  [/\bbaby|kids|child|infant|toddler|crib|nursery/i, ['Baby & Kids']],
  [/\bpet\b|\bdog\b|\bcat\b/i, ['Pets']],
  [/\btech\b|software|\bapp\b|saas|platform|digital|\bai\b|\bgame/i, ['Technology', 'Digital Products', 'App Installs']],
  [/jewel|\bring\b|necklace|bracelet/i, ['Jewelry', 'Accessories']],
  [/\bhome\b|furniture|garment|cleaning|mattress|\bbed\b|kitchen|dresser|\bcart/i, ['Home Goods', 'Home Services', 'Kitchen & Dining']],
  [/education|tutor|school|learn|course|graduat/i, ['Education', 'Info Products']],
  [/travel|cruise|vacation|flight/i, ['Travel']],
  [/\bdating\b|singles/i, ['Dating']],
  [/entrepreneur|business|coach|agency|consult/i, ['Business/Professional', 'Info Products', 'Professional Services']],
  [/health|wellness|medical|doctor|therap|mental/i, ['Health & Wellness']],
];
function templateTags(brain) {
  const industry = pick(brain, ['industry']);
  const text = (industry && industry.trim()) ? (industry + ' ' + pick(brain, ['brand_name'], '')) : [pick(brain, ['key_offer']), pick(brain, ['brand_name'])].filter(Boolean).join(' ');
  const tags = new Set();
  for (const [re, t] of INDUSTRY_MAP) if (re.test(text)) t.forEach(x => tags.add(x));
  return tags.size ? [...tags] : ['Health & Wellness', 'Supplements'];
}
async function selectTemplates(brain, count) {
  const idx = (await loadTemplates()).filter(r => !SEASONAL.test(r.category || ''));
  const tags = templateTags(brain).map(t => t.toLowerCase());
  const tagsOf = (r) => Array.isArray(r.industry_tags) ? r.industry_tags : String(r.industry_tags || '').split(/[,|;]/);
  const matches = idx.filter(r => tagsOf(r).some(x => tags.includes(String(x).trim().toLowerCase())));
  const pool = (matches.length >= count ? matches : idx).slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const perCat = Math.max(1, Math.ceil(count / 4)), catCount = {}, picks = [];
  for (const r of pool) { if (picks.length >= count) break; const c = r.category || 'x'; if ((catCount[c] || 0) >= perCat) continue; catCount[c] = (catCount[c] || 0) + 1; picks.push(r); }
  for (const r of pool) { if (picks.length >= count) break; if (!picks.includes(r)) picks.push(r); }
  return picks.slice(0, count).map(r => r.image_url);
}

// ---- produce a whole batch from a form submission -----------------------------------------
async function produceBatch(body) {
  const brand = String(body.client_name || body.clientName || body.brand_name || body.brand || '').trim();
  let templates = asArray(body.selected_template_urls || body.template_urls || body.selected_templates);
  const runId = 'agent-' + Date.now();
  const platform = String(body.platforms || '').split(',')[0].trim();

  // the REAL product photos the client selected in the form (product_image_urls / products[])
  let productImages = asArray(body.product_image_urls);
  if (!productImages.length && Array.isArray(body.products)) productImages = asArray(body.products);
  if (!productImages.length) productImages = asArray(body.product_image_url);
  let productNames = asArray(body.product_names);
  if (!productNames.length && Array.isArray(body.products)) productNames = body.products.map(p => (p && (p.name || p.product_name)) || '').filter(Boolean);
  const references = asArray(body.reference_urls);

  const brain = await fetchBrand(brand, body.sister_brand);
  if (!brain._found) log(`  WARNING: no Brand Brain row for "${brand}" — copy will be thin`);
  const tok = tokens(brain);
  const name = pick(brain, ['brand_name', 'client_name'], brand || 'The Brand');

  // AUTO-SELECT industry-matched templates when the client didn't hand-pick any (they just request N ads)
  if (!templates.length) {
    const n = Math.max(1, Math.min(50, +(body.static_ads_count || body.count) || 5));
    try { templates = await selectTemplates(brain, n); log(`  auto-picked ${templates.length} templates for industry "${pick(brain, ['industry'], '?')}"`); }
    catch (e) { log('  auto-pick failed: ' + String(e.message || e).slice(0, 80)); }
  }
  log(`RUN ${runId} — "${brand}" — ${templates.length} templates, ${productImages.length} product image(s)`);

  // fall back to the brand-brain packshot / logo when the form didn't carry them
  if (!productImages.length) productImages = asArray(brain.product_image).slice(0, 1);
  // knock the background out of each product packshot so it composites cleanly (no white box)
  productImages = (await Promise.all(productImages.map(cutoutProduct))).filter(Boolean);
  const logos = asArray(brain.logo_urls);
  const logoDark = logos[0] || null;   // dark mark → for LIGHT backgrounds
  const logoLight = logos[1] || null;  // white mark → for DARK backgrounds
  const assets = { logoDark, logoLight, name, productImages, productNames, references };
  if (!logoDark) log(`  NOTE: no logo in brand_brain.logo_urls for "${name}" — using a text wordmark. Add the real logo with set-logo.js to get the brand mark.`);
  if (!productImages.length) log(`  NOTE: no product image (form or brand_brain) — ads will be typographic with no product shown.`);

  // concurrency-limited pool
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < templates.length) {
      const i = idx++;
      const r = await produceOne(templates[i], brain, tok, assets, { brand: name, i: i + 1, runId, platform });
      if (r) results.push(r);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, templates.length || 1) }, worker));
  log(`RUN ${runId} DONE — ${results.length}/${templates.length} shipped`);
  return { runId, brand: name, requested: templates.length, shipped: results.length, ads: results };
}

module.exports = { produceBatch, produceOne, fetchBrand, tokens, baseCss, resolveFonts };
