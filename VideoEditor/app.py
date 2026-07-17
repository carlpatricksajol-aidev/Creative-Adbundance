#!/usr/bin/env python3
"""Ad Assembler intake form (Creative Ad-Bundance Video Editor). Strategist fills brand +
concept + storyboard + a Dropbox link to the footage folder; the system pulls the footage,
runs the whole pipeline, and serves the editable Premiere XML + SRT + a preview.

Team-serving hardening:
  - shared-password gate (env VE_PASSWORD; no password set = open, for local dev)
  - job ids validated everywhere; /jobs index so results are never lost
  - one job at a time (FIFO queue) so parallel ads don't fight over CPU
  - status.json state (queued/fetching/running/failed/done) -> the job page always resolves
  - old jobs swept: footage + normalized media deleted after VE_KEEP_DAYS (zip keeps everything)
  - done-ping POSTed to VE_NOTIFY_WEBHOOK (n8n) so the team is notified

UI: on-brand with the Creative Ad-Bundance product system (dark, Poppins, purple #6B47FF,
inline SVG icons -- no emoji).

  python app.py        ->   open  http://localhost:5000
"""
import glob, hashlib, json, os, re, shutil, subprocess, sys, threading, time, urllib.request, uuid
from concurrent.futures import ThreadPoolExecutor
from flask import Flask, redirect, request, send_from_directory, session, url_for

BASE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.join(BASE, "scripts")
JOBS = os.path.join(BASE, "jobs")
os.makedirs(JOBS, exist_ok=True)
PY = sys.executable
PASSWORD = os.environ.get("VE_PASSWORD", "")
KEEP_DAYS = float(os.environ.get("VE_KEEP_DAYS", "10"))
NOTIFY = os.environ.get("VE_NOTIFY_WEBHOOK", "")             # n8n webhook: pinged when a job finishes
PUBLIC_URL = os.environ.get("VE_PUBLIC_URL", "").rstrip("/")
JID_RE = re.compile(r"^[0-9a-f]{8}$")

app = Flask(__name__)
app.secret_key = hashlib.sha256(("ad-assembler|" + PASSWORD).encode()).digest()
POOL = ThreadPoolExecutor(max_workers=1)          # one ad at a time; extra submissions queue FIFO

# ---------- inline SVG icon set (Lucide/Feather style, currentColor) ----------

ICONS = {
    "clapper": '<path d="M20.2 6 3 11l-.9-2.4c-.3-.9.2-1.9 1.1-2.2l13.4-4c.9-.3 1.9.2 2.2 1.1z"/><path d="m6.2 5.3 3.1 3.9M12.4 3.4l3.1 4M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    "link": '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    "doc": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>',
    "arrow": '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
    "play": '<circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/>',
    "code": '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
    "captions": '<rect x="3" y="5" width="18" height="14" rx="2"/><line x1="7" y1="12" x2="11" y2="12"/><line x1="7" y1="15" x2="9" y2="15"/><line x1="14" y1="12" x2="17" y2="12"/><line x1="12" y1="15" x2="17" y2="15"/>',
    "archive": '<rect x="2" y="4" width="20" height="5" rx="1"/><path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9"/><line x1="10" y1="13" x2="14" y2="13"/>',
    "ok": '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    "bad": '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
    "clock": '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    "download": '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    "loader": '<line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.9" y1="4.9" x2="7.8" y2="7.8"/><line x1="16.2" y1="16.2" x2="19.1" y2="19.1"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.9" y1="19.1" x2="7.8" y2="16.2"/><line x1="16.2" y1="7.8" x2="19.1" y2="4.9"/>',
    "plus": '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    "warn": '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    "check": '<polyline points="20 6 9 17 4 12"/>',
    "lock": '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    "list": '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
    "back": '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
}


