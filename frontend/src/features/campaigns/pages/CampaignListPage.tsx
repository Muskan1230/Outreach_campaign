import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  campaignStatuses,
  type CampaignListItem,
  type CampaignStatus,
} from '../../../../../shared/campaign'
import { listCampaigns, getCampaignStats, deleteCampaign } from '../services/campaignService'

function statusClass(status: CampaignStatus) {
  return `status-pill status-${status}`
}

/* ── Workflow Strip ──────────────────────────────────────────── */

type WsState = 'not-started' | 'in-progress' | 'done'

function wsLabel(base: string, state: WsState) {
  if (base === 'Go Live') {
    if (state === 'done') return '🟢 Live'
    if (state === 'in-progress') return '🟡 Pending'
    return '⚪ Go Live'
  }
  if (state === 'done') return `✓ ${base}`
  if (state === 'in-progress') return `◑ ${base}`
  return `○ ${base}`
}

function computeGoLiveState(status: CampaignStatus): WsState {
  if (status === 'active') return 'done'
  if (status === 'pending_approval') return 'in-progress'
  return 'not-started'
}

function computeFormState(applicationFormId: string | null | undefined): WsState {
  if (!applicationFormId) return 'not-started'
  return 'in-progress'
}

const wsNodeColors: Record<WsState, { bg: string; border: string; text: string; dot: string }> = {
  done: {
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.35)',
    text: '#34d399',
    dot: '#10b981',
  },
  'in-progress': {
    bg: 'rgba(245, 158, 11, 0.10)',
    border: 'rgba(245, 158, 11, 0.32)',
    text: '#fbbf24',
    dot: '#f59e0b',
  },
  'not-started': {
    bg: 'rgba(51, 65, 85, 0.30)',
    border: 'rgba(99, 102, 241, 0.14)',
    text: '#64748b',
    dot: '#334155',
  },
}

function WorkflowNode({
  label,
  state,
  to,
  title,
}: {
  label: string
  state: WsState
  to: string
  title: string
}) {
  const colors = wsNodeColors[state]
  return (
    <Link
      to={to}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: '4px 10px',
        borderRadius: '20px',
        fontSize: '0.76rem',
        fontWeight: '600',
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        color: colors.text,
        textDecoration: 'none',
        transition: 'all 0.18s ease',
        whiteSpace: 'nowrap',
      }}
    >
      {wsLabel(label, state)}
    </Link>
  )
}

function WorkflowStrip({ item }: { item: CampaignListItem }) {
  const goLiveState = computeGoLiveState(item.status)
  const formState = computeFormState(item.application_form_id)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        flexWrap: 'wrap',
      }}
    >
      <WorkflowNode
        label="Outreach"
        state="not-started"
        to={`/campaigns/${item.id}/outreach`}
        title="Configure outreach templates"
      />
      <span style={{ color: '#334155', fontSize: '0.6rem' }}>›</span>
      <WorkflowNode
        label="Form"
        state={formState}
        to={`/campaigns/${item.id}/form`}
        title="Set up and publish application form"
      />
      <span style={{ color: '#334155', fontSize: '0.6rem' }}>›</span>
      <WorkflowNode
        label="Go Live"
        state={goLiveState}
        to={`/campaigns/${item.id}/distribute`}
        title="Distribute campaign and go live"
      />
      <Link
        to={`/campaigns/${item.id}/analytics`}
        title="View campaign analytics"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          padding: '4px 10px',
          borderRadius: '20px',
          fontSize: '0.76rem',
          fontWeight: '600',
          background: 'rgba(99, 102, 241, 0.10)',
          border: '1px solid rgba(99, 102, 241, 0.25)',
          color: '#a5b4fc',
          textDecoration: 'none',
          transition: 'all 0.18s ease',
          marginLeft: '2px',
        }}
      >
        📊 Analytics
      </Link>
    </div>
  )
}

/* ── Stat Card ───────────────────────────────────────────────── */

