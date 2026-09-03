#!/usr/bin/env node
/*
 * brand-snapshot.js — print a client's brand snapshot from Supabase `brand_brain`
 * as markdown, ready to paste into a Claude Code prompt.
 *
 * No dependencies. Node stdlib only (https).
 *
 *   node brand-snapshot.js "<Brand>"
 *   node brand-snapshot.js "ADR"                 # matches an alias
 *   node brand-snapshot.js --list                # every name you can type
 *   node brand-snapshot.js "<Brand>" > brand.md
 *
 * Why this exists: the per-brand JSON files under
 *   Docs/Static Ads Generator/brand-brain-harvest/
 * are gitignored, so a fresh clone has no brand data. The same data lives in
 * Supabase table `brand_brain`, which is anon-readable, so any strategist with
 * the repo can pull a snapshot without being handed the confidential files.
 *
 * Credentials below are the PUBLISHED anon key, lifted verbatim from
 * static-ads-form/index.html (lines 885-886). Override with env vars
 * SUPABASE_URL / SUPABASE_ANON_KEY if they ever rotate.
 */

'use strict';

const https = require('https');

const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://xakngjsybyytldyqfsmi.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhha25nanN5Ynl5dGxkeXFmc21pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NzAwMjUsImV4cCI6MjA5NDQ0NjAyNX0.Aqm2gv_LUdM4Bo233mNL9AwHmRhwGEEaLGHmNaT-VXk';

const TABLE = 'brand_brain';

/* ── section order for the markdown output ───────────────────────────────
 * Long-form fields, in the order a strategist actually wants to read them.
 * Anything in the row that is not listed here still gets printed, under
 * "Other fields", so a new column added upstream never silently vanishes. */
const SECTIONS = [
  ['creative_brief', 'Creative brief'],
  ['products', 'Products'],
  ['key_offer', 'Key offer'],
  ['product_benefits', 'Product benefits'],
  ['target_personas', 'Target personas'],
  ['core_pain_points', 'Core pain points'],
  ['winning_concepts', 'Winning concepts'],
  ['winning_hooks', 'Winning hooks'],
  ['winning_ads', 'Winning ads'],
  ['losing_patterns', 'Losing patterns'],
  ['brand_tone', 'Brand tone'],
  ['brand_personality', 'Brand personality'],
  ['brand_guidelines', 'Brand guidelines'],
  ['dos_and_donts', "Do's and don'ts"],
  ['creative_boundaries', 'Creative boundaries'],
  ['competitors', 'Competitors'],
  ['compliance_notes', 'Compliance notes'],
  ['compliance_disclaimer', 'Compliance disclaimer'],
  ['disclaimer_text', 'Disclaimer text'],
  ['notes', 'Notes'],
  ['sources_read', 'Sources read'],
];

/* Identity / metadata columns rendered in the header table, not as sections. */
const META = new Set([
  'id',
  'brand_name',
  'client_name',
  'aliases',
  'industry',
  'website',
  'status',
  'confidence',
  'updated_at',
  'primary_color_hex',
  'secondary_color_hex',
  'accent_color_hex',
  'brand_fonts',
  'logo_urls',
]);

/* ── helpers ─────────────────────────────────────────────────────────── */

