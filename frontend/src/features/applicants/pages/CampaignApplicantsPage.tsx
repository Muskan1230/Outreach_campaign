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
    const formId = campaign?.application_form_id ?? selected?.form_id ?? null
    if (formId === null) return

    let active = true

    async function loadFormFields() {
      try {
        const formData = await getForm(formId)
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
    void loadApplicants(search, statusFilter)
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
        statusFilter ? `Status: ${statusFilter}` : null,
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
            { label: 'Mobile', value: selected.candidate_mobile },
            { label: 'Email', value: selected.candidate_email },
            { label: 'Current Location', value: selected.candidate_location },
            { label: 'Preferred Location', value: selected.preferred_location },
            { label: 'Worker Category', value: selected.worker_category },
            {
              label: 'Skills',
              value:
                Array.isArray(selected.skills) && selected.skills.length ? selected.skills.join(', ') : null,
            },
            {
              label: 'Experience',
              value: selected.years_of_experience != null ? `${selected.years_of_experience} yrs` : null,
            },
            { label: 'Availability', value: selected.availability },
            {
              label: 'Source Channel',
              value: selected.source_channel
                ? (SOURCE_CHANNEL_OPTIONS.find(o => o.value === selected.source_channel)?.label ?? selected.source_channel)
                : null,
            },
          ]
        : [],
    [selected],
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

      <section className="panel applicants-toolbar-panel">
        <div className="applicants-toolbar">
          <form className="applicants-search" onSubmit={handleSearch}>
            <input
              type="text"
              className="apply-input applicants-search__input"
              placeholder="Search by name, mobile, email..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button type="submit" className="primary-button applicants-search__button">
              Search
            </button>
            {search ? (
              <button
                type="button"
                className="secondary-button applicants-search__clear"
                onClick={() => {
                  setSearch('')
                  void loadApplicants('', statusFilter, sourceChannelFilter)
                }}
              >
                Clear
              </button>
            ) : null}
          </form>

          <div className="applicants-filter-chips">
            {STATUS_FILTER_OPTIONS.map((option) => {
              const active = statusFilter === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleStatusFilter(option.value)}
                  className={`applicants-filter-chip${active ? ' applicants-filter-chip--active' : ''}`}
                >
                  {option.label}
                </button>
              )
            })}
          </div>

          <div className="applicants-filter-chips applicants-filter-chips--channel">
            <span className="applicants-filter-label">Source:</span>
            {SOURCE_CHANNEL_OPTIONS.map((option) => {
              const active = sourceChannelFilter === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleSourceChannelFilter(option.value)}
                  className={`applicants-filter-chip applicants-filter-chip--channel${active ? ' applicants-filter-chip--active' : ''}`}
                  title={`Filter by ${option.label}`}
                >
                  <span>{option.emoji}</span>
                  {option.label}
                </button>
              )
            })}
            {sourceChannelFilter && (
              <button
                type="button"
                className="applicants-filter-chip applicants-filter-chip--clear"
                onClick={() => handleSourceChannelFilter(sourceChannelFilter)}
              >
                ✕ Clear
              </button>
            )}
          </div>
        </div>

        <div className="applicants-toolbar__meta">
          <div className="applicants-toolbar__count">
            {total} candidate{total === 1 ? '' : 's'}
          </div>
          <div className="applicants-toolbar__active-filters">
            {activeFilters.length ? (
              activeFilters.map((filter) => (
                <span key={filter} className="applicant-filter-pill">
                  {filter}
                </span>
              ))
            ) : (
              <span className="applicants-toolbar__hint">No filters applied</span>
            )}
          </div>
        </div>
      </section>

      {updateError ? <div className="alert error applicants-alert">{updateError}</div> : null}

      <div className="applicants-grid">
        <section className="panel applicants-table-panel">
          <div className="panel-header applicants-panel-header">
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

                    return (
                      <tr
                        key={app.application_id}
                        data-clickable
                        onClick={() => setSelected(app)}
                        className={isSelected ? 'applicants-row applicants-row--selected' : 'applicants-row'}
                      >
                        <td className="applicants-cell applicants-cell--candidate">
                          <div className="applicants-candidate-name-row">
                            <span className="applicants-candidate-name">
                              {getSubmissionName(app, formFieldOrder)}
                            </span>
                            {app.is_duplicate ? <CompactBadge label="Duplicate" tone="danger" /> : null}
                          </div>
                          <div className="applicants-candidate-submeta">
                            Application ID {app.application_id.slice(0, 8)}…
                          </div>
                        </td>
                        <td className="applicants-cell">
                          <div className="applicants-contact-primary">{app.candidate_mobile || '—'}</div>
                          <div className="applicants-contact-secondary">{app.candidate_email || '—'}</div>
                        </td>
                        <td className="applicants-cell applicants-cell--muted">
                          {app.worker_category || '—'}
                        </td>
                        <td className="applicants-cell applicants-cell--muted">
                          {app.candidate_location || '—'}
                        </td>
                        <td className="applicants-cell">
                          {app.source_channel ? (
                            <span className={`applicants-source-badge applicants-source-badge--${app.source_channel}`}>
                              {SOURCE_CHANNEL_OPTIONS.find(o => o.value === app.source_channel)?.emoji}{' '}
                              {SOURCE_CHANNEL_OPTIONS.find(o => o.value === app.source_channel)?.label ?? app.source_channel}
                            </span>
                          ) : (
                            <span className="applicants-cell--muted">—</span>
                          )}
                        </td>
                        <td className="applicants-cell">
                          <StatusPill status={app.status} />
                        </td>
                        <td className="applicants-cell applicants-cell--meta">
                          {formatDate(app.applied_at)}
                        </td>
                        <td className="applicants-cell applicants-cell--actions">
                          <span className="table-link">Details →</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="preview-panel candidate-detail-panel">
          {selected ? (
            <>
              <div className="preview-header applicants-detail-header">
                <div>
                  <span className="eyebrow" style={{ color: selectedStatus?.color ?? '#10b981' }}>
                    Candidate Details
                  </span>
                  <h2>{selectedSubmissionName || '—'}</h2>
                  <p className="applicants-detail-subtitle">
                    {campaign?.opportunity_title || 'Campaign applicant'} · Applied {formatDate(selected.applied_at)}
                  </p>
                </div>
                <div className="applicants-detail-status-stack">
                  <StatusPill status={selected.status} />
                  {selected.is_duplicate ? (
                    <CompactBadge label="Duplicate" tone="danger" />
                  ) : (
                    <CompactBadge label="New profile" tone="active" />
                  )}
                </div>
              </div>

              <div className="applicants-detail-actions">
                {nextActions.slice(0, 2).map((nextStatus) => {
                  const cfg = STATUS_CONFIG[nextStatus]
                  const isUpdating = updatingId === selected.application_id

                  return (
                    <button
                      key={nextStatus}
                      type="button"
                      disabled={isUpdating}
                      onClick={() => handleStatusAction(selected.application_id, nextStatus)}
                      className="applicants-detail-action"
                      style={
                        {
                          '--action-color': cfg.color,
                          '--action-bg': cfg.bg,
                        } as CSSProperties
                      }
                    >
                      {isUpdating ? 'Updating…' : cfg.label}
                    </button>
                  )
                })}

                {selected.status !== 'rejected' ? (
                  <button
                    type="button"
                    className="applicants-detail-action applicants-detail-action--ghost"
                    onClick={() => handleStatusAction(selected.application_id, 'rejected')}
                    disabled={updatingId === selected.application_id}
                  >
                    Reject
                  </button>
                ) : null}
              </div>

              <section className="applicants-detail-section">
                <SectionTitle
                  eyebrow="Profile"
                  title="Candidate profile"
                  description="Identity and work-readiness details captured from the application."
                />
                <div className="candidate-fields-list applicants-collapsed-list">
                  {selectedProfileFields.map(({ label, value }) => (
                    <div key={label} className="candidate-field-item">
                      <span className="candidate-field-label">{label}</span>
                      <div className={`candidate-field-value${!value ? ' empty' : ''}`}>
                        {value || 'Not provided'}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="applicants-detail-section">
                <SectionTitle
                  eyebrow="Submission"
                  title="Form submission details"
                  description="Everything the candidate submitted that is not already shown in the profile section."
                />
                <div className="candidate-meta applicants-candidate-meta">
                  <span>Application ID: {selected.application_id}</span>
                  <span>Form ID: {selected.form_id}</span>
                  <span>Submitted: {formatDate(selected.applied_at)}</span>
                </div>
                <div className="candidate-fields-list applicants-collapsed-list">
                  {extraSubmissionFields.length ? (
                    extraSubmissionFields.map(({ fieldId, label, value }) => (
                      <div key={fieldId} className="candidate-field-item">
                        <span className="candidate-field-label">{label}</span>
                        <div className="candidate-field-value">
                          {Array.isArray(value) ? value.join(', ') : String(value)}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="candidate-empty-inline">
                      No additional submission fields were captured for this applicant.
                    </div>
                  )}
                </div>
              </section>

              <section className="applicants-detail-section">
                <SectionTitle
                  eyebrow="Documents"
                  title="Uploaded documents"
                  description="Any file upload responses appear here once they are available."
                />
                <div className="candidate-fields-list applicants-collapsed-list">
                  {documentFields.length ? (
                    documentFields.map(({ fieldId, label, value }) => (
                      <div key={fieldId} className="candidate-field-item">
                        <span className="candidate-field-label">{label}</span>
                        <div className="candidate-field-value">
                          <a href="#" onClick={(event) => event.preventDefault()} className="applicants-document-link">
                            {Array.isArray(value) ? value.join(', ') : String(value)}
                          </a>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="candidate-empty-inline">No uploaded documents for this submission.</div>
                  )}
                </div>
              </section>

              <section className="applicants-detail-section applicants-detail-section--footer">
                {nextActions.length === 0 && selected.status === 'hired' ? (
                  <div className="applicants-success-note">Candidate successfully hired.</div>
                ) : (
                  <div className="applicants-detail-footnote">
                    Click another row to review a different candidate, or use the action buttons to move this
                    application forward.
                  </div>
                )}
              </section>
            </>
          ) : (
            <div className="candidate-empty-state">
              <span className="empty-icon">👤</span>
              <h3>No candidate selected</h3>
              <p>Click a row in the applicants table to view their profile and take action.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
