# Running concept-service on your own machine

This is the service behind the Run for this client button: it runs the skills in
`.claude/skills/` and stores what they produce. A run is asynchronous, so
`POST /run` hands back a run id straight away and the page polls `GET /run/:id`.

Two things are deliberately not in this repository, and both will stop you if
nobody tells you first.

**The `.env` file.** It holds live keys, and this repository is public. Copy
`.env.example` to `.env` and ask Carl for the values. Every variable in the
example says what it is for and what stops working without it.

**The OS page.** `20-internal.html` carries every client name and every person
on the team, so it is not committed either. Without it the API works normally and
only `/os` is affected: signed out you get the sign-in page as usual, and signed
in you get a message naming the exact path the file belongs at. Ask Carl for it,
drop it at `concept-service/data/os/20-internal.html`, and reload. No restart.

## Getting it running

The fastest path has no Docker in it. There is one dependency, `pg`, and it is
only used by the onboarding form.

```bash
git clone https://github.com/carlpatricksajol-aidev/Creative-Adbundance.git
cd Creative-Adbundance/concept-service
cp .env.example .env          # then fill it in
npm install
mkdir -p data/os

DATA_DIR=./data \
SKILL_DIR=../.claude/skills/ad-concept-generator \
SCRIPT_SKILL_DIR=../.claude/skills/ad-script-writer \
STORY_SKILL_DIR=../.claude/skills/batch-shoot-package \
node src/server.js
```

It prints one line naming the models it will use, whether it found an OpenRouter
key, and where it is writing. Verified on 2026-09-14 with no keys at all: it
boots, `/health` answers, `/batches` is 401 without the token and 200 with it,
and `POST /run` fails with a named error rather than a stack trace. Then:

```bash
curl -s localhost:8900/health
curl -s -H "Authorization: Bearer $RUN_TOKEN" localhost:8900/clients | head -c 400
```

Two things that will bite before anything else. `DATA_DIR` has to be writable,
because six modules create directories under it the moment they load, so a bad
path kills the process before it ever listens. And leave `VAULT_ROOT` blank: with
no vault, commissioning a marketing report fails immediately and the run carries
on with what is already on file, which is what you want. If a vault exists with a
`system/queue` directory and nothing watching it, every run waits fifteen minutes
instead.

If you would rather use Docker, use the local compose file, not the production
one:

```bash
docker compose -f docker-compose.local.yml up --build
```

The production `docker-compose.yml` is shaped for the server and will not start
on a laptop: it joins a volume another stack owns, publishes no ports because
traefik reaches it over the docker network, and routes a live domain.

## Signing in to the page

The page is behind a sign-in, and the sign-in emails a six digit code. Locally
there is no mail key, so the code is printed to the terminal running the server:

```
[auth] no mail key set, so the sign-in code for you@creativeadbundance.com is: 123456
```

Your address has to be on the roster in `src/auth.js` or no code is issued at
all, and the response deliberately does not say so. Ask Carl to add you.

There is also `GET /auth/codes` with your `RUN_TOKEN`, which lists codes waiting
to be used.

## What you can do with which keys

Measured on 2026-09-14, so this is what actually happens rather than what the
table names suggest:

| You have | You can |
|---|---|
| Nothing | The service boots. `/health` answers. Everything else is 401. |
| `RUN_TOKEN` | Every route answers, but anything that generates is 503. |
| `+ OPENROUTER_API_KEY` | Model calls work, and cost real money. |
| `+ SUPABASE_ANON_KEY` | Clients resolve. `brand_brain`, `marketing_report` and `meeting_summary` read, so a snapshot builds and a batch generates. |
| `+ SUPABASE_SERVICE_KEY` | `knowledge_v_concept_approved` and `knowledge_vehicle_bank` return rows. With the anon key alone those two return zero rows, silently, and the concepts come out worse. |

The service key bypasses row level security on the whole project. Treat it like
a production password, and do not put it anywhere a browser can read it.

## Where the client data comes from

Five Supabase tables and nothing else, decided 2026-09-10:

