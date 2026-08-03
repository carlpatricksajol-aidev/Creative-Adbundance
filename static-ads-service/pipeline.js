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
const MODEL_BUILD  = E.MODEL_BUILD  || 'anthropic/claude-sonnet-4.5'; // reconstruct (hand-picked template rebuilds) — Sonnet is good enough
const MODEL_VISION = E.MODEL_VISION || 'anthropic/claude-sonnet-4.5'; // QA (judgment; cheaper is fine)
const MAX_TRIES    = +(E.MAX_TRIES || 2);
const SHIP_SCORE   = +(E.SHIP_SCORE || 7);   // QA score (1-10) an ad must clear to ship
const CONCURRENCY  = +(E.CONCURRENCY || 4);
const MODEL_DIRECTOR  = E.MODEL_DIRECTOR || 'anthropic/claude-sonnet-4.5'; // creative-director stage; Sonnet is cheap+fast and the prompt is prescriptive. Set MODEL_DIRECTOR=anthropic/claude-opus-4.8 for premium concepts.
const MODEL_BUILD_FAST = E.MODEL_BUILD_FAST || 'anthropic/claude-sonnet-4.5'; // EXECUTE a decided brief — Sonnet is FAST and the prompts carry the quality. Set MODEL_BUILD_FAST=anthropic/claude-opus-4.8 for premium (slower) builds.
const DIRECTOR_THINK  = +(E.DIRECTOR_THINK || 1500);    // the heavy creative thinking happens ONCE per batch, here (kept modest for latency)
const BUILD_THINK     = +(E.THINK_TOKENS || 0);         // reconstruct: NO thinking — Sonnet builds fast; the prompt + retry loop handle layout
const puppeteer    = require('puppeteer-core');  // local headless Chrome render — free, no per-image limit
const crypto       = require('crypto');
const { cutoutBuffer } = require('./cutout');    // background knockout for product packshots
const { PNG }      = require('pngjs');            // only to detect an already-transparent product PNG (pure JS)
const { DIRECTOR_PROMPT, DEVICES } = require('./director-data'); // creative-director brain + inline-SVG device library
const { kieGenerate, kieEnabled } = require('./kie');            // KIE AI photoreal render lane (product brands)

// ---- tiny helpers -------------------------------------------------------------------------
const log = (...a) => console.log(new Date().toISOString(), ...a);
const norm = (s) => String(s || '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '');
const pick = (o, keys, d = '') => { for (const k of keys) if (o && o[k] != null && String(o[k]).trim() !== '') return o[k]; return d; };
const stripFence = (s) => String(s || '').replace(/^```(?:html|json)?/i, '').replace(/```$/, '').trim();
const jsonOf = (s) => { try { return JSON.parse(stripFence(s).match(/\{[\s\S]*\}/)[0]); } catch (e) { return null; } };
const jsonArrayOf = (s) => { try { const m = stripFence(s).match(/\[[\s\S]*\]/); return m ? JSON.parse(m[0]) : null; } catch (e) { return null; } };
// Robustly pull an array of objects out of an LLM response even when it is wrapped in reasoning
// preamble (which may contain stray "[" brackets) or an object like {"briefs":[...]}. Bracket-matches
// from the first "[{" while ignoring brackets INSIDE strings (device_note text often contains them).
function extractBriefs(raw) {
  const s = stripFence(String(raw || ''));
  try { const v = JSON.parse(s); if (Array.isArray(v)) return v; const a = v && (v.briefs || v.concepts || v.ads || v.array); if (Array.isArray(a)) return a; } catch (e) {}
  const start = s.search(/\[\s*\{/);
  if (start >= 0) {
    // bracket-match the whole array (string-aware)
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < s.length; i++) {
      const c = s[i];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === '[') depth++;
      else if (c === ']') { if (--depth === 0) { try { const v = JSON.parse(s.slice(start, i + 1)); if (Array.isArray(v)) return v; } catch (e) {} break; } }
    }
    // SALVAGE: array was truncated (model hit the token cap) or malformed → collect every COMPLETE
    // top-level {...} object from the array start; the incomplete final object is simply dropped.
    const objs = []; let d = 0, os = -1, inS = false, es = false;
    for (let i = start; i < s.length; i++) {
      const c = s[i];
      if (inS) { if (es) es = false; else if (c === '\\') es = true; else if (c === '"') inS = false; continue; }
      if (c === '"') { inS = true; continue; }
      if (c === '{') { if (d === 0) os = i; d++; }
      else if (c === '}') { if (d > 0 && --d === 0 && os >= 0) { try { objs.push(JSON.parse(s.slice(os, i + 1))); } catch (e) {} os = -1; } }
    }
    if (objs.length) return objs;
  }
  try { const m = s.match(/\{[\s\S]*\}/); if (m) { const o = JSON.parse(m[0]); const a = o.briefs || o.concepts || o.ads; if (Array.isArray(a)) return a; } } catch (e) {}
  return null;
}
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
  const secondary = pick(brain, ['secondary_color_hex'], '');
  const accent = pick(brain, ['accent_color_hex', 'secondary_color_hex'], brand);
  const light = lum(brand) > 0.55;
  const f = resolveFonts(pick(brain, ['brand_fonts'], ''));
  return {
    brand, accent, secondary: secondary || toHex(rgb(brand).map(v => v * (light ? 0.86 : 0.78))),
    brand2: toHex(rgb(brand).map(v => v * (light ? 0.86 : 0.78))),
    onbrand: light ? '#12142B' : '#FFFFFF', ink: '#12142B',
    lightBg: toHex(rgb(brand).map(v => v * 0.1 + 255 * 0.9)),
    sans: f.body, serif: f.head, fontImport: f.import,
  };
}
function baseCss(t) {
  return `${t.fontImport}
:root{ --brand:${t.brand}; --brand2:${t.brand2}; --secondary:${t.secondary}; --onbrand:${t.onbrand}; --accent:${t.accent};
  --ink:${t.ink}; --sub:#5A6377; --line:#E6EAF2; --light:${t.lightBg}; --paper:#FFFFFF; --green:#12A150; --red:#E5484D; --yellow:#F3E85C; }
*{margin:0;padding:0;box-sizing:border-box} html,body{background:#000}
.stage{width:1080px;height:1080px;position:relative;overflow:hidden;font-family:${t.sans};-webkit-font-smoothing:antialiased;color:var(--ink)}
.serif{font-family:${t.serif}}
img{display:block;max-width:100%}
.product{object-fit:contain;display:block}    /* the REAL product photo — never a drawn shape */
.logo{height:46px;width:auto;object-fit:contain;display:block}
.cta{display:inline-flex;align-items:center;gap:10px;font-weight:800;font-size:31px;padding:18px 34px;border-radius:999px;white-space:nowrap;background:var(--brand);color:var(--onbrand)}`;
}

const STANDARDS = `DESIGN STANDARDS — the authentic, hand-designed bar. This is what separates a real ad from AI slop:
CONCEPT: ONE concept, ONE hook, ONE hero visual, ONE CTA — it must read in under 2 seconds. Decide the single hook FIRST, then compose around it. Do not cram.
HIERARCHY: one dominant focal element (the headline OR the product); everything else clearly subordinate. Big beats small. Use strong scale contrast and confident, intentional whitespace — NEVER evenly-sized, evenly-spaced "form-filling".
TYPE SCALE (in the 1080x1080 frame; this is a phone-feed ad, so EVERY text element must read at a glance — timid small type is the #1 slop tell, always err LARGER): headline 84-120px, weight 800-900, tight leading (~1.0), the clear focal point, in the "serif" display face; subhead 38-48px, weight 600-700; body / benefit lines 30-38px, weight 500-700; the brand name / eyebrow / small labels 26-32px, bold, uppercase letter-spaced; CTA 30-36px bold in a generous pill. NOTHING below 24px except genuine fine-print legal disclaimers. If bold sizes force shorter copy, cut the copy, never shrink the type.
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

// ---- AD ANALYZER: forensic deconstruction of a chosen template so we rebuild it faithfully -----
// Adapted from the MaxFusion Content Analyzer. The template DRIVES the format: whatever it is (UGC photo,
// screenshot, editorial comparison, product-hero, flat-lay), we transcribe its STRUCTURE exactly, then a
// rebuild step swaps in THIS brand's product, logo, colours and copy. Output leads with a machine-read
// ROUTING block so we can send photoreal templates to KIE and vector/typographic ones to the HTML lane.
const TEMPLATE_ANALYZER_PROMPT = `You are a forensic advertising transcriber. You are given ONE static ad that will be used as a TEMPLATE. Produce an exact, replicable record of its STRUCTURE and every visible element, so a designer can rebuild the SAME ad for a DIFFERENT brand — same layout, same concept device, same composition and reading order — swapping in the new brand's product, logo, colours and copy. You are a transcriber, not a critic: describe only what is observable, never praise, never judge whether it "works", never invent an element that is not there.

Output EXACTLY these three parts, nothing before PART 1 and nothing after PART 3.

PART 1 — ROUTING (one field per line, exact labels, machine-read):
FORMAT: <ugc-photo | studio-photo | lifestyle-photo | screenshot-ui | 3d-render | illustration | vector-flat | infographic | collage | meme | mixed>
RENDER: <photoreal | vector>   (photoreal = a photograph / CGI / UGC / phone-screenshot that must be image-generated; vector = flat / illustration / typographic / infographic that can be built in HTML+CSS)
ASPECT: <1:1 | 4:5 | 9:16 | 16:9>
HAS_PRODUCT: <yes | no>
HAS_HUMAN: <yes | no>

PART 2 — ELEMENT LOG:
One entry per distinct element (each copy block, product, human subject, badge / logo, CTA, UI chrome, background layer), moving top-to-bottom then left-to-right. For each element, in this field order on one line:
REGION: <position + approximate footprint, rule-of-thirds language> | TYPE: <headline | subhead | body | legal | CTA | price | product | human | icon | badge | logo | graphic shape | background | photo-cutout | illustration | chart | UI-element> | CONTENT: <if text: the words VERBATIM in quotes, exact casing, line breaks, emoji; if visual: what it is, colour, material, angle, lighting direction, what sits behind it> | STYLE: <if text: font category (serif|sans|slab|display|script|mono), weight, case, size relative to the canvas, colour, alignment, any treatment (outline, shadow, highlight box, gradient); if visual: rendering style> | HIERARCHY: <1 = grabs the eye first | 2 | 3> | ROLE: <headline | claim | CTA | price | brand mark | proof | decorative | context | background>
Quote every piece of text verbatim, including small print. Do not skip or merge elements.

