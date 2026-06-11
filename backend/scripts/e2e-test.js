const BASE = 'http://localhost:3001/api'

async function get(path) {
  const r = await fetch(`${BASE}${path}`)
  if (!r.ok) throw new Error(`GET ${path} => ${r.status}: ${await r.text()}`)
  return r.json()
}

async function post(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`POST ${path} => ${r.status}: ${await r.text()}`)
  return r.json()
}

async function put(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`PUT ${path} => ${r.status}: ${await r.text()}`)
  return r.json()
}

function pass(msg) { console.log(`  ✅  ${msg}`) }
function fail(msg) { console.error(`  ❌  ${msg}`) }

async function main() {
  console.log('\n=== OUTREACH CAMPAIGN — END-TO-END API TEST ===\n')

  // ── Step 1: List campaigns ──────────────────────────────────────────────────
  console.log('STEP 1: List existing campaigns')
  const list = await get('/campaigns?limit=5')
  pass(`Found ${list.pagination.total} existing campaign(s)`)

  // ── Step 2: Create campaign ─────────────────────────────────────────────────
  console.log('\nSTEP 2: Create new campaign')
  const campaign = await post('/campaigns', {
    name: 'E2E Test — Gig Worker Drive',
    opportunity_title: 'Delivery Partner',
    opportunity_desc: 'Join our delivery network and earn up to Rs 25000 per month working flexible hours in your city. Training provided daily.',
    mode: 'direct_sourcing',
    worker_type: 'delivery',
    target_region: 'Delhi NCR',
    skills_required: ['Driving', 'Navigation', 'Customer Service'],
    target_channels: ['whatsapp', 'facebook'],
    compensation_model: 'daily',
    start_date: '2026-07-01',
    end_date: '2026-09-30',
    status: 'draft',
  })
  pass(`Campaign created: ID = ${campaign.id}`)
  pass(`Mode: ${campaign.mode}`)
  pass(`application_form_id: ${campaign.application_form_id ?? 'null (expected — no form yet)'}`)
  const campaignId = campaign.id

  // ── Step 3: Create application form ────────────────────────────────────────
  console.log('\nSTEP 3: Create application form linked to campaign')
  const form = await post('/forms', {
    name: 'Delivery Partner Application Form',
    description: 'Application form for delivery partner gig role',
    campaign_id: campaignId,
    supported_languages: ['English', 'Hindi'],
  })
  pass(`Form created: ID = ${form.id}`)
  pass(`Job ID: ${form.job_id}`)
  const formId = form.id

  // ── Step 4: Verify campaign now has application_form_id ────────────────────
  console.log('\nSTEP 4: Verify campaign now linked to form')
  const updatedCampaign = await get(`/campaigns/${campaignId}`)
  if (updatedCampaign.application_form_id === formId) {
    pass(`Campaign.application_form_id = ${formId} ✓`)
  } else {
    fail(`Campaign.application_form_id = ${updatedCampaign.application_form_id} (expected ${formId})`)
  }

  // ── Step 5: Add fields to form ─────────────────────────────────────────────
  console.log('\nSTEP 5: Add form fields')

  const fieldDefs = [
    { field_type: 'Text',     label: 'Full Name',                required: true,  sort_order: 0 },
    { field_type: 'Phone',    label: 'Mobile Number',            required: true,  sort_order: 1 },
    { field_type: 'Email',    label: 'Email Address',            required: false, sort_order: 2 },
    { field_type: 'Text',     label: 'Current Location',         required: true,  sort_order: 3 },
    { field_type: 'Text',     label: 'Preferred Work Location',  required: false, sort_order: 4 },
    { field_type: 'Select',   label: 'Worker Category',          required: true,  sort_order: 5,
      options: ['Delivery', 'Logistics', 'Warehouse', 'Other'] },
    { field_type: 'Text',     label: 'Key Skills',               required: false, sort_order: 6 },
    { field_type: 'Number',   label: 'Years of Experience',      required: false, sort_order: 7 },
    { field_type: 'Select',   label: 'Availability / Shift',     required: false, sort_order: 8,
      options: ['Morning', 'Afternoon', 'Evening', 'Night', 'Flexible'] },
    { field_type: 'Select',   label: 'Government ID Type',       required: false, sort_order: 9,
      options: ['Aadhaar', 'PAN', 'Voter ID', 'Passport', 'Driving Licence'] },
    { field_type: 'Checkbox', label: 'Consent — I agree to the terms, data storage and contact policy', required: true, sort_order: 10 },
  ]

  const createdFields = []
  for (const fd of fieldDefs) {
    const field = await post(`/forms/${formId}/fields`, {
      field_type: fd.field_type,
      label: fd.label,
      required: fd.required,
      placeholder: '',
      help_text: '',
      options: fd.options ?? [],
      validation_rules: {},
      visibility_condition: null,
      sort_order: fd.sort_order,
    })
    createdFields.push(field)
    pass(`Added field: "${fd.label}" (${fd.field_type})`)
  }

  // ── Step 6: Read form back to confirm fields ───────────────────────────────
  console.log('\nSTEP 6: Read form and verify fields')
  const fullForm = await get(`/forms/${formId}`)
  pass(`Form has ${fullForm.fields.length} fields`)
  const consentField = fullForm.fields.find(f => f.label.toLowerCase().includes('consent'))
  if (consentField) {
    pass(`Consent field found: ID = ${consentField.id}`)
  } else {
    fail('Consent field not found!')
  }

  // ── Step 7: Submit application as candidate ────────────────────────────────
  console.log('\nSTEP 7: Submit application as candidate')

  const responses = {}
  for (const field of fullForm.fields) {
    const lbl = field.label.toLowerCase()
    if (lbl.includes('full name')) responses[field.id] = 'Rahul Kumar'
    else if (lbl.includes('mobile')) responses[field.id] = '9876543210'
    else if (lbl.includes('email')) responses[field.id] = 'rahul.kumar@example.com'
    else if (lbl.includes('current location')) responses[field.id] = 'Delhi'
    else if (lbl.includes('preferred')) responses[field.id] = 'Delhi NCR'
    else if (lbl.includes('worker category')) responses[field.id] = 'Delivery'
    else if (lbl.includes('key skills')) responses[field.id] = 'Driving, Navigation'
    else if (lbl.includes('years')) responses[field.id] = '2'
    else if (lbl.includes('availability') || lbl.includes('shift')) responses[field.id] = 'Flexible'
    else if (lbl.includes('government id')) responses[field.id] = 'Aadhaar'
    else if (lbl.includes('consent')) responses[field.id] = true
  }

  const submission = await post(`/forms/${formId}/submit`, { responses })
  pass(`Submission created: ID = ${submission.submission.id}`)
  pass(`Message: ${submission.message}`)

  // ── Step 8: Try submitting without consent (should fail) ──────────────────
  console.log('\nSTEP 8: Validate — submit without consent should fail')
  const badResponses = { ...responses }
  const consentId = Object.keys(responses).find(k => {
    const f = fullForm.fields.find(f => f.id === k)
    return f?.label.toLowerCase().includes('consent')
  })
  if (consentId) {
    delete badResponses[consentId]
    try {
      await post(`/forms/${formId}/submit`, { responses: badResponses })
      fail('Should have rejected submission without consent!')
    } catch (e) {
      pass(`Correctly rejected — ${e.message.slice(0, 80)}...`)
    }
  }

  // ── Step 9: Recruiter views submissions ───────────────────────────────────
  console.log('\nSTEP 9: Recruiter fetches campaign submissions')
  const submissions = await get(`/campaigns/${campaignId}/submissions`)
  pass(`Submissions count: ${submissions.data.length}`)
  if (submissions.data.length > 0) {
    const s = submissions.data[0]
    pass(`First submission ID: ${s.id}`)
    const fullName = Object.values(s.responses).find(v => v === 'Rahul Kumar')
    if (fullName) pass(`Candidate name found in responses ✓`)
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n=== TEST SUMMARY ===')
  console.log(`Campaign ID:  ${campaignId}`)
  console.log(`Form ID:      ${formId}`)
  console.log(`Public URL:   http://localhost:5173/apply/${formId}`)
  console.log(`Applicants:   http://localhost:5173/campaigns/${campaignId}/applicants`)
  console.log('\nAll steps completed successfully! ✅')
}

main().catch((err) => {
  console.error('\n❌ TEST FAILED:', err.message)
  process.exit(1)
})
