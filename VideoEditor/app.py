#!/usr/bin/env python3
"""Ad Assembler intake form. Strategist fills brand + concept + storyboard + a Dropbox link to
the footage folder; the system pulls the footage, runs the whole pipeline, and serves the
editable Premiere XML + SRT + a preview.

Team-serving hardening:
  - shared-password gate (env VE_PASSWORD; no password set = open, for local dev)
  - job ids validated everywhere; /jobs index so results are never lost
  - one job at a time (FIFO queue) so parallel ads don't fight over CPU
  - status.json has a state (queued/fetching/running/failed/done) -> the job page always resolves
  - old jobs swept: footage + normalized media deleted after VE_KEEP_DAYS (zip keeps everything)

  python app.py        ->   open  http://localhost:5000
"""
import glob, hashlib, json, os, re, shutil, subprocess, sys, threading, time, uuid
from concurrent.futures import ThreadPoolExecutor
from flask import Flask, redirect, request, send_from_directory, session, url_for

BASE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.join(BASE, "scripts")
JOBS = os.path.join(BASE, "jobs")
os.makedirs(JOBS, exist_ok=True)
PY = sys.executable
PASSWORD = os.environ.get("VE_PASSWORD", "")
KEEP_DAYS = float(os.environ.get("VE_KEEP_DAYS", "10"))
JID_RE = re.compile(r"^[0-9a-f]{8}$")

app = Flask(__name__)
app.secret_key = hashlib.sha256(("ad-assembler|" + PASSWORD).encode()).digest()
POOL = ThreadPoolExecutor(max_workers=1)          # one ad at a time; extra submissions queue FIFO

