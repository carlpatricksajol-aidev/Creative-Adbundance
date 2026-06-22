#!/usr/bin/env python3
"""Build caption words from the canonical SCRIPT (correct spelling, %, ?, -, URLs)
aligned to the transcription's WORD TIMINGS. The VO is generated from the script, so
they match closely; this restores special characters and keeps a URL (brand.com) as a
single token instead of the transcription's split ("onsentowel" / "com").

Per scene: walk the script tokens; for each, consume transcription words until their
combined letters cover the script token (so "onsentowel.com" eats "onsentowel"+"com",
"100%" eats "100"), and stamp the SCRIPT token's text with that span's timing.

Usage:
  python align_captions.py --lines vo_lines.json --words words_global.json --out words_script.json
"""
import argparse, json, re
from difflib import SequenceMatcher
from itertools import groupby


NUM = {"0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five",
       "6": "six", "7": "seven", "8": "eight", "9": "nine", "10": "ten"}


def norm(s):
    s = re.sub(r"[^a-z0-9]", "", s.lower())
    return NUM.get(s, s)                                  # treat "3" and "three" as equal (script uses words, whisper writes digits)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lines", required=True)
    ap.add_argument("--words", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--vo-track", default=None, help="clamp each scene's caption words to its VO window so nothing bleeds into the next scene")
    a = ap.parse_args()

    lines = {l["scene"]: l["text"] for l in json.load(open(a.lines, encoding="utf-8-sig"))}
    by_scene = {}
    for w in json.load(open(a.words, encoding="utf-8-sig")):
        by_scene.setdefault(w["scene"], []).append(w)

    out = []
    for scene, tw in by_scene.items():
        script = lines.get(scene)
        if not script or not tw:
            out.extend(tw); continue
        C = script.split()
        Cn, Tn = [norm(c) for c in C], [norm(w["word"]) for w in tw]
        at = [None] * len(C)                                  # (start,end) per canonical token
        for tag, i1, i2, j1, j2 in SequenceMatcher(None, Cn, Tn, autojunk=False).get_opcodes():
            if tag == "equal":
                for o in range(i2 - i1):
                    at[i1 + o] = (tw[j1 + o]["start"], tw[j1 + o]["end"])
            elif tag == "replace":                            # spread C[i1:i2] across the matched T[j1:j2] span
                s0, s1, n = tw[j1]["start"], tw[j2 - 1]["end"], i2 - i1
                for o in range(n):
                    at[i1 + o] = (s0 + (s1 - s0) * o / n, s0 + (s1 - s0) * (o + 1) / n)
            # 'delete' (canonical word, no transcription) -> interpolate below; 'insert' (extra T) -> dropped
        for idx in range(len(C)):                             # fill gaps by interpolating between matched neighbors
            if at[idx] is not None:
                continue
            p = idx - 1
            while p >= 0 and at[p] is None:
                p -= 1
            q = idx + 1
            while q < len(C) and at[q] is None:
                q += 1
            lo = at[p][1] if p >= 0 else tw[0]["start"]
            hi = at[q][0] if q < len(C) else tw[-1]["end"]
            gstart = p + 1
            gcount = (q - 1) - gstart + 1
            kk = idx - gstart
            at[idx] = (lo + (hi - lo) * kk / (gcount + 1), lo + (hi - lo) * (kk + 1) / (gcount + 1))
        for idx, c in enumerate(C):
            out.append({"start": round(at[idx][0], 3), "end": round(at[idx][1], 3), "word": c, "scene": scene})

    if a.vo_track:                                       # bound each scene to its VO window + enforce min spacing
        win = {e["scene"]: (float(e["start"]), float(e["start"]) + float(e["dur"]))
               for e in json.load(open(a.vo_track, encoding="utf-8-sig"))}
        spaced = []
        for scene, grp in groupby(out, key=lambda x: x["scene"]):   # out is built per-scene, so grouping is contiguous
            toks = list(grp)
            if scene not in win:
                spaced.extend(toks); continue
            ws, we = win[scene]
            step = min(0.12, (we - ws) / max(1, len(toks)))         # guarantee each token a slice (no zero-width -> nothing skipped)
            prev = ws - step
            for t in toks:
                s = min(max(t["start"], ws, prev + step), we - step)
                t["start"], prev = round(s, 3), s
            for i, t in enumerate(toks):
                t["end"] = round(toks[i + 1]["start"] if i + 1 < len(toks) else we, 3)
            spaced.extend(toks)
        out = spaced

    out.sort(key=lambda x: x["start"])
    json.dump(out, open(a.out, "w", encoding="utf-8"), indent=2)
    print(f"aligned {len(out)} caption tokens (script text + transcription timing) -> {a.out}")


if __name__ == "__main__":
    main()
