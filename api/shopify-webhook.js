// Shopify "Order payment / Order creation" webhook → records the paid order in Supabase.
// Protected by a shared secret in the URL (?key=...) since Vercel parses the body
// (raw-body HMAC isn't reliably available on plain @vercel/node functions).
//
// Env vars (set in Vercel → Project → Settings → Environment Variables):
//   SUPABASE_URL            e.g. https://xakngjsybyytldyqfsmi.supabase.co
//   SUPABASE_SERVICE_ROLE   the (rotated) service_role key  — server-only, never in the repo
//   SHOPIFY_WEBHOOK_KEY     a long random secret you choose; must match the ?key= in the webhook URL

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method Not Allowed' }); return; }

  // --- auth: shared secret in the URL ---
  const key = (req.query && req.query.key) || '';
  if (!process.env.SHOPIFY_WEBHOOK_KEY || key !== process.env.SHOPIFY_WEBHOOK_KEY) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  // --- read the order (Vercel parses JSON bodies into req.body) ---
  let order = req.body;
  try { if (typeof order === 'string') order = JSON.parse(order); } catch (e) { order = null; }
  if (!order || !order.id) { res.status(400).json({ error: 'no order' }); return; }

  // pull our claim token out of the cart attributes / note_attributes (if present)
  const attrs = {};
  (order.note_attributes || []).forEach(a => { if (a && a.name) attrs[a.name] = a.value; });
  const token  = attrs.sr_token || null;
  const amount = parseFloat(order.total_price || order.current_total_price || '0') || 0;
  const email  = order.email || order.contact_email || (order.customer && order.customer.email) || null;
  const plan   = amount >= 69 ? 'memory' : amount >= 39 ? 'family' : 'single';

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SR = process.env.SUPABASE_SERVICE_ROLE;
  if (!SUPABASE_URL || !SR) { res.status(500).json({ error: 'supabase env missing' }); return; }

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/paid_orders?on_conflict=order_id`, {
      method: 'POST',
      headers: {
        apikey: SR,
        Authorization: `Bearer ${SR}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({
        order_id: order.id,
        order_number: order.order_number || order.name || null,
        email,
        amount,
        plan,
        token,
        status: 'paid'
      })
    });
    if (!r.ok) {
      const t = await r.text();
      console.error('[shopify-webhook] supabase insert failed', r.status, t);
    }
  } catch (e) {
    console.error('[shopify-webhook] error', e);
  }

  // Always 200 so Shopify doesn't retry-storm; errors are logged above.
  res.status(200).json({ ok: true });
};
