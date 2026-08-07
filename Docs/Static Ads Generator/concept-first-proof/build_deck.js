// Build the Trade With The Pros head-to-head deck for Eric.
// Creative Ad·Bundance internal work-product: CA identity (dark, Poppins, purple #6B47FF);
// the client (blue) ads sit inside CA's editorial frame. Self-contained (fonts + images
// embedded as data URIs) so it publishes as an Artifact under a strict CSP.
const fs = require('fs');
const DIR = __dirname;

// ---- embed ONLY the latin Poppins faces ----
const popCss = fs.readFileSync(DIR + '/fonts/pop.css', 'utf8');
const urls = [...new Set(popCss.match(/https:\/\/[^)]*\.woff2/g) || [])].sort();
const urlToFile = new Map(urls.map((u, i) => [u, DIR + '/fonts/pop' + (i + 1) + '.woff2']));
let fontFaces = '';
const blockRe = /\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g;
let m;
while ((m = blockRe.exec(popCss))) {
  if (m[1] !== 'latin') continue;                       // skip latin-ext / devanagari
  let block = m[2];
  const u = (block.match(/https:\/\/[^)]*\.woff2/) || [])[0];
  const f = urlToFile.get(u);
  if (f && fs.existsSync(f)) {
    block = block.replace(u, 'data:font/woff2;base64,' + fs.readFileSync(f).toString('base64'));
    fontFaces += block + '\n';
  }
}

// ---- images -> data URIs ----
const img = (p) => {
  const abs = DIR + '/deck/' + p;
  const ext = p.endsWith('.png') ? 'image/png' : 'image/jpeg';
  return 'data:' + ext + ';base64,' + fs.readFileSync(abs).toString('base64');
};

const PAIRS = [
  { key: 'comparison', title: 'The comparison', sub: 'Us vs the average online course',
    before: 'before_comparison.jpg', after: 'after_01_comparison.png', qa: '7/10',
    delta: 'The strongest current render — and it still prints the headline twice and bolts a generic AI trading-floor photo onto the side. The rebuild says it once, crisply, and every word stays editable.' },
  { key: 'problem', title: 'Problem → solution', sub: 'Why trading alone fails',
    before: 'before_problem-solution.jpg', after: 'after_02_problem-solution.png', qa: '7/10',
    delta: 'Gone: the invented "ASA1" sign on the screen, the clip-art problem icons, the AI crowd nobody believes. In: real vector icons and a solution card that reads in a second.' },
  { key: 'beforeafter', title: 'Before / after', sub: 'The emotional turn',
    before: 'before_before-after.jpg', after: 'after_03_before-after.png', qa: '6/10',
    delta: 'The contrast is written, not staged with two stock-AI office scenes and a headline melted into the pixels.' },
  { key: 'path', title: 'The path', sub: 'How it actually works',
    before: 'before_the-path.jpg', after: 'after_04_the-path.png', qa: '7/10',
    delta: 'Headline once, not twice. Steps are typeset with icons instead of AI photos wearing pasted-on labels. The CTA is brand blue, not an off-brand yellow.' },
  { key: 'hook', title: 'The scroll-stopper', sub: 'One line to stop the thumb',
    before: 'before_hook.jpg', after: 'after_05_hook.png', qa: '7/10',
    delta: 'A real headline built to stop the scroll, instead of a billboard mockup wrapping yet another AI trading-floor scene.' },
];

const FAILURES = [
  ['Invented brand text', 'A screen in the render reads “ASA1” — signage the model made up.'],
  ['The headline, twice', 'Wordmark plus a giant repeat of the same name in the same frame.'],
  ['Text baked into the image', 'Headlines melted into the pixels: soft, and impossible to edit later.'],
  ['Clip-art problem icons', 'Stocky little illustrations that read as a template, not a concept.'],
  ['Off-brand CTA', 'A yellow button on a brand that is blue.'],
  ['Uncanny, repeated faces', 'The same AI “trader” looking slightly different in every scene.'],
];

