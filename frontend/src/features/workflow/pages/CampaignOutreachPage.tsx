import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  campaignModeLabels,
  type CampaignRecord,
} from '../../../../../shared/campaign'
import {
  templateChannels,
  templateChannelLabels,
  normalizeTemplateChannel,
  type TemplateListItem,
} from '../../../../../shared/template'
import { getCampaign } from '../../campaigns/services/campaignService'
import {
  createTemplate,
  deleteTemplate,
  generateTemplateDraft,
  listCampaignTemplates,
  updateTemplate,
} from '../services/templateService'
import {
  templateFormSchema,
  toTemplateFormValues,
  toTemplatePayload,
  type TemplateFormValues,
} from '../types'
import { WorkflowBanner } from '../../../components/layout/WorkflowBanner'

function buildCampaignPreviewTokens(campaign: CampaignRecord | null) {
  return {
    '{{campaign_title}}': campaign?.name || 'Festival Hiring Drive',
    '{{campaign_name}}': campaign?.name || 'Festival Hiring Drive',
    '{{candidate_name}}': 'Rahul Kumar',
    '{{recruiter_name}}': 'Aisha Khan',
    '{{opportunity_type}}': campaign?.opportunity_title || 'Delivery Partner',
    '{{worker_type}}': campaign?.worker_type || 'Delivery gig worker',
    '{{city}}': campaign?.target_region || 'Delhi NCR',
    '{{earning_range}}':
      campaign?.compensation_details && typeof campaign.compensation_details.raw === 'string'
        ? campaign.compensation_details.raw
        : campaign?.compensation_model || '₹18,000 - ₹28,000',
    '{{shift_model}}': campaign ? campaignModeLabels[campaign.mode] : 'Flexible evening shifts',
    '{{form_link}}': campaign?.id
      ? `https://apply.example.com/forms/${campaign.id}`
      : 'https://apply.example.com/festive-drive',
  }
}

function renderTemplatePreview(messageBody: string, campaign: CampaignRecord | null) {
  const tokens = buildCampaignPreviewTokens(campaign)

  return Object.entries(tokens).reduce(
    (accumulator, [token, replacement]) => accumulator.replaceAll(token, replacement),
    messageBody,
  )
}

