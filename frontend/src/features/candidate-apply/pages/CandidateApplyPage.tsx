import { useEffect, useRef, useState } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import type {
  ApplicationFieldRecord,
  ApplicationFormWithFields,
} from '../../../../../shared/applicationForm'
import type { CampaignRecord } from '../../../../../shared/campaign'
import { getCampaign } from '../../campaigns/services/campaignService'
import { getForm } from '../../forms/services/formService'
import { submitForm } from '../services/candidateService'
import { recordTrackingClick } from '../../campaigns/services/trackingLinkService'
import { isFieldVisible } from '../../forms/utils/visibility'

// ─── Constants ─────────────────────────────────────────────────────────────
const INDIAN_MOBILE_RE = /^[6-9][0-9]{9}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
const ALLOWED_FILE_EXT = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx']
const MAX_FILE_SIZE_MB = 10
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

// ─── Helpers ───────────────────────────────────────────────────────────────
function isMobileField(field: ApplicationFieldRecord) {
  return (
    field.field_type === 'Phone' ||
    field.label.toLowerCase().includes('mobile') ||
    field.label.toLowerCase().includes('phone')
  )
}

function isConsentField(field: ApplicationFieldRecord) {
  return (
    field.field_type === 'Checkbox' && field.label.toLowerCase().includes('consent')
  )
}

// ─── Upload helper ─────────────────────────────────────────────────────────
// Uploads a file to Supabase Storage via the backend API endpoint.
// The backend uses the service-role key so no bucket RLS issues arise.
// Returns a JSON-encoded metadata string: {storage_path, file_name, mime_type, file_size}
async function uploadFileToStorage(
  file: File,
  formId: string,
  fieldId: string,
): Promise<string> {
  const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'
  const url = `${apiBase}/api/forms/${encodeURIComponent(formId)}/fields/upload`

  const formData = new FormData()
  formData.append('file', file)
  formData.append('field_id', fieldId)

  const response = await fetch(url, {
    method: 'POST',
    body: formData,
    // No Content-Type header — browser sets it automatically with the boundary
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(payload?.message || 'File upload failed. Please try again.')
  }

  // Return a JSON string so the backend submit handler can decode all metadata
  return JSON.stringify({
    storage_path: payload.storage_path,
    file_name:    payload.file_name,
    mime_type:    payload.mime_type,
    file_size:    payload.file_size,
  })
}

// ─── Sub-components ────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div className="apply-shell">
      <div className="apply-loading">
        <div className="apply-loading__spinner" />
        <p>Loading opportunity details…</p>
      </div>
    </div>
  )
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="apply-shell">
      <div className="apply-error-card">
        <div className="apply-error-card__icon">⚠️</div>
        <h1>Something went wrong</h1>
        <p>{message}</p>
      </div>
    </div>
  )
}

function UnpublishedScreen() {
  return (
    <div className="apply-shell">
      <div className="apply-unpublished-card">
        <div className="apply-unpublished-card__icon">🔒</div>
        <h1>Not Available Yet</h1>
        <p>
          This application form is currently in draft mode. The recruiter hasn't
          published it yet. Please check back later or contact the campaign team.
        </p>
      </div>
    </div>
  )
}

