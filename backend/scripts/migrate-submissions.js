import dotenv from 'dotenv'
import { Client } from 'pg'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(currentDir, '../../.env') })

const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL

if (!connectionString) {
  throw new Error('DATABASE_URL or SUPABASE_DB_URL must be set')
}

const sql = `
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.application_forms(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  responses jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists form_submissions_form_id_idx on public.form_submissions (form_id);
create index if not exists form_submissions_campaign_id_idx on public.form_submissions (campaign_id);

drop trigger if exists form_submissions_touch_updated_at on public.form_submissions;
create trigger form_submissions_touch_updated_at
before update on public.form_submissions
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
`

async function main() {
  console.log('Connecting to database...')
  const client = new Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false,
    },
  })

  await client.connect()
  console.log('Executing migration query...')
  await client.query(sql)
  await client.end()
  console.log('form_submissions migration completed successfully.')
}

main().catch((error) => {
  console.error('Migration failed:', error)
  process.exit(1)
})
