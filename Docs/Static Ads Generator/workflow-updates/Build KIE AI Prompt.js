const webhook = $('Webhook1').first().json;
const body = webhook.body || {};  // nested under .body from this node's position
const brain = $('Search Brand Brain').first().json;

// === ASPECT RATIO + PLATFORM LABEL ===
const platformsRaw = String(body.platforms || '').toLowerCase();
let aspectRatio = '1:1';
if (platformsRaw.indexOf('9:16') > -1 || platformsRaw.indexOf('vertical') > -1) aspectRatio = '9:16';
else if (platformsRaw.indexOf('16:9') > -1 || platformsRaw.indexOf('youtube') > -1) aspectRatio = '16:9';
else if (platformsRaw.indexOf('1.91') > -1 || platformsRaw.indexOf('horizontal') > -1) aspectRatio = '16:9';
const platformLabel = String(body.platforms || '').split(',')[0].trim() || 'Meta / TikTok - Square (1:1)';

// === REFERENCES ===
const decode = $('Decode Reference').first().json;
const referenceUrls = (decode && Array.isArray(decode.reference_urls))
  ? decode.reference_urls.filter(Boolean)
  : [];
const refCount = referenceUrls.length;

// === LOGOS ===
const logoUrls = (Array.isArray(brain.logo_urls) ? brain.logo_urls : [])
  .map(function(l){ return (l && l.url) ? String(l.url) : null; })
  .filter(Boolean);
const primaryLogo = logoUrls[0] || null;

// === PRODUCTS (multi-select aware) ===
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

// Did the requester hand-select products in the form? (Selected products are ALWAYS
// the product truth. The fallbacks below only apply when nothing was selected.)
const productsFromForm = productImageUrls.length > 0;

// === PRODUCT FALLBACK (no product selected in the form) ===
// Without a product image the model has ZERO product truth and invents look-alike
// products. Pull the brand's own packshots from Supabase `products` (the same table
// the form's product picker reads) so every variant renders the REAL product.
let productsAutoFetched = false;
if (productImageUrls.length === 0 && body.client_name) {
  try {
    const SB_URL = 'https://xakngjsybyytldyqfsmi.supabase.co';
    const SB_KEY = '<SUPABASE_SERVICE_ROLE_KEY>';
    const prows = await this.helpers.httpRequest({
      method: 'GET',
      url: SB_URL + '/rest/v1/products?select=product_name,product_image_url&brand_name=eq.' + encodeURIComponent(String(body.client_name)) + '&limit=4',
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY },
      json: true
    });
    (Array.isArray(prows) ? prows : []).forEach(function (r) {
      if (r && r.product_image_url) {
        productImageUrls.push(String(r.product_image_url));
        if (r.product_name) productNames.push(String(r.product_name));
      }
    });
    productsAutoFetched = productImageUrls.length > 0;
  } catch (e) { /* no products table rows - falls through to service-brand handling */ }
}

const isServiceBrand = productImageUrls.length === 0;
const isMultiProduct = productImageUrls.length > 1;
const productCount = productImageUrls.length;

// === KIE AI IMAGE BUDGET ===
// nano-banana-pro accepts at most 8 input images per task.
// Slot 0: template or reference (always 1)
// Slots 1..P: products (cap to fit budget)
// Slot last: logo (if exists)
const MAX_IMAGES = 8;
const logoSlots = primaryLogo ? 1 : 0;
const maxProductSlots = MAX_IMAGES - 1 - logoSlots; // e.g. 8 - 1 - 1 = 6
productImageUrls = productImageUrls.slice(0, maxProductSlots);

// === TEMPLATE ITEMS from Pick Templates ===
// Pick Templates already assigned:
//   is_ref_slot: true  -> template_url IS the reference/winning-ad -> blueprint is input_urls[0]
//   is_ref_slot: false -> template_url is Airtable template        -> Airtable image is input_urls[0]
const workItems = $input.all();

