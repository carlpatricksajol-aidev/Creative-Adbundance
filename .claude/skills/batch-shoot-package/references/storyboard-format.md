# Storyboard format (Phase 1)

Read this before writing a storyboards page. The storyboard is not a document for humans only.
It is a **machine contract**: the Footage Renamer parses this exact table to sort a creator's raw
Dropbox uploads into storyboard-matched folders, and the AI Video Editor assembles from the result.
A storyboard that reads fine to a person but breaks the contract silently mis-sorts a whole shoot.

Every rule below that is marked CONTRACT is parsed by code. Breaking one does not raise an error.
It produces a wrong answer quietly, which is worse.

## The five columns (CONTRACT)

The scene table has exactly these five column headers, spelled exactly this way:

```
| Scene | Script Line | Overlay | Footage Name | Shot List Explanation |
```

- The parser matches headers by **exact string, after trim and lowercase**. There is no fuzzy
  matching, no synonyms, no partial matching. `Footage` misses. `Footage Names` misses.
  `Shot List` misses.
- A missed header does **not** error. It resolves to an empty column. A mistyped `Footage Name`
  turns every b-roll scene in the batch into a talking-head scene and reports every shot as
  missing.
- Column ORDER does not matter to the parser and extra columns are ignored, but write them in the
  order above anyway so every page in the workspace looks the same.
- The header row is the first row of the table. A table with only a header row parses to nothing.

Never rename a column to be more descriptive. The name is an interface, not a label.

## Column by column

### Scene (CONTRACT: required, non-blank)

The scene identifier. Accepted shapes, all of which the pipeline understands:

- `Hook 1`, `Hook 2`, `Hook 3` for the three alternate opens
- `Scene 1`, `Scene 2`, ... for the body beats
- `CTA` for the closing beat

**A row with a blank Scene cell is silently dropped.** Not flagged, not warned, dropped. If
someone clears a Scene cell while editing, that row's shot vanishes from the shot list and never
appears as a missing shot either. Never write a spacer row with content in other columns, and
never rely on a blank Scene to mean "same scene as above" - repeat the scene id instead.

Scene ids are slugged internally (`Scene 7` becomes `scene_7`, `Hook 1` becomes `hook_1`), so two
scenes whose ids differ only in punctuation or case collide. Keep them sequential and distinct.

### Script Line

The spoken line for that beat, taken from the approved script. Verbatim where a line exists.
For a pure b-roll beat with no dialogue, write the VO line if there is one, otherwise a short
description of what is heard (`no dialogue, ambient only`).

Keep one beat per row. Do not merge two spoken lines into one row to save space: the row is the
unit the renamer matches footage against.

### Overlay

The on-screen text for that beat, exactly as it should be burned in. Empty is fine and common.

Write the words only, not instructions about them. `Under $40/month` is an overlay.
`add a bold overlay with the price` is a note, and belongs in Shot List Explanation.

### Footage Name (CONTRACT: the join key)

This is the single most load-bearing cell in the whole package. The renamer derives a slug from it
and matches the creator's uploaded files against that slug.

**Rules:**

1. **Never put a comma in a Footage Name.** The cell is split on `+` **and** on `,`. A name like
   `kitchen counter, morning light` forks into two phantom shots, which produces two files the
   creator never shot and two false "missing shot" lines in the report. Write
   `kitchen counter morning light` instead.
2. **Join multiple shots in one scene with ` + `.** `1stPOV_hand pressing towel + 1stPOV_wrapping towel`
   is two shots on one beat. That is the only intended separator.
3. **`Talking Head` is a scene type, not a shot.** Write it alone in the cell to mark a
   talking-head beat. It is recognised case-insensitively and with spaces, underscores or hyphens
   (`Talking Head`, `talking_head`, `TALKINGHEADS`). It is stripped out of mixed cells, so
   `Talking Head + 3rdPOV_pouring` yields exactly one shot.
4. **Blank, `-`, or an en/em dash all mean talking head.** A cell with nothing alphanumeric in it
   produces no shots.
5. **Prefix POV shots** with `1stPOV_` or `3rdPOV_`. `1stPOV_` is hands or object only, no person
   in frame. `3rdPOV_` has the person in frame. The pipeline auto-corrects a wrong prefix from the
   actual footage, so a wrong guess is recoverable, but get it right so the creator knows what to
   shoot.
