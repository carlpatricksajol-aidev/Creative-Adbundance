# Static Ads Generator v6 → v6.1 — n8n Operator Implementation Guide

Follow this top to bottom inside the live n8n editor (`https://n8n-i3t9.srv1486031.hstgr.cloud`, workflow "Static Ads Generator v6"). Every step names the exact node to open, what to find, the exact change, and how to confirm it. Small JS snippets are shown before→after; full node bodies are **not** repeated here — when a step says "install the node pack version," open `Docs/Static Ads Generator/Static Ads v6 - Node Pack.md` and copy that node's block verbatim.

Base IDs you will need:
- Brand Brain: base `appvCkX59PBphJGOd`, table `tblIqcPJRvpQhS4AM`
- `brand_guidelines` field ID = `fldVLVAaSepdZBEk8` (holds the full Style Dossier text; all edits below reference it by name `brand_guidelines`, so the ID is only for locating the field in Airtable)
- Supabase: `https://xakngjsybyytldyqfsmi.supabase.co`, table `static_ads`, bucket `static-ads`

A note on the v6 payload convention: every v6 node reads the form under `$('Webhook').first().json.body` (e.g. `body.client_name`, `body.platforms`, `body.sku_key`). Keep that `.body` prefix on every Webhook reference below.

---

## STEP 0 — VERIFY the v6 node pack is actually live (B7)

Everything below assumes v6. If the instance is still on v5, the dossier edits have nowhere to land and renders keep dying at KIE's ~24h URL expiry.

**Check for these four tell-tale v6 nodes on the canvas:**
1. **Concept Director** (Code node — it sits after `Describe Template Layout`, which itself follows `Pick Templates1`)
2. **Prompt Composer** (Code node, between Generate Ad Copy1 and Create KIE AI Task1)
3. **QA Gate + Auto-Fix** (Code node, after Extract Image URL2)
4. **Upload to Supabase Storage** (HTTP Request node, after Download Ad Image)

Also confirm the Airtable brand node is named **`Search Brand Brain1`** (with the `1`) and the loop is **`Loop Over Items2`**. (An older export uses `Search Brand Brain` / `Generate Ad Copy` without the `1` and gpt-image-2 — that is pre-v6; if you see those names you are NOT on v6.)

**Branch:**
- **If ANY of the four are missing → you are still on v5.** STOP. Install the full node pack first: work through STEPs 0–9 of `Static Ads v6 - Node Pack.md` (SQL `gen_meta` column, node replacements, the two new persistence HTTP nodes, and the wiring line at the top of that doc). Do NOT hand-transcribe it here — copy each block from that doc. Once all four nodes exist and one smoke run reaches `static_ads` with a `storage/v1/object/public/static-ads/...` URL, come back here.
- **If all four exist → you are on v6.** Proceed to STEP 1.

Confirm before continuing: open **Post to supabase2** and verify its body writes `image_url` as `.../storage/v1/object/public/static-ads/...` (permanent URL), not a raw KIE URL. If it still writes a KIE URL, finish the Node Pack STEP 9 first.

---

## STEP 1 — PREREQUISITE: make the dossier data reach the pipeline (`Search Brand Brain1`)

This is where dossier data enters. Every edit below reads from the `brain` object, which is whatever `Search Brand Brain1` returns. If a field is not in that node's output, downstream code silently reads `undefined`.

**Open `Search Brand Brain1`.** Look at the node's **Options** section:
- If there is **no** field-restricting option set, the Airtable node returns **every** field by default (this is how the shipped node is configured). In that case you only need to **verify** the values are present — you don't add anything.
- If a field list **is** set (in the n8n Airtable node this is the **"Output Fields"** / **"Fields"** list under Options, or a "Return Field Names" toggle), make sure it includes ALL of the fields below, spelled exactly as in Airtable.

Attachment fields (`winning_ads`, `logo_urls`, and any per-SKU image fields) come back automatically as an array of `{url, filename, ...}` objects on the record — you do NOT need to enable "Download Attachments" (that option pulls the binary into the item, which this pipeline does not use; it rehosts by URL).

The field set must include, spelled exactly as in Airtable:

