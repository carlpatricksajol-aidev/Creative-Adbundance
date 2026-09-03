# Living libraries

Raw material for ideation. These are STARTING sets — extend them whenever research or feedback
surfaces new patterns (that's the point of keeping them in a file).

The order matters: **observation → vehicle → tension → format → proof behavior → hook mode →
outcome ladder**. The concept is built forward through the libraries, not backward from a benefit.

---

## 1. Human observation harvest bank (START HERE)

Before writing any concept, mine 15-20 specific human observations for the ICP. These are the raw
material — not benefits, not angles, not strategy insights. **A behavior, thought, situation,
conversation, or internet habit someone would recognize in one second.**

The bad-vs-good pattern:
- Bad: "mental load." → Good: "standing in front of the fridge trying to remember what I need to
  do tomorrow."
- Bad: "affordability." → Good: "checked my bank account after the pharmacy, then again to make
  sure the number was right."
- Bad: "convenience." → Good: "vacation in seven days and just realized I'm out."
- Bad: "personalization." → Good: "if HRT providers had dating profiles..."

### Prompts to run when harvesting

**Physical moments**
- Standing in front of the fridge / medicine cabinet / closet
- The 2 A.M. moment (wake up, phone in hand, what do they check?)
- The 6 A.M. moment (alarm, first thoughts)
- The 3 P.M. slump / school-pickup moment
- The Sunday-night scroll
- Waiting at a red light thinking about something
- Sitting in a parked car after an appointment
- On the couch with the TV on, not really watching

**Conversations they'd have or overhear**
- What did the pediatrician / doctor / OB / lawyer / accountant just ask them?
- What did their mom / sister / best friend / neighbor say last week?
- What's the last text they got from their partner?
- What did their skeptical friend accuse them of?
- What's the group chat blowing up about?
- What did they overhear at the coffee shop?
- What did their kid ask them that they couldn't answer?
- What did they lie about to seem more together?

**Internet + phone behaviors**
- Their search history at 3 A.M.
- Their bank account after the drugstore
- Their camera roll (what photo did they stop on?)
- Their dating app / e-commerce browsing pattern
- Their Instagram scroll (who are they comparing themselves to?)
- The group chat sending the same TikTok around
- The pinned comment on a video that made them stop
- The Notes app open on their phone
- The DoorDash tab still open
- The Amazon cart with 12 things in it
- The "leave your job on read" moment
- The subscription they forgot they had

**Trend-shape behaviors**
- "Put a finger down if..."
- "Toxic trait: I..."
- "Green flags of..."
- "Did you know..."
- "Rating [x] as someone who..."
- "Things nobody warned me about..."
- "Ranking my [x] from worst to best"
- "POV: you're the [x]"
- "Reasons I left [x] (a list)"
- "The [x] that made me [y]"

**"That's me" cultural moments**
- Being called out by their partner for X
- Realizing they're becoming their mother
- Explaining themselves to a boomer relative
- The moment they signed up for something at 11:47 P.M.
- The moment they cancelled a plan
- The moment they said "I'll figure it out later"
- The moment they Googled a symptom
- The moment they screenshotted something

Extend this list per brand — each brand's ICP has its own recognizable moments. The harvest is
the raw material; skip it and every concept degrades.

---

## 2. Vehicle library (the creative leap) — LIVE FROM DB

A vehicle IS the ad. Assign one per concept. Never write a concept without a specific vehicle.

**Data source: `knowledge_vehicle_bank` (229 rows and growing).** Load it at the start of the
Creative Director pass. Primary transport is the **Supabase MCP** — call `Supabase:execute_sql`
with `project_id="xakngjsybyytldyqfsmi"` and the SQL in SKILL.md's Step 6. Local alternative:

```bash
node scripts/fetch-vehicles.js --format md
```

Rows are ordered by `proven_count DESC` — vehicles with the most approved concepts behind them
float to the top. Prefer proven vehicles for the DR spine. When a new native format starts working
and hasn't been added yet, flag it: it belongs in the bank, not in this file.

### How to read the bank (usage guidance, not data)

- **`proven_by` length is the strength signal.** A vehicle with `proven_count=7` has been picked by
  clients seven times — that's not a coincidence, it's the closest thing to a track record we have.
- **`mechanic_summary` + `hook_strategy` are the actual "how it works."** Read these before the
  description. They tell you what the vehicle does structurally and how the first 3 seconds land.
- **`origin='client_proven'` beats `origin='handpicked'`** for the same proven count. Client-proven
  means the vehicle emerged from an approved batch; handpicked means we seeded it in the bank.
- **`needs_review=true` vehicles are excluded by default.** Rerun with `--include-review` when
  auditing the bank.

### Category cautions (survives the DB — these are craft rules, not data)

- **Empty-bottle / "graveyard" reveals are category-worn in skincare/anti-aging.** Every brand runs
  the serum drawer. Fine elsewhere; in skincare, needs a hard twist or a different vehicle entirely.
- **"I tried this so you don't have to"** frames the brand as arguing against trial — kills DR
  performance. Reframe to enthusiasm ("After I tried it, I can't stop talking about it").
- **Solo-woman-with-phone saturation** — solo talking-head batches read flat and cast identically.
  If more than ~40% of the batch is a solo woman on her phone, force some second-character
  dynamics (see section 2c) or physical/environmental vehicles.

### Rule
If the concept doesn't have a specific vehicle from the bank (or a genuinely novel one flagged for
addition), it's not a concept — it's an angle. Reject it.

