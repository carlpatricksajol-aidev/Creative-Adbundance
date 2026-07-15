// ═══════════════════════════════════════════════════════════════════
// CREATOMATE BODY BUILDER — v6.0: PERSONAL INTRO MESSAGE STITCHED INTO THE REEL
// Everything in v5.9 (whole photo on black + slow centered push-in, strictly
// no repeated clips, audio above all visual tracks) PLUS:
//
// If the job has a personal video message (form_data.intro_video_url +
// intro_video_secs, from the site's note step), the reel now OPENS with it:
//   - the message plays first, full frame (contain on black), its own voice
//     at 100%;
//   - the song's INSTRUMENTAL intro sneaks in softly (35%) under the last
//     few seconds of the message ("bed" = up to the vocal onset, max 6s);
//   - the clips begin the moment the message ends, and because the timeline
//     is aligned to the vocal onset, the singing lands right as (or just
//     after) the clips start — message -> music swells -> song. One render,
//     message baked into the final MP4.
// No message on the job (or no intro_video_secs) -> output identical to v5.9.
// (The rare no-aligned-plan fallback path does not stitch the intro.)
// ═══════════════════════════════════════════════════════════════════

const r2 = n => Math.round(n * 100) / 100;
const input = $input.first().json;
const IMG = ['jpg','jpeg','png','webp','heic','heif','gif','avif','bmp'];
const isImgUrl = u => IMG.includes((u || '').toLowerCase().split('?')[0].split('.').pop());

let seq = input.aligned_clip_sequence || [];
try { if (!seq.length) seq = $('Align Clips to Sections').first().json.aligned_clip_sequence || []; } catch (e) {}

let audioUrl = input.suno_audio_url || input.audio_url;
try { if (!audioUrl) audioUrl = $('Extract Audio URL').first().json.suno_audio_url; } catch (e) {}
if (!audioUrl) throw new Error('No Suno audio URL reached the builder - refusing to render a silent reel.');

let songLen = parseFloat(input.suno_duration_secs || input.suno_duration);
try { if (!isFinite(songLen) || songLen <= 0) songLen = parseFloat($('Extract Audio URL').first().json.suno_duration_secs); } catch (e) {}
if (!isFinite(songLen) || songLen <= 0) songLen = null;

let vocalOnset = input.vocal_onset_secs;
if (typeof vocalOnset !== 'number') vocalOnset = (seq[0] && seq[0].time) || 0.5;

let videoClips = [];
try { videoClips = $('Shuffle Clips').first().json.video_clips || []; } catch (e) {}
if (!videoClips.length) videoClips = input.video_clips || [];
let geminiClips = input.gemini_clips || [];
try { if (!geminiClips.length) geminiClips = $('Parse Gemini Response').first().json.gemini_clips || []; } catch (e) {}
let clipOrder = input.clip_order || input.director_order || [];
try { if (!clipOrder.length) clipOrder = $('Parse Claude Response').first().json.clip_order || []; } catch (e) {}

let jobId = input.job_id || input.id;
try { if (!jobId) jobId = $('Get Job Details').first().json.id; } catch (e) {}

// ── tunables ──
const CROSSFADE = 0.5, OUTRO_FADE = 3.0, AUDIO_FADE = 4.0, BLACK_HOLD = 0.4;
const VID_MIN = 1.2, COLD_OPEN_AT = 3.0, OUTRO_SLOT = 3.0, FINALE_HOLD = 6.0;
const KB_ZOOM = 10;        // images: slow centered push-in, ends at (100 + KB_ZOOM)%

// slow-mo whole-photo push-in, anchored DEAD CENTER so nobody is panned out
function imgZoom(dur) {
  return { time: 0, duration: r2(dur), easing: 'linear', type: 'scale',
    start_scale: '100%', end_scale: (100 + KB_ZOOM) + '%', x_anchor: '50%', y_anchor: '50%' };
}
const fadeIn = { time: 0, duration: CROSSFADE, easing: 'linear', type: 'fade' };

// Append the trailing reversed fade-out to whatever element is currently last.
function applyOutroFade(arr) {
  if (!arr.length) return;
  const lastEl = arr[arr.length - 1];
  const oF = Math.min(OUTRO_FADE, lastEl.duration - 0.3);
  if (oF > 0.2) (lastEl.animations = lastEl.animations || []).push({ time: r2(lastEl.duration - oF), duration: r2(oF), easing: 'linear', type: 'fade', reversed: true });
}

