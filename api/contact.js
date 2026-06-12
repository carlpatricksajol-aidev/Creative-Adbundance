// POST /api/contact  { name, email, message }
//   1. stores the inquiry in Supabase (contact_inquiries) with the service key
//   2. emails it to the team inbox (info@songreels.ai) via Resend, with the
//      sender's address as reply-to so a reply in the inbox goes straight to them.
//
// Safe to deploy before Resend is configured: if RESEND_API_KEY is missing or the
// send fails, the inquiry is still saved and the form still succeeds, the email is
// just skipped (logged). The form never breaks on the visitor's side.

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }

  // ---- read + validate body ----
  let body = req.body;
  if (!body || typeof body !== 'object') {
    try {
      const chunks = []; for await (const c of req) chunks.push(c);
      body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    } catch (e) { body = {}; }
  }
  const name = String(body.name || '').trim().slice(0, 120);
  const email = String(body.email || '').trim().slice(0, 200);
  const message = String(body.message || '').trim().slice(0, 5000);

  if (!name || !message || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    res.status(400).json({ error: 'name, a valid email, and a message are required' });
    return;
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xakngjsybyytldyqfsmi.supabase.co';
  const SR = process.env.SUPABASE_SERVICE_ROLE;

  // ---- 1. store it ----
  let stored = false;
  if (SR) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/contact_inquiries`, {
        method: 'POST',
        headers: { apikey: SR, Authorization: 'Bearer ' + SR, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ name, email, message }),
      });
      stored = r.ok;
      if (!r.ok) console.error('contact insert failed', r.status, (await r.text()).slice(0, 200));
    } catch (e) { console.error('contact insert error', e.message); }
  } else {
    console.error('SUPABASE_SERVICE_ROLE missing, inquiry not stored');
  }

  // ---- 2. email it to the inbox (best effort) ----
  const RESEND = process.env.RESEND_API_KEY;
  const TO = process.env.CONTACT_TO || 'info@songreels.ai';
  const FROM = process.env.CONTACT_FROM || 'SongReels <info@songreels.ai>';
  let emailed = false;
  if (RESEND) {
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    try {
      const er = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM,
          to: [TO],
          reply_to: email,
          subject: `New inquiry from ${name}`,
          text: `From: ${name} <${email}>\n\n${message}`,
          html: `<p style="font-family:Arial,sans-serif;color:#221019"><strong>${esc(name)}</strong> &lt;${esc(email)}&gt; wrote:</p>`
              + `<div style="font-family:Arial,sans-serif;color:#221019;white-space:pre-wrap;line-height:1.5">${esc(message)}</div>`
              + `<p style="font-family:Arial,sans-serif;color:#9a8790;font-size:12px;margin-top:18px">Reply to this email to answer ${esc(name)} directly.</p>`,
        }),
      });
      emailed = er.ok;
      if (!er.ok) console.error('resend failed', er.status, (await er.text()).slice(0, 200));
    } catch (e) { console.error('resend error', e.message); }
  } else {
    console.error('RESEND_API_KEY missing, inquiry stored but not emailed');
  }

  // Success as long as we captured it somewhere (stored OR emailed).
  if (!stored && !emailed) { res.status(500).json({ error: 'could not record inquiry' }); return; }
  res.status(200).json({ ok: true, stored, emailed });
};
