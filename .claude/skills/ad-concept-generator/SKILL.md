---
name: ad-concept-generator
description: >-
  Send a brand (URL, snapshot, docs, or just a name) and this skill generates a client-ready deck of
  paid-social ad concepts (UGC-first, native to Meta/TikTok) as a validated .pptx. v6 adds Step Zero
  (strategic analysis: business objectives × personas × selling arguments BEFORE ideation), a DR spine
  requirement (vehicle = hook only, never the whole ad), the 25%-intensity rule (confrontation, stakes,
  drama), dual scoring (thumb-stopping + performance-ready), positive-benefit-first messaging, a North
  Star intro slide, and question-led brainstorming. v6.2 adds the Compliance & Alignment Reviewer as
  the final gate before build — it re-reads the client's actual source-of-truth (onboarding docs,
  batch critical info, meeting notes, brand_brain in Supabase) and cross-checks every concept for
  factual accuracy (product names, offers, prices), strategic coverage (audiences and selling
  arguments named in critical info), and compliance (banned language, unauthorized claims). Failed
  concepts loop back to the Creative Director for rewrite. Five-agent pipeline: Strategic Analyst →
  Creative Director → Creative Strategist → Feedback Review Agent → Compliance & Alignment Reviewer.
  Use when the user asks for ad concepts, a concept deck, UGC concepts, loglines, a creative batch,
  or "concepts for [brand]." Also use to revise an existing concept deck.
---

# Ad Concept Generator (v6)

Turn a brand into a distinct, executable, client-ready deck of paid-social ad concepts. v6
restructures the pipeline around the agency principal's Aug 2026 review and the the meal-service account DR feedback:
**the system was over-indexing on creative vehicles and under-indexing on strategy and direct-response
selling.** The vehicle is the HOOK into a DR structure — never the whole ad. And no concept exists
until a business objective and target persona have been chosen for it.

## The core shift (why this exists)

Three generations of feedback converged:

1. **v4 lesson (the telehealth account):** ads that communicate information ≠ concepts a CD selects. Start from human
   observations, make a creative leap into a vehicle.
