// ===========================================================================================
// Static Ads Service — the agent pipeline that produces concept-first, template-faithful ads
// and pushes them to the Supabase library. This is the reliable, headless version of the work
// we proved by hand: look at each template, rebuild it as grounded HTML, render, QA, retry,
// keep only the passers.  Runs in plain Node 18+ (global fetch).  Keys come from .env.
// ===========================================================================================
'use strict';

const E = process.env;
const OR_KEY       = E.OPENROUTER_API_KEY;
const HCTI_USER    = E.HCTI_USER_ID;
const HCTI_KEY     = E.HCTI_API_KEY;
const SB_URL       = (E.SUPABASE_URL || 'https://xakngjsybyytldyqfsmi.supabase.co').replace(/\/$/, '');
const SB_KEY       = E.SUPABASE_SERVICE_KEY;
const BUCKET       = E.BUCKET || 'static-ads';
const MODEL_BUILD  = E.MODEL_BUILD  || 'anthropic/claude-opus-4.8';   // reconstruct — needs a strong model
const MODEL_VISION = E.MODEL_VISION || 'anthropic/claude-sonnet-4.5'; // QA (judgment; cheaper is fine)
const THINK        = E.THINK || 'high';                              // extended-thinking effort for reconstruct
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

// ---- brand → design tokens (auto-contrast, brand fonts) -----------------------------------
const rgb = (h) => { const n = parseInt(String(h).replace('#', '').slice(0, 6) || '2E6BFF', 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const toHex = (a) => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const lum = (h) => { const [r, g, b] = rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

function tokens(brain) {
  const brand = pick(brain, ['primary_color_hex'], '#2E6BFF');
  const accent = pick(brain, ['accent_color_hex', 'secondary_color_hex'], brand);
  const light = lum(brand) > 0.55;
  const font = pick(brain, ['brand_fonts'], '').split(/[.,/(]/)[0].trim();
  const fams = ['Manrope:wght@400;600;700;800', 'Playfair+Display:wght@600;700;800'];
  if (font && !/manrope|playfair/i.test(font)) fams.unshift(font.replace(/\s+/g, '+') + ':wght@400;600;700;800');
  return {
    brand, accent, brand2: toHex(rgb(brand).map(v => v * (light ? 0.86 : 0.78))),
    onbrand: light ? '#12142B' : '#FFFFFF', ink: '#12142B',
    lightBg: toHex(rgb(brand).map(v => v * 0.1 + 255 * 0.9)),
    sans: `'${font || 'Manrope'}','Manrope',system-ui,sans-serif`,
    fontImport: `@import url('https://fonts.googleapis.com/css2?${fams.map(f => 'family=' + f).join('&')}&display=swap');`,
  };
}
function baseCss(t) {
  return `${t.fontImport}
:root{ --brand:${t.brand}; --brand2:${t.brand2}; --onbrand:${t.onbrand}; --accent:${t.accent};
  --ink:${t.ink}; --sub:#5A6377; --line:#E6EAF2; --light:${t.lightBg}; --paper:#FFFFFF; --green:#12A150; --red:#E5484D; --yellow:#F3E85C; }
*{margin:0;padding:0;box-sizing:border-box} html,body{background:#000}
.stage{width:1080px;height:1080px;position:relative;overflow:hidden;font-family:${t.sans};-webkit-font-smoothing:antialiased;color:var(--ink)}
.serif{font-family:'Playfair Display',Georgia,serif}
.cta{display:inline-flex;align-items:center;gap:10px;font-weight:800;font-size:23px;padding:15px 30px;border-radius:999px;white-space:nowrap;background:var(--brand);color:var(--onbrand)}`;
}

const RULES = `HARD RULES — this is a RECONSTRUCTION, not a reuse:
1. THE TEMPLATE IS ONLY A LAYOUT. Its original words are placeholders — DISCARD them. Write EVERY word from THIS brand's real offer. A template's category must NEVER leak in.
2. Reconstruct the template's SKELETON faithfully (same zones, concept device, reading order, proportions); all copy new and grounded.
3. FILL EVERY ZONE WITH SPECIFIC COPY (comparison rows, checklist items, toggle labels, stat callouts, review quotes) from the brand's offer/benefits/pain points. NEVER blank, NEVER vague filler ("get expert guidance", "find solutions").
4. NOTHING OVERLAPS; everything INSIDE the 1080x1080 frame with margins; nothing touches an edge.
5. FILL THE FRAME — no large empty/dead zones. A half-empty ad is a FAIL.
6. EVERY VISUAL ELEMENT MEANS SOMETHING for this brand. No random decorative objects (floating coin, gem, pill, unrelated icon).
7. BRAND COLOURS ONLY (var(--brand)/--accent/--ink/--paper/--light + semantic green/red). No off-brand colour. Strong contrast.
8. BRAND FONTS ONLY (default sans + "serif" class for headlines). No monospace/novelty font.
9. NO FABRICATED SPECIFICS: no invented $ amounts, stats, awards, review counts, or "As Featured In" press logos. Review cards may use soft ★★★★★ quotes with a first name + initial, clearly illustrative.
10. Crisp HTML only; typographic wordmark; no <img>/emoji/external assets; clean inline-SVG icons. Output ONLY the <div class="stage" ...>...</div>.`;

// ---- reconstruct: LOOK at the template image, write grounded HTML --------------------------
async function reconstruct(templateUrl, brain, wordmark, lastIssues) {
  const material = [
    `Offer: ${pick(brain, ['key_offer'])}`,
    `Voice: ${pick(brain, ['brand_tone'], 'clear, direct')}`,
    pick(brain, ['product_benefits']) ? `Proof / benefits: ${String(pick(brain, ['product_benefits'])).slice(0, 400)}` : '',
    pick(brain, ['target_personas']) ? `Audience: ${String(pick(brain, ['target_personas'])).slice(0, 300)}` : '',
    pick(brain, ['core_pain_points']) ? `Pain points: ${String(pick(brain, ['core_pain_points'])).slice(0, 300)}` : '',
  ].filter(Boolean).join('\n');
  const name = pick(brain, ['brand_name', 'client_name'], 'The Brand');
  const content = [{ type: 'text', text:
    `Rebuild the ATTACHED ad template faithfully for "${name}", as HTML. LOOK at the image: copy its exact skeleton — every zone, the concept device, reading order, proportions — then fill EVERY zone with copy grounded in this brand. Match the quality of a hand-designed ad: specific copy, a composition that fills the frame, on-brand colours and fonts, nothing generic.\n\n` +
    `BRAND: ${name}.\n${material}\n\n` +
    `Write the headline, subhead and CTA yourself from the offer/pains, plus concrete copy for every other zone (comparison rows, checklist, toggles, stat callouts, review quotes) — never blank, never vague.\n\n` +
    `WORDMARK to place where the template's brand mark sits (paste verbatim): ${wordmark}\n\n` +
    `DESIGN SYSTEM: stage is <div class="stage" style="...">, 1080x1080. CSS vars: --brand --brand2 --onbrand --accent --ink --sub --line --light --paper --green --red --yellow. Default font is the brand sans; class "serif" for headlines; .cta pill.\n\n` +
    `AVOID THESE COMMON FAILURES: if the template shows a phone/device, FILL its screen completely with real content (a ranked list, a UI) — never leave a device screen empty. Illustrative review quotes use ONLY a first name + initial (e.g. "Sarah M.") — no age, no city, no dollar figure. Keep every element inside the frame with clear padding; icons never overlap text. Output the COMPLETE ad, not a skeleton.\n\n${RULES}\n` +
    (lastIssues ? `\nThe previous attempt FAILED QA — fix exactly this:\n${lastIssues}\n` : '') }];
  if (templateUrl) content.push({ type: 'image_url', image_url: { url: templateUrl } });
  // Big output budget so the HTML isn't starved by the thinking budget (thinking is separate).
  return stripFence(await chat(MODEL_BUILD, [{ role: 'user', content }], 16000, { max_tokens: +(E.THINK_TOKENS || 6000) }));
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
    await page.setContent(fullHtml, { waitUntil: 'networkidle0', timeout: 30000 });
    const el = await page.$('.stage');
    return await (el || page).screenshot({ type: 'png' });   // PNG Buffer @ 1080² (small enough for QA)
  } finally { await page.close().catch(() => {}); }
}

// ---- QA the render against the template (strict, hand-designed bar) ------------------------
async function qa(templateUrl, renderedUrl, brain) {
  const name = pick(brain, ['brand_name', 'client_name'], 'the brand');
  const content = [
    { type: 'text', text: `QA this rendered ad for "${name}" (offer: ${pick(brain, ['key_offer'])}). Judge it as a paying client would. Return JSON {"score": <integer 1-10; 10=ship-ready and hand-designed, 7=good with only minor nits, 6 or below=a designer would redo it>, "issues":["..."]}. Score 6 or below for ANY of: content clipped by an edge / overflowing / cut off; garbled or illegibly low-contrast text; a card/badge/wordmark/CTA overlaps other copy; a large empty / dead area or an empty device screen; generic filler copy ("get expert guidance", "find solutions") instead of specifics about this brand; an off-brand colour or a monospace / novelty font; a random decorative object that means nothing for the brand; a fabricated SPECIFIC claim (an invented dollar figure, statistic, award, press / "as featured in" logo, review count, or a real-looking full name with age/city); or copy that names a category that is NOT this brand's. ALLOWED — do NOT penalise these: soft illustrative ★★★★★ review quotes with a first name + initial only; a clean icon or monogram avatar (this design uses NO photos on purpose — never require a real photo); the brand colour used as a bold fill. Score honestly — a clean, on-brand, frame-filling ad with specific copy should score 7-9.` },
  ];
  if (templateUrl) content.push({ type: 'text', text: 'REFERENCE TEMPLATE:' }, { type: 'image_url', image_url: { url: templateUrl } });
  content.push({ type: 'text', text: 'RENDERED AD:' }, { type: 'image_url', image_url: { url: renderedUrl } });
  const v = jsonOf(await chat(MODEL_VISION, [{ role: 'user', content }], 800)) || {};
  return { score: typeof v.score === 'number' ? v.score : 0, issues: Array.isArray(v.issues) ? v.issues : ['QA unparseable'] };
}

// ---- own the asset: pull the render, store in Supabase, insert the library row -------------
// upload a PNG buffer to Supabase Storage, return its public https URL
async function store(buf, path) {
  const up = await fetch(SB_URL + '/storage/v1/object/' + BUCKET + '/' + path, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'image/png', 'x-upsert': 'true' },
    body: buf,
  });
  if (!up.ok) throw new Error('upload ' + up.status + ' ' + (await up.text()).slice(0, 160));
  return SB_URL + '/storage/v1/object/public/' + BUCKET + '/' + path;
}
// insert the library row for a passed ad (image already stored)
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
async function produceOne(templateUrl, brain, tok, wordmark, meta) {
  const base = baseCss(tok);
  let lastIssues = '';
  let best = { score: 0, url: null };
  for (let t = 1; t <= MAX_TRIES; t++) {
    try {
      const stage = await reconstruct(templateUrl, brain, wordmark, lastIssues);
      if (!/class=["']stage/.test(stage) || stage.length < 500) { lastIssues = 'Output was empty or a skeleton — build the COMPLETE ad with real content in every zone.'; log(`  [${meta.i}] try ${t}: empty/skeleton, retrying`); continue; }
      const buf = await render(`<!doctype html><html><head><meta charset="utf8"><style>${base}</style></head><body>${stage}</body></html>`);
      // Upload each attempt so QA scores a real https image (the API rejects data: URLs).
      const url = await store(buf, `produced/${norm(meta.brand)}/${meta.runId}-${meta.i}-t${t}.png`);
      const v = await qa(templateUrl, url, brain);
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
  const brand = String(body.client_name || '').trim();
  const templates = (Array.isArray(body.selected_template_urls) ? body.selected_template_urls : []).filter(Boolean);
  const runId = 'agent-' + Date.now();
  const platform = String(body.platforms || '').split(',')[0].trim();
  log(`RUN ${runId} — "${brand}" — ${templates.length} templates`);

  const brain = await fetchBrand(brand, body.sister_brand);
  if (!brain._found) log(`  WARNING: no Brand Brain row for "${brand}" — copy will be thin`);
  const tok = tokens(brain);
  const name = pick(brain, ['brand_name', 'client_name'], brand || 'The Brand');
  const logo = (Array.isArray(brain.logo_urls) ? brain.logo_urls.map(x => (x && x.url) || x).filter(Boolean) : [])[0];
  const wordmark = logo
    ? `<img src="${logo}" alt="${name}" style="height:52px;width:auto;display:block"/>`
    : `<span style="font-weight:800;font-size:30px;color:var(--ink)">${name}</span>`;

  // concurrency-limited pool
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < templates.length) {
      const i = idx++;
      const r = await produceOne(templates[i], brain, tok, wordmark, { brand: name, i: i + 1, runId, platform });
      if (r) results.push(r);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, templates.length || 1) }, worker));
  log(`RUN ${runId} DONE — ${results.length}/${templates.length} shipped`);
  return { runId, brand: name, requested: templates.length, shipped: results.length, ads: results };
}

module.exports = { produceBatch, produceOne, fetchBrand, tokens, baseCss };
