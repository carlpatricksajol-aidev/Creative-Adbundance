# Static Ads Pipeline — Session Handoff
**Date:** 2026-06-02
**Project:** Creative Ad•Bundance — Automated Static Ad Production
**Working directory:** `c:\Clients\Creative Adbundance\Creative-Adbundance`

---

## Stack

| Layer | Tool | Notes |
|---|---|---|
| Automation | n8n (hosted) | `https://n8n-i3t9.srv1486031.hstgr.cloud` |
| Image generation | KIE AI — `gpt-image-2-image-to-image` | Endpoint: `POST /api/v1/jobs/createTask` |
| Ad copy | OpenRouter — `anthropic/claude-sonnet-4` | Via HTTP Request node |
| QA scoring | OpenRouter — `anthropic/claude-haiku-4.5` | Via HTTP Request node (QA Pass node) |
| Brand colors extraction | OpenRouter — `anthropic/claude-haiku-4.5` | Extract Brand Colors node |
| Template concept analysis | OpenRouter — `anthropic/claude-haiku-4.5` | Inside Build KIE AI Prompt loop |
| Brand data | Airtable `appvCkX59PBphJGOd` | Tables: Brand Brain, CreativeOS Templates |
| Storage | Supabase `xakngjsybyytldyqfsmi` | Buckets: `ad-references`, `product-images` |
| Intake form | SA-1 HTML form | File: `Docs/Static Ads Generator/static ads html.md` |
| Ad library | Same HTML file | Library view built into the form |

---

## n8n Workflow — Node Map

```
Webhook → Decode Reference → Search Brand Brain → Extract Brand Colors
→ Has Reference? (true/false branches)
→ Search records (Airtable CreativeOS Templates)
→ Shuffle Templates → Pick Templates
→ Build KIE AI Prompt   ← MAIN NODE (full code below)
→ Loop Over Items
→ Generate Ad Copy
→ Create KIE AI Task
→ Wait → Poll KIE AI Status → If (success)
→ Extract Image URL
→ QA Pass (Claude Haiku vision)
→ Merge QA
→ Post to Supabase
```

---

## What Was Done This Session

### 1. SA-1 Form (`Docs/Static Ads Generator/static ads html.md`)

**Changes made:**

**a) Generation Mode selector** — added before Platform section in Static Ads form. 4 radio options:
- `top_performers` — use Airtable CA templates (DEFAULT, current behavior)
- `client_winners` — use client's own proven ads as reference
- `user_reference` — use uploaded references as primary creative direction
- `team_top5` — coming soon (greyed out, awaiting Xandria's 5 formats)

Sends `generation_mode` in webhook payload.

**b) UGC Avatar upload** — added after Reference notes section. Single image upload, uploads to Supabase `ad-references` bucket with `avatar_` prefix. Sends `ugc_avatar_url` in webhook payload.

**c) Delete bug fix** — single ad deletion now:
- Adds `data-ad-id` attribute to each card
- Removes card from DOM immediately on confirm (instant feedback)
- Uses `refreshBrandContent()` instead of `selectBrandView()` for re-render

### 2. n8n — `Pick Templates` node (updated)

Slot allocation guarantees at least 1 Airtable (top performer) template when `count > 1`, even if user uploads references. Formula:
```javascript
const minAirtableSlots = count > 1 ? 1 : 0;
const refSlots      = Math.min(refCount, count - minAirtableSlots);
const airtableSlots = count - refSlots;
```

### 3. n8n — `Build KIE AI Prompt` node (full code below)

Major architectural change from previous version:
- Template image is LAST in `input_urls` (lowest influence)
- Product is FIRST in `input_urls` (visual anchor)
- Logo is SECOND
- Template's role changed from "visual input" to "fill-in-the-zones" — AI keeps the template's layout and fills in the brand's product/logo/copy
- Removed `analyzeTemplateConcept` + `buildLayoutDirective` (was causing all outputs to look identical)
- `sourceModeBlock` now directly instructs: keep layout, replace product zone → input_urls[0], replace logo zone → input_urls[1], replace all text → brand copy

---

## PENDING — What Still Needs To Be Done

### Immediate (next session)

