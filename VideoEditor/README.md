# VideoEditor (internal AI ad-assembly editor)

Working name, rebrandable later.

Builds a loose "best-of" assembly cut of a paid social ad (Meta, TikTok) from raw
footage, then hands an EDITABLE Adobe Premiere timeline to a motion designer who
finishes it. Claude is the edit brain: it selects the best takes, sequences them to
the script / storyboard, and lays B-roll over the top. The target is roughly 60 to
80 percent of the way there, not a final render. Designers refine the rest in Premiere.

## Pipeline

1. **Transcribe** (whisper.cpp, GPU): word / segment timestamps per take.
2. **Edit brain** (Claude): writes an assembly-plan JSON. Best takes, source in/out
   timecodes, track layout (A-roll on V1, B-roll on V2), sequenced to the
   script / storyboard. Drops bad takes, restarts, and filler.
3. **Sequence check**: validate that the assembled order matches the
   script / storyboard, and flag mismatches.
4. **Premiere handoff** (primary deliverable): generate FCP7 XML the designer
   imports into Premiere as an editable sequence, with A-roll and B-roll on tracks
   and the source media linked.
5. **Preview** (for review): ffmpeg renders a quick watchable rough cut from the same
   plan so the team can see the assembly. This is the "show your work" artifact.
6. **Later**: captions + designs (Essential Graphics / .mogrt), polish, beat-cutting.

## Inputs (confirm exact format with Ricardo)

- Raw footage folder (A-roll takes + B-roll clips), pulled from Dropbox.
- Script (text).
- Storyboard (beats: line / VO + the intended B-roll or visual).

## Constraints

- Output is an editable Premiere project, not a finished MP4.
- Loose assembly first. Perfect beat-cutting is a later goal.
- Model-agnostic: the edit-brain step is a swappable LLM. Fable 5 is down, so do not
  hard-depend on any single model.

## Requirements

- ffmpeg + ffprobe (`winget install Gyan.FFmpeg`) for preview and media probing.
- whisper.cpp + a ggml model in `bin/` for transcription.
- Node 18+ (installed: v24) for later caption / motion work (Remotion).
- GPU: NVIDIA RTX 3050 (CUDA transcription + NVENC encode).

## Layout

```
VideoEditor/
  input/            raw footage + script + storyboard drop (gitignored)
  work/             transcripts, assembly-plan JSON, intermediates (gitignored)
  output/           Premiere XML + preview renders (gitignored)
  assets/
    broll/          client B-roll library, tagged (gitignored)
    music/          background tracks (gitignored)
    luts/           .cube color grades (tracked)
  scripts/          pipeline steps (tracked)
  bin/              whisper.cpp binary + ggml model (gitignored)
```
