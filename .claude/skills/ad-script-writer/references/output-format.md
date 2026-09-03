# Output Format: House Document Layout

This is the exact layout every script document ships in. Read it at Step 6, after the
concept contract, hooks, body, and scorecard pass are settled. Nothing here changes
what the script says. It governs where each piece sits, what it is called, and how it
is punctuated.

Deviating from this layout is a defect even when the writing is strong. The client
reads these documents alongside batches from previous months and expects the same
skeleton every time. Editors, designers, and the footage renamer all parse the file
name line and the concept heading, so those two lines are load-bearing, not cosmetic.

House copy rule applies to every line you write in this document: no em dashes. Use
periods, commas, colons, or parentheses.

---

## Document order (top to bottom)

Every deliverable follows this sequence exactly:

1. Document title line (`# <Brand> Video Scripts, Batch <N>`)
2. FTC substantiation disclaimer block
3. One section per concept, ascending by concept number. Each concept section contains,
   in this order:
   a. `###_Title` heading
   b. File name line
   c. Concept contract line
   d. Three labelled hook blocks (Hook 1, Hook 2, Hook 3)
   e. `*Insert Opening Line*`
   f. Script body with inline `*[Visual Cue: ...]*` and `Overlay:` markers
   g. `CTA Overlay:` end card
4. Delivery section (format note plus the summary table)

Nothing else goes in the document. No strategy preamble, no rationale paragraphs, no
"why this works" notes, no scorecard numbers. The scorecard is an internal gate, not
client-facing content. The only exception is a flagged note when a script ships after
two failed revision cycles, and that note goes in the delivery section, not inside the
script.

---

## 1. FTC substantiation disclaimer block

This block sits at the very top of the document, immediately under the document title
and before the first concept. It appears once per document, never repeated per concept.
Write it verbatim:

```
> **Substantiation notice.** All performance figures, timelines, and outcomes spoken or
> shown in these scripts are placeholders written for structure and pacing. Before
> production, every number, claim, timeframe, and comparison must be replaced with a
> figure the brand can substantiate with documented evidence, or cut. Any result shown
> on screen must be typical of what a reasonable consumer can expect, or carry a clear
> and conspicuous disclosure of what is typical. Creators appearing in these scripts
> must disclose any material connection to the brand in-video and in the caption.
> Screen recordings must show real account data, not mockups, and must not be edited in
> a way that changes what the numbers mean. Nothing in these scripts guarantees a
> specific result.
```

Rules for the block:

- Render as a markdown blockquote so it visually separates from script content.
- Bold lead-in `**Substantiation notice.**` on the first line.
- Never edit the text to soften it, never trim it for length, never move it below the
  first concept.
- If the brand's legal team has supplied its own approved disclaimer, place theirs
  directly beneath this block as a second blockquote. Do not replace this one with
  theirs. This block is about what the scripts contain, theirs is about what the brand
  publishes.

---

## 2. Concept heading: `###_Title`

Every concept section opens with a level-three markdown heading whose text is the
zero-padded concept number, an underscore, and the concept title.

```
### 001_The Empty Launch
```

Rules:

- Three digits, zero-padded. Concept 1 is `001`. Concept 7 is `007`. Concept 12 is
  `012`. Never `1_`, never `01_`, never `#1`.
- One underscore between number and title. No space around the underscore.
- The title is Title Case, taken verbatim from the approved concept deck. Do not
  rewrite, shorten, or improve the title. If the deck title is bad, raise it, do not
  silently fix it. The number plus title is how the concept deck, the script doc, the
  storyboard page, and the footage folders are cross-referenced. A retitle breaks that
  chain.
- The number matches the concept deck numbering. Concept 1 in the deck is `001` here.
  If you are writing scripts for only a subset of a deck (say concepts 3, 4, and 9),
  keep the deck numbers. Do not renumber to 001, 002, 003.
- The title carries no format, size, or length information. All of that lives in the
  file name line below it.

---

## 3. File name line

