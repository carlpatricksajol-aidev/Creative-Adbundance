# Production Plan Format (Phase 3)

The production plan is the last artifact in the batch package and the only one
a producer works from on the day. It answers four questions and nothing else:
who shoots what, where, in what order, and what has to exist before anyone
picks up a camera.

It is derived, not invented. Every concept in it comes from the approved
storyboards. Every shot note in it comes from the approved shooting guide. If
the plan says something the guide does not, the plan is wrong.

Read this whole file before the first Notion write of Phase 3.

## Reader model

Two people read this page: the producer, who works from the unit blocks and
the pre-production checklist, and the client, who reads the Production
Overview and the "client to confirm" flags and skims the rest.

Write for both. No internal jargon left undefined, no strategy language, no
rationale for the creative. If a line does not help someone book, buy, shoot,
or approve something, cut it.

## Page shape at a glance

Blocks in this exact order:

1. Page title (H1 is the Notion page title, not a heading block).
2. Two callouts: shoot window, and the source links (storyboards + shooting
   guide + scripts doc).
3. `## Production Overview` with four labelled lines: Window, Product lines,
   Delivery format, Compliance.
4. One `## <Unit Name>` block per shoot unit, in the fixed unit order below.
5. `## Pre-Production Checklist` with three `###` groups.
6. `## Coverage Reconciliation` with the concept-to-unit table and the counts.

Nothing else. No "Notes" dumping ground, no appendix. Anything that does not
fit one of those six blocks belongs in the shooting guide instead.

## Notion markdown rules for this page

These are mechanical and they break the page when ignored.

- **Real newlines.** Pass actual line breaks in the markdown string to
  notion-create-pages / notion-update-page. A JSON-escaped backslash-n is
  stored as the literal letter n and destroys the whole page.
- **Three heading levels only.** Notion has H1, H2, H3. The page title is the
  H1. Units are `##`. Sub-blocks inside a unit are `###`. There is no H4, so
  b-roll category headers are **bold paragraph lines**, not `####`.
- **Checklists** are `- [ ] item`. Never use plain bullets for anything a
  human ticks off on the day. Concepts and b-roll items and every
  pre-production line are all checkboxes.
- **Setup notes nest** under their checklist item as a bullet indented by
  four spaces. If a nested write does not render as a child, fall back to
  appending the note to the same line after ` | Setup: `.
- **Callouts** are `> [!NOTE]` style blocks. Keep each to two lines maximum.
- **Placeholders are visible and greppable.** Literal `TBD` inside URLs
  (`https://www.dropbox.com/request/TBD`) and inside callout text
  (`Due date: TBD, 48 hours after receiving products`). Every `TBD` on the
  page gets listed in the delivery message. Never invent a value to dodge a
  TBD: if the window, the talent name, or the delivery date is likely known,
  that question belonged in Phase 0, so ask rather than guess.
- **Approval retries.** If a write returns "No approval received", retry once.
  If the retry fails, stop issuing separate writes and consolidate the
  remaining page content into one call so the user approves a single time.

## Block 3: Production Overview

Exactly four lines, each a bold label followed by a colon. No paragraph prose
above or below it.

```
## Production Overview

**Window:** Mon 14 to Fri 18 (5 shoot days), post through the following Wed
**Product lines:** [Product Line A] (3 SKUs), [Product Line B] (2 SKUs)
**Delivery format:** 9:16 vertical primary, 1:1 crops on request, raw + graded
**Compliance:** No health claims on camera, no competitor packaging in frame, sealed product only in hero shots
```

Rules per line:

- **Window** gives real weekdays, a count of shoot days, and the post tail. If
  it is not locked, write `Window: TBD, pending talent confirmation` and flag
  it in the checklist.
- **Product lines** names each line and its SKU count, so the producer knows
  how many physical units to ship. Never write "all products".
- **Delivery format** states aspect ratio, secondary crops, and whether raws
  are delivered. This is the line clients dispute later, so be exact.
