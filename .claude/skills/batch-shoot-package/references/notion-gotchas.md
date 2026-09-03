# Notion Writing Gotchas (All Phases)

Read this at the start of Phase 1 and keep it loaded for every Notion write in
Phases 1, 2 and 3. These are not style preferences. Each rule exists because
it has already broken a page a client opened.

Two things are true of every write this skill makes. The output is
client-facing, so mangled formatting is not cosmetic, it is a page a creator
cannot shoot from. And later phases read earlier pages back as source of
truth, so a page written sloppily in Phase 1 corrupts Phases 2 and 3
silently, because the reader is you and you will happily parse garbage.

There are also two completely different kinds of "approval" here. Do not
confuse them:

- **Client-side write approval** is the Notion connector asking the user to
  approve a tool call. Mechanical. Retry-able. Covered in section 2.
- **Phase gate approval** is the user reading the finished artifact and saying
  go. Editorial. Never retry-able, never inferable. Covered in section 5.

---

## 1. Use REAL newlines in markdown content

**Rule:** the markdown you pass to `notion-create-pages` or
`notion-update-page` must contain actual line-break characters. Never a
JSON-escaped backslash followed by the letter n inside a string that is already
being serialized for you.

**The failure it prevents:** when the escape is doubled, Notion stores the two
characters literally. The page renders as one enormous paragraph with the
letter `n` sprinkled through it where every line break should have been. It
looks like this to the client:

```
## Concept 01nFormat: Remote creator, handheld, 30snn| Scene | Script Line |n
```

Every heading, every table, every checklist collapses into that single line.
Notion does not error. The write succeeds. You get a green result and a
destroyed page, so this failure is invisible unless you re-read the page or
the client tells you.

**Wrong** (the two characters backslash and `n`, typed into the content, which
is what an escaped newline collapses to):

```
content: "## Concept 01\n\n**Format:** Remote creator, handheld, 30s"
```

**Right** (a real multi-line string, line breaks pressed as line breaks):

```
content: "## Concept 01

**Format:** Remote creator, handheld, 30s

| Scene | Script Line | Overlay | Footage Name |
| --- | --- | --- | --- |
| Hook 1 | ... | ... | ... |
"
```

**Correct pattern:** compose the page body as a real multi-line block of text.
If you find yourself typing a backslash next to an `n` for any reason other
than inside a code block meant to display one, stop and rewrite the string.
Then, after the first create call of each phase, `notion-fetch` the page back
and confirm headings sit on their own lines. One fetch per phase is cheap. A
rewritten storyboard set is not.

---

## 2. Notion writes need explicit user approval in the client

**Rule:** every `notion-create-pages` and `notion-update-page` call may come
back with "No approval received" instead of a result. When it does:

1. Retry the identical call **once**. Approval prompts get missed, dismissed
   by accident, or time out. One retry resolves most of these.
2. If the retry also fails, **stop issuing separate writes**. Consolidate
   every remaining write for that phase into ONE call so the user approves a
   single time, then send it.
3. Tell the user in one line what you are doing: "The write needs approval on
   your end. Sending it as one call so you only approve once."

**The failure it prevents:** a phase that writes a parent page plus six child
pages is seven approval prompts. If prompt three is missed and you keep firing
writes, you end up with a half-built package: concepts 01 and 02 present, 03
missing, 04 to 06 present. The hole is not visible in the tool results because
every other call reported cleanly, so Phase 2 reads the page back and quietly
builds a shooting guide that is missing a concept.

**Wrong:**

```
create page "Storyboards"            -> ok
create page "Concept 01"             -> ok
create page "Concept 02"             -> No approval received
create page "Concept 03"             -> ok        (kept going, now there is a hole)
```

**Right:**

```
create page "Storyboards"            -> ok
create page "Concept 01"             -> ok
create page "Concept 02"             -> No approval received
create page "Concept 02"  (retry)    -> No approval received
create ONE call containing Concepts 02, 03, 04, 05, 06  -> single approval, complete
```

**Correct pattern:** prefer few large writes over many small ones from the
start. One `notion-create-pages` call carrying the whole storyboard body beats
one call per concept, both for approval friction and for atomicity. Split only
when the artifact genuinely needs separate pages (per-talent shooting guides,
for example).

**Never** interpret "No approval received" as a rejection of the content, and
never treat it as a phase gate signal. It is a client-side plumbing event. It
says nothing about whether the user liked the storyboards.

---

## 3. Placeholders must be visible and greppable

**Rule:** an unknown value is written as the literal token `TBD`, placed where
a human will trip over it, and repeated in the delivery message. It goes
inside link URLs rather than instead of them
(`https://www.dropbox.com/request/TBD`) and inside callout text spelled out
(`Due date: TBD, 48 hours after receiving products`).

