#!/usr/bin/env python3
"""Build an editable Premiere (FCP7 / XMEML v5) timeline + SRT captions from a cut plan.

Input: cut_plan.json from emit_cut_plan.py (A-roll source in/out per kept take +
source media metadata). Optional: a b-roll placements JSON and words.json (captions).

Output:
  <out>.xml  -- import into Premiere (File > Import): an editable sequence with the
                A-roll best-takes trimmed on V1 (+ linked audio on A1), B-roll on V2.
  <out>.srt  -- captions remapped to the ASSEMBLED timeline; import as a caption track.

The deliverable is a LOOSE ASSEMBLY for a motion designer to finish, not a render.

Usage:
  python build_premiere_xml.py --plan cut_plan.json --out ad01 \
      [--broll placements.json] [--words words.json] [--name "Ad 01 assembly"]

placements.json (optional): [{"file": "C:/broll/x.mp4", "in": 0.0, "out": 2.4,
                              "track_start": 5.0}]  (seconds)
"""
import argparse, json, os, html
from urllib.parse import quote


def pathurl(p):
    """FCP7 expects file://localhost/<abs path>, forward slashes, %-encoded spaces."""
    p = os.path.abspath(p).replace("\\", "/")
    return "file://localhost/" + quote(p, safe="/:")


