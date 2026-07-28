# Static Ads Service (headless)

The reliable replacement for the n8n generation step. Same intake form, same Supabase library —
this just runs the multi-step agent loop (look at template → write grounded HTML → render → QA →
retry → keep only passers) that actually produces good ads, instead of a single one-shot call.

```
Intake form ──POST /generate──▶ static-ads-service ──▶ Supabase (static_ads + storage)
                                  per template: reconstruct → render(hcti) → QA → retry
                                  only QA-passed ads are uploaded + inserted
```

## Deploy (on the VPS where n8n already runs — ~10-15 min)

```bash
# 1. a browser for local rendering (free, unlimited — no per-image limit)
sudo apt-get update && sudo apt-get install -y chromium        # → /usr/bin/chromium
# 2. the service
cd static-ads-service
npm install
cp .env.example .env      # fill REAL keys + CHROME_PATH=/usr/bin/chromium (rotate leaked keys first)
node server.js            # or: pm2 start server.js --name static-ads && pm2 save
```

Health check: `curl http://localhost:8787/` → `{"ok":true,...}`

## What to expect (honest)

This ships **only ads that clear a QA score of 7/10** — clean, on-brand, frame-filling, specific
copy. Templates that can't hit that unattended are **dropped, not shipped broken**, so a 15-template
request may yield fewer than 15. It does best on high-signal template types (big-question, iOS Notes,
statistic, testimonial, comparison) and drops dense/complex ones more often. Rendering is local so
retries are free; quality comes from `MODEL_BUILD` (keep it on a strong model). For premium/hero
creative, keep a human in the loop — this is the volume engine, not a replacement for art direction.

## Point the form at it

Two ways — either is fine:

**A. n8n forwards (least change — the form keeps posting to n8n).**
In your Static Ads Generator workflow, right after `Webhook1`, add an **HTTP Request** node:
- Method `POST`, URL `http://localhost:8787/generate` (same box) or `http://<vps-ip>:8787/generate`
- Body: **JSON**, send `{{ $json.body }}` (the whole form body)
Then delete/disconnect the old generation chain. n8n's only job becomes "receive form → forward".

**B. Form posts directly.** Change the intake form's submit URL to `https://<your-host>/generate`.
The service accepts both the n8n webhook shape (`{ body: {...} }`) and a flat body.

## Test it

```bash
curl -X POST http://localhost:8787/generate -H 'content-type: application/json' -d '{
  "client_name": "Trusted Company Reviews",
  "platforms": "Meta / TikTok - Square (1:1)",
  "selected_template_urls": [
    "https://xakngjsybyytldyqfsmi.supabase.co/storage/v1/object/public/templates/recAawoq69NadehMa.jpg",
    "https://xakngjsybyytldyqfsmi.supabase.co/storage/v1/object/public/templates/recx4DL7p4BgleLba.png"
  ]
}'
```

Returns `202 accepted` immediately; watch the logs as it produces. Passed ads appear in the Ad
Library within a couple of minutes. Fewer than requested is expected — templates that can't hit
the quality bar are dropped, not shipped broken.

## What the form sends (fields used)

- `client_name` (required) — matched to Brand Brain (name / client_name / aliases).
- `selected_template_urls` — the templates picked in the form's gallery.
- `platforms` — first value is stored as the ad's platform label.
- `sister_brand` (optional) — preferred over client_name for the Brand Brain lookup.

## Tuning (`.env`)

- `MODEL_BUILD` — the reconstruct model. `claude-sonnet-4` is the default; point it at a bigger
  model for maximum quality.
- `MAX_TRIES` — retries per template before it's dropped (default 3).
- `CONCURRENCY` — templates rendered in parallel (default 3).

## Security

`.env` is gitignored — never commit real keys. This repo is public. Rotate the OpenRouter, hcti,
Supabase `service_role`, and KIE keys, since earlier versions were pasted into shared files.
