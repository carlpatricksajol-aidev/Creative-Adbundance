# Footage Renamer

QA automation: a creator's raw, mis-named Dropbox uploads + the storyboard -> a clean,
correctly-named, organized footage folder back in Dropbox + a missing-shot report. Front of the
funnel for the video editor pipeline (it produces the correctly-named folder the assembly editor
later consumes).

Full design + decisions: `Docs/Video Editor/Footage Renaming Automation - Spec.md`.

## Flow

Notion Job page (`READY?` checkbox) -> n8n picks it up by page ID -> reads concept + script +
storyboard table from the page -> pulls the clips from the Dropbox link -> Gemini matches each
clip to a storyboard scene (hears VO for talking-head, sees visuals for b-roll) -> deterministic
rename/organize -> writes `<Client>/<Creator>/{aroll,broll,_report.md}` back to Dropbox -> writes
the folder link + status back on the Notion row.

## Layout

```
FootageRenamer/
  lib/
    rename.js        deterministic rename/organize: slug, multi-shot split, take/version
                     grouping, output layout, missing-shot diff, report. Pastes into an n8n
                     Code node; runs in plain Node.
    rename.test.js   self-test on the real Onsen storyboard. `node rename.test.js`
  prompts/
    parse_storyboard.md   Notion page text -> scenes JSON (header-keyed; LLM)
    match_clip.md         one clip + scenes -> best-match + confidence (Gemini video)
  n8n/
    WORKFLOW.md      node-by-node build sheet
```

## Naming convention (encoded in lib/rename.js)

- b-roll: filename auto-derived from the storyboard `Footage Name` (lowercase, non-alphanumerics
  -> `_`). Multi-shot cells split on ` + ` / `,`. Extra versions -> `_v2`, `_v3`.
- talking-head: `<scene>_<line-slug>_take<N>`, all takes kept.
- type is inferred: blank `Footage Name` -> talking-head, filled -> b-roll.

## Status

- `lib/` logic: built + tested (10/10), and the storyboard parser validated live on the real
  Onsen Notion page (14 scenes, 17 b-roll shots, multi-shot splits correct).
- `prompts/`: drafted.
- `n8n/footage-renamer.workflow.json`: **Stage 1 importable + validated live** (poll Queued ->
  read page -> parse storyboard -> write summary/status back to Notion).
- Stage 2 (Dropbox download -> Gemini match -> rename -> upload -> finalize): pending Dropbox
  write + Gemini creds. Then we run Ashley's Onsen footage end to end.
