// ===========================================================================================
// Admin tool — upsert brand_brain rows from a JSON file (insert new, update existing by brand_name).
// Data file (default newbrands.json) is a JSON array of brand_brain rows. It is gitignored: brand
// strategy comes from confidential client briefs, so it is transferred to the VPS out-of-band, not
// committed to the public repo.   node add-brands.js [newbrands.json]
// ===========================================================================================
'use strict';
require('dotenv').config();
const fs = require('fs');
const E = process.env;
const SB = (E.SUPABASE_URL || 'https://xakngjsybyytldyqfsmi.supabase.co').replace(/\/$/, '');
const KEY = E.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY };
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

(async () => {
  if (!KEY) { console.error('SUPABASE_SERVICE_KEY missing from .env'); process.exit(1); }
  const raw = JSON.parse(fs.readFileSync(process.argv[2] || 'newbrands.json', 'utf8'));
  const rows = Array.isArray(raw) ? raw : [raw];
  const index = await (await fetch(`${SB}/rest/v1/brand_brain?select=id,brand_name&limit=1000`, { headers: H })).json();
  for (const row of rows) {
    if (!row.brand_name) { console.log('  skip: row with no brand_name'); continue; }
    const existing = index.find(r => norm(r.brand_name) === norm(row.brand_name));
    const url = existing ? `${SB}/rest/v1/brand_brain?id=eq.${existing.id}` : `${SB}/rest/v1/brand_brain`;
    const method = existing ? 'PATCH' : 'POST';
    const r = await fetch(url, { method, headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(row) });
    console.log(r.ok ? `  ✓ ${method === 'PATCH' ? 'updated' : 'inserted'} ${row.brand_name}` : `  FAIL ${method} ${row.brand_name} ${r.status} ${(await r.text()).slice(0, 160)}`);
  }
  console.log('done');
})().catch(e => { console.error('FATAL', e.message || e); process.exit(1); });
