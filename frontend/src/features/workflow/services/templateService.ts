import { request } from '../../../services/apiClient'
import type {
  TemplateListItem,
  TemplateGenerationRequest,
  TemplateGenerationResponse,
  TemplatePayload,
  TemplateRecord,
} from '../../../../../shared/template'

export function listTemplates() {
  return request<{ data: TemplateListItem[] }>('/api/templates')
}

export function listCampaignTemplates(campaignId: string) {
  const searchParams = new URLSearchParams({
    campaign_id: campaignId,
  })

  return request<{ data: TemplateListItem[] }>(`/api/templates?${searchParams.toString()}`)
}

export function getTemplate(id: string) {
  return request<TemplateRecord>(`/api/templates/${id}`)
}

export function createTemplate(payload: TemplatePayload) {
  return request<TemplateRecord>('/api/templates', {
    method: 'POST',
    body: payload,
  })
}

export function generateTemplateDraft(payload: TemplateGenerationRequest) {
  return request<TemplateGenerationResponse>('/api/templates/generate', {
    method: 'POST',
    body: payload,
  })
}

export function updateTemplate(id: string, payload: TemplatePayload) {
  return request<TemplateRecord>(`/api/templates/${id}`, {
    method: 'PUT',
    body: payload,
  })
}

export function deleteTemplate(id: string) {
  return request<void>(`/api/templates/${id}`, {
    method: 'DELETE',
  })
}
