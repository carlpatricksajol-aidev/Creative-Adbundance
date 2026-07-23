#!/usr/bin/env python3
"""Assemble a talking-head ad from picked takes. For each scene: extract the VO segment from
its take; set the VIDEO to the talking-head take (synced) for talking_head scenes, or to the
mapped b-roll for b-roll scenes. Emits assembly.json (video) + vo_track.json (per-scene VO) +
lines.json (canonical caption text). Feeds normalize_full -> build_assembly_xml, same as Onsen.

Usage:
  python build_talkinghead.py --picked picked_takes.json --input-dir <footage> --out-dir work/innerwell [--broll-offset 1.0]
"""
import argparse, json, os, subprocess


def dur_of(p):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p],
                       capture_output=True, text=True)
    return float((r.stdout or "0").strip() or 0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--picked", required=True)
    ap.add_argument("--input-dir", required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--broll-offset", type=float, default=1.0)
    ap.add_argument("--broll-windows", default=None, help="broll_windows.json {clip basename: in_seconds} from pick_broll_window")
    ap.add_argument("--w", type=int, default=1080)
    ap.add_argument("--h", type=int, default=1920)
    ap.add_argument("--fps", type=int, default=30)
    a = ap.parse_args()

    vodir = os.path.join(a.out_dir, "vo")
    os.makedirs(vodir, exist_ok=True)
    picked = json.load(open(a.picked, encoding="utf-8-sig"))
    wins = {}
    if a.broll_windows and os.path.exists(a.broll_windows):
        wins = json.load(open(a.broll_windows, encoding="utf-8-sig"))
    clips, vo, lines, cum = [], [], [], 0.0

    for idx, r in enumerate(picked):
        th = os.path.join(a.input_dir, r["file"])
        dur = float(r["dur"])
        wav = os.path.join(vodir, f"{idx:02d}_{r['scene']}.wav")     # WAV (not mp3): no per-clip encoder delay to accumulate
        subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-ss", str(r["in"]), "-i", th,
                        "-t", str(dur), "-vn", "-c:a", "pcm_s16le", "-ar", "44100", wav], capture_output=True, text=True)
        vo.append({"scene": r["scene"], "file": wav.replace("\\", "/"), "start": round(cum, 3),
                   "dur": round(dur, 3), "text": r["line"]})

        if r["type"] == "broll" and r.get("broll"):
            bsrc = os.path.join(a.input_dir, r["broll"])
            bmax = max(0.0, dur_of(bsrc) - dur - 0.2)
            bkey = os.path.basename(r["broll"])
            bin_ = min(wins[bkey], bmax) if bkey in wins else min(a.broll_offset, bmax)   # vision-picked action window, else the old offset
            clips.append({"scene": r["scene"], "file": bsrc.replace("\\", "/"), "in": round(bin_, 3),
                          "dur": round(dur, 3), "caption": r["line"]})
        else:                                            # talking head: video = the same take, synced to its VO
            clips.append({"scene": r["scene"], "file": th.replace("\\", "/"), "in": round(float(r["in"]), 3),
                          "dur": round(dur, 3), "caption": r["line"]})
        lines.append({"scene": r["scene"], "text": r["line"]})
        cum += dur
        print(f"{r['scene']:9} {'BROLL' if r['type'] == 'broll' else 'TH':5} {os.path.basename(clips[-1]['file'])[:42]:42} {dur:4.1f}s")

    json.dump({"width": a.w, "height": a.h, "fps": a.fps, "clips": clips},
              open(os.path.join(a.out_dir, "assembly.json"), "w", encoding="utf-8"), indent=2)
    json.dump(vo, open(os.path.join(a.out_dir, "vo_track.json"), "w", encoding="utf-8"), indent=2)
    json.dump(lines, open(os.path.join(a.out_dir, "lines.json"), "w", encoding="utf-8"), indent=2)
    print(f"\n{len(clips)} clips, VO {cum:.1f}s -> {a.out_dir}")


if __name__ == "__main__":
    main()
