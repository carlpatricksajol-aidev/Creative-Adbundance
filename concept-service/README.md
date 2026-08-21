# concept-service

The API behind the **Run for a client** button on the internal OS. It runs the
`ad-concept-generator` skill's pipeline and stores the finished batch.

A run takes roughly twenty minutes, so this is deliberately asynchronous:
`POST /run` returns a run id straight away and the page polls `GET /run/:id`.
Every state change is written to disk, so a restart mid-run shows up as a failed
run rather than a request that never returns.

## Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | open; reports whether an API key is configured |
| GET | `/clients` | the 83 brands you can name |
| GET | `/batches?client=X` | finished batches, newest first |
| GET | `/batch/:id` | one finished batch |
| POST | `/run` | `{client, count}` → `{runId}`. 202. |
| GET | `/run/:id` | status, per-stage progress, and the batch when done |

Everything except `/health` needs `Authorization: Bearer $RUN_TOKEN`.

## The craft lives in the skill, not here

`src/pipeline.js` only sequences stages and holds each one to a shape. The rules
come from `references/craft-rules.md`, `references/libraries.md` and
`references/creative-strategist.md`, read at run time from the repo checkout
mounted at `/srv/repo`. Change the craft in the skill and the next run picks it
up. No rebuild.

## Deploy

```bash
cd /root/Creative-Adbundance && git pull
cd concept-service
cp .env.example .env && nano .env      # OPENROUTER_API_KEY and RUN_TOKEN are required
mkdir -p data
docker compose up -d --build
curl -s https://concepts.srv1486031.hstgr.cloud/health
```

## Why files and not Postgres

A studio makes a handful of batches a week. JSON on disk is readable with `cat`
when something looks wrong and adds no new credential to hand around. When this
needs querying across clients, move it then.

## Known limits

- `OPENROUTER_API_KEY` must be set or `/run` returns 503. It is the same OpenRouter
  account that powers static-ads, model `anthropic/claude-opus-5` by default, and every
  finished batch records what it cost in `cost_usd`.
- The brand snapshot comes from `brand_brain`, which is anon-readable today. If
  that table is locked down, this service keeps working (give it a key that can
  read) but the skill's standalone `brand-snapshot.js` will not.
- `MAX_CONCURRENT` defaults to 2. Each concurrent run is real API spend.
- The token is a shared secret, not a user identity. It stops a stranger who
  finds the endpoint spending our tokens; it does not tell you who ran what
  beyond the `requestedBy` string the page sends.
