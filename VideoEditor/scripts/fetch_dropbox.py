#!/usr/bin/env python3
"""Download a Dropbox shared FOLDER link as a zip and extract it (unwrapping a single wrapper
folder) into --out. The intake form / VPS uses this to pull the footage from the link the
strategist submits. Stdlib only.

Usage:
  python fetch_dropbox.py --url "<dropbox share link>" --out <folder>
"""
import argparse, os, re, shutil, tempfile, urllib.request, zipfile


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    url = re.sub(r"([?&])dl=0", r"\1dl=1", a.url.strip())
    if "dl=1" not in url:
        url += ("&" if "?" in url else "?") + "dl=1"
    os.makedirs(a.out, exist_ok=True)
    tmp = tempfile.mktemp(suffix=".zip")
    print(f"downloading: {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=1800) as r, open(tmp, "wb") as f:
        shutil.copyfileobj(r, f)
    print(f"downloaded {os.path.getsize(tmp) / 1024 / 1024:.0f} MB")

    if not zipfile.is_zipfile(tmp):
        head = open(tmp, "rb").read(300).lower()
        os.remove(tmp)
        raise SystemExit("Dropbox did not return a zip — check the link is a shared FOLDER (not a single file) "
                         "and the folder isn't too large. " + ("(got an HTML page)" if b"<html" in head else ""))
    with zipfile.ZipFile(tmp) as z:
        z.extractall(a.out)
    os.remove(tmp)

    # unwrap a single wrapper folder so aroll/ + broll/ (or the videos) sit at the top of --out
    for _ in range(3):
        entries = [e for e in os.listdir(a.out) if not e.startswith(".")]
        subs = [e for e in entries if os.path.isdir(os.path.join(a.out, e))]
        vids = [e for e in entries if e.lower().endswith((".mov", ".mp4", ".m4v"))]
        if len(entries) == 1 and len(subs) == 1 and not vids:
            inner = os.path.join(a.out, subs[0])
            for item in os.listdir(inner):
                shutil.move(os.path.join(inner, item), os.path.join(a.out, item))
            os.rmdir(inner)
        else:
            break

    nv = sum(1 for _, _, fs in os.walk(a.out) for f in fs if f.lower().endswith((".mov", ".mp4", ".m4v")))
    print(f"footage ready in {a.out}: {nv} video files")
    if nv == 0:
        raise SystemExit("no video files found in the Dropbox folder")


if __name__ == "__main__":
    main()
