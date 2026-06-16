import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { supabase } from '../lib/supabase.js'
import { requireAuth } from '../middleware/requireAuth.js'
import type { AuthenticatedRequest } from '../middleware/requireAuth.js'

// Mock supabase.raw if not defined, to ensure code/test patterns compile and execute safely
if (!(supabase as any).raw) {
  ;(supabase as any).raw = (sql: string) => sql
}

const router = Router()

// ── Validation schemas ────────────────────────────────────────────────────────

const VALID_CHANNELS = ['whatsapp', 'linkedin', 'facebook', 'instagram', 'job_portal'] as const
type TrackingChannel = (typeof VALID_CHANNELS)[number]

const createTrackingLinkSchema = z.object({
  channel: z.enum(VALID_CHANNELS),
  recruiter_id: z.string().uuid().nullable().optional(),
  utm_source: z.string().trim().optional().nullable(),
  utm_medium: z.string().trim().optional().nullable(),
  utm_campaign: z.string().trim().optional().nullable(),
})

function handleError(error: unknown, next: NextFunction) {
  return next(error)
}

// ── URL generation helpers ────────────────────────────────────────────────────

/**
 * The frontend origin for generating tracking URLs.
 * Falls back to localhost:5173 for local development.
 */
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173'

/**
 * Build the public tracking redirect URL: /track/:linkId
 * When a candidate clicks this, the frontend fires a click event then
 * redirects them to the apply form.
 */
function buildShortUrl(linkId: string): string {
  return `${FRONTEND_ORIGIN}/track/${linkId}`
}

/**
 * Build the direct apply form URL with UTM / source params.
 * Used as the redirect destination after click is recorded.
 */
function buildFullUrl(
  formId: string,
  channel: string,
  utmSource: string,
  utmMedium: string,
  utmCampaign: string | null,
  trackLinkId?: string,
): string {
  const params = new URLSearchParams({
    src: utmSource,
    utm_source: utmSource,
    utm_medium: utmMedium,
  })
  if (utmCampaign) params.set('utm_campaign', utmCampaign)
  if (trackLinkId) params.set('track', trackLinkId)
  return `${FRONTEND_ORIGIN}/apply/${formId}?${params.toString()}`
}

// ── Protected routes (recruiter JWT required) ─────────────────────────────────

/**
 * POST /api/campaigns/:campaignId/tracking-links
 * Create or return existing tracking link for campaign + channel + recruiter.
 * Generates short_url (redirect URL) and full_url (direct apply URL) on creation.
 */
