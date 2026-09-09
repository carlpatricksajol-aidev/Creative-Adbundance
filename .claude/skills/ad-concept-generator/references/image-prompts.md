# Image-gen prompts for the 9:16 mockup stills

Optional add-on: one image prompt per concept to fill the reserved 9:16 space (via GPT Image 2 / Nano Banana,
e.g. Higgsfield). Follow the UGC prompt-writer conventions, with one deliberate override available: baking in
a **hook-caption overlay** in the brand's caption style.

## Writing style (UGC realism)

- Write each prompt as a single continuous plain-text block, in English, no lists/markdown inside the prompt.
- Prioritize authentic TikTok-UGC smartphone realism: natural light, iPhone-style exposure and compression,
  slight imperfections, real skin texture, casual/handheld framing. Avoid cinematic lighting, HDR, heavy
  grading, studio polish, beauty filters, excessive bokeh.
- Be highly specific about environment, framing, body language, wardrobe, expression, and what is/isn't in
  frame. If only hands or a partial body are visible, say so.
- Use generic, realistic app screens — no trademarked UI or logos — unless the brand explicitly wants its
  own UI and it can be shown realistically.
- 9:16 vertical. Scene = the concept's hero frame (its most iconic single moment).

## Hook-caption overlay (TikTok native, punchy)

The hook caption is the first thing anyone judges the concept by, so it does one job: say the core
message at a glance. Not the anecdote, not a sentence from the narrative, not a paragraph.

- **Eight words or fewer.** Two short lines at most on a phone. If it needs a third line it is a
  description, not a hook.
- **The core message, in the persona's own voice.** First person, present tense, the way the person
  in the ad would say it out loud. A reader who sees only the caption should know what the ad is
  about (the pain, the outcome or the claim), not just be intrigued.
- **Punchy over pretty.** A blunt line beats a clever one. Test: read it in one breath.
- **Native TikTok caption style.** Bold white sans-serif on black rounded caption pills, one pill per
  line, centred, in the upper third of the frame, clear of any platform header. No brand-coloured
  boxes, no headline typography, no lower-third bars.
- Compliance-safe: curiosity or pain-recognition, second person allowed, no audience-shaming,
  offers phrased as allowed. Keep the hook on the still only, never on the concept slide.

Passes: "Nobody in my own town could find me" · "I spent months hiding my wrist" · "My mom
thought I had a problem" · "I said no to plans for a month" · "Fake shoes cost me more than real
ones".

Fails: "A woman at a party spent months looking for a photographer. I shot her sister's wedding."
(the anecdote, three lines) · "She Was Looking For Someone Like Me" (a title, says nothing about
the ad) · "The most expensive shoes you'll ever buy are the fake ones" (eleven words, a slogan).

**Where the caption is drawn.** When a build system wraps the still in a story frame (the
concept-service does), the frame draws the caption itself in this style from the `Hook overlay:`
line, and the image prompt must describe a still with NO text in it at all, with the upper third
kept visually calm for the caption to land on. Only when the still is the final asset with no
frame does the prompt render the caption, and then it describes exactly the style above: e.g.
"Centred in the upper third, clear of the top edge, a native TikTok-style caption on black rounded
pills with bold white sans-serif text reading "[HOOK]"."

## Deliverable shape

Deliver as a doc with, per concept: the concept number + title, a `Hook overlay:` line, then the continuous
prompt block. This keeps each prompt copy-pasteable while staying navigable.

## Example (adapt tokens to the brand)

Concept: 001_We Can Leave the House Again
Hook overlay: "I said no to plans for a month"
Prompt: Vertical 9:16 authentic smartphone POV shot from a parent's perspective in a bright entryway, one
hand loading a diaper bag onto a stroller in soft natural daylight, a cozy lived-in home slightly out of
focus behind, real textures and mild iPhone compression, casual handheld framing, no cinematic grading,
the upper third of the frame plain wall and doorframe with nothing important in it, no text or lettering
anywhere in the image. Grounded, unpolished, realistic UGC look.
