#!/usr/bin/env python3
"""Emit the A-roll edit decision list (cut plan) as JSON -- no render.

Runs the same waveform-accurate speech onset/offset detection as BuildLoop
video-cut/scripts/cut.py (lines ~45-89) over the keeper windows, but instead of
rendering an MP4 it writes cut_plan.json: the per-take SOURCE in/out points (plus
source media metadata) that build_premiere_xml.py turns into an editable Premiere
(FCP7 XML) timeline.

Detection logic is ported verbatim from video-cut/cut.py so the cut points match
what that skill would render. Credit: Luuk Alleman / BuildLoop video-cut.

Usage:
  python emit_cut_plan.py --input IN.mp4 --audio audio16k.wav --words words.json \
      --keepers keepers.json --out cut_plan.json \
      [--head 0.03] [--tail 0.07] [--thr 0.005] [--margin 0.35]
"""
import argparse, json, subprocess, wave
import numpy as np


def probe(path):
    """ffprobe the source for width/height/fps/duration."""
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height,r_frame_rate",
         "-show_entries", "format=duration", "-of", "json", path],
        capture_output=True, text=True)
    info = json.loads(r.stdout or "{}")
    st = (info.get("streams") or [{}])[0]
    parts = (st.get("r_frame_rate", "30/1") + "/1").split("/")
    num, den = int(parts[0]), int(parts[1]) or 1
    return {
        "width": int(st.get("width", 0)),
        "height": int(st.get("height", 0)),
        "fps_num": num,
        "fps_den": den,
        "duration": float(info.get("format", {}).get("duration", 0.0)),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--audio", default="audio16k.wav")
    ap.add_argument("--words", default="words.json")
    ap.add_argument("--keepers", required=True)
    ap.add_argument("--out", default="cut_plan.json")
    ap.add_argument("--head", type=float, default=0.03)
    ap.add_argument("--tail", type=float, default=0.07)
    ap.add_argument("--thr", type=float, default=0.005, help="energy threshold (breath<thr<word)")
    ap.add_argument("--margin", type=float, default=0.35, help="search margin around word edge (s)")
    a = ap.parse_args()

    words = json.load(open(a.words, encoding="utf-8-sig"))
    keepers = json.load(open(a.keepers, encoding="utf-8-sig"))

    w = wave.open(a.audio, "rb")
    sr = w.getframerate()
    sig = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
    win = int(0.020 * sr)
    hop = 0.004
    SUS = 0.04
    THR = a.thr

    def rms(t):
        i = int(t * sr)
        s = sig[max(0, i - win // 2): i + win // 2]
        return float(np.sqrt(np.mean(s ** 2))) if len(s) else 0.0

    def sustained(t, d=SUS):
        tt = t
        while tt < t + d:
            if rms(tt) < THR:
                return False
            tt += hop
        return True

    def onset(fw):                       # forward scan from before the first word
        t = fw - a.margin
        while t < fw + 1.0:
            if rms(t) >= THR and sustained(t):
                return round(t, 3)
            t += hop
        return round(fw, 3)

    def offset(lw):                      # backward scan from after the last word
        t = lw + a.margin
        while t > lw - 1.0:
            if rms(t) >= THR and sustained(t - SUS):
                return round(t, 3)
            t -= hop
        return round(lw, 3)

    def words_in(a0, b0):
        return [x for x in words if a0 <= (x["start"] + x["end"]) / 2 <= b0]

    segs = []
    for k in keepers:
        ws = words_in(k["a"], k["b"])
        if not ws:
            print(f'!! no words in window {k["a"]}-{k["b"]} ({k.get("label","")}) -- check keepers')
            continue
        on, off = onset(ws[0]["start"]), offset(ws[-1]["end"])
        txt = "".join(x["word"] for x in ws).strip()
        segs.append({"label": k.get("label", ""), "on": on, "off": off, "text": txt})
        print(f'{k.get("label",""):28s} {on:8.3f}-{off:8.3f} ({off-on:5.2f}s)  "{txt[:46]}"')

    # overlap guard (video-cut lesson 7): two kept windows sharing source time -> dup audio
    for i in range(len(segs)):
        for j in range(i + 1, len(segs)):
            lo = max(segs[i]["on"], segs[j]["on"])
            hi = min(segs[i]["off"], segs[j]["off"])
            if hi - lo > 0.05:
                print(f'!! OVERLAP: "{segs[i]["label"]}" & "{segs[j]["label"]}" share '
                      f'{hi-lo:.2f}s of source -> WILL DUPLICATE. Merge into one window.')

    meta = probe(a.input)
    plan = {
        "source": a.input.replace("\\", "/"),
        "head": a.head, "tail": a.tail,
        **meta,
        "segments": segs,
    }
    json.dump(plan, open(a.out, "w", encoding="utf-8"), indent=2)
    print(f"\nwrote {a.out}: {len(segs)} segments, source {meta['width']}x{meta['height']} "
          f"@ {meta['fps_num']}/{meta['fps_den']}, dur {meta['duration']:.2f}s")


if __name__ == "__main__":
    main()