const LANES = [
  ['Concept', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.7.6 1 1.2 1 2V16h6v-.5c0-.8.3-1.4 1-2A6 6 0 0 0 12 3z"/></svg>',
    'A Claude strategist pass decides the idea for <em>this</em> client — angle, format, headline, visual direction. The template library is a source of inspiration, not the ceiling.'],
  ['Text + logos', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V5h16v2"/><path d="M9 19h6"/><path d="M12 5v14"/></svg>',
    'Rendered deterministically in HTML and CSS. Always crisp, always the real logo, always editable — never touched by an image model.'],
  ['Imagery', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="M21 16l-5-5-8 8"/></svg>',
    'The image model only ever paints a scene — no text, no logos — and it is composited underneath the crisp layer.'],
];

const QA = [
  'One concept, one hook, one visual, one CTA — reads in under two seconds',
  'Headline speaks to <em>this</em> audience’s urgency, not a generic pitch',
  'All text is HTML-rendered and crisp — nothing baked into an image',
  'The logo is real, composited, undistorted — no garbled brand text',
  'Brand fonts and colours are correct, pulled from the Brand Brain',
  'Every claim and number is real — nothing invented',
  'No AI artifacts: no uncanny faces, no garbled UI',
  'Not a near-duplicate of another ad in the set — a distinct concept, not a recolour',
];

const check = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
const cross = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7l10 10M17 7L7 17"/></svg>';

const caMark = `<span class="mono" aria-hidden="true">CA</span>`;

const pairHTML = (p) => `
  <article class="pair reveal">
    <header class="pair-h">
      <h3>${p.title}</h3><span class="pair-sub">${p.sub}</span>
    </header>
    <div class="vs">
      <figure class="side">
        <div class="tag tag-before">${cross}<span>Current generator</span><b>QA ${p.qa}</b></div>
        <div class="shot shot-before"><img src="${img(p.before)}" alt="Current generator render — ${p.title}" loading="lazy"></div>
      </figure>
      <figure class="side">
        <div class="tag tag-after">${check}<span>Concept-first</span><b>rebuilt</b></div>
        <div class="shot shot-after"><img src="${img(p.after)}" alt="Concept-first rebuild — ${p.title}" loading="lazy"></div>
      </figure>
    </div>
    <p class="delta"><span class="delta-k">What changed</span>${p.delta}</p>
  </article>`;

