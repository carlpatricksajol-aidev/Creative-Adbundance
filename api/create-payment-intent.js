// Creates a Stripe PaymentIntent for the on-site (Payment Element) checkout.
//   POST { plan: 'single' | 'family' | 'memory' }  →  { clientSecret, amount, plan }
//
// Security: amounts are mapped SERVER-side (never trust a client amount), and the
// buyer's email comes from their Supabase access token (same pattern as credits.js)
// so credits always land on the signed-in account — not whatever email gets typed
// into a payment form. The webhook credits from metadata.email on success.
//
// Env vars (Vercel): STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE

const PLAN_AMOUNTS = { single: 999, family: 3999, memory: 6999 };   // cents

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SR = process.env.SUPABASE_SERVICE_ROLE;
  const SK = process.env.STRIPE_SECRET_KEY;
  if (!SUPABASE_URL || !SR || !SK) { res.status(500).json({ error: 'env missing' }); return; }

  // --- validate the user's token → email (same as credits.js) ---
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

  // --- plan → amount (server-side only) ---
  let body = req.body;
  try { if (typeof body === 'string') body = JSON.parse(body); } catch (e) { body = {}; }
  const plan = (body && body.plan) || 'single';
  const amount = PLAN_AMOUNTS[plan];
  if (!amount) { res.status(400).json({ error: 'unknown plan' }); return; }

  // --- create the PaymentIntent (Stripe REST, form-encoded) ---
  const form = new URLSearchParams();
  form.set('amount', String(amount));
  form.set('currency', 'usd');
  form.set('automatic_payment_methods[enabled]', 'true');
  form.set('receipt_email', email);
  form.set('description', 'SongReels · ' + plan + ' plan');
  form.set('metadata[plan]', plan);
  form.set('metadata[email]', email);

  try {
    const pr = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + SK,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: form.toString()
    });
    const pi = await pr.json();
    if (!pr.ok || !pi.client_secret) {
      console.error('[create-payment-intent] stripe error', pr.status, JSON.stringify(pi && pi.error));
      res.status(502).json({ error: 'stripe error' }); return;
    }
    res.status(200).json({ clientSecret: pi.client_secret, amount, plan });
  } catch (e) {
    console.error('[create-payment-intent] failed', e);
    res.status(502).json({ error: 'stripe unreachable' });
  }
};
