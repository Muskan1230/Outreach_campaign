import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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

export function CampaignSetupPage({ mode }: { mode: 'create' | 'edit' }) {
  const navigate = useNavigate()
  const params = useParams()
  const campaignId = params.id
  const [loading, setLoading] = useState(mode === 'edit')
  const [error, setError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [currentCampaign, setCurrentCampaign] = useState<CampaignRecord | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const form = useForm<CampaignFormValues>({
    resolver: zodResolver(formSchema),
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

  const submit = async (values: CampaignFormValues, nextStatus?: CampaignStatus) => {
    setError('')
    setSaveMessage('')
    setIsSaving(true)

    try {
      const payload = toPayload(values, nextStatus)
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

  return (
    <div className="page-shell">
      <WorkflowBanner
        step="Stage 1"
        title="Creating a Campaign"
        description="Fill in the campaign brief, choose the type, set your outreach channels, and save as draft. Outreach templates come next."
        backLink="/campaigns"
        backLabel="Back to list"
      />

      <section className="panel form-panel">
        {loading ? <div className="empty-state">Loading campaign details...</div> : null}
        {error ? <div className="alert error">{error}</div> : null}
        {saveMessage ? <div className="alert success">{saveMessage}</div> : null}

        {currentCampaign?.id ? (
          <div className="stages-stack">
            <div className="stage-next-step">
              <div>
                <strong>✉️ Next: Stage 2 — Outreach Content</strong>
                <p>Generate and edit channel-specific templates for WhatsApp, LinkedIn, and more.</p>
              </div>
              <button
                className="ghost-button"
                type="button"
                onClick={() => navigate(`/campaigns/${currentCampaign.id}/outreach`)}
              >
                Continue to Outreach →
              </button>
            </div>

            {currentCampaign.application_form_id ? (
              <div className="stage-next-step stage-complete">
                <div>
                  <strong>👥 Candidate Applications Capture</strong>
                  <p>Review applications submitted directly to this campaign.</p>
                </div>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => navigate(`/campaigns/${currentCampaign.id}/applicants`)}
                >
                  View Applicants
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {!loading ? (
          <form className="campaign-form campaign-form-single" onSubmit={(event) => event.preventDefault()}>
            <div className="form-grid">
              <label className="field">
                <span>Name</span>
                <input {...form.register('name')} placeholder="Warehouse onboarding sprint" />
                <small>{form.formState.errors.name?.message}</small>
              </label>

              <label className="field">
                <span>Opportunity Title</span>
                <input {...form.register('opportunity_title')} placeholder="Night shift delivery helpers" />
                <small>{form.formState.errors.opportunity_title?.message}</small>
              </label>

              <label className="field field-wide">
                <span>Opportunity Description</span>
                <textarea
                  {...form.register('opportunity_desc')}
                  placeholder="Describe the work opportunity, assignment context, and expectations."
                  rows={5}
                />
                <small>{form.formState.errors.opportunity_desc?.message}</small>
              </label>

              <label className="field">
                <span>Mode</span>
                <select {...form.register('mode')}>
                  {campaignModes.map((item) => (
                    <option key={item} value={item}>
                      {campaignModeLabels[item]}
                    </option>
                  ))}
                </select>
                <small>{form.formState.errors.mode?.message}</small>
              </label>

              <label className="field">
                <span>Worker Type</span>
                <input
                  {...form.register('worker_type')}
                  placeholder="Delivery, warehouse, driver, field sales, helper"
                />
                <small>{form.formState.errors.worker_type?.message}</small>
              </label>

              <label className="field">
                <span>Target Region</span>
                <input {...form.register('target_region')} placeholder="Delhi NCR" />
                <small>{form.formState.errors.target_region?.message}</small>
              </label>

              <label className="field">
                <span>Skills Required</span>
                <input
                  {...form.register('skills_required')}
                  placeholder="navigation, customer support, time management"
                />
                <small>{form.formState.errors.skills_required?.message}</small>
              </label>

              <div className="field field-wide">
                <span className="field-label-text">Target Channels</span>
                <div className="channel-checkbox-grid">
                  {outreachChannels.map((channel) => {
                    const currentChannels = splitCsvValue(form.watch('target_channels'))
                    const checked = currentChannels.includes(channel)
                    return (
                      <label key={channel} className="channel-checkbox-item">
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
                        />
                        <span>{outreachChannelLabels[channel]}</span>
                      </label>
                    )
                  })}
                </div>
                <small>{form.formState.errors.target_channels?.message}</small>
              </div>

              <label className="field">
                <span>Compensation Model</span>
                <input {...form.register('compensation_model')} placeholder="$20 / hour, per task, fixed" />
                <small>{form.formState.errors.compensation_model?.message}</small>
              </label>

              <label className="field">
                <span>Start Date</span>
                <input type="date" {...form.register('start_date')} />
                <small>{form.formState.errors.start_date?.message}</small>
              </label>

              <label className="field">
                <span>End Date</span>
                <input type="date" {...form.register('end_date')} />
                <small>{form.formState.errors.end_date?.message}</small>
              </label>
            </div>

            <div className="action-row action-row-campaign">
              <button className="primary-button" type="button" onClick={() => void saveDraft()} disabled={isSaving}>
                Save Draft
              </button>
            </div>
          </form>
        ) : null}
      </section>
    </div>
  )
}
