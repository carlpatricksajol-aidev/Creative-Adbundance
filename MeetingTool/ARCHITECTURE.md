# AI Meeting Tool — Architecture

Turns a meeting into **typed, reviewable writes to the backend**, so nobody downloads a
recording and nobody retypes what a client said into the Brand Brain.

The short version of the design argument: **capture is the cheap, swappable part. The
engine that turns talk into safe backend writes is the product.** So the whole system is
built around one contract — `changeset.schema.json` — with capture as a plug-in adapter
in front of it and backend writers behind it.

---

## System map (for the founders)

**Objective.** Remove the manual relay between a meeting and the systems that run on what
was said. Today: Eric records a call, downloads it, passes the file to the team, and
someone listens through it and retypes the brand facts into Brand Brain, the tasks into
Notion, and the creative direction into whatever doc the strategist is using. That is a
judgement-light, high-volume relay — the same shape of work the AI Video Editor removed
from editing.

**End state.** Nobody does anything. The team runs its Meet as usual with Gemini
notetaking on, and a cron picks the transcript up from Drive minutes later. Slack says *"Kickoff — ARMRA: 6 backend updates proposed, 3 applied
automatically, 3 need 30 seconds of your review."* The reviewer opens one page, sees each
proposed change next to the **exact quote that produced it**, and clicks Apply. Brand Brain,
Notion and the decision log are current. Nobody transcribed anything.

**The constraint that shapes every decision:** *a meeting transcript is not a source of
truth.* People speculate, contradict themselves, and change their mind at minute 40. So
the tool never silently overwrites a field a human filled in. It proposes a **diff**, with
evidence, and a human accepts it — except for additive writes (a decision log entry, a new
task), which are safe to apply on their own. That review gate is what makes "automatic"
trustworthy enough to actually leave on.

**Owner.** Carl builds and operates it. Eric is the person whose relay work it deletes and
the one who decides what may auto-apply.

---

## Why it is built this way (constraints)

- **Meeting content is sensitive — it cannot use the FigmaComments dashboard trick.**
  `figma_briefs` ships to a static page with the Supabase **anon** key because a design
  comment leaking is survivable. Transcripts contain pricing, client complaints, staffing
  and legal talk. So every `meeting_*` table has RLS on with **no anon policy at all**, the
  audio bucket is **private**, and the dashboard reads through an authenticated endpoint on
  the VPS (`server.js`, bearer token) — never directly from Supabase. Do not add an anon
  read policy to these tables later out of convenience.
- **Repo is PUBLIC.** No keys here, ever. `NOTION_TOKEN`, `SUPABASE_SERVICE_KEY`,
  `OPENROUTER_API_KEY`, `GOOGLE_OAUTH_CLIENT_SECRET`, `MEETING_TOKEN` live only in `.env`
  on the VPS, and `google-tokens.json` never leaves it.
- **Transcription costs nothing.** Google Meet + Gemini already produce a verbatim,
  speaker-labelled transcript for every call, saved to Drive. Extraction is one OpenRouter
  call on ~12k tokens — pennies per meeting. The only reason `faster-whisper` is still
  wired up is the extension fallback for a call Meet did not record.
- **Brand Brain is Postgres, not Airtable.** The Airtable base hit
  `PUBLIC_API_BILLING_LIMIT_EXCEEDED` and broke every static-ads run at the lookup node, so
  it moved to Supabase `public.brand_brain`. `targets/brand-brain.js` reuses that table's own
  `brand_name` → `client_name` → `aliases` matcher so this tool and the ads pipeline resolve
  a client name identically.
- **n8n can't run this either.** Same limitation as FigmaComments: no *Execute Command*
  node. n8n is used for **notification only**. The engine runs as a small Express service
  under Docker on the VPS, like `static-ads-service`.
- **Every meeting is on Google Meet.** Confirmed, always. That makes the Drive poller the
  only capture path that matters; the extension and webhook adapters stay wired to the same
  `/ingest` contract for the rare call Meet did not record (see Capture).

