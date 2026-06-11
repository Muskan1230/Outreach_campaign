import { request } from '../../../services/apiClient'

export type ApplicationStatus = 'new' | 'shortlisted' | 'offered' | 'hired' | 'rejected'

export interface ApplicantQueueRow {
  // From vw_application_queue — matches the view columns
  application_id: string
  campaign_id: string
  campaign_name: string
  form_id: string
  worker_profile_id: string
  candidate_name: string
  candidate_mobile: string | null
  candidate_email: string | null
  candidate_location: string | null
  preferred_location: string | null
  worker_category: string | null
  skills: string[] | null
  years_of_experience: number | null
  availability: string | null
  status: ApplicationStatus
  applied_at: string
  updated_at: string | null
  source: string | null
  source_channel: string | null  // whatsapp | linkedin | facebook | instagram | job_portal
  is_duplicate: boolean
  raw_responses?: Record<string, any>
}

export interface ApplicantListResponse {
  campaign: { id: string; name: string; opportunity_title: string }
  data: ApplicantQueueRow[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

export interface SubmissionListResponse {
  data: Array<{
    id: string
    form_id: string
    campaign_id: string
    responses: Record<string, any>
    created_at: string
  }>
}

export function listApplicants(
  campaignId: string,
  params: { status?: string; search?: string; page?: number; limit?: number; sourceChannel?: string } = {},
) {
  const qs = new URLSearchParams()
  if (params.status) qs.set('status', params.status)
  if (params.search) qs.set('search', params.search)
  if (params.page) qs.set('page', String(params.page))
  if (params.limit) qs.set('limit', String(params.limit))
  if (params.sourceChannel) qs.set('sourceChannel', params.sourceChannel)
  const query = qs.toString()
  return request<ApplicantListResponse>(
    `/api/campaigns/${campaignId}/applicants${query ? `?${query}` : ''}`,
  )
}

export function updateApplicationStatus(
  campaignId: string,
  appId: string,
  status: ApplicationStatus,
  notes?: string,
) {
  return request<{ message: string; application: { id: string; status: ApplicationStatus; updated_at: string } }>(
    `/api/campaigns/${campaignId}/applicants/${appId}/status`,
    {
      method: 'PATCH',
      body: { status, notes },
    },
  )
}

// Legacy: kept for backward compat with older form_submissions view
export function listSubmissions(campaignId: string) {
  return request<SubmissionListResponse>(`/api/campaigns/${campaignId}/submissions`)
}
