#!/usr/bin/env python3
"""Pick the best in-point per clip.

Stage 1 (OpenCV, always): extract a downscaled frame sequence, score each candidate
window for SHARPNESS (Laplacian variance) and STEADINESS (low jitter), return the top
non-overlapping windows.
Stage 2 (Claude vision, optional --vision): rate each top window's frame for whether
the PRODUCT (towel) is clearly visible and well-framed, then re-rank. Needs
ANTHROPIC_API_KEY in the environment.

Outputs best_windows.json {file: {dur, windows:[{in, ocv, vision?, final}]}} and a
contact sheet of the chosen frames for review.

Usage:
  python select_best.py --files files.txt --dur 1.8 --topk 3 \
      --out best_windows.json --sheet picks_contact.png [--vision] [--vision-model ...]
"""
import argparse, json, os, subprocess, tempfile, shutil, base64, urllib.request
import cv2, numpy as np

VISION_MODEL = "claude-haiku-4-5-20251001"


def extract_frames(path, fps=3, width=360):
    tmp = tempfile.mkdtemp()
    subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", path,
                    "-vf", f"fps={fps},scale={width}:-1", "-q:v", "3", os.path.join(tmp, "f%04d.jpg")],
                   capture_output=True)
    frames = []
    for fn in sorted(os.listdir(tmp)):
        img = cv2.imread(os.path.join(tmp, fn))
        if img is not None:
            frames.append(img)
    return tmp, frames


def score_frames(frames):
    sharp, motion, prev = [], [], None
    for img in frames:
        g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        sharp.append(cv2.Laplacian(g, cv2.CV_64F).var())
        motion.append(0.0 if prev is None else float(np.mean(cv2.absdiff(g, prev))))
        prev = g
    return np.array(sharp), np.array(motion)


def best_windows(sharp, motion, fps, win, topk):
    n = len(sharp)
    wlen = max(1, int(round(win * fps)))
    if n < wlen:
        return [(0.0, 0.0)]
    sz = (sharp - sharp.mean()) / (sharp.std() + 1e-6)
    mz = (motion - motion.mean()) / (motion.std() + 1e-6)
    cands = []
    for i in range(0, n - wlen + 1):
        ws, wm, wpk = sz[i:i + wlen].mean(), mz[i:i + wlen].mean(), mz[i:i + wlen].max()
        edge = max(mz[i], mz[i + wlen - 1])                # motion at the cut edges -> clean cuts
        score = ws - 0.5 * wm - 0.3 * max(0.0, wpk) - 0.7 * max(0.0, edge)
        cands.append((round(i / fps, 2), float(score)))
    cands.sort(key=lambda x: -x[1])
    chosen = []
    for t, sc in cands:
        if all(abs(t - c[0]) >= win for c in chosen):
            chosen.append((t, sc))
        if len(chosen) >= topk:
            break
    return chosen


PROMPT = ("Frame from a towel product ad. Rate 0-10 how clearly the towel/product is visible "
          "AND well-framed (penalize: only a tiny corner of towel, blurry, an empty room, or "
          "the product not the subject). Reply ONLY the number.")