// === GUARDRAILS ===
const brandTypeGuardrail = isServiceBrand
  ? [
      'BRAND TYPE: SERVICE / B2B - No physical product.',
      '- DO NOT place brand name on random objects (cups, clothing, bags, packaging, signs).',
      '- Brand name appears ONLY in the designated logo zone, headline, and CTA.',
      '- Visual must represent the service outcome - clean workspace, documents, professional environment.'
    ].join('\n')
  : productsAutoFetched
    ? [
        'BRAND TYPE: PRODUCT - No product was hand-selected, so the brand\'s own catalog packshots are supplied as PRODUCT TRUTH: ' + productNames.join(', '),
        '- Feature whichever ONE of these products fits the concept best (a small set only if the layout genuinely calls for it).',
        '- Reproduce the featured product EXACTLY from its supplied image - same shape, texture/weave, label, packaging, colors. Do NOT invent a similar-looking product or use a generic stand-in.',
        '- DO NOT alter packaging text, label copy, or product names.',
        '- Brand name appears ONLY in the designated logo zone.'
      ].join('\n')
  : isMultiProduct
    ? [
        'BRAND TYPE: PRODUCT - Multiple products provided as visual hero.',
        '- ' + productCount + ' product images supplied: ' + productNames.join(', '),
        '- Feature ALL provided products. Either: (a) hero + supporting cast layout, or (b) product line-up / collection arrangement.',
        '- Use the EXACT product images provided - same shape, label, packaging, colors. Do NOT reimagine, replace, or merge into a single composite.',
        '- DO NOT swap in similar-looking products from training data.',
        '- DO NOT alter packaging text, label copy, ingredient lists, or product names. Render product packaging exactly as shown.',
        '- Brand name appears ONLY in the designated logo zone.'
      ].join('\n')
    : [
        'BRAND TYPE: PRODUCT - Feature the provided product image as the visual hero.',
        '- Use the EXACT product - same shape, label, packaging, colors, and PACKAGING FORM. The product form (pouch, bottle, jar, box, tube) comes ONLY from the provided product image. If the template shows a different form, DISCARD the template product and render the provided one. Never turn a pouch into a jar, or a jar into a bottle.',
        '- DO NOT alter packaging text, label copy, ingredient lists, or product names. Render product packaging exactly as shown.',
        '- DO NOT swap in similar-looking products from training data.',
        '- Brand name appears ONLY in the designated logo zone.'
      ].join('\n');

const brandIsolationRule = [
  'BRAND ISOLATION:',
  '- This ad is for "' + String(body.client_name || '') + '" ONLY.',
  '- DO NOT pull assets, products, packaging, color schemes, or visual cues from any sister brand or parent company.',
  '- The provided product images and logo are the ONLY visual sources of truth for this brand identity.'
].join('\n');

const logoRules = primaryLogo
  ? [
      'LOGO RULES:',
      '- The FINAL input image is the brand\'s official logo file. COMPOSITE that exact logo into the design - never redraw, retype, restyle, or approximate the wordmark from memory.',
      '- Every ad in this batch must carry the IDENTICAL logo: same letterforms, same weight, same color treatment as the supplied file.',
      '- Logo appears in ONE place only - the designated logo zone.',
      '- Maintain original logo aspect ratio. No distortion, no skewing, no recoloring.'
    ].join('\n')
  : 'LOGO RULES: No logo image provided. Render the brand name once as clean, plain typography in the logo zone only - same simple treatment on every ad in the batch, no stylization.';

const typographyRules = [
  'TYPOGRAPHY:',
  '- Headline is the LARGEST text, legible at a 200px thumbnail. Max 3 text elements (unless a Notes/iMessage/review concept needs more).',
  '- No em dashes in visible text (use commas or colons). No gibberish - every visible word is real and intentional.',
  '- Any legal disclaimer is a single 8pt footer line, never larger.'
].join('\n');

