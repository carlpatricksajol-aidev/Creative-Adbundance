# 🧠 SA-2: Concept Generation Pipeline
**Project:** Creative Abundance — Automated Concept + Script Writing
**Last Updated in Docs:** May 29, 2026
**Stack:** n8n · Airtable · Claude API (OpenRouter) · Google Slides · Google Drive · Foreplay API (removed)

---

## ⏱️ Timeline Overview

| Date | What Happened |
|------|--------------|
| Apr 10, 2026 | SA-2 fully planned; Foreplay API integrated for inspiration mining; all 12 nodes mapped |
| Apr 13, 2026 | AI Agent concept numbering bug found (token limit cutting off at #084) |
| Apr 15, 2026 | SA-1 form feeds SA-2 via webhook; SA-2 workflow restructuring begins |
| Apr 22, 2026 | **Foreplay replaced with Google Slides** as inspiration source; all Foreplay nodes listed for removal |
| Apr 27, 2026 | LangChain Agent error fixed (missing Chat Model sub-node) |
| Apr 29, 2026 | Airtable webhook fixed (wrong ID types) |
| Apr 30, 2026 | Foreplay duplicate results problem diagnosed and fixes documented |
| May 1, 2026 | SA-2 restructure confirmed; Google Slides GET node designed; Parse Slides code written |
| May 5, 2026 | SA-2 extended with SA-3 thumbnail flow; KIE AI thumbnail generation started |
| May 12, 2026 | Parse Concept Slots object/array bug fixed |
| **May 1, 2026** | **Generate 3 Variants node added — 5 concepts × 3 variants = 15 Airtable records per batch** |
| May 5–13, 2026 | Google Slides concept deck batchUpdate built; layout fixes applied |

---

## 🚦 Current Status (as of May 13, 2026)

| Component | Status | Notes |
|-----------|--------|-------|
| Webhook Trigger | ✅ DONE | Receives SA-1 payload |
| Parse Webhook Payload | ✅ DONE | `body.customData` + `'Platforms Declaration'` field fix |
| Search Brand Brain | ✅ DONE | Root level fields, not `.fields` |
| Foreplay inspiration | ❌ REMOVED | Replaced Apr 22, 2026 |
| Google Slides GET (inspiration) | ✅ DONE | Replaces Foreplay |
| Parse Slides (Code node) | ✅ DONE | Extracts text content from slides[] |
| Write Concepts (AI Agent) | ✅ DONE | System prompt finalized; token limit fix applied |
| Parse Concept Slots | ✅ DONE | Object→array fix applied |
| Generate 3 Variants | ✅ DONE | A/B/C angles per concept |
| Write Script / Write PROMPT | ✅ DONE | Per variant, includes variant_label + variant_angle |
| CS To Review Create Record | ✅ DONE | One record per variant (15 per batch of 5 concepts) |
| Build Google Slides Requests | ✅ DONE | Layout fixes: Y positions, no footer, URL validation |
| Create Concept Slide (batchUpdate) | ✅ DONE | |
| Slack notify | ⬜ PENDING | |

**The last active build date was May 13, 2026.** The full end-to-end run (5 concepts → 15 Airtable records → 15 Google Slides) has not been confirmed tested.

---

## ❌ What Was Removed

| Removed | When | Why |
|---------|------|-----|
| Foreplay1 (HTTP Request) | Apr 22, 2026 | Returns identical results daily; replaced by Google Slides |
| Loop Over Items (keyword loop) | Apr 22, 2026 | Only existed to loop Foreplay API calls |
| Keyword Builder2 (AI Agent) + OpenRouter sub-node | Apr 22, 2026 | Built keywords for Foreplay search — no longer needed |
| Code in JavaScript21 | Apr 22, 2026 | Formatted keywords array for Foreplay |
| Code in JavaScript20 | Apr 22, 2026 | Parsed Foreplay response — replaced by Parse Slides |
| TwelveLabs visual analysis | Never built | Estimated 30–90 min per run (20–30 ads × 1–3 min indexing) — too slow |
| Meta Ad Library | Blocked | Owner needs identity verification at facebook.com/ID |
| TikTok Commercial Content API | Blocked | Pending developer portal approval |
| TikTok Business Discovery API | Investigated Apr 10, rejected | Returns organic trending content only — not paid ad data |

---

## 🏗️ Current Flow

```
Webhook Trigger (receives SA-1 JSON)
  → Parse Webhook Payload (Code node)
  → Search Brand Brain (Airtable)
  → Google Slides GET (replaces Foreplay)
  → Parse Slides (Code node)
  → Merge Everything
  → Write Concepts (AI Agent — Claude via OpenRouter)
  → Parse Concept Slots (Code node)
  → Generate 3 Variants (Code node)
  → [Loop per variant]
      → Write PROMPT / Write Script (AI Agent)
      → CS To Review Create Record (Airtable)
      → Build Google Slides Requests (Code node)
      → Create Concept Slide (batchUpdate)
```

---

## 🔧 Key Nodes

### Parse Concept Slots (Code Node) — Fixed May 12, 2026
Bug: `concept_slots` arrives as object `{}` not array `[]`.
```javascript
const item = $input.first().json;
const raw = item.concept_slots || {};
const slots = Array.isArray(raw) ? raw : Object.values(raw);
return slots
  .filter(slot => slot && slot.trim() !== '')
  .map(slot => {
    const keyword = slot.includes('—') || slot.includes('–') || slot.includes(' - ')
      ? slot.split(/—|–| - /).pop().trim()
      : slot.trim();
    return { json: { ...item, concept_slot: slot, keyword } };
  });
```
**Secondary issue:** Even after fix, slots appeared empty in test. Root cause: testing node in isolation with stale data — upstream AI Agent wasn't populating `concept_slots`. Must run full workflow end-to-end.

### Generate 3 Variants (Code Node) — Added May 1, 2026
```javascript
return [
  { json: { ...item, variant_label: 'Variant A', variant_angle: 'Pain point first, product enters after' } },
  { json: { ...item, variant_label: 'Variant B', variant_angle: 'Product first, pain point as context' } },
  { json: { ...item, variant_label: 'Variant C', variant_angle: 'Bold pattern interrupt hook, product enters after attention is captured' } }
];
```
Connection: `Merge3 → Generate 3 Variants → Write PROMPT`
Result: 5 concepts × 3 variants = 15 Airtable records per run.

### Write Concepts (AI Agent) — System Prompt Key Rules
- Design Components: exactly 5 lines separated by `\n`. Max 8 words per line.
- Concept Description: 2 sentences MAX.
- Never write "Podcast" unless explicit microphone. Two friends on couch = Two-Friend Conversation UGC.
- Green Screen requires specific readable background.
- Voice must be consistent. Do not blend voices.
- All copy must come from client data in user message — no hardcoded examples.
- Token limit: if batch has 8+ concepts, agent may cut off. Fix: increase max_tokens OR split batch before agent on `________________` separator.

### Parse Webhook Payload (Code Node) — Fixed Apr 22, 2026
```javascript
const body = $input.first().json.body;
const input = body.customData || body;
const platformRaw = input['Platforms Declaration'] || '';
// ... map all fields to clean lowercase keys
```

### Build Google Slides Requests (Code Node)
- Footer: **REMOVED** — do not re-add. (Was repeatedly added back by mistake)
- Design Components Y position: label `3450000` EMU, content `3660000` EMU (moved down from 3260000/3470000)
- URL validation: `validUrl()` helper — only pass URLs starting with `http`
- Text cleaning: `cleanText()` filters empty lines before joining (prevents blank bullet points)

---

## ⚠️ Foreplay Duplicate Results Problem (Apr 30, 2026)
**Status: Documented but fixes NOT applied — Foreplay was removed before applying them.**

Root causes discovered:
1. `order` parameter = `"longest_running"` → same top 20 evergreen ads every day
2. AI Keyword Agent: stateless prompt → same keywords every run
3. No cross-run deduplication — no memory of processed ad IDs

Fixes documented (not needed since Foreplay was replaced):
- Change `order` → `"recent"` or `"newest"`
- Inject date + niche rotation: `"Today is {{$now.toFormat('yyyy-MM-dd')}}. Generate 15 UNIQUE keywords..."`
- Log processed `ad_id`s to Google Sheets; filter at start of next run

---

## 🐞 All Bugs — Chronological

| Date | Node | Bug | Fix |
|------|------|-----|-----|
| Apr 10 | Foreplay API | Returns identical ads daily | Documented fixes; node removed Apr 22 |
| Apr 13 | AI Agent (Write Concepts) | Token limit cuts off at concept #084 | Increase max_tokens or split on `________________` separator |
| Apr 22 | SA-2 workflow | Foreplay nodes still connected | Remove 5 Foreplay-related nodes; add Google Slides GET |
| Apr 27 | Write Draft Concept (LangChain) | `Cannot read properties of undefined (reading 'message')` | Chat Model sub-node was empty/unconnected |
| Apr 29 | Airtable Webhook | `recordChangeScope` used field ID not table ID | Use `tbl...` ID |
| Apr 29 | Airtable Webhook | `includeCellValuesInFieldIds` used select option ID | Use `fld...` ID |
| May 1 | Parse Webhook Payload | Field `'platforms'` not found | Use `'Platforms Declaration'`; access via `body.customData` |
| May 1 | Build Google Slides | Design Components too high | Move Y to 3450000/3660000 EMU |
| May 1 | Build Google Slides | Footer kept re-appearing | Removed completely — DO NOT re-add |
| May 1 | Build Google Slides | Invalid URLs reaching Google Slides API | Add `validUrl()` helper |
| May 12 | Parse Concept Slots | `concept_slots` is object not array | `Object.values(raw)` to extract array |
| May 12 | Parse Concept Slots | Slots empty in isolated test | Upstream AI Agent not running — must run full workflow |

---

## ⏭️ What's Next

1. Full end-to-end run: SA-1 form → 5 concepts → 15 records → 15 concept slides
2. Meta Ad Library: unblock (owner identity verification)
3. TikTok API: unblock (developer portal approval)
