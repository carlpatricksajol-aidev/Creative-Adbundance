---
name: ad-concept-generator
description: >-
  Send a brand (URL, snapshot, docs, or just a name) and this skill generates a client-ready deck of
  paid-social ad concepts (UGC-first, native to Meta/TikTok) as a validated .pptx. House format:
  brand-colored title that names or implies the creative vehicle, plain-voice description of what
  we're making (not why it's strategic), 5-6 beat shootable narrative, only-unique design components,
  reserved 9:16 mockup space. Two-agent pipeline: a Creative Director harvests human observations and
  makes one creative leap per concept into a specific vehicle; a Creative Strategist reviews and
  edits every concept against a hard scorecard (title shows execution, one persuasion job, sound-off
  differentiation, UGC feasibility, no strategist-language, compare-against-batch dedup) before
  anything is built. Use when the user asks for ad concepts, a concept deck, UGC concepts,
  loglines, a creative batch, "concepts for [brand]", or sends a brand for ads — even without
  the word "deck." Also use to revise an existing concept deck.
---

# Ad Concept Generator (v4)

Turn a brand into a distinct, executable, client-ready deck of paid-social ad concepts. Two agents work
in sequence: a **Creative Director** harvests human observations and makes creative leaps into specific
vehicles; a **Creative Strategist** reviews and edits everything before the deck is built. Nothing
prints without passing the strategist. v4 adds batch composition targets learned from the telehealth account's Batch 3
survival diff: only 3 of 16 generated concepts survived client finalization, and the replacements were
differentiator-built, stat-led, second-character, trend-templated, tonally varied, and awareness-tagged.
Individually-good concepts are not enough — the BATCH has a composition.

## The core shift (why this exists)

Real feedback across four accounts, a telehealth brand, two social-growth tools and a parenting app, converged on the same diagnosis: earlier
versions of this skill wrote **ads that communicated information**. Good creative directors write
**concepts a CD checks off and moves into refinement**. The gap is not more craft rules — it's a
different starting point:

- **Bad flow:** *insight → ad.* Take a benefit, wrap a UGC vehicle around it, describe why it works.
- **Good flow:** *human observation → creative leap → vehicle → brand slots in.* Start from a specific
  behavior/situation/thought someone would recognize. Find an unexpected but immediately understandable
  device for expressing it. The brand fits into the vehicle; the vehicle isn't decoration.

