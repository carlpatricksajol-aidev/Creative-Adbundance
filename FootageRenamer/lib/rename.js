// Footage Renamer — deterministic rename / organize logic.
//
// Pure functions, zero dependencies. Runs in plain Node (see rename.test.js) and the
// function bodies paste straight into an n8n Code node. The LLM/Gemini steps produce the
// `scenes` (storyboard) and `matches` (clip -> scene) inputs; everything in here is
// deterministic so the naming never drifts.
//
// See: Docs/Video Editor/Footage Renaming Automation - Spec.md

// "AI_waffle weave towels in japanese bathroom" -> "ai_waffle_weave_towels_in_japanese_bathroom"
function deriveSlug(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_") // any run of non-alphanumerics -> a single underscore
    .replace(/^_+|_+$/g, "");    // trim leading/trailing underscores
}

// One scene's Footage Name cell can list several shots joined by " + " or commas.
// "1stPOV_hand pressing towel + 1stPOV_wrapping towel" -> two shots.
function splitShots(footageCell) {
  const raw = String(footageCell || "").trim();
  if (!raw || !/[a-z0-9]/i.test(raw)) return []; // blank / "-" / en-dash = no b-roll (talking-head)
  if (/^talking[\s_-]*heads?$/i.test(raw)) return []; // "Talking Head" is a scene type, not a b-roll shot
  return raw
    .split(/[+,]/) // split on "+" or "," (char class: no backslash escapes, survives any embedding)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !/^talking[\s_-]*heads?$/i.test(s)) // drop "Talking Head" markers from mixed cells
    .map((footage_name) => ({ footage_name, slug: deriveSlug(footage_name) }));
}

// "Scene 7" -> "scene_7", "Hook 1" -> "hook_1", "CTA" -> "cta"
function sceneKey(sceneId) {
  return deriveSlug(sceneId);
}

// First few words of the line, for talking-head take filenames.
function lineSlug(line, maxWords = 4) {
  return String(line || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxWords)
    .join("_");
}

// Correct the POV prefix from the ACTUAL footage, not the (often wrong) storyboard label:
// a person/talent visible in frame -> 3rdpov; object/POV shot (at most hands) -> 1stpov.
// Only rewrites real-footage pov prefixes; leaves ai_ and other prefixes alone. personInFrame
// null/undefined -> leave the slug untouched.
function applyPov(slug, personInFrame) {
  if (personInFrame == null) return slug;
  if (!/^(1stpov|3rdpov)_/i.test(slug)) return slug;
  return (personInFrame ? "3rdpov_" : "1stpov_") + slug.replace(/^(1stpov|3rdpov)_/i, "");
}

function extOf(file) {
  const m = String(file || "").match(/\.[a-z0-9]+$/i);
  return m ? m[0].toLowerCase() : "";
}

function fmtConf(c) {
  return c == null ? "n/a" : Number(c).toFixed(2);
}

// Normalize the LLM's parsed storyboard into the canonical shape the planner uses.
// Accepts either {footage_name, shot_list_explanation} per row or a pre-split {shots:[...]}.
function normalizeScenes(scenes) {
  return (scenes || []).map((s) => {
    const desc = s.shot_list_explanation || s.description || "";
    const shots =
      s.shots && s.shots.length
        ? s.shots.map((sh) => ({
            footage_name: sh.footage_name,
            slug: sh.slug || deriveSlug(sh.footage_name),
            description: sh.description || desc || "",
          }))
        : splitShots(s.footage_name).map((sh) => ({ ...sh, description: desc }));
    const type = s.type || (shots.length ? "broll" : "talkinghead");
    return {
      scene: s.scene,
      key: sceneKey(s.scene),
      type,
      line: s.line || s.script_line || "",
      overlay: s.overlay || "",
      shots,
    };
  });
}

