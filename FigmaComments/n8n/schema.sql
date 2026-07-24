-- Figma Comment Digest — Supabase schema
-- ---------------------------------------------------------------------------
-- Data store for the Figma Comment Digest tool. Two tables + one storage bucket.
--
--   figma_watched_files  = the control table the VPS cron reads (which files to
--                          poll) and writes (the change-detection watermark).
--   figma_briefs         = the append/upsert store of generated briefs; the
--                          dashboard reads these via the anon key.
--   figma-thumbs bucket  = durable copies of Figma frame PNGs (Figma image URLs
--                          expire in ~1h-24h, so we persist them here).
--
-- SECURITY MODEL
--   - The repo is PUBLIC. No keys live here. The service_role key lives only in
--     VPS env; the anon key is safe to ship in the dashboard (it is gated by RLS).
--   - The cron/engine writes with the service_role key (bypasses RLS).
--   - The dashboard reads with the anon key -> only the SELECT policies below
--     apply, so anon can read briefs but can never write anything.
--
-- Run this in the Supabase SQL editor (or `supabase db push`) on the chosen
-- project. Idempotent-ish: uses IF NOT EXISTS / CREATE OR REPLACE where possible.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. figma_watched_files — the poll control table
-- ===========================================================================
create table if not exists public.figma_watched_files (
  id             uuid primary key default gen_random_uuid(),
  file_key       text not null unique,                 -- Figma file key from /design/<key>/
  file_name      text,                                 -- friendly label, e.g. "ARMRA_EXT"
  brand          text,                                 -- e.g. "ARMRA" — groups files in the dashboard
  enabled        boolean not null default true,        -- cron skips disabled rows
  last_cursor    jsonb,                                -- last brief.cursor we generated for; null = never run
  last_brief_id  uuid,                                 -- FK-ish pointer to the most recent figma_briefs.id
  updated_at     timestamptz not null default now()
);

comment on table  public.figma_watched_files          is 'Files the VPS cron polls. One row per Figma file to watch.';
comment on column public.figma_watched_files.file_key is 'Figma file key parsed from the /design/<key>/ URL (unique).';
comment on column public.figma_watched_files.enabled  is 'Cron only polls rows where enabled = true.';
comment on column public.figma_watched_files.last_cursor is 'The brief.cursor {latestCommentId, latestActivityAt, commentCount, resolvedCount} we last generated for. Cron regenerates only when the live cursor differs.';
comment on column public.figma_watched_files.last_brief_id is 'id of the most recent figma_briefs row for this file (for quick dashboard lookup).';

-- keep updated_at fresh on every write
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_watched_files_updated_at on public.figma_watched_files;
create trigger trg_watched_files_updated_at
  before update on public.figma_watched_files
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- 2. figma_briefs — generated brief store (one row per generation)
-- ===========================================================================
-- We insert a NEW row each generation (append-only history) and repoint
-- figma_watched_files.last_brief_id at it. The dashboard reads the latest row
-- per file_key. Keeping history is cheap and lets us diff "what changed".
create table if not exists public.figma_briefs (
  id             uuid primary key default gen_random_uuid(),
  file_key       text not null,                        -- matches figma_watched_files.file_key
  brief          jsonb not null,                       -- the full brief.schema.json payload (thumbnailUrls already rewritten to durable figma-thumbs URLs)
  comment_count  int  not null default 0,              -- denormalized from brief.cursor.commentCount for cheap "changed?" checks
  open_count     int  not null default 0,              -- denormalized from brief.stats.openThreads for notification copy
  generated_at   timestamptz not null default now()
);

comment on table  public.figma_briefs               is 'Generated designer revision briefs, one row per engine run. Dashboard reads the latest row per file_key.';
comment on column public.figma_briefs.brief         is 'Full brief matching FigmaComments/brief.schema.json. ads[].thumbnailUrl point at durable figma-thumbs URLs, not the expiring Figma render URLs.';
comment on column public.figma_briefs.comment_count is 'Denormalized brief.cursor.commentCount — lets n8n detect change without parsing the jsonb.';
comment on column public.figma_briefs.open_count    is 'Denormalized brief.stats.openThreads — used in the Slack/Notion notification text.';

-- fast "latest brief for this file" and "changed since last run" queries
create index if not exists idx_figma_briefs_file_gen
  on public.figma_briefs (file_key, generated_at desc);
create index if not exists idx_figma_briefs_generated_at
  on public.figma_briefs (generated_at desc);

-- ===========================================================================
-- 3. Row Level Security
-- ===========================================================================
-- Enabling RLS with NO permissive policy = deny-all for anon/authenticated.
-- service_role bypasses RLS entirely, so the cron/engine can always read+write.

alter table public.figma_watched_files enable row level security;
alter table public.figma_briefs        enable row level security;

-- figma_briefs: allow public/anon READ (dashboard uses the anon key). No write
-- policy exists, so anon/authenticated cannot insert/update/delete — writes are
-- service_role only (which bypasses RLS).
drop policy if exists "figma_briefs anon read" on public.figma_briefs;
create policy "figma_briefs anon read"
  on public.figma_briefs
  for select
  to anon, authenticated
  using (true);

-- figma_watched_files: NO anon policy on purpose. The control table (tokens are
-- not stored here, but which files/brands we watch is internal) is service_role
-- only. If the dashboard ever needs the file list, add a narrow SELECT policy
-- exposing only (file_key, file_name, brand, enabled) via a VIEW instead.

-- ===========================================================================
-- 4. Storage bucket — figma-thumbs (public read)
-- ===========================================================================
-- Durable home for frame PNGs. Public read so the dashboard <img> tags work
-- with no auth; uploads are done by the engine with the service_role key.
insert into storage.buckets (id, name, public)
values ('figma-thumbs', 'figma-thumbs', true)
on conflict (id) do update set public = true;

-- Public read policy for objects in the bucket (belt-and-suspenders alongside
-- bucket.public = true, which already serves objects over the public URL).
drop policy if exists "figma-thumbs public read" on storage.objects;
create policy "figma-thumbs public read"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'figma-thumbs');

-- Writes to the bucket are service_role only (no insert/update/delete policy for
-- anon/authenticated), so nobody but the engine can upload thumbnails.

-- Suggested object key convention (set by the engine):
--   <file_key>/<nodeId>-<lastModifiedEpoch>.png
-- Public URL:
--   <SUPABASE_URL>/storage/v1/object/public/figma-thumbs/<file_key>/<nodeId>-<epoch>.png
