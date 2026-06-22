#!/usr/bin/env python3
"""Karaoke captions as an ASS file, from script-aligned words (correct spelling, %, ?,
-, URLs). A short rolling phrase, the CURRENTLY spoken word highlighted, the rest in
the base colour, bold, auto-wrapped in the safe zone.

- Keeps special characters (100%, "?", dashes).
- Renders a URL (brand.com) LOWERCASE and whole, website-style.
- Events never overlap (a small gap), so captions never stack/duplicate.

Configurable: --font, --color, --highlight, --vpos (fraction of height from bottom).

Usage:
  python build_captions_ass.py --words words_script.json --out captions.ass \
      --width 1080 --height 1920 [--max-words 3] [--vpos 0.40]
"""
import argparse, json, re

URL_RE = re.compile(r'(?:www\.)?[\w-]+\.(?:com|net|org|co|io|gov|app)\b', re.I)

HEADER = """[Script Info]
ScriptType: v4.00+
PlayResX: {w}
PlayResY: {h}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,{font},{fs},{color},{color},&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,{ol},{sh},2,{ml},{ml},{mv},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


def is_url(t):
    return bool(URL_RE.search(t))


def disp(tok):
    tok = tok.strip()
    if is_url(tok):
        return tok.upper()                       # big & bold like the rest, kept whole (BRAND.COM)
    tok = tok.strip('"\'().,;:')                  # strip edge quotes/brackets/commas/periods; keep ? ! % -
    return tok.upper()


def esc(s):
    return s.replace("{", "(").replace("}", ")")   # ASS override braces are special


def amp(c):
    return c if c.endswith("&") else c + "&"


def t(sec):
    sec = max(0.0, sec)
    h = int(sec // 3600); m = int((sec % 3600) // 60); s = sec % 60
    return f"{h:d}:{m:02d}:{s:05.2f}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--words", required=True)
    ap.add_argument("--out", default="captions.ass")
    ap.add_argument("--width", type=int, default=1080)
    ap.add_argument("--height", type=int, default=1920)
    ap.add_argument("--max-words", type=int, default=3)
    ap.add_argument("--min-dur", type=float, default=0.34, help="a phrase shorter than this flashes -> merge it into the next same-scene phrase")
    ap.add_argument("--font", default="Arial")
    ap.add_argument("--color", default="&H00FFFFFF")
    ap.add_argument("--highlight", default="&H0018C5F5")
    ap.add_argument("--vpos", type=float, default=0.40)
    a = ap.parse_args()

    base, hi = amp(a.color), amp(a.highlight)
    words = [w for w in json.load(open(a.words, encoding="utf-8-sig")) if disp(w["word"])]
    NUMW = {"one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"}

    def isnum(w):
        return disp(w["word"]).lower().strip(".,") in NUMW

    phrases, cur = [], []
    for w in words:
        brk = cur and (len(cur) >= a.max_words
                       or w["start"] - cur[-1]["end"] > 0.6
                       or cur[-1]["word"].rstrip().endswith((".", "!", "?"))
                       or w.get("scene") != cur[-1].get("scene")    # never span a scene cut
                       or isnum(w) or isnum(cur[-1]))                # a step number gets its own caption
        if brk:
            phrases.append(cur); cur = []
        cur.append(w)
    if cur:
        phrases.append(cur)

    # A phrase delivered too fast (e.g. a quickly-spoken step number) flashes on screen like a glitch.
    # Merge it FORWARD into the next same-scene phrase so the TEXT stays put and only the gold karaoke
    # highlight moves across it -- readable, no flicker, still in sync with the audio.
    i = 0
    while i < len(phrases) - 1:
        ph = phrases[i]
        if (ph[-1]["end"] - ph[0]["start"] < a.min_dur
                and ph[-1].get("scene") == phrases[i + 1][0].get("scene")):
            phrases[i + 1] = ph + phrases[i + 1]
            phrases.pop(i)
        else:
            i += 1

    fs = int(a.height * 0.040)
    ol = max(2, int(fs * 0.14)); sh = max(1, int(fs * 0.05))
    ml = int(a.width * 0.10); mv = int(a.height * a.vpos)
    out = [HEADER.format(w=a.width, h=a.height, font=a.font, fs=fs, color=base, ol=ol, sh=sh, ml=ml, mv=mv)]

    events = [(ph, i, w) for ph in phrases for i, w in enumerate(ph)]
    for k, (ph, i, w) in enumerate(events):
        toks = []
        for j, ww in enumerate(ph):
            c = esc(disp(ww["word"]))
            toks.append("{\\c" + hi + "}" + c + "{\\c" + base + "}" if j == i else c)
        start = w["start"]
        nxt = events[k + 1] if k + 1 < len(events) else None
        if nxt and nxt[2].get("scene") == w.get("scene"):
            end = nxt[2]["start"]                          # continuous within a scene: no flicker
        else:
            end = w["end"] + 0.12                          # last word of a scene: clear at the cut, don't bleed onto next
            if nxt:
                end = min(end, nxt[2]["start"])            # never overlap the next caption
        if end <= start:
            continue                                       # coincident/zero-width token -> skip (no stacked duplicate)
        out.append(f"Dialogue: 0,{t(start)},{t(end)},Cap,,0,0,0,,{' '.join(toks)}")

    open(a.out, "w", encoding="utf-8").write("\n".join(out) + "\n")
    print(f"wrote {a.out}: {len(phrases)} phrases, {len(events)} word-events @ {a.width}x{a.height}, "
          f"font={a.font}, vpos={a.vpos}")


if __name__ == "__main__":
    main()
