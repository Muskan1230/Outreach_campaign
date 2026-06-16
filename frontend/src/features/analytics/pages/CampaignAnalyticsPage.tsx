import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { request } from '../../../services/apiClient'
import { supabase } from '../../../lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

interface OverallMetrics {
  clicks: number
  applications: number
  hired: number
  conversionRate: number
}

interface ChannelMetric {
  channel: string
  clicks: number
  applications: number
  hired: number
  conversionRate: number
}

interface CityMetric {
  city: string
  applications: number
  hired: number
}

interface RecruiterMetric {
  recruiterId: string
  recruiterName: string | null
  applicationsProcessed: number
  avgProcessingTime: number
}

interface DropoffRates {
  clickToApply: number
  applyToSubmit: number
  screeningToShortlist: number
  interviewToHired: number
}

interface DuplicateRate {
  total: number
  duplicates: number
  rate: number
}

interface AnalyticsData {
  campaign: { id: string; name: string }
  days: number
  overall: OverallMetrics
  byChannel: ChannelMetric[]
  byCity: CityMetric[]
  byRecruiter: RecruiterMetric[]
  dropoff: DropoffRates
  duplicateRate: DuplicateRate
}

// ── Channel config ─────────────────────────────────────────────────────────────
const CHANNEL_META: Record<string, { label: string; emoji: string; color: string; bg: string }> = {
  whatsapp:   { label: 'WhatsApp',   emoji: '💬', color: '#25d366', bg: 'rgba(37,211,102,0.12)'  },
  linkedin:   { label: 'LinkedIn',   emoji: '💼', color: '#0a66c2', bg: 'rgba(10,102,194,0.12)'  },
  facebook:   { label: 'Facebook',   emoji: '📘', color: '#1877f2', bg: 'rgba(24,119,242,0.12)'  },
  instagram:  { label: 'Instagram',  emoji: '📸', color: '#e1306c', bg: 'rgba(225,48,108,0.12)'  },
  job_portal: { label: 'Job Portal', emoji: '📋', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)'  },
}

function channelMeta(ch: string) {
  return CHANNEL_META[ch] ?? { label: ch, emoji: '🔗', color: '#6366f1', bg: 'rgba(99,102,241,0.12)' }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: string }) {
  return (
    <div className="an-metric-card" style={{ '--accent': accent } as React.CSSProperties}>
      <span className="an-metric-label">{label}</span>
      <strong className="an-metric-value">{value}</strong>
      {sub && <span className="an-metric-sub">{sub}</span>}
    </div>
  )
}

function ChannelBar({ row, maxClicks }: { row: ChannelMetric; maxClicks: number }) {
  const meta = channelMeta(row.channel)
  const clickPct  = maxClicks > 0 ? (row.clicks / maxClicks) * 100 : 0
  const appPct    = row.clicks > 0 ? (row.applications / row.clicks) * 100 : 0
  const hirePct   = row.clicks > 0 ? (row.hired / row.clicks) * 100 : 0

  return (
    <div className="an-channel-row">
      <div className="an-channel-label">
        <span className="an-channel-emoji">{meta.emoji}</span>
        <span>{meta.label}</span>
      </div>

      <div className="an-bars-wrap">
        {/* Clicks bar */}
        <div className="an-bar-group">
          <span className="an-bar-legend">Clicks</span>
          <div className="an-bar-track">
            <div className="an-bar-fill" style={{ width: `${clickPct}%`, background: meta.color }} />
          </div>
          <span className="an-bar-val">{row.clicks.toLocaleString()}</span>
        </div>

        {/* Applications bar */}
        <div className="an-bar-group">
          <span className="an-bar-legend">Applications</span>
          <div className="an-bar-track">
            <div className="an-bar-fill" style={{ width: `${appPct}%`, background: '#6366f1' }} />
          </div>
          <span className="an-bar-val">{row.applications.toLocaleString()}</span>
        </div>

        {/* Hired bar */}
        <div className="an-bar-group">
          <span className="an-bar-legend">Hired</span>
          <div className="an-bar-track">
            <div className="an-bar-fill" style={{ width: `${hirePct}%`, background: '#10b981' }} />
          </div>
          <span className="an-bar-val">{row.hired.toLocaleString()}</span>
        </div>
      </div>

      <div className="an-channel-conv" style={{ color: meta.color }}>
        {row.conversionRate}%
      </div>
    </div>
  )
}

