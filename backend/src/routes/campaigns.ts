import { randomUUID } from 'node:crypto'
import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { supabase } from '../lib/supabase.js'
import {
  buildCompensationDetails,
  campaignModes,
  campaignStatuses,
  compensationModels,
  normalizeCampaignMode,
  normalizeCompensationModel,
  normalizeOutreachChannel,
  normalizeWorkerCategory,
  outreachChannels,
  type CampaignPayload,
  type CampaignRecord,
} from '../../../shared/campaign.js'

const router = Router()

const campaignStatusSchema = z.enum(campaignStatuses)
const campaignModeSchema = z.enum(campaignModes)
const compensationModelSchema = z.enum(compensationModels)
const outreachChannelSchema = z.enum(outreachChannels)

const campaignPayloadSchema = z
  .object({
    name: z.string().trim().min(2, 'Campaign name is required'),
    opportunity_title: z.string().trim().min(2, 'Opportunity title is required'),
    opportunity_desc: z
      .string()
      .trim()
      .min(20, 'Opportunity description must be at least 20 characters'),
    mode: campaignModeSchema,
    worker_type: z.string().trim().min(2, 'Worker type is required'),
    target_region: z.string().trim().min(2, 'Target region is required'),
    skills_required: z.array(z.string().trim().min(1)).min(1, 'Add at least one skill'),
    target_channels: z.array(outreachChannelSchema).min(1, 'Add at least one target channel'),
    compensation_model: compensationModelSchema,
    compensation_details: z.record(z.string(), z.unknown()).optional().default({}),
    start_date: z.string().trim().min(1, 'Start date is required'),
    end_date: z.string().trim().min(1, 'End date is required'),
    status: campaignStatusSchema.optional(),
    application_form_id: z.string().uuid().nullable().optional(),
    acknowledgment_channels: z.array(z.string()).optional().default([]),
    acknowledgment_email_template_id: z.string().nullable().optional(),
    acknowledgment_sms_template_id: z.string().nullable().optional(),
    acknowledgment_whatsapp_template_id: z.string().nullable().optional(),
    recruiter_alert_email_template_id: z.string().nullable().optional(),
  })
  .refine(
    (value) => {
      const start = new Date(value.start_date)
      const end = new Date(value.end_date)
      return Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) && end >= start
    },
    {
      message: 'End date must be the same as or after the start date',
      path: ['end_date'],
    },
  )

const campaignStatusPatchSchema = z.object({
  status: campaignStatusSchema,
})

const campaignDuplicateResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  templates_count: z.number().int().nonnegative(),
})

const campaignSelect =
  'id,name,opportunity_title,opportunity_desc,mode,worker_type,target_region,skills_required,target_channels,compensation_model,compensation_details,start_date,end_date,status,application_form_id,acknowledgment_channels,acknowledgment_email_template_id,acknowledgment_sms_template_id,acknowledgment_whatsapp_template_id,recruiter_alert_email_template_id,created_at,updated_at'
const campaignListSelect = 'id,name,opportunity_title,status,worker_type,target_region,start_date,end_date,application_form_id'

function normalizeCampaign(record: CampaignRecord | null) {
  if (!record) return null
  return {
    ...record,
    skills_required: Array.isArray(record.skills_required) ? record.skills_required : [],
    target_channels: Array.isArray(record.target_channels) ? record.target_channels : [],
    acknowledgment_channels: Array.isArray(record.acknowledgment_channels) ? record.acknowledgment_channels : [],
    compensation_details:
      record.compensation_details && typeof record.compensation_details === 'object'
        ? record.compensation_details
        : {},
  }
}

