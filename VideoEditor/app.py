#!/usr/bin/env python3
"""Ad Assembler intake form. Strategist fills brand + concept + storyboard + a Dropbox link to
the footage folder; the system pulls the footage, runs the whole pipeline, and serves the
editable Premiere XML + SRT + a preview.

  python app.py        ->   open  http://localhost:5000
"""
import glob, json, os, subprocess, sys, threading, uuid
from flask import Flask, redirect, request, send_from_directory, url_for

BASE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.join(BASE, "scripts")
JOBS = os.path.join(BASE, "jobs")
os.makedirs(JOBS, exist_ok=True)
PY = sys.executable
app = Flask(__name__)

CSS = ("body{font-family:system-ui,Arial;max-width:840px;margin:28px auto;padding:0 18px;color:#1a1a2e}"
       "h1{font-size:23px}h2{font-size:20px}label{display:block;font-weight:600;margin:14px 0 4px}"
       "input,textarea,select{width:100%;padding:9px;border:1px solid #ccd;border-radius:8px;font-size:14px;box-sizing:border-box}"
       "textarea{font-family:ui-monospace,Consolas,monospace;height:320px;font-size:13px}"
       ".row{display:flex;gap:14px}.row>div{flex:1}small{color:#667}"
       "button{margin-top:18px;background:#6d28d9;color:#fff;border:0;padding:12px 24px;border-radius:9px;font-size:15px;font-weight:700;cursor:pointer}"
       "a.btn{display:inline-block;margin:6px 8px 0 0;background:#6d28d9;color:#fff;text-decoration:none;padding:9px 16px;border-radius:8px}"
       "video{width:300px;border-radius:12px;margin:10px 0}"
       "pre{background:#0b1021;color:#7CFC9B;padding:12px;border-radius:8px;white-space:pre-wrap;font-size:12px;max-height:300px;overflow:auto}")


def page(body):
    return ("<!doctype html><html><head><meta charset='utf-8'>"
            "<meta name=viewport content='width=device-width,initial-scale=1'>"
            f"<title>Ad Assembler</title><style>{CSS}</style></head><body>{body}</body></html>")


def esc(s):
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def slug(s):
    return "".join(c if c.isalnum() else "_" for c in (s or "")).strip("_").lower() or "ad"


def sample_storyboard():
    for p in (os.path.join(BASE, "work", "innerwell", "storyboard.md"),
              os.path.join(BASE, "..", "Docs", "Video Editor", "storyboard-template.md")):
        if os.path.exists(p):
            return open(p, encoding="utf-8").read()
    return "CONCEPT:\nBRAND:\nFORMAT: talking-head listicle\nAUDIO: creator\n"


def vids(d):
    out = []
    for ext in ("mov", "mp4", "m4v"):
        out += glob.glob(os.path.join(d, "**", f"*.{ext}"), recursive=True)
        out += glob.glob(os.path.join(d, "**", f"*.{ext.upper()}"), recursive=True)
    return sorted(set(out))


@app.route("/")
def home():
    body = (
        "<h1>🎬 Ad Assembler</h1>"
        "<p><small>Fill this in and hit Assemble. We pull the footage from your Dropbox link, build the edit, and give "
        "you an editable Premiere timeline (XML) + captions (SRT) + a preview. Takes a few minutes per ad.</small></p>"
        "<form method=post action=/run>"
        "<div class=row><div><label>Brand</label><input name=brand placeholder='Innerwell' required></div>"
        "<div><label>Concept</label><input name=concept placeholder='5 Reasons I Regret...' required></div></div>"
        "<label>Audio</label><select name=audio>"
        "<option value=creator>creator (talking-head)</option>"
        "<option value=generated>generated (voiceover) — coming soon</option></select>"
        "<label>Dropbox link <small>(a shared FOLDER with the footage: an <code>aroll/</code> subfolder of talking-head takes + a <code>broll/</code> subfolder of b-roll named to match the storyboard)</small></label>"
        "<input name=dropbox placeholder='https://www.dropbox.com/scl/fo/.../...?rlkey=...&dl=0' required>"
        "<label>Storyboard <small>(structured format — a working sample is pre-filled; replace with your ad. See the spec doc.)</small></label>"
        f"<textarea name=storyboard>{esc(sample_storyboard())}</textarea>"
        "<button type=submit>Assemble →</button></form>")
    return page(body)