- **Compliance** is copied from the shooting guide's General Guidelines, not
  re-summarised. Three to five hard rules, each phrased as a prohibition or a
  requirement, so a creator can self-check on set.

## Block 4: Shoot units

### Unit names

Use these names verbatim. They are the vocabulary the producer already uses,
and renaming them breaks cross-referencing with the shooting guide.

- `Founder Shoot Day` for anything filmed with the client's founder or named
  in-house talent, on a booked day, usually with a crew.
- `Remote Segment A`, `Remote Segment B`, `Remote Segment C`, and onward, for
  each remote creator or creator pair filming on their own phone in their own
  space. One letter per creator or per pair, assigned in the order the
  segments appear in the shooting guide.
- `Post-Only AI + Facility` for concepts with no live human shoot day:
  fully-AI concepts, screen recordings, CCTV or security-cam style pieces,
  stock-and-graphics assemblies, and anything shot at a rented facility by a
  third party.

If a batch needs a unit that none of those three names covers, do not invent a
fourth name silently. Ask the user in one sentence and use their answer.

### Unit order on the page

Founder Shoot Day first, then Remote Segments in letter order, then
Post-Only AI + Facility last. This ordering is deliberate: the founder day is
the hardest to move, remote segments schedule around it, and post-only work
has no calendar dependency.

### Unit block shape

Each unit is one `##` heading, one meta line, a `### Concepts` checklist, and a
`### B-roll` block.

```
## Remote Segment A

**Talent:** [Creator name or TBD] | **Location:** own home, kitchen + bathroom | **Type:** remote creator, phone | **Concepts:** 4 | **Est. shoot time:** half day

### Concepts

- [ ] 004 Morning Countertop Routine [Talking Head]
    - Setup: kitchen counter, product in frame at arm's length, window light from camera left, phone on a short tripod at chest height
- [ ] 007 Two Weeks In [Talking Head] [CU]
    - Setup: same counter, wardrobe change to signal a time jump, one insert of the label held to camera

### B-roll

**House kitchen**

- [ ] Pouring the serve into a glass, no hands in frame at the top [CU]
- [ ] Walking into the kitchen and reaching for the box on the shelf [3rd POV]
```

Rules per unit:

- The meta line uses pipe separators and bold labels. Five fields, always in
  this order: Talent, Location, Type, Concepts, Est. shoot time. Unknown
  talent is `TBD` on the page and a flagged checklist item, never blank.
- `Concepts` in the meta line is a count and must equal the number of
  checklist items in the `### Concepts` list. If those two numbers disagree,
  the page is broken.
- Each concept checklist item is `- [ ] <zero-padded number> <Title>` plus its
  POV or shot tags. The number is the storyboard concept number, zero-padded
  to three digits, and `001` is the same concept as `1` in the scripts doc.
- Each concept has exactly one setup note, nested, one line, under 25 words.
  It states location, framing, light, and rig. It is not a restatement of the
  creative, and it never repeats the script line.
- Concepts inside a unit are ordered to minimise resets: same location
  together, same wardrobe together, hardest setup first while everyone is
  fresh.

## Block 4b: B-roll blocks and the emoji convention

Every unit gets a `### B-roll` block. Inside it, b-roll is grouped by content
category, and each category header is a bold paragraph line that starts with
one emoji.

### The convention

| Category | Emoji | Use it for |
| --- | --- | --- |
| House kitchen | 🏠 | Counters, fridge, cupboards, pantry, sink, anything shot inside a home kitchen |
| Pain state | 🤒 | Before-state footage: fatigue, bloating, discomfort, slumped posture, dim rooms |
| Positive / outdoors | 🌞 | After-state and lifestyle upside: daylight, walks, parks, laughing, energy |
| Travel | ✈️ | Airports, packing, hotel rooms, car trips, anything with a bag in frame |
| Gym | 🏋️ | Training, warm-ups, locker room, post-workout, mats and racks |
| Drink ritual | 🥤 | Making and consuming the serve: scoop, pour, stir, sip, glass and can handling |
| Screen recording | 📱 | Phone or desktop capture: app flows, reviews, checkout, DMs, comment sections |
| CCTV / security cam | 📹 | Fixed high-angle, timestamped or low-fidelity surveillance-style plates |

