#!/usr/bin/env python3
"""After transcription, trim each scene's VO to its first->last spoken WORD -- removes lead/trail
breath, silence, or a neighbouring take's tail that a fixed dB threshold can grab on loud-breath
creators (the 'stops' + no-caption gaps). Re-extracts the tight VO, shifts the TALKING-HEAD video
in-point to match (keeps lip sync; b-roll just shortens), and rebuilds the caption word timings +
cumulative timeline so captions start exactly when the line is spoken.

Usage:
  python tighten_segments.py --assembly a.json --vo-track vo.json --words words_global.json \
      --picked picked_refined.json --out-dir <dir> [--lead 0.06 --tail 0.12]
"""
import argparse, json, os, subprocess


def lead_silence_end(path, thr=-40.0, d=0.08, bridge=0.14):
    """Time the clip's FIRST real word actually begins. Whisper routinely marks the first word too
    early (at the inhale), so the word-trim alone won't cut the breath; the waveform does. A tiny
    breath/click can split the lead silence into chunks, so chunks separated by a gap < `bridge`
    (too short to be a word) are merged; the first gap >= `bridge` is the real word -> stop there.
    Returns 0.0 if the clip opens on speech."""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", path, "-af",
                        f"silencedetect=noise={thr}dB:d={d}", "-f", "null", "-"],
                       capture_output=True, text=True)
    intervals, open_s = [], None       # reconstruct silence [start,end] intervals IN ORDER
    for ln in r.stderr.splitlines():
        try:
            if "silence_start:" in ln:
                open_s = float(ln.split("silence_start:")[1].strip().split()[0])
            elif "silence_end:" in ln:
                e = float(ln.split("silence_end:")[1].split("|")[0].strip().split()[0])
                intervals.append((open_s if open_s is not None else 0.0, e))  # None => clip started silent
                open_s = None
        except ValueError:
            pass
    if not intervals or intervals[0][0] > 0.15:    # no lead silence / opens on speech
        return 0.0
    lead_end = intervals[0][1]
    for s, e in intervals[1:]:
        if s - lead_end < bridge:                  # only a breath/click between -> still lead silence
            lead_end = e
        else:
            break                                  # a real word started -> stop
    return lead_end


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--assembly", required=True)
    ap.add_argument("--vo-track", required=True)
    ap.add_argument("--words", required=True)
    ap.add_argument("--picked", required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--lead", type=float, default=0.06)
    ap.add_argument("--tail", type=float, default=0.12)
    ap.add_argument("--fps", type=float, default=30.0)
    a = ap.parse_args()

    asm = json.load(open(a.assembly, encoding="utf-8-sig"))
    vt = json.load(open(a.vo_track, encoding="utf-8-sig"))
    words = json.load(open(a.words, encoding="utf-8-sig"))
    types = {str(p["scene"]): p["type"] for p in json.load(open(a.picked, encoding="utf-8-sig"))}
    clips = {c["scene"]: c for c in asm["clips"]}
    by_scene = {}
    for w in words:
        by_scene.setdefault(w["scene"], []).append(w)
    tight = os.path.join(a.out_dir, "vo_tight")
    os.makedirs(tight, exist_ok=True)

    new_vt, new_words, cum = [], [], 0.0
    for e in vt:
        sc = e["scene"]
        sw = sorted(by_scene.get(sc, []), key=lambda w: w["start"])
        f = max(0.0, (sw[0]["start"] - e["start"]) - a.lead) if sw else 0.0           # seg-relative trim start
        ls = lead_silence_end(e["file"])                                              # quiet lead inhale whisper missed
        if ls > f + 0.05:
            f = max(f, ls - a.lead)                                                    # trim past the inhale to real speech
        l = min(e["dur"], (sw[-1]["end"] - e["start"]) + a.tail) if sw else e["dur"]   # seg-relative trim end
        new_dur = round(round(max(0.3, l - f) * a.fps) / a.fps, 4)   # frame-align so the video concat can't drift vs captions/VO
        new_mp3 = os.path.join(tight, os.path.basename(e["file"]))    # stays .wav -> no encoder delay
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{f:.3f}", "-i", e["file"],
                        "-t", f"{new_dur:.3f}", "-c:a", "pcm_s16le", "-ar", "44100", new_mp3], capture_output=True)
        clip = clips.get(sc)
        if clip:
            if types.get(sc) == "talkinghead":
                clip["in"] = round(float(clip["in"]) + f, 3)      # shift TH video to match trimmed audio (lip sync)
            clip["dur"] = new_dur                                 # b-roll just shortens
        for w in sw:
            st = cum + max(0.0, (w["start"] - e["start"]) - f)
            new_words.append({"start": round(st, 3), "end": round(cum + max(st - cum, (w["end"] - e["start"]) - f), 3),
                              "word": w["word"], "scene": sc})
        new_vt.append({**e, "file": new_mp3.replace("\\", "/"), "start": round(cum, 3), "dur": new_dur})
        cum += new_dur

    json.dump(asm, open(a.assembly, "w", encoding="utf-8"), indent=2)
    json.dump(new_vt, open(a.vo_track, "w", encoding="utf-8"), indent=2)
    json.dump(new_words, open(a.words, "w", encoding="utf-8"), indent=2)
    print(f"tightened {len(new_vt)} segments to spoken words -> total {cum:.1f}s")


if __name__ == "__main__":
    main()