## Components at a glance

```
  CAPTURE (Meet does it)                ENGINE (the product)                 BACKEND
  ----------------------                --------------------                 -------
  Google Meet + Gemini
    |  writes "Notes by Gemini" doc
    |  (notes + VERBATIM transcript)
    v
  Drive "Meet Recordings"
    |
  poll-drive.js  (cron */10, cursor per organiser)
    |  export as markdown -> sources/meet-notes.js
    v                                 processMeeting()
  { transcript, notes } ----------->       |
                                           v
  extension / webhook  --------->  server.js /ingest/*   (optional fallbacks)
                                           |
                                           v
                                    extract.js   (OpenRouter, structured, evidence-quoted)
                                           |
                                    reconcile.js (dedupe, supersede, brand resolve)
                                           |
                                    changeset.js (diff vs live backend, tier each item)
                                           |
                                           v
                                    changeset.json  <-- THE CONTRACT
                                           |
                    +----------------------+----------------------+
                    v                      v                      v
             auto-apply tier        Supabase store          n8n -> Slack
             (append-only)          meetings /              "6 proposed,
                    |               meeting_changesets      3 need review"
                    v               meeting_applied                |
             apply.js writers                                      v
             +-- targets/brand-brain.js  brand_brain cols  dashboard/index.html
             +-- targets/notion.js    action items          (bearer via server.js)
             +-- targets/supabase.js  decision log            [Apply] [Reject]
```

## The contract: `changeset.schema.json`

One meeting in, one **changeset** out: a list of typed `items`, each of which either
proposes a write or is informational. Everything downstream — dashboard, apply, Slack
copy, audit — reads only this. Swapping capture, model or backend never changes it.

Three rules make the changeset trustworthy, and they are enforced in **code**, not in the
prompt (a model asked nicely will comply 95% of the time; 95% is not good enough to leave
writing to your Brand Brain unattended):

1. **No quote, no item.** Every item carries `evidence[]` — speaker, role, timestamp, and
   the verbatim quote. `reconcile.js` drops any item whose quote is not found in the
   transcript. This one rule removes essentially all hallucinated backend writes, and it
   makes review a two-second read instead of a re-listen.
2. **Tiering is deterministic.** `auto` / `review` / `blocked` is computed by
   `tierOf()` from the op, the target, whether the field is already populated, confidence,
   and a keyword screen (money, contract, legal, compliance, headcount → always `blocked`).
   The model's opinion of its own confidence is an input, never the decision.
3. **Never overwrite a populated field automatically.** `op: "set"` against a Brand Brain
   field that already has content is `review`, always, no matter how confident. Empty
   field + high confidence may auto-fill. Append-only targets (decision log, tasks, notes)
   may auto-apply.

**Idempotency.** `item.id = sha1(meetingId + type + target + normalizedValue)` and
`meeting_applied.item_id` is unique. Re-running a meeting, a retried webhook, or a double
click on Apply writes once. The FigmaComments cursor solved the same problem for a polled
source; a content hash solves it for a pushed one.

**Within-meeting reversal.** People decide, then un-decide. `reconcile.js` groups items by
topic and marks earlier ones `supersedes`-ed by the later statement, so the changeset
carries the *end state* of the conversation, with the reversal visible in the item detail.

## Item types → where they land

| Type | Target | Op | Default tier |
|---|---|---|---|
| `brand_fact` | Supabase `public.brand_brain` — 14 allow-listed columns (`brand_tone`, `brand_personality`, `key_offer`, `target_personas`, `core_pain_points`, `product_benefits`, `brand_guidelines`, `creative_boundaries`, `dos_and_donts`, `competitors`, `winning_concepts`, `losing_patterns`, `compliance_notes`, `notes`) | `set` | `review` if populated, `auto` if empty + conf ≥ 0.8 |
| `creative_direction` | Supabase `meeting_notes` (feeds the static-ads Concept Director and storyboards) | `append` | `auto` ≥ 0.75 |
| `decision` | Supabase decision log | `append` | `auto` ≥ 0.75 |
| `action_item` | Notion tasks DB **if `NOTION_TASKS_DB` is set**, else Supabase `meeting_notes` | `create` / `append` | `auto` ≥ 0.75 |
| `asset_request` | same routing as `action_item` | `create` / `append` | `auto` ≥ 0.75 |
| `blocker` / `open_question` | Supabase `meeting_notes` | `append` | `auto` (informational) |

