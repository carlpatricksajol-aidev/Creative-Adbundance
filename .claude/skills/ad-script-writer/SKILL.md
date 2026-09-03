---
name: ad-script-writer
description: Turn an approved ad concept deck (plus brand onboarding docs) into direct-response-ready paid social scripts for ANY brand, in the agency house format — labeled hook variants, early offer placement, narrative-matched proof ladders, and overlay-driven trust lines. Runs a two-agent pipeline internally — a Script Writer drafts, then a Creative Strategist reviews every script against a 10-parameter DR scorecard and forces revisions before anything is delivered. Use whenever the user provides a concept deck, loglines, or approved concepts and wants scripts — "write the scripts for Batch N", "turn these concepts into scripts", "script this deck", "generate scripts from the onboarding" — even without the word "script" if the deliverable is spoken/VO ad copy. Also use to revise an existing scripts batch against the DR scorecard.
---

# Ad Script Writer

Converts approved ad concepts into client-ready, direct-response paid social scripts. Built from real client revision data: the core failure mode of AI-written scripts is that they **translate the WHO and the WHAT well, but collapse on the HOW and the PROOF** — every script drifts into the same "problem → AI finds relevant people → real engagement → no bots → offer at the end" template regardless of what the concept was actually testing.

This skill exists to prevent that collapse. Read this whole file before writing anything.

## Inputs

1. **Concept deck** (required) — approved concepts/loglines, each with a format, angle, and narrative.
2. **Brand onboarding / brief** (strongly recommended) — product mechanism, claims, testimonials, offer, compliance rules. If missing, research the brand's site for real substantiated claims before inventing any proof.
3. **Previous batch scripts** (if they exist) — match numbering continuity and calibrate voice.

If the concept deck contains more concepts than requested, confirm which ones are in scope before writing.

## Pipeline (run in order, never skip the review gate)

```
Intake → Concept Contracts → SCRIPT WRITER pass → CREATIVE STRATEGIST review
  → revise (max 2 cycles) → batch-level swap test → format → deliver
```

### Step 1 — Intake

