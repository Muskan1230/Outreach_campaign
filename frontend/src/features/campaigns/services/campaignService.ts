import { request } from '../../../services/apiClient'
import type {
  CampaignListItem,
  CampaignPayload,
  CampaignRecord,
  CampaignStatus,
  PaginatedResponse,
} from '../../../../../shared/campaign'

export function listCampaigns(params: {
  page: number
  limit: number
  search?: string
  status?: string
}) {
  const searchParams = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
  })

  if (params.search) searchParams.set('search', params.search)
  if (params.status) searchParams.set('status', params.status)

  return request<PaginatedResponse<CampaignListItem>>(`/api/campaigns?${searchParams.toString()}`)
}

export function getCampaignStats() {
  return request<{
    total: number
    draft: number
    active: number
    paused: number
    archived: number
  }>('/api/campaigns/stats')
}

export function getCampaign(id: string) {
  return request<CampaignRecord>(`/api/campaigns/${id}`)
}

export function createCampaign(payload: CampaignPayload) {
  return request<CampaignRecord>('/api/campaigns', {
    method: 'POST',
    body: payload,
  })
}

export function updateCampaign(id: string, payload: CampaignPayload) {
  return request<CampaignRecord>(`/api/campaigns/${id}`, {
    method: 'PUT',
    body: payload,
  })
}

export function updateCampaignStatus(id: string, status: CampaignStatus) {
  return request<CampaignRecord>(`/api/campaigns/${id}/status`, {
    method: 'PATCH',
    body: { status },
  })
}

export function deleteCampaign(id: string) {
  return request<void>(`/api/campaigns/${id}`, {
    method: 'DELETE',
  })
}
