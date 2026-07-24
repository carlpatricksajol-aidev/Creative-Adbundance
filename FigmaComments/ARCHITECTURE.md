# Figma Comment Digest — Automation + Storage Architecture

Keeps a designer's revision brief current as clients keep commenting in Figma.
The **engine** (in `FigmaComments/engine/`, built in parallel) turns one Figma
file's comments into a brief JSON matching `FigmaComments/brief.schema.json`.
This doc is everything *around* the engine: how it gets run, where the data
lives, and how the team gets told something changed.

## Why it is built this way (constraints)

- **n8n can't run the engine.** Our n8n build has no *Execute Command* node
  (only *Execute Sub-workflow* + *AI Agent*). So — unlike the footage renamer,
  which shells out to `stage2.js` via Execute Command — n8n here **cannot invoke
  the engine**. It is used for **notifications only** (it can do HTTP + Slack +
  Notion). The engine runs from a **VPS cron**, exactly like a headless version
  of the footage-renamer deploy.
- **Repo is PUBLIC.** No keys in the repo, ever. `FIGMA_TOKEN`,
  `OPENROUTER_API_KEY`, `SUPABASE_SERVICE_KEY` live only in VPS env. The
  dashboard ships the Supabase **anon** key, which is safe because RLS confines
  it to read-only on `figma_briefs`.
- **Figma image URLs expire** (~1h–24h). Thumbnails must be persisted: download
  the PNG → upload to the `figma-thumbs` Supabase bucket → rewrite
  `brief.ads[].thumbnailUrl` to the durable public URL before storing the brief.

## Components at a glance

```
                 Figma REST API
                       |
   (VPS cron, every N min, flock-guarded)
   /root/figma-comments/poll.js
     1. read enabled figma_watched_files
     2. cheap GET comments -> compute cursor
     3. cursor == last_cursor?  --yes--> skip (no LLM spend)
                     |no
     4. run engine -> brief JSON
     5. download frame PNGs -> upload to figma-thumbs bucket
        rewrite brief.ads[].thumbnailUrl -> durable URLs
     6. INSERT figma_briefs, UPDATE watched_files.last_cursor/last_brief_id
                       |
                  Supabase  (figma_watched_files, figma_briefs, figma-thumbs)
                    /                      \
   n8n "Notify" workflow            Dashboard (index.html)
   (every 15 min, HTTP+Slack)       reads figma_briefs via anon key + RLS
   "New comments on <file>..."      ?file=<key> selects the brief
```

The **cursor** is the whole game. `brief.cursor` =
`{ latestCommentId, latestActivityAt, commentCount }`. We extend the *stored*
watermark with a `resolvedCount` so that **resolving** a comment (which doesn't
create a new comment, so `commentCount`/`latestActivityAt` may not move) still
counts as a change and regenerates the brief. See "Change detection" below.

---

## 1. VPS cron + `poll.js`

Mirrors the footage renamer, minus n8n. The engine + poller live in
`/root/figma-comments/` on the Hostinger box (`root@187.77.154.60`,
srv1486031). Cron line:

```cron
*/10 * * * * flock -n /tmp/figd.lock node /root/figma-comments/poll.js >> /root/figma-comments/poll.log 2>&1
```

- `flock -n /tmp/figd.lock` = never overlap runs; if a slow LLM pass is still
  going when the next tick fires, that tick exits immediately.
- `>> poll.log 2>&1` = a simple durable log to `tail` when debugging.

### What `poll.js` does each tick

For every `enabled = true` row in `figma_watched_files`:

1. **Cheap fetch.** `GET https://api.figma.com/v1/files/:key/comments`
   (header `X-Figma-Token: $FIGMA_TOKEN`). This one call returns all comments +
   replies + `resolved_at`/`order_id` — enough to compute the cursor without any
   LLM spend or image renders.
2. **Compute the live cursor:**
   - `latestCommentId`  = id of the max-`created_at` comment (incl. replies)
   - `latestActivityAt` = max `created_at` across all comments
   - `commentCount`     = total comments incl. replies
   - `resolvedCount`    = count of comments with a non-null `resolved_at`
     (folded in so resolves trigger regeneration)
3. **Compare to `last_cursor`.** If every field matches → **skip** this file
   (this is where we save the OpenRouter/Figma-render cost; most ticks skip).
4. **On any difference → run the engine** for this `file_key`. The engine
   produces the full brief (fetches the file tree, resolves pins to frames,
   LLM-categorizes/clusters, emits `brief.schema.json`).
5. **Persist thumbnails.** For each `brief.ads[]` with a Figma render URL:
   - `GET /v1/images/:key?ids=<nodeId>&format=png&scale=2` to get the (expiring)
     render URL, download the bytes.
   - Upload to `figma-thumbs` at key `<file_key>/<nodeId>-<lastModifiedEpoch>.png`
     (service_role, `upsert: true` so re-runs overwrite cleanly).
   - Rewrite `ad.thumbnailUrl` to the durable public URL
     `${SUPABASE_URL}/storage/v1/object/public/figma-thumbs/<key>/<nodeId>-<epoch>.png`.
   The `-<epoch>` suffix (file `lastModified`) busts the cache when a frame's
   art actually changes, without re-uploading on every poll.
6. **Store + advance watermark (do these together):**
   - `INSERT` into `figma_briefs` (`file_key`, `brief`, `comment_count`,
     `open_count`, `generated_at`).
   - `UPDATE figma_watched_files SET last_cursor = <new cursor>,
     last_brief_id = <new brief id>` for that file.
   Advance `last_cursor` **only after** the insert succeeds — a failed insert
   must not move the watermark, or we'd silently skip a real change next tick.

### Change detection (including resolves)

