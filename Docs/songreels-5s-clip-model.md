# SongReels — 5s-per-clip / 3-minute reel model

Decision (owner, 2026-06-19): every clip — a video's best moment or a photo — becomes a
**~5-second** moment. Reel length = `clipCount × 5s`, capped at **3:00**. Upload caps
changed to **20 videos + 20 photos** (separate), replacing the old single 30-file cap.

## Website (done, live — commit cf95558)

- Per-type caps (20 video / 20 photo) enforced in `handleClipAdd`.
- `submitJob` sends `song_length_mins = min(180, clipCount × 5) / 60`.
- Clips meter shows the live reel length toward the 3:00 cap; Continue unlocks at a
  12-clip (~1:00) minimum; copy updated to "each clip plays for 5 seconds."

## n8n — only ONE node needs editing

### Gemini - Analyze Clips  →  make the highlight window 5s (was 6–8s)

In the **Gemini - Analyze Clips** node's prompt text, find:

> VIDEOS: pick the SINGLE best moment and return a SHORT highlight window of 6 to 8
> seconds (highlight_start/highlight_end = seconds INTO that clip). The window length
> MUST be between 6 and 8 seconds. If the clip is shorter than 8 seconds, use the whole clip.

Replace with:

> VIDEOS: pick the SINGLE best moment and return a highlight window of about 5 seconds
> (highlight_start/highlight_end = seconds INTO that clip). The window length MUST be 5
> seconds. If the clip is shorter than 5 seconds, use the whole clip.

That's the only required change.

## Why nothing else needs touching

The song length already flows from the website value:

- **Build Claude Prompt** computes `targetSecs = min(footageSecs, tierSecs)` where
  `tierSecs = song_length_mins × 60`. The website now sends `song_length_mins` =
  `clips × 5 / 60`, so `tierSecs = clips × 5`. Real footage is almost always longer, so
  `targetSecs = clips × 5` — the song is written and sized to exactly that. No edit needed.
- **Suno** is trimmed to the reel length by the body builder (unchanged).
- **No repeats** is handled by the **Creatomate body builder v5.5** patch
  (`Docs/creatomate-body-builder-v5.5.js`) — still the one node to paste in from the
  clip-repeat fix.

Net: deploy **v5.5** (clip-repeat fix) + the **5s Gemini window** above, and the reel is
`clips × 5s`, capped at 3:00, each clip once.

## Optional — exact uniform 5s per clip

With the above, clips average ~5s but the body builder still lyric-times them (a clip can
hold a beat longer until the next lyric). If you want every clip to be *exactly* 5s and
evenly spaced (pure montage, looser word-level sync), that's a larger body-builder rewrite
(even-spread v6.0). Recommend shipping the simple version first and judging from a real reel
before deciding.

## Edge: more than ~36 clips

20 + 20 = 40 possible clips × 5s = 200s, over the 180s cap. The reel stays 3:00 and the
first ~36 moments fill it; a few trailing clips may not appear. The meter warns at the cap
("Maxed the 3:00 reel…"). If you'd rather all 40 always fit, we'd shrink per-clip to
`180 / clipCount` (~4.5s) instead of dropping — say the word.
