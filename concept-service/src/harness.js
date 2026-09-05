'use strict';
/*
 * The harness: checks the CODE enforces, not prose the model reads.
 *
 * Carl's ruling after Batches 6 to 10: every rule bolted onto the prompt bent
 * the ideation, because a loud recent instruction competes with the skill. So
 * format, compliance and diversity live here, as deterministic lints over the
 * Creative Director's output. A failing concept goes back to the CD with the
 * exact error (the skill's own loop: reviewers judge, the CD rewrites), never
 * to a reviewer that rewrites it, and never as a new paragraph in the prompt.
 *
 * Client-specific limits (duration band, locale, banned words) come from the
 * client's brief record, so a PackDraw rule never reaches another client.
 */

const { canonNum } = require('./num');

const CLIENT_FIELDS = ['title', 'logline', 'desc', 'hooks', 'narrative', 'design'];

/* Notes to the account team have no place on a client-facing card. */
const INTERNAL_NOTE = /\[[^\]]*\]|\binsert (the|an?|current|account|exact|live)\b|\bconfirm(ed)? (with|by) the\b|\bTBD\b|wording to confirm|account[- ]team|\bre-?verify\b|before (publishing|build)|legal sign[- ]?off|\bplaceholder\b/i;

/* Platform disclaimers are applied at build from the client's stored text.
   Written into a concept they eat a design slot and repeat across the deck. */
const BOILERPLATE = /\b18\+|responsible[- ]play|eligibility varies|do not spend more than|afford to lose|\bno (odds|probability)\b|probability (meter|display)|multiplier control|persistent (18|lower)/i;

/* US English for US clients. The model drifts British without a locale. */
const BRITISH = /\b(mates?|programme|whilst|colours?|coloured|favourite|bloke|quid|telly|rubbish|tidied|fortnight|mum|cheers)\b/i;

/* Numbers a concept cannot have made up: ratings, review counts, third-party
   domains, and any figure of three digits, a percent or a price that does not
   appear in the brand snapshot. */
const RATING = /\b\d(\.\d)?\s*(\/|out of)\s*5\b|\b(\d[\d,]*)\s*reviews?\b|trustpilot/i;
const DOMAIN = /\b[a-z0-9-]+\.(gg|com|io|co|net|org|app)\b/gi;
const FIGURE = /\$\s?\d[\d,]*(\.\d+)?|\b\d[\d,]*(\.\d+)?\s?%|\b\d{3,}[\d,]*\b/g;

/* Sound-off identity of a messaging screen. More than one per batch and the
   producer starts stacking. */
const MESSAGING_UI = /\bgroup chat|chat thread|text thread|text (message|reply)|imessage|whatsapp|\bdms?\b|message thread|messaging (ui|screen|app)|screenshots? of (a|the) (chat|thread|texts?)/i;

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const normBullet = (s) => norm(s).slice(0, 80);

function clientText(c) {
  const parts = [];
  for (const f of CLIENT_FIELDS) {
    const v = c[f];
    if (Array.isArray(v)) parts.push(...v.map(String));
    else if (v != null) parts.push(String(v));
  }
  return parts;
}

function parseSeconds(dur) {
  const s = String(dur || '');
  const m = s.match(/(\d{1,3})\s*(s\b|sec|second)/i) || s.match(/(\d{1,3})/);
  return m ? Number(m[1]) : null;
}

