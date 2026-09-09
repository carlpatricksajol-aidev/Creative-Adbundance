---
name: concept-alignment-review
description: Build a Creative AdBundance house-format concept alignment review deck — a .pptx CAB brings into a pre-alignment client call to flag brand/voice/claims guardrail violations, sourced action items, and a recommended keeper set. Use when the user is preparing for a client concept alignment meeting and has both (a) the client's concept deck as a Google Slides link, .pptx, or pasted concepts, and (b) brand-side source material like a brand pack, script formula, creative brief, kickoff notes, or performance data. Triggers on "concept alignment review", "batch review", "flag pass on this batch", "alignment deck for [client]", "review these concepts", "generate the review with actionables", "do it like an LED-signage client / a lending client's Batch 39 / a supplement client / [prior client]", or a message that shares Drive/Docs links plus a client name asking for the review. Do NOT confuse with ad-concept-generator, which invents new concepts — this skill REVIEWS an existing batch.
---

# Concept Alignment Review

An AdBundance house-format .pptx that a strategist or producer brings into a pre-alignment client call. Reviews an existing client concept batch against every brand-side source, flags guardrail violations with citations, and closes with a keeper set + path recommendation + dated next steps.

This is not a concept generator. Concepts already exist. The skill's job is to walk into the client call already knowing which concepts to lead with, which to flex, which to hold back, and exactly which quote or brand-pack section supports each move.

## When this skill is right

The user is preparing for an upcoming client alignment / concept-selection call and has both:

1. **A concept batch to review** — usually 6–12 concepts, in a Google Slides deck, .pptx, or pasted text. The concepts are the client's or CAB's proposed batch, not yet approved.
2. **Brand-side source material** — some combination of brand pack, script formula, creative brief, kickoff transcript / meeting notes, positioning master, performance insights, or client email guidance.

If the user only has (1) with no source material, ask for it before building — the skill's value is sourced flags, and there's nothing to source against without brand-side material.

If the user has (2) but not (1), they don't want this skill — they probably want ad-concept-generator (invent concepts) or a brand snapshot deck.

## Inputs to gather at the start

Before reading any file, confirm the essentials in a single, tight message:

- **Client name and batch label** (e.g. "a supplement client, Batch 1" or "an LED-signage client, Batch 2")
- **Alignment call date** — drives the "For [date] client alignment" footer and the Next Steps dates
- **Source materials** — the user will typically paste a stack of Drive/Docs/Slides links plus a website URL and maybe a meeting-notes link. Read every one before drafting.
- **Concept range** — if the concept deck has an archive slide or extra chrome, ask which slide range holds the concepts to review (e.g. "slides 12–20").

Pull every source before writing. The whole value proposition is sourced flags; you cannot flag against material you have not read.

## Sources to pull (order matters)

Use the Google Drive / Docs tools for Drive files, `web_fetch` for the client's live site and any public URL, and `read_conversation` if the user references a prior client's review deck for pattern reference. Read in this priority order because later sources often confirm or contradict earlier ones:

1. **Brand pack / voice guide** — the strictest guardrails live here. Voice do/don't lists, claims prohibited/preferred, banned phrases, format specs, naming rules.
2. **Script formula / creative reference** — the narrative spine. Beat order, banned framings (e.g. "nothing cellular"), product-placement timing rules.
3. **Creative brief** — target audience specifics, KPIs, deliverable count, channel constraints.
4. **Kickoff / meeting notes** — client's own words. Speaker-attributed quotes are the strongest sources for flags; extract them verbatim.
5. **Concept deck** — read the specific slide range the user named. Extract each concept's narrative and design components.
6. **Website** — product name, tagline, positioning, price, ingredients/features.
7. **Prior performance data** if available — B1 winners, CPL patterns, angle performance. Source for the "protect what worked" flags.

Pull all in parallel where the tool allows. Do not stall waiting for one before starting the next.

## Deck structure — 19 slides, in this order

Do not deviate from this shape without a specific reason. Slot count may flex (a 6-concept batch has 6 per-concept slides instead of 9), but the sequence is fixed.

