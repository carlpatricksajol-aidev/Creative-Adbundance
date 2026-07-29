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
function resolveFonts(brandFonts) {
  const names = String(brandFonts || '').split(/[,/;|+]|\band\b/).map(s => s.replace(/[()]/g, ' ').trim()).filter(Boolean).slice(0, 4);
  const resolved = names.map(resolveFont).filter(Boolean);
  const head = resolved.find(r => r.serif) || resolved[0];
  const body = resolved.find(r => !r.serif) || resolved[1] || resolved[0];
  const headFam = head ? head.family : 'Playfair Display';
  const bodyFam = body ? body.family : 'Manrope';
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

const RULES = `HARD RULES — this is a RECONSTRUCTION that PLACES THE BRAND'S REAL ASSETS:
1. THE TEMPLATE IS ONLY A LAYOUT. Its original words, product and logo are placeholders — DISCARD them. Every word is THIS brand's real offer; every product shown is THIS brand's REAL product photo (provided). A template's category or brand must NEVER leak in.
2. Reconstruct the template's SKELETON faithfully (same zones, concept device, reading order, proportions); all copy new and grounded.
3. THE PRODUCT: wherever the layout shows a product, package, bottle, can, jar, box or device, place the REAL product photo with <img src="EXACT_PRODUCT_URL" class="product" style="width:...;height:..."> and object-fit:contain. NEVER draw, illustrate, sketch or CSS-build a product; NEVER invent a bottle/can/package. If NO product image is provided, build a clean typographic/benefit ad with NO product shown — do not fabricate one.
4. THE LOGO: place the REAL logo with <img src="EXACT_LOGO_URL" class="logo"> where the brand mark sits. If no logo URL is provided, use a plain TEXT wordmark of the brand name — never invent a logo graphic.
5. IMAGES ARE WHITELISTED: the ONLY <img> allowed are the exact product photo URL(s) and the logo URL given below. No other <img>, no emoji, no stock/fabricated imagery, no icon fonts. Clean inline-SVG line icons (checks, arrows, shields) are fine.
6. FILL EVERY ZONE WITH SPECIFIC COPY (comparison rows, checklist items, toggle labels, stat callouts, review quotes) from the brand's offer/benefits/pains. NEVER blank, NEVER vague filler ("get expert guidance", "find solutions").
7. NOTHING OVERLAPS; everything inside the 1080x1080 frame with margins; nothing touches an edge; the product image sits cleanly with room around it (contain, not stretched, not clipped), on a background that suits it.
8. FILL THE FRAME — no large dead zones. BRAND COLOURS ONLY (--brand/--accent/--ink/--paper/--light + semantic green/red), strong contrast. BRAND FONTS ONLY (body sans + "serif" class for headlines); no monospace/novelty font.
9. NO FABRICATED SPECIFICS: no invented $ amounts, stats, awards, review counts, or press logos. Review cards may use soft ★★★★★ quotes with a first name + initial, clearly illustrative.
10. Crisp HTML only. Output ONLY the <div class="stage" ...>...</div>.`;

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
    `Rebuild the ATTACHED ad TEMPLATE faithfully for "${name}", as HTML — but replace its layout content with THIS brand's real copy and REAL assets. Copy the template's skeleton (every zone, the concept device, reading order, proportions), then: write specific grounded copy in every zone, DROP IN the real product photo where a product belongs, and place the real logo. Match the quality of a hand-designed ad.\n\n` +
    `BRAND: ${name}.\n${material}\n\n`;

  if (productImages && productImages.length) {
    txt += `REAL PRODUCT PHOTO(S) — place the most fitting one where the layout shows a product, with <img src="URL" class="product">. Use the EXACT URL(s); NEVER redraw:\n` +
      productImages.map((u, k) => `  PRODUCT_URL_${k + 1} (${productNames[k] || 'product'}): ${u}`).join('\n') + `\n\n`;
  } else {
    txt += `NO product photo provided — do NOT draw or invent a product. Build a clean typographic/benefit ad instead.\n\n`;
  }
  if (logoDark && logoLight) txt += `REAL LOGO — two variants provided; place the ONE that CONTRASTS with the background where the mark sits, as <img class="logo"> with the EXACT URL. Never a dark logo on a dark area or a white logo on a light one:\n  DARK logo (use on LIGHT / neon / cream backgrounds): ${logoDark}\n  WHITE logo (use on DARK backgrounds): ${logoLight}\n\n`;
  else if (logoDark) txt += `REAL LOGO — place with <img src="${logoDark}" class="logo"> where the brand mark sits, on a background it CONTRASTS with. Use this EXACT URL.\n\n`;
  else txt += `No logo asset — use a plain TEXT wordmark "${name}" in the brand font (never invent a logo graphic).\n\n`;

  txt += `Write the headline, subhead and CTA yourself from the offer/pains, plus concrete copy for every other zone (comparison rows, checklist, toggles, stat callouts, review quotes) — never blank, never vague.\n\n` +
    `DESIGN SYSTEM: stage is <div class="stage" style="...">, 1080x1080. CSS vars: --brand --brand2 --onbrand --accent --ink --sub --line --light --paper --green --red --yellow. Body font is the brand sans; class "serif" for headlines; class "product" for the product <img> (object-fit:contain); class "logo" for the logo <img>; .cta pill.\n\n` +
    `AVOID THESE FAILURES: never a drawn/fake product or invented bottle; the product <img> must sit cleanly with room around it (contain, not stretched or clipped); illustrative review quotes use ONLY a first name + initial (e.g. "Sarah M.") — no age, city or dollar figure; keep every element inside the frame with clear padding; icons never overlap text; output the COMPLETE ad, not a skeleton.\n\n${RULES}\n` +
    (lastIssues ? `\nThe previous attempt FAILED QA — fix exactly this:\n${lastIssues}\n` : '');

  const parts = [{ type: 'text', text: txt }];
  if (templateUrl) parts.push({ type: 'text', text: 'TEMPLATE (copy this layout skeleton):' }, { type: 'image_url', image_url: { url: templateUrl } });
  (productImages || []).slice(0, 3).forEach((u, k) => parts.push({ type: 'text', text: `REAL PRODUCT PHOTO ${k + 1} (place this exact image, do not redraw):` }, { type: 'image_url', image_url: { url: u } }));
  if (logoDark) parts.push({ type: 'text', text: 'REAL LOGO — dark variant (for light backgrounds):' }, { type: 'image_url', image_url: { url: logoDark } });
  if (logoLight) parts.push({ type: 'text', text: 'REAL LOGO — white variant (for dark backgrounds):' }, { type: 'image_url', image_url: { url: logoLight } });
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
async function render(fullHtml) {
  const page = await (await getBrowser()).newPage();
  try {
    await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 1 });
    await page.setContent(fullHtml, { waitUntil: 'networkidle0', timeout: 45000 });
    // make sure the external images (product photo, logo) are fully decoded before the screenshot
    await page.evaluate(() => Promise.all(Array.from(document.images).map(i => (i.complete ? Promise.resolve() : i.decode().catch(() => {}))))).catch(() => {});
    const el = await page.$('.stage');
    return await (el || page).screenshot({ type: 'png' });   // PNG Buffer @ 1080² (small enough for QA)
  } finally { await page.close().catch(() => {}); }
}

