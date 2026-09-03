---
name: batch-shoot-package
description: >-
  Turn a batch of paid-social scripts + brand onboarding docs into a complete
  Notion production package for the shoot: (1) storyboards, (2) a remote/on-set
  shooting guide, and (3) a schedule / production plan. Runs as a gated
  pipeline — Storyboards → Shooting Guide → Production Plan — pausing for
  explicit user approval between each phase before continuing. Every phase
  writes native to Notion under the client's Batch page. Use this skill
  whenever the user sends scripts + a client brief and wants shoot-ready
  storyboards, whenever they say "build the storyboards + shooting guide for
  this batch," "package this batch for production," "storyboards then guide,"
  "prep this batch for the shoot," or supplies a scripts doc + onboarding pack
  and asks you to prep the shoot. Also triggers when the user asks for just
  the shooting guide from existing storyboards, or just the production plan
  from an existing shooting guide — jump into the pipeline at the right gate.
---

# Batch Shoot Package

Turn a batch of paid-social scripts + brand onboarding into a complete Notion
production package: **storyboards → shooting guide → production plan**, gated by
explicit user approval between phases.

This skill exists because generating all three artifacts in one shot without
approval gates leads to expensive rework — a wrong storyboard structure
cascades into a wrong shooting guide, which cascades into a wrong production
plan. Gate every phase.

## The three artifacts

1. **Storyboards** — one Notion page per storyboard set, with a scene table
   per concept (Scene / Script Line / Overlay / Footage Name) and an
   Extracted Shot List per concept underneath.
2. **Shooting Guide** — one combined Notion page (or per-talent guides) with
   Client Overview, General Guidelines + compliance rules, Wardrobe, Props,
   Reusable Shot Library (with per-shot descriptions), Master Shotlist
   (per-concept `###` subsections with checklists + per-shot descriptions),
   per-concept Shooting Instructions (Tone / Delivery / Framing / Location /
   Audio), and Dropbox upload link.
3. **Production Plan** — day-by-day / unit-by-unit schedule with concepts as
   checklist items grouped by shoot unit + b-roll blocks grouped with emoji
   headers.

Each artifact has a detailed format spec in `references/` — read the spec
before generating that artifact.

## Workflow

### Phase 0 — Intake + confirm

Before writing anything, confirm what the user has and what they want.

**Read every input.** If the user sent scripts, onboarding docs, brand
snapshots, prior storyboards, existing shooting guides, or Notion links —
open them all first (use notion-fetch for Notion URLs, view for uploaded
files). Do this in parallel where possible.

**Ask the intake questions.** Some are decisions that lock the shape of every
downstream artifact; making assumptions here is the fastest way to waste the
user's time. Use `ask_user_input_v0` where the answer is a discrete choice —
buttons are faster than typing on mobile.

The questions to resolve, before writing:

- **Which artifacts?** Storyboards only, storyboards + shooting guide, or all
  three (storyboards + shooting guide + production plan)?
- **Split strategy for the shooting guide** — one combined guide for the
  whole batch, one guide per creator segment, one guide per named talent, or
  just the concepts the user names?
- **Coverage** — all concepts in the batch, only remote/live-action, remote
  + founder (exclude pure-AI), or user-picks-per-segment?
- **Where to write** — under which Batch page? Confirm the parent Notion
  page id before creating.
- **Placeholders that can wait** — due date, scripts doc URL, Dropbox
  request URL. If the user doesn't have them yet, add clearly-marked "TBD"
  placeholders and note them in the delivery message.

**Do not skip this phase even if the user says "just build everything."**
The split-strategy question in particular cannot be answered from scripts
alone — it depends on how the batch will be staffed. A one-line "combined
guide, all concepts, under the the colostrum brand's Batch 4 page" answer takes 5 seconds
and prevents a full rewrite.

### Phase 1 — Storyboards (Gate 1)

Read `references/storyboard-format.md` before writing the storyboards page.

Build one Notion page per storyboard set (usually one page per batch, but
follow the client's existing convention — check the batch's parent page for
prior storyboards and match). The page contains:

- A Reusable Shot Library section listing shots that appear across multiple
  concepts (the shots each creator films once and reuses).
- One `##` section per concept, containing:
  - **Format** line — production type, camera style, pacing, duration.
  - A scene table with columns: `Scene | Script Line | Overlay | Footage Name`.
  - Include Hook 1 / Hook 2 / Hook 3 rows at the top (three alternate opens
    per concept, standard practice).
  - One "Extracted Shot List" checklist beneath the table, listing each
    unique `Footage Name` from the table with a brief one-line description
    of what happens.

Every concept, every hook, and every scene in the source scripts must appear
in the storyboards. If a script beat is ambiguous (no location, no camera
direction), infer from the concept type + the client's onboarding tone
guidelines rather than asking one question at a time.

**Then STOP. Post the storyboards link and ask for approval before continuing.**

Use language like: *"Storyboards are live at [link]. Review and let me know
when to move to the shooting guide (or what to change)."*

Do not start the shooting guide until the user replies with an explicit
approval ("go", "approved", "next", "continue", "looks good", "yes"). If they
send edits, apply them, post the updated link, and ask again.

Silence is not approval. A comment on an adjacent topic is not approval.
Wait for the explicit go-ahead.

### Phase 2 — Shooting Guide (Gate 2)

Read `references/shooting-guide-format.md` before writing the guide.

