import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { ApplicationStatus } from '../services/applicantService'
import {
  getApplicantDetail,
  updateApplicationStatus,
  type ApplicantQueueRow,
} from '../services/applicantService'
import { getForm } from '../../forms/services/formService'

const STATUS_CONFIG: Record<
  ApplicationStatus,
  { label: string; color: string; bg: string; next: ApplicationStatus[] }
> = {
  new: { label: 'New', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', next: ['shortlisted', 'rejected'] },
  shortlisted: { label: 'Shortlisted', color: '#34d399', bg: 'rgba(52,211,153,0.12)', next: ['offered', 'rejected'] },
  offered: { label: 'Offered', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', next: ['hired', 'rejected'] },
  hired: { label: 'Hired', color: '#10b981', bg: 'rgba(16,185,129,0.12)', next: [] },
  rejected: { label: 'Rejected', color: '#f43f5e', bg: 'rgba(244,63,94,0.12)', next: ['shortlisted'] },
}

const SOURCE_CHANNEL_OPTIONS: Array<{ value: string; label: string; emoji: string }> = [
  { value: 'whatsapp', label: 'WhatsApp', emoji: '💬' },
  { value: 'linkedin', label: 'LinkedIn', emoji: '💼' },
  { value: 'facebook', label: 'Facebook', emoji: '👥' },
  { value: 'instagram', label: 'Instagram', emoji: '📸' },
  { value: 'job_portal', label: 'Job Portal', emoji: '🗂️' },
]

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
  return ['full name', 'mobile', 'phone', 'email', 'location', 'category', 'skills', 'experience', 'availability']
    .some((term) => label.toLowerCase().includes(term))
}

function slugifyKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

function normalizeLookupKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function formatResponseValue(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Not provided'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'Not provided'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function normalizeComparableValue(value: unknown) {
  return formatResponseValue(value).toLowerCase().replace(/\s+/g, ' ').trim()
}

function inferFallbackFieldMeta(application: ApplicantQueueRow, value: unknown) {
  const normalizedValue = normalizeComparableValue(value)
  if (!normalizedValue || normalizedValue === 'not provided') return null

  const candidates = [
    { label: 'Candidate Name', value: application.candidate_name },
    { label: 'Mobile Number', value: application.candidate_mobile },
    { label: 'Email Address', value: application.candidate_email },
    { label: 'Current Location', value: application.candidate_location },
    { label: 'Preferred Location', value: application.preferred_location },
    { label: 'Category', value: application.worker_category },
    { label: 'Skills', value: Array.isArray(application.skills) ? application.skills.join(', ') : null },
    { label: 'Experience', value: application.years_of_experience != null ? `${application.years_of_experience}` : null },
    { label: 'Availability', value: application.availability },
  ]

  for (const candidate of candidates) {
    const candidateValue = normalizeComparableValue(candidate.value)
    if (candidateValue && candidateValue === normalizedValue) {
      return { label: candidate.label, isIdentity: true }
    }
  }

  if (normalizedValue.includes('agree to be contacted') || normalizedValue.includes('consent')) {
    return { label: 'Consent', isIdentity: true }
  }

  return null
}

function getFieldTypeLabel(fieldType: string) {
  if (!fieldType) return 'Text'
  return fieldType
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function resolveFieldMeta(
  fieldId: string,
  formFieldOrder: Array<{ id: string; label: string; field_type: string; field_key?: string }>,
) {
  const normalizedFieldId = normalizeLookupKey(fieldId)
  const direct = formFieldOrder.find((field) => normalizeLookupKey(field.id) === normalizedFieldId)
  if (direct) return direct

  const normalized = normalizeLookupKey(fieldId)
  return formFieldOrder.find((field) => {
    const candidates = [field.field_key, field.label, field.id]
      .filter(Boolean)
      .map((value) => normalizeLookupKey(String(value)))
    return candidates.includes(normalized)
  }) ?? null
}

function getResponseValue(responses: Record<string, unknown>, field: { id: string; label: string; field_key?: string }) {
  const directKey = field.id
  if (responses[directKey] !== undefined) return responses[directKey]

  const normalizedTarget = normalizeLookupKey(field.id)
  const entries = Object.entries(responses)
  for (const [key, value] of entries) {
    if (normalizeLookupKey(key) === normalizedTarget) return value
  }

  if (field.field_key && responses[field.field_key] !== undefined) return responses[field.field_key]

  return responses[slugifyKey(field.label)]
}

function getSubmissionName(applicant: ApplicantQueueRow, formFieldOrder: Array<{ id: string; label: string; field_type: string; field_key?: string }>) {
  const responses = applicant.raw_responses ?? {}
  for (const field of formFieldOrder) {
    const rawValue = getResponseValue(responses, field)
    const value =
      typeof rawValue === 'string'
        ? rawValue.trim()
        : Array.isArray(rawValue)
          ? rawValue.join(', ').trim()
          : ''
    if (!value) continue
    if (field.label.toLowerCase().includes('full name')) return value
    if (isIdentityFieldLabel(field.label) && field.field_type !== 'File Upload') return value
  }
  return applicant.candidate_name || 'Unknown'
}

function getSubmissionSnapshotValue(
  applicant: ApplicantQueueRow,
  formFieldOrder: Array<{ id: string; label: string; field_type: string; field_key?: string }>,
  matchers: string[],
) {
  const responses = applicant.raw_responses ?? {}

  for (const field of formFieldOrder) {
    const label = field.label.toLowerCase()
    if (!matchers.some((term) => label.includes(term))) continue

    const rawValue = getResponseValue(responses, field)
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

function getSnapshotProfileFields(
  applicant: ApplicantQueueRow,
  formFieldOrder: Array<{ id: string; label: string; field_type: string; field_key?: string }>,
) {
  return [
    {
      label: 'Candidate Name',
      value:
        getSubmissionSnapshotValue(applicant, formFieldOrder, ['full name', 'name']) ||
        applicant.candidate_name,
    },
    {
      label: 'Mobile',
      value:
        getSubmissionSnapshotValue(applicant, formFieldOrder, ['mobile', 'phone']) ||
        applicant.candidate_mobile,
    },
    {
      label: 'Email',
      value:
        getSubmissionSnapshotValue(applicant, formFieldOrder, ['email']) ||
        applicant.candidate_email,
    },
    {
      label: 'Current Location',
      value:
        getSubmissionSnapshotValue(applicant, formFieldOrder, ['current location', 'current city']) ||
        applicant.candidate_location,
    },
    {
      label: 'Preferred Location',
      value:
        getSubmissionSnapshotValue(applicant, formFieldOrder, ['preferred location']) ||
        applicant.preferred_location,
    },
    {
      label: 'Category',
      value:
        getSubmissionSnapshotValue(applicant, formFieldOrder, ['worker category', 'category', 'worker type']) ||
        applicant.worker_category,
    },
    {
      label: 'Skills',
      value:
        getSubmissionSnapshotValue(applicant, formFieldOrder, ['skill']) ||
        (Array.isArray(applicant.skills) && applicant.skills.length ? applicant.skills.join(', ') : null),
    },
    {
      label: 'Experience',
      value:
        getSubmissionSnapshotValue(applicant, formFieldOrder, ['experience', 'exp', 'year']) ||
        (applicant.years_of_experience != null ? `${applicant.years_of_experience} yrs` : null),
    },
    {
      label: 'Availability',
      value:
        getSubmissionSnapshotValue(applicant, formFieldOrder, ['availability', 'shift']) ||
        applicant.availability,
    },
    {
      label: 'Source Channel',
      value: applicant.source_channel
        ? (SOURCE_CHANNEL_OPTIONS.find((o) => o.value === applicant.source_channel)?.label ?? applicant.source_channel)
        : null,
    },
  ]
}

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

function CompactBadge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'active' | 'warning' | 'danger' }) {
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

export function ApplicantDetailPage() {
  const params = useParams()
  const navigate = useNavigate()
  const campaignId = params.id ?? ''
  const appId = params.appId ?? ''

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [campaign, setCampaign] = useState<{ id: string; name: string; opportunity_title: string } | null>(null)
  const [application, setApplication] = useState<ApplicantQueueRow | null>(null)
  const [formFields, setFormFields] = useState<Array<{ id: string; label: string; field_type: string; field_key?: string }>>([])
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true

    async function load() {
      if (!campaignId || !appId) {
        setError('Missing applicant reference')
        setLoading(false)
        return
      }

      try {
        const result = await getApplicantDetail(campaignId, appId)
        if (!active) return
        setCampaign(result.campaign)
        setApplication(result.application)
        setError('')

        if (result.application.form_id) {
          const form = await getForm(result.application.form_id)
          if (!active) return
          setFormFields(form.fields.map((field) => ({
            id: field.id,
            label: field.label,
            field_type: field.field_type,
            field_key: field.field_key,
          })))
        } else {
          setFormFields([])
        }
      } catch (requestError) {
        if (!active) return
        setError(requestError instanceof Error ? requestError.message : 'Unable to load applicant details')
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [appId, campaignId])

  const selectedProfileFields = useMemo(() => {
    if (!application) return []

    return getSnapshotProfileFields(application, formFields)
  }, [application, formFields])

  const submissionFields = useMemo(() => {
    if (!application) return []

    return Object.entries(application.raw_responses ?? {})
      .map(([fieldId, value]) => {
        if (value === undefined || value === null || value === '') return null
        if (typeof value === 'boolean' && value === true) return null

        const fieldInfo = resolveFieldMeta(fieldId, formFields)
        const fallbackMeta = inferFallbackFieldMeta(application, value)
        const label = fieldInfo?.label || fallbackMeta?.label || 'Additional response'
        if (fallbackMeta?.isIdentity || isIdentityFieldLabel(label)) return null

        const fieldType = fieldInfo?.field_type ?? 'Text'

        return {
          fieldId,
          label,
          fieldKey: fieldInfo?.field_key ?? fieldId,
          value,
          isFile: fieldType === 'File Upload',
          fieldType,
        }
      })
      .filter(Boolean) as Array<{ fieldId: string; label: string; fieldKey: string; value: unknown; isFile: boolean; fieldType: string }>
  }, [application, formFields])

  const documentFields = submissionFields.filter((field) => field.isFile)
  const extraSubmissionFields = submissionFields.filter((field) => !field.isFile)
  const nextActions = application ? STATUS_CONFIG[application.status]?.next ?? [] : []

  const handleStatusAction = async (status: ApplicationStatus) => {
    if (!application || !campaignId) return

    setUpdatingId(application.application_id)
    setMessage('')
    try {
      const response = await updateApplicationStatus(campaignId, application.application_id, status)
      setApplication((prev) => (prev ? { ...prev, status: response.application.status } : prev))
      setMessage(response.message)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to update status')
    } finally {
      setUpdatingId(null)
    }
  }

  if (loading) {
    return (
      <div className="page-shell">
        <section className="panel">
          <div className="empty-state">Loading applicant details...</div>
        </section>
      </div>
    )
  }

  if (error && !application) {
    return (
      <div className="page-shell">
        <section className="panel">
          <div className="alert error">{error}</div>
        </section>
      </div>
    )
  }

  if (!application) {
    return null
  }

  const statusCfg = STATUS_CONFIG[application.status]
  const sourceInfo = application.source_channel
    ? SOURCE_CHANNEL_OPTIONS.find((option) => option.value === application.source_channel)
    : null
  const profileFieldMap = new Map(selectedProfileFields.map((field) => [field.label, field.value]))
  const quickFacts = [
    { label: 'Mobile', value: profileFieldMap.get('Mobile') || '—' },
    { label: 'Source', value: sourceInfo?.label ?? application.source_channel ?? '—' },
    { label: 'Applied', value: formatDate(application.applied_at) },
    { label: 'Category', value: profileFieldMap.get('Category') || '—' },
  ]

  return (
    <div className="page-shell applicants-page">
      <section className="panel applicants-topbar">
        <div className="applicants-topbar__copy">
          <div className="applicants-topbar__eyebrow-row">
            <span className="eyebrow">Applicants Tracking</span>
            <CompactBadge label="Candidate Review" tone="active" />
          </div>
          <h1>{campaign?.name || 'Applicant Details'}</h1>
          <p>Review and take action on a single applicant for {campaign?.opportunity_title || 'this campaign'}.</p>
        </div>
        <div className="applicants-topbar__actions">
          <Link className="ghost-button" to={campaignId ? `/campaigns/${campaignId}/applicants` : '/campaigns'}>
            ← Back to applicant queue
          </Link>
        </div>
      </section>

      {error ? <div className="alert error applicants-alert">{error}</div> : null}
      {message ? <div className="alert success applicants-alert">{message}</div> : null}

      <section className="panel applicant-detail-hero">
        <div className="applicant-detail-hero__header">
          <div>
            <span className="eyebrow" style={{ color: statusCfg.color }}>Candidate Review</span>
            <h2>{getSubmissionName(application, formFields)}</h2>
            <p className="applicants-detail-subtitle">
              Applied on {formatDate(application.applied_at)}
            </p>
          </div>
          <div className="applicant-detail-hero__status">
            <StatusPill status={application.status} />
            {application.is_duplicate ? <CompactBadge label="Duplicate profile" tone="danger" /> : <CompactBadge label="New profile" tone="active" />}
          </div>
        </div>

        <div className="applicant-detail-summary-grid">
          {quickFacts.map((fact) => (
            <div key={fact.label} className="applicant-summary-card">
              <span>{fact.label}</span>
              <strong>{fact.value}</strong>
            </div>
          ))}
        </div>
        {application.is_duplicate ? (
          <p className="applicant-detail-note" style={{ marginTop: '12px', color: '#f59e0b', fontSize: '0.88rem' }}>
            This submission is flagged as a duplicate profile. The fields above reflect the submission snapshot, not a later profile merge.
          </p>
        ) : null}
      </section>

      <div className="applicant-detail-layout">
        <main className="applicant-detail-main">
          <section className="detail-card applicant-detail-action-card">
            <div className="applicant-detail-action-card__title">
              <div>
                <span className="eyebrow" style={{ color: statusCfg.color }}>Actions</span>
                <h3>Move applicant through the pipeline</h3>
              </div>
              <p>Use these actions to keep the candidate moving without leaving the page.</p>
            </div>
            <div className="applicants-detail-actions applicant-detail-action-bar">
          {nextActions.slice(0, 2).map((nextStatus) => {
            const cfg = STATUS_CONFIG[nextStatus]
            const isUpdating = updatingId === application.application_id

            return (
              <button
                key={nextStatus}
                type="button"
                disabled={isUpdating}
                onClick={() => void handleStatusAction(nextStatus)}
                className="applicants-detail-action"
                style={{
                  flexGrow: 1,
                  background: cfg.color,
                  color: '#0f172a',
                  fontWeight: '700',
                  fontSize: '0.84rem',
                  height: '36px',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                {isUpdating ? 'Updating…' : `Move to ${cfg.label}`}
              </button>
            )
          })}

          {application.status !== 'rejected' ? (
            <button
              type="button"
              className="applicants-detail-action applicants-detail-action--ghost"
              onClick={() => void handleStatusAction('rejected')}
              disabled={updatingId === application.application_id}
              style={{
                background: 'rgba(244, 63, 94, 0.1)',
                color: '#fb7185',
                border: '1px solid rgba(244, 63, 94, 0.2)',
                borderRadius: '6px',
                padding: '0 16px',
                fontSize: '0.84rem',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Reject applicant
            </button>
          ) : null}
            </div>
          </section>

          <div className="detail-cards-stack applicant-detail-stack">
          <div className="detail-card applicant-detail-card">
            <SectionTitle eyebrow="Profile details" title="Candidate profile" description="Work readiness inputs mapped directly to the recruiter database." />
            <div className="applicant-profile-grid">
              {selectedProfileFields.map(({ label, value }) => (
                <div key={label} className="applicant-profile-item">
                  <span>{label}</span>
                  <strong>{value || 'Not provided'}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="detail-card applicant-detail-card">
            <SectionTitle eyebrow="Submission responses" title="Form responses" description="Additional data captured from custom application form fields." />
            <div className="applicant-detail-meta">
              <span>Application ID: {application.application_id.slice(0, 12)}...</span>
              <span>Submitted: {formatDate(application.applied_at)}</span>
            </div>
            <div className="applicant-response-grid">
              {extraSubmissionFields.length ? (
                extraSubmissionFields.map(({ fieldId, label, value, fieldType }) => (
                  <div key={fieldId} className="applicant-response-item">
                    <div className="applicant-response-item__header">
                      <div className="applicant-response-item__label">
                        <span>{label}</span>
                      </div>
                      <span className="applicant-response-badge">{getFieldTypeLabel(fieldType)}</span>
                    </div>
                    <strong>{formatResponseValue(value)}</strong>
                  </div>
                ))
              ) : (
                <div className="candidate-empty-inline applicant-empty-inline">
                  No additional submission answers.
                </div>
              )}
            </div>
          </div>

          <div className="detail-card applicant-detail-card">
            <SectionTitle eyebrow="Documents" title="Attached documents" description="Upload attachments submitted by candidate (e.g. Resume, CV)." />
            <div className="applicant-doc-summary">
              <span>{documentFields.length} attachment{documentFields.length === 1 ? '' : 's'} captured</span>
              <span>Files stay linked to the application record for recruiter review.</span>
            </div>
            <div className="applicant-doc-list">
              {documentFields.length ? (
                documentFields.map(({ fieldId, label, fieldType }) => (
                  <div key={fieldId} className="applicant-doc-item">
                    <div className="applicant-doc-item__left">
                      <span className="applicant-doc-item__icon">DOC</span>
                      <div>
                        <span className="applicant-doc-item__label">{label}</span>
                        <span className="applicant-doc-item__meta">Captured document - {getFieldTypeLabel(fieldType)}</span>
                      </div>
                    </div>
                    <span className="applicant-doc-item__link">Review pending</span>
                  </div>
                ))
              ) : (
                <div className="applicant-doc-empty">
                  <div className="applicant-doc-empty__icon">DOC</div>
                  <div>
                    <strong>No documents added</strong>
                    <p>No resume or supporting files have been uploaded for this applicant yet.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
          </div>
        </main>

        <aside className="applicant-detail-side">
          <section className="detail-card applicant-side-card">
            <SectionTitle eyebrow="Snapshot" title="Application overview" description="At-a-glance context for the recruiter." />
            <div className="applicant-side-stats applicant-side-stats--compact">
              <div>
                <span>Application ID</span>
                <strong>{application.application_id.slice(0, 12)}...</strong>
              </div>
              <div>
                <span>Source</span>
                <strong>{sourceInfo?.label ?? application.source_channel ?? '�'}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{statusCfg.label}</strong>
              </div>
              <div>
                <span>Duplicate</span>
                <strong>{application.is_duplicate ? 'Yes' : 'No'}</strong>
              </div>
            </div>
          </section>

          <section className="detail-card applicant-side-card">
            <SectionTitle eyebrow="Pipeline" title="Recruitment stage" description="Current status and next actions." />
            <div className="applicant-side-status">
              <StatusPill status={application.status} />
              {application.is_duplicate ? <CompactBadge label="Duplicate" tone="danger" /> : <CompactBadge label="New profile" tone="active" />}
            </div>
            <div className="applicant-side-notes">
              <p>
                Use the main actions to move this applicant forward or mark them as rejected when needed.
              </p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
