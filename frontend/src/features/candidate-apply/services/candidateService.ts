import { request } from '../../../services/apiClient'

export interface SubmitFormResponse {
  message: string
  application_id: string
  worker_profile_id: string
  submission_id: string | null
  is_duplicate: boolean
  next_steps?: string
}

export interface WorkflowEvent {
  stage: string
  raw_stage: string
  at: string
  remarks: string | null
}

export interface ApplicationStatusEntry {
  application_id: string
  campaign_name: string
  opportunity_title: string
  status: string
  friendly_status: string
  is_duplicate: boolean
  submitted_at: string
  workflow_history: WorkflowEvent[]
}

export interface ApplicationStatusResponse {
  mobile: string
  profile_found: boolean
  candidate_name?: string
  applications: ApplicationStatusEntry[]
  message?: string
}

/**
 * Submit a form application.
 * formId: the application_forms.id
 * responses: field-id → value map
 * sourceLinkId: optional tracking link id
 */
export function submitForm(
  formId: string,
  responses: Record<string, any>,
  sourceLinkId?: string,
) {
  return request<SubmitFormResponse>(`/api/forms/${formId}/submit`, {
    method: 'POST',
    body: { responses, source_link_id: sourceLinkId ?? null },
  })
}

/**
 * Fetch all application statuses for a given Indian mobile number.
 */
export function getApplicationStatus(mobile: string) {
  const normalized = mobile.trim().replace(/[\s\-()]/g, '')
  return request<ApplicationStatusResponse>(`/api/apply/status/${encodeURIComponent(normalized)}`)
}
