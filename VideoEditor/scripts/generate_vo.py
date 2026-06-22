#!/usr/bin/env python3
"""Generate per-scene voiceover with ElevenLabs TTS, to pair to the assembly.

Calls ElevenLabs text-to-speech once per scene line, saves an mp3 per scene, probes
each duration, and writes vo_manifest.json. The per-scene durations then drive scene
timing in the assembly (each scene lasts as long as its VO line).

API key: from env ELEVENLABS_API_KEY, else a KEY=VALUE file (--key-file, default
VideoEditor/.env), else a raw-key file. Never commit the key.

Usage:
  python generate_vo.py --lines vo_lines.json --out-dir work/onsen/vo \
      --manifest work/onsen/vo/vo_manifest.json [--voice <id>] [--model eleven_multilingual_v2]

vo_lines.json: [{"scene":"Hook 1","text":"If you've been to Japan, ..."}, ...]
"""
import argparse, json, os, subprocess, sys
import urllib.request, urllib.error

DEF_VOICE = "21m00Tcm4TlvDq8ikWAM"   # ElevenLabs "Rachel" (override with --voice)
DEF_MODEL = "eleven_multilingual_v2"


def load_key(key_file):
    k = os.environ.get("ELEVENLABS_API_KEY")
    if k:
        return k.strip()
    if key_file and os.path.exists(key_file):
        for line in open(key_file, encoding="utf-8"):
            line = line.strip()
            if line.upper().startswith("ELEVENLABS_API_KEY"):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
        # fall back: first non-empty line is the raw key
        for line in open(key_file, encoding="utf-8"):
            if line.strip():
                return line.strip()
    return None


def probe_dur(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "json", path], capture_output=True, text=True)
    try:
        return float(json.loads(r.stdout)["format"]["duration"])
    except Exception:
        return 0.0


def tts(text, voice, model, key, out_path):
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice}"
    body = json.dumps({"text": text, "model_id": model,
                       "voice_settings": {"stability": 0.45, "similarity_boost": 0.8,
                                          "style": 0.0, "use_speaker_boost": True}}).encode()
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        open(out_path, "wb").write(resp.read())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lines", required=True)
    ap.add_argument("--out-dir", default="vo")
    ap.add_argument("--manifest", default="vo_manifest.json")
    ap.add_argument("--voice", default=DEF_VOICE)
    ap.add_argument("--model", default=DEF_MODEL)
    ap.add_argument("--key-file", default="VideoEditor/.env")
    a = ap.parse_args()

    key = load_key(a.key_file)
    if not key:
        sys.exit(f"No ElevenLabs API key. Set ELEVENLABS_API_KEY or put it in {a.key_file}")
    os.makedirs(a.out_dir, exist_ok=True)
    lines = json.load(open(a.lines, encoding="utf-8-sig"))
    manifest = []
    for i, ln in enumerate(lines, start=1):
        slug = f"{i:02d}_" + "".join(c for c in ln["scene"] if c.isalnum() or c in " _-").strip().replace(" ", "_")
        mp3 = os.path.join(a.out_dir, slug + ".mp3")
        print(f"[{i}/{len(lines)}] {ln['scene']}: {ln['text'][:48]}...")
        try:
            tts(ln["text"], a.voice, a.model, key, mp3)
        except urllib.error.HTTPError as e:
            sys.exit(f"ElevenLabs error {e.code}: {e.read().decode(errors='replace')[:300]}")
        dur = probe_dur(mp3)
        manifest.append({"scene": ln["scene"], "text": ln["text"], "file": mp3.replace("\\", "/"), "dur": round(dur, 3)})
        print(f"     -> {mp3} ({dur:.2f}s)")
    json.dump(manifest, open(a.manifest, "w", encoding="utf-8"), indent=2)
    print(f"\nwrote {a.manifest}: {len(manifest)} VO clips, total {sum(m['dur'] for m in manifest):.1f}s")


if __name__ == "__main__":
    main()
