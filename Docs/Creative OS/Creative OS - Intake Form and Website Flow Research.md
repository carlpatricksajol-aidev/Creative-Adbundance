# Creative OS — Intake Form & Website Flow Research

**Deep research report — July 3, 2026**
Scope: what the client-facing Creative Abundance OS website needs to collect (fields, dropdowns, flow) so that a client can enter their website, business name, and product image, click one button, and get static ads (phase 1) and short video ads (phase 2) generated through Max Fusion via API.

Method: 5 parallel search angles, ~15 sources fetched, claims adversarially verified (3 votes each). Claims that survived verification are marked with their source. A handful of Creatify claims could not complete all 3 verification votes due to a usage-limit interruption; they come from Creatify's own API documentation (primary source) and are marked accordingly.

---

## 1. The pattern every winning tool converged on

Across AdCreative.ai, Creatify, Quickads, Omneky, and Ad Legends, the same intake architecture keeps appearing:

**URL in → auto-extract everything → let the user review and correct → generate many → pick one.**

1. **One required field to start: the website URL.** AdCreative.ai's brand setup begins with the user entering only a website URL; a "Scan My Website" action auto-extracts the brand name, logo, and description (verified, help.adcreative.ai). It then auto-picks exactly 3 colors from the logo instead of asking for manual color entry (verified). Quickads builds its whole BrandKit from the site URL (logo + colors). Omneky generates a brand overview from the website, then lets you edit. Even Canva auto-builds a Brand Kit from a URL via its Brand Kit Builder (logos, colors, public fonts).
2. **Auto-extraction is a commodity, not a moat.** The Brandfetch API returns logos, color schemes, fonts, images, and company info from just a domain (verified, docs.brandfetch.com), with real-time indexing for long-tail brands. Coverage is ~95% for logos and ~97% for colors but much weaker for firmographics, and JS-heavy sites resist scraping. **Implication: every auto-filled field must be editable.** This is exactly why AdCreative, Creatify (PUT /links/{id} to edit scraped title/description/images/logo before generating), and Ad Legends all insert a "review your brand kit" screen between extraction and generation.
3. **Everything else is optional with smart defaults.** AdCreative defers ad-account connections to an "Advanced Setup" menu. Creatify's API marks brand info, logo, price, and promo details optional. Canva gates design type / style / format filters behind the initial mode selection (verified progressive disclosure).
4. **Generate a gallery, not a single output.** Canva Magic Design returns a browsable grid of templates you pick from (verified). Creatify generates cheap previews (1 credit flat) and you pay full render credits only for the one you select. AdCreative's API generates batches of formats in one request and lets you edit-and-regenerate selected variants. The Shape of AI pattern library codifies this: grid of thumbnails, actions attached to each variant, regenerate, never overwrite originals.

**Anti-pattern to avoid:** Icon.com pivoted from "The AI Admaker" to a $999 managed human service (6 human-filmed ads in 12-18 days). Its intake is now product + 1-2 audiences + 2 creators, with Icon writing the scripts. It's a weak template for a self-serve click-button product — but its hybrid framing ("software + our team supports you") is exactly the positioning Eric described for Creative Abundance.

---

## 2. Competitor intake teardowns (verified detail)

### AdCreative.ai (statics — closest to phase 1)
- **Brand setup:** website URL → Scan My Website → auto: brand name, logo, description → user reviews/edits. Colors: 3 auto-picked from logo, editable. Description optional but flagged as improving output quality. Ad-account connect deferred to Advanced Setup.
- **What its generation API actually requires** (api-docs.adcreative.ai, verified): product/background image + logo (both required files), 2 brand colors in hex (3rd optional), and exactly three copy fields: **CTA text (≤100 chars), main headline (≤255), punchline (≤255)**, optional long description (≤1000). Format selection is a bitmask so one request renders many sizes at once. Font optional (defaults exist). Generation is async with polling, then edit-and-regenerate on selected variants.

