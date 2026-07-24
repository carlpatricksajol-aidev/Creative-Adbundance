# Product-faithful video via fal.ai Seedance 2.0 (n8n node setup)

Why: MaxFusion's public `/videos` API ignores all image references (verified repeatedly — generated products only lookalike the input). fal.ai runs the SAME Seedance 2.0 model with a reference endpoint that actually receives the product photo. All facts below verified against fal's primary docs + OpenAPI specs on Jul 4, 2026.

**Prerequisite:** a fal.ai account + API key (`FAL_KEY`). Store as an n8n Header Auth credential: name `Authorization`, value `Key <FAL_KEY>` (note: `Key`, NOT `Bearer`).

The product image URL: reuse the one the workflow already uploads —
`https://maxfusion.s3.eu-west-3.amazonaws.com/{{ $('Generate file url').item.json.filename }}`
(any public image URL works; JPEG/PNG/WebP, max 30 MB).

---

## Node 1 — "Video generation (fal)" — replaces the MaxFusion /videos node

```
POST https://queue.fal.run/bytedance/seedance-2.0/reference-to-video
Headers: Authorization: Key <FAL_KEY> · Content-Type: application/json
```

JSON body:
```
={
  "prompt": {{ JSON.stringify($json.prompt) }},
  "image_urls": ["https://maxfusion.s3.eu-west-3.amazonaws.com/{{ $('Generate file url').item.json.filename }}"],
  "duration": "{{ $json.duration }}",
  "aspect_ratio": "9:16",
  "resolution": "1080p",
  "generate_audio": true
}
```

GOTCHAS (fal differs from MaxFusion):
- `duration` is a STRING: `"15"`, not `15` (`"auto"`..`"4"`-`"15"`)
- `aspect_ratio` uses COLONS: `"9:16"`, not `9_16` (enum: auto, 21:9, 16:9, 4:3, 1:1, 3:4, 9:16)
- The parameter is `image_urls` (array, up to 9) — NOT `reference_image_urls`
- The prompt should reference the product as `@Image1` (the Assistant prompt is already updated to write this)
- Response: `{ "request_id": "...", "status_url": "...", "response_url": "..." }`

## Node 2 — Wait 15s (unchanged)

## Node 3 — "Poll fal status"

```
GET https://queue.fal.run/bytedance/seedance-2.0/reference-to-video/requests/{{ $json.request_id }}/status
Header: Authorization: Key <FAL_KEY>
```
Statuses: `IN_QUEUE` → `IN_PROGRESS` → `COMPLETED`. Generations typically finish in under 2 minutes.

## Node 4 — IF `{{ $json.status }}` equals `COMPLETED`
- false → back to Wait
- true → Node 5

## Node 5 — "Get fal result"

```
GET https://queue.fal.run/bytedance/seedance-2.0/reference-to-video/requests/{{ $json.request_id }}
Header: Authorization: Key <FAL_KEY>
```
The finished file is at `{{ $json.video.url }}` → feed into the existing Respond-to-Webhook node as `{"videos": [url]}`.

(Optional zero-polling alternative: append `?fal_webhook=<your n8n webhook url>` to the Node 1 URL and fal POSTs the result when done.)

---

## Cost per 15-second clip (verified from fal token pricing)

| Tier / endpoint | 720p | 1080p |
|---|---|---|
| standard `reference-to-video` | ~$4.54 | ~$10.23 |
| `fast/reference-to-video` | ~$3.63 | n/a (720p cap) |
| `mini/reference-to-video` | ~$2.32 | n/a |

Recommendation: **fast at 720p for testing, standard 720p or 1080p for client deliverables.** Audio generation is free; token formula = (h × w × seconds × 24) / 1024 at $0.014/1k tokens.

## Also re-paste
`Assistant - JSON body.txt` was regenerated: the adaptation block now tells Claude the product is attached as `@Image1` (restoring the designer's original "reference video 1" consistency approach, which finally works again because the model actually receives the image). Concept format rules are still included.
