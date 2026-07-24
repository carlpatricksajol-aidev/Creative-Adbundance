#!/usr/bin/env python3
"""Re-time an assembly to per-scene VO durations and emit a VO audio-track spec.

Reads assembly.json (clips with "scene" labels) + vo_manifest.json (scene -> dur,file).
Each scene's total timeline duration becomes its VO length (split evenly across the
scene's clips). Writes assembly_vo.json (re-timed) and vo_track.json (each scene's VO
mp3 placed at the scene's start on the audio timeline).

Usage:
  python retime_with_vo.py --assembly assembly.json --vo vo_manifest.json \
      --out-assembly assembly_vo.json --out-track vo_track.json
"""
import argparse, json


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--assembly", required=True)
    ap.add_argument("--vo", required=True)
    ap.add_argument("--out-assembly", default="assembly_vo.json")
    ap.add_argument("--out-track", default="vo_track.json")
    a = ap.parse_args()

    spec = json.load(open(a.assembly, encoding="utf-8-sig"))
    vo = {m["scene"]: m for m in json.load(open(a.vo, encoding="utf-8-sig"))}

    groups = []
    for c in spec["clips"]:
        if groups and groups[-1]["scene"] == c.get("scene"):
            groups[-1]["clips"].append(c)
        else:
            groups.append({"scene": c.get("scene"), "clips": [c]})

    new_clips, track, t = [], [], 0.0
    for g in groups:
        m = vo.get(g["scene"])
        if not m:                                  # no VO for this scene: keep its durs
            for c in g["clips"]:
                new_clips.append(dict(c)); t += float(c["dur"])
            continue
        dur, n = float(m["dur"]), len(g["clips"])
        track.append({"scene": g["scene"], "file": m["file"], "start": round(t, 3),
                      "dur": round(dur, 3), "text": m.get("text", "")})
        for c in g["clips"]:
            nc = dict(c); nc["dur"] = round(dur / n, 3); new_clips.append(nc)
        t += dur

    out = dict(spec); out["clips"] = new_clips
    json.dump(out, open(a.out_assembly, "w", encoding="utf-8"), indent=2)
    json.dump(track, open(a.out_track, "w", encoding="utf-8"), indent=2)
    print(f"wrote {a.out_assembly} ({len(new_clips)} clips) and {a.out_track} "
          f"({len(track)} VO scenes, {t:.1f}s total)")


if __name__ == "__main__":
    main()
