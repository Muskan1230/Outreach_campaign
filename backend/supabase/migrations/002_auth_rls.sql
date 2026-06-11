-- ============================================================
-- Migration 002: Enable Auth + Row Level Security (Single-Org)
-- ============================================================
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)
-- After running, recruiters need a Supabase auth account to use the app.
-- Candidates can still INSERT submissions anonymously.
-- ============================================================

-- ── 1. Enable RLS on all tables ───────────────────────────────────────────────
alter table public.campaigns           enable row level security;
alter table public.application_forms   enable row level security;
alter table public.form_fields         enable row level security;
alter table public.outreach_templates  enable row level security;
alter table public.form_submissions    enable row level security;

-- ── 2. Drop any pre-existing policies (idempotent) ───────────────────────────
drop policy if exists "recruiters_all_campaigns"          on public.campaigns;
drop policy if exists "recruiters_all_forms"              on public.application_forms;
drop policy if exists "recruiters_all_fields"             on public.form_fields;
drop policy if exists "recruiters_all_templates"          on public.outreach_templates;
drop policy if exists "anon_insert_submission"            on public.form_submissions;
drop policy if exists "recruiters_select_submissions"     on public.form_submissions;

-- ── 3. CAMPAIGNS — authenticated recruiters can read / write all rows ─────────
create policy "recruiters_all_campaigns"
  on public.campaigns
  for all
  to authenticated
  using (true)
  with check (true);

-- ── 4. APPLICATION_FORMS — same ───────────────────────────────────────────────
create policy "recruiters_all_forms"
  on public.application_forms
  for all
  to authenticated
  using (true)
  with check (true);

-- ── 5. FORM_FIELDS — same ────────────────────────────────────────────────────
create policy "recruiters_all_fields"
  on public.form_fields
  for all
  to authenticated
  using (true)
  with check (true);

-- ── 6. OUTREACH_TEMPLATES — same ──────────────────────────────────────────────
create policy "recruiters_all_templates"
  on public.outreach_templates
  for all
  to authenticated
  using (true)
  with check (true);

-- ── 7. FORM_SUBMISSIONS ───────────────────────────────────────────────────────
--   • Candidates (anon role) can INSERT — no login required to apply
--   • Recruiters (authenticated) can SELECT — view applicant responses

create policy "anon_insert_submission"
  on public.form_submissions
  for insert
  to anon
  with check (true);

create policy "recruiters_select_submissions"
  on public.form_submissions
  for select
  to authenticated
  using (true);

-- ── 8. Optional: also allow public read of application_forms + form_fields ────
--   (needed so the candidate apply page can load the form without auth)
drop policy if exists "public_read_forms"  on public.application_forms;
drop policy if exists "public_read_fields" on public.form_fields;

create policy "public_read_forms"
  on public.application_forms
  for select
  to anon
  using (true);

create policy "public_read_fields"
  on public.form_fields
  for select
  to anon
  using (true);

-- ── Done ──────────────────────────────────────────────────────────────────────
-- The service_role key used by the Express backend bypasses RLS entirely,
-- so all existing backend queries continue to work unchanged.
-- The RLS policies protect direct Supabase JS SDK calls from the browser.