### Creatify (video — closest to phase 2)
- **Intake:** paste product URL → "Analyze URL" → auto-scrapes product title, description, images, videos, reviews, plus AI-generated industry classification, audience segments, and brand colors (primary-source, partially unverified). Requires at least 1 image or video to proceed. Manual-entry fallback endpoint exists for products without a URL.
- **Settings step:** platform, aspect ratio (9:16 / 16:9 / 1:1), duration, language, target audience (verified via hands-on review).
- **Script step:** AI-generated scripts in multiple tones, or paste your own. **Avatar step:** 1,500+ library with filters, "Smart Match" auto-pick, or custom avatar.
- **Full API param set** (near 1:1 blueprint for your form): `link, visual_style, script_style, aspect_ratio, video_length (e.g. 15), language, target_audience, target_platform, model_version` + optional overrides (avatar, voice, script, music) + boolean toggles (`no_caption, no_cta, no_stock_broll, no_background_music`).
- **Credits:** previews at 1 credit flat per 30s regardless of quantity; render the chosen one at 4 credits/30s. Free tier: 10 credits/mo, watermarked. Batch mode: 10+ variations at once.

### Arcads (video)
- Script-first: write/paste a script (or paste a product URL to have AI write one), pick an AI actor (1,000+ claimed, filterable by age/ethnicity/style), emotion controlled by free text written into the script, not dropdowns (verified). Ready-made ad presets ("proven formats") as starting points (verified). API model: Product → Folder → Script; a script needs only folder, name, text, and video references. Shows estimated cost before generating.

### Quickads (statics)
- Wizard order (verified walkthrough): (1) ad type e.g. "Instagram e-commerce" → (2) BrandKit preset (built from website URL) → (3) product URL → (4) advanced options (ad objective) → (5) generate suggestions → visual editor. Image sources: your uploads, website scrape, stock, or AI-generated. Includes a pre-publish score (readability, product placement, emotional appeal).

### Omneky / Pencil (agency-grade power tier)
- Omneky: website → auto brand overview → edit + add logos, fonts, brand book, brand rules, default campaign settings; campaigns collect objective, audience, key messages, platform requirements.
- Pencil: asset-library-heavy — brand kit upload, 3-5 product images/videos recommended, brand guideline docs ingested, template + prompt, performance prediction. This is the ceiling, not the starting point.

### Canva Magic Design
- Single prompt box + optional attachments (Upload / Add from Canva / Import / Apply Brand Kit). Mode choice (Design / Image / Video clip) progressively reveals type/style/format filters (verified). Output = gallery of ~3-8 templates, pick one, customize in editor (verified). Brand Kit itself can be auto-built from a URL upstream (verifier-corrected finding).

---

## 3. UX evidence for the flow decisions

