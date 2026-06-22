# Video Ad Assembly — Storyboard & Footage Spec

*What a creative strategist hands over so the system can auto-assemble the edit (editable Premiere XML + caption SRT) with minimal cleanup.*

---

## TL;DR

Per ad, hand over **two things**:

1. A **structured storyboard** — labeled text or a Notion **database**. **Not a screenshot, not a free-form table.**
2. A **footage folder** (Dropbox link) where every b-roll file is **named exactly** as the storyboard references it.

One ad = one folder. That's the whole contract.

---

## Why structured text, not a screenshot or a boxes/columns table

The system reads the storyboard as **data**, not as a picture. We tested this on a real one: a storyboard exported as a PDF table came through as a jumbled run-together stream — `Scene Script Line Overlay Footage Name Shot List Explanation Hook 1 Here are 5 reasons...` — and a human had to guess which words belonged to which field. A screenshot is worse (it needs OCR).

A labeled, line-based format is unambiguous → fewer assembly errors → less work for Ricardo/Jessica in Premiere. The visual table is great for *humans*; for the machine it just adds risk.

---

## The assembly folder (one per ad)

```
<Brand>_<ConceptID>/
  storyboard.md            ← the structured storyboard (or a Notion database export .csv)
  concept.pdf              ← OPTIONAL: the concept slide, for human reference only
  footage/
    aroll/                 ← talking-head takes (creator speaking to camera)
    broll/                 ← b-roll clips, NAMED to match the storyboard
```

- **One ad = one folder.** Never put two different concepts' footage in the same folder.
- The Dropbox link you submit points at this folder.

---

## The storyboard format

A **header block**, then **one record per scene**.

### Header

| Field | What it is |
|---|---|
| `CONCEPT` | Short title of the ad |
| `BRAND` | Client name |
| `FORMAT` | `talking-head listicle` \| `interview` \| `podcast` \| `UGC discovery` \| … |
| `DURATION` | Target seconds, e.g. `30-35` |
| `AUDIO` | `creator` (the on-camera voice carries the ad) **or** `generated` (we create the voiceover) |
| `END CARD` | The closing CTA text + URL (e.g. *Book a consultation at helloinnerwell.com*). Used for the closing line/caption. Any end-card **visual** must be a provided asset — see footage rules; the system does not generate end cards. |
| `HOOKS` | Talking-head only: one line per hook variant to A/B |

### Per scene (one block each)

| Field | What it is |
|---|---|
| `SCENE` | id: `Hook`, `1`, `2`, … `CTA` |
| `TYPE` | `talkinghead` \| `broll` |
| `LINE` | The spoken line for this scene (see the rule below) |
| `FOOTAGE` | `broll` → the **exact filename(s)** in `footage/broll/`. `talkinghead` → `-` |
| `NOTE` | Optional, e.g. *slow zoom on product*, *emphasize 100%* |

> **The LINE rule (important):** `LINE` is the **intended script**. It drives the **structure** and **which b-roll goes where** — it is **not** the final on-screen caption. For talking-head, the creator may ad-lib slightly; that's fine, the system captions from the **actual recorded audio**. Write the line as you expect it delivered; small differences are handled automatically.
>
> **One scene = one take.** Keep each scene to a single continuously-spoken line (roughly one breath). The system matches each scene's line to **one** take. If a thought is two sentences the creator delivers as two separate takes (e.g. a value line *then* the "book a consultation…" CTA), make them **two scenes** — otherwise the match confidence drops and it gets flagged.

---

## Footage naming rules (this is the part that makes or breaks it)

1. **B-roll filenames must match the storyboard `FOOTAGE` field exactly** (minus the extension).
   - Convention: lowercase, words joined by underscores, descriptive.
   - Storyboard `FOOTAGE: 3rdpov_creator_drinking_coffee` → file `footage/broll/3rdpov_creator_drinking_coffee.mov`.
2. **Two clips in one scene?** List both, comma-separated, and provide both files: `FOOTAGE: 3rdpov_creator_exercising, 3rdpov_creator_doing_hobby`.
3. **Talking-head takes go in `footage/aroll/`.** Naming is flexible — the system transcribes them and matches each line by content — but:
   - Keep **one concept per folder**. (On a real run, two wardrobes from two different ads were in one folder and the system started assembling the wrong one.)
   - Ideally **one line/section per take file**, with several takes of that line. The system keeps the best take.
4. **Vertical 9:16 footage.** Any resolution / frame rate is fine — the system normalizes everything to 1080×1920 / 30fps / Rec.709.
5. **Missing b-roll?** If the storyboard calls for a clip you don't have, either leave `FOOTAGE` blank (the system cuts to the talking head for that line) or note it. Don't invent a filename that has no file.
6. **End cards / closing graphics come from your assets — the system does NOT generate them.** Everything the system uses comes from the Dropbox folder. If you want an end card or closing graphic, put the file in `footage/broll/` and reference it as a scene's `FOOTAGE` (a normal `broll` scene). No asset = the closing is just the spoken CTA over the talking head.

---

## Worked example — Innerwell (talking-head, creator audio)

`Innerwell_118/storyboard.md`:

