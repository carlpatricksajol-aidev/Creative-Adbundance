# 🎬 AI Video Production Pipeline
**Project:** Creative Abundance — AI Video Ad Generation
**Last Updated in Docs:** May 29, 2026
**Stack:** Higgsfield (Seedance 2.0) · KIE AI (Sora 2 / Sora 2 Pro) · Nano Banana Pro · Claude Code Skills

---

## ⏱️ Timeline Overview

| Date | What Happened |
|------|--------------|
| Mar 13, 2026 | KIE AI confirmed for image-to-video; Higgsfield API confirmed (Python SDK available) |
| Mar 26, 2026 | First AI output vs reference comparison; Nano Banana 2 prompting research |
| Apr 1, 2026 | Content creator footage QA system designed (Twelve Labs + GPT-4o + Runway) |
| Apr 8, 2026 | Seedance 2.0 production prompting started (MCT oil video client) |
| Apr 17, 2026 | Seedance motion direction fix; audio artifact fix; caption/VO sync fix |
| Apr 17, 2026 | Claude Code skills repository research (GitHub repos for agency skills) |
| **Apr 22, 2026** | **All 11 skills uploaded and read; Kling removed; Sora 2/2 Pro skill planning begun** |
| Apr 22, 2026 | Sora 2 Pro capability matrix drafted; production plan output format designed |
| May 22, 2026 | Music video generation (separate project) — Google File API polling fixed in n8n |

---

## 🚦 Current Status (as of Apr 22, 2026)

| Skill / Component | Status | Notes |
|-------------------|--------|-------|
| `client-brand-book` | ✅ DONE | |
| `creative-strategist` | ✅ DONE | |
| `reference-reader` | ✅ DONE | |
| `scriptwriter` | ✅ DONE | |
| `ugc-writer` | ✅ DONE | |
| `hook-library` | ✅ DONE | |
| `shot-list-builder` | ✅ DONE | For Seedance only; do NOT use for Sora |
| `nano-banana-prompter` | ✅ DONE | |
| `seedance-prompter` | ✅ DONE | |
| `kling-prompter` | ❌ REMOVED | Kling removed from stack Apr 22 |
| `compliance-reviewer` | ✅ DONE | |
| `sora-prompter` | 🟡 PLANNED, NOT BUILT | Needs your capability matrix input before writing |
| `sora-capability-matrix.md` | 🟡 DRAFTED, NOT FINALIZED | Two questions pending your answer (see below) |

**Sora 2 Pro prompter is blocked pending your answers:**
1. Which items in the capability matrix are wrong based on your real-world experience?
2. For "workaroundable" beats: preference for (a) downscope, (b) route to Seedance, or (c) designer plate in post?

---

## ❌ What Was Removed / Changed

| Removed | When | Why |
|---------|------|-----|
| `kling-prompter` skill | Apr 22, 2026 | Kling removed from stack; not using Kling anymore |
| Kling 3.0 model | Apr 22, 2026 | Moving to Sora 2 / Sora 2 Pro + Seedance 2.0 only |
| Sora 3.0 | Apr 22, 2026 | Not moving forward with this model |
| 11-skill focus on Seedance + Kling | Apr 22, 2026 | Rebuilt to focus on Seedance 2.0 + Sora 2/2 Pro |
| Runway for gap-filling | Never built | Was in the QA automation design; deprioritized |

---

## 🔧 Video Model Stack (Current)

| Model | Platform | Use Case | Access |
|-------|----------|----------|--------|
| Seedance 2.0 | Higgsfield | Standard video ads, bulk runs, I2V | Higgsfield API |
| Sora 2 | KIE AI | Mid-tier video | KIE AI (MaaS Fusion ~25% of Google direct pricing) |
| Sora 2 Pro | KIE AI | Hero/premium executions | KIE AI |
| ~~Kling 3.0~~ | ~~Higgsfield~~ | ~~Removed~~ | — |
| ~~Sora 3.0~~ | — | ~~Not using~~ | — |

---

## 🔧 Seedance 2.0 Prompting (✅ Working)

### Mode
- Primary: **I2V** — uses a generated or uploaded reference frame as starting image
- Secondary: T2V — for shots with no specific avatar reference

### Key Motion Fixes

**Pour direction (Apr 17, 2026):**
Wrong: "tilts bottle" (ambiguous direction)
Correct:
```
Motion: the hand slowly tilts the bottle further downward so the oil 
pours directly INTO the mug — the liquid stream flows down into the 
center of the cup. The bottle opening moves toward the mug.
```

**Audio artifacts at specific timestamps:**
Seedance cannot fix a specific time range of audio. Only option: strip audio in post (CapCut/Premiere). Negative prompts for audio are unreliable.

**Caption/VO sync:**
Seedance is a generation tool, NOT an editing tool. Fix misaligned captions in post:
- CapCut Auto Captions (re-generates synced text)
- CapCut Lip Sync button (mouth movement alignment)
- HeyGen or Veed.io for more precise fixes

