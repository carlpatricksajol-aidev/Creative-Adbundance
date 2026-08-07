// Trade With The Pros - concept-first proof set.
// Same brand + brief that produced the KIE "slop" ads, rebuilt the concept-first way:
// Claude decides the concept, text/logos are rendered DETERMINISTICALLY in HTML (crisp,
// never baked by an image model). 5 distinct concepts, brand-true, DR-clean.
const fs = require('fs');
const cp = require('child_process');
const DIR = __dirname;
const OUT = DIR + '/twtp';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const FONT = JSON.parse(fs.readFileSync(DIR + '/twtp_assets.json', 'utf8')).fontCss;

// ---- brand tokens (derived from their own live ads: blue accent, navy, serif wordmark) ----
const T = {
  navy: '#0A1020', navy2: '#0F1A33', blue: '#2E6BFF', blueD: '#1E4FD6',
  ink: '#0D1220', sub: '#5A6577', line: '#E5EAF3', light: '#F4F7FC', paper: '#FFFFFF',
  green: '#12A150', red: '#E5484D',
};

// ---- tiny, crisp inline line-icons (stroke) - NOT AI cartoons ----
const ic = {
  alone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.4"/><path d="M5.5 20c0-3.6 2.9-6.2 6.5-6.2S18.5 16.4 18.5 20"/></svg>`,
  compass: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M15.6 8.4l-2 5.2-5.2 2 2-5.2z"/></svg>`,
  down: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5v14h16"/><path d="M7 10l4 4 3-3 4 4"/><path d="M18 15v-3h-3"/></svg>`,
  waves: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M3 13c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M3 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/></svg>`,
  building: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V6l8-3v18"/><path d="M12 21V9l6 2.5V21"/><path d="M3 21h18"/><path d="M7 8v0M7 12v0M7 16v0"/></svg>`,
  mentor: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="8.5" cy="8" r="2.6"/><circle cx="16" cy="9" r="2.2"/><path d="M4 19c0-2.8 2-4.6 4.5-4.6S13 16.2 13 19"/><path d="M13.5 18.5c.2-2.2 1.6-3.6 3.5-3.6 2 0 3.4 1.5 3.5 3.9"/></svg>`,
  community: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="2.5"/><circle cx="5.5" cy="10.5" r="2.1"/><circle cx="18.5" cy="10.5" r="2.1"/><path d="M8 20c0-2.3 1.8-4 4-4s4 1.7 4 4"/><path d="M2.5 19c0-1.8 1.3-3.1 3-3.1"/><path d="M21.5 19c0-1.8-1.3-3.1-3-3.1"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>`,
  x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7l10 10M17 7L7 17"/></svg>`,
  arrow: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
};

// wordmark - deterministic, crisp, no garbled AI logo text
const mark = (light) => `
  <div class="mark">
    <span class="mk"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16l4.5-5 3.5 3L20 6"/><path d="M20 10V6h-4"/></svg></span>
    <span class="wm" style="color:${light ? T.ink : '#fff'}">Trade With The <b>Pros</b></span>
  </div>`;

const cta = (solid) => `<span class="cta ${solid ? 'solid' : 'ghost'}">Learn More ${ic.arrow}</span>`;

const base = `
  ${FONT}
  *{margin:0;padding:0;box-sizing:border-box}
  .stage{width:1080px;height:1080px;position:relative;overflow:hidden;font-family:'Manrope',sans-serif;-webkit-font-smoothing:antialiased}
  .serif{font-family:'Playfair Display',serif}
  .mark{position:absolute;top:60px;left:64px;display:flex;align-items:center;gap:14px;z-index:5}
  .mk{width:46px;height:46px;border-radius:12px;background:linear-gradient(135deg,${T.blue},${T.blueD});display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(46,107,255,.35)}
  .mk svg{width:26px;height:26px}
  .wm{font-family:'Playfair Display',serif;font-size:26px;font-weight:700;letter-spacing:.2px}
  .wm b{color:${T.blue};font-weight:800}
  .cta{display:inline-flex;align-items:center;gap:10px;font-weight:800;font-size:24px;letter-spacing:.2px;padding:18px 32px;border-radius:999px}
  .cta svg{width:22px;height:22px}
  .cta.solid{background:${T.blue};color:#fff;box-shadow:0 10px 30px rgba(46,107,255,.4)}
  .cta.ghost{background:transparent;color:${T.blue};border:2px solid ${T.blue}}
  .foot{position:absolute;left:64px;right:64px;bottom:60px;display:flex;align-items:center;justify-content:space-between;z-index:5}
  .tag{font-weight:700;font-size:19px;letter-spacing:.16em;text-transform:uppercase}
`;

