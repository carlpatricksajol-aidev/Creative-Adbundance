// ===========================================================================================
// Background knockout for product packshots, via AI matting (@imgly/background-removal-node).
// A learned segmentation model separates the product foreground from the background, so it
// understands OBJECTS — it will not eat a white product face that sits on a white background
// (which a naive colour flood-fill does), and it handles shadows and complex studio scenes.
// Returns a transparent PNG Buffer, or null on failure so the caller can fall back to the original.
//
// Note: matting cannot remove text or graphics that are BAKED INTO the source image (e.g. a
// marketing shot with a slogan) — those are foreground content. Such products need a clean packshot.
// ===========================================================================================
'use strict';
const { removeBackground } = require('@imgly/background-removal-node');

// @imgly needs the input Blob's MIME type; sniff it from the magic bytes.
function mimeOf(b) {
  if (b[0] === 0xFF && b[1] === 0xD8) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png';
  if (b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return 'image/png';
}

async function cutoutBuffer(input) {
  try {
    const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
    const src = new Blob([buf], { type: mimeOf(buf) });
    const blob = await removeBackground(src, { output: { format: 'image/png' } });
    const out = Buffer.from(await blob.arrayBuffer());
    return (out && out.length > 1000) ? out : null;
  } catch (e) {
    return null;
  }
}
module.exports = { cutoutBuffer };
