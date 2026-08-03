# AI Video Editor

_Project documentation in the founders' system-map format. Last updated 2026-08-04._

Raw creator footage plus a storyboard goes in. An editable Premiere timeline comes out, roughly 90 percent cut, for a motion designer to finish.

---

## Project Name

**AI Video Editor** (internal working name; the intake form is branded "Ad Assembler" inside the Creative Ad-Bundance studio).

Live at **https://videoeditor.srv1486031.hstgr.cloud** (password-gated), reachable from the studio sidebar at form.creativeadbundance.com.

## Objective

Remove the mechanical hours from cutting a paid-social ad. For every ad a designer currently watches every take, finds the usable one, trims the heads and tails, lays b-roll against the right line of script, and types and times captions. That work is high-volume and judgement-light, and it is most of the clock. Before this existed, a single ad ran about 7 hours of pre-production across 5 to 6 freelancers.

The constraint that shapes every design decision: **the output must be an editable timeline, not a rendered video.** A render cannot be fixed. A timeline can.

## End State

Two people experience this, and success looks different for each.

**The strategist** opens one page, pastes a Dropbox link to the shot footage and their storyboard table copied straight out of Notion, and clicks Assemble. About 5 minutes later the job appears as Done on the Jobs list. They click Preview, watch the assembled ad in a popup without leaving the page, and see any warnings in plain language ("this shot was never filmed", "this delivery did not match the scripted line").

**The motion designer (Ricardo)** downloads one zip, opens one Premiere project, and it relinks in a single step. The sequence is already cut in storyboard order: the creator's real voice on the audio track, every scene trimmed to the spoken words, b-roll laid over the right lines, and captions as an importable SRT. Each source clip sits in the bin **full length**, used in several places on the timeline, so any cut can be re-trimmed rather than re-requested. He then does the last 10 percent: colour grade, his own caption styling, pacing nudges, graphics and the end card.

Nobody is trying to remove the designer. The system cannot produce a shippable ad on its own, and it is not designed to.

## Inputs

| Input | Detail |
|---|---|
| **Footage** | A Dropbox folder share link. Ideally the output of the Footage Renaming Automation, which arrives as `aroll/` + `broll/` + `_report.md`. A flat folder of raw creator uploads also works. |
| **Storyboard** | The strategist's Notion table, pasted as-is. The columns read are `Scene / Script Line / Overlay / Footage Name / Shot List Explanation`. No reformatting required. |
| **Scene-to-clip map** | The renamer's `_report.md` when present. This is the authoritative mapping and removes the naming fragility entirely. |
| **Brand and concept name** | Free text, plus the submitter's name for the done-ping. |
| **Infrastructure** | The Hostinger VPS (8 vCPU, 32 GB, shared with n8n), ffmpeg, faster-whisper running on CPU. |
| **Optional** | An OpenRouter key for storyboard-aware b-roll moment selection. Not currently set. |

**The one input that matters most:** the `Script Line` must match what the creator *actually said*, ad-libs included. Creators rephrase. When the line and the delivery disagree, the tool now follows the delivery (see Proven below), but the closer they match, the better every downstream decision gets.

## Outputs

Per job, a self-contained handoff folder and zip:

- **`<ad>.xml`** the editable Premiere timeline (FCP7 / XMEML). Each source appears once in the bin as a scrub-able master clip, used N times on the timeline.
- **`media/`** every unique source re-encoded **full length** to 1080x1920 / 30fps / Rec.709 SDR with HDR tone-mapping, plus the voiceover as one continuous audio file.
- **`<ad>.srt`** for Premiere import, and **`<ad>_captions.ass`** in the approved karaoke style (gold current word, safe zone).
- **`<ad>_PREVIEW.mp4`** a burned preview. This is proof of what the machine thinks the ad is, not a deliverable.
- **`status.json`** with state, timing, and warnings including every storyboard shot the folder did not contain.
- A **done-ping** POSTed to an n8n webhook so the team is notified, and a **Jobs page** with inline preview, XML, SRT and zip links.

## Dependencies

