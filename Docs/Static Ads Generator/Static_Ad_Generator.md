# 📸 Static Ad Generator Pipeline
**Project:** Creative Abundance — Automated Static Ad Production
**Last Updated in Docs:** May 29, 2026
**Stack:** n8n · Airtable · KIE AI (GPT Image 2.0) · Nano Banana Pro · Claude API · Higgsfield MCP · Supabase · Google Slides

---

## ⏱️ Timeline Overview

| Date | What Happened |
|------|--------------|
| Mar 13, 2026 | Project kickoff — Static Ad Generator + Concept Mockup Generator planned; KIE AI confirmed for use; Higgsfield API confirmed to exist |
| Mar 16–17, 2026 | First static ad workflow built using **Orshot + CreativeOS templates** + Nano Banana 2; Slack as trigger |
| Mar 20–26, 2026 | Nano Banana 2 reference hallucination fixed; brand scraper built; logo extraction via AI Agent |
| Apr 8, 2026 | Dynamic static ad prompt generator built (widget); workflow upgraded with angle/hook logic |
| Apr 15–29, 2026 | SA-1 intake form built; n8n webhook configured; Airtable webhook fixed |
| May 1–5, 2026 | SA-2 restructured; Foreplay replaced with Google Slides; SA-3 KIE AI thumbnail flow started |
| May 13, 2026 | Higgsfield MCP thumbnail generation: `authorization_token` fixed, missing `const item` fixed |
| **May 15, 2026** | **Pick Best Template confirmed working; Gemini scoring confirmed working (Symple Lending test)** |
| May 28, 2026 | Supabase upload bug fixed (RLS policies missing on `ad-references` bucket) |

---

## 🚦 Current Status (as of May 28, 2026)

| Component | Status | Notes |
|-----------|--------|-------|
| SA-1 Intake Form (HTML) | ✅ DONE | Dual-mode: Concept Generation + Static Ads; Supabase upload fixed |
| Parse Platform node | ✅ DONE | Field name and customData nesting fixed |
| Brand Brain Airtable lookup | ✅ DONE | Fields at root level, not `.fields` |
| Build Gemini Request | ✅ DONE | Truncation fix applied (500 chars) |
| Gemini scoring via OpenRouter | ✅ DONE | Confirmed working — scored Symple Lending template 2/10 |
| Pick Best Template (Code node) | ✅ DONE | Confirmed working |
| KIE AI GPT Image 2.0 generation | 🟡 BUILT, NEEDS E2E TEST | Node structure correct; full run unconfirmed |
| Poll KIE AI Status | 🟡 BUILT, NEEDS E2E TEST | Async polling logic in place |
| SA-3a Thumbnail (Higgsfield MCP) | 🟡 BUILT, UNCONFIRMED | auth_token fixed, code node fixed — but chat ended before test result |
| Save to Airtable + Slack | ⬜ PENDING | Not yet confirmed built |

**The last confirmed stopping point was May 15, 2026** — Pick Best Template was working and the next step was "Build KIE AI Prompt → Generate → Poll." That's where the active work trail ends.

---

## ❌ What Was Removed / Replaced

| Removed | Replaced By | When |
|---------|-------------|------|
| Orshot template rendering | KIE AI GPT Image 2.0 generative pipeline | Apr–May 2026 |
| CreativeOS template imports | Airtable "CreativeOS Templates" table with pre-filtered URLs | Apr–May 2026 |
| Nano Banana 2 (old) | GPT Image 2.0 via KIE AI | May 2026 |
| Slack as workflow trigger | SA-1 HTML intake form webhook | Apr 2026 |
| Higgsfield/Nano Banana 2 for thumbnails (early plan) | Higgsfield Marketing Studio Image via Claude API + MCP | May 2026 |

---

## 🏗️ Current Architecture