### The rules

- **The emoji must match the content of the block.** A block of countertop
  pours is 🏠 or 🥤 depending on whether the block is about the room or the
  ritual; it is never ✈️ because the trip concept happens to be nearby.
- **Do not reuse one emoji for unrelated blocks.** Two blocks in the same unit
  may not share an emoji. If two blocks would honestly share one, they are one
  block and should be merged.
- **One emoji per header, at the start, followed by the plain-language label.**
  No emoji inside item text. No second decorative emoji.
- **Do not use 🎨 for CCTV or security-cam plates.** It appears in older plans
  and it fails the match rule: a paint palette says nothing about
  surveillance footage. Use 📹.
- **New categories are allowed** when the batch genuinely needs one (office,
  pet, bathroom, retail shelf). Pick an emoji that a stranger would map back
  to the label without being told, and keep it consistent across every unit on
  the page.
- **Empty categories are deleted, not left in.** A unit with no travel
  footage has no ✈️ block.

## Block 4c: POV and shot tags

Every b-roll item and every concept item carries at least one tag, in square
brackets, at the end of the line. Tags are uppercase, in the fixed spellings
below, and multiple tags are space-separated in the order given here.

- `[3rd POV]` The camera observes the subject from outside, a person visible in
  frame doing the thing. Default for any lifestyle or pain-state plate where a
  body reads on screen. If a shot shows a face or a full figure, it is
  `[3rd POV]`.
- `[1st POV]` The camera is the subject's eyes: phone or action cam at head or
  chest height, own hands entering frame from the bottom. Use it for tasks the
  viewer should feel they are doing, such as unscrewing a lid, scooping,
  typing, opening a package.
- `[CU]` Close-up. The frame is filled by one object or detail: label,
  texture, scoop, mouth, hands on the can, powder hitting water. Combine
  freely with an angle tag, for example `[1st POV] [CU]`.
- `[Talking Head]` A person speaks scripted or paraphrased lines to camera
  with usable audio. If an item has a script line in the storyboard, it is
  `[Talking Head]`. Silent plates never get this tag.
- `[SR]` Screen recording, captured from a device screen rather than a camera.
  Always paired with the 📱 category and always accompanied by a note on what
  must be visible on screen and what must be scrubbed of personal data.

Tag hygiene:

- An item with no tag is a defect. Tag it or delete it.
- `[Talking Head]` and `[SR]` are mutually exclusive on the same item. Split
  them into two items if a concept needs both.
- Do not invent tags. If a shot needs a direction the tags cannot express
  (slow motion, handheld whip, tripod lock-off), that direction lives in the
  shooting guide's Framing bullet, not as a new tag here.

## Worked example: one full shoot unit

The following is the complete markdown for a single unit block, with generic
product names. Copy this shape.

```
## Founder Shoot Day

**Talent:** founder plus one in-house team member | **Location:** studio A, then the shared kitchen on floor 2 | **Type:** founder shoot, crew of 3 | **Concepts:** 5 | **Est. shoot time:** full day, 9am call

### Concepts

- [ ] 001 Why We Reformulated [Talking Head]
    - Setup: studio A, seamless grey, founder seated, key light camera left, lav plus boom
- [ ] 002 Founder Answers The One Star Review [Talking Head] [SR]
    - Setup: same studio setup, review pulled up on a phone for a separate screen capture
- [ ] 003 What Is Actually In The Box [Talking Head] [CU]
    - Setup: studio table top, sealed box, top-down rig for the inserts, hands only in the CU pass
- [ ] 006 Shelf Test [3rd POV]
    - Setup: kitchen on floor 2, product on the counter beside two blank competitor containers, no branding visible
- [ ] 009 Ninety Second Explainer [Talking Head]
    - Setup: studio A, standing, whiteboard out of focus behind, wardrobe change from concept 001

### B-roll

**House kitchen**

- [ ] Opening the cupboard and taking the box down [1st POV]
- [ ] Box sitting on the counter, morning light moving across the label [CU]
- [ ] Founder crossing the kitchen and setting a glass down [3rd POV]

**Drink ritual**

- [ ] Scoop lifted out of the tub, powder catching light [1st POV] [CU]
- [ ] Powder hitting water in a clear glass, shot at 120fps [CU]
- [ ] First sip, glass lowered, small nod [3rd POV]

**Screen recording**

- [ ] Subscription page: change delivery date, then skip a month [SR]
- [ ] The one star review scrolled slowly, reviewer name and photo blurred [SR]

**Positive / outdoors**

- [ ] Walking out the front door with the glass still in hand [3rd POV]
- [ ] Wide of the street, glass raised into the light [3rd POV]
```