function stringifyValue(value: unknown) {
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

function normalizeCampaignInput(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body

  const record = body as Record<string, unknown>
  const skillsRequired = Array.isArray(record.skills_required)
    ? record.skills_required
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean)
    : []
  const targetChannels = Array.isArray(record.target_channels)
    ? record.target_channels
        .map((value) => (typeof value === 'string' ? normalizeOutreachChannel(value) : ''))
        .filter(Boolean)
    : []
  const acknowledgmentChannels = Array.isArray(record.acknowledgment_channels)
    ? record.acknowledgment_channels
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean)
    : []
  const rawCompensation = stringifyValue(record.compensation_model)
  const compensationDetails =
    record.compensation_details && typeof record.compensation_details === 'object' && !Array.isArray(record.compensation_details)
      ? record.compensation_details
      : buildCompensationDetails(rawCompensation)

  return {
    ...record,
    name: stringifyValue(record.name),
    opportunity_title: stringifyValue(record.opportunity_title),
    opportunity_desc: stringifyValue(record.opportunity_desc),
    mode: normalizeCampaignMode(stringifyValue(record.mode)),
    worker_type: normalizeWorkerCategory(stringifyValue(record.worker_type)),
    target_region: stringifyValue(record.target_region),
    skills_required: skillsRequired,
    target_channels: targetChannels,
    acknowledgment_channels: acknowledgmentChannels,
    acknowledgment_email_template_id: record.acknowledgment_email_template_id !== undefined ? record.acknowledgment_email_template_id : undefined,
    acknowledgment_sms_template_id: record.acknowledgment_sms_template_id !== undefined ? record.acknowledgment_sms_template_id : undefined,
    acknowledgment_whatsapp_template_id: record.acknowledgment_whatsapp_template_id !== undefined ? record.acknowledgment_whatsapp_template_id : undefined,
    recruiter_alert_email_template_id: record.recruiter_alert_email_template_id !== undefined ? record.recruiter_alert_email_template_id : undefined,
    compensation_model: normalizeCompensationModel(rawCompensation),
    compensation_details: compensationDetails,
    start_date: stringifyValue(record.start_date),
    end_date: stringifyValue(record.end_date),
    status: record.status,
  }
}

function parsePagination(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(numeric)))
}

function handleError(error: unknown, next: NextFunction) {
  return next(error)
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parsePagination(req.query.page, 1, 1, 10000)
    const limit = parsePagination(req.query.limit, 10, 1, 100)
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : ''

    let query = supabase
      .from('campaigns')
      .select(campaignListSelect, { count: 'exact' })
      .order('created_at', { ascending: false })

    if (search) {
      query = query.ilike('name', `%${search}%`)
    }

    if (status) {
      const parsedStatus = campaignStatusSchema.safeParse(status)
      if (!parsedStatus.success) {
        return res.status(400).json({
          message: 'Invalid status filter',
        })
      }

      query = query.eq('status', parsedStatus.data)
    }

    const from = (page - 1) * limit
    const to = from + limit - 1
    const { data, error, count } = await query.range(from, to)

    if (error) {
      throw error
    }

    const total = count ?? 0
    return res.json({
      data: data ?? [],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    })
  } catch (error) {
    return handleError(error, next)
  }
})

router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabase
      .from('campaigns')
      .select('status')

    if (error) {
      throw error
    }

    const counts = data ?? []
    return res.json({
      total: counts.length,
      draft: counts.filter((c) => c.status === 'draft').length,
      pending_approval: counts.filter((c) => c.status === 'pending_approval').length,
      active: counts.filter((c) => c.status === 'active').length,
      paused: counts.filter((c) => c.status === 'paused').length,
      archived: counts.filter((c) => c.status === 'archived').length,
    })
  } catch (error) {
    return handleError(error, next)
  }
})

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabase
      .from('campaigns')
      .select(campaignSelect)
      .eq('id', req.params.id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ message: 'Campaign not found' })
      }
      throw error
    }

    return res.json(normalizeCampaign(data as CampaignRecord))
  } catch (error) {
    return handleError(error, next)
  }
})

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = campaignPayloadSchema.parse(normalizeCampaignInput(req.body)) satisfies CampaignPayload
    const status = payload.status ?? 'draft'

    const { data, error } = await supabase
      .from('campaigns')
      .insert({
        ...payload,
        status,
      })
      .select(campaignSelect)
      .single()

    if (error) throw error

    return res.status(201).json(normalizeCampaign(data as CampaignRecord))
  } catch (error) {
    return handleError(error, next)
  }
})