@app.route("/run", methods=["POST"])
def run():
    jid = uuid.uuid4().hex[:8]
    jdir = os.path.join(JOBS, jid)
    os.makedirs(jdir, exist_ok=True)
    name = slug(request.form["concept"])
    open(os.path.join(jdir, "storyboard.md"), "w", encoding="utf-8").write(request.form["storyboard"])
    json.dump({"brand": request.form["brand"], "concept": request.form["concept"]},
              open(os.path.join(jdir, "meta.json"), "w"))
    dropbox = request.form["dropbox"].strip()
    footage = os.path.join(jdir, "footage")
    out = os.path.join(jdir, "handoff")
    logp = os.path.join(jdir, "run.log")

    def fail(msg):
        os.makedirs(out, exist_ok=True)
        json.dump({"ok": False, "error": msg, "warnings": [], "outputs": {}},
                  open(os.path.join(out, "status.json"), "w"))

    def worker():
        with open(logp, "w", encoding="utf-8") as log:
            r = subprocess.run([PY, os.path.join(SCRIPTS, "fetch_dropbox.py"), "--url", dropbox, "--out", footage],
                               stdout=log, stderr=subprocess.STDOUT)
            if r.returncode != 0 or not vids(footage):
                fail("Couldn't get footage from that Dropbox link (must be a shared FOLDER with videos). See log.")
                return
            r = subprocess.run([PY, os.path.join(SCRIPTS, "run_ad.py"), "--in", jdir, "--footage-dir", footage,
                                "--out", out, "--name", name], stdout=log, stderr=subprocess.STDOUT)
            if not os.path.exists(os.path.join(out, "status.json")):
                fail("Assembly failed — see log.")
    threading.Thread(target=worker, daemon=True).start()
    return redirect(url_for("job", jid=jid))


@app.route("/job/<jid>")
def job(jid):
    jdir = os.path.join(JOBS, jid)
    meta = json.load(open(os.path.join(jdir, "meta.json")))
    sp = os.path.join(jdir, "handoff", "status.json")
    tail = open(os.path.join(jdir, "run.log"), encoding="utf-8", errors="ignore").read()[-1600:] \
        if os.path.exists(os.path.join(jdir, "run.log")) else ""
    if not os.path.exists(sp):
        body = (f"<h2>⏳ Assembling “{esc(meta['concept'])}”…</h2>"
                "<p>Pulling footage, then transcription + normalize. A few minutes — this page auto-refreshes.</p>"
                f"<pre>{esc(tail) or 'starting…'}</pre>")
        return page("<meta http-equiv=refresh content=6>" + body)
    st = json.load(open(sp, encoding="utf-8"))
    if not st.get("ok"):
        body = (f"<h2>❌ “{esc(meta['concept'])}” — {esc(st.get('error', 'failed'))}</h2>"
                f"<pre>{esc(tail)}</pre><p><a href='/'>← try again</a></p>")
        return page(body)
    o = st["outputs"]
    warn = "".join(f"<li>{esc(w)}</li>" for w in st.get("warnings", []))
    warnblock = f"<p><b>⚠ Footage name warnings:</b><ul>{warn}</ul></p>" if warn else "<p>✓ all footage matched exactly</p>"
    body = (f"<h2>✅ “{esc(meta['concept'])}” assembled in {st['seconds']}s — {st['scenes']} scenes</h2>"
            f"<video src='/file/{jid}/{o['preview']}' controls></video>"
            "<p><b>Download for Premiere:</b><br>"
            f"<a class=btn href='/file/{jid}/{o['xml']}'>XML (editable timeline)</a>"
            f"<a class=btn href='/file/{jid}/{o['srt']}'>SRT (captions)</a>"
            f"<a class=btn href='/zip/{jid}'>Full handoff (.zip)</a></p>"
            f"{warnblock}<p><a href='/'>← assemble another</a></p>")
    return page(body)


@app.route("/file/<jid>/<path:fn>")
def filed(jid, fn):
    return send_from_directory(os.path.join(JOBS, jid, "handoff"), fn)


@app.route("/zip/<jid>")
def zipd(jid):
    return send_from_directory(os.path.join(JOBS, jid), "handoff.zip", as_attachment=True)


if __name__ == "__main__":
    print("Ad Assembler form  ->  http://localhost:5000")
    app.run(host="0.0.0.0", port=5000, threaded=True, debug=False)
