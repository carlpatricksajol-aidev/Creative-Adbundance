# PLAN — Storyboard layer, Design Components, VO outro fix, Seedance 2.0

Prepared July 4, 2026. Based on a full teardown of the Video Editor's "ugc 15 seconds" flow via the MaxFusion API: the 43,816-char strategist system prompt (Assistant #67, the newest of three evolving versions), the strategist's generated ad briefs, and frame + audio analysis of the 4 newest output videos. PLAN ONLY — nothing executed yet.

---

## 1. What the Video Editor's flow actually does (the secret sauce)

The big strategist prompt is a **three-agent pipeline in one prompt**, all silent to the user:
1. **Creative Director** — picks the Format, writes a 12-beat script
2. **Timing Auditor** — arithmetic gate: `words / words-per-second + pause budget` must fit 15.0s; loops with the Creative Director until it passes; the audit math is printed in the output
3. **Story Director** — assigns per-scene Feeling / Energy / Shot type and writes the final Seedance prompt

### The Design Components (the taxonomy Carl asked about)
| Component | Values / rules |
|---|---|
| **Format** | Library of 15 named formats (Confessional Talking Head, Two Personas/Split Self, Stitch/Response, Regret Listicle, Street Interview, ...) each with a "narrative direction"; never repeated within a batch |
| **Style Bucket** | A = talking head + b-roll · B = 100% b-roll (no face, hands OK, VO-only) · A→B crossover · C = animated (Pixar-3D or claymation); each bucket has a verbatim STYLE LOCK paragraph |
| **Awareness level** | Problem / Solution / Product Aware — batch must mix |
| **Vibe Lock String** | 6 levers (light, color/grade, film stock or iPhone, lens, movement, composition) compiled once into one paragraph, repeated verbatim in every ad = batch visual consistency without reference images |
| **Locked Brand Spec** | 9 fields mined from the website: product name verbatim, form/finish, core mechanic, top-3 pain points, trust stats (ONLY from site, never invent), offer, CTA button text, compliance flags, brand voice |
| **12-beat skeleton** | Hook → Curiosity → Problem → Product intro (product may NOT appear before beat 4) → Usage → Benefit → Proof → Secondary → Differentiation → Outcome → Social proof → CTA. Hook + CTA protected in trims |
| **Emotional arc** | Energy down (beats 1-3) → pivot (4-5) → up (6-10) → land (11-12); per-scene Feeling + Energy labels |
| **Shot types** | Bucket-specific pools; never the same shot twice in a row; emotion→shot heuristics |
| **Scenes** | ONE 15s Seedance 2.0 generation, 9:16, 720p, 4-6 scenes with absolute time windows (0-3s / 3-6s / ...) |

**The "storyboard" Carl described = Format (narrative) × 12-beat skeleton × scene time windows.** It already exists in this prompt; our n8n assistant just doesn't have it.

### Key surprises
- **The flow uses NO reference images** — every image field in its video generators is null. Product fidelity comes entirely from textual locking (Locked Brand Spec + re-describing the product in every scene + "the featured product is the only product on screen"). Our KIE pipeline passes `reference_image_urls` — combining BOTH (image anchor + textual lock) should beat the flow's own fidelity.
- **"No text overlays, no end-card graphics"** is deliberate: Seedance garbles rendered text (verified: caption typo "spattıula", gibberish billboard tagline). Captions/disclaimers are meant for post-production overlay, not generation.

## 2. VO / outro findings (audio-measured on the 4 newest videos)

| Video | VO ends | Verdict |
|---|---|---|
| 42daf868 (talking head) | ~15.0s — **cut off mid-word, mouth open on last frame** + 1.3s dead air at 12s | the exact problem Carl flagged |
| f333cd63 (street interview) | 14.66s (0.4s tail) but last 3s = frozen static frame, zero CTA | stalled outro |
| 89ed5cd1 (billboard) | 14.6s + offer overlay + natural smile close | **the good example** |
| aec42948 (confessional) | 14.7s (0.34s tail), CTA card on screen only 1.2s | too tight |

**Conclusion:** even the Timing Auditor's current budget (23 words / speech ends ~14.5s) is too tight. New hard rule for our pipeline:
> **VO must END by second 13.0-13.5. The final 1.5-2.0 seconds are a silent outro hold: creator (or product) holds frame, smiling / product hero, no dialogue, no new action.** Word budget accordingly: ~2.0 wps × 11.0s speech − pauses ≈ **max 21 words total**, CTA line ≤ 4 words finishing by 13.5s.

## 3. The plan (in order — nothing executed yet)

