// ===========================================================================================
// Admin tool — set a client's REAL product image (ideally a clean, transparent-background PNG)
// into the products table so the ad pipeline uses that exact packshot. Re-hosts the image in
// Supabase and updates products.product_image_url for the brand's matching product(s).
//
//   node set-product.js "<brand>" "<png url or file>" ["<product-name filter>"]
//
//   - arg 4 (optional) limits the update to products whose name contains that text
//     (case-insensitive). Omit it to update every product for the brand.
//
// Give it a transparent PNG for the cleanest result (it drops onto any ad background with no box).
// Uses the same .env keys as the service. Run it on the VPS.
// ===========================================================================================
'use strict';
require('dotenv').config();
const fs = require('fs');
const E = process.env;
const SB_URL = (E.SUPABASE_URL || 'https://xakngjsybyytldyqfsmi.supabase.co').replace(/\/$/, '');
const SB_KEY = E.SUPABASE_SERVICE_KEY;
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'main';

(async () => {
  const brand = process.argv[2], src = process.argv[3], filter = process.argv[4];
  if (!brand || !src) { console.error('Usage: node set-product.js "<brand>" "<png url or file>" ["<product-name filter>"]'); process.exit(1); }
  if (!SB_KEY) { console.error('SUPABASE_SERVICE_KEY missing from .env'); process.exit(1); }

  // 1. get the image bytes + type
  let buf, ct = 'image/png';
  if (/^https?:\/\//i.test(src)) {
    const r = await fetch(src, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) throw new Error('fetch image ' + r.status);
    ct = r.headers.get('content-type') || ct;
    buf = Buffer.from(await r.arrayBuffer());
  } else buf = fs.readFileSync(src);
  const ext = (/webp/i.test(ct) || /\.webp(\?|$)/i.test(src)) ? 'webp' : (/jpe?g/i.test(ct) || /\.jpe?g(\?|$)/i.test(src)) ? 'jpg' : 'png';
  const transparent = buf[0] === 0x89 && buf[1] === 0x50; // PNG (can carry alpha)
  console.log(`image: ${buf.length} bytes, ${ct}${transparent ? ' (PNG — can be transparent)' : ' (no alpha — will be auto-matted at render time)'}`);

  // 2. re-host in the product-images bucket
  const path = `${slug(brand)}/clean-${slug(filter)}.${ext}`;
  const up = await fetch(`${SB_URL}/storage/v1/object/product-images/${path}`, {
    method: 'POST', headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': ct, 'x-upsert': 'true' }, body: buf,
  });
  if (!up.ok) throw new Error('upload ' + up.status + ' ' + (await up.text()).slice(0, 200));
  const publicUrl = `${SB_URL}/storage/v1/object/public/product-images/${path}`;
  console.log('re-hosted →', publicUrl);

  // 3. find matching products
  const get = async (u) => { const r = await fetch(SB_URL + '/rest/v1/' + u, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } }); return r.ok ? r.json() : []; };
  let q = `products?brand_name=eq.${encodeURIComponent(brand)}&select=id,product_name`;
  if (filter) q += `&product_name=ilike.*${encodeURIComponent(filter)}*`;
  const rows = await get(q);
  if (!rows.length) {
    // no existing product for this brand — insert a new one (product_name from the filter, else the brand)
    const name = filter || brand;
    const ins = await fetch(`${SB_URL}/rest/v1/products`, {
      method: 'POST', headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ brand_name: brand, product_name: name, product_image_url: publicUrl }),
    });
    if (!ins.ok) throw new Error('insert product ' + ins.status + ' ' + (await ins.text()).slice(0, 200));
    console.log(`✓ inserted new product "${name}" for "${brand}"`);
    return;
  }

  // 4. point them at the new image
  for (const row of rows) {
    const pat = await fetch(`${SB_URL}/rest/v1/products?id=eq.${row.id}`, {
      method: 'PATCH', headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ product_image_url: publicUrl }),
    });
    if (!pat.ok) throw new Error('patch ' + pat.status + ' ' + (await pat.text()).slice(0, 200));
    console.log(`✓ updated "${row.product_name}" (id ${row.id})`);
  }
})().catch((e) => { console.error('ERROR', e.message || e); process.exit(1); });
