# Provenance and redaction notes

Covers all three creative skills in this repo: `ad-concept-generator`, `ad-script-writer` and
`batch-shoot-package`.

**Author:** Ricardo Mestae.

**ad-concept-generator: v6.2**, installed 2026-09-03, superseding the v4 bundle of 2026-08-19.
v6 restructures the pipeline from two agents to five: Strategic Analyst (Step Zero, the Batch
Strategy Map) then Creative Director, Creative Strategist, Feedback Review Agent (18 checks) and
the Compliance and Alignment Reviewer. It also adds the mandatory DR spine, the 25%-intensity
rule, dual scoring, positive-benefit-first messaging and the North Star intro slide.
**ad-script-writer** and **batch-shoot-package** are new at the same date.

## The one deliberate change to what Ricardo sent

The v6 bundle contradicted itself on narrative length. `SKILL.md` and
`references/creative-strategist.md` both specify **exactly 3** narrative bullets and exactly 3
design bullets; `references/craft-rules.md` still carried v4's "5-6 beats" and, twenty lines
later, "beat count (4-6)". v6 was taken as the authority, because it states the count twice and
explains why the compression exists (it forces the DR spine onto the slide instead of letting the
setup eat the whole beatboard). `craft-rules.md`'s Narrative section was updated to match and
says so in place. **If Ricardo intended 5-6 to survive, that one section is the only thing to
revert**, plus `narrative`'s minItems/maxItems in `concept-service/src/pipeline.js`.

Nothing else was changed on the way in.

## These copies are redacted

This repository is **public**. The original bundles name client accounts, named individuals, and
one account's internal batch-survival outcome. In these copies those are generalized to role
descriptors:

| Original | Here |
|---|---|
| the telehealth account | "the telehealth account", "a telehealth brand" |
| the parenting app | "the parenting app" |
| the two social-growth tools | "a social-growth tool" |
| the colostrum brand | "the colostrum brand" |
| the meal-service account | "the meal-service account" |
| the snack brand | "the snack brand" |
| a mobile-games app | "a mobile-games app" |
| a home-security brand | "a home-security brand" |
| an apparel-subscription brand | "an apparel-subscription brand" |
| the reviewing principal | "the agency principal", "the principal" |
| two client stakeholders | "the client's growth lead", "the client's brand lead" |
| two unreleased product lines | "an unreleased product line", "a pending-clearance cream" |

**Every craft rule, threshold, quota, score and number is unchanged.** Only the names moved. The
examples still teach the same thing, because the lesson was never the client's name; it was the
shape of the creative leap.

Ricardo's own name stays, as the author.

### The redaction is scripted, not hand-done

Hand-redacting twice is how the two copies drift. The vault is the source of truth and one script
is the only sanctioned path from it into this repo:

```
python .claude/skills/redact-skills.py          # write, then verify
python .claude/skills/redact-skills.py --check  # verify only
```

It walks the vault, applies an ordered substitution table, and then **fails loudly** if any
forbidden name survives in the output. Edit the vault, re-run it, commit. Never edit a skill file
in this repo directly: the next run of the script will overwrite it.

**The unredacted originals live outside this repo** at `../_vault-local/skills/<skill>/` (one
level ABOVE the repo, i.e. `C:\Clients\Creative Adbundance\_vault-local\...`). Use those when
running a skill by hand, so the worked examples keep their full context. If this repo ever goes
private, replace these copies with the vault copies and delete this file.

## How the service runs these skills

`concept-service` on the VPS does not execute a skill; it inlines the skill's reference files into
the system prompt of each stage and calls OpenRouter. The skill directories reach the container
through a read-only bind mount of the VPS git checkout (`/root/Creative-Adbundance` mounted at
`/srv/repo`), and every reference file is re-read on **every run**, uncached. So editing a
reference file plus a `git pull` on the VPS changes the craft on the next run, with no deploy and
no restart. That is the intended workflow: Ricardo edits the skill, nobody deploys.

Which files the service actually reads:

| Skill | Files read at runtime | Read by |
|---|---|---|
| ad-concept-generator | `craft-rules.md`, `libraries.md`, `creative-strategist.md` | `src/pipeline.js` |
| ad-script-writer | `writing-rules.md`, `dr-scorecard.md`, `output-format.md` | `src/scriptPipeline.js` |
| batch-shoot-package | `storyboard-format.md` | `src/storyboardPipeline.js` |

`SKILL.md` itself is never opened by the service. Its step sequence is re-implemented as the code
chain in each pipeline module, which is why a change to a pipeline's ORDER needs a deploy while a
change to its CRAFT does not. `image-prompts.md`, `config-example.json`,
`shooting-guide-format.md`, `production-plan-format.md` and `notion-gotchas.md` are for running
the skills by hand; nothing in the service reads them yet.

## The storyboard format is a machine contract, not a style guide

`batch-shoot-package/references/storyboard-format.md` documents rules that are **parsed by code**:
the five column headers, and the Footage Name rules. The footage renamer matches those headers by
exact string after trim and lowercase, in `FootageRenamer/lib/rename.js` and again in
`FootageRenamer/stage2.js`, which are kept in sync by hand.

Two consequences worth knowing before editing that file:

- A renamed or mistyped column header does not error. It silently empties that column, and a
  mistyped `Footage Name` turns every b-roll scene in a batch into a talking-head scene.
- A comma inside a Footage Name forks into phantom shots, because the cell splits on `+` **and**
  on `,`.

The generator does not trust the model on any of this. `src/storyboardPipeline.js` re-enforces the
contract in code after the model answers and logs every repair it had to make, so a silent
breakage becomes a visible line in the run log.

## What the skills still want that this repo does not supply

Step 1 ("Intake & brand analysis") expects a brand snapshot: product and USPs, personas, voice,
real proof points, compliance rules, accent colour and font. Ricardo's answer on where that comes
from:

> "yes, that's what the marketing report is for — so the marketing report gets generated and used as
> a reference for this along with the concept vehicle library"

The service now satisfies most of this from the Knowledge Layer via `src/dossier.js`, plus the
research library via `src/research.js`. The per-batch marketing plan generator (CA-03) is still
switched off, and the pipeline's `plan` rung says so honestly rather than pretending.

Step 2 ("Library check") wants every prior concept for the client, to dedup at observation level
rather than benefit level. `store.priorContext()` supplies this from previous batches.

Step 3 ("Performance filter") wants CPA by hook, angle and format. That is ad-account data, not
brand data, and nothing ingests it yet, so the filter degrades to the brand record's own
`winning_concepts` and `losing_patterns`.

The v6 Compliance and Alignment Reviewer wants four sources in priority order: the brand record,
the onboarding deck's "Critical information for Batch N" section, the latest meeting notes, and
the previous batch's client feedback. **The service can only give it the first.** It is instructed
to list what it could not read in `sources_missing` rather than guessing, so a review that ran
half-blind says so instead of reading like a full one.