1. **Cover** — navy full-bleed, cyan left rail, uppercase eyebrow, big serif headline, small "prepared by CAB for [date] alignment call" footer.
2. **Executive summary** — the 3–5 things that need alignment before the call. Numbered chips, color-coded by severity. Each finding is 1 headline + 1 short paragraph with source cite baked in.
3. **Scope & delivery mix** — a native `pres.addChart()` bar chart (delivered vs. recommended, by pillar/vehicle/angle) + a "How to read this" card on the right with 3–4 short interpretive notes.
4. **Concept-to-pillar map** — a table of every concept × pillar/vehicle × angle × talent × status. Status column color-codes green (keep) / amber (reposition or rewrite) / red (rebuild or drop).
5–N. **Per-concept action items** — one slide per concept. Fixed layout: left card is the current concept summary, right side has 3 numbered action items each with headline / SOURCE citation / concrete fix. Color-coded number chips: red (hard flag), amber (soft flag), cyan (info).
N+1 to N+3. **Cross-batch flags** — 2–4 slides for strategic gaps that no single concept owns (missing audience, missing vertical, banned language pattern across several concepts, contradicting client statements). Full-width layout with left panel showing the evidence and right panel showing the recommendation.
N+4. **Keeper set + hold back** — two-column layout. Left (tint background): the 6 concepts recommended for advance with a one-line why for each. Right (navy background): the concepts held back with a one-line reason each.
N+5. **Path A / Path B** — two side-by-side cards. Path A = ship the recommended set with fixes on the current timeline. Path B = a heavier rebuild that adds time but keeps every concept live. State the "what ships", "what's held", and "trade-offs" for each.
N+6. **Next steps** — 4 dated steps from the alignment call date forward, each with owner, action, and one-line detail. Big cyan date chips on the left.

For the exact layout code, coordinates, and helper functions, see `references/slide-templates.md` and copy the working starter code in `assets/build_template.js`.

## Design system — non-negotiable

Rigidly consistent across every deck this skill produces. Do not tint it to the client's brand — this is CAB's house voice, not the client's.