// Emit a PHOTO as ONE element: the whole photo (fit:'contain') on the black
// composition background, with the slow centered push-in. No blurred backdrop.
// trkRef.v supplies/advances the running track counter (one per photo).
// withFade = add a crossfade fade-in (false only for the very first element).
function pushPhoto(arr, url, time, dur, trkRef, withFade) {
  const fg = { type: 'image', source: url, track: trkRef.v++, time: r2(time), duration: r2(dur),
    fit: 'contain', width: '100%', height: '100%', x: '50%', y: '50%', x_anchor: '50%', y_anchor: '50%' };
  fg.animations = withFade ? [imgZoom(dur), fadeIn] : [imgZoom(dur)];
  arr.push(fg);
}

// Re-clamp a single already-emitted visual element so its duration never exceeds
// the composition total, keeping any scale (push-in) animation in sync.
function clampElementToTotal(el, total) {
  const maxDur = r2(Math.max(0, total - el.time));
  if (maxDur <= 0 || el.type === 'audio') return;
  if (el.duration > maxDur) {
    el.duration = maxDur;
    if (Array.isArray(el.animations)) {
      el.animations.forEach(a => {
        if (a.type === 'scale' && a.time === 0) a.duration = maxDur;     // keep push-in spanning the (clamped) shot
        if (a.reversed) { a.time = r2(Math.max(0, maxDur - a.duration)); } // keep any fade-out tail at the very end
      });
    }
  }
}

// per-clip info
const clipInfo = {};
videoClips.forEach((vc, i) => {
  const idx = vc.index ?? i;
  if (!vc.url || !String(vc.url).startsWith('http')) return;
  const gem = geminiClips.find(g => (g.clip_index ?? -1) === idx) || geminiClips[i] || {};
  const isImg = vc.type === 'image' || isImgUrl(vc.url);
  const src = vc.duration || (isImg ? 5 : 10);
  clipInfo[idx] = { url: vc.url, type: isImg ? 'image' : 'video', src,
    hs: Math.max(0, gem.highlight_start ?? 0), he: Math.min(gem.highlight_end ?? src, src),
    hero: !!gem.hero, dup: gem.dup_group ?? null };
});

// ── FALLBACK: no aligned plan → simple footage pack ──
function footagePack() {
  const els = []; let cur = Math.max(0, vocalOnset);
  const trkRef = { v: 1 };
  let first = true;
  videoClips.forEach((vc) => {
    if (!vc.url || !String(vc.url).startsWith('http')) return;
    const isImg = vc.type === 'image' || isImgUrl(vc.url);
    const d = isImg ? 5 : Math.min(vc.duration || 6, 7);
    if (isImg) {
      pushPhoto(els, vc.url, cur, d, trkRef, !first);   // v5.9: whole photo (contain) + slow push-in
    } else {
      const el = { type: 'video', source: vc.url, track: trkRef.v++, time: r2(cur), duration: r2(d), fit: 'cover', width: '100%', height: '100%', x: '50%', y: '50%', trim_start: 0, trim_duration: r2(d), volume: '0%' };
      el.animations = first ? [] : [fadeIn];
      els.push(el);
    }
    first = false;
    cur += d - CROSSFADE;
  });
  let total = cur + BLACK_HOLD;
  if (songLen) total = Math.min(total, songLen);
  // v5.8.1: a short song clamps the composition, so re-clamp every already-pushed
  // visual element (and its push-in) to the total, and drop elements that start at/after it.
  for (let i = els.length - 1; i >= 0; i--) {
    const el = els[i];
    if (el.time >= total - 0.05) { els.splice(i, 1); continue; }
    clampElementToTotal(el, total);
  }
  // v5.8.1: trailing reversed fade-out on the last visible element (parity with main path)
  applyOutroFade(els);
  const audioTrack = trkRef.v + 10;   // audio above every visual track
  if (audioUrl) els.push({ type: 'audio', source: audioUrl, track: audioTrack, time: 0, duration: r2(total), volume: '100%', audio_fade_out: AUDIO_FADE });
  return { source: { output_format: 'mp4', width: 1080, height: 1920, frame_rate: 30, duration: r2(total), fill_color: '#000000', elements: els } };
}
if (!Array.isArray(seq) || seq.length === 0) {
  const body = footagePack();
  return [{ json: { creatomate_body: JSON.stringify(body), job_id: jobId, totalDuration: body.source.duration, timeline_mode: 'footage_fallback_v6.0', clip_count: body.source.elements.filter(e => e.type !== 'audio').length } }];
}

