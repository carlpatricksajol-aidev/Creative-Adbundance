# Static Ads v6.1 — Dossier Integration Punch List

Date: 2026-07-06. Follows the Figma Style Dossier extraction (7 brands written into Brand Brain `brand_guidelines`, colors/fonts corrected, brand-true `winning_ads` attached for 6 brands). Each item marked REMOVE / ADD / UPDATE / VERIFY.

Suggested order: **A1 → B7 → B14+B15 → B13 → B11+B12 → B9 → B16+B17 → rest.**
(A1 is actively dangerous data, B7 gates everything, B14/15 kill the client-burning bugs, B13 is the structural upgrade.)

> **n8n items (B7-B20): full operator step-by-step is in `Static Ads v6.1 - n8n Implementation Guide.md`** (same folder) — node-by-node edits with before/after snippets, adversarially verified. This punch list is the index; that doc is the how-to.
> **Airtable status (2026-07-06):** A1 DONE (78 rows cleared). A2 DONE for the two new rows (ARMRA `rec5JN6j7x3fk1cbw`, ADR `recrxeIPDvIeukR6W`); the 5 established brands already had strategy fields + real logos. A3/A4/A5 still need external assets/links (see below).

---

## A. Airtable — Brand Brain (`appvCkX59PBphJGOd` / `tblIqcPJRvpQhS4AM`)

- [x] **A1. DONE (2026-07-06): cleared placeholder `winning_ads` on all 78 rows.** Verified zero rows held any legitimate content before clearing. Original REMOVE task below.
  REMOVE (urgent, base-wide): placeholder `winning_ads` on every remaining row. The same 6 cross-brand files ("113_Static_One Solution_V1_V (1).png", "TopPerformingStatic_1200x1200 (1).png", "13 (2).png", "9.png", "11 (2).png", "8 (1).png") were bulk-pasted onto every inspected row, incl. immy, Happy Aging, Trusted Company Reviews. Any brand running `team_top5` today close-reproduces ANOTHER brand's ads. Purge or replace across all ~78 rows. (Already replaced with brand-true statics: Natural Force, Nurx, Huckleberry, Tapouts, ARMRA, Mulberrys. ADR intentionally left empty — its _INT board holds other brands' reference ads.)
