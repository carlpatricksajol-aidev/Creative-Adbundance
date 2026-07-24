# Figma Comment Digest — Engine

Reads **every** client comment on a Figma file and emits a **designer revision brief** JSON that
validates against [`../brief.schema.json`](../brief.schema.json). The dashboard + n8n consume the
brief; a worked example is [`../sample.brief.json`](../sample.brief.json).

Zero runtime dependencies. Node v20+ (targets v24 global `fetch`). ESM.

## What it does

1. Fetches the file tree once (`GET /v1/files/:key`) and all comments (`GET /v1/files/:key/comments`).
2. Groups comments into threads (`parent_id === ""` = thread, else a reply).
3. Resolves each comment's pin to the **ad** it belongs to (a top-level frame = a direct child of a
   CANVAS): node-ancestry walk for node-pinned comments, `x,y` hit-test for bare-canvas pins, else
   `unplaced`.
4. Renders a PNG thumbnail per commented ad (`GET /v1/images`, batched). **These S3 URLs expire
   (~1h-24h) — persisting them is the automation layer's job**; the engine only attaches what Figma
   returned.
5. Classifies threads via OpenRouter (`google/gemini-2.5-flash`, temp 0.1): per-thread
   `{type, route, priority, action}` + cross-ad `themes[]`. The client's exact words (`verbatim`)
   are **never** modified; `action` is a separate imperative restatement, and only for
   designer/copywriter routes.
6. Assembles the brief in canvas reading order, computes stats + a change-detection `cursor`, runs a
   dependency-free self-check, and writes `../out/<key>.brief.json`.

## Setup

```bash
cd FigmaComments/engine
cp .env.example .env   # fill in FIGMA_TOKEN + OPENROUTER_API_KEY
# no npm install needed to run (zero runtime deps)
```

Figma token scopes required: **`file_content:read`** and **`file_comments:read`**
(Figma > Settings > Security > Personal access tokens).

Set your env (PowerShell):

```powershell
$env:FIGMA_TOKEN="figd_..."; $env:OPENROUTER_API_KEY="sk-or-v1-..."
```

## Run

```bash
node index.js https://www.figma.com/design/M5yNWTlaG4Ah2NgYhZ6Hqu/ARMRA_EXT
# or a raw key:
node index.js M5yNWTlaG4Ah2NgYhZ6Hqu --out ../out/armra.brief.json
```

`stdout` prints only the output path (composes in a pipeline); progress goes to `stderr`.

## Optional strict validation (CI)

The emit-time self-check needs no deps. For a full JSON-Schema pass:

```bash
npm i                       # installs ajv + ajv-formats (devDeps only)
node validate.js ../out/<key>.brief.json
node validate.js            # defaults to ../sample.brief.json
```

## Files

| file           | role |
|----------------|------|
| `figma.js`     | REST client: `parseFileKey`, `getFile`, `getComments`, `getImages`; `X-Figma-Token` auth, 429 backoff, 403/404 errors |
| `resolve.js`   | tree index + `resolveCommentToAd` (node-ancestry + `x,y` hit-test + unplaced) + `sectionLabelForAd` |
| `thread.js`    | thread grouping, author tally, `isClient` heuristic (via `INTERNAL_HANDLES`) |
| `classify.js`  | OpenRouter batch classify + theme clustering + deterministic rule guardrails |
| `buildBrief.js`| assembles the brief, stats, cursor; zero-dep `selfCheck` |
| `index.js`     | CLI orchestrator |
| `validate.js`  | optional ajv full-schema check |

## Cursor / change detection

`cursor.latestActivityAt = max(created_at over all comments incl. replies, and resolved_at on
threads)`, so a resolve/unresolve moves the watermark. `cursor.commentCount` = total incl. replies.
n8n stores the cursor per file and only re-summarizes when it moves. (The automation layer may also
diff `resolvedThreads` for extra safety.)

## Needs live-token validation

The code is written to the documented API shapes, but the following can only be confirmed with a
real token against the real `ARMRA_EXT` file:

- **`client_meta` shapes** — exact keys for node-pinned vs. bare-canvas vs. region/box comments.
- **Region/box comments** — whether they always carry `node_id` (we treat them via `node_id`).
- **node → ad ancestry** — that a commented `node_id` reliably resolves to a direct CANVAS child on
  real files (nested components, sections, auto-layout wrappers).
- **`sectionLabel`** heuristic — whether the nearest TEXT-above-frame actually names the section.
- **Image URL TTL** and any `images.err` values under load.
