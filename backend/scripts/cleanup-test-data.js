import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(currentDir, '../../.env') })

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

console.log('Cleaning up leftover test data from verify-pipeline runs...')

// Find any worker profiles with the test mobile number
const profiles = await client.query(
  "SELECT id FROM public.worker_profiles WHERE mobile = '+919988776655'"
)
console.log(`Found ${profiles.rows.length} test worker profile(s)`)

for (const profile of profiles.rows) {
  const pid = profile.id

  // Get all applications for this worker
  const apps = await client.query(
    'SELECT id FROM public.candidate_applications WHERE worker_profile_id = $1', [pid]
  )
  console.log(`  Profile ${pid}: ${apps.rows.length} application(s)`)

  for (const app of apps.rows) {
    const aid = app.id
    await client.query('DELETE FROM public.workflow_events WHERE application_id = $1', [aid])
    await client.query('DELETE FROM public.consent_logs WHERE application_id = $1', [aid])
    await client.query('DELETE FROM public.documents WHERE application_id = $1', [aid])
    console.log(`  Deleted audit rows for application ${aid}`)
  }

  await client.query('DELETE FROM public.candidate_applications WHERE worker_profile_id = $1', [pid])
  await client.query('DELETE FROM public.worker_profiles WHERE id = $1', [pid])
  console.log(`  Deleted worker profile ${pid} and its applications`)
}

// Clean up any leftover Pipeline Verification campaigns
const campaigns = await client.query(
  "SELECT id FROM public.campaigns WHERE name = 'Pipeline Verification'"
)
console.log(`\nFound ${campaigns.rows.length} Pipeline Verification campaign(s)`)

for (const camp of campaigns.rows) {
  const cid = camp.id
  // Get forms
  const forms = await client.query(
    'SELECT id FROM public.application_forms WHERE campaign_id = $1', [cid]
  )
  for (const form of forms.rows) {
    // Delete candidate_applications linked to this form (and their audit rows) first
    const apps = await client.query(
      'SELECT id FROM public.candidate_applications WHERE form_id = $1', [form.id]
    )
    for (const app of apps.rows) {
      await client.query('DELETE FROM public.workflow_events WHERE application_id = $1', [app.id])
      await client.query('DELETE FROM public.consent_logs WHERE application_id = $1', [app.id])
      await client.query('DELETE FROM public.documents WHERE application_id = $1', [app.id])
    }
    await client.query('DELETE FROM public.candidate_applications WHERE form_id = $1', [form.id])
    await client.query('DELETE FROM public.form_submissions WHERE form_id = $1', [form.id])
    await client.query('DELETE FROM public.form_fields WHERE form_id = $1', [form.id])
    await client.query('DELETE FROM public.application_forms WHERE id = $1', [form.id])
  }
  // Also delete any candidate_applications referencing this campaign directly
  const campApps = await client.query(
    'SELECT id FROM public.candidate_applications WHERE campaign_id = $1', [cid]
  )
  for (const app of campApps.rows) {
    await client.query('DELETE FROM public.workflow_events WHERE application_id = $1', [app.id])
    await client.query('DELETE FROM public.consent_logs WHERE application_id = $1', [app.id])
    await client.query('DELETE FROM public.documents WHERE application_id = $1', [app.id])
  }
  await client.query('DELETE FROM public.candidate_applications WHERE campaign_id = $1', [cid])
  await client.query('DELETE FROM public.campaigns WHERE id = $1', [cid])
  console.log(`  Deleted campaign ${cid}`)
}

console.log('\n✅ Cleanup complete.')
await client.end()