// ============================ AD 1 - comparison (dark) ============================
const row = (icon, txt, ok) => `
  <div class="crow ${ok ? 'ok' : 'no'}">
    <span class="ci">${ok ? ic.check : ic.x}</span><span>${txt}</span>
  </div>`;
const ad1 = `<div class="stage" style="background:radial-gradient(120% 90% at 80% -10%, ${T.navy2}, ${T.navy})">
  ${mark(false)}
  <div style="position:absolute;top:150px;left:64px;right:64px">
    <div class="serif" style="color:#fff;font-size:62px;line-height:1.04;font-weight:800">You can watch another<br>trading video. <span style="color:${T.blue}">Or trade<br>in the room with pros.</span></div>
  </div>
  <div style="position:absolute;top:400px;left:64px;right:64px;display:grid;grid-template-columns:1fr 1fr;gap:22px">
    <div class="col dim">
      <div class="ch">Trading courses online</div>
      ${['Watch pre-recorded videos, alone','Theory you never actually execute','No one to correct your mistakes','Progress stalls for years'].map(t=>row(null,t,false)).join('')}
    </div>
    <div class="col hot">
      <div class="ch">Trade With The Pros</div>
      ${['Live training at a local center','Trade real markets beside mentors','Feedback the moment you\'re stuck','A community that keeps you sharp'].map(t=>row(null,t,true)).join('')}
    </div>
  </div>
  <div class="foot"><span class="tag" style="color:#7E8AA6">In-person trading &amp; investing training</span>${cta(true)}</div>
  <style>
    .col{border-radius:22px;padding:30px 28px}
    .col.dim{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09)}
    .col.hot{background:linear-gradient(180deg, rgba(46,107,255,.18), rgba(46,107,255,.05));border:1.5px solid ${T.blue};box-shadow:0 20px 50px rgba(46,107,255,.18)}
    .ch{font-weight:800;font-size:23px;color:#fff;margin-bottom:20px;letter-spacing:.2px}
    .crow{display:flex;align-items:flex-start;gap:14px;padding:15px 0;font-size:22px;line-height:1.3;font-weight:600;border-top:1px solid rgba(255,255,255,.07)}
    .crow .ci{flex:0 0 30px;width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center}
    .crow .ci svg{width:20px;height:20px}
    .crow.no{color:#98A2B8}.crow.no .ci{background:rgba(229,72,77,.14);color:${T.red}}
    .crow.ok{color:#EAF0FF}.crow.ok .ci{background:rgba(18,161,80,.16);color:#3ED17E}
  </style>
</div>`;

// ============================ AD 2 - problem -> solution (light) ============================
const chip = (icon, t) => `<div class="pchip"><span class="pi">${icon}</span><span>${t}</span></div>`;
const ad2 = `<div class="stage" style="background:${T.light}">
  ${mark(true)}
  <div style="position:absolute;top:158px;left:64px;right:64px">
    <div class="serif" style="color:${T.ink};font-size:64px;line-height:1.03;font-weight:800">The problem was never<br>the strategy. <span style="color:${T.blue}">It was<br>trading alone.</span></div>
  </div>
  <div style="position:absolute;top:392px;left:64px;width:470px;display:grid;grid-template-columns:1fr 1fr;gap:16px">
    ${chip(ic.alone,'Isolated, no one to ask')}
    ${chip(ic.compass,'No real plan for the open')}
    ${chip(ic.down,'The same losing habits')}
    ${chip(ic.waves,'Overwhelmed, second-guessing')}
  </div>
  <div style="position:absolute;top:392px;right:64px;width:430px;height:266px;border-radius:24px;background:linear-gradient(160deg,${T.blue},${T.blueD});padding:36px 34px;color:#fff;box-shadow:0 26px 60px rgba(30,79,214,.32)">
    <div style="font-weight:800;font-size:15px;letter-spacing:.18em;text-transform:uppercase;opacity:.8">The fix</div>
    <div class="serif" style="font-size:40px;line-height:1.08;font-weight:800;margin:12px 0 14px">A room, a mentor,<br>and a plan.</div>
    <div style="font-size:20px;line-height:1.45;font-weight:500;opacity:.95">Walk into a local center and trade real markets next to people who already do it well.</div>
  </div>
  <div class="foot"><span class="tag" style="color:${T.sub}">Trade With The Pros</span>${cta(false)}</div>
  <style>
    .pchip{background:${T.paper};border:1px solid ${T.line};border-radius:18px;padding:22px 18px;box-shadow:0 8px 22px rgba(16,24,40,.05);display:flex;flex-direction:column;gap:12px;min-height:120px}
    .pi{width:44px;height:44px;border-radius:12px;background:${T.light};color:${T.blue};display:flex;align-items:center;justify-content:center}
    .pi svg{width:26px;height:26px}
    .pchip span:last-child{font-weight:700;font-size:19px;color:${T.ink};line-height:1.25}
  </style>
</div>`;