| Decision | Evidence |
|---|---|
| Multi-step wizard, not one long form | Zuko (form-analytics vendor): single-page only wins at 2-5 fields; 6+ fields or mixed info types → multi-step with logical groups. HubSpot cited at 86% higher conversion for multi-step. |
| Easy/exciting field first | Start with the URL: lowest effort, biggest payoff moment (the brand-kit reveal). Forms should open with the easiest fields to build commitment. |
| Progressive disclosure, max 2 levels | NN/g: defer advanced options to a secondary layer; designs beyond 2 disclosure levels have low usability. Core inputs upfront, "Advanced" accordion for the rest. |
| Progress indicator + persist inputs between steps | Multi-step best practice: users must never lose a completed step; show position in flow; validate inline per step. |
| Review-before-generate step | Ad Legends, AdCreative, Creatify all insert a brand/product review screen between scrape and generation, because extraction fails or mis-picks (one independent test found AdCreative's color extraction wrong most of the time). |
| Gallery selection for variations | Shape of AI: grid thumbnails (typically 4+), actions on each variant (download / edit / regenerate / more-like-this), never overwrite originals, expose a variation-count control. |
| Cheap preview, paid render | Creatify's two-tier credit model; Arcads' estimate-before-generate. Show credit cost on the Generate button. |
| Collect only what's needed for first value | Insivia: ask segmentation questions only if used immediately to personalize; defer everything else until after the first generation. |

---

## 4. Recommended intake spec — Creative Abundance OS

### Design principles
- **3 required inputs total** (URL, product image, product name — and two of those auto-fill). Everything else defaults.
- Every auto-extracted value shown as **editable, pre-filled fields**, never hidden.
- One "Advanced options" accordion per step, never deeper (NN/g 2-level rule).
- Progress bar, back-navigation with state persisted, inline validation.
- Generate → async progress screen → gallery grid → pick / edit / regenerate / download.

### Step 1 — Start (the hook screen)
| Field | Type | Req | Notes / maps to |
|---|---|---|---|
| Website URL | url input | **Yes** | Triggers scrape (Brandfetch-style + your own scraper). This is the whole screen. |
| Business name | text | auto | Auto-filled from scrape; editable. |

One field on screen. Button: "Build my brand kit". If scrape fails (JS-heavy site, no site), fall through to manual brand entry (Step 2 fields empty instead of pre-filled).

### Step 2 — Brand kit review ("we already did the work" moment)
| Field | Type | Req | Notes |
|---|---|---|---|
| Logo | image preview + upload override | auto | From scrape. Drag-drop replace. |
| Brand colors | 3 color swatches, editable hex | auto | AdCreative pattern: 3 colors. Maps to color1/2/3 pipeline vars. |
| Font | dropdown (detected + curated list) | optional | Default: detected or system pairing. |
| Brand description | textarea, ~500 chars | auto, editable | AI-drafted from site. Flag: "improves your results". Feeds every prompt. |

Advanced accordion: extra logo variants, banned words / compliance notes, brand tone keywords.

### Step 3 — Product
| Field | Type | Req | Notes |
|---|---|---|---|
| Product image(s) | upload, 1-5 | **Yes** (min 1) | Auto background-removal preview (AdCreative pattern). Also offer "use images from your site" picker from scrape (Quickads pattern). |
| Product name | text | **Yes** | Pre-filled if product URL given. |
| Product URL | url | optional | If given, scrape name/description/price (Creatify pattern). |
| Product description / key benefits | textarea | auto, editable | AI-drafted. The single most important prompt variable. |
| Price | text | optional | |
| Offer / promo | text (e.g. "20% off first order") | optional | Feeds headline/CTA generation. |

### Step 4 — Ad setup (the only "creative decisions" screen)
| Field | Type | Req | Default |
|---|---|---|---|
| Ad style | **visual template gallery** (thumbnail cards, not a dropdown) | Yes | "Let AI pick top performers". Categories from your Max Fusion flows + template library: UGC-native, Branded/product hero, Editorial, Testimonial/review, Us-vs-them comparison, Notes/iMessage-style native, Meme/lo-fi, Seasonal. This is where your top-performers library becomes the product. |
| Platform | multi-select chips: Meta FB/IG, TikTok, Pinterest, Google | Yes | Meta |
| Formats | chips: 1:1, 4:5, 9:16, 16:9 | Yes | 1:1 + 9:16 (auto from platform) |
| Target audience | free text + AI-suggested chips from scrape | auto | Creatify auto-generates audience segments from the URL; do the same, let them tap to accept. |
| Ad goal | dropdown: Sales / Traffic / Awareness / App installs / Leads | optional | Sales |
| CTA | dropdown (Shop Now, Learn More, Get Offer, Sign Up, Try Free) + custom | optional | Shop Now |
| Headline | text | optional | Blank = AI writes it (AdCreative model: headline + punchline + CTA are the 3 copy vars). |
| Tone | dropdown: Friendly / Bold / Premium / Playful / Urgent | optional | Friendly |
| # of variations | stepper 4-20 | optional | 10 |

Advanced accordion: language, banned claims, must-include text, specific color overrides.

### Step 5 — Review & generate
- Summary card of everything + editable jump-links back to any step.
- Credit estimate on the button: "Generate 10 ads · 10 credits".
- Async progress screen (never a spinner with no state; show per-ad progress like AdCreative's task polling).

### Step 6 — Results gallery
- Grid of variants (aspect-ratio-true thumbnails, no watermark-blocking overlays — Eric's exact Max Fusion complaint).
- Per-card actions: **Download · Edit copy · Regenerate · More like this**.
- "More like this" = the winner-iteration loop, and later the bridge to performance data.
- Batch download all.

### Phase 2 — Video adds one branch, not a new form
Steps 1-3 identical (same brain, same brand/product record). Step 4 branches when output type = Video:

| Field | Type | Req | Default |
|---|---|---|---|
| Video style | template gallery: UGC selfie review, Product hero, Premium reveal (no person), Voiceover + b-roll, Feature walkthrough, Lookbook | Yes | UGC selfie review (these six map to the proven prompt-formula taxonomy and your two proven editor families) |
| Duration | chips: 15s / 30s | Yes | 15s |
| Script | "AI writes it" (default) or paste own; if AI: shows draft for approve/edit before render | auto | Hook → problem/solution body → proof → CTA structure |
| Presenter | avatar/persona gallery + filters (age, gender, vibe) or "no person" | Yes | Smart-match from audience |
| Voice | voice picker with 5-sec preview | optional | Auto |
| Language | dropdown | optional | English |
| Toggles | captions, music, b-roll | optional | all on |

Backend mapping is Creatify's param set almost verbatim: `visual_style, script_style, aspect_ratio, video_length, language, target_audience, target_platform` + overrides — every one of these is a field above or a default.

### Form-field → pipeline variable map (statics)
| Form field | Pipeline variable |
|---|---|
| Logo, colors, font | brand asset inputs (logo file, color1-3 hex, fontIdentifier) |
| Brand + product description, tone, audience, goal | prompt context block |
| Product image | background/product visual (bg-removed) |
| Headline / CTA / offer | mainHeadline, punchline, actionText (AI-filled when blank) |
| Ad style | template/flow selector (which Max Fusion flow runs) |
| Platform + formats | render sizes (batch) |
| # variations | batch count |

---

## 5. Build notes
- **Brand scraping:** don't build from scratch. Brandfetch API (free 100 req, then metered) or your own Claude-driven scrape for colors/fonts/copy. Budget it per-signup as a credit cost. Always design for scrape failure → manual path.
- **Async everywhere:** every competitor generation API is submit-then-poll. The site needs a job/status model and a results inbox ("your ads are ready" email), not a blocking request.
- **Credits:** flat cheap cost for previews, real cost to render/download finals (Creatify's model). This also makes Eric's "here's 100 credits, Innerwell" partner-gifting play trivial.
- **Watermark previews** for free/trial tiers (Creatify does this; also matches the Amazon-offer watermark playbook).
- **The moat is not the form.** Every field above is copyable. The defensible parts are: (a) your top-performer template library behind the "Ad style" gallery, (b) the review/QA layer your team provides, (c) the per-client brain that compounds (performance data, transcripts). The form is just the front door to those.

## Sources
- help.adcreative.ai/en/articles/5713533 (brand intake, verified) · api-docs.adcreative.ai (generation API, verified)
- docs.creatify.ai — /api/links/, link_to_videos, preview/render credits (primary, partially unverified due to run interruption) · creatify.ai/features/url-to-video · unite.ai/creatify-review (hands-on walkthrough)
- arcads.ai + Arcads help center + API docs (verified) · github.com/krusemediallc/arcads-claude-code (prompt formulas, 37 static templates)
- icon.com / icon.com/how-it-works (verified; pivot to human service)
- alphr.com Quickads walkthrough · omneky.com/support brand onboarding · trypencil.com/the-platform
- canva.com/help/use-magic-design (verified) · canva.com/help/brand-kit-builder (verifier-found correction)
- docs.brandfetch.com/brand-api/overview (verified) · browserless.io Brandfetch engineering post
- nngroup.com/articles/progressive-disclosure · zuko.io single vs multi-step · shapeof.ai/patterns/variations · lollypop.design wizard UI · insivia.com onboarding
