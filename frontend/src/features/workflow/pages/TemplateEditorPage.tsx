import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  templateChannels,
  templateChannelLabels,
  type TemplateRecord,
} from '../../../../../shared/template'
import {
  createTemplate,
  deleteTemplate,
  getTemplate,
  updateTemplate,
} from '../services/templateService'
import {
  templateFormSchema,
  toTemplateFormValues,
  toTemplatePayload,
  replaceTemplateTokens,
  templatePreviewTokens,
  type TemplateFormValues,
} from '../types'

export function TemplateEditorPage({ mode }: { mode: 'create' | 'edit' }) {
  const navigate = useNavigate()
  const params = useParams()
  const templateId = params.id
  const [loading, setLoading] = useState(mode === 'edit')
  const [error, setError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [currentTemplate, setCurrentTemplate] = useState<TemplateRecord | null>(null)

  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: toTemplateFormValues(),
  })

  const watchedValues = form.watch()
  const livePreview = replaceTemplateTokens(watchedValues.message_body || '')

  useEffect(() => {
    if (mode === 'create') {
      form.reset(toTemplateFormValues())
      setLoading(false)
      setCurrentTemplate(null)
      return
    }

    let active = true

    async function run() {
      if (!templateId) {
        setError('Missing template id')
        setLoading(false)
        return
      }

      try {
        const template = await getTemplate(templateId)
        if (!active) return
        setCurrentTemplate(template)
        form.reset(toTemplateFormValues(template))
      } catch (requestError) {
        if (!active) return
        setError(requestError instanceof Error ? requestError.message : 'Unable to load template')
      } finally {
        if (active) setLoading(false)
      }
    }

    run()

    return () => {
      active = false
    }
  }, [form, mode, templateId])

  const submit = async (values: TemplateFormValues) => {
    setError('')
    setSaveMessage('')

    const payload = toTemplatePayload(values)

    try {
      const saved =
        mode === 'edit' && templateId
          ? await updateTemplate(templateId, payload)
          : await createTemplate(payload)

      setCurrentTemplate(saved)
      form.reset(toTemplateFormValues(saved))
      setSaveMessage('Template saved successfully.')

      if (mode === 'create') {
        navigate(`/templates/${saved.id}`, { replace: true })
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save template')
    }
  }

  const handleDelete = async () => {
    if (!templateId) return

    const confirmation = window.confirm('Delete this template? This action cannot be undone.')
    if (!confirmation) return

    try {
      await deleteTemplate(templateId)
      navigate('/templates')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to delete template')
    }
  }

  return (
    <div className="page-shell">
      <section className="panel template-editor">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Template editor</span>
            <h1>{mode === 'create' ? 'Create Template' : currentTemplate?.template_name || 'Edit Template'}</h1>
            <p>Compose channel-specific outreach messaging and preview placeholder replacement live.</p>
          </div>
          <button className="ghost-button" type="button" onClick={() => navigate('/templates')}>
            Back to list
          </button>
        </div>

        {loading ? <div className="empty-state">Loading template details...</div> : null}
        {error ? <div className="alert error">{error}</div> : null}
        {saveMessage ? <div className="alert success">{saveMessage}</div> : null}

        {!loading ? (
          <div className="template-editor-grid">
            <form className="campaign-form" onSubmit={form.handleSubmit((values) => void submit(values))}>
              <div className="form-grid">
                <label className="field">
                  <span>Select Channel</span>
                  <select {...form.register('channel')}>
                    {templateChannels.map((channel) => (
                      <option key={channel} value={channel}>
                        {templateChannelLabels[channel]}
                      </option>
                    ))}
                  </select>
                  <small>{form.formState.errors.channel?.message}</small>
                </label>

                <label className="field">
                  <span>Template Name</span>
                  <input {...form.register('template_name')} placeholder="Weekend activation reminder" />
                  <small>{form.formState.errors.template_name?.message}</small>
                </label>

                <label className="field field-wide">
                  <span>Message Body</span>
                  <textarea
                    {...form.register('message_body')}
                    rows={10}
                    placeholder={`Hi {{candidate_name}} 👋,

We have a new opportunity in {{city}} for a {{worker_type}}!

Apply here: {{form_link}}

Regards,
{{recruiter_name}}`}
                  />
                  <small>{form.formState.errors.message_body?.message}</small>
                </label>

                <label className="field">
                  <span>Language</span>
                  <input {...form.register('language')} placeholder="English" />
                  <small>{form.formState.errors.language?.message}</small>
                </label>

                <label className="field">
                  <span>Media Attachment URL</span>
                  <input
                    {...form.register('media_attachment_url')}
                    placeholder="https://cdn.example.com/banner.jpg"
                  />
                  <small>{form.formState.errors.media_attachment_url?.message}</small>
                </label>
              </div>

              <div className="action-row">
                <button className="primary-button" type="submit">
                  {mode === 'create' ? 'Create Template' : 'Save Template'}
                </button>
                {mode === 'edit' ? (
                  <button className="ghost-button" type="button" onClick={handleDelete}>
                    Delete Template
                  </button>
                ) : null}
              </div>
            </form>

            <aside className="preview-panel">
              <div className="preview-header">
                <div>
                  <span className="eyebrow">Live Preview</span>
                  <h2>{watchedValues.template_name || 'Template preview'}</h2>
                </div>
                <span className="status-pill status-active">
                  {templateChannelLabels[watchedValues.channel as keyof typeof templateChannelLabels]}
                </span>
              </div>
              <div className="preview-meta">
                <span>{watchedValues.language || 'Language not set'}</span>
                <span>{watchedValues.media_attachment_url || 'No media URL'}</span>
              </div>
              <pre className="preview-body">
                {livePreview || 'Your template text will appear here as you type.'}
              </pre>
              <div className="preview-token-grid">
                {Object.entries(templatePreviewTokens).map(([token, replacement]) => (
                  <div className="preview-token" key={token}>
                    <strong>{token}</strong>
                    <span>{replacement}</span>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        ) : null}
      </section>
    </div>
  )
}
