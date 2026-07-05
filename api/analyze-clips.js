// POST /api/analyze-clips
//   Body: { occasion, name, relation, about, clips: [{ description, type, thumb }] }
//     thumb = a small JPEG data URL (or bare base64) — one representative frame per clip,
//     captured on the client (mid-frame of a video / downscaled photo).
//   Returns: { ok:true, source:'gemini', read, questions:[{q, placeholder}] }
//            or { ok:false, fallback:true } when the key is missing or the model errors,
//            so the wizard can show its own occasion-aware questions and never blocks.
//
// This is the interactive "we watched your clips" pass that powers the tailored-questions
// step. It looks at ONE frame per clip (cheap + fast + fits serverless) — the full-video
// highlight analysis still happens later in n8n at generation time.
//
// Env (Vercel): GEMINI_API_KEY  (optional: GEMINI_MODEL, default gemini-2.5-flash)

const OCC_LABELS = {
  'mothers-day': "Mother's Day", 'fathers-day': "Father's Day", 'birthday': 'Birthday',
  'anniversary': 'Anniversary', 'graduation': 'Graduation', 'wedding': 'Wedding',
  'memorial': 'In memory', 'justbecause': 'Just because',
};

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'method not allowed' }); return; }

  // ---- read body ----
  let body = req.body;
  if (!body || typeof body !== 'object') {
    try {
      const chunks = []; for await (const c of req) chunks.push(c);
      body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    } catch (e) { body = {}; }
  }

  const KEY = process.env.GEMINI_API_KEY;
  const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  // No key yet → tell the client to use its built-in fallback questions.
  if (!KEY) { res.status(200).json({ ok: false, fallback: true, reason: 'no-key' }); return; }

  const occasion = OCC_LABELS[body.occasion] || String(body.occasion || 'a special occasion').slice(0, 80);
  const name = String(body.name || 'them').trim().slice(0, 80);
  const relation = String(body.relation || '').trim().slice(0, 80);
  const about = String(body.about || '').trim().slice(0, 600);

  // up to 8 frames, evenly sampled if they uploaded more
  let clips = Array.isArray(body.clips) ? body.clips.filter(c => c && c.thumb) : [];
  if (clips.length > 8) {
    const step = clips.length / 8, sampled = [];
    for (let i = 0; i < 8; i++) sampled.push(clips[Math.floor(i * step)]);
    clips = sampled;
  }
  if (!clips.length) { res.status(200).json({ ok: false, fallback: true, reason: 'no-clips' }); return; }

  const capLines = clips.map((c, i) => `${i + 1}. ${(c.description || '(no caption)').toString().slice(0, 200)} [${c.type === 'image' ? 'photo' : 'video'}]`).join('\n');

  const prompt =
`You help write a personalized, original gift song from someone's own home videos and photos.
Below are still frames from the clips they just uploaded, in order, each with the short caption they wrote.

Occasion: ${occasion}.
The song is for: ${name}${relation ? ' (' + relation + ')' : ''}.
${about ? 'What they told us it is about: "' + about + '".' : ''}

Return JSON with two things:
1) "read": ONE warm, specific sentence (max ~28 words) describing what these clips seem to be about. Mention concrete things you can actually see (who is in them, rough ages, places, activities, the feeling). Speak to the user, like "Looks like ...". Be specific enough that they feel understood.
2) "questions": EXACTLY 3 short questions (each one sentence, genuinely easy to answer) that will make the song more personal and are grounded in what you see, not generic. Do not ask anything already answered by the captions or by what they told us. For each question add a short "placeholder" example answer.

Rules: Never say the clips were analyzed and never mention images, frames, AI, or models. Just talk about their clips and moments as if you watched them. Use plain punctuation, no dashes.

Captions, in order:
${capLines}`;

  const parts = [{ text: prompt }];
  for (const c of clips) {
    const data = String(c.thumb).replace(/^data:[^,]+,/, '');
    if (data) parts.push({ inline_data: { mime_type: 'image/jpeg', data } });
  }

  const reqBody = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.85,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          read: { type: 'STRING' },
          questions: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: { q: { type: 'STRING' }, placeholder: { type: 'STRING' } },
              required: ['q'],
            },
          },
        },
        required: ['read', 'questions'],
      },
    },
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reqBody), signal: ctrl.signal }
    );
    clearTimeout(timer);
    if (!r.ok) {
      console.error('gemini analyze failed', r.status, (await r.text()).slice(0, 300));
      res.status(200).json({ ok: false, fallback: true, reason: 'gemini-' + r.status });
      return;
    }
    const data = await r.json();
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) {
      console.error('gemini analyze parse fail', text.slice(0, 200));
      res.status(200).json({ ok: false, fallback: true, reason: 'parse' });
      return;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      res.status(200).json({ ok: false, fallback: true, reason: 'shape' }); return;
    }
    const read = String(parsed.read || '').trim();
    const questions = (Array.isArray(parsed.questions) ? parsed.questions : [])
      .map(q => ({ q: String(q.q || '').trim(), placeholder: String(q.placeholder || '').trim() }))
      .filter(q => q.q)
      .slice(0, 3);
    if (!read || !questions.length) { res.status(200).json({ ok: false, fallback: true, reason: 'empty' }); return; }
    res.status(200).json({ ok: true, source: 'gemini', read, questions });
  } catch (e) {
    clearTimeout(timer);
    console.error('gemini analyze error', e.message);
    res.status(200).json({ ok: false, fallback: true, reason: 'exception' });
  }
};
