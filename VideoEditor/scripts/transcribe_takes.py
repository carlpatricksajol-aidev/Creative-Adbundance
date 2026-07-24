#!/usr/bin/env python3
"""Batch-transcribe talking-head takes to word-level transcripts, so the best take of each
script line can be picked (the A-roll edit decision). Extracts audio, runs faster-whisper
with word timestamps. Run with the project venv python (has faster-whisper).

Usage:
  python transcribe_takes.py --dir <folder> --patterns "118_*.MOV,Arbaz Khan*.MOV" --out takes.json [--model small.en]
"""
import argparse, fnmatch, json, os, subprocess, tempfile
from faster_whisper import WhisperModel


def match_files(d, patterns):
    """Case-INSENSITIVE glob, non-recursive like the original (so broll/ subfolders stay out).
    Linux globs are case-sensitive and creators name files .MOV/.mov/.Mp4 interchangeably."""
    pats = [p.strip().lower() for p in patterns.split(",")]
    return sorted(os.path.join(d, f) for f in os.listdir(d)
                  if os.path.isfile(os.path.join(d, f)) and any(fnmatch.fnmatch(f.lower(), p) for p in pats))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--patterns", required=True)          # comma-separated globs
    ap.add_argument("--out", required=True)
    ap.add_argument("--model", default="small.en")
    a = ap.parse_args()

    files = match_files(a.dir, a.patterns)
    print(f"{len(files)} takes to transcribe\n")
    model = WhisperModel(a.model, device="cpu", compute_type="int8")

    takes = []
    for f in files:
        fd, wav = tempfile.mkstemp(suffix=".wav"); os.close(fd)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", f, "-vn", "-ac", "1", "-ar", "16000", wav],
                       capture_output=True)
        segs, _ = model.transcribe(wav, word_timestamps=True, vad_filter=False, beam_size=5, language="en")
        words, text = [], []
        for s in segs:
            text.append(s.text.strip())
            for w in (s.words or []):
                words.append({"start": round(w.start, 2), "end": round(w.end, 2), "word": w.word.strip()})
        os.remove(wav)
        full = " ".join(text)
        takes.append({"file": f.replace("\\", "/"), "text": full, "words": words})
        print(f"{os.path.basename(f)[:38]:38} {len(words):4} words | {full[:90]}")

    json.dump(takes, open(a.out, "w", encoding="utf-8"), indent=2)
    print(f"\nwrote {a.out}: {len(takes)} takes")


if __name__ == "__main__":
    main()