```
SA-1 Intake Form (form.creativeadbundancebiz.com)
  └── [Mode: Static Ads]
         │
         ▼ POST → https://n8n-i3t9.srv1486031.hstgr.cloud/webhook/Static-Ads
         │
         ▼
  Parse Platform (Code node)
         │
         ▼
  Search Brand Brain (Airtable)
         │
         ▼
  Fetch Pre-filtered Templates (Airtable — "CreativeOS Templates" table)
         │
         ▼
  Shuffle → take top 5
         │
         ▼
  [Loop] Build Gemini Request (per template, Code node)
         │
         ▼
  [Loop] Gemini Vision Check (OpenRouter HTTP Request)
         │
         ▼
  ✅ Pick Best Template (Code node) ← LAST CONFIRMED WORKING POINT
         │
         ▼
  Build KIE AI Prompt (Code node) ← unconfirmed
         │
         ▼
  Create KIE AI Job (HTTP Request)
         │
         ▼
  Poll KIE AI Status (HTTP Request loop)
         │
         ▼
  Get Image URL (Code node)
         │
         ▼
  Save to Airtable + Slack ← not yet confirmed built
```

---

## 🔧 SA-1: Kickoff Intake Form

### Form Sections (in order)
1. **Batch Scope** — concepts to present, variants per concept, dimensions/formats (9:16 / 1:1 / 16:9)
2. **Platform Declaration** — one platform per batch (Meta, TikTok, YouTube, Amazon)
3. **Business Objective** — with KPI selection
4. **Client Selection** — browse list (My Social Calendar, Finance Advisors, Delta Children, Bellini, OnlyRx, Symple Lending, etc.)
5. **Top Performers / Meeting Notes** — 3-way toggle: "Net new" / "Informed by top performers" / "Both — run net new AND informed"
6. **Creative Brief**
7. **Mode Selector pop-up** — "Concept Generation" or "Static Ads"

### Static Ads Sub-Form Fields (sent to webhook)
```json
{
  "client_name": "...",
  "num_ads": 5,
  "platform": "9:16 Vertical — Meta/TikTok",
  "objective": "...",
  "references": "...",
  "sa-refs": "[Supabase public URLs]",
  "product_names": ["..."],
  "product_image_urls": ["..."],
  "reference_urls": ["..."],
  "reference_filenames": "..."
}
```

### ⚠️ Supabase Upload Fix (May 28, 2026)
The ad reference image upload in the form was failing silently. Root cause: missing RLS policies.

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('ad-references', 'ad-references', true)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "Authenticated users can upload to ad-references"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'ad-references');

