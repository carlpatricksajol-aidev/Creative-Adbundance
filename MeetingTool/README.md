# AI Meeting Tool

Meetings go in. Typed, evidence-backed writes to Brand Brain, Notion and the decision log come
out — proposed as a reviewable diff, with the safe ones already applied. No recording gets
downloaded and passed around, and nobody retypes what a client said.

**Capture is already solved.** Every Meet on the Workspace writes a "Notes by Gemini" doc to
the organiser's Drive containing the full verbatim transcript with speaker labels. A cron
watches that folder. Nothing to install, nothing joins the call, no per-minute cost.

Design and deploy notes: **[ARCHITECTURE.md](ARCHITECTURE.md)**. Read the security section
before touching `schema.sql` — this data is not like the Figma digest's.

```
MeetingTool/
  ARCHITECTURE.md          how it works, why, deploy, phases, open questions
  changeset.schema.json    THE CONTRACT — one meeting in, one changeset out
  schema.sql               Supabase tables (deny-all RLS) + private audio bucket
  poll-drive.js            THE CAPTURE LAYER — cron over Drive "Meet Recordings"
  server.js                ingest + review API + dashboard host
  engine/
    index.js               pipeline: extract -> reconcile -> changeset -> persist -> apply
    sources/meet-notes.js  parses a Gemini notes doc into transcript + notes
    extract.js             the only model call. Proposes; never decides
    reconcile.js           evidence verification, dedupe, reversal linking, idempotent ids
    changeset.js           tierOf() — the safety boundary — plus the backend diff
    apply.js               claim -> write -> settle. At-most-once, always audited
    transcribe.js          faster-whisper, only for the extension fallback
    targets/               brand-brain.js (Supabase) · notion.js (tasks) · supabase.js (notes)
    test-offline.js        75 checks, no keys, no network
  extension/               Chrome MV3 capture client — OPTIONAL, off the critical path
  dashboard/index.html     review + Apply
  n8n/                     Slack notify workflow
```

## See it work, with no keys at all

```bash
cd MeetingTool && npm install
npm run demo          # -> http://localhost:8791
```

Runs a real Google Meet "Notes by Gemini" document through the real parser, the real evidence
check, the real reversal linker and the real tiering rules, then serves the real review
dashboard against the result. The only stub is the model call. Apply/Reject return 501 — there
is no Supabase to write to. This answers "what would I actually be reviewing?" before anyone
opens the Google Cloud console.

```
model proposed 15 items
code kept      11  (auto 6 · review 2 · blocked 3)
code discarded 4:
   - Free shipping threshold            [quote-not-in-transcript]   <- invented
   - Avoid sporty visuals               [quote-not-in-transcript]   <- paraphrase
   - Team agreed to move to weekly reviews  [no-evidence]
   - Likes teal                         [unknown-field]
```

## And the test suite

```bash
npm test              # 76 checks, no keys, no network
npm run validate <changeset.json>     # full ajv pass against the contract
```

Exercises the parts that are allowed to write to a client's Brand Brain, against a fixture
transcript seeded with the mistakes a model actually makes: an invented quote, a paraphrase
passed off as verbatim, an item with no evidence, a decision reversed later in the same call,
and a retainer-pricing discussion that must never auto-apply.

## Then, on a real meeting you were in

```bash
node auth-google.js                             # once per person who organises meetings
export OPENROUTER_API_KEY=...
node poll-drive.js --dry                        # newest Meet docs from Drive
node poll-drive.js --file <driveFileId> --dry   # one specific call
```

Google access is a per-person OAuth consent, not a service-account key — new Cloud orgs block
key creation by default, and a per-person token is the better credential anyway. Setup is in
[ARCHITECTURE.md](ARCHITECTURE.md) step 3b; the one thing not to get wrong is setting the OAuth
consent screen to **Internal**, or tokens expire after 7 days.

`--dry` runs extraction and tiering and writes nothing anywhere — no Supabase, no Brand Brain, no
Notion, and it does not advance the cursor. This is the step that tells you whether the tool is
worth deploying: run it on a call you remember and check that it found what you would have
retyped, and that every quote is real.

Same thing without Google access, straight from a JSON transcript:

```bash
node engine/index.js engine/fixtures/sample-meeting.json --dry --out /tmp/cs.json
npm i -D ajv ajv-formats && node engine/validate.js /tmp/cs.json
```

## The three rules that make it safe to leave on

1. **No quote, no item.** Every proposal carries a verbatim quote, checked against the real
   transcript. Anything that fails is deleted and logged in `dropped` with a reason.
2. **Tiering is code, not prompt.** `auto` / `review` / `blocked` comes from `tierOf()`:
   the op, the target, whether the field is already populated, confidence, and a keyword screen
   for money/legal/compliance/staffing. The model's confidence is an input, never the decision.
3. **Never overwrite a populated Brand Brain field automatically.** Filling an empty field at
   high confidence is allowed. Replacing something a person wrote always needs a click.

`AUTO_APPLY=0` turns off the auto lane entirely — everything becomes a proposal. Start there.

## Environment

See ARCHITECTURE.md for the full list and the deploy sequence. Nothing goes in this repo: it is
public, and `.gitignore` already blocks `MeetingTool/work/` and every `.env`.
