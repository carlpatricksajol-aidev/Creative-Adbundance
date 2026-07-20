# Static Ads v6.1 — Full Updated Node Code (paste-ready)
Every Code-node body below is the COMPLETE replacement (paste over the whole node), already merged from the v6 base + all v6.1 dossier edits, and adversarially verified (node --check + mocked runs; all `edits_ok=true`). Two items at the end are not full-body rewrites: Parse Platform (insert block) and Post to supabase2 (expression body).
Do STEP 0 + STEP 1 from `Static Ads v6.1 - n8n Implementation Guide.md` FIRST (confirm you are on v6 and that `Search Brand Brain1` returns the dossier fields). Then paste these.

**Wiring after all edits (one line):**
```
Webhook -> Decode Reference -> Search Brand Brain1 -> Extract Brand Colors -> Parse Platform -> Search records1 -> Shuffle Templates1 -> Pick Templates1 -> Describe Template Layout -> Concept Director -> Build KIE AI Prompt -> Loop Over Items2 -> [Generate Ad Copy1 -> Prompt Composer -> Compliance Gate (ADR) -> Create KIE AI Task1 -> Wait2 -> Poll Task Status2 -> If3 -> Extract Image URL2 -> QA Gate + Auto-Fix -> Download Ad Image -> Upload to Supabase Storage -> Post to supabase2] -> loop
```
(The old `Rehost to supabase` no-op node is deleted; the new `Compliance Gate (ADR)` node is added.)

---

## 1. `Extract Brand Colors`
**Covers:** B19 (color short-circuit) — REPLACE whole node body. Confirm upstream node name is `Search Brand Brain1`.

