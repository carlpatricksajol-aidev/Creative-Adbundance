# FINAL workflow — convert to KIE.ai (remove / keep / add)

Goal: product-faithful 15s video, fully headless, cheapest reliable path (KIE Seedance 2.0 mini, ~$1.54/clip). Start from the direct-API workflow ("My workflow 28"). Two credentials needed in n8n (Header Auth): OpenRouter (`Authorization: Bearer sk-or-...`) and KIE (`Authorization: Bearer <KIE_KEY>`). The image host reuses MaxFusion's free S3 upload (no new storage needed) — MaxFusion is used ONLY to host the image, not to generate.

Final node order:
Webhook → Register image (MF /files) → Decode image → Upload to S3 → Content Analyzer → Assistant → Parse scenes → Video (KIE) → Wait → Poll (KIE) → IF success → Extract URL → Respond.

---

## KEEP (already correct, no change)
- **Webhook** — path `creativeos`, Respond = "Using Respond to Webhook node".
- **Content Analyzer** (OpenRouter) — image master prompt, reads `body.product_images_base64[0]`.
- **Assistant** (OpenRouter) — re-paste latest `Assistant - JSON body.txt` (has concept rules + `@Image1`).
- **Parse scenes** (Code) — strips ```json fences, `$input.first()`, outputs one item per scene.
- **Wait** — 15s.

## REMOVE
- **Video generation (MaxFusion `POST /videos`)** — delete. (MaxFusion ignores the product image.)
- **Poll MaxFusion `/jobs/{id}`** node — delete.
- **run-bulk / get-flow / patch-flow / list-node-ids** nodes if any remain from the flow experiment — delete all. We do not touch flows.

## ADD (image hosting — 3 nodes, right after Webhook, before Content Analyzer)

**A1. "Register image" — HTTP Request**
```
POST https://api.maxfusion.ai/api/v1/files
Auth: Header Auth (maxfusion) — Authorization: Bearer <mfsk_...>
Body (JSON):
={
  "purpose": "image_reference",
  "filename": "image_{{ Date.now() }}.jpg",
  "content_type": "image/jpeg",
  "size_bytes": {{ Math.floor($json.body.product_images_base64[0].split(',')[1].length * 3 / 4) }}
}
```

**A2. "Decode image" — Code** (turns base64 into real bytes for S3)
```js
const dataUrl = $('Webhook').first().json.body.product_images_base64[0];
const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');
const reg = $input.first().json;
const bin = await this.helpers.prepareBinaryData(buffer, reg.filename, 'image/jpeg');
return [{ json: reg, binary: { file: bin } }];
```

**A3. "Upload to S3" — HTTP Request**
```
POST {{ $json.upload.url }}
Body: multipart-form-data
  Content-Type      = {{ $json.upload.fields['Content-Type'] }}
  key               = {{ $json.upload.fields.key }}
  x-amz-algorithm   = {{ $json.upload.fields['x-amz-algorithm'] }}
  x-amz-credential  = {{ $json.upload.fields['x-amz-credential'] }}
  x-amz-date        = {{ $json.upload.fields['x-amz-date'] }}
  policy            = {{ $json.upload.fields.policy }}
  x-amz-signature   = {{ $json.upload.fields['x-amz-signature'] }}
  file              = (type: n8n Binary File; Input Data Field Name: file)   ← MUST be last
```
Public URL afterward: `https://maxfusion.s3.eu-west-3.amazonaws.com/{{ $('Register image').item.json.filename }}`

(These 3 are the exact nodes already fixed and proven in the teammate's flow — valid JPEG confirmed at the S3 URL.)

## ADD (generation — replaces the deleted MaxFusion video nodes)

**V1. "Video (KIE)" — HTTP Request**
```
POST https://api.kie.ai/api/v1/jobs/createTask
Auth: Header Auth (kie) — Authorization: Bearer <KIE_KEY>
Body (JSON):
={
  "model": "bytedance/seedance-2-mini",
  "input": {
    "prompt": {{ JSON.stringify($json.prompt) }},
    "reference_image_urls": ["https://maxfusion.s3.eu-west-3.amazonaws.com/{{ $('Register image').item.json.filename }}"],
    "duration": {{ $json.duration }},
    "resolution": "720p",
    "aspect_ratio": "9:16",
    "generate_audio": true
  }
}
```

**V2. "Poll (KIE)" — HTTP Request** (after the existing Wait node)
```
GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId={{ $('Video (KIE)').item.json.data.taskId }}
Auth: Header Auth (kie)
```

**V3. "IF success" — IF node**
- Condition: `{{ $json.data.state }}` equals `success`
- true  → Extract URL (V4)
- false → **second condition** `{{ $json.data.state }}` equals `fail` → Respond-fail; else → back to **Wait** (loop)

**V4. "Extract URL" — Code**
```js
const d = $input.first().json.data;
const r = JSON.parse(d.resultJson);   // resultJson is a JSON string
return [{ json: { url: r.resultUrls[0] } }];
```

**V5. "Respond" — Respond to Webhook** (Respond With: JSON)
```
={{ JSON.stringify({ videos: [ $json.url ] }) }}
```

---

## Wiring summary
Webhook → Register image → Decode image → Upload to S3 → Content Analyzer → Assistant → Parse scenes → Video (KIE) → Wait → Poll (KIE) → IF success → (true) Extract URL → Respond ; (false/loop) → Wait ; (fail) → Respond-fail.

## Values that differ from other providers (do not mix up)
- KIE body is nested `model` + `input`; `duration` is an INTEGER; `aspect_ratio` uses colons `"9:16"`; references = `reference_image_urls`; result is a JSON **string** to parse.
- Model swap for quality/cost is one field: `bytedance/seedance-2-mini` ($1.54) → `-fast` ($2.48) → `bytedance/seedance-2` + `"resolution":"1080p"` ($7.65) for final winners.

## Safety
- Wire the `fail` branch + one retry (KIE ~6% failure). Keep fal.ai as fallback (see "Video via fal.ai - node setup.md") — same shape, 5-min swap.
- Rotate the mfsk + OpenRouter keys (pasted in chat this week). Keys live only in n8n credentials.
