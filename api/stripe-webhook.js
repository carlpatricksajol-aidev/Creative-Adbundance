// Stripe webhook → tops up credits when a payment completes.
// Handles BOTH `checkout.session.completed` (legacy Payment Links) and
// `payment_intent.succeeded` (on-site Payment Element checkout) — subscribe to
// both events on the Stripe dashboard webhook endpoint.
// Protected by a shared secret in the URL (?key=…). Instead of raw-body signature
// verification, we re-fetch the object from Stripe with the secret key — that's
// authoritative proof it's really paid, and avoids Vercel raw-body hassles.
//
// Env vars (Vercel): STRIPE_SECRET_KEY (sk_…), STRIPE_WEBHOOK_KEY (your URL secret),
//                    SUPABASE_URL, SUPABASE_SERVICE_ROLE

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }

  const key = (req.query && req.query.key) || '';
  if (!process.env.STRIPE_WEBHOOK_KEY || key !== process.env.STRIPE_WEBHOOK_KEY) {
    res.status(401).json({ error: 'unauthorized' }); return;
  }

  let event = req.body;
  try { if (typeof event === 'string') event = JSON.parse(event); } catch (e) { event = null; }
  const isSession = event && event.type === 'checkout.session.completed';        // Payment Links (legacy fallback)
  const isIntent  = event && event.type === 'payment_intent.succeeded';         // on-site Payment Element checkout
  if (!isSession && !isIntent) { res.status(200).json({ ignored: true }); return; }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SR = process.env.SUPABASE_SERVICE_ROLE;
  const SK = process.env.STRIPE_SECRET_KEY;
  if (!SUPABASE_URL || !SR || !SK) { res.status(500).json({ error: 'env missing' }); return; }

  const objId = event.data && event.data.object && event.data.object.id;
  if (!objId) { res.status(400).json({ error: 'no object id' }); return; }

  // --- confirm with Stripe directly that it's paid (don't trust the payload) ---
  let email = '', amount = 0, plan = '';
  if (isSession) {
    let session;
    try {
      const sr = await fetch('https://api.stripe.com/v1/checkout/sessions/' + encodeURIComponent(objId), {
        headers: { Authorization: 'Bearer ' + SK }
      });
      session = await sr.json();
    } catch (e) {
      console.error('[stripe-webhook] session fetch failed', e);
      res.status(200).json({ ok: false }); return;
    }
    if (!session || session.payment_status !== 'paid') {
      res.status(200).json({ ok: false, status: session && session.payment_status }); return;
    }
    email = ((session.customer_details && session.customer_details.email) || session.customer_email || '').toLowerCase();
    amount = (session.amount_total || 0) / 100;
  } else {
    let pi;
    try {
      const pr = await fetch('https://api.stripe.com/v1/payment_intents/' + encodeURIComponent(objId), {
        headers: { Authorization: 'Bearer ' + SK }
      });
      pi = await pr.json();
    } catch (e) {
      console.error('[stripe-webhook] intent fetch failed', e);
      res.status(200).json({ ok: false }); return;
    }
    if (!pi || pi.status !== 'succeeded') {
      res.status(200).json({ ok: false, status: pi && pi.status }); return;
    }
    // metadata.email was set server-side from the signed-in user's token at intent
    // creation — credits go to the account that bought, not a typed-in email.
    email = ((pi.metadata && pi.metadata.email) || pi.receipt_email || '').toLowerCase();
    amount = (pi.amount_received || pi.amount || 0) / 100;
    plan = (pi.metadata && pi.metadata.plan) || '';
  }
  if (!plan) plan = amount >= 69 ? 'memory' : amount >= 39 ? 'family' : 'single';
  if (!email) { res.status(200).json({ ok: false, error: 'no email' }); return; }

  const hdr = { apikey: SR, Authorization: 'Bearer ' + SR, 'Content-Type': 'application/json' };

  // --- record idempotently (provider_ref = Stripe session/intent id) → credit only if NEW ---
  let inserted = [];
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/paid_orders?on_conflict=provider_ref`, {
      method: 'POST',
      headers: { ...hdr, Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify({ provider_ref: objId, order_number: objId, email, amount, plan, status: 'paid' })
    });
    inserted = await r.json();
    if (!r.ok) console.error('[stripe-webhook] insert failed', r.status, JSON.stringify(inserted));
  } catch (e) {
    console.error('[stripe-webhook] insert error', e);
  }

  if (Array.isArray(inserted) && inserted.length > 0) {
    const PLAN_CREDITS = { single: 1, family: 5, memory: 10 };
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/add_credits`, {
        method: 'POST', headers: hdr,
        body: JSON.stringify({ p_email: email, p_amount: PLAN_CREDITS[plan] || 1 })
      });
    } catch (e) {
      console.error('[stripe-webhook] add_credits failed', e);
    }
  }

  res.status(200).json({ ok: true });
};
