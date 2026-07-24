---
name: Adbundance Creative Generator
title: Adbundance Creative Generator
description: A self-serve web app that turns a client's product (name, website, photo) into a ready-to-post, scroll-stopping video ad in minutes.
status: Live (private beta) — core generation working end to end
owner: Eric Mann
build_lead: Carl Sajol
live_url: https://creative-os-blue.vercel.app
last_updated: 2026-07-08
---

# Creative OS

> Feel the magic of Creative Adbundance. Fill out a short brief, get a finished, scroll-stopping ad for your exact product in minutes.

This is the single source-of-truth document for the Creative OS site — what it is, why it exists, what it does today, and how it works under the hood. Think of it as the site's `SKILL.md`: read this first before changing anything.

---

## 1. What it is (in one breath)

Creative OS is a website where a client types in their **product name**, **website**, **target audience**, and **the kind of ad they want**, uploads **one product photo**, and clicks a button. A few minutes later a **15-second vertical video ad** appears on the screen — voiced, captioned, and starring their real product — ready to preview and download.

Under the hood it is Creative Adbundance's ad-making expertise turned into an automated pipeline. The same strategic thinking a human creative strategist would apply — pick the format, write the script, time it to the second, direct the shots — runs silently in software, then hands the result to an AI video model.

## 2. The objective (the "why")

Creative Adbundance makes winning video ads for brands. That work is powerful but human-limited: every ad takes a strategist, a shoot or an editor, and back-and-forth. **Creative OS productizes that expertise** so a brand can get a genuinely good ad without a meeting, a brief call, or a week of turnaround.

The bet: if the output is good enough that a client's reaction is *"I want to work with this company"*, then Creative OS becomes two things at once —
1. a **front door / lead magnet** for the agency (try it free, get hooked, become a client), and
2. eventually a **standalone product** brands pay for.

## 3. Goals

