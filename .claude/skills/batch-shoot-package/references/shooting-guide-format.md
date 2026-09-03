# Shooting Guide Format (Phase 2)

This is the format spec for the shooting guide that Phase 2 of the batch-shoot-package skill writes
into Notion. The guide is the document a creator, a founder, or a production coordinator opens on
shoot day. It is client-visible. Vagueness in this file becomes vagueness on set, which becomes
unusable footage.

Read this whole file before writing a single Notion block.

---

## The source-of-truth rule

**The approved storyboards are the source of truth for the shooting guide. Every shot in the guide
must trace back to a Footage Name in the approved storyboard table.**

Concretely:

1. Before writing the guide, re-read the Phase 1 storyboard pages that the user approved. Do not work
   from the concept doc, the script doc, or your own memory of the batch. Read the actual storyboard
   tables.
2. Build an internal list of every Footage Name across every approved concept. That list is your
   shot universe. Nothing outside it goes in the Master Shotlist.
3. Every Master Shotlist line item carries the Footage Name it came from, verbatim, so the footage
   renamer and the video editor can join guide to storyboard to delivered file.
4. If a shot is obviously needed on set but has no Footage Name in the storyboard, you have found a
   storyboard gap, not a guide opportunity. Stop, report the gap in your delivery message, and ask
   whether to amend the storyboard first. Do not invent a Footage Name in the guide.
5. The Reusable Shot Library (section 7) is the one exception, and only partly: library shots are
   extra coverage that is not tied to a single script line. They still must not contradict the
   storyboards, and they are labeled as library coverage, never mixed into a concept's shotlist.
6. Concept numbering is load-bearing across the whole package. Concept 1 in the concept doc is 001 in
   the storyboard and "Concept 1" in the guide. Never renumber, never reorder, never skip.

If you cannot read an approved storyboard, you cannot write the guide. Say so and stop.

---

## Notion writing rules that apply to every section

These are the mechanical rules. Breaking them produces a visibly broken client document.

- **Real newlines.** The markdown you pass to `notion-create-pages` and `notion-update-page` must
  contain actual line breaks. A JSON-escaped backslash-n is stored as the literal letter n and
  destroys the whole page. Compose multi-line content as a real multi-line string.
- **Approval gates on writes.** Notion writes need explicit user approval in the client. If a write
  returns "No approval received", retry it once. If it fails a second time, stop making separate
  calls and consolidate every remaining write into ONE call so the user approves once.
- **Placeholders are visible and greppable.** Unknown values are written as the literal token `TBD`,
  including inside URLs: `https://www.dropbox.com/request/TBD`. Callout text reads
  `Due date: TBD, 48 hours after receiving products`. Never leave a blank, never guess a plausible
  date, never silently drop a section because its value is unknown.
- **Every placeholder is named in the delivery message.** When you hand the user the page link, list
  each `TBD` you left and what it needs.
- **Never assume a placeholder is fine.** If the real value is likely known to the user (due date,
  Dropbox request link, talent names, shoot location), that question belongs in Phase 0, before you
  build anything.
- **Checkboxes are real Notion to-do blocks.** Write `- [ ] ` with the space. Creators tick these on
  set, so a shot written as a plain bullet is a defect.
- **No em dashes anywhere.** Use a comma, a colon, or "to". This is a house rule and it applies to
  client-facing copy, headings, and shot descriptions alike.
- **Headings.** The page title is the Notion page name, not an `H1` inside the body. Top-level
  sections are `##`. Per-concept subsections are `###`. Do not go deeper than `###`.
- **Callouts.** Notion markdown renders `> ` as a quote block, which is the shape to use for the
  callouts in sections 1 and 2. Lead each with a bold label so it reads as a callout, for example
  `> **Due date:** TBD, 48 hours after receiving products`.

---

## Section order (fixed)

The guide has exactly these ten sections, in exactly this order. The order is fixed by SKILL.md. Do
not add sections, do not reorder, do not merge. If a section has thin content, write the section with
its real thin content rather than removing it.

