#!/usr/bin/env python3
"""Normalize each used clip to a clean 1080x1920, 30fps, SDR file (scale-to-fill, and
HDR HLG/PQ -> Rec.709 tone-map when the source is HDR), with a handle on each side for
trimming. Also stages the VO. Everything lands in one media/ folder, and the assembly +
vo-track are re-pointed to it.

This removes every FCP7-XML conform gremlin at once -- frame rate, scale/zoom, and HDR
oversaturation -- so the timeline drops into Premiere clean and the cuts match the preview.

Usage:
  python normalize_clips.py --assembly assembly_picked_vo.json --vo-track vo_track.json \
      --out-dir <pkg> [--handle 0.5]
"""
import argparse, json, os, subprocess, shutil


def probe(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0",
                        "-show_entries", "stream=color_transfer,duration",
                        "-show_entries", "format=duration", "-of", "json", path],
                       capture_output=True, text=True)
    info = json.loads(r.stdout or "{}")
    st = (info.get("streams") or [{}])[0]
    dur = float(st.get("duration") or info.get("format", {}).get("duration") or 0)
    return dur, st.get("color_transfer", "")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--assembly", required=True)
    ap.add_argument("--vo-track", required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--handle", type=float, default=0.5)
    ap.add_argument("--w", type=int, default=1080)
    ap.add_argument("--h", type=int, default=1920)
    ap.add_argument("--fps", type=int, default=30)
    a = ap.parse_args()

    media = os.path.join(a.out_dir, "media")
    os.makedirs(media, exist_ok=True)
    spec = json.load(open(a.assembly, encoding="utf-8-sig"))
    track = json.load(open(a.vo_track, encoding="utf-8-sig"))

    fill = f"scale={a.w}:{a.h}:force_original_aspect_ratio=increase,crop={a.w}:{a.h},setsar=1"
    for i, c in enumerate(spec["clips"]):
        src = os.path.abspath(c["file"].replace("\\", "/"))
        dur, ct = probe(src)
        in_s, d = float(c["in"]), float(c["dur"])
        hb = min(a.handle, in_s)
        ha = min(a.handle, max(0.0, dur - (in_s + d))) if dur else a.handle
        start, total = in_s - hb, hb + d + ha
        hdr = ct in ("arib-std-b67", "smpte2084")
        if hdr:
            vf = (f"zscale=t=linear:npl=100,tonemap=hable:desat=0,"
                  f"zscale=t=bt709:m=bt709:p=bt709:r=tv,{fill},fps={a.fps},format=yuv420p")
        else:
            vf = f"{fill},fps={a.fps},format=yuv420p"
        out = os.path.join(media, f"clip{i:02d}.mp4")
        r = subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                            "-ss", f"{start:.3f}", "-i", src, "-t", f"{total:.3f}",
                            "-vf", vf, "-an", "-c:v", "libx264", "-preset", "medium",
                            "-crf", "18", "-pix_fmt", "yuv420p", "-r", str(a.fps), out],
                           capture_output=True, text=True)
        print(f"clip{i:02d} {'HDR' if hdr else 'SDR'} <- {os.path.basename(src)[:34]:34} RC={r.returncode}"
              + ("" if r.returncode == 0 else "  " + r.stderr[-160:]))
        c["file"] = out.replace("\\", "/")
        c["in"] = round(hb, 3)                        # wanted segment now starts at the handle

    for e in track:
        s = os.path.abspath(e["file"].replace("\\", "/"))
        dst = os.path.join(media, os.path.basename(s))
        if not os.path.exists(dst):
            shutil.copy2(s, dst)
        e["file"] = dst.replace("\\", "/")

    json.dump(spec, open(os.path.join(a.out_dir, "assembly.json"), "w", encoding="utf-8"), indent=2)
    json.dump(track, open(os.path.join(a.out_dir, "vo_track.json"), "w", encoding="utf-8"), indent=2)
    print(f"\nnormalized {len(spec['clips'])} clips + staged {len(track)} VO into {media}")


if __name__ == "__main__":
    main()