6. **Make every Footage Name unique across the batch, by more than punctuation.** The slug
   flattens every run of non-alphanumeric characters to a single underscore and lowercases
   everything, so `Towel Close-Up` and `towel close up` are the same slug and collide on lookup.
   Two different shots with colliding slugs cannot be told apart.
7. **A reused shot keeps the same Footage Name everywhere it appears.** That is how the Reusable
   Shot Library works: the creator films it once, and every scene that names it resolves to that
   one file.
8. Keep names short and physical: what is in frame, not why. `3rdPOV_scooping into glass` beats
   `3rdPOV_demonstrating how easy the ritual is`.

### Shot List Explanation

One line describing what actually happens on camera for that shot, written for the creator. This
is the column that becomes the shot description in the Master Shotlist of the shooting guide, so
write it as an instruction: `She scoops one level scoop into a glass of water, no cut, hands in
frame only.`

Leave it empty for talking-head rows where the Script Line already says everything.

## Page structure

One Notion page per storyboard set, usually one page per batch. Check the batch's parent page for
prior storyboards first and match whatever convention the client already has.

```
# <Client> Batch <N> Storyboards

## Reusable Shot Library
- [ ] <Footage Name> - <one line on what happens on camera>
- [ ] <Footage Name> - <one line on what happens on camera>

## 001_<Concept Title>
Format: <production type, camera style, pacing, duration>

| Scene | Script Line | Overlay | Footage Name | Shot List Explanation |
| --- | --- | --- | --- | --- |
| Hook 1 | ... | ... | ... | ... |
| Hook 2 | ... | ... | ... | ... |
| Hook 3 | ... | ... | ... | ... |
| Scene 1 | ... | ... | ... | ... |
| Scene 2 | ... | ... | ... | ... |
| CTA | ... | ... | ... | ... |

### Extracted Shot List
- [ ] <Footage Name> - <one line description>
- [ ] <Footage Name> - <one line description>

## 002_<Concept Title>
...
```

### The concept heading (CONTRACT)

`## 001_Concept Title` - a zero-padded three-digit number, an underscore, then the title. The
number is the join key across the whole ecosystem: concept 1 in the deck is `001` here, in the
scripts doc, and in the footage folder. Concept 1 is `001`, never `1` or `01`.

The heading must be a real heading block, not bold text in a paragraph. The parser walks headings
to find where one concept's table ends and the next begins.

### The Format line

Directly under the concept heading, one line naming production type, camera style, pacing and
duration:

`Format: remote creator, handheld iPhone, fast jump cuts, 30s.`

It tells the creator how to shoot before they read a single scene, and it is what the shooting
guide's Shooting Instructions section expands.

### Hook rows come first

Every concept carries `Hook 1`, `Hook 2` and `Hook 3` as the first three rows, one per hook variant
from the script. They are alternate opens: the creator shoots all three, the editor picks. Their
Footage Name is usually `Talking Head`, but if a hook is visual it gets its own shot name.

### Extracted Shot List

One checklist under each concept's table, listing every **unique** Footage Name that appears in
that table, each with a brief description. Derive it from the table, never write it independently:
a shot list that disagrees with the table is the most common defect in a hand-made storyboard, and
the renamer trusts the table.

Talking-head rows contribute nothing to the shot list.

## Coverage rule

Every concept, every hook and every scene in the source scripts must appear in the storyboards.
If a script beat is ambiguous (no location, no camera direction), infer it from the concept type
plus the client's onboarding tone guidelines. Do not stop to ask one question at a time; make the
call, and note the calls you made in the delivery message.

## Before you post the page

Run this checklist against every concept table:

- [ ] Header row reads exactly `Scene | Script Line | Overlay | Footage Name | Shot List Explanation`
- [ ] Every row has a non-blank Scene cell
- [ ] No Footage Name contains a comma
- [ ] Multiple shots in one cell are joined with ` + `
- [ ] Every talking-head beat says `Talking Head` or is blank, not `n/a` or `none`
- [ ] Every Footage Name is unique across the batch after lowercasing and flattening punctuation
- [ ] A shot reused in several scenes uses the identical name every time
- [ ] Concept headings are `NNN_Title` with a zero-padded three-digit number
- [ ] Each concept has Hook 1, Hook 2, Hook 3 rows
- [ ] Each Extracted Shot List matches the unique Footage Names in that concept's table exactly
- [ ] Every concept in the scripts doc has a section here

Then post the link and stop for approval. Do not start the shooting guide until the user
explicitly approves.