def vision_rate(img, key, model, provider):
    b = base64.b64encode(cv2.imencode(".jpg", img)[1].tobytes()).decode()
    if provider == "openrouter":
        url = "https://openrouter.ai/api/v1/chat/completions"
        body = json.dumps({"model": model, "max_tokens": 16, "messages": [{"role": "user", "content": [
            {"type": "text", "text": PROMPT},
            {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + b}}]}]}).encode()
        headers = {"Authorization": "Bearer " + key, "Content-Type": "application/json"}
        pick = lambda j: j["choices"][0]["message"]["content"]
    else:
        url = "https://api.anthropic.com/v1/messages"
        body = json.dumps({"model": model, "max_tokens": 16, "messages": [{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": b}},
            {"type": "text", "text": PROMPT}]}]}).encode()
        headers = {"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"}
        pick = lambda j: j["content"][0]["text"]
    req = urllib.request.Request(url, data=body, method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            txt = pick(json.loads(r.read())).strip()
        return float("".join(c for c in txt if c.isdigit() or c == ".") or 0)
    except Exception as e:
        print("   vision error:", str(e)[:160])
        return None


def frame_at(path, sec, width=216):
    cap = cv2.VideoCapture(path)
    cap.set(cv2.CAP_PROP_POS_MSEC, sec * 1000)
    ok, fr = cap.read()
    cap.release()
    if not ok:
        return None
    h, w = fr.shape[:2]
    return cv2.resize(fr, (width, int(h * width / w)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--files", required=True)
    ap.add_argument("--dur", type=float, default=1.8)
    ap.add_argument("--topk", type=int, default=3)
    ap.add_argument("--out", default="best_windows.json")
    ap.add_argument("--sheet", default="picks_contact.png")
    ap.add_argument("--vision", action="store_true")
    ap.add_argument("--vision-model", default=VISION_MODEL)
    a = ap.parse_args()

    provider, key, model = None, None, a.vision_model
    if a.vision:
        if os.environ.get("OPENROUTER_API_KEY"):
            provider, key = "openrouter", os.environ["OPENROUTER_API_KEY"]
            if model == VISION_MODEL:
                model = "anthropic/claude-haiku-4.5"
        elif os.environ.get("ANTHROPIC_API_KEY"):
            provider, key = "anthropic", os.environ["ANTHROPIC_API_KEY"]
        else:
            print("!! --vision set but no OPENROUTER_API_KEY / ANTHROPIC_API_KEY; OpenCV only")
    files = [l.strip() for l in open(a.files, encoding="utf-8") if l.strip()]

    result, sheet = {}, []
    for f in files:
        tmp, frames = extract_frames(f)
        dur = round(len(frames) / 3.0, 2)
        if not frames:
            shutil.rmtree(tmp, ignore_errors=True); continue
        sharp, motion = score_frames(frames)
        wins = best_windows(sharp, motion, 3, a.dur, a.topk)
        entries = []
        for t, sc in wins:
            e = {"in": t, "ocv": round(sc, 3)}
            if key:
                fr = frames[min(len(frames) - 1, int((t + a.dur / 2) * 3))]
                v = vision_rate(fr, key, model, provider)
                if v is not None:
                    e["vision"] = v
            entries.append(e)
        # final ranking: vision (if present) dominates, ocv breaks ties
        for e in entries:
            e["final"] = round(e.get("vision", 5.0) + 0.3 * e["ocv"], 3)
        entries.sort(key=lambda x: -x["final"])
        result[f] = {"dur": dur, "windows": entries}
        shutil.rmtree(tmp, ignore_errors=True)
        best = entries[0]["in"]
        thumb = frame_at(f, best + a.dur / 2)
        if thumb is not None:
            sheet.append((os.path.basename(f), thumb))
        print(f"{os.path.basename(f)[:40]:42} dur={dur:5.1f} best_in={best:.2f}"
              f"{'  vision=' + str(entries[0].get('vision')) if key else ''}")

    json.dump(result, open(a.out, "w"), indent=2)
    if sheet:
        cw, ch, cols = 216, 384, 5
        rows = (len(sheet) + cols - 1) // cols
        canvas = np.zeros((rows * ch, cols * cw, 3), dtype=np.uint8)
        for i, (name, fr) in enumerate(sheet):
            r, c = divmod(i, cols)
            fh, fw = fr.shape[:2]
            canvas[r * ch:r * ch + min(fh, ch), c * cw:c * cw + min(fw, cw)] = fr[:ch, :cw]
        cv2.imwrite(a.sheet, canvas)
    print(f"wrote {a.out} and {a.sheet}")


if __name__ == "__main__":
    main()