function get(path) {
  const url = new URL(path, SUPABASE_URL);
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'GET',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          Accept: 'application/json',
        },
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            return reject(
              new Error(`Supabase HTTP ${res.statusCode}: ${body.slice(0, 300)}`)
            );
          }
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error(`bad JSON from Supabase: ${e.message}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('Supabase request timed out')));
    req.end();
  });
}

/* Fold to a comparable key: lowercase, strip diacritics (so "pushpül" matches
 * a typed "pushpul"), drop apostrophes entirely (so "Mulberry's" == "Mulberrys")
 * and collapse all other punctuation (®, ™, •, dots, dashes) to single spaces. */
const norm = (s) =>
  String(s == null ? '' : s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')        // combining accents: ü -> u
    .toLowerCase()
    .replace(/[‘’']/g, '')        // curly + straight apostrophes
    .replace(/[^a-z0-9]+/g, ' ')            // punctuation, ®, ™, bullets, dots
    .trim();

const isBlank = (v) =>
  v == null ||
  (typeof v === 'string' && v.trim() === '') ||
  (Array.isArray(v) && v.length === 0);

/* `aliases` is a pipe-delimited STRING, not an array, and the framing is
 * inconsistent: most rows look like "|ADR|Accredited|" but a few omit the
 * outer pipes. Split and drop the empties either way. */
function aliasList(row) {
  return String(row.aliases || '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
}

/* `logo_urls` is a jsonb array whose elements are objects shaped {url: "..."},
 * not bare strings. Accept either, so a plain-string row would still render. */
function logoUrls(row) {
  const raw = row.logo_urls;
  if (isBlank(raw)) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr
    .map((x) => {
      if (!x) return '';
      if (typeof x === 'string') return x.trim();
      return String(x.url || x.href || x.src || '').trim();
    })
    .filter(Boolean);
}

/* Levenshtein, for near-miss suggestions when nothing matches. */
function lev(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

/* Similarity 0..1 that rewards substring hits, so "collagen" still surfaces
 * "Beyond Collagen" even though the edit distance is large. */
function score(query, candidate) {
  const q = norm(query);
  const c = norm(candidate);
  if (!q || !c) return 0;
  if (q === c) return 1;
  if (c.includes(q) || q.includes(c)) {
    return 0.9 - Math.abs(c.length - q.length) / (Math.max(c.length, q.length) * 10);
  }
  const qt = new Set(q.split(' '));
  const ct = new Set(c.split(' '));
  const shared = [...qt].filter((t) => ct.has(t)).length;
  const tokenScore = shared ? (2 * shared) / (qt.size + ct.size) : 0;
  const distScore = 1 - lev(q, c) / Math.max(q.length, c.length);
  return Math.max(tokenScore * 0.85, distScore);
}

/* ── matching ────────────────────────────────────────────────────────────
 * Tiered on purpose. Some strings legitimately belong to several rows:
 * "Centerfield" is its own brand AND an alias of four Centerfield-owned
 * properties; "GIR" is a brand AND an alias of Pattern Brands; "Scale" is a
 * brand AND the client_name of Live Conscious. An exact brand_name hit must
 * therefore beat an alias hit rather than reporting an ambiguity.
 *   tier 1: exact brand_name
 *   tier 2: exact client_name
 *   tier 3: exact alias
 * Ties only within a tier are a real ambiguity and get reported. */
function match(rows, query) {
  const q = norm(query);
  const tiers = [
    rows.filter((r) => norm(r.brand_name) === q),
    rows.filter((r) => norm(r.client_name) === q),
    rows.filter((r) => aliasList(r).some((a) => norm(a) === q)),
  ];
  for (const [i, hits] of tiers.entries()) {
    if (hits.length === 1) return { row: hits[0], tier: i + 1 };
    if (hits.length > 1) return { ambiguous: hits, tier: i + 1 };
  }
  return null;
}

function nearMisses(rows, query, n = 8) {
  const scored = [];
  for (const r of rows) {
    let best = 0;
    let via = '';
    const cands = [
      [r.brand_name, 'brand_name'],
      [r.client_name, 'client_name'],
      ...aliasList(r).map((a) => [a, 'alias']),
    ];
    for (const [name, src] of cands) {
      if (!name) continue;
      const s = score(query, name);
      if (s > best) {
        best = s;
        via = src === 'brand_name' ? '' : ` (matched ${src} "${name}")`;
      }
    }
    scored.push({ name: r.brand_name, s: best, via });
  }
  const ranked = scored.filter((x) => x.s > 0.34).sort((a, b) => b.s - a.s);
  if (!ranked.length) return [];
  // Only keep suggestions in the same league as the best hit, otherwise a
  // one-word query drags in every brand that shares a couple of letters.
  const cutoff = Math.max(0.34, ranked[0].s * 0.78);
  return ranked.filter((x) => x.s >= cutoff).slice(0, n);
}

/* ── rendering ───────────────────────────────────────────────────────── */

function render(row) {
  const out = [];
  const P = (s = '') => out.push(s);

  P(`# Brand snapshot: ${row.brand_name}`);
  P();

  const meta = [];
  const push = (k, v) => {
    if (!isBlank(v)) meta.push([k, String(v).replace(/\s*\n\s*/g, ' ').trim()]);
  };
  if (
    !isBlank(row.client_name) &&
    norm(row.client_name) !== norm(row.brand_name)
  ) {
    push('Client', row.client_name);
  }
  push('Industry', row.industry);
  push('Website', row.website);
  const al = aliasList(row);
  if (al.length) push('Also known as', al.join(', '));
  push('Record status', row.status);
  push('Data confidence', row.confidence);
  push('Last updated', row.updated_at);
  push('Source', `Supabase ${TABLE} row id ${row.id}`);

  if (meta.length) {
    P('| Field | Value |');
    P('| --- | --- |');
    for (const [k, v] of meta) P(`| ${k} | ${v.replace(/\|/g, '\\|')} |`);
    P();
  }

  // Visual identity
  const vis = [];
  for (const [k, label] of [
    ['primary_color_hex', 'Primary'],
    ['secondary_color_hex', 'Secondary'],
    ['accent_color_hex', 'Accent'],
  ]) {
    if (!isBlank(row[k])) vis.push(`${label} \`${row[k]}\``);
  }
  if (vis.length || !isBlank(row.brand_fonts) || !isBlank(row.logo_urls)) {
    P('## Visual identity');
    P();
    if (vis.length) {
      P(`Colors: ${vis.join('  ·  ')}`);
      P();
    }
    if (!isBlank(row.brand_fonts)) {
      P('Fonts:');
      P();
      P(block(row.brand_fonts));
      P();
    }
    const logos = logoUrls(row);
    if (logos.length) {
      P('Logos:');
      for (const u of logos) P(`- ${u}`);
      P();
    }
  }

  // Long-form sections
  for (const [key, label] of SECTIONS) {
    if (isBlank(row[key])) continue;
    P(`## ${label}`);
    P();
    P(block(row[key]));
    P();
  }

  // Anything unexpected the DB grew since this script was written
  const known = new Set([...SECTIONS.map(([k]) => k), ...META]);
  const extras = Object.keys(row).filter((k) => !known.has(k) && !isBlank(row[k]));
  if (extras.length) {
    P('## Other fields');
    P();
    for (const k of extras) {
      P(`**${k}**`);
      P();
      P(block(row[k]));
      P();
    }
  }

  const missing = SECTIONS.filter(([k]) => k in row && isBlank(row[k])).map(
    ([, l]) => l
  );
  if (missing.length) {
    P('---');
    P();
    P(`_Empty in this record (do not invent): ${missing.join(', ')}._`);
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}

/* Normalize a field into readable markdown. These columns are free text that
 * often already contains bullets or JSON, so keep it verbatim, just tidy the
 * line endings and unwrap a JSON array if that is what it turns out to be. */
function block(v) {
  if (Array.isArray(v)) return v.map((x) => `- ${x}`).join('\n');
  let s = String(v).replace(/\r\n?/g, '\n').trim();
  if (/^\[/.test(s)) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) {
        return arr
          .map((x) => `- ${typeof x === 'string' ? x : JSON.stringify(x)}`)
          .join('\n');
      }
    } catch (_) {
      /* not JSON, fall through */
    }
  }
  return s;
}

