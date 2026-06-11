export const campaignStatuses = ['draft', 'pending_approval', 'active', 'paused', 'archived'] as const
export const campaignModes = ['direct_sourcing', 'broad_social', 'job_portal', 'mixed_channel'] as const
export const outreachChannels = ['whatsapp', 'linkedin', 'facebook', 'instagram', 'job_portal'] as const
export const compensationModels = ['hourly', 'daily', 'weekly', 'fixed', 'per_task'] as const

export type CampaignStatus = (typeof campaignStatuses)[number]
export type CampaignMode = (typeof campaignModes)[number]
export type OutreachChannel = (typeof outreachChannels)[number]
export type CompensationModel = (typeof compensationModels)[number]

export const campaignModeLabels: Record<CampaignMode, string> = {
  direct_sourcing: 'Direct Sourcing',
  broad_social: 'Broad Social Distribution',
  job_portal: 'Job Portal Posting',
  mixed_channel: 'Mixed Channel',
}

export const outreachChannelLabels: Record<OutreachChannel, string> = {
  whatsapp: 'WhatsApp',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  instagram: 'Instagram',
  job_portal: 'Job Portal',
}

export const compensationModelLabels: Record<CompensationModel, string> = {
  hourly: 'Hourly',
  daily: 'Daily',
  weekly: 'Weekly',
  fixed: 'Fixed',
  per_task: 'Per Task',
}

export type CampaignPayload = {
  name: string
  opportunity_title: string
  opportunity_desc: string
  mode: CampaignMode
  worker_type: string
  target_region: string
  skills_required: string[]
  target_channels: string[]
  compensation_model: string
  compensation_details?: Record<string, unknown>
  start_date: string
  end_date: string
  application_form_id?: string | null
  status?: CampaignStatus
}

export type CampaignStatusPatch = {
  status: CampaignStatus
}

export type CampaignRecord = CampaignPayload & {
  id: string
  status: CampaignStatus
  created_at: string
  updated_at: string
}

export type CampaignListItem = Pick<
  CampaignRecord,
  | 'id'
  | 'name'
  | 'opportunity_title'
  | 'status'
  | 'worker_type'
  | 'target_region'
  | 'start_date'
  | 'end_date'
  | 'application_form_id'
>

export type PaginatedResponse<T> = {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export function splitCsvValue(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function joinCsvValue(values: string[] | null | undefined) {
  return (values ?? []).join(', ')
}

export function normalizeCampaignMode(value: string): CampaignMode {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_')

  if (normalized === 'remote' || normalized === 'direct' || normalized === 'direct_sourcing') {
    return 'direct_sourcing'
  }

  if (
    normalized === 'social' ||
    normalized === 'broad_social' ||
    normalized === 'broad_social_distribution' ||
    normalized === 'social_distribution'
  ) {
    return 'broad_social'
  }

  if (normalized === 'portal' || normalized === 'job_portal' || normalized === 'job portal') {
    return 'job_portal'
  }

  return 'mixed_channel'
}

export function normalizeWorkerCategory(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ')

  if (normalized.includes('delivery')) return 'delivery'
  if (normalized.includes('warehouse')) return 'warehouse'
  if (normalized.includes('field') || normalized.includes('sales')) return 'field_sales'
  if (normalized.includes('promoter')) return 'promoter'
  if (normalized.includes('driver')) return 'driver'
  if (normalized.includes('helper')) return 'helper'
  if (normalized.includes('technician')) return 'technician'

  return 'other'
}

export function normalizeOutreachChannel(value: string): OutreachChannel {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_')

  if (normalized.includes('whatsapp')) return 'whatsapp'
  if (normalized.includes('linkedin')) return 'linkedin'
  if (normalized.includes('facebook')) return 'facebook'
  if (normalized.includes('instagram')) return 'instagram'
  if (normalized.includes('job') && normalized.includes('portal')) return 'job_portal'
  return 'whatsapp'
}

export function normalizeCompensationModel(value: string): CompensationModel {
  const normalized = value.trim().toLowerCase()

  if (normalized.includes('task')) return 'per_task'
  if (normalized.includes('fixed') || normalized.includes('salary')) return 'fixed'
  if (normalized.includes('week')) return 'weekly'
  if (normalized.includes('day')) return 'daily'
  if (normalized.includes('hour')) return 'hourly'

  return 'hourly'
}

export function buildCompensationDetails(value: string) {
  const raw = value.trim()
  return raw ? { raw } : {}
}

export function formatCampaignMode(value: CampaignMode) {
  return campaignModeLabels[value]
}

export function formatWorkerCategory(value: string) {
  return value.trim()
}

export function formatOutreachChannel(value: OutreachChannel | string) {
  const normalized = outreachChannels.includes(value as OutreachChannel)
    ? (value as OutreachChannel)
    : normalizeOutreachChannel(value)

  return outreachChannelLabels[normalized]
}
