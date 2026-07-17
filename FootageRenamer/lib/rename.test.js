// Quick self-test for the rename/organize logic. No deps: `node rename.test.js`.
// Exercises the real Onsen "001" storyboard (generated-VO / b-roll only) plus a synthetic
// talking-head scene, and asserts the tricky cases: slug derivation, multi-shot " + " split,
// version suffixing, take naming, the missing-shot diff, and low-confidence flagging.

const { deriveSlug, splitShots, planJob, applyPov, applyReconcile } = require("./rename");

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

eq(to("DJI_0001.MOV").to, "Ashley_ai_waffle_weave_towels_hanging_in_japanese_hotel_bathroom.mov", "broll rename (Talent prefix)");
eq(to("clip_take_a.mov").to, "Ashley_3rdpov_close_up_premium_waffle_weave_texture.mov", "version 1");
eq(to("clip_take_b.mov").to, "Ashley_3rdpov_close_up_premium_waffle_weave_texture V2.mov", "version 2 suffix ( V2)");
eq(r.flagged.some((f) => f.file === "random_blurry.mov"), true, "low-confidence flagged");
// Scene 2's second shot got no clip -> missing.
eq(r.missing.some((m) => m.slug === "1stpov_wrapping_towel_around_body_drying_quickly"), true, "missing 2nd shot of multi-shot scene");

// --- talking-head naming: Talent_Concept_<Hook/Script label> + V2/V3 (the reviewer's convention) --
const th = [{ scene: "Hook 1", type: "talkinghead", script_line: "Here are 5 reasons why I regret ketamine therapy.", footage_name: "-" }];
const thMatches = [
  { file: "A001.mov", scene: "Hook 1", type: "talkinghead", confidence: 0.9 },
  { file: "A002.mov", scene: "Hook 1", type: "talkinghead", confidence: 0.9 },
  { file: "A003.mov", scene: "Hook 1", type: "talkinghead", confidence: 0.9 },
];
const t = planJob(th, thMatches, { client: "ADR", creator: "Grace", concept: "004_Rapid Fire Questions" });
eq(t.renames.map((x) => x.to),
   ["Grace_004_Rapid Fire Questions_Hook 1.mov", "Grace_004_Rapid Fire Questions_Hook 1 V2.mov", "Grace_004_Rapid Fire Questions_Hook 1 V3.mov"],
   "talking-head: Talent_Concept_Label + V2/V3, no script-line slug");

// --- global talking-head reconciliation (fix cross-clip hook swap + recover a null) ----------
// Models the real Oasis failure: per-clip matching swapped Hook 1/Hook 2 and left one clip null.
const rcScenes = [
  { scene: "Hook 1", type: "talkinghead", script_line: "I'm never taking another pill.", footage_name: "-" },
  { scene: "Hook 2", type: "talkinghead", script_line: "After years of failed treatments.", footage_name: "-" },
  { scene: "Scene 2", type: "talkinghead", script_line: "But Oasis made me believe it.", footage_name: "-" },
];
const rcMatches = [
  { file: "pill_after_pill_2.mp4", type: "talkinghead", scene: "Hook 2", confidence: 0.8, transcript: "done chasing pill after pill" },
  { file: "pill_after_pill.mp4",   type: "talkinghead", scene: "Hook 1", confidence: 0.9, transcript: "spravato after years of failed" },
  { file: "found_oasis.mp4",       type: "talkinghead", scene: null,     confidence: 0.5, transcript: "found oasis mental health" },
];
// what the reconcile pass (LLM) returns, keyed by file:
const recon = {
  "pill_after_pill_2.mp4": { scene: "Hook 1", confidence: 1 },
  "pill_after_pill.mp4":   { scene: "Hook 2", confidence: 1 },
  "found_oasis.mp4":       { scene: "Scene 2", confidence: 0.9 },
};
applyReconcile(rcMatches, recon);
const rc = planJob(rcScenes, rcMatches, { client: "Oasis", creator: "Natasha" });
const rcTo = (f) => (rc.renames.find((x) => x.from === f) || {}).scene;
eq(rcTo("pill_after_pill_2.mp4"), "Hook 1", "reconcile: hook swap corrected (clip 2 -> Hook 1)");
eq(rcTo("pill_after_pill.mp4"), "Hook 2", "reconcile: hook swap corrected (clip 1 -> Hook 2)");
eq(rcTo("found_oasis.mp4"), "Scene 2", "reconcile: null recovered to Scene 2");
eq(rc.flagged.length, 0, "reconcile: nothing left flagged");
// a clip with no reconcile entry keeps its per-clip guess; b-roll is never touched
const keepMatches = [{ file: "x.mp4", type: "talkinghead", scene: "Hook 1", confidence: 0.9 },
                     { file: "b.mp4", type: "broll", scene: "Scene 2", shot_slug: "s", confidence: 0.9 }];
applyReconcile(keepMatches, { "other.mp4": { scene: "Hook 2", confidence: 1 } });
eq(keepMatches[0].scene, "Hook 1", "reconcile: unmatched clip keeps per-clip guess");
eq(keepMatches[1].scene, "Scene 2", "reconcile: b-roll untouched");

