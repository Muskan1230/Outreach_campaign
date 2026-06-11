import { Router, type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import { supabase } from '../lib/supabase.js'
import { pool } from '../lib/postgres.js'
import { generateTemplateDraft } from '../lib/bedrock.js'
import {
  normalizeTemplateChannel,
  templateChannels,
  type TemplatePayload,
  type TemplateRecord,
  type TemplateGenerationRequest,
} from '../../../shared/template.js'
import { type CampaignRecord } from '../../../shared/campaign.js'

const router = Router()

const templateChannelSchema = z.enum(templateChannels)
const templateGenerationSchema = z.object({
  campaign_id: z.string().uuid(),
  channel: templateChannelSchema,
  language: z.string().trim().optional(),
  current_template_name: z.string().trim().optional(),
  current_message_body: z.string().trim().optional(),
})
const templatePayloadSchema = z.object({
  channel: templateChannelSchema,
  campaign_id: z.string().uuid().nullable().optional(),
  template_name: z.string().trim().min(2, 'Template name is required'),
  message_body: z.string().trim().min(10, 'Message body is required'),
  language: z.string().trim().min(2, 'Language is required'),
  media_attachment_url: z.union([z.string().trim().url('Enter a valid URL'), z.literal('')]).optional(),
})

type TemplateRow = {
  id: string
  campaign_id: string | null
  channel: string
  template_name: string
  message_body: string
  language: string
  media_attachment_url: string | null
  created_at: string
  updated_at: string
}

const templateSelect =
  'id,campaign_id,channel,template_name,message_body,language,media_attachment_url,created_at,updated_at'

function handleError(error: unknown, next: NextFunction) {
  return next(error)
}

function normalizeTemplate(record: TemplateRow | null) {
  if (!record) return null
  return {
    ...record,
    channel: normalizeTemplateChannel(record.channel),
    campaign_id: record.campaign_id ?? null,
    media_attachment_url: record.media_attachment_url ?? '',
  } satisfies TemplateRecord
}

function normalizeTemplateListItem(record: TemplateRow) {
  return {
    ...record,
    channel: normalizeTemplateChannel(record.channel),
    campaign_id: record.campaign_id ?? null,
    media_attachment_url: record.media_attachment_url ?? '',
  }
}

const campaignSelect =
  'id,name,opportunity_title,opportunity_desc,mode,worker_type,target_region,skills_required,target_channels,compensation_model,compensation_details,start_date,end_date,status,created_at,updated_at'

function normalizeCampaign(record: CampaignRecord | null) {
  if (!record) return null
  return {
    ...record,
    skills_required: Array.isArray(record.skills_required) ? record.skills_required : [],
    target_channels: Array.isArray(record.target_channels) ? record.target_channels : [],
    compensation_details:
      record.compensation_details && typeof record.compensation_details === 'object'
        ? record.compensation_details
        : {},
  }
}

router.post('/generate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = templateGenerationSchema.parse(req.body) satisfies TemplateGenerationRequest

    const { data, error } = await supabase
      .from('campaigns')
      .select(campaignSelect)
      .eq('id', payload.campaign_id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ message: 'Campaign not found' })
      }
      throw error
    }

    const campaign = normalizeCampaign(data as CampaignRecord)
    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' })
    }

    const draft = await generateTemplateDraft({
      campaign,
      channel: payload.channel,
      language: payload.language,
      currentTemplateName: payload.current_template_name,
      currentMessageBody: payload.current_message_body,
    })

    return res.json(draft)
  } catch (error) {
    return handleError(error, next)
  }
})

router.get(['/', ''], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaignId = typeof req.query.campaign_id === 'string' ? req.query.campaign_id.trim() : ''

    const params: Array<string | null> = []
    let text = `select ${templateSelect} from public.outreach_templates`

    if (campaignId) {
      const parsedCampaignId = z.string().uuid().safeParse(campaignId)
      if (!parsedCampaignId.success) {
        return res.status(400).json({ message: 'Invalid campaign id filter' })
      }

      params.push(parsedCampaignId.data)
      text += ` where campaign_id = $${params.length}`
    }

    text += ' order by created_at desc'

    const { rows } = await pool.query<TemplateRow>(text, params)

    return res.json({
      data: rows.map((item: TemplateRow) => normalizeTemplateListItem(item)),
    })
  } catch (error) {
    return handleError(error, next)
  }
})

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await pool.query<TemplateRow>(
      `select ${templateSelect} from public.outreach_templates where id = $1 limit 1`,
      [req.params.id],
    )

    if (!rows.length) {
      return res.status(404).json({ message: 'Template not found' })
    }

    return res.json(normalizeTemplate(rows[0] ?? null))
  } catch (error) {
    return handleError(error, next)
  }
})

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('[POST /api/templates] Request body:', JSON.stringify(req.body, null, 2))
    
    const payload = templatePayloadSchema.parse(req.body) satisfies TemplatePayload
    console.log('[POST /api/templates] Parsed payload:', JSON.stringify(payload, null, 2))

    const queryParams = [
      payload.campaign_id ?? null,
      payload.channel,
      payload.template_name,
      payload.message_body,
      payload.language,
      payload.media_attachment_url || null,
    ]
    console.log('[POST /api/templates] Query params:', queryParams)

    const { rows } = await pool.query<TemplateRow>(
      `insert into public.outreach_templates
        (campaign_id, channel, template_name, message_body, language, media_attachment_url)
       values ($1, $2, $3, $4, $5, $6)
       returning ${templateSelect}`,
      queryParams,
    )

    console.log('[POST /api/templates] Insert result:', rows)
    return res.status(201).json(normalizeTemplate(rows[0] ?? null))
  } catch (error) {
    console.error('[POST /api/templates] Error:', error instanceof Error ? error.message : error)
    return handleError(error, next)
  }
})

router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = templatePayloadSchema.parse(req.body) satisfies TemplatePayload

    const { rows } = await pool.query<TemplateRow>(
      `update public.outreach_templates
       set campaign_id = $1,
           channel = $2,
           template_name = $3,
           message_body = $4,
           language = $5,
           media_attachment_url = $6
       where id = $7
       returning ${templateSelect}`,
      [
        payload.campaign_id ?? null,
        payload.channel,
        payload.template_name,
        payload.message_body,
        payload.language,
        payload.media_attachment_url || null,
        req.params.id,
      ],
    )

    if (!rows.length) {
      return res.status(404).json({ message: 'Template not found' })
    }

    return res.json(normalizeTemplate(rows[0] ?? null))
  } catch (error) {
    return handleError(error, next)
  }
})

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rowCount } = await pool.query('delete from public.outreach_templates where id = $1', [req.params.id])

    if (!rowCount) {
      return res.status(404).json({ message: 'Template not found' })
    }

    return res.status(204).send()
  } catch (error) {
    return handleError(error, next)
  }
})

export default router
