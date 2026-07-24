# VideoEditor: progress + resume notes

Last updated: 2026-06-22. Read this first when picking the project back up.

The deliverable is an EDITABLE Adobe Premiere timeline (FCP7 / XMEML v5 XML) plus a
watchable burned preview, not a finished render. Claude picks takes, sequences to the
storyboard, lays captions, and hands an editable timeline to a motion designer (Ricardo)
who finishes it. Target is ~60 to 80 percent done.

## Where it stands

- **Talking-head pipeline (creator audio = VO): working end to end.** Proven on the
  Innerwell "5 Reasons" ad (12 scenes). Latest clean master = `output/innerwell_v10`.
- **VO + b-roll pipeline (generated VO, e.g. Onsen): assembly + caption engine proven;**
  the generated-VO branch is not wired into `run_ad.py` yet (talking-head is).
- Editable XML validated by importing into Premiere on a second machine (Ricardo signed
  off): full clips linked, reused clips collapse to one bin master, captions as SRT.
- Cut and caption sync is fully hardened (see "Hard-won fixes" below). All 12 Innerwell
  scenes verified: every caption lands on the spoken word, no flash, no drift, tails intact.

## How to run

One command (the whole chain):

```
python scripts/run_ad.py --in <assembly folder> --out <handoff folder> \
    [--footage-dir <dir>] [--takes <takes.json>] [--name <ad>]
```

- `<assembly folder>` holds `storyboard.md` (+ `footage/aroll/` and `footage/broll/`,
  or pass `--footage-dir`).
- Writes the handoff: `<ad>.xml`, `<ad>.srt`, `<ad>_captions.ass`, `<ad>_PREVIEW.mp4`,
  `media/`, zipped, plus `status.json` (ok + warnings + outputs).
- `--takes` reuses an existing transcription to skip the slow whisper pass.

Intake form (LAN): `python app.py` then open the form. Brand / concept / audio mode /
Dropbox share-link / storyboard textarea. A worker thread runs fetch_dropbox then run_ad.

Two Pythons: system Python 3.14 runs the stdlib steps; the `.venv` (3.12) runs the
faster-whisper / numpy / opencv steps. `run_ad.py` picks the right one per step.

## Pipeline order (what run_ad chains)

1. `parse_storyboard.py` storyboard.md -> storyboard.json, validates every b-roll
   FOOTAGE name against the real footage folder (flags mismatches at submit time).
2. `transcribe_takes.py` (whisper) word transcripts per take (or reuse `--takes`).
3. `pick_takes.py` auto-matches each scene LINE to the best take span across all takes
   (digit/number-word aware), resolves b-roll by filename, flags weak matches.
4. `refine_cuts.py` (waveform) snaps each picked IN/OUT to the real speech boundary
   (whisper word times are approximate; the waveform is exact).
5. `build_talkinghead.py` extracts the per-scene VO (WAV) + sets the video (synced
   talking-head take, or the mapped b-roll), writes assembly.json + vo_track.json + lines.json.
6. `vo_word_timings.py` (whisper) per-scene word timings for captions.
7. `tighten_segments.py` trims each scene to its first..last spoken word, removes lead
   inhale/silence by waveform, frame-aligns durations, shifts the talking-head video
   in-point to match (lip sync), rebuilds caption times.
8. `align_captions.py` maps real audio words onto the script text (correct spelling, %, URLs).
9. `build_captions_ass.py` karaoke ASS: gold current word, safe zone, min-duration merge.
10. `normalize_full.py` re-encodes each unique source to 1080x1920 / 30fps / Rec.709 SDR
    (HDR tonemap), concatenates the VO into VO_full.
11. `build_assembly_xml.py` writes the editable FCP7 XML + burns the preview (frame-exact).

## Hard-won fixes (do not regress these)

The cut and caption sync took several rounds of real review. Each was a distinct root cause:

- **Waveform cut refine**: whisper word times are padded/approx; snap IN/OUT to the
  waveform (`refine_cuts.py`). IN = first frame above -30dB, OUT = last above -38dB.
- **Word-trim** (`tighten_segments.py`): the dB thresholds grab loud breath / a neighbor
  take's tail on some creators, so after re-transcribing each extracted segment, trim it
  to its first..last spoken word. Killed the "stops" and the no-caption gaps.
- **Frame-align durations**: a word-derived duration is not a whole frame, so the preview
  clip rounded up ~1 frame and the video crept behind captions ("FIVE" appeared on the
  previous shot). Snap every scene duration to a whole 30fps frame.
- **WAV audio, not MP3**: per-scene MP3 segments each carry ~26ms of encoder delay;
  concatenating 12 of them pushed the spoken audio progressively later (caption before
  the word). Extract VO segments as WAV (pcm_s16le) so VO_full is sample-accurate.