Concrete examples of the difference (all from that telehealth account's feedback):

- Refill friction → **bad:** "Woman realizes she's running out, gets appointment friction, discovers
  the brand." → **good:** *"Vacation in seven days + out of birth control"* — countdown POV with packing
  b-roll, delivery, payoff.
- Affordability → **bad:** "Compare our pricing with traditional care." → **good:** *"My Bank Account
  Is Confused"* — the bank account becomes the storyteller; receipts are the visual language.
- Personalized HRT → **bad:** "Why personalization matters." → **good:** *"HRT Dating Profile"* — the
  format IS the ad; the message rides inside.

Taxonomy validates concepts; it never creates them.

## Pipeline

### 1. Intake & brand analysis
The user may send anything from a full onboarding pack to just a URL or name. Build a working snapshot:
product + USPs, personas, voice, real proof points, compliance rules, brand accent color (hex) + font.
If only a URL/name was given, web-search + fetch to fill the snapshot; confirm accent/font or default
(Poppins, sensible brand-adjacent hex). Ask only for what genuinely blocks writing (hard compliance
rules, offer language). Don't stall.

### 2. Library check (dedup source)
If the brand has prior concepts (deck, Drive file, list), read them and list what's been done. Each new
concept must bring a different **observation** (not just a different benefit or a different format).
The compare-before-output rule (see below) enforces this later.

### 3. Performance filter
If performance data exists (CPA by hook/angle/format, client notes), build the **allowed set** first:
winning angles/formats to weight toward; losers to exclude; gaps worth a controlled test. Data weights
the mix but never becomes a template. If no data: default to Pain Point + Transformation angles,
Talking Head/Lifestyle-led formats, and say you're defaulting.

### 4. Human observation harvest (before ideation)
Before writing any concept, mine **10-20 specific human observations** for the ICP. Not benefits, not
angles — observations. See `references/libraries.md` for prompts (fridge moments, 2 AM moments,
pediatrician questions, group-chat scenarios, banking-app checks, search history, dating-app behavior,
side-quest metaphors, "toxic trait" confessions, "did you know?" openers, etc.). Rules:
- Each observation must be a **specific behavior, thought, situation, conversation, or internet habit**
  someone in the ICP would recognize instantly — not a broad theme.
- Bad: "mental load." Good: "the pediatrician asked something I couldn't remember."
- Bad: "affordability." Good: "checked my bank account after the pharmacy, then again to make sure."
- Bad: "convenience." Good: "vacation in seven days, out of birth control, and my OB has 'next
  available: October 3.'"
- Weight the harvest toward the performance-filtered angles, but sourced from behavior, not from
  strategy documents.

The observations are the raw material for the batch. If you cannot list 15+ distinct observations for
the brand's ICP, keep harvesting before starting concepts — you don't have enough material yet.

### 5. Ideation — Creative Director pass
For each concept: pick an observation, make **one creative leap**, assign **one vehicle**, then write.

- **The creative leap.** Don't turn the observation into a straightforward dramatization ("woman
  realizes she's out of BC, discovers the brand"). Find an unexpected but immediately understandable device
  — the vehicle IS the ad. "Vacation countdown," "bank account is confused," "dating profile," "toxic
  trait confession," "did you know?" reveal, "group chat blowing up," "phone side quest." See the
  expanded vehicle library in `libraries.md`.
- **One persuasion job per concept.** Pick one objection this ad will handle (price, personalization,
  convenience, symptom relief, trust, options...). Every other benefit sits down. If a concept is
  trying to persuade on 3 things at once, it persuades on none.
- **Vehicle-forward title.** The title must let a reader **picture the ad** before reading the
  description. "HRT Dating Profile" passes. "I Became My Own Doctor" is a line, not a title. Stat,
  price, question, and trend-template titles also pass ("100 Women Tried It," "Your Skincare
  Wrapped"). Rule of thumb: if you can't roughly visualize the ad from the title alone, the title
  is wrong.
- **Sound-off diversity.** Before writing the next concept, imagine both playing with audio off. Would
  they look meaningfully different? If both are talking heads with captions and product UI inserts,
  they're one concept, not two. See the 5-dimension diversity check in the strategist.
- **Compare-before-output.** Before finalizing a concept, compare against the batch so far — at the
  INSIGHT-FAMILY level, not just situation/vehicle. Two 3 A.M. concepts in different UIs are one
  concept. Four friction stories with four vehicles are one insight. Max ~2 concepts per insight
  family; if the new concept lands in a full family, **discard it and generate another.**
- **Plan the batch against the composition targets** (`craft-rules.md → Batch composition targets`):
  differentiator share (~1/3 when a business objective exists), research-numbers quota (2–3
  stat-led), second-character quota (2–3), production-lane spread (1–3 graphic/animated),
  trend-as-delivery-system quota (1–2), tonal spread, awareness-stage spread. Tag every concept
  with its production lane and awareness stage (Problem / Solution / Most Aware) — both print.

Full craft rules (description, narrative, design, specificity, ownability, compliance) are in
`references/craft-rules.md`. Write loglines first when the user wants a checkpoint; otherwise proceed.

### 6. Creative Strategist gate (mandatory — before building anything)
Adopt the reviewer role in `references/creative-strategist.md` and run EVERY concept through the
scorecard. The heavy new checks:

- **Title shows execution?** Can a reader picture the ad from the title? If not, reject the title.
- **One creative leap present?** Or is this insight-directly-into-ad? If direct, reject.
- **One persuasion job?** Or is it cramming 3+ benefits?
- **Sound-off differentiation?** In this batch, would this concept look meaningfully different from
  its siblings with audio off?
- **5-dimension diversity spread?** Angle × Human situation × Format × Visual device × Funnel job.
  Five talking heads about five benefits are five angles but one concept.
- **Strategist-language filter.** Any phrase like "positions the app as," "reframes the problem,"
  "dramatises the mental load," "acts as a single source of truth," "quietly powers that confidence,"
  "lands the [x] benefit," "proves the value," "gives Meta a distinct creative signal" gets cut. Copy
  must sound like something you'd say to a producer, not a client-services deck.
- **Manufactured cleverness filter.** Poetic copy, forced emotional lines, unnecessary props — cut.
  Cleverness comes from recognizing something true about the customer, not from writing pretty.
- **UGC feasibility.** Realistically shootable at home with a phone, the creator, the product, and
  normal objects available at home. Elaborate sets, actors, or production get flagged.
- **Consistency across sections.** If a signature device (post-its, split-screen, receipt printer)
  appears in Design Components, it must already be visible in the description and narrative — not
  parachuted in at the end.
- Plus the standing checks: believable trigger, unpaid-post test, pain depth, specificity, semantic
  dedup vs. batch AND brand library, proof behavior variety, outcome ladder spread, structure caps,
  ownability, compliance (medical claims qualified inside the concept).
- **Batch composition checks (v4, from the telehealth survival diff):** differentiator share when a
  business objective exists · insight-family cap (max ~2 per family) · research-numbers quota ·
  second-character quota · production-lane spread · trend-as-delivery-system quota · tonal spread ·
  awareness-stage spread. These run against the whole batch after per-concept checks pass; fixes
  replace the weakest offenders, not the strongest.

Verdicts: **pass / edit / reject-and-replace**. Fix everything flagged, re-run failures, produce a
short change log. Only a fully-passed batch goes to build. Include the strategist's change log briefly
when presenting to the user.

### 7. Build the deck
Write the config JSON (`references/config-example.json` for shape) and run `scripts/build_deck.js`.
Numbering continues the brand's library.

### 8. QA render & present
```
python /mnt/skills/public/pptx/scripts/office/validate.py <out.pptx>
python /mnt/skills/public/pptx/scripts/office/soffice.py --headless --convert-to pdf <out.pptx>
pdftoppm -jpeg -r 95 <out.pdf> q
```
View the longest slides for overflow. Present with `present_files`; delivery note: open in Google
Slides or File → Import slides into the client deck. Offer add-ons: 9:16 image-gen prompts
(`references/image-prompts.md`), trend-reference notes doc (never on slides).

## The slide format (house standard)

Each concept is ONE slide — left ~63%, reserved 9:16 box right:

- **Title** — `NNN_Title`, brand accent color. **Must name or strongly imply the creative vehicle.**
  "HRT Dating Profile" ✅ · "Bank Account Is Confused" ✅ · "Vacation Countdown" ✅ ·
  "I Became My Own Doctor" ❌ (it's a line, not a vehicle).
- **Description — what we're making, not why it works.** 2-3 sentences of plain, 5th-grade language.
  Say: **the creator format, the at-home situation/scene, the one core message, and how the brand
  fits in.** Do NOT explain the strategy ("positions...", "reframes...", "dramatises..."). The client
  should understand the whole idea after reading it once.
- **Narrative — short shootable beatboard.** 5-6 beats. Each beat tells the creator what happens
  next in plain action language. Vary how the product enters and how the concept ends across the
  batch — no template. End on a payoff specific to the persona (an inquiry, a booking, a walk-in,
  a delivery, an eye-roll — never generic "numbers went up").
- **Design Components — only what's unique to this concept + Duration.** Skip UGC boilerplate
  ("native captions," "quick cuts," "realistic app screens," "iPhone-native compression"). Only the
  signature device or execution detail that actually helps someone picture how *this specific ad*
  should look. Every device listed here must already appear in the description or narrative — never
  parachute in.
- **9:16 mockup space** — reserved (the generator draws it).

CTA copy and full scripts stay in the script phase.

## Revising / reformatting an existing deck
Apply feedback as a craft pass using the **keep / adjust / replace** lens in craft-rules, then run
the strategist gate on the full revised set (survivors included) before rebuilding. Change the
thinking underneath, not just the words. If revising against client feedback, cite the feedback in
the change log so it's clear what shifted.

**After the client finalizes a batch:** ask for (or fetch) the final deck and run a **survival
diff** — what survived, what was retitled, what was replaced, and what the replacements have in
common. Replacement patterns become new composition targets or craft rules. The v4 composition
targets came from exactly this exercise on the telehealth account's Batch 3 (3 of 16 survived; the replacements were
differentiator-built, stat-led, second-character, trend-templated, funnier, and awareness-tagged).

## Reference files
- `references/craft-rules.md` — the full craft: title rules, description rules, narrative rules,
  design rules, one-persuasion-job, five-dimension diversity, sound-off test, worked examples.
- `references/creative-strategist.md` — reviewer role, scorecard, verdicts, change log.
- `references/libraries.md` — living libraries: **human observation prompts (the harvest bank),
  vehicles, tensions, native formats, proof behaviors, hook modes, outcome ladder.** Extend when
  research surfaces new patterns.
- `references/image-prompts.md` — UGC image-gen prompts for the 9:16 stills.
- `references/config-example.json` — minimal valid config.
