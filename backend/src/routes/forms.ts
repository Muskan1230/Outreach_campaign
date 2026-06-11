import { Router, type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import { supabase } from '../lib/supabase.js'
import {
  applicationFieldTypes,
  type ApplicationFieldPayload,
  type ApplicationFieldRecord,
  type ApplicationFormPayload,
  type ApplicationFormRecord,
  type ValidationRules,
} from '../../../shared/applicationForm.js'
import { normalizeWorkerCategory } from '../../../shared/campaign.js'

const router = Router()

const applicationFormSchema = z.object({
  name: z.string().trim().min(2, 'Form name is required'),
  description: z.string().trim().optional().default(''),
  campaign_id: z.string().uuid().nullable().optional(),
  supported_languages: z.array(z.string().trim().min(1)).optional().default([]),
  is_published: z.boolean().optional(),
})

const fieldTypeSchema = z.enum(applicationFieldTypes)
const validationRuleValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.null(),
])

const fieldPayloadSchema = z.object({
  field_type: fieldTypeSchema,
  label: z.string().trim().min(2, 'Field label is required'),
  placeholder: z.string().trim().optional().default(''),
  required: z.boolean().default(false),
  help_text: z.string().trim().optional().default(''),
  options: z.array(z.string().trim().min(1)).default([]),
  validation_rules: z.record(z.string(), validationRuleValueSchema).optional().default({}),
  visibility_condition: z
    .object({
      field_id: z.string().uuid(),
      operator: z.string(),
      value: z.string().optional(),
    })
    .nullable()
    .optional()
    .default(null),
  sort_order: z.number().int().optional(),
})

function handleError(error: unknown, next: NextFunction) {
  return next(error)
}

function mapPayloadToDbFieldType(payloadType: string): string {
  switch (payloadType) {
    case 'Text': return 'text'
    case 'Number': return 'number'
    case 'Email': return 'email'
    case 'Phone': return 'phone'
    case 'Select': return 'select'
    case 'Radio': return 'radio'
    case 'Checkbox': return 'checkbox'
    case 'Date': return 'date'
    case 'File Upload': return 'file_upload'
    default: return payloadType.toLowerCase()
  }
}

function mapDbToPayloadFieldType(dbType: string): any {
  switch (dbType) {
    case 'text': return 'Text'
    case 'number': return 'Number'
    case 'email': return 'Email'
    case 'phone': return 'Phone'
    case 'select': return 'Select'
    case 'radio': return 'Radio'
    case 'checkbox': return 'Checkbox'
    case 'date': return 'Date'
    case 'file_upload': return 'File Upload'
    default:
      if (!dbType) return 'Text'
      return dbType.charAt(0).toUpperCase() + dbType.slice(1)
  }
}

// ── Actual DB column names for application_forms ──────────────────────────────
// application_forms: id, campaign_id, title, job_id, consent_text, version,
//   allow_save_and_continue, is_active, supported_languages, created_by,
//   created_at, updated_at

type FormRow = {
  id: string
  campaign_id: string | null
  title: string | null
  job_id: string
  consent_text: string
  version: number
  allow_save_and_continue: boolean
  is_active: boolean
  is_published: boolean
  supported_languages: string[] | null
  created_by: string | null
  created_at: string
  updated_at: string
}

function normalizeForm(record: FormRow) {
  return {
    id: record.id,
    campaign_id: record.campaign_id,
    name: record.title ?? '',
    description: record.consent_text ?? '',
    job_id: record.job_id,
    version: record.version ?? 1,
    allow_save_and_continue: record.allow_save_and_continue ?? false,
    is_active: record.is_active ?? true,
    is_published: record.is_published ?? false,
    created_by: record.created_by ?? null,
    created_at: record.created_at,
    updated_at: record.updated_at,
    supported_languages: Array.isArray(record.supported_languages) ? record.supported_languages : [],
  }
}

// ── Actual DB column names for form_fields ────────────────────────────────────
// form_fields: id, form_id, field_key, label, field_type, is_required,
//   is_visible, display_order, options, validation_rules, conditional_logic,
//   placeholder_text, help_text, created_at

type FieldRow = {
  id: string
  form_id: string
  field_key: string
  field_type: string
  label: string
  placeholder_text: string | null
  is_required: boolean
  is_visible: boolean
  help_text: string | null
  options: string[] | null
  validation_rules: Record<string, unknown> | null
  conditional_logic: ApplicationFieldRecord['visibility_condition'] | null
  display_order: number
  created_at: string
}

