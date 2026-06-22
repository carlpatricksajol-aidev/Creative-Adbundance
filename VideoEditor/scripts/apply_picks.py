#!/usr/bin/env python3
"""Apply vision-selected best windows to an assembly. Each clip's in-point is set to
the top-ranked window for its source file; a file reused N times gets its top N
windows in order. After this, beatify is unnecessary - each placement is already a
vetted ~window-length cut.

Usage:
  python apply_picks.py --assembly assembly_30.json --picks best_windows_v.json \
      --out assembly_30_picked.json
"""
import argparse, json, os


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--assembly", required=True)
    ap.add_argument("--picks", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    spec = json.load(open(a.assembly, encoding="utf-8-sig"))
    picks = json.load(open(a.picks, encoding="utf-8-sig"))
    by_base = {os.path.basename(k.replace("\\", "/")): v["windows"] for k, v in picks.items()}

    used = {}
    for c in spec["clips"]:
        base = os.path.basename(c["file"].replace("\\", "/"))
        wins = by_base.get(base)
        if not wins:
            print(f"!! no picks for {base}; leaving in={c.get('in', 0)}")
            continue
        i = min(used.get(base, 0), len(wins) - 1)
        c["in"] = wins[i]["in"]
        used[base] = used.get(base, 0) + 1
        print(f"{base[:44]:46} -> in={c['in']}  (vision={wins[i].get('vision','?')})")

    json.dump(spec, open(a.out, "w", encoding="utf-8"), indent=2)
    print(f"\napplied picks -> {a.out}")


if __name__ == "__main__":
    main()
