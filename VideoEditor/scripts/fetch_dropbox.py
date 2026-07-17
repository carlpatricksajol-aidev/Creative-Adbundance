#!/usr/bin/env python3
"""Download a Dropbox shared FOLDER link as a zip and extract it (unwrapping a single wrapper
folder) into --out. The intake form / VPS uses this to pull the footage from the link the
strategist submits. Stdlib only.

Hardened for the public intake form: only https Dropbox hosts are fetched (each redirect hop
re-checked), the download is size-capped, and zip members are validated against path traversal.

Usage:
  python fetch_dropbox.py --url "<dropbox share link>" --out <folder>
"""
import argparse, os, re, shutil, tempfile, urllib.parse, urllib.request, zipfile

ALLOWED_HOSTS = ("dropbox.com", "dropboxusercontent.com")
MAX_BYTES = int(os.environ.get("VE_MAX_FETCH_GB", "30")) * 1024 ** 3


def check_url(url):
    p = urllib.parse.urlparse(url)
    host = (p.hostname or "").lower()
    if p.scheme != "https" or not any(host == h or host.endswith("." + h) for h in ALLOWED_HOSTS):
        raise SystemExit(f"refusing to fetch non-Dropbox URL: {url[:120]}")
    return url


class DropboxOnlyRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        check_url(newurl)                                   # every hop must stay on Dropbox
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    url = re.sub(r"([?&])dl=0", r"\1dl=1", a.url.strip())
    if "dl=1" not in url:
        url += ("&" if "?" in url else "?") + "dl=1"
    check_url(url)
    os.makedirs(a.out, exist_ok=True)
    fd, tmp = tempfile.mkstemp(suffix=".zip")
    print(f"downloading: {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    opener = urllib.request.build_opener(DropboxOnlyRedirects())
    total = 0
    with opener.open(req, timeout=1800) as r, os.fdopen(fd, "wb") as f:
        while True:
            chunk = r.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_BYTES:
                os.remove(tmp)
                raise SystemExit(f"download exceeded the {MAX_BYTES // 1024**3} GB cap — split the folder")
            f.write(chunk)
    print(f"downloaded {total / 1024 / 1024:.0f} MB")

    if not zipfile.is_zipfile(tmp):
        head = open(tmp, "rb").read(300).lower()
        os.remove(tmp)
        raise SystemExit("Dropbox did not return a zip — check the link is a shared FOLDER (not a single file) "
                         "and the folder isn't too large. " + ("(got an HTML page)" if b"<html" in head else ""))
    root = os.path.realpath(a.out)
    with zipfile.ZipFile(tmp) as z:
        for m in z.namelist():                              # zip-slip guard: every member must land inside --out
            rel = m.replace("\\", "/").lstrip("/")          # zipfile strips leading slashes on extract; Dropbox emits a "/" root entry
            if not rel:
                continue                                    # bare root entry -> harmless
            dest = os.path.realpath(os.path.join(root, rel))
            if dest != root and not dest.startswith(root + os.sep):   # only a real ../ escape is rejected
                os.remove(tmp)
                raise SystemExit(f"zip member escapes the target folder: {m[:120]}")
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