PART 3 — REBUILD SPEC:
LAYOUT: the skeleton in 2-4 sentences — the zones in order and where each sits, so the rebuilt ad is instantly recognisable as this template.
CONCEPT DEVICE: the single mechanism (e.g. before/after split, red-X vs green-check comparison, checklist, product-hero on a colour field, UGC person holding the product, native iMessage thread, big-number stat card, flat-lay arrangement, handwritten note).
SWAP MAP: PRODUCT ZONE -> <where/how the new brand's product goes, or NONE>; LOGO ZONE -> <where the brand mark sits>; HEADLINE ZONE -> <where, and what kind of line belongs here>; SUBHEAD ZONE -> <where, or NONE>; CTA ZONE -> <where, button shape>; PROOF ZONE -> <where, or NONE>.
PALETTE ROLES: which colours are structural (backgrounds, panels, bars) vs accent, so they map onto the new brand's palette.
KEEP: the structural elements that MUST be preserved to keep this template's identity.
DROP: the old brand's specific product, logo, wordmark, names, numbers and claims (they belong to a different brand and must never leak into the rebuild).

Plain text only, no markdown, no bold. Forbidden vibe words: clean, modern, premium, sleek, elegant, stunning, bold, vibrant, eye-catching, minimal — state the choice, not the impression.`;

async function analyzeTemplate(url) {
  if (!visionSafe(url)) return null;
  try {
    const content = [
      { type: 'text', text: TEMPLATE_ANALYZER_PROMPT },
      { type: 'text', text: 'THE TEMPLATE AD TO TRANSCRIBE:' },
      { type: 'image_url', image_url: { url } },
    ];
    const spec = String(await chat(MODEL_VISION, [{ role: 'user', content }], 2800) || '').trim();
    if (!spec || spec.length < 80) return null;
    const render = (spec.match(/RENDER:\s*(photoreal|vector)/i) || [])[1] || '';
    const format = (spec.match(/FORMAT:\s*([^\n|]+)/i) || [])[1] || '';
    const aspect = (spec.match(/ASPECT:\s*([0-9]+:[0-9]+)/i) || [])[1] || '';
    const hasHuman = /HAS_HUMAN:\s*yes/i.test(spec);
    const hasProduct = /HAS_PRODUCT:\s*yes/i.test(spec);
    // photoreal if the model said so, or the format is clearly a photo/render/screenshot
    const photoreal = /photoreal/i.test(render) || /photo|ugc|render|cgi|screenshot|lifestyle/i.test(format);
    return { spec, format: format.trim(), aspect, hasHuman, hasProduct, photoreal };
  } catch (e) { return null; }
}

// TEMPLATE-FITTED COPY: the hand-picked template has no Director concept, and its own words belong to
// another brand. Write THIS brand's headline/subhead/CTA/proof to sit in the template's zones (the copy
// the photoreal KIE rebuild renders). One tight call; grounded only in the brand brain (no fabrication).
async function templateBrief(spec, brain, assets) {
  const name = assets.name || pick(brain, ['brand_name', 'client_name'], 'the brand');
  const view = {
    brand: name, offer: pick(brain, ['key_offer']), tone: pick(brain, ['brand_tone']),
    benefits: String(pick(brain, ['product_benefits']) || '').slice(0, 500),
    pains: String(pick(brain, ['core_pain_points']) || '').slice(0, 300),
    audience: String(pick(brain, ['target_personas']) || '').slice(0, 300),
    product: (assets.productNames || []).filter(Boolean).join(', ') || pick(brain, ['key_offer']),
  };
  const sys = `You are a senior direct-response copywriter. Given a TEMPLATE deconstruction and a brand, write the copy that fills the template's zones for THIS brand — matching the template's concept device and tone, in the brand's real voice. Rules: headline max ~10 words, one idea, thumb-legible; use the brand's real benefits/pains/offer; NEVER invent a statistic, price, rating, review count, award or press badge (leave proof "" unless a real one is in the brand data); no em-dashes or hyphens in copy. Output ONLY compact JSON: {"headline":"","subhead":"","cta":"","proof":"","angle":""}.`;
  const user = `TEMPLATE DECONSTRUCTION:\n${String(spec).slice(0, 4000)}\n\nBRAND:\n${JSON.stringify(view)}\n\nWrite the copy for this template, for this brand. JSON only.`;
  const b = jsonOf(await chat(MODEL_BUILD, [{ role: 'system', content: sys }, { role: 'user', content: user }], 700)) || {};
  return { headline: b.headline || '', subhead: b.subhead || '', cta: b.cta || 'Learn more', proof: b.proof || '', angle: b.angle || 'template-faithful', big_idea: b.angle || '' };
}

// ---- reconstruct: LOOK at the template + the real assets, write grounded HTML --------------
async function reconstruct(templateUrl, brain, assets, lastIssues, brief, spec) {
  const { logoDark, logoLight, name, productImages, productNames, references } = assets;
  const hasProd = !!(productImages && productImages.length);
  const material = [
    `Offer: ${pick(brain, ['key_offer'])}`,
    `Voice: ${pick(brain, ['brand_tone'], 'clear, direct')}`,
    pick(brain, ['product_benefits']) ? `Proof / benefits: ${String(pick(brain, ['product_benefits'])).slice(0, 400)}` : '',
    pick(brain, ['target_personas']) ? `Audience: ${String(pick(brain, ['target_personas'])).slice(0, 300)}` : '',
    pick(brain, ['core_pain_points']) ? `Pain points: ${String(pick(brain, ['core_pain_points'])).slice(0, 300)}` : '',
  ].filter(Boolean).join('\n');

  let txt;
  if (brief) {
    // CONCEPT-DRIVEN: the Creative Director already decided the angle + device; EXECUTE it (fast, no re-inventing).
    txt =
      `Build a polished, scroll-stopping 1080x1080 ad for "${name}" that EXECUTES the decided creative concept below. This is NOT a template fill: the concept and its visual device ARE the ad. Make the headline the single dominant hero and the visual device its amplifier (device roughly a third to a half of the frame, under or beside the headline).\n\n` +
      `BRAND: ${name}.\n${material}\n\n` +
      `DECIDED CONCEPT (execute precisely; do NOT invent a different angle or device):\n` +
      `  Angle: ${brief.angle}\n  Big idea: ${brief.big_idea}\n` +
      `  HEADLINE (the hero, HUGE; render this text, breaking a new line where you see " / "): ${brief.headline}\n` +
      `  Subhead: ${brief.subhead || ''}\n  CTA pill label: ${brief.cta || ''}\n` +
      (brief.proof ? `  AUTHORIZED PROOF you MAY show, verbatim, and the ONLY figure/claim allowed anywhere: ${brief.proof}\n`
                   : `  Proof: NONE authorized. Do NOT show any number, stat, rating, review count, award, or named person.\n`) +
      `  Palette: ${brief.palette || 'brand'} (light = bright --light/--paper ground, --ink text; dark = --ink or dark --accent ground, --light text; brand = --brand ground). Give the .cta the brand's OWN colour, not a default green unless green is the brand.\n\n` +
      deviceGuide(brief);
  } else {
    // TEMPLATE-FAITHFUL: client hand-picked this template — rebuild it exactly. When the ad ANALYZER has
    // deconstructed it, its forensic spec is the authority on the layout/zones/device (more precise than
    // eyeballing the attached image).
    txt =
      `Recreate the TEMPLATE as a polished 1080x1080 ad for "${name}". FOLLOW THE TEMPLATE'S LAYOUT FAITHFULLY: the same concept device (e.g. checklist, VS/comparison, product-hero, before/after, handwritten note), the same zones in the same arrangement, the same reading order and visual rhythm. The finished ad must be immediately recognizable as THIS template, rebuilt for ${name}. Then swap ALL of the template's content for this brand: write this brand's real copy in every zone, use this brand's colours and fonts, and (when a real product photo is provided below) drop it in where the template places its product; if NO product is provided, replace any product zone with bold type instead of a hole. Depart from the template ONLY where needed to stay on-brand and to meet the quality standards below (readable type, nothing overlapping, product clear and recognizable).\n\n` +
      (spec ? `TEMPLATE DECONSTRUCTION (the forensic transcript of the template — rebuild to THIS structure, and DROP everything under its DROP list):\n${String(spec).slice(0, 4500)}\n\n` : '') +
      `BRAND: ${name}.\n${material}\n\n`;
  }

  if (hasProd) {
    txt += brief
      ? `REAL PRODUCT PHOTO(S) — background ALREADY REMOVED (transparent PNG). Place per the concept above (the build spec says if and where it sits): as the hero, or alongside the device. <img class="product">, EXACT URL, NEVER redraw, no white box behind it:\n`
      : `REAL PRODUCT PHOTO(S) — the HERO of the ad, with the background ALREADY REMOVED (transparent PNG). Place the most fitting one LARGE (roughly 40-55% of the frame) with <img class="product"> directly on the ad background — it composites cleanly on ANY colour, so NO panel, card or white box behind it. Give it a generous area; it is the subject. Use the EXACT URL(s); NEVER redraw:\n`;
    txt += productImages.map((u, k) => `  PRODUCT_URL_${k + 1} (${productNames[k] || 'product'}): ${u}`).join('\n') + `\n\n`;
  } else if (brief) {
    txt += `No product photo — this is a type-and-device ad. Do NOT draw or invent a product; the headline and the visual device carry it.\n\n`;
  } else {
    txt += `THIS BRAND HAS NO PRODUCT PHOTO. Do NOT draw, invent, or reproduce any product, device, phone, card, car, person, or lifestyle scene that may appear in the reference — use the reference ONLY for its energy, colour-blocking and type hierarchy. Build a BOLD, TYPE-LED ad: a GIANT headline as the hero (fill roughly 55-70% of the frame, weight 800-900, tight leading), one short supporting proof or benefit line, and the brand mark. Big confident type IS the design; leave no product-shaped hole.\n\n`;
  }
  if (logoDark && logoLight) txt += `REAL LOGO — two variants provided; place the ONE that CONTRASTS with the background where the mark sits, as <img class="logo"> with the EXACT URL. Never a dark logo on a dark area or a white logo on a light one:\n  DARK logo (use on LIGHT / neon / cream backgrounds): ${logoDark}\n  WHITE logo (use on DARK backgrounds): ${logoLight}\n\n`;
  else if (logoDark) txt += `REAL LOGO — place with <img src="${logoDark}" class="logo"> where the brand mark sits, on a background it CONTRASTS with. Use this EXACT URL.\n\n`;
  else txt += `No logo asset — use a plain TEXT wordmark "${name}" in the brand font (never invent a logo graphic).\n\n`;

  txt += (brief
      ? `Execute the concept as a POLISHED, ENTERPRISE-GRADE ad a senior designer would ship to a paying client: ONE dominant headline, the device richly designed as the amplifier, generous spacing, a single clear reading order. This must look intentionally art-directed, never like a wireframe or a template with placeholder shapes.\n` +
        `HARD, non-negotiable: nothing overlaps; no element leaves the 1080x1080 frame; NO text is wider than its container (size big display words and numbers to FIT within the margins, shrink or wrap before they spill); every phrase appears ONCE (never repeat the headline or a word in two places); the device is visibly built and clean. If something would not fit, make it smaller, do not let it clip.\n\n`
      : `First decide the SINGLE hook (the one idea this ad lands), then compose around it. Write the headline, subhead, CTA and any support copy yourself from the offer and pains: specific, bold, on-brand.\n\n`) +
    `DESIGN SYSTEM: stage is <div class="stage" style="...">, 1080x1080. CSS vars: --brand --brand2 --secondary --onbrand --accent --ink --sub --line --light --paper --green --red --yellow. Body font is the brand sans; class "serif" for the display headline; class "product" for the product <img> (object-fit:contain, size it large); class "logo" for the logo <img>; .cta pill. Inline <svg> for the visual device inherits these vars.\n\n` +
    `BRAND FIDELITY, STRICT: colour the ad ONLY from these CSS vars, which ARE this brand's real palette: --brand (primary), --secondary, --accent, plus --ink/--sub/--line/--light/--paper neutrals, and --red = pain / --green = the way out. Do NOT invent or introduce ANY other colour (no random orange, purple, teal or off-brand accents). Type ONLY in the brand fonts (the "serif" display class for headlines, the brand sans for the rest); never a novelty or system font. This must look like THIS brand's own ad, on-brand, not a random-coloured template.\n\n` +
    `HARD SIZE FLOORS (this is a phone-feed ad; err LARGER): headline 84px+; subhead 38px+; body and support lines 30px+; brand name, eyebrow and labels 26px+ and bold; CTA 30px+. NOTHING under 24px except fine legal print. An automated check REJECTS timid text (subheads/body under 24px, labels under 20px), any overlap, and anything off the frame. Keep copy SHORT so it fits big. PUNCTUATION: NEVER use em-dashes, en-dashes or hyphens in the copy; use commas and periods only (write "grass fed colostrum, now a soda", not "grass-fed soda").\n\n` +
    `${STANDARDS}\n\n${RULES}\n` +
    (lastIssues ? `\nThe previous attempt FAILED the art-director QA — fix EXACTLY this, keep everything else:\n${lastIssues}\n` : '');

  const parts = [{ type: 'text', text: txt }];
  // NOTE: only RASTER images go to the vision model (SVG 400s the API); SVG assets are still placed
  // via their URL in the text above and render fine in the HTML. In CONCEPT-DRIVEN mode we do NOT send the
  // template image (the concept is the spec; showing the template only tempts the model to copy its product/scene).
  if (!brief && visionSafe(templateUrl)) parts.push({ type: 'text', text: 'TEMPLATE (copy this layout skeleton):' }, { type: 'image_url', image_url: { url: templateUrl } });
  (productImages || []).slice(0, 3).forEach((u, k) => { if (visionSafe(u)) parts.push({ type: 'text', text: `REAL PRODUCT PHOTO ${k + 1} (place this exact image, do not redraw):` }, { type: 'image_url', image_url: { url: u } }); });
  if (visionSafe(logoDark)) parts.push({ type: 'text', text: 'REAL LOGO — dark variant (for light backgrounds):' }, { type: 'image_url', image_url: { url: logoDark } });
  if (visionSafe(logoLight)) parts.push({ type: 'text', text: 'REAL LOGO — white variant (for dark backgrounds):' }, { type: 'image_url', image_url: { url: logoLight } });
  (references || []).slice(0, 2).forEach((u) => parts.push({ type: 'text', text: 'BRAND REFERENCE (style cue only — do NOT copy its product or text):' }, { type: 'image_url', image_url: { url: u } }));

  // With a decided brief this is EXECUTION, not ideation → use the FAST model, no thinking. Hand-picked
  // template rebuilds (no brief) keep the strong model + a little thinking for faithful reconstruction.
  const model = brief ? MODEL_BUILD_FAST : MODEL_BUILD;
  const think = brief ? BUILD_THINK : +(E.THINK_TOKENS || 1500);
  return stripFence(await chat(model, [{ role: 'user', content: parts }], 9000, think ? { max_tokens: think } : null));
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
    if (full.length >= 14 && full.length <= 160 && !/evaluated|\bFDA\b|diagnose|disease|statement|terms|conditions|disclaimer/i.test(full)) {
      const fs = parseFloat(getComputedStyle(o.el).fontSize) || 99;
      const minPx = full.length >= 28 ? 24 : 20; // sentences (subhead/body) 24px+, shorter labels/brand name 20px+
      if (fs < minPx) issues.push('TEXT-TOO-SMALL: "' + o.t + '" is ' + Math.round(fs) + 'px, too timid for a feed ad; make subheads/body 34px+, labels and brand name 26px+');
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
async function render(fullHtml, w = 1080, h = 1080) {
  const page = await (await getBrowser()).newPage();
  try {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 }); // 2x → crisp output (matches the stage aspect)
    await page.setContent(fullHtml, { waitUntil: 'networkidle0', timeout: 45000 });
    // make sure the external images (product photo, logo) are fully decoded before the screenshot
    await page.evaluate(() => Promise.all(Array.from(document.images).map(i => (i.complete ? Promise.resolve() : i.decode().catch(() => {}))))).catch(() => {});
    const issues = await page.evaluate(detectLayout).catch(() => []);
    const el = await page.$('.stage');
    const buf = await (el || page).screenshot({ type: 'png' });   // PNG Buffer @ 2160²
    return { buf, issues: Array.isArray(issues) ? issues : [] };
  } finally { await page.close().catch(() => {}); }
}