**The failure it prevents:** silent placeholders ship. A callout that just
says "Due date:" with nothing after it reads as finished, and a plausible
invented URL is worse because someone clicks it. `TBD` in the URL path keeps
the link shape intact, so the layout is final, while making the gap
unmissable and searchable: one search for `TBD` finds every open item.

**Wrong:**

```
> Due date:
> Scripts: (link coming)
> Upload footage: https://www.dropbox.com/request/abc123
```

The first two read as bugs, and the third is a guess wearing a real URL. That
is the worst of the three: a fabricated deliverable.

**Right:**

```
> **Due date:** TBD, 48 hours after receiving products
> **Scripts doc:** https://www.notion.so/TBD
> **Upload footage:** https://www.dropbox.com/request/TBD
```

**Correct pattern:**

- Use the exact string `TBD` in caps. Not "tbd", not "[TBD]", not "???", not
  "XXX". One token, so one search finds all of them.
- Keep the surrounding sentence complete, so replacing `TBD` with the real
  value is the only edit needed.
- In the delivery message, list every placeholder explicitly with its page and
  section: "Two TBDs left: the Dropbox request URL in the Upload section, and
  the due date in the top callout."
- Count them. If the delivery message says two and the page has three, that is
  a defect. Search the page content you composed for `TBD` before delivering
  and use the actual count.

---

## 4. Never assume a placeholder is fine

**Rule:** `TBD` is a fallback after asking, not a shortcut instead of asking.
In Phase 0, ask for every value that is likely already known.

The values that are usually known and must be asked for:

- The due date, or the rule that produces it.
- The scripts doc URL (the user almost always has this open already, since
  they sent the scripts).
- The Dropbox or file-request URL, if the client already has a batch folder.
- Talent names, if the split strategy is per-talent.
- The parent Batch page (see section 8).

**The failure it prevents:** a package delivered with four TBDs when three of
them were already in the message the user sent, or one question away. The user
then does data entry the skill should have done, on a page they are reviewing
for content. It reads as unfinished work rather than a pending dependency.

**Correct pattern:** one batched Phase 0 question covering all of them, not
four questions across four turns. Something like: "Before I write, three
things: due date or the rule for it, the scripts doc link, and the Dropbox
request link if the batch folder exists yet. Anything you do not have I will
mark TBD."

Only after the user says they do not have a value does it become `TBD`. Then
it is a known open item, not a gap.

---

## 5. Approval gate discipline

**Rule:** no phase begins until the previous phase has been explicitly
approved by the user in their own words.

This is the most expensive failure mode in the skill. A dropped gate means a
shooting guide built against a storyboard structure the user was about to
change, so the guide gets thrown away and rewritten, which then invalidates
the production plan built on top of it. The cost compounds down the pipeline.

**What is NOT approval:**

- **Silence.** No reply is not a yes. Wait.
- **A comment on an adjacent topic.** "Can you also send me the old batch
  link?" is not approval. Answer it, then re-ask the gate question.
- **Ambiguous replies.** "Interesting", "ok", "got it", "thanks", "seen it",
  a reaction on a different message. These get a follow-up, not a green light:
  "Is that a go on the storyboards, or do you want changes first?"
- **A Notion write approval.** Approving the connector prompt is not approving
  the content. See section 2.
- **Your own read of the quality.** The artifact being good is not the gate.

**What IS approval:** a message that clearly means proceed. "go", "approved",
"next", "continue", "looks good", "yes", "build the guide", "ship it".

**If the user sends edits:** apply them, repost the link, re-ask. Do not
advance mid-revision. Applying edits is not approval either: the user has told
you what was wrong, not that what remains is right.

```
right: post link -> ask -> edits -> apply -> post link again -> ask again
wrong: post link -> ask -> edits -> apply -> start next phase
```