function SuccessScreen({
  isDuplicate,
  applicationId,
  campaignTitle,
}: {
  isDuplicate: boolean
  applicationId: string | null
  campaignTitle: string
}) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    if (applicationId) {
      await navigator.clipboard.writeText(applicationId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="apply-shell" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '70vh', padding: '24px 16px' }}>
      <div className="apply-success-card" style={{
        maxWidth: '520px',
        width: '100%',
        background: 'rgba(15, 23, 42, 0.85)',
        border: '1px solid rgba(16, 185, 129, 0.3)',
        borderRadius: '16px',
        padding: '40px 32px',
        boxShadow: '0 12px 40px rgba(0, 0, 0, 0.4)',
        textAlign: 'center',
        animation: 'fadeIn 0.3s ease-out'
      }}>
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          background: isDuplicate ? 'rgba(99, 102, 241, 0.15)' : 'rgba(16, 185, 129, 0.15)',
          color: isDuplicate ? '#818cf8' : '#34d399',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '2.2rem',
          margin: '0 auto 20px',
          fontWeight: 'bold'
        }}>
          {isDuplicate ? '🔄' : '✓'}
        </div>
        <h1 className="apply-success-card__title" style={{ fontSize: '1.6rem', fontWeight: '800', color: '#f8fafc', marginBottom: '10px' }}>
          {isDuplicate ? 'Profile Updated!' : 'Application Submitted!'}
        </h1>
        <p className="apply-success-card__subtitle" style={{ fontSize: '0.92rem', color: '#94a3b8', lineHeight: '1.6', marginBottom: '28px' }}>
          {isDuplicate ? (
            'We identified your existing profile in our system and have updated it with your latest inputs.'
          ) : (
            <>
              Thank you for applying to <strong>{campaignTitle}</strong>. Your candidate application has been recorded.
            </>
          )}
        </p>

        {applicationId && (
          <div className="apply-success-card__ref" style={{
            background: 'rgba(30, 41, 59, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: '10px',
            padding: '16px',
            marginBottom: '28px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }}>
            <span className="apply-success-card__ref-label" style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', fontWeight: '700' }}>
              Application Reference
            </span>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
              <code className="apply-success-card__ref-value" style={{ fontSize: '1rem', color: '#38bdf8', fontWeight: '700', letterSpacing: '0.02em', background: 'transparent', border: 'none', padding: 0 }}>
                {applicationId}
              </code>
              <button
                type="button"
                onClick={() => void handleCopy()}
                style={{
                  background: copied ? 'rgba(16, 185, 129, 0.15)' : 'rgba(51, 65, 85, 0.6)',
                  color: copied ? '#34d399' : '#cbd5e1',
                  border: copied ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  fontWeight: '600',
                  transition: 'all 150ms ease'
                }}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        <div className="apply-success-card__next" style={{
          textAlign: 'left',
          background: 'rgba(30, 41, 59, 0.3)',
          borderRadius: '12px',
          padding: '20px 24px',
          border: '1px solid rgba(255, 255, 255, 0.03)',
          marginBottom: '28px'
        }}>
          <p className="apply-success-card__next-title" style={{ fontWeight: '700', fontSize: '0.9rem', color: '#e2e8f0', margin: '0 0 10px' }}>
            What happens next?
          </p>
          <ul className="apply-success-card__next-list" style={{ paddingLeft: '16px', margin: 0, fontSize: '0.82rem', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <li>Our recruitment specialists will review your credentials.</li>
            <li>We will get in touch with you on your registered mobile number.</li>
            <li>You can track the status of your application anytime below.</li>
          </ul>
        </div>

        <Link
          to={`/apply/status`}
          className="apply-success-card__track-btn"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '44px',
            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
            color: '#fff',
            borderRadius: '8px',
            fontWeight: '600',
            textDecoration: 'none',
            fontSize: '0.9rem',
            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
            transition: 'all 150ms ease'
          }}
        >
          Track Application Status →
        </Link>
      </div>
    </div>
  )
}

// ─── File upload field ──────────────────────────────────────────────────────
function FileField({
  field,
  onFileChange,
  error,
}: {
  field: ApplicationFieldRecord
  onFileChange: (fieldId: string, file: File | null, errorMsg?: string) => void
  error?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [selected, setSelected] = useState<File | null>(null)
  const [localError, setLocalError] = useState('')
  const [isDragActive, setIsDragActive] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    handleFile(file)
  }

  const handleFile = (file: File | null) => {
    setLocalError('')
    if (!file) {
      setSelected(null)
      onFileChange(field.id, null)
      return
    }

    // Validate MIME type
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      const msg = `Only ${ALLOWED_FILE_EXT.join(', ')} files are allowed.`
      setLocalError(msg)
      onFileChange(field.id, null, msg)
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      const msg = `File must be under ${MAX_FILE_SIZE_MB}MB. Selected file is ${(file.size / 1024 / 1024).toFixed(1)}MB.`
      setLocalError(msg)
      onFileChange(field.id, null, msg)
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    setSelected(file)
    onFileChange(field.id, file)
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true)
    } else if (e.type === 'dragleave') {
      setIsDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0])
    }
  }

  const clearFile = (e: React.MouseEvent) => {
    e.stopPropagation()
    setSelected(null)
    onFileChange(field.id, null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const displayError = error || localError

  return (
    <div className={`apply-file-field ${displayError ? 'apply-file-field--error' : ''}`}>
      <div
        className="apply-file-drop"
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        style={{
          border: isDragActive ? '1px dashed #6366f1' : displayError ? '1px dashed #f43f5e' : '1px dashed rgba(99, 102, 241, 0.25)',
          background: isDragActive ? 'rgba(99, 102, 241, 0.05)' : 'rgba(8, 14, 30, 0.3)',
          borderRadius: '10px',
          padding: '16px 20px',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 200ms ease',
          boxShadow: isDragActive ? '0 0 12px rgba(99, 102, 241, 0.1)' : 'none'
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_FILE_EXT.join(',')}
          onChange={handleChange}
          style={{ display: 'none' }}
        />
        {selected ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <div className="apply-file-drop__selected" style={{ display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left' }}>
              <span className="apply-file-drop__file-icon" style={{ fontSize: '1.6rem' }}>📄</span>
              <div>
                <p className="apply-file-drop__file-name" style={{ margin: 0, fontWeight: '600', color: '#f8fafc', fontSize: '0.86rem' }}>{selected.name}</p>
                <p className="apply-file-drop__file-meta" style={{ margin: '2px 0 0', fontSize: '0.74rem', color: '#94a3b8' }}>
                  {(selected.size / 1024).toFixed(0)} KB · {selected.type.split('/')[1]?.toUpperCase() || 'DOCUMENT'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={clearFile}
              style={{
                background: 'rgba(244, 63, 94, 0.15)',
                color: '#fb7185',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '0.75rem',
                cursor: 'pointer',
                fontWeight: '600',
                transition: 'all 150ms ease'
              }}
            >
              Clear
            </button>
          </div>
        ) : (
          <div className="apply-file-drop__placeholder" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
            <span className="apply-file-drop__upload-icon" style={{ fontSize: '1.6rem', color: isDragActive ? '#6366f1' : '#475569', transition: 'color 200ms ease' }}>☁️</span>
            <div style={{ textAlign: 'left' }}>
              <p style={{ margin: 0, fontSize: '0.86rem', fontWeight: '500', color: '#cbd5e1' }}>
                {isDragActive ? 'Drop file here to upload' : 'Click to upload or drag & drop'}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#64748b' }}>
                {ALLOWED_FILE_EXT.join(', ').toUpperCase()} · Max {MAX_FILE_SIZE_MB}MB
              </p>
            </div>
          </div>
        )}
      </div>
      {displayError && (
        <span className="apply-field-error" style={{ display: 'block', marginTop: '6px', fontSize: '0.78rem', color: '#fb7185' }}>{displayError}</span>
      )}
    </div>
  )
}

// ─── Main page ──────────────────────────────────────────────────────────────
export function CandidateApplyPage() {
  const params = useParams()
  const formId = params.id
  const [searchParams] = useSearchParams()
  // Read ?track= param from URL for source attribution
  const trackId = searchParams.get('track')

  const [form, setForm] = useState<ApplicationFormWithFields | null>(null)
  const [campaign, setCampaign] = useState<CampaignRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')

  // Form state
  const [responses, setResponses] = useState<Record<string, any>>({})
  const [fileObjects, setFileObjects] = useState<Record<string, File | null>>({})
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set())
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  // Submission state
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isDuplicate, setIsDuplicate] = useState(false)
  const [applicationId, setApplicationId] = useState<string | null>(null)

  // Load form + campaign
  useEffect(() => {
    let active = true
    async function load() {
      if (!formId) {
        setPageError('Missing application form identifier')
        setLoading(false)
        return
      }
      try {
        const formData = await getForm(formId)
        if (!active) return
        setForm(formData)

        const initial: Record<string, any> = {}
        formData.fields.forEach((f: ApplicationFieldRecord) => {
          initial[f.id] = f.field_type === 'Checkbox' ? [] : ''
        })
        setResponses(initial)

        if (formData.campaign_id) {
          const camp = await getCampaign(formData.campaign_id)
          if (!active) return
          setCampaign(camp)
        }
      } catch (err) {
        if (!active) return
        setPageError(err instanceof Error ? err.message : 'Unable to load application form')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [formId])

  // Record click on tracking link (fire-and-forget, no error surfaced to user)
  useEffect(() => {
    if (trackId) {
      void recordTrackingClick(trackId)
    }
  }, [trackId])

  // ─── Validation ───────────────────────────────────────────────────────────
  const validateField = (field: ApplicationFieldRecord, val: any): string => {
    const isEmpty =
      val === undefined ||
      val === null ||
      (typeof val === 'string' && val.trim() === '') ||
      (Array.isArray(val) && val.length === 0)

    if (isConsentField(field)) {
      if (isEmpty || val === false) return 'You must accept the consent before submitting.'
      return ''
    }

    if (isMobileField(field) && field.validation_rules?.optional !== true) {
      if (isEmpty) return 'Mobile number is required.'
      const normalized = String(val).trim().replace(/[\s\-()]/g, '')
      if (!INDIAN_MOBILE_RE.test(normalized)) {
        return 'Enter a valid 10-digit Indian number (starts with 6-9).'
      }
      return ''
    }

    if (field.required && isEmpty) return `${field.label} is required.`

    if (!isEmpty) {
      if (field.field_type === 'Email') {
        if (!EMAIL_RE.test(String(val).trim())) return 'Invalid email address format.'
      }
    }
    return ''
  }

  const updateValue = (fieldId: string, value: any) => {
    setResponses((prev) => ({ ...prev, [fieldId]: value }))
    // Re-validate if field was already touched
    if (touchedFields.has(fieldId) && form) {
      const field = form.fields.find((f) => f.id === fieldId)
      if (field) {
        const msg = validateField(field, value)
        setValidationErrors((prev) => {
          const next = { ...prev }
          if (msg) next[fieldId] = msg
          else delete next[fieldId]
          return next
        })
      }
    }
  }

  const handleBlur = (field: ApplicationFieldRecord) => {
    setTouchedFields((prev) => new Set([...prev, field.id]))
    const msg = validateField(field, responses[field.id])
    setValidationErrors((prev) => {
      const next = { ...prev }
      if (msg) next[field.id] = msg
      else delete next[field.id]
      return next
    })
  }

  const handleFileChange = (
    fieldId: string,
    file: File | null,
    errorMsg?: string,
  ) => {
    setFileObjects((prev) => ({ ...prev, [fieldId]: file }))
    setResponses((prev) => ({ ...prev, [fieldId]: file ? file.name : '' }))
    if (errorMsg) {
      setValidationErrors((prev) => ({ ...prev, [fieldId]: errorMsg }))
    } else {
      setValidationErrors((prev) => {
        const next = { ...prev }
        delete next[fieldId]
        return next
      })
    }
  }

  const checkFieldVisibility = (field: ApplicationFieldRecord) =>
    isFieldVisible(field, responses)

  // ─── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formId || !form) return

    setSubmitError('')
    setSubmitting(true)

    // Validate all visible fields
    const errors: Record<string, string> = {}
    const allTouched = new Set<string>()
    form.fields.forEach((field) => {
      if (!checkFieldVisibility(field)) return
      allTouched.add(field.id)
      const msg = validateField(field, responses[field.id])
      if (msg) errors[field.id] = msg
    })
    setTouchedFields(allTouched)

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      setSubmitting(false)
      const firstId = Object.keys(errors)[0]
      document.getElementById(`apply-field-${firstId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
      return
    }

    try {
      // Upload any file fields first, using the backend upload endpoint.
      // Each call returns a JSON metadata string containing storage_path + mime info.
      const finalResponses = { ...responses }
      for (const [fieldId, file] of Object.entries(fileObjects)) {
        if (file) {
          try {
            const uploadMetadata = await uploadFileToStorage(file, formId, fieldId)
            finalResponses[fieldId] = uploadMetadata
          } catch (uploadErr) {
            // Surface upload errors explicitly — don't silently fall back to filename
            throw new Error(
              uploadErr instanceof Error
                ? `Could not upload file: ${uploadErr.message}`
                : 'File upload failed. Please check your connection and try again.',
            )
          }
        }
      }

      const result = await submitForm(
        formId,
        finalResponses,
        trackId ?? undefined,  // source_link_id: the tracking link UUID from ?track=
      )
      setIsDuplicate(result.is_duplicate)
      setApplicationId(result.application_id)
      setIsSubmitted(true)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit application. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Early returns ────────────────────────────────────────────────────────
  if (loading) return <LoadingScreen />
  if (pageError && !form) return <ErrorScreen message={pageError} />
  if (form && !form.is_published) return <UnpublishedScreen />
  if (isSubmitted)
    return (
      <SuccessScreen
        isDuplicate={isDuplicate}
        applicationId={applicationId}
        campaignTitle={campaign?.opportunity_title || campaign?.name || 'this opportunity'}
      />
    )

  // ─── Opportunity summary ──────────────────────────────────────────────────
  const compensationText =
    typeof campaign?.compensation_details?.raw === 'string'
      ? campaign.compensation_details.raw
      : campaign?.compensation_model ?? ''

  return (
    <div className="apply-shell">
      {/* ── Hero card ─────────────────────────────────── */}
      {campaign && (
        <div className="apply-hero">
          <div className="apply-hero__eyebrow">
            <span className="apply-hero__badge">Now Hiring</span>
          </div>
          <h1 className="apply-hero__title">{campaign.opportunity_title}</h1>
          {campaign.opportunity_desc && (
            <p className="apply-hero__desc">{campaign.opportunity_desc}</p>
          )}
          <div className="apply-hero__meta">
            <div className="apply-hero__meta-item">
              <span className="apply-hero__meta-icon">📍</span>
              <span>{campaign.target_region}</span>
            </div>
            <div className="apply-hero__meta-item">
              <span className="apply-hero__meta-icon">👷</span>
              <span>{campaign.worker_type}</span>
            </div>
            {compensationText && (
              <div className="apply-hero__meta-item">
                <span className="apply-hero__meta-icon">💰</span>
                <span>{compensationText}</span>
              </div>
            )}
            {campaign.skills_required?.length > 0 && (
              <div className="apply-hero__meta-item">
                <span className="apply-hero__meta-icon">🛠️</span>
                <span>{campaign.skills_required.slice(0, 3).join(', ')}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Form card ─────────────────────────────────── */}
      <div className="apply-form-card">
        <div className="apply-form-card__header">
          <h2 className="apply-form-card__title">Apply Now</h2>
          <p className="apply-form-card__subtitle">
            Fill out the form below — it takes less than 3 minutes.
          </p>
        </div>

        {submitError && (
          <div className="apply-alert apply-alert--error" role="alert">
            <span>⚠️</span> {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="apply-form">
          {form?.fields.map((field) => {
            if (!checkFieldVisibility(field)) return null

            const val = responses[field.id]
            const err = validationErrors[field.id]
            const touched = touchedFields.has(field.id)
            const showError = touched && !!err

            const isMobile = isMobileField(field)
            const isConsent = isConsentField(field)

            // Consent field: render as a dedicated styled section
            if (isConsent) {
              const options = field.options ?? []
              const selectedList = Array.isArray(val) ? val : []

              // If there are no options defined, render a single "I agree" checkbox
              const consentText = options.length === 0
                ? form.description || field.help_text || 'I agree to allow my data to be stored and used to contact me for this opportunity.'
                : null

              return (
                <div key={field.id} id={`apply-field-${field.id}`} className="apply-consent-section">
                  <div className="apply-consent-section__header">
                    <span className="apply-consent-section__icon">🔒</span>
                    <div>
                      <p className="apply-consent-section__title">Consent & Data Usage</p>
                      <p className="apply-consent-section__desc">
                        {consentText ?? field.help_text ?? 'Please read and accept the following:'}
                      </p>
                    </div>
                  </div>

                  {options.length > 0 ? (
                    options.map((opt) => {
                      const checked = selectedList.includes(opt)
                      return (
                        <label key={opt} className="apply-consent-checkbox">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const next = new Set(selectedList)
                              if (e.target.checked) next.add(opt)
                              else next.delete(opt)
                              updateValue(field.id, Array.from(next))
                            }}
                            onBlur={() => handleBlur(field)}
                            className="apply-consent-checkbox__input"
                          />
                          <span className="apply-consent-checkbox__text">{opt}</span>
                        </label>
                      )
                    })
                  ) : (
                    <label className="apply-consent-checkbox">
                      <input
                        type="checkbox"
                        checked={Array.isArray(val) ? val.includes('agreed') : val === 'agreed'}
                        onChange={(e) => {
                          updateValue(field.id, e.target.checked ? ['agreed'] : [])
                        }}
                        onBlur={() => handleBlur(field)}
                        className="apply-consent-checkbox__input"
                      />
                      <span className="apply-consent-checkbox__text">
                        I agree to the terms above and consent to my data being used for recruitment purposes.
                      </span>
                    </label>
                  )}

                  {showError && (
                    <p className="apply-field-error apply-field-error--consent" role="alert">
                      {err}
                    </p>
                  )}
                </div>
              )
            }

            // File upload field
            if (field.field_type === 'File Upload') {
              return (
                <div key={field.id} id={`apply-field-${field.id}`} className="apply-field-group" style={{ marginBottom: '24px' }}>
                  <label className="apply-field-label" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: '600', fontSize: '0.9rem', color: '#cbd5e1', marginBottom: '8px' }}>
                    {field.label}
                    {field.required && <span className="apply-field-required" style={{ color: '#f43f5e', fontWeight: 'bold' }} aria-hidden>*</span>}
                  </label>
                  {field.help_text && (
                    <p className="apply-field-hint" style={{ margin: '0 0 8px', fontSize: '0.78rem', color: '#64748b' }}>{field.help_text}</p>
                  )}
                  <FileField
                    field={field}
                    onFileChange={handleFileChange}
                    error={showError ? err : undefined}
                  />
                </div>
              )
            }

            // Standard inputs
            return (
              <div key={field.id} id={`apply-field-${field.id}`} className="apply-field-group" style={{ marginBottom: '24px' }}>
                {field.field_type !== 'Checkbox' && (
                  <label htmlFor={`input-${field.id}`} className="apply-field-label" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: '600', fontSize: '0.9rem', color: '#cbd5e1', marginBottom: '8px' }}>
                    {field.label}
                    {(field.required || (isMobile && field.validation_rules?.optional !== true)) && (
                      <span className="apply-field-required" style={{ color: '#f43f5e', fontWeight: 'bold' }} aria-hidden>*</span>
                    )}
                  </label>
                )}

                {/* Text / Email / Phone / Number / Date */}
                {['Text', 'Email', 'Phone', 'Number', 'Date'].includes(field.field_type) && (
                  <>
                    <input
                      id={`input-${field.id}`}
                      type={
                        field.field_type === 'Email' ? 'email'
                          : field.field_type === 'Number' ? 'number'
                          : field.field_type === 'Date' ? 'date'
                          : 'text'
                      }
                      inputMode={isMobile ? 'numeric' : undefined}
                      maxLength={isMobile ? 10 : undefined}
                      className={`apply-input ${showError ? 'apply-input--error' : ''}`}
                      style={{
                        width: '100%',
                        borderRadius: '9px',
                        border: showError ? '1px solid #f43f5e' : '1px solid rgba(99, 102, 241, 0.18)',
                        background: 'rgba(8, 14, 30, 0.60)',
                        color: '#f8fafc',
                        padding: '12px 14px',
                        fontSize: '0.92rem',
                        transition: 'border-color 150ms ease, box-shadow 150ms ease',
                      }}
                      placeholder={
                        isMobile
                          ? (field.placeholder || '10-digit mobile (e.g. 9876543210)')
                          : (field.placeholder || field.label)
                      }
                      value={val ?? ''}
                      onChange={(e) => updateValue(field.id, e.target.value)}
                      onBlur={() => handleBlur(field)}
                      aria-describedby={showError ? `err-${field.id}` : undefined}
                      aria-invalid={showError}
                    />
                    {isMobile && !showError && (
                      <p className="apply-field-hint" style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                        10-digit Indian number starting with 6, 7, 8, or 9
                      </p>
                    )}
                  </>
                )}

                {/* Select */}
                {field.field_type === 'Select' && (
                  <select
                    id={`input-${field.id}`}
                    className={`apply-select ${showError ? 'apply-input--error' : ''}`}
                    style={{
                      width: '100%',
                      borderRadius: '9px',
                      border: showError ? '1px solid #f43f5e' : '1px solid rgba(99, 102, 241, 0.18)',
                      background: 'rgba(8, 14, 30, 0.60)',
                      color: '#f8fafc',
                      padding: '12px 14px',
                      fontSize: '0.92rem',
                      transition: 'border-color 150ms ease',
                    }}
                    value={val ?? ''}
                    onChange={(e) => updateValue(field.id, e.target.value)}
                    onBlur={() => handleBlur(field)}
                  >
                    <option value="">Select an option</option>
                    {(field.options ?? []).map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                )}

                {/* Radio */}
                {field.field_type === 'Radio' && (
                  <div className="apply-radio-group" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginTop: '6px' }}>
                    {(field.options ?? []).map((opt) => (
                      <label key={opt} className="apply-radio-option" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.88rem' }}>
                        <input
                          type="radio"
                          name={`radio-${field.id}`}
                          value={opt}
                          checked={val === opt}
                          onChange={(e) => updateValue(field.id, e.target.value)}
                          onBlur={() => handleBlur(field)}
                          style={{ margin: 0 }}
                        />
                        <span>{opt}</span>
                      </label>
                    ))}
                  </div>
                )}

                {/* Checkbox (non-consent) */}
                {field.field_type === 'Checkbox' && (
                  <div className="apply-checkbox-group" style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px' }}>
                    <label className="apply-field-label" style={{ fontWeight: '600', fontSize: '0.9rem', color: '#cbd5e1' }}>{field.label}</label>
                    {(field.options ?? []).map((opt) => {
                      const selectedList = Array.isArray(val) ? val : []
                      const checked = selectedList.includes(opt)
                      return (
                        <label key={opt} className="apply-checkbox-option" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.88rem' }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const next = new Set(selectedList)
                              if (e.target.checked) next.add(opt)
                              else next.delete(opt)
                              updateValue(field.id, Array.from(next))
                            }}
                            onBlur={() => handleBlur(field)}
                            style={{ margin: 0 }}
                          />
                          <span>{opt}</span>
                        </label>
                      )
                    })}
                  </div>
                )}

                {field.help_text && field.field_type !== 'Phone' && (
                  <p className="apply-field-hint" style={{ margin: '6px 0 0', fontSize: '0.78rem', color: '#64748b' }}>{field.help_text}</p>
                )}

                {showError && (
                  <p id={`err-${field.id}`} className="apply-field-error" style={{ display: 'block', marginTop: '6px', fontSize: '0.78rem', color: '#fb7185' }} role="alert">
                    {err}
                  </p>
                )}
              </div>
            )
          })}

          {/* Inline styles for custom animations (spin, fadeIn) */}
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            @keyframes fadeIn {
              from { opacity: 0; transform: translateY(8px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>

          {/* ── Submit button ─────────────── */}
          <button
            type="submit"
            className={`apply-submit-btn ${submitting ? 'apply-submit-btn--loading' : ''}`}
            disabled={submitting}
            style={{
              width: '100%',
              height: '48px',
              borderRadius: '9px',
              background: submitting ? 'rgba(99, 102, 241, 0.5)' : 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              color: '#fff',
              fontSize: '0.96rem',
              fontWeight: '600',
              cursor: submitting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              border: 'none',
              boxShadow: submitting ? 'none' : '0 4px 12px rgba(99, 102, 241, 0.3)',
              transition: 'all 150ms ease',
              marginTop: '32px'
            }}
          >
            {submitting ? (
              <>
                <span className="apply-submit-btn__spinner" style={{
                  width: '18px',
                  height: '18px',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  borderTop: '2px solid #fff',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite'
                }} aria-hidden />
                Submitting Application…
              </>
            ) : (
              'Submit Application →'
            )}
          </button>

          <p className="apply-form__privacy-note">
            🔒 Your information is encrypted and will only be used for recruitment purposes.
          </p>
        </form>
      </div>
    </div>
  )
}
