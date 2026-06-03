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

  // ---- Send the "continue" email INSTANTLY via Resend (bypasses Shopify's slow email) ----
  if (process.env.RESEND_API_KEY && email) {
    const link = 'https://www.songreels.ai/create?paid=1&token=' + encodeURIComponent(token || '') +
                 '&amount=' + encodeURIComponent(amount);
    const from = process.env.RESEND_FROM || 'SongReels <noreply@songreels.ai>';
    const html =
      '<div style="font-family:Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#221019">' +
        '<h2 style="font-size:22px">Payment received — let\'s make your SongReel 🎵</h2>' +
        '<p style="font-size:15px;line-height:1.6">Thanks! Your order is confirmed. Tap below to upload your photos and create your gift.</p>' +
        '<p><a href="' + link + '" style="display:inline-block;margin:16px 0;padding:14px 28px;background:#FF2D55;color:#fff;border-radius:999px;font-weight:700;text-decoration:none;font-size:15px">🎵 Go back &amp; create your SongReel →</a></p>' +
        '<p style="color:#9a8790;font-size:12px;line-height:1.5">If the button doesn\'t work, paste this link:<br>' + link + '</p>' +
      '</div>';
    try {
      const er = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [email], subject: 'Your SongReel is ready to create 🎵', html })
      });
      if (!er.ok) console.error('[shopify-webhook] resend failed', er.status, await er.text());
    } catch (e) {
      console.error('[shopify-webhook] resend error', e);
    }
  }

  // Always 200 so Shopify doesn't retry-storm; errors are logged above.
  res.status(200).json({ ok: true });
};
