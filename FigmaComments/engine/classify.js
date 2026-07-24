/* Classify threads via OpenRouter (google/gemini-2.5-flash).
 *
 * TWO passes, deliberately decoupled:
 *   1. Per-thread classification {type, route, priority, action} — chunked, because each
 *      thread's decision is independent, so chunking is safe and keeps requests modest.
 *   2. GLOBAL theme clustering — ONE call over a compact view of ALL threads at once, so
 *      "the same feedback repeated across ads" is grouped even when the threads would have
 *      landed in different classification chunks. (Chunk-local theming silently missed any
 *      duplicate whose copies straddled a chunk boundary — the exact case a hundreds-of-
 *      comments batch hits constantly.)
 *
 * The LLM NEVER edits the verbatim message — that is passed through untouched by buildBrief;
 * the model only receives it read-only as context.
 *
 * Hard rules baked into the prompt AND re-enforced deterministically after the call:
 *   - value-prop / "what is the value prop / pain point" -> type value-prop, route strategist, action ""
 *   - pure question -> route strategist|account, action ""
 *   - approval / positive sign-off -> type approval, route none, action ""
 *   - concrete wording/layout/logo/color change -> route designer (or copywriter for pure copy rewrites),
 *     with a concrete imperative action
 */

const OR_URL = "https://openrouter.ai/api/v1/chat/completions";

