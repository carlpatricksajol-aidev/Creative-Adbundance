# vault-seed

The vault copy is authoritative. These are seed and recovery copies, so the
design is under version control and a rebuilt box can be put back together.

The service reads its craft from `MOCKUP_PROMPT_DIR`, default
`/vault/system/mockup`, fresh on every run. That is deliberate: editing the
design there changes every mockup from the next render onward with no deploy
and no restart. On the VPS the folder is a docker volume, reachable from the
host at:

    /var/lib/docker/volumes/adbundance-os_vault/_data/system/mockup/

It holds four files:

| file | in this repo | why |
|---|---|---|
| `story-frame.html` | yes, here | the story ad frame. Carl's design, no client data |
| `inter-latin.woff2` | no | a 47KB font binary, fetched (below) rather than vendored |
| `concept-visualizer.md` | **never** | Carl's IP, from a private repo. This repo is public |
| `text-treatments.json` | no | ships with the prompt above |

## The font

Embedded in every render so the type does not depend on the host's font
packages. `fc-match "Helvetica Neue"` on the render host resolves to DejaVu
Sans, which has no 600 weight and looks nothing like iOS, so without this the
frame renders in the wrong typeface with nothing erroring.

Inter is the SF Pro alike, SIL OFL 1.1, and variable, so one file covers 400
through 700. It is fetched rather than committed so the OFL license does not
have to be vendored alongside it:

    curl -sL -A "Mozilla/5.0 Chrome/150" \
      -o /var/lib/docker/volumes/adbundance-os_vault/_data/system/mockup/inter-latin.woff2 \
      "https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2"

Check it: the file starts with the four bytes `wOF2` and is about 48256 bytes.

## Editing the frame

Every `{{TOKEN}}` in `story-frame.html` is required. `storyframe.js` refuses to
render if one is missing, rather than shipping a frame with whatever a design
tool left hardcoded in it, which would put one brand's name on every client's
mockup.

After editing, reframe instead of regenerating. `POST /mockup/reframe` with a
`batchId` re-renders from the stills already on disk: no image model, no
kie.ai call, no spend.
