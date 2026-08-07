# Fixing the Static Ads automation — concept-first, fully automatic

The plan to make the live n8n pipeline produce the template-faithful, crisp output we proved
by hand, instead of the KIE "AI slop." You keep most of your flow and swap the last mile.

## The one change

Today the flow ends with **"the image model draws the whole ad"** → garbled text, warped
logos, generic scenes. It ends instead with **"Claude rebuilds the chosen template as HTML →
a rented invisible-browser turns that HTML into a crisp PNG."** A browser draws the text and
the logo, so they are perfect every time.

## Before → after (node map)

**Keep unchanged:** Webhook · Search Brand Brain · Parse Platform · Search records (templates)
· Shuffle · Pick Templates · Generate Ad Copy · Post to Supabase.

**Delete these 6:** Build KIE AI Prompt · Create KIE AI Task · Wait · Poll Task Status ·
If · Extract Image URL.

**Add ONE node in their place — "Produce Ad"** (`Produce-Ad.js`). Per ad it does, in a loop:

1. Look at the chosen template image and describe its structure (which zones, the concept device).
2. Rebuild that structure as HTML with this brand's colours, fonts, copy, and logo.
3. Render the HTML to a 1080×1080 PNG via the rented browser.
4. QA-check the PNG with a vision model.
5. If QA fails, feed the problems back and retry (up to 3 times).
6. Upload the passing PNG to your Supabase `static-ads` bucket and return its URL.

Then your existing **Post to Supabase** writes the `static_ads` row using that URL.

Wire it: `Generate Ad Copy → Produce Ad → Post to Supabase`.

## Your setup steps

**1. Rent the render service.** For standing it up: **htmlcsstoimage.com** — it returns a
finished, permanently-hosted image URL, which removes the trickiest code (handling raw image
bytes and re-uploading). Sign up → copy your **User ID + API Key**. (Later, to kill the
per-image cost, swap to a self-hosted **Browserless** on your VPS — only the `render()` function
in the node changes. See the runbook.) Full click-by-click: **`STANDUP-RUNBOOK.md`**.

**2. Paste 3 keys into n8n only — NEVER into the repo files (the repo is public):**
- **OpenRouter key** (the rotated one) — powers the rebuild + QA calls (Claude).
- **Render token** — from step 1.
- **Supabase `service_role` key** — writes the ad row (you already use it). The render service
  hosts the image, so you just store its URL.

In `Produce-Ad.js` these are placeholders like `<OPENROUTER_API_KEY>`. Fill the real values in
the n8n node editor; do not commit them.

**3. Swap the nodes.** Paste `Produce-Ad.js` into a new **Code** node set to
**"Run Once for All Items"**. Delete the 6 KIE nodes. Re-wire as above.

**4. Brand assets — the quality dial.**
- **Colours + fonts** come from Brand Brain automatically (`primary_color_hex`,
  `secondary_color_hex`, `accent_color_hex`, `brand_fonts`). If the brand font is on Google
  Fonts it's used; otherwise it falls back to a clean default. Proprietary (non-Google) fonts
  are phase 2 — upload the `.ttf` and I'll wire it in.
- **Logo:** with no logo it draws a clean typographic wordmark. For real clients, put the
  client's logo URL in Brand Brain `logo_urls` and the node composites it. (Vector/PNG with a
  transparent background looks best.)

**5. Test one brand end to end.** Run it, open the Ad Library, eyeball the result. If a specific
template format needs tuning, the rebuild prompt lives at the top of `Produce-Ad.js`.

## Fully automatic — the safety net

You chose no human-approval step, so **the QA node is what protects you.** After each render, a
vision model confirms: text is crisp (not baked/garbled), the logo is intact, nothing overflowed
or collided, and the rebuild still reads as the chosen template. Fail → it regenerates (up to 3
tries) with the problems fed back in. Only a **passing** PNG gets stored. If all 3 tries fail,
the ad is saved with `qa_status: "failed"` instead of shipping junk, so you can spot it in the
Library. You can bolt on a human approval later without touching this node.

## What this kills

- **The KIE 24-hour URL rot** — you render and store your own PNG.
- **The "AI-generated look"** — a browser draws the text and logo, not an image model.
- **Template drift** — the node reconstructs the *specific* template that was picked, so the
  library finally does its job (this is the fix from the template-faithful proof:
  `../concept-first-proof/deck2-template-faithful.html`).

## De-risking

The one unfamiliar piece is the render service. The runbook's **Step 2** is a one-line smoke test
that proves HTML → image works with your key *before* you touch the pipeline — so if anything
breaks, you catch it in a minute, not buried in a node. Do that step first.