2. **v5 lesson (the colostrum brand's Batch 5):** the edge is in the SUBJECT MATTER, not elaborate format gimmicks.
   Standard formats, bold hooks.
3. **v6 lesson (the agency principal review + the meal-service account):** a creative device is not a concept by
   itself. "Voice note," "tier list," "drawer reveal" are formats — the concept still needs a clear
   sales argument underneath, a business objective above, and a target persona it's speaking to.
   The observation harvest was generating "relatable moments" unmoored from strategy. **Step Zero
   comes first: WHO is this for, WHAT are we selling them, WHY this angle.** Then the observation,
   then the vehicle, then the DR spine.

- **Bad flow (v4 failure):** *insight → ad.* Benefit wrapped in a UGC vehicle.
- **Bad flow (v5 failure):** *format gimmick → brand plugged in.* Clever format, generic insight.
- **Bad flow (v6 failure):** *relatable moment → vehicle → done.* Interesting setup takes 70–90% of
  the ad, the product gets one line at the end, no price, no mechanism, no CTA. Cute, doesn't convert.
- **Good flow (v6):** *business objective → target persona → selling argument → human observation
  (from that persona's world) → creative leap → vehicle AS THE HOOK → DR spine carries the rest.*

**The intensity lesson (Eric):** content must be ~25% more intense than real life. "My nail tech said
my nails look healthier" is not worth pulling out a phone for. "My nail tech accused me of cheating
on her because my nails look too good" is. Confrontation, accusation, stakes, drama — the same
observation, turned up. The a home-security brand benchmark: a first-person POV where the creator talks while his
house is being robbed behind him. Every concept must answer: **what about this grabs your interest?**

## Live knowledge base (v6.1)

Four Postgres tables in the adbundance Knowledge Layer back this skill. They are queried **live at
specific pipeline steps** — no cached snapshots, no stale data.

**Primary transport: the Supabase MCP.** Call `Supabase:execute_sql` with
`project_id="xakngjsybyytldyqfsmi"` and the SQL for the step you're on (SQL is inlined at each
step below). This works in every Claude session where the Supabase connector is enabled — no env
var, no network setup.

**Secondary transport: node scripts (local runs only).** When running the skill from a local
Claude Code / desktop setup with network access to Supabase and `KNOWLEDGE_DATABASE_URL` exported,
`scripts/fetch-*.js` runs the same queries and prints markdown ready for the next agent. See the
table below for the mapping.

| Step | Table | MCP call (primary) | Local script (secondary) |
|---|---|---|---|
| 1, 2 | `knowledge_v_concept_approved` (view) | inlined SQL at those steps | `fetch-approved-concepts.js` |
| 4 | `knowledge_scraped_ad` | inlined SQL at that step | `fetch-scraped-ads.js` |
| 6 | `knowledge_vehicle_bank` | inlined SQL at that step | `fetch-vehicles.js` |
| 6 | `knowledge_researched_vehicles` | inlined SQL at that step | `fetch-trend-vehicles.js` |

**Confidence vocabulary must not be conflated.** The researched-vehicles table uses TWO scales that
cannot be mixed: brand-observed (`thin`/`reported`/`strong`, has an advertiser count) vs
trend-sourced (`trend-thin`/`trend-reported`/`trend-verified`, no advertiser count). Every row
carries `evidence_basis` so the CD can preserve the caveat. Never claim performance from either.

**Scraped-ad buckets are category-wide, not brand-specific.** `query` groups rows into buckets like
`skincare`, `collagen`, `medicare`, `credit card` — plus a large `client-ad-history` bucket. Don't
expect the brand's own ads there; use it for what real ads in the adjacent category are saying.

## Pipeline

### 0. Step Zero — Strategic Analysis (Strategic Analyst agent, NEW in v6)
**Before any observation harvest or ideation**, a Strategic Analyst reads the marketing report and
onboarding docs and produces the **Batch Strategy Map**:

1. **Business objectives for this batch.** What is the brand trying to accomplish RIGHT NOW? (Lower
   CAC on a specific product line, break into a new persona, scale a proven angle, test a new
   category entry.) Pull from client meeting notes, the marketing report objectives section, and any
   explicit direction. If unclear, ask the user — this is the one thing worth stalling for.
2. **Target personas for this batch.** Pick the 2–4 specific personas this batch speaks to (e.g.,
   "bodybuilding men 25–40," "exhausted moms 32–42," "menopausal women 50+"). Each concept will be
   assigned to exactly ONE persona. Persona-first ideation: knowing the persona generates the
   scenarios (gym guy → leg-day prep, what he drinks pre-workout, locker-room talk).
3. **Selling arguments to test.** List the distinct sales arguments the batch should cover — price,
   time savings, mechanism, specific benefit (hair/gut/skin), social proof, category comparison,
   convenience. Concepts test DIFFERENT selling arguments, not merely different formats. "Voice note
   vs. skit vs. talking head" with the same argument is one test, not three.
4. **Concept allocation.** Distribute the batch across objective × persona × selling argument BEFORE
   writing anything. E.g., "8 concepts: bodybuilder persona × mechanism argument. 10 concepts:
   exhausted mom × multi-benefit simplicity. 6 concepts: soda × flavor/occasion."

The Batch Strategy Map prints as the deck's **North Star intro slide**: "Over the course of this
deck you'll see ideas that hit these business objectives, for these audiences, testing these selling
arguments." A reviewer opening the deck cold must understand the strategy before slide 3.

**Question-led brainstorming (the principal's method).** The Strategic Analyst reaches its outputs by asking
guiding questions, not "what if" jumps: Who is this for? What is the goal? What do we want those
people to know? How are we entering their world properly? Where do they wake up, what do they carry,
what do they drink on the way to the gym? The questions generate the scenarios.

### 1. Intake & brand analysis
The user may send anything from a full onboarding pack to just a URL or name. Build a working snapshot:
product + USPs, personas, voice, real proof points, compliance rules, and font preference.
If only a URL/name was given, web-search + fetch to fill the snapshot; confirm font or default
(Poppins). Ask only for what genuinely blocks writing (hard compliance rules, offer language).
Don't stall.

**Deck accent color is ALWAYS `7A3FF2` (agency purple).** This is a Creative AdBundance house
standard — it does NOT change per brand, regardless of the brand's own palette. Never substitute the
brand's colors for the deck accent. The purple is locked.

**Brand creative appetite (v5).** Study the brand's approved concepts — not just their topics but
their actual TONE RANGE. Some brands want edge in subject matter (the colostrum brand: white powder jokes, breast
milk confusion). Some want edge in format (a mobile-games app: Pixar-style animation). Some want warmth
(the parenting app: mom confessionals). The approved deck IS the creative brief for tone — match it, don't
overcorrect toward either safe or unhinged.

**Pull it live via the Supabase MCP.** Call `Supabase:execute_sql`,
`project_id="xakngjsybyytldyqfsmi"`, with this SQL (parameterise or inline the brand name — the
view uses the canonical spelling, so `ILIKE '%<brand>%'` is safe):

```sql
SELECT client, product, batch, concept_no, title, funnel_stage,
       motivators, messaging_angle, hook_tactic, message,
       narrative_beats, script_hooks
FROM public.knowledge_v_concept_approved
WHERE client ILIKE '%<brand>%'
ORDER BY batch_seq NULLS LAST, concept_no NULLS LAST
LIMIT 200;
```

If nothing comes back, the brand name doesn't match — run
`SELECT DISTINCT client FROM public.knowledge_v_concept_approved ORDER BY client` and try the
canonical name. Sample tone from what's in the result before writing anything.

_Local alternative_: `node scripts/fetch-approved-concepts.js --client "<Brand>" --format md`.

### 2. Library check — FULL dedup audit (v5 — expanded, v6.1 DB-backed)
If the brand has prior concepts (deck, Drive file, list), read the **ENTIRE existing library** —
every batch, every section, every supplementary concept. Extract title + description for each. This
is not optional for large libraries. the colostrum brand's Batch 5 required dedup against 117 existing concepts across
4 batches + supplementary sections; surface-level title matching missed insight-family overlaps that
only showed up in the descriptions.

**Primary source: the Knowledge Layer via the Supabase MCP.** Same view as Step 1, richer
projection for dedup analysis:

```sql
SELECT concept_id, client, product, section, batch, batch_seq, concept_no,
       title, funnel_stage, motivators, messaging_angle, hook_tactic,
       message, narrative_beats, deck_url, script_url,
       script_title, script_hooks, script_body
FROM public.knowledge_v_concept_approved
WHERE client ILIKE '%<brand>%'
  -- optional narrowing:
  -- AND product ILIKE '%<product line>%'
  -- AND batch   ILIKE '%<batch label>%'
ORDER BY batch_seq NULLS LAST, concept_no NULLS LAST
LIMIT 500;
```

Cluster the result by insight family (the underlying observation), vehicle/format, and visual
identity — that's the dedup surface. Drive-hosted decks stay as a fallback for the rare pre-DB
batch that hasn't been ingested yet.

_Local alternative_: `node scripts/fetch-approved-concepts.js --client "<Brand>" [--product X]
[--batch Y] --format md`.

For each existing concept, catalog:
- The **insight family** it belongs to (not just the topic — the underlying observation)
- The **vehicle/format** used (talking head, b-roll + text, skit, greenscreen, trend-native, etc.)
- The **visual identity** with audio off (what does it look like?)

New concepts must bring a different **observation AND a different visual identity**. Changing the
hook on the same vehicle is not a new concept.

### 3. Performance filter
If performance data exists (CPA by hook/angle/format, client notes), build the **allowed set** first:
winning angles/formats to weight toward; losers to exclude; gaps worth a controlled test. Data weights
the mix but never becomes a template. If no data: default to Pain Point + Transformation angles,
Talking Head/Lifestyle-led formats, and say you're defaulting.

### 4. Human observation harvest (before ideation)
Before writing any concept, mine **15-20 specific human observations** for the ICP. Not benefits, not
angles — observations. See `references/libraries.md` for prompts. Rules:
- Each observation must be a **specific behavior, thought, situation, conversation, or internet habit**
  someone in the ICP would recognize instantly — not a broad theme.
- Weight the harvest toward the performance-filtered angles, but sourced from behavior, not from
  strategy documents.
- **Cross-check against existing library (v5).** If an observation is already expressed in the existing
  deck, it's spent. Find fresh territory.

**Optional category-context pull via the Supabase MCP.** When the brand plays in a well-covered
space, pull long-running ads in the adjacent category to see what observations competitors lean on:

```sql
SELECT advertiser, platform, run_days, headline, description, cta,
       transcript, drivers, persona, foreplay_url
FROM public.knowledge_scraped_ad
WHERE excluded_reason IS NULL
  AND query ILIKE '%<bucket>%'   -- e.g. 'skincare', 'collagen', 'medicare', 'credit card'
  AND COALESCE(run_days, 0) >= 30
ORDER BY run_days DESC NULLS LAST, fetched_at DESC
LIMIT 20;
```

Rows sort by `run_days DESC` — longevity is a weak positive that the format is landing somewhere.
This is NOT dedup and NOT performance data; it's inspiration + tension surface. Not useful for
pulling the brand's own past ads — the buckets are category-tagged, not brand-tagged. To see what
buckets exist:
`SELECT query, COUNT(*) FROM public.knowledge_scraped_ad WHERE excluded_reason IS NULL GROUP BY query ORDER BY 2 DESC LIMIT 20;`

_Local alternative_: `node scripts/fetch-scraped-ads.js --query "<bucket>" --min-run-days 30 --limit 20 --format md`.

### 5. Loglines-first checkpoint (v5 — new step)
Before writing full concepts, present **short loglines** (1–3 sentences each) with: title, one-line
description, vehicle, tone, product line, awareness stage, and production lane. The user selects
which to build. This prevents wasted full-concept writing on ideas that will be killed.

For large batches (20+ concepts), present ALL loglines at once, grouped by product line or theme.
The user may:
- Select all
- Kill specific ones and ask for replacements
- Give feedback that reshapes the batch direction

### 6. Ideation — Creative Director pass

**Before ideating, load both vehicle libraries live via the Supabase MCP.**

Proven bank (`knowledge_vehicle_bank`) — prefer these for the DR spine:

```sql
SELECT vehicle_id, name, description, mechanic_summary, hook_strategy,
       production_path, narrative_beats, design_components, duration,
       example_script_text, example_script_hooks, origin,
       COALESCE(jsonb_array_length(proven_by), 0) AS proven_count
FROM public.knowledge_vehicle_bank
WHERE needs_review IS NOT TRUE
ORDER BY proven_count DESC, name ASC;
```

Trend layer (`knowledge_researched_vehicles`) — borrow when the batch needs freshness, and carry
the `confidence` + `evidence_basis` forward so nothing borrowed here gets presented as proven:

```sql
SELECT researched_id, name, platform, channel_type, structure, mechanic,
       why_it_works, ad_adaptability, cohort, advertiser_count,
       confidence, evidence_basis, archetype, engine,
       viewer_behaviors, product_integration, remixability,
       duration_range, source_title, source_url, blurb
FROM public.knowledge_researched_vehicles
WHERE status = 'active'
  -- optional: AND platform = 'meta' AND cohort = 'rising'
ORDER BY
  CASE cohort WHEN 'rising' THEN 0 WHEN 'established' THEN 1 ELSE 2 END,
  CASE confidence
    WHEN 'strong' THEN 0 WHEN 'reported' THEN 1 WHEN 'thin' THEN 2
    WHEN 'trend-verified' THEN 0 WHEN 'trend-reported' THEN 1 WHEN 'trend-thin' THEN 2
    ELSE 3
  END,
  COALESCE(advertiser_count, 0) DESC,
  name ASC;
```

_Local alternative_: `node scripts/fetch-vehicles.js --format md` and
`node scripts/fetch-trend-vehicles.js --format md`.

For each concept: take its assigned **objective × persona × selling argument** from the Batch
Strategy Map, pick an observation FROM THAT PERSONA'S WORLD, make **one creative leap**, assign
**one vehicle as the HOOK**, then build the DR spine underneath. Prefer proven vehicles for the DR
spine; borrow trend vehicles when the batch needs freshness and mark them internally as such.

All v4 rules apply (see `references/craft-rules.md`), plus:

- **The DR spine (v6 — mandatory).** A creative device is not a concept by itself. Every concept
  needs: **hook/pattern interrupt → problem or misconception → introduce the product FAST → how it
  works (mechanism) → proof/benefit → price/value where relevant → CTA.** The vehicle owns the first
  3–5 seconds; the DR spine owns the rest. The viewer should understand the problem and why the
  brand is relevant within the first few seconds. **Don't end right when the selling should start** —
  if the interesting setup takes 70–90% of the ad and the product gets one line at the end, the
  concept fails. The narrative beats on the slide must show the full spine, not just the setup.
- **Conversion density (v6).** Ask per concept: "How much useful selling information does the viewer
  get in 20–30 seconds?" Novelty never comes at the expense of explaining the offer. Make the
  product mechanism explicit — what it is, how it works, what it costs (when the brand allows
  price), what to do next.
- **The 25%-intensity rule (v6).** Content must be ~25% more intense than real life. A compliment is
  not a story; an ACCUSATION is. "My nail tech said my nails look healthy" → lame. "My nail tech
  accused me of cheating on her because my nails look too good" → concept. Turn observations up via:
  confrontation, accusation, being caught, stakes, a secret exposed, a competition, something
  happening in the background (a home-security brand's house-robbery POV). Every concept must pass: **"What about
  this grabs your interest?"** If the honest answer is "nothing really," kill it.
- **Positive-benefit-first messaging (v6).** Never sell the absence of a negative as the main
  argument. "No chalky aftertaste" is not a selling point — "I just added 400 bioactives to my water
  and I taste literally nothing" is. "Adding healthy skin to your water is as easy as one scoop" is.
  Lead with what the viewer GAINS; ease/taste/texture is the supporting clause, never the headline.
- **Never counterintuitive brand messaging (v6).** The brand never says anything that argues against
  trial. "I tried this so you don't have to" fails — why would a brand tell people not to try it?
  Adjust to enthusiasm framing: "After I tried colostrum, I can't stop talking about it." Read every
  hook literally from the brand's perspective before approving it.
- **Mechanic-to-product match (v6).** The vehicle's structure must match what's being sold. "Choose
  Your Fighter" implies multiple options to choose between — that fits a 4-flavor soda line ("Choose
  Your Flavor"), not a single-SKU powder. Before assigning a vehicle, ask: does this mechanic
  naturally showcase THIS product's actual structure (flavors, tiers, use cases, occasions)?
- **Product-specificity check (v5).** Every concept must be anchored in something ONLY THIS BRAND'S
  PRODUCT can own. Ask: **could a competitor run this concept unchanged?** If yes, anchor it in the
  brand's unique story.
- **Creator count — soft default, not hardline (v6, replaces the v5 hard rule).** DEFAULT to one
  solo creator filming at home — it keeps production simple and cheap. But this is a production
  preference, not a creative law: **if a second person makes the concept meaningfully stronger
  (two-person podcast, partner caught sneaking the product, confrontation skits), allow up to two
  people when the brand's production setup supports it.** Check the brand's production notes; the colostrum brand
  and most DTC clients can cast a creator + one partner/friend. Same-person skits remain the
  fallback when casting is constrained. Tag each concept with its talent count so production can
  plan. The at-home filming preference also softens: a dash-cam car POV or gym-adjacent shot is
  allowed IF the client's creators can realistically capture it — flag anything needing a real
  external location as "location shoot" in the production lane.
- **Anti-format-gimmick rule (v5).** The format should be standard UGC. Elaborate format parodies
  pass ONLY when the product's own story creates the comedy inside the parody.
- **Anti-supplement-bashing rule (v5).** Max 2 concepts built on "other products failed." The bulk
  is built on what makes THIS product's story unique.
- **Vehicle diversity from libraries (v5).** Pull from `references/libraries.md` and any provided
  viral catalog. Kill vehicle saturation (5+ same vehicle).
- **Seasonality check (v5).** No holidays/events far from the current date.

### 7. Five-audit gate (v5 — replaces the single strategist gate)
After generating loglines or full concepts, run these five audits IN ORDER. Kill and replace concepts
that fail any audit — do not patch.

**Audit 1: Full dedup vs. existing library.**
Compare every concept against the full existing library at the INSIGHT-FAMILY level (not just title).
If a concept expresses the same underlying observation as an existing concept — even with a different
vehicle — kill it. Example: "Supplement Cabinet Graveyard" dupes "Everything I tried to de-bloat and
failed" even though the vehicles differ — same insight family (failed supplement history).

**Audit 2: Solo-creator + UGC feasibility.**
Flag every concept that requires a second person on camera (partner, friend, stranger, hairdresser).
Rework as solo-creator executions or kill.

**Audit 3: Product-specificity.**
Flag every concept that any brand could run unchanged. "The subscription I don't cancel" → generic.
"I drink powdered cow colostrum every morning and people think I'm insane" → only colostrum. Kill
generics and replace with product-ownable concepts.

**Audit 4: Brand-alignment.**
Run every concept against the brand's actual rules and creative appetite:
- Compliance (medical claims, language restrictions, disclaimers)
- Tone (does this match the brand's approved creative range — not too safe, not too unhinged?)
- Distribution channel (DTC vs. retail — don't write grocery-aisle concepts for a DTC brand)
- Competitive framing (don't name competitors or identifying ingredients)
- Production notes (styling, glassware, caption style, talent direction)

**Audit 5: Vehicle saturation + sound-off test.**
With audio off, can you sort all concepts into distinct visual piles? If 5+ concepts look the same
(creator at kitchen counter explaining), kill the weakest and replace with visually distinct vehicles
from the libraries.

Then run the **Creative Strategist scorecard** (see `references/creative-strategist.md`) on the
surviving batch — all v4 checks plus the v5 audits above.

### 7.5. Feedback Review Agent (v5 — new agent, mandatory)

The **Feedback Review Agent** is a third agent that runs AFTER the Creative Strategist gate and
BEFORE building the deck. It replays every revision pattern learned from real producer feedback
across all client batches. The strategist catches craft problems; this agent catches the patterns
that only surface when a producer sits with the batch and says "these all feel the same" or
"this isn't us."

The agent runs **seven checks** in order. Each check produces a **PASS / FAIL + kill list**.
Failed concepts are killed and replaced from fresh observation territory before the next check runs.
This is sequential — a concept that survives Check 1 can still die at Check 4.

**Check 1 — Batch sameness scan.**
Read all concept titles and descriptions as a batch. Ask: "If I showed these 40 thumbnails to a
producer, would she sort them into 40 distinct piles — or would she start stacking?" Look for:
- 5+ concepts that are all "creator at kitchen counter explaining the product"
- 5+ concepts that are all "creator to camera listing reasons"
- 3+ concepts built around the same prop interaction (all drawer reveals, all bag dumps)
- 3+ concepts that are structurally identical (all "here's what happened when I..." confessionals)
If the batch has visible clusters of 3+ same-looking concepts, kill the weakest per cluster until
each visual identity appears at most twice. Pull replacements from underused vehicles in the vehicle
library and viral format catalog.

**Check 1b — Copy repetition / "same ad in different outfits" scan.**
Read all concept descriptions and narratives back-to-back as continuous text. Flag any product
claim, descriptor, or proof phrase that appears in more than 3 concepts. Common offenders:
- The same stat repeated everywhere ("400+ bioactives" in 8 of 10 concepts)
- The same credential everywhere ("physician-developed" / "a neurologist made it" in every concept)
- The same ingredient story everywhere ("bovine colostrum" as the punchline every time)
- The same product feature everywhere ("no added sugar" / "mixes clear" in every soda concept)
- The same closing argument ("gut barrier support, immune function, hair, skin, energy")

If the batch reads like one ad wearing different outfits — different vehicles but identical copy
inside — it fails. Fix by distributing claims across the batch:
- **3–4 concepts lead with the stat** (400+ bioactives, one ingredient)
- **2–3 concepts lead with the founder/credential story** (neurologist left her practice)
- **2–3 concepts lead with the personal experience** (what the creator noticed, no claims listed)
- **1–2 concepts lead with the product experience** (tastes like nothing, mixes clear, the ritual)
- **1–2 concepts never explain at all** — the product is shown, not described; the concept's
  comedy or emotion does the selling

The rule: each concept picks ONE primary selling message from the brand's toolkit. The other
messages sit down for that concept. If the viewer reads three concepts and sees the same five
bullet points in each, the batch is monotone regardless of how different the vehicles are.

**Check 2 — Vehicle library + viral catalog cross-check.**
Confirm that at least 30% of concepts actively use a vehicle from the libraries
(`references/libraries.md`) or from the user-provided viral format catalog. If the batch is
dominated by standard talking heads and b-roll + text overlays, force 5–8 replacements pulled
directly from unused vehicles/formats: drawer reveal, wall calendar, post-it wall, whiteboard math,
napkin drawing, countdown timer, wardrobe reveal, same-person skit, speed-run, "Of Course I'm Going
To...", "That's Not My Name", "Everything Hallelujah", "Put A Finger Down", "Expose Your Addiction",
"How To Summon Me" transition, on-off toggle, stretched word carousel, etc.

**Check 3 — "Could any brand run this?" ownability test.**
Read each concept and ask: "If I removed the brand name and product, could I plug in any
competitor's product and the concept would still work unchanged?" If yes — the concept is generic.
Kill it and replace with something anchored in THIS product's unique story:
- The origin / sourcing / processing story only this brand owns
- The social friction or surprise reaction only this product triggers
- The founder's specific credential or decision that no competitor shares
- The specific ingredient count, mechanism, or format (powder vs. soda) that differentiates
Generic vehicles that fail this test: "The subscription I don't cancel," "Name a product you'd
never go back from," "Moving day: which box does this go in," "I've become my mother," "Things on
my counter ranked by how long they lasted." These could be any DTC brand.

**Check 4 — Brand-tone calibration.**
Pull the client's approved concept deck and compare the TONE RANGE of the new batch against what
the client actually selected in prior batches. The approved deck IS the creative brief for tone.
- If the client's approved concepts use edgy subject matter in standard formats (the colostrum brand: white
  powder comedy in a talking head), DON'T write standard subject matter in elaborate format parodies
  (courtroom skit, art gallery, fashion runway). The edge lives in the WHAT, not the HOW.
- If the client's approved concepts are warm and confessional (the parenting app: bathroom confessionals),
  DON'T write sarcastic deadpan comedy. Match the emotional register.
- If the client leans DTC digital, DON'T write grocery-aisle or retail-floor scenarios.
- If prior batches don't include format parodies (mock infomercials, cooking shows, award
  ceremonies), that's a signal — the client doesn't want them. Don't introduce them unless the
  brief explicitly asks for experimentation.

**Check 5 — Multi-talent audit.**
Every concept must be shootable by ONE solo creator unless the brief explicitly permits multi-talent.
For each concept, ask: "Does this require a second person to be on camera for the concept to work?"
- Partner/spouse reacting → FAIL (rework as post-event storytelling or same-person skit)
- Friend on FaceTime → FAIL (rework as voice-note or text-thread recap)
- Hairdresser/trainer/doctor → FAIL (rework as "they said" retelling from creator alone)
- Stranger on the street → FAIL (this is a street interview, needs casting)
- Same-person playing two characters → PASS
- Creator alone telling a story about someone else → PASS
- Creator's dog/cat → PASS (animals are props, not actors)

Then ask: **"Can this be filmed at home with a phone and the product?"** Every concept must be
shootable in a normal residential setting — kitchen, bathroom, bedroom, living room, home office,
doorstep, mirror, couch, desk. NO concepts that require the creator to go to a specific external
location to film the ad:
- Movie theater → FAIL
- Gas station → FAIL
- Gym / gym parking lot → FAIL
- Grocery store aisle → FLAG as location shoot
- Yoga studio → FLAG as location shoot
- Uber / rideshare → dash-cam POV allowed IF creators can capture it; otherwise FLAG
- Coffee shop → FLAG as location shoot
- Office with coworkers → FLAG as location shoot + multi-talent
- Restaurant / brunch → FLAG as location shoot + multi-talent
- Airport / TSA → FLAG as location shoot

**v6 softening:** at-home solo is the DEFAULT, not a law. A concept needing one extra person or one
realistic external capture (car dash-cam, gym-adjacent) PASSES if the client's production setup
supports it — tag it "location shoot" or "2-talent" in the production lane so production can plan
and the client can veto. A concept still FAILS this check when it needs a cast (3+ people), a
commercial location requiring permission (movie theater, TSA), or staging the client can't
realistically produce. When production constraints are unknown, default to solo + at-home.

If a location-dependent concept can't be produced, rework it: the creator can TELL THE STORY from
home (e.g., "Let me tell you what happened at the gym") — the location lives in the narration.

**Check 6 — Seasonal + contextual audit.**
Flag any concept tied to a specific holiday, event, or cultural moment that is more than 6 weeks
from the current date. "POV: Thanksgiving dinner" in August → FAIL. Rework with season-agnostic
framing ("POV: family dinner" → PASS). Also flag:
- Concepts referencing trends that may have already peaked or expired
- Concepts dependent on a specific platform feature that may change
- Concepts requiring specific weather or setting (snow, beach) unless the brief calls for it

**Check 7 — Believable trigger (from a social-growth tool feedback).**
Every concept must answer: **"Why is this person showing me this right now?"** If there's no
believable trigger — no friend asking, no product running out, no comment to respond to, no before/
after moment, no discovery event — the concept is a dressed-up testimonial. Reject the premise and
rebuild with a specific trigger: accusation, discovery, comparison, challenge, confession, reaction,
or social moment that makes the viewer believe this is organic. The trigger makes the concept feel
found, not placed.

**Check 8 — Product introduction variety (from a social-growth tool feedback).**
Scan the batch for how the brand enters each concept. If 3+ concepts use the same introduction
mechanic — "That's where [brand] came in," "So I started using [brand]," "Then I found [brand]" —
the batch is templated. The product should enter differently based on the concept: friend
recommendation, comment response, research discovery, accidental find, partner mention, label
reading, someone else using it, social media scroll, gift from a friend, etc. Each concept's
product intro must feel native to THAT concept's story, not copy-pasted.

**Check 9 — Proof closes the narrative argument (from a social-growth tool scripts feedback).**
The proof/outcome in each concept must specifically close the argument that the concept opened.
If the concept is about gut issues, the proof can't be generic "I feel great." If the concept is
about hair, the proof can't be "my energy is better." The proof must match the promise:
- Gut concept → gut-specific personal experience
- Hair concept → hair-specific observation
- Immune concept → immune-specific anecdote
- Soda replacing another drink → the specific drink it replaced and why
Generic proof ("I love it," "it works," "10/10") fails this check. Every concept's payoff must
close the SPECIFIC loop its hook opened.

**Check 10 — Outcome ladder spread (from a social-growth tool feedback).**
Scan the batch for outcome repetition. If 5+ concepts all end with the same type of result (all
"my gut feels amazing," all "I look younger," all "I never get sick"), the batch is monotone.
Build an outcome ladder for the brand and distribute endings across it:
- Physical feeling change (energy, bloating, digestion)
- Visual change (skin, hair, nails — observed by self)
- Third-party validation (someone else noticing/commenting)
- Behavioral change (stopped buying other things, changed routine)
- Social consequence (became an evangelist, friends ordered)
- Identity shift (became "the colostrum person")
- Specific metric (months on auto-ship, jars finished)
Each concept's ending should feel distinct from its neighbors.

**Check 11 — Specificity rule (from a social-growth tool feedback).**
Every concept needs at least ONE concrete detail: a number, a timeframe, a social detail, or a
tangible object. Prefer two when credible. Concepts that stay abstract ("it works," "I feel
better," "changed my life") without a single anchoring detail fail this check.
- PASS: "5 months," "400+ bioactives," "my third jar," "3 people asked me," "$2/day"
- FAIL: "it works," "I love it," "changed everything," "totally different now"

**Check 12 — Unpaid-post filter (from a social-growth tool feedback).**
For each concept, ask: **"Would a real person post this on their own feed without being paid?"**
If the answer is clearly no — if the concept reads like something only a brand would commission —
rewrite the hook/vehicle until it passes. The strongest UGC concepts are indistinguishable from
organic content a creator would post because it's genuinely interesting, funny, or relatable to
them personally. If the concept only makes sense as an ad, it will perform like an ad.

**Check 13 — Pain depth (from a social-growth tool feedback).**
Scan for shallow pain framing. If the concept starts with a broad category ("gut health," "immune
support," "hair growth," "convenience") instead of a specific human moment, push one level deeper:
- Shallow: "I wanted better gut health" → Deep: "I was unbuttoning my jeans under the table at
  every dinner"
- Shallow: "I wanted immune support" → Deep: "My kid brought home 6 colds this year and I caught 4"
- Shallow: "I wanted convenience" → Deep: "My morning supplement routine took longer than making
  breakfast"
The observation should be specific enough that the viewer says "that's me" — not just "that's a
category I care about."

**Check 14 — "Select, don't rescue" final gate (from telehealth-account feedback).**
Read each concept one final time and ask: **"Would a creative director put a check beside this
and move directly into refinement — or would she think 'there's something here I could rewrite'?"**
If the concept needs rewriting to become good, it's not ready. Kill it and generate something a
CD checks off immediately. The benchmark is selection-ready, not ideation-stage-with-potential.
Also verify:
- Can the client understand the first 3 seconds after reading the slide?
- Can a producer shoot it tomorrow with the information on this slide?
- Can you identify what makes this concept different from every other concept in the batch?
If any answer is no, the concept fails.

**Check 15 — DR spine completeness (v6, from the meal-service account feedback).**
Read each concept's narrative beats and verify the full spine is present: hook → problem →
product introduced FAST → mechanism explained → proof/benefit → price/value (when the brand
allows) → CTA. Failures:
- The setup takes 70–90% of the beats and the product gets one line at the end → FAIL
- The product's mechanism is never made explicit (what it is, how it works) → FAIL
- The ad ends on a clever brand-identity line instead of a payoff/CTA ("At some point you stop
  apologizing for it" is not a conversion argument) → REWORK the ending
- The viewer can't say what the offer is after 30 seconds → FAIL
Fix pattern: keep the vehicle as the HOOK (first 3–5s), then transition quickly into the service/
product: what it is, how it works, what it costs, what to do.

**Check 16 — Dual scoring: thumb-stopping vs. performance-ready (v6).**
Score each concept SEPARATELY on two axes, 1–5 each:
- **Thumb-stop score:** would this stop a scroll in the first 2 seconds? (Intensity, pattern
  interrupt, curiosity gap, visual surprise.)
- **Performance-ready score:** does this convert? (DR spine complete, mechanism explicit,
  conversion density, clear CTA.)
A concept can be highly creative and still weak as a Meta DR ad. Anything scoring ≤2 on either
axis gets killed or reworked. The batch average on BOTH axes must be ≥4. Print both scores per
concept in the review table.

**Check 17 — Intensity check (v6, the principal's 25% rule).**
For each concept ask: **"What about this grabs your interest?"** and **"Is this worth pulling out
a phone to capture?"** A compliment, a quiet observation, a calm moment — not worth a video. An
accusation, a confrontation, being caught, a secret exposed, something surprising happening in
frame — worth a video. If the honest answer to "what grabs interest" is weak, turn the observation
up 25%: compliment → accusation ("my nail tech thought I was cheating on her"), quiet mirror moment
→ comedy sketch (the mirror talks back: "who has the healthiest skin of them all... not you"),
solo sneaking a drink → partner caught red-handed ("all guys drink this, we just don't talk about
it"). Same observation, higher voltage.

**Check 18 — Strategy alignment (v6, the Creative Strategist check the principal requested).**
For every concept, verify against the Batch Strategy Map from Step Zero:
- Which business objective does this serve? (Must name one.)
- Which persona is this speaking to? (Must name one — and the scenario must come from that
  persona's actual world: gym guy → gym-adjacent scenario, not a generic kitchen.)
- Which selling argument is this testing? (Must name one — and it must differ from at least
  half the batch.)
If a concept can't answer all three, it was generated from a "relatable moment" unmoored from
strategy — kill it and regenerate from the Strategy Map. This check also verifies the deck's
North Star intro slide exists and accurately lists the objectives/personas/arguments covered.

**After all 18 checks, run a final compliance scan:**
Read the full batch as if you are the BRAND reviewing before production. Flag anything that makes
unqualified medical/health claims, names competitors, uses banned language, shows the product in
unapproved contexts, implies unsubstantiated outcomes, or uses house-style banned words.

**Output format for the Feedback Review Agent:**
After running all checks, produce a summary table:

```
| # | Title | 1-Same | 2-Veh | 3-Own | 4-Tone | 5-Prod | 6-Seas | 7-Trig | 8-Intro | 9-Proof | 10-Out | 11-Spec | 12-Org | 13-Pain | 14-Sel | 15-DR | 16-Scores | 17-Int | 18-Strat | Verdict |
```

Verdicts: **PASS** (survives all 18) · **KILL** (failed 1+ checks, replacement needed) ·
**REWORK** (fixable without full replacement — adjust tone, fix ending, add DR beats, fix
seasonality).

Kill list → generate replacements from the Batch Strategy Map, then run replacements
through all 18 checks again. Only a fully-passed batch goes to build.

### 7.6. Compliance & Alignment Review Agent (v6.2 — new, mandatory final gate)

The **Compliance & Alignment Reviewer** is the fifth agent. It runs AFTER the Feedback Review Agent
(the 18 checks) and BEFORE deck build. Where the Feedback Review Agent catches CRAFT problems
(sameness, ownability, feasibility), this agent catches FACTUAL, STRATEGIC, and COMPLIANCE problems
that only surface when the concept batch is checked against the client's actual source-of-truth
documents. It is the pass that catches "the client explicitly asked for Spanish-language testing but
zero concepts do that" and "concept 11 names a 40% discount that isn't the real offer."

**Why this exists.** Real revision pattern from the snack brand's Batch 2 alignment prep (Sept 2026): the
first-pass review deck had five concept names paraphrased incorrectly, mis-counted GLP-1 concepts
(said 0, actually 2), mis-counted college concepts (said 3, actually 1), and recommended adding
things already present. The one gap it caught correctly (Spanish-language / Black-audience testing)
was the ONLY item the client actually needed to hear about. The lesson: concept reviews must be
grounded in the actual source documents, not a paraphrase from memory. The Compliance & Alignment
Reviewer bakes that discipline in — it reads the sources fresh every run.

**Source-of-truth priority order.** The agent reads these in this order and treats later sources
as overriding earlier ones when they conflict:

1. **Brand brain (Supabase `jarvis_brand_brain.brand_brain`).** Living compliance record. Products,
   confirmed offers, dos/don'ts, unauthorized claims, banned language, compliance disclaimers.
   Query: `SELECT client_name, fields FROM jarvis_brand_brain.brand_brain WHERE client_name ILIKE
   '%<brand>%'`. Never skip — this is the highest-authority source for compliance.
2. **Client onboarding deck.** The section titled "Critical information for Batch N" is the direct
   client brief for THIS batch. Casting rules, audiences to test, design rules (AI imagery yes/no,
   product image requirements), scripting rules, format restrictions. This is where the Spanish-
   language and Black-audience testing requirement lives for the snack brand, for example.
3. **Latest meeting notes.** Kickoff notes, bi-weekly meeting transcripts, latest client Slack
   feedback. These carry the client's actual stated priorities — the "GLP-1 is the strongest
   audience" from the client's growth lead on the the snack brand kickoff, or the "swap the generic tubes for the telehealth account's branded
   imagery" note from the the telehealth account's bi-weekly. Query `public.meeting_transcripts WHERE brand_id = ...`
   for what's ingested; supplement from the client's Slack channel and any recent emails the user
   provides.
4. **Previous batch feedback.** What the client said about the last batch shipped. Look for
   direction that carries into this batch: "we need more X," "we've over-indexed on Y," "let's
   test Z next time."

If any of these sources is unavailable (brand brain empty, meeting notes not ingested), the agent
must state that up front — it doesn't fabricate a review from thin air, and it doesn't skip the
step. A shorter, honest review beats a longer, guessed one.

**The five reviews the agent runs.**

**Review 1 — Concept name accuracy audit.**
For every concept in the batch, verify the title and one-line description match the actual concept
as written. If the review is being run on a batch inherited from a previous session (or from a
different agent's memory), re-read the source concept file, don't paraphrase from context. Common
failure mode this catches: a review deck refers to "Bringing My Roommate The Ultimate Girl Dinner
Because It's Crunch Time For Midterms" when the actual concept is "Bringing My Work Bestie The
Ultimate Girl Dinner Because It's Crunch Time At The Office" (the snack brand B2). Every concept name and
one-line summary in the reviewer's output MUST be the exact wording from the source.

**Review 2 — Factual accuracy against brand brain.**
For each concept, extract every factual claim it makes and cross-check against the brand brain:
- Product names: does the concept reference a product that is CONFIRMED in the brand brain, or a
  product marked pending clearance (like "an unreleased product line" or "a pending-clearance cream" — both flagged in
  brand brain as unauthorized)?
- Offer language: does the concept name a discount, price, or bundle mechanic that matches the
  confirmed offer? Is "40% off" authorized for THIS product line, or only for another (the telehealth account: 40%
  off is HRT-confirmed, anti-aging TBD)?
- Compliance disclaimers: does the concept require a disclaimer per brand brain (clinician
  consultation, "Individual results may vary," FTC endorsement)?
- Banned language: does the concept use words the brand has explicitly banned?
- Unauthorized claims: does the concept promise something the brand cannot substantiate?

Every finding is tagged as **HARD FAIL** (concept cannot ship until fixed — e.g., unauthorized
product name, unsubstantiated medical claim) or **SOFT FAIL** (concept needs a caveat added — e.g.,
missing "Individual results may vary" disclaimer).

**Review 3 — Strategic coverage against critical info.**
Read the "Critical information for Batch N" section of the onboarding deck. Enumerate every
audience, persona, product, and testing goal the client named for THIS batch. Then check the
concept batch as a whole:
- If critical info names an audience (e.g., "For Batch 2: Spanish-language and Black-audience
  testing"), how many concepts address it? If zero, that's a **STRATEGIC GAP**.
- If critical info names a product mix requirement (e.g., "don't over-index on waffles"), how does
  the batch distribute?
- If critical info names design rules (e.g., "avoid AI-generated imagery"), scan every concept's
  design components for compliance.

Strategic gaps are reported at the BATCH level, not per concept — the fix is usually to swap one or
two existing concepts for concepts that address the gap, not to fix each concept individually.

**Review 4 — Meeting-notes alignment.**
Read the latest meeting notes. Extract the client's stated priorities — what did they say the
strongest audience is, what did they say converts best, what did they say NOT to do? Then check the
batch coverage:
- Are the strongest audiences named in meetings represented in the batch? (the client's growth lead on the the snack brand kickoff:
  GLP-1 is the strongest audience. If the batch has zero explicit GLP-1 concepts, that's a
  meeting-alignment gap.)
- Is the highest-converting mechanic named in meetings represented? (the client's growth lead on the the snack brand kickoff:
  build-a-bundle is the highest-converting landing page. If only 1 of 22 concepts uses the bundle
  mechanic, that's underweighted.)
- Does the batch avoid what the client said NOT to do? (the client's brand lead on the the snack brand kickoff: don't frame
  as performance nutrition or diet.)

**Review 5 — Previous-batch continuity.**
If a previous batch shipped, check that the client's feedback on it is reflected in this batch. If
the client said "Batch 1 statics used generic AI imagery — use branded imagery in Batch 2," verify
every static concept in this batch respects that. If the client picked 5 of 16 concepts from Batch
1 and all 5 were the tightest-scripted, verify the loglines in this batch are similarly tight.

**Output format for the Compliance & Alignment Reviewer.**

The agent produces a review report with THREE sections:

```
## Section 1 — Factual & Compliance Findings (per concept)

| # | Title (exact) | Finding | Source | Severity | Fix |
|---|---|---|---|---|---|
| 011 | What's In My the snack brand Snack Bundle | Discount stack (15%+10%+15%) not confirmed | brand_brain | HARD FAIL | Verify with client before ship or generalize to "stackable savings" |
| 019 | Family Road Trips Have Never Been More Peaceful | "40% off retail" — is this the real number? | brand_brain | HARD FAIL | Confirm exact discount or reframe |

## Section 2 — Strategic Gaps (batch level)

- **Spanish-language / Black-audience testing** — critical info B2 explicitly names this. Batch has
  0 concepts. Recommend reframing 1–2 existing concepts as Spanish-language variants OR adding a
  new concept before Sept 3 alignment.

## Section 3 — Verdicts

| # | Title | Verdict | Notes |
|---|---|---|---|
| 001 | One Thing That Never Changed While I'm On GLP | PASS | GLP-1 explicit ✓ |
| 011 | What's In My the snack brand Snack Bundle | REWORK | Confirm discount stack before ship |
| ... | | | |
```

Verdicts: **PASS** (no findings) · **REWORK** (SOFT FAIL — fix disclaimer, softening, or specific
copy line) · **KILL** (HARD FAIL — factual/compliance error the concept can't ship with, needs
regeneration from Creative Director).

**Loop back to the Creative Director.**

Every KILL verdict returns to the Creative Director with:
1. The exact concept as it was
2. The finding and its source (brand brain quote, meeting note excerpt, critical info line)
3. The severity
4. The fix direction

The Creative Director regenerates the concept respecting the finding, then the regenerated concept
returns to the Compliance & Alignment Reviewer for a fresh pass. This loop runs until every concept
is PASS or REWORK — no KILL verdicts survive into the deck build.

REWORK verdicts do NOT loop through the CD — the Creative Strategist applies the specific fix
(add disclaimer, adjust copy) and the batch proceeds to build. The distinction matters: KILL means
the concept's premise is wrong; REWORK means the concept's premise is right but a detail needs a
caveat.

**Honest reporting rules.**

The agent must operate under the same discipline that its own creation was born from:
- Every concept name in the report is copy-pasted from the source, never paraphrased.
- Every count (of concepts addressing an audience, using a mechanic, featuring a product) is
  verified by naming the concept numbers, not asserted from memory.
- Every claim the report makes about the source ("brand brain says X," "critical info says Y") is
  quoted, not summarized.
- When a source is unavailable, the report states which review it couldn't run, and why, before
  presenting findings from the reviews it could run.
- When a review turns up nothing, the report says so — "Review 2 (factual accuracy) surfaced no
  findings; brand brain and concept claims align" is a valid and honest section.

The Compliance & Alignment Reviewer is the last gate before a deck goes to a client. If it does
its job, factual errors, compliance violations, and named strategic gaps never reach the client's
inbox. If it hallucinates, the whole skill loses credibility. Honesty over completeness.

### 8. Build the deck
Write the config JSON (`references/config-example.json` for shape) and run `scripts/build_deck.js`.
Numbering continues the brand's library. **Accent is always `7A3FF2` — never the brand's own hex.**

**North Star intro slide (v6 — mandatory).** The deck's second slide (after the cover) is the
Batch Strategy Map: the business objectives this batch serves, the target personas it speaks to,
and the selling arguments it tests — with the concept number ranges mapped to each. A reviewer
opening the deck cold must understand the strategy before seeing a single concept. Sections of the
deck are organized by objective/persona, not thrown together.

**Per-slide strategy tags (v6).** Every concept slide carries its persona and selling argument in
the footer tags alongside awareness stage and production lane (e.g., "Bodybuilder · Mechanism ·
Problem Aware · Creator UGC · 2-talent").

### 9. QA render & present
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
  "HRT Dating Profile" ✓ · "Bank Account Is Confused" ✓ · "Vacation Countdown" ✓ ·
  "I Became My Own Doctor" ✗ (it's a line, not a vehicle).
- **Description — what we're making, not why it works.** 2-3 sentences of plain, 5th-grade language.
  Say: **the creator format, the at-home situation/scene, the one core message, and how the brand
  fits in.** Do NOT explain the strategy ("positions...", "reframes...", "dramatises..."). The client
  should understand the whole idea after reading it once.

  **Casual pitch tone (v5).** Descriptions and loglines should read like you're telling a friend
  about the ad over coffee — not like you're analyzing it in a strategy deck. Tell the STORY of
  what happens on screen. Ban any sentence that explains WHY the concept works or names the
  persuasion device:
  - ✗ "The simplicity of the label IS the ad."
  - ✗ "The social friction of explaining colostrum IS the content."
  - ✗ "The reorder compulsion IS the proof."
  - ✗ "The visual reduction is the argument."
  - ✗ "The [X] IS the [Y]" — any sentence with this construction.
  - ✗ "The concept sells..." / "The concept never mentions..." / "The concept vends..."
  - ✗ "Primary message:" tags or explicit selling-message labels.
  - ✓ "She flips the jar around, reads the back — one ingredient. That's it. She puts it down."
  - ✓ "She tries to explain colostrum to her Uber driver and it goes exactly how you'd expect."
  - ✓ "Quick cuts through 4 months of one scoop a day — she doesn't explain anything, just shows
    what changed."

  The rule: if the sentence is about the CONCEPT rather than about what HAPPENS ON SCREEN, delete
  it. A good description is a mini-story. A bad description is a strategy note.
- **Narrative — EXACTLY 3 action-based bullets (v6).** Short, visual, producer-ready. Compress
  multiple beats into each bullet when needed. The three bullets accomplish: (1) establish the
  situation/problem/curiosity/premise, (2) introduce the product/mechanism/proof/benefit, (3)
  deliver the payoff and transition toward the CTA. Use action verbs: "Open with...", "Cut to...",
  "Show...", "Close with...". Vary how the product enters and how the concept ends across the
  batch — no template. **The narrative must be hook-independent** — it works with any of the three
  hook variants.
- **Design Components — EXACTLY 3 bullets (v6).** The three most important production/editing
  choices for THIS concept: one visual/editing direction, one caption/design direction, one style/
  production/duration direction. Skip UGC boilerplate. Every device listed must already appear in
  the description or narrative — never parachute in.
- **Hooks — EXACTLY 3 variants (v6, new section on every slide).** Each hook is a spoken opening
  line and/or on-screen overlay. The three variants explore meaningfully different angles into the
  same concept — not the same sentence reworded. Hooks are interchangeable: the concept works with
  any of them. They must sound natural, be understood immediately, and make the target persona
  want to keep watching. Hooks live on the slide now (this supersedes the old hooks-only-on-image-
  prompts rule).
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

## Five-agent pipeline summary

The skill runs five agents in sequence. Nothing is built until all five pass.

1. **Strategic Analyst (v6, the agency principal's "Step Zero")** — reads the marketing report BEFORE any
   ideation and produces the Batch Strategy Map: business objectives × target personas × selling
   arguments, with concept allocation across them. Prints as the deck's North Star intro slide.
   Uses question-led brainstorming: Who is this for? What's the goal? What do we want them to know?
   How do we enter their world?
2. **Creative Director** — takes each assigned objective × persona × selling argument, harvests
   observations from that persona's world, makes creative leaps into vehicles-as-hooks, builds the
   DR spine underneath. Applies the 25%-intensity rule.
3. **Creative Strategist** — reviews every concept against the craft scorecard. Kills bad craft.
4. **Feedback Review Agent** — replays **18 revision checks** distilled from real producer feedback
   across the parenting app, a social-growth tool, a social-growth tool, the telehealth account, the colostrum brand, the meal-service account, and the agency principal's reviews:
   1. Batch sameness scan (the colostrum brand: "these all feel the same")
   1b. Copy repetition scan (the colostrum brand: same claims in every concept = one ad in different outfits)
   2. Vehicle library cross-check (the colostrum brand: "look into the vehicle library")
   3. Ownability test (a social-growth tool: "could a competitor run this?")
   4. Brand-tone calibration (the colostrum brand: "review the concept deck and see the examples")
   5. Production feasibility (solo/at-home DEFAULT, 2-talent and location shoots allowed with tags)
   6. Seasonal + contextual audit (the colostrum brand: "thanksgiving is far from today")
   7. Believable trigger (a social-growth tool: "why is this person showing me this right now?")
   8. Product introduction variety (a social-growth tool: don't repeat "That's where X came in")
   9. Proof closes the argument (a social-growth tool: proof must match the narrative promise)
   10. Outcome ladder spread (a social-growth tool: don't end every concept with the same result)
   11. Specificity rule (a social-growth tool: one number, timeframe, or tangible detail per concept)
   12. Unpaid-post filter (a social-growth tool: "would someone post this without being paid?")
   13. Pain depth (a social-growth tool: push one level deeper than the broad benefit)
   14. "Select, don't rescue" gate (the telehealth account: "would a CD check this off immediately?")
   15. DR spine completeness (the meal-service account: hook → problem → product FAST → mechanism →
       proof → price → CTA; don't end when the selling should start)
   16. Dual scoring (the meal-service account: thumb-stopping and performance-ready scored separately)
   17. Intensity check (the principal: 25% more intense than real life; "what grabs your interest?")
   18. Strategy alignment (the principal: every concept names its objective, persona, and selling argument
       from the Batch Strategy Map)

   Sources: the `AI Concepting Engine Feedback` Notion page, the the meal-service account Deck 1 DR
   feedback, and the Eric × Ricardo AI Connect meeting (Aug 25, 2026) — real revision patterns
   from produced batches, not theoretical rules.
5. **Compliance & Alignment Reviewer (v6.2, new)** — the final gate before build. Re-reads the
   client's actual source-of-truth documents in priority order (brand brain in Supabase, batch
   critical info from onboarding, latest meeting notes, previous batch feedback) and runs five
   reviews against the concept batch: (1) concept name accuracy — every title copy-pasted from
   source, never paraphrased; (2) factual accuracy against brand brain — product names, offers,
   prices, banned language, unauthorized claims; (3) strategic coverage against critical info —
   audiences named for testing, product-mix requirements, design rules; (4) meeting-notes alignment
   — strongest audiences, highest-converting mechanics, "do not do" list; (5) previous-batch
   continuity — client feedback from last batch reflected in this one. Every finding cites its
   source. KILL verdicts loop back to the Creative Director for regeneration; REWORK verdicts get a
   copy fix from the Creative Strategist; PASS verdicts proceed to build. Born from the the snack brand
   Batch 2 alignment prep, where the first-pass review had 5 concept names paraphrased incorrectly
   and mis-counted the strategic mix — the correct gap it caught (Spanish-language / Black-audience
   testing) was overshadowed by errors that would have broken the deck's credibility.

## Reference files
- `references/craft-rules.md` — the full craft: title rules, description rules, narrative rules,
  design rules, one-persuasion-job, five-dimension diversity, sound-off test, worked examples.
- `references/creative-strategist.md` — reviewer role, scorecard, verdicts, change log.
- `references/libraries.md` — living libraries: **human observation prompts (the harvest bank),
  vehicles, tensions, native formats, proof behaviors, hook modes, outcome ladder.** Extend when
  research surfaces new patterns.
- `references/image-prompts.md` — UGC image-gen prompts for the 9:16 stills.
- `references/config-example.json` — minimal valid config.