- **Waveform lead-trim** (`tighten_segments.lead_silence_end`): whisper marks the first
  word too early (at the inhale), so it left 0.4 to 0.7s of silence/breath before the
  word. Detect lead silence with ffmpeg silencedetect, reconstruct intervals IN ORDER
  (a clip can open already-silent -> ffmpeg emits only silence_end), and BRIDGE chunks
  split by a short breath click (gap < 0.14s). Now every scene starts on the spoken word.
- **Frame-exact preview concat** (`build_assembly_xml.py`): a non-frame-aligned `-ss`
  seek drifts each clip +-1 frame in the burned preview (XML deliverable is fine, it uses
  integer frames). Read a little extra then keep exactly `round(dur*fps)` frames per clip
  with `trim=end_frame`. Video frame-locked to captions + VO.
- **Caption min-duration merge** (`build_captions_ass.py`): a fast word (e.g. "Five" in
  0.12s) shown as its own caption swapped text instantly and read like a glitch. Merge any
  phrase shorter than `--min-dur` (0.34s) FORWARD into the next same-scene phrase, so the
  text stays put and only the gold highlight slides across it.

### Verifying (use the waveform, not transcription)

Comparing a whole-file whisper pass to the per-segment caption times is unreliable (the
two passes disagree ~0.5s). Verify against the audio waveform instead:

```
python scripts/check_all_onsets.py <output dir>
```

For every scene it reports the lead-gap between the caption and the real speech onset and
flags any > 0.10s. The clean target is 0.00s on every scene.
`scripts/inspect_leads.py <scratch dir>` runs the fast chain into a scratch dir and prints
whisper_first vs lead_silence_end vs the real waveform onset per segment.

## Storyboard spec

Strategist-facing format + rules live in `Docs/Video Editor/`:
`Storyboard & Footage Spec.md` and `storyboard-template.md`. Key rules: the b-roll
filename must match the FOOTAGE field; one scene = one continuously-spoken line / take;
the LINE must match the ACTUAL delivery, ad-libs included (a short line cuts the audio
where the line stops); captions come from the real audio, the LINE only drives structure
and b-roll matching.

## Roadmap (next, agreed 2026-06-22)

Build order: get the RIGHT clip and the right moment first, then grade.

1. **Footage classifier** (next): take the raw grab-bag, split talking-head (carries the
   script VO) vs b-roll (visual only) by audio + vision, auto-describe and rename the
   b-roll by what is on screen so the storyboard FOOTAGE field matches and the matcher
   locks on. (The Gemini / vision rename step from the Jun-18 meeting.)
2. **Angle-aware selection + variant outputs**: when the same scene line is recorded
   several ways, keep the top matches as ANGLES and emit one output per angle. Decision
   locked: vary ONE scene per variant (change scene 3's angle, keep the rest), so the set
   stays linear (base + alternates), not the combinatorial cross-product. Cap ~5 variants
   per ad. This is how the agency A/B tests angles on the platform.
3. **Best-window pick**: inside a b-roll clip, choose the cleanest moment and skip the bad
   ones (looking at camera, blurry). Reuse the OpenCV + LLM shot-selection used for Onsen.
4. **Grade**: cohesive color grade on top, applied identically across all variants.
   OPEN DECISION (Ricardo wants the XML editable): bake a baseline LUT into the normalized
   clips vs preview-only vs an editable LUT effect in the XML. Settle when building grade.

Also pending: wire the generated-VO (Onsen) branch into `run_ad.py`; put run_ad + the
form on the Hostinger VPS with n8n / Airtable / Dropbox glue (mirror the static-ads setup);
calibrate to Ricardo's final cut.

Quality bar = Ricardo. Build small first: the plan is a 20-ad test (Huckleberry, Miracle,
Attekus) over 1 to 2 weeks before scaling.

## VPS deployment (LIVE, 2026-07-16)

Runs on the Hostinger KVM 8 (srv1486031, same box as n8n) as a Docker container behind
Traefik: **https://videoeditor.srv1486031.hstgr.cloud** (password-gated, VE_PASSWORD in
`/root/video-editor/.env` on the server).

- Deploy dir on the server: `/root/video-editor/` (app.py + scripts/ + Dockerfile +
  docker-compose.yml). Redeploy: `docker compose up -d --build` in that dir.
- Jobs persist in `/root/video-editor/jobs/` (bind-mounted volume); old footage + media
  swept after VE_KEEP_DAYS (10), the zip keeps everything.
- One job at a time (FIFO); container capped at 6 of 8 cores / 16 GB so n8n stays healthy.
- The whisper model (small.en, CPU int8) is baked into the image; ffmpeg + Liberation
  fonts installed (the .ass "Arial" resolves to Liberation Sans).
- Hardening: password gate + validated job ids + /jobs index; fetch_dropbox only fetches
  https Dropbox hosts (each redirect re-checked), 30 GB download cap, zip-slip guard;
  status.json now has state (queued/fetching/running/failed/done) so the job page always
  resolves; run_ad writes status at start and on failure too.
