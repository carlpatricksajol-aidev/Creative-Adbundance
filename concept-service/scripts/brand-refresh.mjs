// Brand-brain refresh: AI web research fills the gaps, per Carl's call
// (2026-08-22). Three hard rules this script exists to enforce:
//
//   1. NEVER overwrite a non-empty field. The July harvest came from the
//      clients' own onboarding decks; web research supplements it, it does not
//      compete with it.
//   2. Only research what the web can actually know: products, offer, pains,
//      personas, competitors, voice, visual tokens. winning_concepts,
//      losing_patterns and dos_and_donts are INTERNAL performance and client
//      knowledge; a web guess there would poison the generator, so this script
//      refuses to touch them.
//   3. Category-level compliance guidance is useful but is not the client's
//      own gates, so anything written to compliance_notes is prefixed saying
//      exactly that.
//
// Run on the VPS:
//   node --env-file=/root/Creative-Adbundance/concept-service/.env \
//     scripts/brand-refresh.mjs --fill-active            # gap-fill the active roster
//   node --env-file=... scripts/brand-refresh.mjs --insert "PackDraw"
//   node --env-file=... scripts/brand-refresh.mjs --clients "Truffle,Ello"

const SB = process.env.SUPABASE_URL || 'https://xakngjsybyytldyqfsmi.supabase.co';
const SK = process.env.SUPABASE_SERVICE_KEY;
const OR = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.REFRESH_MODEL || 'anthropic/claude-sonnet-5';
const STAMP = new Date().toISOString().slice(0, 10);
if (!SK || !OR) { console.error('need SUPABASE_SERVICE_KEY and OPENROUTER_API_KEY in env'); process.exit(1); }

const RESEARCHABLE = ['website', 'industry', 'products', 'key_offer', 'product_benefits',
  'core_pain_points', 'target_personas', 'competitors', 'brand_tone', 'brand_personality',
  'compliance_notes', 'primary_color_hex', 'secondary_color_hex', 'accent_color_hex', 'brand_fonts'];

const ACTIVE = ['Simple Path Financial', 'Smooth Sailing', 'Trusted Company Reviews', 'Brick',
  'Kind Water', 'Happy Aging', 'Arbor', 'Finance Advisors', 'Symple Lending', 'Delta Children',
  'Plixi', 'Hormbles', 'Path Social', 'Rip Van', 'Truffle', 'Nurx', 'DataShield', 'Ello',
  'Atticus', 'Huckleberry', 'ODDITY', 'Mulberrys Garment Care', 'Pattern Brands', 'GIR',
  'Trade With the Pros', 'Natural Force', 'ThreadBeast', 'Scale Beyond Collagen',
  'Accredited Debt Relief', 'Grade Potential', 'Bridge', 'Graduation Alliance', 'tapouts',
  'Scale LiverMD', 'Mistplay', 'H•earrings', 'RentRedi', 'Entreprenista League', 'ResQ',
  'Get More Legal Clients', 'ClaimWise', 'Kickback'];

const sb = (path, init) => fetch(SB + '/rest/v1/' + path, {
  ...init,
  headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'content-type': 'application/json',
    Prefer: (init && init.method) ? 'return=minimal' : undefined, ...(init && init.headers) },
});

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function research(brand, hints, fields) {
  const schema = { type: 'object', additionalProperties: false,
    properties: Object.fromEntries(fields.map((f) => [f, { type: 'string' }]).concat([
      ['sources', { type: 'string' }]])),
    required: fields.concat(['sources']) };
  const guide = `
Field guidance, follow it exactly:
- website: the brand's own primary domain, as a URL. Nothing else.
- industry: one or two sentences, the category and the business model.
- products: what they actually sell, named. Ranges, tiers, SKus if public.
- key_offer: the deal as the brand states it: pricing hook, guarantee, trial, bundle.
- product_benefits: the benefits THE BRAND claims publicly, plus any proof points found
  (ratings, review counts, accreditations) each attributed to where you saw it.
- core_pain_points: the customer problems the brand's own copy targets.
- target_personas: who the brand visibly targets: age, situation, need. From their copy
  and channels, not invented demographics.
- competitors: named direct competitors, comma separated.
- brand_tone / brand_personality: how the brand actually writes and presents, from its
  site and social copy.
- compliance_notes: CATEGORY-LEVEL rules only (e.g. financial claims need qualifiers,
  supplements cannot claim to treat disease). Begin with exactly:
  "Category-level guidance (AI web research ${STAMP}), confirm client-specific gates from the onboarding deck: "
- primary_color_hex / secondary_color_hex / accent_color_hex: hex codes read from the
  brand site's actual styling, formatted like #1A2B3C. Empty if you could not read them.
- brand_fonts: font family names the site visibly uses. Empty if not determinable.
- sources: the URLs you actually used, comma separated.
Hard rules: only what you can verify from the web NOW. An empty string is the correct
answer when you cannot verify; never guess, never fill from general knowledge of the
category. No em dashes anywhere.`;
  // gateways occasionally answer with an HTML error page, and some provider
  // paths mishandle response_format combined with the web plugin, so: retry
  // transient failures, then fall back to plain content with JSON extraction.
  const call = async (useSchema) => fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + OR, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      plugins: [{ id: 'web', max_results: 5 }],
      max_tokens: 8000,
      messages: [{ role: 'user', content:
        `Research the brand "${brand}" for an ad agency's brand knowledge base.` +
        (hints ? `\nKnown so far: ${hints}` : '') +
        `\nFill ONLY these fields: ${fields.join(', ')}.\n${guide}` +
        `\nReturn ONLY a JSON object with the fields ${fields.join(', ')} and sources. No prose around it.` }],
      ...(useSchema ? { response_format: { type: 'json_schema', json_schema: { name: 'brand_fields', strict: true, schema } } } : {}),
    }),
  });
  const extract = (t) => {
    t = String(t).replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    const i = t.indexOf('{');
    let depth = 0;
    for (let k = i; k >= 0 && k < t.length; k++) {
      if (t[k] === '{') depth++;
      else if (t[k] === '}' && --depth === 0) return JSON.parse(t.slice(i, k + 1));
    }
    throw new Error('no JSON object in response: ' + String(t).slice(0, 120));
  };
  let lastErr = null;
  for (const attempt of [{ schema: true }, { schema: true }, { schema: false }]) {
    try {
      const res = await call(attempt.schema);
      const txt = await res.text();
      let d;
      try { d = JSON.parse(txt); }
      catch { throw new Error('non-JSON from gateway (' + res.status + '): ' + txt.slice(0, 80)); }
      if (d.error) throw new Error(JSON.stringify(d.error).slice(0, 200));
      const out = extract(d.choices[0].message.content);
      out.__cost = (d.usage || {}).cost || 0;
      return out;
    } catch (e) {
      lastErr = e;
      await new Promise((ok) => setTimeout(ok, 4000));
    }
  }
  throw lastErr;
}