// ── reservation: clips owned by moment/iconic lines ──
const reserved = new Set();
seq.forEach(s => { if (s.tier !== 'theme' && typeof s.clip_index === 'number' && s.clip_index >= 0) reserved.add(s.clip_index); });
let lastReservedSeqIdx = -1;
seq.forEach((s, i) => { if (s.tier !== 'theme' && typeof s.clip_index === 'number' && s.clip_index >= 0) lastReservedSeqIdx = i; });

// montage pool = unreserved clips in story order
const storyOrder = [];
const seenSO = new Set();
(clipOrder.length ? clipOrder : videoClips.map((vc, i) => vc.index ?? i)).forEach(idx => { if (clipInfo[idx] && !seenSO.has(idx)) { seenSO.add(idx); storyOrder.push(idx); } });
videoClips.forEach((vc, i) => { const idx = vc.index ?? i; if (clipInfo[idx] && !seenSO.has(idx)) { seenSO.add(idx); storyOrder.push(idx); } });
let pool = storyOrder.filter(idx => !reserved.has(idx));

// closing shot: a hero if Gemini flagged one, else the last story-order clip
let finaleHero = pool.find(idx => clipInfo[idx].hero);
if (finaleHero === undefined && pool.length) finaleHero = pool[pool.length - 1];
if (finaleHero !== undefined) pool = pool.filter(idx => idx !== finaleHero);

const used = new Set();
const shownDups = new Set();
let lastShown = -1;
function markShown(idx) { used.add(idx); lastShown = idx; const d = clipInfo[idx].dup; if (d != null) shownDups.add(d); }
function pickMontage() {
  // pass 1: unused + not a near-duplicate of ANYTHING already shown
  for (const idx of pool) { if (!used.has(idx) && idx !== lastShown && (clipInfo[idx].dup == null || !shownDups.has(clipInfo[idx].dup))) return idx; }
  // pass 2: any unused
  for (const idx of pool) { if (!used.has(idx) && idx !== lastShown) return idx; }
  return null;
}
// a reserved clip we never reached (its verse got cut) is still fair game to fill with
function pickAnyUnused() {
  for (const idx of storyOrder) { if (!used.has(idx) && idx !== lastShown) return idx; }
  return null;
}

// ── choose what shows; every clip at most once; END when footage is spent ──
const shows = [];
let endedEarly = false;
for (let i = 0; i < seq.length; i++) {
  const s = seq[i];
  const anchored = (s.tier !== 'theme') && (typeof s.clip_index === 'number' && s.clip_index >= 0 && clipInfo[s.clip_index]);

  // keep the anchor ONLY the first time we see this clip; a repeat anchor
  // (chorus / repeated hook) falls through to an unused clip instead of replaying.
  if (anchored && !used.has(s.clip_index)) {
    markShown(s.clip_index);
    shows.push({ idx: s.clip_index, time: s.time, tier: s.tier || 'moment' });
    continue;
  }

  let idx = pickMontage();
  if (idx == null) idx = pickAnyUnused();   // dip into not-yet-shown reserved clips before giving up
  if (idx == null) {
    // STRICTLY NO REPEATS. The unused pool is dry. We never reuse an already-shown
    // clip. If verses are still ahead, SKIP this slot — the previous clip naturally
    // extends to the next anchor (not a repeat). Otherwise footage is spent: close
    // on the hero and END.
    if (lastReservedSeqIdx > i) {
      continue;
    } else {
      if (finaleHero !== undefined && !used.has(finaleHero)) { markShown(finaleHero); shows.push({ idx: finaleHero, time: s.time, tier: 'finale' }); }
      endedEarly = true;
      break;
    }
  }
  markShown(idx);
  shows.push({ idx, time: s.time, tier: 'theme' });
}
if (!shows.length) {
  const body = footagePack();
  return [{ json: { creatomate_body: JSON.stringify(body), job_id: jobId, totalDuration: body.source.duration, timeline_mode: 'footage_fallback_v6.0' } }];
}

