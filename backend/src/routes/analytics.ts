import { Router, type Request, type Response, type NextFunction } from 'express'
import { supabase } from '../lib/supabase.js'

const router = Router()

// ── Helper: parse ?days query param ──────────────────────────────────────────
function parseDays(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.min(Math.trunc(n), 365) : 30
}

function sinceDate(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString()
}

// ── 1. Overall funnel metrics ─────────────────────────────────────────────────
async function getCampaignFunnelMetrics(campaignId: string, since: string) {
  // Total clicks from tracking_links
  const { data: linksData } = await supabase
    .from('tracking_links')
    .select('total_clicks')
    .eq('campaign_id', campaignId)
    .eq('is_active', true)

  const clicks = (linksData ?? []).reduce((sum, l) => sum + (l.total_clicks ?? 0), 0)

  // Applications count
  const { count: applications } = await supabase
    .from('candidate_applications')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .gte('created_at', since)

  // Hired count (status = 'onboarded')
  const { count: hired } = await supabase
    .from('candidate_applications')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('status', 'onboarded')
    .gte('created_at', since)

  const appCount = applications ?? 0
  const hiredCount = hired ?? 0
  const conversionRate = clicks > 0 ? parseFloat(((hiredCount / clicks) * 100).toFixed(2)) : 0

  return {
    clicks,
    applications: appCount,
    hired: hiredCount,
    conversionRate,
  }
}

// ── 2. Funnel by channel ──────────────────────────────────────────────────────
async function getFunnelByChannel(campaignId: string, since: string) {
  const [{ data: appsData }, { data: linksData }] = await Promise.all([
    supabase
      .from('vw_application_queue')
      .select('source_channel, status, created_at')
      .eq('campaign_id', campaignId)
      .gte('created_at', since),
    supabase
      .from('tracking_links')
      .select('channel, total_clicks')
      .eq('campaign_id', campaignId)
      .eq('is_active', true),
  ])

  const channelAppMap = new Map<string, { applications: number; hired: number }>()
  for (const app of appsData ?? []) {
    const channel = ((app.source_channel as string | null) ?? 'unknown').trim().toLowerCase() || 'unknown'
    const stats = channelAppMap.get(channel) ?? { applications: 0, hired: 0 }
    stats.applications += 1
    if (app.status === 'onboarded') {
      stats.hired += 1
    }
    channelAppMap.set(channel, stats)
  }

  const clicksMap = new Map<string, number>()
  for (const link of linksData ?? []) {
    const channel = (link.channel as string | null)?.trim().toLowerCase()
    if (!channel) continue
    clicksMap.set(channel, (clicksMap.get(channel) ?? 0) + (link.total_clicks ?? 0))
  }

  const channels = new Set<string>([
    ...channelAppMap.keys(),
    ...clicksMap.keys(),
  ])

  return Array.from(channels)
    .sort((a, b) => {
      const aStats = channelAppMap.get(a) ?? { applications: 0, hired: 0 }
      const bStats = channelAppMap.get(b) ?? { applications: 0, hired: 0 }
      const appDelta = bStats.applications - aStats.applications
      if (appDelta !== 0) return appDelta
      return (clicksMap.get(b) ?? 0) - (clicksMap.get(a) ?? 0)
    })
    .map((channel) => {
      const stats = channelAppMap.get(channel) ?? { applications: 0, hired: 0 }
      const clicks = clicksMap.get(channel) ?? 0
      return {
        channel,
        clicks,
        applications: stats.applications,
        hired: stats.hired,
        conversionRate: stats.applications > 0
          ? parseFloat(((stats.hired / stats.applications) * 100).toFixed(2))
          : 0,
      }
    })
}

// ── 3. Funnel by city ─────────────────────────────────────────────────────────
async function getFunnelByCity(campaignId: string) {
  const { data } = await supabase
    .from('vw_application_queue')
    .select('current_location, status')
    .eq('campaign_id', campaignId)

  const cityMap: Record<string, { applications: number; hired: number }> = {}

  for (const row of data ?? []) {
    const city = (row.current_location as string | null)?.trim() || 'Unknown'
    if (!cityMap[city]) cityMap[city] = { applications: 0, hired: 0 }
    cityMap[city].applications += 1
    if (row.status === 'onboarded') cityMap[city].hired += 1
  }

  return Object.entries(cityMap)
    .map(([city, stats]) => ({ city, ...stats }))
    .sort((a, b) => b.applications - a.applications)
    .slice(0, 20)
}

