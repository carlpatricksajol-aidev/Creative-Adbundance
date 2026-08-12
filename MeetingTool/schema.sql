-- AI Meeting Tool — Supabase schema
-- ---------------------------------------------------------------------------
-- Store for meetings, their transcripts, the changesets we derive from them, and
-- an audit row per applied write.
--
-- SECURITY MODEL — READ THIS BEFORE COPYING THE FIGMA PATTERN
--   The Figma digest ships `figma_briefs` to a static dashboard using the anon
--   key, because a design comment leaking is survivable. THIS IS NOT THAT.
--   Meeting transcripts carry pricing, client complaints, staffing and legal
--   talk. So:
--     - every table below has RLS enabled and NO anon/authenticated policy
--       (deny-all; only service_role, which bypasses RLS, can touch them);
--     - the `meeting-audio` bucket is PRIVATE, unlike `figma-thumbs`;
--     - the dashboard NEVER talks to Supabase. It goes through server.js on the
--       VPS with a bearer token.
--   Do not add an anon read policy here later for convenience. If the dashboard
--   needs something, expose it through the authenticated API.
--
-- The repo is PUBLIC: no keys in this file. service_role lives in VPS env only.
--
-- Run in the Supabase SQL editor on xakngjsybyytldyqfsmi. Idempotent-ish.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 0. shared updated_at trigger fn (already exists if the Figma schema was run)
-- ===========================================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ===========================================================================
-- 1. Brand resolution — NO new table. Uses public.brand_brain.aliases.
-- ===========================================================================
-- An earlier draft of this schema added a `meeting_brand_aliases` table. That was
-- wrong: public.brand_brain already has an `aliases` column (pipe-delimited,
-- |Onsen|GIR|Miracle Made|) that the static-ads pipeline and the n8n "Search Brand
-- Brain" node already match on. A second alias list would drift from the first, and
-- the two tools would silently disagree about which client a name refers to.
--
-- engine/targets/brand-brain.js reuses their matcher character-for-character:
-- normalise, then brand_name -> client_name -> aliases. If a spoken name does not
-- resolve, the fix is to add it to brand_brain.aliases — which improves ad
-- generation at the same time.
--
-- (This tool only READS brand_brain to resolve, and writes only the columns in the
-- allow-list in brand-brain.js. It does not create brand rows.)

-- ===========================================================================
-- 1b. meeting_watched_folders — the Drive poll control table
-- ===========================================================================
-- Every Meet on the Workspace writes a "Notes by Gemini" doc (notes AND full verbatim
-- transcript) into the ORGANISER's Drive, so there is one folder to watch per person who
-- books meetings. Mirrors figma_watched_files: the cron reads which folder, and writes the
-- watermark back.
--
-- The cursor is a cost optimisation, not the correctness mechanism. Correctness comes from
-- meetings.external_id being UNIQUE on the Drive file id, so a replayed or overlapping poll
-- cannot create a second meeting no matter what this table says.
create table if not exists public.meeting_watched_folders (
  owner             text primary key,               -- Workspace user we impersonate, e.g. carl@creativeadbundance.com
  folder_id         text,                           -- Drive id of their "Meet Recordings" folder (resolved on first run)
  last_created_time timestamptz,                    -- createdTime of the newest doc processed; null = never run
  enabled           boolean not null default true,
  updated_at        timestamptz not null default now()
);

comment on table  public.meeting_watched_folders                   is 'Per-organiser Drive folders the poller watches for Google Meet "Notes by Gemini" docs.';
comment on column public.meeting_watched_folders.last_created_time is 'Watermark only. Never advanced past a doc that failed to process, and never the sole guard against duplicates — meetings.external_id is.';

