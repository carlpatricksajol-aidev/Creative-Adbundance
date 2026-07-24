#!/usr/bin/env python3
"""Refine each picked cut to the EXACT speech boundary from the audio WAVEFORM (perfect-cuts
rules) -- faster-whisper word times are padded/approx; the waveform is the truth about where
speech actually starts and stops:

  IN  = first frame voice crosses -30dB (above breath/mouth noise), zero pad  -> floor(onset*fps)
  OUT = last frame above -38dB (word tails are quiet), + 1 frame              -> ceil(offset*fps)+1

Run with the venv python (needs numpy + ffmpeg on PATH).

Usage:
  python refine_cuts.py --picked picked_takes.json --out picked_refined.json [--fps 30]
"""
import argparse, json, os, subprocess
import numpy as np


def envelope(file, start, dur, sr=16000, win=0.01):
    start = max(0.0, start)
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{start:.3f}", "-i", file, "-t", f"{dur:.3f}",
                          "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"], capture_output=True).stdout
    x = np.frombuffer(raw, dtype=np.float32)
    n = max(1, int(sr * win))
    m = len(x) // n
    if m == 0:
        return np.array([]), np.array([])
    rms = np.sqrt((x[:m * n].reshape(m, n) ** 2).mean(axis=1) + 1e-12)
    return start + np.arange(m) * win, 20 * np.log10(np.maximum(rms, 1e-6))


def snap_in(file, rough, thr, back=0.10, fwd=0.40):
    t, db = envelope(file, rough - back, back + fwd)
    if not len(t):
        return rough
    a = np.where(db > thr)[0]
    return float(t[a[0]]) if len(a) else rough          # FIRST frame voice crosses the in threshold


def snap_out(file, rough, thr, back=0.45, fwd=0.06):
    t, db = envelope(file, rough - back, back + fwd)
    if not len(t):
        return rough
    a = np.where(db > thr)[0]
    return float(t[a[-1]]) if len(a) else rough         # LAST frame above the out threshold


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--picked", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--fps", type=float, default=30.0)
    ap.add_argument("--in-db", type=float, default=-30.0)
    ap.add_argument("--out-db", type=float, default=-38.0)
    a = ap.parse_args()

    rows = json.load(open(a.picked, encoding="utf-8-sig"))
    for r in rows:
        f = os.path.abspath(r["file"])
        ri, ro = float(r["in"]), float(r["in"]) + float(r["dur"])
        onset, offset = snap_in(f, ri, a.in_db), snap_out(f, ro, a.out_db)
        if offset <= onset + 0.20:                       # safety: snap collapsed -> keep original span
            onset, offset = ri, ro
        inf = np.floor(onset * a.fps) / a.fps            # zero pad in
        outf = (np.ceil(offset * a.fps) + 1) / a.fps     # +1 frame out
        print(f"{str(r['scene']):8} in {ri:6.2f}->{inf:6.2f} ({(inf - ri) * 1000:+4.0f}ms)  "
              f"out {ro:6.2f}->{outf:6.2f} ({(outf - ro) * 1000:+4.0f}ms)  dur {round(outf - inf, 2):.2f}s")
        r["in"], r["out"], r["dur"] = round(float(inf), 3), round(float(outf), 3), round(float(outf - inf), 3)

    json.dump(rows, open(a.out, "w", encoding="utf-8"), indent=2)
    print(f"\nrefined {len(rows)} cuts -> {a.out}")


if __name__ == "__main__":
    main()