```
CONCEPT: 5 Reasons Why I Regret Doing Ketamine Therapy
BRAND:    Innerwell
FORMAT:   talking-head listicle
DURATION: 30-35
AUDIO:    creator
END CARD: Book a consultation today at helloinnerwell.com
HOOKS:
  - Here are 5 reasons why I regret ketamine therapy for my depression.
  - I seriously didn't expect ketamine therapy to affect my life in these ways.
  - Things nobody warns you about before ketamine therapy.

SCENE: Hook | TYPE: talkinghead | FOOTAGE: -
  LINE: Here are 5 reasons why I regret ketamine therapy for my depression.

SCENE: 1 | TYPE: broll | FOOTAGE: 3rdpov_creator_doing_hobby
  LINE: One, I started doing things I loved again, like taking walks and journaling.

SCENE: 2 | TYPE: broll | FOOTAGE: 3rdpov_creator_drinking_coffee
  LINE: Two, I actually texted people back and my friends and family stopped getting left on red.

SCENE: 3 | TYPE: broll | FOOTAGE: 3rdpov_creator_exercising
  LINE: Three, I stopped gaining weight from antidepressants that weren't even working.

SCENE: 4 | TYPE: broll | FOOTAGE: 3rdpov_car_parked_outside_home
  LINE: Four, I wasn't spending too much on gas from driving back and forth to clinics anymore.

SCENE: 5 | TYPE: broll | FOOTAGE: 3rdpov_creator_staring_at_ceiling
  LINE: Five, I stopped planning my life around my depression.

SCENE: 6 | TYPE: broll | FOOTAGE: 1stpov_scrolling_innerwell_website
  LINE: And it's all thanks to Innerwell.

SCENE: 7 | TYPE: talkinghead | FOOTAGE: -
  LINE: Their at-home ketamine therapy helped me break through depression that years of talk therapy and SSRIs never fully touched.

SCENE: 8 | TYPE: talkinghead | FOOTAGE: -
  LINE: Everything felt personalized to me, from the treatment plan to the support I got from their licensed clinicians and care team.

SCENE: 9 | TYPE: talkinghead | FOOTAGE: -
  LINE: Honestly, my biggest regret is waiting this long to try something different.

SCENE: 10 | TYPE: talkinghead | FOOTAGE: -
  LINE: If therapy or antidepressants still haven't fully helped, Innerwell might be worth exploring.

SCENE: CTA | TYPE: talkinghead | FOOTAGE: -
  LINE: Book a consultation today at helloinnerwell.com.
```

`footage/aroll/` holds the creator's takes; `footage/broll/` holds:
`3rdpov_creator_doing_hobby.mov`, `3rdpov_creator_drinking_coffee.mov`, `3rdpov_creator_exercising.mov`, `3rdpov_car_parked_outside_home.mov`, `3rdpov_creator_staring_at_ceiling.mov`, `1stpov_scrolling_innerwell_website.mov`.

---

## Worked example — Onsen (voiceover + b-roll, generated audio)

When the ad has **no on-camera talking head** and we generate the voiceover, every scene is `broll`, `AUDIO: generated`, and there's no `aroll/`.

```
CONCEPT:  Japanese Waffle Towels (discovery)
BRAND:    Onsen
FORMAT:   UGC discovery (voiceover + b-roll)
DURATION: 25-30
AUDIO:    generated
END CARD: Head to onsentowel.com and grab the bath bundles.

SCENE: Hook | TYPE: broll | FOOTAGE: ai_waffle_towels_japanese_bathroom
  LINE: If you've been to Japan, you know these towels.

SCENE: 2 | TYPE: broll | FOOTAGE: ai_multiple_japanese_bathrooms
  LINE: Every single hotel I stayed at had them.

SCENE: 3 | TYPE: broll | FOOTAGE: 1stpov_close_up_waffle_texture
  LINE: Waffle weave, lightweight, and it dries you instantly.

…
```

---

## Authoring in Notion

Keep Notion — strategists are comfortable there. Just make the storyboard a **database with columns**, not a screenshot of a table:

| Scene | Type | Line | Footage | Note |
|---|---|---|---|---|
| Hook | talkinghead | Here are 5 reasons… | - | |
| 1 | broll | One, I started doing things I loved… | 3rdpov_creator_doing_hobby | |
| 2 | broll | Two, I actually texted people back… | 3rdpov_creator_drinking_coffee | |

Put the header fields (Concept, Brand, Format, Duration, Audio, End Card, Hooks) at the top of the page. Then **export the database to CSV** (or share the API) — that's what feeds the system. One entry, two readers: the human view and the machine feed.

---

## Strategist checklist (before you submit the Dropbox link)

- [ ] One folder per ad, named `<Brand>_<ConceptID>`
- [ ] `storyboard.md` (or Notion CSV) present — text/database, **not a screenshot**
- [ ] Header filled: Concept, Brand, Format, Duration, **Audio (creator/generated)**, **End Card**, Hooks
- [ ] Every `broll` scene's `FOOTAGE` matches a real file in `footage/broll/`
- [ ] Talking-head takes in `footage/aroll/`, **one concept only**
- [ ] Footage is vertical 9:16

---

## Common mistakes (from real runs — avoid these)

- **Storyboard as a screenshot/visual table** → can't be read cleanly. Use text or a Notion database.
- **B-roll filename ≠ storyboard `FOOTAGE`** → the clip can't be auto-placed; ends up a manual job in Premiere.
- **Two concepts' takes in one folder** → the system assembles the wrong one. (Happened on Innerwell — two wardrobes were two different ads.)
- **Treating the storyboard script as the final caption** → captions come from the real audio; the script is a guide for structure + b-roll.
- **Calling for b-roll that isn't in the folder** → fine *if* you leave `FOOTAGE` blank (we cut to talking head), not fine if you name a file that doesn't exist.

---

*Output you get back per ad: an editable Premiere timeline (`.xml`), a caption file (`.srt`), a karaoke caption file (`.ass`), and a burned-in preview (`.mp4`) — full original clips linked, ready for a light pass.*
