import { Router, type Request, type Response, type NextFunction } from 'express'
import { supabase } from '../lib/supabase.js'

const router = Router()

const INDIAN_MOBILE_RE = /^[6-9][0-9]{9}$/

function handleError(error: unknown, next: NextFunction) {
  return next(error)
}

/**
 * GET /api/apply/status/:mobile
 *
 * Public route — no auth required.
 * Returns all applications (across campaigns) linked to the given mobile number,
 * along with the workflow event history for each application.
 *
 * Response shape:
 * {
 *   mobile: string,
 *   applications: Array<{
 *     application_id: string,
 *     campaign_name: string,
 *     opportunity_title: string,
 *     status: string,
 *     is_duplicate: boolean,
 *     submitted_at: string,
 *     workflow_history: Array<{ stage: string; at: string; remarks: string | null }>
 *   }>
 * }
 */
router.get('/apply/status/:mobile', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawMobile = typeof req.params.mobile === 'string' ? req.params.mobile.trim() : ''
    const normalizedMobile = rawMobile.replace(/[\s\-()]/g, '')

    // Validate Indian mobile format
    if (!INDIAN_MOBILE_RE.test(normalizedMobile)) {
      return res.status(400).json({
        message: 'Please provide a valid 10-digit Indian mobile number (starts with 6-9).',
      })
    }

    // ── 1. Find the worker profile for this mobile ──────────────────────────
    const { data: profileData, error: profileError } = await supabase
      .from('worker_profiles')
      .select('id, full_name, email, current_location')
      .eq('mobile', normalizedMobile)
      .maybeSingle()

    if (profileError) throw profileError

    if (!profileData) {
      return res.json({
        mobile: normalizedMobile,
        profile_found: false,
        applications: [],
        message: 'No applications found for this mobile number.',
      })
    }

    // ── 2. Get all applications for this worker profile ─────────────────────
    const { data: applications, error: appsError } = await supabase
      .from('candidate_applications')
      .select(
        'id, campaign_id, status, is_duplicate, submitted_at, created_at',
      )
      .eq('worker_profile_id', profileData.id)
      .order('created_at', { ascending: false })

    if (appsError) throw appsError

    if (!applications || applications.length === 0) {
      return res.json({
        mobile: normalizedMobile,
        profile_found: true,
        candidate_name: profileData.full_name,
        applications: [],
        message: 'No applications found.',
      })
    }

    // ── 3. Fetch campaign names + workflow history in parallel ──────────────
    const appIds = applications.map((a: any) => a.id)
    const campaignIds = [...new Set(applications.map((a: any) => a.campaign_id).filter(Boolean))]

    const [campaignsResult, workflowResult] = await Promise.all([
      campaignIds.length > 0
        ? supabase
            .from('campaigns')
            .select('id, name, opportunity_title')
            .in('id', campaignIds)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from('workflow_events')
        .select('application_id, to_stage, action_at, remarks')
        .in('application_id', appIds)
        .order('action_at', { ascending: true }),
    ])

    if (campaignsResult.error) throw campaignsResult.error
    if (workflowResult.error) throw workflowResult.error

    const campaignMap = new Map(
      ((campaignsResult.data ?? []) as any[]).map((c) => [c.id, c]),
    )

    // Group workflow events by application_id
    const workflowMap = new Map<string, any[]>()
    for (const event of (workflowResult.data ?? []) as any[]) {
      const list = workflowMap.get(event.application_id) ?? []
      list.push(event)
      workflowMap.set(event.application_id, list)
    }

    // ── 4. Build response ───────────────────────────────────────────────────
    const friendlyStageMap: Record<string, string> = {
      application_received: 'Application Received',
      duplicate_review: 'Under Review (Duplicate Check)',
      screening: 'Screening',
      shortlisted: 'Shortlisted ✓',
      interview: 'Interview Scheduled',
      selected: 'Selected ✓',
      rejected: 'Not Progressed',
      onboarded: 'Onboarded 🎉',
    }

    const result = applications.map((app: any) => {
      const campaign = campaignMap.get(app.campaign_id)
      const history = (workflowMap.get(app.id) ?? []).map((e: any) => ({
        stage: friendlyStageMap[e.to_stage] ?? e.to_stage,
        raw_stage: e.to_stage,
        at: e.action_at,
        remarks: e.remarks ?? null,
      }))

      return {
        application_id: app.id,
        campaign_name: campaign?.name ?? 'Unknown Campaign',
        opportunity_title: campaign?.opportunity_title ?? '',
        status: app.status,
        friendly_status: friendlyStageMap[app.status] ?? app.status,
        is_duplicate: app.is_duplicate ?? false,
        submitted_at: app.submitted_at ?? app.created_at,
        workflow_history: history,
      }
    })

    return res.json({
      mobile: normalizedMobile,
      profile_found: true,
      candidate_name: profileData.full_name,
      applications: result,
    })
  } catch (error) {
    return handleError(error, next)
  }
})

export default router
