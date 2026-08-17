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
import argparse, json, os, re, shutil, subprocess


def color_transfer(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0",
                        "-show_entries", "stream=color_transfer", "-of", "json", path],
                       capture_output=True, text=True)
    return (json.loads(r.stdout or "{}").get("streams") or [{}])[0].get("color_transfer", "")


def measure_loudness(path):
    """Pass 1 of two-pass loudnorm: measure the file and return the measured_* values."""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", path, "-af",
                        "loudnorm=I=-14:TP=-1:LRA=11:print_format=json", "-f", "null", "-"],
                       capture_output=True, text=True)
    m = re.findall(r"\{[^{}]*\"input_i\"[^{}]*\}", r.stderr, re.S)
    if not m:
        return None
    try:
        j = json.loads(m[-1])
        return {k: j[k] for k in ("input_i", "input_tp", "input_lra", "input_thresh", "target_offset")}
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--assembly", required=True)
    ap.add_argument("--vo-track", required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--w", type=int, default=1080)
    ap.add_argument("--h", type=int, default=1920)
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--fade", type=float, default=0.03, help="fade in/out on each VO segment, kills the click at scene joins")
    ap.add_argument("--loudness", type=float, default=-14.0, help="target LUFS for the VO (-14 is the social/streaming norm)")
    ap.add_argument("--no-loudnorm", action="store_true", help="leave the VO level exactly as recorded")
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

    # 2) concatenate the per-scene VO into ONE continuous file.
    #    Butt-joining trimmed segments leaves a click at every scene edge, so each segment gets a
    #    short fade in/out first. Then the whole VO is brought to broadcast/social loudness, so the
    #    preview and the editor's timeline are not at whatever level the creator's phone recorded.
    fdir = os.path.join(media, "_fade")
    os.makedirs(fdir, exist_ok=True)
    lst = os.path.join(media, "_vo.txt")
    with open(lst, "w", encoding="utf-8") as f:
        for i, e in enumerate(track):
            src = os.path.abspath(e["file"].replace("\\", "/"))
            dur = float(e["dur"])
            d = min(a.fade, max(0.004, dur / 4.0))          # never fade more than a quarter of a short scene
            seg = os.path.join(fdir, f"{i:03d}.wav")
            r = subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", src, "-af",
                                f"afade=t=in:st=0:d={d:.3f},afade=t=out:st={max(0.0, dur - d):.3f}:d={d:.3f}",
                                "-c:a", "pcm_s16le", "-ar", "44100", seg], capture_output=True, text=True)
            f.write("file '" + (seg if r.returncode == 0 else src).replace("\\", "/") + "'\n")
    raw = os.path.join(media, "_vo_raw.wav")
    subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0",
                    "-i", lst, "-c:a", "pcm_s16le", raw], capture_output=True, text=True)

    vo_full = os.path.join(media, "VO_full.mp3")
    af = None
    if not a.no_loudnorm:
        meas = measure_loudness(raw)
        if meas:                                            # linear=true -> one gain move, no pumping
            af = (f"loudnorm=I={a.loudness}:TP=-1:LRA=11:linear=true"
                  f":measured_I={meas['input_i']}:measured_TP={meas['input_tp']}"
                  f":measured_LRA={meas['input_lra']}:measured_thresh={meas['input_thresh']}"
                  f":offset={meas['target_offset']}")
            print(f"VO loudness {meas['input_i']} LUFS -> {a.loudness} LUFS")
        else:
            print("VO loudness: measurement failed, leaving the level untouched")
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", raw]
    if af:
        cmd += ["-af", af]
    cmd += ["-c:a", "libmp3lame", "-q:a", "2", vo_full]
    subprocess.run(cmd, capture_output=True, text=True)

    os.remove(lst)
    os.remove(raw)
    shutil.rmtree(fdir, ignore_errors=True)
    total = sum(float(e["dur"]) for e in track)
    new_track = [{"scene": "VO", "file": vo_full.replace("\\", "/"), "start": 0.0, "dur": round(total, 3)}]

    json.dump(spec, open(os.path.join(a.out_dir, "assembly.json"), "w", encoding="utf-8"), indent=2)
    json.dump(new_track, open(os.path.join(a.out_dir, "vo_track.json"), "w", encoding="utf-8"), indent=2)
    print(f"\n{len(norm)} full clips + 1 continuous VO ({total:.1f}s) -> {media}")


if __name__ == "__main__":
    main()