/* ── main ────────────────────────────────────────────────────────────── */

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const wantList = args.some((a) => a === '--list' || a === '-l');
  const query = args.filter((a) => !a.startsWith('-')).join(' ').trim();

  if (!wantList && !query) {
    console.error(
      'usage: node brand-snapshot.js "<client or brand name>"\n' +
        '       node brand-snapshot.js --list     # show every name you can type'
    );
    process.exit(2);
  }

  if (wantList) {
    const rows = await get(
      `/rest/v1/${TABLE}?select=brand_name,client_name,aliases&order=brand_name.asc`
    );
    console.log(`${rows.length} brands in ${TABLE}:\n`);
    for (const r of rows) {
      const extra = [];
      if (
        r.client_name &&
        norm(r.client_name) !== norm(r.brand_name)
      ) {
        extra.push(`client: ${r.client_name}`);
      }
      const al = aliasList(r);
      if (al.length) extra.push(`aka: ${al.join(', ')}`);
      console.log(
        `  ${r.brand_name}${extra.length ? `\n      ${extra.join('\n      ')}` : ''}`
      );
    }
    return;
  }

  // Names-only fetch first: cheap, and lets us resolve ambiguity before
  // pulling ~28KB of snapshot text.
  const names = await get(
    `/rest/v1/${TABLE}?select=id,brand_name,client_name,aliases&order=brand_name.asc`
  );

  const m = match(names, query);

  if (!m) {
    console.error(`No brand in ${TABLE} matches "${query}".`);
    const near = nearMisses(names, query);
    if (near.length) {
      console.error('\nDid you mean:');
      for (const n of near) console.error(`  ${n.name}${n.via}`);
    } else {
      console.error(`\nNothing close. Run with --list to see all ${names.length} names.`);
    }
    console.error('\nMatching is case-insensitive on brand_name, client_name and aliases.');
    process.exit(1);
  }

  if (m.ambiguous) {
    const where = ['brand_name', 'client_name', 'alias'][m.tier - 1];
    console.error(
      `"${query}" is ambiguous: it matches the ${where} of ${m.ambiguous.length} rows.`
    );
    console.error('\nBe more specific. Type one of these exactly:');
    for (const r of m.ambiguous) console.error(`  ${r.brand_name}`);
    process.exit(1);
  }

  const full = await get(
    `/rest/v1/${TABLE}?select=*&id=eq.${encodeURIComponent(m.row.id)}&limit=1`
  );
  if (!full.length) {
    console.error(`Row id ${m.row.id} vanished between lookups. Retry.`);
    process.exit(1);
  }

  if (m.tier > 1 || norm(m.row.brand_name) !== norm(query)) {
    const where = ['brand_name', 'client_name', 'alias'][m.tier - 1];
    console.error(`(matched "${query}" on ${where} -> ${m.row.brand_name})`);
  }

  process.stdout.write(render(full[0]));
}

main().catch((e) => {
  console.error(`error: ${e.message}`);
  process.exit(1);
});