1. Due-date and scripts-link callouts
2. Production-type legend callout
3. Client Overview
4. General Guidelines
5. Wardrobe Inspiration
6. Props
7. Reusable Shot Library
8. Master Shotlist
9. Shooting Instructions
10. Dropbox Upload Link

---

## 1. Due-date and scripts-link callouts

**Shape.** Two quote blocks at the very top of the page body, before any heading. Nothing precedes
them. Due date first, scripts link second.

```
> **Due date:** TBD, 48 hours after receiving products

> **Scripts and storyboards:** [Batch 04 storyboards](https://www.notion.so/TBD)
```

Rules:

- If the due date is known, write it as a real date plus the trigger, for example
  `Friday, October 17, 48 hours after receiving products`.
- If unknown, keep the literal `TBD` and keep the trigger phrase so the creator still understands the
  clock.
- The scripts link points at the Phase 1 storyboard index page for this batch, not the concept doc.
  If Phase 1 produced per-concept storyboard pages under an index, link the index.
- If the storyboard page URL is not yet available, write `https://www.notion.so/TBD` and flag it.

---

## 2. Production-type legend callout

**Shape.** One quote block, immediately after section 1, that defines the six production-type labels
used throughout the guide. The labels are fixed and are written in caps exactly as below.

```
> **Production types used in this guide**
> **REMOTE CREATOR** one creator self-shooting on a phone in their own space
> **2-PERSON** creator plus an operator, so the camera can move and reframe
> **FOUNDER SHOOT** the founder or an in-house team member on camera
> **FULLY AI** no live capture, generated end to end, no footage due from a creator
> **FACILITY** a booked space, studio, gym, kitchen, clinic, or set
> **SCREEN-REC** captured screen or app recording, no camera
```

Rules:

- Include all six labels even if this batch only uses two. The legend is a fixed reference.
- Every concept in sections 8 and 9 carries one of these labels and only one.
- `FULLY AI` concepts still get a Shooting Instructions subsection, and that subsection states plainly
  that no footage is due from the creator and what the AI production owner needs instead, for example
  approved product stills and a locked script line.

---

## 3. Client Overview

**Shape.** `## Client Overview` followed by two to four short paragraphs and then a compact bullet
block of hard facts.

Content, pulled from the onboarding and the brand brain:

- What the product actually is and what it does, in one plain sentence a creator with no context can
  read out loud.
- Who the customer is and what they are trying to fix.
- The three or four things the brand is known for, in the brand's own vocabulary.
- Hard facts as bullets: category, format or dosage or size, where it is used, price band if
  relevant, primary platform for the ads.

Worked example (invented brand, never use a real one):

```
## Client Overview

The client sells a nightly magnesium drink mix in single-serve sachets. One sachet goes into warm
water about an hour before bed. The promise is simpler sleep onset without a next-morning fog, and
the whole brand voice is calm and unhurried rather than clinical.

Their customer is a 28 to 45 year old who falls asleep late because their head will not switch off.
They have usually tried melatonin and did not like waking up groggy. They are buying a ritual as much
as a supplement, so footage should feel like a real wind-down, not a product demo.

- Category: powdered supplement drink mix
- Format: single-serve sachets, 30 per carton
- Where it is used: kitchen or bedside, evening, warm water
- Primary platform: Meta and TikTok, 9:16, sound-off first
- Tone words from onboarding: calm, unhurried, honest, low-effort
```

---

## 4. General Guidelines

**Shape.** `## General Guidelines` with exactly three `###` subsections, in this order:

```
## General Guidelines

### Visual Expectations
### Performance Standards
### Product and Compliance Rules
```

Each subsection is a bullet list. Bullets are imperative and checkable, not aspirational.

**Visual Expectations** covers capture spec and look: orientation and resolution, frame rate,
lighting, background, stability, lens hygiene, headroom, and anything the editor needs, for example
shooting wider to allow a reframe.

**Performance Standards** covers what the person on camera does: energy level, eyeline, pacing,
handling of stumbles, number of takes per line, and how to mark a good take.