Brand resolution matters more than it looks: people say "the collagen client", not
"NativePath". Resolution reuses `brand_brain`'s own `brand_name` → `client_name` → `aliases`
matcher, character-for-character the one in `static-ads-service/pipeline.js`, so this tool and
the ads pipeline can never disagree about which client a name means. An item
whose brand cannot be resolved is `blocked` with `needs: brand` — it never guesses which
client's Brand Brain to write to.

---

## Capture — already solved, by Google

Every meeting is on Google Meet, on the `creativeadbundance.com` Workspace, with Gemini
notetaking already switched on. After each call a doc lands in the organiser's Drive
("Meet Recordings" folder) containing **both** Gemini's notes **and the full verbatim
transcript with speaker labels and timestamps**. Confirmed against real docs going back to
April 2026.

That deletes most of what a meeting tool normally has to build:

| Normally you build | Here |
|---|---|
| audio capture client | Meet does it |
| speech-to-text | Gemini does it, free, already paid for |
| speaker diarization | Meet labels every utterance by name |
| consent UX | Meet announces itself and badges the call |
| a bot that joins the call | nothing joins; nothing to explain to a client |

So the capture layer is **[poll-drive.js](poll-drive.js)** — a cron that watches the folder,
exports new docs as markdown, and parses them with
**[engine/sources/meet-notes.js](engine/sources/meet-notes.js)**. Structurally identical to
the Figma poller: cheap listing call, cursor comparison, expensive work only on real change.

**Why the transcript and not Gemini's notes.** The notes are a paraphrase with no quotable
text, so every item derived from them would fail the evidence check and be deleted —
correctly. The transcript is the evidence. Gemini's notes are passed to the extractor
separately as a *recall hint*, which measurably helps because Gemini heard the audio while we
are reading rough ASR — but a quote must still exist in the transcript for anything to reach
your backend. The test suite asserts exactly this: a real transcript line verifies, Gemini's
own paraphrase does not.

**A notes-only doc is refused, not parsed.** If someone enables "take notes" but not
transcription there is nothing to check quotes against, and the poller logs it and skips
rather than letting a paraphrase reach a client's Brand Brain.

### The extension is now optional

`extension/` still works and is still wired to `/ingest/*`, but it is **off the critical
path** — keep it only for a call that is not on Meet (a phone call, a client who insists on
Zoom). Ignore it until that actually happens. Its one real advantage is capturing a meeting
Google did not record; its cost is a per-teammate install, a mic permission, and a consent
banner you have to run yourself.

**Consent.** Meet announces transcription to everyone and shows a badge for the whole call,
so the default path is covered. If you ever fall back to the extension, that guarantee goes
away and someone has to say it out loud.

---

## Deploy (mirrors static-ads-service + the FigmaComments method)

All on the VPS (`root@187.77.154.60`, srv1486031).

**1. Schema.** Run `MeetingTool/schema.sql` in the Supabase SQL editor on
`xakngjsybyytldyqfsmi`. Creates the tables, the deny-all RLS, and the **private**
`meeting-audio` bucket. Then seed `meeting_brand_aliases` with one row per active client.

**2. Ship the service:**
```bash
scp -r MeetingTool/{engine,dashboard,server.js,package.json,changeset.schema.json} \
      root@187.77.154.60:/root/meeting-tool/
ssh root@187.77.154.60 'cd /root/meeting-tool && npm ci --omit=dev'
```

