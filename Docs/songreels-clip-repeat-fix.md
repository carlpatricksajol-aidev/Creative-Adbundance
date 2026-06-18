# SongReels — Clip-Repeat Fix (v5.5)

**Issue (tester feedback):** with ~30 clips uploaded, the finished reel replays the
same clip several times ("the car clip again and again") instead of showing each
clip once across the song.

## Root cause (one node)

It is **not** the song length or Suno — the reel already follows the Suno song
length, and clip order already comes from the lyrics (Claude's `CLIP_ORDER`). The
repeat is a missing de-dupe in the final assembly node:

- **Align Clips to Sections (v8.4)** matches every *sung* line to a written line.
  Songs repeat sections (choruses, repeated hooks), so the same `{N}` moment line is
  matched by several non-adjacent sung lines → the same clip index legitimately lands
  in `aligned_clip_sequence` multiple times.
- **Creatomate body builder (v5.4)** de-duplicates the chorus/montage slots but the
  *anchored* branch pushed `s.clip_index` with **no "have I shown this already?"
  check** → it faithfully replayed that clip every time. That is the bug.

Verified by simulation (30 clips, chorus re-referencing one clip): v5.4 placed that
clip **5×**; v5.5 places **all clips once, 0 repeats**.

## The fix — `creatomate-body-builder-v5.5.js`

One behavioral change from v5.4: **a clip is spent the first time it appears.** A
later anchored line pointing at an already-shown clip falls through to the unused-clip
pool (the same path the chorus/theme slots already use). Result:

- clip order still follows the lyrics (first occurrences keep their sync)
- choruses / repeats fill with not-yet-seen clips ("moments"), never a replay
- no clip is ever on screen twice
- when the pool is genuinely empty, the reel closes on the hero shot (unchanged)
- added `pickAnyUnused()` so a reserved clip whose verse got trimmed is still
  available to fill a slot before the reel gives up

Nothing else changed: crossfades, cold-open over the intro, Ken Burns on photos,
fade-to-black ending, audio handling, and the footage fallback are all identical.

## Deploy (1 node, ~1 minute)

1. n8n → workflow **"Heartreel - Form Execution"** → open the **Creatomate body
   builder** node.
2. Replace the *entire* node code with the contents of
   `Docs/creatomate-body-builder-v5.5.js`. Save.
3. No other node changes. Align v8.4 stays as-is (it may still emit repeated anchors —
   v5.5 now absorbs them).

## Verify

- Run a job with 15-30 clips. In the body builder output, check
  `timeline_mode: "footage_capped_v5.5_dedupe"` and `distinct_clips_shown` ≈ the number
  of clips that fit the song (it should equal the number of placed visual elements —
  i.e. no repeats).
- Watch the reel: each clip appears once; choruses show different footage each pass.

## If you want to go further (optional, not in this patch)

The owner's "treat the car as a moment, not pinned to the exact word" idea can be taken
all the way: ignore per-line anchoring entirely and spread all clips evenly across the
Suno song in story order. That is a larger rewrite (new primary path) and trades away
the verse-level lyric sync. v5.5 keeps that sync for first occurrences and only drops
the *repeats*, which is the reported problem — recommended to ship v5.5 first and judge
from a real reel before considering the bigger change.
