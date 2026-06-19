# SongReels — content-aware clip length + Step 2 "story brief"

Supersedes the fixed-5s model (`songreels-5s-clip-model.md`). Per Eric's feedback
(2026-06-19 call):

- **No fixed 5s per clip.** The AI decides how much of each clip to use *based on its
  content* — the whole clip if it's all good, or just the best window if only part is.
- **Step 2 is a free-text story brief**, not relationship/describe/feel chips.
- Reel still capped at **3:00**; the footer now shows REAL uploaded footage, not clips×5.

## Website (done, live — commit b41ff94)

- Step 2 = **name + "What's this about?" brief + optional "anything specific to include"**.
  `readAboutFields` writes `f-about` and `f-include`, and mirrors them to `f-love` /
  `f-memory` so the song pipeline keeps working before the prompt edit below.
- Clips footer shows uploaded footage + "we feature the best moments of each (final reel up
  to 3:00)"; Continue unlocks at 30s of footage. `submitJob` sends
  `song_length_mins = min(180, uploadedFootage)/60` as an upper bound.

## n8n edits

### 1) Gemini - Analyze Clips — content-aware window (was fixed 5s / 6–8s)

In the **Gemini - Analyze Clips** prompt, replace the VIDEOS highlight instruction with:

> VIDEOS: decide how much of the clip to use BASED ON ITS CONTENT, and return a highlight
> window (highlight_start/highlight_end = seconds INTO the clip). If the whole clip is worth
> showing, return the whole clip (cap the window at 20 seconds). If only part is the
> highlight, return just that window. There is no fixed length — a quiet 4-second beat and a
> 16-second bit of action are both fine. Prefer the single best continuous moment; never
> exceed 20 seconds for one clip. PHOTOS: highlight_start = 0, highlight_end = the photo's
> duration.

(Everything else in that node stays — it already returns highlight_start/highlight_end,
hero, dup_group, icons, availability.)

### 2) Build Claude Prompt — size the song to the HIGHLIGHT sum (not full footage)

Today the node sizes the song from full clip durations. With content-aware windows it should
size from the **sum of the chosen highlight windows**, so the song length matches what will
actually be on screen. Change the `footageSecs` line from summing `vc.duration` to summing
the Gemini windows:

```js
// was: const footageSecs = (videoClips||[]).reduce((s,vc)=> s + (vc.duration || (vc.type==='image'?5:10)), 0) || (songLengthMins*60);
const footageSecs = (geminiClips||[]).reduce((s,g)=>{
  const w = (g.highlight_end ?? 0) - (g.highlight_start ?? 0);
  return s + (w > 0 ? w : 5);            // photos / missing → ~5s
}, 0) || (songLengthMins * 60);
```

`targetSecs = min(footageSecs, tierSecs)` then becomes `min(highlightSum, 180)` — the reel is
sized to the real selected footage, capped at 3:00. No other node changes needed (Align v8.4
and the **v5.5 body builder** — still the one to paste in from
`songreels-clip-repeat-fix.md` — already trim each clip to its highlight window).

### 3) (Optional) Build Claude Prompt — relabel the story context

Works as-is because the site mirrors `f-about → f-love` and `f-include → f-memory`. For
clarity you can read the new fields directly: treat `f-about` as "What this reel is about"
(the thesis for the chorus) and `f-include` as "specific things to make sure we mention",
and drop the now-empty `relation` / describe / `feel` references.

## Net

Paste **(1)** + **(2)** and the reel becomes content-aware: each clip contributes as much as
its content deserves (up to 20s), the song is sized to that sum (≤3:00), no repeats (v5.5),
and the lyrics lean on the free-text brief + the clip captions.