- **Layout:** `LAYOUT_WIDE` (13.3" × 7.5")
- **Palette:** navy `#0A2540` (primary), cyan `#00A3E0` (accent), amber `#F59E0B` (soft flag), red `#DC2626` (hard flag), green `#10B981` (keeper), white `#FFFFFF`, ink `#0F172A` (body), mute `#64748B` (muted body), tint `#F1F5F9` (light card fill), line `#CBD5E1` (hairline)
- **Fonts:** Cambria for headers (safe-list serif), Calibri for body — both render true-to-width in LibreOffice QA and ship with Office. Do not swap in a designer font like DM Sans or Inter here; the QA preview will lie about text fit.
- **Chrome:** thin cyan rule at the top of every non-cover slide (0.08" tall). Footer with "Client · Batch N Concept Alignment Review · For [date] alignment call" on the left and zero-padded page number on the right.

For every color hex, eyebrow spacing, chip radius, and font size, see `references/format-spec.md`.

## Sourcing rule — the whole point

Every action item and every cross-batch flag has a **SOURCE** line in small mono-style caps under the headline, before the fix. No unsourced flags. Ever. Sourcing is what separates this deck from a subjective critique.

Good sources look like:

- `Brand Pack v1.1 §06 Voice — never: "silent killer hiding in your body"`
- `Script Formula, beat 5: "Not a biology lesson. Nothing cellular."`
- `Kickoff notes 9/1: the client's founder — "We prefer to have some real characters in the ad."`
- `Company Creative Brief (Scoreboard primary target: schools)`
- `the client founder's email 1/16 (deck comment)`
- `Batch 1 Performance Insights → 'What we should test next'`

Speaker-attributed quotes are the strongest sources — they let the strategist read the flag out loud in the room and the client immediately recognizes their own words. Extract quotes verbatim from meeting notes. Preserve the speaker name and the date.

If you cannot find a source for a concern, either (a) it is not a flag — cut it, or (b) you have not read enough of the source material yet — go read it. Never write a flag from your own judgment alone.

## Severity coding

Three levels. Assign carefully — inflating everything to hard drowns the actual hard flags.

- **Hard (red)** — a rule the client or the brand pack states in negative terms is being violated ("never", "prohibited", "we do not"). Or a claim the concept implies that the client cannot substantiate. Or a factual contradiction with the brief.
- **Soft (amber)** — a preference or a caution stated as such ("we prefer", "watch out for", "generally"). Or a production risk that could threaten delivery date. Or a copy edge case that could be read either way.
- **Info (cyan)** — a protection, a "keep doing what's working", a casting note, or a mechanical detail (font choice, disclosure requirement, secondary size). Not a problem, but worth calling out so the room does not lose it.

Rule of thumb per batch: 20–30% hard, 40–50% soft, 20–30% info. If a whole deck is hard flags, either the concepts are genuinely broken and this is a "rebuild the batch" conversation, or (more likely) severity is being inflated.

## Voice — direct, sourced, actionable

The review deck's own voice matches the AdBundance house tone: direct, calm, no drama, no hedging. It does not editorialize. Every sentence either states an observation, cites a source, or proposes a fix.

Write like this:

- "Concept 3 is fully 3D-animated. Client stated preference is real characters. Rebuild as live-action for this batch."
- "a third-party venue name appears in the positioning doc with 'no owner' tagged next to it. Confirm written permission before the ad ships."
- "First toggle currently reads 'HIGH COST → LOW MONTHLY PAYMENT.' Confirm at the top of the call which pricing posture is live before scripting."

Not like this:

- "It's really important to think carefully about whether this concept aligns with the client's stated preferences…"
- "I feel that the pricing messaging might benefit from some review…"

Every fix should be specific enough that the strategist could act on it in the next 24 hours without asking follow-up questions.

## Build workflow

1. **Confirm inputs** (as above). Once. Do not ask again mid-build.
2. **Pull all sources in parallel.** Use the Drive tools for Drive files, `web_fetch` for the site and any public URL. Read the concept deck's specified slide range last so it is the freshest thing in context when you start analyzing.
3. **Draft the flag analysis in your head first** — for each concept, ask: (a) does it hit the script formula's beat count / order? (b) does its copy violate any voice do/don't line? (c) does it imply any prohibited claim? (d) does it match the brief's audience? (e) does its production match the client's real-vs-AI preference? (f) does it protect what has historically worked? Then group cross-batch flags: missing audience, missing angle, banned-language pattern, contradicting client statements, production overload.
4. **Recommend the keeper set** — how many to keep is set by the batch scope (usually 6). Anything held back needs a specific reason, not a vibe.
5. **Read the pptx skill's SKILL.md** for current pptxgenjs gotchas before writing code (see `/mnt/skills/public/pptx/SKILL.md`).
6. **Copy `assets/build_template.js`** into your working directory, rename to `build.js`, and fill in every `TODO:` marker. The template already has the full slide skeleton, palette, helpers, per-concept factory, and QA-safe font declarations.
7. **Build and validate:**
   ```bash
   node build.js
   python /mnt/skills/public/pptx/scripts/office/validate.py <output>.pptx
   python /mnt/skills/public/pptx/scripts/office/soffice.py --headless --convert-to pdf <output>.pptx
   rm -f slide-*.jpg
   pdftoppm -jpeg -r 100 <output>.pdf slide
   ```
8. **Visual QA every slide** — check title-line wrap on slides 2/3 and any cross-batch flag headers (they are the most common overflow point), check that action-item source citations do not overlap the fix text below, check that the concept-map status column is wide enough for "Rebuild or hold" without wrapping. Common fixes are in `references/format-spec.md` under "Known QA fixes".
9. **Present the file** with `present_files` and give the strategist a tight summary: the 3–4 things to raise at the top of the call, in order. Do not restate the entire deck in prose — the strategist will read it.

## Anti-patterns to avoid

- **Do not restyle the deck in the client's brand palette.** This is a CAB house-format review, not a client-facing brand-cohesive artifact. Navy + cyan stays.
- **Do not include praise slides or "what's great about this batch" summaries.** The deck's job is flags and actions, not morale. Keep positive observations to `[info]` action items on the relevant concept.
- **Do not invent quotes or paraphrase them as verbatim.** If a meeting note says "the team discussed the pricing shift," do not attribute a quote to the client's CEO that they did not literally speak. Paraphrase as paraphrase.
- **Do not use ambiguous statuses in the concept map.** "Review" or "TBD" is not a status. Every row is Keep / Reposition / Rewrite / Rebuild / Drop.
- **Do not stack multiple concepts into one per-concept slide** to save room. If there are 9 concepts, there are 9 per-concept slides.
- **Do not skip the source citation on any action item.** If there is no source, there is no flag.

## References

Read these when you need them, not upfront:

- `references/format-spec.md` — every color hex, chip radius, font size, spacing rule, and known QA fix from prior decks
- `references/slide-templates.md` — pptxgenjs code snippets for every slide type in the deck
- `references/sourcing-cheatsheet.md` — how to phrase sources for each material type (brand pack section, meeting quote, brief line, email)
- `assets/build_template.js` — full working pptxgenjs starter, copy this and fill in