const iconRules = [
  'ICON / UI RULES:',
  '- All icons must be clean, vector-style, single-line or simple-fill.',
  '- No blurry, fuzzy, sketched, or hand-drawn icon styles.',
  '- Checkmarks, arrows, and trust badges must be sharp and legible at full size.'
].join('\n');

const conceptPreservationRule = [
  'CONCEPT PRESERVATION (CRITICAL):',
  'The source image at input_urls[0] carries a specific CONCEPT FORMAT. Identify it and preserve it.',
  'Common valid concepts for DR static ads include:',
  '- iOS push notification (lock-screen mock with app icon, title, body, Skip/CTA buttons)',
  '- iOS Notes app screenshot (Notes header, title, bulleted checklist, orange CTA button)',
  '- iMessage toggle comparison (two iOS-style toggle rows showing pain vs solution)',
  '- Handwritten kid note / sticky note (paper texture, marker handwriting, casual)',
  '- Whiteboard line-drawing story ("This is [Name]. [Story]." stick figures)',
  '- Real-world billboard / out-of-home mockup (product on actual billboard with sky)',
  '- Customer review screenshot (5-star card with name, review text, optional photo)',
  '- Lifestyle hero with feature checklist (product photo + 3-4 checkmark bullets)',
  '- Bold typography on dark background (large stencil text, single price anchor)',
  '- Gift box reveal (product emerging from wrapped present, numbered steps)',
  '- Family testimonial with sticker callouts (photo + quote bubble + feature stickers)',
  '',
  'PICK ONE. Stay inside it. Do NOT mix concepts in a single ad.',
  '',
  'THIS IS NOT A BROCHURE. Hard rules:',
  '- ONE hook (the headline). ONE primary visual. ONE CTA.',
  '- Do NOT show 3 product variants side-by-side as equal heroes. Pick a hero.',
  '- Do NOT fill the canvas with 5+ feature icons in a row.',
  '- Do NOT include a large legal disclaimer block. If legal text is needed, single 8pt footer line ONLY.',
  '- The CTA must be the most prominent click target, not the 4th step in a flow.'
].join('\n');

const hallucinationGuardrail = [
  'ANTI-HALLUCINATION:',
  '- NEVER invent or change dates, years, numbers, prices, percentages, or claims. Use ONLY values in the BRIEF or brand brain, exactly as written; do not "update" any date/number that appears on the source ad (never change 2024 to 2026).',
  '- No invented packaging or label changes; no fake awards, review counts, or press logos unless in the brand brain.',
  '- No floating objects; realistic physics and shadows; correct human anatomy (fingers, eyes, limbs).'
].join('\n');

const conceptTranslationRule = [
  'CONCEPT TRANSLATION (never copy the source ad literally):',
  '- The source ad carries a CONCEPT + DEVICE (a comparison, before/after, old-me/new-me, toggle, quiz, testimonial, hero-with-element). Keep the concept and device.',
  '- Its specific props, objects, backgrounds and before/after imagery belong to a DIFFERENT product. Re-map EACH of them to something that makes sense for ' + String(body.client_name || 'this brand') + ' and its customer. Never keep an object, prop or scene that has no meaning for this brand.',
  '- Every element in the finished ad must clearly relate to THIS product, its problem, or its outcome. The result must be logically coherent, not a mash-up.',
  '- Example: if the source "before / old me" panel shows cookware, laundry, or some unrelated room, do NOT keep it. Make the "before / old me" show THIS brand\'s real problem state and the "after / new me" show THIS brand\'s outcome.',
  '- The product need NOT appear as the full package every time. If it strengthens the concept, show a relevant part of it or the product in real use (still the exact real product, on-brand).',
  '- Background and setting must relate to the product or how it is used. No random or decorative scenes that do not fit the brand.'
].join('\n');

