#!/usr/bin/env python3
"""ONE-COMMAND RUNNER. Assembly folder (storyboard.md + footage/) -> editable Premiere handoff
(XML + SRT + karaoke .ass + burned preview + media/, zipped) + status.json. Chains the whole
pipeline so n8n / the VPS can call a single command.

status.json is written at START (state=running), on FAILURE (state=failed + step + error tail),
and on SUCCESS (state=done, ok=true) — so the intake UI can always tell what happened.

  AUDIO: creator   (talking-head, e.g. Innerwell) -> WIRED
  AUDIO: generated (voiceover, e.g. Onsen)         -> not wired here yet

Usage:
  python run_ad.py --in <assembly folder> --out <handoff folder> [--footage-dir <dir>] [--takes <takes.json>]
"""
import argparse, glob, json, os, shutil, subprocess, sys, time

SCRIPTS = os.path.dirname(os.path.abspath(__file__))
PY = sys.executable
_venv = os.path.join(os.path.dirname(SCRIPTS), ".venv",
                     "Scripts" if os.name == "nt" else "bin",
                     "python.exe" if os.name == "nt" else "python")
VPY = _venv if os.path.exists(_venv) else PY                 # faster-whisper env (transcribe / word-timings)


def s(name):
    return os.path.join(SCRIPTS, name)


def run(cmd):
    step = os.path.basename(cmd[1])
    print(f"  >> {step}")
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stdout[-2000:]); print(r.stderr[-2000:])
        raise RuntimeError(f"FAILED at {step}: {(r.stderr or r.stdout)[-600:].strip()}")
    return r.stdout


def vids(d):
    out = []
    for ext in ("mov", "mp4", "m4v"):
        out += glob.glob(os.path.join(d, "**", f"*.{ext}"), recursive=True)
    return sorted(set(out))


