#!/usr/bin/env python3
"""Package an ad for handoff: copy every used clip + the VO into ONE media/ folder and
re-path the assembly + vo-track to point there. Running build_assembly_xml on the
re-pathed files then yields an XML whose media all lives in one place -> a single relink
(or zero clicks on the same machine), portable to any machine / Dropbox.

Reused clips are copied once. Full clips are kept (so the editor can re-trim in Premiere).

Usage:
  python package_handoff.py --assembly assembly_picked_vo.json --vo-track vo_track.json \
      --out-dir output/<ad>_handoff
  python build_assembly_xml.py --assembly <out-dir>/assembly.json --vo-track <out-dir>/vo_track.json \
      --out <out-dir>/<ad>
"""
import argparse, json, os, shutil


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--assembly", required=True)
    ap.add_argument("--vo-track", required=True)
    ap.add_argument("--out-dir", required=True)
    a = ap.parse_args()

    media = os.path.join(a.out_dir, "media")
    os.makedirs(media, exist_ok=True)
    spec = json.load(open(a.assembly, encoding="utf-8-sig"))
    track = json.load(open(a.vo_track, encoding="utf-8-sig"))

    def stage(src):
        src = os.path.abspath(src.replace("\\", "/"))
        dst = os.path.join(media, os.path.basename(src))
        if not os.path.exists(dst):
            shutil.copy2(src, dst)
        return dst.replace("\\", "/")

    for c in spec["clips"]:
        c["file"] = stage(c["file"])
    for e in track:
        e["file"] = stage(e["file"])

    json.dump(spec, open(os.path.join(a.out_dir, "assembly.json"), "w", encoding="utf-8"), indent=2)
    json.dump(track, open(os.path.join(a.out_dir, "vo_track.json"), "w", encoding="utf-8"), indent=2)
    print(f"staged {len(os.listdir(media))} media files into {media}")
    print(f"wrote re-pathed assembly.json + vo_track.json in {a.out_dir}")


if __name__ == "__main__":
    main()
