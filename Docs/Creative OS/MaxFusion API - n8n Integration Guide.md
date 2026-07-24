# MaxFusion API — n8n Integration Guide

Reverse-engineered and live-verified on July 4, 2026 (MaxFusion has no public docs; every endpoint below was tested against the real API with the org key and works). Backend is FastAPI.

## Basics

- **Base URL:** `https://api.maxfusion.ai/api/v1`
- **Auth:** `Authorization: Bearer mfsk_...` header on every request
  (in n8n: create a **Header Auth** credential, name `Authorization`, value `Bearer mfsk_...` — do not hardcode the key in nodes)
- All generation is **async**: POST returns a `job_id` + `polling_url`, you poll `GET /jobs/{job_id}` until `status` is `succeeded` or `failed`.
- Verify the key works:

```bash
curl https://api.maxfusion.ai/api/v1/me \
  -H "Authorization: Bearer $MAXFUSION_KEY"
# -> {"organization_id": "...", "user_id": "..."}
```

## Endpoints

### 1. List flows (read-only)

```bash
curl https://api.maxfusion.ai/api/v1/flows -H "Authorization: Bearer $KEY"
curl https://api.maxfusion.ai/api/v1/flows/{flow_id} -H "Authorization: Bearer $KEY"
```

Returns every flow with its **full canvas_data** — all nodes, master prompts, model choices, and wiring. Key flows in the account:

| Flow | ID |
|---|---|
| AdBundance — Analyzer (utility) | `9f249b66-98de-4610-a264-e6255f1c81c9` |
| Statics flow | `88f054fa-9378-46a3-901d-704c786b4825` |
| ugc 15 seconds | `f835160a-9267-4e25-8e34-f055d3074f5b` |
| Claude Test | `cfc90c1f-80f5-4012-abe1-69e70121fbd5` |

**Full flow CRUD is available** (verified Jul 4, 2026):
- `POST /flows` — create a flow (returns id + empty canvas + runtime_state)
- `PATCH /flows/{id}` — update name / canvas_data
- `DELETE /flows/{id}` — delete (204)
- `GET /flows/{id}` — returns canvas_data AND **runtime_state**: `node_statuses` (done/error), `node_outputs` (includes the S3 .mp4/.png URLs of every generated result), `node_errors`, `node_costs`, `node_finished_at`, `last_run_at`. The "ugc 15 seconds" flow had 83 finished video URLs readable this way.

**Run endpoint found: `POST /flows/{id}/run-bulk`** — body `{"node_ids": [...], "project_id": "..."}`. Returns `{flow_id, status:"queued", node_ids, poll_url}`. HOWEVER (verified Jul 4, 2026): calling run-bulk headlessly returned `queued` but the flow's `last_run_at` did NOT advance and nodes stayed `in-queue` for 10+ minutes with no processing. The flow engine appears to be **client-driven — the queue only processes while the MaxFusion app is open in a browser**. By contrast the direct `POST /images` and `POST /videos` endpoints DO execute fully headless (proven repeatedly). So for automated/headless use, use the direct generation endpoints, NOT flow run-bulk.

**The other run-flow verbs still 404** (`/run`, `/runs`, `/execute`, `/start`, `/trigger`, `/enqueue`). Two viable architectures:
1. **Fully automatic (what we built):** n8n orchestrates analyzer + assistant via Claude/OpenRouter and calls `POST /videos` / `POST /images` directly. Same models, same account billing as the canvas.
2. **Human-QA hybrid:** n8n *creates* a pre-wired flow per submission (`POST /flows` with canvas_data: image input, prompts from the webhook, assistant + generator nodes), a designer opens MaxFusion, reviews, and presses Run; n8n then polls `GET /flows/{id}` runtime_state until node_statuses are `done` and pulls the output URLs to deliver. Turnaround depends on the human, so the website should say "we'll send it over" rather than wait.

### 2. List models

```bash
curl https://api.maxfusion.ai/api/v1/models/images -H "Authorization: Bearer $KEY"
curl https://api.maxfusion.ai/api/v1/models/videos -H "Authorization: Bearer $KEY"
```

Image models: `gpt-image-2` (quality low/medium/high, up to 16 reference images), `nanobanana-2` (10 refs, most aspect ratios), `nanobanana-pro`.
Video models: `sora-2-pro` (4-20s, 9:16/16:9, "ingredients" mode, 1 ref image), `veo-3.1` (4/6/8s, "frames" or "ingredients" modes, 3 ref images, 720p/1080p), `kling-2.6`, and more. Each model entry lists its allowed `aspect_ratios`, `durations_seconds`, `resolutions`, and `modes` — read these instead of guessing.

Aspect ratios use underscores: `9_16`, `1_1`, `16_9`, `4_5`, etc.

### 3. Upload a product image (two steps)

**Step A — register the file:**

```bash
curl -X POST https://api.maxfusion.ai/api/v1/files \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"filename":"product.jpg","content_type":"image/jpeg","size_bytes":123456,"purpose":"image_reference"}'
```

`purpose` must be one of: `image_reference`, `video_reference`, `audio_reference`, `document_reference`.

Response: `{"file_id": "...", "upload": {"url": "https://maxfusion.s3-accelerate.amazonaws.com/", "fields": {...}, "expires_at": "..."}}`