Note what the example does not do: it does not explain why any concept exists,
it does not restate script lines, it does not repeat the same emoji twice, and
every single line is tickable.

## Block 5: Pre-Production Checklist

One `##` heading, three `###` groups, in this order. Every line is a checkbox.
Every line that requires the client to answer or supply something is suffixed
with the literal flag `(client to confirm)`.

```
## Pre-Production Checklist

### Product & Assets

- [ ] Confirm final SKU list and quantity per unit (client to confirm)
- [ ] Ship product to each remote creator, tracking numbers logged (client to confirm)
- [ ] Sealed units reserved for hero and unboxing shots, not opened in prep
- [ ] Brand font files and logo lockups received for post overlays (client to confirm)
- [ ] Approved claim language and disclaimer wording in hand (client to confirm)
- [ ] Competitor-facing shots cleared: blank containers sourced, no third-party labels

### Talent & Scheduling

- [ ] Founder shoot day locked with a call time (client to confirm)
- [ ] Remote creators cast and booked, one per segment
- [ ] Signed usage and release for every person on camera (client to confirm)
- [ ] Wardrobe brief sent per segment, matched to the shooting guide
- [ ] Location access confirmed for the founder day, including the kitchen
- [ ] Facility or third-party shoot booked for the post-only unit

### Post & Delivery

- [ ] Dropbox file request live and shared with every creator: https://www.dropbox.com/request/TBD
- [ ] Footage naming convention sent, matching the storyboard footage names
- [ ] Due date agreed: TBD, 48 hours after receiving products (client to confirm)
- [ ] Delivery formats confirmed: 9:16 primary, 1:1 crops, raws included
- [ ] Music and licensed asset sources cleared for paid use (client to confirm)
- [ ] Screen recordings scrubbed of personal data before upload
```

Rules:

- The three group names are fixed: Product & Assets, Talent & Scheduling,
  Post & Delivery. Do not add a fourth group.
- Ordering inside a group runs earliest-blocking first. Shipping product
  blocks everything, so it sits near the top.
- `(client to confirm)` goes only on items the client owns. Do not flag
  internal work, or the flag stops meaning anything.
- Every unit on the page must be represented by at least one line here. A
  Remote Segment C with no booking line is a hole in the plan.

## Deriving shoot units from the storyboard and shooting guide

Shoot units are not a creative decision. They are the result of grouping the
approved concepts by three keys, in this priority order.

1. **Production type** first. The shooting guide's production-type legend
   already labels each concept: remote creator, two-person, founder shoot,
   fully AI, facility, screen-rec. Founder shoot concepts go to
   `Founder Shoot Day`. Fully AI, facility, and screen-rec-only concepts go to
   `Post-Only AI + Facility`. Everything remote continues to step 2.
2. **Talent** second. Every concept assigned to the same named creator or the
   same creator pair becomes one Remote Segment. One creator equals one
   segment, even if that creator only has one concept. Two creators who appear
   together in a two-person concept form a pair, and that pair is a single
   segment, not two.
3. **Location** third, as a splitter and as an orderer. If one creator's
   concepts span two locations that cannot be shot in one sitting, such as a
   home kitchen and a gym, keep them in the same segment but order the
   concepts so the location changes exactly once. Split into a second lettered
   segment only when the locations force different days or different people.

