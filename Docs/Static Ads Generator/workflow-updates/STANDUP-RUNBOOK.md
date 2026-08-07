# Stand-up runbook — put the concept-first render into your live n8n

Follow these in order. Step 2 proves the renderer works on its own before you touch the
pipeline, so if anything's going to break you find it in one minute, not buried in a node.

Time: ~30-45 min. You'll need: your n8n workflow open, and a card for the render service
(a few dollars covers a lot of images).

---

## Step 1 — Get the two accounts / three keys

1. **htmlcsstoimage.com** — sign up. In the dashboard, copy your **User ID** and **API Key**.
   (This is the "invisible browser" you're renting. Free tier to test; then ~$0.005–0.01/image.)
2. **OpenRouter** — use your existing account. If the old key was ever pasted into a public file,
   **rotate it** and copy the new one. This powers the rebuild + QA (Claude).

You now have 3 secrets: `OPENROUTER_API_KEY`, `HCTI_USER_ID`, `HCTI_API_KEY`.
**Keep them in n8n only — never paste them into the repo files (the repo is public).**

---

## Step 2 — Smoke-test the renderer (do this before anything else)

Prove HTML → image works with your key. In a terminal:

```bash
curl -s -X POST https://hcti.io/v1/image \
  -u '01KYMJXGYKWES04272N3PZWMS6:019fa92e-c3d3-7b8e-b002-b40433320a3a' \
  --data-urlencode 'html=<div class="stage" style="width:1080px;height:1080px;display:flex;align-items:center;justify-content:center;background:#2E6BFF;color:#fff;font:800 96px system-ui">It works</div>' \
  --data-urlencode 'selector=.stage' \
  --data 'viewport_width=1080' --data 'viewport_height=1080' --data 'device_scale=2'
```

You should get back `{"url":"https://hcti.io/v1/image/....png"}`. Open that URL — a crisp blue
2160×2160 "It works". **If you see that image, the hard part is done** — the rest is wiring.
(If it errors, the message tells you what's wrong — usually the key or the `-u` format.)

---

## Step 3 — Add the "Produce Ad" node

1. In your workflow, add a **Code** node named **Produce Ad**. Set **Mode = "Run Once for All Items"**.
2. Paste the contents of [`Produce-Ad.js`](./Produce-Ad.js).
3. At the top of the node, fill the 3 config values with your real keys (from Step 1). These live
   in the n8n node, not the repo.

---

## Step 4 — Rewire (swap the last mile)

1. **Delete** these 6 nodes: `Build KIE AI Prompt`, `Create KIE AI Task`, `Wait`,
   `Poll Task Status`, the `If` after it, `Extract Image URL`.
2. **Connect:** `Generate Ad Copy` → **Produce Ad** → `Post to Supabase`.

That's the whole structural change. Everything before `Generate Ad Copy` (Brand Brain, template
pick, copy) is untouched.

---

## Step 5 — Save the result

The Produce Ad node outputs, per ad: `image_url`, `qa_status` (`passed` / `failed` / `error`),
`qa_notes`, `tries`. In your **Post to Supabase** node:

- Map `image_url` → the `static_ads` image column the Ad Library already reads.
- (Optional but recommended for fully-automatic) add an **IF** before it: only insert rows where
  `qa_status === "passed"` into the client-facing set; send `failed` ones to a "needs review"
  status/column instead, so a rare bad render never reaches a client. `qa_notes` tells you why.

---

## Step 6 — Test one submission

Submit the intake form for **one** brand. Watch the run:

- Produce Ad takes ~15–40s per ad (it may render, QA, and retry up to 3×).
- Open the Ad Library — the new ad should be there, crisp, on-brand, template-faithful.
- If `qa_status` is `failed` after 3 tries, read `qa_notes` — usually a fixable prompt nudge.

When one brand looks right, you're live. Run the rest.

---

## Troubleshooting

- **Render errors / no url:** re-run the Step 2 smoke test — it isolates the render service from
  everything else. Almost always the key format.
- **Font looks wrong:** the brand's font isn't on Google Fonts (e.g. a licensed font). It falls
  back to a clean default — that's fine for now; loading a proprietary `.ttf` is a phase-2 add.
- **Logo:** with no logo it uses a typographic wordmark. Put the client's logo URL in Brand Brain
  `logo_urls` and I'll wire it to composite (phase 2).
- **QA too strict / too loose:** the QA prompt is inside `Produce-Ad.js` — tighten or relax the
  fail conditions there.
- **Cost:** each ad = 1 render + ~2–3 Claude calls (+1 render/QA per retry). Budget a few cents an
  ad. If it climbs, drop `MAX_TRIES` to 2.
- **Later, to kill per-image cost:** swap the render service to a self-hosted **Browserless** on
  your VPS. Only the `render()` function in the node changes (it returns raw PNG bytes instead of a
  URL, which you then upload to Supabase Storage). Ping me and I'll do that swap.
