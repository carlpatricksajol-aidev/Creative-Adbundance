// ===========================================================================================
// Admin tool — set a client's REAL logo(s) into brand_brain.logo_urls so the ad pipeline places it.
// The logo gap is systemic (most brand_brain rows have no logo yet); this makes fixing it a one-liner.
//
//   node set-logo.js "<brand>" "<dark logo url|file>" ["<white logo url|file>"]
//
//   - arg 2 (dark logo) is placed on LIGHT / neon / cream backgrounds.
//   - arg 3 (white logo, OPTIONAL) is placed on DARK backgrounds — supply it for brands that run
//     dark ads so the mark always contrasts.
//
// Each is fetched/read, re-hosted in Supabase Storage (static-ads/logos/<brand>[-white].<ext>) so
// render-time loading is reliable, then written to the matching brand_brain row's logo_urls as
// [{url:dark}, {url:white}]. Uses the same .env keys as the service. Run it on the VPS.
// ===========================================================================================
'use strict';
require('dotenv').config();
const fs = require('fs');
const E = process.env;
const SB_URL = (E.SUPABASE_URL || 'https://xakngjsybyytldyqfsmi.supabase.co').replace(/\/$/, '');
const SB_KEY = E.SUPABASE_SERVICE_KEY;
const BUCKET = E.BUCKET || 'static-ads';
const norm = (s) => String(s || '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '');

// fetch/read a logo, re-host it in Supabase Storage, return the public URL
async function grabAndHost(brand, src, suffix) {
  let buf, ext = 'png', ct = 'image/png';
  if (/^https?:\/\//i.test(src)) {
    const r = await fetch(src, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) throw new Error('fetch logo ' + r.status + ' (' + src + ')');
    ct = r.headers.get('content-type') || ct;
    buf = Buffer.from(await r.arrayBuffer());
  } else {
    buf = fs.readFileSync(src);
  }
  if (/svg/i.test(ct) || /\.svg(\?|$)/i.test(src)) { ext = 'svg'; ct = 'image/svg+xml'; }
  else if (/webp/i.test(ct) || /\.webp(\?|$)/i.test(src)) { ext = 'webp'; ct = 'image/webp'; }
  else if (/jpe?g/i.test(ct) || /\.jpe?g(\?|$)/i.test(src)) { ext = 'jpg'; ct = 'image/jpeg'; }
  else { ext = 'png'; ct = 'image/png'; }

  const path = `logos/${norm(brand)}${suffix}.${ext}`;
  const up = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST', headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': ct, 'x-upsert': 'true' }, body: buf,
  });
  if (!up.ok) throw new Error('upload ' + up.status + ' ' + (await up.text()).slice(0, 200));
  const url = `${SB_URL}/storage/v1/object/public/${BUCKET}/${path}`;
  console.log(`re-hosted ${suffix || 'dark'} (${buf.length} bytes, ${ct}) → ${url}`);
  return url;
}

(async () => {
  const brandArg = process.argv[2];
  const srcDark = process.argv[3];
  const srcLight = process.argv[4]; // optional white variant
  if (!brandArg || !srcDark) { console.error('Usage: node set-logo.js "<brand>" "<dark logo url|file>" ["<white logo url|file>"]'); process.exit(1); }
  if (!SB_KEY) { console.error('SUPABASE_SERVICE_KEY missing from .env'); process.exit(1); }

  const darkUrl = await grabAndHost(brandArg, srcDark, '');
  const lightUrl = srcLight ? await grabAndHost(brandArg, srcLight, '-white') : null;
  const logoArr = lightUrl ? [{ url: darkUrl }, { url: lightUrl }] : [{ url: darkUrl }];

  // find the brand_brain row (same normalised matching the pipeline uses)
  const get = async (u) => { const r = await fetch(SB_URL + '/rest/v1/' + u, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } }); return r.ok ? r.json() : []; };
  const index = await get('brand_brain?select=id,brand_name,client_name,aliases&limit=800');
  const t = norm(brandArg);
  const hit = index.find(r => norm(r.brand_name) === t) || index.find(r => norm(r.client_name) === t)
    || index.find(r => String(r.aliases || '').split('|').some(a => a.trim() && norm(a) === t));
  if (!hit) throw new Error(`no brand_brain row matches "${brandArg}"`);

  const pat = await fetch(`${SB_URL}/rest/v1/brand_brain?id=eq.${hit.id}`, {
    method: 'PATCH', headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ logo_urls: logoArr }),
  });
  if (!pat.ok) throw new Error('patch ' + pat.status + ' ' + (await pat.text()).slice(0, 200));
  console.log(`✓ set logo_urls (${logoArr.length} variant${logoArr.length > 1 ? 's' : ''}) for "${hit.brand_name || hit.client_name}" (id ${hit.id})`);
})().catch((e) => { console.error('ERROR', e.message || e); process.exit(1); });
