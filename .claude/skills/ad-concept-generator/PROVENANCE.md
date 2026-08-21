# Provenance and redaction notes

**Author:** Ricardo Mestae. **Version:** v4, sent 2026-08-19 ("new skill for the concept writer with
this morning's feedback"). Installed here from `ad-concept-generator (1).skill`, the v4 bundle. A v3
bundle also exists; v4 supersedes it and adds the batch composition targets.

## This copy is redacted

This repository is **public**. The original bundle names four client accounts and one account's
internal batch-survival outcome. In this copy those are generalized to role descriptors:

| Original | Here |
|---|---|
| the telehealth account | "a telehealth brand", "the brand", "this brand" |
| the parenting app | "a parenting app", "the app" |
| the two social-growth tools | "a social-growth tool" |

24 occurrences across `SKILL.md`, `references/craft-rules.md`, `references/creative-strategist.md`,
and `references/libraries.md`. **Every craft rule, threshold, quota, and number is unchanged** — only
the names moved. The examples still teach the same thing, because the lesson was never the client's
name; it was the shape of the creative leap.

**The unredacted original lives outside this repo** at
`_vault-local/skills/ad-concept-generator/`. Use that one when running the skill for real, so the
worked examples keep their full context. If we ever make this repo private, replace this copy with
the vault copy and delete this file.

## What the skill needs that this repo does not supply

Step 1 ("Intake & brand analysis") expects a brand snapshot: product and USPs, personas, voice, real
proof points, compliance rules, accent colour and font. Ricardo's answer on where that comes from:

> "yes, that's what the marketing report is for — so the marketing report gets generated and used as
> a reference for this along with the concept vehicle library"

So the intended input chain is **marketing report + `references/libraries.md` (the vehicle library)
→ this skill**. The vehicle library ships in this bundle. The marketing report does not: it is a
separate generator, and until it exists the skill falls back to its own web-search intake, which is
slower and thinner than reading a report we already hold.

Step 2 ("Library check") wants every prior concept for the client, to dedup at observation level
rather than benefit level. That means the concept archive has to be queryable per client.

Step 3 ("Performance filter") wants CPA by hook, angle and format. That is ad-account data, not
brand data.