function DropoffItem({ label, rate, description }: { label: string; rate: number; description: string }) {
  const color = rate > 50 ? '#f43f5e' : rate > 25 ? '#f59e0b' : '#10b981'
  const width  = Math.min(rate, 100)
  return (
    <div className="an-dropoff-item">
      <div className="an-dropoff-header">
        <span className="an-dropoff-label">{label}</span>
        <span className="an-dropoff-rate" style={{ color }}>{rate}%</span>
      </div>
      <div className="an-dropoff-track">
        <div className="an-dropoff-fill" style={{ width: `${width}%`, background: color }} />
      </div>
      <span className="an-dropoff-desc">{description}</span>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const DAY_OPTIONS = [
  { label: 'Last 7 days',  value: 7  },
  { label: 'Last 30 days', value: 30 },
  { label: 'Last 90 days', value: 90 },
]

export function CampaignAnalyticsPage() {
  const { id: campaignId } = useParams<{ id: string }>()
  const [days, setDays]       = useState(30)
  const [data, setData]       = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [exporting, setExporting] = useState(false)

  const fetchData = useCallback(async () => {
    if (!campaignId) return
    setLoading(true)
    setError('')
    try {
      const result = await request<AnalyticsData>(
        `/api/analytics/campaigns/${campaignId}/analytics?days=${days}`
      )
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [campaignId, days])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleExport() {
    if (!campaignId) return
    setExporting(true)
    try {
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token || 'mock-token'
      const url     = `${baseUrl}/api/analytics/campaigns/${campaignId}/analytics/export?days=${days}`
      const resp    = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) throw new Error('Export failed')
      const blob     = await resp.blob()
      const blobUrl  = URL.createObjectURL(blob)
      const a        = document.createElement('a')
      a.href         = blobUrl
      a.download     = `analytics_${campaignId}_${days}_days.csv`
      a.click()
      URL.revokeObjectURL(blobUrl)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const maxClicks = data
    ? Math.max(...data.byChannel.map((c) => c.clicks), 1)
    : 1

  return (
    <div className="page-shell">
      {/* ── Header ── */}
      <section className="hero-card workflow-hero" style={{ marginBottom: 24 }}>
        <div>
          <span className="eyebrow">📊 Campaign Analytics</span>
          <h1>{data ? data.campaign.name : loading ? 'Loading…' : 'Analytics Dashboard'}</h1>
          <p className="hero-copy">
            Track funnel performance, channel attribution, drop-off rates, and duplicate detection.
          </p>
        </div>
        <div className="an-header-controls">
          <label className="field" style={{ flex: '0 0 auto', minWidth: 170 }}>
            <span>Period</span>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              {DAY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="primary-button"
            onClick={handleExport}
            disabled={exporting || loading || !data}
          >
            {exporting ? '⏳ Exporting…' : '⬇️ Export CSV'}
          </button>
          <Link to={`/campaigns/${campaignId}`} className="ghost-button">
            ← Back to Campaign
          </Link>
        </div>
      </section>

      {error && <div className="alert error" style={{ marginBottom: 24 }}>{error}</div>}

      {loading && (
        <div className="empty-state">Loading analytics data…</div>
      )}

      {!loading && data && (
        <>
          {/* ── Overall Metrics ── */}
          <div className="an-metrics-grid" style={{ marginBottom: 24 }}>
            <MetricCard
              label="Total Clicks"
              value={data.overall.clicks.toLocaleString()}
              sub="Across all channels"
              accent="#6366f1"
            />
            <MetricCard
              label="Applications"
              value={data.overall.applications.toLocaleString()}
              sub={`Last ${days} days`}
              accent="#0ea5e9"
            />
            <MetricCard
              label="Hired"
              value={data.overall.hired.toLocaleString()}
              sub="Onboarded candidates"
              accent="#10b981"
            />
            <MetricCard
              label="Conversion Rate"
              value={`${data.overall.conversionRate}%`}
              sub="Hired ÷ Clicks"
              accent="#f59e0b"
            />
          </div>

          {/* ── Funnel by Channel ── */}
          <section className="panel" style={{ marginBottom: 24 }}>
            <div className="panel-header">
              <h2>📈 Funnel by Channel</h2>
              <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                Clicks → Applications → Hired
              </span>
            </div>

            {data.byChannel.length === 0 ? (
              <div className="empty-state">
                No channel attribution data yet. Candidates can still apply without tracking links, and the chart will appear once applications or clicks are recorded.
              </div>
            ) : (
              <div className="an-channels-list">
                <div className="an-channels-header">
                  <span>Channel</span>
                  <span>Funnel Metrics</span>
                  <span style={{ textAlign: 'right' }}>Conv. Rate</span>
                </div>
                {data.byChannel.map((row) => (
                  <ChannelBar key={row.channel} row={row} maxClicks={maxClicks} />
                ))}
              </div>
            )}
          </section>

          {/* ── By City + By Recruiter ── */}
          <div className="an-two-col" style={{ marginBottom: 24 }}>
            {/* City */}
            <section className="panel">
              <div className="panel-header">
                <h2>📍 By City</h2>
              </div>
              {data.byCity.length === 0 ? (
                <div className="empty-state">No location data yet.</div>
              ) : (
                <div className="table-wrap" style={{ minWidth: 0 }}>
                  <table style={{ minWidth: 0 }}>
                    <thead>
                      <tr>
                        <th>City</th>
                        <th style={{ textAlign: 'right' }}>Apps</th>
                        <th style={{ textAlign: 'right' }}>Hired</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byCity.map((row) => (
                        <tr key={row.city}>
                          <td>{row.city}</td>
                          <td style={{ textAlign: 'right' }}>{row.applications}</td>
                          <td style={{ textAlign: 'right' }}>
                            <span style={{ color: '#10b981', fontWeight: 700 }}>{row.hired}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Recruiter */}
            <section className="panel">
              <div className="panel-header">
                <h2>👤 By Recruiter</h2>
              </div>
              {data.byRecruiter.length === 0 ? (
                <div className="empty-state">No recruiter activity yet.</div>
              ) : (
                <div className="table-wrap" style={{ minWidth: 0 }}>
                  <table style={{ minWidth: 0 }}>
                    <thead>
                      <tr>
                        <th>Recruiter</th>
                        <th style={{ textAlign: 'right' }}>Processed</th>
                        <th style={{ textAlign: 'right' }}>Avg Time (h)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byRecruiter.map((row) => (
                        <tr key={row.recruiterId}>
                          <td style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                            {row.recruiterName ?? row.recruiterId.slice(0, 8) + '…'}
                          </td>
                          <td style={{ textAlign: 'right' }}>{row.applicationsProcessed}</td>
                          <td style={{ textAlign: 'right', color: '#6366f1' }}>
                            {row.avgProcessingTime}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          {/* ── Drop-off Analysis ── */}
          <section className="panel" style={{ marginBottom: 24 }}>
            <div className="panel-header">
              <h2>⚠️ Drop-off Analysis</h2>
              <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                Lower % = better retention at each stage
              </span>
            </div>
            <div className="an-dropoff-grid">
              <DropoffItem
                label="Click → Apply"
                rate={data.dropoff.clickToApply}
                description="% of people who clicked but didn't apply"
              />
              <DropoffItem
                label="Apply → Submitted"
                rate={data.dropoff.applyToSubmit}
                description="% of started apps that didn't reach submitted status"
              />
              <DropoffItem
                label="Screening → Shortlisted"
                rate={data.dropoff.screeningToShortlist}
                description="% of screened candidates not shortlisted"
              />
              <DropoffItem
                label="Shortlisted → Hired"
                rate={100 - data.dropoff.interviewToHired}
                description="% of shortlisted candidates not hired"
              />
            </div>
          </section>

          {/* ── Duplicate Rate ── */}
          <section className="panel an-duplicate-section">
            <div className="an-dup-content">
              <div>
                <h2>📊 Duplicate Application Rate</h2>
                <p style={{ color: '#94a3b8', margin: '8px 0 0', fontSize: '0.9rem' }}>
                  {data.duplicateRate.duplicates} duplicate{data.duplicateRate.duplicates !== 1 ? 's' : ''} out of{' '}
                  {data.duplicateRate.total} total application{data.duplicateRate.total !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="an-dup-rate" style={{
                color: data.duplicateRate.rate > 20 ? '#f43f5e' :
                       data.duplicateRate.rate > 10 ? '#f59e0b' : '#10b981'
              }}>
                {data.duplicateRate.rate}%
              </div>
            </div>
            <div className="an-dup-track" style={{ marginTop: 16 }}>
              <div
                className="an-dup-fill"
                style={{
                  width: `${Math.min(data.duplicateRate.rate, 100)}%`,
                  background: data.duplicateRate.rate > 20 ? '#f43f5e' :
                              data.duplicateRate.rate > 10 ? '#f59e0b' : '#10b981',
                }}
              />
            </div>
            <p style={{ marginTop: 8, fontSize: '0.8rem', color: '#475569' }}>
              {data.duplicateRate.rate > 20
                ? '⚠️ High duplicate rate — consider strengthening deduplication rules.'
                : data.duplicateRate.rate > 10
                ? '🟡 Moderate duplicate rate — monitor closely.'
                : '✅ Low duplicate rate — pipeline quality looks good.'}
            </p>
          </section>
        </>
      )}
    </div>
  )
}