Then apply these tie-breakers:

- A concept that could sit in two units goes to the unit where its talent is
  already booked, not to the unit with fewer concepts.
- A concept whose only live element is a screen recording is post-only, even
  if the voiceover comes from a creator, because nothing needs a shoot day.
- Reusable Shot Library shots from the shooting guide are distributed into the
  b-roll block of the unit that can actually film them, and each reusable shot
  appears in exactly one unit. A shot filmed once and reused across concepts is
  listed once, in the unit that films it.
- A unit with a single concept and no b-roll is not a unit. Fold it into the
  nearest unit sharing its talent or type, or into `Post-Only AI + Facility`.

Segment letters are assigned in the order the segments appear in the shooting
guide, not alphabetically by creator name, so the two documents read in the
same order side by side.

## Coverage rule and reconciliation check

**Every concept in the batch appears in exactly one unit.** Not zero, not two.
A concept in two units gets shot twice and paid for twice. A concept in zero
units gets discovered missing in post.

Before the final write, build the reconciliation block and put it last on the
page. It is a table plus three count lines.

```
## Coverage Reconciliation

| Concept | Title | Unit |
| --- | --- | --- |
| 001 | Why We Reformulated | Founder Shoot Day |
| 002 | Founder Answers The One Star Review | Founder Shoot Day |
| 003 | What Is Actually In The Box | Founder Shoot Day |
| 004 | Morning Countertop Routine | Remote Segment A |
| 005 | Packing For A Week Away | Remote Segment B |
| 006 | Shelf Test | Founder Shoot Day |
| 007 | Two Weeks In | Remote Segment A |
| 008 | The Receipt | Post-Only AI + Facility |
| 009 | Ninety Second Explainer | Founder Shoot Day |

**Concepts in storyboards:** 9
**Concepts placed in units:** 9
**Unplaced or duplicated:** 0
```

How to run the check, before writing and again after:

1. List every concept number and title from the approved storyboards page.
   That list is the authority, not the scripts doc and not memory.
2. List every concept checklist item across every unit on the plan, and diff
   the two lists in both directions. Numbers only in the storyboards are
   unplaced. Numbers appearing twice in the plan are duplicated.
3. Confirm each unit's meta-line `Concepts:` count equals its checklist length.
4. If the counts do not reconcile, fix the plan. Never publish a non-zero
   unplaced or duplicated count, and never paper over it by editing the count
   line.
5. If a concept genuinely cannot be placed, for example it needs talent that
   does not exist yet, it still gets a unit and its blocker gets a
   `(client to confirm)` line in Talent & Scheduling. Unplaced is not an
   allowed resting state.

## Delivery message for Phase 3

After the write, post one message with the plan link, the unit list with
concept counts on one line so the user can sanity-check the split without
opening the page, the reconciliation counts stated plainly, every `TBD` on the
page listed, and any judgment call in one sentence, such as which segment a
borderline concept landed in.

Then stop and ask whether anything needs changing. Do not offer extra work and
do not start revisions the user has not asked for. If the user goes quiet, the
plan stands as posted and the batch package is done.

## Defect list

Treat any of these as a bug to fix before publishing:

- Escaped newlines anywhere in the written markdown.
- A `####` heading, or an emoji category rendered as a heading.
- A concept item with no POV or shot tag.
- A concept item with no setup note, or with a setup note that restates the
  script.
- The same emoji on two blocks in one unit, or an emoji that does not match
  its block.
- 🎨 used for CCTV.
- A unit named anything other than the three sanctioned names, without asking.
- A meta-line concept count that disagrees with the checklist.
- A `(client to confirm)` flag on internal work, or a missing flag on a
  client-owned item.
- A `TBD` on the page that is not repeated in the delivery message.
- A non-zero unplaced or duplicated count in the reconciliation block.
- A real client brand name used in an example rather than the actual client's
  own name in the actual deliverable.
