import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { CampaignRecord } from '../../../../../shared/campaign'
import { getCampaign } from '../../campaigns/services/campaignService'
import { getForm } from '../../forms/services/formService'
import {
  listApplicants,
  updateApplicationStatus,
  type ApplicantQueueRow,
  type ApplicationStatus,
} from '../services/applicantService'

const STATUS_CONFIG: Record<
  ApplicationStatus,
  { label: string; color: string; bg: string; next: ApplicationStatus[] }
> = {
  new: {
    label: 'New',
    color: '#60a5fa',
    bg: 'rgba(96,165,250,0.12)',
    next: ['shortlisted', 'rejected'],
  },
  shortlisted: {
    label: 'Shortlisted',
    color: '#34d399',
    bg: 'rgba(52,211,153,0.12)',
    next: ['offered', 'rejected'],
  },
  offered: {
    label: 'Offered',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.12)',
    next: ['hired', 'rejected'],
  },
  hired: {
    label: 'Hired',
    color: '#10b981',
    bg: 'rgba(16,185,129,0.12)',
    next: [],
  },
  rejected: {
    label: 'Rejected',
    color: '#f43f5e',
    bg: 'rgba(244,63,94,0.12)',
    next: ['shortlisted'],
  },
}

const STATUS_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All Applicants' },
  { value: 'new', label: 'New' },
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'offered', label: 'Offered' },
  { value: 'hired', label: 'Hired' },
  { value: 'rejected', label: 'Rejected' },
]

const SOURCE_CHANNEL_OPTIONS: Array<{ value: string; label: string; emoji: string }> = [
  { value: 'whatsapp', label: 'WhatsApp', emoji: '💬' },
  { value: 'linkedin', label: 'LinkedIn', emoji: '💼' },
  { value: 'facebook', label: 'Facebook', emoji: '👥' },
  { value: 'instagram', label: 'Instagram', emoji: '📸' },
  { value: 'job_portal', label: 'Job Portal', emoji: '🗂️' },
]

function StatusPill({ status }: { status: ApplicationStatus }) {
  const cfg = STATUS_CONFIG[status] ?? {
    label: status,
    color: '#94a3b8',
    bg: 'rgba(148,163,184,0.12)',
  }

  return (
    <span
      className="applicant-status-pill"
      style={{
        color: cfg.color,
        background: cfg.bg,
        borderColor: `${cfg.color}26`,
      }}
    >
      {cfg.label}
    </span>
  )
}

function CompactBadge({
  label,
  tone = 'neutral',
}: {
  label: string
  tone?: 'neutral' | 'active' | 'warning' | 'danger'
}) {
  return <span className={`applicant-compact-badge applicant-compact-badge--${tone}`}>{label}</span>
}

function SectionTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description?: string
}) {
  return (
    <div className="applicant-section-title">
      <span className="eyebrow">{eyebrow}</span>
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
    </div>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function isIdentityFieldLabel(label: string) {
  return [
    'full name',
    'mobile',
    'phone',
    'email',
    'location',
    'category',
    'skills',
    'experience',
    'availability',
  ].some((term) => label.toLowerCase().includes(term))
}

type FormFieldMeta = { label: string; field_type: string }

function getSubmissionName(
  applicant: ApplicantQueueRow,
  formFieldOrder: Array<{ id: string } & FormFieldMeta>,
) {
  const responses = applicant.raw_responses ?? {}

  for (const field of formFieldOrder) {
    const rawValue = responses[field.id]
    const value =
      typeof rawValue === 'string'
        ? rawValue.trim()
        : Array.isArray(rawValue)
          ? rawValue.join(', ').trim()
          : ''

    if (!value) continue

    if (field.label.toLowerCase().includes('full name')) {
      return value
    }

    if (isIdentityFieldLabel(field.label) && field.field_type !== 'File Upload') {
      return value
    }
  }

  return applicant.candidate_name || 'Unknown'
}

function getSubmissionSnapshotValue(
  applicant: ApplicantQueueRow,
  formFieldOrder: Array<{ id: string } & FormFieldMeta>,
  matchers: string[],
) {
  const responses = applicant.raw_responses ?? {}

  for (const field of formFieldOrder) {
    const label = field.label.toLowerCase()
    if (!matchers.some((term) => label.includes(term))) continue

    const rawValue = responses[field.id]
    const value =
      typeof rawValue === 'string'
        ? rawValue.trim()
        : Array.isArray(rawValue)
          ? rawValue.join(', ').trim()
          : ''

    if (value) return value
  }

  return null
}

export function CampaignApplicantsPage() {
  const params = useParams()
  const campaignId = params.id
  const navigate = useNavigate()

  const [campaign, setCampaign] = useState<CampaignRecord | null>(null)
  const [applicants, setApplicants] = useState<ApplicantQueueRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sourceChannelFilter, setSourceChannelFilter] = useState('')

  const [selected, setSelected] = useState<ApplicantQueueRow | null>(null)
  const [formFields, setFormFields] = useState<Record<string, FormFieldMeta>>({})
  const [formFieldOrder, setFormFieldOrder] = useState<Array<{ id: string } & FormFieldMeta>>([])

  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [updateError, setUpdateError] = useState('')

  const loadApplicants = useCallback(
    async (searchVal = search, statusVal = statusFilter, channelVal = sourceChannelFilter) => {
      if (!campaignId) return

      try {
        const result = await listApplicants(campaignId, {
          search: searchVal || undefined,
          status: statusVal || undefined,
          sourceChannel: channelVal || undefined,
        })

        setApplicants(result.data)
        setTotal(result.pagination.total)

        const selectedId = selected?.application_id
        if (selectedId) {
          const refreshed = result.data.find((item) => item.application_id === selectedId)
          if (refreshed) setSelected(refreshed)
        }
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : 'Failed to load applicants')
      }
    },
    [campaignId, search, selected, statusFilter, sourceChannelFilter],
  )

  useEffect(() => {
    let active = true

    async function load() {
      if (!campaignId) {
        setError('Missing campaign identifier')
        setLoading(false)
        return
      }

      try {
        const [camp, result] = await Promise.all([getCampaign(campaignId), listApplicants(campaignId)])
        if (!active) return

        setCampaign(camp)
        setApplicants(result.data)
        setTotal(result.pagination.total)
      } catch (requestError) {
        if (!active) return
        setError(requestError instanceof Error ? requestError.message : 'Unable to load applicants')
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [campaignId])

  useEffect(() => {
    const formId = campaign?.application_form_id ?? selected?.form_id
    if (!formId) return

    let active = true

    async function loadFormFields() {
      try {
        const formData = await getForm(formId as string)
        if (!active) return

        const mapping: Record<string, { label: string; field_type: string }> = {}
        const orderedFields: Array<{ id: string } & FormFieldMeta> = []
        formData.fields.forEach((field) => {
          const meta = { label: field.label, field_type: field.field_type }
          mapping[field.id] = meta
          orderedFields.push({ id: field.id, ...meta })
        })
        setFormFields(mapping)
        setFormFieldOrder(orderedFields)
      } catch (requestError) {
        console.error('Failed to load form fields for label mapping:', requestError)
      }
    }

    void loadFormFields()

    return () => {
      active = false
    }
  }, [campaign?.application_form_id, selected?.form_id])

  const handleSearch = (event: FormEvent) => {
    event.preventDefault()
    void loadApplicants(search, statusFilter, sourceChannelFilter)
  }

  const handleStatusFilter = (value: string) => {
    setStatusFilter(value)
    void loadApplicants(search, value, sourceChannelFilter)
  }

  const handleSourceChannelFilter = (value: string) => {
    const newVal = sourceChannelFilter === value ? '' : value
    setSourceChannelFilter(newVal)
    void loadApplicants(search, statusFilter, newVal)
  }

  const handleStatusAction = async (appId: string, newStatus: ApplicationStatus) => {
    if (!campaignId) return

    setUpdatingId(appId)
    setUpdateError('')

    try {
      await updateApplicationStatus(campaignId, appId, newStatus)
      await loadApplicants()
    } catch (requestError) {
      setUpdateError(requestError instanceof Error ? requestError.message : 'Failed to update status')
    } finally {
      setUpdatingId(null)
    }
  }

  const activeFilters = useMemo(
    () =>
      [
        search ? `Search: ${search}` : null,
        statusFilter ? `Status: ${STATUS_FILTER_OPTIONS.find((o) => o.value === statusFilter)?.label ?? statusFilter}` : null,
        sourceChannelFilter ? `Channel: ${SOURCE_CHANNEL_OPTIONS.find(o => o.value === sourceChannelFilter)?.label ?? sourceChannelFilter}` : null,
      ].filter(Boolean) as string[],
    [search, statusFilter, sourceChannelFilter],
  )

  const selectedStatus = selected ? STATUS_CONFIG[selected.status] : null
  const nextActions = selected ? STATUS_CONFIG[selected.status]?.next ?? [] : []
  const isLive = campaign?.status === 'active'
  const selectedSubmissionName = selected ? getSubmissionName(selected, formFieldOrder) : null

  const selectedProfileFields = useMemo(
    () =>
      selected
        ? [
            {
              label: 'Mobile',
              value:
                getSubmissionSnapshotValue(selected, formFieldOrder, ['mobile', 'phone']) ||
                selected.candidate_mobile,
            },
            {
              label: 'Email',
              value:
                getSubmissionSnapshotValue(selected, formFieldOrder, ['email']) ||
                selected.candidate_email,
            },
            {
              label: 'Current Location',
              value:
                getSubmissionSnapshotValue(selected, formFieldOrder, ['current location', 'current city']) ||
                selected.candidate_location,
            },
            {
              label: 'Preferred Location',
              value:
                getSubmissionSnapshotValue(selected, formFieldOrder, ['preferred location']) ||
                selected.preferred_location,
            },
            {
              label: 'Worker Category',
              value:
                getSubmissionSnapshotValue(selected, formFieldOrder, ['worker category', 'category', 'worker type']) ||
                selected.worker_category,
            },
            {
              label: 'Skills',
              value:
                getSubmissionSnapshotValue(selected, formFieldOrder, ['skill']) ||
                (Array.isArray(selected.skills) && selected.skills.length ? selected.skills.join(', ') : null),
            },
            {
              label: 'Experience',
              value:
                getSubmissionSnapshotValue(selected, formFieldOrder, ['experience', 'exp', 'year']) ||
                (selected.years_of_experience != null ? `${selected.years_of_experience} yrs` : null),
            },
            {
              label: 'Availability',
              value:
                getSubmissionSnapshotValue(selected, formFieldOrder, ['availability', 'shift']) ||
                selected.availability,
            },
            {
              label: 'Source Channel',
              value: selected.source_channel
                ? (SOURCE_CHANNEL_OPTIONS.find(o => o.value === selected.source_channel)?.label ?? selected.source_channel)
                : null,
            },
          ]
        : [],
    [selected, formFieldOrder],
  )

  const submissionFields = useMemo(() => {
    if (!selected) return []

    return Object.entries(selected.raw_responses ?? {})
      .map(([fieldId, value]) => {
        if (value === undefined || value === null || value === '') return null
        if (typeof value === 'boolean' && value === true) return null

        const fieldInfo = formFields[fieldId]
        const label = fieldInfo?.label || 'Other Field'
        if (isIdentityFieldLabel(label)) return null

        return {
          fieldId,
          label,
          value,
          isFile: fieldInfo?.field_type === 'File Upload',
        }
      })
      .filter(Boolean) as Array<{
      fieldId: string
      label: string
      value: unknown
      isFile: boolean
    }>
  }, [formFields, selected])

  const documentFields = submissionFields.filter((field) => field.isFile)
  const extraSubmissionFields = submissionFields.filter((field) => !field.isFile)

  if (loading) {
    return (
      <div className="page-shell">
        <section className="panel">
          <div className="empty-state">Loading applicants...</div>
        </section>
      </div>
    )
  }

  return (
    <div className="page-shell applicants-page">
      <section className="panel applicants-topbar">
        <div className="applicants-topbar__copy">
          <div className="applicants-topbar__eyebrow-row">
            <span className="eyebrow">Applicants Tracking</span>
            {campaign ? <CompactBadge label={campaign.status} tone={isLive ? 'active' : 'warning'} /> : null}
          </div>
          <h1>{campaign?.name || 'Campaign Submissions'}</h1>
          <p>
            Review and action candidate applications for {campaign?.opportunity_title || 'this campaign'}.
          </p>
        </div>
        <div className="applicants-topbar__actions">
          <Link className="ghost-button" to={campaignId ? `/campaigns/${campaignId}` : '/campaigns'}>
            ← Back to campaign
          </Link>
        </div>
      </section>

      {error ? <div className="alert error applicants-alert">{error}</div> : null}

      {campaign && campaign.status !== 'active' ? (
        <div className="applicants-not-live-banner">
          <div className="applicants-not-live-banner__body">
            <div className="applicants-not-live-banner__icon">i</div>
            <div>
              <p className="applicants-not-live-banner__title">This campaign is not live yet.</p>
              <p className="applicants-not-live-banner__sub">
                Once you go live, applicants will start appearing here. Status:{' '}
                <span className={`status-pill status-${campaign.status}`} style={{ fontSize: '0.72rem' }}>
                  {campaign.status}
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            className="primary-button"
            onClick={() => navigate(`/campaigns/${campaignId}/distribute`)}
          >
            Go Live →
          </button>
        </div>
      ) : null}

      <section className="panel applicants-toolbar-panel" style={{ padding: '24px 28px' }}>
        <div className="applicants-toolbar" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: 0, gap: '16px' }}>
          <form className="applicants-search" onSubmit={handleSearch} style={{ display: 'flex', gap: '10px', width: '100%', maxWidth: '500px' }}>
            <input
              type="text"
              className="apply-input applicants-search__input"
              style={{
                flexGrow: 1,
                borderRadius: '8px',
                border: '1px solid rgba(99, 102, 241, 0.18)',
                background: 'rgba(8, 14, 30, 0.60)',
                color: '#f8fafc',
                padding: '10px 14px',
                fontSize: '0.88rem'
              }}
              placeholder="Search by name, mobile, email..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button type="submit" className="primary-button applicants-search__button" style={{ borderRadius: '8px', minHeight: '38px' }}>
              Search
            </button>
          </form>

          <div className="applicants-filters-row" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'end', width: '100%', marginTop: '12px' }}>
            <div className="applicants-filter-group">
              <label className="applicants-filter-label" htmlFor="status-filter">Status</label>
              <select
                id="status-filter"
                className="applicants-filter-select"
                value={statusFilter}
                onChange={(event) => handleStatusFilter(event.target.value)}
              >
                {STATUS_FILTER_OPTIONS.map((option) => (
                  <option key={option.value || 'all'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="applicants-filter-group">
              <label className="applicants-filter-label" htmlFor="source-filter">Source</label>
              <select
                id="source-filter"
                className="applicants-filter-select"
                value={sourceChannelFilter}
                onChange={(event) => handleSourceChannelFilter(event.target.value)}
              >
                <option value="">All Sources</option>
                {SOURCE_CHANNEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {(search || statusFilter || sourceChannelFilter) && (
              <button
                type="button"
                onClick={() => {
                  setSearch('')
                  setStatusFilter('')
                  setSourceChannelFilter('')
                  void loadApplicants('', '', '')
                }}
                style={{
                  background: 'rgba(244, 63, 94, 0.1)',
                  color: '#fb7185',
                  border: '1px solid rgba(244, 63, 94, 0.2)',
                  borderRadius: '20px',
                  padding: '6px 14px',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 150ms ease'
                }}
              >
                ✕ Clear All Filters
              </button>
            )}
          </div>
        </div>

        <div className="applicants-toolbar__meta" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
          <div className="applicants-toolbar__count" style={{ fontSize: '0.84rem', color: '#94a3b8', fontWeight: '500' }}>
            Found {total} applicant{total === 1 ? '' : 's'}
          </div>
          <div className="applicants-toolbar__active-filters" style={{ display: 'flex', gap: '6px' }}>
            {activeFilters.length ? (
              activeFilters.map((filter) => (
                <span key={filter} className="applicant-filter-pill" style={{
                  fontSize: '0.76rem',
                  padding: '2px 8px',
                  background: 'rgba(99, 102, 241, 0.08)',
                  color: '#818cf8',
                  borderRadius: '4px',
                  border: '1px solid rgba(99, 102, 241, 0.12)'
                }}>
                  {filter}
                </span>
              ))
            ) : (
              <span className="applicants-toolbar__hint" style={{ fontSize: '0.78rem', color: '#475569', fontStyle: 'italic' }}>No active filters</span>
            )}
          </div>
        </div>
      </section>

      {updateError ? <div className="alert error applicants-alert">{updateError}</div> : null}

      <div className="applicants-grid">
        <section className="panel applicants-table-panel" style={{ padding: '24px' }}>
          <div className="panel-header applicants-panel-header" style={{ marginBottom: '16px' }}>
            <div>
              <span className="eyebrow">Applicant Queue</span>
              <h2>Applications Received</h2>
            </div>
            <span className="fields-count-badge">
              {total} candidate{total === 1 ? '' : 's'}
            </span>
          </div>

          {!applicants.length ? (
            <div className="empty-state applicants-empty-state">
              {statusFilter || search
                ? 'No applicants match your current filters.'
                : 'No applications submitted yet for this campaign.'}
            </div>
          ) : (
            <div className="table-wrap applicants-table-wrap">
              <table className="applicants-table">
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Contact</th>
                    <th>Category</th>
                    <th>Location</th>
                    <th>Source</th>
                    <th>Status</th>
                    <th>Applied On</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {applicants.map((app) => {
                    const isSelected = selected?.application_id === app.application_id
                    const channelInfo = SOURCE_CHANNEL_OPTIONS.find((o) => o.value === app.source_channel)
                    const chColor =
                      app.source_channel === 'whatsapp'
                        ? '#25d366'
                        : app.source_channel === 'linkedin'
                          ? '#0077b5'
                          : app.source_channel === 'facebook'
                            ? '#1877f2'
                            : app.source_channel === 'instagram'
                              ? '#e1306c'
                              : '#6366f1'

                    return (
                      <tr
                        key={app.application_id}
                        data-clickable
                        onClick={() => setSelected(app)}
                        className={isSelected ? 'applicants-row applicants-row--selected' : 'applicants-row'}
                        style={{
                          background: isSelected ? 'rgba(99, 102, 241, 0.08)' : undefined,
                          transition: 'background 150ms ease'
                        }}
                      >
                        <td className="applicants-cell applicants-cell--candidate" style={{ padding: '16px' }}>
                          <div className="applicants-candidate-name-row" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="applicants-candidate-name" style={{ fontWeight: '600', color: '#f8fafc' }}>
                              {getSubmissionName(app, formFieldOrder)}
                            </span>
                            {app.is_duplicate ? <CompactBadge label="Duplicate profile" tone="danger" /> : null}
                          </div>
                          <div className="applicants-candidate-submeta" style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '2px' }}>
                            ID: {app.application_id.slice(0, 8)}…
                          </div>
                        </td>
                        <td className="applicants-cell" style={{ padding: '16px' }}>
                          <div className="applicants-contact-primary" style={{ fontWeight: '500', color: '#cbd5e1' }}>
                            {getSubmissionSnapshotValue(app, formFieldOrder, ['mobile', 'phone']) || app.candidate_mobile || '—'}
                          </div>
                          <div className="applicants-contact-secondary" style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
                            {getSubmissionSnapshotValue(app, formFieldOrder, ['email']) || app.candidate_email || '—'}
                          </div>
                        </td>
                        <td className="applicants-cell applicants-cell--muted" style={{ padding: '16px', color: '#94a3b8' }}>
                          {getSubmissionSnapshotValue(app, formFieldOrder, ['worker category', 'category', 'worker type']) || app.worker_category || '—'}
                        </td>
                        <td className="applicants-cell applicants-cell--muted" style={{ padding: '16px', color: '#94a3b8' }}>
                          {getSubmissionSnapshotValue(app, formFieldOrder, ['current location', 'current city']) || app.candidate_location || '—'}
                        </td>
                        <td className="applicants-cell applicants-cell--source" style={{ padding: '16px' }}>
                          {app.source_channel ? (
                            <span className="applicants-source-pill" style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              fontSize: '0.78rem',
                              fontWeight: '600',
                              background: `${chColor}15`,
                              color: chColor,
                              border: `1px solid ${chColor}25`
                            }}>
                              <span>{channelInfo?.emoji}</span>
                              {channelInfo?.label ?? app.source_channel}
                            </span>
                          ) : (
                            <span className="applicants-cell--muted">—</span>
                          )}
                        </td>
                        <td className="applicants-cell" style={{ padding: '16px' }}>
                          <StatusPill status={app.status} />
                        </td>
                        <td className="applicants-cell applicants-cell--meta" style={{ padding: '16px', color: '#94a3b8', fontSize: '0.78rem' }}>
                          {formatDate(app.applied_at)}
                        </td>
                        <td className="applicants-cell applicants-cell--actions" style={{ padding: '16px', textAlign: 'right' }}>
                          <button
                            type="button"
                            className="ghost-button"
                            style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/campaigns/${campaignId}/applicants/${app.application_id}`)
                            }}
                          >
                            Details →
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