**1. Wire `ugc_avatar_url` into Build KIE AI Prompt**
The form sends `ugc_avatar_url` but the node doesn't read it yet. When present:
- Add it to `input_urls` (after logo, before template)
- Replace hallucinationGuardrail's "don't generate humans" rule with "use this avatar as the human subject — reproduce their face and body"

**2. Wire `generation_mode` into Build KIE AI Prompt**
The form sends `generation_mode` but the node ignores it. Behavior per mode:
- `top_performers` → current behavior (Airtable template, fill-in-zones)
- `user_reference` → same as current `is_ref_slot: true` behavior for ALL templates
- `client_winners` → same as user_reference but with note "this is the client's proven ad"
- `team_top5` → not implemented yet

**3. Test on a real batch** — run Natural Force and Harley Meds through the updated pipeline before adding more complexity.

### Waiting on others

- **Xandria's 5 top-performer formats** — she committed to providing exact format descriptions (Notes app, toggle, "This is Bob" etc.). Once received, build Mode 2 as locked prompt templates.
- **Product images for all brands** — Carl asked Volv to load product images for all clients by end of day 2026-06-01.

### Deferred (assess after testing)

- **Visual Analysis Agent** — planned architecture where Gemini Flash analyzes template + brand brain and outputs a "visual direction document" before Build KIE AI Prompt runs. Hold off until test results show if current approach is sufficient.

---

## Key Decisions Made This Session

1. **Model stays `gpt-image-2-image-to-image`** — KIE AI text-to-image doesn't accept reference images, so we keep image-to-image but fix how we use it.

2. **Template goes LAST in input_urls** — image-to-image weights earlier images more. Product first gives visual anchor; template last gives structural guidance without dominating.

3. **No Airtable field changes for brand colors** — Extract Brand Colors node calls Claude Haiku with the logo image to auto-detect hex colors. No manual entry needed.

4. **No concept type detection** — removed the `analyzeTemplateConcept` approach because all CreativeOS templates looked similar to Haiku, returning the same concept type and producing identical outputs. Replaced with simpler fill-in-zones approach.

5. **Service brands (like Innerwell) need product/avatar images** — the pipeline cannot produce good output without visual anchors. These brands must upload their imagery (pills, clinic photos, avatars) through the form. Placeholder `[ PRODUCT IMAGE ]` is intentional for designer awareness.

6. **4 batch modes** — Leo's suggestion accepted by the team. Mode selector added to form.

---

## Current `Build KIE AI Prompt` — Full Code

