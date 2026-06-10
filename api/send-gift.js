// Send the finished SongReel as a text (the done screen's "Send by text").
//   POST /api/send-gift  { job_id, to }   with the creator's Supabase token in Authorization.
//
// Security: we validate the caller's token and confirm they OWN that reel, so the
// endpoint cannot be used to blast texts to arbitrary numbers on someone else's reel.
// Dormant until Twilio env vars are set (returns sms_not_enabled), so it is safe to ship.
//
// Env vars needed to switch it on (Vercel project settings):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE   (already set)
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM   (the owner adds these)

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'method not allowed' }); return; }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SR = process.env.SUPABASE_SERVICE_ROLE;
  const SID = process.env.TWILIO_ACCOUNT_SID, TOK = process.env.TWILIO_AUTH_TOKEN, FROM = process.env.TWILIO_FROM;
  if (!SUPABASE_URL || !SR) { res.status(500).json({ ok: false, error: 'supabase env missing' }); return; }
  if (!SID || !TOK || !FROM) { res.status(503).json({ ok: false, error: 'sms_not_enabled' }); return; }

  // --- who is calling (must be signed in) ---
  const userToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!userToken) { res.status(401).json({ ok: false, error: 'no token' }); return; }
  let uid = '';
  try {
    const ur = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SR, Authorization: 'Bearer ' + userToken } });
    if (!ur.ok) { res.status(401).json({ ok: false, error: 'invalid token' }); return; }
    const u = await ur.json();
    uid = (u && u.id) || '';
  } catch (e) { res.status(401).json({ ok: false, error: 'auth check failed' }); return; }
  if (!uid) { res.status(401).json({ ok: false, error: 'no user' }); return; }

  // --- inputs ---
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const jobId = ((body && body.job_id) || '').toString().trim();
  let to = ((body && body.to) || '').toString().trim().replace(/[^\d+]/g, '');
  if (!/^[0-9a-fA-F-]{20,40}$/.test(jobId)) { res.status(400).json({ ok: false, error: 'bad job id' }); return; }
  if (to.replace(/\D/g, '').length < 7) { res.status(400).json({ ok: false, error: 'That number looks too short.' }); return; }

  // normalize to E.164 (Twilio requires it). A bare 10-digit number defaults to US (+1).
  if (to[0] !== '+') {
    const digits = to.replace(/\D/g, '');
    if (digits.length === 10) to = '+1' + digits;
    else if (digits.length === 11 && digits[0] === '1') to = '+' + digits;
    else to = '+' + digits;
  }

  const hdr = { apikey: SR, Authorization: 'Bearer ' + SR };
  try {
    // --- fetch the reel, confirm ownership + that it is ready ---
    const r = await fetch(`${SUPABASE_URL}/rest/v1/heartreel_jobs?id=eq.${encodeURIComponent(jobId)}&select=status,user_id,final_video_url,form_data`, { headers: hdr });
    const rows = await r.json();
    const job = Array.isArray(rows) && rows[0];
    if (!job) { res.status(404).json({ ok: false, error: 'not found' }); return; }
    if (job.user_id !== uid) { res.status(403).json({ ok: false, error: 'not your reel' }); return; }
    if (job.status !== 'complete' || !job.final_video_url) { res.status(409).json({ ok: false, error: 'Your reel is not ready yet.' }); return; }

    const fd = job.form_data || {};
    const name = (fd['f-name'] || '').trim();
    const link = 'https://www.songreels.ai/r?id=' + jobId;
    const text = (name ? `A little something for ${name} 🎶 ` : 'A little something for you 🎶 ') + link;

    // --- send via Twilio ---
    const params = new URLSearchParams({ To: to, From: FROM, Body: text });
    const tw = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(SID + ':' + TOK).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const out = await tw.json();
    if (tw.ok) { res.status(200).json({ ok: true }); }
    else { res.status(502).json({ ok: false, error: (out && out.message) || 'Could not send the text.' }); }
  } catch (e) {
    res.status(500).json({ ok: false, error: 'send failed' });
  }
};
