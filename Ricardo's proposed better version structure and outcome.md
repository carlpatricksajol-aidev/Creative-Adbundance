# Ricardo's proposed better version: structure and outcome

Concept generator (`concept-service`), version `v7.5-select`. Written 2026-09-08 after the restructure
Carl specified was built, deployed and run three times on PackDraw. Code lives in
`concept-service/src/pipeline.js` (commits `396ec50` through `b77d419` on `main`).

The model is GPT-5.6 Luna for every call (`CONCEPT_MODEL` and `REVIEW_MODEL` in the service `.env`).
The skill (`.claude/skills/ad-concept-generator/SKILL.md` v7.5 plus its references) is read from disk on
every run and placed in the model's context in full. Nothing below paraphrases the skill; where a stage
needs one of the skill's procedures it is sliced out of `SKILL.md` by heading and handed over verbatim.

---

## 1. What was wrong before

Carl's analysis of the previous pipeline (v6.2 chain), confirmed by reading the code:

1. The reviewers judged but did not control regeneration. EDIT, REWORK and REWRITE verdicts became
   `review_notes` on the shipped concept. Only KILL or a failed code check triggered a rewrite.
2. Compliance ran after the only rewrite, so a hard compliance fail could only be flagged, never fixed.
3. The Creative Director made every invisible decision inside one overloaded call: which observation,
   which persuasion job, which situation, which vehicle, and the writing itself.
4. No selection pressure. A batch of 3 wrote 3 and shipped 3.
5. The skill's Message Visualization and Vehicle Candidate Search sub-procedures had no stage of their
   own, so they were skipped in practice and the writer defaulted to a person at a desk with a phone.
6. A concept that still failed the code checks after the rewrite shipped with a flag.
7. Strategy tags were written by the writer, so the writer wrote toward labels.

## 2. What the new version does

The order of a run is now:

```
research and intake  ->  strategy map  ->  observation + viral format harvest
  ->  MESSAGE VISUALIZATION (new)   one package per pool slot
  ->  VEHICLE SELECTOR (new)        scored table, one winner per slot
  ->  Creative Director writes the POOL from the packages only (free text, skill slide format)
  ->  parse to fields, tags stitched from the packages
  ->  code checks (harness)
  ->  Creative Strategist gate  ->  22-check Feedback Review  ->  Compliance  ->  Final Review
  ->  kill confirmation (final reviewer re-reads anything all three judges killed)
  ->  SELECTION in code: rank, cover every lane, distinct vehicle families, keep count + reserve
  ->  one rewrite of survivors that carry notes (package + binding notes)
  ->  code checks again: still failing = replaced from the reserve, never flagged
  ->  Compliance again + Final Review again on the survivors: KILL or HARD FAIL = replaced
  ->  composition check  ->  ship survivors only
```

### 2.1 Message Visualization (`stageVisualize`)

Runs the skill's Sub-procedure 1 (Message Visualization) and Sub-procedure 2 (Narrative Chronology),
handed over verbatim from `SKILL.md`. For a batch of N the pool is `min(15, max(3N, N+3))` slots
(9 for N=3). Each slot gets: objective, persona, selling argument, lane, awareness, duration inside the
brief's band, one observation from the harvest (never reused), insight family, ONE persuasion job, a
chronology tag (before / during / after / split), 5 to 7 visualizations each with a trigger and a
deletable-brand flag, and a chosen one with the reason. Alternates for the same Strategy Map row must
differ in persuasion job and kind of scene.

A code check (`humanSituation`) then reads every chosen situation: if it names the brand or the
product's mechanics (app, account, pack, page, screen, tab, browsing, and so on) the choice is swapped
for the slot's best passing alternative, and slots with no passing alternative are asked again once.
Ricardo's five approved situations pass this check; the desk demonstrations from Batch 21 do not.

### 2.2 Vehicle Selector (`stageVehicles`)

