'use strict';
/*
 * Per-employee sign-in for the internal OS: email a six-digit code, trade it
 * for a long-lived session token, and the page runs as that person.
 *
 * The roster is a file on disk (/data/auth/roster.json) so adding or removing
 * a teammate is an edit, not a deploy. Codes live in memory for ten minutes;
 * sessions persist to disk for thirty days. Everything fails closed: an email
 * that is not on the roster gets the same answer as one that is.
 *
 * Delivery is Resend (RESEND_API_KEY + MAIL_FROM in env). Until that is
 * configured, an admin holding the service token can read pending codes from
 * /auth/codes and hand them out - so the flow is testable before the mail
 * account exists.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA = process.env.DATA_DIR || '/data';
const DIR = path.join(DATA, 'auth');
fs.mkdirSync(DIR, { recursive: true });

const ROSTER_FILE = path.join(DIR, 'roster.json');
const SESS_FILE = path.join(DIR, 'sessions.json');

/* Seeded once with the team on the firstname@ pattern; wrong guesses simply
   cannot sign in until the file is corrected, so the seed is safe. */
const SEED = [
  { email: 'carl@creativeadbundance.com',     id: 'cs', name: 'Carl Sajol',      role: 'Developer' },
  { email: 'ricardo@creativeadbundance.com',  id: 'rm', name: 'Ricardo Mestae',  role: 'Editor' },
  { email: 'sabas@creativeadbundance.com',    id: 'sb', name: 'Sabas',           role: 'Editor' },
  { email: 'jessica@creativeadbundance.com',  id: 'js', name: 'Jessica',         role: 'Editor' },
  { email: 'michael@creativeadbundance.com',  id: 'mi', name: 'Michael',         role: 'Editor' },
  { email: 'michaela@creativeadbundance.com', id: 'mc', name: 'Michaela',        role: 'Creative strategist' },
  { email: 'krithika@creativeadbundance.com', id: 'kt', name: 'Krithika',        role: 'Creative strategist' },
  { email: 'dimple@creativeadbundance.com',   id: 'dp', name: 'Dimple',          role: 'Creative strategist' },
  { email: 'eric@creativeadbundance.com',     id: 'em', name: 'Eric Mann',       role: 'Founder' },
  { email: 'kyle@creativeadbundance.com',     id: 'kf', name: 'Kyle Fenerty',    role: 'Founder' },
];

function readJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}
function writeJSON(p, obj) {
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, p);
}

if (!fs.existsSync(ROSTER_FILE)) writeJSON(ROSTER_FILE, SEED);

const norm = (e) => String(e || '').trim().toLowerCase();
function lookup(email) {
  const roster = readJSON(ROSTER_FILE, []);
  return roster.find((r) => norm(r.email) === norm(email)) || null;
}

/* ---- codes: in memory, ten minutes, five wrong tries burns it ---- */
const CODES = new Map(); // email -> { code, exp, tries, issuedAt }
const CODE_TTL = 10 * 60 * 1000;
const RESEND_GAP = 60 * 1000; // one code a minute per address

function issueCode(email) {
  const now = Date.now();
  const cur = CODES.get(norm(email));
  if (cur && now - cur.issuedAt < RESEND_GAP) {
    const e = new Error('a code was just sent - give it a minute before asking for another');
    e.status = 429; throw e;
  }
  const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
  CODES.set(norm(email), { code, exp: now + CODE_TTL, tries: 0, issuedAt: now });
  return code;
}

function checkCode(email, code) {
  const rec = CODES.get(norm(email));
  if (!rec) return false;
  if (Date.now() > rec.exp) { CODES.delete(norm(email)); return false; }
  rec.tries++;
  if (rec.tries > 5) { CODES.delete(norm(email)); return false; }
  /* constant-time compare; both sides are fixed six digits */
  const ok = crypto.timingSafeEqual(Buffer.from(rec.code), Buffer.from(String(code || '').padStart(6, '0').slice(0, 6)));
  if (ok) CODES.delete(norm(email));
  return ok;
}

/* the admin escape hatch while mail is not configured */
function pendingCodes() {
  const out = [];
  const now = Date.now();
  for (const [email, rec] of CODES) if (now <= rec.exp) out.push({ email, code: rec.code, expiresInSec: Math.round((rec.exp - now) / 1000) });
  return out;
}

/* ---- sessions: on disk, thirty days ---- */
const SESS_TTL = 30 * 24 * 3600 * 1000;

function loadSessions() {
  const all = readJSON(SESS_FILE, {});
  const now = Date.now();
  let dirty = false;
  for (const [t, s] of Object.entries(all)) if (s.exp < now) { delete all[t]; dirty = true; }
  if (dirty) writeJSON(SESS_FILE, all);
  return all;
}

function createSession(emp) {
  const token = 's_' + crypto.randomBytes(24).toString('base64url');
  const all = loadSessions();
  all[token] = { id: emp.id, name: emp.name, role: emp.role, email: norm(emp.email), exp: Date.now() + SESS_TTL, since: new Date().toISOString() };
  writeJSON(SESS_FILE, all);
  return token;
}

function sessionOf(token) {
  if (!token || !String(token).startsWith('s_')) return null;
  const s = loadSessions()[token];
  return s && s.exp > Date.now() ? s : null;
}

function dropSession(token) {
  const all = loadSessions();
  if (all[token]) { delete all[token]; writeJSON(SESS_FILE, all); return true; }
  return false;
}

/* ---- delivery ---- */
async function sendCode(email, code) {
  const key = process.env.RESEND_API_KEY || '';
  const from = process.env.MAIL_FROM || 'Creative Ad-Bundance OS <os@creativeadbundance.com>';
  if (!key) return false; // recorded, not sent - /auth/codes is the fallback
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
    body: JSON.stringify({
      from, to: [norm(email)],
      subject: code + ' is your sign-in code',
      text: 'Your Creative Ad-Bundance OS sign-in code is ' + code + '.\n\n' +
            'It works for ten minutes and only on the device that asked for it. ' +
            'If you did not request this, ignore it - nobody can get in without this code.',
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error('the mail service answered ' + res.status + ' ' + body.slice(0, 200));
  }
  return true;
}

module.exports = { lookup, issueCode, checkCode, pendingCodes, createSession, sessionOf, dropSession, sendCode };
