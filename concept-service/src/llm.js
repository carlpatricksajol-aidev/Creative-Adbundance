'use strict';
/*
 * One place that talks to the model, through OpenRouter. Carl's call: the
 * OPENROUTER_API_KEY already lives on this box powering static-ads, so the
 * concept generator rides the same account instead of waiting on a second key.
 *
 * Verified against the live API before this was written:
 *   - `response_format: json_schema` returns clean JSON for anthropic/* models
 *   - `cache_control` on the system block passes through to Anthropic's prompt
 *     caching, which matters here because every stage re-sends the same ~40KB
 *     of craft rules
 *   - usage.cost comes back per call, so a run can report what it spent
 *
 * Streaming, because the Creative Director pass runs long enough to trip HTTP
 * timeouts otherwise.
 */

const MODEL = process.env.CONCEPT_MODEL || 'anthropic/claude-opus-5';
const API = 'https://openrouter.ai/api/v1/chat/completions';

function keyOrThrow() {
  const k = process.env.OPENROUTER_API_KEY;
  if (!k) {
    const e = new Error('OPENROUTER_API_KEY is not set on this host, so no run can start.');
    e.code = 'NO_API_KEY';
    throw e;
  }
  return k;
}

/* Pull the first JSON object out of a response that may have prose or fences
   around it. Only used on the fallback path; the schema path returns bare JSON. */
function extractJSON(text) {
  const t = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(t); } catch {}
  const start = t.indexOf('{');
  if (start < 0) throw new Error('no JSON object in response: ' + t.slice(0, 200));
  let depth = 0;
  for (let i = start; i < t.length; i++) {
    if (t[i] === '{') depth++;
    else if (t[i] === '}' && --depth === 0) return JSON.parse(t.slice(start, i + 1));
  }
  throw new Error('unterminated JSON object in response: ' + t.slice(0, 200));
}

function checkRequired(obj, schema) {
  for (const k of (schema && schema.required) || []) {
    if (obj[k] === undefined) throw new Error(`response is missing required field "${k}"`);
  }
  return obj;
}

async function stream(body) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer ' + keyOrThrow(),
      'http-referer': 'https://adbundance-os-client-view.vercel.app',
      'x-title': 'Abundance Ecosystem concept generator',
    },
    body: JSON.stringify({ ...body, stream: true, usage: { include: true } }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const e = new Error(`openrouter ${res.status}: ${detail.slice(0, 500)}`);
    e.status = res.status;
    throw e;
  }

  let out = '';
  let finish = null;
  let usage = null;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;   // OpenRouter keepalive comments start with ':'
      const raw = line.slice(5).trim();
      if (!raw || raw === '[DONE]') continue;
      let ev;
      try { ev = JSON.parse(raw); } catch { continue; }
      if (ev.error) throw new Error('openrouter stream error: ' + JSON.stringify(ev.error).slice(0, 400));
      const ch = ev.choices && ev.choices[0];
      if (ch) {
        if (ch.delta && ch.delta.content) out += ch.delta.content;
        if (ch.finish_reason) finish = ch.finish_reason;
      }
      if (ev.usage) usage = ev.usage;
    }
  }
  if (finish === 'length') throw new Error('hit max_tokens before finishing; raise maxTokens for this stage');
  return { text: out.trim(), usage };
}

/*
 * Same signature the pipeline has always called. Two attempts:
 *   1. response_format json_schema + prompt caching (the verified fast path)
 *   2. schema written into the prompt, plain messages — for any provider quirk
 *      the first path hits
 */
async function ask({ system, prompt, schema, maxTokens = 32000 }) {
  const strictBody = {
    model: MODEL,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] },
      { role: 'user', content: prompt },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'stage_output', strict: true, schema },
    },
  };

  try {
    const { text, usage } = await stream(strictBody);
    const obj = checkRequired(JSON.parse(text), schema);
    obj.__usage = usage;
    return obj;
  } catch (err) {
    if (err.code === 'NO_API_KEY') throw err;
    console.warn('[llm] strict path failed (%s), retrying with schema-in-prompt', err.message.slice(0, 160));
  }

  const loose = {
    model: MODEL,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      {
        role: 'user',
        content: prompt +
          '\n\nReturn ONLY a JSON object, no prose and no code fences, matching exactly this JSON Schema:\n' +
          JSON.stringify(schema),
      },
    ],
  };
  const { text, usage } = await stream(loose);
  const obj = checkRequired(extractJSON(text), schema);
  obj.__usage = usage;
  return obj;
}

module.exports = { ask, MODEL };