Runs Sub-procedure 3 (Vehicle Candidate Search + Fit-Check) verbatim. Per slot: 3 to 5 shape keywords
from the chosen visualization, a candidate table of 3 to 5 vehicles across the three pools (vehicle
bank, researched vehicles, harvested viral formats) scored 1 to 5 on message fit, persona fit,
freshness and producibility, a winner with family, trigger, proof object and talent (solo / 2-talent /
location). No two slots share a vehicle family. The skill's rule 5 applies: if the pattern default
wins more than half the slots the search is redone.

### 2.3 The writer gets less freedom

`stageWrite` receives one package per slot (observation, persuasion job, situation, chronology,
trigger, vehicle, proof object, talent) and is told to build each concept from its package only. The
vehicle menu, the observation list and the viral formats are no longer in the writer's prompt. The
slide format is unchanged (Title, Description, Narrative 5, Design 5, three internal hooks). The Tags
block is gone from the writer's output; `parseBatch` copies the writer's text verbatim and stitches the
tags from the packages.

### 2.4 Judges control regeneration

All four reviewers read the whole pool, before any rewrite. They are told they are reading a pool
(`poolNote`): alternates for one row share persona, objective and selling argument by design, so a
collision between alternates or an exceeded allocation quota is not a failure. They are told the
client's approved library is the bar (`standardNote`).

Verdict handling, in code:

| Verdict | Effect |
|---|---|
| gate PASS / feedback PASS / final SHIP | score |
| gate EDIT / feedback REWORK / final REWRITE / compliance soft | binding note to the writer, costs rank |
| compliance HARD FAIL | binding note, must be fixed or the concept is replaced |
| gate REJECT / feedback KILL / final KILL | costs rank; three of three, confirmed by a second final-review read, removes the draft |

The five adversarial tests (deletable brand, stealable, human situation without the product, creative
leap, trigger) sit at the top of the gate and final-review prompts. Each must be answered per
concept. A missing trigger is the kill-level failure; the other four are prescribed fixes unless the
approved library shows the same trait.

### 2.5 Selection (`select`, in code)

Score = gate (PASS 2, EDIT 1) + feedback (PASS 2, REWORK 1) + final (SHIP 3, REWRITE 1)
minus 1.5 per hard compliance fail, 0.25 per soft, 0.5 per code-check issue,
plus (thumb_stop + performance_ready) / 10.

Greedy pick: the best of each Strategy Map lane first, then best-first with distinct vehicle families,
then fill. Everything else is the reserve. Survivors with notes get one rewrite. A survivor that still
fails the code checks, or is killed or hard-failed on the second review, is replaced from the reserve.
A flag reaches the deck only when the reserve is exhausted. A batch may come back short and the log
says why. An empty batch is saved archived and unnumbered.

### 2.6 What the batch record now carries

`packages[]`, `visualizations[]` (persuasion job, options, chosen), `pool[]` (every draft with gate /
feedback / final / hard / soft / lint and outcome: shipped, reserve, killed), `pool_size`,
`pipeline_version: "v7.5-select"`, plus everything it carried before (`cd_markdown`, `strategy`,
`feedback`, `compliance`, `final_review`, `cost_usd`).

### 2.7 The brief (client constraints, `/data/briefs/<client>.json`)

Unchanged in role, two additions in rendering: the banned list is stated to be the whole list, and a
new `allowed_spoken` array lists words the account team has cleared for a CHARACTER to say as an
objection (PackDraw: `gambling`, because the client approved a concept where the mother says it).
Where the marketing report and the brief disagree on a word, the brief wins.

## 3. Calibration against Ricardo's approved work

Carl's ruling: the client's approved output is the standard, and a gate that fails it is wrong.
Ricardo's five approved PackDraw concepts (his Batch 1 deck) are the gold set. Test:
`gold_reviewers.js` runs them through the three judges hold-out style (three in the snapshot as the
approved library, the other two judged as a pool).

