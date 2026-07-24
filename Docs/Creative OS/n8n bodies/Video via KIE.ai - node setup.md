# Product-faithful video via KIE.ai Seedance 2.0 (n8n node setup) — PRIMARY PATH

Why KIE: same Seedance 2.0 with reference-image support, ~25-35% cheaper than fal, and the team ALREADY has a KIE account + key (static ads pipeline uses it). Zero new signups — testable today. All facts verified against docs.kie.ai on Jul 4, 2026.

Cost per 15-second clip (1 credit = $0.005; pricing flagged beta by KIE):

| Tier (model id) | 720p | 1080p |
|---|---|---|
| `bytedance/seedance-2-mini` | **~$1.54** ← default | n/a (720p cap) |
| `bytedance/seedance-2-fast` | ~$2.48 | n/a (720p cap) |
| `bytedance/seedance-2` (standard) | ~$3.08 | ~$7.65 (4k also available) |

(fal.ai equivalents: mini $2.32, fast $3.63, standard $4.54 / 1080p $10.23 — keep fal as the fallback provider, see "Video via fal.ai - node setup.md".)

---

## Node 1 — "Video generation (KIE)" — replaces the MaxFusion /videos node

```
POST https://api.kie.ai/api/v1/jobs/createTask
Headers: Authorization: Bearer <KIE_API_KEY> · Content-Type: application/json
```

JSON body:
```
={
  "model": "bytedance/seedance-2-mini",
  "input": {
    "prompt": {{ JSON.stringify($json.prompt) }},
    "reference_image_urls": ["https://maxfusion.s3.eu-west-3.amazonaws.com/{{ $('Generate file url').item.json.filename }}"],
    "duration": {{ $json.duration }},
    "resolution": "720p",
    "aspect_ratio": "9:16",
    "generate_audio": true
  }
}
```

Response: `{ "code": ..., "msg": ..., "data": { "taskId": "..." } }`

GOTCHAS (KIE differs from both MaxFusion and fal):
- Body is nested: `model` + `input` (input fields are snake_case)
- `duration` is an INTEGER 4-15 here (fal wants a string; MaxFusion wanted int — KIE = int)
- `aspect_ratio` uses COLONS: `"9:16"` (enum: 1:1, 4:3, 3:4, 16:9, 9:16, 21:9, adaptive; default 16:9 — do not omit!)
- References: `reference_image_urls` (array, up to 9) = multi-reference "ingredients" mode. `first_frame_url` exists separately if you ever want frame-anchoring.
- Prompt refers to the product as `@Image1` — the Assistant body already writes this (same ByteDance convention as fal)
- Mini docs quirk: the docs' enum says `-fast` but description/example say `-mini`. Send `bytedance/seedance-2-mini`; if the API rejects it, fall back to `bytedance/seedance-2-fast`.

## Node 2 — Wait 15s (unchanged)

## Node 3 — "Poll KIE task"

```
GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId={{ $('Video generation (KIE)').item.json.data.taskId }}
Header: Authorization: Bearer <KIE_API_KEY>
```
States at `data.state`: `waiting` → `queuing` → `generating` → `success` | `fail`.

## Node 4 — IF `{{ $json.data.state }}` equals `success`
- false → back to Wait (add a second branch: if state equals `fail`, respond with a friendly error using `data.failMsg` — do NOT loop forever)
- true → Node 5

## Node 5 — Code "extract video url" (resultJson is a JSON **string** — must be parsed)

```js
const d = $input.first().json.data;
const r = JSON.parse(d.resultJson);
return [{ json: { url: r.resultUrls[0] } }];
```

Feed `{{ $json.url }}` into the existing Respond-to-Webhook node as `{"videos": [url]}`.

(Optional: add `"callBackUrl": "<n8n webhook>"` as a top-level field next to `model` — KIE POSTs the result when done, no polling needed.)

---

## Reliability caveats (be honest with the team)

KIE is an unofficial aggregator (their own docs: "our overall stability may be slightly lower than official providers"). Community reports ~6% failure baseline, credits sometimes consumed on failures, rate limit 20 requests/10s, no real SLA. Verdict: **great primary for the current stage (internal + demos + cost-sensitive volume) with (a) the fail-branch wired, (b) one automatic retry on failure, and (c) fal.ai kept as the drop-in fallback** — the request shapes are documented side by side so switching is a 5-minute node edit. For high-stakes client deliverables, re-render winners on fal standard/1080p.
