# Output format

The harvest has to satisfy two readers at once: the concept-service pipeline, which consumes it
as data and has a fixed schema, and a person checking whether the research is honest, who needs
to click through to the source.

The shape below does both. It is a **superset** of the pipeline's existing `OBS_SCHEMA`: the two
fields the pipeline already reads are present with the same names and the same meanings, and
everything else rides alongside where the pipeline ignores it and a human does not.

## What the pipeline already takes

`concept-service/src/pipeline.js` defines the harvest stage's output as:

```js
const OBS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    observations: {
      type: 'array', minItems: 15, maxItems: 24,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string' },
          insight_family: { type: 'string' },
        },
        required: ['text', 'insight_family'],
      },
    },
    notes: { type: 'string' },
  },
  required: ['observations', 'notes'],
};
```

Two things follow from this, and both matter.

**`additionalProperties: false`.** The pipeline's own harvest stage cannot emit extra fields. So a
harvest with provenance does not travel as `OBS_SCHEMA` output. It travels as the **research
brief** the run reads before harvesting, which is free-form markdown. That is why the file below
specifies both a JSON payload and a markdown rendering: the JSON is the record, the markdown is
what the pipeline actually sees.

**15 to 24 observations.** That is the pipeline's range for an imagined harvest. A real harvest is
allowed to come back smaller, and often should. If the evidence yields nine solid observations,
return nine and say so. Do not pad to fifteen. Padding is exactly the failure this skill exists
to prevent.

## The record

```json
{
  "client": "Northmoor Coffee",
  "persona": "Home espresso beginners, 28 to 40",
  "harvested_at": "2026-09-04",
  "harvested_by": "audience-harvest",
  "observations": [
    {
      "text": "pulled four shots before work and threw all four away, then just made instant",
      "insight_family": "the beginner's shame spiral",
      "quote": "i pulled 4 shots this morning before work, dumped every one of them, and ended up making instant coffee like a clown. 600 dollar machine.",
      "source_url": "https://example-forum.com/threads/espresso-beginner-rage.12345/post-98",
      "source_platform": "forum",
      "source_detail": "HomeBaristaTalk, thread 'anyone else about to give up'",
      "written_at": "2026-07",
      "agreement": "41 replies, top-voted post in thread",
      "harvest_prompt": "the 6 A.M. moment (alarm, first thoughts)"
    }
  ],
  "families": [
    { "name": "the beginner's shame spiral", "count": 4, "note": "spending real money then failing publicly at home" }
  ],
  "coverage": {
    "sources_searched": ["web search", "HomeBaristaTalk", "YouTube comments", "Hacker News"],
    "sources_skipped": [
      { "source": "Reddit", "why": "no signed-in session on this machine, anonymous endpoint returns 403" }
    ],
    "quotes_collected": 63,
    "quotes_kept": 17,
    "families_found": 5,
    "thin": ["nothing found for the parked-car prompt", "only one quote from a woman over 40"]
  },
  "notes": "Ran the six strongest harvest-bank prompts across four sources. The shame spiral family is the densest by far and is where the batch should probably start."
}
```

### Field by field

| Field | Required | What it is |
|---|---|---|
| `text` | yes | The observation, as the concept generator needs it. Their register, tightened to the recognisable moment. This is the field the pipeline reads. |
| `insight_family` | yes | The underlying observation this belongs to, in plain language. The pipeline caps a batch at two concepts per family, so this field directly shapes batch diversity. |
| `quote` | yes | Verbatim, exactly as written. Typos, lowercase, swearing left in. Never tidied. |
| `source_url` | yes | The link. **No URL, no observation.** |
| `source_platform` | yes | One of: forum, review, youtube, hn, qa, app-store, retail, reddit, twitter, other. |
| `source_detail` | no | Which community and thread, so a reader can orient without clicking. |
| `written_at` | no | Roughly when, at month precision. An observation from four years ago may describe a behaviour that has moved on. |
| `agreement` | no | Upvotes, replies, likes. A weak but real signal that the moment is shared rather than one person's. |
| `harvest_prompt` | no | Which harvest-bank prompt found it. Useful for spotting which prompts are productive for a category. |

### Why `quote` and `text` are separate

`quote` is evidence. `text` is the thing the generator builds on. Keeping them apart is what makes
the harvest auditable: anyone can read both and judge whether the second is a fair reading of the
first.

Collapsing them fails in both directions. Using the raw quote as `text` drags in throat-clearing
and context nobody else shares. Using the tightened `text` as `quote` destroys the evidence, and
at that point nothing distinguishes a harvested observation from an invented one.

## The markdown the pipeline reads

The run injects research as markdown. Render the harvest like this, and lead with the coverage
note so the model reading it knows what the harvest does and does not cover before it reads a
single observation.

```markdown
## Audience harvest, Northmoor Coffee, home espresso beginners 28 to 40
Harvested 2026-09-04. 17 observations kept from 63 collected, across web search,
HomeBaristaTalk, YouTube comments and Hacker News. Reddit was NOT covered: no signed-in
session on this machine. Thin: nothing for the parked-car prompt, and only one quote from
a woman over 40.

These are REAL sentences real people wrote in public, each with its source. Prefer them
over anything you would otherwise imagine. Where a family below is thin, it is thin in the
evidence, not in the world, so do not treat its absence as proof.

### the beginner's shame spiral (4)
- pulled four shots before work and threw all four away, then just made instant
  > "i pulled 4 shots this morning before work, dumped every one of them, and ended up making
  > instant coffee like a clown. 600 dollar machine."
  forum, HomeBaristaTalk, 2026-07, 41 replies. https://example-forum.com/threads/...

### the hidden second purchase (3)
- ...
```

Two properties of that rendering matter. **The quote is visible**, so the model writing concepts
can hear the actual register rather than a summary of it. And **the coverage note comes first**,
so a thin harvest reads as thin instead of reading as the whole truth about an audience.

## Handing it to the pipeline

The pipeline's own harvest stage stays where it is. It is given this brief and told to prefer
sourced observations, so:

- An observation with a `source_url` is evidence and should survive into the batch.
- The stage may still add imagined observations to fill gaps the harvest left, but it must not
  present them as sourced, and the batch is stronger the fewer of them there are.
- Where the harvest and the model's instinct disagree, the harvest wins. It has a URL.

## The one rule that outranks the format

If a field cannot be filled honestly, the observation does not ship. An observation with an
invented URL is worse than no observation at all, because the whole value of this file is that
someone can check it.

A harvest that returns nine observations and an honest coverage note is a good harvest. A harvest
that returns twenty-four, four of which nobody could trace, has poisoned the other twenty.
