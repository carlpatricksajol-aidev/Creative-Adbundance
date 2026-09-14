# Read this first

The map of the AdBundance OS: what exists, where it lives, how it ships, and
what state it is in. Written to be read by whoever picks this up next, person or
model. If something here is wrong, fix it here rather than carrying the
correction in your head.

Last true on **2026-09-14**.

---

## The three pieces

| Piece | Where it lives | In git? |
|---|---|---|
| **concept-service** | `concept-service/` in this repo, running on the VPS | yes |
| **The skills** | `.claude/skills/` in this repo | yes |
| **The two OS pages** | `../adbundance-os-client-view/` | **no** |

The pages are deliberately outside the repository and handed over directly. See
`../adbundance-os-client-view/CLAUDE.md`, which is the state doc for both of
them.

The service is one Node 20 process with a single dependency, `pg`, used only by
the onboarding form. No build step, no framework, no bundler. Same for the
pages: one HTML file each, plain JavaScript, edit and reload.

**The server.** `187.77.154.60`, checkout at `/root/Creative-Adbundance`,
container `concept-service`, port 8900 behind traefik at
`https://concepts.srv1486031.hstgr.cloud`. SSH key `~/.ssh/hostinger_vps`.

---

## How each thing ships

**A skill** ships by pushing to `main`. A cron on the VPS runs every ten
minutes:

```
*/10 * * * * cd /root/Creative-Adbundance && git pull --ff-only >> /var/log/skill-pull.log
```

The skills are read from disk on every call, so the next run uses the new text
with no restart. This also means `main` is production for skills within ten
minutes of a push. There is no staging.

**Service code** needs a rebuild on top of that pull, because `/app/src` is
**baked into the image**. Copying a file onto the server and restarting deploys
nothing, which has cost time before.

```
ssh -i ~/.ssh/hostinger_vps root@187.77.154.60 \
  'cd /root/Creative-Adbundance && git pull --ff-only && cd concept-service && docker compose up -d --build'
```

**Never rebuild while a run is in flight.** It kills the run after the model
call has already been paid for. Check first:

```
docker exec concept-service sh -c 'grep -l "\"status\":\"running\"" /data/runs/*.json'
```

**The internal page** ships by `scp` to `/docker/concept-service/data/os/20-internal.html`.
It is read from disk on every request, so no restart. **The client portal** ships
by `vercel --prod` from `../adbundance-os-client-view/`.

---

## The standing rules

These were all decided by Carl and each one has already cost something when it
was broken.

1. **Five tables, and nothing else.** Client data comes only from `brand_brain`,
   `marketing_report`, `meeting_summary`, `knowledge_v_concept_approved` and
   `knowledge_vehicle_bank`, all in Supabase project `xakngjsybyytldyqfsmi`.
   Decided 2026-09-10. `src/dossier.js` owns the first three and builds the
   snapshot every skill reads. Do not add a sixth source without asking.

2. **Run the skill, do not paraphrase it.** Every generator puts the actual
   `SKILL.md` into the model's context. Rules that are really rules belong in
   code or in the client's brief, not bolted onto the prompt. Adding prose
   beside the skill has visibly bent the output before.

3. **Join numbers with `canonNum`, on both sides.** A concept is `1` in one
   place and `001` in another. `src/num.js` owns the one form. Getting it wrong
   does not throw, it silently fails to match: three batches of PackDraw scripts
   shipped without ever being reviewed while the log said they were clear.

4. **Report absence.** A stage that quietly carries on when a source is missing
   is how a batch gets worse with nobody noticing. Say it in the `log()` line
   and in the record.

5. **This repository is public.** Never commit a key. `.env` is gitignored twice
   over; `.env.example` holds blanks and public identifiers only.

---

## What the service does now

`v8.4.2-production-brief`, direct mode. One Opus 5 call carries the whole skill
plus the client snapshot, and the code only checks the result rather than
writing any of it. The staged multi-agent pipeline it replaced is still in
`pipeline.js` behind `CONCEPT_PIPELINE=v4` and is not used.

A concept run, in order: intake → a fresh marketing report is commissioned →
evidence pack → Batch Strategy Map → vehicle selection over the whole bank →
the one Opus pass → lift into fields → code checks → final review → alignment →
range check → one revision → second read → ship. Fifteen to twenty five
minutes, a few dollars.

Three generators, all reading their own skill from disk:

| What | Skill | Routes |
|---|---|---|
| Concepts | `ad-concept-generator` | `POST /run`, `GET /run/:id` |
| Scripts | `ad-script-writer` | `POST /scripts/run` |
| Storyboards | `batch-shoot-package` | `POST /storyboard/run` |

Each one can also be fed a document instead of generating: `POST /upload` turns
a `.docx`, `.txt`, `.md`, `.rtf` or `.html` into text, then `POST /import` or
`POST /import/scripts` takes it in verbatim. PDFs are refused on purpose, with
a message telling the person to download as Word instead: a hand-written
extractor was measured against four real PDFs and three gave no text at all.

Batch numbering comes from the client's real Drive history, not from a count of
what this service has made: `GET /next-batch?client=X` reads `batch_seq` off
`knowledge_v_concept_approved`. ThreadBeast is on 52, Path Social 15, Arbor 2.

`README.md` has the endpoint table. `LOCAL.md` is the developer guide: running
it on a laptop, what each key unlocks, how to add a stage, and how to test
without paying for a run.

---

## Open, as of 2026-09-14

- Nine PackDraw scripts (batches 8, 10 and 11) shipped before the `canonNum`
  fix and were never scored. Re-running the scorecard was offered; awaiting a
  decision.
- PackDraw experiment batches 12 to 19 are still on the board and should
  probably be archived.
- Two stray debug files sit untracked on the VPS checkout, `concept-service/cl.js`
  and `concept-service/probe1.js`, from 10 September.
- `Concept-Service-Wiring.pdf` still describes the old agent chain and is stale.
- Darshan Mangukiya is set up to work locally (`LOCAL.md`). Two things are still
  his to be given: whether he gets `SUPABASE_SERVICE_KEY`, and whether he pushes
  to `main` or to a branch. Note that `main` is production for skills.
