const templates = $input.all();
const webhookBody = $('Webhook1').first().json.body || {};
const brain = $('Search Brand Brain').first().json || {};
const count = parseInt(webhookBody.static_ads_count) || 1;

// NEW: manual template picks from the intake form (top_performers mode).
// These are the EXACT templates the requester chose from the Supabase library.
const selectedTemplateUrls = Array.isArray(webhookBody.selected_template_urls)
  ? webhookBody.selected_template_urls.filter(Boolean)
  : [];
const selectedTemplateIds = Array.isArray(webhookBody.selected_template_ids)
  ? webhookBody.selected_template_ids
  : [];

// Requested aspect ratio (mirror the Search records filter)
const p = String(webhookBody.platforms || '').toLowerCase();
let wantAR = '1:1';
if (p.indexOf('9:16') > -1 || p.indexOf('vertical') > -1) wantAR = '9:16';
else if (p.indexOf('16:9') > -1 || p.indexOf('youtube') > -1 || p.indexOf('1.91') > -1 || p.indexOf('horizontal') > -1) wantAR = '16:9';

function arOf(att) {
  const w = att && att.width, h = att && att.height;
  if (!w || !h) return null;
  const r = w / h;
  if (Math.abs(r - 1) < 0.12) return '1:1';
  return (r < 0.85) ? '9:16' : '16:9';
}

// ── PRIORITY 0: MANUAL PICKS ──
// If the requester hand-picked templates in the form, build exactly ONE ad per picked
// template from the chosen Supabase URLs. Skip references, winners, and the Airtable
// auto-shuffle entirely — the user has already decided which templates to use.
// They are AD TEMPLATE slots (is_ref_slot:false) so Build KIE AI Prompt borrows the
// concept and re-maps it to THIS brand (correct: they're other brands' library ads).
if (selectedTemplateUrls.length) {
  // The form's gallery can be slightly out of sync with the templates bucket and hand us
  // a URL that no longer exists (404). A dead template_url becomes a broken input image
  // and produces a junk ad, so drop any that don't resolve before building slots.
  const livePicks = [];
  for (let i = 0; i < selectedTemplateUrls.length; i++) {
    const url = String(selectedTemplateUrls[i]);
    try {
      await this.helpers.httpRequest({ method: 'HEAD', url: url });
      livePicks.push({ url: url, id: String(selectedTemplateIds[i] || ('selected_' + i)) });
    } catch (e) { /* 404 / unreachable template - skip it */ }
  }
  return livePicks.map(function (pick, idx) {
    return {
      json: {
        template_id: pick.id,
        template_url: pick.url,
        is_ref_slot: false,
        ref_index: -1,
        ref_source: 'selected_template'
      }
    };
  });
}

// PRIORITY 1: references the client uploaded for THIS run (explicit creative direction)
let referenceUrls = Array.isArray(webhookBody.reference_urls)
  ? webhookBody.reference_urls.filter(Boolean)
  : [];
let refSource = referenceUrls.length ? 'user_upload' : null;

// PRIORITY 2: the brand's OWN winning ads -> clone their proven layouts automatically
if (referenceUrls.length === 0) {
  const winners = Array.isArray(brain.winning_ads) ? brain.winning_ads : [];
  const matched = winners.filter(function (a) { return arOf(a) === wantAR; });
  const chosen = matched.length ? matched : winners; // prefer aspect match, else any winner
  referenceUrls = chosen.map(function (a) { return (a && a.url) ? String(a.url) : null; }).filter(Boolean);
  if (referenceUrls.length) refSource = 'winning_ads';
}

const refCount = referenceUrls.length;
const refSlots = Math.min(refCount, count);   // one ad per distinct blueprint
const fillSlots = count - refSlots;            // remaining slots to fill

// PROMO CONCEPT VARIANTS (client winning ad + promotional brief):
// when the blueprint is the client's own winning ad AND the brief carries an offer,
// the remaining slots become promo concept variants built AROUND that winning ad
// (product re-staged / UGC holding it / green-screen presenter / offer banner -
// Build KIE AI Prompt assigns the archetypes) instead of random library templates.
// Manual picks above still win; non-promo runs keep the library fill.
const briefText = String(webhookBody.brief || '').trim();
const isPromoObjective = /(\d+\s*%|\bpercent\b|\boff\b|\bsale\b|\bdiscount\b|\bbogo\b|\bbuy\s*\d|\bfree\b|\bdeal\b|\bpromo\b|\bcoupon\b|\bcode\b|\bends\b|\bexpires\b)/i.test(briefText);
const usePromoVariants = refCount > 0 && isPromoObjective;
const airtableSlots = usePromoVariants ? 0 : fillSlots; // library fill only on non-promo runs

// Shuffle the CreativeOS templates for the fill/fallback slots
const arr = templates.slice();
for (var i = arr.length - 1; i > 0; i--) {
  var j = Math.floor(Math.random() * (i + 1));
  var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
}
const airtablePicked = arr.slice(0, Math.min(airtableSlots, arr.length));

const result = [];

for (var r = 0; r < refSlots; r++) {
  result.push({
    json: {
      template_id: refSource + '_' + r,
      template_url: referenceUrls[r],
      is_ref_slot: true,
      ref_index: r,
      ref_source: refSource
    }
  });
}

// Promo concept variant slots: same winning ad as the anchor image, but flagged so
// Build KIE AI Prompt generates a NEW concept per archetype (not a layout clone).
if (usePromoVariants) {
  for (var v = 0; v < fillSlots; v++) {
    result.push({
      json: {
        template_id: 'promo_variant_' + v,
        template_url: referenceUrls[v % refCount],
        is_ref_slot: false,
        ref_index: -1,
        ref_source: 'promo_variant',
        promo_variant_index: v
      }
    });
  }
}

airtablePicked.forEach(function (entry) {
  result.push({
    json: {
      template_id: String(entry.json.id),
      template_url: String(entry.json.image_url || (entry.json.template_image && entry.json.template_image[0] && entry.json.template_image[0].url) || ''),
      is_ref_slot: false,
      ref_index: -1,
      ref_source: 'creativeos'
    }
  });
});

return result;
