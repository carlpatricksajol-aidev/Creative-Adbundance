// Credits balance API, called by /create.
//   GET  → { email, credits }            (read the signed-in user's balance)
//   POST → { ok, credits }               (consume 1 credit, atomic)
//
// Security: the caller must send the user's Supabase access token as
// `Authorization: Bearer <token>`. We validate it against Supabase and use the
// email FROM the token — never a client-supplied value — so a user can't read
// or spend someone else's credits.

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SR = process.env.SUPABASE_SERVICE_ROLE;
  if (!SUPABASE_URL || !SR) { res.status(500).json({ error: 'supabase env missing' }); return; }

  // --- validate the user's token → email ---
  const authHeader = req.headers.authorization || '';
  const userToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!userToken) { res.status(401).json({ error: 'no token' }); return; }

  let email = '';
  try {
    const ur = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SR, Authorization: 'Bearer ' + userToken }
    });
    if (!ur.ok) { res.status(401).json({ error: 'invalid token' }); return; }
    const u = await ur.json();
    email = (u && u.email ? u.email : '').toLowerCase();
  } catch (e) {
    res.status(401).json({ error: 'auth check failed' }); return;
  }
  if (!email) { res.status(401).json({ error: 'no email on token' }); return; }

  const hdr = { apikey: SR, Authorization: 'Bearer ' + SR, 'Content-Type': 'application/json' };

  // --- GET: read balance ---
  if (req.method === 'GET') {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/user_credits?email=eq.${encodeURIComponent(email)}&select=credits`, { headers: hdr });
      const rows = await r.json();
      const credits = (Array.isArray(rows) && rows.length) ? (rows[0].credits || 0) : 0;
      res.status(200).json({ email, credits });
    } catch (e) {
      res.status(200).json({ email, credits: 0 });
    }
    return;
  }

  // --- POST: consume 1 credit (atomic via RPC) ---
  if (req.method === 'POST') {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/consume_credit`, {
        method: 'POST', headers: hdr, body: JSON.stringify({ p_email: email })
      });
      const out = await r.json(); // new balance, or -1 if none
      if (typeof out === 'number' && out >= 0) res.status(200).json({ ok: true, credits: out });
      else res.status(200).json({ ok: false, credits: 0 });
    } catch (e) {
      res.status(200).json({ ok: false, credits: 0 });
    }
    return;
  }

  res.status(405).json({ error: 'method not allowed' });
};
