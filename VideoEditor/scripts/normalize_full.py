#!/usr/bin/env python3
"""Editor-friendly handoff: normalize each UNIQUE source clip to a FULL 1080x1920 / 30fps /
Rec.709 SDR file (the WHOLE clip, HDR->SDR tone-map when needed) and concatenate the
per-scene VO into ONE continuous file. The assembly is re-pointed to the full clips
KEEPING the original in-points, and the VO to the single file placed 0..end.

Net effect: the editor gets the whole original clip linked ONCE with the cuts placed as
in/out (scrub the full reference, re-trim freely) and one VO file -- but all the
conform/scale/HDR import gremlins are already gone. Delivery is 1080p so the full
normalized clip is loss-free for this ad.

Usage:
  python normalize_full.py --assembly assembly_picked_vo.json --vo-track vo_track.json \
      --out-dir <pkg> [--w 1080 --h 1920 --fps 30]
"""
import argparse, json, os, subprocess


def color_transfer(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0",
                        "-show_entries", "stream=color_transfer", "-of", "json", path],
                       capture_output=True, text=True)
    return (json.loads(r.stdout or "{}").get("streams") or [{}])[0].get("color_transfer", "")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--assembly", required=True)
    ap.add_argument("--vo-track", required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--w", type=int, default=1080)
    ap.add_argument("--h", type=int, default=1920)
    ap.add_argument("--fps", type=int, default=30)
    a = ap.parse_args()

    media = os.path.join(a.out_dir, "media")
    os.makedirs(media, exist_ok=True)
    spec = json.load(open(a.assembly, encoding="utf-8-sig"))
    track = json.load(open(a.vo_track, encoding="utf-8-sig"))
    fill = f"scale={a.w}:{a.h}:force_original_aspect_ratio=increase,crop={a.w}:{a.h},setsar=1"

    # 1) one FULL normalized clip per unique source (keep original in-points)
    norm = {}
    for c in spec["clips"]:
        src = os.path.abspath(c["file"].replace("\\", "/"))
        if src not in norm:
            hdr = color_transfer(src) in ("arib-std-b67", "smpte2084")
            out = os.path.join(media, os.path.splitext(os.path.basename(src))[0] + ".mp4")
            vf = (f"zscale=t=linear:npl=100,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:p=bt709:r=tv,"
                  f"{fill},fps={a.fps},format=yuv420p") if hdr else f"{fill},fps={a.fps},format=yuv420p"
            r = subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", src,
                                "-vf", vf, "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "19",
                                "-pix_fmt", "yuv420p", "-r", str(a.fps), out], capture_output=True, text=True)
            print(f"{'HDR' if hdr else 'SDR'} FULL <- {os.path.basename(src)[:42]:42} RC={r.returncode}")
            norm[src] = out.replace("\\", "/")
        c["file"] = norm[src]                      # original c['in']/c['dur'] index into the full clip

    # 2) concatenate the per-scene VO into ONE continuous file
    lst = os.path.join(media, "_vo.txt")
    with open(lst, "w", encoding="utf-8") as f:
        for e in track:
            f.write("file '" + os.path.abspath(e["file"].replace("\\", "/")) + "'\n")
    vo_full = os.path.join(media, "VO_full.mp3")
    subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0",
                    "-i", lst, "-c:a", "libmp3lame", "-q:a", "2", vo_full], capture_output=True, text=True)
    os.remove(lst)
    total = sum(float(e["dur"]) for e in track)
    new_track = [{"scene": "VO", "file": vo_full.replace("\\", "/"), "start": 0.0, "dur": round(total, 3)}]

    json.dump(spec, open(os.path.join(a.out_dir, "assembly.json"), "w", encoding="utf-8"), indent=2)
    json.dump(new_track, open(os.path.join(a.out_dir, "vo_track.json"), "w", encoding="utf-8"), indent=2)
    print(f"\n{len(norm)} full clips + 1 continuous VO ({total:.1f}s) -> {media}")


if __name__ == "__main__":
    main()
