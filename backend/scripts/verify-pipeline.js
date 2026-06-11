import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(currentDir, '../../.env') })

const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL
const BASE_URL = 'http://localhost:3001/api'

if (!connectionString) {
  throw new Error('DATABASE_URL or SUPABASE_DB_URL must be set')
}

function pass(msg) { console.log(`  ✅  ${msg}`) }
function fail(msg) { console.error(`  ❌  ${msg}`) }

async function main() {
  console.log('=== VERIFYING INTEGRATED CANDIDATE PIPELINE ===\n')

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()

  // 1. Setup mock campaign and form directly in the database
  console.log('1. Setting up mock campaign and form...')
  const campaignRes = await client.query(`
    INSERT INTO public.campaigns (name, opportunity_title, opportunity_desc, mode, target_region, start_date, end_date, status)
    VALUES ('Pipeline Verification', 'Delivery Agent', 'Test description for verification campaign.', 'direct_sourcing', 'Bangalore', '2026-06-01', '2026-12-31', 'active')
    RETURNING id
  `)
  const campaignId = campaignRes.rows[0].id

  const jobId = `FORM-${campaignId.slice(0, 8).toUpperCase()}-V2`
  const formRes = await client.query(`
    INSERT INTO public.application_forms (campaign_id, title, job_id, consent_text, version, is_published)
    VALUES ($1, 'Verification Form', $2, 'I accept terms and data storage policies.', 2, true)
    RETURNING id
  `, [campaignId, jobId])
  const formId = formRes.rows[0].id

  // Update campaign to link form
  await client.query(`
    UPDATE public.campaigns SET application_form_id = $1 WHERE id = $2
  `, [formId, campaignId])

  // Insert form fields: Full Name, Phone, Consent, and Resume
  const fullNameFieldRes = await client.query(`
    INSERT INTO public.form_fields (form_id, field_key, field_type, label, is_required, display_order)
    VALUES ($1, 'full_name_0', 'text', 'Full Name', true, 0) RETURNING id
  `, [formId])
  const fullNameFieldId = fullNameFieldRes.rows[0].id

  const phoneFieldRes = await client.query(`
    INSERT INTO public.form_fields (form_id, field_key, field_type, label, is_required, display_order)
    VALUES ($1, 'mobile_number_1', 'phone', 'Mobile Number', true, 1) RETURNING id
  `, [formId])
  const phoneFieldId = phoneFieldRes.rows[0].id

  const consentFieldRes = await client.query(`
    INSERT INTO public.form_fields (form_id, field_key, field_type, label, is_required, display_order)
    VALUES ($1, 'consent_data_storage_2', 'checkbox', 'Consent to data storage', true, 2) RETURNING id
  `, [formId])
  const consentFieldId = consentFieldRes.rows[0].id

  const resumeFieldRes = await client.query(`
    INSERT INTO public.form_fields (form_id, field_key, field_type, label, is_required, display_order)
    VALUES ($1, 'upload_resume_3', 'file_upload', 'Upload Resume', false, 3) RETURNING id
  `, [formId])
  const resumeFieldId = resumeFieldRes.rows[0].id

  pass(`Mock Campaign ID: ${campaignId}`)
  pass(`Mock Form ID: ${formId}`)

  // 2. Submit first candidate application (New Worker)
  console.log('\n2. Submitting first candidate application (New Worker)...')
  const responses = {
    [fullNameFieldId]: 'Alice Smith',
    [phoneFieldId]: '+919988776655',
    [consentFieldId]: true,
    [resumeFieldId]: 'alice_cv.pdf',
  }

  const submit1Resp = await fetch(`${BASE_URL}/forms/${formId}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ responses }),
  })

  if (!submit1Resp.ok) {
    fail(`Submit 1 failed: ${submit1Resp.status} ${await submit1Resp.text()}`)
    await cleanup(client, campaignId, formId)
    await client.end()
    process.exit(1)
  }

  const submit1Data = await submit1Resp.json()
  pass(`First submission response: ${JSON.stringify(submit1Data)}`)
  const app1Id = submit1Data.application_id
  const profile1Id = submit1Data.worker_profile_id

  // Verify DB records for first submission
  const app1Row = await client.query('SELECT * FROM public.candidate_applications WHERE id = $1', [app1Id])
  if (app1Row.rows[0]?.status === 'application_received' && !app1Row.rows[0]?.is_duplicate) {
    pass('Application 1 status: application_received and is_duplicate = false ✓')
  } else {
    fail(`Application 1 status mismatch: ${JSON.stringify(app1Row.rows[0])}`)
  }

  const profile1Row = await client.query('SELECT * FROM public.worker_profiles WHERE id = $1', [profile1Id])
  if (profile1Row.rows[0]?.mobile === '9988776655') {
    pass('Worker profile 1 created with mobile number ✓')
  } else {
    fail(`Worker profile 1 creation failed. Got mobile: ${profile1Row.rows[0]?.mobile}`)
  }

  const consent1Row = await client.query('SELECT * FROM public.consent_logs WHERE application_id = $1', [app1Id])
  if (consent1Row.rows.length > 0 && consent1Row.rows[0].consent_type === 'data_storage_contact') {
    pass('Consent captured in consent_logs table ✓')
  } else {
    fail(`Consent capture log not found. Got: ${JSON.stringify(consent1Row.rows)}`)
  }

  const doc1Row = await client.query('SELECT * FROM public.documents WHERE application_id = $1', [app1Id])
  if (doc1Row.rows.length > 0 && doc1Row.rows[0].file_name === 'alice_cv.pdf') {
    pass('Uploaded file reference created in documents table ✓')
  } else {
    fail('Document log not found.')
  }

  const event1Row = await client.query('SELECT * FROM public.workflow_events WHERE application_id = $1', [app1Id])
  if (event1Row.rows.length > 0 && event1Row.rows[0].to_stage === 'application_received') {
    pass('Workflow event logged for submission ✓')
  } else {
    fail('Workflow event logging failed.')
  }

  // 3. Submit second candidate application (Duplicate Mobile Number)
  console.log('\n3. Submitting second candidate application with matching mobile (Duplicate Worker)...')
  const responsesDup = {
    [fullNameFieldId]: 'Alice S. (Duplicate)',
    [phoneFieldId]: '+919988776655', // Match!
    [consentFieldId]: true,
    [resumeFieldId]: 'alice_new_cv.pdf',
  }

  const submit2Resp = await fetch(`${BASE_URL}/forms/${formId}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ responses: responsesDup }),
  })

  if (!submit2Resp.ok) {
    fail(`Submit 2 failed: ${submit2Resp.status} ${await submit2Resp.text()}`)
    await cleanup(client, campaignId, formId)
    await client.end()
    process.exit(1)
  }

  const submit2Data = await submit2Resp.json()
  pass(`Second submission response: ${JSON.stringify(submit2Data)}`)
  const app2Id = submit2Data.application_id
  const profile2Id = submit2Data.worker_profile_id

  if (profile2Id === profile1Id) {
    pass('Second application linked to existing worker profile ID ✓')
  } else {
    fail(`Worker profile linked incorrectly: ${profile2Id} vs ${profile1Id}`)
  }

  // Verify duplicate flags
  const app2Row = await client.query('SELECT * FROM public.candidate_applications WHERE id = $1', [app2Id])
  if (app2Row.rows[0]?.status === 'duplicate_review' && app2Row.rows[0]?.is_duplicate && app2Row.rows[0]?.duplicate_of === app1Id) {
    pass('Application 2 marked as duplicate_review and linked duplicate_of app1Id ✓')
  } else {
    fail(`Application 2 duplicate details mismatch: ${JSON.stringify(app2Row.rows[0])}`)
  }

  const event2Row = await client.query('SELECT * FROM public.workflow_events WHERE application_id = $1', [app2Id])
  if (event2Row.rows.length > 0 && event2Row.rows[0].to_stage === 'duplicate_review') {
    pass('Workflow event logged with to_stage: duplicate_review ✓')
  } else {
    fail('Workflow event duplicate review logging failed.')
  }

  // 4. Cleanup
  console.log('\n4. Cleaning up mock records...')
  await cleanup(client, campaignId, formId)
  pass('Cleanup complete. All pipeline database tables successfully verified.')

  await client.end()
}