`brief.cursor` in the schema tracks new comments. Resolving a comment often
changes only `resolved_at`, so we store the extended cursor
`{ latestCommentId, latestActivityAt, commentCount, resolvedCount }` in
`figma_watched_files.last_cursor` and treat **any** field delta as a change.
`resolvedCount` catches resolve/unresolve; the other three catch new
comments/replies. Cheap and complete.

---

## 2. n8n — notifications only

n8n never runs the engine. It polls Supabase and announces changes. Workflow:
`FigmaComments/n8n/figma-comments-notify.workflow.json`.

`Schedule (15m)` → `HTTP GET figma_briefs?generated_at=gte.<now-20m>&order=generated_at.desc`
(anon key in the `apikey` header) → `Code` (dedupe to newest brief per
`file_key`, build the dashboard URL) → `IF` a file changed → `Slack` post.

Message: **"New client comments on `<file>` — `<openCount>` open, brief updated:
`<dashboard link>`"**. The lookback window (20m) is deliberately wider than the
schedule (15m) so nothing slips between runs; the Code node dedupes. Swap the
Slack node for a Notion node (`n8n-nodes-base.notion`, create page / append
block) if we go the Notion route — see open questions. Credentials in the JSON
are **placeholder refs**; pick real ones on import.

---

## 3. Dashboard hosting

`FigmaComments/dashboard/index.html` is a static single-page app. It reads
`figma_briefs` from Supabase with the **anon key** (RLS allows anon SELECT on
that table only) and renders the brief; `?file=<file_key>` selects which brief
(query the latest row for that `file_key`). Two hosting options, pick one:

- **VPS behind Traefik** (mirrors the video editor at `/root/video-editor`):
  serve from `/root/figma-comments/dashboard` at
  `figma-comments.srv1486031.hstgr.cloud`, wildcard TLS via the existing
  letsencrypt resolver, **password-gated** with a Traefik `basicAuth`
  middleware — same pattern as the video editor. Internal-only, no extra vendor.
- **Vercel** (mirrors `static-ads-form`): `vercel.json` with the SPA rewrite
  `{"source":"/(.*)","destination":"/index.html"}`, deploy under the existing
  Vercel team. Public URL, so rely on the anon-key + RLS boundary (never put the
  service key in the front-end) and optionally Vercel password protection.

Either way the anon key is the only secret in the client, and it can only read
briefs. The service key never leaves the VPS.

---

## 4. DEPLOY (mirrors the footage-renamer method)

All on the VPS (`root@187.77.154.60`). Assumes Node is available in
`/root/figma-comments` (either system Node, or run `poll.js` inside a small
`node:20-alpine` container if we want it isolated like n8n).

**1. Apply the schema** once, in the Supabase SQL editor (or `supabase db push`):
run `FigmaComments/n8n/schema.sql` on the chosen project. Creates the two tables,
RLS policies, and the `figma-thumbs` public bucket.

**2. Ship the engine + poller:**
```bash
scp -r FigmaComments/engine/*      root@187.77.154.60:/root/figma-comments/
scp    FigmaComments/n8n/poll.js   root@187.77.154.60:/root/figma-comments/poll.js   # (poll.js ships with the engine)
ssh root@187.77.154.60 'cd /root/figma-comments && npm ci --omit=dev'
```

**3. Set env (secrets live here, NOT in the repo).** Put them in
`/root/figma-comments/.env` (git-ignored; loaded by poll.js) or export in the
crontab shell:
```bash
FIGMA_TOKEN=<figma personal access token>
OPENROUTER_API_KEY=<openrouter key>          # same account as footage renamer
OPENROUTER_MODEL=google/gemini-2.5-flash
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_KEY=<service_role key>       # server-only, bypasses RLS
INTERNAL_HANDLES=K. Rao,M. Lopez,...          # who counts as internal (isClient=false)
```

**4. Install the cron:**
```bash
( crontab -l 2>/dev/null; echo '*/10 * * * * flock -n /tmp/figd.lock node /root/figma-comments/poll.js >> /root/figma-comments/poll.log 2>&1' ) | crontab -
```

**5. Verify:**
```bash
cd /root/figma-comments
node poll.js --once                 # dry single pass; should log "checked N files, regenerated M"
tail -f poll.log                    # watch a real tick
# in Supabase: figma_briefs has a row; figma-thumbs bucket has PNGs;
# open the dashboard ?file=<key> and confirm thumbnails load from the durable URL.
```

**6. Import the notify workflow:** n8n → Import from File →
`figma-comments-notify.workflow.json`. Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`DASHBOARD_URL` on the n8n container env, pick the Supabase anon + Slack
credentials, **Activate**.

**Roll back:** `crontab -e` remove the line (stops all generation); the
dashboard + last briefs stay readable.

---

## 5. Phased rollout

**Phase 1 — minimal (prove the loop, ~half a day):**
- `schema.sql` applied; seed 1–2 files into `figma_watched_files` by hand.
- `poll.js` with cursor check → engine → **INSERT figma_briefs**. Skip thumbnail
  persistence at first; store the raw (expiring) Figma URL and accept that old
  thumbnails go stale.
- Dashboard reads briefs; hosted wherever is fastest (Vercel).
- No n8n yet — check the dashboard manually.
- Goal: confirm cursor logic only regenerates on real change, and the brief
  renders.

**Phase 2 — full:**
- Add thumbnail persistence to `figma-thumbs` + URL rewrite (durable images).
- Fold `resolvedCount` into the cursor so resolves regenerate.
- Move hosting to the VPS behind Traefik, password-gated (if we want it
  internal-only).
- Import + activate the n8n notify workflow (Slack or Notion).
- Add `enabled` toggles / brand grouping in the dashboard, history diffing off
  the append-only `figma_briefs` rows.

---

## Open questions for Carl
See the summary returned to the orchestrator.
