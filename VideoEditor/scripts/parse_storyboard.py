#!/usr/bin/env python3
"""Parse a storyboard.md (the strategist format, see Docs/Video Editor/Storyboard & Footage Spec.md)
into the structured storyboard.json the pipeline consumes, and VALIDATE that every b-roll scene's
FOOTAGE field resolves to a real file in the footage folder. Catches the #1 intake mistake
(filename doesn't match the storyboard) before any processing.

Usage:
  python parse_storyboard.py --in storyboard.md --out storyboard.json [--footage-dir <folder>]
"""
import argparse, json, os, re, glob


def norm(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def parse_table(text):
    """The team's REAL storyboard: a Notion database table. Copying it out of Notion pastes a
    pipe table — | Scene | Script Line | Overlay | Footage Name | Shot List Explanation | —
    so the strategist can paste straight from Notion with zero reformatting.

    Mapping: Scene -> id; Script Line -> line; Footage Name -> talkinghead if it mentions
    'talking head' else the b-roll name(s) ('+'-separated allowed); Overlay + Shot List -> note.
    Multiple Hook rows are ALTERNATIVES: Hook 1 opens the ad, the rest are stored as variants.
    """
    rows = [ln.strip() for ln in text.splitlines() if ln.strip().startswith("|")]
    if len(rows) < 2:
        return None

    def cells(ln):
        return [c.strip() for c in ln.strip().strip("|").split("|")]

    hdr = [h.lower() for h in cells(rows[0])]
    if not any("scene" in h for h in hdr):
        return None

    def col(*keys):
        for i, h in enumerate(hdr):
            if any(k in h for k in keys):
                return i
        return None

    c_scene, c_line = col("scene"), col("script", "line")
    c_overlay, c_footage, c_note = col("overlay"), col("footage"), col("shot", "explanation", "note")
    if c_scene is None or c_line is None:
        return None

    scenes, extra_hooks, seen_hook = [], [], False
    for ln in rows[1:]:
        cs = cells(ln)
        if set("".join(cs)) <= set("-: "):                    # the | --- | --- | separator row
            continue

        def get(i):
            return cs[i].strip() if i is not None and i < len(cs) else ""

        sid = get(c_scene)
        if not sid:
            continue
        line, overlay, footage, note = get(c_line), get(c_overlay), get(c_footage), get(c_note)
        is_hook = sid.lower().replace(" ", "").startswith("hook")
        if is_hook and seen_hook:                             # Hook 2/3... = alternative hooks (variants)
            extra_hooks.append(f"{sid}: {line}")
            continue
        seen_hook = seen_hook or is_hook

        th = "talkinghead" in re.sub(r"[^a-z]", "", footage.lower())
        notes = []
        if overlay and overlay.lower().strip() not in ("native captions", "-", ""):
            notes.append(f"OVERLAY: {overlay}")
        if th and "+" in footage:                             # 'Talking Head + Graphic_x' -> the graphic is a designer asset
            notes.append("ASSET: " + footage.split("+", 1)[1].strip())
        if note:
            notes.append(note)
        scenes.append({"id": sid, "type": "talkinghead" if th else "broll",
                       "footage": "-" if th else footage.replace("+", ","),
                       "line": line, "note": " | ".join(notes)})
    return ({}, extra_hooks, scenes) if scenes else None


def parse(path):
    text = open(path, encoding="utf-8-sig").read()
    table = parse_table(text)                                 # Notion-table paste? use it directly
    if table:
        return table
    head, hooks, scenes, cur, in_hooks = {}, [], [], None, False
    for raw in text.splitlines():
        s = raw.strip()
        if not s or s.startswith("#"):
            continue
        if s.startswith("SCENE:"):
            in_hooks = False
            d = {}
            for part in s.split("|"):
                if ":" in part:
                    k, v = part.split(":", 1)
                    d[k.strip().lower()] = v.strip()
            cur = {"id": d.get("scene"), "type": d.get("type", "broll"),
                   "footage": d.get("footage", "-"), "line": "", "note": ""}
            scenes.append(cur)
        elif s.lower().startswith("line:") and cur is not None:
            cur["line"] = s.split(":", 1)[1].strip()
        elif s.lower().startswith("note:") and cur is not None:
            cur["note"] = s.split(":", 1)[1].strip()
        elif in_hooks and s.startswith("-"):
            hooks.append(s[1:].strip())
        elif cur is None and ":" in s:
            k, v = s.split(":", 1)
            k, v = k.strip().lower(), v.strip()
            if k == "hooks":
                in_hooks = True
            else:
                head[k] = v
    return head, hooks, scenes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--footage-dir", default=None)
    a = ap.parse_args()

    head, hooks, scenes = parse(a.inp)
    for h in hooks:
        print(f"  ~ alternate hook stored (variants not built yet): {h[:90]}")

    files = []
    if a.footage_dir:
        for ext in ("mov", "mp4", "m4v", "MOV", "MP4", "M4V"):
            files += glob.glob(os.path.join(a.footage_dir, "**", f"*.{ext}"), recursive=True)
        files = sorted(set(files))                       # dedup (case-insensitive FS double-counts MOV/mov)

    def resolve(name):
        n = norm(name)
        if not n or name.strip() == "-":
            return None
        exact = [f for f in files if norm(os.path.splitext(os.path.basename(f))[0]) == n]
        if exact:
            return os.path.basename(exact[0]), "exact"
        sub = [f for f in files if n in norm(os.path.basename(f)) or norm(os.path.basename(f)) in n]
        if sub:
            return os.path.basename(sub[0]), "fuzzy"
        return None, "MISSING"

    out_scenes, problems = [], []
    for sc in scenes:
        broll = []
        if sc["type"] == "broll" and sc["footage"] not in ("-", ""):
            for fn in [x.strip() for x in sc["footage"].split(",") if x.strip()]:
                resolved = resolve(fn) if files else (fn, "unchecked")
                if resolved and resolved[1] == "MISSING":
                    problems.append(f"  scene {sc['id']}: FOOTAGE '{fn}' -> NO MATCHING FILE")
                elif resolved and resolved[1] == "fuzzy":
                    problems.append(f"  scene {sc['id']}: FOOTAGE '{fn}' ~ '{resolved[0]}' (not exact - rename to match)")
                broll.append(resolved[0] if resolved and resolved[0] else fn)
        out_scenes.append({"id": sc["id"], "type": sc["type"], "line": sc["line"],
                           "broll": broll or None, "note": sc["note"] or None})

    dur = re.findall(r"\d+", head.get("duration", ""))
    spec = {
        "concept": head.get("concept"), "brand": head.get("brand"),
        "format": head.get("format"), "duration_target_s": [int(x) for x in dur][:2],
        "audio": head.get("audio", "creator"), "end_card": head.get("end card"),
        "hooks": hooks, "scenes": out_scenes,
    }
    json.dump(spec, open(a.out, "w", encoding="utf-8"), indent=2)
    print(f"parsed {len(out_scenes)} scenes ({sum(1 for s in out_scenes if s['type']=='broll')} b-roll) -> {a.out}")
    if files:
        print(f"checked footage against {len(files)} files in {a.footage_dir}")
    if problems:
        print("FOOTAGE ISSUES:")
        print("\n".join(problems))
    else:
        print("footage: all b-roll references resolved" if files else "footage: not checked (no --footage-dir)")


if __name__ == "__main__":
    main()