function normalizeField(record: FieldRow): ApplicationFieldRecord {
  return {
    id: record.id,
    form_id: record.form_id,
    field_type: mapDbToPayloadFieldType(record.field_type),
    label: record.label,
    placeholder: record.placeholder_text ?? '',
    required: record.is_required,
    help_text: record.help_text ?? '',
    options: Array.isArray(record.options) ? record.options : [],
    validation_rules: (record.validation_rules ?? {}) as ValidationRules,
    visibility_condition: record.conditional_logic ?? null,
    sort_order: record.display_order,
    created_at: record.created_at,
    updated_at: record.created_at, // form_fields has no updated_at
  }
}

function buildJobId(campaignId: string, version: number) {
  return `FORM-${campaignId.slice(0, 8).toUpperCase()}-V${version}`
}

function fieldKeyFromLabel(label: string, index: number) {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 40) +
    '_' +
    index
  )
}

const FORM_SELECT =
  'id,campaign_id,title,job_id,consent_text,version,allow_save_and_continue,is_active,is_published,supported_languages,created_by,created_at,updated_at'
const FIELD_SELECT =
  'id,form_id,field_key,label,field_type,is_required,is_visible,display_order,options,validation_rules,conditional_logic,placeholder_text,help_text,created_at'

// ── Routes ────────────────────────────────────────────────────────────────────

router.get('/forms', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [{ data: formsData, error: formsError }, { data: fieldsData, error: fieldsError }] =
      await Promise.all([
        supabase
          .from('application_forms')
          .select(FORM_SELECT)
          .order('created_at', { ascending: false }),
        supabase.from('form_fields').select('form_id'),
      ])

    if (formsError) throw formsError
    if (fieldsError) throw fieldsError

    const counts = (fieldsData ?? []).reduce<Record<string, number>>((acc, field) => {
      acc[field.form_id] = (acc[field.form_id] ?? 0) + 1
      return acc
    }, {})

    return res.json({
      data: (formsData ?? []).map((item) => ({
        ...normalizeForm(item as unknown as FormRow),
        field_count: counts[item.id] ?? 0,
      })),
    })
  } catch (error) {
    return handleError(error, next)
  }
})

router.post('/forms', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = applicationFormSchema.parse(req.body) satisfies ApplicationFormPayload
    const campaignId = payload.campaign_id ?? null

    if (!campaignId) {
      return res.status(400).json({ message: 'campaign id is required' })
    }

    const { count, error: countError } = await supabase
      .from('application_forms')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)

    if (countError) throw countError
    const version = (count ?? 0) + 1
    const jobId = buildJobId(campaignId, version)

    const { data, error } = await supabase
      .from('application_forms')
      .insert({
        campaign_id: campaignId,
        title: payload.name,
        job_id: jobId,
        consent_text: payload.description ?? '',
        version,
        allow_save_and_continue: false,
        is_active: true,
        is_published: payload.is_published ?? false,
        supported_languages: payload.supported_languages ?? [],
      })
      .select(FORM_SELECT)
      .single()

    if (error) throw error

    // Link campaign to this new form
    const { error: linkError } = await supabase
      .from('campaigns')
      .update({ application_form_id: data.id })
      .eq('id', campaignId)

    if (linkError) throw linkError

    return res.status(201).json(normalizeForm(data as unknown as FormRow))
  } catch (error) {
    return handleError(error, next)
  }
})

router.get('/forms/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [{ data: formData, error: formError }, { data: fieldData, error: fieldError }] =
      await Promise.all([
        supabase
          .from('application_forms')
          .select(FORM_SELECT)
          .eq('id', req.params.id)
          .single(),
        supabase
          .from('form_fields')
          .select(FIELD_SELECT)
          .eq('form_id', req.params.id)
          .order('display_order', { ascending: true })
          .order('created_at', { ascending: true }),
      ])

    if (formError) {
      if (formError.code === 'PGRST116') {
        return res.status(404).json({ message: 'Form not found' })
      }
      throw formError
    }

    if (fieldError) throw fieldError

    return res.json({
      ...normalizeForm(formData as unknown as FormRow),
      fields: (fieldData ?? []).map((field) => normalizeField(field as unknown as FieldRow)),
    })
  } catch (error) {
    return handleError(error, next)
  }
})