**3. Env** in `/root/meeting-tool/.env` (git-ignored — the repo is public):
```bash
MEETING_TOKEN=<long random shared secret; extension + dashboard send it>
OPENROUTER_API_KEY=<key>
OPENROUTER_MODEL=anthropic/claude-haiku-4.5      # sonnet-4 for higher-stakes calls
SUPABASE_URL=https://xakngjsybyytldyqfsmi.supabase.co
SUPABASE_SERVICE_KEY=<service_role>              # server-only
AIRTABLE_TOKEN=<pat>
AIRTABLE_BASE=appvCkX59PBphJGOd
AIRTABLE_BRAND_BRAIN=tblIqcPJRvpQhS4AM
NOTION_TOKEN=<secret>
NOTION_TASKS_DB=<database id>
GOOGLE_OAUTH_CLIENT_ID=<desktop-app client id>       # see 3b — no admin, no org-policy change
GOOGLE_OAUTH_CLIENT_SECRET=<secret>
# google-tokens.json sits beside the service; GOOGLE_IMPERSONATE is optional and only needed
# to poll a subset of the authorised people.
INTERNAL_DOMAIN=creativeadbundance.com               # decides client vs internal speakers
MEETING_FOLDER_NAME=Meet Recordings
N8N_NOTIFY_URL=https://n8n-i3t9.srv1486031.hstgr.cloud/webhook/meeting-done
AUTO_APPLY=1                                     # 0 = propose everything, apply nothing
# only if you ever fall back to the extension:
WHISPER_PYTHON=/root/video-editor/.venv/bin/python   # reuse the editor's faster-whisper
WHISPER_MODEL=small.en
```

**3b. Google access — OAuth per person, not a service-account key.**

The obvious route (service account + domain-wide delegation) is blocked on this org by
`iam.disableServiceAccountKeyCreation`, one of Google's Secure-by-Default policies. You could
turn it off — you own the org — but don't: that key is a permanent credential that reads every
Drive in the domain, and this repo has already leaked two API keys. A per-person refresh token
reads one Drive, is revocable by that person from their own account page, and needs no admin.

In Google Cloud, once:
1. *APIs & Services* → enable **Google Drive API**
2. *OAuth consent screen* → User type **Internal** — **not optional**: an app left in "Testing"
   issues refresh tokens that die after 7 days, and the cron would stop silently a week later
3. *Credentials* → Create credentials → **OAuth client ID** → **Desktop app**
4. Put the id + secret in `.env`, then run once per teammate who organises meetings:

```bash
node auth-google.js     # prints a sign-in URL, catches the redirect on 127.0.0.1, saves the token
```

Run it on a laptop, then copy `google-tokens.json` to the VPS — it never needs to run there.
The file is git-ignored; treat it like a password file.

`engine/sources/google-auth.js` still supports the service-account path if `GOOGLE_SA_KEY_FILE`
is set, for the day the org policy changes or you move to a Workspace where DWD is easier.

**3c. Install the cron** (mirrors the Figma poller, flock so ticks never overlap):
```cron
*/10 * * * * flock -n /tmp/meetd.lock node /root/meeting-tool/poll-drive.js >> /root/meeting-tool/poll.log 2>&1
```

**4. Run it** behind Traefik at `meetings.srv1486031.hstgr.cloud`, TLS via the existing
letsencrypt resolver, same pattern as the video editor. `pm2 start server.js --name meeting-tool`
(or a `node:20` container). Health check: `GET /healthz` → `{ok:true}`; `/` serves the review
dashboard. Traefik `basicAuth` on top is belt-and-braces — the bearer token already gates every
API route, but a password prompt keeps the page itself off the open web.

**5. Extension.** `chrome://extensions` → Developer mode → *Load unpacked* →
`MeetingTool/extension`. Set the server URL and paste the token once in the popup. For the
team, publish it as an **unlisted** Chrome Web Store item or push via Google Workspace
admin so nobody sideloads anything.

