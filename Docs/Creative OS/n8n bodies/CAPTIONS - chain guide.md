# Caption chain — what it is and how to run it

Added 2026-07-05 to `Creative OS - KIE workflow.json`. The workflow is now 34 nodes; everything from **Download video** to **Cleanup** is the caption chain, wired between **Extract URL** and **Respond (success)**.

## What happens per ad

```
Extract URL (KIE video URL + storyboard)
  -> Download video          (fetch the finished ad)
  -> Write video             (VPS: /home/node/.n8n/tmp/<execid>.mp4)
  -> Extract audio           (ffmpeg -> 16kHz mono flac, tiny upload)
  -> Read audio -> Transcribe (Groq)   (whisper-large-v3-turbo, WORD timestamps)
  -> Prep frames -> Extract frames     (1 jpeg per storyboard scene, at its midpoint)
  -> Read frames -> Build vision request -> Vision placement
       (Claude looks at the frames: per-scene caption zone lower/center/upper
        + up to 4 emphasis words. If this fails, defaults kick in - never fatal)
  -> Build ASS               (aligns whisper timing to the CAPTION SCRIPT: on-screen
                              text uses the REAL spelling "GIR" even though the VO
                              said "gear"; karaoke word-pop purple #6B48FF, emphasis
                              teal #00E5CC, Montserrat ExtraBold 64, ALL CAPS,
                              no captions after VO_ENDS_AT - the outro stays clean)
  -> Write ASS -> Burn captions        (ffmpeg ass filter + fontsdir, x264 crf18)
  -> Read captioned -> Stat captioned -> Register captioned -> Attach binary -> Upload captioned
       (host the finished file on MaxFusion S3, same pattern as the product image)
  -> Cleanup                 (rm all tmp files for this execution; non-fatal)
  -> Respond (success)       { videos:[captioned S3 url], videos_raw:[KIE url], storyboard }
```

The website needs no changes: it plays `videos[0]` (now the captioned file) and still shows the storyboard card. `videos_raw` keeps the clean no-caption master for re-edits.

## Import + keys (5 minutes)

1. n8n -> Workflows -> **Import from File** -> `Creative OS - KIE workflow.json`.
2. Fill the placeholder headers (same three places as before, now +1):
   - **Content Analyzer**, **Assistant (scene prompts)**, **Vision placement**: `Authorization: Bearer <OpenRouter key>`
   - **Register image**, **Register captioned**: `Authorization: Bearer <mfsk_ MaxFusion key>`
   - **Video (KIE)**, **Poll (KIE)**: `Authorization: Bearer <KIE key>`
3. **Transcribe (Groq)** should show the `groq` credential automatically (matched by name). If it's red, open the node and pick `groq` in the credential dropdown.
4. Webhook path is `creativeos` - deactivate the OLD workflow first so the path doesn't collide, then activate this one.

## Test checklist (first run)

Submit a real product through the site, then in the execution view check:
- **Transcribe (Groq)** output has a `words` array with `start`/`end` numbers
- **Vision placement** output is JSON with `zones` + `emphasis` (if it errored, the run continues with lower-zone defaults - fine)
- **Burn captions** finishes without stderr about fonts (if you see "fontselect" warnings, the fontsdir path is wrong)
- Final video: captions pop word-by-word, brand name spelled correctly, NO captions in the last ~1.5s
- `docker exec -u node n8n-i3t9-n8n-1 ls /home/node/.n8n/tmp` afterwards -> should be empty (Cleanup worked)

## Behavior notes

- **Vision placement is deliberately non-fatal** (`onError: continue`): a broken vision reply degrades to bottom-position captions with number-based emphasis, never a failed ad.
- **Transcribe + Download retry once** automatically on transient errors.
- Registering the .mp4 uses `purpose: "image_reference"` - that's the value we've verified MaxFusion accepts for presigned uploads; S3 stores the mp4 fine (content_type is video/mp4 throughout).
- Cost per ad added by this chain: ~$0.0002 (whisper) + ~$0.01 (one vision call) + a few seconds of VPS CPU.
- Style constants live in the **Build ASS** node: font size 64, purple `&HFF486B&` (BGR of #6B48FF), teal `&HCCE500&` (#00E5CC), zones lower/center/upper = MarginV 400/560/840 at 720x1280. Tweak there if Eric wants a different look.