**Product and Compliance Rules** is pulled from the onboarding, not invented. This is the subsection
that keeps a batch from being unusable. It covers claim language that is not allowed, required
visibility of a label or a disclaimer, competitor product handling, imagery that cannot appear, and
any category-specific rule the client stated.

Worked example:

```
### Visual Expectations

- Shoot vertical 9:16, 4K if the phone supports it, otherwise 1080p, 30fps throughout
- Lock exposure and white balance before each take so brightness does not drift mid-shot
- One soft light source, a window during the day or a lamp bounced off a wall at night
- Wipe the lens before every setup, a smudged lens has killed whole batches
- Keep the frame slightly wider than feels natural so the editor can push in
- Handheld is fine when it is motivated, prop the phone for any static talking segment

### Performance Standards

- Speak to one person, not to an audience, eyes on the lens for talking segments
- Start each take with a one second beat of silence before the first word
- Three usable takes per script line, then move on
- If you stumble, do not stop, say the line again from the top of the sentence
- Say the take number out loud before a take you think is the keeper

### Product and Compliance Rules

- Never say the product cures, treats, or replaces anything prescribed
- Say "supports" not "guarantees", and never put a timeline on a result
- The front label must be legible in at least one shot per concept
- Do not show the product next to any named competitor pack, use plain unbranded packaging if a
  comparison is scripted
- Do not film the product in a bathroom cabinet next to medication
```

---

## 5. Wardrobe Inspiration

**Shape.** `## Wardrobe Inspiration` with one `###` subsection per creator segment that appears in
this batch, each a bullet list. Segment names must match the segments used in the storyboards.

Rules:

- Segment-matched, not generic. A wind-down segment and a gym segment get different wardrobe.
- Describe silhouette, color range, texture, and what to avoid. Avoid brand names.
- Say what is banned and why, for example loud logos that force a blur in post.
- If a concept requires a specific costume or uniform, it is named here and repeated in section 6 or
  9 as a prop or a location note.

Worked example:

```
## Wardrobe Inspiration

### Evening wind-down segment

- Soft neutral knits, cream, oatmeal, warm grey, nothing pure white
- Relaxed fit, sleeves that can be pushed up so hands read clearly
- Bare face or minimal makeup, hair down or loosely tied
- Avoid: visible logos, busy prints, anything that reads as daytime workwear

### Busy-morning segment

- Everyday casual, one saturated accent color to separate from the wind-down looks
- Layers are useful, a jacket on and off marks a time jump without a set change
- Avoid: pure black on a dark background, thin stripes that alias on camera
```

---

## 6. Props

**Shape.** `## Props` with two `###` subsections in this order:

```
## Props

### Universal props
### Concept-specific props
```

`Universal props` is a flat checklist of everything needed across the whole batch. `Concept-specific
props` is a checklist grouped by concept, with the concept number and title as a bold line, so a
coordinator can pack per concept.

Rules:

- Use to-do checkboxes. Props get packed, so they get ticked.
- Quantities and states matter: how many units, sealed or opened, full or half-empty.
- Consumables that are destroyed in a take need a spare count.
- Every concept-specific prop must be justified by a shot that exists in the storyboard.

Worked example:

```
## Props

### Universal props

- [ ] 6 sealed product cartons, labels clean and undamaged
- [ ] 12 loose sachets for pour and mix shots
- [ ] 2 plain glass mugs, no logo, one clear glass tumbler
- [ ] Electric kettle, descaled, no visible brand mark
- [ ] Neutral linen napkin and a plain wooden tray
- [ ] Phone tripod and a small LED panel with a diffuser

### Concept-specific props

**Concept 2, The 9pm Handoff**
- [ ] Laptop, closed, for the shut-the-day beat
- [ ] Bedside lamp with a warm bulb

**Concept 4, Unboxing In One Take**
- [ ] 2 shipping mailers, one sealed for the open, one spare in case the tear reads badly
- [ ] Scissors kept out of frame
```

---

## 7. Reusable Shot Library