// === BRAND BRAIN FIELDS ===
// Trimmed to fit KIE nano-banana-pro's 10000-char prompt cap (guardrails already use ~5000).
const targetPersona = brain.target_personas ? String(brain.target_personas).slice(0, 260) : '';
const corePainPoints = brain.core_pain_points ? String(brain.core_pain_points).slice(0, 200) : '';
const productBenefits = brain.product_benefits ? String(brain.product_benefits).slice(0, 220) : '';
// Brand guidelines: strip URLs and long doc/slide IDs - useless to an image model, they only eat the char budget.
let brandGuidelines = brain.brand_guidelines ? String(brain.brand_guidelines) : '';
brandGuidelines = brandGuidelines
  .replace(/https?:\/\/\S+/g, '')
  .replace(/\bID:\s*\S+/gi, '')
  .replace(/\b[A-Za-z0-9_-]{15,}\b/g, '')
  .replace(/\(\s*(?:Google|Frontify)[^)]*\)/gi, '')
  .replace(/[ \t]{2,}/g, ' ')
  .replace(/ +([,.)])/g, '$1')
  .trim()
  .slice(0, 1500);
const creativeBoundaries = brain.creative_boundaries ? String(brain.creative_boundaries).slice(0, 400) : '';
const brandFonts = brain.brand_fonts ? String(brain.brand_fonts).slice(0, 240) : '';

// Brand typography must render in the brand's REAL typefaces, not a generic default sans.
const brandTypographyBlock = [
  'BRAND TYPOGRAPHY (use the brand\'s REAL typefaces - never default to a generic sans):',
  brandFonts ? ('- Brand fonts: ' + brandFonts) : '- Use the brand\'s own typefaces as shown in the reference image and brand guidelines.',
  '- Render the HEADLINE in the brand\'s headline typeface, matching the exact style, weight, and casing shown in the reference at input_urls[0]. If the brand\'s headline typeface is a SERIF, the headline MUST be rendered as that elegant serif - never Helvetica, Arial, Inter, or any default sans.',
  '- Eyebrow labels and body copy use the brand\'s sans typeface (eyebrows uppercase where the brand does so).'
].join('\n');

const VARIANTS_PER_TEMPLATE = 2; // copy angles rendered per layout (1-3). total ads = static_ads_count x this
const angles = [
  'Lead with the core problem and pain point. Pain-first hook.',
  'Lead with the solution, outcome, and key benefit. Benefit-first hook.',
  'Lead with social proof, credibility, and trust. Trust-first hook.'
].slice(0, VARIANTS_PER_TEMPLATE);

// === BUSINESS OBJECTIVE INTENT (Eric Mann rule) ===
// A proven top performer must be KEPT and only adapted to the objective, not reinvented.
// Detect a promotional / offer objective in the brief; on a winning-ad slot, keep the ad
// exactly and overlay the offer + dates verbatim (no new angle, no invented dates).
const briefText = String(body.brief || '').trim();
const isPromoObjective = /(\d+\s*%|\bpercent\b|\boff\b|\bsale\b|\bdiscount\b|\bbogo\b|\bbuy\s*\d|\bfree\b|\bdeal\b|\bpromo\b|\bcoupon\b|\bcode\b|\bends\b|\bexpires\b)/i.test(briefText);

// === PROMO INCENTIVE (Eric Mann DR rule) ===
// The offer must read as URGENCY, not a passive button: "limited time" + the deadline.
const promoIncentiveBlock = [
  'PROMO INCENTIVE (DR urgency - render the offer ONCE as a clean sale callout):',
  '- State the offer exactly ONCE, formatted as a clean promo: heading "LIMITED TIME SITEWIDE SALE", the discount big (e.g. "20% OFF"), and the deadline ("Ends [end date]"). Do NOT paste the raw brief sentence and do NOT show the offer twice.',
  '- Use the EXACT discount percentage and dates from the brief; you may lay them out cleanly but never change, add, drop, or round any number or date.',
  '- Never a bare "Shop X% Off" button alone: the limited-time urgency + deadline must be visible.'
].join('\n');