**If the user pivots to an unrelated task before approving:** note the pending
gate in one short line ("holding the shooting guide until you approve the
storyboards") and help with the new task. A pivot is not implied consent, and
one line is the whole reminder.

**If the user waives the gates** ("just run all three, I will review at the
end"): respect it, but confirm in one sentence first so it is an explicit
choice rather than drift. "Running all three straight through, no stops, three
links at the end."

---

## 6. Notion markdown shapes that actually round-trip

These shapes survive the write and come back intact from `notion-fetch`. Use
them. Anything not on this list is a gamble, and a gamble on a client-facing
page is a defect.

### Headings, inline marks, bullets

```
## Concept 01 - Kitchen Ritual
### Shot list

**Format:** Remote creator, handheld, 30s

- Visual expectations
  - Natural window light, no overhead fluorescents
  - Phone stabilized, never handheld while walking
```

Use `##` and `###` only. Reserve `#` for nothing: the title field already sets
the page title, so a `#` heading in the body duplicates it. Heading text is
load-bearing for later phases (section 7).

A bold label at the start of a line is the reliable way to make a label/value
pair. Do not build label columns with tabs or padded spaces, and use inline
code for footage names when they appear inside prose.

Two levels of bullet nesting is safe. Three renders but gets hard to read on
mobile, which is where creators actually open these pages. Keep to two.

### Checklists (to-do blocks)

The shot lists in all three artifacts are checklists, because creators tick
them on set. Write them as `- [ ]`:

```
- [ ] FOOTAGE_01_kitchen_pour - talent pours the sachet into a glass, CU on hands
- [ ] FOOTAGE_02_first_sip - talent takes the first sip, 3rd POV, mid shot
```

Never use a plain bullet (`-` or `*` with no checkbox) for a list that is
meant to be ticked, and never write `- [x]` in a delivered artifact: nothing
is done yet at delivery time. Every checklist item in a shot list carries a
one-line description after the footage name, because a bare footage name is
not a shootable instruction.

### Callouts

Blockquote syntax is the shape that round-trips as a Notion callout:

```
> **Due date:** TBD, 48 hours after receiving products

> Production types in this guide: REMOTE CREATOR, 2-PERSON, FOUNDER SHOOT, FULLY AI
```

Keep a callout to a few lines. A callout is a highlight, not a container:
never put a table or a checklist inside one, and never put the only copy of a
load-bearing value there without also putting it in a normal section (see
section 7).

### Tables

**The header row is the first row. Write it as such.** There is no separate
header property to set: whatever you put in row one becomes the header.

```
| Scene | Script Line | Overlay | Footage Name |
| --- | --- | --- | --- |
| Hook 1 | "I tried this for 30 days" | 30 DAYS | FOOTAGE_01_hook_a |
| Hook 2 | "Nobody told me about this" | (none) | FOOTAGE_02_hook_b |
| 1 | "It starts in the morning" | (none) | FOOTAGE_05_morning |
```

Rules for tables in this skill:

- The separator line (`| --- |`) must have exactly as many cells as the header
  row, and every data row the same. A mismatch shifts columns silently, so the
  Overlay text lands in the Footage Name column and the shot list extracted
  from it is wrong. Do not drop trailing empty cells.
- Never leave a cell truly blank when it means "nothing". Write `(none)`. A
  blank cell is indistinguishable from a dropped cell on read-back.
- No line breaks inside a cell (a `<br>` will not render), no nested tables,
  no merged or spanning cells, no formatting of the separator row.
- Do not use a table where a checklist belongs. Shot lists are checklists so
  they can be ticked; scene breakdowns are tables so they can be read across.

### Dividers and links

`---` on its own line, with a blank line above and below, between major
sections only. Never immediately after a table, where it can be parsed as
part of the table.

Both `[Scripts doc](https://www.notion.so/TBD)` and a bare URL round-trip.
Use a bare URL for anything the user or a creator must copy, such as the
Dropbox request line.

### Shapes to avoid entirely

- **Toggles and column layouts.** Toggle content is easy to miss on mobile,
  which is where creators read these pages on set, and columns do not
  round-trip predictably. Everything must be visible without a click.
- **Raw HTML** (including `<br>`), footnotes, checkboxes inside table cells,
  image embeds from local file paths, emoji-only headings with no text
  (unsearchable), and space-padded character alignment.

---

## 7. Structure pages so a later phase can read them back

Phase 2 reads the storyboards. Phase 3 reads the shooting guide. Both read via
`notion-fetch`, which returns the page as markdown. So the page is not only a
client deliverable, it is the input format for the next phase. Write it as
both.

**Concept identity must be stable and unique.** Number every concept with a
zero-padded number in the heading, and keep that number identical across all
three artifacts.

```
## 01 - Kitchen Ritual
```

Concept `01` in the storyboards is concept `01` in the shooting guide and
concept `01` in the production plan. Never renumber between phases, never
reorder, and never let two concepts share a number even if one was dropped:
leave the number retired rather than reusing it.

**Footage names are identifiers, not prose.** Copy them character for
character between artifacts. A footage name that appears as
`FOOTAGE_01_kitchen_pour` in the storyboard table and `Footage 01 kitchen
pour` in the guide is a broken join that a human then has to reconcile on set.
Keep one casing convention for the whole batch and do not "tidy" names when
copying.

**Section headings are the anchors.** Use the exact section titles the format
specs name (Reusable Shot Library, Master Shotlist, Shooting Instructions,
Pre-Production Checklist). Do not paraphrase them into "Shots we reuse" or
"The master list". The next phase locates content by these headings.

**One fact, one home.** Every load-bearing value lives in exactly one
canonical place. The due date lives in the top callout, the upload link in the
Dropbox section. Do not write the due date into three sections: the moment it
changes, two of them are wrong and nothing marks which is canonical. And if
Phase 3 needs a value, it must exist in a normal headed section, not only
inside a callout.

**Prefer one page per artifact over many small pages.** A single storyboards
page with one `##` per concept is one fetch for Phase 2. Fifteen child pages
is fifteen fetches, fifteen approval prompts on the way in, and fifteen
chances for a hole like the one in section 2. Split only when the format spec
or the user's chosen split strategy requires it.

**Re-read before you build on it.** At the start of Phase 2 and Phase 3,
fetch the page from the previous phase rather than working from what you
remember writing. The user may have edited it during the gate, and their edits
are the source of truth, not your draft.

---

## 8. Confirm the parent page before creating anything

**Rule:** never call `notion-create-pages` without a parent page id the user
has confirmed in this conversation.

**The failure it prevents:** pages created in the wrong place. A storyboard
set that lands at the top level of a workspace, under last quarter's batch, or
in a private area the creators cannot see is worse than no page: the user has
to find it, move it, fix the sharing and re-send the link, and any link
already sent to a creator breaks.

**Correct pattern:**

1. Ask in Phase 0 which Batch page the package goes under.
2. Resolve it to a real page with `notion-search` or `notion-fetch`, and
   confirm the title you found matches what the user meant. A search for
   "Batch 4" that returns three pages named "Batch 4" across different clients
   is not a resolution, it is a question.
3. Read that parent page before writing under it. Prior storyboards or guides
   living there set the naming and structure convention this batch must match.
   Matching the client's existing convention beats matching the format spec's
   default.
4. Restate where you are writing, in one line, before the first write: "Writing
   the storyboards under Batch 4 in the client workspace." That is the last
   cheap moment to catch a wrong parent.

If the user has not named a parent and cannot be asked, do not guess a
location. Stop and ask. There is no safe default parent.

---

## 9. Pre-write checklist

Run this before every `notion-create-pages` and `notion-update-page` call. It
takes seconds and catches every failure in this file.

1. **Parent confirmed?** A real page id, confirmed by the user in this
   conversation, with its existing conventions read. (Section 8.)
2. **Real newlines?** The content string has actual line breaks, and no
   backslash-n sequence anywhere except inside a code block that intends to
   show one. (Section 1.)
3. **Format spec read?** The spec for this artifact has been read in this
   conversation, not recalled. Section order and section titles match it.
4. **Tables valid?** Header row is row one, separator cell count equals header
   cell count, every data row has the same cell count, no blank cells (use
   `(none)`), no line breaks inside cells. (Section 6.)
5. **Checklists are checklists?** Shot lists use `- [ ]`, unticked, and every
   item has a one-line description after the footage name. (Section 6.)
6. **Identifiers consistent?** Concept numbers zero-padded and identical to
   the previous artifact. Footage names copied character for character.
   (Section 7.)
7. **Placeholders explicit?** Every unknown is the literal token `TBD`, inside
   a complete sentence or a URL path. Counted, so the delivery message can
   name them all. (Section 3.)
8. **Placeholders earned?** Each `TBD` is there because the user said they do
   not have the value, not because it was not asked for. (Section 4.)
9. **Consolidated?** Writes for this phase are batched into as few calls as
   possible, and are ready to be merged into one if approval fails twice.
   (Section 2.)
10. **No forbidden shapes?** No toggles, no columns, no raw HTML, no nested
    tables, no `#` heading in the body, no data living only in a callout.
    (Sections 6 and 7.)
11. **Gate clear?** The previous phase has explicit approval in the user's own
    words. If in doubt, it is not approved. (Section 5.)

After the first write of each phase, fetch the page back and confirm headings
and tables render as intended. Then post the link and ask the gate question.

---

## 10. Quick reference

| Symptom the client sees | Cause | Section |
| --- | --- | --- |
| One giant paragraph with stray `n` characters | Escaped newlines in content | 1 |
| A concept is missing from the package | Kept writing after a failed approval | 2 |
| Empty "Due date:" or a dead upload link | Invisible or fabricated placeholder | 3 |
| Client fills in values they already gave you | Placeholder never asked for | 4 |
| Shooting guide rewritten from scratch | Gate advanced without approval | 5 |
| Overlay text appears in the Footage Name column | Table cell counts mismatched | 6 |
| Guide references a shot that does not exist | Footage name retyped, not copied | 7 |
| Page lands in the wrong workspace area | Parent not confirmed before create | 8 |