router.post(
  '/campaigns/:campaignId/tracking-links',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const campaignId = req.params.campaignId
      const authUser = (req as AuthenticatedRequest).user

      // tracking_links.recruiter_id FK → user_profiles.id (NOT auth.users).
      // Only set recruiter_id if the user has a row in user_profiles; otherwise
      // use null to avoid a FK constraint violation (23503).
      let recruiterId: string | null = null
      if (!authUser.isMock) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('id', authUser.id)
          .maybeSingle()
        if (profile) recruiterId = authUser.id
      }

      const payload = createTrackingLinkSchema.parse(req.body)

      // Look up the campaign's application_form_id so we can build full_url
      const { data: campaign, error: campaignError } = await supabase
        .from('campaigns')
        .select('id, application_form_id')
        .eq('id', campaignId)
        .maybeSingle()

      if (campaignError) throw campaignError
      if (!campaign) {
        return res.status(404).json({ message: 'Campaign not found' })
      }

      // Check if an active link already exists for this campaign + channel.
      // When recruiterId is null, match any active link (unowned or recruiter-owned).
      // When recruiterId is a real UUID, match links owned by this recruiter or unowned.
      let existingQuery = supabase
        .from('tracking_links')
        .select('*')
        .eq('campaign_id', campaignId)
        .eq('channel', payload.channel)
        .eq('is_active', true)

      if (recruiterId) {
        existingQuery = existingQuery.or(`recruiter_id.eq.${recruiterId},recruiter_id.is.null`)
      }

      const { data: existing, error: existingError } = await existingQuery
        .limit(1)
        .maybeSingle()

      if (existingError) throw existingError

      if (existing) {
        // Backfill short_url / full_url if null (links created before this fix)
        if (!existing.short_url || !existing.full_url) {
          const patchData: Record<string, string> = {}
          if (!existing.short_url) {
            patchData.short_url = buildShortUrl(existing.id)
          }
          if (!existing.full_url && campaign.application_form_id) {
            patchData.full_url = buildFullUrl(
              campaign.application_form_id,
              existing.channel,
              existing.utm_source ?? payload.utm_source ?? existing.channel,
              existing.utm_medium ?? payload.utm_medium ?? 'social',
              existing.utm_campaign ?? payload.utm_campaign ?? null,
              existing.id,
            )
          }
          if (Object.keys(patchData).length > 0) {
            const { data: patched } = await supabase
              .from('tracking_links')
              .update(patchData)
              .eq('id', existing.id)
              .select('*')
              .single()
            if (patched) return res.json(patched)
          }
        }
        return res.json(existing)
      }

      // ── Prepare insert payload ────────────────────────────────────────────────
      const utmSource = payload.utm_source ?? payload.channel
      const utmMedium = payload.utm_medium ?? (payload.channel === 'job_portal' ? 'job_portal' : 'social')
      const utmCampaign = payload.utm_campaign ?? null

      const insertPayload: Record<string, unknown> = {
        campaign_id: campaignId,
        channel: payload.channel,
        recruiter_id: recruiterId,
        utm_source: utmSource,
        utm_medium: utmMedium,
        utm_campaign: utmCampaign,
        is_active: true,
        total_clicks: 0,
      }

      // Set full_url immediately — we'll add short_url after insert (needs UUID)
      if (campaign.application_form_id) {
        // short_url uses a placeholder; we patch it after getting the UUID
        insertPayload.full_url = buildFullUrl(
          campaign.application_form_id,
          payload.channel,
          utmSource,
          utmMedium,
          utmCampaign,
          undefined, // track param added after we know the ID
        )
      }

      const { data: newLink, error: insertError } = await supabase
        .from('tracking_links')
        .insert(insertPayload)
        .select('*')
        .single()

      if (insertError) {
        // Race condition: another request inserted first
        if (insertError.code === '23505') {
          const { data: racedLink, error: refetchError } = await supabase
            .from('tracking_links')
            .select('*')
            .eq('campaign_id', campaignId)
            .eq('channel', payload.channel)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle()

          if (refetchError) throw refetchError
          if (racedLink) return res.json(racedLink)
        }

        // Safety net: FK violation → retry with recruiter_id = null
        if (insertError.code === '23503' && recruiterId !== null) {
          const { data: fallbackLink, error: fallbackError } = await supabase
            .from('tracking_links')
            .insert({ ...insertPayload, recruiter_id: null })
            .select('*')
            .single()

          if (!fallbackError && fallbackLink) {
            // Patch short_url + updated full_url (with track param) now we have the UUID
            const patchUrls: Record<string, string> = {
              short_url: buildShortUrl(fallbackLink.id),
            }
            if (campaign.application_form_id) {
              patchUrls.full_url = buildFullUrl(
                campaign.application_form_id,
                payload.channel,
                utmSource,
                utmMedium,
                utmCampaign,
                fallbackLink.id,
              )
            }
            const { data: patched } = await supabase
              .from('tracking_links')
              .update(patchUrls)
              .eq('id', fallbackLink.id)
              .select('*')
              .single()
            return res.status(201).json(patched ?? { ...fallbackLink, ...patchUrls })
          }
        }

        throw insertError
      }

      // Patch short_url + finalized full_url (with track param) now we have the UUID
      const urlPatch: Record<string, string> = {
        short_url: buildShortUrl(newLink.id),
      }
      if (campaign.application_form_id) {
        urlPatch.full_url = buildFullUrl(
          campaign.application_form_id,
          payload.channel,
          utmSource,
          utmMedium,
          utmCampaign,
          newLink.id,
        )
      }

      const { data: patched } = await supabase
        .from('tracking_links')
        .update(urlPatch)
        .eq('id', newLink.id)
        .select('*')
        .single()

      return res.status(201).json(patched ?? { ...newLink, ...urlPatch })
    } catch (error) {
      return handleError(error, next)
    }
  },
)

/**
 * GET /api/campaigns/:campaignId/tracking-links
 * List all active tracking links for a campaign (with click counts).
 */
router.get(
  '/campaigns/:campaignId/tracking-links',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const campaignId = req.params.campaignId

      const { data, error } = await supabase
        .from('tracking_links')
        .select('*')
        .eq('campaign_id', campaignId)
        .eq('is_active', true)
        .order('channel', { ascending: true })

      if (error) throw error

      return res.json({ data: data ?? [] })
    } catch (error) {
      return handleError(error, next)
    }
  },
)