| Table | What it is |
|---|---|
| `brand_brain` | everything on file about a client |
| `marketing_report` | that client's report, refreshed per batch |
| `meeting_summary` | their meetings, summarised, newest first |
| `knowledge_v_concept_approved` | every approved concept, in table form |
| `knowledge_vehicle_bank` | approved concepts turned into reusable vehicles |

`src/dossier.js` owns the first three and builds the snapshot every skill reads.
Do not add a sixth source without talking to Carl first.

## Adding an agent

An agent here is a stage: a function that calls a model with a schema and gets
structured output back. They live in `src/pipeline.js`, and `runDirect` is the
sequence the Run button uses.

Read `stageEvidence` in `src/pipeline.js` first. It is the clearest example and
shows every convention:

```js
const THING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { /* ... */ },
  required: [ /* every property you rely on */ ],
};

async function stageThing({ snapshot, log, ask }) {
  log('What this is called on the page', 'running');
  const out = await ask({
    system: `Who the model is. ${SKILL_PREFACE}\n\n${skillDoc()}\n${HOUSE_RULES}`,
    prompt: `${snapshot}\n\nWhat to do.`,
    schema: THING_SCHEMA,
    maxTokens: 16000,
  });
  log('What this is called on the page', 'done', `say what actually happened, with numbers`);
  return out;
}
```

Then call it inside `runDirect`, passing `ask: trackedAsk` so its spend lands in
the batch's cost, and put whatever it produced on the object `runDirect` returns
so the page and the record can see it.

Things that are not optional:

- **`ask()` for structured output, `askText()` for prose.** `ask` enforces a
  strict JSON schema, so anything you list under `required` is guaranteed.
  `askText` is for when a model should write the way a person writes, and the
  Creative Director pass uses it for exactly that reason.
- **The skill is the voice.** Put the actual skill in the prompt with
  `skillDoc()` or a named section with `skillSection()`. Do not paraphrase it.
  Rules that are really rules belong in code or in the client's brief, not
  bolted onto a prompt. Adding prose rules beside the skill has visibly bent the
  output before.
- **Report absence.** If a source is missing, say so in the `log()` line and in
  the record. A stage that quietly carries on is how a batch gets worse with
  nobody noticing.
- **Join numbers with `canonNum`, on both sides.** A concept is `1` in one place
  and `001` in another. `src/num.js` exists for this. Getting it wrong does not
  throw, it silently fails to match: it cost us three batches of scripts that
  shipped without ever being reviewed, while the log said they were clear.

## Testing without paying for a run

A full concept run is fifteen to twenty five minutes and a few dollars. Most of
the time you do not need one.

```bash
# the snapshot a client's skills will actually read
node -e "const b=require('./src/dossier');b.resolve('ThreadBeast').then(({record})=>console.log(b.toMarkdown(record).slice(0,2000)))"

# one stage, on its own, with a snapshot you already have
node -e "const p=require('./src/pipeline'); /* stages are exported for this */"

# what a document turns into before anything is imported
node -e "const f=require('./src/filetext');console.log(f.extractOrThrow({bytes:require('fs').readFileSync('some.docx'),filename:'some.docx'}).text.slice(0,500))"
```

`/upload` stores nothing, so it is free to hit as often as you like.

## Traps that have already caught someone

- **`src` is baked into the docker image.** Copying a file onto the server and
  restarting deploys nothing. A deploy is: push, pull on the server, rebuild.
- **Never rebuild while a run is in flight.** It kills the run after it has
  already been paid for. Check first:
  `grep -l '"status":"running"' data/runs/*.json`
- **A parameter and a `const` in the same block.** `startRun` had a parameter
  called `batch` and a `const batch` below it, which threw inside the temporal
  dead zone, after the model call, on every run.
- **PDFs are refused on purpose.** A hand written extractor was measured against
  four real PDFs: three gave no text and one gave mojibake. Word documents work.
- **Mockups cannot be reproduced locally.** The prompt they are written from,
  `concept-visualizer.md`, is deliberately not in this public repository, so the
  mockup routes will say it is missing however the keys are set.