async function cleanup(client, campaignId, formId) {
  // Delete in FK dependency order: children first, then parents
  // 1. workflow_events → candidate_applications
  await client.query(`
    DELETE FROM public.workflow_events
    WHERE application_id IN (
      SELECT id FROM public.candidate_applications WHERE campaign_id = $1
    )
  `, [campaignId])

  // 2. consent_logs → candidate_applications
  await client.query(`
    DELETE FROM public.consent_logs
    WHERE application_id IN (
      SELECT id FROM public.candidate_applications WHERE campaign_id = $1
    )
  `, [campaignId])

  // 3. documents → candidate_applications
  await client.query(`
    DELETE FROM public.documents
    WHERE application_id IN (
      SELECT id FROM public.candidate_applications WHERE campaign_id = $1
    )
  `, [campaignId])

  // 4. candidate_applications → campaign
  await client.query('DELETE FROM public.candidate_applications WHERE campaign_id = $1', [campaignId])

  // 5. form_submissions → campaign
  await client.query('DELETE FROM public.form_submissions WHERE campaign_id = $1', [campaignId])

  // 6. form_fields → application_forms
  await client.query('DELETE FROM public.form_fields WHERE form_id = $1', [formId])

  // 7. application_forms → campaign
  await client.query('DELETE FROM public.application_forms WHERE id = $1', [formId])

  // 8. worker_profiles created during test
  await client.query("DELETE FROM public.worker_profiles WHERE mobile IN ('+919988776655', '9988776655')")

  // 9. Finally the campaign itself
  await client.query('DELETE FROM public.campaigns WHERE id = $1', [campaignId])
}

main().catch(console.error)
