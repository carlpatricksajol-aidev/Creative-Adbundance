// ===========================================================================================
// Background knockout for studio packshots. Flood-fills from the image border, removing the sampled
// background colour AND the neutral ground shadow in the bottom half of the frame, then trims to the
// product's bounding box. The bottom-half guard protects light neutral areas up top (silver can
// tops); the saturation guard protects warm product colours (e.g. a pale cream can); the darkness
// guard protects black text. Pure sharp — no native matting model. Returns a transparent PNG Buffer,
// or null if the image is not a clean packshot (so the caller can fall back to the original).
// ===========================================================================================
'use strict';
const sharp = require('sharp');

async function cutoutBuffer(input, opts = {}) {
  const tol = opts.tol || 35, SHADOW_SAT = 15, SHADOW_LUM = 150, BOTTOM = 0.5;
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = 4;
  const idx = (x, y) => (y * W + x) * C;
  const patch = (x0, y0) => { let r = 0, g = 0, b = 0, n = 0; for (let y = y0; y < y0 + 14; y++) for (let x = x0; x < x0 + 14; x++) { const i = idx(x, y); r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; } return [r / n, g / n, b / n]; };
  const cs = [patch(0, 0), patch(W - 14, 0), patch(0, H - 14), patch(W - 14, H - 14)];
  const bg = [0, 1, 2].map(k => cs.reduce((s, c) => s + c[k], 0) / 4);
  const dist = (i) => { const dr = data[i] - bg[0], dg = data[i + 1] - bg[1], db = data[i + 2] - bg[2]; return Math.sqrt(dr * dr + dg * dg + db * db); };
  const removable = (y, i) => {
    if (dist(i) <= tol) return true;
    if (y > H * BOTTOM) { const r = data[i], g = data[i + 1], b = data[i + 2]; if (Math.max(r, g, b) - Math.min(r, g, b) < SHADOW_SAT && (r + g + b) / 3 > SHADOW_LUM) return true; }
    return false;
  };
  const mask = new Uint8Array(W * H);
  const q = new Int32Array(W * H); let qt = 0, qh = 0;
  const push = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const p = y * W + x; if (mask[p]) return; if (removable(y, p * C)) { mask[p] = 1; q[qt++] = p; } };
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
  while (qh < qt) { const p = q[qh++]; const x = p % W, y = (p - x) / W; push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }
  let removed = 0; for (let p = 0; p < W * H; p++) if (mask[p]) { data[p * C + 3] = 0; removed++; }
  const frac = removed / (W * H);
  if (frac < 0.05 || frac > 0.95) return null; // not a clean-background packshot — let caller use original
  return sharp(Buffer.from(data), { raw: { width: W, height: H, channels: 4 } }).png().trim({ threshold: 1 }).toBuffer();
}
module.exports = { cutoutBuffer };
