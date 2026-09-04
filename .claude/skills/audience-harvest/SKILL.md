---
name: audience-harvest
description: >-
  Go and FIND what a brand's customers actually say, in their own words, from public sources
  (forums, review sites, YouTube comments, Q&A threads, Reddit and Twitter where access allows),
  and return them as sourced observations the ad-concept-generator can build concepts from. This
  is the research half of the concept pipeline's Step 4: instead of a model imagining what the
  ICP might say, this harvests real sentences real people wrote, each carrying the URL it came
  from. Use when the user asks to research an audience, harvest observations, find customer
  voice or voice-of-customer, "what do people actually say about X", or wants a batch grounded
  in real language rather than invented moments. Also use to refresh a stale harvest before a
  new batch. NOT for competitor ad research (that is the scraped-ad corpus) and NOT for brand
  facts like products and offers (that is the brand record and brand-refresh).
---

# Audience Harvest

The concept generator's single biggest quality lever is the observation harvest. Everything
downstream is built on it: an observation becomes a creative leap, which becomes a vehicle,
which becomes the ad. `references/libraries.md` in the ad-concept-generator says it plainly:
*"The harvest is the raw material; skip it and every concept degrades."*

Today that harvest is **imagined**. A model is asked to mine 18 to 22 observations for an ICP
and it writes plausible ones from its own head. Plausible is not the same as true, and the
difference shows up as concepts that feel like an agency wrote them.

This skill replaces imagination with evidence. Every observation it returns is a real sentence
a real person wrote in public, and it travels with the link.

## The standard, before anything else

An observation is **a behavior, thought, situation, conversation, or internet habit someone
would recognise in one second.** Not a benefit. Not an angle. Not a theme.

The pattern the craft rules teach, and the bar every harvested line must clear:

- Bad: "mental load." Good: "standing in front of the fridge trying to remember what I need to
  do tomorrow."
- Bad: "affordability." Good: "checked my bank account after the pharmacy, then again to make
  sure the number was right."
- Bad: "convenience." Good: "vacation in seven days and just realized I'm out."
- Bad: "personalization." Good: "if HRT providers had dating profiles..."

A harvested quote can fail this too. "This product changed my life" is a real sentence and a
useless observation. **Real is necessary, not sufficient.** Read `references/harvest-standard.md`
before judging any quote.

## Two hard rules

**1. Nothing invented may pass as harvested.** Every observation carries `source_url`,
`source_platform` and the `quote` it was drawn from. If you cannot produce the URL, the
observation does not go in the harvest. When a source will not yield real quotes, the honest
output is a short harvest that says so, not a long one padded with plausible inventions. A
padded harvest is worse than no harvest, because the whole point is that these are true.

**2. The quote and the observation are different fields.** `quote` is verbatim, exactly as
written, typos included. `text` is the observation as the concept generator needs it: tightened
to the recognisable moment, still in the customer's register, never translated into strategy
language. Never paraphrase into the quote field and never leave strategy language in the text
field.

## Sources, and what actually works

Read `references/sources.md` for the full routing table, the per-source query recipes, and the
current access reality. The short version, verified 2026-09-04:

**Open, no login, works from anywhere**
- Web search and any public page via a reader (the widest net, and where most forum threads
  are actually found)
- Hacker News via the Algolia API (free, no key), good for developer and founder audiences
- YouTube comments and transcripts
- App Store and Play Store reviews
- Public forums that do not block crawlers (Styleforum, brand-specific communities, Discourse
  instances)
- Q&A and complaint sites (Quora, complaint boards, BBB narratives)

**Login-gated, needs a signed-in browser on a desktop**
- **Reddit.** There is no zero-config path any more. The anonymous `.json` endpoint returns 403
  to datacenter IPs, and new official API applications are manually reviewed and largely refused.
  Access requires a real logged-in session. See `references/sources.md` for the two backends.
- **Twitter/X, Instagram, Facebook, LinkedIn.** Same shape: cookies from a signed-in browser.

**The consequence for where this runs.** A harvest that includes Reddit or Twitter must run on
a machine with those sessions, which in practice means a desktop, not the server. The server
can still run the open sources. Say which sources a given harvest actually covered; a harvest
that silently skipped Reddit and did not mention it is a lie by omission.

## Run

### 1. Frame the audience
From the brand record or the brief, write down: who this is for, what they are trying to do,
and the two or three situations their life puts them in around this category. If the brand has
a Batch Strategy Map, harvest per persona, not for a blur of everyone.

### 2. Build the query set
Work down the harvest bank in `references/libraries.md` of the ad-concept-generator. Each of
its prompts is a search strategy, not a writing prompt. `references/query-recipes.md` maps every
prompt to the source and the phrasing that finds it, plus the operators that surface real posts
instead of listicles.

The single most useful trick: **search for the language of the moment, not the category.** Nobody
writes "I struggle with mental load." They write "I keep forgetting the thing I told myself I'd
remember." Query the second.

### 3. Harvest wide, then cut
Collect far more than you need, at least three times the target, across at least four different
sources. A harvest drawn from one thread is one person's opinion wearing a crowd's clothes.

Record for each: the verbatim quote, the URL, the platform, roughly when it was written, and any
signal of how many people agreed (upvotes, likes, replies). Agreement is a weak but real signal
that the moment is shared rather than idiosyncratic.

### 4. Judge every quote against the standard
Run `references/harvest-standard.md`. Cut anything that is a review rather than a moment, a
benefit rather than a behaviour, or so specific to one person that nobody else would recognise
it. Rewrite what survives into the `text` field, keeping their words.

### 5. Cluster into insight families
Group by the underlying observation, not the situation and not the vehicle. The concept
generator caps a batch at two concepts per insight family, so a harvest that is really one
family in fifteen outfits will produce a monotone batch. Name each family in plain language.
Aim to come out with at least five distinct families.

### 6. Return the harvest
Output the JSON in `references/output-format.md`. It is deliberately a superset of the
concept-service `OBS_SCHEMA`: the `text` and `insight_family` fields are exactly what the
pipeline already consumes, and the provenance fields ride alongside so a human can check any
line back to its source.

Also return the coverage note: which sources were searched, which were skipped and why, how many
quotes were collected before cutting, and how many survived. That note is what makes the harvest
auditable rather than a wall of assertions.

## Where it goes

The harvest is research, and research in this ecosystem is written by an agent and read by the
service. `concept-service/src/research.js` reads the research library and never writes to it,
by design.

So the output of this skill becomes the research brief that the concept run reads. It arrives at
`stageHarvest` and `stageWrite` as the injected research markdown, where the Creative Director is
told to prefer sourced observations over invented ones. Nothing in the hot path changes.

## What this is not

- Not competitor ad research. What rival ads are saying lives in the scraped-ad corpus.
- Not brand facts. Products, offers, prices and compliance rules come from the brand record, and
  a web guess there would poison the generator.
- Not a substitute for talking to the client. The strongest observations in the finished decks
  came from the client's own meeting notes. This finds what the client cannot tell you: what
  their customers say when the brand is not in the room.

## Reference files

- `references/sources.md` — every source, its access reality, its query recipes, its limits.
- `references/query-recipes.md` — each harvest-bank prompt mapped to a real query.
- `references/harvest-standard.md` — how to judge a quote, with worked keep/cut examples.
- `references/output-format.md` — the exact JSON, and how it lines up with `OBS_SCHEMA`.
