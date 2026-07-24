#!/usr/bin/env python3
"""Build an editable Premiere (FCP7 / XMEML v5) MULTI-SOURCE assembly from a storyboard.

Unlike build_premiere_xml.py (one A-roll source, take-cutting), this assembles an ad
from MANY different b-roll clips placed in storyboard order on V1, each trimmed to a
scene duration, with the script lines as captions. For VO / caption-driven product ads.

Handles mixed source frame rates / resolutions: source in/out are computed in each
clip's OWN rate, timeline start/end in the SEQUENCE rate (Premiere conforms on import).

With --vo-track <vo_track.json>, lays the per-scene voiceover on its own audio track
(A1), drops the clips' ambient audio, and muxes the VO into the preview.

Input assembly.json:
{
  "width":1080,"height":1920,"fps":30,
  "clips":[ {"file":"C:/.../x.mp4","in":0.0,"dur":3.5,"caption":"...","scene":"Hook 1"}, ... ]
}

Usage:
  python build_assembly_xml.py --assembly assembly.json --out output/onsen_h1 \
      --name "Onsen H1 assembly" [--vo-track vo_track.json] [--preview output/onsen_h1.preview.mp4]
"""
import argparse, json, os, html, subprocess
from urllib.parse import quote

_PROBE = {}


def pathurl(p):
    return "file://localhost/" + quote(os.path.abspath(p).replace("\\", "/"), safe="/:")


def esc(s):
    return html.escape(str(s), quote=False)


def rate_of(fps):
    tb = int(round(fps))
    return tb, ("TRUE" if abs(fps - tb) > 0.01 else "FALSE")


def rate_xml(tb, ntsc):
    return f"<rate><timebase>{tb}</timebase><ntsc>{ntsc}</ntsc></rate>"


