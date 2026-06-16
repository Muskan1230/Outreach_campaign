import { request } from '../../../services/apiClient'

export type RecruiterNotification = {
  id: string
  recruiter_id: string
  campaign_id: string | null
  application_id: string | null
  notification_type: string
  title: string
  message: string
  payload: Record<string, unknown>
  is_read: boolean
  read_at: string | null
  delivery_status: string
  email_status: string
  email_sent_at: string | null
  created_at: string
  updated_at: string
}

export type RecruiterNotificationListResponse = {
  data: RecruiterNotification[]
  unread_count: number
}

export function listRecruiterNotifications(params?: { unreadOnly?: boolean; limit?: number }) {
  const searchParams = new URLSearchParams()
  if (params?.unreadOnly) searchParams.set('unreadOnly', 'true')
  if (params?.limit) searchParams.set('limit', String(params.limit))

  const suffix = searchParams.toString()
  return request<RecruiterNotificationListResponse>(
    `/api/recruiter-notifications${suffix ? `?${suffix}` : ''}`,
  )
}

export function getRecruiterUnreadCount() {
  return request<{ unread_count: number }>('/api/recruiter-notifications/unread-count')
}

export function markRecruiterNotificationRead(id: string) {
  return request<RecruiterNotification>(`/api/recruiter-notifications/${id}/read`, {
    method: 'PATCH',
  })
}

export function markAllRecruiterNotificationsRead() {
  return request<{ message: string }>('/api/recruiter-notifications/read-all', {
    method: 'PATCH',
  })
}

