// ===========================================================================================
// Bulk: load scraped brand logos into brand_brain.logo_urls (+ fill missing brand colours).
// Reads logos.json = {brands:[{brand, logo_dark_url, logo_white_url, primary_hex, accent_hex}]}
// (or a bare array). Per brand: download each logo, keep SVG / already-transparent PNG as-is, knock
// near-white out of an opaque PNG, re-host under product-images/logos/<brand>/, and set
// logo_urls = [{url:dark},{url:white}]. Also sets primary/accent hex when the row lacks them.
// Idempotent (re-run overwrites). Run on the VPS:   node bulk-logos.js [logos.json]
// ===========================================================================================
'use strict';
require('dotenv').config();
const fs = require('fs');
const { PNG } = require('pngjs');
const E = process.env;
const SB = (E.SUPABASE_URL || 'https://xakngjsybyytldyqfsmi.supabase.co').replace(/\/$/, '');
const KEY = E.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY };
const norm = (s) => String(s || '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '');
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'brand';
const hex = (v) => { if (!v) return null; const h = String(v).trim().replace(/^#/, ''); return /^[0-9a-f]{6}$/i.test(h) ? '#' + h.toLowerCase() : null; };

function isTransparent(buf) {
  try { if (!(buf[0] === 0x89 && buf[1] === 0x50)) return false; const p = PNG.sync.read(buf); const d = p.data, W = p.width, Hh = p.height, a = (x, y) => d[(y * W + x) * 4 + 3]; return [a(1, 1), a(W - 2, 1), a(1, Hh - 2), a(W - 2, Hh - 2)].filter(v => v < 20).length >= 2; } catch (e) { return false; }
}
function whiteKey(buf) { // flat logo on white → knock near-white to transparent
  try { const png = PNG.sync.read(buf); const d = png.data; for (let i = 0; i < d.length; i += 4) if (d[i] > 238 && d[i + 1] > 238 && d[i + 2] > 238) d[i + 3] = 0; return PNG.sync.write(png); } catch (e) { return buf; }
}

async function grab(brand, url, suffix) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error('fetch ' + r.status);
  let ct = r.headers.get('content-type') || '', buf = Buffer.from(await r.arrayBuffer()), ext = 'png';
  if (/svg/i.test(ct) || /\.svg(\?|$)/i.test(url)) { ext = 'svg'; ct = 'image/svg+xml'; }
  else if (/webp/i.test(ct)) { ext = 'webp'; ct = 'image/webp'; }
  else if (/jpe?g/i.test(ct) || /\.jpe?g(\?|$)/i.test(url)) { ext = 'jpg'; ct = 'image/jpeg'; }
  else if (buf[0] === 0x89 && buf[1] === 0x50) { ext = 'png'; ct = 'image/png'; if (!isTransparent(buf)) buf = whiteKey(buf); }
  const path = `logos/${slug(brand)}/${suffix}.${ext}`;
  const up = await fetch(`${SB}/storage/v1/object/product-images/${path}`, { method: 'POST', headers: { ...H, 'Content-Type': ct, 'x-upsert': 'true' }, body: buf });
  if (!up.ok) throw new Error('upload ' + up.status + ' ' + (await up.text()).slice(0, 120));
  return `${SB}/storage/v1/object/public/product-images/${path}`;
}

(async () => {
  if (!KEY) { console.error('SUPABASE_SERVICE_KEY missing from .env'); process.exit(1); }
  const raw = JSON.parse(fs.readFileSync(process.argv[2] || 'logos.json', 'utf8'));
  const list = Array.isArray(raw) ? raw : (raw.brands || []);
  const index = await (await fetch(`${SB}/rest/v1/brand_brain?select=id,brand_name,client_name,aliases,primary_color_hex,accent_color_hex&limit=1000`, { headers: H })).json();
  const find = (t) => { const n = norm(t); return index.find(r => norm(r.brand_name) === n) || index.find(r => norm(r.client_name) === n) || index.find(r => String(r.aliases || '').split('|').some(a => a.trim() && norm(a) === n)); };
  let ok = 0, nologo = 0, nomatch = 0, fail = 0;
  for (const b of list) {
    const row = find(b.brand);
    if (!row) { nomatch++; console.log('  no brand_brain match:', b.brand); continue; }
    try {
      const patch = {}, logos = [];
      if (b.logo_dark_url) logos.push({ url: await grab(b.brand, b.logo_dark_url, 'dark') });
      if (b.logo_white_url) logos.push({ url: await grab(b.brand, b.logo_white_url, 'white') });
      if (logos.length) patch.logo_urls = logos; else nologo++;
      const p = hex(b.primary_hex), a = hex(b.accent_hex);
      if (p && !row.primary_color_hex) patch.primary_color_hex = p;
      if (a && !row.accent_color_hex) patch.accent_color_hex = a;
      if (!Object.keys(patch).length) { console.log('  - nothing to set for', b.brand); continue; }
      const res = await fetch(`${SB}/rest/v1/brand_brain?id=eq.${row.id}`, { method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
      if (!res.ok) throw new Error('patch ' + res.status + ' ' + (await res.text()).slice(0, 100));
      if (patch.logo_urls) ok++;
      console.log(`  ✓ ${b.brand}:${patch.logo_urls ? ' ' + patch.logo_urls.length + ' logo' : ''}${patch.primary_color_hex ? ' +color' : ''}`);
    } catch (e) { fail++; console.log('  FAIL', b.brand, String(e.message || e).slice(0, 90)); }
  }
  console.log(`\nDONE — ${ok} got logos, ${nologo} had no logo url, ${nomatch} unmatched, ${fail} failed (of ${list.length})`);
})().catch(e => { console.error('FATAL', e.message || e); process.exit(1); });
