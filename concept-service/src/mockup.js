'use strict';
/*
 * Concept mockups: the 9:16 still that fills the box the concept board has
 * always reserved and never filled ("the image agent has not run for this
 * concept yet").
 *
 * This is NOT a new idea. The team's own OS already does it, in
 * adbundance-os at runner/skills/concept-mockups.js, and has generated 64
 * mockups into the shared vault. That implementation is coupled to the OS's
 * vault markdown docs: its HTTP route wants a signed-in session and a
 * `docPath` pointing at clients/<slug>/concepts/<doc>.md, neither of which a
 * batch of ours has. What IS reusable is the part that takes plain fields,
 * so this file follows that same contract with our own concepts as input.
 *
 * TWO THINGS ARE DELIBERATE HERE.
 *
 * 1. The prompt is NOT in this repo. `concept-visualizer.md` is Carl's own
 *    spec and lives in the team's PRIVATE repo; this repo is public. It is
 *    read at runtime from the shared vault instead, the same way the concept
 *    pipeline reads its craft from the mounted skill checkout. This file
 *    holds the mechanism, never the craft.
 *
 * 2. The generated URL is downloaded immediately. kie.ai result URLs are good
 *    for roughly 24 hours, which the team's own client notes in its comments.
 *    An image referenced by that URL would silently disappear from a deck the
 *    day after it was made, so the bytes land on our disk and we serve them.
 *
 * KEEPING IT IN SYNC: the prompt in the vault is a copy of ROLE_SYSTEM_PROMPT
 * in adbundance-os runner/skills/lib/mockupPromptAgent.js, which is ITSELF
 * hand-mirrored into lib/mockupPromptAgent.ts on their Next.js side. Their
 * file says, correctly, that if the prompt changes it must change in both.
 * Ours is a third reader of the same text, so re-copy it when they revise:
 *   scripts/sync-mockup-prompt.md documents the one command.
 */

const fs = require('fs');
const path = require('path');
const brand = require('./dossier');
const store = require('./store');
const storyframe = require('./storyframe');
const { canonNum, numSet } = require('./num');

/* Where the craft lives. Same shape as SKILL_DIR: a mounted path, read fresh,
   so updating the prompt needs no deploy. */
const PROMPT_DIR = process.env.MOCKUP_PROMPT_DIR || '/vault/system/mockup';

const KIE_BASE = 'https://api.kie.ai/api/v1/jobs';
const KIE_MODEL = 'nano-banana-2';
const POLL_MS = 2000;
/* The team measured 48s to 118s in production and widened their own ceiling
   to 180s after real timeouts at 90s. Same model, same aspect ratio, so the
   same ceiling applies rather than a guess. */
const MAX_WAIT_MS = 180 * 1000;

const IMG_DIR = path.join(process.env.DATA_DIR || '/data', 'mockups');
/* The still is kept as well as the framed composite. A still is paid for and
   slow; a frame is free and fast. Keeping the still means a template change is
   a re-render rather than a re-generation of the whole batch. */
const CREATIVE_DIR = path.join(IMG_DIR, 'creative');
fs.mkdirSync(IMG_DIR, { recursive: true });
fs.mkdirSync(CREATIVE_DIR, { recursive: true });

/* A killed run can leave a .part behind. It is never valid and never resumed,
   so it goes at boot rather than lingering as a confusing artifact. */
for (const d of [IMG_DIR, CREATIVE_DIR]) {
  try {
    for (const f of fs.readdirSync(d)) if (f.endsWith('.part')) fs.unlinkSync(path.join(d, f));
  } catch { /* first boot: the directory was only just created */ }
}

/* Write to a temp name and rename, because `docker compose up -d --build` is
   the deploy step here and it kills in-flight runs. A plain writeFileSync
   interrupted mid-write leaves a truncated PNG that existsSync happily
   reports as a finished mockup, and the board renders it in front of a
   client. Same filesystem, so the rename is atomic. */
function writeAtomic(file, buf) {
  const tmp = file + '.part';
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, file);
}