**Step B — upload the bytes to S3** as a `multipart/form-data` POST: every key in `upload.fields` becomes a form field, plus the file itself as the `file` field (must be last). In n8n: HTTP Request node, POST, Body = Form-Data, map the fields, attach the binary. Max size 25 MB (from the presigned policy).

Keep the `file_id` — that's what you pass as a reference.

### 4. Generate an image

```bash
curl -X POST https://api.maxfusion.ai/api/v1/images \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{
    "model": "nanobanana-2",
    "prompt": "Static ad prompt here...",
    "aspect_ratio": "9_16",
    "references": ["<file_id from step 3>"]
  }'
# -> {"job_id":"...","status":"queued","polling_url":"/api/v1/jobs/..."}
```

Fields: `model` (required), `prompt` (required), `aspect_ratio`, `quality` (`low`/`medium`/`high`, gpt-image-2 only), `references` (list of file UUIDs). This endpoint validates strictly — unknown fields are rejected, which is good.

### 5. Generate a video

```bash
curl -X POST https://api.maxfusion.ai/api/v1/videos \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{
    "video_model": "veo-3.1",
    "prompt": "SCENE 1 prompt from the UGC assistant...",
    "duration": 8,
    "aspect_ratio": "9_16",
    "resolution": "1080p",
    "references": ["<file_id>"]
  }'
```

Required: `video_model`, `prompt`, `duration` (integer seconds — must be in the model's `durations_seconds`), `aspect_ratio`. Optional: `resolution` (string).

**VERIFIED LIMITATION (Jul 4, 2026):** the public `/videos` endpoint currently accepts **only those five fields** and silently ignores everything else. Tested empirically: `start_frame`, `references`, `mode`, and `generate_audio` were all dropped without error — a Seedance 2.0 job given a start-frame image produced a video whose first frame did NOT match the reference (similar composition from the prompt, different object), and `generate_audio:false` still produced an audio track. So **product-reference / start-frame video generation is not yet exposed on the public API**, even though `GET /models/videos` advertises the modes (`frames`, `ingredients`) that the in-app Flows canvas uses.

What this means:
- **Statics pipeline: fully API-ready today** — `/images` DOES honor `references` (UUID-validated), so product-faithful static ads work end to end.
- **Video pipeline: prompt-only video works today**; product-in-scene video needs the reference inputs the app has but the API doesn't. Two ways to unlock it:
  1. **Capture the app's own request** (fastest): open the Flows canvas, run one Video Generator node that has a reference attached, then in browser DevTools → Network tab right-click the request → Copy as cURL and check whether that endpoint/payload accepts the `mfsk_` Bearer key. If it does, we wire that exact shape into n8n.
  2. **Ask MaxFusion support** whether reference inputs on `POST /api/v1/videos` are on their API roadmap (the models catalog already advertises the modes, so it's likely coming).

### 6. Poll the job

```bash
curl https://api.maxfusion.ai/api/v1/jobs/{job_id} -H "Authorization: Bearer $KEY"
```

States: `queued` → `running` → `succeeded` | `failed`.
On success, image jobs put results in `result.images[]`, video jobs in `result.video` (a **singular object**, verified Jul 9, 2026) — each `{id, status:"ready", url, preview_url}` with direct S3 links (`maxfusion.s3.eu-west-3.amazonaws.com`). Image generation took ~22s in testing; 15s Seedance 2.0 videos took 5–7 min. On failure, `error.code`/`error.message` explain why. Jobs cannot be cancelled (no DELETE, no /cancel).

**Content moderation (verified Jul 9, 2026):** video jobs can fail AFTER fully rendering with `GENERATION_FAILED` / `content_policy_violation` / "Output video has sensitive content" (`partner_validation_failed`) — an output-level filter at the upstream provider, not a prompt check. Borderline subjects (e.g. child-like characters in combat) fail most of the time and identical resubmits mostly fail again, so n8n flows need a retry budget + a rewording fallback, and should treat this error code as non-transient after ~2 tries.

## n8n workflow blueprint (Creative OS)

```
Webhook (from the Creative OS site)
  → Code: decode product_images_base64[0] to binary
  → HTTP: POST /files (register)          → keep file_id
  → HTTP: POST upload.url (S3 form-data upload)
  → Anthropic/Claude: content analyzer + UGC prompt assistant
      (master prompts from MaxFusion Workflow.md, or fetch live
       from GET /flows/9f249b66-... to stay in sync with the app)
  → HTTP: POST /images or /videos (one call per scene/variant)
  → Loop: Wait 10s → GET /jobs/{job_id} → IF status != succeeded, loop
      (cap at ~30 tries; video jobs take minutes)
  → Aggregate result URLs
  → Respond to Webhook: {"images":[urls]} or {"videos":[urls]}
```

The Creative OS site already renders any image/video URLs found anywhere in the webhook response, so the final "Respond to Webhook" node just needs the S3 URLs in its JSON.

## Security notes

- The `mfsk_` key is org-wide — keep it only in n8n's credential store, never in the website frontend (the site talks to n8n, n8n talks to MaxFusion).
- The key was shared in a chat session while building this; rotating it in the MaxFusion dashboard afterwards is cheap insurance.
- Generation costs tokens per call — put the n8n IF-node guard on `source == "creative-os-intake-v3"` so random webhook hits can't trigger paid generations.
