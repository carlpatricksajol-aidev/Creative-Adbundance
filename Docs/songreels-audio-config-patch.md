# SongReels — Audio / Song-Style Configuration Patch

**Goal:** make the *generated song* actually match the gift's theme and footage —
not just the lyrics. Today the lyrics are rich, but the **music style** sent to Suno
is built from only `genre + a 3-bucket mood`, so Suno fills in instrumentation, tempo,
and **voice** at random. That randomness is what reads as "the audio is off."

## The decisions (locked)

| Lever | Decision |
|---|---|
| Music style (instrumentation, tempo, dynamics) | **Fuse user + footage** — customer picks genre/mood/voice; Claude infers the rest from Gemini's read |
| Voice | **Customer picks** — Female / Male / Either |
| Mood | **5 named presets** — Tender, Nostalgic, Joyful, Cinematic, Uplifting |

### Mood preset → musical character
| Preset | Feel | Tempo | Dynamics |
|---|---|---|---|
| Tender | intimate, gentle, heartfelt | slow (~65–75 BPM) | soft, restrained |
| Nostalgic | warm, wistful, reflective | mid-slow (~75–85) | gentle swell |
| Joyful | bright, celebratory, playful | upbeat (~110–128) | lively throughout |
| Cinematic | sweeping, emotional, filmic | building (~80–100) | big build into chorus |
| Uplifting | hopeful, anthemic, warm | mid-up (~95–115) | rising, soaring chorus |

---

## 1. Frontend — DONE (`Songreels/create.html`)

- Mood slider → 5 preset pills (`#mood-pills`), default **Tender**.
- New **Voice** selector (`#vocal-pills`): Female / Male / Either, default **Either**.
- Job row now writes `form_data: { ...fields, mood_preset, song_vocal }`.
- `song_mood` kept as a representative 0–100 int (legacy-safe).

No Supabase schema change required — both new values ride inside the existing
`form_data` jsonb column.

---

## 2. n8n — "Build Claude Prompt" node (3 surgical edits)

### Edit 2a — read the new fields
**Find** the line:
```js
const theme      = fd['f-theme']    || '';
```
**Add directly below it:**
```js
const moodPreset = (fd['mood_preset'] || 'tender').toLowerCase();
const vocalPref  = (fd['song_vocal']  || 'either').toLowerCase();

const MOOD_PRESETS = {
  tender:    { feel: 'intimate, gentle, heartfelt',  tempo: 'slow (~65-75 BPM)',    dynamics: 'soft and restrained, a small lift in the chorus' },
  nostalgic: { feel: 'warm, wistful, reflective',    tempo: 'mid-slow (~75-85 BPM)', dynamics: 'a gentle swell through the chorus' },
  joyful:    { feel: 'bright, celebratory, playful', tempo: 'upbeat (~110-128 BPM)', dynamics: 'lively and energetic throughout' },
  cinematic: { feel: 'sweeping, emotional, filmic',  tempo: 'building (~80-100 BPM)', dynamics: 'a big dynamic build into the chorus' },
  uplifting: { feel: 'hopeful, anthemic, warm',      tempo: 'mid-up (~95-115 BPM)',  dynamics: 'rising energy, a soaring chorus' },
};
const moodSpec    = MOOD_PRESETS[moodPreset] || MOOD_PRESETS.tender;
const voicePhrase = vocalPref === 'female' ? 'a female vocal'
                  : vocalPref === 'male'   ? 'a male vocal'
                  : 'either a male or female vocal — pick what fits the occasion';
```

### Edit 2b — give Claude the style brief
**Find** the DELIVERABLES header inside the prompt template (the line that starts
`YOU MUST WRITE ALL THREE DELIVERABLES`). **Immediately BEFORE that whole
`DELIVERABLES` block, insert:**
```
──────────────────────────────────────────────────────────────────
MUSIC STYLE DIRECTION  (this drives the SONG, not the lyrics)
──────────────────────────────────────────────────────────────────
Write ONE Suno "style" line — comma-separated descriptors — that fuses:
  • Genre: ${genre}
  • Mood: ${moodSpec.feel}
  • Tempo: ${moodSpec.tempo}
  • Dynamics: ${moodSpec.dynamics}
  • Vocal: ${voicePhrase}
  • Instrumentation YOU choose to fit the footage described above
    (sparse fingerpicked guitar for quiet/intimate moments; full band +
     strings for celebratory/epic moments; piano for reflective, etc.)

Keep it to ~12–20 concrete, musical descriptors. Example:
  "intimate acoustic folk ballad, fingerpicked guitar, warm female vocal,
   ~72 BPM, nostalgic and tender, strings swelling into the chorus,
   tape-warm production, original"

Do NOT name people, places, or events here — that belongs in the lyrics.
```
Then change the words **`ALL THREE DELIVERABLES`** → **`ALL FOUR DELIVERABLES`**.

### Edit 2c — add the 4th deliverable to the output format
**Find** the end of the format block:
```
LYRICS_START
[full lyrics with section labels like [Verse], [Chorus]]
LYRICS_END`;
```
**Replace with:**
```
LYRICS_START
[full lyrics with section labels like [Verse], [Chorus]]
LYRICS_END
SONG_STYLE_START
[the single Suno style line from MUSIC STYLE DIRECTION]
SONG_STYLE_END`;
```

---

## 3. n8n — "Parse Claude Response" node (1 replacement)

