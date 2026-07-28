// Static Ads Service — HTTP entrypoint. The intake form (or n8n) POSTs a submission here;
// we accept it immediately (202) and produce the ads in the background, pushing finished ones
// to the Supabase library. Run: `node server.js` (or under pm2). Keys come from .env.
'use strict';
require('dotenv').config();
const express = require('express');
const { produceBatch } = require('./pipeline');

const app = express();
app.use(express.json({ limit: '2mb' }));

const TOKEN = process.env.WEBHOOK_TOKEN || ''; // optional shared secret

app.get('/', (_req, res) => res.json({ ok: true, service: 'static-ads', ts: Date.now() }));

app.post('/generate', (req, res) => {
  // Accept the form/n8n POST. The form nests fields under .body (n8n webhook shape); accept both.
  const body = req.body && req.body.body ? req.body.body : req.body || {};
  if (TOKEN && req.get('x-webhook-token') !== TOKEN) return res.status(401).json({ error: 'bad token' });
  if (!body.client_name) return res.status(400).json({ error: 'client_name required' });

  // Respond right away — generation runs in the background (it can take a few minutes).
  res.status(202).json({ status: 'accepted', client: body.client_name, templates: (body.selected_template_urls || []).length });

  produceBatch(body)
    .then((r) => console.log('OK', r.runId, `${r.shipped}/${r.requested} shipped`))
    .catch((e) => console.error('BATCH ERROR', e && e.stack || e));
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log('static-ads-service listening on :' + PORT));
