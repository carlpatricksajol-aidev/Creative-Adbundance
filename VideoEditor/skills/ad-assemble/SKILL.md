---
name: ad-assemble
description: Assemble a paid-social ad into an EDITABLE Premiere timeline (FCP7 XML) from raw multi-take footage. Selects best takes (video-cut), sequences to the script/storyboard, lays b-roll on V2, writes captions, and exports an XML a motion designer finishes in Premiere -- plus a watchable preview. TRIGGER for 'assemble this ad', 'cut this ad for Premiere', 'best-of assembly', 'make the loose cut'. This is the agency editor; the deliverable is an editable timeline, NOT a finished render.
---

# Ad Assemble -> Editable Premiere Timeline

Turns one ad's raw footage into a LOOSE best-of assembly handed to a motion designer
as an editable Premiere sequence. Reuses BuildLoop `video-cut` (take selection) and
`broll-ingest` (b-roll catalog); the new exporter writes FCP7 XML + SRT + a preview.

Deliverable = `<ad>.xml` (Premiere import) + `<ad>.srt` (captions) + `<ad>.preview.mp4`
(show-your-work). NOT a render. Designers add motion design/polish in Premiere.

## Inputs (`VideoEditor/input/<ad>/`)
- raw A-roll take(s) + b-roll clips (from Dropbox)
- `script.txt` -- canonical script (authoritative for brand names)
- `storyboard.json` (optional) -- ordered beats `{anchor, broll_query, category, max_sec}`

## Tools
- Python: the project venv `VideoEditor/.venv` (Windows: `.venv/Scripts/python.exe`).
  Skill scripts (`transcribe.py`, `cut.py`, `verify.py`) live in `~/.claude/skills/`.
- New scripts in `VideoEditor/scripts/`: `emit_cut_plan.py`, `build_premiere_xml.py`,
  `match_broll.py`, `preview.py`.

## Procedure
1. **Probe + extract audio** (ffprobe; `ffmpeg -i IN -vn -ac 1 -ar 16000 audio16k.wav`).
2. **Transcribe** -> `words.json` (`~/.claude/skills/video-cut/scripts/transcribe.py`).
3. **Pick keepers** (the judgment step). Read `script.txt` + `segments.json`; keep the
   cleanest take of each line per video-cut's selection rules. Write `keepers.json`
   `[{a,b,label}]` and TELL the user which takes were chosen.
4. **Cut plan** -> `emit_cut_plan.py --input IN --audio audio16k.wav --words words.json
   --keepers keepers.json --out cut_plan.json`. Heed any `!! OVERLAP` warnings (merge windows).
5. **B-roll** (only if a catalog exists) -> `match_broll.py --storyboard storyboard.json
   --cut-plan cut_plan.json --words words.json --catalog <broll_catalog.json> --out placements.json`.
   No catalog yet -> skip; the XML ships with empty V2 slots for the designer.
6. **Export** -> `build_premiere_xml.py --plan cut_plan.json --out output/<ad>
   [--broll placements.json] --words words.json --name "<ad> assembly"`.
7. **Preview** -> `preview.py --plan cut_plan.json --out output/<ad>.preview.mp4 --srt output/<ad>.srt`.
8. **Verify** the A-roll has no duplicated phrases:
   `python ~/.claude/skills/video-cut/scripts/verify.py output/<ad>.preview_aroll.mp4`
   (or the A-roll cut) -> must report `CONTENT: clean`.

## Hand off
Give the team `<ad>.preview.mp4` to watch and `<ad>.xml` (+ `<ad>.srt`) for a designer
to import into Premiere (File > Import). Confirm media relinks and the order matches
the script/storyboard.

## Notes / limits
- Assumes one A-roll source file with multiple takes. Multi-source ads need per-file
  handling in the exporter (not yet built).
- Test one real Premiere import early -- FCP7 XML path/relink + frame-rate (23.976/29.97)
  are the usual snags.
- Keep the LLM judgment (keeper picks, b-roll intent) model-agnostic.
