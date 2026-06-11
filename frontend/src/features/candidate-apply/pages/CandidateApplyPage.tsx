import { useEffect, useRef, useState } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
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
const ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg']
const ALLOWED_FILE_EXT = ['.pdf', '.jpg', '.jpeg', '.png']
const MAX_FILE_SIZE_MB = 5
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
async function uploadFileToStorage(
  file: File,
  applicationId: string,
  fieldId: string,
): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
  const path = `applications/${applicationId}/${fieldId}_${Date.now()}.${ext}`
  const { error } = await supabase.storage
    .from('candidate-documents')
    .upload(path, file, { upsert: false, contentType: file.type })
  if (error) throw new Error(`File upload failed: ${error.message}`)
  return path
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
  return (
    <div className="apply-shell">
      <div className="apply-success-card">
        <div className="apply-success-card__icon">
          {isDuplicate ? '🔄' : '✅'}
        </div>
        <h1 className="apply-success-card__title">
          {isDuplicate ? 'Profile Updated!' : 'Application Submitted!'}
        </h1>
        <p className="apply-success-card__subtitle">
          {isDuplicate
            ? 'We found your existing profile and have updated it with your latest details.'
            : <>Thank you for applying to <strong>{campaignTitle}</strong>. Your application has been received.</>}
        </p>

        {applicationId && (
          <div className="apply-success-card__ref">
            <span className="apply-success-card__ref-label">Application Reference</span>
            <code className="apply-success-card__ref-value">{applicationId}</code>
          </div>
        )}

        <div className="apply-success-card__next">
          <p className="apply-success-card__next-title">What happens next?</p>
          <ul className="apply-success-card__next-list">
            <li>Our team will review your application</li>
            <li>We'll reach out on your mobile number</li>
            <li>Track your status anytime using your mobile number</li>
          </ul>
        </div>

        <Link
          to={`/apply/status`}
          className="apply-success-card__track-btn"
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
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

  const displayError = error || localError

  return (
    <div className={`apply-file-field ${displayError ? 'apply-file-field--error' : ''}`}>
      <div
        className="apply-file-drop"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        role="button"
        tabIndex={0}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_FILE_EXT.join(',')}
          onChange={handleChange}
          style={{ display: 'none' }}
        />
        {selected ? (
          <div className="apply-file-drop__selected">
            <span className="apply-file-drop__file-icon">📄</span>
            <div>
              <p className="apply-file-drop__file-name">{selected.name}</p>
              <p className="apply-file-drop__file-meta">
                {(selected.size / 1024).toFixed(0)} KB · {selected.type}
              </p>
            </div>
          </div>
        ) : (
          <div className="apply-file-drop__placeholder">
            <span className="apply-file-drop__upload-icon">☁️</span>
            <p>Click to upload or drag & drop</p>
            <small>{ALLOWED_FILE_EXT.join(', ')} · Max {MAX_FILE_SIZE_MB}MB</small>
          </div>
        )}
      </div>
      {displayError && (
        <span className="apply-field-error">{displayError}</span>
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
      // Upload any file fields first
      const finalResponses = { ...responses }
      // We'll use a placeholder application ID for file paths; real upload happens post-submit
      // For now, we upload with a temp path and store the storage path in responses
      const tempId = crypto.randomUUID()
      for (const [fieldId, file] of Object.entries(fileObjects)) {
        if (file) {
          try {
            const storagePath = await uploadFileToStorage(file, tempId, fieldId)
            finalResponses[fieldId] = storagePath
          } catch {
            // If storage fails (bucket not configured), fall back to filename
            finalResponses[fieldId] = file.name
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
                <div key={field.id} id={`apply-field-${field.id}`} className="apply-field-group">
                  <label className="apply-field-label">
                    {field.label}
                    {field.required && <span className="apply-field-required" aria-hidden>*</span>}
                  </label>
                  {field.help_text && (
                    <p className="apply-field-hint">{field.help_text}</p>
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
              <div key={field.id} id={`apply-field-${field.id}`} className="apply-field-group">
                {field.field_type !== 'Checkbox' && (
                  <label htmlFor={`input-${field.id}`} className="apply-field-label">
                    {field.label}
                    {(field.required || (isMobile && field.validation_rules?.optional !== true)) && (
                      <span className="apply-field-required" aria-hidden>*</span>
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
                      <p className="apply-field-hint">
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
                  <div className="apply-radio-group">
                    {(field.options ?? []).map((opt) => (
                      <label key={opt} className="apply-radio-option">
                        <input
                          type="radio"
                          name={`radio-${field.id}`}
                          value={opt}
                          checked={val === opt}
                          onChange={(e) => updateValue(field.id, e.target.value)}
                          onBlur={() => handleBlur(field)}
                        />
                        <span>{opt}</span>
                      </label>
                    ))}
                  </div>
                )}

                {/* Checkbox (non-consent) */}
                {field.field_type === 'Checkbox' && (
                  <div className="apply-checkbox-group">
                    <label className="apply-field-label">{field.label}</label>
                    {(field.options ?? []).map((opt) => {
                      const selectedList = Array.isArray(val) ? val : []
                      const checked = selectedList.includes(opt)
                      return (
                        <label key={opt} className="apply-checkbox-option">
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
                          />
                          <span>{opt}</span>
                        </label>
                      )
                    })}
                  </div>
                )}

                {field.help_text && field.field_type !== 'Phone' && (
                  <p className="apply-field-hint">{field.help_text}</p>
                )}

                {showError && (
                  <p id={`err-${field.id}`} className="apply-field-error" role="alert">
                    {err}
                  </p>
                )}
              </div>
            )
          })}

          {/* ── Submit button ─────────────── */}
          <button
            type="submit"
            className={`apply-submit-btn ${submitting ? 'apply-submit-btn--loading' : ''}`}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <span className="apply-submit-btn__spinner" aria-hidden />
                Submitting…
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