```javascript
const webhook = $('Webhook').first().json;
const body = webhook.body || {};
const brain = $('Search Brand Brain').first().json;

// === ASPECT RATIO + PLATFORM LABEL ===
const platformsRaw = String(body.platforms || '').toLowerCase();
let aspectRatio = '1:1';
if (platformsRaw.indexOf('9:16') > -1 || platformsRaw.indexOf('vertical') > -1) aspectRatio = '9:16';
else if (platformsRaw.indexOf('16:9') > -1 || platformsRaw.indexOf('youtube') > -1) aspectRatio = '16:9';
else if (platformsRaw.indexOf('1.91') > -1 || platformsRaw.indexOf('horizontal') > -1) aspectRatio = '16:9';
const platformLabel = String(body.platforms || '').split(',')[0].trim() || 'Meta / TikTok — Square (1:1)';

// === REFERENCES ===
const decode = $('Decode Reference').first().json;
const referenceUrls = (decode && Array.isArray(decode.reference_urls))
  ? decode.reference_urls.filter(Boolean)
  : [];

// === LOGOS ===
const logoUrls = (Array.isArray(brain.logo_urls) ? brain.logo_urls : [])
  .map(function(l){ return (l && l.url) ? String(l.url) : null; })
  .filter(Boolean);
const primaryLogo = logoUrls[0] || null;

// === PRODUCTS ===
let productImageUrls = [];
if (Array.isArray(body.product_image_urls) && body.product_image_urls.length) {
  productImageUrls = body.product_image_urls.map(String).filter(Boolean);
} else if (body.product_image_url) {
  productImageUrls = [String(body.product_image_url)];
}

let productNames = [];
if (Array.isArray(body.product_names) && body.product_names.length) {
  productNames = body.product_names.map(String).filter(Boolean);
} else if (body.product_name) {
  productNames = String(body.product_name).split(',').map(function(s){ return s.trim(); }).filter(Boolean);
}

const hasProductImages = productImageUrls.length > 0;
const isMultiProduct   = productImageUrls.length > 1;
const productCount     = productImageUrls.length;

// === UGC AVATAR ===
const ugcAvatarUrl = body.ugc_avatar_url ? String(body.ugc_avatar_url).trim() : null;

// === KIE AI IMAGE BUDGET ===
// Order: product(s) → logo → [avatar if present] → template (last = weakest influence)
const logoSlots       = primaryLogo ? 1 : 0;
const avatarSlots     = ugcAvatarUrl ? 1 : 0;
const maxProductSlots = 16 - logoSlots - avatarSlots - 1; // -1 reserved for template
productImageUrls = productImageUrls.slice(0, maxProductSlots);

// === TEMPLATE ITEMS ===
const workItems = $input.all();

// === INPUT_URLS BUILDER ===
// Product first (visual anchor) → logo → avatar (if present) → template last (structural reference only)
function buildInputUrls(item) {
  const urls = [];
  productImageUrls.forEach(function(u){ urls.push(u); });
  if (primaryLogo) urls.push(primaryLogo);
  if (ugcAvatarUrl) urls.push(ugcAvatarUrl);
  if (item.template_url) urls.push(item.template_url);
  return urls;
}

// === BRAND BRAIN FIELDS ===
const targetPersona      = brain.target_personas     ? String(brain.target_personas).slice(0, 800)     : '';
const corePainPoints     = brain.core_pain_points    ? String(brain.core_pain_points).slice(0, 600)    : '';
const productBenefits    = brain.product_benefits    ? String(brain.product_benefits).slice(0, 600)    : '';
const brandGuidelines    = brain.brand_guidelines    ? String(brain.brand_guidelines).slice(0, 1500)   : '';
const creativeBoundaries = brain.creative_boundaries ? String(brain.creative_boundaries).slice(0, 800) : '';

// === GENDER DIRECTIVE ===
const personaLower     = (targetPersona + ' ' + String(brain.brand_tone || '')).toLowerCase();
const isFemaleTargeted = /\b(female|females|women|woman|her\b|she\b|mom|moms|mother)\b/.test(personaLower);
const isMaleTargeted   = /\b(male|males|men\b|man\b|him\b|he\b|dad|dads|father|guys)\b/.test(personaLower);

const genderDirective = isFemaleTargeted
  ? 'SUBJECT GENDER (MANDATORY): ALL human subjects must be FEMALE. Do NOT use male subjects regardless of what any reference shows.'
  : isMaleTargeted
  ? 'SUBJECT GENDER (MANDATORY): ALL human subjects must be MALE. Do NOT use female subjects regardless of what any reference shows.'
  : null;

// === UGC vs BRANDED ===
const briefLower     = String(body.brief || '').toLowerCase();
const isUGCRequested = /\bugc\b|user.generated|authentic shoot|raw footage/.test(briefLower);

const styleDirective = isUGCRequested
  ? 'STYLE: UGC — authentic, real-person, phone-camera aesthetic. Natural lighting, unpolished, candid feel.'
  : 'STYLE: BRANDED STATIC AD — clean, designed, polished graphic. No UGC aesthetics. Professional DR ad creative only.';

// === BRAND COLORS ===
const brandColors = (() => {
  try { return $('Extract Brand Colors').first().json; }
  catch(e) { return {}; }
})();
const primaryColorHex   = brandColors.primary_color_hex   || null;
const secondaryColorHex = brandColors.secondary_color_hex || null;
const accentColorHex    = brandColors.accent_color_hex    || null;

const colorRules = (primaryColorHex || secondaryColorHex || accentColorHex)
  ? [
      'BRAND COLOR RULES (MANDATORY):',
      primaryColorHex   ? '- PRIMARY COLOR: '   + primaryColorHex   + ' — CTA button, headlines, logo banner, accent elements.' : null,
      secondaryColorHex ? '- SECONDARY COLOR: ' + secondaryColorHex + ' — Background, card fills, secondary containers.' : null,
      accentColorHex    ? '- ACCENT COLOR: '    + accentColorHex    + ' — Badges, callouts, highlights.' : null,
      '- DO NOT substitute similar colors. Reproduce hex values exactly.',
      '- No additional brand colors unless in the provided product/logo images.'
    ].filter(Boolean).join('\n')
  : null;

// === COMPLIANCE ===
const complianceDisclaimer = brain.compliance_disclaimer
  ? String(brain.compliance_disclaimer).trim()
  : null;

const complianceRule = complianceDisclaimer
  ? [
      'COMPLIANCE (MANDATORY):',
      'REQUIRED LEGAL FOOTER — render verbatim at 8pt or smaller in bottom footer zone:',
      '"' + complianceDisclaimer + '"',
      '- Must appear. Never paraphrase, abbreviate, or omit.'
    ].join('\n')
  : null;

// === GUARDRAILS ===
const brandTypeGuardrail = !hasProductImages
  ? [
      'PRODUCT IMAGE: None provided.',
      '- DO NOT invent any product, bottle, vial, capsule, jar, or physical object.',
      '- In the product zone, render a clean neutral placeholder: white/light grey fill, dashed border, centered label "[ PRODUCT IMAGE ]".',
      '- A designer will drop in the real product after generation.',
      '- Render everything else normally: headline, subline, CTA, logo, background, layout.'
    ].join('\n')
  : isMultiProduct
    ? [
        'BRAND TYPE: PRODUCT — ' + productCount + ' products: ' + productNames.join(', '),
        '- Products in input_urls[0+] are PHOTOGRAPHIC REFERENCES. Reproduce photographically.',
        '- Container geometry, label, copy, UPC position: exact match.',
        '- Colors: exact — do not shift hue or adjust for aesthetics.',
        '- DO NOT swap similar-looking products from training data.',
        '- Brand name appears ONLY in the designated logo zone.'
      ].join('\n')
    : [
        'BRAND TYPE: PRODUCT — Feature the provided product as visual hero.',
        '- Product in input_urls[0] is a PHOTOGRAPHIC REFERENCE. Reproduce photographically.',
        '- Container geometry, label, copy, UPC position: exact match.',
        '- Colors: exact — do not shift hue or adjust for aesthetics.',
        '- DO NOT swap similar-looking products from training data.',
        '- Brand name appears ONLY in the designated logo zone.'
      ].join('\n');

const brandIsolationRule = [
  'BRAND ISOLATION:',
  '- This ad is for "' + String(body.client_name || '') + '" ONLY.',
  '- DO NOT pull assets, products, packaging, or visual cues from any other brand.',
  '- Provided product images and logo are the ONLY visual sources of truth.'
].join('\n');

const logoRules = primaryLogo
  ? [
      'LOGO RULES:',
      '- Use the EXACT logo from input_urls[' + productImageUrls.length + ']. Do NOT stretch, recolor, restyle, or reinterpret.',
      '- Reproduce as-is — do not redraw or re-illustrate.',
      '- Logo in ONE place only — the logo zone defined by the template.',
      '- Maintain original aspect ratio. No distortion or skewing.',
      '- Place within central 84% of canvas. Never at the very edge.',
      '- No overlays, drop shadows, or filters on the logo.'
    ].join('\n')
  : [
      'LOGO: None provided.',
      '- Render clean placeholder: dashed border, centered label "[ LOGO ]" in logo zone.',
      '- Do NOT invent a logo, wordmark, emblem, or brand symbol.'
    ].join('\n');

const avatarRules = ugcAvatarUrl
  ? [
      'UGC AVATAR:',
      '- A human subject image has been provided in input_urls[' + (productImageUrls.length + logoSlots) + '].',
      '- Use this EXACT person as the human subject in the ad.',
      '- Reproduce their face, skin tone, hair, and body faithfully — do not invent a different person.',
      genderDirective ? '- Ensure the subject matches the gender directive above.' : null
    ].filter(Boolean).join('\n')
  : null;

const typographyRules = [
  'TYPOGRAPHY RULES:',
  '- Headline is LARGEST element. Cap-height minimum 3× the subhead.',
  '- Visual hierarchy: HEADLINE > subhead > CTA > legal.',
  '- CTA button: minimum 4.5:1 contrast ratio between text and background.',
  '- Max 3 text elements unless concept format requires more.',
  '- No em dashes. Use commas or colons instead.',
  '- No gibberish. Every visible word must be real and intentional.',
  '- Legal text: single 8pt footer line only. Never larger.'
].join('\n');

const iconRules = [
  'ICON RULES:',
  '- MAXIMUM 3 icons total. Reduce to 3 most relevant if template has more.',
  '- No two icons may touch, overlap, or sit within 16px of each other.',
  '- All icons: clean, vector-style, single-line or simple-fill only.',
  '- Do NOT invent icons not called for by the template.'
].join('\n');

const hallucinationGuardrail = [
  'ANTI-HALLUCINATION:',
  '- No floating objects. Every object rests on a surface or is logically supported.',
  '- Drop shadows consistent with a single light source. No contradictory shadows.',
  '- No invented packaging, label changes, or fake product variants.',
  '- No fake awards, review counts, or press logos unless in the brand brain.',
  '- No broken anatomy (correct fingers, eyes, limbs).',
  ugcAvatarUrl
    ? '- Use ONLY the provided avatar as the human subject. Do not invent additional people.'
    : '- If no human was provided in inputs, DO NOT generate humans. Product is the hero.',
  '- If a human IS provided, reproduce them — do not invent a new person.'
].join('\n');

const NO_CHROME_SUFFIX    = '[NO PLATFORM CHROME] Render only the standalone ad creative — not a screenshot of how it displays in-feed. Exclude all iOS chrome, platform brand-row, engagement rows, and action buttons. Just the standalone image.';
const SAFE_ZONE_SUFFIX    = '[EDGE-SAFE] All text, headlines, CTAs, product wordmarks, and focal subjects must fit within the central 84% of the canvas. Backgrounds may bleed; text and focal elements may NOT touch or extend off any edge.';
const GLYPH_SAFETY_SUFFIX = '[TEXT FIDELITY] Plain words only inside body-text blocks — NO emoji, NO unicode glyphs mid-sentence. Render the EXACT count of elements specified — do not invent additional messages, replies, or responses.';

// === ANGLES ===
const angles = [
  'Lead with the core problem and pain point. Pain-first hook.',
  'Lead with the solution, outcome, and key benefit. Benefit-first hook.',
  'Lead with social proof, credibility, and trust. Trust-first hook.'
];

// === GENERATION MODE ===
const generationMode = String(body.generation_mode || 'top_performers');

// === MAIN LOOP ===
const result = [];

for (const entry of workItems) {
  const item      = entry.json;
  const isRefSlot = item.is_ref_slot === true;

  // Determine source mode based on generation_mode field and slot type
  const isUserDirected = isRefSlot
    || generationMode === 'user_reference'
    || generationMode === 'client_winners';

  const sourceModeBlock = isUserDirected
    ? [
        'SOURCE MODE: ' + (generationMode === 'client_winners' ? 'CLIENT\'S WINNING AD' : 'USER REFERENCE AD'),
        'The LAST image in input_urls is a reference ad uploaded as creative direction.',
        '- KEEP: the template\'s overall layout, background, compositional structure, and zone positions.',
        '- KEEP: the template\'s concept format (toggle, testimonial card, split panel, etc.).',
        '- REPLACE the product placeholder zone with input_urls[0]. Reproduce photographically.',
        '- REPLACE the logo placeholder zone with input_urls[' + productImageUrls.length + ']. Reproduce exactly.',
        ugcAvatarUrl ? '- REPLACE any human subject zone with the avatar from input_urls[' + (productImageUrls.length + logoSlots) + '].' : null,
        '- REPLACE all text with the copy angle and brand context below.',
        '- ADAPT all colors to the brand palette.',
        '- CRITICAL: If reference shows a human, their gender must match the target audience directive.',
        generationMode === 'client_winners' ? '- This is a PROVEN WINNING AD for this client. Preserve its structure very closely.' : null
      ].filter(Boolean).join('\n')
    : [
        'SOURCE MODE: TOP PERFORMING AD TEMPLATE — FILL IN THE ZONES',
        'The LAST image in input_urls is a top-performing ad template with defined layout zones.',
        '- KEEP: the template\'s overall layout, background, compositional structure, and zone positions.',
        '- KEEP: the template\'s concept format (toggle, testimonial card, split panel, etc.).',
        '- REPLACE the product placeholder zone (circle, empty space, or generic product) with input_urls[0]. Reproduce photographically — same shape, label, colors.',
        '- REPLACE the logo placeholder zone with input_urls[' + productImageUrls.length + ']. Reproduce exactly.',
        ugcAvatarUrl ? '- REPLACE any human subject zone with the avatar from input_urls[' + (productImageUrls.length + logoSlots) + '].' : null,
        '- REPLACE all text (headline, subline, CTA) with copy based on the brand context and angle below.',
        '- ADAPT all colors to the brand palette (see color rules below).',
        '- DO NOT keep any logo, product, or brand identity from the template\'s original brand.',
        '- DO NOT invent a new layout — work within the template\'s existing structure.'
      ].filter(Boolean).join('\n');

  const inputUrls = buildInputUrls(item);

  for (const angle of angles) {
    const vIdx = angles.indexOf(angle);

    const lines = [
      'Create a static, performance-ready DR ad creative for ' + String(body.client_name || 'this brand') + '.',
      '',
      '━━ BRAND CONTEXT ━━',
      'BRAND: '            + String(body.client_name || ''),
      productNames.length ? 'PRODUCT(S): ' + productNames.join(', ') : '',
      'BRAND TONE: '       + String(brain.brand_tone || ''),
      'KEY OFFER: '        + String(brain.key_offer  || ''),
      productBenefits   ? 'KEY BENEFITS: '    + productBenefits   : '',
      targetPersona     ? 'TARGET PERSONA: '  + targetPersona     : '',
      corePainPoints    ? 'CORE PAIN POINTS: '+ corePainPoints    : '',
      'BRIEF: '            + String(body.brief || ''),
      '',
      '━━ STYLE ━━',
      styleDirective,
      '',
      sourceModeBlock,
      '',
      '━━ COPY ANGLE ━━',
      'COPY ANGLE: ' + angle,
      '',
      '━━ BRAND RULES ━━',
      brandTypeGuardrail,
      '',
      brandIsolationRule,
      '',
      genderDirective    ? genderDirective + '\n' : '',
      avatarRules        ? avatarRules     + '\n' : '',
      colorRules         ? colorRules      + '\n' : '',
      logoRules,
      '',
      typographyRules,
      '',
      iconRules,
      '',
      hallucinationGuardrail,
      complianceRule     ? '\n' + complianceRule                                            : '',
      brandGuidelines    ? '\nBRAND GUIDELINES:\n'                   + brandGuidelines      : '',
      creativeBoundaries ? '\nCREATIVE BOUNDARIES (do NOT do these):\n' + creativeBoundaries : '',
      '',
      '━━ FINAL CHECK ━━',
      '1. Does the output follow the template\'s layout structure and concept format?',
      '2. Does the background belong to THIS brand — not copied from the template?',
      '3. Is the product the EXACT one from input_urls[0] — photographically reproduced, or "[ PRODUCT IMAGE ]" placeholder?',
      '4. Is the logo the EXACT one provided — not redrawn?',
      '5. Have all colors been adapted to this brand\'s palette?',
      '6. Is the headline the most dominant text element (3× subhead cap-height)?',
      '7. ONE hook, ONE visual, ONE CTA — not a brochure?',
      '8. Any floating or hallucinated elements removed?',
      genderDirective ? '9. ALL humans match the required gender?' : null,
      complianceRule  ? (genderDirective ? '10.' : '9.') + ' Legal disclaimer verbatim in footer?' : null,
      '',
      NO_CHROME_SUFFIX,
      '',
      SAFE_ZONE_SUFFIX,
      '',
      GLYPH_SAFETY_SUFFIX
    ].filter(function(l){ return l !== null; });

    result.push({
      json: {
        template_url:       item.template_url,
        template_index:     workItems.indexOf(entry) + 1,
        input_urls:         inputUrls,
        prompt:             lines.join('\n'),
        variant_index:      vIdx + 1,
        is_reference_based: isRefSlot,
        aspect_ratio:       aspectRatio,
        platform_label:     platformLabel
      }
    });
  }
}

return result;
```

