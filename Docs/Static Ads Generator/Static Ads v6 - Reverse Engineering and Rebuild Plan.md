# Static Ads v6 — Reverse Engineering the Claude x Higgsfield Quality + Rebuild Plan

Date: 2026-07-06. Sources: live Higgsfield workspace archaeology (actual generation history + verbatim prompts via MCP), adversarially-verified dissection of the live n8n workflow (v5), KIE.ai model/pricing research.

---

## 1. The headline finding: it was never the platform

The good ads in the Higgsfield workspace were almost all generated with **`nano_banana_2` (Google Gemini flash image) at 2K** — not an exclusive Higgsfield model. KIE sells the same family:

| Model on KIE (`jobs/createTask`) | Price/image | Input images | Text rendering |
|---|---|---|---|
| `nano-banana-pro` (Gemini 3 Pro Image) | $0.09 (2K), $0.12 (4K) | up to 8 | Best in class (~94-96% text accuracy) |
| `seedream/4.5-edit` / `4.5-text-to-image` | $0.0325 | up to 14 | Near-par, great small text |
| `nano-banana-2` (the model the good ads used) | $0.04 (1K) / $0.06 (2K) | up to 14 | Strong |
| `gpt-image-2-*` (current pipeline model) | $0.03-0.05 | up to 16 | Good, weaker on dense type |

So the cost story inverts: **the Higgsfield-quality renderer is available on KIE for $0.04-0.09/image.** The quality gap is not model access. It is (a) how the prompt is written, (b) whether the template/reference actually reaches the render, and (c) whether anything looks at the output before it ships.

Also confirmed from KIE docs: **result URLs (tempfile.aiquickdraw.com) officially expire after ~24h** — all outputs must be downloaded and rehosted immediately.

## 2. Anatomy of the winning prompts (reverse-engineered from real jobs)

Pulled verbatim from the workspace (Spravato sticky-note UGC, Symple Pac-Man, Symple mailbox check, Innerwell permission slip/billboard/Reddit, Miracle Made batches). The good prompts are ~450-1300 chars and read like an art director's layout spec:

1. **Artifact declaration first**: "Facebook static ad, 1:1 square", "Photorealistic UGC-style photograph" — the model commits to an ad-shaped composition from token one.
2. **ONE committed visual concept per prompt** (Pac-Man maze = debt eats paycheck; check in mailbox; sticky note on device). Constraints hang off the idea; there is always an idea.
3. **Named spatial zones**: TOP SECTION / CENTER / LOWER / BOTTOM BAR, each zone owning its content.
4. **Exact copy quoted verbatim per zone**, casing and line breaks included.
5. **Typography + color per element**, hex where it matters, mixed-weight instructions.
6. **Text lives on a physical carrier** — THE biggest differentiator: sticky note with paper curl + real shadow, handwritten pen with pressure variation, LED marquee, check mailer, billboard, app UI screenshot. That's why the text looks native, not pasted on.
7. **Camera/lighting/authenticity block**: "shot on iPhone, no studio lighting", "golden hour".
8. **Protective constraints + negative list at the END** (not scattered): "must remain fully visible and legible", "Negative prompt: cartoon, people, hands...". Also "leave bottom right empty for logo placement".
9. **Reference-image contract** when inputs attached: "the exact red metallic golf cart from the reference image — same cherry red body, same chrome wheels."
10. **Named-format anchoring**: "AARP editorial style", "iOS Notes app screenshot ad", "mirrors the Tapouts Reddit structure".
11. **Generate-big-once, edit-small-many**: iteration = previous output as input image + a tiny imperative ("make Tapouts uppercase", "change url to oasismhcenters.com"). Never regenerate the mega-prompt.
12. The model tolerates meta-noise; structure + quoted copy dominate.

A rule-concatenation prompt supplies fragments of #5 and #8 and none of the rest.

## 3. Verified defects in the live n8n workflow (v5)

Adversarial verification results in [brackets].

