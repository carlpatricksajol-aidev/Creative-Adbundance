#!/usr/bin/env python3
"""Build inputs to time captions off the FULL concatenated VO (one continuous transcription)
instead of tiny per-scene clips -- which avoids faster-whisper over-extending word timestamps
past a short segment (caption bleeding into the next scene). Emits a one-entry vo-track for
VO_full and a single combined script line.

Usage:
  python full_caption_inputs.py --lines lines.json --vo-full <pkg>/media/VO_full.mp3 --out-dir work/innerwell
"""
import argparse, json, os, subprocess


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lines", required=True)
    ap.add_argument("--vo-full", required=True)
    ap.add_argument("--out-dir", required=True)
    a = ap.parse_args()

    lines = json.load(open(a.lines, encoding="utf-8-sig"))
    joined = " ".join(l["text"] for l in lines)
    json.dump([{"scene": "all", "text": joined}],
              open(os.path.join(a.out_dir, "lines_all.json"), "w", encoding="utf-8"), indent=2)

    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                               "-of", "csv=p=0", a.vo_full], capture_output=True, text=True).stdout.strip())
    json.dump([{"scene": "all", "file": a.vo_full.replace("\\", "/"), "start": 0.0, "dur": round(dur, 3)}],
              open(os.path.join(a.out_dir, "vo_track_full.json"), "w", encoding="utf-8"), indent=2)
    print(f"VO_full {dur:.2f}s, combined script {len(joined.split())} words")


if __name__ == "__main__":
    main()