- [x] **A2. DONE (2026-07-06): wrote `brand_tone`, `key_offer`, `target_personas`, `product_benefits`, `compliance_disclaimer` for ARMRA (`rec5JN6j7x3fk1cbw`) and ADR (`recrxeIPDvIeukR6W`)** — compliance-scanned (ADR banned-phrase check passed) and em-dash-cleaned. STILL OPEN for these two rows: `logo_urls` (A4) and per-SKU `product_image` (A3). Human sign-offs flagged: ADR (is there a real promo offer? is the quote free/no-obligation? re-confirm BBB/Trustpilot figures) and ARMRA (legal to confirm exact FDA-DSHEA disclaimer wording + placement; substantiate the "86% less bloating" stat; confirm the inferred 25-45 age range; supply/approve any offer). The 5 established brands already had these fields populated — left untouched.
- [ ] **A3. ADD: per-SKU product images**, labeled for SKU-key selection. Natural Force: Pure C8 vs Organic MCT bottle shots. ARMRA: powder jar vs soda flavors (Huckleberry purple, Pomelo Basil peach, Pear Ginger gold, Spicy Lime green).
- [ ] **A4. ADD: real logo assets to `logo_urls`** exported from the _INT files: Nurx serif "Nurx" wordmark (capital N + lowercase urx — this IS the real logo), Natural Force ribbon-banner + plain wordmark, tapouts wordmark, mulberrys lockup. Huckleberry rule is the opposite: NO logo lockup, text-only brand mentions.
- [ ] **A5. ADD: missing dossiers** — Innerwell, Grade Potential, Symple Lending, My Social Calendar (the brief's problem brands) + rest of roster. Blocked on Figma links only: their onboarding decks are >100MB so pptx-link extraction times out. Carl to share the Figma project folder or per-file links; then rerun the extraction pipeline (file key → agent → Airtable write).
- [ ] **A6. UPDATE (process): dossier refresh loop.** Re-run extraction when a new batch ships in a brand's _INT file (the Nurx UPDATED round proves revisions encode client taste). Monthly or on "batch shipped".

## B. n8n — v6 workflow

- [ ] **B7. VERIFY FIRST: is the v6 node pack installed in live n8n?** The pack exists in `Static Ads v6 - Node Pack.md` but the live instance may still be pre-v6. Everything below assumes v6, especially **Step 9 persistence** — renders keep dying at KIE's ~24h URL expiry until installed.
- [ ] **B8. REMOVE: `Rehost to supabase` no-op node** (verified dead in v6).
- [ ] **B9. REMOVE: the "render the wordmark" logo fallback.** Image models approximate lettering (source of the invented Nurx logo). Replace with logo asset in `image_input` + "reproduce exactly, do not redraw" contract, or deterministic post-composite at dossier-specified size/position (Nurx: ~15% canvas width, centered above headline, one logo-height clearspace).
- [ ] **B10. REMOVE: generic `SAFE_ZONE_SUFFIX` ("central 84%").** Replace with CA-TEMPLATES real numbers: 9:16 → ~145px side margins, ~258px top clear, ~450px bottom clear; sane 1:1 default.
- [ ] **B11. UPDATE: `Prompt Composer` — selective dossier injection.** Dossiers are ~4-5k chars, sectioned by bullet header. Inject only: the ONE layout pattern being executed + Typography + Color usage + Product treatment (SKU-filtered) + Never-do. Never the whole dossier (rule-soup regression).
- [ ] **B12. UPDATE: `Prompt Composer` — actually inject `brand_fonts`** (v5 fetched, never used). Inject the dossier's plain-word letterform description, not just the family name.
- [ ] **B13. UPDATE: `Concept Director` — select from the brand's NAMED format list** (dossier layout patterns; also encoded in winning_ads filenames, e.g. `NF_PureC8_Toggle_...`). Hand the Composer a coherent triplet: format name + matching winning_ad image + that format's layout spec. Rotate formats across a batch (no repeats).
- [ ] **B14. ADD: SKU binding.** Form `sku_key` → select that SKU's product image for `image_input` AND that SKU's dossier motif rules (NF: flame vs coconut; ARMRA: jar vs cans). Kills the wrong-product bug.
- [ ] **B15. UPDATE: `QA Gate + Auto-Fix` — brand-specific rubric from the dossier Never-do list** (wrong SKU pairing, yellow-dominant Nurx layout, invented Huckleberry app UI, text outside safe zone, tilted NF bottle...).
- [ ] **B16. ADD: compliance text gate for ADR** (and future regulated brands). Regex over generated copy BEFORE render: block "debt settlement", "debt resolution", "all your bills", "you will save"; require approved phrasings ("Save 40% or more on eligible monthly payments", "Clients save an average of $480/month", "Become debt-free in as little as 24-48 months"). Deterministic, not vision-dependent.
- [ ] **B17. ADD: AI-performer disclosure.** Auto-append "This ad contains an AI-generated performer." whenever an AI avatar/human subject is used (Tapouts, Huckleberry, Nurx, Mulberrys all require it).
- [ ] **B18. UPDATE: per-brand canvas defaults** from the dossier Canvas line. NF: 1920x1080 + 1080x1080. Huckleberry: 1200x1200 + 1080x1920. Most others: 1080x1920 + 1080x1080. Don't trust the platform dropdown alone.
- [ ] **B19. UPDATE: color priority.** Brand Brain hex fields are ground truth for dossier brands; Haiku logo-color extraction becomes fallback-only (fields empty). Prompt uses dossier usage semantics + proportions ("~60% white/cream; green only for the offer badge"), not bare hexes.
- [ ] **B20. VERIFY: vision calls on `winning_ads` stay on `openai/gpt-4o`.** Airtable URLs are robots.txt-blocked for Anthropic models; the new attachments make team_top5 vision calls more frequent.

## C. SA-1 form

- [ ] **C21. ADD: SKU/product selector** per brand (feeds B14).
- [ ] **C22. UPDATE: `team_top5` option** — enable for the 6 brands with real winners; warn/disable for brands whose winning_ads are still empty or placeholder.

## D. Measurement

- [ ] **D23. ADD: before/after benchmark.** Rerun the exact briefs behind the bad Natural Force and Nurx batches; compare Supabase QA scores + human keep-rate vs pre-dossier runs. Decides whether dossier coverage extends to all 78 brands.
- [ ] **D24. ADD: QA failure tracking by dossier rule** so Never-do items that never fire get pruned from prompts (keeps rule-soup pressure down).

---

### Reference — what already shipped (2026-07-06)
- Style Dossiers in `brand_guidelines` + corrected colors/fonts: Natural Force `recunpMOcV3v8xc3j`, Nurx `recCYzo5ZDcgVAsit`, Huckleberry `recteLBypMZ0AnCRs`, Tapouts `rectlB4oD2SwMjq8X`, Mulberrys `rec6ahczUYHwXMAzn`, ARMRA `rec5JN6j7x3fk1cbw` (new), ADR `recrxeIPDvIeukR6W` (new, incl. compliance board).
- Brand-true `winning_ads` (5-6 designer statics each, Airtable-ingested, format-named filenames) for the 6 non-ADR brands above.
- Figma _INT file keys + extraction method: memory `reference_figma_int_files.md`; handoff brief `Figma Style Dossier - Handoff Brief.md`.
- Supabase note: service-role key lives only in n8n (docs sanitized); anon key is RLS-blocked for storage writes — future exports can keep using Airtable URL ingestion.
