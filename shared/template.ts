export const templateChannels = ['whatsapp', 'linkedin', 'facebook', 'instagram', 'job_portal'] as const
export type TemplateChannel = (typeof templateChannels)[number]

export const templateChannelLabels: Record<TemplateChannel, string> = {
  whatsapp: 'WhatsApp',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  instagram: 'Instagram',
  job_portal: 'Job Portal',
}

export function normalizeTemplateChannel(value: string): TemplateChannel {
  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, '')

  if (normalized.includes('linkedin')) return 'linkedin'
  if (normalized.includes('facebook')) return 'facebook'
  if (normalized.includes('instagram')) return 'instagram'
  if (normalized.includes('jobportal') || normalized.includes('job')) return 'job_portal'
  return 'whatsapp'
}

export type TemplatePayload = {
  channel: TemplateChannel
  campaign_id?: string | null
  template_name: string
  message_body: string
  language: string
  media_attachment_url?: string
}

export type TemplateGenerationRequest = {
  campaign_id: string
  channel: TemplateChannel
  language?: string
  current_template_name?: string
  current_message_body?: string
}

export type TemplateGenerationResponse = {
  channel: TemplateChannel
  template_name: string
  message_body: string
  language: string
  media_attachment_url: string
}

export type TemplateRecord = TemplatePayload & {
  id: string
  created_at: string
  updated_at: string
}

export type TemplateListItem = Pick<
  TemplateRecord,
  | 'id'
  | 'campaign_id'
  | 'channel'
  | 'template_name'
  | 'message_body'
  | 'language'
  | 'media_attachment_url'
  | 'created_at'
  | 'updated_at'
>