- Read every concept. Read the onboarding/brief. Read the brand site if claims need verifying.
- Extract: product mechanism (in the brand's language), the current offer, real testimonial numbers, compliance restrictions, banned/restricted terminology.
- Collect ALL substantiated proof points available (real customer results, platform stats, guarantees). These are your first-choice proof; invented numbers are a fallback and must be plausible and concept-matched.

### Step 2 — Concept Contracts (the single most important step)

For EACH concept, before writing a word of script, write a one-line **contract**:

> **"This ad tests whether [PRODUCT] can [SPECIFIC PROMISE] for [PERSONA], proven by [MEASURABLE OUTCOME]."**

Examples of real contracts:
- "…can create launch-day demand for a founder, proven by launch-day orders/inquiries vs. the failed first launch."
- "…can replace cold outbound for a personal trainer, proven by inbound consultation requests."
- "…can reduce referral dependence for a service provider, proven by non-referral inquiries per month."
- "…can keep a photographer booked off-season, proven by weekly inquiries → booked shoots."
- "…can make paid traffic convert better, proven by profile/engagement lift BEFORE scaling spend."

The contract's promise must stay the **dominant message from hook to CTA**. The proof must **close the exact argument the narrative opens** — not default to generic followers/comments/DMs. If the proof doesn't match the promise, the script fails review.

### Step 3 — Script Writer pass

Adopt the persona of a senior UGC scriptwriter. Draft every script following `references/writing-rules.md` (read it now — it contains the hook system, offer placement, product-introduction variation, proof ladder, overlay system, and CTA rules, each with real before→after examples from client revisions).

Non-negotiables baked into every draft:
- **3 hooks = 3 different entry points** (different pain / goal / persona / root cause), each labeled with its angle: `Hook 1: Empty Launch / Pain Point`.
- **Offer enters early**, woven into the product introduction ("I grabbed their annual plan while it was 50% off"), NOT saved for the final line. A `CTA Overlay:` end card repeats it.
- **Product introduction varies per script** and is determined by the narrative (peer recommendation, "took it off my to-do list", "flipped the order", second discovery channel…). Never reuse "That's where X came in" across a batch.
- **Proof ladder**: reach metric → engagement metric → business outcome. Concrete numbers, plausible, matched to the contract.
- **Trust/compliance line as Overlay** (`Overlay: No bots. No password needed.`), not spoken boilerplate in every script.
- **Mechanism explanation adapted to the use case** (local couples planning weddings ≠ niche competitor audiences ≠ pre-launch community).
- **CTA closes the specific argument** of that concept, then broadens the audience callout ("If you're a creator, entrepreneur, or service provider still relying on…").
- **Visuals are proof, not decoration** — if the format is Screen Share, the numbers on screen carry the persuasion; if Comment Response, the comment itself must contain enough context to work as the hook.
- **Compliance-safe language** — never phrasing that implies followers are purchased or guaranteed as a number ("get 10K followers"). Use "community", "real people", "discovery", "reach". Respect any client restricted-terms list.

### Step 4 — Creative Strategist review (mandatory gate)

Switch personas: now a senior creative strategist who did NOT write the drafts. Score every script against the 10-parameter scorecard in `references/dr-scorecard.md` (read it now). Scores are 1–10 per parameter.

**Pass thresholds** (from real client grading of failed AI output — these were the weak spots):
- Proof Matching Narrative Promise ≥ 8 (client scored the failed batch 5.5)
- Offer Placement ≥ 8 (failed batch: 5.5)
- Product Introduction ≥ 8 (failed batch: 6.5)
- Differentiation Across Concepts ≥ 8 (failed batch: 6.5)
- Every other parameter ≥ 7

Any script below threshold goes back to the Script Writer with the strategist's specific notes (quote the failing lines, prescribe the fix). Maximum 2 revision cycles; if still failing, deliver with a flagged note rather than silently shipping a weak script.

### Step 5 — Batch-level swap test

Read the full batch as a set. For every pair of scripts, ask: **could these two swap middle sections without anyone noticing?** If yes, the batch has collapsed into the template — rewrite the offending middles (mechanism line, trust line, proof beat) until each script has a distinct reason the product matters. Also verify no two scripts share the same product-introduction construction or the same offer phrasing.

### Step 6 — Format and deliver

Use the exact house layout in `references/output-format.md` (read before formatting). Key points: FTC substantiation disclaimer at top, `###_Title` heading, `Brand_Video_SIZE_LENGTH_Format_###_V#_BatchN_LANG` file-name line, labeled hooks with Overlay + Opening Line, `*Insert Opening Line*` at script start, inline `*[Visual Cue: …]*` and `Overlay:` markers, `CTA Overlay:` end card where used.

Deliver as .docx (drop-in ready for Google Drive) unless the user asks for native Google Doc/Notion. Present a short summary table: concept # | contract | hero proof | offer placement | CTA type.

## Reference files

- `references/writing-rules.md` — Read at Step 3. Full craft rules with real before→after examples for hooks, offer, product intro, proof, overlays, CTA.
- `references/dr-scorecard.md` — Read at Step 4. The 10-parameter review rubric with what each score level looks like.
- `references/output-format.md` — Read at Step 6. Exact document layout with a full worked example script.

## Anti-patterns (instant review failures)

- Proof is "more comments / DMs / growth" when the contract promised bookings, consults, orders, or inquiries.
- The offer appears only in the final sentence.
- Two or more scripts introduce the product with the same construction.
- All three hooks are the same thought reworded.
- The trust line ("no bots / no password") is spoken verbatim in every script.
- Long atmospheric setup that delays the product past the halfway point.
- Any phrasing that reads like followers are bought or numerically guaranteed.
