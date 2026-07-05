# SongReels — Phase 2: "we watched your clips → tailored questions"

Eric's idea: after someone uploads their clips, the app should show that it *looked*
at them ("Looks like a sweet moment between a parent and child…") and then ask a few
**tailored** questions instead of asking "what's this about?" in a vacuum.

## Flow (now 5 steps)

1. The basics (name + who + occasion)
2. Your videos (upload + captions + "what's this about")
3. **A few questions** ← NEW: a "here's what we see" read of the clips + 3 tailored questions
4. Your note
5. Song style → Generate

## How it works (frontend — shipped, live)

- On leaving the videos step, the browser captures **one representative frame per clip**
  (a video's mid-frame via canvas, or a downscaled photo) — small JPEGs, done locally.
- It POSTs those frames + captions + occasion + name to **`/api/analyze-clips`**.
- That endpoint asks **Gemini vision** for: (1) a warm one-sentence "read" of what the
  clips are about, and (2) exactly 3 short, tailored questions grounded in what it sees.
- The screen shows the read (with a **"that's not quite it — fix it"** editor) and the
  three questions. Answers + the read are folded into the song context.
- The full-video highlight analysis still happens later in **n8n** at generation time —
  this frame pass is only for the interactive questions (cheap + fast + fits serverless).

## ⚠️ ONE required setup step (owner)

The analysis needs a Gemini API key in **Vercel** (it is NOT there yet — Gemini only
lives in n8n today). Until it's added, the step still works but shows solid **generic**
occasion-aware questions instead of clip-tailored ones (graceful fallback, never blocks).

**Add it:** Vercel → project → Settings → Environment Variables →
- `GEMINI_API_KEY` = a Google AI Studio / Gemini API key (can be the same one used in n8n)
- (optional) `GEMINI_MODEL` = `gemini-2.5-flash` (default if unset)

Redeploy (or it picks up on the next deploy). That's it — the tailored read + questions
light up automatically.

Cost/latency: one Gemini **flash** call per reel on ≤8 small frames — a few cents and a
few seconds. `vercel.json` sets `maxDuration: 60` for the function for headroom.

## What the song receives

`questionsContinue()` folds the (possibly edited) read + the Q&A into `f-include` /
`f-memory`, which the current Build Claude Prompt already weaves into the lyrics — **so
the answers affect the song with no n8n change needed.**

It also stores structured copies for a future upgrade:
- `f-vision-read` — the one-line read (string)
- `f-answers` — JSON array of `{q, a}`

### Optional n8n upgrade (later, not required)

In **Build Claude Prompt**, you can read those directly for cleaner prompting:

```js
let answers = [];
try { answers = JSON.parse(fd['f-answers'] || '[]'); } catch (e) {}
const visionRead = fd['f-vision-read'] || '';
// e.g. add to the GIFT-GIVER CONTEXT block:
//   ${visionRead ? `What the clips show: ${visionRead}. ` : ''}
//   ${answers.filter(a=>a.a).map(a => `${a.q} ${a.a}`).join(' ')}
```

Then you could stop relying on the f-include/f-memory fold. Optional polish.

## Files

- `api/analyze-clips.js` — the Gemini-vision endpoint (graceful fallback if no key).
- `Songreels/create.html` — screen-q + srCaptureThumb / runClipAnalysis / renderQuestions
  / questionsContinue / visReadEdit; 5-step nav.
- `vercel.json` — `functions."api/analyze-clips.js".maxDuration = 60`.
