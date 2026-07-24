#!/usr/bin/env python3
"""Match storyboard beats to b-roll clips and place them on the ASSEMBLED timeline.

Two lookups:
  WHERE  an anchor phrase lands on the output timeline (cut_plan + words.json)
  WHICH  catalog clip best fits a beat (broll-ingest broll_catalog.json:
         tag/desc/category overlap + rating)

Auto mode turns a storyboard into placements.json for build_premiere_xml.py.

Usage:
  python match_broll.py --storyboard sb.json --cut-plan cut_plan.json --words words.json \
      --catalog broll_catalog.json --out placements.json
  python match_broll.py --cut-plan cut_plan.json --words words.json --anchor "you cant leave"
  python match_broll.py --catalog broll_catalog.json --query "hands typing" [--category grind]

storyboard.json: [{"anchor":"phrase spoken","broll_query":"what to show",
                   "category":"grind","max_sec":3.0}]
"""
import argparse, json, os, re, subprocess


def J(p):
    return json.load(open(p, encoding="utf-8-sig"))


def norm(s):
    return re.sub(r"[^a-z0-9 ]", " ", str(s).lower()).split()


def build_map(cut_plan):
    """Per-kept-segment mapping from source seconds to assembled-output seconds."""
    segs, acc = [], 0.0
    head, tail, dur = cut_plan.get("head", 0.0), cut_plan.get("tail", 0.0), cut_plan.get("duration")
    for s in cut_plan["segments"]:
        c_in = max(0.0, s["on"] - head)
        c_out = min(s["off"] + tail, dur) if dur else s["off"] + tail
        segs.append({"src_in": c_in, "len": c_out - c_in, "out_start": acc})
        acc += c_out - c_in
    return segs


def out_time(segs, src_t):
    for s in segs:
        if s["src_in"] <= src_t <= s["src_in"] + s["len"]:
            return s["out_start"] + (src_t - s["src_in"])
    return None


def find_phrase(anchor, words):
    """Fuzzy-locate an anchor phrase in words.json; return (src_start, src_end)."""
    toks = norm(anchor)
    flat = [(w, norm(w["word"])[0]) for w in words if norm(w["word"])]
    seq = [t for _, t in flat]
    for i in range(len(seq)):
        win = seq[i:i + len(toks)]
        if toks and sum(1 for x in win if x in toks) / len(toks) >= 0.7:
            j = min(i + len(toks) - 1, len(flat) - 1)
            return flat[i][0]["start"], flat[j][0]["end"]
    return None


def rank_catalog(query, catalog, category=None):
    q = set(norm(query))
    scored = []
    for e in catalog:
        hay = set(norm(" ".join([e.get("desc", ""), " ".join(e.get("tags", [])), e.get("category", "")])))
        score = len(q & hay) + 0.2 * float(e.get("rating", 0) or 0) + (1.0 if category and e.get("category") == category else 0)
        scored.append((score, e))
    scored.sort(key=lambda x: -x[0])
    return [e for sc, e in scored if sc > 0] or [e for _, e in scored]


def probe_frames(path):
    try:
        r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0",
                            "-show_entries", "stream=r_frame_rate", "-show_entries", "format=duration",
                            "-of", "json", path], capture_output=True, text=True)
        info = json.loads(r.stdout or "{}")
        num, den = (info["streams"][0]["r_frame_rate"] + "/1").split("/")[:2]
        fps = int(num) / (int(den) or 1)
        dur = float(info["format"]["duration"])
        return int(round(dur * fps)), dur
    except Exception:
        return None, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--storyboard")
    ap.add_argument("--cut-plan")
    ap.add_argument("--words")
    ap.add_argument("--catalog")
    ap.add_argument("--out", default="placements.json")
    ap.add_argument("--anchor")
    ap.add_argument("--query")
    ap.add_argument("--category")
    a = ap.parse_args()

    if a.anchor:                                  # ad-hoc WHERE
        cp = J(a.cut_plan); words = J(a.words)
        segs = build_map(cp); span = find_phrase(a.anchor, words)
        if not span:
            print("phrase not found in kept takes"); return
        print(f'"{a.anchor}" -> output {out_time(segs, span[0]):.2f}-{out_time(segs, span[1]):.2f}s')
        return

    if a.query:                                   # ad-hoc WHICH
        for e in rank_catalog(a.query, J(a.catalog), a.category)[:5]:
            print(f'{e.get("rating","?")}* [{e.get("category","")}] {os.path.basename(e.get("file",""))} '
                  f'-- {e.get("desc","")}  tags={",".join(e.get("tags", []))}')
        return

    # auto: storyboard -> placements
    sb = J(a.storyboard); cp = J(a.cut_plan)
    words = J(a.words); cat = J(a.catalog)
    segs = build_map(cp); placements = []
    for b in sb:
        span = find_phrase(b["anchor"], words)
        if not span:
            print(f'!! anchor not found: "{b["anchor"]}" -- skipping'); continue
        ranked = rank_catalog(b.get("broll_query", b["anchor"]), cat, b.get("category"))
        if not ranked:
            print(f'!! no catalog match for "{b.get("broll_query")}" -- mark a manual slot'); continue
        clip = ranked[0]; full_frames, dur = probe_frames(clip["file"])
        out_s = min(b.get("max_sec", 3.0), dur or b.get("max_sec", 3.0))
        placements.append({"file": clip["file"], "in": 0.0, "out": round(out_s, 3),
                           "track_start": round(out_time(segs, span[0]), 3),
                           "full_frames": full_frames or 0, "note": b.get("broll_query", "")})
    json.dump(placements, open(a.out, "w", encoding="utf-8"), indent=2)
    print(f"wrote {a.out}: {len(placements)} placements")


if __name__ == "__main__":
    main()