function craft(name) {
  const p = path.join(PROMPT_DIR, name);
  try { return fs.readFileSync(p, 'utf8'); }
  catch {
    throw new Error(
      `missing mockup prompt ${name} at ${p}. It is not in this repo on purpose; ` +
      'copy it from the team\'s adbundance-os runner/skills/lib/mockupPromptAgent.js ' +
      'into the shared vault. See scripts/sync-mockup-prompt.md.');
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------- the prompt agent ---- */

/* One OpenRouter call per concept, plain text out rather than JSON: the agent
   authors an image-generation prompt, and a schema would only get in the way.
   Direct fetch rather than llm.js because llm.js always forces a json_schema. */
async function authorPrompt({ input, model, log }) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) { const e = new Error('OPENROUTER_API_KEY is not set on the server'); e.status = 503; throw e; }

  const f = (v) => {
    if (Array.isArray(v)) return v.length ? v.join('; ') : 'not specified';
    return v && String(v).trim() ? String(v).trim() : 'not specified';
  };

  const userPrompt = `BRAND ONBOARDING:
BRAND_NAME: ${f(input.brandName)}
PRODUCT_NAME: ${f(input.productName)}
PRODUCT_REFERENCE_IMAGE: ${input.hasProductReferenceImage ? 'yes' : 'no'}
CATEGORY: ${f(input.category)}
TARGET_PERSONA: ${f(input.targetPersona)}
CORE_USPS / BENEFITS: ${f(input.coreUsps)}
BRAND_VOICE: ${f(input.brandVoice)}

THE CONCEPT SLIDE, which is the creative source of truth:
CONCEPT_TITLE: ${f(input.conceptTitle)}
CONCEPT_DESCRIPTION: ${f(input.conceptDescription)}
LEAD_HOOK: ${f(input.leadHook)}
NARRATIVE_BEATS: ${f(input.narrativeBeats)}
DESIGN_COMPONENTS: ${f(input.designComponents)}

PLATFORM: ${f(input.platform || 'Instagram Reels')}

${input.forcedTextTreatment ? `OVERLAY TREATMENT OVERRIDE: use exactly this style unless the Contrast Gate genuinely forbids it at the position this composition offers, in which case pick the closest legal option in the SAME visual category instead. This has already been chosen for you to guarantee variety across the batch: ${input.forcedTextTreatment}\n\n` : ''}Follow your instructions exactly. Output ONLY the filled prompt, no preamble, no commentary, no code fences.`;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + key,
      'content-type': 'application/json',
      'http-referer': 'https://adbundance-os-client-view.vercel.app',
      'x-title': 'Abundance Ecosystem concept mockups',
    },
    body: JSON.stringify({
      model: model || process.env.MOCKUP_MODEL || 'anthropic/claude-sonnet-5',
      max_tokens: 6000,
      temperature: 0.7,
      messages: [
        { role: 'system', content: craft('concept-visualizer.md') },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.error) {
    throw new Error('the prompt agent failed: ' + ((body && body.error && body.error.message) || 'HTTP ' + res.status));
  }
  const out = body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content;
  if (!out || !String(out).trim()) throw new Error('the prompt agent returned nothing');
  return { prompt: String(out).trim(), cost: (body.usage && body.usage.cost) || 0 };
}

/* ---------------------------------------------------------- the generator ---- */

/* createTask then poll, exactly as the team's kieMockup.js does. Same model,
   same 9:16, same png. Divergence here would mean our decks and theirs stop
   looking like the same agency made them. */
async function generateImage({ prompt, imageUrls }) {
  const key = process.env.KIE_API_KEY;
  if (!key) { const e = new Error('KIE_API_KEY is not set on the server, so mockups cannot be generated'); e.status = 503; throw e; }

  const createRes = await fetch(`${KIE_BASE}/createTask`, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: KIE_MODEL,
      input: {
        prompt,
        output_format: 'png',
        aspect_ratio: '9:16',
        ...(imageUrls && imageUrls.length ? { image_input: imageUrls } : {}),
      },
    }),
  });
  const created = await createRes.json().catch(() => null);
  if (!createRes.ok || !created || created.code !== 200 || !created.data || !created.data.taskId) {
    throw new Error('kie.ai createTask failed: ' + ((created && created.msg) || 'HTTP ' + createRes.status));
  }
  const taskId = created.data.taskId;

  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    const pollRes = await fetch(`${KIE_BASE}/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
      headers: { authorization: 'Bearer ' + key },
    });
    const poll = await pollRes.json().catch(() => null);
    const state = poll && poll.data && poll.data.state;
    if (state === 'success') {
      let url = null;
      try { url = (JSON.parse((poll.data.resultJson) || '{}').resultUrls || [])[0] || null; } catch { url = null; }
      if (!url) throw new Error('kie.ai reported success but returned no image URL');
      return url;
    }
    if (state === 'fail') throw new Error((poll.data && poll.data.failMsg) || 'kie.ai generation failed');
  }
  throw new Error('timed out waiting on kie.ai after ' + Math.round(MAX_WAIT_MS / 1000) + 's');
}

/* The URL rots in about a day, so the bytes come to us now. The still lands in
   its own directory: the served path belongs to the framed composite. */
async function download(url, id) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not download the generated image (HTTP ${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) throw new Error('the generated image downloaded empty');
  const file = path.join(CREATIVE_DIR, `${id}.png`);
  writeAtomic(file, buf);
  return { file, bytes: buf.length, buf };
}

/* Both paths run every id through the same sanitiser, so a crafted id cannot
   walk out of either directory. */
function safeId(id) {
  return String(id || '').replace(/[^A-Za-z0-9._-]/g, '');
}

function creativePath(id) {
  const safe = safeId(id);
  if (!safe) return null;
  const p = path.join(CREATIVE_DIR, `${safe}.png`);
  return fs.existsSync(p) && fs.statSync(p).size > 0 ? p : null;
}

/* Frame one still and write it to the served path. Returns what it did so the
   run can report a plate, a square mark or a lettermark per concept rather
   than leaving Carl to notice a missing logo by eye. */
async function frameOne({ id, creativeBuf, brandName, logo, cta }) {
  const out = await storyframe.frame({
    creativePng: creativeBuf,
    brandName,
    logoBuf: logo.buf,
    logoMeta: logo.meta,
    cta,
  });
  writeAtomic(path.join(IMG_DIR, `${safeId(id)}.png`), out.png);
  return out;
}

function imagePath(id) {
  const safe = safeId(id);
  if (!safe) return null;
  const p = path.join(IMG_DIR, `${safe}.png`);
  /* size as well as existence: a lost rename race or a full disk leaves a
     zero byte file that existsSync alone would call a finished mockup. */
  return fs.existsSync(p) && fs.statSync(p).size > 0 ? p : null;
}

/* --------------------------------------------------------------- the run ---- */

/* Reading a snapshot for the fields the prompt agent asks for. The brand
   record's own vocabulary differs from the agent's, so the mapping is here
   and explicit rather than hidden in a template. */
function brandInputs(record) {
  const snap = record.snap || {};
  return {
    brandName: record.brand && record.brand.brand_name,
    /* the frame's avatar. 19 of 86 active brands have no logo_url, so this is
       often null and that is a designed state, not a gap. */
    logoUrl: record.brand && record.brand.logo_url,
    productName: (record.products || []).map((p) => p.name || p.product_name).filter(Boolean)[0],
    hasProductReferenceImage: false,
    category: snap.category,
    targetPersona: snap.target_audience,
    coreUsps: snap.value_prop || snap.proof_points || snap.messaging_pillars,
    brandVoice: snap.voice_summary,
  };
}

async function run({ client, batchId, nums, requestedBy, log }) {
  const batch = store.getBatch(batchId);
  if (!batch) { const e = new Error('that concept batch is not on file'); e.status = 404; throw e; }
  /* the board sends the number as the slide shows it, which is padded. */
  const want = Array.isArray(nums) && nums.length ? numSet(nums) : null;
  const concepts = (batch.concepts || []).filter((c) => !want || want.has(canonNum(c.num)));
  if (!concepts.length) { const e = new Error('no concepts in scope'); e.status = 400; throw e; }

  log('Intake', 'running');
  const { record, matched } = await brand.resolve(client);
  const base = brandInputs(record);
  const treatments = JSON.parse(craft('text-treatments.json'));
  log('Intake', 'done',
    `${concepts.length} concept${concepts.length === 1 ? '' : 's'} in scope, snapshot for ${base.brandName} (matched on ${matched})`);

  /* Once per run, not once per concept: a batch is five frames for one brand
     and ARMRA's logo alone is 823KB. */
  const logo = await storyframe.loadLogo(base.logoUrl);
  log('Brand mark', 'done', logo.why
    ? `${logo.why}, so the frame uses the ${base.brandName} initials`
    : `logo on file, ${logo.meta.kind} ${logo.meta.w}x${logo.meta.h}`);

  const out = [];
  let spend = 0;
  for (let i = 0; i < concepts.length; i++) {
    const c = concepts[i];
    const label = `Concept ${c.num}`;
    log(label, 'running', 'writing the image prompt');
    try {
      /* Rotating the overlay treatment across the batch, the way the team's
         route does, so ten regenerations do not collapse onto one style. */
      const forcedTextTreatment = treatments[(Number(c.num) - 1 + i) % treatments.length];
      const authored = await authorPrompt({
        input: {
          ...base,
          conceptTitle: c.title,
          conceptDescription: c.desc,
          leadHook: (c.hooks || [])[0],
          narrativeBeats: c.narrative,
          designComponents: c.design,
          forcedTextTreatment,
        },
      });
      spend += authored.cost || 0;

      log(label, 'running', 'generating, this takes up to two minutes');
      const url = await generateImage({ prompt: authored.prompt });
      const id = `${batch.id}-c${c.num}`;
      const { bytes, buf } = await download(url, id);

      /* The still is paid for and on disk from here on. Framing is free and
         retryable, so it gets its own try: a frame failure must never make a
         generation that already cost money and two minutes disappear. */
      let framed = null, frameErr = null;
      try {
        framed = await frameOne({ id, creativeBuf: buf, brandName: base.brandName, logo, cta: 'Learn More' });
      } catch (err) {
        frameErr = err && err.message ? err.message : String(err);
        /* serve the unframed still rather than nothing, so the paid work is
           visible on the board and reframe() can finish the job for free */
        writeAtomic(path.join(IMG_DIR, `${id}.png`), buf);
      }

      out.push({
        num: c.num, id, bytes, treatment: forcedTextTreatment, prompt: authored.prompt,
        framed: Boolean(framed),
        avatar: framed ? framed.avatar.mode : null,
        dims: framed ? `${framed.dims.w}x${framed.dims.h}` : null,
        frameError: frameErr,
      });
      log(label, frameErr ? 'error' : 'done', frameErr
        ? `the still is safe but the frame failed: ${frameErr.slice(0, 90)}`
        : `framed ${framed.dims.w}x${framed.dims.h}, ${String(forcedTextTreatment).slice(0, 34)}`);
    } catch (err) {
      /* One concept failing must not lose the ones already paid for. */
      const msg = err && err.message ? err.message : String(err);
      out.push({ num: c.num, error: msg });
      log(label, 'error', msg.slice(0, 140));
    }
  }

  const made = out.filter((o) => o.id).length;
  const failed = out.length - made;
  const unframed = out.filter((o) => o.id && !o.framed).length;
  log('Mockups ready', 'done',
    `${made} of ${out.length} rendered` +
    (failed ? `, ${failed} failed and can be run again` : '') +
    (unframed ? `, ${unframed} still unframed and can be reframed for free` : '') +
    (logo.why ? ', brand initials used in place of a logo' : ''));

  return {
    client: base.brandName,
    batchId: batch.id,
    mockups: out,
    made,
    failed,
    unframed,
    /* so the board can say why an avatar is initials instead of a logo */
    logo: logo.why ? { present: false, why: logo.why } : { present: true, kind: logo.meta.kind },
    cost_usd: Math.round(spend * 100) / 100,
  };
}

/* Re-render the frames for a batch from the stills already on disk. No prompt
   call, no kie.ai call, no spend, so editing story-frame.html in the vault or
   adding a brand's logo costs one of these instead of a whole regeneration.
   This is the entry point that makes the template safe to iterate on. */
async function reframe({ client, batchId, nums, log }) {
  const batch = store.getBatch(batchId);
  if (!batch) { const e = new Error('that concept batch is not on file'); e.status = 404; throw e; }
  const want = Array.isArray(nums) && nums.length ? numSet(nums) : null;
  const concepts = (batch.concepts || []).filter((c) => !want || want.has(canonNum(c.num)));
  if (!concepts.length) { const e = new Error('no concepts in scope'); e.status = 400; throw e; }

  log('Intake', 'running');
  const { record, matched } = await brand.resolve(client || batch.client);
  const base = brandInputs(record);
  const logo = await storyframe.loadLogo(base.logoUrl);
  log('Intake', 'done',
    `${concepts.length} concept${concepts.length === 1 ? '' : 's'} in scope for ${base.brandName} ` +
    `(matched on ${matched}), ${logo.why ? 'no logo on file' : 'logo on file'}`);

  const out = [];
  for (const c of concepts) {
    const id = `${batch.id}-c${c.num}`;
    const label = `Concept ${c.num}`;
    const src = creativePath(id);
    if (!src) {
      /* nothing was ever generated for this one, or it predates the split.
         Either way there is no still to frame and saying so is better than
         inventing one. */
      out.push({ num: c.num, id, skipped: 'no generated still on file for this concept' });
      log(label, 'error', 'no generated still on file, so there is nothing to frame');
      continue;
    }
    try {
      const framed = await frameOne({
        id, creativeBuf: fs.readFileSync(src), brandName: base.brandName, logo, cta: 'Learn More',
      });
      out.push({ num: c.num, id, framed: true, avatar: framed.avatar.mode, dims: `${framed.dims.w}x${framed.dims.h}` });
      log(label, 'done', `reframed ${framed.dims.w}x${framed.dims.h}, ${framed.avatar.mode}`);
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      out.push({ num: c.num, id, framed: false, error: msg });
      log(label, 'error', msg.slice(0, 140));
    }
  }

  const done = out.filter((o) => o.framed).length;
  log('Frames ready', 'done',
    `${done} of ${out.length} reframed, no generation spend` +
    (logo.why ? ', brand initials used in place of a logo' : ''));

  return {
    client: base.brandName,
    batchId: batch.id,
    frames: out,
    made: done,
    failed: out.length - done,
    logo: logo.why ? { present: false, why: logo.why } : { present: true, kind: logo.meta.kind },
    cost_usd: 0,
  };
}

module.exports = { run, reframe, imagePath, creativePath, IMG_DIR, CREATIVE_DIR };
