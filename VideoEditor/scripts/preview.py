#!/usr/bin/env python3
"""Render a watchable rough preview of the assembly from cut_plan.json (+ optional SRT).

Mirrors video-cut/cut.py's trim+concat (head/tail pads, micro audio fades) but driven
by cut_plan.json, then optionally burns the SRT captions so the team can SEE the
assembly. This is the 'show your work' artifact, NOT the deliverable (the FCP7 XML is).

Usage:
  python preview.py --plan cut_plan.json --out ad01.preview.mp4 [--srt ad01.srt]
"""
import argparse, json, os, subprocess

ap = argparse.ArgumentParser()
ap.add_argument("--plan", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--srt", default=None)
ap.add_argument("--fade", type=float, default=0.014)
ap.add_argument("--crf", type=int, default=20)
a = ap.parse_args()

plan = json.load(open(a.plan, encoding="utf-8-sig"))
src = plan["source"]
head, tail, dur = plan.get("head", 0.03), plan.get("tail", 0.07), plan.get("duration", 0.0)

parts, vl, al, idx = [], [], [], 0
for s in plan["segments"]:
    cs = max(0.0, s["on"] - head)
    ce = min(s["off"] + tail, dur) if dur else s["off"] + tail
    d = ce - cs
    if d <= 0:
        continue
    parts.append(
        f'[0:v]trim=start={cs:.3f}:end={ce:.3f},setpts=PTS-STARTPTS[v{idx}];'
        f'[0:a]atrim=start={cs:.3f}:end={ce:.3f},asetpts=PTS-STARTPTS,'
        f'afade=t=in:st=0:d={a.fade},afade=t=out:st={max(0, d - a.fade):.3f}:d={a.fade}[a{idx}]')
    vl.append(f'[v{idx}]'); al.append(f'[a{idx}]'); idx += 1

if idx == 0:
    raise SystemExit("no segments to render")

concat = "".join(v + au for v, au in zip(vl, al)) + f'concat=n={idx}:v=1:a=1[vout][aout]'
filt = os.path.splitext(a.out)[0] + "_filter.txt"
open(filt, "w", encoding="utf-8").write(";".join(parts) + ";" + concat)

aroll = a.out if not a.srt else os.path.splitext(a.out)[0] + "_aroll.mp4"
cmd = ["ffmpeg", "-y", "-i", src, "-filter_complex_script", filt,
       "-map", "[vout]", "-map", "[aout]",
       "-c:v", "libx264", "-crf", str(a.crf), "-preset", "veryfast", "-pix_fmt", "yuv420p",
       "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", aroll]
print("rendering A-roll preview ->", aroll)
r = subprocess.run(cmd, capture_output=True, text=True)
print("RC", r.returncode, "" if r.returncode == 0 else r.stderr[-1000:])

if a.srt and r.returncode == 0:
    srt = a.srt.replace("\\", "/").replace(":", "\\:")          # ffmpeg subtitles filter path escaping
    vf = f"subtitles='{srt}':force_style='Alignment=2,FontSize=16,Outline=2,MarginV=60'"
    cmd2 = ["ffmpeg", "-y", "-i", aroll, "-vf", vf,
            "-c:v", "libx264", "-crf", str(a.crf), "-preset", "veryfast", "-pix_fmt", "yuv420p",
            "-c:a", "copy", a.out]
    print("burning captions ->", a.out)
    r2 = subprocess.run(cmd2, capture_output=True, text=True)
    print("RC", r2.returncode, "" if r2.returncode == 0 else r2.stderr[-1000:])
