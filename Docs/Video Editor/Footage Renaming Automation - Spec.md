# Footage Renaming Automation — Spec

*Front-of-funnel QA tool: creator's raw, mis-named Dropbox uploads → a clean, correctly-named,
organized footage folder + a missing-shot report. This is what produces the correctly-named
folder the VideoEditor assembly pipeline later consumes (it's roadmap item #1 from
`VideoEditor/PROGRESS.md`, productized as a standalone tool for the QA/strategy team).*

Requested by the QA/strategy team (Mikaela, Krithika, Dimple), Jun 22 2026 call. Their pain:
creators upload footage named inconsistently (or not at all), and QA hand-watches + hand-renames
every clip to match the storyboard before it can move to design. We automate the rename + organize +
missing-shot flag; QA keeps a manual eyeball pass after.

---

## Locked decisions

- **Standalone QA tool**, not coupled to the assembly editor. It can feed the editor later, but
  ships and runs on its own.
- **Runs as an automation** (n8n on the Hostinger VPS), mirroring the static-ads / SongReels setups.
  Not a local script.
- **Trigger:** the Job row's `READY?` **button** (Notion button type) is configured to set
  `Status = Queued`; n8n polls for `Status = Queued`. (A Notion button stores no value and can't
  webhook n8n directly, so it sets a select the poller can filter on.)
