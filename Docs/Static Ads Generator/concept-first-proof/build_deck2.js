// "Anchored to the template" comparison deck: original library template -> faithful TWTP rebuild.
// CA identity (dark, Poppins, purple). Self-contained for Artifact publishing.
const fs = require('fs');
const DIR = __dirname;

// ---- latin Poppins only ----
const popCss = fs.readFileSync(DIR + '/fonts/pop.css', 'utf8');
const urls = [...new Set(popCss.match(/https:\/\/[^)]*\.woff2/g) || [])].sort();
const map = new Map(urls.map((u, i) => [u, DIR + '/fonts/pop' + (i + 1) + '.woff2']));
let fontFaces = '';
const re = /\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g; let m;
while ((m = re.exec(popCss))) {
  if (m[1] !== 'latin') continue;
  let b = m[2]; const u = (b.match(/https:\/\/[^)]*\.woff2/) || [])[0]; const f = map.get(u);
  if (f && fs.existsSync(f)) { fontFaces += b.replace(u, 'data:font/woff2;base64,' + fs.readFileSync(f).toString('base64')) + '\n'; }
}
const img = (p) => 'data:' + (p.endsWith('.png') ? 'image/png' : 'image/jpeg') + ';base64,' + fs.readFileSync(DIR + '/deck2/' + p).toString('base64');

const PAIRS = [
  { key: 'beforeafter', name: 'Before / after phones', src: 'Fitness coach comparison — “$200 vs $50/mo programming”',
    kept: 'The dark question banner, the Before / After labels, and the two diagonally-overlapping phones — an amateur artifact beside a professional one.',
    reskin: 'The messy solo trade log vs a clean Trade With The Pros plan. Same device, new brand.' },
  { key: 'bigquestion', name: 'Big centered question', src: 'Legal firm — Morgan & Morgan “birth injury?”',
    kept: 'The deep-blue field, the hanging “mobile” up top, the giant centered condensed question, the subhead, the two-logo lockup bar, and the fine print.',
    reskin: 'The nursery mobile became dangling candlesticks; the co-brand lockup became Trade With The Pros + In-Person Centers.' },
  { key: 'notes', name: 'iOS Notes testimonial', src: 'App testimonial — the native Notes screenshot',
    kept: 'The iOS Notes chrome, the single yellow-highlighted line, a small artifact lower-left, and the hand-drawn red “This”.',
    reskin: 'A trader’s testimonial — and the photo became a clean P&L card, so no AI image is ever needed.' },
  { key: 'vsthem', name: 'Us vs. them checklist', src: 'Razors — Harry’s “getting ripped off?”',
    kept: 'The feature checklist with two columns, the value row with its curved arrow, the two-colour “are you…” headline, and two labelled cards.',
    reskin: 'Razors became online-course-vs-in-person; the brand’s orange became Trade With The Pros blue.' },
];

const pairHTML = (p) => `
  <article class="pair reveal">
    <header class="ph">
      <h3>${p.name}</h3><span class="src">${p.src}</span>
    </header>
    <div class="duo">
      <figure class="col">
        <div class="lab lab-o"><span class="dot"></span>The template<b>from the library</b></div>
        <div class="frame"><img src="${img('orig_' + p.key + '.jpg')}" alt="Original template — ${p.name}" loading="lazy"></div>
      </figure>
      <div class="arrow" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></div>
      <figure class="col">
        <div class="lab lab-n"><span class="dot"></span>The rebuild<b>Trade With The Pros</b></div>
        <div class="frame frame-n"><img src="${img('new_' + p.key + '.png')}" alt="Rebuild — ${p.name}" loading="lazy"></div>
      </figure>
    </div>
    <p class="keep"><span class="k">Kept</span>${p.kept}</p>
    <p class="keep reskin"><span class="k">Reskinned</span>${p.reskin}</p>
  </article>`;