### Shot Settings
- 9:16 for Meta/TikTok ads
- 3s–6s per shot
- Pro quality for hero shots; Standard for B-roll
- Audio enabled for VO/dialogue shots

---

## 🔧 Sora 2 Pro Prompter (🟡 In Planning)

### Why Sora 2 Pro
Better cinematic quality for hero executions. Longer generation windows. Used via KIE AI at ~25% of Google's direct Sora pricing.

### Capability Matrix (Draft — Needs Your Verification)

| Capability | Status | Notes |
|------------|--------|-------|
| Single continuous shot | ✅ Yes | Best use case |
| Avatar locked to reference | ✅ Yes | Via start_image |
| Product in shot | ✅ Yes | Clear physical product |
| Camera moves | ✅ Yes | Must specify explicitly |
| Split-screen layouts | ⚠️ Workaround | Designer composite needed |
| TikTok/phone screen overlays | ❌ No | Designer plate required |
| Multi-person shots | ⚠️ Risky | Inconsistent results |
| Animated UI overlays | ❌ No | Designer plate required |
| Text overlay captions | ❌ No | Designer plate required |

**⚠️ These are best guesses — verify against your real generations before finalizing.**

### Sora Prompter Output Format (Designed, Not Built)
Instead of one prompt, the skill will output a production plan:
```
# Production plan — [Concept name]

## Sora 2 Pro generations (N total)
- Generation 1: [shot blocks for beats X, Y]

## Designer plates required
- Beat 1: TikTok scroll screen recording (~3s)

## Assembly notes
- Beat 1: composite Sora gen 1 + TikTok recording
```

---

## 🔧 Shot List Builder Skill (✅ Done)

Used for Seedance only. Breaks finalized script into shots.

**Output:**
1. **Style Bible** — avatar description, outfit per scene, lighting, color grade, environment rules
2. **Shot Table** — numbered rows: shot #, beat, avatar state, outfit, setting, camera, lighting, motion, Seedance prompt

**Important:** Shot list builder is for Seedance. For Sora 2/2 Pro, use `sora-prompter` (when built) — Sora takes the whole multi-beat generation in one prompt.

---

## 🔧 Content Creator Footage QA (🟡 Designed, Not Built)

**Problem:** Remote content creators upload to Dropbox without naming conventions. Video editor was manually checking every file.

**Solution Architecture (Apr 1, 2026):**
```
Content creator fills categorized form (B-roll / storyboard / requested)
  → Twelve Labs indexes each video on arrival
  → GPT-4o reads storyboard shot list → outputs gap report
  → Runway fills flagged gaps (was planned; not built)
  → Human review: only flagged clips + AI-generated content (~15 min)
```

**Status:** Architecture designed only. Not built in n8n.

**Key n8n limitation:** Code nodes on this n8n setup cannot make HTTP calls (`fetch` and `require('https')` both blocked). All HTTP calls must go through HTTP Request nodes.

---

## 🔧 Music Video Generation (May 22, 2026)

Separate client project. Google File API polling in n8n.

**Bug:** Code node tried to use `fetch` and `require('https')` — both blocked on this n8n instance.

**Fix: Move HTTP call out of Code node**
```
Extract Google URI
  → Get File State (HTTP Request node)
     URL: https://generativelanguage.googleapis.com/v1beta/files/{fileId}?key=API_KEY
     Settings: Continue on Fail: ON
  → Check All Active (Code node — logic only, no HTTP)
  → IF all_active = true → Aggregate → Gemini
     ELSE → Wait 30s → back to Get File State
```

```javascript
// Check All Active Code node
const stateResponses = $input.all();
const originalItems = $('Extract Google URI').all();
const allActive = stateResponses.every(item => {
  if (item.json.error) return true;
  const state = item.json.state;
  if (!state) return true;
  return state === 'ACTIVE';
});
return originalItems.map((orig, i) => ({
  json: { ...orig.json, live_state: stateResponses[i]?.json?.state || 'UNKNOWN', all_active: allActive }
}));
```

---

## 🐞 All Bugs — Chronological

| Date | Area | Bug | Fix |
|------|------|-----|-----|
| Apr 17 | Seedance | Pour going wrong direction | Explicit: "pours directly INTO the mug", "bottle opening moves toward the mug" |
| Apr 17 | Seedance | Audio artifact at specific timestamp | Cannot fix in Seedance — strip in CapCut/Premiere |
| Apr 17 | Seedance | VO/caption misalignment | Fix in post: CapCut Auto Captions or Lip Sync |
| May 22 | n8n Code node | `fetch` and `require('https')` blocked | Move HTTP call to HTTP Request node; Code node handles logic only |
| May 22 | n8n loop | `google_file_uri` lost when HTTP Request replaces item data | Read original items from `$('Extract Google URI')` directly |

---

## ⏭️ What's Next

1. **Answer the two Sora questions** so the `sora-prompter` skill can be finalized
2. Build `sora-capability-matrix.md` as a separate file the skill can reference
3. Build content creator QA system in n8n (Twelve Labs + GPT-4o)
4. Confirm music video generation workflow runs end-to-end
