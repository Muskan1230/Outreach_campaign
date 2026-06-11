-- ============================================================
-- Migration 005: Candidate Submission Pipeline
-- ============================================================
-- Goals:
--   1. Add performance indexes for mobile lookups and deduplication.
--   2. Enforce Indian mobile format on worker_profiles.mobile.
--   3. Create DB helper functions: check_duplicate_application,
--      merge_or_create_worker_profile.
--   4. Auto-create workflow_event on candidate_applications INSERT.
--   5. Add RLS policies for consent_logs and documents tables.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Performance Indexes
-- ------------------------------------------------------------

-- Fast mobile lookup in worker_profiles
create index if not exists worker_profiles_mobile_idx
  on public.worker_profiles using btree (mobile);

-- Fast duplicate detection: same mobile in same campaign
-- We use a functional index over the raw_responses JSON since
-- candidate_applications does not have a dedicated mobile_number column.
-- (The express backend stores mobile in worker_profiles.mobile and links via
-- worker_profile_id. The index below covers the worker_profile join path.)
create index if not exists candidate_applications_campaign_worker_idx
  on public.candidate_applications using btree (campaign_id, worker_profile_id)
  where worker_profile_id is not null;

-- Fast workflow history lookup per application
create index if not exists workflow_events_application_id_idx
  on public.workflow_events using btree (application_id);

-- Fast consent lookup per application
create index if not exists consent_logs_application_id_idx
  on public.consent_logs using btree (application_id);

-- ------------------------------------------------------------
-- 2) Indian Mobile Format Constraint on worker_profiles
-- ------------------------------------------------------------
-- Indian mobile: exactly 10 digits, starts with 6, 7, 8, or 9.
-- Only applied when mobile is not null.

alter table public.worker_profiles
  drop constraint if exists worker_profiles_mobile_format;

alter table public.worker_profiles
  add constraint worker_profiles_mobile_format
  check (
    mobile is null
    or mobile ~ '^[6-9][0-9]{9}$'
  );

-- ------------------------------------------------------------
-- 3) DB Function: check_duplicate_application
-- ------------------------------------------------------------
-- Returns the oldest application id for the same worker_profile
-- in the same campaign (excluding rejected / duplicate_review).
-- Returns NULL if no duplicate found.
-- Input:  p_mobile      TEXT   — normalized 10-digit Indian mobile
--         p_campaign_id UUID
-- Output: UUID | NULL

create or replace function public.check_duplicate_application(
  p_mobile      text,
  p_campaign_id uuid
)
returns uuid
language plpgsql
stable
security definer
as $$
declare
  v_worker_id   uuid;
  v_app_id      uuid;
begin
  -- Resolve worker profile from mobile
  select id into v_worker_id
  from public.worker_profiles
  where mobile = p_mobile
  limit 1;

  if v_worker_id is null then
    return null;
  end if;

  -- Look for an active (non-rejected, non-duplicate_review) application
  -- from the same worker for the same campaign
  select id into v_app_id
  from public.candidate_applications
  where campaign_id     = p_campaign_id
    and worker_profile_id = v_worker_id
    and status not in ('rejected', 'duplicate_review')
  order by created_at asc
  limit 1;

  return v_app_id; -- null if not found
end;
$$;

comment on function public.check_duplicate_application(text, uuid) is
  'Returns existing application id for the same mobile+campaign (excluding rejected/duplicate_review), or NULL.';

-- ------------------------------------------------------------
-- 4) DB Function: merge_or_create_worker_profile
-- ------------------------------------------------------------
-- Looks up a worker profile in priority order:
--   1. mobile  2. email  3. government_id
-- If found: merges supplied non-null fields into the record.
-- If not found: creates a new record.
-- Returns the worker_profile.id in both cases.