CREATE POLICY "Public can read ad-references"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'ad-references');
```

---

## 🔧 Key Nodes

### Parse Platform (Code Node)
```javascript
const body = $input.first().json.body;
const input = body.customData || body;
const platformRaw = input['Platforms Declaration'] || '';
const match = platformRaw.match(/\(([^)]+)\)/);
const platform_normalized = match ? match[1] : platformRaw;
```
Bug hit: field was `'Platforms Declaration'` not `'platforms'`; data under `body.customData`.

### Build Gemini Request (Code Node)
Key fix: truncate `brand_guidelines` to 500 chars to prevent Gemini timeout.
```javascript
const truncate = (str, max) => (str || '').substring(0, max);
// ...
truncate(brain.brand_guidelines, 500)
```

### Pick Best Template (Code Node) — ✅ CONFIRMED WORKING
```javascript
const items = $input.all();
const scored = items.map(item => {
  const raw = item.json.choices?.[0]?.message?.content || '{}';
  let score = 0, applicable = false, reason = '';
  try {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    score = parsed.score || 0;
    applicable = parsed.applicable || false;
    reason = parsed.reason || '';
  } catch(e) {}
  return { template_id: item.json.template_id || '', template_url: item.json.template_url || '', score, applicable, reason };
});
const applicable = scored.filter(t => t.applicable === true).sort((a, b) => b.score - a.score);
const best = applicable.length > 0 ? applicable[0] : scored.sort((a, b) => b.score - a.score)[0];
if (!best) throw new Error('No templates found');
return [{ json: best }];
```

### KIE AI Body Fix
```json
{
  "model": "gpt-image-2-image-to-image",
  "input": {
    "prompt": {{ JSON.stringify($json.prompt) }},
    "input_urls": {{ JSON.stringify($json.input_urls) }},
    "aspect_ratio": "9:16"
  }
}
```
Bug: `input_urls` must use `JSON.stringify`, not string interpolation `"[...]"`.

### SA-3a: Higgsfield MCP Request (May 13, 2026)
```javascript
const item = $input.first().json;  // ← this line was missing, caused error
const token = $('Get Higgsfield Token').first().json.stdout.trim();
const body = JSON.stringify({
  model: "claude-sonnet-4-20250514",
  max_tokens: 4096,
  system: `...After calling generate_image, return ONLY the job ID. Do NOT call job_status...`,
  messages: [{ role: "user", content: `...Call generate_image...Return ONLY the job ID.` }],
  mcp_servers: [{ type: "url", url: "https://mcp.higgsfield.ai/mcp", name: "higgsfield", authorization_token: token }]
});
```
Two bugs fixed: missing `const item = $input.first().json;` + Claude calling `job_status` inside same request.

### Brand Brain Field Access Fix
```javascript
// WRONG
const brain = $('Search Brand Brain').first().json.fields;
// CORRECT — root level
const brain = $('Search Brand Brain').first().json;
const logoUrl = brain['logo_urls'] || '';  // note: plural
const brandGuidelines = brain['brand_guidelines'] || '';
const templateUrl = brain['template_mockup_id'] || '';
```

### Airtable Webhook Fix (Apr 29, 2026)
```json
// WRONG
"recordChangeScope": "fldihZVSaZj0D5u0d"  ← field ID, not table ID
"includeCellValuesInFieldIds": ["sel1rV9VjHFJ7tW5N"]  ← select option ID, not field ID

// CORRECT
"recordChangeScope": "tblXXXXXXXXXXXXXX"  ← must start with "tbl"
"includeCellValuesInFieldIds": ["fldXXXXXXXXXXXXXX"]  ← must start with "fld"
```

---

## 🐞 All Bugs — Chronological

| Date | Node | Bug | Fix |
|------|------|-----|-----|
| Apr 29 | Airtable Webhook | `recordChangeScope` used field ID | Use table ID (`tbl...`) |
| Apr 29 | Airtable Webhook | `includeCellValuesInFieldIds` used select option ID | Use field ID (`fld...`) |
| May 1 | Parse Platform | Wrong field name `platforms` vs `Platforms Declaration` | Fixed field key + `body.customData` |
| May 5 | Build Brand Prompt | `brain.fields.logo_url` not found | Use `brain['logo_urls']` at root level |
| May 5 | KIE AI body | `input_urls` sent as string | Use `JSON.stringify($json.input_urls)` |
| May 13 | Higgsfield MCP | `authorization_token` missing | Added from `Get Higgsfield Token` node |
| May 13 | Build Claude API Request | Missing `const item = $input.first().json;` | Added to top of Code node |
| May 13 | Build Claude API Request | Claude calling `job_status` in same request | Added "Return ONLY the job ID. Do NOT call job_status." |
| May 15 | Build Gemini Request | `brand_guidelines` too long → Gemini timeout | Truncate to 500 chars |
| May 28 | SA-1 Form | Supabase upload failing (RLS violation) | Added INSERT + SELECT policies to `ad-references` bucket |

---

## ⏭️ What's Next

1. Run full end-to-end test: SA-1 form → webhook → Gemini scoring → Pick Best Template → KIE AI generation → polling → Airtable save
2. Confirm SA-3a (Higgsfield thumbnail) actually runs — the chat ended before test result was confirmed
3. Build Slack notification after image is saved
4. Error handling for KIE AI job failures