const CSS = `
${fontFaces}
:root{
  --bg:#F5F3FA; --surface:#FFFFFF; --surface-2:#EFEAF8; --ink:#161020; --ink-2:#544B66;
  --line:#E6DFF3; --accent:#6B47FF; --accent-2:#7C5CFF; --accent-soft:rgba(107,71,255,.10);
  --before:#C63A3A; --before-soft:rgba(198,58,58,.10); --good:#0E9B54;
  --shadow:0 18px 50px rgba(22,16,32,.10);
}
@media (prefers-color-scheme:dark){:root{
  --bg:#0C0914; --surface:#151024; --surface-2:#1C1533; --ink:#F2EEFB; --ink-2:#A79BC4;
  --line:#2A2144; --accent:#9A7CFF; --accent-2:#B29BFF; --accent-soft:rgba(154,124,255,.14);
  --before:#F0736D; --before-soft:rgba(240,115,109,.13); --good:#34D07F;
  --shadow:0 24px 60px rgba(0,0,0,.5);
}}
:root[data-theme="light"]{
  --bg:#F5F3FA; --surface:#FFFFFF; --surface-2:#EFEAF8; --ink:#161020; --ink-2:#544B66;
  --line:#E6DFF3; --accent:#6B47FF; --accent-2:#7C5CFF; --accent-soft:rgba(107,71,255,.10);
  --before:#C63A3A; --before-soft:rgba(198,58,58,.10); --good:#0E9B54; --shadow:0 18px 50px rgba(22,16,32,.10);
}
:root[data-theme="dark"]{
  --bg:#0C0914; --surface:#151024; --surface-2:#1C1533; --ink:#F2EEFB; --ink-2:#A79BC4;
  --line:#2A2144; --accent:#9A7CFF; --accent-2:#B29BFF; --accent-soft:rgba(154,124,255,.14);
  --before:#F0736D; --before-soft:rgba(240,115,109,.13); --good:#34D07F; --shadow:0 24px 60px rgba(0,0,0,.5);
}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font-family:'Poppins',system-ui,sans-serif;
  -webkit-font-smoothing:antialiased;line-height:1.6;font-weight:400}
.mono{font-weight:800;letter-spacing:.06em}
.wrap{max-width:1140px;margin:0 auto;padding:0 26px}
a{color:inherit}
em{font-style:normal;color:var(--accent);font-weight:600}

/* top bar */
.bar{display:flex;align-items:center;justify-content:space-between;padding:26px 0;border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:12px;font-weight:700;font-size:16px;letter-spacing:-.01em}
.brand .mk{width:38px;height:38px;border-radius:11px;background:linear-gradient(140deg,var(--accent),var(--accent-2));
  display:flex;align-items:center;justify-content:center;color:#fff;font-size:15px;box-shadow:0 6px 18px var(--accent-soft)}
.bar .meta{font-size:12.5px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-2)}

/* hero */
.hero{padding:74px 0 38px}
.eyebrow{display:inline-flex;align-items:center;gap:9px;font-size:12.5px;font-weight:700;letter-spacing:.16em;
  text-transform:uppercase;color:var(--accent);margin-bottom:22px}
.eyebrow::before{content:"";width:26px;height:2px;background:var(--accent);border-radius:2px}
h1{font-size:clamp(34px,5.4vw,60px);line-height:1.03;font-weight:800;letter-spacing:-.025em;text-wrap:balance;max-width:16ch}
.lead{margin-top:24px;font-size:clamp(17px,2vw,20px);color:var(--ink-2);max-width:60ch;line-height:1.55;font-weight:400}
.legend{display:flex;flex-wrap:wrap;gap:12px;margin-top:34px}
.chip{display:inline-flex;align-items:center;gap:9px;font-size:13.5px;font-weight:600;padding:9px 15px;border-radius:999px;border:1px solid var(--line);background:var(--surface)}
.chip svg{width:15px;height:15px}
.chip.c-before{color:var(--before)}.chip.c-before svg{color:var(--before)}
.chip.c-after{color:var(--accent)}.chip.c-after svg{color:var(--accent)}

/* section shell */
section{padding:40px 0}
.sec-h{display:flex;align-items:baseline;gap:16px;margin-bottom:26px}
.sec-h h2{font-size:clamp(23px,3vw,32px);font-weight:700;letter-spacing:-.02em;text-wrap:balance}
.sec-h .n{font-size:13px;font-weight:700;color:var(--accent);letter-spacing:.1em}
.sec-note{color:var(--ink-2);max-width:62ch;margin:-10px 0 30px;font-size:16px}

/* diagnosis */
.fail-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}
.fail{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:20px 20px 20px 20px;
  border-left:3px solid var(--before)}
.fail .ft{display:flex;align-items:center;gap:10px;font-weight:700;font-size:15.5px;margin-bottom:7px}
.fail .fx{width:22px;height:22px;flex:0 0 22px;border-radius:6px;background:var(--before-soft);color:var(--before);
  display:flex;align-items:center;justify-content:center}
.fail .fx svg{width:14px;height:14px}
.fail p{font-size:14px;color:var(--ink-2);line-height:1.5}
.root{margin-top:22px;padding:22px 24px;border-radius:16px;background:var(--accent-soft);
  border:1px solid var(--line);font-size:16.5px;font-weight:500;line-height:1.55}
.root b{font-weight:700}

/* head to head */
.pairs{display:flex;flex-direction:column;gap:40px}
.pair{background:var(--surface);border:1px solid var(--line);border-radius:22px;padding:24px;box-shadow:var(--shadow)}
.pair-h{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin-bottom:20px}
.pair-h h3{font-size:22px;font-weight:700;letter-spacing:-.01em}
.pair-sub{color:var(--ink-2);font-size:15px;font-weight:500}
.vs{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.side{display:flex;flex-direction:column;gap:12px;min-width:0}
.tag{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;font-weight:600;align-self:flex-start;
  padding:7px 12px;border-radius:999px;border:1px solid var(--line)}
.tag svg{width:14px;height:14px}
.tag b{font-weight:700;opacity:.75;font-size:11.5px;letter-spacing:.04em;margin-left:2px}
.tag-before{color:var(--before);background:var(--before-soft);border-color:transparent}
.tag-after{color:var(--accent);background:var(--accent-soft);border-color:transparent}
.shot{border-radius:14px;overflow:hidden;border:1px solid var(--line);background:#0b0910;line-height:0}
.shot img{width:100%;height:auto;display:block}
.shot-after{background:var(--surface-2)}
.delta{margin-top:20px;font-size:15.5px;line-height:1.6;color:var(--ink);padding-left:16px;border-left:2px solid var(--accent)}
.delta-k{display:block;font-size:11.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin-bottom:5px}

/* approach */
.lanes{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px}
.lane{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:24px}
.lane .li{width:46px;height:46px;border-radius:13px;background:var(--accent-soft);color:var(--accent);
  display:flex;align-items:center;justify-content:center;margin-bottom:16px}
.lane .li svg{width:26px;height:26px}
.lane h4{font-size:18px;font-weight:700;margin-bottom:9px}
.lane p{font-size:14.5px;color:var(--ink-2);line-height:1.55}
.lane p em{color:var(--ink);font-weight:600}

/* qa */
.qa{margin-top:30px;background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:30px 30px}
.qa h4{font-size:16px;font-weight:700;margin-bottom:4px}
.qa .qsub{color:var(--ink-2);font-size:14px;margin-bottom:20px}
.qa ul{list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:13px 26px}
.qa li{display:flex;gap:12px;align-items:flex-start;font-size:14.5px;line-height:1.45;font-weight:500}
.qa .qk{width:22px;height:22px;flex:0 0 22px;border-radius:6px;background:color-mix(in srgb,var(--good) 16%,transparent);
  color:var(--good);display:flex;align-items:center;justify-content:center;margin-top:1px}
.qa .qk svg{width:14px;height:14px}

/* close */
.close{margin:8px 0 0;padding:40px;border-radius:22px;background:linear-gradient(140deg,var(--accent),var(--accent-2));color:#fff;box-shadow:var(--shadow)}
.close h2{font-size:clamp(22px,3vw,30px);font-weight:700;letter-spacing:-.02em;max-width:20ch;text-wrap:balance}
.close p{margin-top:16px;font-size:17px;line-height:1.6;max-width:64ch;opacity:.95;font-weight:400}
.close .stk{display:flex;flex-wrap:wrap;gap:10px;margin-top:24px}
.close .stk span{font-size:13px;font-weight:600;background:rgba(255,255,255,.16);padding:8px 14px;border-radius:999px;backdrop-filter:blur(4px)}

footer{padding:44px 0 60px;color:var(--ink-2);font-size:13px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;border-top:1px solid var(--line);margin-top:44px}

/* reveal */
.reveal{opacity:0;transform:translateY(16px);transition:opacity .6s ease,transform .6s ease}
.reveal.in{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){.reveal{opacity:1;transform:none;transition:none}}

@media (max-width:720px){
  .vs{grid-template-columns:1fr}
  .qa ul{grid-template-columns:1fr}
  .hero{padding:52px 0 30px}
}
`;