- **Footage Renaming Automation** for correctly named footage and the `_report.md` scene map. Real evidence of why: on the Accredited Debt Relief job the storyboard said "1stPOV_tapping get quote on phone" while the file was `3rdpov_tapping_get_quote_on_phone.mov`. Filename matching missed it; the renamer's report resolved it.
- **Dropbox** as the transport in both directions. Multi-GB footage never passes through the app.
- **The Hostinger VPS**, shared with n8n and the static-ads service. The container is capped at 6 of 8 cores and 16 GB so n8n stays healthy, and jobs run one at a time in a queue.
- **The storyboard spec being followed** by strategists (`Docs/Video Editor/Storyboard & Footage Spec.md`).
- **Ricardo** as the acceptance test. He set the standards this is built to: full-length clips, safe-zone karaoke captions, SRT over baked-in captions, tighter pacing.
- **Upstream concept templates** (Kyle's "bible of templates") are the intended feed. That is a plan, not a system.

## Open Gaps / Blockers

Ordered by how much they cost today.

1. **Colour grade: not built.** No grade step exists. The open design question is whether to bake a baseline look into the normalized clips, grade only the preview, or emit a toggle-able effect in the XML. Ricardo wants the XML to stay editable, which rules out anything destructive. 100 percent human today.
2. **Hook variants: parsed, not produced.** Storyboards list Hook 1 / Hook 2 / Hook 3. The parser collects them and warns, but only Hook 1 is built. The agency A/B tests hooks on the platform, so this is a live production gap. The agreed design is to vary one scene per variant (a base plus alternates, not every combination), capped at about 5.
3. **B-roll moment selection is semantically blind.** The built-in detector reliably skips setup junk (the creator adjusting the camera, staring at the lens, motion blur) and lands on real action. It cannot tell *which beat*: inside a "removing eye mask" clip it will happily pick a calm moment of lying still. Fixing this needs a vision pass with the storyboard's shot description, which is blocked on a fresh OpenRouter key for the server. The two previous keys were exposed in the public repo and need rotating regardless.
4. **Multi-clip scenes are new.** A scene listing three clips now plays as three shots. Shipped 2026-07-27, verified on one job. It is the least-proven part of the current build and the direct fix for "it looks random".
5. **Missing footage cannot be solved in software.** The tool only uses what is in the folder; it does not generate end cards, graphics or filler. When a storyboard names a shot nobody filmed, it falls back to the talking head and warns. That needs a shoot, not code.
6. **The generated-voiceover path is not wired** into the one-command runner. The ElevenLabs voiceover plus b-roll shape (proven manually on the Onsen ad) runs only script by script. Every one-click job today is the creator-audio talking-head shape.
7. **Two intake surfaces are not joined.** The renamer is triggered from a Notion row; the editor from its own form. A person copies the Dropbox link between them.
8. **The 20-ad volume test has never been run.** The founders' plan was 20 ads across Huckleberry, Miracle and Attekus before scaling. Individual real jobs have run; a batch has not, so per-ad time and consistency at volume are unmeasured.
9. **Ricardo's sign-off is stale.** He approved the handoff format in June. Everything since (the hosted form, delivery-decided cuts, b-roll windows, multi-clip scenes) has not been re-validated against his bar.
10. **Housekeeping:** the repo README still describes a GPU setup that does not exist (the real pipeline is CPU-only), and deploys are manual.

## Current Status

**Live in production, single-job, still in pilot.**

- Deployed 2026-07-16 to the Hostinger VPS as a Docker container behind HTTPS, password-gated, with a job queue, a Jobs list, disk cleanup and failure reporting.
- First real end-to-end run 2026-07-17 (Accredited Debt Relief, 7 scenes): about **5 minutes** total including the 1.2 GB footage download, against a feared 20 to 40. Throughput is not the constraint.
- Second client concept (Innerwell 126) run through the same form, driving three rounds of quality fixes.
- The core value proposition is genuinely proven: the handoff imports and relinks in one step on another machine, and Ricardo confirmed that in June.

What is **not** proven: throughput at volume, consistency across different creators, and the finishing layer. Treat it as live but piloted, not yet in the standard production workflow.

## Owner

- **Carl Sajol** builds and operates it, and manages intake.
- **Ricardo** is the quality bar and the acceptance test.
- **Eric Mann** wants it running for every simple talking-head plus b-roll plus captions concept.
- **Kyle Fenerty** owns the upstream concept-template layer and, with a creative strategist, decides which concepts get made.

---

## Working backwards from the goal

**Goal:** a strategist hands over footage and a storyboard with the fewest possible inputs, and a designer receives an ad that is 90 percent cut.

### Minimum inputs required

Four, and this is already the floor:

1. A Dropbox link to the footage folder.
2. The storyboard table, pasted from Notion.
3. Brand and concept name.
4. Who submitted it.

Everything else is derived: which take is best, where each cut starts and ends, which b-roll covers which line, what the captions say and when.

### Outputs they should receive

An editable Premiere timeline, the full-length source clips, an SRT, and a preview to check before handing it on. Plus an honest warning list, because a silent failure costs more than a flagged one.

### Systems needed to transform the inputs into that output

1. Read the storyboard as the strategist actually writes it (Notion table).
2. Resolve every named shot to a real file, using the renamer's report when present.
3. Transcribe every take to word level.
4. Match each scripted line to the best delivery across all takes.
5. Snap each cut to the real speech boundary in the audio waveform, not to approximate transcript times.
6. Choose the moment inside each b-roll clip where the action is actually happening.
7. Trim every scene to its spoken words, removing lead breath and dead air.
8. Build captions from what was really said, in the approved style, frame-locked to the video.
9. Normalize all footage to one format so Premiere conforms cleanly.
10. Write the editable XML, burn a preview, package, notify.

### Which pieces already exist

All ten. That is the whole current pipeline, running end to end on the server today.

### Which pieces still need to be built

The finishing and scaling layer, in priority order: hook variants, colour grade decision, storyboard-aware b-roll beat selection, the generated-voiceover path, joining the two intake surfaces, and the 20-ad volume test that tells us whether this holds up in real use.

---

## The 90/10 principle

The tools take an ad roughly 90 percent of the way. A human closes the last 10 percent. This is a deliberate boundary, not a shortfall.

**Machine side:** watching every take and finding the usable one, trimming heads and tails, laying b-roll against the right line, transcribing and timing captions, sequencing the storyboard, normalizing formats, flagging what is missing.

**Human side:** colour grade, final caption styling, pacing nudges, graphics and end cards, and the calls that depend on taste and the client relationship.

**Why chasing 100 percent is the wrong loop for a tools team:** in the last 10 percent the cost per attempt rises and "correct" becomes subjective, so the feedback loop stops being measurable. We are not video editors. Every hour spent re-rolling to avoid a two-minute grade is an hour not spent on the parts that compound.

**The working rule:** if a designer can fix it in under five minutes, ship it to the designer. If it would take them an hour, or if it would ship something untrue, it belongs in the tool.

_Note for the founders: the repo's own README still states a "60 to 80 percent" target from the original plan. Worth settling on one number so expectations and docs agree._

---

## What has been proven, and what it cost to prove

Each of these was a real defect found by watching real output, and each is now fixed at the source so every future ad inherits it.

| Problem seen in review | Root cause | Resolution |
|---|---|---|
| Premiere import was zoomed, oversaturated, wrong speed | Mixed frame rates, HDR footage, mixed resolutions | Normalize every source to one format; single timebase |
| 16 duplicate clips cluttering the bin | Each cut exported as its own file | One full-length master clip per source, reused on the timeline |
| Audible stops, captions missing on some lines | Loud breath and neighbouring takes grabbed by the dB threshold | Re-transcribe each segment and trim to its first and last spoken word |
| Caption appeared before the word was said | Per-scene MP3 segments each carry encoder delay, which accumulates | Use WAV segments so the audio stays sample-accurate |
| Long silent pause before a line | Whisper marks the first word at the inhale | Detect and cut lead silence by waveform |
| A caption flashed like a glitch | A fast word shown as its own caption | Merge short phrases forward so the text holds and only the highlight moves |
| Cuts landed mid-sentence; captions showed words never spoken | The storyboard line is the strategist's intent, the creator rephrases | The delivery decides: cut on the creator's own sentence boundaries, caption what was actually said |
| B-roll showed the creator adjusting the camera | Every clip started at a fixed 1 second | Detect the setup and start where the action is |
| A scene played one long shot instead of the storyboard's sequence | Only the first listed clip was used | Play every listed clip in order, sharing the scene's time |

---

## What to do next, in order

1. **Run the 20-ad volume test.** Everything below is guesswork until we know how it behaves across many creators. It is also the only way to measure the real time saved per ad.
2. **Re-validate with Ricardo.** His sign-off predates most of the current build. One session against his bar tells us where the 90/10 line actually sits today.
3. **Ship hook variants.** The agency tests hooks; the storyboards already carry them; the parser already reads them. This is the highest-value missing feature.
4. **Settle the colour grade decision,** then build it. It is the largest remaining item on the human side.
5. **Rotate the exposed keys and add a fresh OpenRouter key** to the server. That single change upgrades b-roll selection from "a real action moment" to "the moment the storyboard asked for".
6. **Join the renamer to the editor** so the Dropbox link passes automatically instead of by copy-paste.