def esc(s):
    return html.escape(str(s), quote=False)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan", required=True)
    ap.add_argument("--out", required=True, help="output basename (writes <out>.xml and <out>.srt)")
    ap.add_argument("--broll", default=None)
    ap.add_argument("--words", default=None)
    ap.add_argument("--name", default=None)
    a = ap.parse_args()

    plan = json.load(open(a.plan, encoding="utf-8-sig"))
    fps_num = plan.get("fps_num", 30)
    fps_den = plan.get("fps_den", 1) or 1
    fps = fps_num / fps_den
    tb = int(round(fps))                       # FCP7 timebase (integer)
    ntsc = "TRUE" if fps_den == 1001 else "FALSE"   # 1000/1001 pulldown flag
    dur_s = plan.get("duration", 0.0)
    W, H = plan.get("width", 1080), plan.get("height", 1920)
    src = plan["source"]
    head, tail = plan.get("head", 0.0), plan.get("tail", 0.0)
    name = a.name or os.path.splitext(os.path.basename(a.out))[0]

    def F(t):                                  # seconds -> frame index
        return int(round(t * fps))

    full_src_frames = F(dur_s) if dur_s else 0
    src_name, src_url = os.path.basename(src), pathurl(src)

    def rate_xml():
        return f"<rate><timebase>{tb}</timebase><ntsc>{ntsc}</ntsc></rate>"

    def file_def(fid, fname, furl, fframes, fw, fh, with_audio=True):
        audio = ("<audio><samplecharacteristics><depth>16</depth>"
                 "<samplerate>48000</samplerate></samplecharacteristics>"
                 "<channelcount>2</channelcount></audio>") if with_audio else ""
        return (f'<file id="{fid}"><name>{esc(fname)}</name>'
                f'<pathurl>{esc(furl)}</pathurl>{rate_xml()}'
                f'<duration>{fframes}</duration>'
                f'<media><video><samplecharacteristics>{rate_xml()}'
                f'<width>{fw}</width><height>{fh}</height></samplecharacteristics></video>'
                f'{audio}</media></file>')

    # ---- A-roll segments -> timeline positions (apply head/tail pads) ----
    aroll, tl, idx = [], 0, 0
    for s in plan["segments"]:
        c_in = max(0.0, s["on"] - head)
        c_out = min(s["off"] + tail, dur_s) if dur_s else s["off"] + tail
        in_f, out_f = F(c_in), F(c_out)
        if out_f <= in_f:
            continue
        d = out_f - in_f
        aroll.append({"i": idx, "label": s.get("label", f"take {idx + 1}"),
                      "in": in_f, "out": out_f, "start": tl, "end": tl + d,
                      "src_in_s": c_in, "len_s": d / fps})
        tl += d
        idx += 1
    seq_dur = tl

    # ---- V1 video + A1 audio clipitems, linked A/V ----
    v_items, a_items, first = [], [], True
    for n, c in enumerate(aroll, start=1):
        fdef = file_def("file-aroll", src_name, src_url, full_src_frames, W, H) if first else '<file id="file-aroll"/>'
        first = False
        links = (f'<link><linkclipref>v{c["i"]}</linkclipref><mediatype>video</mediatype>'
                 f'<trackindex>1</trackindex><clipindex>{n}</clipindex></link>'
                 f'<link><linkclipref>a{c["i"]}</linkclipref><mediatype>audio</mediatype>'
                 f'<trackindex>1</trackindex><clipindex>{n}</clipindex></link>')
        v_items.append(
            f'<clipitem id="v{c["i"]}"><name>{esc(c["label"])}</name><enabled>TRUE</enabled>'
            f'<duration>{full_src_frames}</duration>{rate_xml()}'
            f'<start>{c["start"]}</start><end>{c["end"]}</end>'
            f'<in>{c["in"]}</in><out>{c["out"]}</out>{fdef}{links}</clipitem>')
        a_items.append(
            f'<clipitem id="a{c["i"]}"><name>{esc(c["label"])}</name><enabled>TRUE</enabled>'
            f'<duration>{full_src_frames}</duration>{rate_xml()}'
            f'<start>{c["start"]}</start><end>{c["end"]}</end>'
            f'<in>{c["in"]}</in><out>{c["out"]}</out><file id="file-aroll"/>'
            f'<sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack>'
            f'{links}</clipitem>')

    # ---- V2 b-roll (optional) ----
    v2_items = []
    if a.broll and os.path.exists(a.broll):
        for n, b in enumerate(json.load(open(a.broll, encoding="utf-8-sig")), start=1):
            b_in, b_out = F(b.get("in", 0.0)), F(b.get("out", 0.0))
            if b_out <= b_in:
                continue
            ts = F(b.get("track_start", 0.0))
            te = ts + (b_out - b_in)
            bname = os.path.basename(b["file"])
            bframes = b.get("full_frames", b_out)
            v2_items.append(
                f'<clipitem id="vb{n}"><name>{esc(bname)}</name><enabled>TRUE</enabled>'
                f'<duration>{bframes}</duration>{rate_xml()}'
                f'<start>{ts}</start><end>{te}</end><in>{b_in}</in><out>{b_out}</out>'
                f'{file_def(f"file-broll{n}", bname, pathurl(b["file"]), bframes, W, H, with_audio=False)}'
                f'</clipitem>')

    video_tracks = f"<track>{''.join(v_items)}</track>"
    if v2_items:
        video_tracks += f"<track>{''.join(v2_items)}</track>"
    audio_track = f"<track>{''.join(a_items)}</track>"

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>\n<xmeml version="5">\n'
        f'<sequence id="sequence-1"><name>{esc(name)}</name>'
        f'<duration>{seq_dur}</duration>{rate_xml()}'
        '<media><video><format><samplecharacteristics>'
        f'{rate_xml()}<width>{W}</width><height>{H}</height>'
        '<pixelaspectratio>square</pixelaspectratio></samplecharacteristics></format>'
        f'{video_tracks}</video>'
        '<audio><format><samplecharacteristics><depth>16</depth>'
        '<samplerate>48000</samplerate></samplecharacteristics></format>'
        f'{audio_track}</audio></media></sequence>\n</xmeml>\n')

    open(a.out + ".xml", "w", encoding="utf-8").write(xml)
    print(f"wrote {a.out}.xml: {len(aroll)} A-roll clips, {len(v2_items)} B-roll clips, "
          f"seq {seq_dur} frames (~{seq_dur / fps:.1f}s) @ {tb}{'i' if ntsc == 'TRUE' else 'p'}")

    # ---- captions SRT, remapped to the assembled timeline ----
    if a.words and os.path.exists(a.words):
        words = json.load(open(a.words, encoding="utf-8-sig"))

        def out_time(src_t):
            acc = 0.0
            for c in aroll:
                if c["src_in_s"] <= src_t <= c["src_in_s"] + c["len_s"]:
                    return acc + (src_t - c["src_in_s"])
                acc += c["len_s"]
            return None

        toks = []
        for wd in words:
            ot = out_time((wd["start"] + wd["end"]) / 2)
            if ot is None:
                continue
            os_ = out_time(wd["start"]) or ot
            oe_ = out_time(wd["end"]) or (ot + 0.3)
            toks.append((os_, oe_, wd["word"].strip()))
        toks.sort(key=lambda x: x[0])

        lines, cur = [], []
        for t in toks:
            if cur and (t[1] - cur[0][0] > 2.5 or len(cur) >= 6):
                lines.append(cur)
                cur = []
            cur.append(t)
        if cur:
            lines.append(cur)

        def ts(sec):
            sec = max(0.0, sec)
            h, m = int(sec // 3600), int((sec % 3600) // 60)
            s, ms = int(sec % 60), int(round((sec - int(sec)) * 1000))
            if ms == 1000:
                s, ms = s + 1, 0
            return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

        srt = []
        for n, ln in enumerate(lines, start=1):
            srt.append(f"{n}\n{ts(ln[0][0])} --> {ts(max(x[1] for x in ln))}\n"
                       f"{' '.join(x[2] for x in ln).strip()}\n")
        open(a.out + ".srt", "w", encoding="utf-8").write("\n".join(srt))
        print(f"wrote {a.out}.srt: {len(lines)} caption lines")


if __name__ == "__main__":
    main()
