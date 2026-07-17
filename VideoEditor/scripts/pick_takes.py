#!/usr/bin/env python3
"""Pick the best take for each storyboard scene. For each scene's LINE, search ALL transcribed
takes for the contiguous span that best matches it (best take + best delivery, robust to
flubs/false-starts/repeats), and resolve the scene's b-roll to a real file. Auto-builds the
per-scene picks straight from the storyboard -- no hand-made take map.

Usage:
  python pick_takes.py --takes takes.json --storyboard storyboard.json --footage-dir <footage> --out picked_takes.json
  (legacy explicit map) python pick_takes.py --takes takes.json --map take_map.json --out picked_takes.json
"""
import argparse, glob, json, os, re
from difflib import SequenceMatcher


def norm(s):
    return re.sub(r"[^a-z0-9 ]", " ", (s or "").lower()).split()


def nname(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def pick(words, line, lead=0.12, tail=0.20, maxgap=0.6):
    """Best contiguous span matching `line` within ONE continuous delivery; prefer a later
    take among near-ties; recover a dropped leading word."""
    if not words or not line:
        return None
    exp = norm(line)
    n = len(exp)
    cands = []
    for i in range(len(words)):
        for L in range(max(1, n - 1), n + 4):
            j = i + L
            if j > len(words):
                break
            span = words[i:j]
            if any(span[k + 1]["start"] - span[k]["end"] > maxgap for k in range(len(span) - 1)):
                continue
            cand = norm(" ".join(w["word"] for w in span))
            cands.append((SequenceMatcher(None, exp, cand).ratio(), i, j))
    if not cands:
        return None
    rmax = max(r for r, _, _ in cands)
    near = sorted((c for c in cands if c[0] >= rmax - 0.03), key=lambda c: c[1])
    r, i, j = near[-1]

    def has(k, tok):                                     # does transcription word k contain the line token `tok`
        return 0 <= k < len(words) and tok in norm(words[k]["word"])
    fw, lw = exp[0], exp[-1]
    ci = [k for k in range(max(0, i - 2), min(j, i + 5)) if has(k, fw)]   # anchor IN to the line's FIRST word
    if ci:                                               # (trims a neighbouring take's junk before the line; recovers a dropped word)
        i = min(ci, key=lambda k: abs(k - i))
    cj = [k for k in range(max(i + 1, j - 5), min(len(words), j + 2)) if has(k, lw)]   # anchor OUT to the LAST word
    if cj:
        j = max(cj) + 1

    # THE DELIVERY DECIDES THE CUT. The line is the strategist's INTENT; creators rephrase and
    # ad-lib, so snapping to the line's words cuts mid-sentence. Re-snap the span to the
    # creator's OWN sentence boundaries: back the IN off to her sentence start, and run the
    # OUT to her Nth sentence end (N = sentences in the line). Fixes "cut off before done".
    def sent_end(w):
        return bool(re.search(r"[.!?][\"')\]]?$", (w["word"] or "").strip()))
    back = 0
    while i > 0 and back < 14 and not sent_end(words[i - 1]) \
            and (words[i]["start"] - words[i - 1]["end"]) <= maxgap:
        i -= 1; back += 1
    S = max(1, len(re.findall(r"[.!?]+(?=\s|$)", line.strip())))   # punct followed by space/end: "4.8" is NOT a sentence break
    seen, endj = 0, None
    for k in range(i, min(len(words), i + n + 15)):
        if k > i and words[k]["start"] - words[k - 1]["end"] > 1.0:   # real delivery break -> stop looking
            break
        if sent_end(words[k]):
            seen += 1
            if seen >= S and (k - i) >= min(3, n - 1):
                endj = k + 1
                break
    if endj:
        j = endj                                          # extend past the line's last word OR trim an overshoot

    span = words[i:j]
    s = max(0.0, span[0]["start"] - lead)
    e = span[-1]["end"] + tail
    return {"in": round(s, 2), "out": round(e, 2), "dur": round(e - s, 2),
            "match": round(r, 2), "text": " ".join(w["word"] for w in span)}


def best_take(takes, line):
    best = None
    for tk in takes:
        p = pick(tk["words"], line)
        if p and (best is None or p["match"] > best[1]["match"]):
            best = (tk["file"], p)
    return best


def resolve(name, files):
    n = nname(os.path.splitext(os.path.basename(name))[0])
    if not n:
        return None
    for f in files:
        if nname(os.path.splitext(os.path.basename(f))[0]) == n:
            return f
    for f in files:
        bn = nname(os.path.basename(f))
        if n in bn or bn in n:
            return f
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--takes", required=True)
    ap.add_argument("--storyboard")
    ap.add_argument("--map")
    ap.add_argument("--footage-dir")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    takes = json.load(open(a.takes, encoding="utf-8-sig"))
    files = []
    if a.footage_dir:
        exts = (".mov", ".mp4", ".m4v")                  # case-INSENSITIVE walk: Linux globs miss .MOV/.MP4 off a phone
        for root, _, fs in os.walk(a.footage_dir):
            files += [os.path.join(root, f) for f in fs if f.lower().endswith(exts)]
        files = sorted(set(files))

    out = []
    if a.storyboard:
        sb = json.load(open(a.storyboard, encoding="utf-8-sig"))
        for sc in sb["scenes"]:
            line = sc.get("line")
            if not line:
                continue
            bt = best_take(takes, line)
            if not bt:
                print(f"!! {sc['id']}: no matching take found"); continue
            fpath, p = bt
            broll = resolve(sc["broll"][0], files) if (sc.get("type") == "broll" and sc.get("broll") and files) else None
            out.append({"scene": sc["id"], "file": fpath, "type": sc.get("type", "talkinghead"),
                        "broll": broll, "line": line, **p})
            tag = "broll:" + os.path.basename(broll) if broll else "TH"
            flag = "  <<LOW MATCH - check>>" if p["match"] < 0.6 else ""
            print(f"{str(sc['id']):8} m={p['match']:.2f} {p['in']:6.2f}-{p['out']:6.2f} <- {os.path.basename(fpath)[:24]:24} {tag}{flag}")
    else:
        by_base = {os.path.basename(t["file"]): t for t in takes}
        for m in json.load(open(a.map, encoding="utf-8-sig")):
            t = by_base.get(m["file"])
            p = pick(t["words"], m.get("line")) if t else None
            if not p:
                print(f"!! {m['scene']} {m['file']}: no words"); continue
            out.append({"scene": m["scene"], "file": t["file"], "type": m["type"],
                        "broll": m.get("broll"), "line": m.get("line"), **p})

    json.dump(out, open(a.out, "w", encoding="utf-8"), indent=2)
    print(f"\nwrote {a.out}: {len(out)} scenes, ~{sum(r['dur'] for r in out):.1f}s VO")


if __name__ == "__main__":
    main()