**Shape.** `## Reusable Shot Library` with one `###` subsection per category, in this fixed order:

```
### Ritual
### Lifestyle positive
### Lifestyle pain and before
### Unboxing
### Product heroes
```

Every entry is a to-do checkbox, and **every shot carries a one-line description of what happens on
camera**. A shot name with no description is a defect. The description says the action, not the
intent.

Rules:

- This is extra coverage that any concept can borrow from and that the editor can use to patch a cut.
  It is not tied to a single script line.
- Do not put a concept's scripted hero shot here. Scripted shots live in section 8.
- Keep each entry to one line. If it needs two lines it is a scripted shot and belongs in section 8.
- Aim for four to eight entries per category, weighted to what this product actually does.

Worked example:

```
### Ritual

- [ ] Sachet tear, close on hands, single clean tear, powder stays contained
- [ ] Pour into mug, slow, powder lands in warm water and starts to dissolve
- [ ] Stir and settle, spoon circles twice, then rests against the rim
- [ ] Both hands wrap the mug, held at chest height, small exhale

### Lifestyle pain and before

- [ ] Ceiling stare, flat on back, room lit only by a phone screen
- [ ] Clock check, hand picks up phone, screen brightness hits the face
- [ ] Restless turn, subject rolls over and pulls the duvet across

### Product heroes

- [ ] Carton on a clean surface, slow push in, front label fully legible
- [ ] Sachet fan, five sachets spread by hand, top-down
- [ ] Prepared drink beside the carton, steam visible against a dark background
```

---

## 8. Master Shotlist

**Shape.** `## Master Shotlist` and then **one `###` subsection per concept**. Each concept
subsection opens with a one-line meta row, then a checklist where every shot has a brief description
matched to the storyboard's script line and beat.

Per-shot line format:

```
- [ ] `<Footage Name>` <Beat label>: <what happens on camera>. Script: "<the script line>"
```

Rules:

- The backticked Footage Name is copied verbatim from the approved storyboard table. It is the join
  key. Do not reformat it, do not fix its capitalization, do not shorten it.
- Beat label and script line come from the same storyboard row as that Footage Name.
- Shots stay in storyboard order within a concept.
- Quote the script line only for shots that carry dialogue or voiceover. For silent b-roll, replace
  the `Script:` clause with `Silent, cuts under <beat label>`.
- The meta row states the production type from the section 2 legend, the shot count, and the format.
- The shot count in the meta row must equal the number of checkboxes in that subsection. Count them.

Worked example:

```
## Master Shotlist

### Concept 1, Why I Stopped Taking Melatonin

**REMOTE CREATOR** | 9 shots | 9:16 talking head with b-roll

- [ ] `C1_S01_hook_talking` Hook: creator sits on the edge of the bed, phone propped at eye level,
      delivers the line straight to lens with no windup. Script: "I stopped taking melatonin three
      weeks ago and I want to explain why."
- [ ] `C1_S02_broll_ceiling` Problem: flat on back, ceiling stare, only the phone lights the room.
      Silent, cuts under Problem
- [ ] `C1_S03_talking_groggy` Problem: back to lens, hand rubs the eyes mid-line. Script: "It worked,
      but I woke up feeling like I had been hit by a truck."
- [ ] `C1_S04_broll_pour` Solution: sachet tears, powder pours into a warm mug, slow. Silent, cuts
      under Solution
- [ ] `C1_S05_talking_switch` Solution: creator holds the prepared mug, delivers to lens. Script:
      "Now I just make this about an hour before bed."
- [ ] `C1_S06_hero_carton` Proof: carton on the counter, slow push in, front label legible. Silent,
      cuts under Proof
- [ ] `C1_S07_talking_result` Proof: relaxed, half smile, eyes on lens. Script: "I fall asleep
      easier and I actually feel like a person in the morning."
- [ ] `C1_S08_broll_morning` Payoff: curtains open, daylight fills the room, subject stretches.
      Silent, cuts under Payoff
- [ ] `C1_S09_cta_talking` CTA: creator holds the carton beside their face, points at label. Script:
      "It is the one in the cream box, link is right there."

### Concept 2, The 9pm Handoff

**2-PERSON** | 7 shots | 9:16 observational, operator reframes

- [ ] `C2_S01_laptop_close` Hook: laptop lid closes on a still-lit screen, operator holds on the
      dark. Silent, cuts under Hook
...
```

