# Static Ads — The Concept-First Approach

The rebuild of how the Static Ads Generator produces creative. Written so Eric has
visibility into the change, and so the method is repeatable (and sellable) rather than
a one-off.

## Why we are changing the approach

The current generator does one thing: pick a template from the library, map a brand into
it, and ask an image model (nano-banana / gpt-image-2) to render the whole ad — layout,
imagery, AND text — in a single shot.

That single shot is where the "AI slop" comes from. In the Trade With The Pros renders:

- The billboard said "ASA1" — brand text the model invented and garbled.
- Faces were uncanny; the same "trader" looked different in every frame.
- The headline was baked into the image, so it was soft, sometimes crooked, never crisp.
- The "concept" was only ever whichever template got picked — no idea built for this client.

The one current render that looked good (the dark comparison table) worked precisely
because it was structured and typographic — the model had to draw less.

## The shift

Split the three jobs the image model was doing badly, and give each to the tool that does
it well:

1. **CONCEPT** — decided by a creative-strategist pass (Claude), per client. Draws on the
   client's own winners and a format catalog, but is NOT limited to the template library.
2. **TEXT + LOGOS** — rendered deterministically in HTML/CSS. Always crisp. Never touched
   by an image model.
3. **IMAGERY** — the image model only ever renders a background / scene (no text, no
   logos), composited underneath the HTML.

## The pipeline

0. **Inputs** — Brand Brain (voice, colors, fonts, products, winners) + brief (objective,
   audience, offer) + any reference / winning ads (the Analyze Blueprint node extracts the
   spec). When there is no Brand Brain row, the brief can be lifted from the client's own
   reference ads — that is exactly how this proof set was built.
1. **Creative Strategist (Claude)** — outputs N concepts, each `{angle, format, headline,
   visual direction, why it fits}`. Templates are inspiration, not the ceiling; concepts
   that are not in the library are allowed and expected.
2. **Render Router** — route each concept by type:
   - Typographic / UI / data (comparison, stat cards, before/after, steps, hook) →
     **HTML/CSS composite**. ~80% of direct-response ads live here. This whole proof set
     is this lane.
   - Scene / photo (lifestyle, hero, environment) → **image model renders the scene only**,
     then headline / logo / CTA / product are composited on top in HTML.
   - Product hero → the **real product image** composited into a background.
3. **QA gate** — every ad must pass the checklist below before it ships.
4. **Delivery** — grouped into ad sets, dated folders, per the naming convention.

## QA checklist (fail → regenerate or drop)

This is the SongReels-style rigor, codified. Nothing goes out until every box is true.

- [ ] One concept, one hook, one visual, one CTA — reads in under two seconds
- [ ] Headline speaks to THIS audience's urgency ("this is for you"), not generic
- [ ] All text is HTML-rendered and crisp — nothing baked into an AI image
- [ ] Logo is the real logo, composited, undistorted — no garbled brand text
- [ ] Brand fonts and colors are correct (from Brand Brain)
- [ ] Every claim / number is real (from the brief / Brand Brain) — nothing invented
- [ ] No AI artifacts (uncanny faces, extra fingers, garbled UI)
- [ ] Matches the chosen concept's format
- [ ] Not a near-duplicate of another ad in the set — a distinct concept, not a recolor

## Why this is sellable without MaxFusion

Everything runs in-house: Claude for strategy, copy, and QA; an HTML render engine
(headless Chrome) for the crisp layer; and an image model for scenes only (KIE, Higgsfield,
or Bloom). There is no external MaxFusion dependency to sever before this can be sold to
clients.

## This proof

`twtp/` holds five concept-first ads for Trade With The Pros — the same brand and brief that
produced the current 6–7/10 template renders — built entirely in the HTML lane:

| File | Concept | Format |
|------|---------|--------|
| `twtp_01_comparison.png` | "Watch another video, or trade in the room with pros" | Comparison, dark |
| `twtp_02_problem-solution.png` | "The problem was never the strategy. It was trading alone." | Problem → solution, light |
| `twtp_03_before-after.png` | "Guessing at 2 a.m." vs "A mentor two seats down." | Before / after split |
| `twtp_04_the-path.png` | "From guessing to a real edge, in person." | 3-step path |
| `twtp_05_hook.png` | "Stop trading alone." | Typographic scroll-stopper |

`build_twtp.js` is the reference render engine (brand tokens → inline SVG icons → HTML →
headless Chrome @2x → 2160² PNG). `twtp_assets.json` holds the embedded open fonts
(Playfair Display + Manrope) so the build runs offline.