**6. Notify workflow.** Import `n8n/meeting-notify.workflow.json`, set the Slack credential,
Activate.

**Verify against a real past meeting, writing nothing:**
```bash
node poll-drive.js --dry                      # newest unprocessed docs, extract only
node poll-drive.js --file <driveFileId> --dry # one specific meeting you remember well
```
This is the step that tells you whether the tool is worth turning on: run it against a call
you were in and check whether it found what you would have retyped, and whether every quote
is real. Then, for the write path:
```bash
curl -sX POST https://meetings.srv1486031.hstgr.cloud/ingest/transcript \
  -H "authorization: Bearer $MEETING_TOKEN" -H 'content-type: application/json' \
  -d @MeetingTool/engine/fixtures/sample-meeting.json | jq
# -> { meetingId, changesetId, items: N, auto: N, review: N }
# then open the dashboard, confirm each item shows its quote, click Apply on one,
# and check the brand_brain/Notion row actually moved.
```

**Roll back:** `pm2 stop meeting-tool`. Nothing further is written; everything already in
Supabase stays readable. `AUTO_APPLY=0` is the softer stop — keeps capturing and proposing,
writes nothing.

---

## Phased rollout

**Phase 1 — read-only proof, nothing deployed (~1 hour).** Google access + `poll-drive.js --dry`
against meetings you were actually in. No Supabase, no writes, no cron. The only question that
matters: does it find what you would have retyped, and is every quote real? If the answer is no,
nothing else is worth doing.

**Phase 2 — propose, never write (~half a day).** Schema applied, service on the VPS,
`AUTO_APPLY=0`. Cron runs, changesets accumulate, the dashboard shows them. Still zero writes
to Brand Brain or Notion. Run it for a week of real meetings and read the proposals.

**Phase 3 — close the loop.** `AUTO_APPLY=1`, which turns on append-only targets only (decision
log, notes, Notion tasks). Brand Brain stays review-only regardless. Wire the n8n Slack ping.
Seed `meeting_brand_aliases` for every active client so brand facts stop being dropped. This is
the point where the relay work actually disappears.

**Phase 4 — earn more autonomy.** After ~20 meetings, measure the accept rate per item type
from `meeting_applied`. Any type accepted >90% of the time without edits can be promoted to
`auto`. Let the data grant the permission, not optimism.

## Open questions

1. ~~Which recorder does Eric use?~~ **Answered: Google Meet + Gemini, always.** The transcript
   is already in Drive after every call. Capture is a solved problem.
2. **Whose Drive do we watch?** Meet notes land in the *organiser's* Drive — real docs exist
   under `carl@`, `joi@` and `xandria@`. `GOOGLE_IMPERSONATE` needs every teammate who books
   client calls, or meetings they organise are invisible to the tool.
3. **Where do action items belong?** There is no evidence of a Notion *tasks* database. The
   one Notion DB in the docs is "File Renaming Automation" (`388acb83-16dd-80f5-977e-f0aaa68bc0f2`)
   — a per-job video production queue with no Owner or Due, so it is the wrong home. Until
   `NOTION_TASKS_DB` is set, action items append to `meeting_notes` and appear in the dashboard
   and Slack. Options: point it at a real tasks DB, make one, or leave it as-is. Nothing else
   in the system changes either way.
4. **Who is allowed to click Apply?** Today it is one shared bearer token. If Brand Brain
   writes should be Eric-only, that becomes per-user tokens — cheap to add now, annoying later.
5. **Meeting title convention.** Brand is guessed from the text before the first dash
   ("ARMRA — creative review"). Titles like "Update for UI & UX" resolve to nothing, so brand
   facts get dropped. Either name client calls `<Brand> — <purpose>`, or accept that internal
   meetings never write to a Brand Brain (which is arguably correct anyway).
6. **Retention.** How long do transcripts stay in Supabase? Default here is forever; a client
   contract may say otherwise. `meetings.retain_until` is in the schema, unused.
