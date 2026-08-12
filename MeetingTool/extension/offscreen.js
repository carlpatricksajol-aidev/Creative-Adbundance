/* Offscreen document — the only place with a DOM, so the only place that can hold an
 * AudioContext and a MediaRecorder.
 *
 * Two gotchas that will otherwise cost an afternoon each:
 *
 * 1. chrome.tabCapture MUTES the tab for the user. Capturing the stream diverts it, so unless
 *    you also connect the tab source back to the AudioContext destination, whoever clicked
 *    Start can no longer hear the meeting. The mic is deliberately NOT connected back — that
 *    would echo their own voice at them.
 *
 * 2. Chunks are uploaded as they are produced, not held until the end. An hour of opus is only
 *    ~30 MB, but a browser crash at minute 55 would take the whole call with it. Uploading as
 *    we go means a crash costs the last 20 seconds.
 */

const CHUNK_MS = 20000;

let recorder = null, ctx = null, tracks = [], seq = 0, cfg = null, meetingId = null;
let pending = 0, failedChunks = [];

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.target !== "offscreen") return;
  if (msg.type === "start") start(msg).catch((e) => finish(e.message));
  if (msg.type === "stop") stopRecording();
});

async function start(msg) {
  ({ meetingId, cfg } = msg);
  seq = 0; pending = 0; failedChunks = [];

  const tab = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: msg.streamId } },
  });

  // The mic is optional: if permission was never granted we still get everyone else's audio,
  // which is most of what matters on a client call.
  let mic = null;
  if (cfg.mic !== false) {
    try { mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { console.warn("[offscreen] no microphone, recording remote audio only:", e.message); }
  }

  ctx = new AudioContext();
  const dest = ctx.createMediaStreamDestination();
  const tabSrc = ctx.createMediaStreamSource(tab);
  tabSrc.connect(dest);
  tabSrc.connect(ctx.destination);          // gotcha 1 — keep the meeting audible to the human
  if (mic) ctx.createMediaStreamSource(mic).connect(dest);

  tracks = [...tab.getTracks(), ...(mic ? mic.getTracks() : [])];

  recorder = new MediaRecorder(dest.stream, { mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 32000 });
  recorder.ondataavailable = (e) => { if (e.data?.size) upload(e.data, seq++); };
  recorder.onstop = () => finish(null);
  recorder.onerror = (e) => finish(String(e.error?.message || e.error || "recorder error"));
  recorder.start(CHUNK_MS);                 // gotcha 2 — timeslice, so chunks stream out

  // The person who started it is often not looking at the tab. If the call ends and the tab is
  // closed, background.js stops us; if audio simply stops, the recording keeps running until
  // someone clicks Stop, which is the safer default for a meeting that goes quiet.
  console.log(`[offscreen] recording ${meetingId}${mic ? " (tab+mic)" : " (tab only)"}`);
}

async function upload(blob, n) {
  pending++;
  try {
    const res = await fetch(`${cfg.server.replace(/\/$/, "")}/ingest/chunk`, {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.token}`, "content-type": "application/octet-stream", "x-meeting-id": meetingId, "x-seq": String(n) },
      body: await blob.arrayBuffer(),
    });
    if (!res.ok) throw new Error(`${res.status}`);
  } catch (e) {
    // One retry, then record the gap. /ingest/finish refuses to transcribe a file with a hole
    // in it rather than producing a transcript that quietly skips two minutes.
    try {
      const res = await fetch(`${cfg.server.replace(/\/$/, "")}/ingest/chunk`, {
        method: "POST",
        headers: { authorization: `Bearer ${cfg.token}`, "content-type": "application/octet-stream", "x-meeting-id": meetingId, "x-seq": String(n) },
        body: await blob.arrayBuffer(),
      });
      if (!res.ok) throw new Error(`${res.status}`);
    } catch (e2) {
      failedChunks.push(n);
      chrome.runtime.sendMessage({ type: "uploadError", error: `chunk ${n} failed: ${e2.message}` });
    }
  } finally { pending--; }
}

function stopRecording() {
  try { recorder?.state === "recording" && recorder.stop(); } catch { /* already stopped */ }
}

async function finish(error) {
  for (const t of tracks) { try { t.stop(); } catch {} }
  tracks = [];
  try { await ctx?.close(); } catch {}
  ctx = null;

  // Let the last chunks land before telling the server the meeting is complete.
  for (let i = 0; i < 60 && pending > 0; i++) await new Promise((r) => setTimeout(r, 250));

  if (!error && meetingId) {
    try {
      const res = await fetch(`${cfg.server.replace(/\/$/, "")}/ingest/finish`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${cfg.token}` },
        body: JSON.stringify({
          meetingId,
          title: cfg.title || null,
          brand: cfg.brand || null,
          participants: cfg.participants || [],
          failedChunks,
        }),
      });
      if (!res.ok) error = `finish returned ${res.status}`;
    } catch (e) { error = e.message; }
  }

  chrome.runtime.sendMessage({ type: "stopped", error: error || (failedChunks.length ? `${failedChunks.length} audio chunks never uploaded` : null) });
  recorder = null; meetingId = null;
}