drop trigger if exists trg_watched_folders_updated_at on public.meeting_watched_folders;
create trigger trg_watched_folders_updated_at
  before update on public.meeting_watched_folders
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- 2. meetings — one row per captured meeting
-- ===========================================================================
create table if not exists public.meetings (
  id             uuid primary key default gen_random_uuid(),
  external_id    text unique,                        -- recorder's own id; UNIQUE so a retried webhook cannot double-create
  source         text not null,                      -- extension | zoom | fathom | otter | recall | manual | test
  platform       text,                               -- meet | zoom | teams | phone | in-person
  title          text,
  brand          text,                               -- resolved canonical brand (null = unresolved)
  brand_record_id text,                              -- resolved public.brand_brain.id
  meeting_type   text,                               -- kickoff | client-review | internal-standup | ...
  started_at     timestamptz not null default now(),
  ended_at       timestamptz,
  duration_sec   numeric,
  participants   jsonb not null default '[]'::jsonb, -- [{name, role}]
  audio_path     text,                               -- key in the PRIVATE meeting-audio bucket; null once purged
  status         text not null default 'capturing',  -- capturing | transcribing | extracting | ready | failed
  error          text,
  retain_until   timestamptz,                        -- reserved: a client contract may cap retention. Unused today.
  created_by     text,                               -- who clicked Start (extension) or which webhook
  updated_at     timestamptz not null default now()
);

comment on table  public.meetings             is 'One row per captured meeting. status drives the dashboard; external_id makes webhook retries idempotent.';
comment on column public.meetings.audio_path  is 'Key in the PRIVATE meeting-audio bucket. Nullable so audio can be purged while keeping the transcript + changeset.';
comment on column public.meetings.retain_until is 'Reserved for a retention policy. Nothing enforces it yet — see ARCHITECTURE.md open questions.';

create index if not exists idx_meetings_started  on public.meetings (started_at desc);
create index if not exists idx_meetings_brand    on public.meetings (brand, started_at desc);
create index if not exists idx_meetings_status   on public.meetings (status) where status <> 'ready';

drop trigger if exists trg_meetings_updated_at on public.meetings;
create trigger trg_meetings_updated_at
  before update on public.meetings
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- 3. meeting_transcripts — kept separate so audio/text can be purged alone
-- ===========================================================================
create table if not exists public.meeting_transcripts (
  meeting_id   uuid primary key references public.meetings(id) on delete cascade,
  text         text not null,                        -- normalized full text (what sha256 is computed over)
  segments     jsonb not null default '[]'::jsonb,   -- [{start, end, speaker, text}] — powers the "jump to quote" link
  word_count   int  not null default 0,
  language     text,
  provider     text,                                 -- faster-whisper:small.en | zoom | fathom | ...
  sha256       text not null,
  created_at   timestamptz not null default now()
);

comment on table public.meeting_transcripts is 'Full transcript, one row per meeting. Separate table so a retention policy can drop transcripts while keeping the derived changesets.';
create index if not exists idx_transcripts_sha on public.meeting_transcripts (sha256);

-- ===========================================================================
-- 4. meeting_changesets — the derived proposal (append-only history)
-- ===========================================================================
-- One row per engine run. Re-running a meeting inserts a NEW row rather than
-- mutating the old one, exactly like figma_briefs: history is cheap and lets us
-- see how extraction changed when the prompt or model changed.
create table if not exists public.meeting_changesets (
  id            uuid primary key default gen_random_uuid(),
  meeting_id    uuid not null references public.meetings(id) on delete cascade,
  changeset     jsonb not null,                      -- full payload matching changeset.schema.json
  model         text,
  item_count    int not null default 0,
  auto_count    int not null default 0,              -- denormalized so n8n can write Slack copy without parsing jsonb
  review_count  int not null default 0,
  blocked_count int not null default 0,
  generated_at  timestamptz not null default now()
);

comment on table  public.meeting_changesets            is 'Derived backend proposals, one row per engine run (append-only). Dashboard reads the latest row per meeting.';
comment on column public.meeting_changesets.auto_count is 'Denormalized counts let the n8n notify workflow build its message with no jsonb parsing.';

create index if not exists idx_changesets_meeting on public.meeting_changesets (meeting_id, generated_at desc);
create index if not exists idx_changesets_gen     on public.meeting_changesets (generated_at desc);