- `brand_guidelines` (field `fldVLVAaSepdZBEk8` — the full Style Dossier)
- `primary_color_hex`, `secondary_color_hex`, `accent_color_hex`
- `brand_fonts`
- `winning_ads` (attachment field — array of `{url, filename}`)
- `logo_urls` (attachment field)
- `compliance_notes` (and `compliance_disclaimer` if present)
- `brand_tone`, `target_personas`, `core_pain_points`, `product_benefits`, `key_offer`, `dos_and_donts`, `creative_boundaries`
- any per-SKU product-image fields (A3), named `product_image_<sku-slug>`, e.g. `product_image_pure_c8`, `product_image_organic_mct`

**Confirm:** Pin a Natural Force execution, run just this node, open its output JSON, and check that `brand_guidelines` is a long dossier string, the three `*_color_hex` fields are populated, `brand_fonts` is non-empty, and `winning_ads` is an array with `url` and `filename` on each entry. If `winning_ads[0].filename` is empty, B13's format detection won't work — fix the Airtable attachment first.

---

## STEP 2 — SKU binding, end to end (B14)

Goal: the form's `sku_key` picks that SKU's product image for `image_input` AND that SKU's motif rules, killing the wrong-product bug.

**2a. Form field (SA-1).** Confirm the form posts `sku_key` (a single string, e.g. `"Pure C8"` or `"Huckleberry"`). This is form work item C21; if it isn't sending yet, the code below degrades gracefully to "all products," but the bug isn't fixed until the field ships.

**2b. `Build KIE AI Prompt` — select the SKU's product image.** Open the node. Near the top it declares three inputs in a row:

```javascript
const allProductUrls = Array.isArray(body.product_image_urls) ? body.product_image_urls.map(String).filter(Boolean) : (body.product_image_url ? [String(body.product_image_url)] : []);
const productNames   = Array.isArray(body.product_names) ? body.product_names.map(String).filter(Boolean) : (body.product_name ? String(body.product_name).split(',').map(s=>s.trim()).filter(Boolean) : []);
const avatarUrl      = (body.ugc_avatar_url && String(body.ugc_avatar_url).trim()) ? String(body.ugc_avatar_url).trim() : null;
```

Insert the B14 block **AFTER all three of these declarations** (immediately before `const MAX_IMAGES = 8;`). It MUST come after `const productNames` — the code reads `productNames`, so inserting it right under `allProductUrls` (before `productNames` is declared) throws "Cannot access 'productNames' before initialization."

```javascript
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
```

Then find the product-budget line (it is **inside** the `items.forEach(...)` loop):

```javascript
const products = allProductUrls.slice(0, Math.max(0, MAX_IMAGES - reserved));
```

Change `allProductUrls` → `skuUrls`:

```javascript
const products = skuUrls.slice(0, Math.max(0, MAX_IMAGES - reserved));
```

Finally, in the `result.push({ json: { ... }})` object, add `sku_key` so QA, Prompt Composer, and the compliance gate can read it. Find:

```javascript
    client_name: clientName, rehost_warnings: it._rehost_warnings || [],
```

Change to:

```javascript
    client_name: clientName, sku_key: skuKey, rehost_warnings: it._rehost_warnings || [],
```

(`skuKey` and `skuUrls` are declared at the top of the node, so they are in scope both inside the loop and in the pushed object.)

**2c. `Concept Director` — pass the SKU into the brief.** Open the node, find the `brief` array (starts `'BRAND: '+clientName`) and add one line, e.g. after the `PRODUCT BEING ADVERTISED` line:

```javascript
  'SKU BEING ADVERTISED: ' + String(body.sku_key || '(none specified)'),
```

This makes the selector and per-concept prompts aware of which motif to honor (NF: flame vs coconut; ARMRA: jar vs cans). The SKU-filtered product-treatment injection happens in STEP 5 (B11).

**Confirm:** Pin a Natural Force run with `sku_key: "Pure C8"`. Open `Build KIE AI Prompt` output: `image_input` must contain the Pure C8 bottle URL only (not Organic MCT), and `sku_key` must be present on the item.

---

## STEP 3 — QA Gate brand-specific rubric (B15)

Turn the dossier Never-do list into hard QA checks (wrong SKU pairing, yellow-dominant Nurx, invented Huckleberry app UI, tilted NF bottle, text outside safe zone).

