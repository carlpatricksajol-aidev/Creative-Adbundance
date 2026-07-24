# Upstack Data — Workflow Patch Pack v1 (for the "Test" n8n workflow)

> **v1.1 CORRECTION (2026-07-17) — read before applying Step 3.** The original Step 3 `styleBlock` injected `brand_guidelines` (which begins "Dark-mode by default… violet→magenta gradients") as "the ONLY style authority" and had no preserve-template-background rule. Result: every ad rendered dark purple regardless of the (varied, non-purple) template. **Founder-flagged, A/B-proven.** Use the corrected `styleBlock` below instead: it drops the raw brand_guidelines injection, and makes violet/gold ACCENTS over the template's own background.
>
> ```javascript
> const styleBlock = [
>   'BRAND COLOR RULES (accents only - do NOT repaint the ad):',
>   '- KEEP image 1 background color, lightness and overall color scheme. If image 1 is white / cream / light / any non-purple color, the new ad STAYS that way. Use a dark or purple background ONLY if image 1 itself is dark.',
>   '- Upstack accents, applied OVER image 1 own palette (never a full-frame wash): violet ' + p + ' (support ' + s + ') on one or two key words, a number, or a single highlight; gold ' + a + ' for the single CTA button only.',
>   (brain.brand_fonts ? '- Typography: ' + String(brain.brand_fonts) + ' - bold characterful display headlines, clean humanist sans for body.' : '- Bold display headline, clean humanist sans body.'),
>   '- One brand wordmark only: the lowercase "upstack data" mark, small, natural logo position, high contrast against what is behind it.',
>   '- Premium, high contrast, generous negative space, ONE focal device. If it looks like a landing page it is WRONG.'
> ].filter(Boolean).join('\n');
> ```
> And in the `const prompt` array, change the KEEP line to carry over the background: `'KEEP image 1\'s layout, composition, structure, type hierarchy, panel/carrier treatment, spacing, BACKGROUND COLOR, lightness, overall color scheme, and premium polish. REPLACE only the CONTENT with ' + clientName + ' ...'`.
> Optional DB follow-up: rewrite `brand_guidelines` to drop "Dark-mode by default" (keep the copy-angles part).

Applies the CA v6 learnings to Upstack's fork. Their persistence + template-into-render already work — this pack does NOT touch `Pick Logo + Prepare Binaries`, `Upload to Supabase`, `Wait2`, `Poll Task Status2`, `If3`, `Webhook`, `Decode Reference`, `Extract Brand Colors`, `Parse Platform`, `Shuffle Templates1`, `Search Records1`, `Describe Template Layout`, or `Concept Director`.

What it fixes: the same-purple monotony (hardcoded palette), duplicate variant pairs, ignored uploaded references, weak copy inputs (now fed by voice_of_customer / open_lane / hook_bank research), gpt-image-2 → **nano-banana-pro 2K**, no QA → **QA gate + micro-edit auto-fix**, CA-key leftovers.

---

## STEP 0 — one-time SQL (Upstack Supabase SQL Editor)

```sql
alter table brand_profile
  add column if not exists voice_of_customer text,
  add column if not exists open_lane text,
  add column if not exists hook_bank jsonb;

alter table static_ads
  add column if not exists qa_score int,
  add column if not exists qa_flags jsonb,
  add column if not exists gen_meta jsonb;
```

(The three brand_profile fields get filled by the Brain Builder research — Claude writes them via API once this SQL is run.)

## STEP 1 — `Search Brand Brain1` (replace the whole code)

Same as theirs + returns the three research fields.