async function loadRows() {
  const r = await sb('brand_brain?select=id,brand_name,client_name,aliases,notes,confidence,' + RESEARCHABLE.join(','));
  return r.json();
}

function findRow(rows, name) {
  const w = norm(name);
  return rows.find((r) => norm(r.brand_name) === w)
    || rows.find((r) => norm(r.client_name) === w)
    || rows.find((r) => String(r.aliases || '').split('|').some((a) => norm(a) === w));
}

async function fillRow(row) {
  const empty = RESEARCHABLE.filter((f) => !(row[f] || '').trim());
  if (!empty.length) return { brand: row.brand_name, filled: [], cost: 0 };
  const hints = ['website', 'industry', 'products'].filter((f) => (row[f] || '').trim())
    .map((f) => `${f}: ${String(row[f]).slice(0, 200)}`).join('; ');
  const got = await research(row.brand_name, hints, empty);
  const patch = {};
  for (const f of empty) if ((got[f] || '').trim()) patch[f] = got[f].trim();
  const filled = Object.keys(patch);
  if (!filled.length) return { brand: row.brand_name, filled: [], cost: got.__cost };
  patch.notes = ((row.notes || '') + `\n\nAI web refresh ${STAMP}: filled ${filled.join(', ')}. Sources: ${got.sources || 'n/a'}. Only previously-empty fields were written; confirm against the Drive onboarding deck.`).trim();
  const r = await sb(`brand_brain?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  if (!r.ok) throw new Error(`patch ${row.brand_name}: ${r.status} ${await r.text()}`);
  return { brand: row.brand_name, filled, cost: got.__cost };
}

async function insertBrand(name) {
  const got = await research(name, '', RESEARCHABLE);
  const row = { brand_name: name, client_name: name, status: 'active', confidence: 'medium', aliases: '' };
  for (const f of RESEARCHABLE) if ((got[f] || '').trim()) row[f] = got[f].trim();
  row.notes = `Row created by AI web research ${STAMP} (no Drive harvest yet). Sources: ${got.sources || 'n/a'}. winning_concepts, losing_patterns and dos_and_donts are deliberately empty: they are internal knowledge and must come from the onboarding deck and the account team, never from the web.`;
  const r = await sb('brand_brain', { method: 'POST', body: JSON.stringify(row) });
  if (!r.ok) throw new Error(`insert ${name}: ${r.status} ${await r.text()}`);
  return { brand: name, filled: Object.keys(row), cost: got.__cost };
}

// ------------------------------------------------------------------- main
const arg = (flag) => { const i = process.argv.indexOf(flag); return i > -1 ? process.argv[i + 1] : null; };
const rows = await loadRows();
let jobs = [];
if (process.argv.includes('--fill-active')) {
  for (const name of ACTIVE) {
    const row = findRow(rows, name);
    if (row) jobs.push(() => fillRow(row));
    else console.log('SKIP (not in brand_brain):', name);
  }
} else if (arg('--clients')) {
  for (const name of arg('--clients').split(',').map((s) => s.trim())) {
    const row = findRow(rows, name);
    if (row) jobs.push(() => fillRow(row));
    else console.log('SKIP (not found):', name);
  }
}
if (arg('--insert')) {
  for (const name of arg('--insert').split(',').map((s) => s.trim())) {
    if (findRow(rows, name)) console.log('SKIP insert, already exists:', name);
    else jobs.push(() => insertBrand(name));
  }
}
if (!jobs.length) { console.log('nothing to do'); process.exit(0); }

console.log(`${jobs.length} jobs, model ${MODEL}, only-empty-fields policy`);
let total = 0;
const CONC = 3;
const queue = jobs.slice();
await Promise.all(Array.from({ length: CONC }, async () => {
  for (;;) {
    const job = queue.shift();
    if (!job) return;
    try {
      const r = await job();
      total += r.cost || 0;
      console.log(`OK   ${r.brand}: ${r.filled.length ? 'filled ' + r.filled.join(', ') : 'nothing verifiable found'} ($${(r.cost || 0).toFixed(3)})`);
    } catch (e) {
      console.log(`FAIL ${e.message.slice(0, 160)}`);
    }
  }
}));
console.log(`done. total research cost: $${total.toFixed(2)}`);