Directly beneath the heading, on its own line, in backticks, with no label word before
it:

```
`Brand_Video_SIZE_LENGTH_Format_###_V#_BatchN_LANG`
```

Worked shape:

```
`Lumenwell_Video_9x16_30s_UGCTalkingHead_001_V1_Batch4_EN`
```

Token order is fixed. Nine tokens, separated by single underscores, no spaces anywhere,
no trailing extension. The renamer and the editor both split on underscore and read
positionally, so an out-of-order or missing token silently misfiles the asset.

| Position | Token    | Allowed values                                                                 | Notes |
|----------|----------|--------------------------------------------------------------------------------|-------|
| 1 | `Brand`  | The brand name in PascalCase, no spaces, no punctuation                        | `Lumenwell`, `NorthTrail`. Two-word brands close up: `NorthTrail`, not `North_Trail`. |
| 2 | `Video`  | Literal string `Video`                                                          | Never `Vid`, never `VIDEO`. This is the asset-class token and it is constant for this skill. |
| 3 | `SIZE`   | `9x16`, `4x5`, `1x1`                                                            | Lowercase `x`, no spaces. `9x16` is the default for paid social. Use `4x5` for in-feed cuts, `1x1` only when the brief asks. |
| 4 | `LENGTH` | `15s`, `30s`, `60s`                                                             | Lowercase `s`, no space. This is the target runtime, not the read length of the draft. |
| 5 | `Format` | The vehicle name in PascalCase                                                   | The creative vehicle from the concept, e.g. `UGCTalkingHead`, `ScreenShare`, `CommentResponse`, `FoundFootage`, `SplitScreenCompare`, `VoiceoverBRoll`, `DayInTheLife`, `Unboxing`. Match the vehicle named in the approved concept. Never invent a new vehicle name at script stage. |
| 6 | `###`    | Zero-padded three-digit concept number                                           | Identical to the number in the heading. `001`. |
| 7 | `V#`     | `V1`, `V2`, `V3`, ...                                                            | Script version, not hook variant. A hook rewrite that keeps the body is still the same V unless the client asked for a fresh version. Uppercase `V`, no zero padding. |
| 8 | `BatchN` | `Batch1`, `Batch2`, `Batch3`, ...                                                | The delivery batch. Uppercase `B`, no zero padding, no space. |
| 9 | `LANG`   | `EN`, `ES`                                                                       | Uppercase. One language per file. A Spanish adaptation is its own line and its own script section, never a bilingual document. |

Additional rules:

- One file name line per concept section. If the concept ships in two sizes, the
  editor derives the second from the first. Do not list two file names.
- If the concept ships in two languages, that is two concept sections with the same
  `###` and different `LANG`, and the Spanish one is a full adaptation, not a
  translation of the English lines.
- Wrap the line in backticks so no autocorrect touches the underscores.

---

## 4. Hook blocks

Three hook blocks per concept, in order, each formatted identically. These sit between
the file name line and the script body.

```
**Hook 1: Empty Launch / Pain Point**
Overlay: 4 sales. That was the whole launch.
Opening Line: I spent six weeks building a product and four people bought it.

**Hook 2: Wasted Ad Spend / Cost Frame**
Overlay: $900 in ads. 11 people at checkout.
Opening Line: I paid for the audience and still launched to nobody.

**Hook 3: The Second Launch / Goal Frame**
Overlay: Launch two, same product.
Opening Line: Same product, second launch, and this time I knew who was actually waiting for it.
```

Rules:

- Header line is bold, and reads exactly `Hook N: <Angle Label>` with N as 1, 2, or 3.
- The angle label names the entry point, not the copy. Good labels name a pain, a goal,
  a persona, a cost frame, a root cause, or an objection: `Empty Launch / Pain Point`,
  `Wasted Ad Spend / Cost Frame`, `Off-Season Gap / Persona`, `Tried Everything /
  Objection`. Bad labels restate the line: `Hook 1: I only got four sales`. If your
  three labels read as one thought reworded, the hooks failed the non-negotiable and
  the fix is upstream, not in formatting.