**3a. Carry the SKU into QA.** Open `Extract Image URL2`. In its returned object, add:

```javascript
  sku_key: src.sku_key || '',
```

(`src` is the `Prompt Composer` output it already reads; `sku_key` flows into it from STEP 2b via Build KIE AI Prompt.) Do this BEFORE 3b — 3b reads `item.sku_key` in the QA node, which is this field.

**3b. `QA Gate + Auto-Fix` — add the SKU + safe-zone checks.** Open the node. Find the `checks.push(...)` line:

```javascript
checks.push('(3) logo per the rule above', '(4) palette respected for designed ads (photographic ads only need a natural brand accent)', '(5) no DONT violations', '(6) no anatomical or rendering artifacts, no clipped text at edges');
```

Replace with:

```javascript
checks.push('(3) logo per the rule above', '(4) palette respected for designed ads (photographic ads only need a natural brand accent)', '(5) no DONT violations from the BRAND DONTS list', '(6) no anatomical or rendering artifacts, no clipped text at edges', '(7) the product shown is the expected SKU "' + (item.sku_key || 'n/a') + '" — right container/flavor/motif, upright and undistorted, not a similar-looking swap', '(8) all text sits inside the safe zone with generous edge margins');
```

The existing `BRAND DONTS: item.dos_and_donts` line already feeds the dossier Never-do rules into the prompt — that's why STEP 1 must return `dos_and_donts`. If a brand's key Never-do rules live only in `brand_guidelines`, also add this line to the `qaPrompt` array (just below the `BRAND DONTS` line):

```javascript
    'BRAND NEVER-DO (from dossier): ' + String(item.brand_guidelines || '').slice(0, 800),
```