// ============================ AD 3 - before / after state (typographic split) ============================
const line3 = (t) => `<div class="l3"><span class="d"></span><span>${t}</span></div>`;
const ad3 = `<div class="stage" style="display:flex">
  <div style="width:50%;height:100%;background:radial-gradient(120% 80% at 20% 0%, #1a2233, #0A1020);padding:150px 52px 0;position:relative">
    <div class="lab" style="color:#8B95AC;border-color:rgba(255,255,255,.16)">Trading alone</div>
    <div class="serif" style="color:#EDEFF5;font-size:44px;line-height:1.1;font-weight:800;margin:22px 0 30px">Guessing<br>at 2 a.m.</div>
    ${['One more setup you\'re not sure about','No one to tell you it\'s a trap','A losing streak you can\'t explain','Motivation running out'].map(line3).join('')}
  </div>
  <div style="width:50%;height:100%;background:linear-gradient(180deg,#F7FAFF,#EAF1FF);padding:150px 52px 0;position:relative">
    <div class="lab" style="color:${T.blueD};border-color:rgba(46,107,255,.35);background:rgba(46,107,255,.08)">With the pros</div>
    <div class="serif" style="color:${T.ink};font-size:44px;line-height:1.1;font-weight:800;margin:22px 0 30px">A mentor<br>two seats down.</div>
    ${['A clear plan before the bell','Someone to check your entries','Real markets, traded live together','A community in the group chat'].map(t=>`<div class="l3 on"><span class="d"></span><span>${t}</span></div>`).join('')}
  </div>
  <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:76px;height:76px;border-radius:50%;background:${T.blue};display:flex;align-items:center;justify-content:center;box-shadow:0 12px 34px rgba(46,107,255,.5);color:#fff;z-index:6">${ic.arrow}</div>
  ${mark(false)}
  <div style="position:absolute;left:52px;bottom:58px;z-index:6">${cta(true)}</div>
  <div style="position:absolute;right:52px;bottom:70px;z-index:6;text-align:right"><span class="tag" style="color:${T.sub}">Trade With The Pros</span></div>
  <style>
    .lab{display:inline-block;font-weight:800;font-size:15px;letter-spacing:.18em;text-transform:uppercase;padding:9px 15px;border-radius:999px;border:1.5px solid}
    .l3{display:flex;gap:14px;align-items:flex-start;padding:11px 0;font-size:21px;line-height:1.3;font-weight:600;color:#A7B0C4}
    .l3 .d{flex:0 0 9px;width:9px;height:9px;border-radius:50%;background:#5A6577;margin-top:8px}
    .l3.on{color:#2A3348}.l3.on .d{background:${T.blue}}
    .stage .mark .wm{color:#fff}
  </style>
</div>`;

// ============================ AD 4 - the path / 3 steps (clean numbered) ============================
const step = (n, icon, t, s) => `
  <div class="step">
    <div class="sn">${n}</div>
    <div class="sic">${icon}</div>
    <div><div class="st">${t}</div><div class="ss">${s}</div></div>
  </div>`;