// ── COLD OPEN over the musical intro (audio untrimmed) ──
const firstAnchor = shows[0].time;
const opens = [];
if (firstAnchor >= COLD_OPEN_AT) {
  const n = Math.min(3, Math.max(1, Math.round(firstAnchor / 4)));
  const per = firstAnchor / n;
  for (let i = 0; i < n; i++) {
    const idx = pickMontage();
    if (idx == null) break;
    markShown(idx);
    opens.push({ idx, time: r2(i * per), tier: 'open' });
  }
}
const allShows = [...opens, ...shows].sort((a, b) => a.time - b.time);

// ── render: starts follow the cursor, ends are anchored ──
const songEnd = (typeof songLen === 'number' && songLen > 0) ? songLen : (shows[shows.length - 1].time + FINALE_HOLD + OUTRO_FADE);
const reelMax = songEnd - 0.05;

const elements = [];
const emitted = new Set();   // enforce no-repeat at the point of emission
let trk = 1;                 // single running track counter (a photo consumes TWO, a video ONE)
let cursor = 0;
allShows.forEach((sh, idx) => {
  if (emitted.has(sh.idx)) return;   // never render the same clip index twice
  const ci = clipInfo[sh.idx]; if (!ci) return;
  const isImage = ci.type === 'image';
  const isLast = idx === allShows.length - 1;
  const start = Math.max(cursor, 0);
  const hold = (sh.tier === 'finale') ? FINALE_HOLD : 4;
  const nextAnchor = isLast ? Math.min(sh.time + hold, reelMax) : allShows[idx + 1].time;
  const targetEnd = Math.min(nextAnchor, reelMax);

  let end, trimStart = 0;
  if (isImage) {
    end = targetEnd;
  } else {
    const windowWanted = Math.max(VID_MIN, targetEnd - start);
    let ts = Math.max(0, ((ci.hs + ci.he) / 2) - windowWanted / 2);
    if (ts + windowWanted > ci.src) ts = Math.max(0, ci.src - windowWanted);
    trimStart = ts;
    const footageAvail = Math.max(0.5, ci.src - trimStart);
    end = start + Math.min(windowWanted, footageAvail);
  }
  if (start >= reelMax) return;
  const dur = Math.min(Math.max(end - start, 0.8), reelMax - start);
  if (dur <= 0.3) return;

  const withFade = idx > 0;   // very first element has no crossfade fade-in
  const trkRef = { v: trk };
  if (isImage) {
    // v5.9: whole photo (contain) on black with the slow centered push-in
    pushPhoto(elements, ci.url, start, dur, trkRef, withFade);
  } else {
    const el = { type: 'video', source: ci.url, track: trkRef.v++, time: r2(start), duration: r2(dur), fit: 'cover', width: '100%', height: '100%', x: '50%', y: '50%', x_anchor: '50%', y_anchor: '50%', trim_start: r2(trimStart), trim_duration: r2(dur), volume: '0%' };
    el.animations = withFade ? [fadeIn] : [];
    elements.push(el);
  }
  trk = trkRef.v;            // advance the running counter past this clip's layer(s)
  emitted.add(sh.idx);
  cursor = start + dur - (isLast ? 0 : CROSSFADE);
});

// ── outro montage ONLY when the song ended before the footage did ──
let leftovers = 0;
if (!endedEarly) {
  // exclude the hero from the leftover remainder so it is added exactly once as the closer.
  const rest = storyOrder.filter(idx => !used.has(idx) && idx !== finaleHero);
  if (finaleHero !== undefined && !used.has(finaleHero)) rest.push(finaleHero);   // hero closes the outro
  for (const idx of rest) {
    if (used.has(idx) || emitted.has(idx)) continue;   // never re-emit a shown clip
    const ci = clipInfo[idx]; if (!ci) continue;
    const start = cursor;
    if (start + 1.5 > reelMax) break;
    const dur = Math.min(OUTRO_SLOT, reelMax - start);
    const isImage = ci.type === 'image';
    const trkRef = { v: trk };
    if (isImage) {
      pushPhoto(elements, ci.url, start, dur, trkRef, true);   // v5.9: whole photo (contain) + slow push-in
    } else {
      let ts = Math.max(0, ((ci.hs + ci.he) / 2) - dur / 2);
      if (ts + dur > ci.src) ts = Math.max(0, ci.src - dur);
      const el = { type: 'video', source: ci.url, track: trkRef.v++, time: r2(start), duration: r2(dur), fit: 'cover', width: '100%', height: '100%', x: '50%', y: '50%', trim_start: r2(ts), trim_duration: r2(dur), volume: '0%', animations: [fadeIn] };
      elements.push(el);
    }
    trk = trkRef.v;
    markShown(idx); emitted.add(idx); leftovers++;
    cursor = start + dur - CROSSFADE;
  }
}