- **Storyboard input:** everything lives in the **Job page body** — concept + script + the
  storyboard table — one page per job. n8n reads the page by ID and an LLM parses the table into
  scenes JSON (keys on the header row, so column order / an extra column can't break it). No
  separate storyboard database and no per-storyboard DB sprawl (the team authors hundreds of
  storyboards; a DB-per-storyboard does not scale).
- **Vision model:** a **Gemini Flash** model **via OpenRouter** (Carl's existing OpenRouter account,
  not a direct Gemini key). OpenRouter takes video as a base64 `video_url`, but inline payloads are
  size-capped (~20MB), so each clip is **shrunk first** (low-res proxy or ~6 sampled frames via
  ffmpeg) before the match call. Talking-head matching needs audio (later); the current Onsen test
  is all b-roll. Swappable.
- **Takes:** keep ALL takes, rename with a `_take1/2/3` suffix. QA still picks the keeper.
- **Output:** write a NEW clean folder back into Dropbox (leave the creator's raw upload untouched),
  return a share link.

---

## The Notion setup — ONE database, storyboard lives in the page body

### Job database — "File Renaming Automation"

One row per creator submission. This is the queue n8n watches. Each row is a page; the **concept,
script, and storyboard table all live in that page's body** (not in a separate database).

| Property | Type | Who writes | Purpose |
|---|---|---|---|
| Client's Name | Title | strategist | output folder + tracking |
| Creator Name | Rich text | strategist | output folder + take naming (e.g. "Ashley") |
| Dropbox Upload Link | URL | strategist | where the raw footage is (required) |
| `READY?` | Button -> sets `Status = Queued` | strategist | the trigger; n8n polls `Status` |
| Status | Select: Queued / Processing / Ready to match / Needs review / Done / Error | n8n | progress |
| Output Folder | URL | n8n | finished clean-folder share link |

(Real DB id `388acb83-16dd-80f5-977e-f0aaa68bc0f2`; the `Storyboard` property was dropped - the
storyboard table lives in the page body.)

Page body, one job per page:
- **PASTE THE CONCEPT HERE** — concept doc (incl. notes like "VO – AI/In house", "Brolls from Ashley").
- **SCRIPT HERE** — the full script.
- **STORYBOARD HERE** — the storyboard as a simple **table** (the strategists' existing format).
  Columns: `Scene | Script Line | Overlay | Footage Name | Shot List Explanation`.

n8n reads the page by ID and an LLM parses the storyboard table into scenes JSON. The `Type`
(talkinghead vs broll) is **inferred**: blank/`–` Footage Name → talkinghead; filled → broll.
No `Type` column and no separate Storyboard property are needed.

---

## Naming convention

**B-roll** — auto-derived from `Footage Name`: lowercase, spaces/punctuation → underscores.
Strategists author nothing extra.

| Footage Name | → renamed file |
|---|---|
| `AI_waffle weave towels hanging in japanese hotel bathroom` | `ai_waffle_weave_towels_hanging_in_japanese_hotel_bathroom.mov` |
| `1stPOV_scrolling phone researching towels at night` | `1stpov_scrolling_phone_researching_towels_at_night.mov` |
| `3rdPOV_luxury spa style bathroom with soft lighting and towels` | `3rdpov_luxury_spa_style_bathroom_with_soft_lighting_and_towels.mov` |

**Talking-head** — `<scene>_<line-slug>_take<N>`, e.g. `hook_5reasons_regret_take1`,
`cta_book_consultation_take2`. All takes kept. If a single file contains all 3 takes back-to-back,
it's renamed as one file (`..._alltakes`) and NOT split — splitting is the editor stage's job.

**Multi-shot scene** — one scene's Footage Name can list several shots joined by ` + ` (or commas),
e.g. `1stPOV_hand pressing waffle towel + 1stPOV_wrapping towel around body`. Split on ` + ` / `,`;
each shot becomes its own target filename and its own missing-shot check.

**Multiple versions of one b-roll shot** — `_v2`, `_v3` suffix on the same slug.

The assembly-pipeline matcher normalizes names to `[a-z0-9]`, so these slugs match downstream
regardless of length.

---

## Output folder structure (written to Dropbox)

```
<Client>/<Creator-or-ConceptID>/
  aroll/        renamed talking-head takes (_take1/2/3, all kept)
  broll/        renamed b-roll (matches Footage Name slug)
  _report.md    missing storyboard shots + low-confidence matches QA must eyeball
```

---

## n8n workflow (steps)

1. **Poll** the Job database for `READY? = true, Status != Done`. Set Status = Processing.
2. **Read the Job page by ID** → properties (Creator, Dropbox Upload Link) + body blocks (concept,
   script, storyboard table). LLM parses the table → `{scene, type, line, footage_slug, description}[]`,
   keyed on the header row. Split multi-shot Footage Name cells on ` + ` / `,`; infer talkinghead
   (blank Footage Name) vs b-roll.
3. **List + download** the creator's clips from the Dropbox Upload Link.
4. **Match** per clip — shrink the clip (proxy/frames, ffmpeg) then ONE OpenRouter call to a Gemini
   Flash model: b-roll clips match by what's on screen vs the `Shot List Explanation`; talking-head
   (later) by the spoken line. Closed set = the storyboard's scenes. Returns scene + (b-roll) shot
   slug + confidence. Below the threshold (0.6) → leave original name + flag.
5. **Rename** to the convention; group takes; suffix versions.
6. **Write** the clean `aroll/` + `broll/` set into a new Dropbox folder `<Client>/<Creator>`.
7. **Report**: write `_report.md` — storyboard shots with no matching clip, and any low-confidence /
   unmatched clips. Set the Job row Status = `Needs review` (or `Done`) + Output Folder link.

---

## Setup owned by us (prerequisites)

- **Notion:** the one Job database above, with concept + script + storyboard table in each row's
  page body; create a Notion internal integration; share the database with it; put the token in
  n8n's Notion credential.
- **Dropbox:** use n8n's **Dropbox OAuth2** credential (write scope) + the destination root for the
  `<Client>/<Creator>` output folders. OAuth2 auto-refreshes - access tokens expire every 4h but
  the stored refresh token mints new ones automatically. Do NOT paste a raw generated access token
  (that's the 4h one). Footage *download* needs no creds (public `dl=1` link).
- **OpenRouter:** API key in n8n + a Gemini Flash model for the clip match.
- **ffmpeg:** needed to shrink each clip (proxy/frames) before the OpenRouter call. If the n8n host
  has no ffmpeg, run the shrink+match stage on the VideoEditor machine and let n8n orchestrate.
- **Test set:** the `Innerwell` row already in the Job database (with its real, mis-named Dropbox
  footage) is the first end-to-end test before any live job.

---

## Open / to confirm

- Vision model = Gemini (default). Confirm or swap.
- Confidence threshold for an auto-rename vs. a flag (tune on the Innerwell test).
- Whether the one-file-with-3-takes case is common enough to auto-split later.