**Find** this block:
```js
const job = $('Build Claude Prompt').first().json;
const genres = (job.song_genres || []).join(', ');
const mv = job.song_mood || 50;
const moodTag = mv < 35 ? 'emotional, cinematic' : mv < 65 ? 'heartfelt, warm' : 'upbeat, joyful';
const artistTag = job.artist_inspiration ? `, inspired by ${job.artist_inspiration}` : '';

// ← ONLY CHANGE: added "no intro, starts with vocals"
const sunoTags = `${genres || 'folk, indie'}, ${moodTag}${artistTag}, original, melodic, no intro, starts with vocals`;
```
**Replace with:**
```js
const job = $('Build Claude Prompt').first().json;
const fd  = job.form_data || {};
const vocalPref  = (fd['song_vocal']  || 'either').toLowerCase();
const moodPreset = (fd['mood_preset'] || 'tender').toLowerCase();

// Prefer Claude's authored style line; fall back to a constructed one.
const styleMatch  = raw.match(/SONG_STYLE_START\n([\s\S]*?)\nSONG_STYLE_END/);
const claudeStyle = styleMatch ? styleMatch[1].trim().replace(/\s*\n+\s*/g, ' ') : '';

const genres    = (job.song_genres || []).join(', ');
const artistTag = job.artist_inspiration ? `, inspired by ${job.artist_inspiration}` : '';
const MOOD_FALLBACK = {
  tender:    'intimate, gentle, heartfelt, slow tempo',
  nostalgic: 'warm, wistful, reflective, mid-slow tempo',
  joyful:    'bright, celebratory, upbeat',
  cinematic: 'sweeping, emotional, building',
  uplifting: 'hopeful, anthemic, soaring chorus',
};

let style = (claudeStyle && claudeStyle.length > 10)
  ? claudeStyle
  : `${genres || 'folk, indie'}, ${MOOD_FALLBACK[moodPreset] || MOOD_FALLBACK.tender}${artistTag}, original, melodic`;

// --- GUARDRAILS (non-negotiables enforced in code, not left to the model) ---
// 1) chosen voice
const hasVocalWord = /\b(female|male|man|woman|girl|boy)\b[^,]*vocal/i.test(style);
if (vocalPref === 'female' && !hasVocalWord) style += ', female vocal';
if (vocalPref === 'male'   && !hasVocalWord) style += ', male vocal';
// 2) always open on vocals, no long instrumental intro
if (!/no intro/i.test(style)) style += ', no intro, starts with vocals';
// 3) soft length cap so Suno doesn't choke on an over-long style
const sunoTags = style.substring(0, 990);
```

The downstream **Suno – Generate Song** node already reads `suno_tags` as `style` and
already has `negativeTags` suppressing intros — **no change needed there.**

---

## 4. Test checklist

1. Create a reel with **Tender + Female** + Folk → song should be a slow acoustic
   ballad in a female voice.
2. Same footage with **Joyful + Male** + Pop → noticeably faster, brighter, male voice.
3. Confirm in the n8n execution log that `suno_tags` now contains instrumentation +
   tempo + the chosen voice (not just `genre, heartfelt warm`).
4. Confirm the voice in the finished song matches the selection on 3 runs (this was the
   biggest "off" complaint).

## 5. Lyric-timed sync (v4) — fixes clip/lyric DRIFT

**Problem (verified on the Hawaii reel):** clip ORDER matched the lyrics but TIMING did
not — the video ran ahead of the vocals (Jeep clip at 0:56, but "driving with the wind in
your hair" sung at ~1:02 over the couple selfie). Root cause: the body builder timed each
clip by its Gemini highlight length, ignoring the timestamped lyrics that are already
computed (Get Timestamped Lyrics → Compute Line Boundaries).

**Fix:** two nodes reworked to slave clip timing to the lyric line timestamps.
- **Align Clips to Sections (v4)** — builds `aligned_clip_sequence`: each clip pinned to the
  window `[lyric line start → end]`, gapless (boundaries set on real line start times,
  proportional clip→line mapping). Falls through to legacy if no clips/lyrics.
- **Creatomate body builder (v4.1)** — consumes `aligned_clip_sequence` (places clips at their
  pinned time/duration). Short video clips: footage extended, then last frame holds to fill
  the window (no gaps). Keeps hard duration cap. Legacy back-to-back stack kept as fallback.
  Black pre-vocal intro intentionally kept (future: optional greeting-intro upload, PDF Area 4).
- **v4.1 ending (user-requested):** slow fade-out. `OUTRO_TAIL` (4s) extends the final clip a
  few seconds into the song's instrumental outro so the picture + music fade **together** over
  `OUTRO_FADE`/`AUDIO_FADE` (5s each), instead of cutting at the last word. Capped by the real
  Suno song length + hard cap so there's no silence/overrun. Tuning knobs at top of node.

Full code for both nodes is in the chat transcript (Align v4 + body builder v4.1). Limit:
section/line-level sync, not word-perfect. Verify via the `Align v4:` log lines.

## Why this fixes "the audio is off"
- The **music** now derives from the same emotional read that already drives the lyrics.
- **Voice** is deterministic, killing the most common mismatch.
- Mood is 5 real characters instead of 3 buckets, and Claude adds footage-appropriate
  instrumentation/tempo — so a wedding sounds like a wedding and a birthday sounds like
  a party.
