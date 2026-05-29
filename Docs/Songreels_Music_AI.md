# BUMPY PROJECT — Full Documentation
**Last Updated: May 29, 2026**
**Status Overview: Private Beta — Core pipeline working, several open issues pending**

---

> **How to read this doc:** Tasks are ordered from most recent / currently active to older / resolved. Each section tells you what was done, where things broke, what was fixed, what was abandoned, and what's still open. This is your source of truth for any future AI session.

---

## TABLE OF CONTENTS

1. [Project Overview & Tech Stack](#1-project-overview--tech-stack)
2. [Task: n8n Automation Pipeline — Video/Music Sync (Core)](#2-task-n8n-automation-pipeline--videomusicync-core)
3. [Task: Creatomate — Video Rendering & Resolution](#3-task-creatomate--video-rendering--resolution)
4. [Task: Frontend — HTML App Form (songreels-app.html)](#4-task-frontend--html-app-form-songreels-apphtml)
5. [Task: Frontend — Landing Page (songreels-landing.html)](#5-task-frontend--landing-page-songreels-landinghtml)
6. [Task: Done Screen — Video Preview & Hook Section](#6-task-done-screen--video-preview--hook-section)
7. [Task: Beta Access Gate](#7-task-beta-access-gate)
8. [Task: Google OAuth / Supabase Auth Branding](#8-task-google-oauth--supabase-auth-branding)
9. [Task: Privacy Policy & Terms of Service Pages](#9-task-privacy-policy--terms-of-service-pages)
10. [Task: FFmpeg Compression Server (Hostinger VPS)](#10-task-ffmpeg-compression-server-hostinger-vps)
11. [Infrastructure Reference](#11-infrastructure-reference)
12. [Known Removed / Abandoned Approaches](#12-known-removed--abandoned-approaches)
13. [Current Open Issues (as of May 2026)](#13-current-open-issues-as-of-may-2026)
14. [Next Steps Priority Order](#14-next-steps-priority-order)

---

## 1. Project Overview & Tech Stack

**Product:** SongReels — an AI-powered service that turns uploaded video clips and photos into a personalized music video gift, complete with an AI-composed original song.

**Domain:** `songreels.ai`
**Hosting:** GoHighLevel (GHL) funnels for frontend HTML; Hostinger VPS for n8n workflow automation
**Stage:** Private beta, invite-only

### Full Tech Stack

| Layer | Tool | Purpose |
|---|---|---|
| Auth | Google OAuth via Supabase | User sign-in |
| Database | Supabase (PostgreSQL) | Job storage, access codes |
| File Storage (uploads) | Supabase Storage | User-uploaded video/photo clips |
| File Storage (final) | Backblaze B2 | Rendered final videos (shareable links) |
| Workflow Automation | n8n on Hostinger VPS | Orchestrates entire AI pipeline |
| Visual AI | Google Gemini (Files API) | Analyzes each video/photo clip |
| Text/Lyrics AI | Anthropic Claude (API) | Writes script and song lyrics |
| Music AI | Suno AI (via sunoapi.org API, V4_5 model) | Generates original song audio |
| Video Rendering | Creatomate | Stitches clips + audio into final 9:16 video |
| Video Compression | FFmpeg on Hostinger VPS | Pre-processes user uploads before Gemini |
| Frontend Hosting | GoHighLevel funnels | Landing page + app executor |
| Domain DNS | GoDaddy | DNS only, site is on GHL |

### User Flow (Intended End-to-End)

```
songreels.ai (landing, gated with access code)
  ↓
Click "Make one" → songreels.ai/app
  ↓
Google Sign-In (Supabase OAuth)
  ↓
Step 1: Choose occasion (Birthday, Anniversary, Mom, etc.)
Step 2: About them (name, theme, custom voice notes per clip)
[Instruction slideshow — explains what happens next]
Step 3: Upload clips/photos (max 20, 500MB each)
Step 4: Choose song style & length (Chorus=1min / Full=3min / Epic=6min)
  ↓
Click "Generate My Reel" → job created in Supabase → n8n webhook fires
  ↓
n8n pipeline:
  Shuffle Clips (optional random order)
  → Compress clips (FFmpeg on VPS)
  → Upload to Google Files API (parallel)
  → Aggregate File State v2 (preserves clip_index order)
  → Gemini analyzes each clip (in upload order)
  → Parse Gemini output
  → Build Claude Prompt v5 (stanza plan with per-clip anchors)
  → Claude writes script + lyrics
  → Store in Supabase → status: 'needs_review'
  ↓
User reviews/edits script + lyrics on review screen → approves
  → Workflow resumes via resume_url webhook
  ↓
  Suno API generates song (V4_5 model)
  → Extract audio URL
  → Get Timestamped Lyrics (Suno endpoint OR AssemblyAI)
  → Compute Vocal Onset (when first word is sung)
  → Compute Line Boundaries
  → Align Clips to Sections v3 (simplified — just preserve order)
  → Creatomate body builder v3 (generates render payload)
  → Creatomate renders final 9:16 MP4 (1080×1920)
  → Upload final video to Backblaze B2
  → Update Supabase job: status='complete', final_video_url=...
  ↓
Frontend polls Supabase every 4s → shows done screen
  ↓
Done screen: video preview + share link + WhatsApp share + "Make another" hook
```

---

## 2. Task: n8n Automation Pipeline — Video/Music Sync (Core)

**Status: ACTIVELY BEING FIXED — several layers have been solved, one major issue remains**
**Where we left off: Creatomate body builder v3 and Align Clips v3 were written and given to you. Deployment status is UNKNOWN.**

### What the pipeline does

The n8n workflow lives at `https://n8n-i3t9.srv1486031.hstgr.cloud/` and is triggered by a webhook at `/webhook/heartreel`. It orchestrates everything from file upload through final video delivery.

### Problem History (in chronological order)

#### Issue #1: Clip Order Was Random (FIXED — confirmed working)

**Root Cause:** When clips are uploaded to Google Files API in parallel, they finish in random order. The `Aggregate File State` node was not tracking which Google URI belonged to which original clip. So Gemini was analyzing them in a random order, and `clip_index: 0` from Gemini did not correspond to the user's first uploaded clip.

**Symptoms:** Lyrics described things not actually in the clips (e.g., "dancing beneath the palms" on a laptop video).

**Fix Applied:** `Aggregate File State v2` — a new Code node that:
1. Builds a URI→clip_index map by reading `$('Extract Google URI').all()`
2. Attaches `original_clip_index` to each file status
3. Sorts `active_files` by `original_clip_index` before passing to Gemini

**Result:** Gemini's `clip_index: 0` now correctly corresponds to upload position 0. Lyrics became accurate.

**Node to check:** `Aggregate File State` — must contain the v2 code.

---

#### Issue #2: Music/Visual Sync Was Broken (FIXED architecturally — not fully tested end-to-end)

**Root Cause (multi-layered):**

1. **Suno has a variable instrumental intro** (5–15s) before vocals start. The old code hardcoded `SUNO_INTRO_SECS = 5`, which was always wrong.
2. **Creatomate body builder was inserting a deliberate 5-second black screen** at the start to "wait out" Suno's intro. Since Suno's intro is variable, this was always misaligned.
3. **Lyrics were written for `clipTotalSecs`**, but the audio is `clipTotalSecs + Suno's variable intro`. The three systems never reconciled.
4. **Over-engineering attempt:** We tried using AssemblyAI word timestamps + line-boundary matching to sync clips to exact lyric lines. This created timeline gaps where `cursor += placement_end_s - placement_start_s` left dead air between clips.

**Final Architecture Decided (the "authored alignment" approach):**
- Claude writes lyrics IN ORDER of the clips (stanza 1 = clip 1, stanza 2 = clip 2, etc.)
- Creatomate stacks clips back-to-back with zero gaps (no timestamp matching)
- Clips play in the exact order Claude wrote lyrics for
- Duration cap: `userChosenSecs × 1.25` (Chorus 1min → 75s max, Full 3min → 225s, Epic 6min → 450s)
- Vocal onset IS detected (via `Compute Vocal Onset` node) and honored — black screen plays during the Suno instrumental intro until vocals begin

**Nodes replaced/added for this fix:**
- `Align Clips to Sections` → replaced with `align-clips-to-sections-v3.js` (40 lines, just sorts by clip_index)
- `Creatomate body builder` → replaced with `creatomate-body-builder-v3.js`
- `Build Claude Prompt` → v5 (tells Claude per-stanza what's in each clip via anchors)
- Added `Shuffle Clips` node (optional — Fisher-Yates shuffle for random clip order, with clip_index reassignment so Gemini/Claude/Creatomate all see consistent order)

**Files given to you (check if deployed):**
- `align-clips-to-sections-v3.js`
- `creatomate-body-builder-v3.js`

**What `creatomate-body-builder-v3.js` does:**
- Reads `vocal_onset_secs` from `Compute Vocal Onset` node
- Uses real vocal onset as `SUNO_INTRO_SECS` (no 2-second cap — removed in final version)
- Stacks clips back-to-back with `cursor += trimDur`
- Hard duration cap based on user's selection
- Trims Suno audio to the cap with 3-second fade-out
- Ken Burns effect on photos (15% zoom, 0.6s crossfade)
- Outro fade (3s)

---

#### Issue #3: Suno SSL Certificate Error (FIX GIVEN — status unknown)

**Error:** `UNABLE_TO_VERIFY_LEAF_SIGNATURE` — n8n's Node.js refused to trust Suno's SSL cert.

**Cause:** Suno's certificate provider wasn't in n8n's trust store, or the cert rotated.

**Fix:** In the n8n Suno API node → Options/Settings → toggle **"Ignore SSL Issues" or "Allow Unauthorized Certificates"** to ON.

---

#### Issue #4: Suno Duration Not Honoring User Selection (PARTIALLY ADDRESSED)

**Problem:** User selects "Epic (6 min)" but Suno generates 3:41. Suno's V4_5 model decides length based on lyrics complexity, not a duration parameter.

**What was tried:**
- Switched from V4_5 to `V4_5ALL` / `V4_5PLUS` (supports up to 8 min, "better song structure")
- Discussed using Suno's `Extend` endpoint to chain additional audio
- Discussed using `V5` / `V5_5` models

**Current approach:** Hard duration cap in `creatomate-body-builder-v3.js`. If Suno generates 3:41 for a "6 min" order, the video gets capped at 450s (7:30). This means the video might be shorter than the user expected for the Epic tier. The Extend API approach was discussed but not implemented.

**Status:** Accepted as "good enough for beta." Revisit before public launch.

---

#### Issue #5: Suno Polling Timeout (NOT FIXED — mentioned, low priority)

**Problem:** n8n polls Suno twice (`Wait 90s → Poll → Wait 45s → Poll`), giving Suno ~2:15 total. V4_5 on longer songs can take 3+ minutes. Occasional "Suno Timeout" failures result.

**Fix needed:** Add a third poll attempt, or switch to Suno's callback URL (currently `placeholder.com/callback`, which silently does nothing).

---

#### Issue #6: Map Clips to Timeline Node Position (RESOLVED by simplification)

**Problem:** `Map clips to timeline` was positioned BEFORE `Compute Line Boundaries` in the workflow, so it had no access to `lyric_lines` or timestamps. The beat-sync code always hit the fallback path.

**Resolution:** The whole beat-sync approach was abandoned. `Align Clips to Sections v3` just preserves order. The `Map clips to timeline` node was superseded.

---

#### Issue #7: Lyrics Line Count / Song Length Tier (FIXED — confirmed working)

**Problem:** Claude was writing lyrics sized by seconds (e.g., "write lyrics for 60 seconds"). Suno generates whatever length it wants. Build Claude Prompt v5 now tells Claude to write lyrics by line count / stanza count, not by duration.

**Confirmed working:** Vienna test generated 52-line lyrics (full Verse→Pre-Chorus→Chorus→Bridge structure), and Suno generated a 3:41 song instead of the previous ~1 min output. This was called "HUGE PROGRESS."

---

#### Issue #8: 1-Minute Video Despite User Selecting 6 Minutes (PARTIALLY FIXED)

**Root cause confirmed:** The old Claude prompt was writing very short lyrics → Suno generated a short song → video was short.

**Fix:** Build Claude Prompt v5 writes lyrics with proper structure (verse/chorus/bridge) with enough lines to support 3–6 minutes. Combined with the tier-based hard cap.

---

### n8n Node Reference (Current Pipeline Order)

```
Webhook (heartreel) 
→ Get Job Details
→ [Shuffle Clips — optional]
→ Compress Videos on Server (FFmpeg)
→ Prepare clips for Google upload
→ Upload to Google File API (parallel, per clip)
   ↕ (concurrent)
→ Extract Google URI (per clip, preserves clip_index)
→ Get File State (per clip)
→ Aggregate File State v2 (sort by clip_index, pass in order)
→ Gemini Analyze Clips
→ Parse Gemini Response
→ Build Claude Prompt v5
→ Claude (Anthropic API) — writes script + lyrics
→ Parse Claude Response
→ Store in Supabase (status: needs_review)
→ [WAIT — user reviews and approves via resume_url webhook]
→ Suno API — Generate Song (V4_5ALL or V4_5)
→ Poll Suno (Wait 90s → Poll → Wait 45s → Poll)
→ Extract Audio URL
→ Get Timestamped Lyrics (Suno endpoint)
→ Compute Vocal Onset
→ Compute Line Boundaries
→ Align Clips to Sections v3
→ Creatomate body builder v3
→ HTTP Request → Creatomate API
→ Poll Creatomate
→ Upload to Backblaze B2
→ Update Supabase job (status: complete, final_video_url)
```

---

## 3. Task: Creatomate — Video Rendering & Resolution

**Status: BLOCKED ON PLAN UPGRADE — currently rendering at 270×480 on free trial**

### The Problem

Creatomate free trial **hard-caps all renders at 270×480**, regardless of what `width` and `height` you pass in the API. Your Creatomate body builder correctly requests `width: 1080, height: 1920` but Creatomate ignores it on the free tier.

**Confirmed:** Video dimensions checked as 270×480 at 530 kbps. Instagram Story minimum is 1080×1920. This is 6% of the pixel count of a normal social video.

### Resolution

**Must upgrade Creatomate to Essential plan ($54/mo) to unlock 1080p renders.**

Free plan: 50 credits + low resolution only.  
Essential ($54/mo): 2000 credits + full 1080p/4K.

**This is blocking any quality testing.** Do not do quality testing until the plan is upgraded.

### Bitrate Setting (ready, pending plan upgrade)

Once on a paid plan, `creatomate-body-builder-v3.js` already includes:
```js
bitrate: '8 Mbps',
codec:   'h264',
```
This is the correct setting for 1080×1920 @ 30fps. Phones target 10–20 Mbps; 8 Mbps is the sweet spot for sharp output at reasonable file sizes (~50–80MB for a 3-min video).

### Credit Usage Note

A 53-second 1080p render costs ~8–15 Creatomate credits on paid plans. At 2000 credits/month (Essential), that's roughly 130–250 renders per month.

---

## 4. Task: Frontend — HTML App Form (songreels-app.html)

**Status: DEPLOYED — but may be on an old version. Confirm which version is live.**

### Version History

| Version | Key Change |
|---|---|
| v1–v2 | Original HeartReel form (previous brand name) |
| v3 | Full-screen auth fix (position:fixed to escape GHL container) |
| v4 | Remove button bug fix; done screen video loading fix |
| v5 | 6 major UI fixes (see below) |
| v6 (current) | Rebranded HeartReel → SongReels; password gate prepended; landing page added |

### v5 Changes (all confirmed shipped in v6)

1. **Sign-in screen redesigned** — 50/50 split. Left: clean Google sign-in. Right: animated phone mockup with fake play button, fake video title ("Forever in color · Mom's 60th · 3:24"), progress bar.
2. **Remove button bug fixed** — when returning to a completed job, forces fresh start (no half-restored clip cards with dead Remove buttons). Logic: if status is `complete` → clear session. If `review` → restore review screen. If `processing` → restore processing screen.
3. **Done screen redesigned** — 50/50 split with sticky left (share controls) and large 9:16 phone-frame video player on right.
4. **Processing screen copy de-robotized** — removed all "AI" language, more emotional ("Watching your moments", "Writing your story").
5. **Instruction slideshow added** — appears between Step 2 and Step 3. 3 slides explaining what happens: AI writes script → you review → song is composed. Cannot be skipped. Forces user to see the review warning so they don't abandon the tab.
6. **Abandonment prevention** — `beforeunload` warning fires when user is on review screen. Red banner at top of review screen. "Cancel this gift" button for clean exit.

### v6 Changes (SongReels rebranding)

- All "HeartReel" / "Poss Up" references replaced with "SongReels"
- Password gate block prepended (see Task 7)
- `initAuth()` gated: only runs if `localStorage.getItem('songreels_gate_ok') === 'true'`

### Key Config Values (embedded in the HTML)

```js
const C = {
  SUPABASE_URL:   'https://xakngjsybyytldyqfsmi.supabase.co',
  SUPABASE_KEY:   'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' // anon key
  N8N_WEBHOOK:    'https://n8n-i3t9.srv1486031.hstgr.cloud/webhook/heartreel',
  N8N_UPLOAD_URL: 'https://n8n-i3t9.srv1486031.hstgr.cloud/webhook/get-upload-url',
  SITE_URL:       '...',   // must be updated to songreels.ai/app
  MAX_FILE_MB:    500,
  MAX_CLIPS:      20,
  PHOTO_DURATION: 5,
};
```

**Known issue with SITE_URL:** The old `SITE_URL` was `https://app.gohighlevel.com/v2/preview/5BpL6h12j423l2mZ4pd9` (dead 404 page). Must be updated to `https://songreels.ai/app` in the currently deployed file.

### Deployment (GoHighLevel)

- File goes in: GHL → Sites → Funnels → your funnel → page with slug `app` → Custom HTML block
- File is too large (~65KB) for some GHL HTML element limits — if GHL silently truncates, the file breaks. If that happens, host on Netlify/Cloudflare Pages instead.
- The live URL for the app must be `songreels.ai/app` (not the leadconnectorhq.com preview URL) for the shared `localStorage` gate to work.

### Supabase Redirect URL

After Google OAuth, Supabase redirects to whatever the current page URL is (`redirectTo: window.location.href`). You must add `songreels.ai/app` to Supabase's allowed redirect list:
- Supabase Dashboard → Authentication → URL Configuration → Redirect URLs → add `https://songreels.ai/app`

---

## 5. Task: Frontend — Landing Page (songreels-landing.html)

**Status: DEPLOYED AND WORKING — confirmed loading at songreels.ai**

### What's on it

- Full marketing landing page branded SongReels
- Slim beta banner at top: "Private Beta · SongReels is invite-only right now. Have a code? → /app"
- Password gate was REMOVED from landing page (it was moved to /app only)
- All 15 "Make one" / CTA buttons point to `/app` via plain `<a href="/app">` (same-tab, not `target="_blank"`)
- 8 occasion cards (Birthday, Anniversary, Mom, Dad, Graduation, Christmas, Retirement, Custom)
- Pricing section showing $5 / $15 / $30 tiers
- Footer with links to `/privacy` and `/terms`

### Homepage Version (latest)

A newer homepage was also built (`songreels-homepage.html`) with:
- Gate completely removed from homepage
- Beta banner at top
- Wave animation
- Word cycler ("mom", "dad", "Sarah", "grandma", etc.) in hero
- Standard nav with scroll behavior

**Note:** Confirm whether `songreels-landing.html` or `songreels-homepage.html` is the version currently deployed at the root.

---

## 6. Task: Done Screen — Video Preview & Hook Section

**Status: CODE WRITTEN AND DELIVERED — deployment status unknown. Pixelation issue is blocked on Creatomate plan upgrade.**

### Original Problems

1. **Pixelated video** — done screen showed a tiny pixelated preview. The CSS frame was `max-width: 340px`, causing a 3.17× browser downscale of the 1080px-wide video. Combined with `object-fit: cover` cropping it further, the result looked terrible.

2. **Empty done screen / no hook** — after getting the finished video, there was nothing compelling to make another one. The "Make another one" button was a low-emphasis ghost button with no context.

### Fixes Applied in v5 (all now in v6)

**Pixelation fix:**
- Frame bumped to `max-width: 460px`
- Switched from `object-fit: cover` → `object-fit: contain` (video is already 9:16, no need to crop)
- Added GPU layer hints: `transform: translateZ(0)`, `backface-visibility: hidden`, `image-rendering: -webkit-optimize-contrast`
- Video loads via 3 events: `loadeddata`, `canplay`, `loadedmetadata` (any one triggers swap to visible)
- 3-second fallback: even if no events fire, video shows after 3s (browser shows whatever is buffered)
- Error handler with friendly message if video URL is broken

**Hook section fix (done screen left side):**
- Personalized title: "Made for **[recipient name]**" (reads from `f-name` field)
- Reassurance pill: "This is exactly what they'll see when they open the link"
- 4 occasion cards below: "For Mom", "For Dad", "Anniversary", "Birthday" — one-tap restarts the flow with that occasion pre-selected via `startFreshWithOccasion()`
- Promoted "Make another SongReel" to accent-styled CTA button
- Copy: "Most people make 2–3. The next one only takes you ~5 min."

**Important note:** Even with the CSS fix, the video preview will still look bad until Creatomate is upgraded to a paid plan. The CSS fix only addresses browser-level downscaling. The source render is currently 270×480.

---

## 7. Task: Beta Access Gate

**Status: BUILT AND DEPLOYED — confirmed working on landing page. /app gate status unclear.**

### How it works

A Supabase table (`access_codes`) stores invite codes. Before any content loads, users must enter their access code. Successful entry saves `localStorage.setItem('songreels_gate_ok', 'true')`.

Because both pages are on `songreels.ai`, they share the same `localStorage`. Enter the code on the landing → auto-skip on `/app`.

### Supabase Table Setup

Run `01-supabase-setup.sql` in Supabase → SQL Editor (run once):
- Creates `access_codes` table with RLS
- Anon key can only read `is_active = true` codes (can't enumerate all codes)
- Anon key can update `last_used_at` (so you can track usage)
- Starter codes: `songreels-carl-2026`, `songreels-tester-001`, `songreels-tester-002`, `songreels-tester-003`

### Managing Users

In Supabase → Table Editor → `access_codes`:
- **Add user:** Insert row → `code` + `label`
- **Revoke:** Set `is_active = false` (soft revoke — works on new devices, not already-unlocked ones)
- **Hard revoke:** Delete the row AND ask user to clear browser storage
- **See activity:** Sort by `last_used_at` DESC

### Gate Behavior

- Landing page: Shows gate overlay before marketing content is visible. Passing the gate reveals the full landing.
- `/app` page: Gate fires BEFORE Google auth. Supabase client doesn't even initialize until gate passes.
- If `localStorage.songreels_gate_ok === 'true'` → gate auto-skips immediately.

### Known Limitation

The current gate uses `localStorage`, which means:
- Works across tabs on the same browser/device
- Does NOT persist across different browsers or incognito sessions
- For a tighter system: swap localStorage for a Supabase JWT (future upgrade, not needed for beta)

---

## 8. Task: Google OAuth / Supabase Auth Branding

**Status: FULLY RESOLVED — Google branding verified and showing to users**

### What the problem was

Every time users clicked "Sign in with Google," the consent screen showed:
> "Choose an account to continue to **xakngjsybyytldyqfsmi.supabase.co**"

Instead of showing "SongReels." This looks unprofessional and sketchy.

### What caused it

The Google OAuth client that Supabase uses was configured with the Supabase project URL as its "App name," and the Supabase domain was the only "Authorized domain" on the OAuth consent screen.

### How it was fixed (step by step)

1. **GoDaddy DNS verification** — Added a TXT record `google-site-verification=...` to verify domain ownership in Google Search Console.

2. **OAuth Consent Screen updated** in Google Cloud Console:
   - App name: `SongReels`
   - App logo: uploaded
   - Homepage URL: `https://songreels.ai`
   - Privacy policy: `https://songreels.ai/privacy`
   - Terms of service: `https://songreels.ai/terms`
   - Authorized domain: `songreels.ai`

3. **OAuth Client renamed** — In GHL → Google Cloud → APIs & Services → Clients, found the client whose Name was `xakngjsybyytldyqfsmi.supabase.co` and renamed it to `SongReels`.

4. **Published to production** — Changed Publishing status from "Testing" to "In production."

5. **Branding verified** — Google confirmed: "Your branding has been verified and is being shown to users." ✅

### What was NOT done (and doesn't need to be for beta)

**Custom Supabase domain** (`auth.songreels.ai`) — Would remove the Supabase URL from the browser's address bar during the OAuth redirect. Costs $10/month extra on Supabase Pro. Decided: skip for beta, revisit for public launch. Supabase Pro plan is already $25/mo; custom domain would make it $35/mo.

### Important: Do not remove the GoDaddy TXT record

Google re-checks domain ownership periodically. If the `google-site-verification=...` TXT record disappears from GoDaddy DNS, verification is lost and branding reverts.

### Also fixed: Support email

The consent screen previously showed `testing@creativeadbundance.com` (a leftover from an earlier project). Updated to the real SongReels email.

---

## 9. Task: Privacy Policy & Terms of Service Pages

**Status: HTML FILES BUILT — must be deployed at songreels.ai/privacy and songreels.ai/terms**

### Why they were needed

Google requires links to Privacy Policy and Terms of Service before the OAuth consent screen can go to production. Without them, branding verification fails.

### What was built

Two HTML files (`privacy.html` and `terms.html`) styled to match the SongReels form design (same fonts, colors, dark/warm aesthetic).

**Privacy Policy covers:**
- Data collected: name, email, video clips, photos, text descriptions, song preferences
- Third-party AI processing disclosure: Gemini (48hr retention), Claude (no training), Suno, Creatomate, Backblaze B2, Hostinger
- Storage locations: Supabase (AWS US), Backblaze B2 (US)
- User rights: access, correction, deletion

**Terms of Service covers:**
- Age requirements
- License grant (user owns content, grants processing license)
- Prohibited content list
- AI-generated content disclaimers
- Pricing: $5 / $15 / $30 tiers
- Refund policy
- Termination, disclaimers, liability cap

### Things to verify before public launch

1. **Email address** — confirm `hello@songreels.ai` is correct everywhere
2. **Jurisdiction** — fill in actual state/country in dispute resolution section (currently vague)
3. **Retention periods** — currently: 30 days for uploads, 1 year for final videos. Change if needed.
4. **Legal review** — get a lawyer to review, especially if serving EU/UK customers (GDPR)

### Deployment

In GHL: create pages at slugs `/privacy` and `/terms` using Custom HTML blocks, paste the contents of `privacy.html` and `terms.html`. Must be accessible at `songreels.ai/privacy` and `songreels.ai/terms`.

---

## 10. Task: FFmpeg Compression Server (Hostinger VPS)

**Status: BUILT AND RUNNING — but quality issue discovered. Fix was given, deployment status unknown.**

### Why it exists

Uncompressed phone videos (MOV, MP4 from iOS/Android) can be 500MB+. Uploading them directly to Google Files API causes slow processing and sometimes failures. The compression server pre-processes clips to a consistent H.264 format before Gemini analysis.

### Where it lives

`https://n8n-i3t9.srv1486031.hstgr.cloud/` (same Hostinger VPS as n8n) — NOT a separate Hetzner server (this was clarified; the `.hstgr.cloud` subdomain is Hostinger).

The compressor runs as a service at `/opt/compressor/server.js`, managed by systemd or pm2.

### Original FFmpeg Settings (PROBLEMATIC)

```bash
-c:v libx264 -preset fast -crf 23
```

**CRF 23 was the problem.** CRF 23 produces a "web preview" quality file (~2–4 Mbps). For a gift video watched fullscreen on a phone, this creates visible macro-blocking, soft/washed-out motion, and compression artifacts. Combined with Creatomate doing a second encode on top, the final video quality was unacceptable.

### Fix Given (apply if not yet deployed)

In `/opt/compressor/server.js`, find and replace the FFmpeg params:

```bash
# OLD (bad quality):
'-c:v', 'libx264',
'-preset', 'fast',
'-crf', '23',

# NEW (high quality):
'-c:v', 'libx264',
'-preset', 'slow',
'-crf', '18',
'-pix_fmt', 'yuv420p',
'-profile:v', 'high',
'-level', '4.1',
```

Then restart: `systemctl restart compressor` or `pm2 restart compressor`

**What changed:**
- CRF 23 → CRF 18: "visually transparent" quality. Files ~2.5× bigger but sharpness preserved.
- `fast` → `slow` preset: ~10–15% better quality at same CRF (more CPU, but async so it doesn't matter).
- `yuv420p`: forces pixel format every player handles; without it some iPhone HDR videos produce washed-out output.
- `profile high` + `level 4.1`: enables H.264's better compression tools, ensures playback on iOS/Safari.

### Scale Setting

Current FFmpeg scale: `scale='min(1080,iw)':'min(1920,ih)'` — caps at 1080 but doesn't downscale below source. This is correct.

### Important Note

Even with the CRF 18 fix, the final video output was 270×480 because **Creatomate's free plan was the bottleneck** (see Task 3). The quality issue has two layers: FFmpeg CRF (fixable now) and Creatomate plan (requires $54/mo upgrade).

---

## 11. Infrastructure Reference

### Supabase

- **Project ref:** `xakngjsybyytldyqfsmi`
- **URL:** `https://xakngjsybyytldyqfsmi.supabase.co`
- **Plan:** Pro ($25/mo)
- **Key tables:**
  - `heartreel_jobs` — one row per generation job; tracks status, job data, clip URLs, generated content, final video URL
  - `access_codes` — beta invite codes

**Job status flow:**
```
(new) → needs_review → script_approved → generating_music → rendering → complete
                                                                       → failed
```

### n8n

- **URL:** `https://n8n-i3t9.srv1486031.hstgr.cloud/`
- **Main webhook:** `/webhook/heartreel`
- **Upload webhook:** `/webhook/get-upload-url`
- **Execution timeout:** should be set to 600 seconds (10 minutes)

### GoHighLevel

- **Domain:** `songreels.ai` (GoDaddy domain, DNS points to GHL)
- **Landing page slug:** root `/`
- **App slug:** `/app`
- **Preview URL (do NOT use as SITE_URL):** `sites.leadconnectorhq.com/preview/5UZi4PgoXe4b9ZS6WNRP`
- **Note:** GHL has a ~30–50KB limit on custom HTML blocks. The app HTML is ~65KB. If it breaks, host on Netlify/Cloudflare Pages instead and point GHL to it.

### Google Cloud

- **OAuth Client:** named `SongReels` (was `xakngjsybyytldyqfsmi.supabase.co`)
- **Authorized domains:** `songreels.ai`
- **Branding status:** Verified ✅
- **GoDaddy TXT record:** must remain in DNS or verification lapses

### Backblaze B2

- Used for final video storage (Creatomate uploads here)
- US-based
- Egress: $0.01/GB (at 5,000 views/month = <$5)

---

## 12. Known Removed / Abandoned Approaches

These were tried and explicitly dropped. Do not re-introduce them.

### ❌ Beat-sync / Line-boundary timestamp matching

**What it was:** System that used AssemblyAI word timestamps to detect when each lyric line is sung, then trimmed each clip to exactly match its assigned line duration. Created nodes: `Compute Line Boundaries`, `Map clips to timeline` (using `lyric_lines`).

**Why it was dropped:** Created timeline gaps between clips. The `cursor += placement_end_s - placement_start_s` logic left dead time between clips whenever the math didn't add up perfectly. Over-engineered; the simpler authored-alignment approach worked better.

**Replacement:** `Align Clips to Sections v3` — just sorts clips by clip_index. Back-to-back stacking in Creatomate.

---

### ❌ `SUNO_INTRO_SECS` 2-second hard cap

**What it was:** Line `const SUNO_INTRO_SECS = Math.min(Math.max(0, vocalOnset), 2.0)` — capped the detected vocal onset at 2 seconds max.

**Why it was dropped:** Suno's intro is often 5–12 seconds. Capping at 2s meant clips started playing 7–10 seconds before the singer even started, completely destroying sync.

**Replacement:** `const SUNO_INTRO_SECS = Math.max(0, vocalOnset)` — use the real detected onset with no cap.

---

### ❌ Supabase Custom Domain ($10/mo add-on)

**What it was:** Would replace `xakngjsybyytldyqfsmi.supabase.co` in the browser address bar with `auth.songreels.ai` during OAuth redirect.

**Why it was dropped:** Extra $10/mo not worth it for private beta. The visible branding issue (consent screen text) was fixed by the OAuth Client rename.

---

### ❌ GitHub Pages / Netlify for frontend hosting

**Was discussed as alternative to GHL** due to GHL's HTML size limit (~65KB). Not pursued because the current GHL setup works (barely). Keep as backup option if GHL breaks.

---

### ❌ GoHighLevel form-based upload workflow (original design)

**What it was:** The original concept had a GoHighLevel form that accepted uploads and redirected to Supabase. The current system moved to a custom single-page HTML app (songreels-app.html) hosted in GHL as a custom HTML block.

---

### ❌ Old URL: app.gohighlevel.com/v2/preview/5BpL6h12j423l2mZ4pd9

**This URL is dead (404).** Do not use it anywhere, especially not in `SITE_URL` inside the HTML.

**Current working URLs:**
- Landing: `songreels.ai`
- App: `songreels.ai/app`

---

## 13. Current Open Issues (as of May 2026)

Ordered by priority — most critical first.

### 🔴 CRITICAL: Creatomate on free plan → 270×480 resolution

All rendered videos are 270×480. The product is unusable for real users at this resolution.

**Action:** Upgrade Creatomate to Essential plan ($54/mo). No code change needed.

---

### 🔴 CRITICAL: Confirm which HTML versions are deployed

It's unclear whether the latest `songreels-app.html` (v6) and `songreels-landing.html` are actually live on GHL. Several deployment attempts had issues (404s, old versions still showing).

**Action:** Open `songreels.ai/app` in incognito and verify:
1. Brand says "SongReels" (plural, not "SongReel" singular)
2. Password gate appears before Google sign-in
3. "Continue with Google" says "to continue to SongReels" (not the Supabase URL)
4. `SITE_URL` in the HTML points to `songreels.ai/app` (not the old GHL preview URL)

---

### 🔴 CRITICAL: Confirm Creatomate body builder v3 and Align Clips v3 are deployed in n8n

These files were written and given:
- `align-clips-to-sections-v3.js`
- `creatomate-body-builder-v3.js`

If the old versions are still running, sync will be broken and duration caps won't work.

**Action:** In n8n, open both nodes and verify the code matches the v3 versions.

---

### 🟡 MEDIUM: FFmpeg CRF setting still at 23

The fix to CRF 18 was given but deployment is unconfirmed.

**Action:** SSH to Hostinger VPS → check `/opt/compressor/server.js` → verify `-crf 18` is set.

---

### 🟡 MEDIUM: SITE_URL in app HTML pointing to dead URL

If the currently deployed `songreels-app.html` still has:
```js
SITE_URL: 'https://app.gohighlevel.com/v2/preview/5BpL6h12j423l2mZ4pd9'
```
...then the shareable link given to users on the done screen will be broken.

**Action:** Update `SITE_URL` to `https://songreels.ai/app`.

---

### 🟡 MEDIUM: Suno SSL cert error may still be present

The SSL cert fix (toggle "Ignore SSL Issues" in n8n Suno node) was given but not confirmed deployed.

**Action:** Check the Suno API node in n8n → Options → verify "Allow Unauthorized Certificates" is ON.

---

### 🟡 MEDIUM: Suno poll timeout (2:15 max, may need 3+ min)

**Action:** Add a third poll attempt, or set up Suno's callback URL (currently `placeholder.com/callback`, which does nothing).

---

### 🟢 LOW: Supabase Custom Domain (for public launch)

The browser address bar briefly shows `xakngjsybyytldyqfsmi.supabase.co` during the OAuth handshake. Acceptable for beta, not for public launch.

**Action (when ready to launch publicly):** Enable Supabase custom domain add-on ($10/mo) → set up `auth.songreels.ai` with DNS.

---

### 🟢 LOW: Suno duration not honoring user's selection for Epic tier

Epic (6 min) generates 3:41 from Suno. The hard cap in Creatomate body builder v3 handles this (video is capped at 450s / 7:30), but the user may feel their "6 min" request wasn't honored.

**Action (if needed):** Implement Suno Extend API to chain additional audio for longer songs. Or switch to V5/V5_5 model which may handle longer generation better.

---

### 🟢 LOW: Privacy/Terms pages need deployment

Files were built but may not be live at `songreels.ai/privacy` and `songreels.ai/terms`.

**Action:** Deploy both HTML files to GHL at slugs `/privacy` and `/terms`. Google OAuth branding is already verified, so this is for user trust, not unblocking anything.

---

## 14. Next Steps Priority Order

1. ✅ **Upgrade Creatomate** to Essential ($54/mo) — unblocks quality testing
2. ✅ **Verify deployed versions** of `songreels-app.html` and n8n nodes (v3 align clips + creatomate body builder)
3. ✅ **Run end-to-end test** with fresh phone videos after Creatomate upgrade
4. ✅ **Deploy FFmpeg CRF 18 fix** on Hostinger VPS if not done
5. ✅ **Fix SITE_URL** in app HTML if still pointing to dead URL
6. ✅ **Fix Suno SSL cert** in n8n if still erroring
7. ✅ **Deploy privacy/terms pages** to GHL
8. ✅ **Add third Suno poll** to prevent timeout failures on longer songs
9. ✅ **Supabase custom domain** — only when ready to go public ($10/mo)

---

*End of documentation. Generated from all Bumpy project chats on May 29, 2026.*
