import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  campaignModes,
  campaignModeLabels,
  outreachChannels,
  outreachChannelLabels,
  splitCsvValue,
  type CampaignRecord,
  type CampaignStatus,
} from '../../../../../shared/campaign'
import {
  createCampaign,
  duplicateCampaign,
  getCampaign,
  updateCampaign,
} from '../services/campaignService'
import {
  formSchema,
  toFormValues,
  toPayload,
  type CampaignFormValues,
} from '../types'
import { WorkflowBanner } from '../../../components/layout/WorkflowBanner'

/* ── Styled Field ─────────────────────────────────────────────── */

function FieldWrapper({
  label,
  hint,
  error,
  wide,
  children,
}: {
  label: string
  hint?: string
  error?: string
  wide?: boolean
  children: React.ReactNode
}) {
  return (
    <label
      className={wide ? 'field field-wide' : 'field'}
      style={{ display: 'flex', flexDirection: 'column', gap: 0 }}
    >
      <span
        style={{
          fontSize: '0.8rem',
          fontWeight: '600',
          color: '#cbd5e1',
          marginBottom: '7px',
          display: 'block',
          letterSpacing: '0.01em',
        }}
      >
        {label}
      </span>
      {children}
      {hint && (
        <p
          style={{
            margin: '5px 0 0',
            fontSize: '0.76rem',
            color: '#475569',
            lineHeight: 1.45,
          }}
        >
          {hint}
        </p>
      )}
      {error && (
        <small
          style={{
            marginTop: '4px',
            fontSize: '0.75rem',
            color: '#fb7185',
            fontWeight: '500',
          }}
        >
          {error}
        </small>
      )}
    </label>
  )
}

/* ── Shared input focus handlers ─────────────────────────────── */

const inputFocusStyle = {
  borderColor: 'rgba(129, 140, 248, 0.55)',
  boxShadow: '0 0 0 3px rgba(99, 102, 241, 0.12)',
  outline: 'none',
}

const inputBlurStyle = {
  borderColor: 'rgba(99, 102, 241, 0.18)',
  boxShadow: 'none',
}

/* ── Section Card ─────────────────────────────────────────────── */

function SectionCard({
  icon,
  title,
  accentColor = 'rgba(99,102,241,0.18)',
  children,
}: {
  icon: string
  title: string
  accentColor?: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        background: 'rgba(15, 23, 42, 0.45)',
        border: '1px solid rgba(99, 102, 241, 0.12)',
        borderRadius: '16px',
        overflow: 'hidden',
        transition: 'border-color 0.2s ease',
      }}
    >
      {/* Section header bar */}
      <div
        style={{
          padding: '16px 28px',
          borderBottom: '1px solid rgba(99, 102, 241, 0.10)',
          background: 'rgba(99, 102, 241, 0.05)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <span
          style={{
            fontSize: '1.15rem',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: accentColor,
            borderRadius: '8px',
            flexShrink: 0,
          }}
        >
          {icon}
        </span>
        <h3
          style={{
            fontSize: '0.95rem',
            fontWeight: '700',
            color: '#e2e8f0',
            margin: 0,
            letterSpacing: '-0.01em',
          }}
        >
          {title}
        </h3>
      </div>
      {/* Section body */}
      <div style={{ padding: '28px' }}>{children}</div>
    </div>
  )
}

/* ── Main Page ───────────────────────────────────────────────── */

