// ═══════════════════════════════════════════════════════════════════
// CREATOMATE BODY BUILDER — v5.6: WHOLE PHOTO ALWAYS VISIBLE + STRICTLY NO REPEATS
// Builds on v5.5 (every clip plays at most once for ANCHORED lines). v5.6
// makes two product-driven changes:
//
// (1) IMAGES ARE NEVER CROPPED OR ZOOMED. Photos used fit:'cover' (which
//     crops a wide group photo into the 9:16 frame, cutting people off at
//     the edges) plus a Ken Burns "scale" zoom. v5.6 shows the WHOLE photo:
//       - fit:'contain' for all image/photo elements (videos stay 'cover'),
//       - the Ken Burns scale animation on images is removed; images keep
//         ONLY the crossfade 'fade',
//       - applies everywhere an image can be emitted (main loop, outro
//         montage, footagePack fallback).
//     The composition keeps fill_color '#000000', so a contained photo
//     letterboxes on black. VIDEOS are unchanged (cover + trim window).
//
// (2) STRICTLY NO REPEATED CLIPS. Every clip index appears AT MOST ONCE
//     across the entire output (cold-open + main timeline + outro). The
//     reprise/bridge path (which reused an already-shown clip when verses
//     were still ahead) is removed: when the unused pool is exhausted we
//     SKIP the slot — the previous clip naturally extends to the next
//     anchor time, which is NOT a repeat. The reel is as long as the
//     distinct footage allows and the Suno song is trimmed to it; the
//     duration is never padded by replaying clips.
//
// No other logic, tunables, crossfades, cold open, fade-to-black ending,
// audio track, duration cap, or return shape changed.
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
const AUDIO_TRACK = 100;

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
  videoClips.forEach((vc, i) => {
    if (!vc.url || !String(vc.url).startsWith('http')) return;
    const isImg = vc.type === 'image' || isImgUrl(vc.url);
    const d = isImg ? 5 : Math.min(vc.duration || 6, 7);
    // v5.6: images use 'contain' (whole photo visible, letterboxed on black); videos keep 'cover'
    const el = { type: isImg ? 'image' : 'video', source: vc.url, track: i + 1, time: r2(cur), duration: r2(d), fit: isImg ? 'contain' : 'cover', width: '100%', height: '100%', x: '50%', y: '50%' };
    if (!isImg) { el.trim_start = 0; el.trim_duration = r2(d); el.volume = '0%'; }
    el.animations = [{ time: 0, duration: CROSSFADE, easing: 'linear', type: 'fade' }];
    els.push(el); cur += d - CROSSFADE;
  });
  let total = cur + BLACK_HOLD;
  if (songLen) total = Math.min(total, songLen);
  if (audioUrl) els.push({ type: 'audio', source: audioUrl, track: AUDIO_TRACK, time: 0, duration: r2(total), volume: '100%', audio_fade_out: AUDIO_FADE });
  return { source: { output_format: 'mp4', width: 1080, height: 1920, frame_rate: 30, duration: r2(total), fill_color: '#000000', elements: els } };
}
if (!Array.isArray(seq) || seq.length === 0) {
  const body = footagePack();
  return [{ json: { creatomate_body: JSON.stringify(body), job_id: jobId, totalDuration: body.source.duration, timeline_mode: 'footage_fallback_v5.6', clip_count: body.source.elements.filter(e => e.type !== 'audio').length } }];
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

  // v5.5: keep the anchor ONLY the first time we see this clip; a repeat anchor
  // (chorus / repeated hook) falls through to an unused clip instead of replaying.
  if (anchored && !used.has(s.clip_index)) {
    markShown(s.clip_index);
    shows.push({ idx: s.clip_index, time: s.time, tier: s.tier || 'moment' });
    continue;
  }

  let idx = pickMontage();
  if (idx == null) idx = pickAnyUnused();   // dip into not-yet-shown reserved clips before giving up
  if (idx == null) {
    // v5.6: STRICTLY NO REPEATS. The unused pool is dry. We never reuse an
    // already-shown clip. If verses are still ahead, SKIP this slot — the
    // previous clip naturally extends to the next anchor (that is not a
    // repeat). Otherwise the footage is spent: close on the hero and END.
    if (lastReservedSeqIdx > i) {
      continue;
    } else {
      // footage spent + no verses left → close on the hero and END (no recycling)
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
  return [{ json: { creatomate_body: JSON.stringify(body), job_id: jobId, totalDuration: body.source.duration, timeline_mode: 'footage_fallback_v5.6' } }];
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
const emitted = new Set();   // v5.6 defense-in-depth: enforce no-repeat at the point of emission
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

  // v5.6: images use 'contain' (whole photo visible, letterboxed on black); videos keep 'cover'
  const el = { type: isImage ? 'image' : 'video', source: ci.url, track: idx + 1, time: r2(start), duration: r2(dur), fit: isImage ? 'contain' : 'cover', width: '100%', height: '100%', x: '50%', y: '50%', x_anchor: '50%', y_anchor: '50%' };
  if (!isImage) { el.trim_start = r2(trimStart); el.trim_duration = r2(dur); el.volume = '0%'; }

  // v5.6: NO Ken Burns scale on images — the whole photo stays visible and still.
  // Images keep only the crossfade 'fade'.
  const anims = [];
  if (idx > 0) anims.push({ time: 0, duration: CROSSFADE, easing: 'linear', type: 'fade' });
  el.animations = anims;
  elements.push(el);
  emitted.add(sh.idx);
  cursor = start + dur - (isLast ? 0 : CROSSFADE);
});

// ── outro montage ONLY when the song ended before the footage did ──
let track = allShows.length + 2;
let leftovers = 0;
if (!endedEarly) {
  // v5.6 STRICT NO-REPEAT: exclude the hero from the leftover remainder so it is
  // added exactly once as the closer (storyOrder already contains finaleHero).
  const rest = storyOrder.filter(idx => !used.has(idx) && idx !== finaleHero);
  if (finaleHero !== undefined && !used.has(finaleHero)) rest.push(finaleHero);   // hero closes the outro
  for (const idx of rest) {
    if (used.has(idx) || emitted.has(idx)) continue;   // defense-in-depth: never re-emit a shown clip
    const ci = clipInfo[idx]; if (!ci) continue;
    const start = cursor;
    if (start + 1.5 > reelMax) break;
    const dur = Math.min(OUTRO_SLOT, reelMax - start);
    const isImage = ci.type === 'image';
    // v5.6: images use 'contain' (whole photo visible, letterboxed on black); videos keep 'cover'
    const el = { type: isImage ? 'image' : 'video', source: ci.url, track: track++, time: r2(start), duration: r2(dur), fit: isImage ? 'contain' : 'cover', width: '100%', height: '100%', x: '50%', y: '50%' };
    if (!isImage) {
      let ts = Math.max(0, ((ci.hs + ci.he) / 2) - dur / 2);
      if (ts + dur > ci.src) ts = Math.max(0, ci.src - dur);
      el.trim_start = r2(ts); el.trim_duration = r2(dur); el.volume = '0%';
    }
    el.animations = [{ time: 0, duration: CROSSFADE, easing: 'linear', type: 'fade' }];
    elements.push(el);
    markShown(idx); emitted.add(idx); leftovers++;
    cursor = start + dur - CROSSFADE;
  }
}

// last visible element fades out
if (elements.length) {
  const lastEl = elements[elements.length - 1];
  const oF = Math.min(OUTRO_FADE, lastEl.duration - 0.3);
  if (oF > 0.2) (lastEl.animations = lastEl.animations || []).push({ time: r2(lastEl.duration - oF), duration: r2(oF), easing: 'linear', type: 'fade', reversed: true });
}

let totalDuration = Math.min(cursor + CROSSFADE + BLACK_HOLD, songEnd);
elements.push({ type: 'audio', source: audioUrl, track: AUDIO_TRACK, time: 0, duration: r2(totalDuration), volume: '100%', audio_fade_out: AUDIO_FADE });

const body = { source: { output_format: 'mp4', width: 1080, height: 1920, frame_rate: 30, duration: r2(totalDuration), fill_color: '#000000', elements } };
const distinctClips = used.size;
return [{ json: { creatomate_body: JSON.stringify(body), job_id: jobId, totalDuration: r2(totalDuration), song_len: songLen,
  ended_when_footage_spent: endedEarly, reserved_clips: reserved.size,
  cold_open_clips: opens.length, outro_leftovers: leftovers, finale_hero: finaleHero ?? null,
  distinct_clips_shown: distinctClips, timeline_mode: 'footage_capped_v5.6' } }];