CSS = ("body{font-family:system-ui,Arial;max-width:840px;margin:28px auto;padding:0 18px;color:#1a1a2e}"
       "h1{font-size:23px}h2{font-size:20px}label{display:block;font-weight:600;margin:14px 0 4px}"
       "input,textarea,select{width:100%;padding:9px;border:1px solid #ccd;border-radius:8px;font-size:14px;box-sizing:border-box}"
       "textarea{font-family:ui-monospace,Consolas,monospace;height:320px;font-size:13px}"
       ".row{display:flex;gap:14px}.row>div{flex:1}small{color:#667}"
       "button{margin-top:18px;background:#6d28d9;color:#fff;border:0;padding:12px 24px;border-radius:9px;font-size:15px;font-weight:700;cursor:pointer}"
       "a.btn{display:inline-block;margin:6px 8px 0 0;background:#6d28d9;color:#fff;text-decoration:none;padding:9px 16px;border-radius:8px}"
       "video{width:300px;border-radius:12px;margin:10px 0}"
       "table{border-collapse:collapse;width:100%}td,th{padding:7px 10px;border-bottom:1px solid #e5e5ef;text-align:left;font-size:14px}"
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
    for p in (os.path.join(BASE, "docs", "storyboard-sample.md"),
              os.path.join(BASE, "..", "Docs", "Video Editor", "storyboard-template.md"),
              os.path.join(BASE, "docs", "storyboard-template.md")):
        if os.path.exists(p):
            return open(p, encoding="utf-8").read()
    return "CONCEPT:\nBRAND:\nFORMAT: talking-head listicle\nAUDIO: creator\n"


def vids(d):
    out = []
    for ext in ("mov", "mp4", "m4v"):
        out += glob.glob(os.path.join(d, "**", f"*.{ext}"), recursive=True)
        out += glob.glob(os.path.join(d, "**", f"*.{ext.upper()}"), recursive=True)
    return sorted(set(out))


def jdir_of(jid):
    if not JID_RE.match(jid or ""):
        return None
    d = os.path.join(JOBS, jid)
    return d if os.path.isdir(d) else None


def read_status(jdir):
    sp = os.path.join(jdir, "handoff", "status.json")
    if not os.path.exists(sp):
        return {"state": "queued", "ok": False}
    try:
        return json.load(open(sp, encoding="utf-8"))
    except Exception:
        return {"state": "running", "ok": False}


def write_status(jdir, **kw):
    out = os.path.join(jdir, "handoff")
    os.makedirs(out, exist_ok=True)
    cur = read_status(jdir)
    cur.update(kw)
    json.dump(cur, open(os.path.join(out, "status.json"), "w", encoding="utf-8"), indent=2)


def sweep():
    """Free disk: for jobs older than KEEP_DAYS, drop the raw footage + normalized media
    (the zip still contains everything a designer needs)."""
    cutoff = time.time() - KEEP_DAYS * 86400
    for d in glob.glob(os.path.join(JOBS, "*")):
        try:
            if os.path.getmtime(d) < cutoff:
                shutil.rmtree(os.path.join(d, "footage"), ignore_errors=True)
                shutil.rmtree(os.path.join(d, "handoff", "media"), ignore_errors=True)
        except OSError:
            pass


# ---------- auth ----------

@app.before_request
def gate():
    if not PASSWORD or request.path in ("/login", "/healthz") or session.get("auth"):
        return None
    return redirect(url_for("login", next=request.path))


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        if request.form.get("password", "") == PASSWORD:
            session["auth"] = True
            session.permanent = True
            return redirect(request.args.get("next") or "/")
        return page("<h2>Wrong password</h2><p><a href='/login'>try again</a></p>")
    return page("<h1>🎬 Ad Assembler</h1><form method=post>"
                "<label>Team password</label><input type=password name=password autofocus>"
                "<button type=submit>Enter</button></form>")


# ---------- pages ----------

@app.route("/")
def home():
    body = (
        "<h1>🎬 Ad Assembler</h1>"
        "<p><small>Fill this in and hit Assemble. We pull the footage from your Dropbox link, build the edit, and give "
        "you an editable Premiere timeline (XML) + captions (SRT) + a preview. ~20-40 minutes per ad on this server. "
        "<a href='/jobs'>All jobs →</a></small></p>"
        "<form method=post action=/run>"
        "<div class=row><div><label>Brand</label><input name=brand placeholder='Innerwell' required></div>"
        "<div><label>Concept</label><input name=concept placeholder='5 Reasons I Regret...' required></div></div>"
        "<label>Dropbox link <small>(a shared FOLDER with the footage: an <code>aroll/</code> subfolder of talking-head takes + a <code>broll/</code> subfolder of b-roll named to match the storyboard)</small></label>"
        "<input name=dropbox placeholder='https://www.dropbox.com/scl/fo/.../...?rlkey=...&dl=0' required>"
        "<label>Storyboard <small>(copy your storyboard table straight out of Notion and paste it here — the "
        "<code>Scene | Script Line | Overlay | Footage Name</code> columns are read as-is)</small></label>"
        f"<textarea name=storyboard>{esc(sample_storyboard())}</textarea>"
        "<button type=submit>Assemble →</button></form>")
    return page(body)


@app.route("/jobs")
def jobs():
    rows = []
    for d in sorted(glob.glob(os.path.join(JOBS, "*")), key=os.path.getmtime, reverse=True)[:60]:
        jid = os.path.basename(d)
        if not JID_RE.match(jid):
            continue
        try:
            meta = json.load(open(os.path.join(d, "meta.json")))
        except Exception:
            meta = {}
        st = read_status(d)
        state = st.get("state", "done" if st.get("ok") else "failed")
        icon = {"done": "✅", "failed": "❌", "queued": "🕐", "fetching": "⬇️", "running": "⏳"}.get(state, "⏳")
        when = time.strftime("%b %d %H:%M", time.localtime(os.path.getmtime(d)))
        rows.append(f"<tr><td>{when}</td><td>{esc(meta.get('brand', ''))}</td>"
                    f"<td><a href='/job/{jid}'>{esc(meta.get('concept', jid))}</a></td>"
                    f"<td>{icon} {esc(state)}</td></tr>")
    body = ("<h1>🎬 Jobs</h1><p><a href='/'>← new ad</a></p>"
            "<table><tr><th>When</th><th>Brand</th><th>Concept</th><th>Status</th></tr>"
            + "".join(rows) + "</table>")
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
    write_status(jdir, state="queued", ok=False)

    def worker():
        sweep()
        write_status(jdir, state="fetching")
        with open(logp, "w", encoding="utf-8") as log:
            r = subprocess.run([PY, os.path.join(SCRIPTS, "fetch_dropbox.py"), "--url", dropbox, "--out", footage],
                               stdout=log, stderr=subprocess.STDOUT)
            if r.returncode != 0 or not vids(footage):
                write_status(jdir, state="failed", ok=False,
                             error="Couldn't get footage from that Dropbox link (must be a shared FOLDER with videos). See log.")
                return
            write_status(jdir, state="running")
            subprocess.run([PY, os.path.join(SCRIPTS, "run_ad.py"), "--in", jdir, "--footage-dir", footage,
                            "--out", out, "--name", name], stdout=log, stderr=subprocess.STDOUT)
            st = read_status(jdir)                      # run_ad wrote done/failed itself
            if st.get("state") not in ("done", "failed"):
                write_status(jdir, state="failed", ok=False, error="Assembly crashed — see log.")
    POOL.submit(worker)
    return redirect(url_for("job", jid=jid))


@app.route("/job/<jid>")
def job(jid):
    jdir = jdir_of(jid)
    if not jdir:
        return page("<h2>Job not found</h2><p><a href='/jobs'>← all jobs</a></p>"), 404
    try:
        meta = json.load(open(os.path.join(jdir, "meta.json")))
    except Exception:
        meta = {"concept": jid}
    st = read_status(jdir)
    state = st.get("state", "done" if st.get("ok") else "running")
    tail = open(os.path.join(jdir, "run.log"), encoding="utf-8", errors="ignore").read()[-1600:] \
        if os.path.exists(os.path.join(jdir, "run.log")) else ""

    if state in ("queued", "fetching", "running"):
        note = {"queued": "Waiting for the worker (one ad renders at a time)…",
                "fetching": "Pulling the footage from Dropbox…",
                "running": "Assembling: transcription, cuts, captions, normalize, XML…"}[state]
        body = (f"<h2>⏳ “{esc(meta['concept'])}” — {esc(state)}</h2><p>{note} This page auto-refreshes.</p>"
                f"<pre>{esc(tail) or 'starting…'}</pre><p><a href='/jobs'>all jobs</a></p>")
        return page("<meta http-equiv=refresh content=6>" + body)

    if not st.get("ok"):
        body = (f"<h2>❌ “{esc(meta['concept'])}” — {esc(st.get('error', 'failed'))}</h2>"
                f"<pre>{esc(tail)}</pre><p><a href='/'>← try again</a> · <a href='/jobs'>all jobs</a></p>")
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
            f"{warnblock}<p><a href='/'>← assemble another</a> · <a href='/jobs'>all jobs</a></p>")
    return page(body)


@app.route("/file/<jid>/<path:fn>")
def filed(jid, fn):
    if not jdir_of(jid):
        return page("<h2>Not found</h2>"), 404
    return send_from_directory(os.path.join(JOBS, jid, "handoff"), fn)


@app.route("/zip/<jid>")
def zipd(jid):
    if not jdir_of(jid):
        return page("<h2>Not found</h2>"), 404
    return send_from_directory(os.path.join(JOBS, jid), "handoff.zip", as_attachment=True)


@app.route("/healthz")
def healthz():
    return {"ok": True}


if __name__ == "__main__":
    host = os.environ.get("VE_HOST", "0.0.0.0")
    port = int(os.environ.get("VE_PORT", "5000"))
    print(f"Ad Assembler form  ->  http://localhost:{port}" + ("  (password-gated)" if PASSWORD else "  (NO password set)"))
    try:
        from waitress import serve
        serve(app, host=host, port=port, threads=8)
    except ImportError:
        app.run(host=host, port=port, threaded=True, debug=False)
