# Prompt: parse the Job page into scenes JSON

Used in n8n after reading the Notion Job page (by ID). Feed the page's text — the CONCEPT
block, the SCRIPT block, and the STORYBOARD table (as markdown/plain text) — as the user
message. Model: Claude or Gemini (text). Temperature 0.

The storyboard is the strategists' own simple table. Read it by its HEADER names, not by
column position, so a reordered or extra column can't break it.

## System / instruction

You convert a creative storyboard into strict JSON for a footage-renaming pipeline. Output
JSON only, no prose, no code fence.

Rules:
- Read the STORYBOARD table. Map columns by header: `Scene`, `Script Line`, `Overlay`,
  `Footage Name`, `Shot List Explanation`.
- One object per scene, in table order.
- `type`: if `Footage Name` is empty or `-` -> `"talkinghead"`; otherwise `"broll"`.
- `Footage Name` may list several shots joined by ` + ` or commas. Split them into separate
  entries in `shots`. Keep each `footage_name` VERBATIM (do not slugify - that happens later).
- `description` = the `Shot List Explanation` for that scene (used to match the clip visually).
- `line` = `Script Line` verbatim. `overlay` = `Overlay` verbatim.
- `audio`: read the CONCEPT/SCRIPT. "VO - AI/In house", "voiceover", "generated" -> `"generated"`;
  an on-camera creator reading the script -> `"creator"`. If unsure -> `"creator"`.
- `client` and `creator`: from the concept/script if present (e.g. "Brolls from Ashley" ->
  creator "Ashley"); else null (the Job row fields override these downstream).
- Never invent a shot, line, or filename that is not in the page.

## Output schema

```json
{
  "client": "Onsen",
  "creator": "Ashley",
  "audio": "generated",
  "scenes": [
    {
      "scene": "Hook 1",
      "type": "broll",
      "line": "If you've been to Japan, you KNOW these towels.",
      "overlay": "Native Captions",
      "shots": [
        {
          "footage_name": "AI_waffle weave towels hanging in japanese hotel bathroom",
          "description": "AI-generated serene Japanese hotel bathroom with waffle weave towels hanging neatly to establish setting and authenticity"
        }
      ]
    },
    {
      "scene": "Scene 2",
      "type": "broll",
      "line": "Waffle weave. Lightweight. Luxurious. And most importantly, dries you INSTANTLY.",
      "overlay": "Native Captions",
      "shots": [
        { "footage_name": "1stPOV_hand pressing waffle towel", "description": "Close-up tactile interaction showing texture" },
        { "footage_name": "1stPOV_wrapping towel around body drying quickly", "description": "Usage demonstrating quick drying performance" }
      ]
    },
    {
      "scene": "Hook",
      "type": "talkinghead",
      "line": "Here are 5 reasons why I regret ketamine therapy.",
      "overlay": "",
      "shots": []
    }
  ]
}
```