### Phase A — Transplant the strategist brain into n8n (biggest quality jump, zero new infra)
1. Replace our Assistant system prompt with the **43k strategist prompt verbatim** (already extracted clean via API to `strategist_43k.txt`), plus a thin adaptation block:
   - `NUMBER_OF_ADS = 1`; Format forced by the website's concept selection (maps to the format library); DURATION 15s; 9:16; 720p
   - Product reference: keep `@Image1`/`reference_image_urls` note (we have image refs even though the flow doesn't)
   - **Outro rule** from §2 (VO ends ≤13.5s, silent 1.5-2s hold, ≤21 words)
   - **No on-screen text of any kind** in the generation (no captions, no overlays) — post adds them later
   - Final output as JSON `[{"scene":1,"duration":15,"prompt":"<full continuous prompt>"}]` so the existing Parse node works
2. Concept dropdown → Format mapping (website values → library formats):
   - Surprise me → strategist picks format + states it
   - UGC talking head → A1 Confessional Talking Head · Street interview → Street Interview format · 15s B-roll → Bucket B (100% b-roll) · Unboxing/Product reveal/Testimonial/Before-After/Feature walkthrough → their library equivalents
3. Analyzer unchanged (its forensic output feeds the Locked Brand Spec step).

### Phase B — Model upgrade (one field change)
- KIE model: `bytedance/seedance-2-mini` → **`bytedance/seedance-2`** (standard), 720p, 9:16 — the exact config the Video Editor's flow uses (seedance-2.0 / 15s / 720p / 9_16). Cost: $1.54 → **$3.08 per 15s ad** (1080p re-render of winners: $7.65).

### Phase C — Website adjustments
1. Concept dropdown regrouped by Style Bucket: "With a creator (talking head)" / "Product only (b-roll)" / "Animated" with the format names the team actually uses.
2. Result screen: alongside the video, show the ad's **storyboard card** (Format, Awareness, Angle, scene beats) — pulled from the strategist's metadata header. Builds the "this is a system, not a slot machine" impression Eric wants.
3. Optional later: a "Vibe" selector (the 6-lever Vibe Lock presets: iPhone-real / golden hour / cinematic film).

### Phase D — Post-production captions (designed 2026-07-05, ready to build)

**Decision: captions are burned in AFTER generation, on the n8n VPS, with AI scoped to two judgment calls only (per-scene placement + emphasis words). Everything else is deterministic.** Letting a model freestyle the whole caption look would give inconsistent output; the TikTok caption "trend" is actually a fixed recipe, so we hard-code the recipe and let AI decide only what genuinely varies per video.

**Pipeline (n8n nodes after IF success, before Respond):**
1. **Download video** to the VPS (Execute Command / HTTP).
2. **Transcribe with word timestamps** - Groq `whisper-large-v3-turbo` (or OpenAI whisper-1 verbose_json). Cost ~$0.001/ad, ~2s.
3. **Align to the CAPTION SCRIPT** (Code node): the strategist now outputs a CAPTIONS block with the REAL brand spelling while DIALOGUE uses phonetic spelling. Fuzzy-align whisper's heard words ("gear") to script tokens ("GIR") so on-screen text shows the correct brand while the VO pronounces it right. Script text is ground truth; whisper only contributes timing.
4. **AI watches the video (the scoped part)** - we already know the scene time windows from the storyboard metadata. Extract ONE frame per scene (ffmpeg), send 4-6 frames to Claude vision with: "for each frame: is the lower-center third visually busy (face, product, hands)? pick caption zone upper/center/lower" + "pick 1-2 emphasis words per caption line (product name, numbers, power words)". One cheap vision call per ad (~$0.01), returns JSON.
5. **Build ASS subtitles** (Code node): karaoke chunks of 2-4 words, Montserrat ExtraBold ~66px @720x1280, ALL CAPS, white fill + 4px black outline + soft shadow, active word flips to brand purple #6B48FF with a 1.06 scale pop, emphasis words stay teal #00E5CC. Position per scene from step 4 (default: centered at 70% height; TikTok safe zones: bottom 20% and right 15% stay clear). No captions during the final outro hold (after VO_ENDS_AT).
6. **Burn** - `ffmpeg -i in.mp4 -vf "ass=subs.ass" -c:a copy out.mp4` (~5-10s for 15s/720p on the VPS).
7. **Host the result** - reuse the MaxFusion S3 upload pattern (register file + presigned POST), respond with that URL instead of the KIE URL.

**Needs before build:** ffmpeg on the Hostinger VPS (`apt install ffmpeg`), a Groq or OpenAI key for whisper, Montserrat ExtraBold .ttf on the VPS. The strategist + parser already emit/carry the caption script, so no re-architecting later.

**Also decided (2026-07-05): pronunciation capture.** Website form gets an optional reveal field under Product name ("How do you say \"NAME\"? - your ad is voiced, so we want to say it perfectly"), payload field `product_pronunciation`. Strategist rule: phonetic spelling in DIALOGUE lines only; real spelling everywhere else (scene descriptions, captions). If blank, the strategist decides the natural pronunciation itself.

## 4. Open decisions for Carl/team
1. Confirm standard Seedance 2.0 at 720p ($3.08/ad) as the default — or keep mini for the website and standard for internal?
2. Storyboard card on the result page: v1 (text summary) or wait for Studio?
3. The 43k prompt produces markdown briefs ~5-14k chars; token cost per ad rises (~2-3× assistant tokens ≈ +$0.05-0.10/ad on OpenRouter). Acceptable? (Recommend: yes, quality >> pennies.)
4. Which 8-10 formats from the 15-format library go in the public dropdown?

## 5. Files staged for execution (when approved)
- `strategist_43k.txt` (clean, from API) in scratchpad — will be committed to `Docs/Creative OS/n8n bodies/` on go
- Existing KIE workflow: changes = Assistant body swap + model field + nothing else
- Analysis evidence: 4 videos + audio measurements in scratchpad