function CampaignOutreachSection({ campaign }: { campaign: CampaignRecord | null }) {
  const campaignId = campaign?.id ?? ''
  const [templates, setTemplates] = useState<TemplateListItem[]>([])
  const [loading, setLoading] = useState(Boolean(campaignId))
  const [error, setError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [selectedChannel, setSelectedChannel] = useState<TemplateListItem['channel']>('whatsapp')
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [showFormCta, setShowFormCta] = useState(false)
  const navigate = useNavigate()

  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: toTemplateFormValues(),
  })

  const watchedValues = form.watch()
  const livePreview = renderTemplatePreview(watchedValues.message_body || '', campaign)
  const channelField = form.register('channel')

  const availableChannels = useMemo(() => {
    if (!campaign) return templateChannels

    const channelSet = new Set<TemplateListItem['channel']>()
    campaign.target_channels.forEach((channel: string) => {
      channelSet.add(normalizeTemplateChannel(channel))
    })

    return Array.from(channelSet.size ? channelSet : new Set(templateChannels))
  }, [campaign])

  const activeTemplate = useMemo(
    () => templates.find((item) => item.channel === selectedChannel) ?? null,
    [selectedChannel, templates],
  )

  useEffect(() => {
    if (!campaignId) {
      setTemplates([])
      setLoading(false)
      return
    }

    let active = true

    async function run() {
      setLoading(true)
      setError('')

      try {
        const response = await listCampaignTemplates(campaignId)
        if (!active) return
        setTemplates(response.data)
      } catch (requestError) {
        if (!active) return
        setError(
          requestError instanceof Error ? requestError.message : 'Unable to load outreach templates',
        )
      } finally {
        if (active) setLoading(false)
      }
    }

    void run()

    return () => {
      active = false
    }
  }, [campaignId])

  useEffect(() => {
    if (!campaignId) return

    const nextChannel = availableChannels[0]
    if (nextChannel) {
      setSelectedChannel(nextChannel)
    }
  }, [availableChannels, campaignId])

  useEffect(() => {
    if (!campaignId) return

    const template = activeTemplate
    setEditingTemplateId(template?.id ?? null)
    form.reset(toTemplateFormValues(template))
    form.setValue('channel', selectedChannel)
  }, [activeTemplate, campaignId, form, selectedChannel])

  const saveTemplate = async (values: TemplateFormValues) => {
    if (!campaignId) {
      setError('Save the campaign first before configuring outreach templates.')
      return
    }

    setError('')
    setSaveMessage('')

    try {
      const payload = toTemplatePayload(values, campaignId)
      console.log('[CampaignOutreachPage] Saving template with payload:', payload)
      
      const saved = editingTemplateId
        ? await updateTemplate(editingTemplateId, payload)
        : await createTemplate(payload)

      console.log('[CampaignOutreachPage] Template saved successfully:', saved)

      const response = await listCampaignTemplates(campaignId)
      setTemplates(response.data)
      setEditingTemplateId(saved.id)
      setSaveMessage(`Template saved for ${saved.channel} with placeholders intact.`)
      form.reset(toTemplateFormValues(saved))
      setShowFormCta(true)
    } catch (requestError) {
      console.error('[CampaignOutreachPage] Error saving template:', requestError)
      setError(
        requestError instanceof Error ? requestError.message : 'Unable to save outreach template',
      )
    }
  }

  const deleteCurrentTemplate = async () => {
    if (!activeTemplate) return

    const confirmed = window.confirm(
      `Delete the ${activeTemplate.channel} template? This action cannot be undone.`,
    )
    if (!confirmed) return

    try {
      await deleteTemplate(activeTemplate.id)
      const response = await listCampaignTemplates(campaignId)
      setTemplates(response.data)
      setEditingTemplateId(null)
      form.reset(toTemplateFormValues({ ...activeTemplate, message_body: '', template_name: '' }))
      setSaveMessage(`Deleted ${activeTemplate.channel} template.`)
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Unable to delete outreach template',
      )
    }
  }

  const generateDraft = async () => {
    if (!campaignId || !campaign) {
      setError('Save the campaign first before generating outreach drafts.')
      return
    }

    setError('')
    setSaveMessage('')
    setIsGenerating(true)

    try {
      const draft = await generateTemplateDraft({
        campaign_id: campaignId,
        channel: selectedChannel,
        language: form.getValues('language'),
        current_template_name: form.getValues('template_name'),
        current_message_body: form.getValues('message_body'),
      })

      form.reset(toTemplateFormValues(draft))
      form.setValue('channel', draft.channel)
      setEditingTemplateId(activeTemplate?.id ?? null)
      setSaveMessage(
        `AI draft generated for ${templateChannelLabels[draft.channel]}. Review the editable template body and save it when ready.`,
      )
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Unable to generate outreach draft',
      )
    } finally {
      setIsGenerating(false)
    }
  }

  if (!campaignId) {
    return (
      <section className="preview-card">
        <div className="preview-card-head">
          <div>
            <span className="eyebrow">Outreach</span>
            <h2>Configure channel templates after saving the campaign</h2>
          </div>
        </div>
        <div className="empty-state">
          Save the campaign first. Then you can create editable templates for each outreach channel.
        </div>
      </section>
    )
  }

  return (
    <section className="preview-card outreach-panel">
      <div className="preview-card-head">
        <div>
          <span className="eyebrow">Outreach</span>
          <h2>Recruiter configures outreach content</h2>
          <p>
            Start from a smart draft or edit the message for each channel: social post, direct message, InMail,
            and portal description.
          </p>
        </div>
        <span className="status-pill status-active">
          {campaign?.mode ? campaignModeLabels[campaign.mode] : 'Campaign'}
        </span>
      </div>

      <div className="outreach-channel-header">
        <div>
          <h3>Channel templates</h3>
          <p>Select one outreach channel and shape the message your candidates will see.</p>
        </div>
      </div>

      <div className="outreach-channel-bar">
        {availableChannels.map((channel: string) => (
          <button
            key={channel}
            type="button"
            className={channel === selectedChannel ? 'nav-pill active' : 'nav-pill'}
            onClick={() => setSelectedChannel(channel as TemplateListItem['channel'])}
          >
            {templateChannelLabels[channel as TemplateListItem['channel']]}
          </button>
        ))}
      </div>

      {error ? <div className="alert error">{error}</div> : null}
      {saveMessage ? <div className="alert success">{saveMessage}</div> : null}
      {showFormCta && campaignId ? (
        <div className="outreach-cta-toast">
          <div className="outreach-cta-toast__body">
            <span className="outreach-cta-toast__icon">✅</span>
            <div>
              <p className="outreach-cta-toast__title">Outreach template saved!</p>
              <p className="outreach-cta-toast__sub">Now set up the application form candidates will fill out.</p>
            </div>
          </div>
          <div className="outreach-cta-toast__actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => navigate(`/campaigns/${campaignId}/form`)}
            >
              Continue to Form Setup →
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setShowFormCta(false)}
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      ) : null}
      {loading ? <div className="empty-state">Loading outreach templates...</div> : null}

      <div className="template-editor-grid outreach-grid">
        <form className="campaign-form" onSubmit={form.handleSubmit((values) => void saveTemplate(values))}>
          <div className="form-grid">
            <label className="field">
              <span>Channel</span>
              <select
                {...channelField}
                onChange={(event) => {
                  channelField.onChange(event)
                  setSelectedChannel(event.target.value as TemplateListItem['channel'])
                }}
              >
                {availableChannels.map((channel: string) => (
                  <option key={channel} value={channel}>
                    {templateChannelLabels[channel as TemplateListItem['channel']]}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Template Name</span>
              <input
                {...form.register('template_name')}
                placeholder="WhatsApp reminder for approved candidates"
              />
            </label>

            <label className="field field-wide">
              <span>Template Body</span>
              <textarea
                {...form.register('message_body')}
                rows={10}
                placeholder="Hello {{recruiter_name}}, we have a new opportunity in {{city}}..."
              />
              <small>Save the placeholder version. The rendered preview is shown on the right.</small>
            </label>

            <label className="field">
              <span>Language</span>
              <input {...form.register('language')} placeholder="English" />
            </label>

            <label className="field">
              <span>Media Attachment URL</span>
              <input
                {...form.register('media_attachment_url')}
                placeholder="https://cdn.example.com/banner.jpg"
              />
            </label>
          </div>

          <div className="action-row">
            <button className="ghost-button" type="button" onClick={() => void generateDraft()} disabled={isGenerating}>
              {isGenerating ? 'Generating...' : 'Generate AI Draft'}
            </button>
            <button className="primary-button" type="submit">
              {editingTemplateId ? 'Update Template' : 'Create Template'}
            </button>
            <button
              className="ghost-button"
              type="button"
              onClick={() => void deleteCurrentTemplate()}
              disabled={!activeTemplate}
            >
              Delete Template
            </button>
          </div>
          <p className="template-note">
            The editable text on the left is the reusable template. The right side shows how it will render for the
            current campaign.
          </p>
        </form>

        <aside className="preview-panel">
          <div className="preview-header">
            <div>
              <span className="eyebrow">Rendered Preview</span>
              <h2>{watchedValues.template_name || templateChannelLabels[selectedChannel]}</h2>
            </div>
            <span className="status-pill status-active">{templateChannelLabels[selectedChannel]}</span>
          </div>
          <div className="preview-meta">
            <span>{watchedValues.language || 'Language not set'}</span>
            <span>{watchedValues.media_attachment_url || 'No media URL'}</span>
          </div>
          <pre className="preview-body">
            {livePreview || 'Your rendered message will appear here as you type.'}
          </pre>
        </aside>
      </div>

      <div className="template-grid outreach-template-grid">
        {templates.length ? (
          templates.map((item) => (
            <article className="template-card" key={item.id}>
              <div className="template-card-head">
                <div>
                  <span className="status-pill status-active">{item.channel}</span>
                  <h3>{item.template_name}</h3>
                  <p>{item.language}</p>
                </div>
              </div>
              <div className="template-snippet">
                {item.message_body.length > 180 ? `${item.message_body.slice(0, 180)}...` : item.message_body}
              </div>
              <p className="template-media">{item.media_attachment_url || 'No media attachment'}</p>
              <div className="template-actions">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => {
                    setSelectedChannel(item.channel)
                    setEditingTemplateId(item.id)
                    form.reset(toTemplateFormValues(item))
                  }}
                >
                  Edit
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={async () => {
                    const confirmed = window.confirm(`Delete the ${item.channel} template?`)
                    if (!confirmed) return
                    await deleteTemplate(item.id)
                    const response = await listCampaignTemplates(campaignId)
                    setTemplates(response.data)
                  }}
                >
                  Delete
                </button>
              </div>
            </article>
          ))
        ) : (
          <div className="empty-state">
            No templates for this campaign yet. Create the first channel message above.
          </div>
        )}
      </div>

      <div style={{ marginTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          className="primary-button"
          type="button"
          onClick={() => {
            if (!campaignId) return
            navigate(`/campaigns/${campaignId}/form`)
          }}
          disabled={!campaignId}
        >
          Continue to Form →
        </button>
      </div>
    </section>
  )
}

export function CampaignOutreachPage() {
  const params = useParams()
  const campaignId = params.id
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [campaign, setCampaign] = useState<CampaignRecord | null>(null)

  useEffect(() => {
    let active = true

    async function run() {
      if (!campaignId) {
        setError('Missing campaign id')
        setLoading(false)
        return
      }

      try {
        const item = await getCampaign(campaignId)
        if (!active) return
        setCampaign(item)
      } catch (requestError) {
        if (!active) return
        setError(requestError instanceof Error ? requestError.message : 'Unable to load campaign')
      } finally {
        if (active) setLoading(false)
      }
    }

    void run()

    return () => {
      active = false
    }
  }, [campaignId])

  return (
    <div className="page-shell">
      <WorkflowBanner
        step="Stage 2"
        title="Writing Outreach Content"
        description="Use ready-made, editable templates for WhatsApp, LinkedIn, Facebook, Instagram, and job portals. Generate an AI draft when you want a head start."
        backLink={campaignId ? `/campaigns/${campaignId}` : '/campaigns'}
        backLabel="← Back to campaign"
        nextLink={campaignId ? `/campaigns/${campaignId}/distribute` : undefined}
        nextLabel="⚡ Go Live →"
      />

      <section className="panel">
        {loading ? <div className="empty-state">Loading campaign details...</div> : null}
        {error ? <div className="alert error">{error}</div> : null}
        {!loading && !error ? <CampaignOutreachSection campaign={campaign} /> : null}
      </section>

    </div>
  )
}