// last visible element fades out (the last emitted element is a foreground photo
// or a video — both correct to fade)
applyOutroFade(elements);

let totalDuration = Math.min(cursor + CROSSFADE + BLACK_HOLD, songEnd);
const audioTrack = trk + 10;   // audio sits ABOVE every visual track

// ── v6.0: OPTIONAL PERSONAL INTRO MESSAGE stitched at the front ──
// The message plays first with its own voice; the song's instrumental slides in softly
// under its last seconds (the "bed"); clips + vocals land right as the message ends.
let introUrl = null, introSecs = 0;
try {
  const fd = input.form_data || $('Get Job Details').first().json.form_data || {};
  introUrl  = fd.intro_video_url || null;
  introSecs = parseFloat(fd.intro_video_secs);
} catch (e) {}
if (!introUrl || !String(introUrl).startsWith('http') || !isFinite(introSecs) || introSecs < 2) introUrl = null;

if (introUrl) {
  introSecs = r2(Math.min(introSecs, 90));
  const bed = r2(Math.max(0, Math.min(vocalOnset, introSecs * 0.4, 6)));   // instrumental under the message tail
  const s0  = r2(introSecs - bed);   // where the song's timeline begins, in reel time
  // shift every clip by s0 — they stay perfectly aligned to the song's lyric times
  elements.forEach(el => { el.time = r2(el.time + s0); });
  // the message sits ABOVE the clips (track trk > all visual tracks) for its full length,
  // fading out over the bed to reveal the first clip already in motion underneath
  const introEl = { type: 'video', source: introUrl, track: trk, time: 0, duration: introSecs,
    fit: 'contain', width: '100%', height: '100%', x: '50%', y: '50%', volume: '100%' };
  const fdur = Math.min(0.6, bed);
  if (fdur > 0.25) introEl.animations = [{ time: r2(introSecs - fdur), duration: r2(fdur), easing: 'linear', type: 'fade', reversed: true }];
  elements.unshift(introEl);
  if (bed > 0.25) {
    // song's opening `bed` seconds, quiet, under the voice
    elements.push({ type: 'audio', source: audioUrl, track: audioTrack + 1, time: s0,
      duration: bed, trim_start: 0, trim_duration: bed, volume: '35%' });
  }
  // the rest of the song at full volume, from the moment the message ends
  elements.push({ type: 'audio', source: audioUrl, track: audioTrack, time: introSecs,
    duration: r2(totalDuration - bed), trim_start: bed, trim_duration: r2(totalDuration - bed),
    volume: '100%', audio_fade_out: AUDIO_FADE });
  totalDuration = r2(totalDuration + s0);
} else {
  elements.push({ type: 'audio', source: audioUrl, track: audioTrack, time: 0, duration: r2(totalDuration), volume: '100%', audio_fade_out: AUDIO_FADE });
}

const body = { source: { output_format: 'mp4', width: 1080, height: 1920, frame_rate: 30, duration: r2(totalDuration), fill_color: '#000000', elements } };
const distinctClips = used.size;
return [{ json: { creatomate_body: JSON.stringify(body), job_id: jobId, totalDuration: r2(totalDuration), song_len: songLen,
  ended_when_footage_spent: endedEarly, reserved_clips: reserved.size,
  cold_open_clips: opens.length, outro_leftovers: leftovers, finale_hero: finaleHero ?? null,
  intro_stitched: !!introUrl, intro_secs: introUrl ? introSecs : 0,
  distinct_clips_shown: distinctClips, timeline_mode: 'footage_capped_v6.0' } }];