...and carry `brand_guidelines` through the chain so `item.brand_guidelines` is populated here: add `brand_guidelines: src.brand_guidelines || ''` to `Extract Image URL2`'s returned object, and add `brand_guidelines: String(brain.brand_guidelines || '')` to `Build KIE AI Prompt`'s result object. (STEP 5's 5a adds that same Build KIE AI Prompt field — do it once; whichever step you reach first, the other says "skip.")

**Confirm:** Run one ad and open `QA Gate + Auto-Fix` output. `qa_flags` should reflect real checks; force a mismatch (temporarily point `sku_key` at the wrong SKU) and verify the score drops / a `wrong_sku`-style flag appears.

---

## STEP 4 — Concept Director selects from the brand's NAMED format list (B13)

Stop drawing only from the generic MECHANISMS list; prefer the brand's named formats (dossier layout patterns + winning_ad filename tokens like `NF_PureC8_Toggle_...`), rotate them across the batch, and hand each concept a coherent format name.

**Open `Concept Director`.** Find the `winnerItems` / `nonWinnerItems` split (around `function isWin`). Immediately after it, insert:

```javascript
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
```

Then find the `selectPrompt` array. Add these two lines inside it, right after the `'ANGLE MENU: ...'` line:

```javascript
    (brandFormats.length ? 'BRAND NAMED FORMATS (strongly prefer these proven formats when they fit; rotate them, NEVER repeat a format within this batch): ' + brandFormats.join(', ') : ''),
    (brandFormats.length ? 'For each pair add a "format" field naming the brand format you are executing (exact name from the list).' : ''),
```

Then find the JSON-shape instruction line in `selectPrompt`:

```javascript
    'Return ONLY a JSON array of exactly ' + slotsWanted + ' objects: [{"mechanism":"...","angle":"...","carrier":"...","why":"one line"}]. No markdown.'
```

Change the object shape to include `format`:

```javascript
    'Return ONLY a JSON array of exactly ' + slotsWanted + ' objects: [{"mechanism":"...","format":"...","angle":"...","carrier":"...","why":"one line"}]. No markdown.'
```

In the normalize step (`pairs = pairs.slice(...).map(p => {...})`), carry `format` through — change the returned object to add it:

```javascript
    return { mechanism: mech, format: String((p && p.format) || '').trim(), angle: (p.angle && ANGLES.indexOf(String(p.angle)) !== -1) ? String(p.angle) : ANGLES[0], carrier: String(p.carrier || '').trim() || 'clean editorial layout', why: String(p.why || '') };
```

(The fallback top-up loop below it pushes pairs without a `format` — that's fine; the code below treats a missing format as empty and degrades gracefully. The fallback path only fires when the LLM selector fails entirely.)

In `genOne`, expose the format to the per-concept prompt — the `genPrompt` array is `.filter(Boolean).join('\n')`, so add this ternary anywhere in it (e.g. right after the `'MECHANISM (fixed): ' + pair.mechanism` element):

```javascript
      (pair.format ? 'BRAND FORMAT (execute this named format): ' + pair.format : ''),
```

and after generation, stamp it onto the concept (among the other `cpt.X = ...` lines that follow the `JSON.parse`):

```javascript
    cpt.format = pair.format || '';
```

**Also carry `format` into the saved record (so `gen_meta.format` actually lands — the smoke test checks for it):**
- In `Extract Image URL2`, next to the `carrier: src.concept?.carrier || ''` line, add:
  ```javascript
    format: src.concept?.format || '',
  ```
- In `Post to supabase2`, inside the `gen_meta` object, next to `carrier`, add:
  ```
  format: {{ JSON.stringify($('QA Gate + Auto-Fix').item.json.format ?? '') }},
  ```
  (`QA Gate + Auto-Fix` passes the Extract Image URL2 fields straight through via `Object.assign`, so `format` is available there.)

**Optional (attach the matching winning_ad image):** if `winning_ads` are populated, you can also hand the Composer the matching reference image. In `Build KIE AI Prompt`, after `imageInput`/`roles` are built inside the `forEach`, find the winning_ad whose filename contains `it.concept && it.concept.format`, and if `imageInput.length < MAX_IMAGES` push its URL to `imageInput` and `'reference format'` to `roles`. IMPORTANT: `brain.winning_ads` URLs are raw Airtable URLs that expire (~2h) and are robots-blocked — they are only safe to feed the generator if you rehost them first (reuse the KIE `file-url-upload` rehost pattern from `Pick Templates1`). Because of that extra work, treat this as truly optional: B13's core value (the named format + its layout spec via STEP 5) already ships without it. Do this only after B13's rotation is confirmed, and only for brands with real `winning_ads` (Natural Force, Nurx, Huckleberry, Tapouts, ARMRA, Mulberrys) — not ADR.

**Confirm:** Run a Natural Force batch at count 1 (which yields 2 concepts). Open `Concept Director` output: the two non-winner concepts must have DIFFERENT `format` values, and each format must be one from the brand's list (e.g. `Toggle`, `This is Bob`), not a repeat.

---

## STEP 5 — Prompt Composer: selective dossier injection (B11)

Inject only the relevant slices of the dossier — the ONE layout/format being executed + Typography + Color usage + Product treatment (SKU-filtered) + Never-do. Never the whole 4–5k-char dossier (that regresses to rule-soup).

**5a. Make the dossier reach the Composer.** Open `Build KIE AI Prompt`, and in its `result.push({ json: { ... }})` add:

```javascript
    brand_guidelines: String(brain.brand_guidelines || ''),
```

(If you already added this in STEP 3, skip.)

**5b. `Prompt Composer` — section the dossier and inject only 5 slices.** Open the node. Near the top (after `const item = $input.first().json;`, and BEFORE the `if (item.is_winner)` winner branch so both branches can read `dossierSlices`), insert a small sectioner:

```javascript
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
```

(The `esc` escape matters: `section()` is called with `item.concept.format`, which can contain `/`, `&`, `'`, or parentheses. Without escaping, `new RegExp` would throw on those and fail the whole node.)

Then, in the **non-winner** `composerPrompt` array, add ONE new numbered line before item 9 (the constraint block), e.g. right after the item-8 composition-safety line:

```javascript
  (dossierSlices ? 'BRAND DOSSIER (obey these specific rules for this format only):\n' + dossierSlices : ''),
```

(This array is joined without `.filter(Boolean)`, so when no dossier text is found you'll get one blank line — harmless.)

For the **winner** branch (which builds `lines` and `.filter(Boolean).join('\n')`s them), add the same slice to `lines` before the final "No other brand names..." line in BOTH the `close_repro` array and the inspired array:

```javascript
    (dossierSlices ? 'Brand dossier rules to honor: ' + dossierSlices : ''),
```

**Confirm:** Run one ad. Read `Prompt Composer` output `prompt`: it should contain only the selected format's layout rule, typography words, color-usage proportions, SKU-filtered product treatment, and never-do — NOT the entire dossier.

---

## STEP 6 — Prompt Composer: actually inject brand_fonts as letterform words (B12)

v5 fetched `brand_fonts` and never used it. The dossier's plain-word letterform description now comes in via the Typography slice (STEP 5), but also strengthen the explicit typography line.

**Open `Prompt Composer`.** Find the non-winner typography line (item 5):

```javascript
  '5. Typography: describe the typeface character in plain words' + (item.brand_fonts ? ' (brand fonts are ' + item.brand_fonts + ' — describe their look, e.g. rounded friendly sans, elegant serif)' : '') + '; one weight/color note per text element.',
```

Change it to also lean on the dossier's font description:

```javascript
  '5. Typography: render the copy in a typeface matching the brand fonts' + (item.brand_fonts ? ' (' + item.brand_fonts + ')' : '') + '. Describe their letterform character in plain words (e.g. rounded friendly sans, high-contrast elegant serif, condensed grotesque) using the TYPOGRAPHY dossier section above; give one weight/color note per text element. Do not just name the font family.',
```

**Confirm:** `brand_fonts` must be non-empty in `Build KIE AI Prompt` output (STEP 1). Read a generated `prompt` — it should describe the letterforms in words, not just "use Fredoka."

---

## STEP 7 — Color priority: dossier hex fields are ground truth (B19)

Brand Brain hex fields win; Haiku logo-color extraction is fallback-only; the prompt uses usage semantics + proportions, not bare hexes.

**7a. `Concept Director` — flip precedence.** Find:

```javascript
const primaryHex = colorSrc.primary_color_hex || brain.primary_color_hex || '';
const secondaryHex = colorSrc.secondary_color_hex || brain.secondary_color_hex || '';
const accentHex = colorSrc.accent_color_hex || brain.accent_color_hex || '';
```

Change to put `brain` first:

```javascript
const primaryHex = brain.primary_color_hex || colorSrc.primary_color_hex || '';
const secondaryHex = brain.secondary_color_hex || colorSrc.secondary_color_hex || '';
const accentHex = brain.accent_color_hex || colorSrc.accent_color_hex || '';
```

**7b. `Build KIE AI Prompt` — same precedence.** The result object already reads `it.primary_hex || brain.primary_color_hex` (the value passed down from Concept Director, now brain-first). No change needed — just verify those three lines read `it.*_hex || brain.*_color_hex` (brain, not `colorSrc`; Build KIE AI Prompt has no `colorSrc`).

**7c. Usage semantics.** The dossier COLOR USAGE slice from STEP 5 (e.g. "~60% white/cream; green only for the offer badge") now flows into the prompt. No extra edit — just confirm that slice is landing.

**7d. (Optional) short-circuit `Extract Brand Colors`.** Open `Extract Brand Colors`. To stop burning a Haiku vision call on Airtable-hosted logos when the fields are already filled, add this at the very top of the node's code:

```javascript
const brain = $('Search Brand Brain1').first().json || {};
if (brain.primary_color_hex && brain.secondary_color_hex) {
  return [{ json: { primary_color_hex: brain.primary_color_hex, secondary_color_hex: brain.secondary_color_hex, accent_color_hex: brain.accent_color_hex || null } }];
}
```

If this node already declares its own variable holding the Search Brand Brain1 row, reuse that variable instead of re-declaring `const brain` (a duplicate `const brain` is a syntax error) — the point is only to read the hex fields and early-return. This node's output field names (`primary_color_hex`, etc.) match what `Concept Director` reads from `$('Extract Brand Colors')`.

**Confirm:** Run Nurx. The output colors must equal the corrected Airtable hex fields, and the prompt must state usage proportions, not just three hex codes.

---

## STEP 8 — Remove the "render the wordmark" logo fallback (B9)

Image models approximate lettering — this is what invented the fake Nurx logo. Never let the model draw a wordmark.

**Open `Prompt Composer`.** The v6 node already has the correct contract in most branches ("reproduce exactly, one placement, never redraw"; and when no logo: "do not invent one"). Harden it:

Find the non-winner `noLogoClause` and confirm it reads exactly:

```javascript
const noLogoClause = item.has_logo ? '' : ' No brand logo was supplied: the ad must NOT contain any logo, wordmark, or logo-like badge; where the layout expects a logo, leave clean space.';
```

Then find the logo clause inside the reference-contract item (item 7). Make sure the "Logo image" clause reads "reproduce exactly, one placement, never redraw" and there is NO instruction anywhere that says to "render/write/spell the brand name as a logo."

For deterministic placement, add a **brand-aware** clause right after the `noLogoClause` line (do NOT hardcode Nurx's placement for every brand — its 15% rule is Nurx-specific per the dossier):

```javascript
const brandLc = String(item.client_name || '').toLowerCase();
const logoPlacement = !item.has_logo ? ''
  : (brandLc.includes('nurx')
      ? ' Place the supplied logo at about 15% of canvas width, centered above the headline, with one logo-height of clear space around it.'
      : ' Place the supplied logo once, at a single natural placement, with clear space around it.');
```

...and append `+ logoPlacement` to the **with-images** branch of item 7 (the reference-contract string that ends in `...never redraw.' + noLogoClause`), so it becomes `...never redraw.' + noLogoClause + logoPlacement`.

Also open `Search Brand Brain1` output and confirm `logo_urls` returns a real asset for logo-bearing brands (Nurx, Natural Force, Tapouts, Mulberrys). Huckleberry is text-only — it must have NO `logo_urls`, so `has_logo` is false and the no-invention clause fires.

**Confirm:** Run Nurx (has logo) and Huckleberry (no logo). Nurx render shows the real supplied wordmark, correctly placed; Huckleberry render has NO logo/badge anywhere.

---

## STEP 9 — Compliance text gate for ADR (B16)

A deterministic regex gate over the generated copy BEFORE render. New Code node.

**Add a new Code node named `Compliance Gate (ADR)`.** Wire it **between `Prompt Composer` and `Create KIE AI Task1`** (Prompt Composer → Compliance Gate (ADR) → Create KIE AI Task1). It passes the full item through unchanged (including `kie_body`, which `Create KIE AI Task1` reads), so nothing downstream breaks; `Extract Image URL2` still reads `$('Prompt Composer')` by node name, unaffected by the insert. Paste:

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

This gate fires when the brand name matches the ADR pattern OR `compliance_notes` is non-empty — so make sure regulated brands either match the name pattern or have `compliance_notes` populated in Brand Brain (A2). Non-regulated brands pass straight through.

If you prefer a non-fatal route, use an **IF node** instead: condition `regulated AND (banned OR unapproved-claim)` → true branch to a "flag & skip" no-op, false branch to `Create KIE AI Task1`. The throw version matches the workflow's fail-loud convention and is simpler.

**Confirm:** Pin a `Prompt Composer` output (or edit the pinned data) so that `client_name` is an ADR value and either `prompt` or a `concept.copy_blocks[].text` contains the phrase `debt settlement`, then execute the `Compliance Gate (ADR)` node — it must throw and stop the branch. Change that phrase to `Save 40% or more on eligible monthly payments` and re-run — it must pass through unchanged.

---

## STEP 10 — AI-performer disclosure (B17)

Auto-append "This ad contains an AI-generated performer." whenever an AI human subject is used (Tapouts, Huckleberry, Nurx, Mulberrys).

**Open `Prompt Composer`.** Add the definition **near the top — right after `const aspect = ...` and BEFORE the `if (item.is_winner)` winner branch.** It must be above the winner branch so both branches can read it; defining it lower (inside the non-winner section) throws "Cannot access 'usesPerformer' before initialization" when the winner branch runs.

```javascript
// B17: disclosure when an AI performer appears
const usesPerformer = !!(item.concept && item.concept.needs_person) || (item.avatar_index >= 0) || /UGC|SELFIE|PERSONA|LIFESTYLE|TESTIMONIAL/i.test(String((item.concept && item.concept.mechanism) || ''));
const AI_DISCLOSURE = 'This ad contains an AI-generated performer.';
```

In the **non-winner** branch, find the `copyList` build and append the disclosure as a required small footer string:

```javascript
const copyListFinal = copyList + (usesPerformer ? '\n- [disclosure @ bottom] "' + AI_DISCLOSURE + '" (render as a small, legible footer line)' : '');
```

Then use `copyListFinal` instead of `copyList` in item 4 of `composerPrompt`.

In the **winner** branch, add to `copyLines` when `usesPerformer`:

```javascript
  ...(usesPerformer ? ['Also render a small legible footer line, verbatim: "' + AI_DISCLOSURE + '"'] : []),
```

**Confirm:** Run a Tapouts/UGC concept — the rendered ad has the disclosure as a small footer. Run a product-only Natural Force concept (no person) — no disclosure appears.

---

## STEP 11 — Per-brand canvas defaults (B18)

Don't trust the platform dropdown alone; use the dossier Canvas line.

**Open `Parse Platform`.** After it computes `aspect_ratio`, add a brand override map and apply it only when the form didn't force a platform:

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

Notes for this node (its v5 code is not in the Node Pack, so adapt to what you see):
- The form's platform field is `platforms` (confirmed) and this v6 node reads the form under `.body`. Open the `Webhook` output to confirm `body.platforms` is where the selection lands; if for an editor test run it's empty/absent, the override simply always applies the brand default, which is the intended behavior when no platform was chosen.
- `aspect_ratio` must be a reassignable `let`. If the node declares it with `const`, change that to `let` (or apply the override inside the returned object instead of reassigning).
- Place this override BEFORE the node's final `return` statement, and make sure `aspect_ratio` is the exact variable the node already outputs.

This sets the primary aspect per brand. To also cover a brand's secondary canvas size, run a second batch with a platform selected that maps to that aspect.

**Confirm:** Run Natural Force with no platform selected — `aspect_ratio` resolves to `16:9`. Run Huckleberry — resolves to `1:1`.

---

## STEP 12 — Real safe-zone numbers (B10)

Replace the generic "central 84% / 86%" with CA-TEMPLATES pixel margins.

**Open `Prompt Composer`.** After `const aspect = ...` (before the winner branch, so both branches can read `safeZone`), add:

```javascript
// B10: real safe-zone numbers
const SAFE = {
  '9:16': 'Keep all text and key subjects at least 145px from the left and right edges, 258px clear at the top and 450px clear at the bottom (1080x1920 canvas).',
  '1:1':  'Keep all text and key subjects within the central 88% of the canvas, minimum ~110px margins (1080x1080).',
  '16:9': 'Keep all text and key subjects within the central 90% of the canvas, minimum ~120px margins (1920x1080).'
};
const safeZone = SAFE[aspect] || SAFE['1:1'];
```

Non-winner branch — find item 8:

```javascript
  '8. Composition safety: all text and key subjects sit well inside the frame with generous margins (safe zone about 86% of canvas); nothing touches the edges.',
```

Replace with:

```javascript
  '8. Composition safety: ' + safeZone + ' Nothing touches the edges.',
```

Winner branch — find the trailing `Keep all text well inside the frame.` on both the `close_repro` and the inspired paths and append the safe zone, i.e. change each to `...Keep all text well inside the frame. ' + safeZone`.

**Confirm:** Read a 9:16 prompt — it must state the 145/258/450 px margins, not "84%."

---

## STEP 13 — Verify winning_ads vision stays on gpt-4o (B20)

Airtable URLs are robots.txt-blocked for Anthropic models; the new attachments make team_top5 vision calls more frequent.

Check these three, no code change unless one is wrong:
1. **`QA Gate + Auto-Fix`** — its vision `httpRequest` body must say `model: 'openai/gpt-4o'`. Confirm (it does in the pack). This is the one that inspects rendered images.
2. **`Describe Template Layout`** — must run on the KIE-rehosted URLs produced by `Pick Templates1` (which already rehosts every Airtable URL through KIE), NOT raw `airtableusercontent.com` URLs. Open `Pick Templates1` output and confirm `template_url` for winners/templates points at `kieai.redpandaai.co` / KIE, not Airtable. If it does, Haiku vision there is safe.
3. **`Extract Brand Colors`** — it calls Haiku on `logo_urls[0]`, which is an Airtable URL. If you did NOT add the STEP 7d short-circuit, either add it, or switch that node's `model` to `openai/gpt-4o`, or rehost the logo first. Simplest: keep the STEP 7d short-circuit so it never hits Airtable when hex fields exist.

**Confirm:** Run a team_top5 batch for a brand with real winners (e.g. ARMRA). QA scores must come back as numbers (not `qa_unavailable`), proving the gpt-4o vision call fetched the image.

---

## STEP 14 — Remove the `Rehost to supabase` no-op node (B8)

It's a verified dead node in v6.

On the canvas, find **`Rehost to supabase`** inside the loop. Delete it, then re-connect the loop so `Loop Over Items2` → `Generate Ad Copy1` directly (the pack's tail wiring). Verify no dangling connector remains.

**Confirm:** The loop path is `Loop Over Items2 → Generate Ad Copy1 → Prompt Composer → Compliance Gate (ADR) → Create KIE AI Task1 → Wait2 → Poll Task Status2 → If3 → Extract Image URL2 → QA Gate + Auto-Fix → Download Ad Image → Upload to Supabase Storage → Post to supabase2 → Loop Over Items2`. Run once end to end — no "unconnected node" warning.

---

## SMOKE TEST — run before calling it done

Run these two batches from the editor (set the pinned Webhook `generation_mode` to `"top_performers"` per Node Pack 0d; production calls ignore pinData).

**Batch 1 — Natural Force, count 1, `sku_key: "Pure C8"`, no platform selected.**
Expect:
- `aspect_ratio` = `16:9` (B18).
- 2 concepts with DIFFERENT brand `format` values from NF's list (B13).
- Prompt Composer prompts contain: only the selected format's dossier slice + typography letterforms + color proportions ("~60% white/cream...") + SKU product-treatment for Pure C8, and the pixel safe zone that matches the resolved canvas — here the **16:9** zone (central ~90%, ~120px margins) per B10 (B10/B11/B12/B19).
- `image_input` contains the **Pure C8** bottle only (B14).
- If a person appears, the AI-performer disclosure footer is requested (B17).
- QA returns numeric scores via gpt-4o (B15/B20).
- Two rows land in `static_ads` with `image_url` = `https://xakngjsybyytldyqfsmi.supabase.co/storage/v1/object/public/static-ads/...`.

**Batch 2 — Nurx, count 1, `team_top5`** (Nurx has real winners).
Expect:
- Real supplied Nurx wordmark reproduced, correctly placed (~15% width, centered above headline); NO invented logo (B9).
- Layout is NOT yellow-dominant; QA flags it if it is (B15).
- AI-performer disclosure present if a human is shown (B17).
- Rows in `static_ads` as above.

**What to check in Supabase:**
- Table `static_ads`: new rows for both brands; `qa_score` is an integer (or null on QA outage, never fabricated); `qa_flags` reflects the new SKU/safe-zone checks; `gen_meta` JSON contains `mechanism`, `angle`, `carrier`, `format`, `final_model`, and the composed `prompt`.
- Bucket `static-ads`: the PNG objects referenced by each `image_url`.
- Open both public URLs — they must render now AND still render tomorrow (the whole point of the v6 persistence pair).

**Regulated-brand check (do once):** with `Compliance Gate (ADR)` wired in, pin/edit a Prompt Composer output for an ADR brand whose copy contains "debt settlement" and execute the gate — it must throw and block the render (B16); swap to "Save 40% or more on eligible monthly payments" and it must pass.

---

### Implementation order recap
STEP 0 (B7 verify) → STEP 1 (dossier fields reach the pipeline) → B14 → B15 → B13 → B11 → B12 → B19 → B9 → B16 → B17 → B18 → B10 → B20 → B8 → smoke test. This front-loads the data plumbing and the two client-burning bugs (wrong SKU, invented logo / uninspected output), then the structural format upgrade, then the prompt-quality and safety passes, and deletes the dead node last.

Two ordering constraints inside the plan, because of shared-field dependencies: do STEP 3a (carry `sku_key` through `Extract Image URL2`) before STEP 3b (QA reads `item.sku_key`); and whichever of STEP 3 / STEP 5a you reach first is the one that adds `brand_guidelines` to `Build KIE AI Prompt` — the other says "skip." When editing `Prompt Composer`, the STEP 5b sectioner, the STEP 10 disclosure defs, and the STEP 12 safe-zone map all belong at the top of the node, above the `if (item.is_winner)` branch, so both branches can read them.