// scenesRaw : parsed storyboard (LLM output)
// matches   : [{ file, scene, type?, shot_slug?, confidence }]  (vision/audio match step)
// opts      : { client, creator, confidenceThreshold = 0.6 }
function planJob(scenesRaw, matches, opts = {}) {
  const threshold = opts.confidenceThreshold == null ? 0.6 : opts.confidenceThreshold;
  const scenes = normalizeScenes(scenesRaw);

  const sceneById = {};
  scenes.forEach((s) => {
    sceneById[s.scene] = s;
  });

  const renames = [];
  const flagged = [];
  const usedBrollSlug = {}; // slug -> count, for _v2/_v3
  const usedTake = {};      // sceneKey -> count, for _take1/2/3

  const ok = (m) => (m.reconciled || (m.confidence == null ? 1 : m.confidence) >= threshold) && m.scene;
  const accepted = (matches || []).filter(ok);
  const rejected = (matches || []).filter((m) => !ok(m));

  for (const m of accepted) {
    const ext = extOf(m.file);
    const scene = sceneById[m.scene];
    if (!scene) {
      flagged.push({ file: m.file, reason: `matched unknown scene "${m.scene}"`, confidence: m.confidence });
      continue;
    }
    const isTalk = scene.type === "talkinghead" || m.type === "talkinghead";
    if (isTalk) {
      const n = (usedTake[scene.key] = (usedTake[scene.key] || 0) + 1);
      renames.push({
        from: m.file,
        to: `${scene.key}_${lineSlug(scene.line)}_take${n}${ext}`,
        folder: "aroll",
        scene: m.scene,
        confidence: m.confidence,
      });
    } else {
      const baseSlug = m.shot_slug || (scene.shots[0] && scene.shots[0].slug);
      if (!baseSlug) {
        flagged.push({ file: m.file, reason: `b-roll match to "${m.scene}" with no shot slug`, confidence: m.confidence });
        continue;
      }
      const slug = applyPov(baseSlug, m.person_in_frame); // POV from the real footage, not the storyboard label
      const n = (usedBrollSlug[slug] = (usedBrollSlug[slug] || 0) + 1);
      renames.push({
        from: m.file,
        to: n === 1 ? `${slug}${ext}` : `${slug}_v${n}${ext}`,
        folder: "broll",
        scene: m.scene,
        shot_slug: baseSlug, // storyboard slug, for the missing-shot diff
        confidence: m.confidence,
      });
    }
  }

  // clips that matched no storyboard shot: if usable, organize as EXTRA footage (descriptive name
  // into broll/aroll) rather than leaving them behind; flag only when there is nothing to name by.
  for (const m of rejected) {
    const ext = extOf(m.file);
    const desc = String(m.describe || "").trim();
    const tr = String(m.transcript || "").trim();
    const thBase = lineSlug(desc, 6) || lineSlug(tr, 6); // topic slug for talking-head (empty -> flag)
    const brBody = lineSlug(desc, 6);                    // describe slug for b-roll (empty -> flag)
    if (m.type === "talkinghead" && thBase) {
      const n = (usedTake["x:" + thBase] = (usedTake["x:" + thBase] || 0) + 1);
      renames.push({ from: m.file, to: `${thBase}_take${n}${ext}`, folder: "aroll", scene: "(extra)", confidence: m.confidence, extra: true });
    } else if (m.type === "broll" && brBody) {
      const pov = m.person_in_frame === true ? "3rdpov_" : m.person_in_frame === false ? "1stpov_" : "";
      const slug = pov + brBody;
      const n = (usedBrollSlug[slug] = (usedBrollSlug[slug] || 0) + 1);
      renames.push({ from: m.file, to: n === 1 ? `${slug}${ext}` : `${slug}_v${n}${ext}`, folder: "broll", scene: "(extra)", shot_slug: null, confidence: m.confidence, extra: true });
    } else {
      flagged.push({
        file: m.file,
        reason: m.scene ? `low confidence (${fmtConf(m.confidence)}) for "${m.scene}"` : "no usable description to organize",
        confidence: m.confidence,
      });
    }
  }

  // Missing-shot diff: every storyboard shot / talking-head line that got no clip.
  const matchedSlugs = new Set(renames.filter((r) => r.shot_slug).map((r) => r.shot_slug));
  const matchedTalkScenes = new Set(renames.filter((r) => r.folder === "aroll").map((r) => r.scene));
  const missing = [];
  for (const s of scenes) {
    if (s.type === "talkinghead") {
      if (!matchedTalkScenes.has(s.scene)) missing.push({ scene: s.scene, type: "talkinghead", line: s.line });
    } else {
      for (const sh of s.shots) {
        if (!matchedSlugs.has(sh.slug))
          missing.push({ scene: s.scene, type: "broll", footage_name: sh.footage_name, slug: sh.slug });
      }
    }
  }

  const report = buildReport({ client: opts.client, creator: opts.creator, renames, missing, flagged });
  return { renames, missing, flagged, report };
}

