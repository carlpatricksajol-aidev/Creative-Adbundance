const templates = $input.all();
const brain = $('Search Brand Brain').first().json;
const webhook = $('Webhook').first().json;

const logoUrl = (brain.logo_urls && brain.logo_urls[0] && brain.logo_urls[0].url) ? String(brain.logo_urls[0].url) : null;
const productImageUrl = webhook.body.product_image_url || null;
const productName = webhook.body.product_name || '';
const clientName = String(webhook.body.client_name || 'this brand');

const productIndex = productImageUrl ? 1 : -1;
const logoIndex = logoUrl ? (productImageUrl ? 2 : 1) : -1;

const brandTypeGuardrail = !productImageUrl
  ? [
      'BRAND TYPE: SERVICE / B2B - no physical product.',
      '- Do NOT place the brand name on random objects (cups, clothing, bags, packaging).',
      '- Brand name appears ONLY in the logo zone, headline, and CTA.',
      '- Visual represents the service outcome - clean, professional environment.'
    ].join('\n')
  : [
      'BRAND TYPE: PRODUCT - feature the provided product from input_urls[' + productIndex + '] as the visual hero.',
      '- Reproduce it photographically: exact shape, label, packaging, colors. Do NOT reimagine or replace it.',
      '- Scale the product to fit naturally inside the template product zone. Do NOT oversize it.',
      '- Brand name only in the designated logo zone.'
    ].join('\n');

const logoRule = logoUrl
  ? 'LOGO: use the exact logo from input_urls[' + logoIndex + ']. Reproduce as-is, do not redraw, recolor, or stretch. One placement only, in the logo zone.'
  : 'LOGO: none provided. Place a clean [ LOGO ] placeholder in the logo zone. Do NOT invent a logo.';

const propRule = [
  'PROP & ELEMENT RULES:',
  '- Brand-appropriate DESIGN ELEMENTS (icons, shapes, accent graphics, motifs) are ENCOURAGED to make the ad rich and stop-scrolling. Specific ones are listed below.',
  '- Do NOT add random real-world props you cannot justify for ' + clientName + '. Test: would the ' + clientName + ' designer place this on purpose? If no, leave it out.',
  '- No food or drink props (coffee mugs, cups, plates) unless they ARE the product.',
  '- No human subjects, faces, hands, or bodies.',
  '- Physical objects must rest on a surface; flat 2D graphic elements may overlay freely.',
  '- No fabricated stats, fake awards, fake review counts, and no text inside badges or pills.'
].join('\n');

const angles = [
  'Lead with the core problem and pain point. Pain-first hook.',
  'Lead with the solution, outcome, and key benefit. Benefit-first hook.',
  'Lead with social proof, credibility, and trust. Trust-first hook.'
];

const result = [];
templates.forEach(function(entry, tplIdx) {
  const tpl = entry.json;
  const inputUrls = [tpl.template_url];
  if (productImageUrl) inputUrls.push(productImageUrl);
  if (logoUrl) inputUrls.push(logoUrl);

  angles.forEach(function(angle, vIdx) {
    const prompt = [
      'Create a polished, performance-ready static ad for ' + clientName + '.',
      '',
      '-- BRAND CONTEXT --',
      'BRAND: ' + clientName,
      productName ? 'PRODUCT: ' + productName : '',
      'BRAND TONE: ' + String(brain.brand_tone || ''),
      'KEY OFFER: ' + String(brain.key_offer || ''),
      'BRIEF: ' + String(webhook.body.brief || ''),
      '',
      '-- USE THE TEMPLATE AS A BLUEPRINT (input_urls[0]) --',
      'Use the template layout, composition, visual hierarchy, AND element density as your blueprint.',
      'Re-render the scene, styling, colors, and elements in the world of ' + clientName + '.',
      'Match the STRUCTURE, not the pixels: keep the template zone positions, hierarchy, concept format, and how rich or minimal it is with design elements, but make it look like the ' + clientName + ' own ad, not a copy of the template original brand.',
      'Remove all original brand identity from the template.',
      '',
      brandTypeGuardrail,
      '',
      logoRule,
      '',
      propRule,
      '',
      '-- COPY ANGLE --',
      angle,
      '',
      '-- TYPOGRAPHY --',
      '- Headline is the LARGEST element, at least 3x the subline cap-height.',
      '- Hierarchy: HEADLINE then subline then CTA.',
      '- Keep rendered WORDS to the headline, subline, and CTA only. No em dashes. Every word real and legible.',
      '- Graphic and icon elements are encouraged (specified below); just keep text out of them.',
      '- CTA is a high-contrast button.',
      '',
      '[NO PLATFORM CHROME] Output only the standalone ad creative, no app UI, no feed chrome.',
      '[EDGE-SAFE] Keep all text and focal elements within the central 84% of the canvas.'
    ].join('\n');

    result.push({
      json: {
        template_url: tpl.template_url,
        template_index: tplIdx + 1,
        input_urls: inputUrls,
        prompt: prompt,
        variant_index: vIdx + 1
      }
    });
  });
});

return result;
