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
/* The branded card, Carl-approved 2026-09-02. Tables and inline styles so it
   holds in Gmail and Outlook; the wordmark is rebuilt in HTML because mail
   clients block remote images and a blocked logo would gut the branding. */
function codeEmailHtml(code) {
  return `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F4F2FB">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F2FB;padding:40px 16px">
<tr><td align="center">
  <table role="presentation" width="440" cellpadding="0" cellspacing="0"
    style="max-width:440px;width:100%;background:#FFFFFF;border:1px solid #E3DEF7;border-radius:22px;overflow:hidden">
    <tr><td style="background:#6B47FF;padding:30px 36px 28px">
      <div style="font:600 24px/1.25 'Poppins',Arial,sans-serif;color:#FFFFFF;letter-spacing:.2px">
        Creative<br>Ad<span style="font-size:15px;vertical-align:2px">&#9656;</span>Bundance</div>
    </td></tr>
    <tr><td style="padding:28px 36px 0;font-family:'Poppins',Arial,sans-serif">
      <div style="font-size:17px;font-weight:600;color:#1F1F1F">Here is your sign-in code</div>
      <div style="font-size:13.5px;line-height:1.6;color:#5F6368;padding-top:6px">
        Go back to the sign-in screen and type this code in.</div>
    </td></tr>
    <tr><td style="padding:20px 36px 0">
      <div style="background:#F3F0FF;border:1px solid #DCD2FF;border-radius:14px;padding:22px;
        text-align:center;font:700 34px/1 'Courier New',ui-monospace,monospace;letter-spacing:12px;
        color:#6B47FF;text-indent:12px">${code}</div>
      <div style="font-family:'Poppins',Arial,sans-serif;font-size:12px;color:#80868B;text-align:center;padding-top:10px">
        This code stops working in 10 minutes</div>
    </td></tr>
    <tr><td style="padding:24px 36px 30px;font-family:'Poppins',Arial,sans-serif">
      <div style="border-top:1px solid #EFEDF7;padding-top:16px;font-size:12px;line-height:1.7;color:#80868B">
        Keep this code to yourself &mdash; it is your key into the studio.
        If you did not try to sign in, you can safely ignore this email:
        nobody can get in without the code.</div>
    </td></tr>
  </table>
  <table role="presentation" width="440" cellpadding="0" cellspacing="0" style="max-width:440px;width:100%">
    <tr><td style="padding:18px 12px;text-align:center;font-family:'Poppins',Arial,sans-serif;
      font-size:11px;color:#9AA0A6;line-height:1.6">
      You received this because this address was entered on the
      Creative Ad&bull;Bundance OS sign-in screen.</td></tr>
  </table>
</td></tr></table></body></html>`;
}

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
      html: codeEmailHtml(code),
      text: 'Here is your Creative Ad-Bundance OS sign-in code: ' + code + '. ' +
            'Go back to the sign-in screen and type it in. It stops working in 10 minutes. ' +
            'Keep this code to yourself. If you did not try to sign in, ignore this email - ' +
            'nobody can get in without the code.'
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    /* The one that actually bites: Resend's shared onboarding@resend.dev only
       delivers to the account owner, so every teammate silently gets nothing
       until a real domain is verified. Recognise it by name so the message a
       person sees can say what to do instead of "mail is broken". */
    const domainUnverified = res.status === 403 && /only send testing emails|verify a domain/i.test(body);
    const err = new Error(domainUnverified
      ? 'the sending domain is not verified yet, so the mail service will only deliver to the account owner'
      : 'the mail service answered ' + res.status + ' ' + body.slice(0, 200));
    err.code = domainUnverified ? 'DOMAIN_UNVERIFIED' : 'MAIL_FAILED';
    err.status = res.status;
    throw err;
  }
  return true;
}

module.exports = { lookup, issueCode, checkCode, pendingCodes, createSession, sessionOf, dropSession, sendCode };
