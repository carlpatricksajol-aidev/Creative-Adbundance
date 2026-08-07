// Render the agent-produced template-faithful reconstructions to 2160px PNGs.
// Reads rebuilds.json = [{templateKey, html_body, css_extra}], wraps each stage in the
// shared base CSS (fonts + tokens + wordmark + cta), renders with headless Chrome.
const fs = require('fs');
const cp = require('child_process');
const DIR = __dirname;
const OUT = DIR + '/rebuilds';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const FONT = JSON.parse(fs.readFileSync(DIR + '/twtp_assets.json', 'utf8')).fontCss;

const BASE = `
:root{
  --blue:#2E6BFF; --blueD:#1E4FD6; --navy:#0A1020; --navy2:#0F1A33; --ink:#0D1220;
  --sub:#5A6577; --line:#E5EAF3; --light:#F4F7FC; --paper:#FFFFFF;
  --green:#12A150; --red:#E5484D; --yellow:#F3E85C;
}
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:#000}
.stage{width:1080px;height:1080px;position:relative;overflow:hidden;
  font-family:'Manrope',system-ui,sans-serif;-webkit-font-smoothing:antialiased;color:var(--ink)}
.serif{font-family:'Playfair Display',serif}
.wm-lock{display:inline-flex;align-items:center;gap:12px}
.wm-lock .mk{width:44px;height:44px;flex:0 0 44px;border-radius:12px;
  background:linear-gradient(135deg,var(--blue),var(--blueD));display:flex;align-items:center;justify-content:center;
  box-shadow:0 6px 18px rgba(46,107,255,.35)}
.wm-lock .mk svg{width:26px;height:26px}
.wm-lock .wm{font-family:'Playfair Display',serif;font-size:26px;font-weight:700;letter-spacing:.2px;color:#fff}
.wm-lock .wm b{color:var(--blue);font-weight:800}
.cta{display:inline-flex;align-items:center;gap:10px;font-family:'Manrope',sans-serif;font-weight:800;
  font-size:23px;letter-spacing:.2px;padding:16px 30px;border-radius:999px;white-space:nowrap}
.cta.solid{background:var(--blue);color:#fff;box-shadow:0 10px 30px rgba(46,107,255,.4)}
.cta.ghost{background:transparent;color:var(--blue);border:2px solid var(--blue)}
`;

const rebuilds = JSON.parse(fs.readFileSync(DIR + '/rebuilds.json', 'utf8'));
const CH = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(p => fs.existsSync(p));

for (const r of rebuilds) {
  const html = `<!doctype html><html><head><meta charset="utf8"><style>${FONT}${BASE}${r.css_extra || ''}</style></head><body>${r.html_body}</body></html>`;
  const hp = `${OUT}/${r.templateKey}.html`, pp = `${OUT}/rebuild_${r.templateKey}.png`;
  fs.writeFileSync(hp, html);
  try {
    cp.execFileSync(CH, ['--headless=new', '--disable-gpu', '--no-sandbox', '--user-data-dir=' + DIR + '/.chrome-r',
      '--hide-scrollbars', '--force-device-scale-factor=2', '--window-size=1080,1080',
      '--screenshot=' + pp, 'file:///' + hp], { stdio: 'ignore' });
    console.log('rendered', 'rebuild_' + r.templateKey + '.png', fs.existsSync(pp) ? Math.round(fs.statSync(pp).size / 1024) + 'kb' : 'FAILED');
  } catch (e) { console.log('ERR', r.templateKey, String(e.message || e).slice(0, 120)); }
}
console.log('done ->', OUT);