---

## Current `Pick Templates` — Full Code

```javascript
const templates = $input.all();
const webhookBody = $('Webhook').first().json.body || {};
const count = parseInt(webhookBody.static_ads_count) || 1;

const referenceUrls = Array.isArray(webhookBody.reference_urls)
  ? webhookBody.reference_urls.filter(Boolean)
  : [];
const refCount = referenceUrls.length;

// Always reserve at least 1 Airtable (top performer) slot when count > 1.
// Exception: if count=1 and user uploaded a reference, respect their reference.
const minAirtableSlots = count > 1 ? 1 : 0;
const refSlots      = Math.min(refCount, count - minAirtableSlots);
const airtableSlots = count - refSlots;

// Shuffle Airtable templates
const arr = templates.slice();
for (var i = arr.length - 1; i > 0; i--) {
  var j = Math.floor(Math.random() * (i + 1));
  var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
}

const result = [];

// 1. User reference slots
for (var r = 0; r < refSlots; r++) {
  result.push({
    json: {
      template_id: 'ref_' + r,
      template_url: referenceUrls[r],
      is_ref_slot: true,
      ref_index: r
    }
  });
}

// 2. Airtable top performer slots
arr.slice(0, airtableSlots).forEach(function(entry) {
  result.push({
    json: {
      template_id: String(entry.json.id),
      template_url: String(entry.json.template_image[0].url),
      is_ref_slot: false,
      ref_index: -1
    }
  });
});

return result;
```