export function CampaignSetupPage({ mode }: { mode: 'create' | 'edit' }) {
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams()
  const campaignId = params.id
  const [loading, setLoading] = useState(mode === 'edit')
  const [error, setError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [currentCampaign, setCurrentCampaign] = useState<CampaignRecord | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDuplicating, setIsDuplicating] = useState(false)
  const duplicateNotice = (location.state as { duplicateNotice?: string } | null)?.duplicateNotice

  const form = useForm<CampaignFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(formSchema) as any,
    defaultValues: toFormValues(),
  })

  useEffect(() => {
    if (mode === 'create') {
      form.reset(toFormValues())
      setLoading(false)
      setCurrentCampaign(null)
      return
    }

    let active = true

    async function run() {
      if (!campaignId) {
        setError('Missing campaign id')
        setLoading(false)
        return
      }

      try {
        const campaign = await getCampaign(campaignId)
        if (!active) return
        setCurrentCampaign(campaign)
        form.reset(toFormValues(campaign))
      } catch (requestError) {
        if (!active) return
        setError(requestError instanceof Error ? requestError.message : 'Unable to load campaign')
      } finally {
        if (active) setLoading(false)
      }
    }

    run()

    return () => {
      active = false
    }
  }, [campaignId, form, mode])

  useEffect(() => {
    if (duplicateNotice) {
      setSaveMessage(duplicateNotice)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [duplicateNotice])

  const submit = async (values: CampaignFormValues, nextStatus?: CampaignStatus) => {
    setError('')
    setSaveMessage('')
    setIsSaving(true)

    try {
      const payload = toPayload(values, nextStatus, currentCampaign)
      const saved =
        mode === 'edit' && campaignId
          ? await updateCampaign(campaignId, payload)
          : await createCampaign(payload)

      setCurrentCampaign(saved)
      form.reset(toFormValues(saved))
      setSaveMessage(`Campaign saved as ${saved.status}.`)
      if (mode === 'create') {
        navigate(`/campaigns/${saved.id}/outreach`, { replace: true })
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save campaign')
    } finally {
      setIsSaving(false)
    }
  }

  const saveDraft = async () => {
    setError('')
    setSaveMessage('')

    const isValid = await form.trigger()
    if (!isValid) {
      setError('Please fix the highlighted fields before saving.')
      return
    }

    const values = form.getValues()
    await submit(values, 'draft')
  }

  const handleDuplicateCampaign = async () => {
    if (!currentCampaign?.id) return

    setError('')
    setSaveMessage('')
    setIsDuplicating(true)

    try {
      const duplicated = await duplicateCampaign(currentCampaign.id)
      navigate(`/campaigns/${duplicated.id}`, {
        replace: true,
        state: {
          duplicateNotice: `Duplicated campaign "${duplicated.name}" with ${duplicated.templates_count} template${duplicated.templates_count === 1 ? '' : 's'}.`,
        },
      })
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to duplicate campaign')
    } finally {
      setIsDuplicating(false)
    }
  }

  /* ── Shared input style ─── */
  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: '42px',
    padding: '0 14px',
    borderRadius: '10px',
    border: '1px solid rgba(99, 102, 241, 0.18)',
    background: 'rgba(8, 14, 30, 0.55)',
    color: '#f1f5f9',
    fontSize: '0.875rem',
    transition: 'border-color 0.18s ease, box-shadow 0.18s ease',
  }

  const textareaStyle: React.CSSProperties = {
    ...inputStyle,
    height: 'auto',
    padding: '12px 14px',
    resize: 'vertical',
    lineHeight: 1.6,
  }

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
  }

  return (
    <div className="page-shell">
      <WorkflowBanner
        step="Stage 1"
        title={mode === 'create' ? 'Create a New Campaign' : 'Edit Campaign'}
        description={
          mode === 'create'
            ? 'Fill in the campaign brief, choose the type, set your outreach channels, and save as draft. Outreach templates come next.'
            : 'Update campaign details, adjust outreach channels, and save your changes.'
        }
        badge={duplicateNotice ? 'Copied campaign' : undefined}
        badgeHint={duplicateNotice ? 'Fresh draft created from the original campaign.' : undefined}
        backLink="/campaigns"
        backLabel="← Back to list"
      />

      <section
        className="panel form-panel"
        style={{
          padding: '40px',
          borderRadius: '20px',
        }}
      >
        {loading ? (
          <div
            style={{
              textAlign: 'center',
              padding: '60px 0',
              color: '#475569',
              fontSize: '0.9rem',
            }}
          >
            <div
              style={{
                fontSize: '2rem',
                marginBottom: '12px',
                opacity: 0.5,
                animation: 'spin 1s linear infinite',
              }}
            >
              ⟳
            </div>
            Loading campaign details...
          </div>
        ) : null}

        {error ? (
          <div
            className="alert error"
            style={{ marginBottom: '20px', borderRadius: '10px' }}
          >
            {error}
          </div>
        ) : null}

        {saveMessage ? (
          <div
            className="alert success"
            style={{
              marginBottom: '20px',
              borderRadius: '10px',
              background: 'rgba(16, 185, 129, 0.10)',
              border: '1px solid rgba(16, 185, 129, 0.28)',
              color: '#34d399',
              padding: '12px 16px',
              fontWeight: '600',
              fontSize: '0.875rem',
            }}
          >
            ✅ {saveMessage}
          </div>
        ) : null}

        {/* Quick Actions (for edit mode) */}
        {currentCampaign?.id ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              marginBottom: '32px',
            }}
          >
            {/* Stage 2 CTA */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                padding: '18px 24px',
                background: 'rgba(99, 102, 241, 0.07)',
                border: '1px solid rgba(99, 102, 241, 0.18)',
                borderLeft: '3px solid #6366f1',
                borderRadius: '12px',
              }}
            >
              <div>
                <strong
                  style={{
                    fontSize: '0.9rem',
                    color: '#c7d2fe',
                    display: 'block',
                    marginBottom: '4px',
                  }}
                >
                  ✉️ Next: Stage 2 — Outreach Content
                </strong>
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.82rem',
                    color: '#64748b',
                    lineHeight: 1.4,
                  }}
                >
                  Generate and edit channel-specific templates for WhatsApp, LinkedIn, and more.
                </p>
              </div>
              <button
                className="ghost-button"
                type="button"
                onClick={() => navigate(`/campaigns/${currentCampaign.id}/outreach`)}
                style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                Continue to Outreach →
              </button>
            </div>

            {/* View Applicants (when form exists) */}
            {currentCampaign.application_form_id ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                  padding: '18px 24px',
                  background: 'rgba(16, 185, 129, 0.06)',
                  border: '1px solid rgba(16, 185, 129, 0.18)',
                  borderLeft: '3px solid #10b981',
                  borderRadius: '12px',
                }}
              >
                <div>
                  <strong
                    style={{
                      fontSize: '0.9rem',
                      color: '#6ee7b7',
                      display: 'block',
                      marginBottom: '4px',
                    }}
                  >
                    👥 Candidate Applications Capture
                  </strong>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '0.82rem',
                      color: '#64748b',
                      lineHeight: 1.4,
                    }}
                  >
                    Review applications submitted directly to this campaign.
                  </p>
                </div>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => navigate(`/campaigns/${currentCampaign.id}/applicants`)}
                  style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  View Applicants
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {!loading ? (
          <form
            className="campaign-form campaign-form-single"
            onSubmit={(event) => event.preventDefault()}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

              {/* ── Section 1: Campaign Brief ── */}
              <SectionCard icon="📋" title="Campaign Brief" accentColor="rgba(99,102,241,0.18)">
                <div className="form-grid">
                  <FieldWrapper
                    label="Campaign Name"
                    hint="An internal label to distinguish this campaign (e.g., Warehouse onboarding sprint)"
                    error={form.formState.errors.name?.message}
                  >
                    <input
                      {...form.register('name')}
                      placeholder="Warehouse onboarding sprint"
                      style={inputStyle}
                      onFocus={(e) => Object.assign(e.target.style, inputFocusStyle)}
                      onBlur={(e) => Object.assign(e.target.style, inputBlurStyle)}
                    />
                  </FieldWrapper>

                  <FieldWrapper
                    label="Opportunity Title"
                    hint="The public title candidates see when applying (e.g., Night shift delivery helpers)"
                    error={form.formState.errors.opportunity_title?.message}
                  >
                    <input
                      {...form.register('opportunity_title')}
                      placeholder="Night shift delivery helpers"
                      style={inputStyle}
                      onFocus={(e) => Object.assign(e.target.style, inputFocusStyle)}
                      onBlur={(e) => Object.assign(e.target.style, inputBlurStyle)}
                    />
                  </FieldWrapper>

                  <FieldWrapper
                    label="Opportunity Description"
                    hint="Highlight hours, pay scale structure, key responsibilities, and worker guidelines."
                    error={form.formState.errors.opportunity_desc?.message}
                    wide
                  >
                    <textarea
                      {...form.register('opportunity_desc')}
                      placeholder="Describe the work opportunity, assignment context, and expectations."
                      rows={5}
                      style={textareaStyle}
                      onFocus={(e) => Object.assign(e.target.style, inputFocusStyle)}
                      onBlur={(e) => Object.assign(e.target.style, inputBlurStyle)}
                    />
                  </FieldWrapper>
                </div>
              </SectionCard>

              {/* ── Section 2: Sourcing Profile ── */}
              <SectionCard icon="🎯" title="Sourcing Profile" accentColor="rgba(245,158,11,0.18)">
                <div className="form-grid">
                  <FieldWrapper
                    label="Sourcing Mode"
                    hint="Sourcing method for reaching candidates"
                    error={form.formState.errors.mode?.message}
                  >
                    <select
                      {...form.register('mode')}
                      style={selectStyle}
                      onFocus={(e) => Object.assign(e.target.style, inputFocusStyle)}
                      onBlur={(e) => Object.assign(e.target.style, inputBlurStyle)}
                    >
                      {campaignModes.map((item) => (
                        <option key={item} value={item}>
                          {campaignModeLabels[item]}
                        </option>
                      ))}
                    </select>
                  </FieldWrapper>

                  <FieldWrapper
                    label="Worker Type"
                    hint="E.g., Warehouse picker, Delivery boy, Field sales agent"
                    error={form.formState.errors.worker_type?.message}
                  >
                    <input
                      {...form.register('worker_type')}
                      placeholder="Delivery, warehouse, driver, field sales, helper"
                      style={inputStyle}
                      onFocus={(e) => Object.assign(e.target.style, inputFocusStyle)}
                      onBlur={(e) => Object.assign(e.target.style, inputBlurStyle)}
                    />
                  </FieldWrapper>

                  <FieldWrapper
                    label="Target Region"
                    hint="E.g., Bengaluru East, Mumbai Western Suburbs, Delhi NCR"
                    error={form.formState.errors.target_region?.message}
                  >
                    <input
                      {...form.register('target_region')}
                      placeholder="Delhi NCR"
                      style={inputStyle}
                      onFocus={(e) => Object.assign(e.target.style, inputFocusStyle)}
                      onBlur={(e) => Object.assign(e.target.style, inputBlurStyle)}
                    />
                  </FieldWrapper>

                  <FieldWrapper
                    label="Skills Required"
                    hint="Comma-separated list of required capabilities (e.g., heavy lifting, driving licence)"
                    error={form.formState.errors.skills_required?.message}
                  >
                    <input
                      {...form.register('skills_required')}
                      placeholder="navigation, customer support, time management"
                      style={inputStyle}
                      onFocus={(e) => Object.assign(e.target.style, inputFocusStyle)}
                      onBlur={(e) => Object.assign(e.target.style, inputBlurStyle)}
                    />
                  </FieldWrapper>
                </div>
              </SectionCard>

              {/* ── Section 3: Logistics & Channels ── */}
              <SectionCard icon="⚙️" title="Logistics & Channels" accentColor="rgba(14,165,233,0.18)">
                <div className="form-grid">
                  <FieldWrapper
                    label="Compensation Model"
                    hint="E.g., ₹20,000/month, ₹400/day, or Per Delivery"
                    error={form.formState.errors.compensation_model?.message}
                  >
                    <input
                      {...form.register('compensation_model')}
                      placeholder="$20 / hour, per task, fixed"
                      style={inputStyle}
                      onFocus={(e) => Object.assign(e.target.style, inputFocusStyle)}
                      onBlur={(e) => Object.assign(e.target.style, inputBlurStyle)}
                    />
                  </FieldWrapper>

                  <FieldWrapper
                    label="Start Date"
                    hint="When campaign outreach active window starts"
                    error={form.formState.errors.start_date?.message}
                  >
                    <input
                      type="date"
                      {...form.register('start_date')}
                      style={inputStyle}
                      onFocus={(e) => Object.assign(e.target.style, inputFocusStyle)}
                      onBlur={(e) => Object.assign(e.target.style, inputBlurStyle)}
                    />
                  </FieldWrapper>

                  <FieldWrapper
                    label="End Date"
                    hint="When outreach campaign and forms close"
                    error={form.formState.errors.end_date?.message}
                  >
                    <input
                      type="date"
                      {...form.register('end_date')}
                      style={inputStyle}
                      onFocus={(e) => Object.assign(e.target.style, inputFocusStyle)}
                      onBlur={(e) => Object.assign(e.target.style, inputBlurStyle)}
                    />
                  </FieldWrapper>

                  {/* Channels grid — full row */}
                  <div className="field field-wide">
                    <span
                      style={{
                        fontSize: '0.8rem',
                        fontWeight: '600',
                        color: '#cbd5e1',
                        display: 'block',
                        marginBottom: '10px',
                        letterSpacing: '0.01em',
                      }}
                    >
                      Target Channels
                    </span>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
                        gap: '10px',
                      }}
                    >
                      {outreachChannels.map((channel) => {
                        const currentChannels = splitCsvValue(form.watch('target_channels'))
                        const checked = currentChannels.includes(channel)
                        return (
                          <label
                            key={channel}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '11px 14px',
                              background: checked
                                ? 'rgba(99, 102, 241, 0.12)'
                                : 'rgba(15, 23, 42, 0.45)',
                              border: checked
                                ? '1px solid rgba(99, 102, 241, 0.38)'
                                : '1px solid rgba(99, 102, 241, 0.12)',
                              borderRadius: '10px',
                              cursor: 'pointer',
                              transition: 'all 0.18s ease',
                              userSelect: 'none',
                            }}
                            onMouseEnter={(e) => {
                              if (!checked) {
                                e.currentTarget.style.background = 'rgba(99,102,241,0.06)'
                                e.currentTarget.style.borderColor = 'rgba(99,102,241,0.24)'
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!checked) {
                                e.currentTarget.style.background = 'rgba(15,23,42,0.45)'
                                e.currentTarget.style.borderColor = 'rgba(99,102,241,0.12)'
                              }
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const current = new Set(splitCsvValue(form.getValues('target_channels')))
                                if (e.target.checked) current.add(channel)
                                else current.delete(channel)
                                form.setValue('target_channels', Array.from(current).join(', '), {
                                  shouldValidate: true,
                                })
                              }}
                              style={{ width: 'auto', margin: 0, accentColor: '#6366f1' }}
                            />
                            <span
                              style={{
                                fontSize: '0.84rem',
                                fontWeight: checked ? '600' : '500',
                                color: checked ? '#a5b4fc' : '#94a3b8',
                                transition: 'color 0.18s ease',
                              }}
                            >
                              {outreachChannelLabels[channel]}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                    {form.formState.errors.target_channels?.message && (
                      <small
                        style={{
                          marginTop: '8px',
                          display: 'block',
                          fontSize: '0.75rem',
                          color: '#fb7185',
                          fontWeight: '500',
                        }}
                      >
                        {form.formState.errors.target_channels?.message}
                      </small>
                    )}
                  </div>
                </div>
              </SectionCard>

              {/* ── Section 4: Acknowledgment Channels ── */}
              <SectionCard icon="🔔" title="Acknowledgment Channels" accentColor="rgba(16,185,129,0.18)">
                <div className="form-grid">
                  <div className="field field-wide">
                    <span
                      style={{
                        fontSize: '0.8rem',
                        fontWeight: '600',
                        color: '#cbd5e1',
                        display: 'block',
                        marginBottom: '10px',
                        letterSpacing: '0.01em',
                      }}
                    >
                      Select which channels to use for candidate acknowledgment messages.
                    </span>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                        gap: '12px',
                      }}
                    >
                      {/* Email - Enabled */}
                      {(() => {
                        const currentChannels = form.watch('acknowledgment_channels') || []
                        const checked = currentChannels.includes('email')
                        return (
                          <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '11px 14px',
                              background: checked
                                ? 'rgba(99, 102, 241, 0.12)'
                                : 'rgba(15, 23, 42, 0.45)',
                              border: checked
                                ? '1px solid rgba(99, 102, 241, 0.38)'
                                : '1px solid rgba(99, 102, 241, 0.12)',
                              borderRadius: '10px',
                              cursor: 'pointer',
                              transition: 'all 0.18s ease',
                              userSelect: 'none',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const current = new Set(form.getValues('acknowledgment_channels') || [])
                                if (e.target.checked) current.add('email')
                                else current.delete('email')
                                form.setValue('acknowledgment_channels', Array.from(current), {
                                  shouldValidate: true,
                                })
                              }}
                              style={{ width: 'auto', margin: 0, accentColor: '#6366f1' }}
                            />
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span
                                style={{
                                  fontSize: '0.84rem',
                                  fontWeight: checked ? '600' : '500',
                                  color: checked ? '#a5b4fc' : '#94a3b8',
                                }}
                              >
                                Email
                              </span>
                              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                Enabled & active
                              </span>
                            </div>
                          </label>
                        )
                      })()}

                      {/* SMS - Disabled, Coming Soon */}
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '11px 14px',
                          background: 'rgba(15, 23, 42, 0.2)',
                          border: '1px dashed rgba(99, 102, 241, 0.08)',
                          borderRadius: '10px',
                          cursor: 'not-allowed',
                          opacity: 0.5,
                          userSelect: 'none',
                        }}
                      >
                        <input
                          type="checkbox"
                          disabled
                          style={{ width: 'auto', margin: 0, cursor: 'not-allowed' }}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '0.84rem', fontWeight: '500', color: '#64748b' }}>
                            SMS
                          </span>
                        </div>
                      </label>

                      {/* WhatsApp - Disabled, Coming Soon */}
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '11px 14px',
                          background: 'rgba(15, 23, 42, 0.2)',
                          border: '1px dashed rgba(99, 102, 241, 0.08)',
                          borderRadius: '10px',
                          cursor: 'not-allowed',
                          opacity: 0.5,
                          userSelect: 'none',
                        }}
                      >
                        <input
                          type="checkbox"
                          disabled
                          style={{ width: 'auto', margin: 0, cursor: 'not-allowed' }}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '0.84rem', fontWeight: '500', color: '#64748b' }}>
                            WhatsApp
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              </SectionCard>
            </div>

            {/* ── Save Action Row ── */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
                gap: '12px',
                marginTop: '32px',
                paddingTop: '24px',
                borderTop: '1px solid rgba(99, 102, 241, 0.10)',
              }}
            >
              {/* Hint text */}
              <span
                style={{
                  fontSize: '0.8rem',
                  color: '#475569',
                  marginRight: 'auto',
                }}
              >
                {mode === 'create'
                  ? 'You will be redirected to set up outreach templates after saving.'
                  : 'Changes are saved immediately as draft.'}
              </span>

              {mode === 'edit' && currentCampaign?.id ? (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => void handleDuplicateCampaign()}
                  disabled={isDuplicating || isSaving}
                  style={{
                    minWidth: '180px',
                    height: '44px',
                    borderRadius: '10px',
                    fontWeight: '700',
                    fontSize: '0.88rem',
                    background: 'rgba(15, 23, 42, 0.55)',
                    border: '1px solid rgba(99, 102, 241, 0.18)',
                    color: '#c7d2fe',
                    boxShadow: 'none',
                  }}
                >
                  {isDuplicating ? 'Duplicating...' : 'Duplicate Campaign'}
                </button>
              ) : null}

              <button
                type="button"
                className="primary-button"
                onClick={() => void saveDraft()}
                disabled={isSaving || isDuplicating}
                style={{
                  minWidth: '180px',
                  height: '44px',
                  borderRadius: '10px',
                  fontWeight: '700',
                  fontSize: '0.88rem',
                  letterSpacing: '0.01em',
                  boxShadow: isSaving ? 'none' : '0 4px 18px rgba(99,102,241,0.35)',
                  background: isSaving
                    ? 'rgba(99,102,241,0.45)'
                    : 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                {isSaving ? (
                  <>
                    <span
                      style={{
                        width: '16px',
                        height: '16px',
                        border: '2px solid rgba(255,255,255,0.4)',
                        borderTopColor: '#fff',
                        borderRadius: '50%',
                        display: 'inline-block',
                        animation: 'spin 0.7s linear infinite',
                      }}
                    />
                    Saving...
                  </>
                ) : (
                  'Save Draft & Continue →'
                )}
              </button>
            </div>
          </form>
        ) : null}
      </section>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