// Decide where (and WHETHER) to place the brand logo on a finished ad — a real art-director judgement, not
// a mechanical corner pick. A vision pass looks at the ad and returns a spot that does NOT cover the CTA,
// headline, product or a face; picks the contrasting variant; and can decline (place=false) when the ad
// already carries the brand or has no clean spot. Returns {place, position, variant} or null on failure.
async function chooseLogoPlacement(imageUrl, { haveDark, haveLight, brandName }) {
  const both = haveDark && haveLight;
  const variantOpts = both ? `"dark" or "light"` : (haveDark ? `"dark"` : `"light"`);
  const only = haveDark ? 'dark' : 'light', needsBg = haveDark ? 'light' : 'dark';
  const content = [
    { type: 'text', text: `You are a senior art director adding ONE small brand logo onto this finished ad for "${brandName}". Decide the single best spot. Return ONLY JSON {"place": true or false, "position": "top-left"|"top-right"|"bottom-left"|"bottom-right"|"top-center"|"bottom-center", "variant": ${variantOpts}, "reason": "short"}.
RULES:
1. Put the mark in a CLEAN, uncluttered area where a small logo looks intentional and balanced, like a real designer would.
2. It must NOT cover or touch the CTA button, the headline, any body text, the product, or a person's face. If a position would overlap any of those, do not choose it.
3. variant: choose "dark" for a LIGHT area, "light" for a DARK area, so the mark stays legible.
4. Set "place": false if the ad ALREADY shows the brand name or logo clearly as part of its design, OR if every candidate spot would cover something important. It is fine to skip.
${both ? '' : `5. IMPORTANT: the only logo variant available is ${only}, so you MUST choose a position whose background is ${needsBg} enough for a ${only} mark to read clearly. If no ${needsBg} clean area exists, set "place": false rather than placing it where it would not contrast.`}` },
    { type: 'text', text: 'THE AD (logo not yet added):' }, { type: 'image_url', image_url: { url: imageUrl } },
  ];
  const v = jsonOf(await chat(MODEL_VISION, [{ role: 'user', content }], 300));
  if (!v || typeof v.place === 'undefined') return null;
  const position = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'top-center', 'bottom-center'].includes(v.position) ? v.position : 'bottom-right';
  const variant = (v.variant === 'light' && haveLight) ? 'light' : (v.variant === 'dark' && haveDark) ? 'dark' : (haveDark ? 'dark' : 'light');
  return { place: v.place !== false, position, variant, reason: String(v.reason || '').slice(0, 80) };
}
// Composite the chosen logo variant onto the ad at an explicit position (a small mark, soft shadow for edge
// definition). Pure renderer — the WHERE/WHETHER decision is made by chooseLogoPlacement above.
async function compositeLogo(kieBuf, { logoUrl, position, variant, aw, ah }) {
  const bgData = 'data:image/png;base64,' + kieBuf.toString('base64');
  const mp = Math.round(aw * 0.045);
  const vert = /^bottom/.test(position) ? `bottom:${mp}px;` : `top:${mp}px;`;
  const horiz = /center/.test(position) ? `left:50%;transform:translateX(-50%);` : (/right/.test(position) ? `right:${mp}px;` : `left:${mp}px;`);
  // adaptive halo: a light logo gets a soft dark glow, a dark logo a soft light glow, so it reads even if
  // the chosen area's tone is closer than expected. Plus a base shadow for edge definition.
  const glow = variant === 'light' ? 'rgba(0,0,0,.5)' : 'rgba(255,255,255,.55)';
  const markCss = `position:absolute;${vert}${horiz}height:${Math.round(ah * 0.05)}px;width:auto;max-width:${Math.round(aw * 0.30)}px;object-fit:contain;filter:drop-shadow(0 0 3px ${glow}) drop-shadow(0 1px 2px rgba(0,0,0,.3))`;
  const html = `<!doctype html><html><head><meta charset="utf8"><style>*{margin:0;padding:0;box-sizing:border-box}html,body{background:#000}.stage{width:${aw}px;height:${ah}px;position:relative;overflow:hidden}#bg{width:${aw}px;height:${ah}px;object-fit:cover;display:block}.mark{${markCss}}</style></head><body><div class="stage"><img id="bg" src="${bgData}"><img class="mark" src="${logoUrl}"></div></body></html>`;
  const page = await (await getBrowser()).newPage();
  try {
    await page.setViewport({ width: aw, height: ah, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 45000 });
    await page.evaluate(() => Promise.all(Array.from(document.images).map(i => (i.complete ? Promise.resolve() : i.decode().catch(() => {}))))).catch(() => {});
    const el = await page.$('.stage');
    return await (el || page).screenshot({ type: 'png' });
  } finally { await page.close().catch(() => {}); }
}

