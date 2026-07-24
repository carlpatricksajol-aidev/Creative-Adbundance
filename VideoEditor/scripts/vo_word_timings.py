#!/usr/bin/env python3
"""Transcribe the per-scene VO mp3s to WORD timings on the assembled timeline.

For word-by-word (karaoke) captions: each scene VO is transcribed with faster-whisper
word timestamps, offset by the scene's timeline start (from vo_track.json), producing
words_global.json = [{start,end,word,scene}] in assembled-output seconds.

Run with the project venv python (has faster-whisper).

Usage:
  python vo_word_timings.py --vo-track vo_track.json --out words_global.json [--model small.en]
"""
import argparse, json
from faster_whisper import WhisperModel


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--vo-track", required=True)
    ap.add_argument("--out", default="words_global.json")
    ap.add_argument("--model", default="small.en")
    a = ap.parse_args()

    track = json.load(open(a.vo_track, encoding="utf-8-sig"))
    model = WhisperModel(a.model, device="cpu", compute_type="int8")
    words = []
    for e in track:
        segs, _ = model.transcribe(e["file"], word_timestamps=True, vad_filter=False,
                                   beam_size=5, language="en")
        off, segdur = float(e["start"]), float(e.get("dur") or 0)
        sw = [[w.start, w.end, w.word.strip()] for s in segs for w in (s.words or [])]
        if segdur and sw and sw[-1][1] > segdur:          # whisper over-extended past the clip -> rescale to fit
            sc = segdur / sw[-1][1]
            sw = [[st * sc, en * sc, tok] for st, en, tok in sw]
        for st, en, tok in sw:
            words.append({"start": round(off + st, 3), "end": round(off + en, 3), "word": tok, "scene": e["scene"]})
        print(f'{e["scene"]}: +{off:.2f}s  ({len(sw)} words)')
    words.sort(key=lambda x: x["start"])
    json.dump(words, open(a.out, "w", encoding="utf-8"), indent=2)
    print(f"wrote {a.out}: {len(words)} words")


if __name__ == "__main__":
    main()
