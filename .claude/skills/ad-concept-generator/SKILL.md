---
name: ad-concept-generator
description: >-
  Send a brand (URL, snapshot, docs, or a name) and this skill generates client-ready
  paid-social ad concepts (UGC-first, native to Meta/TikTok). v7.5 refines Format Mix into
  3 lanes: 40% story-testimonial UGC (person on camera telling an anecdote where the
  product mattered) / 30% wild-organic-viral / 30% traditional DR — kills the
  safe-UGC-default and the all-captured-formats overcorrection. Inherits Message
  Visualization (5+ ways to visualize before locking a vehicle), Narrative Chronology,
  Vehicle Candidate Search across 3 pools. Runs silent (loading line + concepts), delivers
  text by default (.pptx only on request), pulls marketing_report + brand_brain from Supabase
  in Step 0 (hard-stop if missing), outputs 5-beat Narrative + 5-detail Design Components
  with no overlay copy or disclaimer text, descriptions as natural storytelling. Five agents:
  Strategic Analyst → Creative Director → Creative Strategist → Feedback Review (22 checks)
  → Final Creative Strategy Review. Use for ad concepts, UGC, or loglines.
---

# Ad Concept Generator (v7.5)

Turn a brand into a distinct, executable, client-ready deck of paid-social ad concepts.

## Core principles

- **Strategy first, vehicle second.** Every concept starts from a business objective × persona ×
  selling argument. The vehicle is the HOOK into a DR structure — never the whole ad.
- **Relatable frame.** The scenario is real content from the persona's actual daily life. Deletable-
  brand test: if you remove the brand mention, would this still be a video someone would watch?
  If no, rewrite the frame.
- **25%-intensity rule.** Content must be ~25% more intense than real life. A compliment isn't a
  story; an accusation is. Every concept must answer: **what about this grabs your interest?**
- **DR spine underneath.** Hook → problem → product FAST → mechanism → proof → price/value → CTA.
  Don't end when the selling should start.
- **Positive-benefit-first.** Lead with what the viewer GAINS, never the absence of a negative.
- **Never counterintuitive brand messaging.** "I tried this so you don't have to" fails — no
  brand tells people not to try it.

## Live knowledge base

Four Postgres tables back this skill. Primary transport is the Supabase MCP: call
`Supabase:execute_sql` with `project_id="xakngjsybyytldyqfsmi"` and the SQL inlined at each step.
Legacy secondary transport is `scripts/fetch-*.js` for local runs with `KNOWLEDGE_DATABASE_URL`.

| Step | Table |
|---|---|
| 0 | `marketing_report`, `brand_brain` |
| 1, 2 | `knowledge_v_concept_approved` (view) |
| 4 | `knowledge_scraped_ad` |
| 6 | `knowledge_vehicle_bank`, `knowledge_researched_vehicles` |

**Confidence vocab must not be conflated.** Researched-vehicles uses two scales:
brand-observed (`thin`/`reported`/`strong`, has advertiser count) vs trend-sourced
(`trend-thin`/`trend-reported`/`trend-verified`, no count). Every row carries `evidence_basis`.
Never claim performance from either.

**Scraped-ad buckets are category-wide.** `query` groups rows into buckets (`skincare`,
`collagen`, `credit card`, `client-ad-history`). Not for the brand's own ads — for what real
ads in the adjacent category are saying. To see buckets:
`SELECT query, COUNT(*) FROM public.knowledge_scraped_ad WHERE excluded_reason IS NULL GROUP BY query ORDER BY 2 DESC LIMIT 20;`

## Pipeline

**Execution mode — silent by default.** The pipeline runs internally without narrating each
step. During execution, output ONLY a single status line:

> Building your concepts... This might take a few minutes.

Do NOT print during the run: the Batch Strategy Map, Vehicle Candidate Tables, Vehicle Ledger,
Fit-Check gate results, compliance sweep notes, Feedback Review verdicts, scorecards, tag
metadata, or any pipeline commentary. All live in **internal working notes only**.

The ONLY user-facing output is the finished concepts, formatted per the slide format section
below. Print working notes only when the user explicitly asks.

### 0. Strategic Analysis — Batch Strategy Map

**Mandatory Supabase pull FIRST.** Nothing runs until both queries return.

Query 1 — `marketing_report`:
```sql
SELECT brand, brand_brain_id, overview, what_is_working, audience,
       objectives_and_messaging, channel_strategy, content_strategy,
       competitive_landscape, compliance_guardrails, sources_and_open_items
FROM public.marketing_report
WHERE brand ILIKE '%<brand>%';
```

Query 2 — `brand_brain`:
```sql
SELECT id, client_name, brand_name, aliases, website, industry, status,
       brand_tone, brand_personality, target_personas, core_pain_points,
       key_offer, products, product_benefits, brand_guidelines,
       creative_boundaries, dos_and_donts, competitors,
       winning_concepts, losing_patterns, winning_hooks, winning_ads,
       compliance_notes, compliance_disclaimer, disclaimer_text,
       creative_brief, primary_color_hex, secondary_color_hex,
       accent_color_hex, brand_fonts, notes, confidence, updated_at
FROM public.brand_brain
WHERE brand_name ILIKE '%<brand>%' OR client_name ILIKE '%<brand>%'
   OR aliases ILIKE '%<brand>%';
```

If Query 1 returned `brand_brain_id`, prefer `SELECT ... FROM brand_brain WHERE id = <id>`.

**Not-found hard stop.** If EITHER query returns zero rows, output this and wait:

> **Brand not found in the Knowledge Layer.**
> `marketing_report`: `<found | NOT FOUND>` for `%<brand>%`.
> `brand_brain`: `<found | NOT FOUND>` for `%<brand>%`.
>
> Options:
> 1. Confirm the canonical brand name (run `SELECT DISTINCT ...`) and re-run.
> 2. Provide the brand brief inline (concepts still ship but lose the audit trail).
> 3. Create the records first, then re-run.

**Batch Strategy Map** (once both queries return, produce these five outputs):