// === PEOPLE RULES (whenever a person appears) ===
const peopleRules = [
  'PEOPLE RULES (whenever a person appears):',
  '- Style the person in believable context with the product - actively USING or wearing it. For towels/bath products: wrapped in the towel, a towel in the hair, or holding a fresh stack.',
  '- NEVER underwear, lingerie, or wardrobe that ignores the product (unless the product itself is that apparel).',
  '- Natural, realistic person; correct anatomy; brand-appropriate styling.'
].join('\n');

const renderQualityBlock = 'RENDER QUALITY: sharp, crisp, high-resolution. Every element - text, product, logo, badge - is razor-sharp and legible. No blur, soft focus, motion blur, or low-res / compression artifacts; do not soften the product with heavy background blur.';

const layoutRules = [
  'TEXT LAYOUT / COMPOSITION:',
  '- Place text in clean, aligned zones (a tidy top band or over clear negative space) with balanced margins; do not float, crook, or scatter the text.',
  '- Keep ALL text OFF the product and OFF any badge. Headline, offer callout, badge, and product must NOT overlap or collide.',
  '- At most one headline block, one offer callout, one CTA. Uncluttered, professional DR ad composition.'
].join('\n');

// Award badges (e.g. Wirecutter) are OPTIONAL context, not forced onto every variant.
const awardBadgeRule = 'AWARD BADGES: a badge in the winning ad (e.g. Wirecutter "Our Pick 2024") is OPTIONAL - do NOT force it onto this creative; prefer a clean one without it. If included, keep the year EXACT and never overlapping text, the offer, or the product.';

// === AUDIENCE ADAPTATION (when the brief names who to speak to) ===
const audienceAdaptBlock = /\baudience\b|\bpersona\b|\bdemographic\b|talk to|speak to|\btarget/i.test(briefText)
  ? [
      'AUDIENCE ADAPTATION:',
      '- The brief specifies who this batch should speak to. Keep the PROVEN message; adapt only the casting, setting, styling, and cultural cues to that audience.',
      '- Do not change the core message or invent new claims for the new audience.'
    ].join('\n')
  : '';

// === PROMO VARIANT ARCHETYPES (single-variable tests on the winning ad) ===
// Eric Mann rule: a variant of a top performer changes ONE variable (the visual scene)
// and keeps the message, logo treatment, and typography identical. Mirrors the designer
// pack: same headline, new background, + the limited-time incentive strip.
const promoArchetypes = [
  { label: 'Image swap - same message, new scene', human: false,
    block: 'PROMO ARCHETYPE: IMAGE SWAP - the scene is the ONLY variable. Re-stage the EXACT product (same colorways, same count) in ONE fresh, believable on-brand scene clearly different from the winning ad (styled shelf, sunlit counter, folded on a wooden bench). Add the limited-time incentive (see PROMO INCENTIVE).' },
  { label: 'UGC in-context - person using the product', human: true,
    block: 'PROMO ARCHETYPE: UGC IN-CONTEXT - the scene is ONE person naturally USING the product (for towels: wrapped in it, a towel in the hair, or holding a fresh stack of the exact colorways). Authentic natural-light UGC feel. Add the limited-time incentive.' },
  { label: 'Offer-led urgency - the deal is the headline', human: true,
    block: 'PROMO ARCHETYPE: OFFER-LED URGENCY - the OFFER is the headline: "SITEWIDE SALE" + the discount huge, deadline directly under it ("Ends [end date]"), all verbatim. ONE person gesturing at the product/offer OR the product stack as hero. Show the EXACT product (same colorways, same count).' },
  { label: 'Limited-time banner - offer strip + proven headline', human: false,
    block: 'PROMO ARCHETYPE: LIMITED-TIME BANNER - a "LIMITED TIME SITEWIDE SALE" strip + the discount huge in brand colors, then the winning ad\'s PROVEN headline, then the EXACT product (same colorways, same count). All values verbatim.' },
];

