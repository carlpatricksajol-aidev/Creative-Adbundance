// ===========================================================================================
// Batch: give EVERY product a clean, transparent-background PNG. Walks the products table and, per
// image: skips it if it is already a transparent PNG; otherwise runs AI matting, stores the cutout
// in the product-images bucket (product-images/<brand>/cutout-<hash>.png), and repoints
// products.product_image_url at it. Idempotent + resumable (rows already on a "cutout-" URL or
// already transparent are skipped) and dedupes by source URL so a shared image is matted once.
//
//   node process-products.js                      # all brands
//   node process-products.js --brand "ARMRA"      # one brand
//   node process-products.js --limit 20           # first 20 (for a test)
//   node process-products.js --dry-run            # matte + report, do NOT touch the table
//   node process-products.js --concurrency 2      # parallel mattes (default 2; raise if RAM allows)
//
// Long job (~2-3s per image). Run it on the VPS in the background:  nohup node process-products.js > proc.log 2>&1 &
// ===========================================================================================
'use strict';
require('dotenv').config();
const crypto = require('crypto');
const { cutoutBuffer } = require('./cutout');
const { PNG } = require('pngjs');
const E = process.env;
const SB = (E.SUPABASE_URL || 'https://xakngjsybyytldyqfsmi.supabase.co').replace(/\/$/, '');
const KEY = E.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY };
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'brand';

const flag = (k) => process.argv.includes(k);
const val = (k, d) => { const i = process.argv.indexOf(k); return (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) ? process.argv[i + 1] : d; };
const BRAND = val('--brand', null);
const LIMIT = +val('--limit', 0) || 0;
const CONC = +val('--concurrency', 2) || 2;
const DRY = flag('--dry-run');

function isTransparentPng(buf) {
  try {
    if (!(buf[0] === 0x89 && buf[1] === 0x50)) return false;
    const png = PNG.sync.read(buf);
    const W = png.width, Hh = png.height, d = png.data, a = (x, y) => d[(y * W + x) * 4 + 3];
    return [a(1, 1), a(W - 2, 1), a(1, Hh - 2), a(W - 2, Hh - 2)].filter(v => v < 20).length >= 3;
  } catch (e) { return false; }
}

async function getAll() {
  const out = []; const page = 1000; let offset = 0;
  while (true) {
    let u = `${SB}/rest/v1/products?select=id,brand_name,product_name,product_image_url&order=id&limit=${page}&offset=${offset}`;
    if (BRAND) u += `&brand_name=eq.${encodeURIComponent(BRAND)}`;
    const r = await fetch(u, { headers: H });
    const rows = await r.json();
    if (!Array.isArray(rows) || !rows.length) break;
    out.push(...rows); if (rows.length < page) break; offset += page;
    if (LIMIT && out.length >= LIMIT) break;
  }
  return LIMIT ? out.slice(0, LIMIT) : out;
}

(async () => {
  if (!KEY) { console.error('SUPABASE_SERVICE_KEY missing from .env'); process.exit(1); }
  const rows = await getAll();
  console.log(`${rows.length} products${BRAND ? ` for ${BRAND}` : ''}${DRY ? '  (DRY RUN — table not touched)' : ''}`);

  const byUrl = new Map();
  for (const r of rows) {
    const u = (r.product_image_url || '').trim();
    if (!u || /\/cutout-[0-9a-f]{6,}\.png/.test(u)) continue; // empty or already processed
    if (!byUrl.has(u)) byUrl.set(u, []);
    byUrl.get(u).push(r);
  }
  const urls = [...byUrl.keys()];
  console.log(`${urls.length} unique images to process (rest already done / empty)\n`);

  let done = 0, matted = 0, skipped = 0, failed = 0, idx = 0;
  const t0 = Date.now();
  async function worker() {
    while (idx < urls.length) {
      const u = urls[idx++]; const group = byUrl.get(u); const brand = group[0].brand_name;
      try {
        const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!r.ok) { failed++; console.log(`  FAIL fetch ${r.status}  ${brand}  ${u.slice(0, 60)}`); done++; continue; }
        const inbuf = Buffer.from(await r.arrayBuffer());
        if (await isTransparentPng(inbuf)) { skipped++; done++; if (done % 25 === 0) tick(); continue; }
        const cut = await cutoutBuffer(inbuf);
        if (!cut) { failed++; console.log(`  FAIL matte  ${brand}  ${(group[0].product_name || '').slice(0, 40)}`); done++; continue; }
        if (!DRY) {
          const path = `${slug(brand)}/cutout-${crypto.createHash('md5').update(u).digest('hex').slice(0, 12)}.png`;
          const up = await fetch(`${SB}/storage/v1/object/product-images/${path}`, { method: 'POST', headers: { ...H, 'Content-Type': 'image/png', 'x-upsert': 'true' }, body: cut });
          if (!up.ok) { failed++; console.log(`  FAIL upload ${up.status}`); done++; continue; }
          const pub = `${SB}/storage/v1/object/public/product-images/${path}`;
          for (const g of group) await fetch(`${SB}/rest/v1/products?id=eq.${g.id}`, { method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ product_image_url: pub }) });
        }
        matted++; done++; if (done % 25 === 0 || done <= 3) tick();
      } catch (e) { failed++; done++; console.log(`  ERR ${String(e.message || e).slice(0, 80)}`); }
    }
  }
  function tick() { const s = (Date.now() - t0) / 1000; console.log(`  ${done}/${urls.length}  matted:${matted} skipped:${skipped} failed:${failed}  (${s.toFixed(0)}s, ${(done / s).toFixed(1)}/s)`); }
  await Promise.all(Array.from({ length: CONC }, worker));
  console.log(`\nDONE — ${matted} matted, ${skipped} already-transparent, ${failed} failed, of ${urls.length} unique images (${rows.length} products).`);
})().catch(e => { console.error('FATAL', e.message || e); process.exit(1); });