const TYPES = ["copy", "value-prop", "design", "compliance", "question", "approval", "other"];
const ROUTES = ["designer", "strategist", "copywriter", "account", "none"];
const PRIOS = ["high", "medium", "low"];
// Compliance splits two ways: a claim-substantiation call (strategist) vs. an execution task the
// designer does (add a disclaimer/asterisk/symbol, blur PII, remove a logo). This matches the latter.
const CLAIMY = /\b(claim|substantiat|not approved|unsupported|cannot say|can'?t say|rephrase|reword|misleading|high[-\s]?risk|per\s+ltbd|assumed)\b/i;

/* threadsForLLM: [{ commentId, adName, sectionLabel, verbatim, replies:[text...], resolved }]
 * returns { perThread: Map(commentId -> {type,route,priority,action,themeId}), themes: [...] } */
export async function classifyThreads(threadsForLLM, { apiKey, model = "google/gemini-2.5-flash", chunkSize = 25 } = {}) {
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is required for classification");
  if (!threadsForLLM.length) return { perThread: new Map(), themes: [] };

  // ---- pass 1: per-thread classification (chunked; independent decisions, run concurrently) ----
  const perThread = new Map();
  const chunks = [];
  for (let i = 0; i < threadsForLLM.length; i += chunkSize) chunks.push(threadsForLLM.slice(i, i + chunkSize));

  await mapPool(chunks, 4, async (chunk, ci) => {
    const classifications = await classifyChunkResilient(chunk, { apiKey, model, chunkIndex: ci });
    for (const t of chunk) {
      perThread.set(String(t.commentId), enforceRules(t, classifications[String(t.commentId)] || {}));
    }
  });

  // ---- pass 2: GLOBAL theme clustering over every thread at once (best-effort) ----
  let themes = [];
  try { themes = await clusterThemes(threadsForLLM, perThread, { apiKey, model }); }
  catch { themes = []; } // theming must never fail the whole run

  return { perThread, themes };
}

/* A truncated/garbled OpenRouter response makes classifyChunk throw. Rather than abort the
 * whole run, split the chunk in half and retry; a single thread that still fails is left to
 * enforceRules' text heuristics (empty raw). Guarantees the run always completes. */
async function classifyChunkResilient(chunk, opts) {
  try {
    return await classifyChunk(chunk, opts);
  } catch (e) {
    if (chunk.length <= 1) return {}; // give up on this one thread; enforceRules infers from text
    const mid = Math.ceil(chunk.length / 2);
    const [a, b] = await Promise.all([
      classifyChunkResilient(chunk.slice(0, mid), opts),
      classifyChunkResilient(chunk.slice(mid), opts),
    ]);
    return { ...a, ...b };
  }
}

/* One OpenRouter call for a chunk. Returns { <commentId>: {type,route,priority,action} }. */
async function classifyChunk(chunk, { apiKey, model, chunkIndex }) {
  const payload = chunk.map((t) => ({
    commentId: String(t.commentId),
    adName: t.adName || "",
    sectionLabel: t.sectionLabel || "",
    verbatim: String(t.verbatim || ""),
    replies: Array.isArray(t.replies) ? t.replies.slice(0, 6) : [],
    resolved: !!t.resolved,
  }));

  const resp = await postJSON(
    OR_URL,
    {
      model,
      temperature: 0.1,
      max_tokens: 8000,
      messages: [
        { role: "system", content: CLASSIFY_PROMPT },
        { role: "user", content: JSON.stringify({ threads: payload }) },
      ],
    },
    orHeaders(apiKey)
  );

  const content = resp?.choices?.[0]?.message?.content;
  if (!content) throw new Error(`OpenRouter returned no content (classify chunk ${chunkIndex}): ${trim(JSON.stringify(resp))}`);
  const parsed = parseLenientJSON(content);
  if (!parsed || typeof parsed !== "object") throw new Error(`OpenRouter content was not JSON (classify chunk ${chunkIndex}): ${trim(content)}`);

  // accept { classifications: {...} } | { results: [...] } | a bare map/array
  const raw = parsed.classifications || parsed.results || parsed;
  const out = {};
  if (Array.isArray(raw)) {
    for (const c of raw) if (c && c.commentId != null) out[String(c.commentId)] = c;
  } else {
    for (const k of Object.keys(raw)) if (k !== "themes") out[String(k)] = raw[k];
  }
  return out;
}

/* One OpenRouter call over ALL threads -> cross-ad theme clusters.
 * themeId on member threads is set ONLY here, to a final t<N> id, so a dangling themeId
 * (one that points at no themes[] entry) is impossible by construction. */
async function clusterThemes(allThreads, perThread, { apiKey, model }) {
  if (allThreads.length < 2) return [];

  const byId = new Map(allThreads.map((t) => [String(t.commentId), t]));
  // compact view keeps the single call cheap even for hundreds of comments
  const items = allThreads.map((t) => ({
    id: String(t.commentId),
    ad: t.adName || "",
    type: (perThread.get(String(t.commentId)) || {}).type || "other",
    text: String(t.verbatim || "").slice(0, 240),
  }));
  if (items.length > 400) items.length = 400; // soft cap; caller logs if truncated upstream

  // Theming output can be large (many themes, each listing member ids); give it room and
  // retry once if the response comes back unparseable/empty (usually truncation).
  let rawThemes = [];
  for (let attempt = 0; attempt < 2 && !rawThemes.length; attempt++) {
    const resp = await postJSON(
      OR_URL,
      {
        model,
        temperature: 0.1,
        max_tokens: 16000,
        messages: [
          { role: "system", content: THEME_PROMPT },
          { role: "user", content: JSON.stringify({ comments: items }) },
        ],
      },
      orHeaders(apiKey)
    );
    const content = resp?.choices?.[0]?.message?.content;
    const parsed = content ? parseLenientJSON(content) : null;
    rawThemes = parsed && Array.isArray(parsed.themes) ? parsed.themes : Array.isArray(parsed) ? parsed : [];
  }

  const themes = [];
  let n = 0;
  for (const th of rawThemes) {
    // keep only ids that are real threads; a theme needs 2+ members to be a cross-ad theme
    const ids = [...new Set((th.threadIds || []).map(String).filter((id) => byId.has(id)))];
    if (ids.length < 2) continue;

    const newId = `t${++n}`;
    for (const id of ids) {
      const pt = perThread.get(id);
      if (pt) pt.themeId = newId;
    }
    // adRefs derived from the member threads' real ad names (more reliable than the model's echo)
    const adRefs = [...new Set(ids.map((id) => (byId.get(id) || {}).adName).filter(Boolean))];

    const label = deDash(str(th.label) || "Repeated feedback");
    const summary = deDash(str(th.summary) || "");
    const ttype = pick(th.type, TYPES, "other");
    let troute = pick(th.route, ROUTES, "strategist");
    if (ttype === "compliance") troute = CLAIMY.test(label + " " + summary) ? "strategist" : "designer";

    themes.push({
      id: newId,
      label,
      type: ttype,
      route: troute,
      priority: pick(th.priority, PRIOS, "medium"),
      summary,
      threadIds: ids,
      adRefs,
    });
  }
  return mergeThemesByLabel(themes, perThread);
}

/* The theme LLM sometimes emits two clusters with the same label (e.g. "Add ®/™ Symbol" twice).
 * Merge themes whose normalized label matches: union threadIds/adRefs, repoint member threads,
 * keep the strongest priority. */
function mergeThemesByLabel(themes, perThread) {
  const rank = { high: 3, medium: 2, low: 1 };
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const byLabel = new Map();
  const kept = [];
  for (const th of themes) {
    const key = norm(th.label);
    if (byLabel.has(key)) {
      const tgt = byLabel.get(key);
      tgt.threadIds = [...new Set([...tgt.threadIds, ...th.threadIds])];
      tgt.adRefs = [...new Set([...tgt.adRefs, ...th.adRefs])];
      if ((rank[th.priority] || 0) > (rank[tgt.priority] || 0)) tgt.priority = th.priority;
      for (const id of th.threadIds) { const pt = perThread.get(id); if (pt) pt.themeId = tgt.id; }
    } else {
      byLabel.set(key, th);
      kept.push(th);
    }
  }
  return kept;
}

/* Deterministic guardrails: keep the LLM inside the enums and the house rules.
 * themeId is initialized null here and set only by clusterThemes. */
function enforceRules(thread, raw) {
  const text = String(thread.verbatim || "");
  let type = pick(raw.type, TYPES, null);
  let route = pick(raw.route, ROUTES, null);
  let priority = pick(raw.priority, PRIOS, "medium");
  let action = str(raw.action);

  // --- rule: value-prop / pain-point questions ---
  if (type === "value-prop" || /value\s*prop|pain\s*point/i.test(text)) {
    type = "value-prop";
    route = "strategist";
    action = ""; // designer can't decide messaging
  }

  // --- rule: approval / positive sign-off ---
  if (type === "approval" || /\bapproved?\b|looks? (great|good|perfect)|love (this|it)|👍|✅|👏|perfect\b|ship it\b/i.test(text)) {
    type = "approval";
    route = "none";
    action = "";
  }

  // --- rule: pure question -> action empty, route strategist/account ---
  if (type === "question") {
    if (route === "designer" || route === "copywriter" || !route) route = "strategist";
    action = "";
  }

  // --- rule: compliance is mostly the DESIGNER's job to execute; only claim-substantiation
  //     is a strategist decision ---
  if (type === "compliance") {
    if (CLAIMY.test(text + " " + action)) { route = "strategist"; action = ""; }
    else route = "designer";
  }

  // fallbacks if the model gave nothing usable
  if (!type) type = "other";
  if (!route) route = type === "copy" ? "copywriter" : type === "design" ? "designer" : "account";

  // --- rule: only designer/copywriter items carry an imperative action ---
  if (route !== "designer" && route !== "copywriter") action = "";
  if ((route === "designer" || route === "copywriter") && !action) {
    action = route === "copywriter"
      ? "Revise this copy per the client's note."
      : "Apply the requested change to this frame.";
  }

  return { type, route, priority, action: deDash(action), themeId: null };
}

const CLASSIFY_PROMPT = `You are triaging client feedback comments on advertising creatives in Figma for an ad agency.
For EACH thread you receive, output a classification.

Return ONLY valid JSON (no prose, no code fences) shaped exactly:
{ "classifications": { "<commentId>": { "type": <type>, "route": <route>, "priority": "high"|"medium"|"low", "action": <string> } } }

type is one of: "copy","value-prop","design","compliance","question","approval","other".
  copy = wording/language edit on the ad; value-prop = messaging/angle/pain-point decision;
  design = layout/visual/color/hierarchy/size; compliance = claim/legal/brand-rule;
  question = needs an answer before work; approval = sign-off/positive; other = uncategorized.
route is one of: "designer","strategist","copywriter","account","none".

HARD RULES (follow exactly):
- If the comment asks "what is the value prop / pain point" or pushes back that something "isn't a value prop", or is about the messaging angle: type="value-prop", route="strategist", action="" (a designer cannot decide messaging).
- Pure questions: route="strategist" or "account", action="".
- Approvals / positive sign-off ("approved", "love this", "looks great", 👍/✅): type="approval", route="none", action="".
- Concrete wording/layout/logo/color/size changes: route="designer" (or "copywriter" for a pure copy rewrite). Give a concrete, imperative "action" telling the designer exactly what to do.
- Compliance the DESIGNER executes (add an FDA disclaimer / asterisk / (R) or (TM) symbol, blur or remove personal info, remove a logo or watermark, resize): type="compliance", route="designer", concrete action. Compliance about whether a CLAIM is allowed or substantiated (an unsupported benefit, "high risk", "per LTBD", rephrase a claim): type="compliance", route="strategist", action="".
- action is YOUR imperative restatement of the task. NEVER quote or paraphrase the client's exact words as the action; never invent brand claims the client did not state.
- Never use em-dashes (— or –) in any text you write; use plain punctuation (periods, commas, colons).

Keep actions short and specific. Output valid JSON only.`;

const THEME_PROMPT = `You group client feedback comments on ad creatives into THEMES.
A THEME = the SAME piece of feedback repeated across 2 OR MORE different ads (for example, the client
asks "what is the value prop?" on several ads, or requests the same wording change in multiple places).

You receive a flat list of comments: { id, ad, type, text }.
Return ONLY valid JSON (no prose, no code fences) shaped exactly:
{ "themes": [ { "label": <string>, "type": <type>, "route": <route>, "priority": "high"|"medium"|"low", "summary": <string>, "threadIds": [<id>...] } ] }

RULES:
- Only emit a theme when 2+ comments genuinely express the same feedback. Do NOT force unrelated comments together.
- threadIds are the ids of the member comments.
- "same feedback here" / echoes belong in the theme with the note they echo.
- summary = one or two sentences synthesizing what the client wants across the grouped comments.
- route = who should own it (usually "strategist" for messaging/value-prop themes).
- Compliance themes the designer executes (add disclaimer/asterisk/symbol, blur or remove PII, remove a logo) -> route="designer"; compliance themes about claim substantiation -> route="strategist".
- A comment can appear in at most one theme. Comments that are unique get no theme.
- Never use em-dashes (— or –) in label or summary; use plain punctuation.

Output valid JSON only.`;

/* ---------- http + json helpers ---------- */
function orHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "HTTP-Referer": "https://creativeadbundance.internal/figma-comment-digest",
    "X-Title": "Figma Comment Digest",
  };
}

