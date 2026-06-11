import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  getApplicationStatus,
  type ApplicationStatusEntry,
  type WorkflowEvent,
} from '../services/candidateService'

// ─── Stage config ──────────────────────────────────────────────────────────
const STAGE_CONFIG: Record<
  string,
  { color: string; bg: string; icon: string }
> = {
  application_received: { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', icon: '📋' },
  duplicate_review:     { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  icon: '🔍' },
  screening:            { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', icon: '🔎' },
  shortlisted:          { color: '#34d399', bg: 'rgba(52,211,153,0.12)',  icon: '✅' },
  interview:            { color: '#38bdf8', bg: 'rgba(56,189,248,0.12)',  icon: '📞' },
  selected:             { color: '#10b981', bg: 'rgba(16,185,129,0.12)',  icon: '🌟' },
  rejected:             { color: '#f43f5e', bg: 'rgba(244,63,94,0.12)',   icon: '❌' },
  onboarded:            { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  icon: '🎉' },
}

const DEFAULT_STAGE = { color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', icon: '📌' }

function getStageCfg(rawStage: string) {
  return STAGE_CONFIG[rawStage] ?? DEFAULT_STAGE
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function maskMobile(mobile: string) {
  if (mobile.length < 4) return mobile
  return mobile.slice(0, 2) + '••••••' + mobile.slice(-2)
}

// ─── Sub-components ────────────────────────────────────────────────────────
function WorkflowTimeline({ events }: { events: WorkflowEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="status-timeline-empty">No workflow history available yet.</p>
    )
  }

  return (
    <ol className="status-timeline">
      {events.map((event, idx) => {
        const cfg = getStageCfg(event.raw_stage)
        const isLast = idx === events.length - 1
        return (
          <li key={idx} className={`status-timeline__item ${isLast ? 'status-timeline__item--current' : ''}`}>
            <div
              className="status-timeline__dot"
              style={{ background: cfg.bg, borderColor: cfg.color, color: cfg.color }}
            >
              {cfg.icon}
            </div>
            <div className="status-timeline__content">
              <p
                className="status-timeline__stage"
                style={{ color: cfg.color }}
              >
                {event.stage}
              </p>
              <p className="status-timeline__date">{formatDate(event.at)}</p>
              {event.remarks && (
                <p className="status-timeline__remarks">{event.remarks}</p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function ApplicationCard({ app }: { app: ApplicationStatusEntry }) {
  const [expanded, setExpanded] = useState(true)
  const latestStage = app.workflow_history[app.workflow_history.length - 1]
  const cfg = getStageCfg(app.status)

  return (
    <div className="status-app-card">
      <button
        type="button"
        className="status-app-card__header"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
      >
        <div className="status-app-card__meta">
          <span
            className="status-app-card__status-pill"
            style={{ color: cfg.color, background: cfg.bg, borderColor: `${cfg.color}33` }}
          >
            {cfg.icon} {app.friendly_status}
          </span>
          {app.is_duplicate && (
            <span className="status-app-card__dup-badge">Duplicate</span>
          )}
        </div>
        <div className="status-app-card__info">
          <h3 className="status-app-card__campaign">
            {app.opportunity_title || app.campaign_name}
          </h3>
          <p className="status-app-card__submitted">
            Applied: {formatDate(app.submitted_at)}
          </p>
          {latestStage && (
            <p className="status-app-card__latest">
              Latest: {latestStage.stage} · {formatDate(latestStage.at)}
            </p>
          )}
        </div>
        <span className="status-app-card__chevron">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="status-app-card__body">
          <div className="status-app-card__ref">
            <span>Application ID</span>
            <code>{app.application_id}</code>
          </div>
          <div className="status-app-card__timeline-title">Application Timeline</div>
          <WorkflowTimeline events={app.workflow_history} />
        </div>
      )}
    </div>
  )
}

// ─── Main page ──────────────────────────────────────────────────────────────
export function ApplicationStatusPage() {
  const params = useParams()
  const navigate = useNavigate()

  // Pre-fill from URL if provided
  const [mobile, setMobile] = useState(params.mobile ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{
    mobile: string
    profile_found: boolean
    candidate_name?: string
    applications: ApplicationStatusEntry[]
    message?: string
  } | null>(null)

  const handleCheck = async (e: React.FormEvent) => {
    e.preventDefault()
    const normalized = mobile.trim().replace(/[\s\-()]/g, '')
    if (!/^[6-9][0-9]{9}$/.test(normalized)) {
      setError('Please enter a valid 10-digit Indian mobile number starting with 6-9.')
      return
    }

    setError('')
    setLoading(true)
    setResult(null)

    try {
      const data = await getApplicationStatus(normalized)
      setResult(data)
      // Update URL without full navigation
      navigate(`/apply/status/${normalized}`, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not fetch application status.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="status-shell">
      {/* ── Header ──────────────────────────────── */}
      <div className="status-header">
        <div className="status-header__icon">📱</div>
        <h1 className="status-header__title">Track Your Application</h1>
        <p className="status-header__subtitle">
          Enter your registered mobile number to check the status of your application(s).
        </p>
      </div>

      {/* ── Lookup form ──────────────────────────── */}
      <div className="status-lookup-card">
        <form onSubmit={handleCheck} className="status-lookup-form" noValidate>
          <label htmlFor="status-mobile-input" className="status-lookup-label">
            Mobile Number
          </label>
          <div className="status-lookup-input-row">
            <div className="status-lookup-prefix">+91</div>
            <input
              id="status-mobile-input"
              type="tel"
              inputMode="numeric"
              maxLength={10}
              className={`status-lookup-input ${error ? 'status-lookup-input--error' : ''}`}
              placeholder="9876543210"
              value={mobile}
              onChange={(e) => {
                setMobile(e.target.value)
                setError('')
              }}
              aria-describedby={error ? 'mobile-error' : undefined}
              aria-invalid={!!error}
            />
          </div>
          {error && (
            <p id="mobile-error" className="status-lookup-error" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            className={`status-lookup-btn ${loading ? 'status-lookup-btn--loading' : ''}`}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="apply-submit-btn__spinner" aria-hidden />
                Checking…
              </>
            ) : (
              'Check Status →'
            )}
          </button>
        </form>
      </div>

      {/* ── Results ──────────────────────────────── */}
      {result && (
        <div className="status-results">
          {result.profile_found ? (
            <>
              <div className="status-results__greeting">
                <span className="status-results__greeting-icon">👋</span>
                <div>
                  <p className="status-results__name">
                    {result.candidate_name
                      ? `Hello, ${result.candidate_name}!`
                      : 'Profile found!'}
                  </p>
                  <p className="status-results__mobile">
                    Showing results for {maskMobile(result.mobile)}
                  </p>
                </div>
              </div>

              {result.applications.length === 0 ? (
                <div className="status-no-apps">
                  <p>No applications found for this mobile number yet.</p>
                </div>
              ) : (
                <div className="status-app-list">
                  <p className="status-app-list__count">
                    {result.applications.length} application{result.applications.length !== 1 ? 's' : ''} found
                  </p>
                  {result.applications.map((app) => (
                    <ApplicationCard key={app.application_id} app={app} />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="status-not-found">
              <div className="status-not-found__icon">🔍</div>
              <h2>No Record Found</h2>
              <p>
                We couldn't find any applications linked to this mobile number.
                If you applied recently, it may take a few minutes to appear.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Footer ──────────────────────────────── */}
      <div className="status-footer">
        <p>Looking to apply? <a href="/apply" className="status-footer__link">Browse opportunities</a></p>
      </div>
    </div>
  )
}