1. **Business objectives.** What's the brand trying to accomplish RIGHT NOW? Pull from the
   marketing report + client notes. If unclear, ask the user — this is the one thing worth
   stalling for.
2. **Target personas.** 2–4 specific personas (e.g., "bodybuilding men 25–40", "menopausal women
   50+"). Each concept assigned to ONE persona. The persona generates the scenarios.
3. **Selling arguments to test.** Price, time savings, mechanism, specific benefit, social proof,
   category comparison, convenience. Concepts test DIFFERENT arguments — same argument in three
   different vehicles is one test, not three.
4. **Concept allocation.** Distribute across objective × persona × selling argument.
5. **Duration mix.** Assigned by story needs, not house default:
   - **15s ≤ 25%** of batch — single-beat pattern interrupts only. Setup → payoff needs more.
   - **30s ≥ 50%** — default for scenario UGC with DR spine intact.
   - **45s ≈ 20%** — scenario-driven narratives that need to breathe.
   - **60s** sparingly for day-in-life or multi-beat testimonials.

6. **Format mix (v7.5 — the agency principal rule, refined into three lanes).** Every batch specifies a
   mix across three concept families, dependent on the client's creative appetite:
   - **Story-testimonial UGC (v7.5 — the missing lane)** — a real person on camera
     recounting a specific personal anecdote where the product changed something in their
     life. Character-first, situation-first. Anchored on real social friction, emotional
     beats, or unexpected outcomes ("my girlfriend thought I was cheating because of this
     watch — I got it on PackDraw," "my friend keeps trying to trade me for these sneakers
     and doesn't believe I paid $30"). The phone is optional and often absent from frame.
     Human voice carrying a lived moment. This is the "wow, this happened to me too" lane
     that carries paid-social relatability harder than any other format.
   - **Traditional DR vehicles** — established UGC templates for demo-heavy concepts
     (screen-record walkthroughs, product close-ups + VO, before/afters, unboxing).
     Phone-anchored, DR-optimized. Safe, reliable, converts well but rarely surprises.
   - **Wild/organic/viral formats** — captured moments (ring cam, security cam, baby
     monitor, dash cam, doorbell, drone, gym cam), character-driven parody (sports
     commentary of daily life, news-anchor mockumentary, postgame conference of a mundane
     moment), meme formats currently working in this persona's feed, environmental
     storytelling, absurdist product involvement, screen-capture-as-story.

   **Default: 40% story-testimonial / 30% wild / 30% traditional DR.** Adjust per client —
   the story-testimonial lane is the anchor of the batch and should never drop below 30%.
   The traditional DR lane should never exceed 40%. Never 100% traditional (the principal's flag).
   Never 100% captured/environmental with no human voice (the correction to v7.4's
   overcorrection).

   **Anti-default note for the CD:** "person on camera showing his phone" is NOT story-
   testimonial — it's traditional DR wearing a story mask. Real story-testimonial has the
   product OFF-SCREEN for most of the spot and the character's voice/face doing the
   selling. If the phone is in frame more than 20% of the runtime, it's a traditional DR
   concept, not a story-testimonial one.

The Batch Strategy Map prints as the deck's North Star intro slide.

### 1. Intake & brand analysis

Build a working snapshot from Step 0's pulled data + any provided docs: product + USPs,
personas, voice, real proof points, compliance rules, font preference. If only a URL was given,
web-search + fetch to fill gaps. Confirm font or default to Poppins. Ask only what genuinely
blocks writing (hard compliance rules, offer language).

**Deck accent color is ALWAYS `7A3FF2` (agency purple).** House standard — does NOT change per
brand, regardless of the brand's own palette.

**Brand creative appetite.** Study the brand's approved concepts — not just their topics but
their actual tone range. Some brands want edge in subject matter (the colostrum brand: white powder jokes),
some in format (a mobile-games app: Pixar-style animation), some warmth (the parenting app: mom confessionals).
The approved deck IS the creative brief for tone.

**Sample brand tone via SQL:**
```sql
SELECT client, product, batch, concept_no, title, funnel_stage,
       motivators, messaging_angle, hook_tactic, message,
       narrative_beats, script_hooks
FROM public.knowledge_v_concept_approved
WHERE client ILIKE '%<brand>%'
ORDER BY batch_seq NULLS LAST, concept_no NULLS LAST
LIMIT 200;
```

If nothing returns, brand name doesn't match. Run
`SELECT DISTINCT client FROM public.knowledge_v_concept_approved ORDER BY client`.

### 2. Library dedup — FULL audit

Read the ENTIRE existing library — every batch, every section. Not optional. the colostrum brand's Batch 5
required dedup against 117 existing concepts.

```sql
SELECT concept_id, client, product, section, batch, batch_seq, concept_no,
       title, funnel_stage, motivators, messaging_angle, hook_tactic,
       message, narrative_beats, deck_url, script_url,
       script_title, script_hooks, script_body
FROM public.knowledge_v_concept_approved
WHERE client ILIKE '%<brand>%'
ORDER BY batch_seq NULLS LAST, concept_no NULLS LAST
LIMIT 500;
```

For each existing concept, catalog: **insight family** (the underlying observation, not just the
topic), **vehicle/format**, and **visual identity with audio off**. New concepts must bring
different observation AND different visual identity. Changing hooks on the same vehicle isn't
new.

### 3. Performance filter

If performance data exists (CPA by hook/angle/format), build the **allowed set**: winners to
weight toward, losers to exclude, gaps worth a controlled test. Data weights the mix but never
becomes a template. If no data: default to Pain Point + Transformation angles, Talking Head /
Lifestyle formats, and say you're defaulting.

### 4. Observation + Viral Format harvest

Mine BOTH before writing:

**A. 10–15 specific human observations** for the ICP. Not benefits, not angles — observations.
Each must be a **specific behavior, thought, situation, conversation, or internet habit**
someone in the ICP would recognize instantly. Weight toward the performance-filtered angles.

If an observation is already expressed in the existing deck, it's spent — find fresh territory.

**B. 5–10 viral format examples** for the persona (v7.4 — the agency principal rule). Not talking-head
templates — actual ways of CAPTURING scenes that already work on the platform for this
audience:

- **Captured moments** — ring cam, security cam, baby monitor, dash cam, doorbell, drone,
  gym cam, kitchen cam, retail cam
- **Character-driven parody** — sports commentary of daily life, news-anchor mockumentary,
  postgame conference of a mundane moment, weather report of an emotional state, ESPN
  breakdown of a small win
- **Environmental storytelling** — a specific scene tells the whole story with no
  presenter (a kitchen at 3am, an empty crib, a bathroom mirror with a note on it, a
  wrist glancing at a watch during a boring meeting, an untouched drink on a nightstand)
- **Meme formats currently working** in this persona's feed (rapid-cut trends, POV format,
  green-screen stitches, split-screen reactions, "how it started / how it's going")
- **Absurdist product involvement** — talking to the product, product as character,
  product commercial invading a scene, product answering a question
- **Screen-capture-as-story** — a text thread, a browser history, a camera roll swipe, a
  Notes app entry, a group chat with no faces at all

Source the wild formats by:
```sql
SELECT vehicle_id, name, description, mechanic_summary, hook_strategy,
       evidence_basis, advertiser_count
FROM public.knowledge_researched_vehicles
WHERE evidence_basis IN ('strong', 'reported', 'trend-verified', 'trend-reported')
ORDER BY
  CASE evidence_basis
    WHEN 'strong' THEN 1 WHEN 'trend-verified' THEN 2
    WHEN 'reported' THEN 3 ELSE 4
  END,
  COALESCE(advertiser_count, 0) DESC;
```

Plus context-scan the persona's actual TikTok/Reels world for what's landing right now if
current cultural formats aren't yet in the researched-vehicles table.

**Optional category-context pull:**
```sql
SELECT advertiser, platform, run_days, headline, description, cta,
       transcript, drivers, persona, foreplay_url
FROM public.knowledge_scraped_ad
WHERE excluded_reason IS NULL
  AND query ILIKE '%<bucket>%'
  AND COALESCE(run_days, 0) >= 30
ORDER BY run_days DESC NULLS LAST, fetched_at DESC
LIMIT 20;
```

Rows sort by `run_days DESC` — longevity is a weak positive. Not dedup, not performance data —
inspiration + tension surface.

### 5. Loglines-first checkpoint

Before writing full concepts, present **short loglines** (1–3 sentences each) with: title,
one-line description, vehicle, tone, product line, awareness stage, production lane. User
selects which to build. Prevents wasted writing on ideas that'll get killed.

For large batches (20+), present ALL loglines grouped by product line or theme. User may select
all, kill specific ones and ask for replacements, or reshape the batch direction.

### 6. Ideation — Creative Director pass

**The relatable frame (core principle).** Every concept is a real relatable UGC scenario
from the target persona's actual daily life, wrapped around the product. The frame is not
invented for the ad — it's borrowed from what that persona already does, watches, argues
about, sends in group chats, or films for fun.

- The **vehicle/format** is the SHAPE of the video (same-person skit, screen record, POV,
  drawer reveal, ring cam, sports commentary, environmental scene).
- The **frame** is the SCENARIO (the real-life situation being depicted).
- The **product** sits inside the frame naturally, wearing the frame like clothes.

The test: **if you deleted the brand mention, would this scenario still be a video someone
would watch in their feed?** If yes, the frame is real. If no, rewrite.

**Anti-default warning (v7.4 — the agency principal critique).** The pattern this pipeline keeps
falling into is stamping the same 3–4 "safe traditional UGC" vehicles onto every concept:
- Guy on couch talking to camera
- Sitting-in-car UGC
- At-my-desk-with-phone
- Talking-head bookends around a screen record

If the batch is ≥50% these formats, it has collapsed into the failure mode Eric flagged:
hits pain points via templated UGC, misses "wow, these ideas are really changing everything."
Force the wild-format allocation from the Batch Strategy Map — half the batch must draw from
captured moments, character parody, environmental storytelling, meme formats, or absurdist
product involvement. Not optional.

**Load both vehicle libraries first:**
```sql
SELECT vehicle_id, name, description, mechanic_summary, hook_strategy
FROM public.knowledge_vehicle_bank
ORDER BY name;

SELECT vehicle_id, name, description, mechanic_summary, hook_strategy,
       evidence_basis, advertiser_count
FROM public.knowledge_researched_vehicles
ORDER BY
  CASE evidence_basis
    WHEN 'strong' THEN 1
    WHEN 'reported' THEN 2
    ELSE 3
  END,
  COALESCE(advertiser_count, 0) DESC,
  name ASC;
```

For each concept: take its assigned **objective × persona × selling argument × duration ×
format-family (traditional or wild)** from the Batch Strategy Map, pick an observation FROM
THAT PERSONA'S WORLD, then run the three sub-procedures below IN ORDER before locking anything.

**Sub-procedure 1: Message Visualization (v7.4 — the agency principal rule).** Before touching a vehicle,
brainstorm **at least 5 different ways to visualize the selling argument.** Not vehicle picks
— visualizations. Different scenes, different capture styles, different angles into the same
message. Then choose the strongest visualization, THEN pick the vehicle/format that carries it.

the principal's framing: *"There's a million different ways to visualize what the regressions look
like. Sweet spot helps stop sleep regressions. What are different ways to get across that
messaging?"*

Example — PackDraw's "cash out instantly" selling argument:
1. Guy pulls a card he doesn't want, screen record of cash-out (safe UGC)
2. Ring cam captures him receiving a package he decided to ship instead
3. Sports commentary voiceover of him "making the trade" mid-open
4. Split-screen: him vs a friend stuck with a card he doesn't want on another app
5. Voice-note style: him sending a friend a message explaining why cash-out changed things
6. Environmental — his phone on a nightstand at 2am, screen glowing with the balance update

Pick the strongest for THIS persona's world. The visualization list stays in working notes;
the winner ships. This is what breaks the default-vehicle reflex.

**Sub-procedure 2: Narrative Chronology check (v7.4 — the agency principal critique).** Every concept
must explicitly answer: **WHEN is this happening on the pain-point timeline?**
- **Before** the pain point (setup, foreshadowing, we-had-no-idea)
- **During** the pain point (real-time capture, live confessional, in-the-thick-of-it)
- **After** the pain point (retrospective, "that used to be me," resolution)
- **Split** — a stitch or before/after showing the transition explicitly

Ambiguous chronology = KILL and rebuild. the principal's critique: *"Is it after they had the pain
point? Is it during the pain point? There's a lot of confusion because it's like a couple
different things are kind of all in here."* The concept's timeline must be unambiguous in
the description AND the narrative beats. State the chronology tag in working notes.

**Chronology tag is INTERNAL — do NOT print it on the concept slide.** The tag lives in
working notes for the audit trail. The concept's client-facing output stays strictly to
the slide-format spec: Title · Description · Narrative (5 beats) · Design Components (5
details). No "Chronology:" section on the slide, no "The whole spot lives inside..." or
"Product enters through..." extra prose after the description. If the chronology and
product involvement aren't obvious from the description + beats as written, the concept
isn't clear enough — rewrite the description and beats, don't paper over it with
explanatory prose.

**Sub-procedure 3: Vehicle Candidate Search + Fit-Check Gate.**
The failure this replaces: the CD reaches for what it already knows (group-chat screen record,
POV, talking head) and stamps it on. The result is a batch that keeps returning to 3–4 formats.

Before locking any vehicle, produce a **Vehicle Candidate Table** for that concept. Candidates
draw from THREE pools (v7.4):
- `knowledge_vehicle_bank` (traditional DR vehicles)
- `knowledge_researched_vehicles` (trend/wild vehicles)
- The viral formats mined in Step 4 for this specific persona

1. Extract 3–5 keywords from the concept's selected visualization (from Sub-procedure 1) that
   describe the SHAPE of the video (e.g., "captured moment," "before/after transition,"
   "third-party voiceover parody," "environmental scene at unusual hour").
2. Search all three pools for vehicles matching those keywords. Return top 5 across all pools.
   The table MUST include at least one wild/captured/parody candidate — not exclusively bank
   picks.
3. Score each 1–5 on four axes (max 20):
   - **Message fit** — does this format serve THIS specific visualization?
   - **Persona fit** — does this format sit natively in this persona's feed?
   - **Freshness** — used ≥2 times in current batch OR in last 2 approved batches for this
     client? –2 penalty.
   - **Producibility** — solo creator, phone, everyday props? –2 penalty otherwise.
4. Highest scorer wins. Ties break to the wild-format candidate over the traditional one when
   the batch's wild-format allocation is under-filled.
5. If the pattern-default (talking head, sitting-in-car, at-my-desk-with-phone) wins for more
   than half the batch, the search has failed — restart with narrower keywords and force at
   least three wild-pool candidates into the table.

Example (working notes only):

```
Concept 003 · P4 Deal-Hunter · SA2 Exit mechanic · 30s
Keywords: [silent reveal, screen-record proof, confession, before/after, disbelief]

Candidate                       Msg  Per  Fresh  Prod  Total
─────────────────────────────  ────  ────  ────  ────  ─────
Group chat screen record          3    3     1    5     12
Confession-to-camera              4    5     5    5     19
Screen record + narration         5    4     5    5     19
Same-person skit                  2    3     5    5     15
Wall countdown                    1    3     5    5     14

Winner: Screen record + narration (tiebreak on message fit)
```

**Fit-Check Gate (on the winner):**
- **Q1 — Fit:** Does this vehicle serve THIS message and persona's world?
- **Q2 — Variety:** Already used ≥2 times in this batch? Cap at 2 uses.

If either fails, return to the table for the next-best. Maintain a **vehicle_ledger** across
the batch.

Once locked, build the DR spine underneath. Prefer proven vehicles (`knowledge_vehicle_bank`);
borrow trend vehicles when the batch needs freshness, mark them internally.

**All v6 rules apply, plus:**

- **DR spine (mandatory).** Hook → problem → product FAST → mechanism → proof → price → CTA.
  Viewer understands the problem and why the brand is relevant in first few seconds. If setup
  takes 70–90% and product gets one line at end, the concept fails.
- **Conversion density.** How much useful selling information does the viewer get in 20–30
  seconds? Novelty never comes at the expense of explaining the offer.
- **25%-intensity rule.** Turn observations up via confrontation, accusation, being caught,
  stakes, secret exposed, competition, background action.
- **Positive-benefit-first messaging.** "No chalky aftertaste" isn't a selling point. "I just
  added 400 bioactives to my water and I taste literally nothing" is.
- **Never counterintuitive brand messaging.** Read every hook literally from the brand's
  perspective before approving.
- **Mechanic-to-product match.** "Choose Your Fighter" implies multiple options — fits a
  4-flavor soda line, not a single-SKU powder. Ask: does this mechanic naturally showcase THIS
  product's actual structure?
- **Product-specificity.** Ask: could a competitor run this concept unchanged? If yes, anchor
  in the brand's unique story.
- **Creator count — soft default.** Default: one solo creator filming at home. Allow up to two
  when the concept is meaningfully stronger for it (two-person podcast, partner confrontation,
  etc.) AND the client's setup supports it. Tag talent count for production planning.
- **Prop simplicity (hard rule).** BANNED as concept anchors:
  - Branded merch from a third-party IP the brand hasn't confirmed shipping
  - A prop stack of 2+ specific-category items the creator wouldn't have at home (a sneaker
    box AND a specific watch AND a graded card slab = three shipments per creator per concept —
    fail)
  - A single specific-category prop requiring sourcing (graded card, designer bag, specific
    watch, car) unless brand-supplied and tagged `requires brand-supplied product`
  - Specialty rentals, wardrobe changes across take, multi-take setups, anything requiring the
    creator to purchase
  
  ALLOWED: phone/laptop/tablet, own home, own car, everyday clothes, ONE product sample
  (brand-supplied), basic household items.
  
  Concepts genuinely needing branded merch or specific product get tagged and confirmed with
  ops before shipping. Never assume creators have graded cards, luxury items, or specific
  product samples.
- **Third-party IP naming ban (hard rule).** Even if the brand's catalog includes licensed
  IPs, DO NOT name them in concept text. Banned: Pokemon, MTG, specific sports leagues, movie/
  TV franchises, luxury brand names (Rolex, LV, Ferrari), team names, artist names. Use
  category descriptors:
  - "a graded card" NOT "a Charizard" or "a Pokemon card"
  - "a designer watch" NOT "a Rolex"
  - "a luxury handbag" NOT "a Louis Vuitton"
  - "a supercar" NOT "a Ferrari"
  - "the collab pack" NOT "the [named IP] pack"
  
  Production can source at shoot time if client confirms IP rights; the concept text must not
  commit.
- **Anti-format-gimmick.** Format should be standard UGC. Elaborate format parodies pass ONLY
  when the product's own story creates the comedy inside the parody.
- **Anti-supplement-bashing.** Max 2 concepts built on "other products failed." Bulk is built
  on what makes THIS product's story unique.
- **Vehicle diversity from libraries.** Pull from libraries + provided viral catalog. Kill
  vehicle saturation (5+ same vehicle).
- **Seasonality check.** No holidays/events far from current date.

### 7. Five-audit gate

Run these five audits in order. Kill and replace failures — do not patch.

1. **Full dedup vs. existing library** at insight-family level (not just title). "Supplement
   Cabinet Graveyard" dupes "Everything I tried to de-bloat and failed" — same insight family.
2. **Solo-creator + UGC feasibility.** Flag concepts needing a second person.
3. **Product-specificity.** "The subscription I don't cancel" is generic; kill and replace with
   product-ownable concepts.
4. **Brand-alignment.** Compliance, tone, distribution channel, competitive framing, production
   notes.
5. **Vehicle saturation + sound-off test.** With audio off, can you sort concepts into distinct
   visual piles? If 5+ concepts look the same (creator at kitchen counter explaining), kill the
   weakest.

Then run the Creative Strategist scorecard (`references/creative-strategist.md`).

### 7.5. Feedback Review Agent

Runs AFTER the strategist gate. Replays revision patterns from real producer feedback across
the parenting app, a social-growth tool, a social-growth tool, the telehealth account, the colostrum brand, the meal-service account, the agency principal, and the PackDraw
Batch 1 review. Each check produces PASS / FAIL + kill list. Sequential — a concept surviving
Check 1 can still die at Check 4.

1. **Batch sameness scan.** 5+ concepts same visual identity → kill weakest until each appears
   ≤2×. Pull replacements from underused vehicles.
1b. **Copy repetition scan.** Any product claim/descriptor/proof phrase in more than 3 concepts
   → distribute across the batch:
   - 3–4 lead with the stat
   - 2–3 lead with founder/credential
   - 2–3 lead with personal experience
   - 1–2 lead with product experience
   - 1–2 never explain (concept's comedy/emotion does the selling)
2. **Vehicle library + viral catalog cross-check.** ≥30% must actively use library/catalog
   vehicles. If dominated by talking heads, force 5–8 replacements from unused vehicles.
3. **"Could any brand run this?" ownability test.** Remove brand name — does concept still
   work with a competitor? If yes, generic — kill.
4. **Brand-tone calibration.** Compare tone range against the client's approved deck. Edgy
   subject in standard formats ≠ standard subject in elaborate parodies. Match the emotional
   register of what the client actually selected.
5. **Multi-talent + prop simplicity audit.**
   - Talent: partner reacting = FAIL. Friend on FaceTime = FAIL. Same-person 2 roles = PASS.
     Creator's pet = PASS.
   - Location: shootable at home with phone. External location = FLAG or FAIL. Movie theater /
     TSA / commercial location requiring permission = FAIL.
   - Prop audit: branded third-party IP not confirmed = FAIL. Stack of 2+ specific-category
     props = FAIL. Named third-party IP (Pokemon, Rolex, LV, Ferrari, etc.) in concept text =
     FAIL. Specialty prop / wardrobe changes / purchase required = FAIL. Phone + everyday +
     one brand-supplied item = PASS.
6. **Seasonal + contextual audit.** No holidays >6 weeks from current date. No expired trends.
7. **Believable trigger.** Every concept must answer: "Why is this person showing me this right
   now?" No trigger → dressed-up testimonial → reject and rebuild with accusation, discovery,
   comparison, challenge, confession, reaction, or social moment.
8. **Product introduction variety.** 3+ concepts using same intro mechanic ("That's where [X]
   came in") → batch is templated. Vary: friend rec, comment response, research, accidental
   find, partner mention, label reading, gift, social scroll.
9. **Proof closes the argument.** Gut concept → gut-specific proof. Hair concept → hair-
   specific proof. Not generic "I feel great."
10. **Outcome ladder spread.** Don't end every concept with the same result.
11. **Specificity rule.** One number, timeframe, or tangible detail per concept minimum. FAIL:
    "it works," "changed everything." PASS: "5 months," "400+ bioactives," "$2/day."
12. **Unpaid-post filter.** Would a real person post this without being paid? If no, rewrite.
13. **Pain depth.** Push one level deeper. "I wanted better gut health" → "I was unbuttoning
    my jeans under the table at every dinner."
14. **"Select, don't rescue" gate.** Would a CD check this off immediately, or think "there's
    something here I could rewrite"? If needs rewriting to be good, kill.
15. **DR spine completeness.** Setup 70–90% and product one line at end = FAIL. Mechanism
    never explicit = FAIL. Ends on clever brand line instead of payoff/CTA = REWORK.
16. **Dual scoring.** Thumb-stop (1–5) and Performance-ready (1–5) scored separately. ≤2 on
    either → kill or rework. Batch average ≥4 on both.
17. **Intensity check.** "What about this grabs your interest?" If weak, turn observation up
    25%: compliment → accusation; quiet mirror → talking mirror; solo drink → partner caught.
18. **Strategy alignment.** Every concept names its objective, persona, and selling argument
    from the Strategy Map. If it can't, it was generated from a "relatable moment" unmoored
    from strategy — kill.
19. **Duration mix audit.** Batch matches Strategy Map distribution (15s ≤ 25%, 30s ≥ 50%,
    45s ≈ 20%). Skew toward 15s = CD over-defaulted → reassign to match beat counts.
20. **TikTok Feed Test.** Delete the brand mention — would a real scroller watch to the end?
    - PASS: scenario inherently interesting without the product
    - FAIL: scenario only exists to introduce the product — commercial cosplaying as content
    - Fix: rebuild frame from a real persona scenario, weave product IN

21. **Narrative Chronology check (v7.4 — the agency principal critique).** Every concept explicitly
    states WHEN it happens on the pain-point timeline (before / during / after / split).
    Concepts with ambiguous chronology — where a reviewer would ask "is this before, during,
    or after the pain point?" — FAIL. Rebuild with an explicit timeline the description AND
    beats commit to.

22. **Format Mix audit (v7.5 — the agency principal critique, three lanes).** Batch matches the Format
    Mix from the Strategy Map (default 40% story-testimonial / 30% wild / 30% traditional
    DR).
    - If ≥50% is traditional DR (screen record + talking head + sitting in car + at desk
      with phone), the batch has collapsed into the safe-UGC failure mode.
    - If story-testimonial drops below 30%, the batch has lost its most relatable lane —
      the "wow this happened to me" anchor is missing.
    - If the batch is 100% captured/environmental with no human voice, it has overcorrected
      into gimmick territory (v7.4 failure mode).
    - "Person on camera showing his phone" counts as traditional DR, NOT story-testimonial.
      Story-testimonial has the product off-screen for most of the spot and the character's
      voice/face doing the selling.
    Kill the weakest concepts in the overrepresented lane and replace with concepts from
    the underrepresented lane until the target mix is hit. Veto power over the batch — a
    batch failing 22 does not ship regardless of every other check passing.

**Final compliance scan.** Read as if you're the BRAND reviewing before production. Flag
unqualified medical/health claims, competitor names, banned language, unapproved contexts,
unsubstantiated outcomes, house-style banned words.

**Verdicts:** PASS (survives all 20) · KILL (failed 1+, replacement needed) · REWORK (fixable —
adjust tone, fix ending, add DR beats, fix seasonality).

Kill list → generate replacements from Strategy Map, re-run through all 20. Only a fully-passed
batch goes to the Final Creative Strategy Review.

### 7.6. Final Creative Strategy Review (v7.3 — senior social media creative strategist)

The last gate. Runs AFTER all 20 Feedback Review checks pass. A senior social media creative
strategist reads the finished concepts as **written creative** — not as inputs to be checked
against a rubric, but as work about to go to a client. The 20-check gate catches mechanical
failures; this gate catches concepts that pass every rule but still don't actually work.

This reviewer is different from Steps 7 and 7.5. Steps 7/7.5 answer "does this obey the
rules." Step 7.6 answers **"is this any good, and would I ship it."**

Grounded in the agency principal's real qualitative feedback patterns across produced batches — the notes
that don't fit into checkboxes: "this feels like an ad," "the story doesn't land," "the
product intro is forced," "the description reads like a strategy note," "this one I'd
actually make."

**Sourcing rule (borrowed from `concept-alignment-review`).** Every REWRITE or KILL verdict
cites a specific brand source — a `brand_brain` field (`brand_tone`, `winning_concepts`,
`losing_patterns`, `dos_and_donts`, `creative_boundaries`, `compliance_notes`), a
`marketing_report` field, an approved-deck concept from `knowledge_v_concept_approved`, or a
compliance rule from the brief. No unsourced verdicts. Sourcing forces the reviewer to name
what the concept violates or misses, not just say "I don't like it." Verbatim quotes from the
brand's own material are the strongest sources — if `winning_ads` shows a specific pattern the
concept ignores, cite it.

**Review each concept individually (8 questions — v7.4 adds chronology check):**

1. **Would you actually ship this to a client tomorrow?** Not "is it clever" — is it a real
   ad the client would nod at. "Fine," "kind of," "with some work" all fail.
2. **Does the story make sense end-to-end?** Do the five beats connect naturally? Does beat 2
   logically follow beat 1? Or does the concept jump between disconnected moments held
   together only by the description sentence?
3. **Is the chronology clear (v7.4 — Eric)?** Would Eric ask "is this before, during, or
   after the pain point?" If yes, the concept is ambiguous. Every concept must commit to a
   timeline the description and beats both hold.
4. **Does it fit THIS brand's voice?** Compare against `brand_brain.brand_tone`,
   `winning_concepts`, `winning_ads`. Would this concept feel at home in their existing
   library, or does it read like it was written for a different client?
5. **Is the product actually IN the story, doing something believable?** Or is it mentioned
   and then bypassed? The product's role has to be load-bearing, not decorative.
6. **Is it genuinely interesting (v7.4 — the principal's "wow factor" check)?** If you saw this
   concept in a competitor's deck, would you steal it? Is there a "wow, this idea is really
   changing everything" moment — or is it just another safe pain-point UGC?
7. **What is this concept UNIQUELY doing?** Say it in one sentence. Concepts don't have to
   thematically connect to others in the batch, but each individual concept must have a clear
   reason to exist on its own terms.
8. **Is the description well-written?** Read it out loud. Natural cadence, real sentences,
   product visible in the story. Not choppy childish sentences, not copywriter voice, not a
   list of things happening in sequence with no rhythm.

**Review the batch as a whole (5 questions — v7.4 adds format-mix check).** Note: concepts do
NOT need to be thematically coherent as a set — they're independent tests. The batch-level
questions check operational soundness, not thematic unity.

1. **Format Mix (v7.5 — Eric).** Does the batch hit the Strategy Map's three-lane split
   (default 40% story-testimonial / 30% wild / 30% traditional DR)? the principal's original test:
   *"these are 30 pretty strong ideas for things that we know are tried and true... but we
   need also those elements of 'wow, these ideas are really changing everything.'"* The
   v7.5 corollary: also need the "wow, this happened to me too" lane — human voice
   carrying a real story where the product is the cause. If any lane is missing or
   over-represented, the batch is unbalanced.
2. **Is there real range across the batch?** Different scenarios, tones, emotional registers
   — not the same setup five times with different topics. Range doesn't mean coherence; it
   means the batch actually tests different things.
3. **Does the batch cover the Strategy Map's personas and selling arguments in balance?** Not
   "we picked whichever were easiest" — proportional to what the client actually needs to
   test.
4. **Would a producer AND a solo creator shooting at home both look at every concept and say
   "yes, this is shootable"?** A producer checks feasibility (talent count, location,
   permits, editing lift). A home creator checks the day-of reality — do they own the props,
   have the space, own the wardrobe, need help holding the camera. Both filters must pass on
   every concept. If a concept works for the producer but the creator would need a second
   person or a prop they don't own, it fails.
5. **Reading in order, is there a clear best 2–3?** If they're all equally-strong (or
   equally-mediocre), the batch has flattened — some concepts got polished up to match the
   average instead of the best ones being pushed harder. Sharpen the top; kill the bottom.

**Verdicts, per concept:**
- **SHIP** — works as-is, goes to delivery.
- **REWRITE** — fixable with specific notes AND a cited source explaining what's off (a beat
  that doesn't connect, a description that reads like a strategy note, a product intro that
  feels bolted-on, an ending that peters out, tone that misses `brand_brain.brand_tone`).
  Rewrite once and re-review. Max one rewrite cycle here.
- **KILL** — cited source shows the concept fundamentally violates brand voice, misses the
  Strategy Map, fails the ship test, or has no reason to exist even after rewrite. Replace
  from Strategy Map, run replacement through Steps 6 → 7 → 7.5 → 7.6.

**Verdict, batch-level:**
- **SHIP the batch** — individually all SHIP and all 4 batch questions pass.
- **RESHAPE the batch** — one or more batch-level questions fail. Rework distribution,
  kill weakest, add missing angles or personas. Do NOT just rewrite descriptions to fake
  diversity — the underlying concepts have to differ.

Only a batch that passes both individual and holistic review goes to Step 8.

### 8. Deliver (text by default, deck only on request)

**Default: deliver concepts as plain text in-chat.** Title, description, narrative bullets,
design components bullets — nothing else. No .pptx unless the user explicitly asks ("build the
deck," "make it a pptx," "put it in a deck," "send me the file").

**When the user asks for the deck:** write the config JSON (`references/config-example.json`)
and run `scripts/build_deck.js`. Numbering continues the brand's library. Accent is always
`7A3FF2`.

**North Star intro slide (mandatory when deck is built).** Deck's second slide (after cover) is
the Batch Strategy Map. A reviewer opening the deck cold must understand the strategy before
slide 3.

**Per-slide strategy tags — internal only, not printed on the concept.** Persona, selling
argument, awareness, production lane, duration, vehicle ID live in the config JSON / internal
working notes only. Do NOT print a `Brand · Persona · SA · Awareness · Lane · Vehicle #NNN`
line on the client-facing concept.

### 9. QA render & present (deck path only)

Runs only when a .pptx was built:

```
python /mnt/skills/public/pptx/scripts/office/validate.py <out.pptx>
python /mnt/skills/public/pptx/scripts/office/soffice.py --headless --convert-to pdf <out.pptx>
pdftoppm -jpeg -r 95 <out.pdf> q
```

View longest slides for overflow. Present with `present_files`. Delivery note: open in Google
Slides or File → Import slides into the client deck. Offer add-ons: 9:16 image-gen prompts
(`references/image-prompts.md`), trend-reference notes doc (never on slides).

## Slide format (house standard, v7.2)

Each concept is ONE slide — left ~63%, reserved 9:16 box right. Structure locked: **Title ·
Description · Narrative (5 beats) · Design Components (5 details)**. Hooks live in the script
phase (`ad-script-writer`), not on the concept slide.

- **Title** — punchy concept-level name reflecting the creative idea or format — NOT the hook.
  `NNN_Title`, brand accent color. "HRT Dating Profile" ✅ · "Bank Account Is Confused" ✅ ·
  "I Became My Own Doctor" ❌ (a line, not a vehicle).

- **Description** — a 2–3 sentence summary describing the creative vehicle (UGC, sketch,
  trend, interview, b-roll montage, ring cam, mockumentary, etc.) and how the brand/product
  is woven into it. Avoid any specific hooks or dialogue — this is about STRUCTURE, not
  scripting.

  The description tells the reader WHAT KIND of ad this is, not WHAT HAPPENS in it. The
  story specifics live in the narrative bullets, not here. If the description reads as a
  full story synopsis, it's too long — cut it back to format + brand fit.

  **Length target: 2–3 sentences. Never more than 3.** If the third sentence doesn't
  describe the vehicle or the brand's role, cut it.

  **What belongs in the description:**
  - Creator format (talking-head UGC, walking selfie, sitting-in-car, kitchen-counter,
    ring cam, screen record, mockumentary, sports parody, b-roll montage)
  - Setting/scene in one phrase (at his kitchen counter, walking to work, on his mom's
    couch, front porch)
  - How the brand/product fits into the vehicle (anchor, punchline, cause of the story,
    demo on screen, corner overlay)

  **What does NOT belong in the description:**
  - The full anecdote or story beats — those live in the narrative
  - Specific dialogue or hooks
  - What each individual beat looks like
  - The ending or payoff
  - Product mechanics explained ("cash out to crypto in 4 seconds...")

  **Ban all copy-writer voice in the description:**
  - Metaphors and figurative language: "the numbers do the talking," "the interface carries
    itself" → replace with what literally is on screen
  - Hook lines and taglines dropped into narration: "Not the watch. The pack." → those
    live in the script phase, not the concept description
  - Conclusion sentences: "That's the whole thing." → the description ends when the format
    + brand fit are named, not with a wrap-up line
  - "The [X] IS the [Y]" construction — any variant of it
  - "The concept sells/vends/never mentions/positions/reframes..." → strategy notes, not
    story
  - "Primary message:" tags or explicit selling-message labels

  A good description is a short structural summary a producer could staff and a strategist
  could tag by format at a glance. A bad description is a mini-story, a strategy note, or
  an ad script fragment.

- **Narrative — EXACTLY 5 bullet beats.** Flexible for any format. The five beats accomplish,
  IN ORDER:
  1. Opening moment or visual cue that grabs attention.
  2. How the brand or product is introduced contextually.
  3. What key message or transformation is communicated.
  4. Any supporting moment (testimonial, demo, reaction, unboxing, screen record).
  5. How it wraps with a payoff or CTA.
  
  **Write each bullet as clean prose describing what happens on screen. DO NOT prefix beats**
  with production labels ("Open with...", "Cut to...", "Match cut:", "POV:", "Overlay:", "Back
  to..."). The category is implicit from the beat's position; the bullet reads like a mini-
  story sentence.
  
  **Vary sentence structure across the five beats.** Never open more than one beat with the
  same phrase (repeating "Back to the phone" three times = fail).

- **Design Components — EXACTLY 5 bullets.** Visual + editing style. IN ORDER, cover:
  1. Content style (lo-fi UGC, polished b-roll, sketch, talking head, split screen)
  2. Editing pace and transitions (jump cuts, wipes, slo-mo, snap zooms)
  3. Captioning format (raw native subs, bold branded text, meme-style overlays)
  4. Platform-optimized overlays (CTA banners, URL tags, emojis, product pins)
  5. Recommended duration + aspect ratio (matched to Strategy Map's duration mix)
  
  **Print the descriptive text directly WITHOUT the label prefix.** No "Content style:",
  "Editing pace:", "Captioning format:", "Recommended duration:". Category is implicit from
  position. Each bullet is a plain-language sentence.
  
  Every device listed must already appear in description or narrative — never parachute in.

- **No overlay copy or disclaimer text in the concept output (hard rule).** The concept
  describes what HAPPENS. It does NOT include specific overlay copy or compliance disclaimer
  wording. Banned from description, narrative, and design components:
  - Specific overlay text in quotes ('Overlay: "$12 PACK · $400 WATCH"', 'Overlay: "One
    app."')
  - Compliance/eligibility disclaimer copy ("18+ · Eligibility varies by country · Don't
    spend more than you can afford to lose", "Results not typical")
  - Specific URL strings as copy (`packdraw.com`) — the DESIGN COMPONENTS bullet can say
    "sticky URL end card" as a style choice, but never the URL string as copy
  
  Overlay wording and disclaimer copy are **script-phase and compliance-phase decisions**, not
  concept-phase. `ad-script-writer` writes overlay copy; compliance QA confirms disclaimer
  language. Concept slide describes the STYLE of captioning/overlays (bullets 3 and 4 of
  Design Components) without committing to specific words.
  
  If the concept truly hinges on a specific line of on-screen copy (a question that IS the
  visual), name that ONE line inline in the description prose without formatting it as an
  "Overlay:" callout. Full overlay set gets written downstream.

- **9:16 mockup space** — reserved (the generator draws it).

CTA copy and full scripts stay in the script phase.

## Revising an existing deck

Apply feedback as a craft pass using **keep / adjust / replace** in craft-rules. Run the
strategist gate on the full revised set (survivors included) before rebuilding. Change the
thinking underneath, not just the words. Cite the feedback in the change log.

**After the client finalizes a batch:** run a **survival diff** — what survived, what was
retitled, what was replaced, and what the replacements have in common. Replacement patterns
become new composition targets or craft rules.

## Five-agent pipeline summary

1. **Strategic Analyst** — reads `marketing_report` + `brand_brain` from Supabase (hard stop if
   missing), produces Batch Strategy Map: objectives × personas × selling arguments × concept
   allocation × duration mix. Prints as North Star intro slide.
2. **Creative Director** — builds the Relatable Frame (deletable-brand test), runs Message
   Visualization (5+ ways to visualize the message before touching a vehicle — v7.4), checks
   Narrative Chronology (before/during/after/split — v7.4), runs Vehicle Candidate Search
   across THREE pools (bank + researched + Step 4 viral formats — v7.4), applies Fit-Check
   Gate (cap 2 per batch), audits Prop Simplicity + IP Naming ban, enforces the Batch Format
   Mix (traditional vs wild — v7.4). Applies 25%-intensity throughout.
3. **Creative Strategist** — reviews every concept against the craft scorecard. Kills bad
   craft.
4. **Feedback Review Agent** — runs 22 sequential mechanical checks distilled from real
   producer feedback (dedup, vehicle diversity, DR spine, TikTok Feed Test, Chronology,
   Format Mix). Kill list generates replacements from the Strategy Map.
5. **Final Creative Strategy Reviewer** — senior social media creative strategist reads the
   finished concepts as written creative and judges quality holistically. Sourcing rule from
   `concept-alignment-review`: every REWRITE or KILL verdict cites a specific
   `brand_brain` / `marketing_report` / `winning_concepts` / compliance-rule source — no
   unsourced verdicts. 8 questions per concept (ship-worthy, story coherence, chronology
   clarity, brand fit, product involvement, wow factor, unique reason to exist, description
   quality). 5 questions on the batch (Format Mix, real range, persona/SA balance, producer +
   home-creator shootability, clear best 2–3). Concepts do NOT need to be thematically
   coherent as a set. Verdicts: SHIP / REWRITE / KILL per concept, SHIP / RESHAPE at batch
   level. Only a fully-passed batch goes to delivery.

## Reference files

- `references/craft-rules.md` — title/description/narrative/design rules, worked examples.
- `references/creative-strategist.md` — reviewer role, scorecard, verdicts, change log.
- `references/libraries.md` — observation prompts, vehicles, tensions, native formats, proof
  behaviors, hook modes, outcome ladder.
- `references/image-prompts.md` — UGC image-gen prompts for 9:16 stills.
- `references/config-example.json` — minimal valid config.