- Exactly two lines under the header, in this order: `Overlay:` then `Opening Line:`.
  Both labels are plain text with a colon and a single space. Neither is bold.
- `Overlay:` is the burned-in text for the first beat. Short enough to read in under a
  second at thumb distance. No sentence-ending period unless it is two clipped
  fragments, as above.
- `Opening Line:` is what the creator actually says on camera. Spoken register,
  contractions allowed, no stage direction.
- No visual cues inside hook blocks. Hooks carry overlay and spoken line only. The
  visual direction for the opening beat belongs in the first `*[Visual Cue: ...]*` of
  the body.
- Three hooks, always. Not two, not four. If the concept genuinely only supports two
  entry points, that is a concept problem to flag, not a format exception.
- A blank line between hook blocks.

---

## 5. `*Insert Opening Line*` marker

The script body begins with this exact italic marker on its own line, immediately after
Hook 3's block:

```
*Insert Opening Line*
```

Rules:

- Verbatim, including capitalization, wrapped in single asterisks.
- It stands alone on its line, with a blank line above and below.
- It is a placeholder, not a heading. It tells the editor that whichever of the three
  hooks is being cut goes here, so the body must read correctly after any of the three.
  This is a hard constraint on the writing: the first body line cannot depend on a
  specific hook's wording. If it does, rewrite the body line, do not annotate the
  marker.
- Never write `*Insert Opening Line (Hook 2)*` or `*Insert Hook*` or add a note after
  it.
- It appears once per concept section.

---

## 6. Script body markers

The body is plain prose lines, spoken by the creator, broken into short paragraphs of
one to three sentences. Two marker types interleave with the spoken lines.

### `*[Visual Cue: ...]*`

Italic, square-bracketed, on its own line, describing what the camera shows at that
beat.

```
*[Visual Cue: Phone screen recording, the brand dashboard, cursor hovering the reach number as it loads.]*
```

Rules:

- Exact shape: open italic, `[Visual Cue: `, the description, `]`, close italic.
- Capital V and C. Colon then a single space.
- Sentence-cased description, ending with a period inside the bracket.
- Describes what proves the point at that moment. Camera, subject, and the specific
  thing on screen. Not mood, not decoration. "Warm morning light, coffee steam" is a
  defect. "Screen recording of the inbox, three new consultation requests timestamped
  the same afternoon" is correct.
- On a Screen Share format concept, at least one cue must name the specific on-screen
  number the viewer is meant to read. On a Comment Response format, the first cue must
  show the comment itself with enough context to work as the hook.
- Place a cue before the line it supports, never after.
- Do not narrate cuts, transitions, or timecodes. No `*[Visual Cue: Hard cut]*`.

### `Overlay:`

Plain text label, on its own line, for burned-in text inside the body.

```
Overlay: No bots. No password needed.
```

Rules:

- Label is `Overlay:` with a colon and a single space. Not bold, not italic, not
  bracketed.
- One overlay per line. Two overlays that appear together are two lines.
- Overlays carry the trust and compliance line, the mechanism callout, and any number
  the creator does not say out loud. The trust line lives here specifically so it is
  not spoken boilerplate in every script of the batch.
- Never duplicate a spoken sentence as an overlay. If the creator says it, the overlay
  says something else.
- Keep overlay text to what fits on two short lines on a 9x16 frame.

### Offer placement inside the body

Not a marker, but a format-visible rule that gets checked here: the offer must appear
woven into the spoken product-introduction paragraph, in the first half of the body.
Reviewers reading the document look for the offer above the midpoint. If it only
appears next to `CTA Overlay:`, the document fails review regardless of how it is
formatted.

---

## 7. `CTA Overlay:` end card

The last line of every concept section:

```
CTA Overlay: Find your first 100 real buyers. 50% off annual, this week.
```

Rules:

- Label is `CTA Overlay:` with a colon and a single space, plain text, own line, and it
  is the final line of the section before the next `###_` heading.