def write_notes(pkg, name, sb, status):
    """A plain-language note in the handoff. The important half is what we could NOT do: a shot the
    storyboard asked for that nobody filmed is covered by other footage, and the editor has to be
    told that in words, not left to spot it."""
    L = [f"# {name}: handoff notes", ""]
    miss = sb.get("missing_footage") or []
    if miss:
        L += ["## Shots the storyboard asked for that are not in the footage", ""]
        for m in miss:
            for sh in m["shots"]:
                L.append(f"- **{m['scene']}**: `{sh['wanted']}` is missing ({sh['why']}).")
            L.append(f"  This scene is covered by {m['covered_by']} instead. Nothing was generated to fill it.")
            if m.get("note"):
                L.append(f"  Storyboard intent: {m['note'][:220]}")
        L += ["", "Either shoot these, or accept the cover shot.", ""]
    else:
        L += ["Every shot the storyboard named was found in the footage.", ""]
    warn = [w for w in status.get("warnings", []) if "alternate hook" not in w]
    if warn:
        L += ["## Other notes", ""] + [f"- {w.strip()}" for w in warn] + [""]
    L += ["## What is deliberately left to the editor", "",
          "- Colour grade", "- Final caption styling", "- Pacing nudges", "- Graphics and the end card", ""]
    open(os.path.join(pkg, "HANDOFF-NOTES.md"), "w", encoding="utf-8").write("\n".join(L))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--footage-dir", default=None)
    ap.add_argument("--takes", default=None, help="reuse an existing takes.json (skip transcription)")
    ap.add_argument("--name", default=None)
    ap.add_argument("--no-hook-variants", action="store_true",
                    help="build only the first hook (set automatically while building a variant)")
    a = ap.parse_args()

    t0 = time.time()
    folder = os.path.abspath(a.inp)
    pkg = os.path.abspath(a.out)
    work = os.path.join(pkg, "_work")
    os.makedirs(work, exist_ok=True)
    footage = os.path.abspath(a.footage_dir) if a.footage_dir else (
        os.path.join(folder, "footage") if os.path.isdir(os.path.join(folder, "footage")) else folder)
    name = a.name or os.path.basename(folder.rstrip("/\\")).split(" ")[0].split("_")[0] or "ad"
    status = {"ad": name, "ok": False, "state": "running", "warnings": []}
    spath = os.path.join(pkg, "status.json")

    def save():
        json.dump(status, open(spath, "w", encoding="utf-8"), indent=2)

    save()                                                   # visible from the very start
    print(f"== run_ad: {name} ==\n  folder : {folder}\n  footage: {footage}\n  out    : {pkg}\n")

    try:
        # 1) storyboard -> structured json + footage validation
        sb_json = os.path.join(work, "storyboard.json")
        out = run([PY, s("parse_storyboard.py"), "--in", os.path.join(folder, "storyboard.md"),
                   "--out", sb_json, "--footage-dir", footage])
        status["warnings"] += [ln.strip() for ln in out.splitlines() if "~" in ln or "NO MATCHING FILE" in ln]
        sb = json.load(open(sb_json, encoding="utf-8-sig"))
        audio = (sb.get("audio") or "creator").lower()
        print(f"  audio mode: {audio}\n")

        if audio != "creator":
            raise RuntimeError("AUDIO=generated path is not wired into run_ad yet")

        status["missing_footage"] = sb.get("missing_footage") or []      # shots nobody filmed, never hidden

        # 2) transcribe the talking-head takes (aroll/ if present, else footage minus the b-roll files).
        #    Cached beside the storyboard: hook variants and any re-run of this job reuse it, which
        #    is the difference between a 3 minute variant and a 6 minute one.
        cached = os.path.join(folder, "takes.json")
        takes_json = a.takes or (cached if os.path.exists(cached) else os.path.join(work, "takes.json"))
        if not os.path.exists(takes_json):
            aroll_dir = os.path.join(footage, "aroll")
            tdir = aroll_dir if os.path.isdir(aroll_dir) else footage
            run([VPY, s("transcribe_takes.py"), "--dir", tdir, "--patterns", "*.MOV,*.mp4,*.mov,*.m4v", "--out", takes_json])
            if takes_json != cached:
                try:
                    shutil.copy(takes_json, cached)
                    takes_json = cached          # _work is deleted before the hook variants build
                except OSError:
                    pass

        # 3) auto-pick the best take per scene  4) assemble (extract VO + set video)
        picked = os.path.join(work, "picked_takes.json")
        run([PY, s("pick_takes.py"), "--takes", takes_json, "--storyboard", sb_json, "--footage-dir", footage, "--out", picked])
        refined = os.path.join(work, "picked_refined.json")
        run([VPY, s("refine_cuts.py"), "--picked", picked, "--out", refined])     # waveform-snap to frame-perfect cuts

        # b-roll BEST-WINDOW pick: skip the setup junk (adjusting camera / staring at lens) and
        # start each b-roll where the storyboarded ACTION is underway. Vision key optional; a
        # pre-seeded broll_windows.json in the assembly folder wins (manual override).
        bwin = os.path.join(work, "broll_windows.json")
        seeded = os.path.join(folder, "broll_windows.json")
        if os.path.exists(seeded):
            shutil.copy(seeded, bwin)
        else:
            out = run([PY, s("pick_broll_window.py"), "--picked", refined, "--storyboard", sb_json,
                       "--input-dir", footage, "--out", bwin])
            if "0 b-roll window(s)" in out and "heuristic" in out:
                status["warnings"].append("b-roll in-points: could not analyse the clips, used the default offset")
        run([PY, s("build_talkinghead.py"), "--picked", refined, "--input-dir", footage, "--out-dir", work,
             "--broll-windows", bwin])
        assembly, vo_track, lines = (os.path.join(work, f) for f in ("assembly.json", "vo_track.json", "lines.json"))

        # 5) captions (karaoke, safe zone)
        words_g, words_s = os.path.join(work, "words_global.json"), os.path.join(work, "words_script.json")
        ass = os.path.join(pkg, name + "_captions.ass")
        run([VPY, s("vo_word_timings.py"), "--vo-track", vo_track, "--out", words_g])
        run([PY, s("tighten_segments.py"), "--assembly", assembly, "--vo-track", vo_track, "--words", words_g,
             "--picked", refined, "--out-dir", work])                  # trim each scene to its spoken words (no stops/gaps)
        run([PY, s("align_captions.py"), "--lines", lines, "--words", words_g, "--out", words_s, "--vo-track", vo_track])
        run([PY, s("build_captions_ass.py"), "--words", words_s, "--out", ass, "--vpos", "0.40", "--max-words", "2"])

        # 6) normalize full clips + stitch VO   7) build editable XML + burn preview
        run([PY, s("normalize_full.py"), "--assembly", assembly, "--vo-track", vo_track, "--out-dir", pkg])
        run([PY, s("build_assembly_xml.py"), "--assembly", os.path.join(pkg, "assembly.json"),
             "--vo-track", os.path.join(pkg, "vo_track.json"), "--out", os.path.join(pkg, name),
             "--name", name, "--preview", os.path.join(pkg, name + "_PREVIEW.mp4"), "--captions-ass", ass])

        # 8) handoff notes (what a human needs told, in words), cleanup, zip, status
        write_notes(pkg, name, sb, status)
        for junk in glob.glob(os.path.join(pkg, "*_nocap.mp4")) + glob.glob(os.path.join(pkg, "*_filter.txt")):
            os.remove(junk)
        shutil.rmtree(work, ignore_errors=True)

        status["ok"] = True
        status["state"] = "done"
        status["seconds"] = round(time.time() - t0, 1)
        status["scenes"] = len(sb["scenes"])
        status["outputs"] = {"xml": name + ".xml", "srt": name + ".srt",
                             "preview": name + "_PREVIEW.mp4", "zip": os.path.basename(pkg) + ".zip"}
        save()

        # 9) one ad per hook the storyboard offers (each a full, correct handoff of its own)
        if not a.no_hook_variants and len(sb.get("hooks") or []) >= 1:
            status["state"] = "variants"
            save()
            vr = subprocess.run([PY, s("build_hook_variants.py"), "--in", folder, "--footage-dir", footage,
                                 "--out", pkg, "--name", name, "--takes", takes_json],
                                capture_output=True, text=True)
            print(vr.stdout[-1500:])
            hv = os.path.join(pkg, "hook_variants.json")
            if os.path.exists(hv):
                try:
                    status["hook_variants"] = json.load(open(hv, encoding="utf-8"))
                except Exception:
                    pass
            status["state"] = "done"
            save()

        if os.path.exists(pkg + ".zip"):        # zip last so the variants ride along
            os.remove(pkg + ".zip")
        shutil.make_archive(pkg, "zip", pkg)
        save()
    except Exception as e:
        status["state"] = "failed"
        status["error"] = str(e)
        status["seconds"] = round(time.time() - t0, 1)
        save()
        raise SystemExit(str(e))

    print(f"\nDONE in {status['seconds']}s -> {pkg}  (+ {os.path.basename(pkg)}.zip)")
    if status["warnings"]:
        print("WARNINGS:")
        print("\n".join("  " + w for w in status["warnings"]))


if __name__ == "__main__":
    main()
