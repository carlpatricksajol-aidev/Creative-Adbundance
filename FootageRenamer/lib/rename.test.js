// Quick self-test for the rename/organize logic. No deps: `node rename.test.js`.
// Exercises the real Onsen "001" storyboard (generated-VO / b-roll only) plus a synthetic
// talking-head scene, and asserts the tricky cases: slug derivation, multi-shot " + " split,
// version suffixing, take naming, the missing-shot diff, and low-confidence flagging.

const { deriveSlug, splitShots, planJob, applyPov } = require("./rename");

let pass = 0,
  fail = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual),
    e = JSON.stringify(expected);
  if (a === e) {
    pass++;
  } else {
    fail++;
    console.log(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`);
  }
}

// --- unit: slug + split -----------------------------------------------------
eq(deriveSlug("AI_waffle weave towels hanging in japanese hotel bathroom"),
   "ai_waffle_weave_towels_hanging_in_japanese_hotel_bathroom", "slug: spaces+prefix");
eq(deriveSlug("1stPOV_scrolling phone researching towels at night"),
   "1stpov_scrolling_phone_researching_towels_at_night", "slug: 1stPOV");
eq(splitShots("1stPOV_hand pressing waffle towel + 1stPOV_wrapping towel around body drying quickly").map(s => s.slug),
   ["1stpov_hand_pressing_waffle_towel", "1stpov_wrapping_towel_around_body_drying_quickly"], "split: ' + '");
eq(splitShots("-"), [], "split: dash = none");
eq(splitShots("Talking Head"), [], "split: 'Talking Head' = talking-head scene, no b-roll shot");
eq(splitShots("Talking-Head"), [], "split: 'Talking-Head' = talking-head scene");
eq(splitShots("Talking Head + AI_funding report dashboard").map(s => s.slug), ["ai_funding_report_dashboard"], "split: mixed cell drops 'Talking Head', keeps b-roll");

// --- POV correction from real footage (overrides wrong storyboard label) ----
eq(applyPov("1stpov_smelling_towel_and_smiling", true), "3rdpov_smelling_towel_and_smiling", "pov: person -> 3rdpov");
eq(applyPov("3rdpov_bathroom_with_waffle_towels_hanging_styled", false), "1stpov_bathroom_with_waffle_towels_hanging_styled", "pov: object -> 1stpov");
eq(applyPov("ai_waffle_weave_towels", true), "ai_waffle_weave_towels", "pov: ai_ untouched");
eq(applyPov("1stpov_x", null), "1stpov_x", "pov: unknown -> unchanged");
// in planJob: storyboard says 1stpov, but the clip has a person -> filename becomes 3rdpov
const pj = planJob(
  [{ scene: "Scene 6", footage_name: "1stPOV_smelling towel and smiling", shot_list_explanation: "talent smelling towel" }],
  [{ file: "vid.mov", scene: "Scene 6", shot_slug: "1stpov_smelling_towel_and_smiling", person_in_frame: true, confidence: 0.9 }],
  {});
eq(pj.renames[0].to, "3rdpov_smelling_towel_and_smiling.mov", "planJob applies POV from footage");

// --- Onsen storyboard (subset that covers the edge cases) -------------------
const onsen = [
  { scene: "Hook 1", script_line: "If you've been to Japan, you KNOW these towels.",
    footage_name: "AI_waffle weave towels hanging in japanese hotel bathroom" },
  { scene: "Scene 2", script_line: "Waffle weave. Lightweight. Luxurious. And most importantly, dries you INSTANTLY.",
    footage_name: "1stPOV_hand pressing waffle towel + 1stPOV_wrapping towel around body drying quickly" },
  { scene: "Scene 5", script_line: "The weave is not the same, and that's when I discovered Onsen.",
    footage_name: "3rdPOV_close up premium waffle weave texture" },
];

// What the vision step returned for the clips Ashley uploaded:
const matches = [
  { file: "DJI_0001.MOV", scene: "Hook 1", shot_slug: "ai_waffle_weave_towels_hanging_in_japanese_hotel_bathroom", confidence: 0.95 },
  { file: "DJI_0002.MOV", scene: "Scene 2", shot_slug: "1stpov_hand_pressing_waffle_towel", confidence: 0.9 },
  { file: "clip_take_a.mov", scene: "Scene 5", shot_slug: "3rdpov_close_up_premium_waffle_weave_texture", confidence: 0.88 },
  { file: "clip_take_b.mov", scene: "Scene 5", shot_slug: "3rdpov_close_up_premium_waffle_weave_texture", confidence: 0.82 }, // -> _v2
  { file: "random_blurry.mov", scene: "Scene 5", shot_slug: "3rdpov_close_up_premium_waffle_weave_texture", confidence: 0.31 }, // -> flagged
];

const r = planJob(onsen, matches, { client: "Onsen", creator: "Ashley" });
const to = (f) => (r.renames.find((x) => x.from === f) || {});

eq(to("DJI_0001.MOV").to, "ai_waffle_weave_towels_hanging_in_japanese_hotel_bathroom.mov", "broll rename");
eq(to("clip_take_a.mov").to, "3rdpov_close_up_premium_waffle_weave_texture.mov", "version 1");
eq(to("clip_take_b.mov").to, "3rdpov_close_up_premium_waffle_weave_texture_v2.mov", "version 2 suffix");
eq(r.flagged.some((f) => f.file === "random_blurry.mov"), true, "low-confidence flagged");
// Scene 2's second shot got no clip -> missing.
eq(r.missing.some((m) => m.slug === "1stpov_wrapping_towel_around_body_drying_quickly"), true, "missing 2nd shot of multi-shot scene");

// --- talking-head take naming ----------------------------------------------
const th = [{ scene: "Hook", type: "talkinghead", script_line: "Here are 5 reasons why I regret ketamine therapy.", footage_name: "-" }];
const thMatches = [
  { file: "A001.mov", scene: "Hook", type: "talkinghead", confidence: 0.9 },
  { file: "A002.mov", scene: "Hook", type: "talkinghead", confidence: 0.9 },
  { file: "A003.mov", scene: "Hook", type: "talkinghead", confidence: 0.9 },
];
const t = planJob(th, thMatches, { client: "Innerwell", creator: "Jane" });
eq(t.renames.map((x) => x.to),
   ["hook_here_are_5_reasons_take1.mov", "hook_here_are_5_reasons_take2.mov", "hook_here_are_5_reasons_take3.mov"],
   "talking-head takes");

console.log(`\n${pass} passed, ${fail} failed\n`);
console.log("--- sample report (Onsen) ---\n");
console.log(r.report);
process.exit(fail ? 1 : 0);
