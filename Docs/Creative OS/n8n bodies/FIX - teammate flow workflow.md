# Fixing the MaxFusion flow-based workflow (n8n)

The workflow was failing for 5 reasons (all verified against the live API). Apply these in order. Node names below match the exported `maxfusion.json`.

Current site payload is **flat v3**: `body.product_name`, `body.website`, `body.target_audience`, `body.concept_label`, `body.product_images_base64` (array of data-URL strings). The old workflow assumed a **nested** shape (`body.brand.website`, `body.product.images_base64`, `body.ad_setup.target_audience`) — that's why `size_bytes` is `undefined`.

---

## Fix 1 — "Generate file url" (POST /files): correct the schema path

Replace the JSON body with:

```
={
  "purpose": "image_reference",
  "filename": "image_{{ Date.now() }}.jpg",
  "content_type": "image/jpeg",
  "size_bytes": {{ Math.floor($json.body.product_images_base64[0].split(',')[1].length * 3 / 4) }}
}
```

Only change vs. now: `product.images_base64` → `product_images_base64`. `size_bytes` will resolve to a real number.

---

## Fix 2 — THE BIG ONE: upload real image bytes, not the base64 text

**Root cause of "Every item failed to analyze".** The S3-upload node was sending the base64 *string* as the file, so MaxFusion stored a text file, not a JPEG. Insert a **Code node** named **"decode image"** between "Generate file url" and the S3 upload:

```js
// Decode the webhook's base64 data-URL into real binary bytes for the S3 upload
const dataUrl = $('Webhook').first().json.body.product_images_base64[0];
const b64 = dataUrl.split(',')[1];
const buffer = Buffer.from(b64, 'base64');
const reg = $input.first().json;            // POST /files response (file_id, filename, upload{...})
const bin = await this.helpers.prepareBinaryData(buffer, reg.filename, 'image/jpeg');
return [{ json: reg, binary: { file: bin } }];
```

Then in the **S3 upload node** ("Generate file url1"):
- Body Content Type: **Form-Data / multipart-form-data**
- Keep the 7 presigned fields as **text** parameters, each value `={{ $json.upload.fields['<name>'] }}` (Content-Type, key, x-amz-algorithm, x-amz-credential, x-amz-date, policy, x-amz-signature) — same as now.
- **Delete** the current `file` text parameter. Add a new parameter named `file`, set its type to **n8n Binary File** (parameterType: formBinaryData), and set **Input Data Field Name** = `file`.
- The `file` parameter MUST be the **last** field in the list (S3 requires it after the policy fields).

This uploads the actual JPEG bytes. (Verified: doing this yields a valid `ffd8ff` JPEG at the S3 URL that the analyzer can read.)

---

## Fix 3 — "generate updated json": correct schema + build the image URL

`POST /files` has **no top-level `url`** — the old `imageUrl = ...json.url` was undefined. Build it from `filename`. Replace the Code node with:

```js
const flow = JSON.parse(JSON.stringify($input.first().json.canvas_data));
const body = $('Webhook').first().json.body;
const reg  = $('Generate file url').first().json;

const imageFilename = reg.filename;
const imageUrl = 'https://maxfusion.s3.eu-west-3.amazonaws.com/' + reg.filename;
const website  = body.website;
const audience = body.target_audience || 'derive from the website';

for (const node of flow.nodes) {
  const label = node.data?.label;
  if (node.type === 'imageInput') {
    node.data.imageFilename = imageFilename;
    node.data.imageUrl = imageUrl;
  }
  if (node.type === 'textPrompt') {
    if (label === 'Prompt #40') node.data.promptText = website;   // Website input
    if (label === 'Prompt #41') node.data.promptText = audience;  // Audience input
  }
}
return [{ json: { canvas_data: flow } }];
```

(Match `imageInput` by **type**, not by `node.name` — the old code matched `node.name === "Product Image"`, which doesn't exist on these nodes.)

Then in **"update the flow with new data"** (PATCH) set the JSON body to:

```
={{ JSON.stringify({ canvas_data: $json.canvas_data }) }}
```

---

## Fix 4 — add the poll-and-return path (why nothing ever came back)

After "run all nodes", the workflow stopped. It must poll the flow until the video is done, then respond. Add these nodes after "run all nodes":

**A) Wait** node — 15 seconds.

**B) HTTP Request** "poll flow" — GET `https://api.maxfusion.ai/api/v1/flows/3ac63597-bcef-48d7-8f52-ccfd4c1de9dd`, Bearer auth (maxfusion credential).

**C) Code** node "check video":

```js
const d = $input.first().json;
const rs = d.runtime_state || {};
const nodes = d.canvas_data.nodes;
const vg = nodes.find(n => n.data?.label === 'Video Generator #25');
const status = vg ? (rs.node_statuses || {})[vg.id] : null;
const out = vg ? (rs.node_outputs || {})[vg.id] : null;
const url = Array.isArray(out) && out[0] && out[0].url ? out[0].url : null;
return [{ json: { status, url, done: !!url, failed: status === 'error' && !url } }];
```

**D) IF** node — condition `{{ $json.done }}` is `true`:
- **true**  → **Respond to Webhook**
- **false** → back to the **Wait** node (loop). (Optionally add a branch on `{{ $json.failed }}` to respond with a friendly failure message instead of looping forever.)

**E) Respond to Webhook** — Respond With: **JSON**, body:

```
={{ JSON.stringify({ videos: [ $json.url ] }) }}
```

**F) Webhook node** → Settings → **Respond**: *Using 'Respond to Webhook' node* (so the site receives the video instead of an instant empty ack). The website already renders any video URLs in the response.

---

## Fix 5 — clear the stuck flow before the first good run

The flow is currently wedged: its Content Analyzer errored on the old corrupt image and the downstream nodes are stuck `in-queue`, which can block a fresh `run-bulk` from starting. Before testing, open the flow in the MaxFusion app once and let it settle / re-run it there, or duplicate it fresh. After that, the n8n run should drive it cleanly.

---

## Important caveat about the flow approach

Verified: `POST /flows/{id}/run-bulk` enqueues, and MaxFusion's analyzer **did** execute from an API-triggered run (it errored on the bad image, proving execution happens). But a re-run against the already-wedged flow did **not** advance for 10+ minutes. If, after Fix 5, the flow still won't progress headlessly, fall back to the **direct-API pipeline** (`POST /files` → `POST /videos` → poll `GET /jobs/{id}`), which is proven to run fully headless with no browser open — that path generated a real 15-second video end to end. The flow's tuned prompts can still be reused by reading them via `GET /flows/{id}`.