def probe(path):
    if path in _PROBE:
        return _PROBE[path]
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                        "stream=codec_type,width,height,r_frame_rate", "-show_entries",
                        "format=duration", "-of", "json", path], capture_output=True, text=True)
    info = json.loads(r.stdout or "{}")
    vs = next((s for s in info.get("streams", []) if s.get("codec_type") == "video"), {})
    num, den = (vs.get("r_frame_rate", "30/1") + "/1").split("/")[:2]
    fps = int(num) / (int(den) or 1)
    dur = float(info.get("format", {}).get("duration", 0.0))
    meta = {"w": int(vs.get("width", 0)), "h": int(vs.get("height", 0)), "fps": fps,
            "dur": dur, "frames": int(round(dur * fps)),
            "audio": any(s.get("codec_type") == "audio" for s in info.get("streams", []))}
    _PROBE[path] = meta
    return meta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--assembly", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--name", default=None)
    ap.add_argument("--preview", default=None)
    ap.add_argument("--captions-ass", default=None, help="burn this karaoke ASS (safe-zone) into the preview instead of the plain SRT")
    ap.add_argument("--vo-track", default=None)
    a = ap.parse_args()

    spec = json.load(open(a.assembly, encoding="utf-8-sig"))
    vo_track = json.load(open(a.vo_track, encoding="utf-8-sig")) if a.vo_track else None
    use_ambient = vo_track is None
    W, H, seq_fps = spec.get("width", 1080), spec.get("height", 1920), spec.get("fps", 30)
    seq_tb, seq_ntsc = rate_of(seq_fps)
    name = a.name or os.path.splitext(os.path.basename(a.out))[0]
    clips = spec["clips"]

    files = {}
    for c in clips:
        files.setdefault(os.path.abspath(c["file"]), None)
    for i, p in enumerate(list(files), start=1):
        files[p] = f"file-{i}"

    def F_seq(t):
        return int(round(t * seq_fps))

    v_items, a_items, defined, tl, srt_rows, missing = [], [], set(), 0, [], []
    for idx, c in enumerate(clips):
        p = os.path.abspath(c["file"])
        if not os.path.exists(p):
            missing.append(c["file"])
        m = probe(p)
        fid = files[p]
        ctb, cntsc = seq_tb, seq_ntsc            # declare ALL media at the sequence rate -> robust mixed-fps conform
        ffull = int(round((m["dur"] or 0) * seq_fps))
        in_s, dur_s = float(c.get("in", 0.0)), float(c["dur"])
        if m["dur"] and in_s + dur_s > m["dur"]:
            in_s = max(0.0, min(in_s, m["dur"] - dur_s))
        sin = int(round(in_s * seq_fps))
        sout = max(sin + 1, int(round((in_s + dur_s) * seq_fps)))
        tstart, tend = tl, tl + F_seq(dur_s)
        tl = tend
        vid, aid, clipnum = f"v{idx}", f"a{idx}", idx + 1
        has_aud = m["audio"] and use_ambient
        if fid not in defined:
            aud = ("<audio><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate>"
                   "</samplecharacteristics><channelcount>2</channelcount></audio>") if m["audio"] else ""
            fdef = (f'<file id="{fid}"><name>{esc(os.path.basename(p))}</name>'
                    f'<pathurl>{esc(pathurl(p))}</pathurl>{rate_xml(ctb, cntsc)}'
                    f'<duration>{ffull}</duration><media><video><samplecharacteristics>'
                    f'{rate_xml(ctb, cntsc)}<width>{m["w"]}</width><height>{m["h"]}</height>'
                    f'</samplecharacteristics></video>{aud}</media></file>')
            defined.add(fid)
        else:
            fdef = f'<file id="{fid}"/>'
        links = (f'<link><linkclipref>{vid}</linkclipref><mediatype>video</mediatype>'
                 f'<trackindex>1</trackindex><clipindex>{clipnum}</clipindex></link>')
        if has_aud:
            links += (f'<link><linkclipref>{aid}</linkclipref><mediatype>audio</mediatype>'
                      f'<trackindex>1</trackindex><clipindex>{clipnum}</clipindex></link>')
        label = esc(os.path.splitext(os.path.basename(p))[0])   # name by SOURCE so reused clips collapse to ONE bin master clip
        mcid = "masterclip-" + fid.split("-", 1)[1]              # same source -> same masterclip -> one scrub-able original in the bin
        v_items.append(f'<clipitem id="{vid}"><masterclipid>{mcid}</masterclipid><name>{label}</name><enabled>TRUE</enabled>'
                       f'<duration>{ffull}</duration>{rate_xml(ctb, cntsc)}'
                       f'<start>{tstart}</start><end>{tend}</end><in>{sin}</in><out>{sout}</out>'
                       f'{fdef}{links}</clipitem>')
        if has_aud:
            a_items.append(f'<clipitem id="{aid}"><name>{label}</name><enabled>TRUE</enabled>'
                           f'<duration>{ffull}</duration>{rate_xml(ctb, cntsc)}'
                           f'<start>{tstart}</start><end>{tend}</end><in>{sin}</in><out>{sout}</out>'
                           f'<file id="{fid}"/><sourcetrack><mediatype>audio</mediatype>'
                           f'<trackindex>1</trackindex></sourcetrack>{links}</clipitem>')
        srt_rows.append({"start": tstart / seq_fps, "end": tend / seq_fps, "cap": c.get("caption", "").strip()})

    # audio: VO track if provided, else the clips' ambient audio
    if vo_track:
        vo_items = []
        for vi, e in enumerate(vo_track, start=1):
            vp = os.path.abspath(e["file"])
            vstart, vlen = F_seq(float(e["start"])), F_seq(float(e["dur"]))
            vend = vstart + vlen
            fdef = (f'<file id="vo-{vi}"><name>{esc(os.path.basename(vp))}</name>'
                    f'<pathurl>{esc(pathurl(vp))}</pathurl>{rate_xml(seq_tb, seq_ntsc)}'
                    f'<duration>{vlen}</duration><media><audio><samplecharacteristics><depth>16</depth>'
                    f'<samplerate>44100</samplerate></samplecharacteristics><channelcount>1</channelcount>'
                    f'</audio></media></file>')
            vo_items.append(f'<clipitem id="voc{vi}"><name>{esc(e.get("scene", "VO"))} VO</name>'
                            f'<enabled>TRUE</enabled><duration>{vlen}</duration>{rate_xml(seq_tb, seq_ntsc)}'
                            f'<start>{vstart}</start><end>{vend}</end><in>0</in><out>{vlen}</out>'
                            f'{fdef}<sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex>'
                            f'</sourcetrack></clipitem>')
        audio_block = (f'<audio><format><samplecharacteristics><depth>16</depth><samplerate>44100'
                       f'</samplerate></samplecharacteristics></format><track>{"".join(vo_items)}</track></audio>')
    else:
        audio_block = (f'<audio><format><samplecharacteristics><depth>16</depth><samplerate>48000'
                       f'</samplerate></samplecharacteristics></format><track>{"".join(a_items)}'
                       f'</track></audio>') if a_items else ""

    xml = ('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>\n<xmeml version="5">\n'
           f'<sequence id="sequence-1"><name>{esc(name)}</name><duration>{tl}</duration>'
           f'{rate_xml(seq_tb, seq_ntsc)}<media><video><format><samplecharacteristics>'
           f'{rate_xml(seq_tb, seq_ntsc)}<width>{W}</width><height>{H}</height>'
           '<pixelaspectratio>square</pixelaspectratio></samplecharacteristics></format>'
           f'<track>{"".join(v_items)}</track></video>{audio_block}</media></sequence>\n</xmeml>\n')
    open(a.out + ".xml", "w", encoding="utf-8").write(xml)
    print(f"wrote {a.out}.xml: {len(clips)} clips / {len(files)} sources, "
          f"seq {tl} frames (~{tl / seq_fps:.1f}s) {W}x{H}@{seq_tb}"
          f"{' + VO track' if vo_track else ''}")
    if missing:
        print("!! MISSING FILES:")
        for mf in missing:
            print("   ", mf)

    merged = []
    for r in srt_rows:
        if r["cap"] and merged and merged[-1]["cap"] == r["cap"]:
            merged[-1]["end"] = r["end"]
        else:
            merged.append(dict(r))

    def ts(sec):
        sec = max(0.0, sec)
        h, m_, s, ms = int(sec // 3600), int((sec % 3600) // 60), int(sec % 60), int(round((sec - int(sec)) * 1000))
        if ms == 1000:
            s, ms = s + 1, 0
        return f"{h:02d}:{m_:02d}:{s:02d},{ms:03d}"

    caps = [r for r in merged if r["cap"]]
    open(a.out + ".srt", "w", encoding="utf-8").write(
        "\n".join(f"{i}\n{ts(r['start'])} --> {ts(r['end'])}\n{r['cap']}\n" for i, r in enumerate(caps, start=1)))
    print(f"wrote {a.out}.srt: {len(caps)} captions")

    if a.preview:
        pw, ph = 540, 960
        inputs, filt = [], []
        for k, c in enumerate(clips):
            p = os.path.abspath(c["file"])
            m = probe(p)
            in_s, dur_s = float(c.get("in", 0.0)), float(c["dur"])
            if m["dur"] and in_s + dur_s > m["dur"]:
                in_s = max(0.0, min(in_s, m["dur"] - dur_s))
            nf = max(1, int(round(dur_s * seq_fps)))           # exact frames this scene should occupy
            inputs += ["-ss", f"{in_s:.3f}", "-t", f"{dur_s + 0.5:.3f}", "-i", p]   # read a little extra, then...
            filt.append(f"[{k}:v]scale={pw}:{ph}:force_original_aspect_ratio=increase,"
                        f"crop={pw}:{ph},setsar=1,fps={seq_fps},trim=end_frame={nf},"   # ...keep EXACTLY nf frames (a non-frame-aligned -ss otherwise drifts the video ±1 frame/clip vs captions+VO)
                        f"setpts=PTS-STARTPTS[v{k}]")
        concat = "".join(f"[v{k}]" for k in range(len(clips))) + f"concat=n={len(clips)}:v=1:a=0[vout]"
        ff = os.path.splitext(a.preview)[0] + "_filter.txt"
        open(ff, "w", encoding="utf-8").write(";".join(filt) + ";" + concat)
        tmp = os.path.splitext(a.preview)[0] + "_nocap.mp4"
        print("rendering assembly preview (decodes the 4K slices, can take a bit)...")
        r = subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *inputs,
                            "-filter_complex_script", ff, "-map", "[vout]", "-c:v", "libx264",
                            "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", tmp],
                           capture_output=True, text=True)
        print("concat RC", r.returncode, "" if r.returncode == 0 else r.stderr[-1500:])
        if r.returncode == 0:
            if a.captions_ass:                       # karaoke ASS carries its own safe-zone pos, gold highlight, font
                cap = os.path.abspath(a.captions_ass).replace("\\", "/").replace(":", "\\:")
                vf = f"ass='{cap}'"
            else:                                    # fallback: plain SRT at the bottom (not the approved style)
                srt = (a.out + ".srt").replace("\\", "/").replace(":", "\\:")
                vf = f"subtitles='{srt}':force_style='Alignment=2,FontSize=14,Outline=2,MarginV=40'"
            if vo_track:
                vo_in = []
                for e in vo_track:
                    vo_in += ["-i", os.path.abspath(e["file"])]
                fc2 = (f"[0:v]{vf}[v];"
                       + "".join(f"[{k + 1}:a]" for k in range(len(vo_track)))
                       + f"concat=n={len(vo_track)}:v=0:a=1[a]")
                r2 = subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", tmp, *vo_in,
                                    "-filter_complex", fc2, "-map", "[v]", "-map", "[a]",
                                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
                                    "-c:a", "aac", "-shortest", a.preview], capture_output=True, text=True)
                print("captions+VO RC", r2.returncode, "" if r2.returncode == 0 else r2.stderr[-1500:])
            else:
                r2 = subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", tmp,
                                    "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
                                    "-pix_fmt", "yuv420p", a.preview], capture_output=True, text=True)
                print("captions RC", r2.returncode, "" if r2.returncode == 0 else r2.stderr[-1500:])


if __name__ == "__main__":
    main()