/* Everything the lints compare against, built once per run. */
function context({ brief, snapshot, library }) {
  const snapText = norm(snapshot);
  /* figures present in the snapshot, commas stripped, so "1,400" and "1400" agree */
  const snapFigures = new Set((String(snapshot || '').match(FIGURE) || []).map((x) => x.replace(/[\s,]/g, '')));
  const snapDomains = new Set((String(snapshot || '').match(DOMAIN) || []).map((x) => x.toLowerCase()));
  /* normalized bullet -> set of concept keys that already used it */
  const bullets = new Map();
  const families = new Map();
  for (const { batchId, concept: c } of library || []) {
    const key = batchId + ':' + canonNum(c.num);
    for (const b of [...(c.narrative || []), ...(c.design || [])]) {
      const k = normBullet(b);
      if (k.length < 20) continue;
      if (!bullets.has(k)) bullets.set(k, new Set());
      bullets.get(k).add(key);
    }
    const fam = norm(c.insight_family);
    if (fam) families.set(fam, (families.get(fam) || 0) + 1);
  }
  const banned = (brief && Array.isArray(brief.banned) ? brief.banned : [])
    .map((w) => String(w).trim()).filter(Boolean)
    .map((w) => new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+') + '\\b', 'i'));
  return { brief: brief || {}, snapText, snapFigures, snapDomains, bullets, families, banned };
}

function lintConcept(c, ctx) {
  const issues = [];
  const add = (code, field, detail) => issues.push({ code, field, detail });
  const texts = clientText(c);

  for (const f of ['title', 'logline', 'desc', 'objective', 'persona', 'selling_argument', 'vehicle']) {
    if (!String(c[f] || '').trim()) add('missing_field', f, `${f} is empty`);
  }
  const hooks = Array.isArray(c.hooks) ? c.hooks.map((h) => norm(h)) : [];
  if (hooks.length !== 3) add('hooks', 'hooks', `${hooks.length} hooks, the slide needs exactly 3`);
  else if (new Set(hooks).size < 3) add('hooks', 'hooks', 'two hooks are the same sentence');

  const b = ctx.brief;
  const secs = parseSeconds(c.dur);
  if (secs == null) add('duration', 'dur', `no duration in seconds could be read from "${c.dur}"`);
  else {
    if (b.duration_min && secs < b.duration_min) add('duration', 'dur', `${secs}s is under this client's minimum of ${b.duration_min}s`);
    if (b.duration_max && secs > b.duration_max) add('duration', 'dur', `${secs}s is over this client's maximum of ${b.duration_max}s`);
  }

  texts.forEach((t) => {
    const m = t.match(INTERNAL_NOTE);
    if (m) add('internal_note', 'copy', `a note to the team is on the client-facing card: "${m[0]}" in "${t.slice(0, 90)}"`);
  });
  for (const f of ['desc', 'narrative', 'design']) {
    const v = c[f]; const arr = Array.isArray(v) ? v : [v];
    for (const t of arr) {
      const m = String(t || '').match(BOILERPLATE);
      if (m) add('boilerplate', f, `platform disclaimer wording belongs in the batch production notes, not the concept: "${m[0]}" in "${String(t).slice(0, 90)}"`);
    }
  }
  if (String(b.locale || '').toLowerCase() === 'en-us') {
    texts.forEach((t) => {
      const m = t.match(BRITISH);
      if (m) add('locale', 'copy', `British register for a US audience: "${m[0]}" in "${t.slice(0, 90)}"`);
    });
  }
  for (const re of ctx.banned) {
    texts.forEach((t) => {
      const m = t.match(re);
      if (m) add('banned_term', 'copy', `"${m[0]}" is on this client's banned list for paid creative, in "${t.slice(0, 90)}"`);
    });
  }
  texts.forEach((t) => {
    const r = t.match(RATING);
    if (r) add('ungrounded', 'copy', `a rating or review count on the card: "${r[0]}" in "${t.slice(0, 90)}"`);
    for (const d of t.match(DOMAIN) || []) {
      if (!ctx.snapDomains.has(d.toLowerCase())) add('ungrounded', 'copy', `a third-party source cited on the card: "${d}"`);
    }
    for (const fig of t.match(FIGURE) || []) {
      const k = fig.replace(/[\s,]/g, '');
      if (/^\d+$/.test(k) && Number(k) <= 60) continue;           // small counts and durations
      if (!ctx.snapFigures.has(k)) add('ungrounded', 'copy', `a figure not in the brand snapshot: "${fig}" in "${t.slice(0, 90)}"`);
    }
  });

  for (const f of ['narrative', 'design']) {
    for (const t of c[f] || []) {
      const k = normBullet(t);
      if (k.length < 20) continue;
      const seen = ctx.bullets.get(k);
      if (seen && seen.size >= 2) add('repeated_bullet', f, `this line already appears in ${seen.size} earlier concepts for this client: "${String(t).slice(0, 90)}"`);
    }
  }
  return issues;
}

/* Batch-level caps. Returns a Map num -> issues[]. */
function lintBatch(concepts, ctx) {
  const out = new Map();
  const add = (c, code, detail) => {
    const k = canonNum(c.num);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push({ code, field: 'batch', detail });
  };
  const score = (c) => (Number(c.thumb_stop) || 0) + (Number(c.performance_ready) || 0);

  const msg = concepts.filter((c) => MESSAGING_UI.test([c.vehicle, c.desc, c.visual_family].join(' ')));
  if (msg.length > 1) {
    const keep = msg.slice().sort((a, b) => score(b) - score(a))[0];
    for (const c of msg) if (c !== keep) add(c, 'messaging_ui_cap', `a second concept whose visual is a messaging screen; "${keep.title}" already holds that identity in this batch. Pick a different sound-off visual.`);
  }

  const seen = new Map();
  for (const c of concepts) {
    const fam = norm(c.insight_family);
    if (!fam) continue;
    const prior = ctx.families.get(fam) || 0;
    const inBatch = (seen.get(fam) || 0) + 1;
    seen.set(fam, inBatch);
    if (prior + inBatch > 2) add(c, 'family_cap', `insight family "${c.insight_family}" already has ${prior} concept(s) in this client's library and ${inBatch - 1} in this batch; the cap is 2. Take a different family.`);
  }
  return out;
}

/* One line per issue the CD can act on. */
function describe(issues) {
  return issues.map((i) => `- [${i.code}] ${i.detail}`).join('\n');
}

module.exports = { context, lintConcept, lintBatch, describe, parseSeconds };
