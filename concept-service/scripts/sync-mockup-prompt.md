# Syncing the concept-visualizer prompt

The image prompt for concept mockups is **not in this repo**, on purpose. It is Carl's own
"CONCEPT VISUALIZER, Master Instructions (v5)" spec, it lives in the team's PRIVATE
`creativeadbundance/adbundance-os`, and this repo is public. `src/mockup.js` reads it at runtime
from the shared vault instead, the same way `src/pipeline.js` reads its craft from the mounted
skill checkout.

## Where it lives

| Copy | Path | Role |
|---|---|---|
| Source of truth | `adbundance-os` `runner/skills/lib/mockupPromptAgent.js`, the `ROLE_SYSTEM_PROMPT` constant | The team's, private |
| Their second copy | `adbundance-os` `lib/mockupPromptAgent.ts` | Hand-mirrored by them for the Next.js route |
| Ours | `/vault/system/mockup/concept-visualizer.md` in the `adbundance-os_vault` volume | Read at runtime, never committed here |

Their own file says: *"If the prompt text below changes, change it in BOTH files, identically."*
We are a third reader of the same text, so it needs re-copying when they revise it. There is no
automation for this and it should stay that way until the prompt settles, because a silent
auto-sync of a prompt is how three copies drift without anyone noticing.

## Re-copy it

From a machine with the private repo checked out:

```bash
# 1. extract the constant verbatim
node -e '
const fs=require("fs");
const src=fs.readFileSync("runner/skills/lib/mockupPromptAgent.js","utf8");
const m=src.match(/const ROLE_SYSTEM_PROMPT = `([\s\S]*?)`;\n/);
if(!m) throw new Error("ROLE_SYSTEM_PROMPT not found, did they rename it?");
fs.writeFileSync("concept-visualizer.md", m[1]);
const t=src.match(/export const TEXT_TREATMENTS = \[([\s\S]*?)\];/);
fs.writeFileSync("text-treatments.json", JSON.stringify([...t[1].matchAll(/"([^"]+)"/g)].map(x=>x[1]),null,2));
'

# 2. put both in the vault
scp concept-visualizer.md text-treatments.json root@<vps>:/tmp/
ssh root@<vps> 'docker cp /tmp/concept-visualizer.md concept-service:/vault/system/mockup/ && \
                docker cp /tmp/text-treatments.json concept-service:/vault/system/mockup/ && \
                rm -f /tmp/concept-visualizer.md /tmp/text-treatments.json'
```

No restart is needed. The file is read fresh on every mockup run, so the next run picks it up.

## If it is missing

`src/mockup.js` fails loudly rather than falling back to an invented prompt:

> missing mockup prompt concept-visualizer.md at /vault/system/mockup/concept-visualizer.md.
> It is not in this repo on purpose; copy it from the team's adbundance-os ...

That is deliberate. A house prompt this specific cannot be approximated, and a mockup generated
from a guessed prompt would look like a different agency made it.

## The durable fix

Three hand-mirrored copies is two too many. The real fix is a checkout of `adbundance-os` on the
VPS, mounted read-only into this service the way the skill checkout already is, so there is one
file and a `git pull`. That needs a deploy key for a private repo, which is Carl's call.