- It repeats the offer stated earlier in the body. Same offer, tightened wording. If the
  offer text here is the first time the reader sees the offer, that is the anti-pattern.
- It closes the specific argument of that concept first, then broadens. The line above
  it (the spoken CTA) does the same job in spoken register.
- No URLs, no `@` handles, no "link in bio" unless the brief specifies the destination.
- Never phrase it as a guaranteed or purchased outcome. "Find your first 100 real
  buyers" is fine. "Get 10K followers" is not.

---

## Worked example

The following is one complete concept section, formatted exactly as it ships.
`Lumenwell` is an invented brand for illustration. Never use a real client brand in a
reference or template.

---

> **Substantiation notice.** All performance figures, timelines, and outcomes spoken or
> shown in these scripts are placeholders written for structure and pacing. Before
> production, every number, claim, timeframe, and comparison must be replaced with a
> figure the brand can substantiate with documented evidence, or cut. Any result shown
> on screen must be typical of what a reasonable consumer can expect, or carry a clear
> and conspicuous disclosure of what is typical. Creators appearing in these scripts
> must disclose any material connection to the brand in-video and in the caption.
> Screen recordings must show real account data, not mockups, and must not be edited in
> a way that changes what the numbers mean. Nothing in these scripts guarantees a
> specific result.

### 001_The Empty Launch

`Lumenwell_Video_9x16_30s_UGCTalkingHead_001_V1_Batch4_EN`

**Concept contract:** This ad tests whether Lumenwell can create launch-day demand for a
solo founder, proven by launch-day orders and inquiries versus the failed first launch.

**Hook 1: Empty Launch / Pain Point**
Overlay: 4 orders. That was the whole launch day.
Opening Line: I spent six weeks building this and four people bought it on launch day.

**Hook 2: Wasted Ad Spend / Cost Frame**
Overlay: $900 in ads. 11 people reached checkout.
Opening Line: I paid for an audience for my first launch and still launched to an empty room.

**Hook 3: The Second Launch / Goal Frame**
Overlay: Launch two. Same product.
Opening Line: Same product, second launch, and this time I already knew who was waiting for it.

*Insert Opening Line*

The problem was never the product. It was that on launch morning I was announcing to a
list of people who had no idea what I made, and I found that out the expensive way.

*[Visual Cue: Founder at a kitchen table, phone flat on the surface, order notification screen showing 4 orders and a flat sales graph.]*

A founder in my group chat had already fixed this for herself, so I took her word for it
and grabbed the Lumenwell annual plan while it was 50% off. That was the whole decision.
I did not research it for three weeks.

Overlay: Peer recommendation. Annual plan, 50% off.

Here is what it actually does. You describe who the product is for in plain language, not
keywords, and it surfaces real people already talking about that exact problem in public.
Then it tells you which of them are worth a reply this week.

*[Visual Cue: Screen recording, Lumenwell audience panel, cursor typing a plain-language description then the results list populating with public posts.]*

Overlay: Real people. Public posts only. No password needed.

So I spent the four weeks before launch two answering those people. Not pitching. Just
answering.