Once the storyboards are approved, build the shooting guide page using the
storyboard content as the source of truth. The guide has these sections in
order:

1. Due-date + scripts-link callouts (placeholders if unknown).
2. Production-type legend callout (REMOTE CREATOR / 2-PERSON / FOUNDER
   SHOOT / FULLY AI / FACILITY / SCREEN-REC as needed).
3. Client Overview.
4. General Guidelines (Visual Expectations + Performance Standards + product-
   specific compliance rules pulled from the onboarding).
5. Wardrobe Inspiration (segment-matched).
6. Props (universal + concept-specific).
7. Reusable Shot Library — checklist grouped by category (ritual, lifestyle
   positive, lifestyle pain/before, unboxing, product heroes), **every shot
   has a one-line description of what happens on camera**.
8. Master Shotlist — **each concept is its own `###` subsection** with a
   checklist where every shot has a brief description matched to the
   storyboard's script line + beat.
9. Shooting Instructions — one subsection per concept with Format + Tone,
   Delivery, Framing, Location, Audio bullets.
10. Dropbox Upload Link (placeholder if unknown).

Match the split strategy the user chose in Phase 0 (combined vs per-segment
vs per-talent). If per-talent, create one page per talent under the batch
page, all with the same structure but only the concepts assigned to that
talent.

**Then STOP. Post the guide link(s) and ask for approval before continuing.**

Same rule as Gate 1 — wait for explicit approval before moving to the
production plan.

### Phase 3 — Production Plan (Gate 3, optional)

Only run this phase if the user asked for it in Phase 0 (or asks for it now).

Read `references/production-plan-format.md` before writing the plan.

Build one page per batch with:

- Production Overview (window, product lines, delivery format, compliance).
- One block per shoot unit (Founder Shoot Day, Remote Segment A / B / C…,
  Post-Only AI + Facility), each with:
  - Concepts as checklist items with a one-line setup note under each.
  - A B-roll block grouped by category with emoji headers (🏠 kitchen,
    🤒 pain state, 🌞 positive, ✈️ travel, 🏋️ gym, 🥤 soda ritual, 📱
    screen-rec, 🎨 CCTV, etc.). Match the emoji to the content, don't reuse
    the same emoji for unrelated blocks.
  - Each b-roll item tagged `[3rd POV]`, `[1st POV]`, `[CU]`, `[Talking
    Head]`, `[SR]` (screen-record), etc.
- Pre-Production Checklist at the end, grouped by Product & Assets, Talent &
  Scheduling, Post & Delivery. Every "client to confirm" item flagged.

**Then STOP.** Post the plan link, ask if anything needs changing, and hand
off.

## Format specs

Detailed layout, ordering, and Notion-markdown rules for each artifact live
in separate files. Read the relevant spec before generating that artifact —
they capture the exact structure the user expects (matched to their existing
templates).

- `references/storyboard-format.md` — Phase 1
- `references/shooting-guide-format.md` — Phase 2
- `references/production-plan-format.md` — Phase 3
- `references/notion-gotchas.md` — writing rules that apply to all three
  phases (real newlines vs escaped `\n`, approval retries, placeholder
  handling, callout syntax)

Read the gotchas file at the start of Phase 1 and keep the rules in mind for
every subsequent Notion write.

## Approval gate discipline

The core discipline of this skill is **not continuing past a gate without
explicit approval**. A dropped gate is the most expensive failure mode — it
usually means throwing away the shooting guide and rewriting it against a
revised storyboard.

Rules:

- After each phase, post the link and ask a clear yes/no question. Don't
  bury the ask.
- Wait for a message that clearly means "go." Ambiguous replies get a follow-
  up question, not a green light.
- If the user sends edits, apply them silently, post the updated link, and
  re-ask for approval. Don't advance to the next phase mid-revision.
- If the user pivots to an unrelated task before approving, note the pending
  gate briefly ("holding on shooting guide until you approve the
  storyboards") and help with the new task.
- If you must skip a gate (e.g. the user explicitly says "just run all three,
  I'll review at the end"), respect that — but confirm it in one sentence
  before starting so it's an explicit choice, not a drift.

## Notion writing checklist

Every write to Notion is subject to the rules in
`references/notion-gotchas.md`. The most important ones, repeated here:

- **Use real newlines in the markdown you pass to notion-create-pages /
  notion-update-page.** JSON-escaped `\n` gets stored literally as the letter
  n and destroys formatting. Write real line breaks in the content string.
- **Notion writes need explicit user approval in the client.** If a write
  comes back with "No approval received," retry once. If it fails again,
  consolidate remaining writes into a single call so the user only has to
  approve once.
- **Placeholders should be visible and greppable.** Use `TBD` in link URLs
  (e.g. `https://www.dropbox.com/request/TBD`) and in the callout text (e.g.
  `Due date: TBD — 48 hours after receiving products`). Call out the
  placeholders in the delivery message so the user knows what to fill in.
- **Never assume a placeholder is fine.** Ask for the real value in Phase 0
  if it's likely to be known. Only fall back to TBD if the user says they
  don't have it yet.

## Handoff

When all requested phases are complete, deliver:

- One link per artifact (Notion page).
- A one-line list of any placeholders left as TBD.
- A one-sentence note on any judgment call the skill made (e.g. "put the
  guide under Batch 4 rather than the top-level client page — easy to move
  if you'd rather it live elsewhere").

Then stop. Don't offer follow-up work the user didn't ask for.
