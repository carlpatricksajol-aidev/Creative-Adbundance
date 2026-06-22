#!/usr/bin/env python3
"""Tighten the VO by trimming the leading/trailing silence on each scene line (removes the
dead air between sentences once concatenated), then re-time the cuts to the shortened VO so
the video compresses with it -- v1 pacing -- while keeping the vision-selected in-points and
reusing the already-normalized full clips (no re-encode of the footage).

Writes the tightened package in place:
  <pkg>/media/VO_full.mp3   (de-silenced, concatenated)
  <pkg>/assembly.json       (clip durs scaled per scene, files -> the full clips in media/)
  <pkg>/vo_track.json       (single VO entry, 0..total)

Usage:
  python tighten_vo.py --assembly assembly_picked_vo.json --vo-track vo_track.json --pkg <handoff dir>
"""
import argparse, json, os, shutil, subprocess

TRIM = ("silenceremove=start_periods=1:start_threshold=-38dB,areverse,"
        "silenceremove=start_periods=1:start_threshold=-38dB,areverse")


def dur_of(p):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "csv=p=0", p], capture_output=True, text=True)
    return float((r.stdout or "0").strip() or 0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--assembly", required=True)
    ap.add_argument("--vo-track", required=True)
    ap.add_argument("--pkg", required=True)
    a = ap.parse_args()
    media = os.path.join(a.pkg, "media")
    spec = json.load(open(a.assembly, encoding="utf-8-sig"))
    track = json.load(open(a.vo_track, encoding="utf-8-sig"))
    cap = os.path.join(a.pkg, "_capwork")              # per-scene tightened lines, kept for the karaoke caption pipeline
    os.makedirs(cap, exist_ok=True)

    # 1) trim lead/trail silence per scene line; record new durations + per-scene track (scene order)
    newdur, tight_files, scenes_track, cursor = {}, [], [], 0.0
    for e in track:
        src = os.path.abspath(e["file"].replace("\\", "/"))
        out = os.path.join(cap, os.path.splitext(os.path.basename(src))[0] + ".mp3")
        subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", src,
                        "-af", TRIM, "-c:a", "libmp3lame", "-q:a", "2", out], capture_output=True, text=True)
        old, new = float(e["dur"]), dur_of(out)
        newdur[e["scene"]] = (old, new)
        tight_files.append(out)
        scenes_track.append({"scene": e["scene"], "file": out.replace("\\", "/"),
                             "start": round(cursor, 3), "dur": round(new, 3)})
        cursor += new
        print(f"{e['scene']:8} {old:5.2f}s -> {new:5.2f}s")

    # 2) re-time clips per scene (scale durs to the new scene length, keep in-points),
    #    re-point each clip to its already-normalized full clip in media/
    by_scene = {}
    for c in spec["clips"]:
        by_scene.setdefault(c["scene"], []).append(c)
    for scene, cs in by_scene.items():
        old_t = sum(float(c["dur"]) for c in cs)
        k = (newdur[scene][1] / old_t) if old_t else 1.0
        for c in cs:
            c["dur"] = round(float(c["dur"]) * k, 3)
            base = os.path.splitext(os.path.basename(c["file"].replace("\\", "/")))[0]
            c["file"] = os.path.join(media, base + ".mp4").replace("\\", "/")

    # 3) concat the tightened scene lines into one VO + keep the per-scene track for captions
    lst = os.path.join(cap, "_list.txt")
    open(lst, "w", encoding="utf-8").write("".join(f"file '{p}'\n" for p in tight_files))
    vo_full = os.path.join(media, "VO_full.mp3")
    subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0",
                    "-i", lst, "-c:a", "libmp3lame", "-q:a", "2", vo_full], capture_output=True, text=True)
    os.remove(lst)
    total = round(sum(n for _, n in newdur.values()), 3)

    json.dump(scenes_track, open(os.path.join(cap, "vo_track_scenes.json"), "w", encoding="utf-8"), indent=2)
    json.dump(spec, open(os.path.join(a.pkg, "assembly.json"), "w", encoding="utf-8"), indent=2)
    json.dump([{"scene": "VO", "file": vo_full.replace("\\", "/"), "start": 0.0, "dur": total}],
              open(os.path.join(a.pkg, "vo_track.json"), "w", encoding="utf-8"), indent=2)
    old_total = round(sum(o for o, _ in newdur.values()), 1)
    print(f"\nVO {old_total}s -> {total:.1f}s  (cuts re-timed to match)")


if __name__ == "__main__":
    main()
