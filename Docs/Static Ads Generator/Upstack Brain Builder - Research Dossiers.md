# Upstack Data — Brain Builder Research Dossiers (2026-07-16)

Source A: Viktor's Reddit research brief (r/FacebookAds, r/shopify, r/PPC — verbatim buyer language).
Source B: vision-read of all 8 competitor-winners ads (WeTracked ×2, Northbeam ×2, Polar ×4) + live upstackdata.com/pricing.
Destination: `brand_profile` columns `voice_of_customer`, `open_lane`, `hook_bank` (STEP 0 SQL in the Patch Pack adds them).

⚠️ CLAIM CORRECTION: the old brief says "$99/mo". The LIVE site sells Launch $149 / Starter $299 / Growth $599, claims "$450+/mo saved vs the Elevar + Triple Whale stack", and offers a 60-day ROI guarantee. Ads must use the live numbers — update `key_offer` in brand_profile accordingly.

---

## voice_of_customer (column value)

BUYER'S OWN WORDS (echo these phrasings; write like these people talk):
"Please help, I am desperate with Facebook Ads not showing sales" / "Currently only 60% of my purchases are tracked" / "Missing 50% of purchase events while using Shopify integration" / "My ROAS dropped from 1.63 to 0.78 to 0 in 3 days" / "Not even 30% of my sales are tracked" / "Should I kill my business? Wasting money on Facebook marketing" / "I've spent over $300 in FB ads and still no conversions" / "Meta Reporting 300% More Purchases Than GA" / "I tried Black Crow ($800), Blotout ($1,200), Triple Whale ($500)" / "browser pixel and CAPI are generating completely different event_ids - 0/73 match rate" / "If you're spending $1k+/day you might be losing $300+ daily".

HOW THEY TALK: "purchases not tracked", "numbers don't match", "pixel not firing", "flying blind", "death spiral", "burned spend". They do NOT say "signal engineering" or "EMQ" unless they are the technical persona. Jargon (EMQ, CAPI, fbp/fbc) belongs in proof lines only, never headlines.

EMOTIONAL LADDER (aim ads at a rung): panic (ROAS crashed overnight) -> betrayal (set Shopify data sharing to Maximum, still broken) -> resentment (paying $250-1,200/mo for tools that still miss events) -> overwhelm (GTM + Stape + developer talk) -> relief-seeking ("just works", installs like an app, no developer).

PERSONAS: Frustrated Founder ($500-5k/mo spend, no code, blames creative); Scaling Brand ($5-50k/mo, tried Elevar/Triple Whale, can quantify the leak); Agency Media Buyer (multi-client, needs numbers to match to look competent); Technical Optimizer (EMQ-literate, wants receipts).

TRUTH WHITELIST (numbers ads may use): misses 30-50% of purchases; only 60% tracked; CPA $68 -> $24; EMQ 5.8 -> 9.1 in 48h; server events carry ~3x weight; 0/73 event-id match (native app bug); ~$300+/day loss at $1k+/day spend; live pricing from $149/mo; $450+/mo saved vs Elevar+Triple Whale; 60-day ROI guarantee; 5-minute install, no GTM/Stape/developer.

## open_lane (column value)

WHAT COMPETITOR ADS SATURATE (do NOT lead with these): generic "more revenue/ROAS" outcome claims (5 of 8 ads); social proof AS the message (logo walls, review stars, case studies, big cumulative numbers - 6 of 8); "all channels in one place" centralization. Their aesthetic: dark-gradient SaaS + mock dashboard screenshots + demo/report CTAs.

OPEN LANES (unclaimed message territory - lead ads here):
1. PRICE / ANTI-BLOAT: no competitor ad ever mentions a price. "The Elevar + Triple Whale stack runs ~$999/mo. The fix is $149." Smart-buyer relief.
2. INSTALL SPEED / NO-DEV: zero ads touch setup. "Server-side tracking in one 5-minute Shopify install. No GTM. No Stape. No developer." Relief from dreading a technical project (Elevar's known sore point).
3. EMQ RECEIPTS: nobody shows Meta's own grading system. Real Events-Manager-style before/after (EMQ 5.8 -> 9.1) = provable artifact vs everyone's vibes-y stats. Fear of being scored and failing -> competence.
4. MISSING-PURCHASES LOSS AUDIT: all 8 competitor ads are gain-framed; loss-aversion on the buyer's OWN store is untouched. "Meta never saw 30-50% of your purchases last month. Count yours." Strongest psychology in the set.
5. FEED-THE-ALGORITHM: every competitor sells a dashboard for humans; none talks about what the MACHINE sees. "You're not losing auctions to better ads - you're losing them with worse data."
6. ANTI-DASHBOARD COUNTER-POSITION: "You don't need another dashboard. You need Meta to get the right data." Directly against Northbeam/Polar's dashboard imagery. Garnish: 60-day ROI guarantee (no competitor shows any guarantee).

OPEN FORMATS (carriers no competitor uses): real Events-Manager before/after screenshots; any price comparison table; memes/humor; founder-face/UGC stills; text-only "ugly ad"; educational browser-vs-server diagram; diagnostic/quiz CTA ("check your EMQ"); guarantee badge; "install the app" CTA (everyone else says book-a-demo).

## hook_bank (column value — jsonb)

[
  {"hook": "Meta sees 180. You shipped 300.", "angle": "platform_gap", "lane": "loss_audit"},
  {"hook": "Meta never saw a third of your sales last month.", "angle": "loss_audit", "lane": "loss_audit"},
  {"hook": "Your ads aren't broken. Your tracking is.", "angle": "reframe", "lane": "feed_the_algorithm"},
  {"hook": "You set data sharing to Maximum. It still doesn't work.", "angle": "betrayal", "lane": "shopify_betrayal"},
  {"hook": "You're scaling a leak, not a campaign.", "angle": "loss", "lane": "loss_audit"},
  {"hook": "CPA $68 to $24. Same ads. Same budget.", "angle": "result", "lane": "emq_receipts"},
  {"hook": "Your Event Match Quality is failing a test you can't see.", "angle": "mechanism", "lane": "emq_receipts"},
  {"hook": "You're not losing auctions to better ads. You're losing them with worse data.", "angle": "algorithm", "lane": "feed_the_algorithm"},
  {"hook": "You don't need another dashboard.", "angle": "counter_position", "lane": "anti_dashboard"},
  {"hook": "That $999/mo tracking stack? The fix is $149.", "angle": "price", "lane": "anti_bloat"},
  {"hook": "No GTM. No Stape. No developer. One Shopify install.", "angle": "simplicity", "lane": "no_dev"},
  {"hook": "iOS didn't kill your ads. Pixel-only tracking did.", "angle": "myth_bust", "lane": "feed_the_algorithm"},
  {"hook": "'Should I kill my business?' Don't. Fix your tracking.", "angle": "empathy", "lane": "voice_of_customer"},
  {"hook": "The 120 orders Meta never saw.", "angle": "story", "lane": "loss_audit"},
  {"hook": "If it doesn't pay for itself in 60 days, you don't pay.", "angle": "guarantee", "lane": "anti_dashboard"}
]