router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = campaignPayloadSchema.parse(normalizeCampaignInput(req.body)) satisfies CampaignPayload

    const existingStatusResponse = await supabase
      .from('campaigns')
      .select('status')
      .eq('id', req.params.id)
      .single()

    if (existingStatusResponse.error) {
      if (existingStatusResponse.error.code === 'PGRST116') {
        return res.status(404).json({ message: 'Campaign not found' })
      }
      throw existingStatusResponse.error
    }

    const status = payload.status ?? (existingStatusResponse.data.status as CampaignRecord['status'])

    const { data, error } = await supabase
      .from('campaigns')
      .update({
        ...payload,
        status,
      })
      .eq('id', req.params.id)
      .select(campaignSelect)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ message: 'Campaign not found' })
      }
      throw error
    }

    return res.json(normalizeCampaign(data as CampaignRecord))
  } catch (error) {
    return handleError(error, next)
  }
})

router.patch('/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = campaignStatusPatchSchema.parse(req.body)

    const { data, error } = await supabase
      .from('campaigns')
      .update({ status })
      .eq('id', req.params.id)
      .select(campaignSelect)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ message: 'Campaign not found' })
      }
      throw error
    }

    return res.json(normalizeCampaign(data as CampaignRecord))
  } catch (error) {
    return handleError(error, next)
  }
})

router.post('/:id/duplicate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaignId = z.string().uuid().parse(req.params.id)

    const { data: sourceCampaign, error: campaignError } = await supabase
      .from('campaigns')
      .select(campaignSelect)
      .eq('id', campaignId)
      .single()

    if (campaignError) {
      if (campaignError.code === 'PGRST116') {
        return res.status(404).json({ message: 'Campaign not found' })
      }
      throw campaignError
    }

    const normalizedSource = normalizeCampaign(sourceCampaign as CampaignRecord)
    if (!normalizedSource) {
      return res.status(404).json({ message: 'Campaign not found' })
    }

    const newCampaignId = randomUUID()
    const duplicateName = `${normalizedSource.name} (Copy)`

    const { data: duplicateCampaign, error: duplicateCampaignError } = await supabase
      .from('campaigns')
      .insert({
        id: newCampaignId,
        name: duplicateName,
        opportunity_title: normalizedSource.opportunity_title,
        opportunity_desc: normalizedSource.opportunity_desc,
        mode: normalizedSource.mode,
        worker_type: normalizedSource.worker_type,
        target_region: normalizedSource.target_region,
        skills_required: normalizedSource.skills_required,
        target_channels: normalizedSource.target_channels,
        compensation_model: normalizedSource.compensation_model,
        compensation_details: normalizedSource.compensation_details ?? {},
        start_date: normalizedSource.start_date,
        end_date: normalizedSource.end_date,
        status: 'draft',
        application_form_id: normalizedSource.application_form_id ?? null,
        acknowledgment_channels: normalizedSource.acknowledgment_channels ?? [],
        acknowledgment_email_template_id: normalizedSource.acknowledgment_email_template_id ?? null,
        acknowledgment_sms_template_id: normalizedSource.acknowledgment_sms_template_id ?? null,
        acknowledgment_whatsapp_template_id: normalizedSource.acknowledgment_whatsapp_template_id ?? null,
        recruiter_alert_email_template_id: normalizedSource.recruiter_alert_email_template_id ?? null,
      })
      .select(campaignSelect)
      .single()

    if (duplicateCampaignError) {
      throw duplicateCampaignError
    }

    const { data: sourceTemplates, error: templatesError } = await supabase
      .from('outreach_templates')
      .select('channel,template_name,message_body,language,media_attachment_url')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: true })

    if (templatesError) {
      throw templatesError
    }

    const templatesToInsert = (sourceTemplates ?? []).map((template) => ({
      id: randomUUID(),
      campaign_id: newCampaignId,
      channel: template.channel,
      template_name: template.template_name,
      message_body: template.message_body,
      language: template.language,
      media_attachment_url: template.media_attachment_url,
    }))

    if (templatesToInsert.length > 0) {
      const { error: insertTemplatesError } = await supabase
        .from('outreach_templates')
        .insert(templatesToInsert)

      if (insertTemplatesError) {
        throw insertTemplatesError
      }
    }

    const responseBody = {
      id: duplicateCampaign?.id ?? newCampaignId,
      name: duplicateCampaign?.name ?? duplicateName,
      templates_count: templatesToInsert.length,
    }

    return res.status(201).json(campaignDuplicateResponseSchema.parse(responseBody))
  } catch (error) {
    return handleError(error, next)
  }
})

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { count: applicantCount, error: applicantCountError } = await supabase
      .from('candidate_applications')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', req.params.id)

    if (applicantCountError) {
      throw applicantCountError
    }

    if ((applicantCount ?? 0) > 0) {
      return res.status(409).json({
        message:
          'This campaign cannot be deleted because it already has applicant records. Archive it instead to preserve ATS history.',
      })
    }

    const { error } = await supabase
      .from('campaigns')
      .delete()
      .eq('id', req.params.id)

    if (error) {
      if (error.code === '23503') {
        return res.status(409).json({
          message:
            'This campaign cannot be deleted because related records still exist. Remove dependent records first or archive the campaign.',
        })
      }
      throw error
    }

    return res.status(204).send()
  } catch (error) {
    return handleError(error, next)
  }
})

