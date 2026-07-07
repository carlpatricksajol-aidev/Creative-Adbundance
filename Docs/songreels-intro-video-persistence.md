# SongReels — keep the personal video message alive (n8n)

The note step now lets the sender **record or upload a personal video message**
("hi mom, I made this for you"). It plays on the recipient's gift page in a
"A message from …" card, from `form_data.intro_video_url`.

## The problem (must fix before relying on this feature)

The message is uploaded through the **same `get-upload-url` webhook** as the
clips, so by default it lands in the **source bucket** — the one the
**"Delete Source Uploads"** step wipes after a reel finishes. If nothing
changes, the message works during creation but **404s on the gift page** once
generation completes.

## What the site already does

`uploadClip` now sends a **`kind`** field in the sign request body so n8n can
tell the intro apart from a normal clip:

```json
{ "filename": "message.webm", "content_type": "video/webm",
  "job_id": "<tempId>", "kind": "intro" }     // clips send "kind": "clip"
```

So all n8n needs to do is treat `kind === "intro"` specially.

## Fix (pick one — A recommended)

### A. Route the intro into the permanent/public bucket (cleanest)

In the **`get-upload-url`** webhook (the node that builds the Supabase signed
upload URL), branch on `kind`:

- `kind === "intro"` → sign the upload into the **same durable, public bucket
  that `final_video_url` uses** (e.g. `final-reels`, or a dedicated
  `gift-extras` bucket), with a path like `intro/<job_id>-<filename>`.
- anything else → the existing **source** bucket, unchanged.

Return `public_url` as today. Because the intro now lives in a bucket the
cleanup step never touches, it persists for the life of the gift. No change to
"Delete Source Uploads" needed.

```js
// inside get-upload-url, after reading body.kind / body.filename / body.job_id
const isIntro = body.kind === 'intro';
const bucket  = isIntro ? 'final-reels' : 'heartreel-videos';   // use your real names
const path    = isIntro ? `intro/${body.job_id}-${body.filename}` : body.filename;
// ...sign `${bucket}/${path}` exactly as the node already signs the source upload,
//    and return { signed_url, public_url } for that bucket/path.
```

### B. Exclude the intro from cleanup (only if you can't change the bucket)

Keep the intro in the source bucket, but make **"Delete Source Uploads"** skip
it. The intro is **not** in `video_clips` (it's only in
`form_data.intro_video_url`), so:

- If that step deletes **only the `video_clips` URLs**, you're already safe —
  nothing to do.
- If it deletes the **whole job folder**, add a guard so it never deletes the
  file whose URL equals `form_data.intro_video_url`.

## Verify

1. Create a reel with a recorded/uploaded message.
2. Let it finish (cleanup runs).
3. Open the gift link — the "A message from …" card should still play. If it's
   blank/404, the intro is still being deleted (revisit A/B).

## Note
The message is stored and shown **as-is** — it is not part of the generated
reel and does not go through Gemini/Claude/Suno/Creatomate. It's purely a
recipient-facing keepsake on the gift page.