router.put('/forms/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = applicationFormSchema.parse(req.body) satisfies ApplicationFormPayload

    const existingResponse = await supabase
      .from('application_forms')
      .select('campaign_id,version')
      .eq('id', req.params.id)
      .single()

    if (existingResponse.error) {
      if (existingResponse.error.code === 'PGRST116') {
        return res.status(404).json({ message: 'Form not found' })
      }
      throw existingResponse.error
    }

    const resolvedCampaignId = payload.campaign_id ?? existingResponse.data.campaign_id
    if (!resolvedCampaignId) {
      return res.status(400).json({ message: 'campaign id is required' })
    }

    const updatePayload: Record<string, any> = {
      title: payload.name,
      consent_text: payload.description ?? '',
      campaign_id: resolvedCampaignId,
      supported_languages: payload.supported_languages ?? [],
      job_id: buildJobId(resolvedCampaignId, existingResponse.data.version ?? 1),
    }

    if (payload.is_published !== undefined) {
      updatePayload.is_published = payload.is_published
    }

    const { data, error } = await supabase
      .from('application_forms')
      .update(updatePayload)
      .eq('id', req.params.id)
      .select(FORM_SELECT)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ message: 'Form not found' })
      }
      throw error
    }

    // Link campaign to this form
    const { error: linkError } = await supabase
      .from('campaigns')
      .update({ application_form_id: data.id })
      .eq('id', resolvedCampaignId)

    if (linkError) throw linkError

    return res.json(normalizeForm(data as unknown as FormRow))
  } catch (error) {
    return handleError(error, next)
  }
})

router.post('/forms/:id/fields', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = fieldPayloadSchema.parse(req.body) as any as ApplicationFieldPayload

    const { data: existingFields, error: countError } = await supabase
      .from('form_fields')
      .select('id', { count: 'exact' })
      .eq('form_id', req.params.id)

    if (countError) throw countError

    const nextOrder = payload.sort_order ?? (existingFields?.length ?? 0)
    const fieldKey = fieldKeyFromLabel(payload.label, nextOrder)

    const { data, error } = await supabase
      .from('form_fields')
      .insert({
        form_id: req.params.id,
        field_key: fieldKey,
        field_type: mapPayloadToDbFieldType(payload.field_type),
        label: payload.label,
        placeholder_text: payload.placeholder || null,
        is_required: payload.required,
        is_visible: true,
        help_text: payload.help_text || null,
        options: payload.options,
        validation_rules: payload.validation_rules,
        conditional_logic: payload.visibility_condition,
        display_order: nextOrder,
      })
      .select(FIELD_SELECT)
      .single()

    if (error) throw error

    return res.status(201).json(normalizeField(data as unknown as FieldRow))
  } catch (error) {
    return handleError(error, next)
  }
})

router.put('/fields/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = fieldPayloadSchema.parse(req.body) as any as ApplicationFieldPayload

    const updates: Record<string, unknown> = {
      field_type: mapPayloadToDbFieldType(payload.field_type),
      label: payload.label,
      placeholder_text: payload.placeholder || null,
      is_required: payload.required,
      help_text: payload.help_text || null,
      options: payload.options,
      validation_rules: payload.validation_rules,
      conditional_logic: payload.visibility_condition,
    }

    if (payload.sort_order !== undefined) {
      updates.display_order = payload.sort_order
    }

    const { data, error } = await supabase
      .from('form_fields')
      .update(updates)
      .eq('id', req.params.id)
      .select(FIELD_SELECT)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ message: 'Field not found' })
      }
      throw error
    }

    return res.json(normalizeField(data as unknown as FieldRow))
  } catch (error) {
    return handleError(error, next)
  }
})

router.delete('/fields/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabase
      .from('form_fields')
      .delete()
      .eq('id', req.params.id)
      .select('id')
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ message: 'Field not found' })
      }
      throw error
    }

    if (!data) {
      return res.status(404).json({ message: 'Field not found' })
    }

    return res.status(204).send()
  } catch (error) {
    return handleError(error, next)
  }
})

// ── Helper: normalize Indian mobile numbers to 10 digits ──────────────────────
function normalizeIndianMobile(val: unknown): string {
  if (typeof val !== 'string') return ''
  let normalized = val.trim().replace(/[\s\-()]/g, '')
  if (normalized.startsWith('+91')) {
    normalized = normalized.slice(3)
  } else if (normalized.startsWith('91') && normalized.length === 12) {
    normalized = normalized.slice(2)
  } else if (normalized.startsWith('0') && normalized.length === 11) {
    normalized = normalized.slice(1)
  }
  return normalized
}

