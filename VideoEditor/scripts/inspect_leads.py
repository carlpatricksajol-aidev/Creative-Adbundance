import sys, json, subprocess, numpy as np
sc = sys.argv[1]
sys.path.insert(0, r"c:\Clients\Creative Adbundance\Creative-Adbundance\VideoEditor\scripts")
from tighten_segments import lead_silence_end

vt = json.load(open(sc + r"\vo_track.json", encoding="utf-8-sig"))
words = json.load(open(sc + r"\words_global.json", encoding="utf-8-sig"))
bys = {}
for w in words:
    bys.setdefault(w["scene"], []).append(w)

for e in vt:
    if e["scene"] not in ("Hook", "6", "CTA", "3"):
        continue
    sw = sorted(bys.get(e["scene"], []), key=lambda w: w["start"])
    fw = (sw[0]["word"], round(sw[0]["start"] - e["start"], 3)) if sw else None
    ls = lead_silence_end(e["file"])
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", e["file"], "-t", "1.0", "-ac", "1",
                          "-ar", "16000", "-f", "f32le", "-"], capture_output=True).stdout
    x = np.frombuffer(raw, dtype=np.float32)
    n = int(16000 * 0.05)
    onset = next((i*0.05 for i in range(len(x)//n)
                  if 20*np.log10(max(np.sqrt((x[i*n:(i+1)*n]**2).mean()), 1e-6)) > -35), None)
    print(f"{e['scene']:5} {e['file'].split('/')[-1]:14} whisper_first={fw} lead_silence_end={round(ls,3)} real_onset={onset}")