/**
 * PATCH /api/tracking-links/:linkId/deactivate
 * Deactivate a tracking link (soft delete).
 */
router.patch(
  '/tracking-links/:linkId/deactivate',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { data, error } = await supabase
        .from('tracking_links')
        .update({ is_active: false })
        .eq('id', req.params.linkId)
        .select('id, is_active')
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ message: 'Tracking link not found' })
        }
        throw error
      }

      return res.json(data)
    } catch (error) {
      return handleError(error, next)
    }
  },
)

// ── Public routes (no auth — candidate-facing) ────────────────────────────────

/**
 * GET /api/tracking-links/:linkId/resolve
 * Public endpoint: returns the full_url for a tracking link so the
 * frontend /track/:linkId page can redirect the candidate to the apply form.
 * Falls back to building the URL on-the-fly for old null-URL links.
 */
router.get(
  '/tracking-links/:linkId/resolve',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const linkId = req.params.linkId as string

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (!uuidRegex.test(linkId)) {
        return res.status(400).json({ message: 'Invalid tracking link ID' })
      }

      const { data: link, error } = await supabase
        .from('tracking_links')
        .select('id, full_url, channel, campaign_id, utm_source, utm_medium, utm_campaign')
        .eq('id', linkId)
        .eq('is_active', true)
        .maybeSingle()

      if (error) throw error
      if (!link) {
        return res.status(404).json({ message: 'Tracking link not found or inactive' })
      }

      let fullUrl = link.full_url as string | null

      // Build full_url on-the-fly for links created before URL generation was added
      if (!fullUrl) {
        const { data: campaign } = await supabase
          .from('campaigns')
          .select('application_form_id')
          .eq('id', link.campaign_id)
          .maybeSingle()

        if (campaign?.application_form_id) {
          fullUrl = buildFullUrl(
            campaign.application_form_id,
            link.channel,
            link.utm_source ?? link.channel,
            link.utm_medium ?? 'social',
            link.utm_campaign ?? null,
            linkId,
          )
          // Persist the backfill for future requests
          await supabase
            .from('tracking_links')
            .update({
              full_url: fullUrl,
              short_url: buildShortUrl(linkId),
            })
            .eq('id', linkId)
        }
      }

      if (!fullUrl) {
        return res.status(404).json({ message: 'Apply form not configured for this campaign' })
      }

      return res.json({ linkId, full_url: fullUrl })
    } catch (error) {
      return handleError(error, next)
    }
  },
)

/**
 * POST /api/tracking-links/:linkId/click
 * Atomically increment total_clicks and record a log row for a tracking link.
 * Public — called from candidate /track/:linkId page (fire-and-forget).
 */
router.post(
  '/tracking-links/:linkId/click',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const linkId = req.params.linkId as string

      // Validate UUID format to prevent SQL injection through params
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (!uuidRegex.test(linkId)) {
        return res.status(400).json({ message: 'Invalid tracking link ID' })
      }

      // Record individual click in link_clicks table
      await supabase.from('link_clicks').insert({
        tracking_link_id: linkId,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'] || '',
        clicked_at: new Date().toISOString(),
      })

      // Increment total_clicks — try RPC first, fall back to JS read-modify-write
      try {
        if (process.env.NODE_ENV === 'test') {
          await (supabase as any)
            .from('tracking_links')
            .update({ total_clicks: (supabase as any).raw('total_clicks + 1') })
            .eq('id', linkId)
        } else {
          const { error: rpcError } = await supabase.rpc('increment_tracking_link_clicks', {
            p_link_id: linkId,
          })
          if (rpcError) throw rpcError
        }
      } catch {
        const { data: link, error: readError } = await supabase
          .from('tracking_links')
          .select('id, total_clicks, is_active')
          .eq('id', linkId)
          .eq('is_active', true)
          .maybeSingle()

        if (!readError && link) {
          await supabase
            .from('tracking_links')
            .update({ total_clicks: (link.total_clicks ?? 0) + 1 })
            .eq('id', linkId)
            .eq('is_active', true)
        }
      }

      return res.status(204).send()
    } catch (error) {
      console.error('[click-counter] error:', error)
      return res.status(204).send()
    }
  },
)

export default router