```javascript
const SUPABASE_URL = 'https://ctzssidhygyeylckpcdt.supabase.co';
const SERVICE_KEY  = '<SUPABASE_SERVICE_ROLE_KEY>';
const clientName = (($('Webhook').first().json.body) || {}).client_name || 'Upstack Data';

let rows = [];
try {
  const resp = await this.helpers.httpRequest({
    method: 'GET',
    url: SUPABASE_URL + '/rest/v1/brand_profile?brand_name=eq.' + encodeURIComponent(clientName) + '&limit=1',
    headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, Accept: 'application/json' }
  });
  rows = (typeof resp === 'string') ? JSON.parse(resp) : resp;
} catch (e) { rows = []; }
const r = (Array.isArray(rows) && rows.length) ? rows[0] : {};

let logoUrls = [];
try {
  const lresp = await this.helpers.httpRequest({
    method: 'POST',
    url: SUPABASE_URL + '/storage/v1/object/list/brand',
    headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ prefix: '', limit: 1000, sortBy: { column: 'name', order: 'asc' } })
  });
  const larr = (typeof lresp === 'string') ? JSON.parse(lresp) : lresp;
  logoUrls = (larr || [])
    .filter(o => o && o.name && o.id && o.name !== '.emptyFolderPlaceholder' && /\.(png|jpe?g|webp)$/i.test(o.name))
    .map(o => ({ url: SUPABASE_URL + '/storage/v1/object/public/brand/' + o.name }));
} catch (e) { logoUrls = []; }
if (!logoUrls.length && r.logo_url) logoUrls = [{ url: r.logo_url }];

let hookBank = [];
try { hookBank = Array.isArray(r.hook_bank) ? r.hook_bank : (r.hook_bank ? JSON.parse(r.hook_bank) : []); } catch (e) { hookBank = []; }

return [{ json: {
  client_name: r.brand_name || clientName, brand_name: r.brand_name || clientName,
  industry: r.industry || null, vertical: r.vertical || null,
  brand_tone: r.brand_tone || null, brand_personality: r.brand_personality || null,
  target_personas: r.target_personas || null, key_offer: r.key_offer || null,
  core_pain_points: r.core_pain_points || null, product_benefits: r.product_benefits || null,
  competitors: r.competitors || null, creative_boundaries: r.creative_boundaries || null,
  dos_and_donts: r.dos_and_donts || null, compliance_notes: r.compliance_notes || null,
  brand_guidelines: r.brand_guidelines || null, brand_fonts: r.brand_fonts || null,
  primary_color_hex: r.primary_color_hex || null, secondary_color_hex: r.secondary_color_hex || null,
  accent_color_hex: r.accent_color_hex || null,
  voice_of_customer: r.voice_of_customer || '', open_lane: r.open_lane || '',
  hook_bank: hookBank,
  logo_urls: logoUrls, winning_ads: []
}}];
```

## STEP 2 — `Pick Templates1` (replace the whole code)

Fixes: uploaded references are now ALWAYS merged into the pool (they were silently ignored in top_performers); team_top5 never duplicates a winner unless count > pool.