```javascript
// Static Ads v6.1 — Extract Brand Colors (STEP 7d / B19 short-circuit)
// UPSTREAM NODE NAME: this reads the Brand Brain row from "Search Brand Brain1".
// BEFORE PASTING, confirm that upstream node is named EXACTLY "Search Brand Brain1"
// in YOUR live workflow (older pre-v6 exports use "Search Brand Brain" without the 1).
// If your node has a different name, update the reference on the first line below.
const brain = $('Search Brand Brain1').first().json || {};

// Dossier hex fields are ground truth: if primary + secondary are present, return
// them immediately (accent optional -> null) and SKIP the Haiku/OpenRouter call.
if (brain.primary_color_hex && brain.secondary_color_hex) {
  return [{ json: {
    primary_color_hex: brain.primary_color_hex,
    secondary_color_hex: brain.secondary_color_hex,
    accent_color_hex: brain.accent_color_hex || null
  } }];
}

// Fallback (empty hex fields): extract the dominant colors from the logo via vision.
const logoUrls = (Array.isArray(brain.logo_urls) ? brain.logo_urls : [])
  .map(l => (l && l.url) ? String(l.url) : null)
  .filter(Boolean);

const logoUrl = logoUrls[0] || null;

if (!logoUrl) {
  return [{ json: { primary_color_hex: null, secondary_color_hex: null, accent_color_hex: null } }];
}

const response = await this.helpers.httpRequest({
  method: 'POST',
  url: 'https://openrouter.ai/api/v1/chat/completions',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer <OPENROUTER_API_KEY>'
  },
  body: JSON.stringify({
    model: 'anthropic/claude-haiku-4.5',
    max_tokens: 100,
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: logoUrl } },
        { type: 'text', text: 'Extract the 3 dominant brand colors from this logo. Return ONLY valid JSON, no markdown:\n{"primary": "#XXXXXX", "secondary": "#XXXXXX", "accent": "#XXXXXX"}\nIf fewer than 3 colors exist, repeat the most dominant one.' }
      ]
    }]
  })
});

let colors = { primary: null, secondary: null, accent: null };
try {
  const raw = response.choices[0].message.content;
  colors = JSON.parse(raw.replace(/```json\n?/g,'').replace(/```/g,'').trim());
} catch(e) {}

return [{
  json: {
    primary_color_hex: colors.primary || null,
    secondary_color_hex: colors.secondary || null,
    accent_color_hex: colors.accent || null
  }
}];
```

**Operator notes:**
- Node reference corrected from `Search Brand Brain` (base) to `Search Brand Brain1` (v6), matching the Node Pack wiring `Search Brand Brain1 -> Extract Brand Colors -> Parse Platform` and Concept Director's `$('Extract Brand Colors')` reader. Added a header comment reminding the operator to confirm the exact upstream node name in their live workflow (pre-v6 exports lack the `1`).
- OPERATOR CAVEAT (API key): the base doc used a `<OPENROUTER_API_KEY>` placeholder; the finalized code uses the real key `<OPENROUTER_API_KEY>`, which matches the exact OpenRouter key hardcoded in every other v6 Node Pack node (Node Pack lines 133/366/503). It is consistent and required for the node to run, but it is a hardcoded secret in code per this workflow's convention. If this key is ever rotated, update it here too. (Note: a different key `<OPENROUTER_API_KEY>` appears in the separate Upstack Patch Pack v1 doc; do not use that one here.)
- OPERATOR CAVEAT (B20 / STEP 13): the fallback path still calls the Anthropic Haiku model on `logo_urls[0]`, which is an Airtable-hosted URL that is robots.txt-blocked for Anthropic models. For brands WITHOUT hex fields (where the short-circuit does not fire), the vision fetch may fail; the try/catch degrades gracefully to null colors rather than crashing. The short-circuit is the recommended mitigation and covers all brands whose hex fields are populated. If you need colors for hex-less brands, either populate the Airtable hex fields, switch this node's `model` to `openai/gpt-4o`, or rehost the logo first (per STEP 13).

---

## 2. `Concept Director`
**Covers:** B13 (named-format menu + rotation), B19 (brand-first colors), SKU-in-brief — REPLACE whole node body.

```javascript
const items = $input.all();
const brain = $('Search Brand Brain1').first().json;
const body = $('Webhook').first().json.body || {};
let colorSrc = {}; try { colorSrc = $('Extract Brand Colors').first().json || {}; } catch (e) {}
const OPENROUTER_KEY = '<OPENROUTER_API_KEY>';

const clientName = String(body.client_name || 'this brand');
const productImageUrls = Array.isArray(body.product_image_urls) ? body.product_image_urls.map(String).filter(Boolean) : (body.product_image_url ? [String(body.product_image_url)] : []);
const hasProduct = productImageUrls.length > 0;
const productNames = Array.isArray(body.product_names) ? body.product_names.map(String).filter(Boolean) : (body.product_name ? String(body.product_name).split(',').map(s => s.trim()).filter(Boolean) : []);
const hasAvatar = !!(body.ugc_avatar_url && String(body.ugc_avatar_url).trim());
const primaryHex = brain.primary_color_hex || colorSrc.primary_color_hex || '';
const secondaryHex = brain.secondary_color_hex || colorSrc.secondary_color_hex || '';
const accentHex = brain.accent_color_hex || colorSrc.accent_color_hex || '';

function normalizeVertical(raw){ const s=String(raw||'').toLowerCase();
  if(/ecom|retail|shop|store|d2c|dtc|cpg|consumer|beauty|cosmetic|skincare|apparel|fashion|food|beverage|drink/.test(s))return 'ecommerce';
  if(/financ|fintech|bank|invest|insur|loan|credit|wealth|trading|crypto|tax|accounting/.test(s))return 'finance';
  if(/mental|therap|counsel|wellness|health|telehealth|medical|clinic|pharma|dental|fitness|supplement|nutrition|menopause|hrt|hormone|women'?s health/.test(s))return 'health';
  if(/real ?estate|property|realty|mortgage|broker|listing/.test(s))return 'real_estate';
  if(/educat|tutor|course|learn|school|academy|coaching|bootcamp/.test(s))return 'education';
  if(/agency|marketing|studio|consult|b2b|saas|software|service|platform/.test(s))return 'agency_service';
  return 'general'; }
const vertical = normalizeVertical(body.vertical || body.industry || brain.vertical || brain.industry || brain.brand_type);

const brief = [
  'BRAND: '+clientName, 'VERTICAL: '+vertical,
  'PRODUCT BEING ADVERTISED: ' + (productNames.join(', ') || '(none - service brand)'),
  'SKU BEING ADVERTISED: ' + String(body.sku_key || '(none specified)'),
  'HAS_PRODUCT_ASSET: '+hasProduct+'   HAS_UGC_AVATAR: '+hasAvatar,
  'BRAND_COLORS: '+[primaryHex,secondaryHex,accentHex].filter(Boolean).join(', '),
  'BRAND_FONTS: '+String(brain.brand_fonts||''),
  'BRAND_TONE: '+String(brain.brand_tone||''), 'TARGET_PERSONAS: '+String(brain.target_personas||''),
  'CORE_PAIN_POINTS: '+String(brain.core_pain_points||''), 'PRODUCT_BENEFITS: '+String(brain.product_benefits||''),
  'KEY_OFFER: '+String(brain.key_offer||''), 'COMPLIANCE_NOTES: '+String(brain.compliance_notes||''),
  'CREATIVE_BOUNDARIES: '+String(brain.creative_boundaries||''), 'DOS_AND_DONTS: '+String(brain.dos_and_donts||''),
  'BRIEF_NOTES: '+String(body.brief||'')
].join('\n');

const claimSource = (String(brain.key_offer||'')+' '+String(brain.product_benefits||'')+' '+String(body.brief||'')).toLowerCase();
function claimOk(s){ if(!s)return true; const atoms=(String(s).toLowerCase().match(/[0-9]+%?|\$[0-9]+|[0-9]+\/[0-9]+/g)||[]); if(!atoms.length)return true; return atoms.every(a => claimSource.indexOf(a)!==-1); }

async function llm(model, maxTokens, temperature, prompt){
  const resp = await this.helpers.httpRequest({ method:'POST', url:'https://openrouter.ai/api/v1/chat/completions',
    headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+OPENROUTER_KEY },
    body: JSON.stringify({ model: model, temperature: temperature, max_tokens: maxTokens, messages:[{ role:'user', content: prompt }] }) });
  const parsed = (typeof resp === 'string') ? JSON.parse(resp) : resp;   // parse FIRST, then extract
  return parsed.choices[0].message.content;
}
const llmCall = llm.bind(this);

const MECHANISMS = ['EDUCATIONAL_INFOGRAPHIC','NAMED_PERSONA_STORY','COMPARISON_TABLE','MYTH_BUST_STRIKETHROUGH','UGC_HANDWRITTEN_SIGN','MIRROR_SELFIE_UGC','STAT_PROOF_CARD','LIFESTYLE_BOLD_CLAIM','PROBLEM_SOLUTION_DIPTYCH','TESTIMONIAL_QUOTE','OFFER_HERO','HERO_SPOTLIGHT_PRODUCT'];
const ANGLES = ['pain_first','benefit_first','social_proof','myth_objection','identity_aspiration','offer_urgency'];
const FALLBACK_CARRIERS = ['handwritten sign held by a person','sticky note on a fridge','torn notepad page','clean quote card','app-screenshot UI','editorial print layout'];

function isWin(s){ return s==='team_top5'||s==='client_winners'||s==='user_reference'; }
const winnerItems = items.filter(it => isWin(it.json.source));
const nonWinnerItems = items.filter(it => !isWin(it.json.source||'top_performers'));

// B13: brand NAMED format menu
function extractFormats(g){
  const m = String(g||'').match(/(layout patterns?|ad formats?|named formats?|formats?)[\s\S]{0,1400}/i);
  const block = m ? m[0] : '';
  return Array.from(new Set((block.match(/[-•*]\s*([A-Z][A-Za-z0-9 /&'-]{2,40})/g)||[])
    .map(s => s.replace(/^[-•*]\s*/,'').trim()))).slice(0,12);
}
const winnerFormatTokens = (Array.isArray(brain.winning_ads)?brain.winning_ads:[])
  .map(a => (a && a.filename) ? String(a.filename).split('_')[2] : '')   // NF_PureC8_Toggle_... -> Toggle
  .map(s => (s||'').trim()).filter(Boolean);
const brandFormats = Array.from(new Set(extractFormats(brain.brand_guidelines).concat(winnerFormatTokens)));

const out = [];
winnerItems.forEach(it => { out.push({ json: Object.assign({}, it.json, { is_winner:true, concept:null, vertical:vertical, primary_hex:primaryHex, secondary_hex:secondaryHex, accent_hex:accentHex }) }); });

const slotsWanted = nonWinnerItems.length * 2;
if (slotsWanted > 0) {

  // ---- PASS 1: SELECT mechanisms by fit ----
  const menuAvail = MECHANISMS.filter(m => (m !== 'HERO_SPOTLIGHT_PRODUCT' || hasProduct));
  const selectPrompt = [
    'You are a senior direct-response creative director planning a batch of ' + slotsWanted + ' static ads.',
    '', brief, '',
    'MECHANISM MENU: ' + menuAvail.join(', '),
    'ANGLE MENU: ' + ANGLES.join(', '),
    (brandFormats.length ? 'BRAND NAMED FORMATS (strongly prefer these proven formats when they fit; rotate them, NEVER repeat a format within this batch): ' + brandFormats.join(', ') : ''),
    (brandFormats.length ? 'For each pair add a "format" field naming the brand format you are executing (exact name from the list).' : ''),
    '',
    'Pick the ' + slotsWanted + ' BEST-FIT mechanism+angle pairs for THIS brand and audience. Rules:',
    '- Fit first: pick what this vertical/persona actually responds to. No pair may violate DOS_AND_DONTS or CREATIVE_BOUNDARIES (e.g. if photorealistic children are forbidden, UGC/persona concepts must feature adults).',
    '- Diversity: no mechanism twice unless slots > 6; vary angles.',
    '- If HAS_PRODUCT_ASSET is false, never pick a mechanism that requires showing a product.',
    '- For each pair also propose a CARRIER: the real-world physical object or named format the ad text will live on (handwritten sign, sticky note, torn notepad page, check mailer, roadside marquee, app-screenshot UI, editorial print layout, quote card, billboard...). The carrier is what makes rendered text look native.',
    'Return ONLY a JSON array of exactly ' + slotsWanted + ' objects: [{"mechanism":"...","format":"...","angle":"...","carrier":"...","why":"one line"}]. No markdown.'
  ].join('\n');
  let pairs = [];
  let selectorFallback = false;
  try {
    const raw = await llmCall('anthropic/claude-sonnet-4', Math.min(4000, 250 + slotsWanted * 130), 0.7, selectPrompt);
    pairs = JSON.parse(raw.substring(raw.indexOf('['), raw.lastIndexOf(']')+1));
  } catch (e) { pairs = []; }
  if (!Array.isArray(pairs)) pairs = [];
  // shape-validate + normalize; replace bad entries; diverse top-up
  const usedMechs = new Set();
  pairs = pairs.slice(0, slotsWanted).map(p => {
    const mech = (p && typeof p.mechanism === 'string') ? p.mechanism.toUpperCase().trim() : '';
    if (menuAvail.indexOf(mech) === -1) return null;
    usedMechs.add(mech);
    return { mechanism: mech, format: String((p && p.format) || '').trim(), angle: (p.angle && ANGLES.indexOf(String(p.angle)) !== -1) ? String(p.angle) : ANGLES[0], carrier: String(p.carrier || '').trim() || 'clean editorial layout', why: String(p.why || '') };
  }).filter(Boolean);
  while (pairs.length < slotsWanted) {
    selectorFallback = true;
    const i = pairs.length;
    const mech = menuAvail.find(m => !usedMechs.has(m)) || menuAvail[i % menuAvail.length];
    usedMechs.add(mech);
    pairs.push({ mechanism: mech, angle: ANGLES[(i + 1) % ANGLES.length], carrier: FALLBACK_CARRIERS[i % FALLBACK_CARRIERS.length], why: 'fallback' });
  }

  // ---- PASS 2: generation per concept, parallel chunks of 3 ----
  const genOne = async (s) => {
    const tpl = nonWinnerItems[Math.floor(s / 2)].json;
    const pair = pairs[s];
    const lb = tpl.layout_brief ? ('LAYOUT BLUEPRINT (from a proven winning template — design INTO this structure):\n' + JSON.stringify(tpl.layout_brief)) : '';
    const genPrompt = [
      'You are a senior direct-response creative director. Write ONE complete static-ad concept.',
      '', brief, '',
      'MECHANISM (fixed): ' + pair.mechanism,
      (pair.format ? 'BRAND FORMAT (execute this named format): ' + pair.format : ''),
      'ANGLE (fixed): ' + pair.angle,
      'TEXT CARRIER (the physical object/format the copy lives on): ' + pair.carrier,
      lb, '',
      'HARD RULES:',
      '- Honor every DON\'T in DOS_AND_DONTS as a POSITIVE constraint (e.g. forbidden children -> "adults in their 30s-40s only"). Never position the brand in a prohibited way.',
      '- COPY IS FINAL: exact renderable words. Max 5 on-image strings total (headline, subline, cta + up to 2 short support strings). Correct spelling, no em dashes, no placeholders.',
      '- Only use offers/numbers/claims that literally appear in KEY_OFFER / PRODUCT_BENEFITS / BRIEF_NOTES.',
      '- visual_direction: a precise 60-120 word art-direction paragraph — the single visual scene, where the carrier sits, where each copy string sits (named zones: top/center/bottom), how brand colors are used, camera/lighting if photographic.',
      '- needs_person true only if the concept shows a person.',
      'Return ONLY JSON: {"concept_id":"' + pair.mechanism.toLowerCase() + '-' + (s+1) + '","mechanism":"' + pair.mechanism + '","angle":"' + pair.angle + '","carrier":"...","persona":"...","headline":"...","subline":"...","cta":"...","copy_blocks":[{"role":"headline","text":"...","position":"top"}],"offer":"","proof_points":[],"visual_direction":"...","needs_product":' + (hasProduct ? 'true' : 'false') + ',"needs_person":false,"text_density":"low|medium|high"}. No markdown.'
    ].filter(Boolean).join('\n');

    let cpt = {};
    try {
      const raw = await llmCall('anthropic/claude-sonnet-4', 1200, 0.85, genPrompt);
      cpt = JSON.parse(raw.substring(raw.indexOf('{'), raw.lastIndexOf('}')+1));
    } catch (e) { cpt = {}; }
    cpt.mechanism = pair.mechanism; cpt.angle = cpt.angle || pair.angle; cpt.carrier = cpt.carrier || pair.carrier;
    cpt.format = pair.format || '';
    cpt.needs_product = hasProduct ? (cpt.needs_product !== false) : false;
    if (!claimOk(cpt.offer)) cpt.offer = '';
    cpt.proof_points = Array.isArray(cpt.proof_points) ? cpt.proof_points.filter(claimOk) : [];
    cpt.copy_blocks = (Array.isArray(cpt.copy_blocks) ? cpt.copy_blocks : []).filter(b => b && String(b.text || '').trim());
    if (!cpt.copy_blocks.length) cpt.copy_blocks = [{ role:'headline', text: cpt.headline || clientName, position:'top' }];
    if (cpt.copy_blocks.length > 5) cpt.copy_blocks = cpt.copy_blocks.slice(0, 5);
    cpt.concept_id = cpt.concept_id || (pair.mechanism.toLowerCase() + '-' + (s+1));
    if (selectorFallback) cpt.selector_fallback = true;
    return { s: s, tpl: tpl, cpt: cpt };
  };

  const results = [];
  for (let c = 0; c < slotsWanted; c += 3) {
    const chunk = [];
    for (let s = c; s < Math.min(c + 3, slotsWanted); s++) chunk.push(genOne(s));
    const done = await Promise.all(chunk);
    results.push(...done);
  }

  results.sort((a, b) => a.s - b.s).forEach(r => {
    out.push({ json: Object.assign({}, r.tpl, {
      is_winner:false, variant_index: (r.s % 2) + 1, concept: r.cpt, concept_id: r.cpt.concept_id,
      text_density: r.cpt.text_density || 'medium', vertical: vertical,
      primary_hex: primaryHex, secondary_hex: secondaryHex, accent_hex: accentHex
    }) });
  });
}
return out;
```

**Operator notes:**
- Operator caveat (behavior, not a bug): on total selector failure the fallback top-up pairs are pushed WITHOUT a `format` key, so those concepts get format='' (verified: fallbackFlag=[true,true], formats=["",""]). This is the intended graceful-degrade path per the guide; mechanisms still rotate distinctly via usedMechs. The LLM-returned `format` is carried through as-is and is NOT validated against brandFormats, so a hallucinated format name would pass — acceptable per spec (format is advisory copy, and QA/Prompt Composer consume it downstream).
- Pre-existing caveat carried from the v6 base (not introduced by these edits): OPENROUTER_KEY is a hardcoded API secret inlined in the node body. It matches the base Node Pack verbatim, so it is left unchanged, but it should be rotated/moved to n8n credentials when convenient.

---

## 3. `Build KIE AI Prompt`
**Covers:** B14 (SKU->image binding), B11 (brand_guidelines passthrough) — REPLACE whole node body.

```javascript
const items = $input.all();
const brain = $('Search Brand Brain1').first().json;
const body = $('Webhook').first().json.body || {};

const clientName = String(body.client_name || 'this brand');
const allProductUrls = Array.isArray(body.product_image_urls) ? body.product_image_urls.map(String).filter(Boolean) : (body.product_image_url ? [String(body.product_image_url)] : []);
const productNames = Array.isArray(body.product_names) ? body.product_names.map(String).filter(Boolean) : (body.product_name ? String(body.product_name).split(',').map(s=>s.trim()).filter(Boolean) : []);
const avatarUrl = (body.ugc_avatar_url && String(body.ugc_avatar_url).trim()) ? String(body.ugc_avatar_url).trim() : null;

// B14: bind to one SKU's product image
const skuKey = String(body.sku_key || '').trim();
let skuUrls = allProductUrls;
if (skuKey) {
  const fld = brain['product_image_' + skuKey.toLowerCase().replace(/[^a-z0-9]+/g,'_')];
  const fromField = Array.isArray(fld) ? fld.map(a => a && a.url).filter(Boolean) : [];
  if (fromField.length) {
    skuUrls = fromField;                              // per-SKU labeled field (A3)
  } else {
    const idx = productNames.findIndex(n => n && (n.toLowerCase().includes(skuKey.toLowerCase()) || skuKey.toLowerCase().includes(n.toLowerCase())));
    if (idx >= 0 && allProductUrls[idx]) skuUrls = [allProductUrls[idx]];  // align to product_names order
  }
}

const MAX_IMAGES = 8; // nano-banana-pro hard limit

const result = [];
items.forEach((entry, i) => {
  const it = entry.json;
  const source = it.source || 'top_performers';
  const isWinner = it.is_winner === true || ['team_top5','client_winners','user_reference'].indexOf(source) >= 0;
  const logoHosted = it._logo_hosted || null;

  // budget slots: template(1) + avatar(0/1) + logo(0/1) reserved; products fill the rest
  const reserved = (it.template_url ? 1 : 0) + (avatarUrl ? 1 : 0) + (logoHosted ? 1 : 0);
  const products = skuUrls.slice(0, Math.max(0, MAX_IMAGES - reserved));

  const imageInput = [];
  const roles = [];
  if (it.template_url) { imageInput.push(it.template_url); roles.push(isWinner ? 'reference ad' : 'layout template'); }
  let pIdx = -1; products.forEach(u => { if (pIdx < 0) pIdx = imageInput.length; imageInput.push(u); roles.push('product photo'); });
  let aIdx = -1; if (avatarUrl) { aIdx = imageInput.length; imageInput.push(avatarUrl); roles.push('the person to feature'); }
  let lIdx = -1; if (logoHosted) { lIdx = imageInput.length; imageInput.push(logoHosted); roles.push('brand logo'); }

  const refModeRaw = String(body.reference_mode || '').toLowerCase();
  const closeRepro = isWinner && (refModeRaw === 'exact' || (refModeRaw === '' && (source === 'team_top5' || source === 'client_winners')));

  result.push({ json: {
    template_url: it.template_url, template_index: i + 1, template_id: it.template_id || null,
    image_input: imageInput, image_roles: roles,
    product_index: pIdx, avatar_index: aIdx, logo_index: lIdx,
    has_logo: !!logoHosted, has_products: products.length > 0, product_names: productNames,
    model: 'nano-banana-pro',
    variant_index: it.variant_index || 1, source: source, is_winner: isWinner, close_repro: closeRepro,
    vertical: it.vertical || 'general', layout_brief: it.layout_brief || null,
    concept: it.concept || null, concept_id: it.concept_id || ('winner-' + (i + 1)),
    primary_hex: it.primary_hex || brain.primary_color_hex || '', secondary_hex: it.secondary_hex || brain.secondary_color_hex || '',
    accent_hex: it.accent_hex || brain.accent_color_hex || '', brand_fonts: String(brain.brand_fonts || ''),
    dos_and_donts: String(brain.dos_and_donts || ''), creative_boundaries: String(brain.creative_boundaries || ''),
    compliance_notes: String(brain.compliance_notes || ''), brand_tone: String(brain.brand_tone || ''),
    client_name: clientName, sku_key: skuKey, brand_guidelines: String(brain.brand_guidelines || ''), rehost_warnings: it._rehost_warnings || [],
    prompt: '' // written by Prompt Composer
  }});
});
return result;
```

**Operator notes:**
- OPERATOR CAVEAT 1: B14's per-SKU field path depends on Airtable exposing fields named product_image_<sku-slug> (STEP 1 / A3) and the form actually posting body.sku_key (form work item C21). If neither is present it degrades gracefully to all products (verified), so the wrong-SKU bug is only fully fixed once those two ship.
- OPERATOR CAVEAT 2: the brain-first hex values (it.primary_hex etc.) are only truly brain-first if Concept Director's STEP 7a edit is applied upstream (it passes brain-first hex down as it.*_hex). This node's fallback to brain.*_color_hex is a safety net, not a substitute for 7a.
- OPERATOR CAVEAT 3 (dedup): brand_guidelines must be added to this node exactly ONCE. STEP 3 and STEP 5a both instruct adding the same field with a 'skip if already done' note; the finalized body includes it a single time. Do not add it again.

---

## 4. `Prompt Composer`
**Covers:** B11 (selective dossier slices), B12 (fonts as letterforms), B9 (logo, no invented wordmark), B17 (AI-performer disclosure), B10 (real safe-zone px) — REPLACE whole node body.

```javascript
const item = $input.first().json;
const OPENROUTER_KEY = '<OPENROUTER_API_KEY>';
const aspect = ($('Parse Platform').first().json.aspect_ratio || '1:1');

// B11: pull only the relevant dossier sections
const DOSSIER = String(item.brand_guidelines || '');
function section(label){
  const esc = String(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');   // escape dynamic labels (e.g. format names with / & ')
  const re = new RegExp('(^|\\n)\\s*[#>*-]*\\s*' + esc + '[^\\n]*\\n([\\s\\S]*?)(\\n\\s*[#>*-]*\\s*[A-Z][^\\n]{2,40}\\n|$)', 'i');
  const m = DOSSIER.match(re);
  return m ? m[2].trim().slice(0, 700) : '';
}
const skuKey = String(item.sku_key || '').trim();
function skuFilter(txt){
  if (!skuKey || !txt) return txt;
  const lines = txt.split('\n');
  const hit = lines.filter(l => l.toLowerCase().includes(skuKey.toLowerCase()));
  return hit.length ? hit.join('\n') : txt;   // keep SKU-specific lines if any, else whole block
}
const dossierSlices = [
  (item.concept && item.concept.format) ? ('LAYOUT/FORMAT — ' + item.concept.format + ': ' + section(item.concept.format)) : '',
  'TYPOGRAPHY: ' + section('typograph'),
  'COLOR USAGE: ' + section('color'),
  'PRODUCT TREATMENT: ' + skuFilter(section('product')),
  'NEVER-DO: ' + section('never')
].filter(s => s && s.split(':').slice(1).join(':').trim().length > 3).join('\n');

// B17: disclosure when an AI performer appears
const usesPerformer = !!(item.concept && item.concept.needs_person) || (item.avatar_index >= 0) || /UGC|SELFIE|PERSONA|LIFESTYLE|TESTIMONIAL/i.test(String((item.concept && item.concept.mechanism) || ''));
const AI_DISCLOSURE = 'This ad contains an AI-generated performer.';

// B10: real safe-zone numbers
const SAFE = {
  '9:16': 'Keep all text and key subjects at least 145px from the left and right edges, 258px clear at the top and 450px clear at the bottom (1080x1920 canvas).',
  '1:1':  'Keep all text and key subjects within the central 88% of the canvas, minimum ~110px margins (1080x1080).',
  '16:9': 'Keep all text and key subjects within the central 90% of the canvas, minimum ~120px margins (1920x1080).'
};
const safeZone = SAFE[aspect] || SAFE['1:1'];

// ---------- WINNER ----------
if (item.is_winner) {
  const refContract = (item.image_roles || []).map((r, i) => 'Image ' + (i + 1) + ' is the ' + r + '.').join(' ');
  const fullCopy = String(item.generated_copy_text || '').trim();
  const copyBlock = fullCopy || [item.generated_headline, item.generated_subline, item.generated_cta].filter(Boolean).join('\n');
  const copyLines = copyBlock
    ? ['Render this copy verbatim, in the same positions and lettering style as the original:', copyBlock, ...(usesPerformer ? ['Also render a small legible footer line, verbatim: "' + AI_DISCLOSURE + '"'] : [])]
    : ['Write new copy for ' + item.client_name + ' in the same positions, lengths, and lettering style as the original; keep every claim generic and brand-safe.', ...(usesPerformer ? ['Also render a small legible footer line, verbatim: "' + AI_DISCLOSURE + '"'] : [])];
  const lines = item.close_repro ? [
    'Recreate the reference ad (image 1) for ' + item.client_name + ' as a finished static ad, ' + aspect + '.',
    'Reproduce its EXACT layout, composition, style, lighting, lettering style, and branding level. Change ONLY: the brand (now ' + item.client_name + '), the featured product/object' + (item.product_index >= 0 ? ' (use the exact product from image ' + (item.product_index + 1) + ', reproduce label and shape faithfully)' : ' (adapt to this brand\'s service)') + ', and the copy.',
    refContract,
    (item.logo_index >= 0 ? 'Reproduce the brand logo from image ' + (item.logo_index + 1) + ' exactly, one placement, only if the reference format shows a logo.' : 'No brand logo was supplied: do not invent one; if the reference has a logo zone, leave it as clean space.'),
    ...copyLines,
    (dossierSlices ? 'Brand dossier rules to honor: ' + dossierSlices : ''),
    'No other brand names or text may remain from the original. Keep it as plain or as designed as the reference — add nothing it does not have. Keep all text well inside the frame. ' + safeZone
  ] : [
    'Create a NEW static ad for ' + item.client_name + ', ' + aspect + ', INSPIRED BY the reference (image 1): keep its concept, hook mechanism, format and tone, but change the execution (different composition, setting, people).',
    refContract,
    (item.logo_index >= 0 ? 'Reproduce the brand logo from image ' + (item.logo_index + 1) + ' exactly, one placement.' : 'No brand logo was supplied: do not invent one; leave clean space top-right.'),
    ...copyLines,
    (dossierSlices ? 'Brand dossier rules to honor: ' + dossierSlices : ''),
    'Colors: ' + [item.primary_hex, item.secondary_hex, item.accent_hex].filter(Boolean).join(', ') + '. No other brand names or text from the original. Keep all text well inside the frame. ' + safeZone
  ];
  const finalPrompt = lines.filter(Boolean).join('\n');
  return [{ json: Object.assign({}, item, { prompt: finalPrompt, kie_body: { model: 'nano-banana-pro', input: { prompt: finalPrompt, image_input: item.image_input, aspect_ratio: aspect, resolution: '2K', output_format: 'png' } } }) }];
}

// ---------- NON-WINNER: LLM writes the art-director prompt ----------
const c = item.concept || {};
const blocks = (Array.isArray(c.copy_blocks) ? c.copy_blocks : []).filter(b => b && String(b.text || '').trim());
const copyList = blocks.map(b => '- [' + (b.role || 'text') + ' @ ' + (b.position || 'anywhere') + '] "' + String(b.text).trim() + '"').join('\n');
const copyListFinal = copyList + (usesPerformer ? '\n- [disclosure @ bottom] "' + AI_DISCLOSURE + '" (render as a small, legible footer line)' : '');
const refContract = (item.image_roles || []).map((r, i) => 'image ' + (i + 1) + ' = ' + r).join('; ');
const paletteWords = [item.primary_hex ? ('primary ' + item.primary_hex) : '', item.secondary_hex ? ('secondary ' + item.secondary_hex) : '', item.accent_hex ? ('accent ' + item.accent_hex) : ''].filter(Boolean).join(', ');
const photographic = /UGC|SELFIE|LIFESTYLE|PERSONA/i.test(String(c.mechanism || ''));
const noLogoClause = item.has_logo ? '' : ' No brand logo was supplied: the ad must NOT contain any logo, wordmark, or logo-like badge; where the layout expects a logo, leave clean space.';
const brandLc = String(item.client_name || '').toLowerCase();
const logoPlacement = !item.has_logo ? ''
  : (brandLc.includes('nurx')
      ? ' Place the supplied logo at about 15% of canvas width, centered above the headline, with one logo-height of clear space around it.'
      : ' Place the supplied logo once, at a single natural placement, with clear space around it.');

const composerPrompt = [
  'Write ONE image-generation prompt for a static ad. Output ONLY the prompt text (no preamble, no markdown, no quotes around the whole thing).',
  '',
  'Follow this exact anatomy (reverse-engineered from top-performing generations):',
  '1. First clause declares the artifact: "Static ad, ' + aspect + '..." or "Photorealistic UGC-style photograph..." depending on the concept.',
  '2. Describe ONE committed visual scene: ' + String(c.visual_direction || ''),
  '3. The text lives on this physical carrier — make it physically real (material, shadow, texture): ' + String(c.carrier || 'a clean designed layout'),
  '4. Use named zones (top / center / bottom) and place each copy string in its zone, QUOTED VERBATIM with exact casing:',
  copyListFinal || '(no copy strings — pure visual)',
  '5. Typography: render the copy in a typeface matching the brand fonts' + (item.brand_fonts ? ' (' + item.brand_fonts + ')' : '') + '. Describe their letterform character in plain words (e.g. rounded friendly sans, high-contrast elegant serif, condensed grotesque) using the TYPOGRAPHY dossier section above; give one weight/color note per text element. Do not just name the font family.',
  '6. Palette: ' + (paletteWords || 'derive from the brand assets') + (photographic ? ' — for this photographic concept use brand color as a NATURAL accent only (marker ink, clothing, an object), not a color-graded wash; natural imperfect lighting, shot-on-phone feel.' : ' — state each hex ONCE next to the element that uses it.'),
  (item.image_roles && item.image_roles.length
    ? '7. Reference contract, include verbatim-style lines: ' + refContract + '. Template/layout images: follow their structure and hierarchy but replace ALL content and branding. Product images: reproduce the exact product, label and shape faithfully. Logo image: reproduce exactly, one placement, never redraw.' + noLogoClause + logoPlacement
    : '7. No input images.' + noLogoClause),
  '8. Composition safety: ' + safeZone + ' Nothing touches the edges.',
  (dossierSlices ? 'BRAND DOSSIER (obey these specific rules for this format only):\n' + dossierSlices : ''),
  '9. End with a short constraint block: translate every DON\'T below into a POSITIVE constraint in the scene (never write "no X" for content; describe what IS there instead), then a brief negative list for style only (e.g. "Negative: watermark, platform UI, extra text, distorted hands").',
  'DOS_AND_DONTS: ' + (item.dos_and_donts || '(none)'),
  'CREATIVE_BOUNDARIES: ' + (item.creative_boundaries || '(none)'),
  '',
  'Length: 130-260 words. Never include marketing-strategy prose, audience descriptions, or the words MANDATORY/RULES. The scene, zones, and quoted copy ARE the prompt.'
].join('\n');

let finalPrompt = '';
try {
  const resp = await this.helpers.httpRequest({ method: 'POST', url: 'https://openrouter.ai/api/v1/chat/completions',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + OPENROUTER_KEY },
    body: JSON.stringify({ model: 'anthropic/claude-sonnet-4', temperature: 0.6, max_tokens: 700, messages: [{ role: 'user', content: composerPrompt }] }) });
  const parsed = (typeof resp === 'string') ? JSON.parse(resp) : resp;   // parse FIRST
  finalPrompt = String(parsed.choices[0].message.content || '').trim();
} catch (e) { finalPrompt = ''; }

// fallback: serviceable prompt without the LLM
if (!finalPrompt || finalPrompt.length < 80) {
  finalPrompt = ['Static ad, ' + aspect + '. ' + String(c.visual_direction || ''),
    (blocks.length ? 'Copy to render verbatim: ' + blocks.map(b => '"' + String(b.text).trim() + '"').join(', ') : ''),
    'Palette: ' + paletteWords + '.' + noLogoClause + ' Clean generous margins, all text well inside the frame.'].filter(Boolean).join('\n');
}

const input = { prompt: finalPrompt, aspect_ratio: aspect, resolution: '2K', output_format: 'png' };
if (Array.isArray(item.image_input) && item.image_input.length) input.image_input = item.image_input;

return [{ json: Object.assign({}, item, { prompt: finalPrompt, kie_body: { model: 'nano-banana-pro', input: input } }) }];
```

**Operator notes:**
- CAVEAT (matches spec, harmless): the non-winner composerPrompt array is NOT .filter(Boolean)-ed, so when dossierSlices is empty the BRAND DOSSIER element yields one blank line in the composer instruction. The Implementation Guide explicitly notes this is harmless.
- CAVEAT (upstream data dependency, not a code bug): this node reads item.sku_key, item.brand_guidelines, item.concept.format, item.has_logo, item.avatar_index, and item.concept.needs_person. These must be supplied by the earlier v6.1 edits (STEP 2b/3/4/5a in Build KIE AI Prompt + Concept Director). If those upstream edits are not installed, the slices/disclosure/logo-placement degrade gracefully to empty rather than erroring.
- CAVEAT (pre-existing, carried from base): OPENROUTER_KEY is a hardcoded live secret in the node body. Not introduced by these edits, but worth rotating/moving to an n8n credential.
- CAVEAT (env): the node uses top-level `await this.helpers.httpRequest(...)`, which is valid only inside an n8n Code node (which wraps the body in an async function with `this` bound). This is unchanged from the v6 base and correct for the target runtime.

---

## 5. `Compliance Gate (ADR)`
**Covers:** B16 — NEW Code node. Insert between `Prompt Composer` and `Create KIE AI Task1`.

```javascript
const j = $input.first().json;
const brand = String(j.client_name || '').toLowerCase();
const regulated = /adr|american debt|debt relief/.test(brand) || String(j.compliance_notes || '').trim() !== '';
if (!regulated) return [{ json: j }];   // gate only regulated brands

const hay = [
  j.prompt || '',
  (j.concept && Array.isArray(j.concept.copy_blocks)) ? j.concept.copy_blocks.map(b => b && b.text).join(' ') : '',
  j.generated_headline || '', j.generated_subline || '', j.generated_cta || '', j.generated_copy_text || ''
].join(' \n ').toLowerCase();

const BANNED = ['debt settlement', 'debt resolution', 'all your bills', 'you will save', 'eliminate your debt', 'erase your debt', 'guaranteed'];
const hit = BANNED.filter(p => hay.indexOf(p) !== -1);
if (hit.length) {
  throw new Error('ADR compliance gate BLOCKED: banned phrase(s) -> "' + hit.join('", "') + '". Regenerate with approved phrasing.');
}

const APPROVED = [
  'save 40% or more on eligible monthly payments',
  'clients save an average of $480/month',
  'become debt-free in as little as 24-48 months'
];
const makesClaim = /\b\d+\s?%|\$\s?\d+|save|debt[- ]free\b/.test(hay);
const usesApproved = APPROVED.some(a => hay.indexOf(a) !== -1);
if (makesClaim && !usesApproved) {
  throw new Error('ADR compliance gate BLOCKED: a savings/debt claim is present but not an approved phrasing. Use exactly one of: "' + APPROVED.join('" | "') + '".');
}
return [{ json: j }];
```

**Operator notes:**
- OPERATOR CAVEAT (design, per spec, not fixed): the regulated flag fires on EITHER an 'adr'/'american debt'/'debt relief' name match OR any non-empty compliance_notes. If a NON-ADR brand (e.g. Nurx) has compliance_notes populated, this node applies ADR's ADR-specific APPROVED whitelist to it — a copy with '$15/month' or '40%' would set makesClaim=true, usesApproved=false, and throw an ADR-worded block. Only populate compliance_notes for ADR-style brands, or the BANNED/APPROVED lists must be scoped per-brand. The gate is fail-loud, so a false trigger halts and alerts the operator rather than shipping bad output.
- OPERATOR CAVEAT (matching, per spec, not fixed): /adr/ is a substring test, so a brand name containing the letters 'adr' (e.g. 'Madrid') would trip the gate. None of the current roster (Natural Force, Nurx, Huckleberry, Tapouts, ARMRA, Mulberrys, ADR) contains that substring, so no live false-positive; flagged for future brand additions. Left verbatim to match the signed-off spec and its confirm tests; tighten to \badr\b only if a colliding brand is ever added.

---

## 6. `Extract Image URL2`
**Covers:** Carries sku_key + format + brand_guidelines downstream to QA — REPLACE whole node body.

```javascript
const data = $input.first().json?.data ?? {};
let imageUrl = null;
try {
  const resultJson = data.resultJson ? JSON.parse(data.resultJson) : null;
  imageUrl = resultJson?.resultUrls?.[0] ?? null;
} catch (e) { imageUrl = null; }

const src = $('Prompt Composer').first().json;
const taskId = $('Create KIE AI Task1').first().json?.data?.taskId ?? ('noid-' + Date.now());

const fullCopy = String(src.generated_copy_text || '').trim();
const expectedCopy = fullCopy
  ? fullCopy.split('\n').map(s => s.trim()).filter(Boolean)
  : [src.generated_headline, src.generated_subline, src.generated_cta].filter(Boolean);

return [{ json: {
  imageUrl, task_id: taskId,
  variant_index: src.variant_index ?? 1,
  source: src.source, is_winner: src.is_winner === true, close_repro: src.close_repro === true,
  concept_id: src.concept_id, mechanism: src.concept?.mechanism || (src.is_winner ? 'winner_repro' : ''),
  angle: src.concept?.angle || '', carrier: src.concept?.carrier || '',
  format: src.concept?.format || '',
  template_index: src.template_index, template_id: src.template_id,
  prompt: src.prompt,
  expected_copy: expectedCopy,
  copy_blocks: src.concept?.copy_blocks || [],
  has_logo: src.has_logo === true, logo_index: src.logo_index,
  primary_hex: src.primary_hex, secondary_hex: src.secondary_hex, accent_hex: src.accent_hex,
  dos_and_donts: src.dos_and_donts, compliance_notes: src.compliance_notes,
  sku_key: src.sku_key || '',
  brand_guidelines: src.brand_guidelines || '',
  rehost_warnings: src.rehost_warnings || []
}}];
```

**Operator notes:**
- Cross-node references match v6 names: `$('Prompt Composer')` and `$('Create KIE AI Task1')`. This node does not need `$('Search Brand Brain1')` or `$('Parse Platform')`, so their absence is correct. Caveat: STEP 6 inserts `Compliance Gate (ADR)` between Prompt Composer and Create KIE AI Task1, but per the guide this node still reads `$('Prompt Composer')` by name and is unaffected.
- Operator caveat: `src.concept?.mechanism || (...)`, `carrier`, `format` etc. use `||`, so an empty string / 0 / false from upstream collapses to the fallback — intended here since these are string fields. `variant_index: src.variant_index ?? 1` correctly uses `??` so a legitimate 0 is preserved (though variant_index is 1-based).

---

## 7. `QA Gate + Auto-Fix`
**Covers:** B15 (SKU + safe-zone + dossier never-do checks) — REPLACE whole node body.

```javascript
const item = $input.first().json;
const OPENROUTER_KEY = '<OPENROUTER_API_KEY>';
const KIE_KEY = 'fef7e0d9d3bd971d5f1ebe1ec8318a1e';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

if (!item.imageUrl) {
  throw new Error('KIE reported success but returned no result URL (taskId ' + item.task_id + '). Check the render task in KIE.');
}

const expectedCopy = (item.copy_blocks && item.copy_blocks.length)
  ? item.copy_blocks.map(b => String(b.text || '').trim()).filter(Boolean)
  : (item.expected_copy || []);
const hasExpectedCopy = expectedCopy.length > 0;

const qa = async (imageUrl) => {
  const checks = [];
  if (hasExpectedCopy) {
    checks.push('(1) every expected copy string rendered verbatim and legibly', '(2) no extra, garbled, or nonsense text beyond the expected copy');
  }
  checks.push('(3) logo per the rule above', '(4) palette respected for designed ads (photographic ads only need a natural brand accent)', '(5) no DONT violations from the BRAND DONTS list', '(6) no anatomical or rendering artifacts, no clipped text at edges', '(7) the product shown is the expected SKU "' + (item.sku_key || 'n/a') + '" — right container/flavor/motif, upright and undistorted, not a similar-looking swap', '(8) all text sits inside the safe zone with generous edge margins');
  const qaPrompt = [
    'You are a strict ad-QA reviewer. Inspect this rendered static ad image.',
    hasExpectedCopy ? 'EXPECTED ON-IMAGE COPY (verbatim): ' + JSON.stringify(expectedCopy) : 'No specific copy is expected; judge only design, logo, palette, compliance, artifacts.',
    'BRAND PALETTE: ' + [item.primary_hex, item.secondary_hex, item.accent_hex].filter(Boolean).join(', '),
    'LOGO: ' + (item.has_logo ? 'a real brand logo image was supplied — it must appear correctly, not a redrawn or invented wordmark.' : 'NO logo was supplied — the ad must NOT contain an invented logo or fake wordmark badge.'),
    'BRAND DONTS (each is a hard violation if depicted): ' + (item.dos_and_donts || '(none)'),
    'BRAND NEVER-DO (from dossier): ' + String(item.brand_guidelines || '').slice(0, 800),
    'COMPLIANCE: ' + (item.compliance_notes || '(none)'),
    '',
    'Check: ' + checks.join(', ') + '.',
    'Return ONLY JSON: {"score": 1-10 integer, "pass": true/false, "flags": ["short_snake_case"...], "fix_instruction": "ONE short imperative edit that would fix the worst problem while keeping everything else identical. Empty string if pass."}'
  ].join('\n');
  try {
    const resp = await this.helpers.httpRequest({ method: 'POST', url: 'https://openrouter.ai/api/v1/chat/completions',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + OPENROUTER_KEY },
      body: JSON.stringify({ model: 'openai/gpt-4o', max_tokens: 350, messages: [{ role: 'user', content: [
        { type: 'image_url', image_url: { url: imageUrl } }, { type: 'text', text: qaPrompt } ] }] }) });
    const parsed = (typeof resp === 'string') ? JSON.parse(resp) : resp;
    const raw = parsed.choices[0].message.content;
    const v = JSON.parse(raw.substring(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    v.score = (v.score != null && isFinite(Number(v.score))) ? Math.max(1, Math.min(10, Math.round(Number(v.score)))) : null;
    return v;
  } catch (e) { return { score: null, pass: true, flags: ['qa_unavailable'], fix_instruction: '' }; }
};

const microEdit = async (imageUrl, instruction) => {
  try {
    const create = await this.helpers.httpRequest({ method: 'POST', url: 'https://api.kie.ai/api/v1/jobs/createTask',
      headers: { 'Authorization': 'Bearer ' + KIE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'nano-banana-2', input: { prompt: instruction + ' Keep the layout, colors, and everything else exactly identical.', image_input: [imageUrl], aspect_ratio: ($('Parse Platform').first().json.aspect_ratio || '1:1'), resolution: '2K', output_format: 'png' } }) });
    const created = (typeof create === 'string') ? JSON.parse(create) : create;
    const tid = created?.data?.taskId; if (!tid) return null;
    for (let i = 0; i < 9; i++) {                     // <=72s poll budget (nb2 typically ~40s)
      await sleep(8000);
      const poll = await this.helpers.httpRequest({ method: 'GET', url: 'https://api.kie.ai/api/v1/jobs/recordInfo?taskId=' + tid, headers: { 'Authorization': 'Bearer ' + KIE_KEY } });
      const p = (typeof poll === 'string') ? JSON.parse(poll) : poll;
      if (p?.data?.state === 'success') { try { return { url: JSON.parse(p.data.resultJson).resultUrls[0], taskId: tid }; } catch (e) { return null; } }
      if (p?.data?.state === 'fail') return null;
    }
  } catch (e) {}
  return null;
};

let finalUrl = item.imageUrl;
let finalTask = item.task_id;
let finalModel = 'nano-banana-pro';
let fixApplied = '';
const attempts = [];
let verdict = await qa(finalUrl);
attempts.push({ task: item.task_id, score: verdict.score, flags: verdict.flags });

if (verdict.pass === false && verdict.fix_instruction) {
  const fixInstruction = verdict.fix_instruction;
  const fixed = await microEdit(finalUrl, fixInstruction);
  if (fixed && fixed.url) {
    const verdict2 = await qa(fixed.url);
    attempts.push({ task: fixed.taskId, score: verdict2.score, flags: verdict2.flags });
    if ((verdict2.score || 0) >= (verdict.score || 0)) {
      finalUrl = fixed.url; finalTask = fixed.taskId; finalModel = 'nano-banana-2'; fixApplied = fixInstruction; verdict = verdict2;
    }
  } else {
    (verdict.flags = verdict.flags || []).push('microedit_failed');
  }
}

return [{ json: Object.assign({}, item, {
  final_image_url: finalUrl,
  final_task_id: finalTask,
  final_model: finalModel,
  storage_path: 'ads/' + String(finalTask).replace(/[^a-zA-Z0-9_-]/g, '') + '.png',
  qa_score: verdict.score ?? null, qa_pass: verdict.pass !== false,
  qa_flags: (Array.isArray(verdict.flags) ? verdict.flags : []).concat(item.rehost_warnings || []),
  qa_fix_applied: fixApplied,
  qa_attempts: attempts
}) }];
```

**Operator notes:**
- Operator caveat (pre-existing, not a bug): the em-dashes inside the QA-prompt string literals are model-facing prompt data copied verbatim from the base/spec, not user-facing UI/email copy, so the 'avoid em-dashes' preference does not apply and they are valid JS — left as-is.
- Operator caveat (pre-existing, unchanged from base): this node reads $input.first().json and $('Parse Platform').first(), consistent with 'Run Once for All Items' execution inside the Loop Over Items2 iteration; keep the node's run mode as shipped. Also confirm the STEP 3a edit landed on Extract Image URL2 (sku_key + brand_guidelines carried through) so item.sku_key and item.brand_guidelines are populated when this node runs — those are upstream fields, not defined in this node.

---

## 8. `Parse Platform` (B18 — INSERT a block; no full-body rewrite, its v5 code is not in the pack)

Its base code is not in the node pack, so paste this block in, placed BEFORE the node's final `return`. `aspect_ratio` must be a `let` (change `const aspect_ratio` to `let` if needed).

```javascript
// B18: per-brand canvas defaults (first entry = primary aspect)
const brandName = String($('Webhook').first().json.body.client_name || '').toLowerCase();
const BRAND_CANVAS = {
  'natural force': ['16:9', '1:1'],     // 1920x1080 + 1080x1080
  'huckleberry':   ['1:1', '9:16'],     // 1200x1200 + 1080x1920
  'default':       ['9:16', '1:1']
};
const key = Object.keys(BRAND_CANVAS).find(k => k !== 'default' && brandName.includes(k)) || 'default';
const platformExplicit = String($('Webhook').first().json.body.platforms || '').trim() !== '';
if (!platformExplicit) aspect_ratio = BRAND_CANVAS[key][0];
```

---

## 9. `Post to supabase2` (expression body — REPLACE the JSON body; adds `format` to gen_meta)

This is an n8n expression field, not a Code node. Replace the whole JSON body with:

```
={
  "brand_name": {{ JSON.stringify($('Webhook').first().json.body.client_name ?? '') }},
  "image_url": {{ JSON.stringify('https://xakngjsybyytldyqfsmi.supabase.co/storage/v1/object/public/static-ads/' + $('QA Gate + Auto-Fix').item.json.storage_path) }},
  "variant_index": {{ $('QA Gate + Auto-Fix').item.json.variant_index ?? 1 }},
  "platform": {{ JSON.stringify($('Parse Platform').first().json.platform_label ?? '') }},
  "run_id": {{ JSON.stringify($('Webhook').first().json.body.submitted_at ?? '') }},
  "aspect_ratio": {{ JSON.stringify($('Parse Platform').first().json.aspect_ratio ?? '1:1') }},
  "template_index": {{ $('QA Gate + Auto-Fix').item.json.template_index ?? null }},
  "qa_score": {{ $('QA Gate + Auto-Fix').item.json.qa_score ?? null }},
  "qa_flags": {{ JSON.stringify($('QA Gate + Auto-Fix').item.json.qa_flags ?? []) }},
  "qa_notes": {{ JSON.stringify($('QA Gate + Auto-Fix').item.json.qa_fix_applied ?? '') }},
  "gen_meta": {{ JSON.stringify({ concept_id: $('QA Gate + Auto-Fix').item.json.concept_id ?? null, mechanism: $('QA Gate + Auto-Fix').item.json.mechanism ?? '', angle: $('QA Gate + Auto-Fix').item.json.angle ?? '', format: $('QA Gate + Auto-Fix').item.json.format ?? '', carrier: $('QA Gate + Auto-Fix').item.json.carrier ?? '', source: $('QA Gate + Auto-Fix').item.json.source ?? '', is_winner: $('QA Gate + Auto-Fix').item.json.is_winner ?? false, close_repro: $('QA Gate + Auto-Fix').item.json.close_repro ?? false, template_id: $('QA Gate + Auto-Fix').item.json.template_id ?? null, render_task_id: $('QA Gate + Auto-Fix').item.json.task_id ?? null, final_task_id: $('QA Gate + Auto-Fix').item.json.final_task_id ?? null, final_model: $('QA Gate + Auto-Fix').item.json.final_model ?? '', qa_attempts: $('QA Gate + Auto-Fix').item.json.qa_attempts ?? [], expected_copy: $('QA Gate + Auto-Fix').item.json.expected_copy ?? [], prompt: $('QA Gate + Auto-Fix').item.json.prompt ?? '' }) }}
}
```

---

## 10. Delete the dead node (B8)

Delete `Rehost to supabase` from inside the loop and reconnect `Loop Over Items2 -> Generate Ad Copy1` directly.

---

## Cross-node dependency (do not skip)
These full bodies pass new fields down a chain. If you paste only some nodes, the chain breaks silently:
`Build KIE AI Prompt` (adds sku_key + brand_guidelines) -> `Concept Director` (adds concept.format) -> `Prompt Composer` (reads them) -> `Extract Image URL2` (forwards sku_key/format/brand_guidelines) -> `QA Gate + Auto-Fix` (reads sku_key/brand_guidelines) -> `Post to supabase2` (writes gen_meta.format). Paste all of them, or the SKU/format/dossier features degrade to their v6 defaults.