- **Zero back-and-forth.** Product in → finished ad out. No brief call required.
- **Agency-grade quality.** The output should match the bar of Creative Adbundance's human-made ads, not look like generic AI slop.
- **Exact-product fidelity.** The ad must show the client's *real* product — right shape, color, label, branding — not a lookalike.
- **Genuinely good, every time.** A quality floor high enough that no client ever sees an embarrassing result. (Eric's "checks and balances" principle.)
- **Fast.** Minutes, not days. Target 3–6 minutes from submit to preview.
- **Repeatable and scalable.** Many clients, many concepts, one system. What wins for one brand becomes a reusable template.

## 4. Who it's for

- **Primary:** brand owners and marketers who want ad creative fast and cheap, and small teams without an in-house creative department.
- **Internally:** the Creative Adbundance team, as a way to spin up concepts and volume quickly.

## 5. The client experience (what actually happens)

1. **Land on the site.** Branded like creativeadbundance.com. The brief form is right in the header — no scrolling to find it.
2. **Fill 5 quick things:** product name, an optional "how do you say it" pronunciation, website, target audience, and a **concept** (the style of ad). Upload one product photo.
3. **Hit "Generate my ads."** A friendly progress screen shows the stages ("Reading your website…", "Writing the script…", "Filming…").
4. **Get the result:** the finished vertical video plays in a phone frame with a **Download** button, next to a **storyboard card** that shows the ad's format, angle, and scene beats — so it reads as *a system that thought about it*, not a slot machine.

## 6. The concepts (ad formats offered)

The concept dropdown is grouped by style:

**With a creator (talking head)** — UGC talking-head review · Street interview · Podcast clip · Testimonial · Before & after
**Product only (no people)** — 15-second B-roll (voiceover) · Product reveal · Unboxing · Feature walkthrough demo
Plus **"Surprise me (top performer)"**, which lets the system pick the best-fitting format for the product and audience.

Behind these sit a **15-format library** (Confessional Talking Head, Two Personas, Stitch/Response, Street Interview, 1- & 2-Person Podcast, Reveal Haul, Day-in-Life POV, Flatlay, Fake iMessage, Pixar-3D, Claymation, and more), organized into three **style buckets**: A = creator on camera, B = 100% b-roll no faces, C = animated.

## 7. How it works under the hood

The site posts the brief to an automation pipeline (built in **n8n**, running on a Hostinger server). The pipeline runs these stages in order:

1. **Register + host the product photo** so the video model can reference it.
2. **Content Analyzer** — an AI vision pass produces a forensic, exhaustive description of the product (every color, material, label word, proportion). This is the single source of truth for what the product looks like.
3. **The Strategist** — the heart of the system. A single large AI "brain" (transplanted from Creative Adbundance's own best ad-generation prompt) runs three roles silently:
   - **Creative Director** picks the format and writes a 12-beat script,
   - **Timing Auditor** does the arithmetic so every word fits in 15 seconds without getting cut off,
   - **Story Director** assigns the shots and writes the final video prompt.
   It also outputs a clean caption script and the storyboard metadata.
4. **Video generation** — the script + the product photo go to the **Seedance 2** video model (via KIE.ai), which produces one 15-second 9:16 clip with a voiceover, keeping the real product on screen.
5. **Captions (post-production, on our server)** — the finished video is transcribed word-by-word, an AI looks at each scene to decide where captions won't cover the product, and TikTok-style animated captions are burned on in the brand's font, synced to the voice.
6. **Deliver** — the finished, captioned video is hosted and returned to the website for preview and download.

## 8. The quality bar (non-negotiables)

These rules exist because they are the difference between "looks pro" and "looks AI":

- **Exact product, always.** The real product photo drives the video; the analyzer re-describes it so the label and branding hold.
- **Voice finishes clean.** The voiceover ends by ~13.5s, then a 1.5–2s silent "outro hold" (product/creator holds the frame) — no words cut off mid-sentence. Max ~21 spoken words; call-to-action ≤ 4 words.
- **No text baked into the video.** The AI video model garbles rendered text, so *all* captions and end cards are added afterward in post-production, never generated.
- **Captions match the voice exactly.** They only ever show words that were actually spoken, synced to the audio; the call-to-action holds on screen to the last frame.
- **One shoot feel.** A locked visual "vibe" (lighting, grade, lens, movement) is applied to every scene so the ad feels like one cohesive piece.

## 9. Status — what's live today vs. what's next

**Live and working:**
- The website (branded, form-in-header, sample-ad carousel, result screen with download + storyboard card).
- The full generation pipeline: analyzer → strategist → Seedance 2 video → caption burn → deliver.
- **Product fidelity solved** — proven on real products (an ARMRA soda can and the Brick device both rendered faithfully with legible labels).
- Voiceover audio on. TikTok-style synced captions.

**Decided, being rolled in:**
- Video engine locked to **Seedance 2 standard** (not the cheaper "mini" tier, which garbled labels; and not MaxFusion, which we tested and found ignores the product photo). This was the single biggest quality fix.
- Final caption-sync code being pasted into the live pipeline.

**Next / open questions:**
- **Quality resolution:** 720p (~$3.08/ad) as the default vs 1080p (~$7.65/ad) for sharpest fine print — Eric to choose.
- **A quality gate** before any client sees output (Eric's "checks and balances") — an automated reviewer that rejects a bad generation and retries. May connect to the team's existing video-QA tool.
- **Product-mechanic accuracy:** the strategist can't browse the client's website (by design), so for products with a non-obvious mechanic it can guess wrong. Fix under consideration: a small "how it works in one line" field on the form.
- **Creative OS Studio:** a future, separate build — a visual canvas to manage clients, see finished ads, and reuse a winning template across brands. (Has its own spec.)

## 10. Tech & cost reference

| Piece | Tool | Role |
|---|---|---|
| Website | HTML on Vercel | The client-facing app |
| Pipeline | n8n on Hostinger VPS | Orchestrates every stage |
| Analyzer + Strategist + caption placement | Claude (via OpenRouter) | The "thinking" |
| Video generation | Seedance 2 standard (via KIE.ai) | The 15s ad |
| Transcription | Whisper (via Groq) | Word timings for captions |
| Caption burn | ffmpeg on the VPS | TikTok-style captions |
| File/video hosting | MaxFusion S3 | Persistent links |

**Cost per finished ad:** roughly **$3.08** at 720p (the video) plus a few cents for the thinking, transcription, and captions. 1080p is ~$7.65.

## 11. Known limitations (honest)

- AI video models still occasionally soften fine print on a busy label; the big brand mark holds, tiny legal text may not be perfect (1080p helps).
- The strategist works from the product photo + name + audience only; it does not read the live website, so an unusual product mechanic can be described inaccurately.
- ~1 in 15 generations can fail or come back weak on the video provider's side — the reason a quality gate + retry is the next priority.

## 12. Key links

- **Live site:** https://creative-os-blue.vercel.app
- **Pipeline:** n8n on the Hostinger VPS (webhook path `/creativeos`)
- **Deeper docs:** see `Docs/Creative OS/` in this repo (pipeline node setup, caption chain, the storyboard/design-components plan, MaxFusion API notes).

---

*This document reflects the state of Creative OS as of 2026-07-08. Update it whenever the objective, the pipeline, or the status changes — it is the site's source of truth.*
