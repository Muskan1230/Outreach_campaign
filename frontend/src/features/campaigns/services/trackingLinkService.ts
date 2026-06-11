import { request } from '../../../services/apiClient'

export interface TrackingLink {
  id: string
  campaign_id: string
  channel: string
  recruiter_id: string | null
  short_url: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  is_active: boolean
  total_clicks: number
  created_at: string
  updated_at: string
}

export interface TrackingLinkListResponse {
  data: TrackingLink[]
}

/**
 * Create (or return existing) tracking link for a campaign + channel.
 * The backend uses upsert semantics: calling this multiple times for the
 * same campaign + channel is safe and idempotent.
 */
export function createTrackingLink(
  campaignId: string,
  channel: string,
  utmSource?: string,
  utmMedium?: string,
  utmCampaign?: string,
): Promise<TrackingLink> {
  return request<TrackingLink>(`/api/campaigns/${campaignId}/tracking-links`, {
    method: 'POST',
    body: {
      channel,
      utm_source: utmSource ?? channel,
      utm_medium: utmMedium ?? (channel === 'job_portal' ? 'job_portal' : 'social'),
      utm_campaign: utmCampaign ?? null,
    },
  })
}

/**
 * List all active tracking links for a campaign.
 */
export function getTrackingLinks(campaignId: string): Promise<TrackingLinkListResponse> {
  return request<TrackingLinkListResponse>(`/api/campaigns/${campaignId}/tracking-links`)
}

/**
 * Record a click on a tracking link.
 * Public endpoint — no auth needed. Errors are silently swallowed
 * so they never surface to the candidate.
 */
export async function recordTrackingClick(linkId: string): Promise<void> {
  try {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'
    await fetch(`${baseUrl}/api/tracking-links/${linkId}/click`, {
      method: 'POST',
    })
  } catch {
    // Fire-and-forget: never propagate errors to the candidate
  }
}

/**
 * Channel → UTM source param mapping (matches DistributePage CHANNELS config).
 */
export const CHANNEL_UTM_MAP: Record<string, string> = {
  whatsapp: 'wa',
  linkedin: 'li',
  facebook: 'fb',
  instagram: 'ig',
  job_portal: 'nk',
}

/**
 * Channel → friendly label for display.
 */
export const CHANNEL_LABEL_MAP: Record<string, string> = {
  whatsapp: 'WhatsApp',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  instagram: 'Instagram',
  job_portal: 'Job Portal',
}