// ---- QA the render against the template (strict, hand-designed bar) ------------------------
async function qa(templateUrl, renderedUrl, brain, flags, productNames, brief) {
  const name = pick(brain, ['brand_name', 'client_name'], 'the brand');
  const subject = (Array.isArray(productNames) && productNames.length) ? productNames.filter(Boolean).join(', ') : '';
  const req = [];
  if (flags && flags.hasProduct) req.push(`the REAL product photo must be present and integrated cleanly (never a small thumbnail in a clashing white box, never drawn/CSS-built/fabricated, never stretched/clipped)`);
  if (flags && flags.hasLogo) req.push(`the real logo image must be present and legible (correct contrast variant); score 5 or below if it is missing, distorted, or low-contrast against its background`);
  const noProduct = !(flags && flags.hasProduct);
  // Three judging modes: (1) CONCEPT-DRIVEN (a Director brief) — judge whether the decided angle + visual device
  // actually LANDED, never template fidelity. (2) no-product template — judge as a standalone type-led piece.
  // (3) product template — judge faithful rebuild of the reference. Only mode 3 shows QA the reference image.
  const concept = brief
    ? `This ad executes a DECIDED creative concept: "${brief.big_idea}" (angle: ${brief.angle}; intended visual device: ${brief.device}). Judge whether the ad LANDS it: the headline must be the dominant hero, and ${brief.device === 'type-only' ? 'the drama must come from bold type and scale contrast (this concept is deliberately type-only, so do NOT demand an illustration)' : `the "${brief.device}" visual device must be visibly BUILT as a real labelled inline-SVG metaphor (a scale tipping, a wheel, a maze with a shortcut, a falling or rising line, a leak, a checklist resolving, a split, a giant number, a funnel to one, a shield, a stamp, or a guiding arrow), NOT a bare type-card and NOT a meaningless decoration`}. Score 6 or below if ${brief.device === 'type-only' ? 'the type is timid or there is no clear dominant idea' : 'the intended device is missing (a plain type-card), is unlabelled decoration, or the executed angle drifts from the brief'}, or for overlap, scatter, tiny type, off-brand colour/font, or a fabricated specific claim. Do NOT judge fidelity to any template. A bold ad that clearly lands the concept with a dominant headline scores 8 or 9.`
    : '';
  const fidelity = concept || (noProduct
    ? `This brand has NO product. Judge the ad ONLY on its own merits as a bold, TYPE-LED piece: (a) is the headline HUGE and clearly the dominant element? (b) is there ONE idea that reads in under 2 seconds? (c) is it on-brand (brand colour + brand font) and clean (no overlap, no scatter, no tiny text)? Do NOT compare it to any reference layout and NEVER say "template abandonment" — a strong type-led ad with no product is exactly right. A bold, clean, on-brand typographic ad scores 8 or 9; drop to 6 or below ONLY for genuinely timid/small type, clutter, overlap, off-brand colour/font, or a fabricated specific claim.`
    : `The ad should be a faithful REBUILD of the REFERENCE TEMPLATE below for this brand (same layout, concept device and zones, with the brand's own content); if it abandons the template's core layout/concept and invents an unrelated one, dock 2 points and say so. A BOLD, art-directed, on-brand ad that follows the template with a large integrated product and confident type scores 8-9.`);
  const content = [
    { type: 'text', text: `You are a TOUGH art director doing QA on this 1080x1080 ad for "${name}"${subject ? `, featuring the client's own chosen product: ${subject}` : ''}. Hold it to a hand-designed, scroll-stopping bar and REJECT AI slop. Return JSON {"score": <integer 1-10; 10=ship-ready hand-designed, 7=good with only minor nits, 6 or below=a designer would redo it>, "issues":[specific, ACTIONABLE fixes with sizes/percentages]}. ${subject ? 'IMPORTANT: the product shown IS the client\'s real, chosen product, so NEVER flag it as the wrong product, wrong category, or "not what this brand sells" even if the brand also sells other formats; judge craft only, not product choice. ' : ''}${req.length ? 'REQUIRED: ' + req.join('; ') + '. ' : ''}Score 6 or below for ANY of: TIMID or too-small type (headline not clearly dominant, or body copy under ~26px that reads small/weak); text that OVERLAPS, is SCATTERED, or has weak hierarchy; a cluttered "every zone filled" look instead of ONE clear concept that reads in 2 seconds; a product that is a small thumbnail or pasted in a clashing white box; a large dead area; generic filler copy ("get expert guidance", "find solutions") instead of specifics; an off-brand colour or a wrong / novelty font; a meaningless decorative object; a fabricated SPECIFIC claim (invented $ figure, statistic, award, press / "as featured in" logo, review count, or a real-looking full name with age/city). ALLOWED (do NOT penalise): soft illustrative ★★★★★ quotes with a first name + initial only; clean inline-SVG line icons; the brand colour as a bold fill. ${fidelity} Make issues concrete, e.g. "headline ~40px, take it to ~90px"; "product ~15% of frame, make it the hero at ~45%".` },
  ];
  if (!brief && !noProduct && visionSafe(templateUrl)) content.push({ type: 'text', text: 'REFERENCE TEMPLATE:' }, { type: 'image_url', image_url: { url: templateUrl } });
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
async function insertRow(imageUrl, brain, meta, aspect = '1:1') {
  const platform = meta.platform || (aspect === '9:16' ? 'Meta / TikTok - Vertical (9:16)' : 'Meta / TikTok - Square (1:1)');
  const ins = await fetch(SB_URL + '/rest/v1/static_ads', {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({
      brand_name: meta.brand, image_url: imageUrl, variant_index: 1, template_index: meta.i,
      platform, aspect_ratio: aspect,
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
async function produceOne(templateUrl, brief, brain, tok, assets, meta) {
  const base = baseCss(tok);
  let lastIssues = '';
  let best = { score: 0, url: null };
  const flags = { hasProduct: !!(assets.productImages && assets.productImages.length), hasLogo: !!assets.logoDark };
  for (let t = 1; t <= MAX_TRIES; t++) {
    try {
      let stage = await reconstruct(templateUrl, brain, assets, lastIssues, brief, meta.faithful && meta.faithful.spec);
      if (!/class=["']stage/.test(stage) || stage.length < 500) { lastIssues = 'Output was empty or a skeleton. Build the COMPLETE ad with real content in every zone.'; log(`  [${meta.i}] try ${t}: empty/skeleton, retrying`); continue; }
      stage = stage.replace(/\s*[—–]\s*/g, ', ').replace(/([A-Za-z0-9]) - ([A-Za-z0-9])/g, '$1, $2'); // strip em/en dashes and dash-hyphens from the copy (never ship them)
      const { buf, issues: layoutIssues } = await render(`<!doctype html><html><head><meta charset="utf8"><style>${base}</style></head><body>${stage}</body></html>`);
      // deterministic layout gate — never ship overlapping / clipped / off-frame / tiny text (vision QA misses these)
      if (layoutIssues.length) { lastIssues = 'LAYOUT ERRORS to fix (use normal flow/flex/grid in separate containers, keep everything inside the frame, make text big):\n' + layoutIssues.map(x => '- ' + x).join('\n'); log(`  [${meta.i}] try ${t}: ${layoutIssues.length} layout issue(s): ${layoutIssues[0].slice(0, 70)}`); continue; }
      // Upload each attempt so QA scores a real https image (the API rejects data: URLs).
      const url = await store(buf, `produced/${norm(meta.brand)}/${meta.runId}-${meta.i}-t${t}.png`);
      const v = await qa(templateUrl, url, brain, flags, assets.productNames, brief);
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

// ============================================================================================
// KIE AI LANE — photoreal PRODUCT ads. Claude's Creative Director decides the concept + copy;
// KIE (nano-banana-pro) generates the actual picture image-to-image from the REAL product photo,
// so the ad FEATURES the real product photoreal (what the HTML/vector lane structurally can't do).
// ============================================================================================
// Rough luminance of a logo's ink so it can sit on a CONTRASTING band (SVG: parse its fill/stroke
// colours; non-SVG: assume a dark logo). Returns true when the logo art is LIGHT-coloured.
async function logoLuma(url) {
  try {
    if (!url || !/\.svg(\?|$)/i.test(url)) return false;
    const r = await fetch(url); if (!r.ok) return false;
    const svg = await r.text();
    const named = { white: '#ffffff', black: '#000000' };
    const cols = (svg.match(/(?:fill|stroke)\s*[:=]\s*["']?\s*(#[0-9a-fA-F]{3,6}|white|black)/gi) || [])
      .map(m => (m.match(/#[0-9a-fA-F]{3,6}|white|black/i) || [])[0])
      .map(c => named[String(c).toLowerCase()] || c)
      .filter(c => /^#/.test(c));
    if (!cols.length) return false;
    return (cols.reduce((s, c) => s + lum(c), 0) / cols.length) > 0.6;
  } catch (e) { return false; }
}
// PRODUCT ANALYZER — a vision pass that tells the generator WHAT the product is, its real SIZE, and how
// to stage it, so KIE renders it at the correct scale in a fitting scene (not oversized or floating).
async function analyzeProduct(url, productName, brain) {
  if (!visionSafe(url)) return '';
  try {
    const txt = await chat(MODEL_VISION, [{ role: 'user', content: [
      { type: 'text', text: `Look at this product photo${productName ? ` (${productName})` : ''} for the brand ${pick(brain, ['brand_name'], '')}. In 2 to 3 tight factual sentences state: exactly WHAT it is (packaging type — box, jar, pouch, can, tub, or individually wrapped — and its real-world SIZE, e.g. a small single-serve wrapped snack, a retail carton, a supplement tub), its key label/visual features, and the most natural APPETIZING way to stage it in an ad (surface, props, setting) at true scale. This guides an image generator to render the product correctly, not oversized or floating.` },
      { type: 'image_url', image_url: { url } },
    ] }], 300);
    return String(txt || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  } catch (e) { return ''; }
}
// VISUAL STYLE ROTATION — the meeting's #1 note was "the outputs feel repetitive / like generic ads".
// Each ad in a batch is assigned a DIFFERENT art-direction from this list so a set looks varied, not
// stamped from one mould. The concept/device still leads; the style is the treatment wrapped around it.
const AD_STYLES = [
  'BOLD GRAPHIC POSTER — flat brand-colour blocking, oversized confident type as a design element, minimal props, punchy and modern.',
  'WARM NATURAL LIFESTYLE — the product in real use in a lived-in setting, soft window daylight, shallow depth of field, authentic and human.',
  'CLEAN MINIMAL STUDIO — seamless sweep backdrop, single hero product, one crisp realistic shadow, lots of calm negative space, premium and quiet.',
  'EDITORIAL MAGAZINE — sophisticated fashion-editorial layout, refined typography, generous white space, muted premium palette, understated luxury.',
  'HIGH-ENERGY DYNAMIC — bold diagonal composition, strong colour contrast, a sense of motion and momentum, energetic and loud.',
  'PREMIUM DARK MOOD — deep dark background, dramatic directional rim lighting, rich shadows, luxe and cinematic.',
  'AUTHENTIC UGC — candid, phone-shot realism, a real everyday hand/setting, unpolished and relatable, feels like a real customer post.',
  'PLAYFUL FLAT-LAY — crisp top-down arrangement on a colour-blocked surface, the product with tidy complementary props, cheerful and organised.',
  'BRIGHT AIRY PASTEL — soft diffused light on a pastel ground, fresh, clean and optimistic, lots of air.',
  'TECH-CLEAN GRADIENT — a crisp modern gradient backdrop, precise geometry and alignment, bright, sharp and contemporary.',
];
function composeKiePrompt(brief, brain, assets, platform, lastIssues, aspect, style) {
  const tall = aspect === '9:16';
  const name = assets.name || pick(brain, ['brand_name', 'client_name'], 'the brand');
  const t = tokens(brain);
  const prod = (assets.productNames && assets.productNames.filter(Boolean).join(', ')) || pick(brain, ['key_offer'], 'the product');
  const hl = String(brief && brief.headline || '').replace(/\s*\/\s*/g, ' ');
  const sub = String(brief && brief.subhead || '').trim();
  const cta = String(brief && brief.cta || 'Learn more').trim();
  const proof = brief && brief.proof ? String(brief.proof).trim() : '';
  const refNote = 'Reference image 1 is the REAL PRODUCT (the hero). Do NOT draw the brand name, a wordmark, or ANY logo anywhere (the real logo is composited afterward). Do NOT add a solid header/footer bar or band. Compose the ad edge to edge, but keep the four CORNERS relatively clean and uncluttered (no headline, key subject, or busy detail jammed into the extreme corners) so a small brand logo can be placed into one corner afterward.';
  const dev = (brief && brief.device && brief.device !== 'type-only' && DEVICES[brief.device]) ? DEVICES[brief.device] : null;
  const deviceHint = dev
    ? `VISUAL CONCEPT — build THIS metaphor into the scene PHOTOREALLY. This is the creative idea, so DRAMATIZE it; do NOT just place the product on a plain counter with a headline. The idea: ${dev.when} For THIS ad specifically: ${brief.device_note || ''}. Realise it with REAL objects and photography — an actual balance scale, a genuine before/after split composition, real coins or cash, a real funnel of many-into-one, a declining chart drawn on a surface, a checklist on paper, a "crossed out vs" comparison, etc. — integrated naturally with the product. EVERY ad must have a clear visual idea, never a plain product-on-a-shelf shot.`
    : `VISUAL: make the composition itself striking (bold type scale, dramatic lighting, strong colour blocking) so it is never a plain product-on-a-shelf shot.`;
  return [
    `A premium, scroll-stopping ${platform || 'Meta / Instagram'} PRODUCT ADVERTISEMENT for the brand "${name}", ${tall ? '9:16 VERTICAL / PORTRAIT (tall)' : '1:1 square'}, high-end commercial quality (think a top DTC brand's paid social ad).`,
    tall ? 'COMPOSE FOR THE TALL VERTICAL FRAME: use the full height with clear vertical rhythm — the headline in the upper third (below the top logo band), the product hero large in the middle, the CTA in the lower third. Keep ALL text well inside the frame with generous side margins; nothing may touch or be cut off by any edge. Do NOT stretch or crop the composition into a square.' : '',
    `${refNote} Reproduce the product from the reference EXACTLY, its real packaging, label text, shape and colours, do NOT redesign or relabel it. Make the product the clear HERO: large, sharp, beautifully lit product photography with a soft realistic shadow, integrated into the scene (never a floating cut-out sticker).`,
    assets.productBrief ? `PRODUCT FACTS (render it true to this, correct packaging and REAL scale, staged in a fitting scene, do NOT oversize, shrink, or float it): ${assets.productBrief}` : '',
    `CONCEPT (the single idea this ad lands): ${brief ? brief.big_idea : prod}. Angle: ${brief ? brief.angle : 'benefit-led'}.`,
    style ? `ART DIRECTION for THIS ad (make it visually DISTINCT from other ads in the set — different background, lighting and composition): ${style}` : '',
    deviceHint,
    `CREATIVE OPTIONS (use when they fit the concept): MAKE THE INVISIBLE VISIBLE — if the idea is a feeling or a hidden problem/benefit (a stain, trapped gunk in seams, heat damage, mess, freshness, low energy), SHOW that feeling or problem as a real photoreal visual instead of only stating it. ATYPICAL TEXT — you may place the headline in an unexpected but relevant real-world spot (written on a surface, in steam or condensation, on a tag) when it suits the product. The ad must be a scroll-stopping visual idea, never a plain product-on-a-counter shot. Design the VISUAL HIERARCHY so the eye lands on the hook first (biggest, highest-contrast element).`,
    `ON-IMAGE TEXT, rendered crisply and spelled EXACTLY, with clear hierarchy and generous spacing (no other text anywhere):`,
    `  - HEADLINE (large, dominant, top or side): "${hl}". Use THIS exact wording as the headline; do NOT copy the product's own package label or tagline (e.g. "Liver Support Protocol", "Beyond Collagen") as the headline.`,
    sub ? `  - SUBHEAD (smaller, supporting): "${sub}".` : '',
    `  - CTA BUTTON (a rounded pill): "${cta}".`,
    proof ? `  - One small proof line, verbatim, do not alter the number: "${proof}".` : '',
    `BRAND STYLE: brand palette ${t.brand}${pick(brain, ['secondary_color_hex']) ? ' + ' + pick(brain, ['secondary_color_hex']) : ''} + accent ${t.accent}; clean modern layout; strong contrast; the composition fills the frame with intentional negative space; nothing cut off by the edges.`,
    `HARD NEGATIVES: no misspelled, garbled or gibberish text; no lorem ipsus; no extra or invented logos, no watermark; do NOT invent any statistic, price, star rating, review count or "as seen in" press badge that is not given above; no duplicate products; no clutter; no busy background competing with the product.`,
    lastIssues ? `FIX these problems from the last attempt: ${lastIssues}` : '',
  ].filter(Boolean).join('\n');
}
// KIE prompt for a FAITHFUL template rebuild (photoreal templates): recreate the analyzed template's
// layout + concept + composition, but rebuilt for THIS brand — swap in the real product, this brand's
// copy (from templateBrief) and palette; the real logo is composited afterward onto the reserved band.
function composeKieFaithful(spec, brief, brain, assets, platform, lastIssues, aspect) {
  const tall = aspect === '9:16';
  const name = assets.name || pick(brain, ['brand_name', 'client_name'], 'the brand');
  const t = tokens(brain);
  const hl = String(brief && brief.headline || '').replace(/\s*\/\s*/g, ' ');
  const sub = String(brief && brief.subhead || '').trim();
  const cta = String(brief && brief.cta || 'Learn more').trim();
  const proof = brief && brief.proof ? String(brief.proof).trim() : '';
  const hasProd = !!(assets.productImagesRaw && assets.productImagesRaw.length) || !!(assets.productImages && assets.productImages.length);
  const refNote = hasProd
    ? 'Reference image 1 is THIS brand\'s REAL PRODUCT (the hero). Reproduce it EXACTLY — real packaging, label text, shape and colours; do NOT redesign or relabel it. Do NOT draw the brand name, a wordmark, or ANY logo anywhere.'
    : 'Do NOT draw the brand name, a wordmark, or ANY logo anywhere.';
  const band = 'Do NOT add a solid header/footer bar or band. Compose the ad edge to edge per the template, but keep the four CORNERS relatively clean and uncluttered (no critical text or busy detail jammed into the extreme corners) so a small brand logo can be placed into one corner afterward.';
  return [
    `Recreate the AD described below (a proven TEMPLATE) as a ${tall ? '9:16 vertical / portrait' : '1:1 square'} ${platform || 'Meta / Instagram'} advertisement for the brand "${name}", high-end commercial quality. Rebuild the SAME layout, the SAME concept device, the SAME composition and reading order as the template — but entirely for THIS brand.`,
    `TEMPLATE TO REBUILD (follow this structure faithfully; this is the ad's skeleton and concept):\n${String(spec).slice(0, 5000)}`,
    refNote,
    band,
    assets.productBrief ? `PRODUCT FACTS (render the product true to this, correct packaging + real scale): ${assets.productBrief}` : '',
    `SWAP EVERYTHING TO THIS BRAND: place ${hasProd ? "the real product (reference image 1)" : 'no product (this brand has none, keep the template\'s product zone as bold type or scene, do NOT invent a product)'} exactly where the template stages its product; write THIS brand's copy into each text zone; use this brand's palette (${t.brand}${pick(brain, ['secondary_color_hex']) ? ' + ' + pick(brain, ['secondary_color_hex']) : ''} + accent ${t.accent}). DROP the template's original product, logo, wordmark, names, numbers and claims completely — none may leak in.`,
    `ON-IMAGE TEXT, rendered crisply and spelled EXACTLY, in the template's text zones (no other text anywhere):`,
    `  - HEADLINE (where the template's headline sits): "${hl}".`,
    sub ? `  - SUBHEAD (where the template's subhead sits): "${sub}".` : '',
    `  - CTA BUTTON (a rounded pill, where the template's CTA sits): "${cta}".`,
    proof ? `  - One small proof line, verbatim, do not alter: "${proof}".` : '',
    `HARD NEGATIVES: no misspelled / garbled / gibberish text; no lorem; no extra or invented logos; no watermark; do NOT invent any statistic, price, star rating, review count or press badge not given above; no duplicate products; keep everything inside the frame with clean margins.`,
    lastIssues ? `FIX these problems from the last attempt: ${lastIssues}` : '',
  ].filter(Boolean).join('\n');
}

// QA a KIE-generated image: product fidelity + legible correct text + on-brand + no garble/fabrication.
// `faithful` = this is a template REBUILD (not a Director concept), so DON'T pin an exact headline string:
// the copy is adapted into the template's zones (a comparison splits it across columns, etc.) and demanding
// one literal headline false-fails good rebuilds. Judge garble / product fidelity / legibility / on-brand.
async function qaKie(renderedUrl, brain, brief, productNames, faithful) {
  const name = pick(brain, ['brand_name', 'client_name'], 'the brand');
  const subject = (Array.isArray(productNames) && productNames.length) ? productNames.filter(Boolean).join(', ') : 'the product';
  const wantHeadline = (!faithful && brief) ? String(brief.headline || '').replace(/\s*\/\s*/g, ' ') : '';
  const headlineRule = faithful
    ? `(3) all on-image text must be LEGIBLE and correctly spelled. Do NOT require any specific headline wording — the copy is adapted from a template, so whatever on-brand copy the ad shows is fine as long as it is spelled correctly and reads clearly.`
    : `(3) the headline${wantHeadline ? ` should read "${wantHeadline}"` : ''} must be legible and correctly spelled.`;
  const content = [
    { type: 'text', text: `You are a TOUGH art director doing QA on this AI-GENERATED 1:1 ${faithful ? 'ad (a proven template rebuilt for this brand)' : 'product ad'} for "${name}" (product: ${subject}). Return JSON {"score": <1-10 integer; 10=ship-ready paid-social ad, 7=good with minor nits, 6 or below=a designer would reject>, "issues":[specific fixes]}. This ad was image-generated, so CHECK HARD FOR: (1) GARBLED / MISSPELLED / gibberish in the GENERATED copy (headline, subhead, CTA, product label) — warped letters, nonsense words — score 4 or below if present. The BRAND LOGO in a corner is the REAL brand logo composited in, so NEVER treat its lettering, stylization, or an intentionally reversed / unusual letter as a misspelling (it is correct by definition); judge only the generated copy. (2) the product shown must be the real ${subject}, clean and undistorted (not warped, duplicated, or a floating sticker)${faithful ? ' — unless the template genuinely has no product zone' : ', and the HERO'}; ${headlineRule} (4) on-brand, professional, uncluttered, nothing cut off by the frame; (5) NO fabricated stats / prices / star ratings / press logos that were not intended. A clean, photoreal, correctly-spelled, on-brand ad scores 8-9. Be strict about garbled generated text (automatic fail), but do NOT invent a headline-mismatch complaint when the text is spelled correctly.` },
    { type: 'text', text: 'THE AD:' }, { type: 'image_url', image_url: { url: renderedUrl } },
  ];
  const v = jsonOf(await chat(MODEL_VISION, [{ role: 'user', content }], 800)) || {};
  return { score: typeof v.score === 'number' ? v.score : 0, issues: Array.isArray(v.issues) ? v.issues : ['QA unparseable'] };
}
async function produceOneKie(brief, brain, tok, assets, meta) {
  let lastIssues = '';
  let best = { score: 0, url: null };
  // KIE references = the REAL PRODUCT photo(s) only, raster-only (KIE rejects SVG). The logo is NOT sent to
  // KIE; we composite the real brand mark on top afterward (Chrome renders SVG + raster crisply, and KIE
  // would only redraw a logo as garbled text anyway).
  const refs = (assets.productImagesRaw || assets.productImages || []).filter(u => u && visionSafe(u)).slice(0, 6);
  const aspect = /9:16|story|reel|vertical/i.test(meta.platform || '') ? '9:16' : '1:1';
  const [aw, ah] = aspect === '9:16' ? [1080, 1920] : [1080, 1080];   // overlay dims must match the aspect or it crops
  const faithful = meta.faithful || null;                                                // {spec, brief} → rebuild THIS template
  const fbrief = faithful ? faithful.brief : brief;
  const style = AD_STYLES[((meta.i || 1) - 1 + AD_STYLES.length) % AD_STYLES.length];   // rotate a distinct art-direction per ad (concept mode only)
  for (let t = 1; t <= MAX_TRIES; t++) {
    try {
      const prompt = faithful
        ? composeKieFaithful(faithful.spec, fbrief, brain, assets, meta.platform, lastIssues, aspect)
        : composeKiePrompt(brief, brain, assets, meta.platform, lastIssues, aspect, style);
      const kieUrl = await kieGenerate({ prompt, imageUrls: refs, aspect }, log);
      // fetch the generated image once (needed both for the fallback and for logo placement analysis)
      let buf = null, kieBuf = null;
      try { const r = await fetch(kieUrl); if (r.ok) kieBuf = Buffer.from(await r.arrayBuffer()); } catch (e) {}
      if (!kieBuf) { lastIssues = 'generated image fetch failed'; log(`  [${meta.i}] KIE try ${t}: image fetch failed`); continue; }
      // Add the REAL brand logo as a SMALL contextual mark — a vision pass decides WHERE it looks good and
      // WHETHER to add one at all (skip if the ad already self-brands, never cover the CTA / headline / product).
      if (assets.logoDark || assets.logoLight) {
        try {
          const d = await chooseLogoPlacement(kieUrl, { haveDark: !!assets.logoDark, haveLight: !!assets.logoLight, brandName: assets.name || pick(brain, ['brand_name'], 'the brand') });
          if (d && !d.place) { log(`  [${meta.i}] logo: skipped (${d.reason || 'ad already carries the brand'})`); }
          else {
            const position = d ? d.position : 'bottom-right';
            const variant = d ? d.variant : (assets.logoDark ? 'dark' : 'light');
            const logoUrl = variant === 'light' ? (assets.logoLight || assets.logoDark) : (assets.logoDark || assets.logoLight);
            buf = await compositeLogo(kieBuf, { logoUrl, position, variant, aw, ah });
            log(`  [${meta.i}] logo: ${variant} @ ${position}${d && d.reason ? ' (' + d.reason + ')' : ''}`);
          }
        } catch (e) { log(`  [${meta.i}] logo placement failed: ${String(e.message || e).slice(0, 80)}`); }
      }
      if (!buf) buf = kieBuf;                                       // no logo, skipped, or placement failed → raw KIE image
      const url = await store(buf, `produced/${norm(meta.brand)}/${meta.runId}-${meta.i}-t${t}.png`);  // rehost (KIE URLs die in ~24h)
      const v = await qaKie(url, brain, fbrief, assets.productNames, !!faithful);
      log(`  [${meta.i}] KIE try ${t}: score ${v.score}${v.issues && v.issues.length ? ' — ' + v.issues.join('; ').slice(0, 110) : ''}`);
      if (v.score > best.score) best = { score: v.score, url };
      if (v.score >= SHIP_SCORE) break;
      lastIssues = (v.issues || []).map(x => '- ' + x).join('\n');
    } catch (e) { if (e && e.outOfCredits) throw e; lastIssues = String(e.message || e); log(`  [${meta.i}] KIE error try ${t}: ${lastIssues.slice(0, 140)}`); }
  }
  if (best.url && best.score >= SHIP_SCORE) {
    await insertRow(best.url, brain, meta, aspect);
    log(`  [${meta.i}] SHIP (score ${best.score}) → ${best.url}`);
    return { image_url: best.url, score: best.score };
  }
  log(`  [${meta.i}] DROPPED (best score ${best.score})`);
  return null;
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
// EXACT categories that carry on TYPE / concept alone — no product photo or lifestyle scene needed.
// Built from the real 972-row category list; deliberately EXCLUDES product/offer/comparison/lifestyle
// layouts ("Offer-First Banner", "Feature Benefit Pointout", "Us vs. Them", "Split Screen", "Flatlay",
// "Before & After", "Lifestyle", "Feature Framing") that only look right with a product in them — those
// are what caused a review site to draw a car / construction site / state-map and get dropped.
const NOPRODUCT_CATS = new Set([
  'headline', 'statistic', 'designed stat', 'big logo', 'big questions', 'make a claim!',
  'strong copy', 'listicles', 'listicle', 'iphone notes', 'pr callout', 'social proof',
  'testimonial', 'twitter/x', 'business/professional', 'outcome focused', 'tips & hacks',
  'media/news', 'infographic', 'minimalistic', 'simple layout', 'service business',
  'saas, b2b, service', 'process', 'education', 'static graphic',
]);
const isTypographic = (cat) => NOPRODUCT_CATS.has(String(cat || '').trim().toLowerCase());
async function selectTemplates(brain, count, hasProduct) {
  let idx = (await loadTemplates()).filter(r => !SEASONAL.test(r.category || ''));
  if (!hasProduct) idx = idx.filter(r => isTypographic(r.category)); // no product → text/concept templates only (no product-hero or scene layouts)
  // RANDOMIZE a varied mix (per Carl 2026-07-31): don't try to pick the "best" per brand — shuffle the whole
  // pool and diversify by category so each batch gets a fresh, varied spread of proven formats/concepts.
  const pool = idx.slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const perCat = Math.max(1, Math.ceil(count / 4)), catCount = {}, picks = [];
  for (const r of pool) { if (picks.length >= count) break; const c = r.category || 'x'; if ((catCount[c] || 0) >= perCat) continue; catCount[c] = (catCount[c] || 0) + 1; picks.push(r); }
  for (const r of pool) { if (picks.length >= count) break; if (!picks.includes(r)) picks.push(r); }
  return picks.slice(0, count).map(r => ({ image_url: r.image_url, category: r.category || '' }));
}

// ---- CREATIVE DIRECTOR: decide the concept (sharp angle + a visual device) for every ad ONCE ----
// This is where the heavy thinking happens, so each reconstruct downstream just EXECUTES a decided brief
// (fast) instead of improvising a concept (slow + generic). Generalises to every client via the brain.
function directorBrain(brain, assets) {
  const g = (k, n = 700) => { const v = pick(brain, [k]); return v ? String(v).slice(0, n) : ''; };
  return {
    brand_name: pick(brain, ['brand_name', 'client_name'], 'The Brand'),
    industry: g('industry', 260),
    key_offer: g('key_offer'),
    brand_tone: g('brand_tone'),
    brand_personality: g('brand_personality', 400),
    target_personas: g('target_personas'),
    core_pain_points: g('core_pain_points'),
    product_benefits: g('product_benefits'),
    winning_concepts: g('winning_concepts'),
    winning_hooks: g('winning_hooks', 400),
    losing_patterns: g('losing_patterns'),
    creative_boundaries: g('creative_boundaries', 400),
    dos_and_donts: g('dos_and_donts', 400),
    compliance_notes: g('compliance_notes', 300) || g('compliance_disclaimer', 300),
    // authorized proof = only claims/numbers that literally appear in these fields may be used verbatim
    authorized_proof: [g('product_benefits'), g('winning_hooks', 400), g('key_offer')].filter(Boolean).join('  ||  ').slice(0, 900),
    brand_colors: { primary: pick(brain, ['primary_color_hex']), secondary: pick(brain, ['secondary_color_hex']), accent: pick(brain, ['accent_color_hex']) },
    brand_fonts: g('brand_fonts', 200),
    has_product: !!(assets && assets.productImages && assets.productImages.length),
    product_names: (assets && assets.productNames) || [],
  };
}
async function creativeDirector(brain, templateCats, assets) {
  const n = templateCats.length;
  if (!n) return null;
  const view = directorBrain(brain, assets);
  const user = `BRAND_BRAIN:\n${JSON.stringify(view)}\n\nTEMPLATE_CATEGORIES (in order; brief i uses category i):\n${JSON.stringify(templateCats)}\n\nN = ${n}\n\nOutput ONLY the JSON array of exactly ${n} briefs.`;
  // Output budget must comfortably fit N briefs (each ~400 tok incl. a verbose device_note) PLUS the
  // thinking budget; generous floor so it never truncates (Sonnet output is cheap; max_tokens is a cap).
  const outBudget = DIRECTOR_THINK + Math.min(30000, Math.max(9000, n * 1100));
  const raw = await chat(MODEL_DIRECTOR,
    [{ role: 'system', content: DIRECTOR_PROMPT }, { role: 'user', content: user }],
    outBudget, DIRECTOR_THINK ? { max_tokens: DIRECTOR_THINK } : null);
  const arr = extractBriefs(raw);
  if (!Array.isArray(arr) || !arr.length) { const t = String(raw || '').replace(/\s+/g, ' '); log('  director: could not parse briefs; len=' + t.length + ' tail=…' + t.slice(-140)); return null; }
  return arr;
}
// Build the reconstruct guidance for a decided concept: the device's known-good SVG pattern + how to adapt it.
function deviceGuide(brief) {
  if (!brief || !brief.device) return '';
  const d = DEVICES[brief.device];
  if (!d) return '';
  if (brief.device === 'type-only' || !d) return `VISUAL: type-led, NO illustration. Make the type itself the drama, extreme scale contrast, a hard two tone split, tight leading. ${brief.device_note || ''}\n\n`;
  return `VISUAL CONCEPT: a "${brief.device}" — ${d.when}\n` +
    `DESIGN IT RICHLY and REALISTICALLY, the way a senior art director at a top agency would, a polished, DIMENSIONAL, enterprise-grade illustration built with clean HTML/CSS and inline <svg> (never an <img>). Use SVG gradients (<linearGradient>/<radialGradient>), soft drop shadows, subtle highlights, rounded volumetric forms and depth so it reads as a crafted 3D-style illustration, NOT a crude clip-art icon, flat wireframe, or childish shape. Think of the quality of a professionally designed Meta ad graphic (e.g. a real weighted scale with shaded weights and a metal beam, not two plain rectangles). Build this metaphor: ${brief.device_note || d.notes}\n` +
    `Colour it strictly from the ad's brand CSS vars (--red = the pain, --green = the way out, --brand/--secondary/--accent = the subject); no invented colours. Put it in its OWN container as the amplifier beneath the headline so it never overlaps other elements or spills past the frame. Do NOT repeat the headline wording inside the device.\n\n`;
}

// Scrape the brand's WEBSITE for a real product image (per Carl 2026-07-31: the form has a website URL,
// so when no product is picked, grab how the product actually looks from the site) to feed the KIE lane.
// BRAND SCAN — one fetch of the client's site returns everything we can lift off it:
//   the real product image(s), the brand colour palette, and the brand's fonts. Ricardo's ask:
//   ads should carry the client's actual typography + colours, not a generic default.
function _hex2rgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function _lum(h) { const [r, g, b] = _hex2rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
function _sat(h) { const [r, g, b] = _hex2rgb(h); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; }
// A real BRAND colour = a saturated colour OR a dark near-neutral ink (navy, charcoal). Reject white,
// near-white, pure black, and mid/light greys (UI chrome). Dark brand inks (e.g. #131D28) must survive.
function _brandColor(h) { const [r, g, b] = _hex2rgb(h); const l = _lum(h), s = _sat(h); if (l > 0.9) return false; if (r < 12 && g < 12 && b < 12) return false; if (s < 0.12 && l > 0.14) return false; return true; }
async function _fetchText(url, ms) {
  try { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms || 8000);
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CA-adbot/1.0)' }, redirect: 'follow', signal: c.signal });
    clearTimeout(t); if (!r.ok) return ''; return (await r.text()).slice(0, 1200000);
  } catch (e) { return ''; }
}
async function scanSite(url) {
  const out = { productImages: [], colors: [], fonts: [] };
  try {
    if (!url) return out;
    url = String(url).trim(); if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    const html = await _fetchText(url, 9000);
    if (!html) return out;
    const base = new URL(url);
    // --- PRODUCT IMAGES: og/twitter hero + product-ish <img> ---
    const cands = [];
    const bad = /logo|icon|favicon|sprite|placeholder|badge|payment|trustpilot|klarna|afterpay|avatar|flag/i;
    const push = (u) => { if (u && visionSafe(u) && !bad.test(u)) cands.push(u); };
    for (const m of html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["'][^>]+content=["']([^"']+)["']/gi)) push(m[1]);
    for (const m of html.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/gi)) push(m[1]);
    for (const m of html.matchAll(/<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi)) { if (/product|hero|cdn|shopify|main|feature|packshot/i.test(m[1])) push(m[1]); }
    out.productImages = [...new Set(cands.map(u => { try { return new URL(u, base).href; } catch (e) { return null; } }).filter(Boolean))].slice(0, 3);
    // --- pull the brand's OWN stylesheet(s): on Webflow/Shopify/React the palette + fonts live in CSS, not inline ---
    const vendor = /swiper|splide|slick|bootstrap|fontawesome|jsdelivr|unpkg|cdnjs|gstatic|recaptcha|cookie|klaviyo|hotjar|shopify\/assets\/theme-defaults/i;
    const sheets = [];
    for (const m of html.matchAll(/<link[^>]+stylesheet[^>]*>/gi)) { const h = (m[0].match(/href=["']([^"']+)["']/i) || [])[1]; if (h && !vendor.test(h)) { try { sheets.push(new URL(h, base).href); } catch (e) {} } }
    let css = '';
    for (const h of sheets.slice(0, 2)) css += '\n' + await _fetchText(h, 8000);
    const blob = html + '\n' + css;
    // --- COLOURS: theme-color meta wins; then most-frequent brand colour across html + brand css ---
    const tc = html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["'](#[0-9a-fA-F]{3,6})["']/i);
    const freq = {};
    for (const m of blob.matchAll(/#[0-9a-fA-F]{6}\b/g)) { const c = m[0].toLowerCase(); try { if (_brandColor(c)) freq[c] = (freq[c] || 0) + 1; } catch (e) {} }
    let palette = Object.entries(freq).sort((a, b) => b[1] - a[1]).map(x => x[0]);
    if (tc && _brandColor(tc[1].toLowerCase())) { const t = tc[1].toLowerCase(); palette = [t, ...palette.filter(c => c !== t)]; }   // ignore a white/neutral theme-color
    out.colors = palette.slice(0, 4);
    // --- FONTS: Google Fonts families, @font-face names, then font-family declarations (skip system stacks) ---
    const fonts = [];
    for (const m of blob.matchAll(/fonts\.googleapis\.com\/css2?\?([^"'>\s)]+)/gi)) { for (const f of m[1].matchAll(/family=([^:&]+)/gi)) fonts.push(decodeURIComponent(f[1].replace(/\+/g, ' ')).split(':')[0].trim()); }
    for (const m of blob.matchAll(/@font-face\s*\{[^}]*?font-family\s*:\s*["']?([A-Za-z][A-Za-z0-9 _-]+?)["']?\s*[;}]/gi)) fonts.push(m[1].trim());
    const sys = /^(inherit|initial|unset|sans-serif|serif|monospace|system-ui|-apple-system|blinkmacsystemfont|arial|helvetica|helvetica neue|segoe ui|roboto|ui-sans-serif|ui-serif|tahoma|verdana|georgia|times|times new roman|courier)$/i;
    const junkFont = /icon|glyph|webflow|fontawesome|^(heading|subheading|body|text|display|button|link|caption|label|nav|paragraph)$/i;
    for (const m of blob.matchAll(/font-family\s*:\s*["']?([A-Za-z][A-Za-z0-9 _-]+?)["']?\s*[;,}]/gi)) { const f = m[1].trim(); if (!sys.test(f)) fonts.push(f); }
    out.fonts = [...new Set(fonts)].filter(f => f.length > 2 && f.length < 28 && !junkFont.test(f)).slice(0, 3);
    return out;
  } catch (e) { return out; }
}
async function scrapeProductImages(url) { return (await scanSite(url)).productImages; }
// heuristic: a service / review / finance brand has no physical product to scrape or feature.
const NO_PRODUCT_INDUSTRY = /\breview\b|debt|lending|\bloan\b|insurance|mortgage|\blegal\b|attorney|lawyer|consult|\bagency\b|\bfinanc|\bbank/i;
// the brand's real product cutouts from the products table (same data the form picker uses); prefer clean
// packshots over lifestyle/hero/model shots for a faithful KIE reference.
async function fetchProducts(brandName) {
  try {
    const r = await fetch(SB_URL + '/rest/v1/products?select=product_name,product_image_url&brand_name=eq.' + encodeURIComponent(brandName) + '&limit=15', { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
    if (!r.ok) return { urls: [], names: [] };
    let rows = (await r.json()).filter(x => x && x.product_image_url && visionSafe(x.product_image_url));
    const lifestyle = (n) => /hero|lifestyle|campaign|model|banner/i.test(String(n || ''));
    rows.sort((a, b) => (lifestyle(a.product_name) ? 1 : 0) - (lifestyle(b.product_name) ? 1 : 0)); // packshots first
    return { urls: rows.map(x => x.product_image_url), names: rows.map(x => x.product_name) };
  } catch (e) { return { urls: [], names: [] }; }
}

// ---- produce a whole batch from a form submission -----------------------------------------
async function produceBatch(body) {
  const brand = String(body.client_name || body.clientName || body.brand_name || body.brand || '').trim();
  // hand-picked templates arrive as URL strings → normalise to {image_url, category:''} (no category ⇒ template-faithful).
  let templates = asArray(body.selected_template_urls || body.template_urls || body.selected_templates).map(u => ({ image_url: u, category: '' }));
  let autoPicked = false;
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
  const name = pick(brain, ['brand_name', 'client_name'], brand || 'The Brand');
  const productBrand = !NO_PRODUCT_INDUSTRY.test(pick(brain, ['industry'], ''));

  // BRAND SCAN — one fetch of the client's site lifts the real product image(s), colour palette and
  // fonts (Ricardo's ask). The dossier wins when it already carries them; the scan fills the gaps so a
  // brand with a thin/empty brain still renders in its true colours + typography instead of a default.
  const site = String(body.website || body.url || pick(brain, ['website']) || '').trim();
  let scan = { productImages: [], colors: [], fonts: [] };
  if (site) {
    scan = await scanSite(site);
    if (!pick(brain, ['primary_color_hex']) && scan.colors[0]) {
      brain.primary_color_hex = scan.colors[0];
      if (scan.colors[1]) brain.secondary_color_hex = scan.colors[1];
      if (scan.colors[2]) brain.accent_color_hex = scan.colors[2];
    }
    if (!pick(brain, ['brand_fonts']) && scan.fonts.length) brain.brand_fonts = scan.fonts.join(', ');
    if (scan.colors.length || scan.fonts.length) log(`  brand scan (${site}): colours ${scan.colors.join(' ') || '—'} · fonts ${scan.fonts.join(', ') || '—'}`);
  }
  const tok = tokens(brain);   // now reflects the scanned palette + fonts

  // RESOLVE THE PRODUCT (before template selection so hasProduct is right), for a product-type brand only:
  //   form-selected → brand-brain packshot → products library (real cutouts) → website scan (last resort).
  if (!productImages.length) productImages = asArray(brain.product_image).slice(0, 1);
  if (!productImages.length && productBrand) {
    const pt = await fetchProducts(name);
    if (pt.urls.length) { productImages = pt.urls.slice(0, 1); if (!productNames.length) productNames = pt.names.slice(0, 1); log(`  loaded product "${pt.names[0]}" from the library → photoreal lane`); }
  }
  if (!productImages.length && productBrand && scan.productImages.length) {
    productImages = scan.productImages.slice(0, 1); if (!productNames.length) productNames = [name + ' product'];
    log(`  scanned product image from ${site} → photoreal lane`);
  }
  if (!productImages.length && productBrand) log(`  no product found in library or on the site — proceeding without a product`);

  // AUTO-SELECT a randomized varied mix of templates when the client didn't hand-pick any
  if (!templates.length) {
    const n = Math.max(1, Math.min(50, +(body.static_ads_count || body.count) || 5));
    const hasProduct = productImages.length > 0 || asArray(brain.product_image).length > 0;
    try { templates = await selectTemplates(brain, n, hasProduct); autoPicked = templates.length > 0; log(`  auto-picked ${templates.length} ${hasProduct ? 'product' : 'typographic'} templates for industry "${pick(brain, ['industry'], '?')}"`); }
    catch (e) { log('  auto-pick failed: ' + String(e.message || e).slice(0, 80)); }
  }
  log(`RUN ${runId} — "${brand}" — ${templates.length} templates, ${productImages.length} product image(s)`);

  const productImagesRaw = productImages.slice();   // ORIGINAL packshots (with bg) — the KIE lane wants these
  // knock the background out of each product packshot so it composites cleanly (no white box) — HTML lane
  productImages = (await Promise.all(productImages.map(cutoutProduct))).filter(Boolean);
  const logos = asArray(brain.logo_urls);
  const logoDark = logos[0] || null;   // dark mark → for LIGHT backgrounds
  const logoLight = logos[1] || null;  // white mark → for DARK backgrounds
  const assets = { logoDark, logoLight, name, productImages, productImagesRaw, productNames, references };
  if (!logoDark) log(`  NOTE: no logo in brand_brain.logo_urls for "${name}" — using a text wordmark. Add the real logo with set-logo.js to get the brand mark.`);
  if (!productImages.length) log(`  NOTE: no product image (form or brand_brain) — ads will be typographic with no product shown.`);

  // AD ANALYZER — for HAND-PICKED templates, forensically deconstruct each so the rebuild is faithful AND
  // the template DRIVES the lane+format: photoreal / UGC templates → KIE photoreal rebuild, vector / editorial
  // → HTML rebuild. (Auto-picked batches use the Creative Director concept path instead — see below.)
  const handPicked = !autoPicked && templates.length > 0;
  const tplAnalysis = {};
  if (handPicked) {
    const uniq = [...new Set(templates.map(t => t.image_url))].filter(visionSafe);
    const got = await Promise.all(uniq.map(u => analyzeTemplate(u)));
    uniq.forEach((u, k) => { if (got[k]) tplAnalysis[u] = got[k]; });
    const nPhoto = Object.values(tplAnalysis).filter(a => a.photoreal).length;
    log(`  ad analyzer: ${Object.keys(tplAnalysis).length}/${uniq.length} template(s) deconstructed — ${nPhoto} photoreal → KIE, ${Object.keys(tplAnalysis).length - nPhoto} vector → HTML`);
  }
  const anyPhotoTemplate = kieEnabled() && Object.values(tplAnalysis).some(a => a.photoreal);

  // RENDER LANE: photoreal KIE (nano-banana-pro) for PRODUCT brands when a KIE key is set — Claude's
  // concept + the real product photo → a real product ad. Else the HTML/vector lane. Force with FORCE_KIE=1.
  const useKie = kieEnabled() && (productImagesRaw.length > 0 || String(E.FORCE_KIE || '') === '1');
  if (useKie || anyPhotoTemplate) {   // prep KIE assets for the concept lane OR faithful photoreal templates
    if (useKie) log(`  render lane: KIE (nano-banana-pro) — photoreal product ads`);
    if (productImagesRaw[0]) {
      assets.productBrief = await analyzeProduct(productImagesRaw[0], productNames[0], brain);   // understand the product once
      if (assets.productBrief) log('  product analyzer: ' + assets.productBrief.slice(0, 100));
    }
    const lg = assets.logoDark || assets.logoLight;   // pick a logo band that CONTRASTS with the logo's ink
    if (lg) {
      assets.logoForBand = lg;
      const lightLogo = await logoLuma(lg);
      const cols = [pick(brain, ['primary_color_hex']), pick(brain, ['secondary_color_hex']), pick(brain, ['accent_color_hex'])].filter(Boolean);
      assets.logoBand = lightLogo
        ? (cols.filter(c => lum(c) < 0.35).sort((a, b) => lum(a) - lum(b))[0] || '#141414')   // light logo → darkest brand colour
        : (cols.filter(c => lum(c) > 0.72).sort((a, b) => lum(b) - lum(a))[0] || '#FFFFFF');   // dark logo → lightest brand colour
      log(`  logo band: ${assets.logoBand} (${lightLogo ? 'light' : 'dark'} logo)`);
    }
  }

  // TEMPLATE-FITTED COPY for the photoreal templates: the hand-picked template has no Director concept and
  // its own words belong to another brand, so write THIS brand's copy to fill its zones (KIE renders it).
  if (anyPhotoTemplate) {
    await Promise.all(Object.keys(tplAnalysis).filter(u => tplAnalysis[u].photoreal).map(async (u) => {
      try { tplAnalysis[u].brief = await templateBrief(tplAnalysis[u].spec, brain, assets); }
      catch (e) { log('  templateBrief failed: ' + String(e.message || e).slice(0, 80)); }
    }));
  }

  // CREATIVE DIRECTOR: decide the concept (a sharp angle + a visual device) for every ad ONCE, up front.
  // This is the heavy thinking, done a single time; each reconstruct below just EXECUTES its brief (fast +
  // on-concept). Only for auto-picked batches — a hand-picked template is rebuilt faithfully (no brief).
  let briefs = null;
  if (autoPicked && templates.length) {
    const cats = templates.map(t => t.category || '');
    try {
      briefs = await creativeDirector(brain, cats, assets);
      if (briefs && briefs.length) {
        while (briefs.length < templates.length) briefs.push(null);  // pad short outputs → those ads go template-faithful
        log(`  creative director: ${briefs.filter(Boolean).length}/${templates.length} concepts — ${briefs.slice(0, templates.length).map(b => b ? `${b.angle || '?'}/${b.device || '?'}` : 'faithful').join(', ')}`);
      } else { log(`  creative director returned nothing; proceeding template-faithful`); briefs = null; }
    } catch (e) { log('  creative director failed: ' + String(e.message || e).slice(0, 120) + ' — proceeding template-faithful'); briefs = null; }
  }

  // FILL-TO-EXACT-COUNT pool: this is a SaaS — deliver the NUMBER requested. Keep producing (regenerating
  // dropped ones with cycled concepts) until N ship, or an attempt cap is hit, or KIE runs out of credits.
  const N = templates.length;
  const realBriefs = briefs ? briefs.filter(Boolean) : null;   // never hand a null concept to an ad → cycle real ones
  const results = [];
  let jobs = 0, outOfCredits = false, doomed = false;
  const cap = Math.min(N * 3 + 3, 90);       // total-attempt cap so a genuinely-failing brand can't loop forever
  const earlyCap = N + Math.ceil(N / 2);     // if NOTHING has shipped after ~1.5x attempts, the batch is doomed → fail fast
  async function worker() {
    while (results.length < N && jobs < cap && !outOfCredits && !doomed) {
      const i = jobs++;
      const meta = { brand: name, i: i + 1, runId, platform };
      const brief = (realBriefs && realBriefs.length) ? realBriefs[i % realBriefs.length] : null;
      const tpl = templates[i % templates.length];
      try {
        let r;
        if (brief) {
          // AUTO-PICKED concept path (Creative Director decides the angle + device).
          r = useKie
            ? await produceOneKie(brief, brain, tok, assets, meta)
            : await produceOne(tpl.image_url, brief, brain, tok, assets, meta);
        } else {
          // HAND-PICKED faithful path — the analyzed template drives the lane + format.
          const a = tplAnalysis[tpl.image_url] || null;
          r = (a && a.photoreal && kieEnabled())
            ? await produceOneKie(null, brain, tok, assets, { ...meta, faithful: { spec: a.spec, brief: a.brief } })
            : await produceOne(tpl.image_url, null, brain, tok, assets, { ...meta, faithful: { spec: a && a.spec } });
        }
        if (r && results.length < N) results.push(r);
      } catch (e) {
        if (e && e.outOfCredits) { outOfCredits = true; log('  KIE OUT OF CREDITS — stopping this run; top up at kie.ai and re-run.'); }
        else log(`  [${meta.i}] job error: ${String(e.message || e).slice(0, 100)}`);
      }
      if (!results.length && jobs >= earlyCap && !doomed) { doomed = true; log(`  FAIL-FAST: 0 shipped after ${jobs} attempts — stopping (likely no product sent for a product brand, or a data issue). Not grinding to the cap.`); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, N || 1) }, worker));
  const ads = results.slice(0, N);
  if (ads.length < N) log(`  WARNING: only ${ads.length}/${N} shipped${outOfCredits ? ' — KIE out of credits' : doomed ? ` — batch stopped early after ${jobs} attempts (0 shipping)` : ` after ${jobs} attempts (slots could not clear QA)`}`);
  log(`RUN ${runId} DONE — ${ads.length}/${N} shipped`);
  return { runId, brand: name, requested: N, shipped: ads.length, ads };
}

module.exports = { produceBatch, produceOne, fetchBrand, tokens, baseCss, resolveFonts, scanSite };
