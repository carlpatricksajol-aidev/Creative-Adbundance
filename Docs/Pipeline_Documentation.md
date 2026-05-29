# 📚 Creative Pipeline Documentation
**Project:** Creative Abundance — Internal Documentation & Architecture
**Last Updated in Docs:** May 29, 2026

---

## ⏱️ Timeline Overview

| Date | What Happened |
|------|--------------|
| Mar 13, 2026 | First project plan doc created (DOCX) — Static Ad Generator + Concept Mockup Generator phases |
| Apr 15, 2026 | SA-1 intake form live; GHL no-cors issue resolved; pipeline vision firmed up |
| May 27, 2026 | PDF write-up created covering full creative pipeline |

---

## 🚦 Current Status

| Deliverable | Status |
|-------------|--------|
| Initial project plan DOCX | ✅ Created Mar 13 |
| Creative Pipeline Writeup PDF | ✅ Created May 27 |
| This living documentation set | ✅ Updated May 29 |

---

## 🏗️ Full System Architecture (Current — May 2026)

```
INTAKE
  SA-1 Form (form.creativeadbundancebiz.com)
       │
       ├── [Concept Generation]
       │         ▼
       │   SA-2 n8n Webhook (/webhook/SA2/1.1)
       │         │
       │   Search Brand Brain (Airtable)
       │         │
       │   Google Slides GET (inspiration source)
       │         │
       │   Parse Slides → Merge → Write Concepts (Claude)
       │         │
       │   Parse Concept Slots → Generate 3 Variants
       │         │
       │   Write Script (Claude, per variant)
       │         │
       │   CS To Review (Airtable — 1 record per variant)
       │         │
       │   Build Google Slides Requests → batchUpdate
       │
       └── [Static Ads]
                 ▼
           SA-3b Webhook (/webhook/Static-Ads)
                 │
           Search Brand Brain + Parse Platform
                 │
           Fetch Templates (Airtable CreativeOS Templates)
                 │
           Shuffle → top 5 → [Loop] Build Gemini Request
                 │
           Gemini Vision Check (OpenRouter)
                 │
           ✅ Pick Best Template ← last confirmed working point
                 │
           Build KIE AI Prompt → Create KIE AI Job
                 │
           Poll KIE AI Status → Get Image URL
                 │
           Save to Airtable + Slack [PENDING]

CS TO REVIEW TABLE
  └── Checkbox checked → SA-3a Thumbnail Generation
            │
      Get Record → Brand Brain → Template URL
            │
      Build Higgsfield MS Prompt
            │
      Get Higgsfield Token → Build Claude API Request
            │
      Claude API + Higgsfield MCP → Job ID
            │
      Poll Job Status → Get Image URL
            │
      Google Slides batchUpdate (insert thumbnail)
            │
      Update Airtable Record

VIDEO PIPELINE (after concept approval)
  Shot List Builder (Claude Code skill)
       │
       ├── Seedance 2.0 (Higgsfield) — standard/bulk runs
       └── Sora 2 / Sora 2 Pro (KIE AI) — hero/premium [skill in progress]
```

---

## 🔧 Infrastructure Reference

### n8n Instance
- **URL:** `https://n8n-i3t9.srv1486031.hstgr.cloud`
- **Version:** 2.11.3 (Self Hosted)
- **Critical limitation:** Code nodes cannot make HTTP calls (`fetch` and `require('https')` both blocked). All HTTP calls must use HTTP Request nodes.
- **Webhooks:**
  - `/webhook/SA2/1.1` — concept generation
  - `/webhook/Static-Ads` — static ad generation

### Airtable Tables

| Table | Purpose | Key Fields |
|-------|---------|-----------|
| Brand Brain | Per-client brand data | `logo_urls` (plural), `brand_guidelines`, `template_mockup_id`, `brand_tone`, `target_personas`, `creative_boundaries` |
| CreativeOS Templates | Pre-filtered template library | `template_mockup_id` (public URL) |
| CS To Review | Concept variants awaiting review | One record per variant; `Ad Concept Link`, `Variant`, `Variant Angle` |
| Active Clients | Client roster | Used to match against Dropbox paths |

### APIs / Services

| Service | Used For | Status |
|---------|----------|--------|
| KIE AI | GPT Image 2.0 static ads; Sora 2/2 Pro video | ✅ Active |
| Higgsfield | Marketing Studio Image (thumbnails); Seedance 2.0 video | ✅ Active |
| Claude API (Anthropic) | Concept/script generation; Higgsfield MCP calls | ✅ Active |
| OpenRouter | Claude access for SA-2 AI Agents; Gemini for template scoring | ✅ Active |
| Google Slides API | Concept deck creation and batchUpdate | ✅ Active |
| Google Drive API | Batch folder access; concept doc storage | ✅ Active |
| Foreplay API | Competitor ad intelligence | ❌ REMOVED from SA-2 (Apr 22); replaced by Google Slides |
| Supabase | File storage for ad references uploaded via SA-1 form | ✅ Active (RLS fixed May 28) |
| Dropbox API | Content creator footage; client asset management | ✅ Active |
| Figma API | Design template inspection and recreation | ✅ Active |
| Meta Ad Library | Inspiration mining | ⬜ BLOCKED — owner needs identity verification |
| TikTok Commercial Content API | Inspiration mining | ⬜ BLOCKED — developer portal approval pending |

### SA-1 Form
- **URL:** `https://form.creativeadbundancebiz.com/form-page`
- **GHL webhook:** original form submission
- **Static Ads webhook:** `https://n8n-i3t9.srv1486031.hstgr.cloud/webhook/Static-Ads`
- **Supabase bucket:** `ad-references` (public; RLS policies added May 28)

### Claude Code Skills Location
- User skills: `/mnt/skills/user/` — `shot-list-builder/SKILL.md` etc.
- Public skills: `/mnt/skills/public/` — docx, pdf, pptx, xlsx, frontend-design, file-reading, product-self-knowledge

---

## 📄 PDF Write-Up (May 27, 2026)

ReportLab (Python) — A4 format.

**Colors:** Black `#0D0D0D`, White `#FFFFFF`, Purple `#5B4FE8`, Teal `#00C6A2`, Light BG `#F5F4FF`

**Content covered:** SA-1/SA-2/SA-3 overview; video pipeline (Seedance 2.0, KIE AI, Higgsfield); static ad pipeline; research pipeline; infrastructure summary.