```javascript
const SUPABASE_URL = 'https://ctzssidhygyeylckpcdt.supabase.co';
const SERVICE_KEY  = '<SUPABASE_SERVICE_ROLE_KEY>';

const body  = $('Webhook').first().json.body || {};
const mode  = body.generation_mode || 'top_performers';
const count = parseInt(body.static_ads_count) || 1;

function shuffle(list){ const a=list.slice(); for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;} return a; }

const listBucket = async (bucket, prefix) => {
  try {
    const resp = await this.helpers.httpRequest({
      method: 'POST',
      url: SUPABASE_URL + '/storage/v1/object/list/' + bucket,
      headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ prefix: prefix || '', limit: 1000, sortBy: { column: 'name', order: 'asc' } })
    });
    return (typeof resp === 'string') ? JSON.parse(resp) : (resp || []);
  } catch (e) { return []; }
};
const publicUrl = (bucket, path) => SUPABASE_URL + '/storage/v1/object/public/' + bucket + '/' + path;
const isImg = (n) => /\.(png|jpe?g|webp)$/i.test(n);

if (mode === 'team_top5') {
  const arr = await listBucket('winning-ads', '');
  const urls = arr.filter(o => o && o.name && o.id && isImg(o.name)).map(o => publicUrl('winning-ads', o.name));
  if (!urls.length) throw new Error('team_top5: winning-ads bucket is empty.');
  const pool = shuffle(urls);
  const chosen = [];
  for (var i = 0; i < count; i++) { chosen.push(pool[i % pool.length]); }   // dedup only matters when count > pool
  return chosen.map((url, i) => ({ json: { template_id: 'winner_' + i, template_url: url, source: 'team_top5', variant_index: 1 } }));
}

if (mode === 'competitor') {
  const root = await listBucket('competitor-winners', '');
  let urls = [];
  root.filter(o => o && o.id && o.name && isImg(o.name)).forEach(o => urls.push(publicUrl('competitor-winners', o.name)));
  const folders = root.filter(o => o && o.name && !o.id && o.name !== '.emptyFolderPlaceholder');
  for (const f of folders) {
    const inner = await listBucket('competitor-winners', f.name + '/');
    inner.filter(o => o && o.id && o.name && isImg(o.name)).forEach(o => urls.push(publicUrl('competitor-winners', f.name + '/' + o.name)));
  }
  if (!urls.length) throw new Error('competitor mode: competitor-winners bucket is empty.');
  const refs2 = shuffle(urls).map((url, i) => ({ template_id: 'competitor_' + i, template_url: url, source: 'user_reference' }));
  const chosen = [];
  for (var i = 0; i < count; i++) { chosen.push(refs2[i % refs2.length]); }
  return chosen.map((t, i) => ({ json: Object.assign({}, t, { variant_index: 1 }) }));
}

// top_performers / user_reference: uploaded references ALWAYS join the pool (front of the line)
const refs = (Array.isArray(body.reference_urls) ? body.reference_urls : []).map(String).filter(Boolean);
const refPool = refs.map((url, i) => ({ template_id: 'ref_' + i, template_url: url, source: 'user_reference' }));
const tplPool = $input.all().map(entry => ({
  template_id: String(entry.json.id), template_url: String(entry.json.template_image[0].url), source: 'top_performers'
}));
const base = refPool.concat(shuffle(tplPool));
if (!base.length) throw new Error('No templates and no references available.');
const out = [];
for (var t = 0; t < count; t++) {
  const veh = base[t % base.length];
  for (var v = 0; v < 2; v++) {
    out.push({ json: { template_id: veh.template_id, template_url: veh.template_url, source: veh.source, variant_index: v + 1 } });
  }
}
return out;   // count vehicles x 2 TRULY DIFFERENT variants (hook-differentiated in Step 4)
```

## STEP 3 — `Build KIE AI Prompt` (replace the whole code)

