"""For every scene: does speech start AT the caption, or is there a lead silence/inhale gap?
Extracts VO_full at each scene start, runs silencedetect, reports the lead gap. Flags > 0.10s."""
import json, os, re, subprocess, sys

p = sys.argv[1] if len(sys.argv) > 1 else r"c:\Clients\Creative Adbundance\Creative-Adbundance\VideoEditor\output\innerwell_v6"
vo = os.path.join(p, "media", "VO_full.mp3")
asm = json.load(open(os.path.join(p, "assembly.json"), encoding="utf-8-sig"))

cum = 0.0
rows = []
for c in asm["clips"]:
    start = cum
    cum += c["dur"]
    tmp = os.path.join(os.path.dirname(p), "_onchk.wav")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{start:.3f}", "-i", vo,
                    "-t", "0.7", "-c:a", "pcm_s16le", tmp], capture_output=True)
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", tmp, "-af", "silencedetect=noise=-40dB:d=0.08",
                        "-f", "null", "-"], capture_output=True, text=True)
    gap = 0.0
    for ln in r.stderr.splitlines():
        if "silence_start:" in ln:
            s = float(ln.split("silence_start:")[1].strip().split()[0])
        if "silence_end:" in ln and 's' in dir():
            e = float(ln.split("silence_end:")[1].split("|")[0].strip().split()[0])
            if s <= 0.15:
                gap = max(gap, e)
            break
    flag = "  <-- LEAD GAP" if gap > 0.10 else ""
    rows.append((c["scene"], c.get("caption", "")[:34], gap, flag))

print(f"{'scene':6} {'caption':36} lead-gap")
for sc, cap, gap, flag in rows:
    print(f"{sc:6} {cap:36} {gap:5.2f}s{flag}")
bad = [r for r in rows if r[3]]
print(f"\n{len(bad)} scene(s) with a lead gap > 0.10s" if bad else "\nALL scenes: caption lands on speech (no lead gap)")
