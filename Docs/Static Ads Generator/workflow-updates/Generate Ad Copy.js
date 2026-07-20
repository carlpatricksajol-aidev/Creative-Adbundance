const item = $input.first().json;
const brain = $('Search Brand Brain').first().json;
const body = $('Webhook1').first().json.body || {};

// Map variant_index to angle
const angleMap = {
  1: 'Lead with the core frustration and pain point the audience feels right now. Pain-first hook.',
  2: 'Lead with the outcome, relief, and key benefit they will get. Benefit-first hook.',
  3: 'Lead with social proof, credibility, and trust signals. Authority-first hook.'
};
const angleDirection = angleMap[item.variant_index] || angleMap[1];

// Eric Mann rule: a proven ad + promo objective = KEEP the ad, overlay the offer (verbatim), no new angle.
const briefText = String(body.brief || '').trim();
const isPromoObjective = /(\d+\s*%|\bpercent\b|\boff\b|\bsale\b|\bdiscount\b|\bbogo\b|\bbuy\s*\d|\bfree\b|\bdeal\b|\bpromo\b|\bcoupon\b|\bcode\b|\bends\b|\bexpires\b)/i.test(briefText);
const keepAndOverlay = item.is_reference_based === true && isPromoObjective;
// Promo variants (single-variable tests on a winning ad) keep the winning message -
// no new copy is written for them (Eric Mann rule: never a new angle on a variant).
const isPromoVariant = item.is_promo_variant === true;

const copyPrompt = `You are a direct response copywriter for performance ads.

BRAND: ${body.client_name || ''}
BRIEF: ${body.brief || ''}
BRAND TONE: ${brain.brand_tone || ''}
KEY OFFER: ${brain.key_offer || ''}
TARGET AUDIENCE: ${brain.target_personas || ''}
ANGLE: ${angleDirection}

Write ad copy with EXACTLY this structure:
- HEADLINE: 4-7 words. Title Case, not all-caps (the brand's own style controls final casing). One strong hook. No em dashes.
- SUBLINE: 8-14 words. Sentence case. Supports the headline directly.
- CTA: 3-5 words. Action-driven button text.

Rules: Maximum 3 text elements. No bullet lists. No feature lists. Headline must be dominant. Use ONLY facts, numbers, dates, prices, and offer details that appear in the BRIEF or KEY OFFER above. NEVER invent or change a date, year, price, percentage, or statistic. If the brief contains a promotional offer, include the offer verbatim (exact numbers and dates) in one element. NEVER attach a year or date to an award, badge, or press mention unless that exact pairing appears in the BRIEF (e.g. do not restamp a "Wirecutter 2024" pick with the sale year).

Return ONLY valid JSON: {"headline": "...", "subline": "...", "cta": "..."}`;

let copy = { headline: briefText, subline: '', cta: '' };
// Skip copy generation for keep-and-overlay AND promo variants: the proven ad's copy
// stays; the brief's offer is the only added text.
if (!keepAndOverlay && !isPromoVariant) {
  try {
    const response = await this.helpers.httpRequest({
      method: 'POST',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer <OPENROUTER_API_KEY>'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4',
        max_tokens: 300,
        messages: [{ role: 'user', content: copyPrompt }]
      })
    });

    const raw = response.choices[0].message.content;
    copy = JSON.parse(raw.replace(/```json\n?/g, '').replace(/```/g, '').trim());
  } catch (e) {
    copy = {
      headline: 'Find Your Solution.',
      subline: 'Trusted options reviewed by independent experts.',
      cta: 'Learn More'
    };
  }
}

let enhancedPrompt;
if (keepAndOverlay) {
  // Eric Mann rule: KEEP the proven ad exactly; add ONLY the promo overlay from the brief (verbatim).
  enhancedPrompt = item.prompt +
    '\n\n== COPY TO RENDER (KEEP the ad, add ONLY this overlay) ==\n' +
    'Do NOT rewrite the ad\'s existing copy, headline, or hook. Keep all original text exactly as it appears in the reference.\n' +
    'ADD one promotional overlay/callout (a banner, badge, ribbon, or bold text block) with this offer, worded EXACTLY as given below. Do NOT invent, reword, or change any date, year, or number:\n' +
    '"' + briefText + '"\n' +
    'Place the callout clearly and legibly without covering the product or the main hook.';
} else if (isPromoVariant) {
  // Single-variable test: the winning ad's message stays; only the scene changed.
  enhancedPrompt = item.prompt +
    '\n\n== COPY TO RENDER (message LOCKED to the winning ad) ==\n' +
    'Reproduce the winning ad\'s headline and subline WORD FOR WORD as they appear in the reference image, in the same fonts, casing, and color. Do NOT write a new headline, angle, message, or claim.\n' +
    '(Exception: if the archetype in the prompt makes the OFFER the headline, render the offer as that archetype instructs instead.)\n' +
    'Show the offer ONCE as a clean sale callout using the EXACT discount and dates from these brief values (do NOT paste the raw sentence and do NOT repeat it twice): "' + briefText + '". Format it cleanly, e.g. LIMITED TIME SITEWIDE SALE / 20% OFF / Ends July 27.\n' +
    'Do not invent or change any number, date, or claim. No new testimonials or quotes. Any award badge (e.g. Wirecutter) is OPTIONAL - do not force it onto every creative.';
} else if (item.is_reference_based) {
  // Cloning a proven layout: fill ITS text slots, keep its copy structure
  enhancedPrompt = item.prompt +
    '\n\n== COPY TO RENDER (fit the reference layout) ==\n' +
    'This ad clones a proven layout. Fill that layout\'s existing text areas with THIS brand\'s message and KEEP its copy structure (same number and kind of text blocks: comparison/toggle lines, quiz options, a testimonial quote, or headline plus CTA).\n' +
    'Lead hook (use as the dominant headline): ' + copy.headline + '\n' +
    'Support idea (only if the layout has room): ' + copy.subline + '\n' +
    'If the layout has a button, label it: ' + copy.cta + '\n' +
    'Keep copy minimal, on-brand, and true to the reference. Do NOT add text blocks the reference does not have.';
} else {
  // Library template: impose the strict one-hook structure
  enhancedPrompt = item.prompt +
    '\n\n== EXACT COPY TO RENDER ==\n' +
    'HEADLINE (render large, bold, dominant): ' + copy.headline + '\n' +
    'SUBLINE (render smaller, below headline): ' + copy.subline + '\n' +
    'CTA BUTTON: ' + copy.cta + '\n\n' +
    'CRITICAL: Render ONLY these 3 text elements. No additional copy. No bullet lists. No feature lists.';
}

return [{
  json: {
    ...item,
    prompt: enhancedPrompt,
    generated_headline: copy.headline,
    generated_subline: copy.subline,
    generated_cta: copy.cta
  }
}];