const result = [];

workItems.forEach(function(entry, tplIdx) {
  const item = entry.json;
  const isRefSlot = item.is_ref_slot === true;
  const isPromoVariant = item.ref_source === 'promo_variant';
  const pvIdx = (typeof item.promo_variant_index === 'number') ? item.promo_variant_index : tplIdx;
  const archetype = isPromoVariant ? promoArchetypes[pvIdx % promoArchetypes.length] : null;

  // PRODUCT TRUTH SOURCE:
  // When the run is built on the client's OWN winning ad (ref slots + promo variants,
  // any mode except external-inspiration 'user_reference') and NO product was
  // hand-selected, the winning ad ITSELF is the product truth - auto-fetched catalog
  // packshots are NOT attached (a mismatched colorway/bundle would override the ad's
  // real product, e.g. turning a grey/white/blue/green stack into all-grey).
  const genMode = String(body.generation_mode || '').toLowerCase();
  const useAdProductTruth = (isRefSlot || isPromoVariant) && !productsFromForm && genMode !== 'user_reference';
  const attachProducts = !useAdProductTruth;

  // Input images: [0]=blueprint/anchor, then products (when attached), then avatar
  // (human promo archetypes only), logo always LAST.
  let inputUrls = [item.template_url];
  if (attachProducts) { productImageUrls.forEach(function(u){ inputUrls.push(u); }); }
  let avatarNote = '';
  if (isPromoVariant && archetype.human && body.ugc_avatar_url) {
    inputUrls.push(String(body.ugc_avatar_url));
    avatarNote = 'PERSON TRUTH: input image #' + inputUrls.length + ' is the uploaded UGC avatar. The person in this ad must be THIS exact person - same face, hair, and skin tone.';
  }
  if (primaryLogo) inputUrls.push(primaryLogo);

  // Per-item logo rule: on winning-ad-truth runs the REFERENCE's wordmark treatment wins
  // (color/position/size as shown in the ad); the logo file is letterform backup only.
  const itemLogoRules = useAdProductTruth
    ? [
        'LOGO RULES:',
        '- Match the brand wordmark EXACTLY as it appears in the winning ad at input_urls[0]: same color, same position, same size, same letterforms. Do NOT recolor or restyle it.',
        (primaryLogo ? '- The attached official logo file (final input image) is for letterform accuracy only - the winning ad\'s treatment wins on color and placement.' : '- No logo file attached: reproduce the wordmark purely from the winning ad.'),
        '- Logo appears in ONE place only, exactly where the winning ad places it.'
      ].join('\n')
    : logoRules;

  // Per-item product guardrail: winning-ad product truth overrides the global one.
  const itemBrandGuardrail = useAdProductTruth
    ? [
        'BRAND TYPE: PRODUCT - PRODUCT TRUTH IS THE WINNING AD ITSELF.',
        '- The EXACT product to feature is the one shown in the winning ad at input_urls[0]: same product type, same COLORWAYS (reproduce EVERY color shown - if the ad shows a stack of grey, white, light blue and green towels, the new ad shows that SAME multi-color stack), same item count, same arrangement style, same weave/texture and labels.',
        '- Do NOT collapse the colorways into a single color. Do NOT substitute a different bundle, size, or variant. Do NOT restyle the product.',
        '- No catalog packshot is attached on purpose: the winning ad IS the product reference.',
        '- Brand name appears ONLY in the designated logo zone.'
      ].join('\n')
    : brandTypeGuardrail;

  // SOURCE MODE is per-item: promo-variant slots build a NEW concept around the winning ad,
  // ref/winning-ad slots clone the proven layout, airtable slots use the template for layout only.
  const sourceModeBlock = isPromoVariant
    ? [
        'SOURCE MODE: PROMO VARIANT (single-variable test on a winning ad).',
        'input_urls[0] is the client\'s OWN winning ad. Change ONLY ONE variable (the visual scene, per the archetype below) and keep everything else IDENTICAL to it:',
        '- COPY: reproduce the winning ad\'s headline + subline WORD FOR WORD (only the offer-led archetype may make the offer the headline). NEVER write a new message, angle, or claim.',
        '- LOGO + TYPOGRAPHY: match the winning ad exactly (wordmark color/position/size; same fonts, weights, casing).',
        '- PRODUCT: same product, same colorways, same count (see product truth rules).',
        archetype.block
      ].join('\n')
    : isRefSlot
    ? [
        'SOURCE MODE: WINNING-AD REFERENCE (clone this proven layout).',
        'The image at input_urls[0] is a PROVEN winning ad used as the exact creative blueprint (a client upload or one of this brand\'s own top performers).',
        '- Reproduce its COMPOSITION precisely: layout, product placement and scale, the graphic device (toggle rows / quiz pills / rounded arch / plume / split panel / badge), typography style, color treatment, and the generous negative space.',
        '- Keep the product the HERO: large, sharp, floating or staged exactly as the reference stages it, on the reference\'s clean background. Never shrink it into a busy lifestyle scene.',
        '- If the reference stages the product with a signature hero element (a plume, splash, ingredient, dramatic set), recreate an equivalent element that authentically belongs to THIS product.',
        (useAdProductTruth
          ? '- Keep the product EXACTLY as the reference shows it (same colorways, count, and arrangement). Replace nothing except what the objective demands.'
          : '- Replace ONLY the content: the product itself (from the product image), the brand name/logo, and the copy. Keep every structural and stylistic choice from the reference.'),
        '- Do NOT reinterpret, modernise, declutter, or improve the layout. Match it. The reference is the creative source of truth.'
      ].join('\n')
    : [
        'SOURCE MODE: AD TEMPLATE (borrow the concept, re-map it to THIS brand).',
        'The image at input_urls[0] is an ad from ANOTHER brand, used only as a structural blueprint. Borrow its structure, not its story.',
        '- Keep: the layout, composition, the graphic device (split screen / before-after / toggle / quiz / arch / badge), the typography style, and the negative space.',
        '- Replace the product entirely with the provided product image (correct packaging form). Keep the template LAYOUT, never its product or packaging.',
        '- Do NOT keep the template original copy or headlines.'
      ].join('\n');

  // Eric Mann rule: a proven ad + promo objective = KEEP the ad, overlay the offer, NO new angle.
  const keepAndOverlay = isRefSlot && isPromoObjective;
  const objectiveBlock = keepAndOverlay
    ? [
        'BUSINESS OBJECTIVE = PROMOTIONAL OVERLAY (do NOT reinvent the ad):',
        'This is a proven top performer and the objective is a promotion, NOT a new creative angle. KEEP the ad EXACTLY - same concept, hook, imagery, product, layout, and existing copy. Do NOT rewrite the headline, change the message, or change the angle.',
        'ADD ONE clear promotional callout as an OVERLAY on the existing design (a banner, badge, ribbon, or bold text block) stating the offer and dates EXACTLY as written below, verbatim, framed as a LIMITED-TIME incentive (the deadline must be visible, e.g. "Ends [end date]"). Change nothing else in the ad.',
        'OFFER TO OVERLAY (verbatim - do not alter, reword, or invent any date or number): "' + briefText + '"'
      ].join('\n')
    : '';

  // Template slots during a promo: new concepts are welcome, but the offer renders
  // verbatim and its dates never migrate onto awards/badges/press mentions.
  const promoTemplateBlock = (!isRefSlot && isPromoObjective)
    ? [
        'PROMO OFFER (render verbatim):',
        '- This batch promotes a specific offer. Where the ad states the offer, use the text, numbers, and dates EXACTLY as written in the BRIEF - never round, reword, extend, or change them.',
        '- NEVER attach the offer\'s dates or year to an award, badge, or press mention (e.g. a "Wirecutter 2024" badge stays 2024 - do not restamp it with the sale year).'
      ].join('\n')
    : '';

  const itemAngles = keepAndOverlay
    ? ['Keep the proven ad exactly; the ONLY change is the promotional overlay described above.']
    : isPromoVariant
      ? [archetype.label + ' - push the offer verbatim with the exact product.']
      : angles;

  itemAngles.forEach(function(angle, vIdx) {
    const lines = [
      'Transform this source image into a static, performance-ready DR ad creative.',
      '',
      'BRAND: ' + String(body.client_name || ''),
      (attachProducts && productNames.length) ? 'PRODUCT(S): ' + productNames.join(', ') : '',
      'BRAND TONE: ' + String(brain.brand_tone || ''),
      'KEY OFFER: ' + String(brain.key_offer || ''),
      productBenefits ? 'KEY BENEFITS: ' + productBenefits : '',
      targetPersona ? 'TARGET PERSONA: ' + targetPersona : '',
      corePainPoints ? 'CORE PAIN POINTS: ' + corePainPoints : '',
      'BRIEF: ' + String(body.brief || ''),
      '',
      sourceModeBlock,
      keepAndOverlay ? '\n' + objectiveBlock : '',
      (isPromoVariant || keepAndOverlay) ? '\n' + promoIncentiveBlock : '',
      promoTemplateBlock ? '\n' + promoTemplateBlock : '',
      audienceAdaptBlock ? '\n' + audienceAdaptBlock : '',
      avatarNote ? '\n' + avatarNote : '',
      '',
      itemBrandGuardrail,
      '',
      'COPY ANGLE: ' + angle,
      '',
      brandIsolationRule,
      '',
      itemLogoRules,
      '',
      brandTypographyBlock,
      '',
      peopleRules,
      '',
      renderQualityBlock,
      '',
      keepAndOverlay ? '' : layoutRules,
      '',
      isPromoVariant ? awardBadgeRule : '',
      '',
      typographyRules,
      '',
      (isPromoVariant || isRefSlot) ? '' : iconRules,
      '',
      (isPromoVariant || isRefSlot) ? '' : conceptPreservationRule,
      '',
      (isRefSlot || isPromoVariant) ? '' : conceptTranslationRule,
      '',
      hallucinationGuardrail,
      brandGuidelines ? '\nBRAND GUIDELINES:\n' + brandGuidelines : '',
      creativeBoundaries ? '\nCREATIVE BOUNDARIES (do NOT do these):\n' + creativeBoundaries : '',
      '',
      'FINAL CHECK: brand name in ONE place; product EXACT (every colorway); headline in the brand headline typeface (a serif if the brand is serif, never a default sans), largest, and matching the reference; offer stated ONCE with the exact date; sharp with no blur; nothing (text/badge) overlapping the product.',
      keepAndOverlay ? 'ALSO: keep the ad identical, ONLY add the offer overlay; change no date or number.' : null,
      isPromoVariant ? 'ALSO: the ONLY changed variable is the scene - headline word-for-word, same logo treatment, exact colorways, offer stated once with the deadline, and the award badge NOT forced onto the creative.' : null
    ].filter(Boolean);

    // Backstop: KIE nano-banana-pro rejects prompts over 10000 chars. Clamp with headroom
    // for the copy block that Generate Ad Copy appends downstream.
    var promptText = lines.join('\n');
    if (promptText.length > 9400) promptText = promptText.slice(0, 9400);

    result.push({
      json: {
        template_url: item.template_url,
        template_index: tplIdx + 1,
        input_urls: inputUrls,
        prompt: promptText,
        variant_index: vIdx + 1,
        is_reference_based: isRefSlot,
        is_promo_variant: isPromoVariant,
        aspect_ratio: aspectRatio,
        platform_label: platformLabel
      }
    });
  });
});

return result;
