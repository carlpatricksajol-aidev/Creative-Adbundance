# Runbook: running the concept generator

Every command below was executed and confirmed on Windows 11 (Node v24.13.0, Python 3.14,
Office 16) before being written down. Where something does not work, it says so.

There is no web app and no server. A strategist runs this in Claude Code on their own
machine. That is the whole deployment.

---

## One-time setup, per machine

**1. Claude Code and the repo.**

```bash
git clone https://github.com/carlpatricksajol-aidev/Creative-Adbundance.git
cd Creative-Adbundance
```

The skill is at `.claude/skills/ad-concept-generator/`. Claude Code picks it up
automatically from any directory inside the repo, with no configuration. Confirm it with
`/ad-concept-generator` or just ask for concepts for a brand.

**2. An Anthropic API key.**

```bash
setx ANTHROPIC_API_KEY "sk-ant-..."      # Windows, then reopen the terminal
export ANTHROPIC_API_KEY="sk-ant-..."    # macOS or Linux
```

Use an **org API key**, one per person, not a shared subscription login. Reasons and cost
numbers are in the thread; the short version is that a concept batch costs roughly $2 to $4
on Opus 5, per-person keys give you per-strategist cost visibility, and sharing one
subscription account across the team is against the terms and collides on rate limits.

**3. The deck builder's one dependency.**

```bash
npm i --prefix .claude/skills/ad-concept-generator/scripts
```

Installs `pptxgenjs` (6.7 MB) *beside* `build_deck.js` on purpose: Node resolves
`require()` from the script's own directory, so installing it there means you never have to
set `NODE_PATH`. Gitignored, so every machine does this once.

That is the whole setup. Nothing else is required for steps 1 to 7.

---

## Running a batch

### Step A. Pull the brand snapshot

The skill's step 1 wants a brand snapshot. Do not type one by hand and do not let the model
research the brand from scratch when we already hold the answer.

```bash
cd .claude/skills/ad-concept-generator/scripts

node brand-snapshot.js --list                 # every name you can type
node brand-snapshot.js "ARMRA" > armra.md      # one client, as markdown
node brand-snapshot.js "ADR"                   # aliases work
```

83 brands are available. It reads Supabase `brand_brain` directly, so it works from a fresh
clone with no confidential files on disk. Matching is tiered (brand name, then client name,
then alias) and a typo gets you a "did you mean" rather than the wrong brand.

The output ends with an explicit `Empty in this record (do not invent): ...` line. That line
is load-bearing. It is what stops the model inventing a colour, a font, or a proof point
that the client never gave us.

### Step B. Run the generator

Open Claude Code in the repo and ask for the batch, pasting the snapshot in:

```
Run the ad concept generator for Accredited Debt Relief. Batch 3, 16 concepts.
Here is the brand snapshot:

<paste the contents of adr.md>

Prior batches to dedup against at observation level: <paste titles, or point at the deck>
```

The skill then runs its own eight steps. Steps 1 to 6 are pure model work over the five
reference files and behave identically on any OS. Expect it to take a while: the harvest,
the Creative Director pass over 16 concepts, and the strategist gate are each substantial.

**Do not skip the strategist gate and do not accept a conditional pass as a pass.** It is
the difference between this and a prompt. On the ADR Batch 3 run it caught a blank card that
would have read as implying a loan, cut a concept from three claims to one, and forced the
buy-now-pay-later objects to be unbranded so we would not repeat the Visa and Chase
disapproval that killed Batch 1's statics.

### Step C. Build the deck

Write the config (shape in `references/config-example.json`), then:

```bash
node build_deck.js my-batch.json                      # writes beside the config
node build_deck.js my-batch.json "C:/out/deck.pptx"   # or name the output
```

Passing an output path used to be mandatory; the default now writes next to the config
instead of a Linux sandbox path.

### Step D. Check it

The skill's step 8 as written does not run outside the Claude.ai container: `/mnt/skills`
does not exist, `soffice` and `pdftoppm` are not installed, and `present_files` is not a
Claude Code tool at all. Use these instead, which do the same job:

```bash
python validate_pptx.py deck.pptx
# OK  parts=51  slides=4  malformed=0

powershell -ExecutionPolicy Bypass -File render_pptx.ps1 -Pptx "C:/full/path/deck.pptx"
# renders every slide to PNG plus a PDF, using the installed PowerPoint, headless
```

Then actually look at the PNGs for the longest slides. There is no automated substitute for
that, and there never was: `pptxgenjs` text boxes do not autofit or clip, so overflow shows
up as text running toward the slide edge, never as a truncation a script can detect. The
`soffice` route has the identical blind spot, so nothing is lost here.

The cheaper guard is upstream: respect the content caps the layout was tuned for, which are
already the house rules. 2 to 3 sentences of description, 5 to 6 narrative beats, no more
than 4 design lines including the Duration line. A config that respects those does not
overflow, and the render becomes a confirmation rather than a search.

No PowerPoint on the machine? Upload the `.pptx` to Google Slides and page through it. That
is not a workaround, it is the delivery route the skill already names.

---

## Known limits, so nobody is surprised

- **Step 1's intended input does not exist yet.** Ricardo's design is *marketing report +
  vehicle library → skill*. The vehicle library ships here. The marketing report has no
  generator, so `brand-snapshot.js` is standing in for it. It covers product and USPs,
  personas, voice and compliance well; it does not carry a validated proof-point list, and
  colour and font are filled on roughly half the roster.
- **Step 2's library check is manual.** There is no queryable concept archive, so you paste
  prior batch titles in yourself. Until that exists, observation-level dedup depends on you
  telling the model what has already shipped.
- **Step 3's performance filter has no data source.** No table anywhere holds CPA by hook,
  angle or format. The skill defaults to Pain Point and Transformation angles and says so.
  `winning_concepts` and `losing_patterns` in the snapshot give a qualitative substitute.
- **Fonts.** Poppins is not installed system-wide on a typical machine here; it renders via
  the Office cloud font cache. PowerPoint therefore measures line wrapping correctly, but
  LibreOffice or a browser preview would substitute a face and mislead you about overflow.
  Install the Poppins TTFs if you want a renderer-independent check.
- **`brand-snapshot.js` depends on `brand_brain` being anon-readable**, which is also a
  security problem flagged separately in this project. If that table gets locked down, this
  script needs a small server-side proxy. Do **not** "fix" it by putting a service-role key
  in the script: service_role bypasses RLS on every table and grants writes, which would be
  strictly worse than today. The anon key it carries is already published in
  `static-ads-form/index.html`, so this file leaks nothing new, and both `SUPABASE_URL` and
  `SUPABASE_ANON_KEY` can be overridden by env var if the key rotates.

## If you want it hands-off later

The next step up from this is one shared runner rather than per-person setup: a small
service on the VPS that takes a client name, runs the skill headless with `claude -p`, and
posts the deck back to Slack. That needs an endpoint, somewhere to persist batches, and
auth. It is not needed to start; this runbook is enough for the team to use the generator
today.