// ── Helper: extract identity fields from form responses ───────────────────────
function extractIdentityFromResponses(
  fields: Array<{ id: string; field_type: string; label: string }>,
  responses: Record<string, any>,
) {
  const lower = (s: string) => s.toLowerCase()
  let fullName: string | null = null
  let mobile: string | null = null
  let email: string | null = null
  let governmentId: string | null = null
  let currentLocation: string | null = null
  let preferredLocation: string | null = null
  let workerCategory: string | null = null
  let skills: string[] | null = null
  let yearsOfExp: number | null = null
  let availability: string | null = null
  let profileLink: string | null = null

  for (const field of fields) {
    const val = responses[field.id]
    if (val === undefined || val === null || val === '') continue
    const lbl = lower(field.label)
    const ft = field.field_type

    if (ft === 'Phone' || lbl.includes('mobile') || lbl.includes('phone')) {
      if (!mobile && typeof val === 'string') mobile = normalizeIndianMobile(val)
    } else if (ft === 'Email' || lbl.includes('email')) {
      if (!email && typeof val === 'string') email = val.trim().toLowerCase()
    } else if (lbl.includes('full name') || lbl.includes('name')) {
      if (!fullName && typeof val === 'string') fullName = val.trim()
    } else if (lbl.includes('government') || lbl.includes('aadhar') || lbl.includes('pan') || lbl.includes('id number') || lbl.includes('gov id')) {
      if (!governmentId && typeof val === 'string') governmentId = val.trim()
    } else if (lbl.includes('current location') || lbl.includes('current city')) {
      if (!currentLocation && typeof val === 'string') currentLocation = val.trim()
    } else if (lbl.includes('preferred') && lbl.includes('location')) {
      if (!preferredLocation && typeof val === 'string') preferredLocation = val.trim()
    } else if (lbl.includes('worker category') || lbl.includes('category') || lbl.includes('worker type')) {
      if (!workerCategory) {
        const rawCategory = Array.isArray(val) ? val.join(', ') : String(val).trim()
        workerCategory = normalizeWorkerCategory(rawCategory)
      }
    } else if (lbl.includes('skill')) {
      if (!skills) skills = Array.isArray(val) ? val : [String(val)]
    } else if (lbl.includes('year') && (lbl.includes('exp') || lbl.includes('experience'))) {
      if (!yearsOfExp) yearsOfExp = Number(val) || null
    } else if (lbl.includes('availability') || lbl.includes('shift')) {
      if (!availability) availability = Array.isArray(val) ? val.join(', ') : String(val).trim()
    } else if (lbl.includes('profile link') || lbl.includes('linkedin') || lbl.includes('resume link')) {
      if (!profileLink && typeof val === 'string') profileLink = val.trim()
    }
  }

  return { fullName, mobile, email, governmentId, currentLocation, preferredLocation, workerCategory, skills, yearsOfExp, availability, profileLink }
}