---

## 9. Shooting Instructions

**Shape.** `## Shooting Instructions` and then one `###` subsection per concept, same numbering and
titles as section 8, in the same order. Each subsection is exactly five bold-labeled bullets, in this
order:

```
- **Format and Tone:**
- **Delivery:**
- **Framing:**
- **Location:**
- **Audio:**
```

Rules:

- Five bullets, every concept, no more and no fewer. If a bullet has nothing special to say, state the
  default explicitly rather than dropping the bullet.
- `Format and Tone` names the production type from the legend and the emotional register.
- `Delivery` is direction for the performance: pace, eyeline, energy, how to handle the hook.
- `Framing` is camera: height, distance, movement or lock, and any headroom or reframe allowance.
- `Location` is the space and the time of day, plus what must not be in the background.
- `Audio` is capture: what device records sound, how close, room treatment, and what to avoid.
- For a `FULLY AI` concept, keep all five bullets and use them to state what the AI owner needs, plus
  the explicit line that no live footage is due.
- For `SCREEN-REC`, `Framing` describes the capture region and the device chrome, and `Audio` states
  whether voiceover is recorded live or separately.

Worked example:

```
### Concept 1, Why I Stopped Taking Melatonin

- **Format and Tone:** REMOTE CREATOR, confessional and low key, like telling one friend something
  you figured out, never a pitch
- **Delivery:** Land the first sentence in under two seconds with no throat clear and no greeting,
  then slow down for the rest, eyes on the lens for every talking shot
- **Framing:** Phone propped at seated eye level, chest-up on the talking shots, leave a hand of
  headroom so the editor can push in, lock the phone for talking and go handheld only for b-roll
- **Location:** Bedroom and kitchen at night, one warm lamp, clear the background of any other
  supplement bottle or medication
- **Audio:** Phone mic is acceptable at arm's length in a soft-furnished room, kill the fan and the
  fridge hum, no music on set, record room tone for ten seconds before you wrap

### Concept 5, Sachet To Sleep, Generated

- **Format and Tone:** FULLY AI, no live capture, calm product-led register matching the batch
- **Delivery:** No performer, no footage due from any creator, voiceover is generated from the locked
  script line in the storyboard
- **Framing:** Vertical 9:16, product occupies the middle third, no motion that implies a hand
- **Location:** Generated kitchen counter at night, warm practical light, no visible window detail
- **Audio:** Generated voiceover plus a soft bed, hand the AI owner the approved carton stills and
  the locked script line, nothing else is needed from set
```

---

## 10. Dropbox Upload Link

**Shape.** `## Dropbox Upload Link` followed by the link and the naming and delivery rules.

Rules:

- The link is a Dropbox file request URL. If it does not exist yet, write it as
  `https://www.dropbox.com/request/TBD` so it is greppable, and flag it in the delivery message.
- Always include the file naming convention, because the footage renamer and the editor depend on it.
  Name files by Footage Name from section 8.
- State what not to upload: no edits, no filters, no in-app color, originals only.

Worked example:

```
## Dropbox Upload Link

Upload everything here: https://www.dropbox.com/request/TBD

- Upload original camera files, no edits, no filters, no in-app color
- One folder per concept, named `Concept 1`, `Concept 2`, and so on
- Name each clip with its Footage Name from the Master Shotlist, plus a take number, for example
  `C1_S01_hook_talking_take3.mov`
- Extra coverage from the Reusable Shot Library goes in a folder named `Library`
- Upload as you go, do not wait for the whole batch to finish
```

---

## Split strategy

Decide the split before you write anything, and confirm it with the user in Phase 0 or at the top of
Phase 2. The split changes the structure of the document, not just its title.

