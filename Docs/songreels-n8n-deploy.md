# SongReels — n8n Deploy Guide (paste-in order)

Everything that needs to go onto the **VPS n8n workflow** ("Heartreel - Form Execution"),
in the order to do it. The website (Vercel) is separate and already deployed.

> The full code for the four code nodes lives in the **project chat** (each node was given
> in full). This file is the **deploy order + checklist + the small/critical bits**. For each
> node, replace the *entire* node code in n8n with the version named here.

---

## ✅ Deploy order

| # | Node in n8n | Version | Why | Required? |
|---|---|---|---|---|
| 0 | 4 Google nodes | key swap | Renew the expired Gemini key | **REQUIRED** — nothing generates without it |
| 1 | Build Claude Prompt | **v5.2** | Upbeat (not sad) + non-literal lyrics (Eric's feedback) | High |
| 2 | Parse Claude Response | **v2** | Extract SONG_STYLE + lock the chosen voice | High |
| 3 | Align Clips to Sections | **v4.1** | Lyric-timed sync + footage-driven duration | High |
| 4 | Creatomate body builder | **v4.3** | Crossfades (no black between clips) + fade-to-black end + song trim | High |

#0 is the only hard blocker. #1–#4 are the quality fixes; #3 and #4 must go together.

---

## Step 0 — Renew the Gemini key (REQUIRED)

The old `AIzaSy…` Gemini key is **expired** → the workflow errors at
"Get File State" with *"API key expired."* It appears in the URL (`?key=…`) of **4 nodes**:

1. **Upload to Google File API**
2. **Get File State**
3. **Gemini - Analyze Clips**
4. **Delete Google Files**

In each, replace the old expired key in the URL:
```
key=<OLD_EXPIRED_AIzaSy_KEY>
```
with the current Gemini key (paste your real key — do NOT commit it):
```
key=<YOUR_CURRENT_GEMINI_KEY>
```

**If a node then returns `API key invalid` (400) as a query param**, the `AQ.` key wants a
header instead: remove `?key=…` from that node's URL and add a header
`x-goog-api-key` = `<YOUR_CURRENT_GEMINI_KEY>`. Try the plain URL
swap first.

> Don't hard-code keys long-term — move to an n8n env var (`{{ $env.GEMINI_API_KEY }}`) so
> the next renewal is one place, not four.

---

## Step 1 — Build Claude Prompt → v5.2

**Replace the whole node** with the **Build Claude Prompt v5.2** code from the chat
(header reads `BUILD CLAUDE PROMPT — v5.2: CELEBRATORY ENERGY + LESS LITERAL LYRICS`).

What it changes vs v5.1:
- **Celebratory bias** — reads `occasion` + Gemini `suggested_mood`; weddings / honeymoons /
  birthdays / etc. (or upbeat footage) force **major key + lifted tempo**, and the style line
  bans "ballad / minor / somber / theatrical."
- **`EMOTIONAL REGISTER` block** sets the feeling first → happy occasions don't drift sad.
- **De-literalized** — 90/10 feeling rule; the per-stanza anchor is a *"private cue — DO NOT
  print this word"*; metaphor-weighted styles; FORBIDDEN list bans gear/objects ("backpack",
  "trail"), motion play-by-play ("left foot / right foot"), and burden/"weight of love" imagery.

Inputs/outputs unchanged, so Parse v2 and the render nodes consume it as-is.

---

## Step 2 — Parse Claude Response → v2

**Replace the whole node** with **Parse Claude Response v2** from the chat
(header `PARSE CLAUDE RESPONSE — v2: extracts SONG_STYLE + enforces guardrails`).

What it does:
- Extracts Claude's `SONG_STYLE_START…SONG_STYLE_END` line as the Suno `style`.
- Falls back to a richer constructed style if the block is missing.
- **Guardrails in code:** enforces the chosen voice (`female`/`male` tag), appends
  `no intro, starts with vocals`, and caps the style at 990 chars.

The **Suno – Generate Song** node needs **no change** (still reads `suno_tags`).

---

## Step 3 — Align Clips to Sections → v4.1

**Replace the whole node** with **Align Clips to Sections v4.1** from the chat
(header `ALIGN CLIPS TO SECTIONS — v4.1: FOOTAGE-DRIVEN DURATION`).

What it does:
- Builds `aligned_clip_sequence`: each clip pinned to the time window when its lyric is sung
  (lyric-timed sync, gapless).
- **Footage-driven duration:** reel content = `min(uploaded footage, chosen tier)`.
  - footage ≥ tier → lyric-timed, content capped at the tier (no 3:45 bloat on a 3-min pick)
  - footage < tier → full clips back-to-back, reel ≈ intro + footage + outro (no black padding)

| Footage | Tier | Reel |
|---|---|---|
| ~1:00 | 3 min | ~1:15 |
| 2:30 | 3 min | ~2:45 |
| 4:44 | 3 min | ~3:18 (was 3:45) |

---

## Step 4 — Creatomate body builder → v4.3

**Replace the whole node** with **Creatomate body builder v4.3** from the chat
(header `CREATOMATE BODY BUILDER — v4.3: TRUE CROSSFADES (no black between clips)`).

What it does:
- Consumes `aligned_clip_sequence` (lyric-timed / footage-driven from Step 3).
- **True crossfades** — clips overlap and dissolve into each other on ascending tracks; the
  incoming clip is always on top → **zero black between clips** (fixes the 1–4s black gaps).
- **Clean fade-to-black ending** — the last clip + music fade out together, then a ~0.6s pure
  black tail guarantees the final frame is fully black.
- Trims the Suno song to the reel length with a 5s fade; hard duration cap retained.

> Steps 3 + 4 must go together — v4.3 reads what v4.1 produces. (If only one is deployed,
> v4.3 safely falls back to its own back-to-back + crossfade path.)

---

## After deploying — quick test

1. **Renew key (Step 0)** then run the workflow once on any job — confirm "Get File State"
   and "Gemini - Analyze Clips" succeed (no 400).
2. Make a reel with a **celebratory occasion + Joyful/Uplifting** → song should be upbeat,
   major-key, non-literal (no "backpack"/"left foot").
3. Check the finished reel: **no black between clips**, clean **fade to black** at the end,
   and the duration matches the footage (short footage → shorter reel, with the HTML warning).
4. Watch the n8n logs for `Align v4.1: mode=…` and `timeline_mode: lyric_timed_v4.3`.

---

## Not on the VPS (already done / separate)

- **Website** (Stripe checkout, mood/voice UI, footage warning, `BYPASS_PAY` for beta) — on
  Vercel, already committed + pushed.
- **Testers** — give them an `access_codes` code; `BYPASS_PAY=true` means no payment needed.
- **Security TODO** — make the GitHub repo **private** + **rotate the Supabase service_role
  key** (it's in git history).