router.post('/forms/:id/submit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const formId = req.params.id
    const responses = req.body.responses ?? {}
    const sourceLinkId: string | null = req.body.source_link_id ?? null
    let sourceChannel: string | null = req.body.source_channel ?? null

    // If a tracking link ID was provided but source_channel was not, resolve it from the DB
    if (sourceLinkId && !sourceChannel) {
      const { data: trackingLink } = await supabase
        .from('tracking_links')
        .select('channel')
        .eq('id', sourceLinkId)
        .maybeSingle()
      if (trackingLink) {
        sourceChannel = trackingLink.channel
      }
    }

    // ── 1. Load form + fields in parallel ──────────────────────────────────────
    const [{ data: formData, error: formError }, { data: fieldData, error: fieldError }] =
      await Promise.all([
        supabase
          .from('application_forms')
          .select('id, campaign_id, title, version, consent_text')
          .eq('id', formId)
          .single(),
        supabase
          .from('form_fields')
          .select('id, field_type, label, is_required, validation_rules')
          .eq('form_id', formId)
          .order('display_order', { ascending: true }),
      ])

    if (formError) {
      if (formError.code === 'PGRST116') {
        return res.status(404).json({ message: 'Form not found' })
      }
      throw formError
    }

    if (fieldError) throw fieldError

    // ── 2. Validate fields ──────────────────────────────────────────────────────
    const errors: Array<{ field_id: string; label: string; message: string }> = []

    const fields = (fieldData ?? []).map((f) => ({
      ...f,
      field_type: mapDbToPayloadFieldType(f.field_type),
    }))

    for (const field of fields) {
      const val = responses[field.id]
      const isEmpty =
        val === undefined ||
        val === null ||
        (typeof val === 'string' && val.trim() === '') ||
        (Array.isArray(val) && val.length === 0)

      // Consent validation
      const isConsentField =
        field.field_type === 'Checkbox' && field.label.toLowerCase().includes('consent')
      if (isConsentField) {
        if (isEmpty || val === false || (Array.isArray(val) && val.length === 0)) {
          errors.push({ field_id: field.id, label: field.label, message: 'Consent is mandatory and must be accepted.' })
          continue
        }
      }

      // Require mobile number as mandatory unless the form config explicitly allows otherwise.
      const isMobileField = field.field_type === 'Phone' || field.label.toLowerCase().includes('mobile')
      const isMobileOptional = field.validation_rules?.optional === true || field.validation_rules?.allowOptional === true
      if (isMobileField && !isMobileOptional && isEmpty) {
        errors.push({ field_id: field.id, label: field.label, message: `${field.label} is required.` })
        continue
      }

      if (field.is_required && isEmpty) {
        errors.push({ field_id: field.id, label: field.label, message: `${field.label} is required.` })
        continue
      }

      if (!isEmpty) {
        if (field.field_type === 'Email') {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
          if (typeof val === 'string' && !emailRegex.test(val.trim())) {
            errors.push({ field_id: field.id, label: field.label, message: 'Invalid email format.' })
          }
        } else if (field.field_type === 'Phone') {
          // Indian mobile: exactly 10 digits, starts with 6-9
          const indianMobileRegex = /^[6-9][0-9]{9}$/
          const internationalRegex = /^\+?[0-9\s\-()]{7,15}$/
          const isMobileLabel = field.label.toLowerCase().includes('mobile') || field.label.toLowerCase().includes('phone')
          if (isMobileLabel) {
            const normalized = normalizeIndianMobile(val)
            if (!indianMobileRegex.test(normalized)) {
              errors.push({ field_id: field.id, label: field.label, message: 'Please enter a valid 10-digit Indian mobile number starting with 6-9.' })
            }
          } else {
            if (typeof val === 'string' && !internationalRegex.test(val.trim())) {
              errors.push({ field_id: field.id, label: field.label, message: 'Invalid phone number format.' })
            }
          }
        } else if (field.field_type === 'Number') {
          const num = Number(val)
          if (Number.isNaN(num)) {
            errors.push({ field_id: field.id, label: field.label, message: 'Must be a valid number.' })
          } else {
            const rules = (field.validation_rules as Record<string, any>) ?? {}
            if (typeof rules.min === 'number' && num < rules.min) {
              errors.push({ field_id: field.id, label: field.label, message: `Value must be at least ${rules.min}.` })
            }
            if (typeof rules.max === 'number' && num > rules.max) {
              errors.push({ field_id: field.id, label: field.label, message: `Value cannot exceed ${rules.max}.` })
            }
          }
        } else if (field.field_type === 'Text') {
          const strVal = String(val)
          const rules = (field.validation_rules as Record<string, any>) ?? {}
          if (typeof rules.minLength === 'number' && strVal.length < rules.minLength) {
            errors.push({ field_id: field.id, label: field.label, message: `Must be at least ${rules.minLength} characters.` })
          }
          if (typeof rules.maxLength === 'number' && strVal.length > rules.maxLength) {
            errors.push({ field_id: field.id, label: field.label, message: `Cannot exceed ${rules.maxLength} characters.` })
          }
          if (typeof rules.pattern === 'string' && rules.pattern.trim()) {
            try {
              const regex = new RegExp(rules.pattern)
              if (!regex.test(strVal)) {
                errors.push({ field_id: field.id, label: field.label, message: 'Value does not match the required format.' })
              }
            } catch (_e) {
              // Ignore regex compilation issues
            }
          }
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ message: 'Form validation failed', errors })
    }

    // ── 3. Extract identity fields from responses ───────────────────────────────
    const identity = extractIdentityFromResponses(fields, responses)

    // ── 4. Duplicate detection: global profile match + campaign-scoped check ────
    let existingWorkerProfile: { id: string } | null = null
    let isDuplicate = false

    // Step A: find existing worker profile by mobile / email / gov ID
    if (identity.mobile || identity.email || identity.governmentId) {
      // 1. Mobile Check
      if (identity.mobile) {
        const normalizedMobile = identity.mobile.trim().replace(/[\s\-()]/g, '')
        const { data: profiles, error: err } = await supabase
          .from('worker_profiles')
          .select('id')
          .eq('mobile', normalizedMobile)
          .limit(1)
        if (err) throw err
        if (profiles && profiles.length > 0) {
          existingWorkerProfile = profiles[0]
        }
      }

      // 2. Email Check (if no mobile match)
      if (!existingWorkerProfile && identity.email) {
        const { data: profiles, error: err } = await supabase
          .from('worker_profiles')
          .select('id')
          .eq('email', identity.email)
          .limit(1)
        if (err) throw err
        if (profiles && profiles.length > 0) {
          existingWorkerProfile = profiles[0]
        }
      }

      // 3. Government ID Check (if no mobile or email match)
      if (!existingWorkerProfile && identity.governmentId) {
        const { data: profiles, error: err } = await supabase
          .from('worker_profiles')
          .select('id')
          .eq('government_id', identity.governmentId)
          .limit(1)
        if (err) throw err
        if (profiles && profiles.length > 0) {
          existingWorkerProfile = profiles[0]
        }
      }
    }

    // Step B: campaign-scoped duplicate check (same worker profile + same campaign)
    if (existingWorkerProfile && formData.campaign_id) {
      const { data: existingApps, error: dupErr } = await supabase
        .from('candidate_applications')
        .select('id')
        .eq('worker_profile_id', existingWorkerProfile.id)
        .eq('campaign_id', formData.campaign_id)
        .not('status', 'in', '("rejected","duplicate_review")')
        .limit(1)
      if (dupErr) throw dupErr
      if (existingApps && existingApps.length > 0) {
        isDuplicate = true
      }
    }

    // ── 5. Upsert worker_profile ────────────────────────────────────────────────
    let workerProfileId: string

    if (existingWorkerProfile) {
      // Update existing profile with any new data
      const updates: Record<string, any> = {}
      if (identity.fullName) updates.full_name = identity.fullName
      if (identity.mobile) updates.mobile = identity.mobile
      if (identity.email) updates.email = identity.email
      if (identity.governmentId) updates.government_id = identity.governmentId
      if (identity.currentLocation) updates.current_location = identity.currentLocation
      if (identity.preferredLocation) updates.preferred_work_locations = [identity.preferredLocation]
      if (identity.workerCategory) updates.worker_category = identity.workerCategory
      if (identity.skills && identity.skills.length > 0) updates.key_skills = identity.skills
      if (identity.yearsOfExp !== null) updates.years_of_experience = identity.yearsOfExp
      if (identity.availability) updates.availability = identity.availability
      updates.updated_at = new Date().toISOString()

      const { error: updateError } = await supabase
        .from('worker_profiles')
        .update(updates)
        .eq('id', existingWorkerProfile.id)

      if (updateError) throw updateError
      workerProfileId = existingWorkerProfile.id
    } else {
      // Create new worker profile
      const { data: newProfile, error: createError } = await supabase
        .from('worker_profiles')
        .insert({
          full_name: identity.fullName ?? 'Unknown',
          mobile: identity.mobile,
          email: identity.email,
          government_id: identity.governmentId,
          current_location: identity.currentLocation,
          preferred_work_locations: identity.preferredLocation ? [identity.preferredLocation] : [],
          worker_category: identity.workerCategory,
          key_skills: identity.skills ?? [],
          years_of_experience: identity.yearsOfExp,
          availability: identity.availability,
        })
        .select('id')
        .single()

      if (createError) throw createError
      workerProfileId = newProfile.id
    }

    // ── 5.5 Find duplicate application target (to link duplicate_of) ───────────
    let duplicateOfId: string | null = null
    if (isDuplicate && existingWorkerProfile) {
      const { data: prevApps, error: prevAppsError } = await supabase
        .from('candidate_applications')
        .select('id')
        .eq('worker_profile_id', existingWorkerProfile.id)
        .order('created_at', { ascending: true })
        .limit(1)

      if (!prevAppsError && prevApps && prevApps.length > 0) {
        duplicateOfId = prevApps[0].id
      }
    }

    // ── 6. Create candidate_application record ──────────────────────────────────
    const { data: application, error: appError } = await supabase
      .from('candidate_applications')
      .insert({
        campaign_id: formData.campaign_id,
        form_id: formId,
        worker_profile_id: workerProfileId,
        source_link_id: sourceLinkId,
        source_channel: sourceChannel,
        status: isDuplicate ? 'duplicate_review' : 'application_received',
        is_duplicate: isDuplicate,
        duplicate_of: duplicateOfId,
        raw_responses: responses,
      })
      .select('id, status')
      .single()

    if (appError) throw appError

    // ── 7. Create workflow_event ────────────────────────────────────────────────
    const { error: eventError } = await supabase
      .from('workflow_events')
      .insert({
        application_id: application.id,
        from_stage: null,
        to_stage: isDuplicate ? 'duplicate_review' : 'application_received',
        remarks: isDuplicate ? 'System flagged possible duplicate application.' : 'Application submitted.',
        is_automated: true,
      })

    if (eventError) {
      console.warn('[submit] workflow_event insert failed:', eventError.message)
    }

    // ── 8. Create consent_logs record ──────────────────────────────────────────
    const consentField = fields.find(
      (f) => f.field_type === 'Checkbox' && f.label.toLowerCase().includes('consent')
    )
    if (consentField) {
      const { error: consentError } = await supabase
        .from('consent_logs')
        .insert({
          application_id: application.id,
          consent_type: 'data_storage_contact',
          consent_text_version: `v${formData.version || 1} - ${formData.consent_text || formData.title || 'Form Consent'}`,
          is_accepted: true,
          ip_address: req.ip ?? null,
          device_metadata: {
            user_agent: req.headers['user-agent'] ?? null,
          },
        })

      if (consentError) {
        console.warn('[submit] consent_logs insert failed:', consentError.message)
      }
    }

    // ── 9. Store uploaded files in documents table ──────────────────────────────
    for (const field of fields) {
      const val = responses[field.id]
      if (field.field_type === 'File Upload' && val && typeof val === 'string') {
        const lbl = field.label.toLowerCase()
        let docType: 'resume' | 'government_id' | 'compliance_doc' | 'other' = 'other'
        if (lbl.includes('resume') || lbl.includes('cv')) {
          docType = 'resume'
        } else if (
          lbl.includes('government') ||
          lbl.includes('id') ||
          lbl.includes('aadhar') ||
          lbl.includes('pan') ||
          lbl.includes('passport') ||
          lbl.includes('license')
        ) {
          docType = 'government_id'
        }

        const { error: docError } = await supabase
          .from('documents')
          .insert({
            worker_profile_id: workerProfileId,
            application_id: application.id,
            document_type: docType,
            file_name: val,
            file_path: `uploads/${application.id}/${val}`,
            verification_status: 'pending',
          })

        if (docError) {
          console.warn('[submit] documents insert failed:', docError.message)
        }
      }
    }

    // ── 10. Store raw form_submission (for history/audit) ───────────────────────
    const { data: submissionData, error: submissionError } = await supabase
      .from('form_submissions')
      .insert({
        form_id: formId,
        campaign_id: formData.campaign_id,
        responses,
      })
      .select('id')
      .single()

    if (submissionError) {
      console.warn('[submit] form_submission insert failed:', submissionError.message)
    }

    return res.status(201).json({
      message: isDuplicate
        ? 'Application submitted. We found an existing profile and have updated it.'
        : 'Application received successfully. We\'ll contact you soon.',
      application_id: application.id,
      worker_profile_id: workerProfileId,
      submission_id: submissionData?.id ?? null,
      is_duplicate: isDuplicate,
      next_steps: 'You can track your application status using your mobile number at /apply/status/<your-mobile>.',
    })
  } catch (error) {
    return handleError(error, next)
  }
})

router.get('/campaigns/:id/submissions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaignId = req.params.id

    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, name')
      .eq('id', campaignId)
      .single()

    if (campaignError) {
      if (campaignError.code === 'PGRST116') {
        return res.status(404).json({ message: 'Campaign not found' })
      }
      throw campaignError
    }

    const { data: submissions, error: submissionsError } = await supabase
      .from('form_submissions')
      .select('id, form_id, campaign_id, responses, created_at, updated_at')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false })

    if (submissionsError) throw submissionsError

    return res.json({ data: submissions ?? [] })
  } catch (error) {
    return handleError(error, next)
  }
})

export default router
