#!/usr/bin/env python3
"""Transcribe a meeting recording to segments, on CPU, with the venv that already has
faster-whisper (the video editor's). Prints ONE json object on stdout; progress goes to stderr
so the caller can parse stdout blindly.

  python transcribe_meeting.py --audio /path/audio.webm [--model small.en] [--language en]

Differences from VideoEditor/scripts/transcribe_takes.py, and why:
  - vad_filter=True: a meeting is mostly silence and cross-talk. VAD skips the dead air, which
    is most of the runtime saved, and stops whisper hallucinating text into long pauses.
  - no word_timestamps: the editor needs word-level times to cut on; we only need to point a
    reviewer at roughly where a quote was said, and segment-level is ~10x cheaper.
  - condition_on_previous_text=False: on hour-long audio whisper otherwise drifts into
    repeating an earlier phrase after a pause. That drift would show up as an invented quote,
    which the evidence check then deletes — better to not create it.
"""
import argparse, json, os, subprocess, sys, tempfile

from faster_whisper import WhisperModel


def to_wav(src: str) -> str:
    """webm/opus straight from MediaRecorder -> 16k mono wav. ffmpeg is already on the box."""
    out = os.path.join(tempfile.gettempdir(), os.path.basename(src) + ".16k.wav")
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-vn", "-ac", "1", "-ar", "16000", out],
        check=True,
    )
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", required=True)
    ap.add_argument("--model", default="small.en")
    ap.add_argument("--language", default="en")
    a = ap.parse_args()

    if not os.path.exists(a.audio):
        print(f"no such audio: {a.audio}", file=sys.stderr)
        return 2

    wav = to_wav(a.audio)
    print(f"loading {a.model} (cpu/int8)", file=sys.stderr)
    model = WhisperModel(a.model, device="cpu", compute_type="int8")

    segments, info = model.transcribe(
        wav,
        language=a.language,
        beam_size=5,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 700},
        condition_on_previous_text=False,
    )

    out, parts = [], []
    for s in segments:
        text = s.text.strip()
        if not text:
            continue
        out.append({"start": round(s.start, 2), "end": round(s.end, 2), "speaker": None, "text": text})
        parts.append(text)
        if len(out) % 25 == 0:
            print(f"  {len(out)} segments, {int(s.end)}s in", file=sys.stderr)

    full = " ".join(parts)
    print(f"done: {len(out)} segments, {len(full.split())} words", file=sys.stderr)

    json.dump(
        {
            "text": full,
            "segments": out,
            "language": info.language,
            "durationSec": round(info.duration, 2),
            "wordCount": len(full.split()),
        },
        sys.stdout,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