### Option A, one combined guide (default)

Use when the whole batch is one production type and one creator segment, or when the batch is small,
roughly six concepts or fewer.

- One Notion page. All ten sections once.
- Section 5 may still hold multiple segment subsections if wardrobe varies.
- Sections 8 and 9 hold every concept in the batch.

### Option B, per creator segment

Use when the batch targets clearly different segments, for example a busy parent segment and a
shift-worker segment, and the wardrobe, location, and tone genuinely differ.

- One page per segment, plus a short parent index page that links them.
- Sections 1, 2, 3, 4, 7, and 10 are duplicated on every page, identical, so a creator never has to
  open two documents.
- Section 5 holds only that segment's wardrobe. The other segments are not shown.
- Section 6 universal props stay the same, concept-specific props are filtered to that segment's
  concepts.
- Sections 8 and 9 hold only that segment's concepts, and they keep their original batch concept
  numbers. Do not renumber to 1 through n per page.

### Option C, per named talent

Use when specific people are cast and each person has a different call, or when a founder shoots some
concepts and a hired creator shoots others.

- One page per named person, plus a parent index page.
- Same duplication rule as Option B for sections 1, 2, 3, 4, 7, and 10.
- Section 5 becomes that person's wardrobe call, stated as instructions to them, not as inspiration.
- Section 9 gains a first bullet before `Format and Tone` only if the person needs a call time or a
  location address. Otherwise keep the five bullets exactly.
- Original batch concept numbers are preserved.

### Option D, named concepts only

Use when the user asks for a guide covering a subset, for example only the three concepts going to a
particular creator, or a reshoot of two concepts.

- One page, titled with the concept numbers it covers.
- All ten sections, but sections 6, 8, and 9 contain only the named concepts.
- Section 7 stays complete, since library coverage is always reusable.
- State the scope in a line directly under the section 2 callout, for example
  `Scope: Concepts 2, 4 and 7 only. Concepts 1, 3, 5 and 6 are covered in the main batch guide.`

### Rules that hold under every split

- Concept numbers never change. A guide that renumbers concepts breaks the concept to storyboard to
  footage join and is the single most damaging error you can make in this file's format.
- Every page carries sections 1, 2, and 10, because every page is opened standalone by someone who
  needs the deadline, the legend, and the upload link.
- If a split produces a page with no live capture at all, for example an all `FULLY AI` page, keep
  section 10 and write plainly that no upload is expected from a creator.
- When splitting, prefer one write per page. If a write is refused twice, consolidate all remaining
  pages into a single call.

---

## Pre-delivery checklist

Run this before posting the link. Every item is a real failure that has shipped before.

- [ ] Ten sections present, in the fixed order, none merged
- [ ] Every Master Shotlist Footage Name exists verbatim in the approved storyboard
- [ ] Every storyboard Footage Name for the covered concepts appears in the Master Shotlist
- [ ] Every Reusable Shot Library entry has a one-line on-camera description
- [ ] Every Master Shotlist shot has a description and either a script line or a silent note
- [ ] Every concept in section 8 has a matching subsection in section 9, same number, same title
- [ ] Every section 9 subsection has exactly the five bullets, in order
- [ ] Every concept carries exactly one production-type label from the section 2 legend
- [ ] Shot counts in the section 8 meta rows match the actual checkbox counts
- [ ] No em dashes, no curly quotes, no arrows anywhere in the page
- [ ] Checklists are real to-do blocks, not plain bullets
- [ ] Markdown was passed with real newlines and the rendered page has real formatting
- [ ] Every unknown value is the literal `TBD`, including inside URLs
- [ ] The delivery message lists every `TBD` and what it needs
- [ ] No real client brand name appears in any example text carried over from this spec

Then post the page link, list the placeholders, and ask for approval before starting Phase 3. Silence
is not approval. A comment about something else is not approval. An ambiguous reply gets a follow-up
question, not a green light. If the user sends edits, apply them, repost the link, and re-ask.