/* POST with bounded retry/backoff on 429 + 5xx, honoring Retry-After — mirrors the Figma client.
 * Classification is the most expensive stage; a single transient rate-limit must not fail the run. */
async function postJSON(url, body, headers, { retries = 4 } = {}) {
  let attempt = 0;
  for (;;) {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const text = await resp.text();

    if (resp.status === 401 || resp.status === 403) {
      throw new Error(`OpenRouter ${resp.status} — check OPENROUTER_API_KEY. Body: ${trim(text)}`);
    }
    if ((resp.status === 429 || resp.status >= 500) && attempt < retries) {
      const ra = Number(resp.headers.get("retry-after"));
      const waitMs = Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(1000 * 2 ** attempt, 16000);
      await sleep(waitMs);
      attempt++;
      continue;
    }
    if (resp.status === 429) throw new Error(`OpenRouter 429 rate-limited after ${retries} retries. Body: ${trim(text)}`);
    if (!resp.ok) throw new Error(`OpenRouter ${resp.status}. Body: ${trim(text)}`);
    try { return JSON.parse(text); } catch { throw new Error(`OpenRouter non-JSON envelope: ${trim(text)}`); }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* bounded-concurrency map — keeps `limit` calls in flight, preserves index order */
async function mapPool(items, limit, fn) {
  const ret = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; ret[idx] = await fn(items[idx], idx); }
  });
  await Promise.all(workers);
  return ret;
}

/* strip ```json fences / leading prose and parse the first {...} block */
export function parseLenientJSON(content) {
  let s = String(content || "").trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(s); } catch {}
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first >= 0 && last > first) {
    const slice = s.slice(first, last + 1);
    try { return JSON.parse(slice); } catch {}
  }
  return null;
}

const pick = (v, allowed, dflt) => (allowed.includes(v) ? v : dflt);
const str = (v) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));
const trim = (s) => String(s || "").slice(0, 400);
/* house rule: no em-dashes in copy we generate — collapse to plain punctuation */
const deDash = (s) => String(s || "").replace(/\s*[—–]\s*/g, ", ").replace(/\s+,/g, ",");
