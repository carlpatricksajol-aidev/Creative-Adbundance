#!/usr/bin/env python3
"""Split each assembly clip into fast ~1.4s beats sampled from DIFFERENT moments of
the source clip, so the cut rhythm matches a fast paid-social edit while each beat
shows fresh footage. Total length is unchanged (the VO drives total duration); this
multiplies the cuts within each scene.

Usage:
  python beatify.py --assembly assembly_vo.json --out assembly_beats.json [--beat 1.4]
"""
import argparse, json, subprocess

_P = {}


def src_dur(path):
    if path in _P:
        return _P[path]
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "csv=p=0", path], capture_output=True, text=True)
    try:
        d = float(r.stdout.strip())
    except Exception:
        d = 0.0
    _P[path] = d
    return d


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--assembly", required=True)
    ap.add_argument("--out", default="assembly_beats.json")
    ap.add_argument("--beat", type=float, default=1.4)
    a = ap.parse_args()

    spec = json.load(open(a.assembly, encoding="utf-8-sig"))
    beats = []
    for c in spec["clips"]:
        dur, base = float(c["dur"]), float(c.get("in", 0.0))
        n = max(1, int(round(dur / a.beat)))
        if n == 1:
            beats.append(dict(c)); continue
        per = dur / n
        S = src_dur(c["file"])
        avail = max(per, (S - base) if S else dur)
        span = min(avail, 3 * dur)                    # sample within ~3x the scene window
        step = (span - per) / (n - 1) if n > 1 else 0
        for k in range(n):
            inp = base + k * step
            if S:
                inp = min(inp, S - per)
            nb = dict(c); nb["in"] = round(max(0.0, inp), 3); nb["dur"] = round(per, 3)
            beats.append(nb)
    out = dict(spec); out["clips"] = beats
    json.dump(out, open(a.out, "w", encoding="utf-8"), indent=2)
    print(f"beatified {len(spec['clips'])} clips -> {len(beats)} beats (~{a.beat}s each)")


if __name__ == "__main__":
    main()
