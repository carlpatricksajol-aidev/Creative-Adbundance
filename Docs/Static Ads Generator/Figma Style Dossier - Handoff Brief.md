# Figma Style Dossier — Handoff Brief (for the "Review Figma design files" session)

You are continuing work planned in another session. Carl has pasted Figma file links for designer-made static ads. Your job: extract per-brand STYLE DOSSIERS from those designs and wire them into the ad-generation system. Everything you need is below — do not re-derive it.

## Context (established, do not re-litigate)
- We run an n8n pipeline ("Static Ads Generator v6") that generates static ads via KIE AI (`nano-banana-pro`). Its **Prompt Composer** node writes one art-director-style image prompt per ad and **already consumes the Brand Brain's `brand_guidelines` field** — whatever you write there flows into every generated ad for that brand.
- The generator's quality bar comes from a reverse-engineered "winning prompt anatomy": one committed visual scene, named zones (top/center/bottom), copy quoted verbatim per zone, typography described in plain words, **text living on a physical carrier** (sticky note, billboard, app UI, check mailer...), camera/lighting for photographic looks, short style-only negatives.
- Full background if needed: `Docs/Static Ads Generator/Static Ads v6 - Reverse Engineering and Rebuild Plan.md` and `Static Ads v6 - Node Pack.md` (same folder).

## Known quality problems this work must fix
1. **Natural Force — WRONG PRODUCT rendered.** Multi-SKU brand; ads showed the wrong/invented product. When you read their designs, record exactly how the designers treat each product (which SKU, angle, scale, shadow) and note the SKU names. (The pipeline-side fix — binding the selected SKU's photo into `image_input` — already exists in v6; the dossier adds the styling truth.)
2. **Innerwell — weak generic output.** Their proven ads are conceptual-carrier formats (permission slip, billboard, Reddit-thread mockup), NOT generic telehealth layouts. Their dossier should mandate carrier-driven concepts.
3. **Nurx — wrong logo previously rendered** (invented serif wordmark). Capture the real logo treatment (lowercase wordmark, size, clearspace, placement).

## What to do per Figma file
Use the Figma MCP: `get_metadata` to map pages/frames, then per ad frame `get_screenshot` (visual) + `get_design_context` (exact fonts, sizes, spacing, fills). For each BRAND produce a **Style Dossier** in image-model-friendly descriptive language (no design jargon the model can't render):

```
STYLE DOSSIER — <Brand>
- Canvas & grid: (e.g. 1:1 and 4:5; 12-col feel; generous 8-10% margins)
- Layout pattern(s): (e.g. headline top-left 2 lines max; product bottom-right third; CTA pill bottom-left)
- Typography: (e.g. headlines: heavy condensed sans, tight leading, sentence case; body: light geometric sans; never all-caps body)
- Color usage: (e.g. cream field dominates ~70%, coral only for CTA + underlines, navy for all text; hexes)
- Product treatment: (e.g. straight-on packshot, soft drop shadow, product occupies ~35% height, never cropped; SKU names)
- Logo: (exact form, size relative to canvas, corner, clearspace)
- Imagery style: (photo vs flat vector vs illustration; lighting; people or not)
- Copy voice on-canvas: (e.g. short punch headline + 1 proof line + CTA; asterisked disclaimer bottom 8pt)
- Recurring devices/carriers: (e.g. torn-paper edge, hand-drawn circles, comparison table style, badge shapes)
- Never-do (from what designs consistently avoid):
```

## Where to store results
Airtable base `appvCkX59PBphJGOd`, table **Brand Brain** `tblIqcPJRvpQhS4AM`:
- Write each dossier into `brand_guidelines` (field id `fldVLVAaSepdZBEk8`) for that brand's row. Match rows by `client_name`/`brand_name`.
- Also check the color fields (`primary_color_hex` fld `fldwVrxEfnbK3H3gd`, `secondary` `fldus0YJxHK5CAM4d`, `accent` `fldhr61aUgRWXYLpW`) and `brand_fonts` (`fldx8tPAmllCFZ7nc`) against what the Figma files actually use — Figma is ground truth over the earlier website scrape; update if they disagree.
- Known row IDs: Nurx `recCYzo5ZDcgVAsit`, Grade Potential `recKsH8ZJPY1AIzDy`, tapouts `rectlB4oD2SwMjq8X`. Look up others (Natural Force `recunpMOcV3v8xc3j`, Innerwell `recMWBO5Tkcp09ywK`, Symple Lending `rechtfFlGB0afHWk0`, My Social Calendar — search by name).

## Stretch goal (if Figma export works)
Export the best approved designer statics as PNGs (`download_assets`), upload them to Supabase Storage bucket `static-ads` (service-role key is in `Static Ads v6 - Node Pack.md` Step 9; project `xakngjsybyytldyqfsmi`), and attach the public URLs to that brand's `winning_ads` (field `fldoNtWo4iX41L7JD`) — Airtable ingests attachment URLs. That unlocks `team_top5` close-reproduction mode: the generator then clones the designers' proven layouts directly.

## Report back to Carl
Per brand: the dossier written, any color/font corrections made, SKUs identified for Natural Force, and which designs were exported to winning_ads.