*[Visual Cue: Screen recording, scrolling a reply thread, the founder's own replies visible with timestamps across different days.]*

By launch morning, 6,400 people had seen the build posts, 380 of them had replied or saved
something, and 74 had asked me directly when it was going live.

*[Visual Cue: Screen recording, analytics view, three numbers highlighted in sequence: 6,400 reach, 380 engagements, 74 direct inquiries.]*

Overlay: 6,400 reached. 380 engaged. 74 asked for the link.

Launch two did 61 orders in the first day. Same product, same price, same founder. The
only thing that changed was that the people I was announcing to already knew what I was
building.

*[Visual Cue: Split screen, launch one order screen at 4 orders beside launch two at 61 orders, both real dashboard views.]*

If your first launch went out to nobody, the fix is knowing who to talk to before launch
day, not louder ads on launch day. Same thing works if you are launching a second product
to an audience that only knows your first.

CTA Overlay: Know who is waiting before launch day. Annual plan, 50% off this week.

---

### Reading the example against the non-negotiables

Use this as the check when you format your own output:

- Contract line is present and its promise (launch-day demand) is the message from hook
  through CTA.
- Three hooks are three different entry points: the failed launch as pain, the ad spend
  as cost, the second launch as goal. Each is labelled with its angle.
- Offer enters at the product introduction, roughly a third of the way in, phrased as a
  lived action ("grabbed the annual plan while it was 50% off"), and the `CTA Overlay:`
  repeats it.
- Product introduction is a peer recommendation, specific to this narrative. A second
  script in the same batch must introduce the product a different way.
- Proof ladder runs reach (6,400) to engagement (380) to business outcome (74 inquiries,
  then 61 orders), and the business outcome is orders and inquiries, matching the
  contract exactly.
- Trust and compliance line is an overlay ("Real people. Public posts only. No password
  needed."), not a spoken sentence.
- Every visual cue is a proof frame. No atmosphere-only cues.
- CTA closes the launch argument first, then broadens to second-product launches.
- No language implying bought or guaranteed audience.

---

## Multiple concepts in one document

- Separate concept sections with a horizontal rule (`---`) on its own line.
- Concepts run in ascending numeric order regardless of the order you wrote them.
- The disclaimer block is not repeated between concepts.
- Before finalizing, run the batch-level swap test across the document as written: read
  the middle of each script back to back and confirm no two could trade places. The
  mechanism line, the trust overlay, the product introduction, and the proof beat must
  all be distinct per script. Formatting the document is also the last chance to catch a
  collapsed batch, because side by side is when repetition is obvious.

---

## Delivery

Close the document with a delivery section.

### Format

- Default deliverable is a single `.docx`, one file per batch, containing every concept
  section in order. Client-side reviewers comment inline in Word, so `.docx` is the
  default even when the working draft was markdown.
- File name for the document itself: `Brand_Scripts_BatchN_LANG.docx`, for example
  `Lumenwell_Scripts_Batch4_EN.docx`. The per-concept file name lines inside the
  document are for the video assets, not the document.
- Markdown or Google Docs only when the client asks for it by name. If Google Docs is
  requested, keep the same layout and preserve the backticked file name lines as inline
  code so the underscores survive.
- Spanish adaptations ship as a separate `.docx` with `_ES`, never as a second column or
  a second half of the English file.
- If a script shipped after two failed revision cycles, add a short flagged note here
  naming the concept number and the parameter that did not clear threshold. One line per
  flagged script. Do not bury the flag inside the script section, and do not ship a
  failing script without the flag.

### Summary table

Include this table at the end of the document, one row per concept in the batch. It is
the reviewer's map and the only summary content allowed in the deliverable.

| Concept | Contract | Hero proof | Offer placement | CTA type |
|---------|----------|------------|-----------------|----------|
| 001 | Lumenwell creates launch-day demand for a solo founder, proven by launch-day orders and inquiries vs. the failed first launch | 61 launch-day orders vs. 4, shown side by side on the real dashboard | Woven into the peer-recommendation product intro, 0:09 | Specific then broadened: fix launch-day silence, then second-product launches |
| 002 | ... | ... | ... | ... |

Column rules:

- **Concept**: the zero-padded number only, matching the heading. No title.
- **Contract**: the contract line for that script, trimmed of the "This ad tests whether"
  stem. It must match the contract inside the section word for word on product, promise,
  persona, and proof. A mismatch between the table and the section is a defect.
- **Hero proof**: the single strongest proof beat, with its number and how it is shown.
  This is the column the client scans to check proof matches promise, so name the
  business outcome, not the reach metric.
- **Offer placement**: where the offer enters, described by the construction plus an
  approximate timestamp. Any row reading "final line" or "CTA only" is a failed script,
  not a table entry.
- **CTA type**: what specific argument it closes, then what it broadens to. Two clauses.

Fill every cell. An empty cell means the script is not finished.