---

## Current `Extract Brand Colors` — Full Code

```javascript
const brain = $('Search Brand Brain').first().json;

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

---

## Files Changed This Session

| File | What changed |
|---|---|
| `Docs/Static Ads Generator/static ads html.md` | Generation mode selector, UGC avatar upload, delete bug fix |
| n8n — `Pick Templates` | Slot allocation with minimum 1 Airtable slot |
| n8n — `Build KIE AI Prompt` | Multiple iterations — final version: fill-in-zones approach, avatar support, generation_mode routing |
| n8n — `Extract Brand Colors` | New node added (after Search Brand Brain) |

---

## Installed External Skills (in `external-skills/`)

| Skill | Location | Purpose |
|---|---|---|
| arcads-claude-code | `external-skills/arcads-claude-code/` | 37 validated Meta ad templates, GPT Image 2 prompting guide, safety suffixes |
| higgsfield-ai-prompt-skill | `external-skills/higgsfield-ai-prompt-skill/` | MCSLA formula, DISCIPLINE framework, cinematic prompting |
| Meta-Ads-Spy-Claude-Code-Airtable | `external-skills/Meta-Ads-Spy-Claude-Code-Airtable/` | Competitor ad scraping into Airtable |
| TheCraigHewitt/higgsfield-skills | `external-skills/TheCraigHewitt/` | Content factory / daily carousel automation pattern |
| buluslan/gpt-image2-ecommerce | `external-skills/buluslan/` | 25 ecommerce scene templates |

Key reference for prompting: `external-skills/arcads-claude-code/shared/skills/image-ad-prompting/prompting/safety-suffixes.md`

---

## Airtable Structure

**Base:** `appvCkX59PBphJGOd` (Creative Adbundance - Batch Records)

**Brand Brain table** — key fields used:
`logo_urls`, `brand_tone`, `key_offer`, `target_personas`, `core_pain_points`, `product_benefits`, `brand_guidelines`, `creative_boundaries`, `compliance_disclaimer`

**CreativeOS Templates table** (`tblE6i41y5UUCLbVV`) — filtered by `aspect_ratio`. All rows are top performers (no checkbox needed).

---

## Supabase

**URL:** `https://xakngjsybyytldyqfsmi.supabase.co`
**Table:** `static_ads` — fields: `id`, `brand_name`, `run_id`, `image_url`, `qa_score`, `platform`, `variant_index`, `created_at`
**Buckets:** `ad-references` (refs + avatars + logos), `product-images`