const CSS = `
${fontFaces}
:root{ --bg:#F5F3FA; --surface:#FFFFFF; --surface-2:#EFEAF8; --ink:#161020; --ink-2:#544B66;
  --line:#E6DFF3; --accent:#6B47FF; --accent-2:#7C5CFF; --accent-soft:rgba(107,71,255,.10);
  --tmpl:#8A8296; --frame:#0C0914; --shadow:0 18px 50px rgba(22,16,32,.10); }
@media (prefers-color-scheme:dark){:root{ --bg:#0C0914; --surface:#151024; --surface-2:#1C1533; --ink:#F2EEFB; --ink-2:#A79BC4;
  --line:#2A2144; --accent:#9A7CFF; --accent-2:#B29BFF; --accent-soft:rgba(154,124,255,.14); --tmpl:#8E85A8; --frame:#07050E; --shadow:0 24px 60px rgba(0,0,0,.5); }}
:root[data-theme="light"]{ --bg:#F5F3FA; --surface:#FFFFFF; --surface-2:#EFEAF8; --ink:#161020; --ink-2:#544B66; --line:#E6DFF3; --accent:#6B47FF; --accent-2:#7C5CFF; --accent-soft:rgba(107,71,255,.10); --tmpl:#8A8296; --frame:#0C0914; --shadow:0 18px 50px rgba(22,16,32,.10); }
:root[data-theme="dark"]{ --bg:#0C0914; --surface:#151024; --surface-2:#1C1533; --ink:#F2EEFB; --ink-2:#A79BC4; --line:#2A2144; --accent:#9A7CFF; --accent-2:#B29BFF; --accent-soft:rgba(154,124,255,.14); --tmpl:#8E85A8; --frame:#07050E; --shadow:0 24px 60px rgba(0,0,0,.5); }
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font-family:'Poppins',system-ui,sans-serif;-webkit-font-smoothing:antialiased;line-height:1.6}
.wrap{max-width:1180px;margin:0 auto;padding:0 26px}
em{font-style:normal;color:var(--accent);font-weight:600}
.bar{display:flex;align-items:center;justify-content:space-between;padding:26px 0;border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:12px;font-weight:700;font-size:16px;letter-spacing:-.01em}
.brand .mk{width:38px;height:38px;border-radius:11px;background:linear-gradient(140deg,var(--accent),var(--accent-2));display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:15px;letter-spacing:.04em}
.bar .meta{font-size:12.5px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-2)}
.hero{padding:70px 0 40px}
.eyebrow{display:inline-flex;align-items:center;gap:9px;font-size:12.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);margin-bottom:22px}
.eyebrow::before{content:"";width:26px;height:2px;background:var(--accent);border-radius:2px}
h1{font-size:clamp(33px,5vw,56px);line-height:1.04;font-weight:800;letter-spacing:-.025em;text-wrap:balance;max-width:18ch}
.lead{margin-top:24px;font-size:clamp(16px,1.9vw,19px);color:var(--ink-2);max-width:64ch;line-height:1.6}
.lead b{color:var(--ink);font-weight:600}
.note{margin-top:20px;font-size:15px;color:var(--ink-2);max-width:64ch;padding:16px 20px;background:var(--accent-soft);border-radius:14px;border:1px solid var(--line)}
.pairs{display:flex;flex-direction:column;gap:34px;padding:20px 0 10px}
.pair{background:var(--surface);border:1px solid var(--line);border-radius:22px;padding:26px;box-shadow:var(--shadow)}
.ph{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin-bottom:20px}
.ph h3{font-size:21px;font-weight:700;letter-spacing:-.01em}
.src{color:var(--ink-2);font-size:14.5px;font-weight:500}
.duo{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:18px}
.col{display:flex;flex-direction:column;gap:12px;min-width:0}
.lab{display:inline-flex;align-items:center;gap:9px;font-size:13px;font-weight:700;align-self:flex-start}
.lab b{font-weight:500;color:var(--ink-2);font-size:12.5px;margin-left:2px}
.lab .dot{width:9px;height:9px;border-radius:50%}
.lab-o{color:var(--tmpl)}.lab-o .dot{background:var(--tmpl)}
.lab-n{color:var(--accent)}.lab-n .dot{background:var(--accent)}
.frame{aspect-ratio:1/1;display:grid;place-items:center;background:var(--frame);border:1px solid var(--line);border-radius:16px;overflow:hidden}
.frame-n{background:var(--surface-2)}
.frame img{max-width:100%;max-height:100%;display:block}
.arrow{color:var(--accent);opacity:.7}.arrow svg{width:30px;height:30px}
.keep{margin-top:18px;font-size:15px;line-height:1.55;color:var(--ink);display:flex;gap:12px;align-items:baseline}
.keep .k{flex:0 0 84px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--accent)}
.keep.reskin{margin-top:8px}.keep.reskin .k{color:var(--tmpl)}
.close{margin:16px 0 0;padding:38px;border-radius:22px;background:linear-gradient(140deg,var(--accent),var(--accent-2));color:#fff;box-shadow:var(--shadow)}
.close h2{font-size:clamp(21px,3vw,29px);font-weight:700;letter-spacing:-.02em;max-width:24ch;text-wrap:balance}
.close p{margin-top:14px;font-size:16.5px;line-height:1.6;max-width:66ch;opacity:.95}
footer{padding:44px 0 60px;color:var(--ink-2);font-size:13px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;border-top:1px solid var(--line);margin-top:44px}
.reveal{opacity:0;transform:translateY(16px);transition:opacity .6s ease,transform .6s ease}
.reveal.in{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){.reveal{opacity:1;transform:none;transition:none}}
@media (max-width:760px){ .duo{grid-template-columns:1fr;gap:12px} .arrow{transform:rotate(90deg);justify-self:center} .hero{padding:50px 0 30px} }
`;