**Critical, CONFIRMED:**
- **The template never reaches the render.** `layout_brief` is computed by Describe Template Layout then never passed to Concept Director or the prompt; the template image is never in `input_urls` for non-winners. Double break: layout_brief is null anyway because Airtable URLs are sent to a Claude vision model (robots-blocked). The CreativeOS template library contributes zero pixels/structure. [CONFIRMED]
- **No QA gate, no retry, n=1.** If3 checks only KIE's technical state. Every stochastic draw ships (Tapouts photoreal-child violation shipped); failed jobs silently vanish, under-delivering count. [CONFIRMED]
- **Outputs stored as 24h temp URLs.** 97.7% of the 1,036-ad library already 404. Kills the future winners/learning flywheel. [CONFIRMED; note: winner pool comes from Airtable winning_ads, so this harms future curation, not the current branch]
- **Prompt is a ~20-block rule concatenation with raw Brand Brain strategy dumps.** [PARTIALLY REFUTED: it does contain a coherent per-ad scene description (visual_direction) and sampled outputs were decent; the dumps are dilution and the true losses are constraint drops (the DON'T violation). Cleanup target, not the primary driver.]

**High, CONFIRMED:**
- **Mechanism/angle by modulo rotation.** mechanism = pool[i%12], angle = angles[i%6]; 6 divides 12 so each mechanism is permanently locked to one angle — only 12 of 72 combos ever reachable; every count=1 run yields the identical two mechanisms (EDUCATIONAL_INFOGRAPHIC/pain_first + NAMED_PERSONA_STORY/benefit_first) for every brand. No fit to brand/assets. [CONFIRMED]
- **Logo fallback invites invention**: "render the {clientName} wordmark cleanly" → Nurx serif fake logo. text_to_image renders can never carry the real logo file. [CONFIRMED]
- **Batch concepting**: 8 concepts in one 3500-token temp-0.9 call (~430 tokens each incl. JSON) — thin visual_direction, homogenized concepts, truncation risk.
- **Contradictory rules for photographic mechanisms**: UGC "authentic imperfect phone photo" + "use ONLY this hex palette" + CTA-button typography block = uncanny half-UGC hybrids.
- **Verbatim copy overload**: up to 8 positioned strings; gpt-image-class garbles beyond ~4.
- **Dos/Don'ts as prompt-text negations only** — weakly honored, no post-render check.

**Medium:** winner branch locked to 'inspired' (form never sends reference_mode) so close-reproduction — the mode Xandria valued most — is unreachable; silent team_top5→top_performers fallthrough (exactly what happened on the pinned Tapouts run: no winning_ads attachments); brand="Unknown" runs proceed; brand_fonts fetched but never injected; failed/slow renders vanish; no creative metadata persisted (no learning loop); 2x overgeneration with no selection step; template pool random within aspect ratio.

## 4. The v6 architecture — mechanize the agent loop on KIE

```
Webhook
  → Guards (brand resolved? mode satisfiable? else webhook error)
  → Search Brand Brain (+colors/fonts already in brain)
  → Rehost ALL image assets FIRST (templates, winners, logo → KIE file host w/ .png names)
  → Describe Template Layout (on REHOSTED urls — actually works now) 
  → Mechanism Selector (LLM PICKS N best-fit mechanism×angle pairs, asset-gated, diverse)
  → Concept Director (ONE call PER concept, layout_brief injected, 1000+ tokens headroom)
  → Prompt Composer (ONE call per ad → art-director prompt per the 12-point anatomy;
      scene+zones+quoted copy+carrier+camera+negatives; brand fonts as descriptive language;
      NO raw brain dumps; template as input_urls[0] for i2i)
  → Render: nano-banana-pro 2K png (fallback seedream/4.5-edit; drafts gpt-image-2)
  → Poll (loop w/ timeout; fail → 1 retry → failures row)
  → Vision QA gate (EVERY image): verbatim copy, logo, palette, each DON'T, garbled text
      → fail: micro-edit retry (failed image as input + tiny corrective instruction, 
         nano-banana-2 edit — the mechanized "make Tapouts uppercase" loop), max 2
  → Persist: download → Supabase Storage `static-ads` bucket → permanent public URL
  → INSERT row w/ full metadata (prompt, mechanism, angle, concept, template_id, model, qa_score, qa_flags)
```

Key policy changes:
- **Logo**: never ask the model to draw one. Logo exists → always image-to-image with logo in inputs. Missing → reserve clean space (+ optional exact post-composite).
- **Winner branch**: default team_top5/client_winners to close_reproduction; expose reference_mode on the form.
- **Photographic vs designed mechanisms** get different rule sets (relaxed palette/typography for UGC).
- **Copy budget**: headline + subline + CTA + max 2 support strings on-image; text-dense formats get a physical carrier (table on a notepad, infographic as editorial print) or post-composited text.
- **Dos/Don'ts**: rewritten as positive scene constraints AND checked by the QA gate per-item.

## 5. Cost picture (per shipped ad)

- Render nano-banana-pro 2K: $0.09 (+~30% QA retries ≈ $0.12)
- LLM calls (selector + concept + composer + QA vision): ~$0.03-0.05
- **≈ $0.15-0.17 per shipped, QA-passed 2K ad** — vs Higgsfield credit burn many times that, using the same model family the good ads already used. Seedream fallback drops render to $0.0325.

## 6. Already staged

- Persistence fix (Download Ad Image → Upload to Supabase Storage HTTP node pair + new INSERT body): scratchpad `persistence_fix_nodes.json` (session) — must ship first regardless of v6.
- `static-ads` Supabase bucket created (2026-06-24); 24 surviving ads rescued to `rescued/`.
- Raw archaeology data (all Higgsfield prompts + job JSON) persisted under the session tool-results dir.