// reconcile placed the clip but omitted confidence -> keep per-clip conf, still renamed via the
// reconciled bypass even though the per-clip confidence (0.2) is below the 0.6 threshold
const omit = [{ file: "omit.mp4", type: "talkinghead", scene: "Hook 2", confidence: 0.2, transcript: "x" }];
applyReconcile(omit, { "omit.mp4": { scene: "Hook 1", confidence: null } });
const omitPlan = planJob(rcScenes, omit, {});
eq((omitPlan.renames[0] || {}).scene, "Hook 1", "reconcile: omitted-confidence placement still renames (bypass)");
eq(omitPlan.flagged.length, 0, "reconcile: omitted-confidence not demoted to flagged");

// reconcile could not place it (scene:null) -> keep the per-clip guess, never clobber to flagged
const keepNull = [{ file: "keep.mp4", type: "talkinghead", scene: "Scene 2", confidence: 0.8, transcript: "y" }];
applyReconcile(keepNull, { "keep.mp4": { scene: null, confidence: 0.9 } });
eq(keepNull[0].scene, "Scene 2", "reconcile: null scene keeps per-clip scene");
eq(keepNull[0].reconciled, undefined, "reconcile: null scene does not mark reconciled");
eq(((planJob(rcScenes, keepNull, {}).renames[0]) || {}).scene, "Scene 2", "reconcile: null scene still renames via per-clip");

// reconcile reassigns with a modest confidence (0.4) -> still renamed (authoritative), not demoted
const modest = [{ file: "mod.mp4", type: "talkinghead", scene: "Hook 2", confidence: 0.9, transcript: "z" }];
applyReconcile(modest, { "mod.mp4": { scene: "Hook 1", confidence: 0.4 } });
const modestPlan = planJob(rcScenes, modest, {});
eq((modestPlan.renames[0] || {}).scene, "Hook 1", "reconcile: modest-confidence reassignment still renames");
eq(modestPlan.flagged.length, 0, "reconcile: modest-confidence reassignment not flagged");

// --- auto-organize extras (footage the creator shot beyond the storyboard) -------------------
// Models the Vivienne Goins case: clips that match no storyboard shot but are clearly usable get a
// descriptive name into broll/aroll instead of being flagged; only unreadable clips flag.
const exScenes = [{ scene: "Scene 1", type: "broll", footage_name: "1stPOV_planned shot", script_line: "" }];
const exMatches = [
  { file: "coffee.mov",  type: "broll",      scene: null, confidence: 0,   describe: "making coffee at home", person_in_frame: true },
  { file: "calc.mov",    type: "broll",      scene: null, confidence: 0,   describe: "handwritten calculations", person_in_frame: false },
  { file: "coffee2.mov", type: "broll",      scene: null, confidence: 0,   describe: "making coffee at home", person_in_frame: true },
  { file: "rapid1.mov",  type: "talkinghead",scene: null, confidence: 0.5, transcript: "answers common debt questions", describe: "rapid fire debt questions" },
  { file: "junk.mov",    type: "broll",      scene: null, confidence: 0,   describe: "" },
  { file: "symbol.mov",  type: "broll",      scene: null, confidence: 0,   describe: "☕☕☕", person_in_frame: true }, // slug collapses to "" -> must flag, not ".mov"
];
const exPlan = planJob(exScenes, exMatches, { creator: "Grace", concept: "004_Rapid Fire Questions" });
const exTo = (f) => (exPlan.renames.find((x) => x.from === f) || {});
eq(exTo("coffee.mov").to, "Grace_004_Rapid Fire Questions_3rdpov_making_coffee_at_home.mov", "extra: b-roll gets Talent_Concept + pov+describe");
eq(exTo("coffee.mov").folder, "broll", "extra: b-roll lands in broll/");
eq(exTo("coffee.mov").extra, true, "extra: marked as extra");
eq(exTo("calc.mov").to, "Grace_004_Rapid Fire Questions_1stpov_handwritten_calculations.mov", "extra: object b-roll -> 1stpov");
eq(exTo("coffee2.mov").to, "Grace_004_Rapid Fire Questions_3rdpov_making_coffee_at_home V2.mov", "extra: duplicate describe -> V2");
eq(exTo("rapid1.mov").folder, "aroll", "extra: unplaced talking-head lands in aroll/");
eq(exTo("rapid1.mov").to, "Grace_004_Rapid Fire Questions_rapid_fire_debt_questions.mov", "extra: talking-head named by describe (prefixed)");
eq(exPlan.flagged.map((f) => f.file).sort(), ["junk.mov", "symbol.mov"], "extra: no-describe and symbol-only clips flag (no nameless rename)");
eq(exPlan.renames.every((r) => /[a-z0-9]/.test(r.to.replace(/\.\w+$/, ""))), true, "extra: no rename has an empty name body");
eq(/## Extra footage organized/.test(exPlan.report), true, "extra: report has an Extra footage section");

console.log(`\n${pass} passed, ${fail} failed\n`);
console.log("--- sample report (Onsen) ---\n");
console.log(r.report);
process.exit(fail ? 1 : 0);
