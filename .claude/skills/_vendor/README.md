# Vendored skills

Third-party skills copied into this repo so the whole team gets them from a clone, rather than
each person installing them separately and drifting.

**These are copies. Do not edit them in place.** If one needs changing, either upstream the change
or fork it under a new name, so the next re-vendor does not silently revert your edit.

| Skill | Upstream | License | Why we took it |
|---|---|---|---|
| `emil-design-eng` | [emilkowalski/skills](https://github.com/emilkowalski/skills) | MIT | UI polish and the invisible details. The closest thing to a house standard for how our pages should feel. |
| `apple-design` | emilkowalski/skills | MIT | Motion and interaction foundations: springs, interruptible transitions, gesture UI, typography. |
| `animate` | emilkowalski/skills | MIT | Builds an animation by making the decisions in the order that matters, instead of reaching for a duration first. |
| `review-animations` | emilkowalski/skills | MIT | Critiques motion that already exists. Use on a page before it ships. |
| `improve-animations` | emilkowalski/skills | MIT | Audits a whole codebase's motion rather than one component. |
| `find-animation-opportunities` | emilkowalski/skills | MIT | Finds where motion would earn its place. Pairs with the two above. |
| `animation-vocabulary` | emilkowalski/skills | MIT | Reverse glossary: turns "the bouncy thing when a popover opens" into the actual term. Useful when briefing a designer or a model. |
| `prototype` | emilkowalski/skills | MIT | Builds several genuinely different versions of a UI piece behind a picker so you can flip through and choose. Matches how we already work when a direction is not settled. |
| `frontend-ui-engineering` | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | MIT | The one design-adjacent skill from that set: an AI-aesthetic checklist, real breakpoint checks, accessibility. |
| `interview-me` | addyosmani/agent-skills | MIT | One question at a time until the underlying intent is clear, instead of quietly filling in an ambiguous brief. Our expensive misses have all been underspecified asks, so this is the highest-transfer thing in that repo for us. Fits onboarding intake and any brief that arrives thin. |

License texts are kept beside this file, unmodified, as the MIT terms require.

## What we deliberately did NOT take

**The other 24 skills in `addyosmani/agent-skills`** (TDD, code review, debugging, CI/CD, planning,
security, and so on). They are good, but they encode general engineering practice that Claude Code
already applies, and a directory of skills nobody runs makes the ones that matter harder to find.
Pull an individual one if a real need turns up.

**`emilkowalski/skills`: `write-swift`, `animate-expo`, `ask-sonner`, `pick-ui-library`.** Wrong
stack. We ship single-file vanilla HTML, CSS and JS. No Swift, no React Native, no component
library to pick.

**[Panniantong/agent-reach](https://github.com/Panniantong/agent-reach)** (MIT). This is the right
shape for audience research and it is why `audience-harvest` exists, but it is **one skill, not a
skill library**, and the skill file alone is useless: it is a routing table for an `agent-reach`
CLI plus a stack of third-party CLIs it does not ship. Vendoring the SKILL.md without all that
would produce an agent confidently running commands that do not exist.

Four things to know before anyone installs it:

- Its most valuable platforms for us (Reddit, Twitter, Instagram, Facebook) all route through
  either a browser extension riding a logged-in desktop Chrome session, or session cookies
  hand-exported with Cookie-Editor. None of that runs headless on our VPS.
- The documented install path is "paste a raw.githubusercontent.com URL to your agent and let it
  run", and `agent-reach install --system` is what writes into your skills directory and
  pipx-installs third-party CLIs. The default install is check-only and will not write without
  that flag, which is to their credit, but it is still remote instructions driving local installs.
- **The skill instructs the agent to phone home for a version check after each substantial task
  and then prompt you to paste an update URL.** That is vendor marketing embedded in an agent
  instruction file. Strip it if we ever borrow from this.
- Roughly a third of its surface is China-market (XiaoHongShu, Bilibili, V2EX, Xueqiu) and its
  reference files are Chinese prose, which is fine for a model and awkward for a person debugging
  it at 6pm.

Three genuinely portable, zero-dependency ideas were lifted from it into `audience-harvest`
instead of taking the package: the page reader as a URL proxy (`https://r.jina.ai/<url>`, which
we then measured and found DOES clear an IP block), `yt-dlp --write-auto-sub --skip-download` for
creator and competitor transcripts, and the multi-backend retry-chain discipline with its rule
that an exit code is not proof of success, non-empty content is.
`audience-harvest/references/sources.md` carries all of it.

**[dietrichgebert/ponytail](https://github.com/dietrichgebert/ponytail)** (MIT). Six code-review
and technical-debt skills. Real, but engineering craft rather than the design or research we were
looking for. Revisit if we want a standing review pass on the services.

**[Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify)** (Apache-2.0 plus MIT). Not
a skill collection. It is a tool that builds a navigable knowledge graph of a codebase and installs
a single skill to make an assistant use that graph. Plausibly useful against our two 400KB
single-file HTML apps, where navigation genuinely is the problem, but it is a tool to trial rather
than a skill to copy, and it is a YC-backed product with a hosted tier, so read the terms before
depending on it.

## Re-vendoring

Nothing automated. Clone the upstream repo, copy the skill directory over the one here, and check
the license file is still current. Note the date and the upstream commit in the commit message so
the next person can tell how stale these are.

Vendored 2026-09-04.
