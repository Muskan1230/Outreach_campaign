import { z } from 'zod'
import {
  templateChannels,
  templateChannelLabels,
  type TemplateListItem,
  type TemplatePayload,
} from '../../../../../shared/template'

export const templateFormSchema = z.object({
  channel: z.enum(templateChannels),
  template_name: z.string().trim().min(2, 'Template name is required'),
  message_body: z.string().trim().min(10, 'Message body is required'),
  language: z.string().trim().min(2, 'Language is required'),
  media_attachment_url: z.union([z.string().trim().url('Enter a valid URL'), z.literal('')]).optional(),
})

export type TemplateFormValues = z.infer<typeof templateFormSchema>

export const templatePreviewTokens = {
  '{{campaign_title}}': 'Festival Hiring Drive',
  '{{campaign_name}}': 'Festival Hiring Drive',
  '{{candidate_name}}': 'Rahul Kumar',
  '{{recruiter_name}}': 'Aisha Khan',
  '{{opportunity_type}}': 'Delivery Partner',
  '{{worker_type}}': 'Delivery gig worker',
  '{{city}}': 'Delhi NCR',
  '{{earning_range}}': '₹18,000 - ₹28,000',
  '{{shift_model}}': 'Flexible evening shifts',
  '{{form_link}}': 'https://apply.example.com/festive-drive',
}

export function replaceTemplateTokens(value: string) {
  return Object.entries(templatePreviewTokens).reduce(
    (accumulator, [token, replacement]) => accumulator.replaceAll(token, replacement),
    value,
  )
}

export function toTemplateFormValues(
  template?: {
    channel: TemplateListItem['channel']
    template_name: string
    message_body: string
    language: string
    media_attachment_url?: string | null
  } | null,
): TemplateFormValues {
  if (!template) {
    return {
      channel: 'whatsapp',
      template_name: '',
      message_body: '',
      language: '',
      media_attachment_url: '',
    }
  }

  return {
    channel: template.channel,
    template_name: template.template_name,
    message_body: template.message_body,
    language: template.language,
    media_attachment_url: template.media_attachment_url ?? '',
  }
}

export function toTemplatePayload(values: TemplateFormValues, campaignId?: string | null): TemplatePayload {
  return {
    channel: values.channel,
    campaign_id: campaignId ?? null,
    template_name: values.template_name.trim(),
    message_body: values.message_body.trim(),
    language: values.language.trim(),
    media_attachment_url: values.media_attachment_url?.trim() || '',
  }
}