// ── Recruiter Applicant Queue ─────────────────────────────────────────────────

const APPLICATION_STATUSES = ['new', 'shortlisted', 'offered', 'hired', 'rejected'] as const
type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

const applicationStatusPatchSchema = z.object({
  status: z.enum(APPLICATION_STATUSES),
  notes: z.string().trim().optional(),
})

router.get('/:id/applicants', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaignId = req.params.id
    const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim() : ''
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''
    const sourceChannelFilter = typeof req.query.sourceChannel === 'string' ? req.query.sourceChannel.trim() : ''
    const page = parsePagination(req.query.page, 1, 1, 10000)
    const limit = parsePagination(req.query.limit, 50, 1, 200)

    // First verify campaign exists
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, name, opportunity_title')
      .eq('id', campaignId)
      .single()

    if (campaignError) {
      if (campaignError.code === 'PGRST116') {
        return res.status(404).json({ message: 'Campaign not found' })
      }
      throw campaignError
    }

    // Query vw_application_queue for this campaign
    let query = supabase
      .from('vw_application_queue')
      .select('*', { count: 'exact' })
      .eq('campaign_id', campaignId)
      .order('submitted_at', { ascending: false })

    if (statusFilter && APPLICATION_STATUSES.includes(statusFilter as ApplicationStatus)) {
      if (statusFilter === 'new') {
        query = query.in('status', ['application_received', 'duplicate_review'])
      } else if (statusFilter === 'offered') {
        query = query.eq('status', 'selected')
      } else if (statusFilter === 'hired') {
        query = query.eq('status', 'onboarded')
      } else {
        query = query.eq('status', statusFilter)
      }
    }

    // Filter by source channel (attribution tracking)
    if (sourceChannelFilter) {
      query = query.eq('source_channel', sourceChannelFilter)
    }

    if (search) {
      query = query.or(
        `full_name.ilike.%${search}%,mobile.ilike.%${search}%,email.ilike.%${search}%`,
      )
    }

    const from = (page - 1) * limit
    const to = from + limit - 1
    const { data, error, count } = await query.range(from, to)

    if (error) throw error

    const total = count ?? 0

    // Map database enum status back to API application status
    const mappedData = (data ?? []).map((row: any) => {
      let mappedStatus: ApplicationStatus = 'new'
      if (row.status === 'application_received' || row.status === 'duplicate_review') {
        mappedStatus = 'new'
      } else if (row.status === 'selected') {
        mappedStatus = 'offered'
      } else if (row.status === 'onboarded') {
        mappedStatus = 'hired'
      } else if (row.status === 'shortlisted' || row.status === 'rejected') {
        mappedStatus = row.status
      }
      return {
        ...row,
        status: mappedStatus,
        candidate_name: row.full_name,
        candidate_mobile: row.mobile,
        candidate_email: row.email,
        candidate_location: row.current_location,
        preferred_location:
          Array.isArray(row.preferred_work_locations) && row.preferred_work_locations.length > 0
            ? row.preferred_work_locations[0]
            : null,
        applied_at: row.submitted_at,
        source: row.source_channel || null,
        source_channel: row.source_channel || null,
        updated_at: row.submitted_at,
      }
    })

    return res.json({
      campaign: { id: campaign.id, name: campaign.name, opportunity_title: campaign.opportunity_title },
      data: mappedData,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    })
  } catch (error) {
    return handleError(error, next)
  }
})