| Judges' configuration | Gold survivors |
|---|---|
| first version: adversarial tests kill-level, one kill eliminates | 0 of 5 |
| approved library named as the bar, only the trigger kill-level, 2 of 3 kills eliminate | 4 of 5 ("My Mom Sat Me Down" killed for the word "gambling") |
| 3 of 3 kills eliminate, brief wins on words, `gambling` cleared | 4 or 5 of 5 depending on the run |

Luna's verdicts are not stable: the same approved concept came back SHIP / REWORK / EDIT on one run and
REJECT / KILL / KILL on the next. That is why a kill is confirmed by a second final-review read before it
removes a draft.

## 4. Outcome on PackDraw, 3 concepts per batch

Grader: `grade_vs_gold.js`, a Luna read scoring each shipped concept 1 to 5 against the gold set on
plain language, human story, product off screen until it matters, staffable, and "reads like the gold".

| Board batch | Pipeline | Shipped | Cost | Like-gold per concept |
|---|---|---|---|---|
| 18 | previous chain, Opus 5 writer, Luna judges | 3 | $2.21 | 4, 3, 4 |
| 19 | previous chain, Luna everywhere | 3 | $0.09 | 2, 2, 1 |
| (archived) | pool, first run, judges unaware of the pool | 0 of 9 | $0.13 | all killed |
| 20 | pool, pool-aware judges | 3 of 9 | $0.14 | 2, 2, 2 |
| 21 | + skill's sub-procedures verbatim, lane coverage | 3 of 9 | $0.13 | 2, 2, 2 |
| 22 | + human-situation code check (7 of 9 choices swapped) | 3 of 9 | $0.11 | 1, 1, 1 |

What works: the pool, the judging order, compliance before the rewrite, selection with lanes and
families, replacement instead of flags, tags from packages, the audit trail. Every run since Batch 20
shipped three concepts that clear every code check, with no flags.

What does not yet: the register. Every Luna-written batch reads as product proof (pack page, listed
contents, shipping update, account screen) from the first beat, and the grader puts it at 1 to 2 out
of 5 against Ricardo's work. That phrasing is not in the brand snapshot (one mention in 35k chars). It
comes from the judges' notes, which prescribe "brand-specific proof" and which the rewrite obeys, and
from the writer model's own register through the API with our context. Batch 18, written by Opus 5 on
the previous chain, remains the only batch the grader put near the gold set.

## 5. Two experiments not yet run (each changes something Carl settled)

1. Same pipeline, Opus 5 for the write and rewrite calls only, Luna stays as judge. About $2 per batch.
2. Luna writer with the marketing report's compliance rows removed from the writer's context.
   Compliance stays enforced by the compliance reviewer and the code checks.

## 6. Still pending

- Archive Batches 14 to 19 (experiments) off PackDraw's board.
- Batch 18 or 19 decision for Ricardo.
- Refresh the handoff document (`Concept-Service-Wiring.pdf`) once the writer question is settled.
- Teach `redact-skills.py` to delete repo files that are no longer in the vault.

## 7. Files touched in this version

- `concept-service/src/pipeline.js`: `VIS_SCHEMA`, `stageVisualize`, `humanSituation`, `VEH_SCHEMA`,
  `stageVehicles`, `buildPackages`, `packageMd`, `CD_FORMAT` (no tags), `parseBatch` (tags from
  packages), `stageWrite` (packages only), `poolNote`, `standardNote`, adversarial tests in `stageGate`
  and `stageFinalReview`, `label` on `stageCompliance` / `stageFinalReview`, `stageRewrite` (package +
  notes), the run tail (pool, judges, kill confirmation, selection, rewrite, re-check, ship), `briefMd`
  (`allowed_spoken`, banned list is the whole list), `HOUSE_RULES` (brief wins on a word), exports for
  the gold test.
- `concept-service/src/store.js`: `saveBatch` saves an empty batch archived and unnumbered.
- `/data/briefs/packdraw.json` on the service: `allowed_spoken: ["gambling"]`.
