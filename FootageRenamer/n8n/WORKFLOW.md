# n8n workflow - build sheet

`footage-renamer.workflow.json` (this folder) is importable now and contains **Stage 1**, which is
validated live against the real Notion DB. **Stage 2** (Dropbox + Gemini) is specified below and
gets added once those creds land. The deterministic rename step pastes `../lib/rename.js`; the
match step uses `../prompts/match_clip.md`.

## Import + setup

1. Import `footage-renamer.workflow.json` into n8n.
2. Create one **Header Auth** credential named **Notion Bearer**: Name = `Authorization`,
   Value = `Bearer <your-notion-token>`. Assign it to every HTTP node (they reference it by name).
3. In Notion, configure the **`READY?` button**: action **Edit property -> Status -> `Queued`**.
   (A Notion button stores no value, so n8n can't filter on the button itself; the button sets
   `Status = Queued` and n8n polls for that.) Status options auto-create on first write - no need
   to pre-add them.

## Credentials needed

- **Notion**: the Header Auth credential above (the integration is already shared on the DB).
- **Dropbox** (Stage 2 write): n8n **Dropbox OAuth2** credential (write scope) + output root path.
  OAuth2 auto-refreshes (4h access tokens, long-lived refresh token) - don't paste a raw token.
  The footage *download* uses the public share link (`dl=1`), no Dropbox creds needed.
- **OpenRouter** (Stage 2 match): API key + a Gemini Flash model.
- **ffmpeg** on the host (Execute Command) to shrink clips before the match - or run that stage on
  the VideoEditor box.

## Stage 1 - in the JSON now (Notion only, validated live)

1. **Schedule Trigger** - every 2 min.
2. **Notion: get queued** - POST query the Job DB, filter `Status = Queued`. One item per job.
   (`Per job` ends quietly if none.)

3. **Notion: set Processing** - PATCH the page `Status = Processing` (claims the job).
4. **Notion: page blocks** - GET `blocks/{pageId}/children`.
5. **Find storyboard table** (Code) - locate the `table` block, output its id.
6. **Notion: table rows** - GET `blocks/{tableId}/children` (header row + one row per scene).
7. **Parse storyboard** (Code, deterministic, inlined from `lib/rename.js`) - reads the table by
   header name, splits multi-shot `Footage Name` on ` + `/`,`, infers talking-head vs b-roll ->
   `scenes` JSON + a summary string.
8. **Notion: post summary** (comment, continue-on-fail) + **Notion: status Ready** - writes the
   parsed result back so QA can see it. End of Stage 1.

## Stage 2 - add once Dropbox + Gemini creds land

9. **Download footage** - HTTP GET the row's `Dropbox Upload Link` with `dl=1` (public link, no
   creds) -> a **Compression/Unzip** node -> one binary item per video.
10. **Shrink + match clip** (per clip) - ffmpeg makes a small proxy (or ~6 frames), then an
    **OpenRouter** call to a Gemini Flash model (prompt `prompts/match_clip.md`); clip + `scenes`
    -> `{scene, type, shot_slug, confidence}`. Collect into `matches`. (Clip sent as base64
    `video_url` / `image_url`; inline size is capped, hence the shrink.)
11. **Plan renames** (Code, paste `lib/rename.js`):
    ```js
    const scenes = $('Parse storyboard').item.json.scenes;
    const matches = $('Gemini: match clip').all().map(i => i.json);
    const row = $('Per job').item.json;
    return [{ json: planJob(scenes, matches, { client: row.client, creator: row.creator, confidenceThreshold: 0.6 }) }];
    ```
12. **Dropbox: write output** - create `<root>/<Client>/<Creator>/{aroll,broll}`, copy each
    `from -> folder/to` (copy, not move - leave the raw upload intact), upload `_report.md`.
13. **Dropbox: create shared link** of `<Client>/<Creator>/`.
14. **Notion: finalize** - `Output Folder` = the link; `Status` = `Needs review` if
    `missing.length || flagged.length` else `Done`; post `report` as a comment.

## Failure handling

- Wrap the stages so any error sets the row `Status = Error` and posts the message as a comment,
  so a stuck job is visible in the DB instead of silently retried every poll.
