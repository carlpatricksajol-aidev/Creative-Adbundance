// Generates standalone previews of create.html with the password gate and
// Google auth PERMANENTLY disabled (no race conditions), jumping straight to:
//   preview-done.html        -> finished gift screen
//   preview-processing.html  -> processing screen with simulated stages
const fs = require('fs');
const path = require('path');
const dir = __dirname;
let src = fs.readFileSync(path.join(dir, 'create.html'), 'utf8');

// ── 1. Disable the password gate at the source ──
const gateLine = 'const passed = localStorage.getItem(PWGATE.STORAGE_KEY);';
if (!src.includes(gateLine)) throw new Error('gate line not found, create.html changed');
src = src.replace(gateLine, "const passed = 'true';   // PREVIEW: gate disabled");

// ── 2. Disable the auth auto-init at the source (CRLF-safe) ──
const authRe = /if \(localStorage\.getItem\('songreels_gate_ok'\) === 'true'\) \{\s*initAuth\(\);\s*\}/;
if (!authRe.test(src)) throw new Error('auth init block not found, create.html changed');
src = src.replace(authRe, 'if (false) { initAuth(); }   // PREVIEW: auth disabled');

function override(mode) {
  return `
<script>
/* ---- PREVIEW ONLY (mode: ${mode}) ---- */
window.addEventListener('load', function () {
  try {
    var name = 'Sam';
    try { S.fields = S.fields || {}; S.fields['f-name'] = name; } catch (e) {}

    // reveal the app shell (normally done by initAuth after sign-in)
    var app = document.getElementById('app'); if (app) app.style.display = 'block';

    var pw = document.getElementById('progress-wrap'); if (pw) pw.style.display = 'flex';
    var bf = document.getElementById('bar-fill');
    var pl = document.getElementById('prog-label');

    if ('${mode}' === 'proc') {
      // fake clips so the filmstrip shows (gradient SVG placeholders, offline-safe)
      var pal = [['#FF5E7E','#FF2D55'],['#5AA0FF','#3B6FE0'],['#FFB73D','#FF8A00'],['#FF6B9D','#E84393'],['#8E8BFF','#5856D6'],['#34C759','#1C9E45'],['#3FD0D0','#1FA0C0'],['#FF8A5B','#FF4E6A']];
      S.clips = pal.map(function (c, i) {
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="220">'
          + '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
          + '<stop offset="0" stop-color="' + c[0] + '"/><stop offset="1" stop-color="' + c[1] + '"/></linearGradient></defs>'
          + '<rect width="160" height="220" fill="url(#g)"/>'
          + '<circle cx="' + (30 + i * 12) + '" cy="60" r="22" fill="rgba(255,255,255,.35)"/>'
          + '<rect x="20" y="160" width="120" height="10" rx="5" fill="rgba(255,255,255,.45)"/>'
          + '<rect x="20" y="180" width="80" height="10" rx="5" fill="rgba(255,255,255,.3)"/></svg>';
        return { blobUrl: 'data:image/svg+xml;utf8,' + encodeURIComponent(svg), type: 'image' };
      });

      showScreen('proc');   // triggers procStart: title, filmstrip, ticker, tab title
      setLogLine('ll-upload', 'done', 'Clips and photos saved');
      setLogLine('ll-claude', 'active', 'Watching your moments and writing your story...');
      if (bf) bf.style.width = '93%';
      if (pl) pl.textContent = 'Creating...';

      // simulate the backend advancing through stages
      setTimeout(function () { setLogLine('ll-claude', 'done', 'Script and lyrics ready'); setLogLine('ll-review', 'active', 'Waiting for you to approve...'); }, 14000);
      setTimeout(function () { setLogLine('ll-review', 'done', 'Review complete'); setLogLine('ll-gemini', 'active', 'Matching clips to the right moments...'); }, 24000);
      setTimeout(function () { setLogLine('ll-gemini', 'done', 'Clips matched to lyrics'); setLogLine('ll-suno', 'active', 'Composing your song...'); }, 34000);
      setTimeout(function () { setLogLine('ll-suno', 'done', 'Song composed'); setLogLine('ll-render', 'active', 'Stitching your reel together...'); }, 46000);
      window.scrollTo(0, 0);
      return;
    }

    // ---- done screen ----
    showScreen('done');
    var t = document.getElementById('done-title'); if (t) t.innerHTML = 'Made for <em>' + name + '</em>.';
    var s = document.getElementById('done-sub'); if (s) s.textContent = 'This is exactly what ' + name + ' sees. Preview it on the left, then send the link. No app, no download, the gift just plays.';
    var es = document.getElementById('done-exp-sub'); if (es) es.textContent = 'When ' + name + ' taps your link, this is exactly what happens, instantly.';
    var nt = document.getElementById('np-title'); if (nt) nt.textContent = name + '\\u2019s Song';
    var ni = document.getElementById('np-initial'); if (ni) ni.textContent = name.charAt(0).toUpperCase();
    var u = document.getElementById('done-url'); if (u) u.textContent = 'https://www.songreels.ai/r?id=2185915e-e5eb-426b-8a92-621f';
    var tb = document.querySelector('#done-text-btn .dtb-label'); if (tb) tb.textContent = 'Text the link to ' + name;

    // reveal the clean now-playing poster (skip the loading/error states)
    var ph = document.getElementById('done-video-placeholder'); if (ph) ph.style.display = 'none';
    var cta = document.getElementById('done-video-cta'); if (cta) cta.style.display = 'none';

    try { burstConfetti(); } catch (e) {}
    window.scrollTo(0, 0);
  } catch (e) { console.error('[preview override]', e); }
});
</script>
`;
}

function checkoutOverride() {
  return `
<script>
/* ---- PREVIEW ONLY (mode: checkout) ---- */
window.addEventListener('load', function () {
  try {
    var app = document.getElementById('app'); if (app) app.style.display = 'block';
    var pw = document.getElementById('progress-wrap'); if (pw) pw.style.display = 'flex';
    showScreen('checkout');
    selectPlan('family');
    var st = document.getElementById('ckout-summary-title'); if (st) st.textContent = 'A gift for Sam';
    var ov = document.getElementById('ckout-occasion-val'); if (ov) ov.textContent = 'Birthday';
    if (typeof refreshCreditsBadge === 'function') refreshCreditsBadge(5);   // sample balance
    window.scrollTo(0, 0);
  } catch (e) { console.error('[preview override]', e); }
});
</script>
`;
}

[['done', 'preview-done.html'], ['proc', 'preview-processing.html']].forEach(([mode, file]) => {
  const out = src.replace('</body>', override(mode) + '</body>');
  fs.writeFileSync(path.join(dir, file), out, 'utf8');
  console.log('wrote ' + file + ' (' + out.length + ' bytes)');
});
fs.writeFileSync(path.join(dir, 'preview-checkout.html'), src.replace('</body>', checkoutOverride() + '</body>'), 'utf8');
console.log('wrote preview-checkout.html');