const ad4 = `<div class="stage" style="background:${T.paper}">
  ${mark(true)}
  <div style="position:absolute;top:160px;left:64px;right:64px">
    <div style="font-weight:800;font-size:16px;letter-spacing:.2em;text-transform:uppercase;color:${T.blue};margin-bottom:16px">How it actually works</div>
    <div class="serif" style="color:${T.ink};font-size:60px;line-height:1.03;font-weight:800">From guessing to a real edge,<br>in person.</div>
  </div>
  <div style="position:absolute;top:400px;left:64px;right:64px;display:flex;flex-direction:column;gap:18px">
    ${step('01', ic.building, 'Walk into a local training center', 'Real classrooms and trading floors near you, not another login.')}
    ${step('02', ic.mentor, 'Trade beside mentors, live', 'Execute real markets with pros who correct you on the spot.')}
    ${step('03', ic.community, 'Grow inside a community', 'A room of traders that keeps you accountable long after day one.')}
  </div>
  <div class="foot"><span class="tag" style="color:${T.sub}">Live, in-person training</span>${cta(true)}</div>
  <style>
    .step{display:flex;align-items:center;gap:26px;background:${T.light};border:1px solid ${T.line};border-radius:20px;padding:26px 30px}
    .sn{font-family:'Playfair Display',serif;font-weight:800;font-size:46px;color:${T.blue};width:70px;flex:0 0 70px}
    .sic{width:58px;height:58px;flex:0 0 58px;border-radius:14px;background:#fff;border:1px solid ${T.line};color:${T.blue};display:flex;align-items:center;justify-content:center}
    .sic svg{width:32px;height:32px}
    .st{font-weight:800;font-size:26px;color:${T.ink}}
    .ss{font-weight:500;font-size:19px;color:${T.sub};margin-top:5px;line-height:1.35}
  </style>
</div>`;

// ============================ AD 5 - big hook (scroll-stopper) ============================
const vchip = (t) => `<span class="vc">${ic.check}${t}</span>`;
const ad5 = `<div class="stage" style="background:radial-gradient(130% 100% at 50% -20%, ${T.navy2}, ${T.navy})">
  ${mark(false)}
  <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:radial-gradient(60% 40% at 50% 42%, rgba(46,107,255,.22), transparent 70%)"></div>
  <div style="position:absolute;top:300px;left:64px;right:64px;text-align:center;z-index:4">
    <div class="serif" style="color:#fff;font-size:118px;line-height:.98;font-weight:900;letter-spacing:-1px">Stop trading<br><span style="color:${T.blue}">alone.</span></div>
    <div style="max-width:720px;margin:30px auto 0;color:#B9C2D6;font-size:26px;line-height:1.45;font-weight:500">Live, in-person trading &amp; investing training, with mentors who trade real markets right beside you.</div>
    <div style="display:flex;gap:14px;justify-content:center;margin-top:34px">${vchip('Local centers')}${vchip('Real mentors')}${vchip('A real community')}</div>
  </div>
  <div style="position:absolute;left:0;right:0;bottom:118px;text-align:center;z-index:4">${cta(true)}</div>
  <div style="position:absolute;left:0;right:0;bottom:58px;text-align:center;z-index:4"><span class="tag" style="color:#6E7A96">Trade With The Pros</span></div>
  <style>
    .vc{display:inline-flex;align-items:center;gap:9px;font-weight:700;font-size:19px;color:#DCE4F5;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);padding:11px 18px;border-radius:999px}
    .vc svg{width:19px;height:19px;color:#3ED17E}
  </style>
</div>`;

const ads = { '01_comparison': ad1, '02_problem-solution': ad2, '03_before-after': ad3, '04_the-path': ad4, '05_hook': ad5 };

// ---- render each with headless Chrome @2x -> 2160px ----
const CH = ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(p=>fs.existsSync(p));
if (!CH) { console.error('Chrome not found'); process.exit(1); }
for (const [name, body] of Object.entries(ads)) {
  const html = `<!doctype html><html><head><meta charset="utf8"><style>${base}</style></head><body>${body}</body></html>`;
  const hp = `${OUT}/${name}.html`, pp = `${OUT}/twtp_${name}.png`;
  fs.writeFileSync(hp, html);
  cp.execFileSync(CH, ['--headless=new','--disable-gpu','--hide-scrollbars','--force-device-scale-factor=2','--window-size=1080,1080',`--screenshot=${pp}`,`file:///${hp}`], { stdio: 'ignore' });
  console.log('rendered', pp, fs.existsSync(pp) ? '(' + Math.round(fs.statSync(pp).size/1024) + 'kb)' : 'FAILED');
}
console.log('done ->', OUT);