---

## 2b. Trend-template library — LIVE FROM DB

Cultural templates the viewer recognizes in one frame. The brand's message rides inside — never a
"trend bucket" at the end of the deck.

**Data source: `knowledge_researched_vehicles` (107 rows, refreshes per catalog edition).** Load it
alongside the proven bank. Primary transport is the **Supabase MCP** (SQL in SKILL.md's Step 6).
Local alternative:

```bash
node scripts/fetch-trend-vehicles.js --format md
node scripts/fetch-trend-vehicles.js --platform meta --cohort rising --format md
```

Rising cohort surfaces first, then established. The default filter is `status='active'`; dormant
formats (three months without re-observation) are hidden until you pass `--include-dormant`.

### Two confidence vocabularies — never conflate them

Every row has an `evidence_basis` that decides which vocabulary the `confidence` field uses:
- **`observed`** (from our own scraped-ad corpus, has `advertiser_count`): `thin` (1–2 brands),
  `reported` (3–4), `strong` (5+).
- **`trend_research`** (from published trend reporting with named sources, no advertiser count):
  `trend-thin` (one weak source), `trend-reported` (a named published source), `trend-verified`
  (corroborated across independent sources).

A `trend-*` row makes ZERO claim about how many brands actually run the format. Mixing the two
vocabularies is how the catalog produced the false "50 formats backed by 3+ brands" claim on
2026-08-14 — don't repeat it.

### When to borrow a trend vehicle

Use one when the batch needs freshness or the target persona spends time in the trend's platform
neighborhood. Never present a trend vehicle as proven, and never place its evidence claim in the
concept's language on the slide. Reference-only inside the deck's rationale/backchannel notes.

---

## 2c. Second-character dynamics (2–3 per batch)

Solo-woman-with-phone batches read flat and cast identically. Dynamics that survived client
finalization:

- **Partner POV** — husband/partner narrates their exaggerated perception of her situation
  (comedy framed as perception, never literal effect)
- **Parent/child dual routine** — daughter recommends to mom; parallel goals ("MY SKIN GOALS" vs.
  "MOM'S SKIN GOALS"), different prescriptions, one ritual
- **Roommate/friend discovery** — the package on the counter, the friend who's already two months
  in, the call-out mid-confession
- **Product personified** — the pack/tube/app as a character: interviewed, reviewed, thanked,
  fired
- **Group dynamic** — the group chat, the girls' trip, the street interview
- **Expert two-hander** — creator + clinician/pharmacist answering the comment section

---

## 2d. Stat-treatment library (research numbers → screen)

If the research docs carry proof numbers, 2–3 concepts per batch must use them. Ways numbers
become visual concepts, not overlay decoration:

- **Icon wall** — "Imagine 100 women..." 100 icons fill the screen, ~95 light up in brand color
  (94.6% became this in the finals)
- **Wrapped stat cards** — joke stats build rhythm, the real clinical stat lands as the flip
- **Stat-bearing title** — the number IS the hook: "Under $40/Month," "100 Women Tried It,"
  "94.6% Saw a Difference"
- **Receipt/price-tag ladder** — costs stack item by item until the brand's price undercuts
- **Countdown/count-up** — "16 weeks" as an on-screen timeline the creator walks through
- **Comparison bar** — "up to 20X stronger" drawn as a physical or graphic scale
- Footnote rule: clinical-study citations appear small but legible wherever the stat is on screen

---

## 3. Tension library (build the trigger)

Generate from a tension BEFORE product messaging. The tension provides the trigger — the reason
this person is showing the audience this thing right now.

- **Disbelief** ("no way that's real")
- **Accusation** ("you bought those, right?")
- **Embarrassment** (hiding the pill pack from a partner, dodging the OB's question)
- **Jealousy / comparison** (a friend blew past you, a sibling has it easier)
- **Curiosity** (found video, paused laptop, "watch this")
- **Aspiration** (the older-sister-you-want-to-be voice)
- **Social validation** (a friend asks how you did it)
- **Peer pressure** ("everyone in the group chat is doing this")
- **Opportunity / stakes** (vacation in 7 days, wedding on Saturday, launch date)
- **FOMO** (season/trend is now)
- **Fear** (running out, missing a dose, the wrong doctor)
- **Pride** (finally showing it off, "look what I did")
- **Relief** (one job handled, one worry off the pile)
- **Being called out** (comment forces a reveal, partner asks a direct question)
- **Buyer's remorse** (three empty serums in the drawer, the copay math)
- **Nostalgia flip** (my mom did this the hard way; I don't have to)

---

## 4. Native-format library (still useful for classification)

Once a vehicle is picked, the concept usually maps to one of these formats — used for the batch
diversity check, not for ideation.

Talking Head · GRWM / get-ready-with-me · POV · Lifestyle B-roll VO · Comment-Box Reply ·
Greenscreen React · FaceTime / Phone Call · Two-Hander Skit · Same-Person Skit · Text-Thread
Reveal · Voice-Note Answer · Paused-Laptop Aside · Street Interview · 30-Day Experiment /
Diary · Scan/Score Reveal (brand's real tool) · Beat-Cut Montage · Mini-Doc · Mock TV Ad ·
Mock Infomercial · Ranking Video · Reaction to Own Old Post · Reply-to-@Username · Split-Screen
Comparison · Same-Person Before/After · Documentary Confessional · Static Card List · Product-
as-Character.

Weight per brand's performance data. Untested formats run as small controlled tests.

---

## 5. Proof-behavior library (how proof MOVES, not what it is)

Every concept needs proof that *does something*, not proof that just sits in the frame.

- **Send it** (screenshot on a call)
- **Swipe it** (before/after)
- **Compare it** (side by side, two phones)
- **React to it** (reading real comments aloud)
- **Expose it** (skeptic grabs the phone)
- **Overlay it** (profile card on lifestyle)
- **Replay it** (re-run the scan / audit)
- **Scroll it** (audience quality on screen)
- **Receive it** (inquiry lands mid-video)
- **Print it** (orders/receipts stacking)
- **Book it** (calendar filling on camera)
- **Walk in** ("I found you online")
- **Deliver it** (package on the mat, unboxed on camera)
- **Screenshot it** (proof sent to a group chat)
- **Discard it** (empty bottles into the trash)
- **Match it** (side-by-side same-ingredient panel)

---

## 6. Hook-mode library (TikTok-native)

Check per-brand performance data before using modes that tested poorly.

- Persona callout ("if you're a ___ and ___")
- Pain object ("your profile has the offer... but not the proof")
- Hot take ("a launch without an audience is just a post")
- Unpopular opinion
- "Be honest…"
- Comment response
- POV framing
- "Nobody warns you about ___"
- Found-secret ("watch this before you launch")
- Call-out received ("someone said my growth is fake, so...")
- Confession ("I did everything the algorithm wanted")
- "Did you know..."
- "Put a finger down if..."
- "Toxic trait:"
- "Green flags of..."
- Ranking mid-hook ("worst to best")
- "This is your sign to..."

---

## 7. Outcome ladder (spread payoffs across it)

Every concept ends somewhere on this ladder. The batch spreads across all rungs — never all
concepts ending on the same rung.

Awareness reach → relevant audience (right people, right place) → real engagement (comments that
mean it) → discovery event (search, save, screenshot) → consideration (added to cart, provider
message, quiz taken) → conversion (booking, order, delivery, prescription) → identity payoff
(creator confidence, credibility, status, time back, "I did it," "I'm the woman who...").

Count-based payoffs (follower count, subscriber count, delivery-box count) are ONE rung, not the
ladder.

---

## 8. Persuasion-job library (one per concept)

Every concept picks ONE. Never five per concept.

Price · Personalization · Convenience · Speed · Symptom relief · Trust · Options · Safety ·
Effectiveness · Continuity · Guarantee · Time-savings · Expertise · Discretion · Access · Choice
· Onboarding ease · Retention benefit · Community · Discovery · Category legitimacy · Ownable
mechanism.

If the concept persuades on three, it persuades on none. The other benefits get their own
concepts.