function StatCard({
  label,
  value,
  icon,
  accentColor,
  textColor,
}: {
  label: string
  value: number
  icon: string
  accentColor: string
  textColor: string
}) {
  return (
    <div
      style={{
        background: 'rgba(15, 23, 42, 0.60)',
        border: `1px solid ${accentColor.replace('1)', '0.15)')}`,
        borderRadius: '16px',
        padding: '24px 28px',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'relative',
        overflow: 'hidden',
        transition: 'all 0.28s cubic-bezier(0.4,0,0.2,1)',
        cursor: 'default',
        backdropFilter: 'blur(8px)',
      }}
      className="stat-card-hover"
    >
      {/* Bottom accent bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '2px',
          background: `linear-gradient(90deg, ${accentColor}, transparent)`,
          opacity: 0.6,
        }}
      />
      {/* Left glow */}
      <div
        style={{
          position: 'absolute',
          left: '-20px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          background: accentColor.replace('1)', '0.08)'),
          filter: 'blur(16px)',
          pointerEvents: 'none',
        }}
      />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <span
          style={{
            fontSize: '0.68rem',
            fontWeight: '700',
            color: textColor,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            display: 'block',
            marginBottom: '8px',
          }}
        >
          {label}
        </span>
        <strong
          style={{
            display: 'block',
            fontSize: '2.2rem',
            fontWeight: '800',
            color: textColor === '#94a3b8' ? '#f8fafc' : textColor,
            lineHeight: 1,
            letterSpacing: '-0.03em',
          }}
        >
          {value}
        </strong>
      </div>
      <span
        style={{
          fontSize: '2rem',
          opacity: 0.75,
          position: 'relative',
          zIndex: 1,
          filter: 'drop-shadow(0 0 8px ' + accentColor.replace('1)', '0.4)') + ')',
        }}
      >
        {icon}
      </span>
    </div>
  )
}

/* ── Main Page ───────────────────────────────────────────────── */

