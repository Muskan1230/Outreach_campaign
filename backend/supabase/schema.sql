create extension if not exists "pgcrypto";

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  opportunity_title text not null,
  opportunity_desc text not null,
  mode text not null check (mode in ('direct_sourcing', 'broad_social', 'job_portal', 'mixed_channel')),
  worker_type text not null,
  target_region text not null,
  skills_required text[] not null default '{}',
  target_channels text[] not null default '{}',
  compensation_model text not null check (compensation_model in ('hourly', 'daily', 'weekly', 'fixed', 'per_task')),
  compensation_details jsonb not null default '{}'::jsonb,
  start_date date not null,
  end_date date not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campaigns_name_idx on public.campaigns using gin (to_tsvector('english', name));
create index if not exists campaigns_status_idx on public.campaigns (status);
create index if not exists campaigns_created_at_idx on public.campaigns (created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists campaigns_touch_updated_at on public.campaigns;
create trigger campaigns_touch_updated_at
before update on public.campaigns
for each row
execute function public.touch_updated_at();

create table if not exists public.outreach_templates (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'linkedin', 'facebook', 'instagram', 'job_portal')),
  template_name text not null,
  message_body text not null,
  language text not null,
  media_attachment_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists outreach_templates_channel_idx on public.outreach_templates (channel);
create index if not exists outreach_templates_campaign_id_idx on public.outreach_templates (campaign_id);
create index if not exists outreach_templates_created_at_idx on public.outreach_templates (created_at desc);

drop trigger if exists outreach_templates_touch_updated_at on public.outreach_templates;
create trigger outreach_templates_touch_updated_at
before update on public.outreach_templates
for each row
execute function public.touch_updated_at();

create table if not exists public.application_forms (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete set null,
  name text not null,
  description text not null default '',
  version integer not null default 1,
  supported_languages text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.form_fields (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.application_forms(id) on delete cascade,
  field_type text not null check (field_type in ('Text', 'Email', 'Phone', 'Number', 'Select', 'Radio', 'Checkbox', 'Date', 'File Upload')),
  label text not null,
  placeholder text,
  required boolean not null default false,
  help_text text,
  options text[] not null default '{}',
  validation_rules jsonb not null default '{}'::jsonb,
  visibility_condition jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists application_forms_campaign_id_idx on public.application_forms (campaign_id);
create index if not exists application_forms_created_at_idx on public.application_forms (created_at desc);
create index if not exists form_fields_form_id_sort_order_idx on public.form_fields (form_id, sort_order);

drop trigger if exists application_forms_touch_updated_at on public.application_forms;
create trigger application_forms_touch_updated_at
before update on public.application_forms
for each row
execute function public.touch_updated_at();

alter table public.campaigns
  add column if not exists application_form_id uuid;

alter table public.campaigns
  drop constraint if exists campaigns_application_form_id_fkey;

alter table public.campaigns
  add constraint campaigns_application_form_id_fkey
  foreign key (application_form_id)
  references public.application_forms(id)
  on delete set null;

drop trigger if exists form_fields_touch_updated_at on public.form_fields;
create trigger form_fields_touch_updated_at
before update on public.form_fields
for each row
execute function public.touch_updated_at();
