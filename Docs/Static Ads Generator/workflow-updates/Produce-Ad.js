// ===========================================================================================
// PRODUCE AD  —  replaces: Build KIE AI Prompt + Create KIE AI Task + Wait + Poll + Extract URL
// n8n Code node,  Mode = "Run Once for All Items".
//
// Per ad it: (1) reads the chosen template's structure, (2) rebuilds it as HTML in the brand's
// colours/fonts/copy, (3) renders it to a crisp 1080x1080 PNG via htmlcsstoimage.com,
// (4) QA-checks the render, (5) retries on failure, (6) returns the hosted image URL.
//
// This is the concept-first, template-faithful render we proved by hand — made automatic.
// See AUTOMATION-UPGRADE.md and STANDUP-RUNBOOK.md.
// Repo is PUBLIC: paste real keys in the n8n node editor ONLY, never commit them here.
// ===========================================================================================

// ---- CONFIG (fill real values in the n8n node editor, not in the committed file) ----------
const OPENROUTER_API_KEY = '<OPENROUTER_API_KEY>';     // rotated key — reconstruct + QA (Claude)
const HCTI_USER_ID       = '<HCTI_USER_ID>';           // htmlcsstoimage.com user id
const HCTI_API_KEY       = '<HCTI_API_KEY>';           // htmlcsstoimage.com api key
const MODEL_BUILD        = 'anthropic/claude-sonnet-4';// rebuild HTML — strong model
const MODEL_VISION       = 'anthropic/claude-sonnet-4';// analyze template + QA
const MAX_TRIES          = 3;
// (Alt render provider: Browserless returns raw PNG bytes and is self-hostable — see runbook.)

// ---- helpers ------------------------------------------------------------------------------
const chat = (model, messages, max_tokens = 4000) => this.helpers.httpRequest({
  method: 'POST', url: 'https://openrouter.ai/api/v1/chat/completions',
  headers: { Authorization: 'Bearer ' + OPENROUTER_API_KEY, 'Content-Type': 'application/json' },
  body: { model, messages, max_tokens, temperature: 0.4 }, json: true,
});
const textOf = (r) => (r && r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content) || '';
const stripFence = (s) => String(s || '').replace(/^```(?:html|json)?/i, '').replace(/```$/, '').trim();
const jsonOf = (s) => { try { return JSON.parse(stripFence(s).match(/\{[\s\S]*\}/)[0]); } catch (e) { return null; } };

// render one full HTML doc -> hosted PNG url (htmlcsstoimage.com)
const render = (fullHtml) => this.helpers.httpRequest({
  method: 'POST', url: 'https://hcti.io/v1/image',
  headers: { Authorization: 'Basic ' + Buffer.from(HCTI_USER_ID + ':' + HCTI_API_KEY).toString('base64') },
  body: { html: fullHtml, selector: '.stage', viewport_width: 1080, viewport_height: 1080, device_scale: 2, ms_delay: 700 },
  json: true,
}).then(r => r && r.url);

// ---- design system + hard rules (same spirit as the proof harness) ------------------------
function baseCss(tok, fontImport) {
  return `
${fontImport}
:root{ --brand:${tok.brand}; --brand2:${tok.brand2}; --onbrand:${tok.onbrand}; --accent:${tok.accent};
  --ink:#12142B; --sub:#5A6377; --line:#E6EAF2; --light:${tok.light}; --paper:#FFFFFF; --green:#12A150; --red:#E5484D; --yellow:#F3E85C; }
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:#000}
.stage{width:1080px;height:1080px;position:relative;overflow:hidden;
  font-family:${tok.sans};-webkit-font-smoothing:antialiased;color:var(--ink)}
.serif{font-family:'Playfair Display',Georgia,serif}
.cta{display:inline-flex;align-items:center;gap:10px;font-weight:700;font-size:23px;
  padding:15px 28px;border-radius:999px;white-space:nowrap;background:var(--brand);color:var(--onbrand)}`;
}
const RULES = `HARD RULES — this is a RECONSTRUCTION, not a reuse:
1. THE TEMPLATE IS ONLY A LAYOUT. Its original words belong to a different product and are placeholders — DISCARD them. Write EVERY word of copy from THIS brand's real offer/brief. A template's category must NEVER leak in (e.g. a supplement template must never say "supplement" for a finance brand). If a provided copy line names the wrong category, REWRITE it — the template's words are never authoritative.
2. Reconstruct the template's SKELETON faithfully (same zones, concept device, reading order, rough proportions), but all copy is new and grounded.
3. FILL EVERY ZONE WITH SPECIFIC COPY. Comparison rows, checklist items, toggle labels, stat callouts, review quotes — each gets concrete copy drawn from the brand's offer / benefits / pain points. NEVER leave a zone blank and NEVER use vague filler ("get expert guidance", "find trusted solutions", "get relief"). Be specific to what this brand actually does.
4. NOTHING OVERLAPS. Badges, cards, the wordmark, the CTA each sit in their own space with margins — never on top of other copy. Everything sits INSIDE the 1080x1080 frame; nothing touches or crosses an edge.
5. FILL THE FRAME. No large empty bands or dead zones. If content does not fill the square, enlarge type/spacing or drop a zone and rebalance — a half-empty ad is a FAIL.
6. EVERY VISUAL ELEMENT MUST MEAN SOMETHING for this brand. No random decorative objects carried over from the template (a floating coin, gem, pill, capsule, unrelated icon). Replace the template's product/prop with a relevant brand element or remove it.
7. BRAND COLOURS ONLY — build on var(--brand)/--accent/--ink/--paper/--light plus semantic green/red. NEVER introduce an off-brand colour (no brown/amber gradient on a green brand). The brand colour may be LIGHT — never small --brand text on white; use it as a FILL behind dark text, or --onbrand on a --brand fill. Strong contrast everywhere.
8. BRAND FONTS ONLY — the default brand sans and the "serif" class for headlines. NEVER a monospace/typewriter, script, or novelty font.
9. NO FABRICATED SPECIFICS: never invent dollar amounts, statistics, named testimonials, awards, review counts, or "As Featured In" press logos (NBC/Forbes/etc.) unless they appear in the brief. Review cards may use soft ★★★★★ quotes with a first name + initial, kept clearly illustrative.
10. Crisp HTML only. Wordmark is typographic — no <img>, no external assets, no emoji; use clean inline-SVG icons. Output ONLY the <div class="stage" ...>...</div>.`;