// ── 4. Recruiter performance ──────────────────────────────────────────────────
async function getRecruiterPerformance(campaignId: string, since: string) {
  // Get workflow_events for this campaign's applications (non-automated only)
  const { data: appIds } = await supabase
    .from('candidate_applications')
    .select('id')
    .eq('campaign_id', campaignId)

  if (!appIds || appIds.length === 0) return []

  const ids = appIds.map((a) => a.id)

  const { data: events } = await supabase
    .from('workflow_events')
    .select('action_by, action_at')
    .in('application_id', ids)
    .eq('is_automated', false)
    .gte('action_at', since)
    .not('action_by', 'is', null)

  if (!events || events.length === 0) return []

  // Group by recruiter
  const recruiterMap: Record<string, { count: number; times: number[] }> = {}
  for (const ev of events) {
    const rid = ev.action_by as string
    if (!rid) continue
    if (!recruiterMap[rid]) recruiterMap[rid] = { count: 0, times: [] }
    recruiterMap[rid].count += 1
    recruiterMap[rid].times.push(new Date(ev.action_at as string).getTime())
  }

  return Object.entries(recruiterMap).map(([recruiterId, { count, times }]) => {
    times.sort()
    let avgProcessingTime = 0
    if (times.length > 1) {
      const diffs = times.slice(1).map((t, i) => (t - times[i]) / (1000 * 60 * 60)) // hours
      avgProcessingTime = parseFloat((diffs.reduce((s, d) => s + d, 0) / diffs.length).toFixed(2))
    }
    return {
      recruiterId,
      recruiterName: null as string | null, // future: join auth.users
      applicationsProcessed: count,
      avgProcessingTime,
    }
  })
}

// ── 5. Drop-off rates ─────────────────────────────────────────────────────────
async function getDropoffRates(campaignId: string, clicks: number, since: string) {
  const { data } = await supabase
    .from('candidate_applications')
    .select('status')
    .eq('campaign_id', campaignId)
    .gte('created_at', since)

  const rows = data ?? []
  const total = rows.length

  const statusCounts: Record<string, number> = {}
  for (const r of rows) {
    const s = r.status as string
    statusCounts[s] = (statusCounts[s] ?? 0) + 1
  }

  const applicationReceived = statusCounts['application_received'] ?? 0
  const shortlisted = statusCounts['shortlisted'] ?? 0
  const onboarded = statusCounts['onboarded'] ?? 0
  // Treat shortlisted + onboarded as having passed screening
  const postScreening = shortlisted + onboarded

  const clickToApply = clicks > 0
    ? parseFloat((((clicks - total) / clicks) * 100).toFixed(2))
    : 0

  // applyToSubmit: drop between raw submissions and received
  const applyToSubmit = total > 0
    ? parseFloat((((total - applicationReceived) / total) * 100).toFixed(2))
    : 0

  // screeningToShortlist: of those received, how many weren't shortlisted
  const screeningToShortlist = applicationReceived > 0
    ? parseFloat((((applicationReceived - shortlisted) / applicationReceived) * 100).toFixed(2))
    : 0

  // interviewToHired: of shortlisted, how many were hired
  const interviewToHired = shortlisted > 0
    ? parseFloat(((onboarded / shortlisted) * 100).toFixed(2))
    : 0

  return {
    clickToApply,
    applyToSubmit,
    screeningToShortlist,
    interviewToHired,
  }
}

// ── 6. Duplicate rate ─────────────────────────────────────────────────────────
async function getDuplicateRate(campaignId: string) {
  const { count: total } = await supabase
    .from('candidate_applications')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)

  const { count: duplicates } = await supabase
    .from('candidate_applications')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('status', 'duplicate_review')

  const t = total ?? 0
  const d = duplicates ?? 0
  const rate = t > 0 ? parseFloat(((d / t) * 100).toFixed(2)) : 0

  return { total: t, duplicates: d, rate }
}

// ── Route: GET /campaigns/:campaignId/analytics ───────────────────────────────
router.get('/campaigns/:campaignId/analytics', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaignId = req.params.campaignId as string
    const days = parseDays(req.query.days)
    const since = sinceDate(days)

    // Verify campaign exists
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, name')
      .eq('id', campaignId)
      .single()

    if (campaignError || !campaign) {
      return res.status(404).json({ message: 'Campaign not found' })
    }

    const [overall, byChannel, byCity, byRecruiter, duplicateRate] = await Promise.all([
      getCampaignFunnelMetrics(campaignId, since),
      getFunnelByChannel(campaignId, since),
      getFunnelByCity(campaignId),
      getRecruiterPerformance(campaignId, since),
      getDuplicateRate(campaignId),
    ])

    const dropoff = await getDropoffRates(campaignId, overall.clicks, since)

    return res.json({
      campaign: { id: campaign.id, name: campaign.name },
      days,
      overall,
      byChannel,
      byCity,
      byRecruiter,
      dropoff,
      duplicateRate,
    })
  } catch (error) {
    return next(error)
  }
})

// ── Route: GET /campaigns/:campaignId/analytics/export ───────────────────────
router.get('/campaigns/:campaignId/analytics/export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaignId = req.params.campaignId as string
    const days = parseDays(req.query.days)
    const since = sinceDate(days)

    const { data: campaign } = await supabase
      .from('campaigns')
      .select('id, name')
      .eq('id', campaignId)
      .single()

    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' })
    }

    const byChannel = await getFunnelByChannel(campaignId, since)

    // Build CSV
    const headers = ['Channel', 'Clicks', 'Applications', 'Hired', 'Conversion Rate (%)']
    const rows = byChannel.map((row) => [
      row.channel,
      row.clicks,
      row.applications,
      row.hired,
      row.conversionRate,
    ])

    const csvLines = [headers.join(','), ...rows.map((r) => r.join(','))]
    const csv = csvLines.join('\n')
    const filename = `analytics_${campaignId}_${days}_days.csv`

    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    return res.send(csv)
  } catch (error) {
    return next(error)
  }
})

export default router
