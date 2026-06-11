import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(currentDir, '../../.env') })

const SUPABASE_URL = process.env.SUPABASE_URL?.trim()
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY?.trim()

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SERVICE_ROLE_KEY must be set in .env')
}

async function runSql(sql) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`SQL execution failed: ${resp.status} ${text}`)
  }

  return resp.json().catch(() => null)
}

// We'll use a different approach — check if column exists and create via insert/upsert trick
// The cleanest way is to use Supabase's pg_catalog or information_schema via REST
async function checkColumnExists(table, column) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/column_exists`
  // Fallback: query information_schema via REST
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/information_schema.columns?table_name=eq.${table}&column_name=eq.${column}&select=column_name`,
    {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  )

  if (resp.ok) {
    const data = await resp.json()
    return Array.isArray(data) && data.length > 0
  }
  return false
}

async function main() {
  console.log('Checking Supabase connectivity...')

  // Test connectivity
  const testResp = await fetch(`${SUPABASE_URL}/rest/v1/campaigns?select=id&limit=1`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  })

  if (!testResp.ok) {
    throw new Error(`Cannot connect to Supabase: ${testResp.status} ${await testResp.text()}`)
  }

  console.log('Connected to Supabase successfully.')

  // Check if application_form_id column exists on campaigns
  console.log('Checking if application_form_id column exists on campaigns...')
  const colCheck = await fetch(
    `${SUPABASE_URL}/rest/v1/campaigns?select=application_form_id&limit=1`,
    {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
    }
  )

  if (colCheck.status === 400) {
    const body = await colCheck.text()
    if (body.includes('application_form_id')) {
      console.log('Column does not exist. Need to run DDL migration.')
      console.log('')
      console.log('================================================================')
      console.log('ACTION REQUIRED: Please run the following SQL in your Supabase')
      console.log('SQL Editor at: https://supabase.com/dashboard/project/ifhcdijkpyipytaivkrr/sql')
      console.log('================================================================')
      console.log('')
      console.log(`-- Step 1: Create or replace the timestamp trigger function
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Step 2: Create form_submissions table
CREATE TABLE IF NOT EXISTS public.form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.application_forms(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  responses jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Step 3: Indexes
CREATE INDEX IF NOT EXISTS form_submissions_form_id_idx ON public.form_submissions (form_id);
CREATE INDEX IF NOT EXISTS form_submissions_campaign_id_idx ON public.form_submissions (campaign_id);

-- Step 4: Trigger
DROP TRIGGER IF EXISTS form_submissions_touch_updated_at ON public.form_submissions;
CREATE TRIGGER form_submissions_touch_updated_at
BEFORE UPDATE ON public.form_submissions
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

-- Step 5: Add application_form_id to campaigns
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS application_form_id uuid;

ALTER TABLE public.campaigns
  DROP CONSTRAINT IF EXISTS campaigns_application_form_id_fkey;

ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_application_form_id_fkey
  FOREIGN KEY (application_form_id)
  REFERENCES public.application_forms(id)
  ON DELETE SET NULL;
`)
      console.log('')
      console.log('================================================================')
      process.exit(1)
    }
  } else {
    console.log('Column application_form_id already exists on campaigns table. ✓')
  }

  // Check form_submissions table
  const submissionsCheck = await fetch(
    `${SUPABASE_URL}/rest/v1/form_submissions?select=id&limit=1`,
    {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
    }
  )

  if (submissionsCheck.status === 404 || submissionsCheck.status === 400) {
    console.log('form_submissions table does not exist.')
    console.log('Please run the SQL above in the Supabase SQL Editor.')
    process.exit(1)
  } else {
    console.log('form_submissions table exists. ✓')
  }

  console.log('')
  console.log('All migrations are in place! The schema is ready.')
}

main().catch((error) => {
  console.error('Migration check failed:', error.message)
  process.exit(1)
})
