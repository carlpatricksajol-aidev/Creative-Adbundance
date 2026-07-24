# Arcads Flow Library - How It Works (and What to Steal)

*A methodology overview and reverse-engineering of Arcads.ai's AI-actor ad engine and its no-code Flow / Workflow Library, written for the Creative OS team.*

> **Visuals:** every workflow spec has a **flow diagram** (node map showing what goes where) embedded near the top, with the PNGs in [`flow-diagrams/`](flow-diagrams). Arcads' own card preview clips are in [`card-thumbnails/`](card-thumbnails). Note: Arcads' actual node-canvas is client-rendered behind their login and can't be captured; these diagrams are drawn from the reconstructed pipelines in each spec.

## 1. What Arcads is, and who it's for

Arcads (app.arcads.ai) is an AI ad-creative platform that turns a script plus a product into finished UGC-style video ads, no camera, cast, or shoot required. Its buyers are performance marketers, DTC/ecommerce brands, and agencies who live and die by creative volume: they need dozens of testable ad variations per week, not one polished hero spot. The pitch is speed and cost, generating 20+ concepts in the time it used to take to brief and shoot three, at roughly $15-$50 per generated video with same-to-48-hour turnaround, on a plan around $110/month. The product is optimized for the Meta/TikTok testing loop: spin up many angles, ship them as paused test campaigns, kill losers, scale winners.

## 2. The AI-actors concept (their moat)

The core asset is a library of 1,000-1,500+ "AI actors", realistic AI humans cloned from real, consenting performers, that can be scripted to say any line with accurate lip-sync, natural gestures, and micro-expressions. The moat is not the LLM or the video model (anyone can license those); it's the *actor library plus the realism tuning*. Arcads deliberately trains for "unpolished, human-made" footage: trembling hands, avoiding direct eye contact, casually-discovered framing, so the output reads as authentic UGC rather than obvious AI. That authenticity is what converts. Because the actors are a reusable, rights-cleared, consistent-identity library, the same face and voice can be re-scripted, re-voiced, and re-localized infinitely, which is exactly what makes batch and localization workflows possible.

## 3. How the node-based Flow builder works (conceptually)

The Workflow (Flow) Library at app.arcads.ai/flow/library is a no-code, node-based builder, each node is one step in a content-production pipeline, and you chain them. Conceptually the graph flows left to right:

- **Input nodes** - product URL, product image, product name, a creator/actor reference, a source video, target languages, and a script or brief.
- **LLM script/brief nodes** - write hooks, scripts, and structured creative briefs from the product inputs (scene, hook moment, CTA, micro-details).
- **Image-generation nodes** - GPT-image / Nano Banana produce statics, keyframes, storyboards, character sheets, title cards.
- **Video-generation nodes** - the actor + lip-sync engine (and Seedance 2.0 / other models) turn script + actor into performance clips or product b-roll.
- **Edit / stitch / caption nodes** - assemble scenes, add auto-captions, music, transitions, and re-frame to platform aspect ratios.
- **Batch output nodes** - fan the whole graph out across many actors, hooks, and markets in a single run.

You open a pre-built template, swap in your assets, and hit run.

## 4. The recurring patterns across their library

- **Batch variation** - one script attached to N actors/hooks/CTAs to mass-produce testable variants (the "1,000 ads" playbook). This is their default motion.
- **Winning-ad remix** - take one existing/winning video and auto-recreate it with different actors, same script and timing, new faces and voices (e.g. one source replicated across 4 characters).
- **Product-swap** - hold the creative structure constant, swap the product image/name/URL to reskin a proven format for a new SKU.
- **Localization / actor-swap** - re-voice the same actor and script across 35+ languages and multiple markets without re-shooting.
- **Hook-first** - generate many 3-second scroll-stopping openers and multiplex them onto the same body, since the hook is the variable that moves CTR.
- **Static-ad grids / repurposing** - a library of ~37 static Meta ad templates (fake iMessage, Apple Notes, Google search, Slack threads, editorial hero), plus turning talking-head videos into script-aligned b-roll.

## 5. Apparent model stack

- **LLMs** for hooks, scripts, and structured briefs.
- **GPT-image ("GPT2" in-UI) / Nano Banana** for statics, storyboards, and keyframes.
- **Seedance 2.0** as the flagship video model (with Sora 2, Veo 3.1, Kling for b-roll in the broader API).
- **Proprietary AI-actor + lip-sync + voice engine** - the differentiator.
- **Auto-captioning** and **translation/TTS localization** across 35+ languages.

## 6. Highest-leverage patterns Creative OS should adopt

1. **Reusable rights-cleared actor/character library** - a consistent, re-scriptable cast is the moat; invest here before chasing new models.
2. **Brief-node as the spine** - a structured LLM brief (scene, 3-sec hook, micro-details, CTA) that every downstream node reads makes batches coherent instead of random.
3. **Batch fan-out by default** - one input graph, many outputs across actor x hook x market; design the pipeline to explode variants, not produce one.
4. **Winning-ad remix loop** - ingest a proven ad, extract its structure, re-run it with new actors/products. Turn winners into templates.
5. **Localization as a free multiplier** - re-voice + auto-caption the same asset into every market at near-zero marginal cost.
6. **Template library over blank canvas** - ship named, swap-and-run templates (both video formats and static grids) so operators never start from zero.

---

*Note: exact internal step prompts are behind login and not publicly retrievable, so any per-workflow prompt or step spec derived from this document is a faithful reconstruction of Arcads' method, not their actual source.*


---

## The 18 workflows (per-workflow specs)


### UGC video

- [Replace Product in Winning Ad](replace-product-in-winning-ad.md)
- [Short Form Ad Generator](short-form-ad-generator.md)

### UGC video (with translation/localization)

- [UGC Product Showcase with Localization](ugc-product-showcase-with-localization.md)

### AI clone/actor

- [Create Your AI Clone](create-your-ai-clone.md)
- [Recreate One Video with Multiple Actors](recreate-one-video-with-multiple-actors.md)
- [Your Character in 20 Viral Scenes](your-character-in-20-viral-scenes.md)

### translation/localization

- [UGC Super Translator](ugc-super-translator.md)

### static-image ads

- [20 High-Converting 1x1 Static Ads](20-high-converting-1x1-static-ads.md)
- [Comic Strip Static Ads](comic-strip-static-ads.md)
- [Static Ad Offers (1:1 & 9:16)](static-ad-offers-1x1-9x16.md)
- [Static Ad Templates (1:1 & 9:16)](static-ad-templates-1x1-9x16.md)
- [UGC TikTok Slideshow](ugc-tiktok-slideshow.md)

### hook tool

- [Hook Generator for your App/Website](hook-generator-app-website.md)
- [Text Hook Overlay](text-hook-overlay.md)

### long-form

- [Long-Form with Automated B-Roll](long-form-with-automated-broll.md)
- [TV Style Ads](tv-style-ads.md)

### novelty-style

- [Animated Cartoon Videos Ads](animated-cartoon-videos-ads.md)

### novelty-style (static ad + optional animated video)

- [GTA 6 Style Ad](gta-6-style-ad.md)
