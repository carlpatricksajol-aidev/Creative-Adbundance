# Static Ads v6 — Node Pack (v1.1, post-review)

Reviewed adversarially by 3 independent passes; all blockers/majors fixed in this version. Install order matters.

Wiring after install:
`Webhook → Decode Reference → Search Brand Brain1 → Extract Brand Colors → Parse Platform → Search records1 → Shuffle Templates1 → Pick Templates1 (v6) → Describe Template Layout (unchanged) → Concept Director (v6) → Build KIE AI Prompt (v6) → Loop Over Items2 → [Rehost to supabase (no-op, keep or delete) → Generate Ad Copy1 (ONE line added) → Prompt Composer (NEW) → Create KIE AI Task1 (body swap) → Wait2 → Poll Task Status2 → If3 → Extract Image URL2 (v6) → QA Gate + Auto-Fix (NEW) → Download Ad Image (NEW) → Upload to Supabase Storage (NEW) → Post to supabase2 (body swap)] → loop`

---

## STEP 0 — preconditions (do these first)

**0a. SQL (Supabase SQL Editor):**
```sql
alter table static_ads add column if not exists gen_meta jsonb;
select column_name, data_type from information_schema.columns
where table_name = 'static_ads' and column_name in ('qa_flags','qa_score','qa_notes');
```
If `qa_flags` is plain `text` (not jsonb/text[]/ARRAY), tell me — the INSERT body needs one change. If `qa_score` is integer we're fine (the QA node rounds).

**0b. n8n task-runner timeout.** The QA node can run ~100s and Concept Director makes several LLM calls. If your instance has task runners enabled with the default 60s limit, long Code nodes get killed. Set env `N8N_RUNNERS_TASK_TIMEOUT=360` (or confirm runners are disabled). Your v5 already runs 30-90s Code nodes, so this is likely already fine — verify, don't assume.