// ---- QA the render against the template (strict, hand-designed bar) ------------------------
async function qa(templateUrl, renderedUrl, brain, flags) {
  const name = pick(brain, ['brand_name', 'client_name'], 'the brand');
  const req = [];
  if (flags && flags.hasProduct) req.push(`the ad MUST show the brand's REAL PHOTOGRAPHIC product — score 4 or below if the product looks hand-drawn, illustrated, cartoonish, CSS-built, fabricated, a generic blank package, or stretched/squished/clipped, or if the product is missing entirely`);
  if (flags && flags.hasLogo) req.push(`the ad MUST show the real logo image (not a re-typed guess) and it MUST be legible — score 5 or below if the logo is invisible or low-contrast against its background (e.g. a dark logo on a dark area)`);
  const content = [
    { type: 'text', text: `QA this rendered ad for "${name}" (offer: ${pick(brain, ['key_offer'])}). Judge it as a paying client would. Return JSON {"score": <integer 1-10; 10=ship-ready and hand-designed, 7=good with only minor nits, 6 or below=a designer would redo it>, "issues":["..."]}. ${req.length ? 'REQUIRED: ' + req.join('; ') + '. ' : ''}Score 6 or below for ANY of: a drawn/fabricated product instead of the real photo; content clipped by an edge / overflowing / cut off; garbled or illegibly low-contrast text; a card/badge/wordmark/CTA overlaps other copy; a large empty / dead area; generic filler copy ("get expert guidance", "find solutions") instead of specifics; an off-brand colour or a monospace / novelty font; a random decorative object that means nothing for the brand; a fabricated SPECIFIC claim (an invented dollar figure, statistic, award, press / "as featured in" logo, review count, or a real-looking full name with age/city); or copy that names a category that is NOT this brand's. ALLOWED — do NOT penalise: soft illustrative ★★★★★ review quotes with a first name + initial only; clean inline-SVG line icons or a monogram avatar (this design uses NO stock photos on purpose); the brand colour used as a bold fill; the real product photo sitting on a matching background. Score honestly — a clean, on-brand, frame-filling ad that uses the real product photo + real logo with specific copy should score 7-9.` },
  ];
  if (templateUrl) content.push({ type: 'text', text: 'REFERENCE TEMPLATE:' }, { type: 'image_url', image_url: { url: templateUrl } });
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

// ---- produce ONE ad from ONE template (reconstruct → render → QA → retry) ------------------
async function produceOne(templateUrl, brain, tok, assets, meta) {
  const base = baseCss(tok);
  let lastIssues = '';
  let best = { score: 0, url: null };
  const flags = { hasProduct: !!(assets.productImages && assets.productImages.length), hasLogo: !!assets.logoDark };
  for (let t = 1; t <= MAX_TRIES; t++) {
    try {
      const stage = await reconstruct(templateUrl, brain, assets, lastIssues);
      if (!/class=["']stage/.test(stage) || stage.length < 500) { lastIssues = 'Output was empty or a skeleton — build the COMPLETE ad with real content in every zone.'; log(`  [${meta.i}] try ${t}: empty/skeleton, retrying`); continue; }
      const buf = await render(`<!doctype html><html><head><meta charset="utf8"><style>${base}</style></head><body>${stage}</body></html>`);
      // Upload each attempt so QA scores a real https image (the API rejects data: URLs).
      const url = await store(buf, `produced/${norm(meta.brand)}/${meta.runId}-${meta.i}-t${t}.png`);
      const v = await qa(templateUrl, url, brain, flags);
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

// ---- produce a whole batch from a form submission -----------------------------------------
async function produceBatch(body) {
  const brand = String(body.client_name || body.clientName || body.brand_name || body.brand || '').trim();
  const templates = asArray(body.selected_template_urls || body.template_urls || body.selected_templates);
  const runId = 'agent-' + Date.now();
  const platform = String(body.platforms || '').split(',')[0].trim();

  // the REAL product photos the client selected in the form (product_image_urls / products[])
  let productImages = asArray(body.product_image_urls);
  if (!productImages.length && Array.isArray(body.products)) productImages = asArray(body.products);
  if (!productImages.length) productImages = asArray(body.product_image_url);
  let productNames = asArray(body.product_names);
  if (!productNames.length && Array.isArray(body.products)) productNames = body.products.map(p => (p && (p.name || p.product_name)) || '').filter(Boolean);
  const references = asArray(body.reference_urls);

  log(`RUN ${runId} — "${brand}" — ${templates.length} templates, ${productImages.length} product image(s)`);

  const brain = await fetchBrand(brand, body.sister_brand);
  if (!brain._found) log(`  WARNING: no Brand Brain row for "${brand}" — copy will be thin`);
  const tok = tokens(brain);
  const name = pick(brain, ['brand_name', 'client_name'], brand || 'The Brand');

  // fall back to the brand-brain packshot / logo when the form didn't carry them
  if (!productImages.length) productImages = asArray(brain.product_image).slice(0, 1);
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