// ---- brand context (once) -----------------------------------------------------------------
const pick = (o, keys, d = '') => { for (const k of keys) if (o && o[k] != null && String(o[k]).trim() !== '') return o[k]; return d; };
let brain = {}; try { brain = $('Search Brand Brain').first().json || {}; } catch (e) {}
const brandName = pick(brain, ['brand_name', 'client_name'], 'The Brand');
const brandHex = pick(brain, ['primary_color_hex'], '#2E6BFF');
const accentHex = pick(brain, ['accent_color_hex', 'secondary_color_hex'], brandHex);
const brandFont = pick(brain, ['brand_fonts'], '').split(/[.,/(]/)[0].trim();

const rgb = (h) => { const n = parseInt(String(h).replace('#', '').slice(0, 6) || '2E6BFF', 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const toHex = (a) => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const lum = (h) => { const [r, g, b] = rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const light = lum(brandHex) > 0.55;
const tok = {
  brand: brandHex, accent: accentHex, brand2: toHex(rgb(brandHex).map(v => v * (light ? 0.86 : 0.78))),
  onbrand: light ? '#12142B' : '#FFFFFF', light: toHex(rgb(brandHex).map(v => v * 0.1 + 255 * 0.9)),
  sans: `'${brandFont || 'Manrope'}','Manrope',system-ui,sans-serif`,
};
// import brand font (if any) + Manrope + Playfair from Google Fonts (the render browser is online)
const fams = ['Manrope:wght@400;600;700;800', 'Playfair+Display:wght@600;700;800'];
if (brandFont && !/manrope|playfair/i.test(brandFont)) fams.unshift(brandFont.replace(/\s+/g, '+') + ':wght@400;600;700;800');
const fontImport = `@import url('https://fonts.googleapis.com/css2?${fams.map(f => 'family=' + f).join('&')}&display=swap');`;
const BASE = baseCss(tok, fontImport);
const wordmark = `<span style="font-weight:800;font-size:30px;color:var(--ink)">${brandName}</span>`;

// ---- main loop ----------------------------------------------------------------------------
const items = $input.all();
const out = [];

for (let i = 0; i < items.length; i++) {
  const it = items[i].json || {};
  const templateUrl = pick(it, ['selected_template_url', 'template_url', 'image_url', 'template']);
  // Generate Ad Copy outputs generated_headline / generated_subline / generated_cta — read THOSE
  // first (older field names kept as fallbacks). Without this the render gets EMPTY copy.
  const copy = { headline: pick(it, ['generated_headline', 'headline', 'copy_headline']), subhead: pick(it, ['generated_subline', 'subheadline', 'subhead', 'body', 'description']), cta: pick(it, ['generated_cta', 'cta', 'cta_text'], 'Learn More') };
  const result = { brand_name: brandName, template_url: templateUrl, image_url: '', qa_status: 'failed', qa_notes: '', tries: 0 };

  try {
    // The material the model writes ALL zone copy from (not just the 3 anchor lines).
    const material = [
      `Offer: ${pick(brain, ['key_offer'])}`,
      `Voice: ${pick(brain, ['brand_tone'], 'clear, direct')}`,
      pick(brain, ['product_benefits']) ? `Proof / benefits: ${String(pick(brain, ['product_benefits'])).slice(0, 400)}` : '',
      pick(brain, ['target_personas']) ? `Audience: ${String(pick(brain, ['target_personas'])).slice(0, 300)}` : '',
      pick(brain, ['core_pain_points']) ? `Pain points: ${String(pick(brain, ['core_pain_points'])).slice(0, 300)}` : '',
    ].filter(Boolean).join('\n');

    let lastIssues = '';
    for (let t = 1; t <= MAX_TRIES; t++) {
      result.tries = t;
      // Build by LOOKING at the actual template IMAGE (multimodal) — not a text description.
      // This is the biggest lever for matching a hand-made rebuild: the model reconstructs what
      // it sees, and writes concrete copy for every zone from the brand material below.
      const buildMsg = [{ type: 'text', text:
        `Rebuild the ATTACHED ad template faithfully for "${brandName}", as HTML. LOOK at the image: copy its exact skeleton — every zone, the concept device, reading order, and proportions — then fill EVERY zone with copy grounded in this brand. Match the quality of a hand-designed ad: specific copy, balanced composition that fills the frame, on-brand colours and fonts, nothing generic.\n\n` +
        `BRAND: ${brandName}.\n${material}\n\n` +
        `ANCHOR COPY (the copy step wrote these — use for the headline/subhead/CTA; REWRITE any that name the wrong category): headline "${copy.headline}"; subhead "${copy.subhead}"; CTA "${copy.cta}".\n` +
        `WRITE THE REST YOURSELF: every OTHER zone the template has (comparison rows, checklist items, toggle labels, stat callouts, review quotes, step labels) gets SPECIFIC, concrete copy from the offer / benefits / pain points above — never blank, never vague filler.\n\n` +
        `WORDMARK to place where the template's brand mark sits (paste verbatim): ${wordmark}\n\n` +
        `DESIGN SYSTEM: stage is <div class="stage" style="...">, 1080x1080. CSS vars: --brand --brand2 --onbrand --accent --ink --sub --line --light --paper --green --red --yellow. Default font is the brand sans; class "serif" for headlines; .cta pill.\n\n${RULES}\n` +
        (lastIssues ? `\nThe previous attempt FAILED QA — fix exactly this:\n${lastIssues}\n` : '') }];
      if (templateUrl) buildMsg.push({ type: 'image_url', image_url: { url: templateUrl } });
      const stage = stripFence(textOf(await chat(MODEL_BUILD, [{ role: 'user', content: buildMsg }], 6500)));
      if (!/class=["']stage/.test(stage)) { lastIssues = 'Output was not a valid .stage div.'; continue; }

      const fullHtml = `<!doctype html><html><head><meta charset="utf8"><style>${BASE}</style></head><body>${stage}</body></html>`;
      const url = await render(fullHtml);
      if (!url) { lastIssues = 'Render returned no url.'; continue; }

      const qa = jsonOf(textOf(await chat(MODEL_VISION, [{ role: 'user', content: [
        { type: 'text', text: `QA this rendered ad for "${brandName}" (offer: ${pick(brain, ['key_offer'])}). Judge it as a paying client would — hold it to a hand-designed bar, not just "not broken". Return JSON {"pass":bool,"issues":["..."]}. FAIL if ANY of: content clipped by an edge / overflowing / cut off; garbled or illegibly low-contrast text; a card/badge/wordmark/CTA overlaps other copy; a large empty / dead area (the design does not fill the frame); generic filler copy ("get expert guidance", "find solutions", "get relief") instead of specifics about this brand; an off-brand colour (e.g. a brown/amber gradient on a green brand) or a monospace / novelty font; a random decorative object that means nothing for the brand (a floating coin, gem, pill, unrelated icon); fabricated press logos / awards / review counts; or copy that names a category that is NOT this brand's. Check all four edges. Be strict — if a designer would redo it, FAIL it.` },
        ...(templateUrl ? [{ type: 'text', text: 'REFERENCE TEMPLATE:' }, { type: 'image_url', image_url: { url: templateUrl } }] : []),
        { type: 'text', text: 'RENDERED AD:' }, { type: 'image_url', image_url: { url } }] }], 800))) || { pass: false, issues: ['QA unparseable'] };

      if (qa.pass) { result.image_url = url; result.qa_status = 'passed'; result.qa_notes = ''; break; }
      lastIssues = (qa.issues || []).map(x => '- ' + x).join('\n');
      result.qa_notes = lastIssues;
      // On failure we deliberately do NOT keep the render (image_url stays empty) — see the push
      // filter below. A garbled/overlapping render must never reach the library.
    }
  } catch (e) { result.qa_status = 'error'; result.qa_notes = String((e && e.message) || e); }

  // FULLY-AUTOMATIC: only ads that PASSED QA reach the library. Failed/errored ones are dropped
  // here (their qa_notes remain in this node's execution log for inspection), so a bad render can
  // never ship. Expect fewer ads than requested when some templates fail all retries.
  if (result.qa_status === 'passed' && result.image_url) out.push({ json: Object.assign({}, it, result) });
}
return out;
