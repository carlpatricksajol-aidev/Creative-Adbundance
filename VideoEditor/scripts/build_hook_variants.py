#!/usr/bin/env python3
"""Build one ad per HOOK the storyboard offers.

Strategists write Hook 1 / Hook 2 / Hook 3 because testing openers is the job, and hook rate is
only attributable if each opener ships as its own ad. Until now only Hook 1 was ever built.

For every alternate hook this writes a storyboard containing that hook plus the identical body,
then runs the normal one-command chain against the SAME footage and the SAME transcription. Each
variant is therefore a complete, correct handoff (its own XML, SRT, captions and preview) rather
than a spliced timeline, and the body is cut from the same takes in every one.

Usage:
  python build_hook_variants.py --in <assembly folder> --footage-dir <dir> --out <pkg> \
      --name <ad> --takes <takes.json> [--max 3]
"""
import argparse, json, os, re, shutil, subprocess, sys

SCRIPTS = os.path.dirname(os.path.abspath(__file__))


def hook_rows(text):
    """Row index -> label for every Hook row in the pasted storyboard table."""
    out = []
    for i, ln in enumerate(text.splitlines()):
        s = ln.strip()
        if not s.startswith("|"):
            continue
        first = [c.strip() for c in s.strip("|").split("|")][:1]
        if first and re.match(r"^hook\s*\d*$", first[0], re.I):
            out.append((i, first[0]))
    return out


def storyboard_with_hook(text, keep_line):
    """The same storyboard, with every Hook row except `keep_line` removed."""
    hooks = [i for i, _ in hook_rows(text)]
    drop = {i for i in hooks if i != keep_line}
    return "\n".join(ln for i, ln in enumerate(text.splitlines()) if i not in drop) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--footage-dir", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--name", required=True)
    ap.add_argument("--takes", required=True)
    ap.add_argument("--max", type=int, default=3, help="cap on TOTAL hooks built, primary included")
    a = ap.parse_args()

    sb_path = os.path.join(os.path.abspath(a.inp), "storyboard.md")
    text = open(sb_path, encoding="utf-8-sig").read()
    rows = hook_rows(text)
    if len(rows) < 2:
        print("only one hook in the storyboard, no variants to build")
        return

    alts = rows[1:a.max]                                  # rows[0] is the primary, already built
    print(f"{len(rows)} hooks in the storyboard, building {len(alts)} alternate(s)")
    built = []
    for n, (line_i, label) in enumerate(alts, start=2):
        tag = f"H{n}"
        vdir = os.path.join(os.path.abspath(a.out), "hooks", tag)
        os.makedirs(vdir, exist_ok=True)
        open(os.path.join(vdir, "storyboard.md"), "w", encoding="utf-8").write(
            storyboard_with_hook(text, line_i))
        vout = os.path.join(vdir, "handoff")
        name = f"{a.name}_{tag}"
        print(f"\n=== {tag} ({label}) ===")
        r = subprocess.run([sys.executable, os.path.join(SCRIPTS, "run_ad.py"),
                            "--in", vdir, "--footage-dir", os.path.abspath(a.footage_dir),
                            "--out", vout, "--name", name, "--takes", os.path.abspath(a.takes),
                            "--no-hook-variants"], capture_output=True, text=True)
        st = {}
        sp = os.path.join(vout, "status.json")
        if os.path.exists(sp):
            try:
                st = json.load(open(sp, encoding="utf-8"))
            except Exception:
                pass
        if r.returncode != 0 or not st.get("ok"):
            print(f"{tag} FAILED: {st.get('error') or (r.stderr or r.stdout)[-300:]}")
            built.append({"tag": tag, "label": label, "ok": False,
                          "error": st.get("error") or "build failed"})
            continue
        for z in (vout + ".zip",):                        # the parent zip already carries the variants
            if os.path.exists(z):
                os.remove(z)
        # the hook line as written is what a strategist compares the variants by
        first_line = ""
        cells = [c.strip() for c in text.splitlines()[line_i].strip().strip("|").split("|")]
        if len(cells) > 1:
            first_line = cells[1][:160]
        built.append({"tag": tag, "label": label, "ok": True, "hook_line": first_line,
                      "dir": f"hooks/{tag}/handoff", "seconds": st.get("seconds"),
                      "outputs": st.get("outputs", {})})
        print(f"{tag} done in {st.get('seconds')}s")

    json.dump(built, open(os.path.join(os.path.abspath(a.out), "hook_variants.json"), "w",
                          encoding="utf-8"), indent=2)
    ok = sum(1 for b in built if b.get("ok"))
    print(f"\nwrote hook_variants.json: {ok}/{len(built)} alternate hook(s) built")


if __name__ == "__main__":
    main()
