/* Service worker — owns the recording lifecycle. It cannot touch audio itself (no DOM, and it
 * gets torn down when idle), so it holds the stream id and hands the actual capture to an
 * offscreen document, which survives as long as it is playing/recording media.
 *
 * Division of labour:
 *   popup       collects who/what/which brand, and grabs the mic permission
 *   background  gets the tab stream id, opens the offscreen doc, tracks state, badges the icon
 *   offscreen   mixes tab + mic, records, uploads chunks
 */

const OFFSCREEN = "offscreen.html";
let state = { recording: false, meetingId: null, tabId: null, startedAt: null, title: null, error: null };

async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  if (existing.length) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN,
    reasons: ["USER_MEDIA"],
    justification: "Mix and record meeting audio from the tab and microphone.",
  });
}

function badge(on) {
  chrome.action.setBadgeText({ text: on ? "REC" : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#e03131" });
}

async function start(cfg) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("no active tab");

  // Open the meeting server-side first: if the server or token is wrong we find out now, before
  // recording 40 minutes of audio that has nowhere to go.
  const res = await fetch(`${cfg.server.replace(/\/$/, "")}/ingest/start`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.token}` },
    body: JSON.stringify({
      title: cfg.title || tab.title || "Untitled meeting",
      brand: cfg.brand || null,
      meetingType: cfg.meetingType || null,
      platform: /meet\.google/.test(tab.url) ? "meet" : /zoom\./.test(tab.url) ? "zoom" : /teams\./.test(tab.url) ? "teams" : null,
      participants: cfg.participants || [],
      startedBy: cfg.startedBy || null,
    }),
  });
  if (!res.ok) throw new Error(`server said ${res.status}: ${(await res.text()).slice(0, 120)}`);
  const { meetingId } = await res.json();

  // getMediaStreamId must be called from the extension in response to the user's click. The id
  // is single-use and only valid for the offscreen document we hand it to.
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });

  await ensureOffscreen();
  await chrome.runtime.sendMessage({ target: "offscreen", type: "start", streamId, meetingId, cfg });

  state = { recording: true, meetingId, tabId: tab.id, startedAt: Date.now(), title: cfg.title || tab.title, error: null };
  badge(true);
  return state;
}

async function stop() {
  if (!state.recording) return state;
  await chrome.runtime.sendMessage({ target: "offscreen", type: "stop" }).catch(() => {});
  return state;
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.target === "offscreen") return; // not ours

  if (msg?.type === "start") { start(msg.cfg).then(reply).catch((e) => reply({ error: e.message })); return true; }
  if (msg?.type === "stop") { stop().then(reply).catch((e) => reply({ error: e.message })); return true; }
  if (msg?.type === "state") { reply(state); return true; }

  // from the offscreen document
  if (msg?.type === "stopped") {
    state = { ...state, recording: false, error: msg.error || null };
    badge(false);
    chrome.offscreen.closeDocument().catch(() => {});
  }
  if (msg?.type === "uploadError") state.error = msg.error;
});

// If the meeting tab goes away mid-call, finish cleanly rather than uploading silence.
chrome.tabs.onRemoved.addListener((tabId) => { if (state.recording && tabId === state.tabId) stop(); });