router.get('/:id/applicants/:appId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: campaignId, appId } = req.params

    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, name, opportunity_title')
      .eq('id', campaignId)
      .single()

    if (campaignError) {
      if (campaignError.code === 'PGRST116') {
        return res.status(404).json({ message: 'Campaign not found' })
      }
      throw campaignError
    }

    const { data, error } = await supabase
      .from('vw_application_queue')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('application_id', appId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ message: 'Application not found' })
      }
      throw error
    }

    let mappedStatus: ApplicationStatus = 'new'
    if (data.status === 'application_received' || data.status === 'duplicate_review') {
      mappedStatus = 'new'
    } else if (data.status === 'selected') {
      mappedStatus = 'offered'
    } else if (data.status === 'onboarded') {
      mappedStatus = 'hired'
    } else if (data.status === 'shortlisted' || data.status === 'rejected') {
      mappedStatus = data.status
    }

    return res.json({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        opportunity_title: campaign.opportunity_title,
      },
      application: {
        ...data,
        status: mappedStatus,
        candidate_name: data.full_name,
        candidate_mobile: data.mobile,
        candidate_email: data.email,
        candidate_location: data.current_location,
        preferred_location:
          Array.isArray(data.preferred_work_locations) && data.preferred_work_locations.length > 0
            ? data.preferred_work_locations[0]
            : null,
        applied_at: data.submitted_at,
        source: data.source_channel || null,
        source_channel: data.source_channel || null,
        updated_at: data.submitted_at,
      },
    })
  } catch (error) {
    return handleError(error, next)
  }
})

router.patch('/:id/applicants/:appId/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: campaignId, appId } = req.params
    const { status, notes } = applicationStatusPatchSchema.parse(req.body)

    // Verify the application belongs to this campaign
    const { data: existing, error: checkError } = await supabase
      .from('candidate_applications')
      .select('id, status, campaign_id')
      .eq('id', appId)
      .eq('campaign_id', campaignId)
      .single()

    if (checkError) {
      if (checkError.code === 'PGRST116') {
        return res.status(404).json({ message: 'Application not found' })
      }
      throw checkError
    }

    const previousStatus = existing.status

    // Translate API status format to DB application_status enum
    let dbStatus = 'application_received'
    if (status === 'new') {
      dbStatus = 'application_received'
    } else if (status === 'offered') {
      dbStatus = 'selected'
    } else if (status === 'hired') {
      dbStatus = 'onboarded'
    } else {
      dbStatus = status
    }

    // Update the application status
    const updatePayload: Record<string, any> = { status: dbStatus, updated_at: new Date().toISOString() }
    if (notes) updatePayload.notes = notes

    const { data: updated, error: updateError } = await supabase
      .from('candidate_applications')
      .update(updatePayload)
      .eq('id', appId)
      .select('id, status, updated_at')
      .single()

    if (updateError) throw updateError

    // Fire a workflow event for the status change
    const recruiterId = (req as any).user?.id ?? null
    const { error: eventError } = await supabase
      .from('workflow_events')
      .insert({
        application_id: appId,
        from_stage: previousStatus,
        to_stage: dbStatus,
        action_by: recruiterId,
        remarks: notes ?? `Marked as ${status}`,
        is_automated: false,
      })

    if (eventError) {
      console.warn('[status-patch] workflow_event insert failed:', eventError.message)
    }

    // Map updated record status back to API format
    let apiStatus: ApplicationStatus = 'new'
    if (updated.status === 'application_received' || updated.status === 'duplicate_review') {
      apiStatus = 'new'
    } else if (updated.status === 'selected') {
      apiStatus = 'offered'
    } else if (updated.status === 'onboarded') {
      apiStatus = 'hired'
    } else if (updated.status === 'shortlisted' || updated.status === 'rejected') {
      apiStatus = updated.status
    }

    const mappedUpdated = {
      ...updated,
      status: apiStatus,
    }

    return res.json({ message: `Application status updated to ${status}`, application: mappedUpdated })
  } catch (error) {
    return handleError(error, next)
  }
})

export default router