const HTML = `<title>Anchored to the template — Trade With The Pros rebuilds</title>
<style>${CSS}</style>
<div class="bar"><div class="wrap" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:0">
  <div class="brand"><span class="mk">CA</span>Creative Ad·Bundance</div>
  <div class="meta">Internal · Static Ads</div>
</div></div>
<div class="wrap">
  <header class="hero">
    <span class="eyebrow">Static Ads Generator · using the library</span>
    <h1>The template is the blueprint. The rebuild follows it.</h1>
    <p class="lead">The 972-template library isn’t a mood board we glance at and ignore. <b>Each template is a proven composition.</b> So the rebuild reconstructs the chosen template’s skeleton faithfully — the same zones, the same device, the same reading order — and only then renders it crisply in the brand’s own voice. Not a pixel-for-pixel copy. Not a fresh invention. <em>The same ad, wearing Trade With The Pros.</em></p>
    <p class="note">Left is the real template, pulled straight from the library. Right is the rebuild. You should be able to tell, instantly, which template each one came from.</p>
  </header>
  <div class="pairs">${PAIRS.map(pairHTML).join('')}</div>
  <div class="close reveal">
    <h2>That’s the library doing its job.</h2>
    <p>The template decides the structure; the render finally executes it cleanly instead of letting an image model garble the type and the logo. Every pair here was checked by an independent pass that scored one thing: can you still tell which template this is? All four passed.</p>
  </div>
  <footer><span>Creative Ad·Bundance — internal review</span><span>Trade With The Pros · template-faithful rebuilds</span></footer>
</div>
<script>
(function(){var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{threshold:.1});document.querySelectorAll('.reveal').forEach(function(el){io.observe(el);});})();
</script>`;

fs.writeFileSync(DIR + '/deck2.html', HTML);
console.log('deck2.html', Math.round(Buffer.byteLength(HTML) / 1024) + 'kb', '| pairs', PAIRS.length, '| poppins', (fontFaces.match(/@font-face/g) || []).length);