**0c. Loop batch size.** Confirm `Loop Over Items2` has Batch Size = 1 (the default and what v5's polling pattern implies). The new nodes process one item per iteration.

**0d. Pinned test data.** The Webhook pin is `Tapouts / team_top5` — Tapouts has no `winning_ads`, and v6 now FAILS LOUDLY on that instead of silently falling back. Before smoke-testing in the editor, change the pinned `generation_mode` to `"top_performers"` (production webhook calls ignore pinData).

**0e. Guard visibility.** The new guards throw useful errors, but the form responds 200 before they run. Optional: attach an n8n Error Workflow that emails/Slacks the error + client_name so a rejected run is noticed.

---

## STEP 1 — `Pick Templates1` (replace the whole code)

Guards (brand substance, team_top5, user_reference), rehost-FIRST for all Airtable URLs, rehost-failure tagging, `_logo_hosted` on every item.

```javascript
const body = $('Webhook').first().json.body || {};
const mode = body.generation_mode || 'top_performers';
const count = parseInt(body.static_ads_count) || 1;
const brainItem = $('Search Brand Brain1').first();
const brain = brainItem && brainItem.json ? brainItem.json : null;
const KIE_KEY = 'fef7e0d9d3bd971d5f1ebe1ec8318a1e';

// ---- GUARDS ----
const usable = brain && ['brand_tone','target_personas','core_pain_points','product_benefits','key_offer']
  .some(f => String(brain[f] || '').trim());
if (!usable) {
  throw new Error('Brand Brain row for "' + (body.client_name || '') + '" is missing or has no creative substance (tone/personas/pains/benefits/offer all empty). Fix the Airtable row before generating.');
}

// ---- rehost helper (Airtable URLs expire ~2h; Anthropic vision cannot fetch them) ----
const rehostWarnings = [];
const pickExt = (url) => {
  const m = String(url).toLowerCase().match(/\.(png|jpe?g|webp|gif)(\?|$|#)/);
  if (!m) return 'png';
  return m[1] === 'jpeg' ? 'jpg' : m[1];
};
let seq = 0;
const rehost = async (url, label) => {
  if (!url || String(url).indexOf('airtableusercontent.com') === -1) return url;
  seq += 1;
  const fileName = 'sa6-' + Date.now() + '-' + seq + '.' + pickExt(url);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await this.helpers.httpRequest({
        method: 'POST', url: 'https://kieai.redpandaai.co/api/file-url-upload',
        headers: { 'Authorization': 'Bearer ' + KIE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileUrl: String(url), uploadPath: 'static-ads-inputs', fileName: fileName })
      });
      const p = (typeof resp === 'string') ? JSON.parse(resp) : resp;
      if (p && p.data && p.data.downloadUrl) return p.data.downloadUrl;
    } catch (e) {}
  }
  rehostWarnings.push('rehost_failed:' + (label || 'asset'));
  return url;
};

const logoRaw = (brain.logo_urls && brain.logo_urls[0] && brain.logo_urls[0].url) ? String(brain.logo_urls[0].url) : null;
const logoHosted = logoRaw ? await rehost(logoRaw, 'logo') : null;
const logoOk = !!(logoHosted && String(logoHosted).indexOf('airtableusercontent.com') === -1);

function shuffle(list){ const a=list.slice(); for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;} return a; }
const stamp = (o) => Object.assign({}, o, { _logo_hosted: logoOk ? logoHosted : null, _rehost_warnings: rehostWarnings.slice() });

// ---- team_top5: winners or FAIL LOUDLY ----
if (mode === 'team_top5') {
  const winners = (Array.isArray(brain.winning_ads) ? brain.winning_ads : [])
    .map(a => (a && a.url) ? String(a.url) : null).filter(Boolean);
  if (!winners.length) {
    throw new Error('generation_mode=team_top5 but "' + (body.client_name || '') + '" has no winning_ads attachments in Brand Brain. Upload winners or pick another mode.');
  }
  const out = [];
  for (let i = 0; i < winners.length; i++) {
    out.push({ json: stamp({ template_id: 'winner_' + i, template_url: await rehost(winners[i], 'winner_' + i), source: 'team_top5' }) });
  }
  return out;
}

// ---- user_reference: references or FAIL LOUDLY ----
const refs = (Array.isArray(body.reference_urls) ? body.reference_urls : []).map(String).filter(Boolean);
if (mode === 'user_reference' && !refs.length) {
  throw new Error('generation_mode=user_reference but no reference_urls arrived from the form. Re-upload the reference ads.');
}
const refPool = refs.map((url, i) => ({ template_id: 'ref_' + i, template_url: url, source: 'user_reference' }));

// ---- CreativeOS templates ----
const targetAds = count * 2;
const templateAdsNeeded = Math.max(0, targetAds - refPool.length);
const templatesNeeded = Math.ceil(templateAdsNeeded / 2);
const tplPool = $input.all().map(entry => ({
  template_id: String(entry.json.id),
  template_url: String(entry.json.template_image[0].url),
  source: 'top_performers'
}));
const chosenTpls = shuffle(tplPool).slice(0, Math.min(templatesNeeded, tplPool.length));
const out = [];
for (const t of refPool) out.push({ json: stamp(t) });
for (const t of chosenTpls) out.push({ json: stamp({ template_id: t.template_id, template_url: await rehost(t.template_url, 'tpl_' + t.template_id), source: t.source }) });
return out;
```

`Describe Template Layout`: NO change — it now receives fetchable URLs, so its haiku vision finally works.

---

## STEP 2 — `Concept Director` (replace the whole code)

LLM **selection** of mechanism×angle×carrier (fit + diversity + asset gates, shape-validated), then generation **per concept** in parallel chunks of 3 (keeps wall-clock and timeout budgets sane).

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
const primaryHex = colorSrc.primary_color_hex || brain.primary_color_hex || '';
const secondaryHex = colorSrc.secondary_color_hex || brain.secondary_color_hex || '';
const accentHex = colorSrc.accent_color_hex || brain.accent_color_hex || '';

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
    '',
    'Pick the ' + slotsWanted + ' BEST-FIT mechanism+angle pairs for THIS brand and audience. Rules:',
    '- Fit first: pick what this vertical/persona actually responds to. No pair may violate DOS_AND_DONTS or CREATIVE_BOUNDARIES (e.g. if photorealistic children are forbidden, UGC/persona concepts must feature adults).',
    '- Diversity: no mechanism twice unless slots > 6; vary angles.',
    '- If HAS_PRODUCT_ASSET is false, never pick a mechanism that requires showing a product.',
    '- For each pair also propose a CARRIER: the real-world physical object or named format the ad text will live on (handwritten sign, sticky note, torn notepad page, check mailer, roadside marquee, app-screenshot UI, editorial print layout, quote card, billboard...). The carrier is what makes rendered text look native.',
    'Return ONLY a JSON array of exactly ' + slotsWanted + ' objects: [{"mechanism":"...","angle":"...","carrier":"...","why":"one line"}]. No markdown.'
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
    return { mechanism: mech, angle: (p.angle && ANGLES.indexOf(String(p.angle)) !== -1) ? String(p.angle) : ANGLES[0], carrier: String(p.carrier || '').trim() || 'clean editorial layout', why: String(p.why || '') };
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
      'MECHANISM (fixed): ' + pair.mechanism, 'ANGLE (fixed): ' + pair.angle,
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

---

## STEP 3 — `Build KIE AI Prompt` (replace the whole code)

Data assembler with a hard **8-image cap** (nano-banana-pro limit) — template, avatar, and logo keep priority; product list is trimmed to fit; indices computed AFTER the cap so "image N" references stay true.

```javascript
const items = $input.all();
const brain = $('Search Brand Brain1').first().json;
const body = $('Webhook').first().json.body || {};

const clientName = String(body.client_name || 'this brand');
const allProductUrls = Array.isArray(body.product_image_urls) ? body.product_image_urls.map(String).filter(Boolean) : (body.product_image_url ? [String(body.product_image_url)] : []);
const productNames = Array.isArray(body.product_names) ? body.product_names.map(String).filter(Boolean) : (body.product_name ? String(body.product_name).split(',').map(s=>s.trim()).filter(Boolean) : []);
const avatarUrl = (body.ugc_avatar_url && String(body.ugc_avatar_url).trim()) ? String(body.ugc_avatar_url).trim() : null;

const MAX_IMAGES = 8; // nano-banana-pro hard limit

const result = [];
items.forEach((entry, i) => {
  const it = entry.json;
  const source = it.source || 'top_performers';
  const isWinner = it.is_winner === true || ['team_top5','client_winners','user_reference'].indexOf(source) >= 0;
  const logoHosted = it._logo_hosted || null;

  // budget slots: template(1) + avatar(0/1) + logo(0/1) reserved; products fill the rest
  const reserved = (it.template_url ? 1 : 0) + (avatarUrl ? 1 : 0) + (logoHosted ? 1 : 0);
  const products = allProductUrls.slice(0, Math.max(0, MAX_IMAGES - reserved));

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
    client_name: clientName, rehost_warnings: it._rehost_warnings || [],
    prompt: '' // written by Prompt Composer
  }});
});
return result;
```

---

## STEP 4 — `Generate Ad Copy1` (ONE line changed)

In the **winner branch**, find the final `return` line and add `generated_copy_text`:

```javascript
return [{ json: Object.assign({}, item, { prompt: lines.join('\n'), generated_headline:copy.headline, generated_subline:copy.subline, generated_cta:copy.cta, generated_concept:copy.concept||'', generated_copy_text: copy.copy_text || '' }) }];
```

(Without this, text-rich winners lose their full copy structure and QA falsely flags the faithful reproduction.)

---

## STEP 5 — NEW node: `Prompt Composer` (Code)

**Insert between `Generate Ad Copy1` and `Create KIE AI Task1`.**

```javascript
const item = $input.first().json;
const OPENROUTER_KEY = '<OPENROUTER_API_KEY>';
const aspect = ($('Parse Platform').first().json.aspect_ratio || '1:1');

// ---------- WINNER ----------
if (item.is_winner) {
  const refContract = (item.image_roles || []).map((r, i) => 'Image ' + (i + 1) + ' is the ' + r + '.').join(' ');
  const fullCopy = String(item.generated_copy_text || '').trim();
  const copyBlock = fullCopy || [item.generated_headline, item.generated_subline, item.generated_cta].filter(Boolean).join('\n');
  const copyLines = copyBlock
    ? ['Render this copy verbatim, in the same positions and lettering style as the original:', copyBlock]
    : ['Write new copy for ' + item.client_name + ' in the same positions, lengths, and lettering style as the original; keep every claim generic and brand-safe.'];
  const lines = item.close_repro ? [
    'Recreate the reference ad (image 1) for ' + item.client_name + ' as a finished static ad, ' + aspect + '.',
    'Reproduce its EXACT layout, composition, style, lighting, lettering style, and branding level. Change ONLY: the brand (now ' + item.client_name + '), the featured product/object' + (item.product_index >= 0 ? ' (use the exact product from image ' + (item.product_index + 1) + ', reproduce label and shape faithfully)' : ' (adapt to this brand\'s service)') + ', and the copy.',
    refContract,
    (item.logo_index >= 0 ? 'Reproduce the brand logo from image ' + (item.logo_index + 1) + ' exactly, one placement, only if the reference format shows a logo.' : 'No brand logo was supplied: do not invent one; if the reference has a logo zone, leave it as clean space.'),
    ...copyLines,
    'No other brand names or text may remain from the original. Keep it as plain or as designed as the reference — add nothing it does not have. Keep all text well inside the frame.'
  ] : [
    'Create a NEW static ad for ' + item.client_name + ', ' + aspect + ', INSPIRED BY the reference (image 1): keep its concept, hook mechanism, format and tone, but change the execution (different composition, setting, people).',
    refContract,
    (item.logo_index >= 0 ? 'Reproduce the brand logo from image ' + (item.logo_index + 1) + ' exactly, one placement.' : 'No brand logo was supplied: do not invent one; leave clean space top-right.'),
    ...copyLines,
    'Colors: ' + [item.primary_hex, item.secondary_hex, item.accent_hex].filter(Boolean).join(', ') + '. No other brand names or text from the original. Keep all text well inside the frame.'
  ];
  const finalPrompt = lines.filter(Boolean).join('\n');
  return [{ json: Object.assign({}, item, { prompt: finalPrompt, kie_body: { model: 'nano-banana-pro', input: { prompt: finalPrompt, image_input: item.image_input, aspect_ratio: aspect, resolution: '2K', output_format: 'png' } } }) }];
}

// ---------- NON-WINNER: LLM writes the art-director prompt ----------
const c = item.concept || {};
const blocks = (Array.isArray(c.copy_blocks) ? c.copy_blocks : []).filter(b => b && String(b.text || '').trim());
const copyList = blocks.map(b => '- [' + (b.role || 'text') + ' @ ' + (b.position || 'anywhere') + '] "' + String(b.text).trim() + '"').join('\n');
const refContract = (item.image_roles || []).map((r, i) => 'image ' + (i + 1) + ' = ' + r).join('; ');
const paletteWords = [item.primary_hex ? ('primary ' + item.primary_hex) : '', item.secondary_hex ? ('secondary ' + item.secondary_hex) : '', item.accent_hex ? ('accent ' + item.accent_hex) : ''].filter(Boolean).join(', ');
const photographic = /UGC|SELFIE|LIFESTYLE|PERSONA/i.test(String(c.mechanism || ''));
const noLogoClause = item.has_logo ? '' : ' No brand logo was supplied: the ad must NOT contain any logo, wordmark, or logo-like badge; where the layout expects a logo, leave clean space.';

const composerPrompt = [
  'Write ONE image-generation prompt for a static ad. Output ONLY the prompt text (no preamble, no markdown, no quotes around the whole thing).',
  '',
  'Follow this exact anatomy (reverse-engineered from top-performing generations):',
  '1. First clause declares the artifact: "Static ad, ' + aspect + '..." or "Photorealistic UGC-style photograph..." depending on the concept.',
  '2. Describe ONE committed visual scene: ' + String(c.visual_direction || ''),
  '3. The text lives on this physical carrier — make it physically real (material, shadow, texture): ' + String(c.carrier || 'a clean designed layout'),
  '4. Use named zones (top / center / bottom) and place each copy string in its zone, QUOTED VERBATIM with exact casing:',
  copyList || '(no copy strings — pure visual)',
  '5. Typography: describe the typeface character in plain words' + (item.brand_fonts ? ' (brand fonts are ' + item.brand_fonts + ' — describe their look, e.g. rounded friendly sans, elegant serif)' : '') + '; one weight/color note per text element.',
  '6. Palette: ' + (paletteWords || 'derive from the brand assets') + (photographic ? ' — for this photographic concept use brand color as a NATURAL accent only (marker ink, clothing, an object), not a color-graded wash; natural imperfect lighting, shot-on-phone feel.' : ' — state each hex ONCE next to the element that uses it.'),
  (item.image_roles && item.image_roles.length
    ? '7. Reference contract, include verbatim-style lines: ' + refContract + '. Template/layout images: follow their structure and hierarchy but replace ALL content and branding. Product images: reproduce the exact product, label and shape faithfully. Logo image: reproduce exactly, one placement, never redraw.' + noLogoClause
    : '7. No input images.' + noLogoClause),
  '8. Composition safety: all text and key subjects sit well inside the frame with generous margins (safe zone about 86% of canvas); nothing touches the edges.',
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

---

## STEP 6 — `Create KIE AI Task1` (replace the JSON body only)

```
={{ JSON.stringify($json.kie_body) }}
```

Verified: the live v5 body has no callBackUrl (Wait2 is a plain wait), so the whole-body swap is safe. `nano-banana-pro` + `image_input` + `resolution:"2K"` + `output_format:"png"` live-verified today.

---

## STEP 7 — `Extract Image URL2` (replace the whole code)

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
  template_index: src.template_index, template_id: src.template_id,
  prompt: src.prompt,
  expected_copy: expectedCopy,
  copy_blocks: src.concept?.copy_blocks || [],
  has_logo: src.has_logo === true, logo_index: src.logo_index,
  primary_hex: src.primary_hex, secondary_hex: src.secondary_hex, accent_hex: src.accent_hex,
  dos_and_donts: src.dos_and_donts, compliance_notes: src.compliance_notes,
  rehost_warnings: src.rehost_warnings || []
}}];
```

---

## STEP 8 — NEW node: `QA Gate + Auto-Fix` (Code)

**Insert between `Extract Image URL2` and `Download Ad Image`.** Arrow functions (correct `this` capture), parse-first response handling, null-score on QA outage (never fabricates a score), copy checks skipped when no expected copy, micro-edit poll capped at ~72s, final model/task attribution for the learning loop.

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
  checks.push('(3) logo per the rule above', '(4) palette respected for designed ads (photographic ads only need a natural brand accent)', '(5) no DONT violations', '(6) no anatomical or rendering artifacts, no clipped text at edges');
  const qaPrompt = [
    'You are a strict ad-QA reviewer. Inspect this rendered static ad image.',
    hasExpectedCopy ? 'EXPECTED ON-IMAGE COPY (verbatim): ' + JSON.stringify(expectedCopy) : 'No specific copy is expected; judge only design, logo, palette, compliance, artifacts.',
    'BRAND PALETTE: ' + [item.primary_hex, item.secondary_hex, item.accent_hex].filter(Boolean).join(', '),
    'LOGO: ' + (item.has_logo ? 'a real brand logo image was supplied — it must appear correctly, not a redrawn or invented wordmark.' : 'NO logo was supplied — the ad must NOT contain an invented logo or fake wordmark badge.'),
    'BRAND DONTS (each is a hard violation if depicted): ' + (item.dos_and_donts || '(none)'),
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

---

## STEP 9 — persistence pair + INSERT

**Node A — `Download Ad Image`** (HTTP Request, after QA Gate):
- GET, URL: `={{ $json.final_image_url }}`
- Options → Response → Response Format: **File**

**Node B — `Upload to Supabase Storage`** (HTTP Request, after Node A):
- POST, URL: `=https://xakngjsybyytldyqfsmi.supabase.co/storage/v1/object/static-ads/{{ $('QA Gate + Auto-Fix').item.json.storage_path }}`
- Headers: `Authorization: Bearer <SERVICE_ROLE_JWT>`, `apikey: <SERVICE_ROLE_JWT>`, `Content-Type: image/png`, `x-upsert: true`
- Body Content Type: **n8n Binary File**, Input Data Field Name: `data`
- (Binary must go through HTTP Request NODES — Code-node httpRequest corrupts binary, proven in this project.)

**`Post to supabase2`** — replace the JSON body (writes permanent URL, QA results, and the full generation record):

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
  "gen_meta": {{ JSON.stringify({ concept_id: $('QA Gate + Auto-Fix').item.json.concept_id ?? null, mechanism: $('QA Gate + Auto-Fix').item.json.mechanism ?? '', angle: $('QA Gate + Auto-Fix').item.json.angle ?? '', carrier: $('QA Gate + Auto-Fix').item.json.carrier ?? '', source: $('QA Gate + Auto-Fix').item.json.source ?? '', is_winner: $('QA Gate + Auto-Fix').item.json.is_winner ?? false, close_repro: $('QA Gate + Auto-Fix').item.json.close_repro ?? false, template_id: $('QA Gate + Auto-Fix').item.json.template_id ?? null, render_task_id: $('QA Gate + Auto-Fix').item.json.task_id ?? null, final_task_id: $('QA Gate + Auto-Fix').item.json.final_task_id ?? null, final_model: $('QA Gate + Auto-Fix').item.json.final_model ?? '', qa_attempts: $('QA Gate + Auto-Fix').item.json.qa_attempts ?? [], expected_copy: $('QA Gate + Auto-Fix').item.json.expected_copy ?? [], prompt: $('QA Gate + Auto-Fix').item.json.prompt ?? '' }) }}
}
```

Tail wiring: `Extract Image URL2 → QA Gate + Auto-Fix → Download Ad Image → Upload to Supabase Storage → Post to supabase2 → Loop Over Items2`.
The old `Rehost to supabase` loop node is a verified no-op in v6 — keep (add a comment) or delete.

---

## Smoke test (after all steps)
1. Set the pinned Webhook `generation_mode` to `"top_performers"` (see 0d), count 1, client Grade Potential or Tapouts.
2. Run once from the editor. Expect: 2 concepts with DIFFERENT mechanisms, a composed art-director prompt per ad (readable in Prompt Composer output), nano-banana-pro renders, QA scores in the output, and rows in `static_ads` whose `image_url` starts with `https://xakngjsybyytldyqfsmi.supabase.co/storage/...`.
3. Open both stored URLs — they must render, and must still render tomorrow (that's the whole point).

## Cost per shipped ad (typical)
nano-banana-pro 2K $0.09 + QA vision ~$0.01 + concept/composer LLM ~$0.03 + retry amortized ~$0.02 → **≈ $0.15**, all on KIE + OpenRouter. Zero Higgsfield credits.