def ic(name, extra=""):
    return (f'<svg class="ic {extra}" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            f'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">{ICONS[name]}</svg>')


FAVICON = ("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>"
           "<rect width='32' height='32' rx='8' fill='%236B47FF'/><text x='16' y='22' "
           "font-family='Arial' font-size='15' font-weight='800' fill='white' text-anchor='middle'>CA</text></svg>")

# The shared Creative Ad-Bundance studio rail. First three deep-link into the static-ads studio
# (form.creativeadbundance.com, hash-routed); Video Editor (this app) is the active tool. Icons
# copied verbatim from that studio's sidebar so the rail is identical across tools.
STUDIO_URL = os.environ.get("VE_STUDIO_URL", "https://form.creativeadbundance.com")
STUDIO = [
    ("concepts", STUDIO_URL + "/#concepts", "Concept Generator",
     '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>'),
    ("static", STUDIO_URL + "/#static", "Static Ads Generator",
     '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>'),
    ("library", STUDIO_URL + "/#library", "Ad Library",
     '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'),
    ("editor", "/", "Video Editor", ICONS["clapper"]),
]

CSS = """
:root{--pp:#6B47FF;--pp-l:#a78bfa;--pp-t:#c9c4ff;--bg:#0b0b0f;--sf:#141414;--sf2:#181818;
--ln:rgba(255,255,255,.08);--ln2:rgba(255,255,255,.15);--tx:#fff;--tx2:rgba(255,255,255,.6);
--tx3:rgba(255,255,255,.34);--ok:#22c55e;--okt:#86efac;--bad:#ef4444;--badt:#f87171;--warn:#f59e0b}
*{box-sizing:border-box}
body{margin:0;font-family:'Poppins',system-ui,-apple-system,Arial,sans-serif;font-size:14px;line-height:1.5;
color:var(--tx);background:radial-gradient(1100px 480px at 60% -240px,rgba(107,71,255,.14),transparent),var(--bg);
min-height:100vh;display:flex}
a{color:var(--pp-l);text-decoration:none}a:hover{color:var(--pp-t)}
.ic{width:16px;height:16px;flex:none;vertical-align:middle}
.spin{animation:sp 1s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}
.side{width:248px;flex:none;background:#0b0b12;border-right:1px solid var(--ln);display:flex;flex-direction:column;
padding:20px 14px;position:sticky;top:0;height:100vh}
.side-brand{display:flex;align-items:center;gap:10px;padding:6px 8px 20px}
.mark{width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,#6B47FF,#a78bfa);
display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;color:#fff}
.wm{font-weight:700;font-size:13.5px}.wm b{color:var(--pp-l)}
.side-label{font-size:9px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--tx3);padding:2px 10px 8px}
.side-nav{display:flex;flex-direction:column;gap:3px}
.side-item{display:flex;align-items:center;gap:11px;padding:10px 11px;border-radius:9px;font-size:12.5px;
font-weight:500;color:var(--tx2);text-decoration:none;transition:background .15s,color .15s}
.side-item:hover{background:rgba(255,255,255,.05);color:#fff}
.side-item.active{background:rgba(107,71,255,.16);color:#fff}
.side-item .ic{width:17px;height:17px;opacity:.75}
.side-item.active .ic{opacity:1;color:var(--pp-l)}
.side-sub{display:flex;flex-direction:column;gap:1px;margin:1px 0 3px}
.side-sub a{padding:6px 11px 6px 41px;border-radius:8px;font-size:11.5px;color:var(--tx3);text-decoration:none}
.side-sub a:hover{color:var(--tx2);background:rgba(255,255,255,.04)}
.side-sub a.on{color:var(--pp-l)}
.side-foot{margin-top:auto;padding-top:12px;border-top:1px solid var(--ln)}
.side-out{display:block;padding:9px 11px;border-radius:9px;color:var(--tx3);font-size:12px;text-decoration:none}
.side-out:hover{background:rgba(255,255,255,.05);color:var(--tx2)}
.content{flex:1;min-width:0}
.content.bare{display:flex;align-items:center;justify-content:center;min-height:100vh}
.wrap{max-width:820px;margin:0 auto;padding:38px 30px 90px}
@media(max-width:760px){body{display:block}.side{width:auto;height:auto;position:static;flex-direction:row;
flex-wrap:wrap;align-items:center;gap:5px}.side-brand{padding:6px 8px}.side-label,.side-sub,.side-foot{display:none}
.side-nav{flex-direction:row;flex-wrap:wrap}.wrap{padding:26px 18px 70px}}
h1{font-size:22px;font-weight:700;margin:0 0 6px;display:flex;align-items:center;gap:10px}
h1 .ic{width:22px;height:22px;color:var(--pp-l)}
.sub{color:var(--tx2);font-size:12.5px;margin:0 0 22px;max-width:640px}
.card{background:var(--sf);border:1.5px solid var(--ln);border-radius:16px;padding:24px 26px;
box-shadow:0 10px 30px rgba(0,0,0,.35)}
.lbl{display:flex;align-items:center;gap:6px;font-size:9px;font-weight:600;letter-spacing:.14em;
text-transform:uppercase;color:var(--tx3);margin:18px 0 7px}.lbl .ic{width:13px;height:13px}
.lbl:first-child,.card>.row:first-child .lbl{margin-top:0}
.hint{text-transform:none;letter-spacing:0;color:var(--tx3);font-weight:400;font-size:10.5px}
input,textarea{width:100%;background:var(--sf2);border:1px solid var(--ln);border-radius:9px;
padding:11px 13px;color:var(--tx);font:inherit;font-size:13px;outline:none;transition:border-color .2s}
input::placeholder,textarea::placeholder{color:var(--tx3)}
input:focus,textarea:focus{border-color:var(--pp)}
textarea{font-family:ui-monospace,Consolas,monospace;height:300px;font-size:12.5px;line-height:1.55;resize:vertical}
.row{display:flex;gap:16px}.row>div{flex:1}
.btn{display:inline-flex;align-items:center;gap:8px;background:var(--pp);color:#fff;border:0;
padding:12px 26px;border-radius:100px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;
margin-top:22px;transition:opacity .2s,transform .15s}.btn:hover{opacity:.9;transform:translateX(2px)}
.btn .ic{width:15px;height:15px}
.lnk{display:inline-flex;align-items:center;gap:6px;padding:8px 15px;border-radius:100px;
border:1px solid var(--ln2);color:var(--tx2);font-size:12px;font-weight:500;margin:6px 8px 0 0;transition:.2s}
.lnk:hover{border-color:var(--pp);color:var(--pp-l);background:rgba(107,71,255,.08)}
.lnk .ic{width:14px;height:14px}
table{border-collapse:collapse;width:100%;font-size:13px}
th{text-align:left;padding:0 12px 10px;font-size:9px;font-weight:600;letter-spacing:.12em;
text-transform:uppercase;color:var(--tx3);border-bottom:1px solid var(--ln)}
td{padding:13px 12px;border-bottom:1px solid var(--ln);vertical-align:middle}
tr:last-child td{border-bottom:0}
.badge{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:500}
.badge .ic{width:15px;height:15px}
.b-ok{color:var(--okt)}.b-bad{color:var(--badt)}.b-run{color:var(--pp-l)}.b-wait{color:var(--tx2)}
.out a{margin-right:12px;font-size:12px;display:inline-flex;align-items:center;gap:5px}
.out .ic{width:14px;height:14px}
video{width:300px;border-radius:14px;border:1.5px solid var(--ln);margin:4px 0 8px;display:block}
pre{background:#08080c;border:1px solid var(--ln);color:#8fe3a6;padding:13px;border-radius:10px;
white-space:pre-wrap;font-size:11.5px;line-height:1.5;max-height:300px;overflow:auto}
.note{display:flex;gap:9px;padding:12px 14px;border-radius:11px;font-size:12.5px;margin-top:16px;align-items:flex-start}
.note .ic{width:16px;height:16px;margin-top:1px}
.note-w{background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.28);color:#fcd9a0}
.note-w ul{margin:6px 0 0;padding-left:16px}.note-w li{margin:2px 0}
.note-ok{background:rgba(34,197,94,.07);border:1px solid rgba(34,197,94,.22);color:var(--okt)}
.big{font-size:19px;font-weight:600;margin:0 0 14px;display:flex;align-items:center;gap:9px}
.big .ic{width:20px;height:20px}
.foot{margin-top:20px;color:var(--tx3);font-size:12px;display:flex;gap:16px;align-items:center}
.empty{color:var(--tx3);font-size:13px;padding:26px 0}
"""


def sidebar(active=""):
    items = []
    for key, href, label, icon in STUDIO:
        cls = "side-item active" if key == "editor" else "side-item"
        svg = (f'<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" '
               f'stroke-linecap="round" stroke-linejoin="round">{icon}</svg>')
        items.append(f'<a class="{cls}" href="{href}">{svg}<span>{label}</span></a>')
        if key == "editor":                                   # this app's own sub-views
            items.append(f'<div class="side-sub"><a class="{"on" if active == "home" else ""}" href="/">New ad</a>'
                         f'<a class="{"on" if active == "jobs" else ""}" href="/jobs">Jobs</a></div>')
    foot = f'<div class="side-foot"><a class="side-out" href="/logout">Sign out</a></div>' if PASSWORD else ""
    return (f'<aside class="side"><div class="side-brand"><div class="mark">CA</div>'
            f'<div class="wm">Creative Ad<b>&middot;</b>Bundance</div></div>'
            f'<div class="side-label">Workflows</div><nav class="side-nav">{"".join(items)}</nav>{foot}</aside>')


def page(body, active="", bare=False):
    shell = (f'<main class="content bare"><div class="wrap" style="max-width:400px">{body}</div></main>'
             if bare else f'{sidebar(active)}<main class="content"><div class="wrap">{body}</div></main>')
    return ("<!doctype html><html><head><meta charset='utf-8'>"
            "<meta name=viewport content='width=device-width,initial-scale=1'>"
            f"<link rel='icon' href=\"{FAVICON}\">"
            "<link rel='preconnect' href='https://fonts.googleapis.com'>"
            "<link rel='preconnect' href='https://fonts.gstatic.com' crossorigin>"
            "<link href='https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap' rel='stylesheet'>"
            f"<title>Ad Assembler &middot; Creative Ad-Bundance</title><style>{CSS}</style></head>"
            f"<body>{shell}</body></html>")


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


def notify(jdir, jid):
    """POST the finished job to the n8n webhook (VE_NOTIFY_WEBHOOK). Never breaks the job."""
    if not NOTIFY:
        return
    try:
        meta = json.load(open(os.path.join(jdir, "meta.json")))
    except Exception:
        meta = {}
    st = read_status(jdir)
    payload = {"job": jid, "brand": meta.get("brand"), "concept": meta.get("concept"),
               "submitter": meta.get("submitter"), "state": st.get("state"), "ok": st.get("ok", False),
               "seconds": st.get("seconds"), "error": st.get("error"),
               "warnings": st.get("warnings", []), "link": f"{PUBLIC_URL}/job/{jid}" if PUBLIC_URL else jid}
    try:
        req = urllib.request.Request(NOTIFY, data=json.dumps(payload).encode(),
                                     headers={"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=10).read()
    except Exception as e:
        print(f"notify failed for {jid}: {e}")


def sweep():
    """Free disk: for jobs older than KEEP_DAYS, drop raw footage + normalized media (zip keeps all)."""
    cutoff = time.time() - KEEP_DAYS * 86400
    for d in glob.glob(os.path.join(JOBS, "*")):
        try:
            if os.path.getmtime(d) < cutoff:
                shutil.rmtree(os.path.join(d, "footage"), ignore_errors=True)
                shutil.rmtree(os.path.join(d, "handoff", "media"), ignore_errors=True)
        except OSError:
            pass


def badge(state):
    m = {"done": ("ok", "b-ok", "", "Done"), "failed": ("bad", "b-bad", "", "Failed"),
         "queued": ("clock", "b-wait", "", "Queued"), "fetching": ("download", "b-run", "", "Fetching"),
         "running": ("loader", "b-run", "spin", "Rendering")}
    name, cls, extra, label = m.get(state, ("loader", "b-run", "spin", state))
    return f'<span class="badge {cls}">{ic(name, extra)}{label}</span>'


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
        err = '<div class="note note-w" style="margin-bottom:14px">' + ic("warn") + "Wrong password</div>"
    else:
        err = ""
    body = (f'<div class="side-brand" style="justify-content:center;padding:0 0 18px">'
            f'<div class="mark">CA</div><div class="wm">Creative Ad<b>&middot;</b>Bundance</div></div>'
            f'<div class="card">{err}<form method=post>'
            f'<div class="lbl">{ic("lock")}Team password</div><input type=password name=password autofocus>'
            f'<button class="btn" type=submit>{ic("arrow")}Enter</button></form></div>')
    return page(body, bare=True)


# ---------- pages ----------

@app.route("/")
def home():
    body = (
        f'<h1>{ic("clapper")}Ad Assembler</h1>'
        '<p class="sub">Paste your footage link and storyboard. We pull the footage, pick the best takes, '
        'cut to the delivery, lay karaoke captions, and hand back an editable Premiere timeline (XML) plus a '
        'preview. About 20 to 40 minutes per ad.</p>'
        '<div class="card"><form method=post action=/run>'
        '<div class="row">'
        f'<div><div class="lbl">Brand</div><input name=brand placeholder="Accredited Debt Relief" required></div>'
        f'<div><div class="lbl">Concept</div><input name=concept placeholder="005 Credit Cards" required></div>'
        f'<div><div class="lbl">Your name <span class="hint">for the done-ping</span></div><input name=submitter placeholder="Ricardo"></div>'
        '</div>'
        f'<div class="lbl">{ic("link")}Dropbox link '
        '<span class="hint">the renamer output folder (holds aroll/ + broll/)</span></div>'
        '<input name=dropbox placeholder="https://www.dropbox.com/scl/fo/.../...?rlkey=...&dl=0" required>'
        f'<div class="lbl">{ic("doc")}Storyboard '
        '<span class="hint">paste the table straight from Notion</span></div>'
        f'<textarea name=storyboard>{esc(sample_storyboard())}</textarea>'
        f'<button class="btn" type=submit>{ic("arrow")}Assemble</button>'
        '</form></div>')
    return page(body, "home")


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
        when = time.strftime("%b %d, %H:%M", time.localtime(os.path.getmtime(d)))
        out_cell = '<span style="color:var(--tx3)">&mdash;</span>'
        if st.get("ok") and st.get("outputs"):
            o = st["outputs"]
            out_cell = (f'<span class="out"><a href="/file/{jid}/{o["preview"]}">{ic("play")}Preview</a>'
                        f'<a href="/file/{jid}/{o["xml"]}">{ic("code")}XML</a>'
                        f'<a href="/file/{jid}/{o["srt"]}">{ic("captions")}SRT</a>'
                        f'<a href="/zip/{jid}">{ic("archive")}Zip</a></span>')
        rows.append(f'<tr><td style="color:var(--tx2)">{when}</td><td>{esc(meta.get("brand", ""))}</td>'
                    f'<td><a href="/job/{jid}">{esc(meta.get("concept", jid))}</a></td>'
                    f'<td>{badge(state)}</td><td>{out_cell}</td></tr>')
    table = ("<table><tr><th>When</th><th>Brand</th><th>Concept</th><th>Status</th><th>Output</th></tr>"
             + "".join(rows) + "</table>") if rows else '<div class="empty">No ads yet. Assemble your first one.</div>'
    body = (f'<h1>{ic("list")}Jobs</h1>'
            f'<p class="sub"><a href="/">{ic("plus")}New ad</a></p><div class="card">{table}</div>')
    return page(body, "jobs")


@app.route("/run", methods=["POST"])
def run():
    jid = uuid.uuid4().hex[:8]
    jdir = os.path.join(JOBS, jid)
    os.makedirs(jdir, exist_ok=True)
    name = slug(request.form["concept"])
    open(os.path.join(jdir, "storyboard.md"), "w", encoding="utf-8").write(request.form["storyboard"])
    json.dump({"brand": request.form["brand"], "concept": request.form["concept"],
               "submitter": request.form.get("submitter", "").strip()},
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
                notify(jdir, jid)
                return
            write_status(jdir, state="running")
            subprocess.run([PY, os.path.join(SCRIPTS, "run_ad.py"), "--in", jdir, "--footage-dir", footage,
                            "--out", out, "--name", name], stdout=log, stderr=subprocess.STDOUT)
            st = read_status(jdir)                      # run_ad wrote done/failed itself
            if st.get("state") not in ("done", "failed"):
                write_status(jdir, state="failed", ok=False, error="Assembly crashed. See log.")
        notify(jdir, jid)                               # ping the team: done or failed, with the job link
    POOL.submit(worker)
    return redirect(url_for("job", jid=jid))


@app.route("/job/<jid>")
def job(jid):
    jdir = jdir_of(jid)
    if not jdir:
        return page(f'<h1>{ic("bad")}Job not found</h1><p class="sub"><a href="/jobs">{ic("back")}All jobs</a></p>'), 404
    try:
        meta = json.load(open(os.path.join(jdir, "meta.json")))
    except Exception:
        meta = {"concept": jid}
    st = read_status(jdir)
    state = st.get("state", "done" if st.get("ok") else "running")
    tail = open(os.path.join(jdir, "run.log"), encoding="utf-8", errors="ignore").read()[-1600:] \
        if os.path.exists(os.path.join(jdir, "run.log")) else ""
    concept = esc(meta["concept"])

    if state in ("queued", "fetching", "running"):
        note = {"queued": "Waiting for the worker (one ad renders at a time).",
                "fetching": "Pulling the footage from Dropbox.",
                "running": "Assembling: transcription, cuts, captions, normalize, XML."}[state]
        body = (f'<div class="big">{badge(state)}&nbsp;{concept}</div>'
                f'<p class="sub">{note} This page auto-refreshes.</p>'
                f'<pre>{esc(tail) or "starting..."}</pre>'
                f'<p class="foot"><a href="/jobs">{ic("list")}All jobs</a></p>')
        return page("<meta http-equiv=refresh content=6>" + body)

    if not st.get("ok"):
        body = (f'<div class="big" style="color:var(--badt)">{ic("bad")}{concept}</div>'
                f'<p class="sub">{esc(st.get("error", "failed"))}</p><pre>{esc(tail)}</pre>'
                f'<p class="foot"><a href="/">{ic("plus")}Try again</a><a href="/jobs">{ic("list")}All jobs</a></p>')
        return page(body)

    o = st["outputs"]
    warn = "".join(f"<li>{esc(w)}</li>" for w in st.get("warnings", []))
    wb = (f'<div class="note note-w">{ic("warn")}<div><b>Footage / delivery notes</b><ul>{warn}</ul></div></div>'
          if warn else f'<div class="note note-ok">{ic("check")}All footage matched cleanly.</div>')
    body = (f'<div class="big" style="color:var(--okt)">{ic("ok")}{concept}</div>'
            f'<p class="sub">Assembled in {st["seconds"]}s &middot; {st["scenes"]} scenes</p>'
            f'<video src="/file/{jid}/{o["preview"]}" controls></video>'
            f'<div class="lbl" style="margin-top:14px">Download for Premiere</div>'
            f'<a class="lnk" href="/file/{jid}/{o["xml"]}">{ic("code")}XML timeline</a>'
            f'<a class="lnk" href="/file/{jid}/{o["srt"]}">{ic("captions")}SRT captions</a>'
            f'<a class="lnk" href="/zip/{jid}">{ic("archive")}Full handoff (.zip)</a>'
            f'{wb}<p class="foot"><a href="/">{ic("plus")}Assemble another</a>'
            f'<a href="/jobs">{ic("list")}All jobs</a></p>')
    return page(body)


@app.route("/file/<jid>/<path:fn>")
def filed(jid, fn):
    if not jdir_of(jid):
        return page(f'<h1>{ic("bad")}Not found</h1>'), 404
    return send_from_directory(os.path.join(JOBS, jid, "handoff"), fn)


@app.route("/zip/<jid>")
def zipd(jid):
    if not jdir_of(jid):
        return page(f'<h1>{ic("bad")}Not found</h1>'), 404
    return send_from_directory(os.path.join(JOBS, jid), "handoff.zip", as_attachment=True)


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login") if PASSWORD else "/")


@app.route("/healthz")
def healthz():
    return {"ok": True}


if __name__ == "__main__":
    host = os.environ.get("VE_HOST", "0.0.0.0")
    port = int(os.environ.get("VE_PORT", "5000"))
    print(f"Ad Assembler  ->  http://localhost:{port}" + ("  (password-gated)" if PASSWORD else "  (NO password set)"))
    try:
        from waitress import serve
        serve(app, host=host, port=port, threads=8)
    except ImportError:
        app.run(host=host, port=port, threaded=True, debug=False)