export function CampaignListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const [items, setItems] = useState<CampaignListItem[]>([])
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [stats, setStats] = useState({
    total: 0,
    draft: 0,
    active: 0,
    paused: 0,
    archived: 0,
  })
  const [refreshKey, setRefreshKey] = useState(0)

  const page = Math.max(1, Number(searchParams.get('page') || '1') || 1)
  const search = searchParams.get('search') || ''
  const status = searchParams.get('status') || ''

  useEffect(() => {
    let active = true

    async function run() {
      setLoading(true)
      setError('')

      try {
        const [response, statsResponse] = await Promise.all([
          listCampaigns({
            page,
            limit: 8,
            search,
            status,
          }),
          getCampaignStats(),
        ])

        if (!active) return

        setItems(response.data)
        setTotalPages(response.pagination.totalPages)
        setStats(statsResponse)
      } catch (requestError) {
        if (!active) return
        setError(requestError instanceof Error ? requestError.message : 'Failed to load campaigns')
      } finally {
        if (active) setLoading(false)
      }
    }

    run()

    return () => {
      active = false
    }
  }, [page, search, status, refreshKey])

  const handleDelete = async (id: string, name: string) => {
    if (
      !window.confirm(
        `Are you sure you want to delete the campaign "${name}"? This action cannot be undone and will also delete all associated outreach templates.`,
      )
    ) {
      return
    }

    try {
      await deleteCampaign(id)
      setRefreshKey((prev) => prev + 1)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete campaign')
    }
  }

  const updateQuery = (changes: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(searchParams)

    Object.entries(changes).forEach(([key, value]) => {
      if (value === undefined || value === '') {
        next.delete(key)
      } else {
        next.set(key, String(value))
      }
    })

    if (!next.get('page')) next.set('page', '1')
    setSearchParams(next)
  }

  const rangeLabel = useMemo(() => {
    if (!items.length) return 'No campaigns yet'
    return `Showing ${items.length} campaign${items.length === 1 ? '' : 's'}`
  }, [items.length])

  return (
    <div className="page-shell">
      {/* ── Hero Card ── */}
      <section
        className="hero-card"
        style={{
          padding: '44px 48px',
          borderRadius: '24px',
          marginBottom: '28px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative orb */}
        <div
          style={{
            position: 'absolute',
            right: '120px',
            top: '-40px',
            width: '280px',
            height: '280px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(99,102,241,0.14) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <span
            className="eyebrow"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              fontSize: '0.72rem',
              fontWeight: '700',
              textTransform: 'uppercase',
              color: '#818cf8',
              letterSpacing: '0.12em',
              marginBottom: '12px',
            }}
          >
            🚀 Gig Worker Sourcing &amp; Outreach
          </span>
          <h1
            style={{
              fontSize: 'clamp(1.6rem, 3vw, 2.4rem)',
              fontWeight: '800',
              color: '#f8fafc',
              margin: '0 0 14px',
              lineHeight: 1.15,
              letterSpacing: '-0.025em',
            }}
          >
            Manage Sourcing Campaigns
          </h1>
          <p
            style={{
              color: '#94a3b8',
              fontSize: '0.94rem',
              lineHeight: 1.65,
              maxWidth: '62ch',
              margin: 0,
            }}
          >
            Create, monitor, and coordinate worker campaigns. Define candidate parameters,
            configure messaging templates, set up forms, and track applicant conversions.
          </p>
        </div>
        <Link
          className="primary-button"
          to="/campaigns/new"
          style={{
            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
            color: '#fff',
            borderRadius: '10px',
            fontWeight: '700',
            fontSize: '0.88rem',
            padding: '13px 24px',
            textDecoration: 'none',
            boxShadow: '0 4px 18px rgba(99,102,241,0.38)',
            transition: 'all 0.2s ease',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            letterSpacing: '0.01em',
            position: 'relative',
            zIndex: 1,
          }}
        >
          + Create Campaign
        </Link>
      </section>

      {/* ── Stats Grid ── */}
      <section style={{ marginBottom: '28px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
          }}
        >
          <StatCard
            label="Total Campaigns"
            value={stats.total}
            icon="📊"
            accentColor="rgba(99, 102, 241, 1)"
            textColor="#94a3b8"
          />
          <StatCard
            label="Drafts"
            value={stats.draft}
            icon="📝"
            accentColor="rgba(245, 158, 11, 1)"
            textColor="#fbbf24"
          />
          <StatCard
            label="Active Campaigns"
            value={stats.active}
            icon="⚡"
            accentColor="rgba(16, 185, 129, 1)"
            textColor="#34d399"
          />
          <StatCard
            label="Archived"
            value={stats.archived}
            icon="📁"
            accentColor="rgba(244, 63, 94, 1)"
            textColor="#fb7185"
          />
        </div>
      </section>

      {/* ── Main Panel ── */}
      <section
        className="panel"
        style={{
          padding: '32px',
          borderRadius: '20px',
        }}
      >
        {/* Filter Toolbar */}
        <div
          style={{
            display: 'flex',
            gap: '16px',
            alignItems: 'flex-end',
            padding: '20px 24px',
            background: 'rgba(15, 23, 42, 0.40)',
            borderRadius: '14px',
            border: '1px solid rgba(99, 102, 241, 0.10)',
            marginBottom: '28px',
          }}
        >
          <div style={{ flexGrow: 1 }}>
            <span
              style={{
                fontSize: '0.76rem',
                fontWeight: '700',
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.09em',
                display: 'block',
                marginBottom: '8px',
              }}
            >
              Search by campaign name
            </span>
            <div style={{ position: 'relative' }}>
              <span
                style={{
                  position: 'absolute',
                  left: '13px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#475569',
                  fontSize: '0.9rem',
                  pointerEvents: 'none',
                }}
              >
                🔍
              </span>
              <input
                value={search}
                onChange={(event) => updateQuery({ search: event.target.value, page: 1 })}
                placeholder="Search campaigns..."
                style={{
                  paddingLeft: '38px',
                  paddingRight: '16px',
                  width: '100%',
                  height: '42px',
                  borderRadius: '10px',
                  border: '1px solid rgba(99, 102, 241, 0.20)',
                  background: 'rgba(8, 14, 30, 0.55)',
                  color: '#f1f5f9',
                  fontSize: '0.88rem',
                  outline: 'none',
                  transition: 'border-color 0.18s ease, box-shadow 0.18s ease',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'rgba(129,140,248,0.55)'
                  e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(99,102,241,0.20)'
                  e.target.style.boxShadow = 'none'
                }}
              />
            </div>
          </div>

          <div style={{ minWidth: '210px' }}>
            <span
              style={{
                fontSize: '0.76rem',
                fontWeight: '700',
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.09em',
                display: 'block',
                marginBottom: '8px',
              }}
            >
              Status
            </span>
            <select
              value={status}
              onChange={(event) => updateQuery({ status: event.target.value, page: 1 })}
              style={{
                width: '100%',
                height: '42px',
                borderRadius: '10px',
                border: '1px solid rgba(99, 102, 241, 0.20)',
                background: 'rgba(8, 14, 30, 0.55)',
                color: '#f1f5f9',
                padding: '0 14px',
                fontSize: '0.88rem',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="">All statuses</option>
              {campaignStatuses.map((item) => (
                <option value={item} key={item}>
                  {item.charAt(0).toUpperCase() + item.slice(1).replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table Header */}
        <div
          style={{
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h2
              style={{
                fontSize: '1.1rem',
                fontWeight: '700',
                color: '#f8fafc',
                margin: 0,
                letterSpacing: '-0.015em',
              }}
            >
              Campaign List
            </h2>
            <p style={{ fontSize: '0.8rem', color: '#475569', marginTop: '4px', marginBottom: 0 }}>
              {rangeLabel}
            </p>
          </div>
        </div>

        {error ? <div className="alert error">{error}</div> : null}
        {loading ? (
          <div
            style={{
              textAlign: 'center',
              padding: '60px 0',
              color: '#475569',
              fontSize: '0.9rem',
            }}
          >
            <div style={{ fontSize: '2rem', marginBottom: '12px', opacity: 0.5 }}>⟳</div>
            Loading campaigns...
          </div>
        ) : null}
        {!loading && !items.length ? (
          <div
            style={{
              textAlign: 'center',
              padding: '60px 0',
              color: '#475569',
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '14px', opacity: 0.4 }}>📋</div>
            <p style={{ fontWeight: '600', color: '#64748b', fontSize: '0.95rem' }}>
              No campaigns matched your filters.
            </p>
            <p style={{ fontSize: '0.82rem', color: '#475569', marginTop: '6px' }}>
              Try adjusting the search or status filter, or create a new campaign.
            </p>
          </div>
        ) : null}

        {!loading && items.length ? (
          <>
            <div
              style={{
                border: '1px solid rgba(99, 102, 241, 0.12)',
                borderRadius: '14px',
                overflow: 'hidden',
              }}
            >
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr
                    style={{
                      background:
                        'linear-gradient(90deg, rgba(99,102,241,0.07) 0%, rgba(99,102,241,0.04) 100%)',
                      borderBottom: '1px solid rgba(99,102,241,0.14)',
                    }}
                  >
                    {[
                      'Campaign Name',
                      'Opportunity Title',
                      'Status',
                      'Worker Type',
                      'Target Region',
                      'Timeline Dates',
                      'Workflow Progress',
                      '',
                    ].map((col, i) => (
                      <th
                        key={i}
                        style={{
                          padding: '14px 18px',
                          color: '#64748b',
                          fontSize: '0.71rem',
                          fontWeight: '700',
                          textTransform: 'uppercase',
                          letterSpacing: '0.09em',
                          textAlign: 'left',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom:
                          idx < items.length - 1
                            ? '1px solid rgba(99,102,241,0.07)'
                            : 'none',
                        transition: 'background 0.15s ease',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => {
                        ;(e.currentTarget as HTMLTableRowElement).style.background =
                          'rgba(99,102,241,0.04)'
                      }}
                      onMouseLeave={(e) => {
                        ;(e.currentTarget as HTMLTableRowElement).style.background = 'transparent'
                      }}
                    >
                      {/* Campaign Name */}
                      <td
                        style={{ padding: '18px 18px', verticalAlign: 'middle' }}
                        onClick={() => navigate(`/campaigns/${item.id}`)}
                      >
                        <span
                          style={{
                            fontWeight: '700',
                            color: '#e2e8f0',
                            fontSize: '0.875rem',
                            display: 'block',
                            maxWidth: '160px',
                          }}
                        >
                          {item.name}
                        </span>
                      </td>

                      {/* Opportunity Title */}
                      <td
                        style={{
                          padding: '18px 18px',
                          color: '#94a3b8',
                          fontSize: '0.85rem',
                          verticalAlign: 'middle',
                          maxWidth: '160px',
                        }}
                        onClick={() => navigate(`/campaigns/${item.id}`)}
                      >
                        {item.opportunity_title}
                      </td>

                      {/* Status */}
                      <td style={{ padding: '18px 18px', verticalAlign: 'middle' }}>
                        <span
                          className={statusClass(item.status)}
                          style={{
                            textTransform: 'capitalize',
                            fontWeight: '600',
                            padding: '4px 10px',
                            borderRadius: '20px',
                            fontSize: '0.73rem',
                            letterSpacing: '0.02em',
                          }}
                        >
                          {item.status.replace('_', ' ')}
                        </span>
                      </td>

                      {/* Worker Type */}
                      <td
                        style={{
                          padding: '18px 18px',
                          color: '#94a3b8',
                          fontSize: '0.85rem',
                          verticalAlign: 'middle',
                          textTransform: 'capitalize',
                        }}
                      >
                        {item.worker_type}
                      </td>

                      {/* Target Region */}
                      <td
                        style={{
                          padding: '18px 18px',
                          color: '#94a3b8',
                          fontSize: '0.85rem',
                          verticalAlign: 'middle',
                        }}
                      >
                        {item.target_region}
                      </td>

                      {/* Timeline Dates */}
                      <td style={{ padding: '18px 18px', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span
                            style={{
                              fontSize: '0.75rem',
                              color: '#64748b',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '5px',
                            }}
                          >
                            <span style={{ opacity: 0.6 }}>▶</span>
                            <span style={{ color: '#94a3b8' }}>{item.start_date}</span>
                          </span>
                          <span
                            style={{
                              fontSize: '0.75rem',
                              color: '#64748b',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '5px',
                            }}
                          >
                            <span style={{ opacity: 0.6 }}>■</span>
                            <span style={{ color: '#94a3b8' }}>{item.end_date}</span>
                          </span>
                        </div>
                      </td>

                      {/* Workflow Progress */}
                      <td style={{ padding: '18px 18px', verticalAlign: 'middle' }}>
                        <WorkflowStrip item={item} />
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '18px 18px', textAlign: 'right', verticalAlign: 'middle' }}>
                        <div
                          style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}
                        >
                          <Link
                            className="table-link"
                            to={`/campaigns/${item.id}`}
                            style={{
                              padding: '6px 14px',
                              background: 'rgba(99,102,241,0.10)',
                              border: '1px solid rgba(99,102,241,0.25)',
                              color: '#a5b4fc',
                              borderRadius: '8px',
                              fontWeight: '600',
                              fontSize: '0.8rem',
                              textDecoration: 'none',
                              transition: 'all 0.18s ease',
                              whiteSpace: 'nowrap',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'rgba(99,102,241,0.20)'
                              e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)'
                              e.currentTarget.style.transform = 'translateY(-1px)'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'rgba(99,102,241,0.10)'
                              e.currentTarget.style.borderColor = 'rgba(99,102,241,0.25)'
                              e.currentTarget.style.transform = 'translateY(0)'
                            }}
                          >
                            ✏️ Edit
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDelete(item.id, item.name)}
                            style={{
                              padding: '6px 14px',
                              background: 'rgba(244,63,94,0.08)',
                              border: '1px solid rgba(244,63,94,0.20)',
                              color: '#fb7185',
                              borderRadius: '8px',
                              fontWeight: '600',
                              fontSize: '0.8rem',
                              cursor: 'pointer',
                              transition: 'all 0.18s ease',
                              whiteSpace: 'nowrap',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'rgba(244,63,94,0.16)'
                              e.currentTarget.style.borderColor = 'rgba(244,63,94,0.36)'
                              e.currentTarget.style.transform = 'translateY(-1px)'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'rgba(244,63,94,0.08)'
                              e.currentTarget.style.borderColor = 'rgba(244,63,94,0.20)'
                              e.currentTarget.style.transform = 'translateY(0)'
                            }}
                          >
                            🗑 Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '16px',
                marginTop: '28px',
              }}
            >
              <button
                className="ghost-button"
                type="button"
                disabled={page <= 1}
                onClick={() => updateQuery({ page: page - 1 })}
                style={{
                  padding: '8px 20px',
                  borderRadius: '8px',
                  opacity: page <= 1 ? 0.38 : 1,
                }}
              >
                ← Previous
              </button>
              <span
                style={{
                  fontSize: '0.85rem',
                  color: '#64748b',
                  fontWeight: '500',
                  padding: '6px 14px',
                  background: 'rgba(99,102,241,0.07)',
                  borderRadius: '8px',
                  border: '1px solid rgba(99,102,241,0.12)',
                }}
              >
                Page {page} of {Math.max(1, totalPages)}
              </span>
              <button
                className="ghost-button"
                type="button"
                disabled={page >= totalPages}
                onClick={() => updateQuery({ page: page + 1 })}
                style={{
                  padding: '8px 20px',
                  borderRadius: '8px',
                  opacity: page >= totalPages ? 0.38 : 1,
                }}
              >
                Next →
              </button>
            </div>
          </>
        ) : null}
      </section>
    </div>
  )
}
