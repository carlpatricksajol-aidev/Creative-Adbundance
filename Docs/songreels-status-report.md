# SongReels — Project Status Report

**Last updated:** May 28, 2026
**Project:** AI-generated personalized music video gifts (formerly HeartReel)
**Domain:** songreels.ai (custom domain on GoDaddy, pointing to GoHighLevel preview during beta)
**Status:** Beta — not yet public, password-gating in development

---

## Table of Contents

1. [Product Overview](#product-overview)
2. [Architecture & Stack](#architecture--stack)
3. [Key Configuration & Endpoints](#key-configuration--endpoints)
4. [Pricing & Unit Economics](#pricing--unit-economics)
5. [The Full Workflow](#the-full-workflow)
6. [Major Bugs Found & Fixed (Chronological)](#major-bugs-found--fixed-chronological)
7. [Currently Pending Deployments](#currently-pending-deployments)
8. [Open Issues & Decisions](#open-issues--decisions)
9. [Files in Outputs Directory](#files-in-outputs-directory)
10. [Lessons Learned](#lessons-learned)
11. [Recommended Next Steps](#recommended-next-steps)

---

## Product Overview

SongReels takes user-uploaded photos and video clips, runs them through a chain of AI services, and produces a custom personalized music video as a gift. The user:

1. Signs in with Google (via Supabase auth)
2. Picks an occasion (Mother's Day, birthday, anniversary, etc.)
3. Answers two prompts: who is the gift for, what is the theme
4. Uploads photos and video clips (up to 20 files), describes each
5. Picks song style (genre, mood, length tier)
6. Reviews and approves AI-generated script + lyrics
7. Receives a finished 9:16 vertical music video as a shareable link

Total user time: ~5 minutes. No human involvement on the operator side.

---

## Architecture & Stack

### Frontend
- **HTML/CSS/JS** single-page app embedded in GoHighLevel
- **Supabase JS SDK** for auth and storage
- **heic2any** for HEIC photo conversion in-browser

### Backend Orchestration
- **n8n** workflow on Hostinger VPS (187.77.154.60), paid through 2027-05-12
- **VPS FFmpeg compressor** at localhost:3000/compress (server-side compression before upload to Google)

### AI Services
- **Google Gemini** — analyzes video/photo clips, returns descriptions + emotional tone
- **Anthropic Claude** — writes script and song lyrics based on Gemini's analysis
- **Suno** (via sunoapi.org third-party reseller) — generates original music from approved lyrics
- **Creatomate** — renders final 9:16 video with clips, music, transitions, Ken Burns effects

### Storage
- **Supabase Storage** — user uploads (photos, videos)
- **Backblaze B2** — final rendered videos

### Auth
- **Google OAuth** via Supabase (currently shows supabase URL on consent screen — needs rebranding)

---

## Key Configuration & Endpoints

| Item | Value |
|---|---|
| Supabase URL | `https://xakngjsybyytldyqfsmi.supabase.co` |
| N8N webhook | `https://n8n-i3t9.srv1486031.hstgr.cloud/webhook/heartreel` |
| N8N upload URL | `https://n8n-i3t9.srv1486031.hstgr.cloud/webhook/get-upload-url` |
| Suno API | `https://api.sunoapi.org/api/v1/generate` (V4_5ALL model) |
| Creatomate API | `https://api.creatomate.com` |
| VPS | 187.77.154.60 (Hostinger) |
| Compressor | `http://localhost:3000/compress` |
| Compress secret | `<COMPRESS_SECRET — rotate on VPS; keep in env, not committed>` |
| Gemini API key | `<GEMINI_API_KEY — rotated; keep in env, not committed>` |
| Site URL (preview) | `https://sites.leadconnectorhq.com/preview/5UZi4PgoXe4b9ZS6WNRP?notrack=true` |

---

## Pricing & Unit Economics

### Customer-Facing Tiers

| Tier | Length | Price |
|---|---|---|
| Chorus | ~1 min | $5 |
| Full Song | ~3 min | $15 |
| Epic | ~6 min | $30 |

### Per-Song Costs (Operator Side)

| Service | Cost per song | Notes |
|---|---|---|
| Suno (sunoapi.org) | ~$0.06 ($5/1000 credits, 12 credits/song) | Current provider |
| Creatomate render | Plan-dependent | Free trial DOES NOT support 1080p |
| Google Gemini | Token-based, ~$0.01-0.03 per gift | Multiple files analyzed |
| Anthropic Claude | Token-based, ~$0.01-0.02 per gift | Script + lyrics generation |
| Backblaze storage | <$0.001 per gift | Cheap, scales well |

**Gross margin per gift:** Very healthy at all tiers. Chorus tier ($5) costs ~$0.10–0.20 to produce → ~96% margin before Creatomate fees.

### Alternative Music Provider Considered: Google Lyria 3

- Cost: $0.08/song (vs your Suno at $0.06)
- **More expensive than Suno** at your current pricing
- **3-minute hard cap** — cannot do Epic tier (6 min)
- Pros: official Google API, better reliability than third-party Suno wrappers
- **Decision: stay on Suno** — math doesn't support switching

### Creatomate Resolution Issue (Unresolved)

- Current Creatomate plan: **Free trial** → forces all renders to **270×480**
- Code requests 1080×1920 but Creatomate silently downscales
- **Only fix:** upgrade to Essential ($54/mo) or Growth ($129/mo) plan
- **Current decision:** Stay on free trial during dev. Upgrade before paying customers.

---

## The Full Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│ USER (browser)                                                   │
│  - Signs in with Google                                          │
│  - Picks occasion, answers prompts                               │
│  - Uploads photos + video clips                                  │
│  - Picks song style                                              │
│  - Submits form                                                  │
└─────────────────────┬───────────────────────────────────────────┘
                      │ HTTP POST
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ N8N WORKFLOW (Hostinger VPS)                                     │
│                                                                  │
│  1. Webhook: New Heartreel Job                                   │
│  2. Get Job Details (Supabase row fetch)                         │
│  3. Shuffle Clips ★ (Fisher-Yates random reorder)                │
│  4. Compress Videos on Server (FFmpeg via localhost:3000)        │
│  5. Prepare clips for Google upload (sets clip_index)            │
│  6. Upload to Google File API (PARALLEL)                         │
│  7. Extract Google URI (attaches clip_index to each)             │
│  8. Get File State (poll each until ACTIVE)                      │
│  9. Aggregate File State v2 ★ (sorts by clip_index, prevents     │
│     parallel upload order corruption)                            │
│ 10. Gemini - Analyze Clips (returns visual_description,          │
│     emotional_tone, key_moments per clip)                        │
│ 11. Parse Gemini Response                                        │
│ 12. Compute Vocal Onset (estimates instrumental intro length)    │
│ 13. Map clips to timeline ★                                      │
│ 14. Align Clips to Sections v3 ★ (simple pass-through, no fancy │
│     timestamp matching)                                          │
│ 15. Build Claude Prompt v5 (action+anchor stanza plan)           │
│ 16. Claude API call (writes script + lyrics matching clip order) │
│ 17. Parse Claude Response                                        │
│ 18. Update job: status = 'script_ready'                          │
│ 19. ⏸ WAIT FOR USER (resume URL)                                 │
│ 20. User reviews script/lyrics on web UI, approves               │
│ 21. Webhook resume                                               │
│ 22. Suno API - Generate Song (sends approved lyrics)             │
│ 23. Poll Suno Status (until song ready, with retries)            │
│ 24. Extract Suno Clip ID + audio URL                             │
│ 25. Get Timestamped Lyrics (from Suno)                           │
│ 26. Compute actual vocal onset from timestamped lyrics           │
│ 27. Creatomate body builder v3.1 ★ (back-to-back stacking,       │
│     hard duration cap, vocal-onset-synced clip start)            │
│ 28. Creatomate render                                            │
│ 29. Update job: status = 'complete', final_video_url             │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ USER (browser polls every 4s)                                    │
│  - Sees "Made with love" done screen                             │
│  - Phone-frame video preview on right side (50/50 split)         │
│  - Copy link / Share on WhatsApp                                 │
│  - Hook cards: "Got someone else who deserves one?"              │
└─────────────────────────────────────────────────────────────────┘
```

★ = nodes that have been heavily debugged/patched

---

## Major Bugs Found & Fixed (Chronological)

### Bug 1: SSL Certificate Verification Failures on Suno API

**Symptom:** `UNABLE_TO_VERIFY_LEAF_SIGNATURE` error in Suno node, blocking all music generation.

**Root cause:** Either sunoapi.org's SSL cert wasn't in n8n's CA bundle, or sunoapi.org's server had cert misconfiguration.

**Fix:** Toggle **"Ignore SSL Issues (Insecure)"** in the Suno API node settings.

**Status:** ✅ **DEPLOYED** — working

**Limitation:** Tactical fix. Long-term, should update Node CA certs on VPS or move to a more reliable Suno provider.

---

### Bug 2: GENERATE_AUDIO_FAILED 500 Errors

**Symptom:** Suno returns `status: GENERATE_AUDIO_FAILED, errorCode: 500, errorMessage: "Internal Error, Please try again later."`

**Root cause:** Transient Suno-side server issues (acknowledged by Suno API docs as common, usually fixes itself in <10 min).

**Fix:** No code change required for occasional cases. Long-term needs retry logic.

**Status:** ⏸️ **DEFERRED** — Retry logic not yet built. Customers may currently see "failed" job if Suno hiccups.

---

### Bug 3: Sunoapi.org Full Outage (SSL_VERSION_OR_CIPHER_MISMATCH)

**Symptom:** Even sunoapi.org's website couldn't be reached — full provider outage.

**Root cause:** sunoapi.org is a third-party Suno reseller, not Suno's official API. No SLA, no support. Their entire SSL infra went down.

**Fix:** Wait it out (they recovered within hours).

**Status:** ⚠️ **STRATEGIC RISK** — your product reliability = sunoapi.org's reliability. Consider building retry + fallback to alternate provider.

---

### Bug 4: Clip Order Mismatch — Gemini Describing Wrong Clips

**Symptom:** First uploaded clip (laptop screen) was described by Gemini as "palm tree fronds." Every Gemini description was attached to wrong video file.

**Root cause:** **The most damaging bug we found.** Parallel uploads to Google File API completed in random order based on file size/network jitter. `Aggregate File State` then collected them in completion order, not original upload order. Gemini analyzed files in scrambled order and labeled them `clip_index: 0, 1, 2` based on position in its input — but those positions had nothing to do with user's original upload order.

**Result:** Downstream nodes that did `videoClips[i] ↔ geminiClips[i]` matched the laptop URL with the palm tree description, etc. This caused:
- Lyrics describing wrong visuals
- Sync impossible (anchor words in lyrics didn't exist in actual clips)
- Random-feeling output every test

**Fix:** Rewrote `Aggregate File State` to look up each Google file's original `clip_index` via `$('Extract Google URI').all()`, attach `original_clip_index`, then sort `active_files` by clip_index before passing to Gemini.

**Status:** ✅ **DEPLOYED** as `aggregate-file-state-v2.js`

**Files:**
- `aggregate-file-state-v2.js`
- `CLIP-ORDER-BUG-FIX.md` (detailed explanation)

---

### Bug 5: Line-Level Anchor Matching Created Black Gaps

**Symptom:** Final video had 3-5 second black gaps between clips. Clip 1 ended at 17s, clip 2 didn't start until 22s.

**Root cause:** Built "line-level sync" feature where each clip was placed at the exact timestamp where its anchor word appeared in lyrics. When fuzzy matching failed ("yellow wall" in lyrics, "yellow building" in clip → no match), clips got distributed unevenly with gaps between them.

**Fix:** Reverted to **back-to-back stacking with authored alignment**. Now clips play one after another with no gaps. Sync emerges from the architecture (Claude writes lyrics matching clip order) rather than runtime word-matching.

**Status:** ✅ **DEPLOYED** as `creatomate-body-builder-v3.js`

---

### Bug 6: Duration Overrun — 1 Min Selection Producing 2:54 Video

**Symptom:** User picks Chorus tier (1 minute) but final video is 2:54 long.

**Root cause:** Suno has NO duration parameter. It generates whatever length its model decides, often 3-4 minutes regardless of lyric length. The Creatomate body builder was matching audio length, not user's chosen tier.

**Fix:** Added hard duration cap based on user tier:
- Chorus (1 min) → max 75s (1.25x safety margin)
- Full Song (3 min) → max 225s
- Epic (6 min) → max 450s

Audio is trimmed to cap with a 3-second fade-out. Clips that don't fit get dropped from the end.

**Status:** ✅ **DEPLOYED** in `creatomate-body-builder-v3.1.js`

---

### Bug 7: Clips Starting Before Vocals (9-Second Sync Drift)

**Symptom:** Video shows first clip at 0:01, but vocals don't start until 0:09. By the time lyrics describe the laptop, the video is already on the yellow wall clip.

**Root cause:** Capped `SUNO_INTRO_SECS` at 2 seconds, thinking it was a polish thing. But Suno's actual instrumental intro is 8-12 seconds.

**Fix:** Use ACTUAL `vocalOnset` from Suno's timestamped lyrics (no cap). Clip 1 now starts exactly when vocals begin. Black screen plays during Suno's instrumental intro.

**Status:** ✅ **DEPLOYED** in `creatomate-body-builder-v3.1.js`

---

### Bug 8: Sequential Clip Order — No Randomization

**Symptom:** User uploads clips in order [A, B, C, D, E]. Final video always plays in [A, B, C, D, E]. Repeat customers can predict outcome.

**Root cause:** Was the original behavior (matched lyrics to upload order).

**Decision:** Add Fisher-Yates shuffle BEFORE Gemini analyzes. Everything downstream sees the new order as if it were the original upload order. Result: random clip order + Claude writes lyrics matching the new order.

**Fix:** Created `Shuffle Clips` node between `Get Job Details` and `Compress Videos on Server`.

**Status:** ✅ **DEPLOYED** as `shuffle-clips.js`

---

### Bug 9: Shuffle Being Ignored by 4 Downstream Nodes

**Symptom:** Shuffle node's output showed clips in shuffled order, but final video STILL played in upload order.

**Root cause:** **The most insidious bug we found.** Four downstream nodes were reaching back upstream to `Get Job Details` or `Compress Videos on Server` for `video_clips`, bypassing the shuffle entirely:
- `Map clips to timeline`
- `Build Claude Prompt`
- `Creatomate body builder`
- `Align Clips to Sections`

The shuffle WAS happening — but the data WASN'T being used.

**Fix:** Patched all 4 nodes to prefer `$('Shuffle Clips').first().json.video_clips` as the source, with fallbacks if Shuffle Clips isn't available.

**Status:** ⏸️ **PENDING DEPLOYMENT**

**Files:**
- `align-clips-to-sections-shuffle-aware.js`
- `build-claude-prompt-shuffle-aware.js`
- `creatomate-body-builder-shuffle-aware.js`
- `map-clips-to-timeline-shuffle-aware.js`

---

### Bug 10: Done Screen Layout Broken (50/50 Split Not Rendering)

**Symptom:** On completion, video preview was missing from right side. Only "Made with love" text + buttons showed in narrow column.

**Root cause:** Multiple compounding issues:
1. `.wrap` class constrained `#screen-done` to 900px max (too narrow for 50/50)
2. Media query collapsed to single column at 880px (GoHighLevel previews below this)
3. `position: sticky` on `.done-left` fought GHL's wrapper
4. `align-items: flex-start` made video frame float above text

**Fix:** Removed `.wrap` class from done screen, gave it standalone 1200px max-width, dropped breakpoint to 640px, removed sticky positioning, centered alignment.

**Status:** ⏸️ **PENDING DEPLOYMENT** as `heartreel-form-v6.html`

---

### Bug 11: Done Video Pixelation

**Symptom:** Preview video in done screen looked pixelated/blurry.

**Root cause:** Two factors:
1. Video frame too small (380px) — exaggerated the 270×480 Creatomate output
2. `object-fit: cover` was cropping; combined with low-res source, made it look worse

**Fix:** Increased frame to 460px max-width, switched to `object-fit: contain`, added GPU acceleration hints (`transform: translateZ(0)`, `backface-visibility: hidden`).

**Status:** ⏸️ **PENDING DEPLOYMENT** in `heartreel-form-v6.html`

**Note:** Real fix requires Creatomate plan upgrade to get true 1080p output. UI tweak only mitigates display.

---

## Currently Pending Deployments

### 1. Four Shuffle-Aware Node Patches (HIGH PRIORITY)

**What:** Replace 4 nodes with versions that read `video_clips` from `Shuffle Clips` instead of bypassing it.

**Files:**
- `align-clips-to-sections-shuffle-aware.js`
- `build-claude-prompt-shuffle-aware.js`
- `creatomate-body-builder-shuffle-aware.js`
- `map-clips-to-timeline-shuffle-aware.js`

**Deploy:** Replace each node's code in n8n with the corresponding file. Save workflow.

**Verify:** Run same upload twice. Should produce different clip orders.

---

### 2. HTML v6 Done Screen Fix (MEDIUM PRIORITY)

**What:** Updated done screen with proper 50/50 split layout, larger video frame, better pixelation handling.

**File:** `heartreel-form-v6.html`

**Deploy:** Replace existing HTML in GoHighLevel with this version.

**Verify:** Complete a job, see split layout with phone-frame video preview on right side.

---

### 3. Privacy Policy & Terms Pages (REQUIRED FOR PUBLIC LAUNCH)

**What:** Two static HTML pages required by Google OAuth for production approval.

**Files:**
- `privacy.html` → host at `songreels.ai/privacy`
- `terms.html` → host at `songreels.ai/terms`

**Deploy:** Add as new pages in GoHighLevel, or host directly on songreels.ai web server.

**Verify:** Both URLs return the page in browser.

---

### 4. Beta Access Users SQL (PENDING)

**What:** Supabase table for password-gating during beta. Two-gate system:
1. Google sign-in (existing)
2. Username + password from `beta_access_users` table (new)

**Files:**
- `beta-access-users-setup.sql` — schema, RLS policies, sample inserts

**Deploy:**
1. Run SQL in Supabase SQL editor
2. Edit sample inserts to add real testers (username + password + email)
3. **Then I need to add the password gate UI to the HTML** (NOT YET BUILT)

**Status:** SQL exists, frontend integration not yet built.

---

## Open Issues & Decisions

### 1. Google OAuth Consent Screen Shows Supabase URL

**Issue:** When users click "Continue with Google", they see "Choose an account to continue to **xakngjsybyytldyqfsmi.supabase.co**" instead of "SongReels."

**Why:** Google OAuth shows the registered redirect domain on the consent screen. Currently Supabase's URL is registered.

**Options considered:**
- ❌ Supabase Custom Domain add-on ($10/mo additional on Pro) — user declined
- ✅ **Rebrand OAuth consent screen in Google Cloud Console** (free, ~5 min) — current path
- ❌ Create new Google OAuth client from scratch (you already have one)

**Status:** User needs to:
1. Go to Google Cloud Console → OAuth consent screen
2. Set App name = "SongReels"
3. Set App logo (small PNG)
4. Set Application home page = `https://songreels.ai`
5. Set Privacy policy = `https://songreels.ai/privacy`
6. Set Terms of service = `https://songreels.ai/terms`
7. Add `songreels.ai` to Authorized domains
8. Publish (change status from Testing to In production)

---

### 2. Creatomate 270×480 Output (Resolution)

**Issue:** Code requests 1080×1920 but free trial silently downscales to 270×480.

**Status:** **Accepted limitation during dev.** Will upgrade plan before public launch.

**Cost when ready:** Essential plan $54/mo (2000 credits + full HD/4K).

---

### 3. Suno Retry Logic

**Issue:** When Suno returns transient 500 errors, the job fails. No automatic retry.

**Impact:** Some percentage of jobs fail unnecessarily on Suno hiccups.

**Status:** ⏸️ **DEFERRED** — will build when it becomes a customer pain point.

**Sketch of fix:**
- Detect `status === 'GENERATE_AUDIO_FAILED'`
- Wait 30s
- Retry up to 3 times
- If all fail: mark job as failed, show user a refund-friendly error

---

### 4. Suno Provider Risk

**Issue:** sunoapi.org is a third-party reseller with no SLA. Has had multiple outages.

**Options:**
- Stay on sunoapi.org (current)
- Add fallback to sunoapi.com or Apiframe
- Switch entirely to Lyria 3 (more expensive, capped at 3 min, breaks Epic tier)

**Status:** **Stay on sunoapi.org for now.** Math doesn't support switching at current scale.

**When to revisit:** After third major outage, or when scaling past 500 songs/month.

---

### 5. Brand Rename: HeartReel → SongReels

**Status:** User confirmed rename. Most user-facing copy already updated. Internal node names, n8n workflow filename, and Supabase table (`heartreel_jobs`) still use "heartreel."

**Decision:** Don't rename internal stuff yet. It works. Rename only what users see.

---

### 6. Epic Tier (6 Min) — Suno Caps Around 3:40

**Issue:** Suno V4_5ALL model produces songs up to ~3:40-4:00. Epic tier promises 6 minutes.

**Options:**
- Use Suno's "Extend" API to chain segments (complex)
- Re-label Epic tier as "Extended" (3-4 min realistically)
- Drop Epic tier
- Pay for Suno's higher tier (V5 model goes longer)

**Status:** ⏸️ **DEFERRED** — figure out before public launch.

---

## Files in Outputs Directory

### Currently Active (Deployed or Ready to Deploy)

| File | Purpose | Status |
|---|---|---|
| `heartreel-form-v6.html` | Latest frontend with done-screen 50/50 fix, larger video frame | ⏸️ Pending deploy |
| `shuffle-clips.js` | Fisher-Yates random clip reorder | ✅ Deployed but at wrong position |
| `aggregate-file-state-v2.js` | Preserves clip_index through parallel Google uploads | ✅ Deployed |
| `align-clips-to-sections-shuffle-aware.js` | Reads video_clips from Shuffle Clips | ⏸️ Pending deploy |
| `build-claude-prompt-shuffle-aware.js` | Reads video_clips from Shuffle Clips | ⏸️ Pending deploy |
| `creatomate-body-builder-shuffle-aware.js` | Reads video_clips from Shuffle Clips | ⏸️ Pending deploy |
| `map-clips-to-timeline-shuffle-aware.js` | Reads video_clips from Shuffle Clips | ⏸️ Pending deploy |
| `creatomate-body-builder-v3.1.js` | Uses actual vocal onset (no 2s cap) | ✅ Replaced by shuffle-aware version |
| `align-clips-to-sections-v3.js` | Simple pass-through | ✅ Replaced by shuffle-aware version |
| `privacy.html` | Privacy policy page | ⏸️ Needs hosting |
| `terms.html` | Terms & conditions page | ⏸️ Needs hosting |
| `beta-access-users-setup.sql` | Beta access table schema | ⏸️ Needs running in Supabase |

### Superseded (Older Versions, Kept for Reference)

| File | Replaced by |
|---|---|
| `creatomate-body-builder-v3.js` | `creatomate-body-builder-v3.1.js` |
| `creatomate-body-builder-final.js` | `creatomate-body-builder-shuffle-aware.js` |
| `build-claude-prompt-v5-action-anchors.js` | `build-claude-prompt-shuffle-aware.js` |
| `align-clips-to-sections-v2.js` | `align-clips-to-sections-v3.js` (then shuffle-aware) |
| `heartreel-form-v4.html`, `heartreel-form-v5.html` | `heartreel-form-v6.html` |
| `build-claude-prompt-v3-emotional.js`, `v4-per-stanza-anchors.js` | `build-claude-prompt-v5-action-anchors.js` |
| `sync-fix-v2-deployment.md`, `sync-fix-v2-patch-fixed.md` | N/A — abandoned approach |
| `CLIP-ORDER-BUG-FIX.md`, `SHUFFLE-FIX-PATCH-INSTRUCTIONS.md` | Reference docs |

---

## Lessons Learned

### 1. Authored Alignment Beats Runtime Sync

The biggest insight from this project: don't try to MATCH lyrics to clips at runtime with word matching. Instead, make Claude WRITE lyrics that follow clip order from the start. Then simple back-to-back stacking just works.

We spent days on line-level anchor matching that fundamentally couldn't work because:
- Anchor words in lyrics ("yellow wall") rarely matched clip descriptions exactly ("yellow building")
- Fuzzy matching caused random clip distribution
- Even successful matches created gaps when lyric timing didn't match clip duration

The fix was philosophical: **change the architecture so sync emerges naturally** rather than trying to enforce it at the visual layer.

### 2. Parallel Uploads Break Order

Anytime you have parallel HTTP requests followed by aggregation, **assume the order is scrambled**. Always re-sort by an explicit `clip_index` field that was set BEFORE the parallel work began.

This bit us hard with the Google File API uploads. Fixed by re-attaching `clip_index` via lookup at aggregation time.

### 3. Don't Reach Back Over Transformations

If you insert a new node in the middle of a workflow (like our shuffle node), **EVERY downstream node that reads from earlier nodes must be updated**. Otherwise the transformation gets bypassed.

The shuffle was happening but being ignored because 4 nodes reached past it to `Get Job Details`. The data flowed correctly through the chain but consumers weren't using the chain's output — they were reaching upstream.

### 4. Vocal Onset Is Sacred

Suno's instrumental intros are 5-12 seconds and inconsistent. **Don't cap or normalize this.** Use the actual vocal onset from timestamped lyrics. Black screen during instrumental is fine — better than misaligned visuals.

### 5. Hard Duration Caps Are Non-Negotiable

User picks Chorus (1 min) → max video 75s. Period. Suno generates whatever it wants — we trim with fade-out. **The user's choice is the contract**, not Suno's output.

### 6. Third-Party Resellers Carry Risk

Building on sunoapi.org instead of an official API meant we hit unique SSL issues, full outages, and no support escalation. **For critical dependencies, prefer official APIs even at higher cost** — unless economics force the choice.

### 7. Creatomate Free Trial Silently Downscales

Code requested 1080×1920, Creatomate served 270×480. **No warning, no error.** Free trial plan restriction was buried in their docs. Always test ACTUAL output against expected output, not just check that the API returned 200 OK.

---

## Recommended Next Steps

### Immediate (This Week)

1. **Deploy the 4 shuffle-aware node patches** — fixes the random clip order bug
2. **Deploy HTML v6** — fixes done screen 50/50 layout
3. **Test end-to-end** with same uploads twice — confirm random order produces different videos with matching lyrics

### Short-Term (Next 2 Weeks)

4. **Host privacy.html and terms.html** at songreels.ai/privacy and /terms
5. **Update Google OAuth consent screen** with SongReels branding, logo, privacy/terms links
6. **Run beta-access-users-setup.sql** in Supabase, add real testers
7. **Build the password gate UI** in HTML (not yet built — need to add screen between Google sign-in and form)

### Before Public Launch

8. **Upgrade Creatomate plan** ($54/mo Essential) to get 1080p output
9. **Build Suno retry logic** with graceful failure for stuck jobs
10. **Decide on Epic tier**: keep at 3-4 min realistic, or build Suno Extend integration
11. **Add Stripe or payment processor** (currently no payment integration mentioned in workflow)
12. **Add email notifications** (job complete, refund processed, etc.)
13. **Get legal review** of privacy + terms pages
14. **Set up analytics** to understand drop-off points in funnel

### Optional Polish

15. Add Suno fallback provider (Apiframe or sunoapi.com) for resilience
16. Build admin dashboard for monitoring failed jobs
17. Add per-clip retry option in UI (re-upload failed clip without restarting whole flow)
18. Cache Gemini analyses by clip URL hash (avoid re-analyzing if user re-uploads same clip)

---

## Critical Decisions Log

| Date | Decision | Reasoning |
|---|---|---|
| Earlier | Authored alignment over runtime sync | Anchor matching couldn't work; sync via clip order is reliable |
| Earlier | Hard duration cap at 1.25x user tier | User pays for length, gets length |
| Earlier | Black screen during Suno's instrumental intro | Better than misaligned visuals |
| May 27 | Shuffle clips at start of pipeline | Random order + matching lyrics = best UX |
| May 27 | Stay on sunoapi.org for now | Math doesn't support switching despite reliability concerns |
| May 28 | Stay on Suno over Lyria | Suno $0.06/song vs Lyria $0.08/song; Lyria caps at 3 min |
| May 28 | Two-gate auth (Google + Supabase password) | Beta lockdown without disrupting Google flow |
| May 28 | Stay on Creatomate free trial during dev | Will upgrade before paying customers |
| May 28 | Free Google OAuth rebrand vs $10/mo Supabase Custom Domain | Same result, save $120/year |

---

## Contact / Ownership

- **Project owner:** Carl Carl Sajol (carlcarlsajol321@gmail.com)
- **VPS:** Hostinger (paid through 2027-05-12)
- **Domain:** songreels.ai (GoDaddy)
- **Supabase project:** xakngjsybyytldyqfsmi (Pro plan)
- **Anthropic Claude:** Provides ongoing engineering and debugging support

---

*End of report. For questions or to update this document, regenerate after major changes.*
