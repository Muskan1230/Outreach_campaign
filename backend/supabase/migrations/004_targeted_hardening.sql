-- ============================================================
-- Migration 004: Targeted hardening for the existing ATS schema
-- ============================================================
-- Goals:
--   1. Tighten RLS on the existing workflow tables.
--   2. Add missing FK / lookup indexes.
--   3. Enforce constraints that are already compatible with live data.
--   4. Keep application_forms.campaign_id as the authoritative
--      campaign-form relationship.
--
-- Notes:
--   - The live database already contains duplicate form_field rows for
--     one form and duplicate outreach template rows for one campaign/channel.
--     Because those rows are part of live history, we do NOT force a unique
--     constraint on those tables here. That needs a separate cleanup pass if
--     you want the DB to enforce those rules physically.
--   - The backend service role bypasses RLS, so these policies mainly protect
--     direct browser-side Supabase access.
-- ============================================================

-- ------------------------------------------------------------
-- 1) RLS tightening
-- ------------------------------------------------------------
alter table public.campaigns enable row level security;
alter table public.application_forms enable row level security;
alter table public.form_fields enable row level security;
alter table public.outreach_templates enable row level security;
alter table public.form_submissions enable row level security;

drop policy if exists "recruiters_all_campaigns" on public.campaigns;
drop policy if exists "Recruiters can manage their own campaigns" on public.campaigns;
drop policy if exists "recruiters_all_forms" on public.application_forms;
drop policy if exists "public_read_forms" on public.application_forms;
drop policy if exists "Anyone can read active forms" on public.application_forms;
drop policy if exists "Internal staff can manage forms" on public.application_forms;
drop policy if exists "recruiters_all_fields" on public.form_fields;
drop policy if exists "public_read_fields" on public.form_fields;
drop policy if exists "Anyone can read form fields" on public.form_fields;
drop policy if exists "Internal staff can manage form fields" on public.form_fields;
drop policy if exists "recruiters_all_templates" on public.outreach_templates;
drop policy if exists "Internal staff can manage templates" on public.outreach_templates;
drop policy if exists "recruiters_select_submissions" on public.form_submissions;
drop policy if exists "anon_insert_submission" on public.form_submissions;

-- Campaigns: internal staff only.
create policy "internal_manage_campaigns"
  on public.campaigns
  for all
  to public
  using (is_internal())
  with check (is_internal());

-- Application forms: public can read only published forms; internal staff can manage all.
create policy "public_read_published_forms"
  on public.application_forms
  for select
  to anon
  using (is_published = true);

create policy "internal_manage_forms"
  on public.application_forms
  for all
  to public
  using (is_internal())
  with check (is_internal());

-- Form fields: public can read only fields belonging to published forms; internal staff can manage all.
create policy "public_read_published_fields"
  on public.form_fields
  for select
  to anon
  using (
    exists (
      select 1
      from public.application_forms af
      where af.id = form_id
        and af.is_published = true
    )
  );

create policy "internal_manage_fields"
  on public.form_fields
  for all
  to public
  using (is_internal())
  with check (is_internal());

-- Outreach templates: internal staff only.
create policy "internal_manage_templates"
  on public.outreach_templates
  for all
  to public
  using (is_internal())
  with check (is_internal());

-- Form submissions: candidates can insert only for published forms; internal staff can read.
create policy "anon_insert_published_submission"
  on public.form_submissions
  for insert
  to anon
  with check (
    exists (
      select 1
      from public.application_forms af
      where af.id = form_id
        and af.is_published = true
    )
  );

create policy "internal_read_submissions"
  on public.form_submissions
  for select
  to public
  using (is_internal());

-- ------------------------------------------------------------
-- 2) Missing indexes
-- ------------------------------------------------------------
create index if not exists campaigns_application_form_id_idx
  on public.campaigns using btree (application_form_id);

create index if not exists candidate_applications_form_id_idx
  on public.candidate_applications using btree (form_id);

create index if not exists candidate_applications_duplicate_of_idx
  on public.candidate_applications using btree (duplicate_of);

create index if not exists consent_logs_application_id_idx
  on public.consent_logs using btree (application_id);

create index if not exists documents_verified_by_idx
  on public.documents using btree (verified_by);

create index if not exists worker_profiles_source_campaign_id_idx
  on public.worker_profiles using btree (source_campaign_id);

create index if not exists worker_profiles_source_link_id_idx
  on public.worker_profiles using btree (source_link_id);

-- ------------------------------------------------------------
-- 3) Business-rule constraints that are already safe with live data
-- ------------------------------------------------------------
create unique index if not exists application_forms_campaign_version_key
  on public.application_forms using btree (campaign_id, version);

-- Enforce a single published form per campaign.
create unique index if not exists application_forms_one_published_per_campaign
  on public.application_forms using btree (campaign_id)
  where is_published = true;

-- One active application per person per campaign, excluding rejected / duplicate-review records.
create unique index if not exists candidate_applications_one_active_per_person_campaign
  on public.candidate_applications using btree (campaign_id, worker_profile_id)
  where worker_profile_id is not null
    and status not in ('rejected'::application_status, 'duplicate_review'::application_status);

-- ------------------------------------------------------------
-- 4) Compatibility / deprecation notes
-- ------------------------------------------------------------
comment on column public.campaigns.application_form_id
  is 'Compatibility pointer only. application_forms.campaign_id is the authoritative campaign-form link.';

comment on column public.campaigns.form_id
  is 'Legacy compatibility column. application_forms.campaign_id is the authoritative campaign-form link.';