create or replace function public.merge_or_create_worker_profile(
  p_mobile       text,
  p_email        text,
  p_gov_id       text,
  p_full_name    text,
  p_location     text,
  p_pref_locs    text[],
  p_category     text,
  p_skills       text[],
  p_years_exp    integer,
  p_availability text,
  p_campaign_id  uuid,
  p_source_ch    text
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_profile_id uuid;
begin
  -- 1. Try to find by mobile
  if p_mobile is not null then
    select id into v_profile_id
    from public.worker_profiles
    where mobile = p_mobile
    limit 1;
  end if;

  -- 2. Try to find by email
  if v_profile_id is null and p_email is not null then
    select id into v_profile_id
    from public.worker_profiles
    where email = p_email
    limit 1;
  end if;

  -- 3. Try to find by government_id
  if v_profile_id is null and p_gov_id is not null then
    select id into v_profile_id
    from public.worker_profiles
    where government_id = p_gov_id
    limit 1;
  end if;

  if v_profile_id is not null then
    -- Merge: only overwrite non-null incoming values
    update public.worker_profiles set
      full_name          = coalesce(p_full_name,    full_name),
      mobile             = coalesce(p_mobile,       mobile),
      email              = coalesce(p_email,        email),
      government_id      = coalesce(p_gov_id,       government_id),
      current_location   = coalesce(p_location,     current_location),
      preferred_work_locations = coalesce(p_pref_locs, preferred_work_locations),
      worker_category    = coalesce(p_category,     worker_category),
      key_skills         = coalesce(p_skills,       key_skills),
      years_of_experience = coalesce(p_years_exp,  years_of_experience),
      availability       = coalesce(p_availability, availability),
      updated_at         = now()
    where id = v_profile_id;
  else
    -- Create a new profile
    insert into public.worker_profiles (
      full_name,
      mobile,
      email,
      government_id,
      current_location,
      preferred_work_locations,
      worker_category,
      key_skills,
      years_of_experience,
      availability,
      source_campaign_id,
      source_channel,
      profile_status
    ) values (
      coalesce(p_full_name, 'Unknown'),
      p_mobile,
      p_email,
      p_gov_id,
      p_location,
      coalesce(p_pref_locs, '{}'),
      p_category,
      coalesce(p_skills, '{}'),
      p_years_exp,
      p_availability,
      p_campaign_id,
      p_source_ch,
      'active'
    )
    returning id into v_profile_id;
  end if;

  return v_profile_id;
end;
$$;

comment on function public.merge_or_create_worker_profile is
  'Upserts a worker profile by mobile→email→gov_id priority. Returns the profile id.';

-- ------------------------------------------------------------
-- 5) DB Trigger: auto_create_workflow_event
-- ------------------------------------------------------------
-- Belt-and-suspenders: automatically creates a workflow_events
-- row whenever a candidate_applications row is inserted, using
-- the initial status as the to_stage.

create or replace function public.fn_auto_workflow_event()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.workflow_events (
    application_id,
    from_stage,
    to_stage,
    action_by,
    action_at,
    is_automated,
    remarks
  ) values (
    new.id,
    null,
    new.status::text,
    null,
    now(),
    true,
    'Initial application received — automated event.'
  )
  on conflict do nothing; -- prevent double-insert if backend already created it
  return new;
end;
$$;

drop trigger if exists trg_auto_workflow_event on public.candidate_applications;

create trigger trg_auto_workflow_event
  after insert on public.candidate_applications
  for each row
  execute function public.fn_auto_workflow_event();

comment on trigger trg_auto_workflow_event on public.candidate_applications is
  'Automatically creates an initial workflow_events row on application INSERT.';

-- ------------------------------------------------------------
-- 6) RLS for consent_logs
-- ------------------------------------------------------------
alter table public.consent_logs enable row level security;

drop policy if exists "anon_insert_consent"  on public.consent_logs;
drop policy if exists "internal_read_consent" on public.consent_logs;

-- Anonymous candidates can insert their own consent record
create policy "anon_insert_consent"
  on public.consent_logs
  for insert
  to anon
  with check (true);

-- Authenticated recruiters (internal) can read all consent logs
create policy "internal_read_consent"
  on public.consent_logs
  for select
  to authenticated
  using (true);

-- ------------------------------------------------------------
-- 7) RLS for documents
-- ------------------------------------------------------------
alter table public.documents enable row level security;

drop policy if exists "anon_insert_document"  on public.documents;
drop policy if exists "internal_all_documents" on public.documents;

create policy "anon_insert_document"
  on public.documents
  for insert
  to anon
  with check (true);

create policy "internal_all_documents"
  on public.documents
  for all
  to authenticated
  using (true)
  with check (true);

-- ------------------------------------------------------------
-- Done
-- ------------------------------------------------------------
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- The service_role key used by the Express backend bypasses RLS entirely.