function buildReport({ client, creator, renames, missing, flagged }) {
  const L = [];
  L.push(`# ${client || "?"} / ${creator || "?"} - footage rename report`);
  L.push("");
  const sb = renames.filter((r) => !r.extra);
  const ex = renames.filter((r) => r.extra);
  L.push(`Status: ${renames.length} renamed (${sb.length} storyboard + ${ex.length} extra), ${missing.length} missing, ${flagged.length} need review`);
  L.push("");

  L.push(`## Renamed - storyboard shots (${sb.length})`);
  for (const r of sb) L.push(`- ${r.from}  ->  ${r.folder}/${r.to}  (${r.scene}, conf ${fmtConf(r.confidence)})`);
  L.push("");

  L.push(`## Extra footage organized - not in the storyboard (${ex.length})`);
  for (const r of ex) L.push(`- ${r.from}  ->  ${r.folder}/${r.to}`);
  if (!ex.length) L.push("- none");
  L.push("");

  L.push(`## Missing shots (${missing.length}) - storyboard called for these, no clip matched`);
  for (const m of missing) {
    if (m.type === "talkinghead") L.push(`- ${m.scene} - talking-head - "${m.line}"`);
    else L.push(`- ${m.scene} - b-roll - ${m.slug}  ("${m.footage_name}")`);
  }
  if (!missing.length) L.push("- none");
  L.push("");

  L.push(`## Needs review (${flagged.length}) - left with original name`);
  for (const f of flagged) L.push(`- ${f.file} - ${f.reason}`);
  if (!flagged.length) L.push("- none");
  L.push("");

  return L.join("\n");
}

// Apply a global talking-head reconciliation result onto the per-clip matches. `recon` is
// { [file]: {scene, confidence} } from the reconcile pass. Only talking-head matches are touched,
// and only when reconcile actually placed the clip (non-null scene): a null/absent entry means
// "reconcile could not place this" -> keep the per-clip guess (never clobber a good match). A placed
// clip is marked `reconciled` so planJob accepts it regardless of the per-clip confidence threshold
// (deliberately-similar lines are inherently modest-confidence; reconcile is the authoritative call).
// Confidence is overwritten only when reconcile supplied a numeric one. Mutates + returns matches.
function applyReconcile(matches, recon) {
  if (!recon) return matches;
  for (const m of matches) {
    if (m.type !== "talkinghead") continue;
    const r = recon[m.file];
    if (!r || r.scene == null) continue;
    m.scene = r.scene;
    m.reconciled = true;
    if (r.confidence != null) m.confidence = r.confidence;
  }
  return matches;
}

// Notion storyboard table -> raw scene rows (feed to normalizeScenes/planJob).
// `rows` is either Notion `table_row` blocks (we extract cells) or plain arrays of strings.
// Reads by HEADER name, so column order / an extra column can't break it.
function parseStoryboardTable(rows) {
  if (!rows || rows.length < 2) return [];
  const cellsOf = (r) =>
    Array.isArray(r)
      ? r
      : r && r.table_row
      ? r.table_row.cells.map((c) => c.map((t) => t.plain_text || "").join(""))
      : [];
  const header = cellsOf(rows[0]).map((h) => String(h).trim().toLowerCase());
  const col = (name) => header.indexOf(name);
  const ci = {
    scene: col("scene"),
    line: col("script line"),
    overlay: col("overlay"),
    footage: col("footage name"),
    desc: col("shot list explanation"),
  };
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const c = cellsOf(rows[i]);
    const g = (idx) => (idx >= 0 ? String(c[idx] || "").trim() : "");
    const scene = g(ci.scene);
    if (!scene) continue; // skip blank/spacer rows
    out.push({
      scene,
      line: g(ci.line),
      overlay: g(ci.overlay),
      footage_name: g(ci.footage),
      shot_list_explanation: g(ci.desc),
    });
  }
  return out;
}

const api = { deriveSlug, splitShots, sceneKey, lineSlug, applyPov, normalizeScenes, planJob, buildReport, applyReconcile, parseStoryboardTable };
if (typeof module !== "undefined" && module.exports) module.exports = api;
