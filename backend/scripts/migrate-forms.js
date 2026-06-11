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
alter table public.application_forms
  add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;

alter table public.application_forms
  add column if not exists version integer not null default 1;

alter table public.application_forms
  add column if not exists supported_languages text[] not null default '{}'::text[];

create index if not exists application_forms_campaign_id_idx on public.application_forms (campaign_id);

update public.application_forms
set version = coalesce(version, 1),
    supported_languages = coalesce(supported_languages, '{}'::text[])
where version is null or supported_languages is null;
`

async function main() {
  const client = new Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false,
    },
  })

  await client.connect()
  await client.query(sql)
  await client.end()
  console.log('application_forms migrated')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
