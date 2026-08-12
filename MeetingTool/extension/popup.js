/* Popup — collects the three things the engine cannot infer (which client, what kind of call,
 * who is in the room), then hands off to the service worker.
 *
 * Why the roster is asked for rather than detected: whisper does not diarize, so the extractor
 * needs to know who counts as the client in order to apply "a client's instruction outranks an
 * internal person's speculation". Two comma-separated fields is a five-second cost that makes
 * every downstream item better. Names are remembered per brand, so it is usually one click.
 */

const $ = (id) => document.getElementById(id);
const store = chrome.storage.local;

let timer = null;

async function loadSettings() {
  const s = await store.get(["server", "token", "me", "lastBrand", "rosters"]);
  $("server").value = s.server || "https://meetings.srv1486031.hstgr.cloud";
  $("token").value = s.token || "";
  $("me").value = s.me || "";
  $("brand").value = s.lastBrand || "";

  const rosters = s.rosters || {};
  $("brands").innerHTML = Object.keys(rosters).map((b) => `<option value="${b}">`).join("");
  applyRoster(rosters, $("brand").value);
  $("brand").addEventListener("change", () => applyRoster(rosters, $("brand").value));
}

function applyRoster(rosters, brand) {
  const r = rosters[brand];
  if (!r) return;
  $("clients").value = (r.clients || []).join(", ");
  $("internal").value = (r.internal || []).join(", ");
  $("type").value = r.type || $("type").value;
}

$("save").onclick = async () => {
  await store.set({ server: $("server").value.trim(), token: $("token").value.trim(), me: $("me").value.trim() });
  $("save").textContent = "Saved";
  setTimeout(() => ($("save").textContent = "Save settings"), 1200);
};

const names = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);

$("start").onclick = async () => {
  $("err").textContent = "";
  const server = $("server").value.trim(), token = $("token").value.trim();
  if (!server || !token) { $("err").textContent = "Set the server URL and token first (Server settings)."; return; }

  // Ask for the microphone HERE, from a real user gesture in an extension page. An offscreen
  // document cannot show a permission prompt, so if this is skipped the mic silently fails and
  // you get a recording of everyone except the person running the call.
  if ($("mic").checked) {
    try { (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((t) => t.stop()); }
    catch { $("err").textContent = "Microphone blocked — recording the tab only."; }
  }

  const brand = $("brand").value.trim();
  const participants = [
    ...names($("clients").value).map((name) => ({ name, role: "client" })),
    ...names($("internal").value).map((name) => ({ name, role: "internal" })),
  ];

  const { rosters = {} } = await store.get("rosters");
  if (brand) rosters[brand] = { clients: names($("clients").value), internal: names($("internal").value), type: $("type").value };
  await store.set({ server, token, lastBrand: brand, rosters, me: $("me").value.trim() });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const res = await chrome.runtime.sendMessage({
    type: "start",
    cfg: {
      server, token, brand: brand || null, meetingType: $("type").value,
      title: tab?.title || null, participants, mic: $("mic").checked, startedBy: $("me").value.trim() || null,
    },
  });

  if (res?.error) { $("err").textContent = res.error; return; }
  showRecording(res);
};

$("stop").onclick = async () => {
  $("stop").disabled = true;
  $("stop").textContent = "Filing…";
  await chrome.runtime.sendMessage({ type: "stop" });
  setTimeout(() => window.close(), 900);
};

function showRecording(state) {
  $("idle").style.display = "none";
  $("rec").classList.add("on");
  $("recTitle").textContent = state.title || "";
  clearInterval(timer);
  timer = setInterval(() => {
    const s = Math.floor((Date.now() - state.startedAt) / 1000);
    $("elapsed").textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }, 500);
}

(async () => {
  await loadSettings();
  const state = await chrome.runtime.sendMessage({ type: "state" });
  if (state?.recording) showRecording(state);
  if (state?.error) $("err").textContent = state.error;
})();
