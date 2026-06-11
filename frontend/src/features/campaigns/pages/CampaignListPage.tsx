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

function wsClass(state: WsState) {
  if (state === 'done') return 'ws-pill ws-pill--green'
  if (state === 'in-progress') return 'ws-pill ws-pill--amber'
  return 'ws-pill ws-pill--grey'
}

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

function WorkflowStrip({ item }: { item: CampaignListItem }) {
  const goLiveState = computeGoLiveState(item.status)
  const formState = computeFormState(item.application_form_id)

  return (
    <div className="ws-strip">
      <Link
        className={wsClass('not-started')}
        to={`/campaigns/${item.id}/outreach`}
        title="Configure outreach templates"
      >
        {wsLabel('Outreach', 'not-started')}
      </Link>

      <Link
        className={wsClass(formState)}
        to={`/campaigns/${item.id}/form`}
        title="Set up and publish application form"
      >
        {wsLabel('Form', formState)}
      </Link>

      <Link
        className={wsClass(goLiveState)}
        to={`/campaigns/${item.id}/distribute`}
        title="Distribute campaign and go live"
      >
        {wsLabel('Go Live', goLiveState)}
      </Link>
    </div>
  )
}

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
      <section className="hero-card">
        <div>
          <span className="eyebrow">🚀 Gig Worker Outreach Platform</span>
          <h1>Manage campaigns with a clear, operational view.</h1>
          <p className="hero-copy">
            Search, filter, and launch outreach campaigns. Each campaign flows through
            three stages: setup → outreach templates → application form.
          </p>
        </div>
        <Link className="primary-button" to="/campaigns/new">
          + Create Campaign
        </Link>
      </section>

      <section className="panel stats-panel">
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-label">Total campaigns</span>
            <strong>{stats.total}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Drafts</span>
            <strong>{stats.draft}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Active campaigns</span>
            <strong>{stats.active}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Archived</span>
            <strong>{stats.archived}</strong>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="toolbar">
          <label className="field search-field">
            <span>Search by campaign name</span>
            <input
              value={search}
              onChange={(event) => updateQuery({ search: event.target.value, page: 1 })}
              placeholder="Search campaigns..."
            />
          </label>

          <label className="field">
            <span>Status</span>
            <select value={status} onChange={(event) => updateQuery({ status: event.target.value, page: 1 })}>
              <option value="">All statuses</option>
              {campaignStatuses.map((item) => (
                <option value={item} key={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="panel-header">
          <div>
            <h2>Campaign List</h2>
            <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 2 }}>{rangeLabel}</p>
          </div>
        </div>

        {error ? <div className="alert error">{error}</div> : null}
        {loading ? <div className="empty-state">Loading campaigns...</div> : null}
        {!loading && !items.length ? <div className="empty-state">No campaigns matched your filters.</div> : null}

        {!loading && items.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Campaign Name</th>
                    <th>Opportunity Title</th>
                    <th>Status</th>
                    <th>Worker Type</th>
                    <th>Target Region</th>
                    <th>Start Date</th>
                    <th>End Date</th>
                    <th>Workflow Progress</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.opportunity_title}</td>
                      <td>
                        <span className={statusClass(item.status)}>{item.status}</span>
                      </td>
                      <td>{item.worker_type}</td>
                      <td>{item.target_region}</td>
                      <td>{item.start_date}</td>
                      <td>{item.end_date}</td>
                      <td>
                        <WorkflowStrip item={item} />
                      </td>
                      <td>
                        <div className="table-actions">
                          <Link className="table-link" to={`/campaigns/${item.id}`}>
                            Edit
                          </Link>
                          <button
                            type="button"
                            className="table-link-danger"
                            onClick={() => handleDelete(item.id, item.name)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pagination">
              <button
                className="ghost-button"
                type="button"
                disabled={page <= 1}
                onClick={() => updateQuery({ page: page - 1 })}
              >
                Previous
              </button>
              <span>
                Page {page} of {Math.max(1, totalPages)}
              </span>
              <button
                className="ghost-button"
                type="button"
                disabled={page >= totalPages}
                onClick={() => updateQuery({ page: page + 1 })}
              >
                Next
              </button>
            </div>
          </>
        ) : null}
      </section>
    </div>
  )
}