The big one. Kills every hardcoded palette block; the style system now comes from `brand_profile` (dark canvas, violet→magenta gradient, gold CTA, Syne/Manrope). Assigns a DISTINCT hook per variant from `hook_bank`. Renders on **GPT Image 2 at 2K** (Carl's call, A/B tested 2026-07-16 — to try nano-banana-pro later, change `model` to `'nano-banana-pro'`, rename `input_urls` to `image_input`, and add `output_format:'png'` in the two kie_body lines). Passes the real logo as an input image.

```javascript
const items = $input.all();
const brain = $('Search Brand Brain1').first().json;
const body = $('Webhook').first().json.body || {};
const aspect = ($('Parse Platform').first().json.aspect_ratio || '1:1');

const clientName = String(body.client_name || 'Upstack Data');
const isResize = String(body.generation_mode || '').toLowerCase() === 'resize';
const logoUrl = (brain.logo_urls && brain.logo_urls[0] && brain.logo_urls[0].url) ? String(brain.logo_urls[0].url) : null;

// ---------- brand style block: built FROM the profile, zero hardcoded palette ----------
const p = brain.primary_color_hex || '#8535D4';
const s = brain.secondary_color_hex || '#8B86EA';
const a = brain.accent_color_hex || '#FFC53D';
const styleBlock = [
  'BRAND SYSTEM (from brand profile — the ONLY style authority):',
  (brain.brand_guidelines ? '- ' + String(brain.brand_guidelines) : ''),
  '- Core palette: primary ' + p + ', secondary ' + s + ', accent ' + a + ' (accent = the single CTA / one highlight only).',
  (brain.brand_fonts ? '- Typography: ' + String(brain.brand_fonts) + ' — describe as: bold characterful display headlines, clean humanist sans for everything else. Never mix in other typefaces.' : ''),
  '- One brand wordmark only: the lowercase "upstack data" mark, small, natural logo position, high contrast against what is behind it.',
  '- Premium, high contrast, generous negative space (>=35% of the frame calm). ONE focal device per ad. If it looks like a landing page it is WRONG.'
].filter(Boolean).join('\n');

const guardBlock = [
  (brain.dos_and_donts ? 'DOS & DONTS (HIGHEST PRIORITY): ' + String(brain.dos_and_donts) : ''),
  (brain.creative_boundaries ? 'CREATIVE BOUNDARIES: ' + String(brain.creative_boundaries) : ''),
  'CLAIMS: never invent stats, ratings, awards, testimonials, or prices not provided in the copy below.',
  'NO physical product renders — Upstack is software. Proof devices are dashboards, screenshots, documents, messages, receipts.'
].filter(Boolean).join('\n');

// ---------- hook assignment: one DISTINCT hook per variant ----------
const bank = (Array.isArray(brain.hook_bank) && brain.hook_bank.length) ? brain.hook_bank : [
  { hook: "Meta sees 180. You shipped 300.", angle: "platform_gap" },
  { hook: "Your ads aren't broken. Your tracking is.", angle: "reframe" },
  { hook: "You're scaling a leak, not a campaign.", angle: "loss" },
  { hook: "CAC dropped from $68 to $24.", angle: "result" },
  { hook: "Half your purchases never reach Meta.", angle: "gap" },
  { hook: "Your pixel is lying to your algorithm.", angle: "mechanism" }
];

const result = [];
items.forEach(function(entry, i){
  const it = entry.json;
  const source = it.source || 'top_performers';
  const variant = parseInt(it.variant_index) || 1;

  // ---------- RESIZE: nano-banana-2 edit of a finished ad ----------
  if (isResize) {
    const prompt = [
      'RESIZE ONLY, not a redesign. Image 1 is a finished ad. Re-frame the SAME ad into ' + aspect + '.',
      'Keep EVERY word of text exactly as it appears (same wording, spelling, order) and keep the same fonts, colors, icons, cards, charts, logo and overall design.',
      'Do NOT rewrite, restyle, recolor, add, or remove anything. Only re-arrange and gently extend the existing composition so it fills the new shape with comfortable margins. Nothing cropped or cut off.'
    ].join('\n');
    result.push({ json: {
      template_url: it.template_url, template_index: i + 1, variant_index: variant, source: source, is_winner: true,
      prompt: prompt, assigned_hook: null, has_logo: false, logo_index: -1,
      dos_and_donts: String(brain.dos_and_donts || ''), compliance_notes: String(brain.compliance_notes || ''),
      primary_hex: p, secondary_hex: s, accent_hex: a,
      kie_body: { model: 'gpt-image-2-image-to-image', input: { prompt: prompt, input_urls: [it.template_url], aspect_ratio: aspect, resolution: '2K' } }
    }});
    return;
  }

  // ---------- REFERENCE-DRIVEN (all modes): template/winner/reference = layout blueprint ----------
  const hookIdx = (i + (variant - 1) * 7) % bank.length;              // variant 2 lands on a DIFFERENT hook
  const assigned = bank[hookIdx] || bank[0];

  const imageInput = [String(it.template_url)];
  let lIdx = -1;
  if (logoUrl) { lIdx = imageInput.length; imageInput.push(logoUrl); }

  const prompt = [
    'Recreate the PROVEN ad in image 1 as a brand-new ' + clientName + ' static ad, ' + aspect + '.',
    'KEEP image 1\'s layout, composition, structure, type hierarchy, panel/carrier treatment, spacing, and premium polish. REPLACE 100% of its content: every word, number, brand, product, person, face, logo, and chart value. NOTHING from image 1 may remain.',
    (lIdx >= 0 ? 'Image ' + (lIdx + 1) + ' is the real ' + clientName + ' logo — reproduce it exactly, once, small, in the natural logo position; never redraw it.' : 'Render the lowercase wordmark "upstack data" once, small, clean, high-contrast.'),
    '',
    'The copy for this ad is provided below (rendered verbatim). Its headline hook is: "' + String(assigned.hook) + '" (angle: ' + String(assigned.angle || 'core') + ').',
    '',
    styleBlock,
    '',
    guardBlock,
    '',
    'Correct spelling, no em dashes. All text well inside the frame with generous margins. Standalone ad creative only, no platform chrome.'
  ].join('\n');

  result.push({ json: {
    template_url: it.template_url, template_index: Math.floor(i / 2) + 1, variant_index: variant,
    source: source, is_winner: true, assigned_hook: assigned,
    has_logo: lIdx >= 0, logo_index: lIdx, image_input: imageInput,
    dos_and_donts: String(brain.dos_and_donts || ''), compliance_notes: String(brain.compliance_notes || ''),
    primary_hex: p, secondary_hex: s, accent_hex: a,
    prompt: prompt,
    kie_body: { model: 'gpt-image-2-image-to-image', input: { prompt: prompt, input_urls: imageInput, aspect_ratio: aspect, resolution: '2K' } }
  }});
});
return result;
```

## STEP 4 — `Generate Ad Copy1` (replace the whole code)

The copy engine now consumes **voice_of_customer + open_lane + the assigned hook**, so variant 1 and variant 2 of the same template get genuinely different ads. Also exposes `generated_copy_text` for QA.

```javascript
const item = $input.first().json;
const brain = $('Search Brand Brain1').first().json;
const body = $('Webhook').first().json.body || {};
const OPENROUTER_KEY = '<OPENROUTER_API_KEY>';
const isResize = String(body.generation_mode || '').toLowerCase() === 'resize';

let copy = { headline: '', subline: '', cta: '', concept: '', copy_text: '' };
try {
  const brandBlock = [
    'BRAND: ' + (body.client_name || 'Upstack Data'), 'INDUSTRY: ' + (brain.industry || ''),
    'BRAND TONE: ' + (brain.brand_tone || ''), 'KEY OFFER: ' + (brain.key_offer || ''),
    'TARGET AUDIENCE: ' + (brain.target_personas || ''), 'PAIN POINTS: ' + (brain.core_pain_points || ''),
    'PRODUCT BENEFITS: ' + (brain.product_benefits || ''), 'COMPLIANCE: ' + (brain.compliance_notes || ''),
    'CREATIVE BOUNDARIES: ' + (brain.creative_boundaries || '')
  ].join('\n');
  const research = [
    (brain.voice_of_customer ? 'VOICE OF CUSTOMER (write in THIS language, echo these phrasings):\n' + String(brain.voice_of_customer) : ''),
    (brain.open_lane ? 'OPEN LANE (the message territory competitors do NOT claim — this ad should claim it):\n' + String(brain.open_lane) : '')
  ].filter(Boolean).join('\n\n');
  const hook = item.assigned_hook || null;

  const instruction = isResize ? [
    'IMAGE 1 is a finished ad being RESIZED. TRANSCRIBE every piece of visible text EXACTLY as shown, verbatim, word for word, preserving order and line breaks. Do NOT rewrite, rephrase, shorten, fix, translate, or add anything.',
    'Return ONLY JSON: {"concept":"resize - keep identical","copy_text":"ALL text exactly as shown, with line breaks","headline":"exact main headline","subline":"exact secondary line","cta":"exact button text"}'
  ].join('\n') : [
    'IMAGE 1 is a proven reference ad. Identify its CONCEPT and copy structure (mechanism, number of text blocks, narrative).',
    'Then write NEW copy for the brand below following the SAME structure. Rules:',
    (hook ? '- HEADLINE: base it on this hook seed, sharpened to fit the reference structure: "' + String(hook.hook) + '" (angle: ' + String(hook.angle || 'core') + '). Do not drift to a different idea.' : '- HEADLINE: a money-first hook (wallet pain, lost orders, rising CAC), never jargon.'),
    '- SUBLINE: the reason-why in one breath, with a causal connector (so/because/which means) and a named entity (Meta/pixel/Shopify/CAC). Never restate the headline.',
    '- Use ONLY offers/claims present in the brief; invent nothing. No em dashes. Buyer language over marketing language.',
    '', brandBlock, '', research, '',
    'Return ONLY JSON: {"concept":"...","copy_text":"full ad copy with line breaks","headline":"...","subline":"...","cta":"..."}'
  ].join('\n');

  const resp = await this.helpers.httpRequest({ method: 'POST', url: 'https://openrouter.ai/api/v1/chat/completions',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + OPENROUTER_KEY },
    body: JSON.stringify({ model: 'openai/gpt-4o', max_tokens: 600, messages: [{ role: 'user', content: [
      { type: 'image_url', image_url: { url: item.template_url } }, { type: 'text', text: instruction } ] }] }) });
  const parsed = (typeof resp === 'string') ? JSON.parse(resp) : resp;
  const raw = parsed.choices[0].message.content;
  copy = Object.assign(copy, JSON.parse(raw.substring(raw.indexOf('{'), raw.lastIndexOf('}') + 1)));
} catch (e) { copy.headline = (item.assigned_hook && item.assigned_hook.hook) || 'Fix your tracking.'; copy.subline = ''; copy.cta = 'Fix tracking in 5 min'; }

const lines = [ item.prompt, '',
  '-- MATCH THE CONCEPT, NOT JUST THE LOOK --',
  'This reference delivers its message via: ' + (copy.concept || 'see the reference'),
  'Write the following copy onto the ad, in the same positions/lettering as the original:', '',
  (copy.copy_text || [copy.headline, copy.subline, copy.cta].filter(Boolean).join('\n')), '',
  'Render ONLY this copy. Keep it as plain or styled as the original.' ];
const finalPrompt = lines.join('\n');

const kie = Object.assign({}, item.kie_body);
kie.input = Object.assign({}, kie.input, { prompt: finalPrompt });

return [{ json: Object.assign({}, item, {
  prompt: finalPrompt, kie_body: kie,
  generated_headline: copy.headline, generated_subline: copy.subline, generated_cta: copy.cta,
  generated_concept: copy.concept || '', generated_copy_text: copy.copy_text || ''
}) }];
```

## STEP 5 — `Create KIE AI Task1` (replace the JSON body only)

```
={{ JSON.stringify($json.kie_body) }}
```

(Header keeps their KIE key `b87d049f...`. `gpt-image-2-image-to-image` + `input_urls` + `resolution:"2K"` at 1:1 was live-verified on KIE 2026-07-16. Note: gpt-image-2 constraints — 1:1 cannot do 4K; 4:5/5:4 are 1K-only, so if you later add 4:5 platforms drop resolution for those.)

## STEP 6 — `Extract Image URL2` (replace the whole code)

```javascript
const data = $input.first().json?.data ?? {};
let imageUrl = null;
try {
  const resultJson = data.resultJson ? JSON.parse(data.resultJson) : null;
  imageUrl = resultJson?.resultUrls?.[0] ?? null;
} catch (e) { imageUrl = null; }

const src = $('Generate Ad Copy1').first().json;
const taskId = $('Create KIE AI Task1').first().json?.data?.taskId ?? ('noid-' + Date.now());

const fullCopy = String(src.generated_copy_text || '').trim();
const expectedCopy = fullCopy
  ? fullCopy.split('\n').map(t => t.trim()).filter(Boolean)
  : [src.generated_headline, src.generated_subline, src.generated_cta].filter(Boolean);

return [{ json: {
  imageUrl, task_id: taskId,
  variant_index: src.variant_index ?? 1, template_index: src.template_index ?? null, template_id: src.template_id ?? null,
  source: src.source, assigned_hook: src.assigned_hook || null,
  expected_copy: expectedCopy, has_logo: src.has_logo === true,
  primary_hex: src.primary_hex, secondary_hex: src.secondary_hex, accent_hex: src.accent_hex,
  dos_and_donts: src.dos_and_donts || '', compliance_notes: src.compliance_notes || '',
  prompt: src.prompt, record_id: src.record_id ?? null
}}];
```

## STEP 7 — NEW node: `QA Gate + Auto-Fix` (Code)

**Insert between `Extract Image URL2` and `Pick Logo + Prepare Binaries`** (wire: Extract Image URL2 → QA Gate + Auto-Fix → Pick Logo + Prepare Binaries). Ported from the reviewed CA v6 gate: arrow functions, parse-first, null-score on outage, micro-edit retry on `nano-banana-2`. It outputs `imageUrl` = the final (possibly fixed) image, so `Pick Logo + Prepare Binaries` needs **no change**.

```javascript
const item = $input.first().json;
const OPENROUTER_KEY = '<OPENROUTER_API_KEY>';
const KIE_KEY = 'b87d049f32c4a237652a9bd43d984938';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

if (!item.imageUrl) {
  throw new Error('KIE reported success but returned no result URL (taskId ' + item.task_id + ').');
}

const expectedCopy = item.expected_copy || [];
const hasExpectedCopy = expectedCopy.length > 0;

const qa = async (imageUrl) => {
  const checks = [];
  if (hasExpectedCopy) checks.push('(1) every expected copy string rendered verbatim and legibly', '(2) no extra, garbled, or nonsense text beyond the expected copy');
  checks.push('(3) logo: ' + (item.has_logo ? 'the supplied real logo appears once, correct, not redrawn' : 'exactly one small lowercase "upstack data" wordmark, nothing invented beyond it'),
              '(4) brand palette respected (' + [item.primary_hex, item.secondary_hex, item.accent_hex].filter(Boolean).join(', ') + ', dark-mode premium)',
              '(5) no DONT violations', '(6) no rendering artifacts, no clipped text at edges, not cluttered (one focal device, generous negative space)');
  const qaPrompt = [
    'You are a strict ad-QA reviewer. Inspect this rendered static ad image.',
    hasExpectedCopy ? 'EXPECTED ON-IMAGE COPY (verbatim): ' + JSON.stringify(expectedCopy) : 'No specific copy expected; judge design, logo, palette, compliance, artifacts only.',
    'BRAND DONTS: ' + (item.dos_and_donts || '(none)'),
    'COMPLIANCE: ' + (item.compliance_notes || '(none)'),
    'Check: ' + checks.join(', ') + '.',
    'Return ONLY JSON: {"score": 1-10 integer, "pass": true/false, "flags": ["short_snake_case"...], "fix_instruction": "ONE short imperative edit fixing the worst problem while keeping everything else identical. Empty if pass."}'
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
    for (let i = 0; i < 9; i++) {
      await sleep(8000);
      const poll = await this.helpers.httpRequest({ method: 'GET', url: 'https://api.kie.ai/api/v1/jobs/recordInfo?taskId=' + tid, headers: { 'Authorization': 'Bearer ' + KIE_KEY } });
      const pl = (typeof poll === 'string') ? JSON.parse(poll) : poll;
      if (pl?.data?.state === 'success') { try { return { url: JSON.parse(pl.data.resultJson).resultUrls[0], taskId: tid }; } catch (e) { return null; } }
      if (pl?.data?.state === 'fail') return null;
    }
  } catch (e) {}
  return null;
};

let finalUrl = item.imageUrl;
let finalTask = item.task_id;
let finalModel = 'gpt-image-2-image-to-image';
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
  } else { (verdict.flags = verdict.flags || []).push('microedit_failed'); }
}

return [{ json: Object.assign({}, item, {
  imageUrl: finalUrl,                       // Pick Logo + Prepare Binaries consumes this unchanged
  final_task_id: finalTask, final_model: finalModel,
  qa_score: verdict.score ?? null, qa_pass: verdict.pass !== false,
  qa_flags: Array.isArray(verdict.flags) ? verdict.flags : [],
  qa_fix_applied: fixApplied, qa_attempts: attempts
}) }];
```

## STEP 8 — `Post to supabase2` (replace the JSON body — needs STEP 0's static_ads SQL)

```
={
  "brand_name": {{ JSON.stringify($('Webhook').first().json.body.client_name ?? '') }},
  "image_url": {{ JSON.stringify('https://ctzssidhygyeylckpcdt.supabase.co/storage/v1/object/public/static-ads-final/' + $('Pick Logo + Prepare Binaries').item.json.fileName) }},
  "variant_index": {{ $('Pick Logo + Prepare Binaries').item.json.variant_index ?? 1 }},
  "platform": {{ JSON.stringify($('Parse Platform').first().json.platform_label ?? '') }},
  "run_id": {{ JSON.stringify($('Webhook').first().json.body.submitted_at ?? '') }},
  "qa_score": {{ $('QA Gate + Auto-Fix').item.json.qa_score ?? null }},
  "qa_flags": {{ JSON.stringify($('QA Gate + Auto-Fix').item.json.qa_flags ?? []) }},
  "gen_meta": {{ JSON.stringify({ source: $('QA Gate + Auto-Fix').item.json.source ?? '', template_id: $('QA Gate + Auto-Fix').item.json.template_id ?? null, hook: ($('QA Gate + Auto-Fix').item.json.assigned_hook?.hook) ?? '', angle: ($('QA Gate + Auto-Fix').item.json.assigned_hook?.angle) ?? '', render_task_id: $('QA Gate + Auto-Fix').item.json.task_id ?? null, final_task_id: $('QA Gate + Auto-Fix').item.json.final_task_id ?? null, final_model: $('QA Gate + Auto-Fix').item.json.final_model ?? '', qa_attempts: $('QA Gate + Auto-Fix').item.json.qa_attempts ?? [], expected_copy: $('QA Gate + Auto-Fix').item.json.expected_copy ?? [] }) }}
}
```

## STEP 9 — delete `Rehost to supabase`

It's dead code here (Upstack has no Airtable URLs) and it contains **Creative Adbundance's KIE key**. Delete the node and wire `Loop Over Items2` (second output) → `Generate Ad Copy1` directly.

## Known limitation (deferred, on purpose)
Multi-platform runs still render everything at the FIRST platform's aspect ratio (`Parse Platform.first()` is read everywhere, and the templates bucket only has `square/`). Run one platform per submission for now; proper per-platform fan-out + vertical templates (or a resize pass per ad) is phase 2.

## Smoke test
`generation_mode: top_performers`, `static_ads_count: 2`, one platform. Expect: 4 ads (2 templates × 2 variants), **each variant pair has DIFFERENT headlines** (different hooks), style = dark-mode violet gradient + gold (not lavender), real logo or clean lowercase wordmark, `qa_score`/`gen_meta` populated in `static_ads`, images in `static-ads-final`.
