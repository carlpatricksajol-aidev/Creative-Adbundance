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


# ---------------------------------------------------------------- keyless heuristic
# Raw creator b-roll follows a fixed shape: the creator walks up to the phone / hits record /
# stares into the lens waiting (SETUP), then performs the action, then walks back to stop it
# (TEARDOWN). The tell that works across every clip is the creator FACING or CROWDING the lens:
# during the action their face is turned away, occluded (drinking, mask on) or rotated (lying
# down), so a plain frontal-face detector goes quiet. Score windows on that plus camera-handling
# motion spikes and blur. No API key, no model download -- ships with OpenCV.

def _gray_frames(path, fps=4, width=240):
    """Decode the clip to a downscaled grayscale numpy stack (T,H,W)."""
    import numpy as np
    probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                            "stream=width,height", "-of", "csv=p=0", path], capture_output=True, text=True)
    try:
        sw, sh = [int(x) for x in probe.stdout.strip().split(",")[:2]]
    except Exception:
        return None
    w = width
    h = int(round(sh * (w / sw) / 2)) * 2
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vf", f"fps={fps},scale={w}:{h}",
                        "-pix_fmt", "gray", "-f", "rawvideo", "-"], capture_output=True)
    buf = r.stdout
    n = len(buf) // (w * h)
    if n < 4:
        return None
    return np.frombuffer(buf[:n * w * h], dtype=np.uint8).reshape(n, h, w)


# The renamer names each clip by what it shows ("3rdPOV_removing eye mask relieved"), so the
# filename says whether the beat we want is a MOVEMENT or a STILL moment. Without this the
# heuristic just finds the calmest faceless stretch, which shows "lying there" when the
# storyboard asked for "removing the mask".
MOVE_W = ("remov", "putting on", "put on", "swish", "pour", "typ", "walk", "open", "scroll",
          "tap", "swip", "crumpl", "toss", "writ", "dry", "unbox", "press", "shak", "stir",
          "mix", "pick", "grab", "reach", "biting", "pacing")
STILL_W = ("lying", "lie ", "laying", "rest", "sleep", "relax", "sitting", "still", "calm")


def action_bias(name):
    n = re.sub(r"[^a-z ]", " ", (name or "").lower())
    mv = any(w in n for w in MOVE_W)
    st = any(w in n for w in STILL_W)
    if mv and not st:
        return "move"
    if st and not mv:
        return "still"
    return "any"


def heuristic_window(path, need, fps=4, bias="any"):
    """Best start time for a `need`-second window, without any vision API. Returns (start, why)."""
    try:
        import cv2
        import numpy as np
    except ImportError:
        return None, "opencv/numpy missing"
    F = _gray_frames(path, fps=fps)
    if F is None:
        return None, "decode failed"
    T, H, W = F.shape
    Ff = F.astype(np.float32)

    motion = np.zeros(T, dtype=np.float32)                       # camera handling / lunging at lens
    motion[1:] = np.abs(np.diff(Ff, axis=0)).mean(axis=(1, 2))
    med = float(np.median(motion[1:])) or 1e-3
    spike = (motion > med * 2.6).astype(np.float32)

    sharp = np.array([cv2.Laplacian(F[i], cv2.CV_32F).var() for i in range(T)], dtype=np.float32)
    smax = float(sharp.max()) or 1.0
    blur = 1.0 - np.clip(sharp / smax, 0, 1)                     # 1 = blurriest

    cas = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    face = np.zeros(T, dtype=np.float32)                         # frontal face area fraction
    for i in range(T):
        det = cas.detectMultiScale(F[i], scaleFactor=1.15, minNeighbors=5,
                                   minSize=(int(W * 0.10), int(W * 0.10)))
        if len(det):
            face[i] = max(w_ * h_ for _, _, w_, h_ in det) / float(W * H)
    fmax = float(face.max())
    facen = face / fmax if fmax > 0.02 else face * 0.0           # no real faces -> drop the term

    dur = T / float(fps)
    win = max(1, int(round(need * fps)))
    lo, hi = int(0.3 * fps), max(int(0.3 * fps) + 1, T - win - int(0.2 * fps))
    if hi <= lo:
        return None, "clip too short"

    best, bcost, parts = None, 1e9, None
    qt = max(1, win // 4)
    for s in range(lo, hi + 1):
        e = s + win
        f_, k_, b_ = facen[s:e].mean(), spike[s:e].mean(), blur[s:e].mean()
        # the window must END calm: creators sit up / walk back to stop recording, and a window
        # whose tail catches that shows the teardown (inn126 "lying down" ran into the sit-up)
        tail = motion[max(s, e - qt):e].mean() / med
        tailp = float(np.clip((tail - 1.2) / 2.0, 0, 1))
        act = motion[s:e].mean() / med                           # activity vs this clip's normal
        if bias == "move":                                       # the beat IS a movement
            actp = float(np.clip((1.05 - act) / 0.9, 0, 1))      # penalize a dead-still window
        elif bias == "still":
            actp = float(np.clip((act - 1.4) / 1.6, 0, 1))       # penalize a busy window
        else:
            actp = 0.0
        pos = s / float(max(1, T - win))
        edge = 0.35 * max(0.0, 0.18 - pos) / 0.18 + 0.30 * max(0.0, pos - 0.86) / 0.14
        cost = (2.2 * f_ + 1.4 * k_ + 0.5 * b_ + 0.9 * tailp + 1.1 * actp
                + 0.15 * pos + edge)                             # ties -> earlier
        if cost < bcost:
            best, bcost, parts = s, cost, (f_, k_, b_, tailp, actp)
    why = (f"bias={bias} face={parts[0]:.2f} spikes={parts[1]:.2f} blur={parts[2]:.2f} "
           f"tail={parts[3]:.2f} act={parts[4]:.2f} cost={bcost:.2f}")
    return round(best / float(fps), 2), why


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

    mode = "vision" if (OR_KEY or AN_KEY) else "heuristic (no vision key set)"
    print(f"b-roll window pick: {mode}")
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
        start = ask_vision(frames_at(src, times), desc, need) if (OR_KEY or AN_KEY) else None
        if start is None:                                        # no key, or the call failed
            start, why = heuristic_window(src, need, bias=action_bias(os.path.basename(src) + " " + desc))
            if start is not None:
                print(f"    heuristic: start={start}  ({why})")
        if start is not None:
            windows[os.path.basename(src)] = round(max(0.0, min(start, hi)), 2)

    json.dump(windows, open(a.out, "w", encoding="utf-8"), indent=2)
    print(f"wrote {a.out}: {len(windows)} b-roll window(s)")


if __name__ == "__main__":
    main()
