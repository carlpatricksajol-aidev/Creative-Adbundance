// ===========================================================================================
// KIE AI render lane — photoreal image generation (nano-banana-pro) driven by the Creative
// Director's concept + the client's REAL product photo (image-to-image). Claude decides the
// concept/copy; KIE makes the picture. Async: createTask -> poll recordInfo -> resultUrls[0].
// KIE result URLs expire ~24h, so the caller downloads + rehosts to Supabase immediately.
// Key lives in .env (KIE_API_KEY) — repo is PUBLIC, never hardcode it.
// ===========================================================================================
'use strict';
const E = process.env;
const KIE_KEY   = E.KIE_API_KEY;
const KIE_MODEL = E.KIE_MODEL || 'nano-banana-pro';   // best text/logo fidelity of the KIE models
const KIE_RES   = E.KIE_RESOLUTION || '2K';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const kieEnabled = () => !!KIE_KEY;

// Generate one image. imageUrls = reference images (product first, logo last), max 8.
// Returns the KIE result URL (temporary). Throws on failure/timeout.
async function kieGenerate({ prompt, imageUrls, aspect }, log = () => {}) {
  if (!KIE_KEY) throw new Error('KIE_API_KEY missing from .env');
  const headers = { Authorization: 'Bearer ' + KIE_KEY, 'Content-Type': 'application/json' };
  const body = {
    model: KIE_MODEL,
    input: {
      prompt: String(prompt || ''),
      image_input: (imageUrls || []).filter(Boolean).slice(0, 8),
      aspect_ratio: aspect || '1:1',
      resolution: KIE_RES,
      output_format: 'png',
    },
  };
  // createTask with rate-limit backoff. KIE returns errors as {code, msg} in the body (HTTP 200):
  //   402 = out of credits (terminal — flag it so the batch stops instead of spamming); 429 = too many
  //   calls (transient — back off and retry). Success is code 200 with data.taskId.
  let taskId = null;
  for (let attempt = 1; attempt <= 5 && !taskId; attempt++) {
    const cr = await fetch('https://api.kie.ai/api/v1/jobs/createTask', { method: 'POST', headers, body: JSON.stringify(body) });
    let cj = {}; try { cj = await cr.json(); } catch (e) {}
    const code = (cj && cj.code != null) ? cj.code : cr.status;
    if (code === 200 && cj.data && cj.data.taskId) { taskId = cj.data.taskId; break; }
    if (code === 402) { const e = new Error('KIE out of credits — top up at kie.ai'); e.outOfCredits = true; throw e; }
    if (code === 429 || code === 503) { await sleep(2000 * attempt); continue; }   // rate-limited → back off and retry
    throw new Error('KIE createTask code ' + code + ' ' + String((cj && cj.msg) || '').slice(0, 140));
  }
  if (!taskId) throw new Error('KIE createTask rate-limited (429) after retries');

  // poll recordInfo until state = success | fail (states: waiting -> queuing -> generating -> success|fail)
  const deadline = Date.now() + 5 * 60 * 1000;   // 5 min hard cap per image
  while (Date.now() < deadline) {
    await sleep(5000);
    let pj;
    try {
      const pr = await fetch('https://api.kie.ai/api/v1/jobs/recordInfo?taskId=' + encodeURIComponent(taskId), { headers });
      if (!pr.ok) continue;
      pj = await pr.json();
    } catch (e) { continue; }
    const d = (pj && pj.data) || {};
    if (d.state === 'success') {
      let rj = null;
      try { rj = d.resultJson ? JSON.parse(d.resultJson) : null; } catch (e) {}
      const url = rj && rj.resultUrls && rj.resultUrls[0];
      if (url) return url;
      throw new Error('KIE success but no resultUrls');
    }
    if (d.state === 'fail') throw new Error('KIE failed: ' + (d.failMsg || d.failCode || 'unknown'));
  }
  throw new Error('KIE timed out after 5m (taskId ' + taskId + ')');
}

module.exports = { kieGenerate, kieEnabled, KIE_MODEL };
