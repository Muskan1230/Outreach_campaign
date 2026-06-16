import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { supabase } from '../lib/supabase.js'
import { requireAuth } from '../middleware/requireAuth.js'
import type { AuthenticatedRequest } from '../middleware/requireAuth.js'

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

// ── Protected routes (recruiter JWT required) ─────────────────────────────────

/**
 * POST /api/campaigns/:campaignId/tracking-links
 * Create or return existing tracking link for campaign + channel + recruiter.
 * Uses upsert semantics: if an active link already exists for the same
 * (campaign_id, channel, recruiter_id), returns it instead of creating a duplicate.
 */
router.post(
  '/campaigns/:campaignId/tracking-links',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const campaignId = req.params.campaignId
      const recruiterId = (req as AuthenticatedRequest).user.id

      const payload = createTrackingLinkSchema.parse(req.body)

      // Check if an active link already exists for this campaign + channel + recruiter
      const { data: existing, error: existingError } = await supabase
        .from('tracking_links')
        .select('*')
        .eq('campaign_id', campaignId)
        .eq('channel', payload.channel)
        .eq('is_active', true)
        // Match recruiter: use the authenticated user's id (or null if none stored)
        .or(`recruiter_id.eq.${recruiterId},recruiter_id.is.null`)
        .limit(1)
        .maybeSingle()

      if (existingError) throw existingError

      if (existing) {
        return res.json(existing)
      }

      // Create new tracking link
      const { data: newLink, error: insertError } = await supabase
        .from('tracking_links')
        .insert({
          campaign_id: campaignId,
          channel: payload.channel,
          recruiter_id: recruiterId,
          utm_source: payload.utm_source ?? payload.channel,
          utm_medium: payload.utm_medium ?? (payload.channel === 'job_portal' ? 'job_portal' : 'social'),
          utm_campaign: payload.utm_campaign ?? null,
          is_active: true,
          total_clicks: 0,
        })
        .select('*')
        .single()

      if (insertError) {
        // Handle unique constraint violation (race condition): fetch existing
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
        throw insertError
      }

      return res.status(201).json(newLink)
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

// ── Public route (no auth — called from candidate apply page) ─────────────────

/**
 * POST /api/tracking-links/:linkId/click
 * Atomically increment total_clicks for an active tracking link.
 * Public endpoint — no authentication required.
 * Returns 204 No Content on success so the candidate page can fire-and-forget.
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

      // Use raw increment via RPC or direct update with arithmetic
      // Supabase JS v2 supports .update({ total_clicks: supabase.raw('total_clicks + 1') })
      // but the cleaner approach is to use a direct SQL increment.
      const { error } = await supabase.rpc('increment_tracking_link_clicks', {
        p_link_id: linkId,
      })

      if (error) {
        // If RPC doesn't exist yet (not in migration), fall back to a JS-side read+write.
        // This is less atomic but acceptable for click tracking.
        const { data: link, error: readError } = await supabase
          .from('tracking_links')
          .select('id, total_clicks, is_active')
          .eq('id', linkId)
          .eq('is_active', true)
          .maybeSingle()

        if (readError) throw readError

        if (!link) {
          // Link not found or not active — silently succeed (don't error the candidate)
          return res.status(204).send()
        }

        const { error: updateError } = await supabase
          .from('tracking_links')
          .update({ total_clicks: (link.total_clicks ?? 0) + 1 })
          .eq('id', linkId)
          .eq('is_active', true)

        if (updateError) throw updateError
      }

      return res.status(204).send()
    } catch (error) {
      // Never surface errors to the candidate for click tracking
      console.error('[click-counter] error:', error)
      return res.status(204).send()
    }
  },
)

export default router
