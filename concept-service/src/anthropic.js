'use strict';
/*
 * One place that talks to the model. Streaming, because a Creative Director pass
 * over sixteen concepts runs long enough to trip an HTTP timeout otherwise, and
 * structured output so the pipeline never has to guess at a shape.
 */

const MODEL = process.env.CONCEPT_MODEL || 'claude-opus-5';
const EFFORT = process.env.CONCEPT_EFFORT || 'high';
const API = 'https://api.anthropic.com/v1/messages';

function keyOrThrow() {
  const k = process.env.ANTHROPIC_API_KEY;
  if (!k) {
    const e = new Error('ANTHROPIC_API_KEY is not set on this host, so no run can start.');
    e.code = 'NO_API_KEY';
    throw e;
  }
  return k;
}

/*
 * schema is a JSON Schema for the object we want back. The model is constrained
 * to it, so a stage either returns the right shape or errors — it never returns
 * prose we then have to parse hopefully.
 */
async function ask({ system, prompt, schema, maxTokens = 32000 }) {
  const body = {
    model: MODEL,
    max_tokens: maxTokens,
    stream: true,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: EFFORT,
      format: { type: 'json_schema', schema },
    },
    system,
    messages: [{ role: 'user', content: prompt }],
  };

  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': keyOrThrow(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`anthropic ${res.status}: ${detail.slice(0, 600)}`);
  }

  // Collect the streamed text deltas. Thinking blocks stream too; we only want
  // the final text, which carries the JSON.
  let out = '';
  let stop = null;
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
      if (!line.startsWith('data:')) continue;
      const raw = line.slice(5).trim();
      if (!raw || raw === '[DONE]') continue;
      let ev;
      try { ev = JSON.parse(raw); } catch { continue; }
      if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') {
        out += ev.delta.text;
      } else if (ev.type === 'message_delta' && ev.delta && ev.delta.stop_reason) {
        stop = ev.delta.stop_reason;
      } else if (ev.type === 'error') {
        throw new Error('anthropic stream error: ' + JSON.stringify(ev.error).slice(0, 400));
      }
    }
  }

  if (stop === 'refusal') throw new Error('the model declined this request (stop_reason: refusal)');
  if (stop === 'max_tokens') throw new Error('hit max_tokens before finishing; raise maxTokens for this stage');

  const text = out.trim();
  if (!text) throw new Error('empty response from the model');
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('response was not the JSON we constrained it to: ' + text.slice(0, 300));
  }
}

module.exports = { ask, MODEL, EFFORT };
