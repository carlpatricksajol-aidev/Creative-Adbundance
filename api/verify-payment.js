// Called by /create after the buyer returns from Shopify. Confirms a REAL paid order
// exists (recorded by the shopify-webhook function) and claims it single-use, so a
// payment can only unlock one gift. Same-origin (songreels.ai/api/...) — no CORS needed.
//
// Query: ?token=<sr_token>  (preferred)  and/or  ?email=<buyer email>
// Returns: { paid: true, plan, amount, order_number }  |  { paid: false }

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0'); // never cache — retries must re-query live
  const token = ((req.query && req.query.token) || '').toString().trim();
  const email = ((req.query && req.query.email) || '').toString().trim().toLowerCase();
  if (!token && !email) { res.status(400).json({ paid: false, error: 'missing token/email' }); return; }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SR = process.env.SUPABASE_SERVICE_ROLE;
  if (!SUPABASE_URL || !SR) { res.status(500).json({ paid: false, error: 'supabase env missing' }); return; }

  const headers = { apikey: SR, Authorization: `Bearer ${SR}` };

  // Find a paid, unclaimed order — by token first (unguessable), else by email.
  const filter = token
    ? `token=eq.${encodeURIComponent(token)}`
    : `email=eq.${encodeURIComponent(email)}`;
  const url = `${SUPABASE_URL}/rest/v1/paid_orders?${filter}&status=eq.paid&claimed=eq.false&order=created_at.desc&limit=1`;

  let rows;
  try {
    const r = await fetch(url, { headers });
    rows = await r.json();
  } catch (e) {
    res.status(200).json({ paid: false, error: 'lookup failed' });
    return;
  }
  if (!Array.isArray(rows) || rows.length === 0) { res.status(200).json({ paid: false }); return; }

  const row = rows[0];

  // Claim it (single-use). Guard on claimed=false so concurrent calls can't double-claim.
  try {
    const claim = await fetch(
      `${SUPABASE_URL}/rest/v1/paid_orders?id=eq.${row.id}&claimed=eq.false`,
      {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ claimed: true, claimed_at: new Date().toISOString() })
      }
    );
    const updated = await claim.json();
    if (!Array.isArray(updated) || updated.length === 0) { res.status(200).json({ paid: false }); return; }
  } catch (e) {
    res.status(200).json({ paid: false, error: 'claim failed' });
    return;
  }

  res.status(200).json({ paid: true, plan: row.plan, amount: row.amount, order_number: row.order_number });
};