const HTML = `<title>Trade With The Pros — concept-first vs the current generator</title>
<style>${CSS}</style>
<div class="bar wrap-full">
  <div class="wrap" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding-left:0;padding-right:0">
    <div class="brand"><span class="mk">${caMark}</span>Creative Ad·Bundance</div>
    <div class="meta">Internal · Static Ads</div>
  </div>
</div>

<div class="wrap">
  <header class="hero">
    <span class="eyebrow">Static Ads Generator · the change</span>
    <h1>Same brand. Same brief. Two ways to make the ad.</h1>
    <p class="lead">Every ad on the left came out of the current generator for Trade With The Pros. Every ad on the right is the same concept, rebuilt the new way — the concept decided first, then the type and logos set by hand in code, and the image model kept away from anything it garbles. Judge it side by side.</p>
    <div class="legend">
      <span class="chip c-before">${cross}Current generator — template + one-shot image model</span>
      <span class="chip c-after">${check}Concept-first — strategy, then a deterministic render</span>
    </div>
  </header>

  <section>
    <div class="sec-h"><span class="n">01</span><h2>Why the current output looks AI-made</h2></div>
    <p class="sec-note">These are not one-off glitches. The same failures repeat across the set, because they all come from the same place.</p>
    <div class="fail-grid">
      ${FAILURES.map(([t, d]) => `<div class="fail"><div class="ft"><span class="fx">${cross}</span>${t}</div><p>${d}</p></div>`).join('')}
    </div>
    <p class="root"><b>The root cause is one thing:</b> the image model is asked to invent the concept, paint the scene, <em>and</em> set the type — all in a single shot. No tool does all three well at once, so the type garbles, the logo warps, and the concept defaults to whatever template was picked.</p>
  </section>

  <section>
    <div class="sec-h"><span class="n">02</span><h2>The five concepts, done both ways</h2></div>
    <p class="sec-note">Each pair is the same idea. Left is what the generator produced today; right is the rebuild.</p>
    <div class="pairs">
      ${PAIRS.map(pairHTML).join('')}
    </div>
  </section>

  <section>
    <div class="sec-h"><span class="n">03</span><h2>The change, in one line</h2></div>
    <p class="sec-note">Split the three jobs the image model was doing badly, and give each to the tool that does it well.</p>
    <div class="lanes">
      ${LANES.map(([t, icon, d]) => `<div class="lane"><div class="li">${icon}</div><h4>${t}</h4><p>${d}</p></div>`).join('')}
    </div>
    <div class="qa">
      <h4>The check before anything ships</h4>
      <p class="qsub">The SongReels-style rigor, written down. Nothing goes out until every line is true.</p>
      <ul>${QA.map((q) => `<li><span class="qk">${check}</span><span>${q}</span></li>`).join('')}</ul>
    </div>
  </section>

  <div class="close reveal">
    <h2>All of this runs in-house.</h2>
    <p>Claude for strategy, copy and the QA pass. A render engine for the crisp layer. An image model for scenes only. There is no external tool to depend on before we can put this in front of clients and sell it.</p>
    <div class="stk"><span>Claude — strategy + copy + QA</span><span>HTML render engine</span><span>Image model — scenes only</span><span>No MaxFusion</span></div>
  </div>

  <footer>
    <span>Creative Ad·Bundance — internal review</span>
    <span>Trade With The Pros · concept-first proof</span>
  </footer>
</div>

<script>
(function(){
  var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{threshold:.12});
  document.querySelectorAll('.reveal').forEach(function(el){io.observe(el);});
})();
</script>`;

fs.writeFileSync(DIR + '/deck.html', HTML);
const kb = Math.round(Buffer.byteLength(HTML) / 1024);
console.log('deck.html written:', kb + 'kb', '| poppins faces:', (fontFaces.match(/@font-face/g) || []).length, '| pairs:', PAIRS.length);
