const item = $input.first().json;
const brain = $('Search Brand Brain').first().json;
const body = $('Webhook').first().json.body || {};

const angleMap = {
  1: 'Lead with the core frustration and pain point. Pain-first hook.',
  2: 'Lead with the outcome and key benefit. Benefit-first hook.',
  3: 'Lead with social proof and trust. Authority-first hook.'
};
const angleDirection = angleMap[item.variant_index] || angleMap[1];

const productForCopy = (Array.isArray(body.product_names) && body.product_names.length)
  ? body.product_names.join(', ')
  : (body.product_name || '');

const copyPrompt = [
  'You are a direct response copywriter and art director for performance ads.',
  '',
  'BRAND: ' + (body.client_name || ''),
  'PRODUCT: ' + productForCopy,
  'INDUSTRY: ' + (brain.industry || ''),
  'BRIEF: ' + (body.brief || ''),
  'BRAND TONE: ' + (brain.brand_tone || ''),
  'KEY OFFER: ' + (brain.key_offer || ''),
  'TARGET AUDIENCE: ' + (brain.target_personas || ''),
  'PRODUCT BENEFITS: ' + (brain.product_benefits || ''),
  'ANGLE: ' + angleDirection,
  '',
  'Write copy SPECIFICALLY for the PRODUCT above, not the brand in general.',
  '',
  'Structure EXACTLY:',
  '- HEADLINE: 4 to 7 words, ALL CAPS, one strong hook, no em dashes.',
  '- SUBLINE: 8 to 14 words, sentence case, supports the headline.',
  '- CTA: 3 to 5 words, action-driven button text.',
  '',
  'Also act as art director. Suggest 3 to 5 DESIGN ELEMENTS: decorative graphic elements',
  '(icons, shapes, motifs, accent graphics) that visually represent THIS brand world and',
  'message. Derive them from the brand context above, not from generic stock ideas.',
  'They must contain NO text inside them. Each element is a short phrase.',
  '',
  'Return ONLY a JSON object with keys: headline, subline, cta, design_elements (array of strings). No markdown.'
].join('\n');

let copy;
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
      max_tokens: 400,
      messages: [{ role: 'user', content: copyPrompt }]
    })
  });
  const raw = response.choices[0].message.content;
  copy = JSON.parse(raw.substring(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
} catch (e) {
  copy = { headline: 'FIND YOUR SOLUTION', subline: 'Trusted options, reviewed by independent experts.', cta: 'Learn More', design_elements: [] };
}

const elements = Array.isArray(copy.design_elements) ? copy.design_elements.filter(Boolean) : [];

const lines = [
  item.prompt,
  '',
  '-- EXACT COPY TO RENDER --',
  'HEADLINE (largest, bold, dominant): ' + (copy.headline || ''),
  'SUBLINE (smaller, below headline): ' + (copy.subline || ''),
  'CTA BUTTON: ' + (copy.cta || ''),
  '',
  'CRITICAL: Render ONLY these 3 text elements, word for word. No extra copy, no bullet lists, no feature lists.'
];

if (elements.length) {
  lines.push('');
  lines.push('-- DESIGN ELEMENTS (brand-derived, render at the template density) --');
  lines.push('Incorporate these brand-appropriate graphic elements: ' + elements.join('; ') + '.');
  lines.push('Match the element density and placement style of the template (input_urls[0]).');
  lines.push('These are decorative and iconographic only, with NO text inside them. Keep all rendered words to the headline, subline, and CTA.');
}

const enhancedPrompt = lines.join('\n');

return [{
  json: Object.assign({}, item, {
    prompt: enhancedPrompt,
    generated_headline: copy.headline,
    generated_subline: copy.subline,
    generated_cta: copy.cta,
    design_elements: elements
  })
}];
