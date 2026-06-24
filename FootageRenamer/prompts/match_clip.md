# Prompt: match one clip to a storyboard scene (Gemini, video)

One call per uploaded clip. Gemini ingests the video AND its audio, so a single pass handles
both cases:
- **talking-head** clips: matched by the spoken line (Gemini hears the VO).
- **b-roll** clips: matched by what's on screen vs the shot `description`.

Send the clip as video input + the JSON below (the storyboard's scenes) as context. Model:
Gemini (native video). Temperature 0.

This is a **closed-set** task: pick the single best scene/shot from the list, or say none.
Never invent a slug that is not provided.

Use the clip's **original filename** as extra evidence for *which shot* it is (creators often name
clips descriptively, e.g. "folding towel neatly on bathroom shelf"). BUT decide `person_in_frame` /
POV strictly from the frames — the filename's `1stPOV`/`3rdPOV` label is unreliable and must be
ignored for POV.

## Instruction

You are matching a single raw footage clip to ONE entry in a storyboard. You are given the
storyboard scenes. Watch the clip (and listen to any speech), then return the single best match.

- If the clip shows a person speaking a scripted line, match the `talkinghead` scene whose
  `line` the speech matches. Return `type: "talkinghead"`, that scene, no `shot_slug`.
- If the clip is visual b-roll, match the `broll` shot whose `description`/`footage_name` best
  fits what's on screen. Return `type: "broll"`, the scene, and that shot's `slug`.
- `confidence` is 0.0-1.0: how sure you are. Be honest; a generic or off-script clip should
  score low. Below ~0.6 the pipeline leaves the file unrenamed and flags it for a human.
- If nothing fits, return `confidence: 0` and `scene: null`.
- `person_in_frame`: **true** if the talent's body or face is visible (a 3rd-person shot);
  **false** if it's a POV / object-only shot where at most the hands appear. This decides the POV
  prefix on the output filename (true -> `3rdpov_`, false -> `1stpov_`), overriding the storyboard's
  prefix, which is sometimes wrong. Judge it from the footage.
- `on_screen`: one short line describing what's actually in the clip (helps the human reviewer).

Output JSON only.

## Candidates (example input)

```json
{
  "scenes": [
    { "scene": "Hook 1", "type": "broll", "line": "If you've been to Japan...",
      "shots": [ { "slug": "ai_waffle_weave_towels_hanging_in_japanese_hotel_bathroom",
                   "footage_name": "AI_waffle weave towels hanging in japanese hotel bathroom",
                   "description": "AI-generated serene Japanese hotel bathroom with waffle weave towels..." } ] },
    { "scene": "Scene 2", "type": "broll", "line": "Waffle weave. Lightweight...",
      "shots": [ { "slug": "1stpov_hand_pressing_waffle_towel", "footage_name": "1stPOV_hand pressing waffle towel",
                   "description": "Close-up tactile interaction showing texture" },
                 { "slug": "1stpov_wrapping_towel_around_body_drying_quickly", "footage_name": "1stPOV_wrapping towel around body",
                   "description": "Usage demonstrating quick drying performance" } ] }
  ]
}
```

## Output schema

```json
{
  "scene": "Scene 2",
  "type": "broll",
  "shot_slug": "1stpov_hand_pressing_waffle_towel",
  "confidence": 0.91,
  "person_in_frame": false,
  "on_screen": "Close-up of a hand pressing a folded waffle-weave towel."
}
```

The pipeline collects one of these per clip into a `matches` array and passes it (with the
parsed scenes) to `lib/rename.js > planJob`, which is fully deterministic from here on.
