#!/usr/bin/env python3
"""Pick the RIGHT MOMENT inside each b-roll clip (the deferred "best-window" step, now real).

Creator b-roll starts with setup: hitting record, walking into position, adjusting the
camera, staring into the lens. A fixed in-point offset shows that junk. This samples
frames across each used b-roll clip and asks a vision model, WITH the storyboard's shot
description, when the described action is actually underway - explicitly avoiding
setup/looking-at-camera moments. Output: broll_windows.json {clip basename: in_seconds}.

Vision backends (first available wins):
  VE_OPENROUTER_KEY  -> OpenRouter (model VE_VISION_MODEL, default google/gemini-2.5-flash)
  ANTHROPIC_API_KEY  -> Anthropic (claude-haiku-4-5)
No key -> writes an empty mapping and exits 0 (pipeline falls back to the old offset).

Usage:
  python pick_broll_window.py --picked picked_refined.json --storyboard storyboard.json \
      --input-dir <footage> --out broll_windows.json [--frames 8]
"""
import argparse, base64, glob, json, os, re, subprocess, sys, tempfile

OR_KEY = os.environ.get("VE_OPENROUTER_KEY", "")
AN_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
OR_MODEL = os.environ.get("VE_VISION_MODEL", "google/gemini-2.5-flash")


def dur_of(p):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p],
                       capture_output=True, text=True)
    return float((r.stdout or "0").strip() or 0)


def frames_at(path, times, width=420):
    """Extract downscaled jpegs at the given timestamps. Returns [(t, jpeg_bytes)]."""
    out = []
    tmp = tempfile.mkdtemp()
    for i, t in enumerate(times):
        fp = os.path.join(tmp, f"f{i:02d}.jpg")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{t:.2f}", "-i", path,
                        "-frames:v", "1", "-vf", f"scale={width}:-1", "-q:v", "4", fp], capture_output=True)
        if os.path.exists(fp):
            out.append((t, open(fp, "rb").read()))
    return out


def ask_vision(frames, desc, need):
    """Return the chosen window start (seconds) or None. frames = [(t, jpeg_bytes)]."""
    stamp = ", ".join(f"frame {i+1} = t={t:.1f}s" for i, (t, _) in enumerate(frames))
    prompt = (
        "These are frames sampled from ONE raw creator b-roll clip for a video ad.\n"
        f"The storyboard says this clip should show: \"{desc}\"\n"
        f"Timestamps: {stamp}\n\n"
        f"Pick the best start time for a {need:.1f}-second window where the DESCRIBED ACTION is fully "
        "underway. Creator b-roll begins with setup junk you must skip: walking into position, adjusting "
        "or reaching toward the camera, staring into the lens waiting, arranging props. Only choose a "
        "moment where the action itself is happening (unless the description explicitly says the creator "
        "speaks or looks to camera).\n"
        'Reply with ONLY JSON: {"start": <seconds>, "reason": "<short>"}'
    )
    try:
        import urllib.request
        if OR_KEY:
            content = [{"type": "text", "text": prompt}] + [
                {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + base64.b64encode(b).decode()}}
                for _, b in frames]
            body = {"model": OR_MODEL, "max_tokens": 200,
                    "messages": [{"role": "user", "content": content}]}
            req = urllib.request.Request("https://openrouter.ai/api/v1/chat/completions",
                                         data=json.dumps(body).encode(),
                                         headers={"Authorization": "Bearer " + OR_KEY,
                                                  "Content-Type": "application/json"})
            txt = json.load(urllib.request.urlopen(req, timeout=90))["choices"][0]["message"]["content"]
        elif AN_KEY:
            content = [{"type": "text", "text": prompt}] + [
                {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg",
                                             "data": base64.b64encode(b).decode()}} for _, b in frames]
            body = {"model": "claude-haiku-4-5", "max_tokens": 200,
                    "messages": [{"role": "user", "content": content}]}
            req = urllib.request.Request("https://api.anthropic.com/v1/messages",
                                         data=json.dumps(body).encode(),
                                         headers={"x-api-key": AN_KEY, "anthropic-version": "2023-06-01",
                                                  "Content-Type": "application/json"})
            txt = json.load(urllib.request.urlopen(req, timeout=90))["content"][0]["text"]
        else:
            return None
        m = re.search(r'\{[^{}]*"start"[^{}]*\}', txt)
        if m:
            j = json.loads(m.group(0))
            print(f"    vision: start={j.get('start')}  ({str(j.get('reason', ''))[:70]})")
            return float(j["start"])
    except Exception as e:
        print(f"    vision failed ({e}) - falling back")
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--picked", required=True)
    ap.add_argument("--storyboard", required=True)
    ap.add_argument("--input-dir", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--frames", type=int, default=8)
    a = ap.parse_args()

    picked = json.load(open(a.picked, encoding="utf-8-sig"))
    sb = json.load(open(a.storyboard, encoding="utf-8-sig"))
    notes = {str(s["id"]): (s.get("note") or "") for s in sb.get("scenes", [])}

    if not (OR_KEY or AN_KEY):
        json.dump({}, open(a.out, "w"))
        print("no vision key (VE_OPENROUTER_KEY / ANTHROPIC_API_KEY) - b-roll in-points will use the default offset")
        return

    windows = {}
    for r in picked:
        if r.get("type") != "broll" or not r.get("broll"):
            continue
        src = os.path.join(a.input_dir, r["broll"])
        if not os.path.exists(src):
            hits = glob.glob(os.path.join(a.input_dir, "**", r["broll"]), recursive=True)
            if not hits:
                continue
            src = hits[0]
        need = float(r["dur"])
        total = dur_of(src)
        if total <= need + 0.6:                      # clip barely fits - nothing to choose
            continue
        lo, hi = 0.3, max(0.4, total - need - 0.2)   # a window START must leave room for the window
        n = max(4, a.frames)
        times = [lo + (hi - lo) * i / (n - 1) for i in range(n)]
        desc = notes.get(str(r["scene"])) or os.path.splitext(r["broll"])[0].replace("_", " ")
        print(f"  {r['scene']}: {os.path.basename(src)}  ({total:.1f}s, need {need:.1f}s)")
        start = ask_vision(frames_at(src, times), desc, need)
        if start is not None:
            windows[os.path.basename(src)] = round(max(0.0, min(start, hi)), 2)

    json.dump(windows, open(a.out, "w", encoding="utf-8"), indent=2)
    print(f"wrote {a.out}: {len(windows)} b-roll window(s)")


if __name__ == "__main__":
    main()