-- ===========================================================================
-- 5. meeting_applied — the audit + idempotency ledger
-- ===========================================================================
-- THE UNIQUE CONSTRAINT ON item_id IS THE WHOLE SAFETY STORY. item.id is
-- sha1(meetingId + type + target + normalizedValue), so a retried webhook, a
-- re-run of the same meeting, or a double-clicked Apply all collide here and
-- write exactly once. Insert this row in the SAME step as the backend write and
-- treat a unique violation as "already done", not as an error.
create table if not exists public.meeting_applied (
  id            uuid primary key default gen_random_uuid(),
  item_id       text not null unique,                -- changeset item.id
  changeset_id  uuid references public.meeting_changesets(id) on delete set null,
  meeting_id    uuid references public.meetings(id)  on delete set null,
  item_type     text not null,
  target        text not null,                       -- supabase.brand_brain | notion.tasks | supabase.*
  op            text not null,                       -- set | append | create
  payload       jsonb not null,                      -- exactly what we sent, for forensics
  previous_value text,                               -- what we overwrote — the undo breadcrumb for `set`
  result        jsonb,                               -- the writer's response (record id, url, ...)
  status        text not null default 'applied',     -- applied | failed | rejected | undone
  error         text,
  applied_by    text,                                -- 'auto' or the reviewer who clicked
  applied_at    timestamptz not null default now()
);

comment on table  public.meeting_applied                is 'Audit ledger + idempotency guard for every backend write this tool makes. UNIQUE(item_id) means a write happens at most once.';
comment on column public.meeting_applied.previous_value is 'What the field held before a `set`. The only record of how to undo an overwrite — always populate it.';
comment on column public.meeting_applied.status         is 'applied | failed | rejected (human said no) | undone. Phase-4 promotion decisions read accept rate from here.';

create index if not exists idx_applied_meeting on public.meeting_applied (meeting_id, applied_at desc);
create index if not exists idx_applied_target  on public.meeting_applied (target, status);

-- ===========================================================================
-- 6. meeting_notes — the append-only side of the backend
-- ===========================================================================
-- Where creative_direction / decision / blocker / open_question items land.
-- Deliberately additive: nothing here can overwrite anything, which is why
-- these item types are safe to auto-apply. The static-ads Concept Director and
-- the storyboard flow read this by brand.
create table if not exists public.meeting_notes (
  id           uuid primary key default gen_random_uuid(),
  meeting_id   uuid references public.meetings(id) on delete cascade,
  item_id      text unique,                          -- same idempotency key as meeting_applied
  brand        text,
  kind         text not null,                        -- creative_direction | decision | blocker | open_question
                                                     -- | action_item | asset_request (when no Notion
                                                     --   tasks DB is configured)
                                                     -- | brand_fact  (when the meeting could not be
                                                     --   matched to a brand_brain row — recorded here
                                                     --   rather than discarded; detail carries the
                                                     --   intended column so it can be promoted later)
  title        text not null,
  detail       text,
  evidence     jsonb not null default '[]'::jsonb,   -- the quotes; a note with no quote should never exist
  said_at      timestamptz,
  created_at   timestamptz not null default now()
);

comment on table public.meeting_notes is 'Append-only record of everything extracted from meetings. This is the CAPTURE surface: every item lands here regardless of AUTO_APPLY, because recording is not the same as mutating a system of record (the full transcript is stored either way). Writes to brand_brain and Notion are the gated part.';
create index if not exists idx_notes_brand on public.meeting_notes (brand, created_at desc);
create index if not exists idx_notes_kind  on public.meeting_notes (kind, created_at desc);

-- ===========================================================================
-- 7. Row Level Security — deny-all on purpose
-- ===========================================================================
-- Enabling RLS with NO permissive policy = nothing but service_role can read or
-- write. That is the intended end state for every table here. There is no anon
-- read policy anywhere in this file and there should never be one.
alter table public.meeting_watched_folders enable row level security;
alter table public.meetings              enable row level security;
alter table public.meeting_transcripts   enable row level security;
alter table public.meeting_changesets    enable row level security;
alter table public.meeting_applied       enable row level security;
alter table public.meeting_notes         enable row level security;

-- ===========================================================================
-- 8. Storage — meeting-audio, PRIVATE
-- ===========================================================================
-- public=false, and no storage.objects policy for anon/authenticated. The
-- service key uploads; server.js hands out short-lived signed URLs if a
-- reviewer ever needs to listen back.
insert into storage.buckets (id, name, public)
values ('meeting-audio', 'meeting-audio', false)
on conflict (id) do update set public = false;

-- Object key convention (set by server.js):
--   <meetingId>/audio.webm
-- Never served publicly — use createSignedUrl(60) from the VPS.
