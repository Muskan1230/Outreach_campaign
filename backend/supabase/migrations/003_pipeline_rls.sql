-- ============================================================
-- Migration 003: RLS for Candidate Pipeline Tables
-- ============================================================
-- Run this in the Supabase SQL editor after 002_auth_rls.sql
-- Enables anonymous candidates to INSERT into the pipeline tables
-- while recruiters (authenticated) can SELECT / UPDATE.
-- ============================================================

-- ── 1. Enable RLS on pipeline tables ─────────────────────────────────────────
alter table public.worker_profiles         enable row level security;
alter table public.candidate_applications  enable row level security;
alter table public.workflow_events         enable row level security;

-- ── 2. Drop any pre-existing policies (idempotent) ───────────────────────────
drop policy if exists "anon_insert_worker_profile"         on public.worker_profiles;
drop policy if exists "recruiters_all_worker_profiles"     on public.worker_profiles;

drop policy if exists "anon_insert_candidate_application"  on public.candidate_applications;
drop policy if exists "recruiters_all_candidate_apps"      on public.candidate_applications;

drop policy if exists "anon_insert_workflow_event"         on public.workflow_events;
drop policy if exists "recruiters_all_workflow_events"     on public.workflow_events;

-- ── 3. worker_profiles ────────────────────────────────────────────────────────
--   • Candidates (anon) can INSERT a new profile
--   • Authenticated recruiters have full access (read + update status, etc.)

create policy "anon_insert_worker_profile"
  on public.worker_profiles
  for insert
  to anon
  with check (true);

create policy "recruiters_all_worker_profiles"
  on public.worker_profiles
  for all
  to authenticated
  using (true)
  with check (true);

-- ── 4. candidate_applications ─────────────────────────────────────────────────
--   • Candidates (anon) can INSERT a new application
--   • Authenticated recruiters have full access

create policy "anon_insert_candidate_application"
  on public.candidate_applications
  for insert
  to anon
  with check (true);

create policy "recruiters_all_candidate_apps"
  on public.candidate_applications
  for all
  to authenticated
  using (true)
  with check (true);

-- ── 5. workflow_events ────────────────────────────────────────────────────────
--   • Both anon and authenticated can INSERT events
--   • Authenticated recruiters can SELECT all events

create policy "anon_insert_workflow_event"
  on public.workflow_events
  for insert
  to anon
  with check (true);

create policy "recruiters_all_workflow_events"
  on public.workflow_events
  for all
  to authenticated
  using (true)
  with check (true);

-- ── 6. Ensure vw_application_queue is accessible ─────────────────────────────
-- Views inherit permissions from their underlying tables.
-- Since recruiters can SELECT all underlying tables, the view works automatically.
-- No separate policy needed for views in Postgres.

-- ── Done ──────────────────────────────────────────────────────────────────────
-- The service_role key used by the Express backend bypasses RLS entirely,
-- so all backend queries continue to work unchanged.
-- These RLS policies protect direct Supabase JS SDK calls from the browser.
