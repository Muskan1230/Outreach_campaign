import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import type { ApplicationFormWithFields, ApplicationFormPayload } from '../../../../../shared/applicationForm'
import { getForm, updateForm } from '../services/formService'
import { FieldPreview } from '../components/FieldPreview'

export function ApplicationFormPreviewPage() {
  const params = useParams()
  const [form, setForm] = useState<ApplicationFormWithFields | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    let active = true

    async function load() {
      if (!params.id) {
        setError('Missing form id')
        setLoading(false)
        return
      }

      try {
        const response = await getForm(params.id)
        if (!active) return
        setForm(response)
      } catch (requestError) {
        if (!active) return
        setError(requestError instanceof Error ? requestError.message : 'Unable to load preview')
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [params.id])

  const handlePublish = async () => {
    if (!form) return
    setPublishing(true)
    setError('')
    setSuccessMessage('')
    try {
      const payload: ApplicationFormPayload = {
        name: form.name,
        description: form.description,
        campaign_id: form.campaign_id,
        supported_languages: form.supported_languages,
        is_published: true,
      }
      const updated = await updateForm(form.id, payload)
      setForm(prev => prev ? { ...prev, is_published: true } : null)
      setSuccessMessage('Form has been published successfully!')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to publish form')
    } finally {
      setPublishing(false)
    }
  }

  if (loading) {
    return (
      <div className="page-shell">
        <section className="panel">
          <div className="empty-state">Loading preview...</div>
        </section>
      </div>
    )
  }

  if (error && !form) {
    return (
      <div className="page-shell">
        <section className="panel">
          <div className="alert error">{error}</div>
        </section>
      </div>
    )
  }

  if (!form) {
    return <Navigate to="/forms" replace />
  }

  return (
    <div className="page-shell">
      {successMessage && <div className="alert success" style={{ marginBottom: 12 }}>{successMessage}</div>}
      {error && <div className="alert error" style={{ marginBottom: 12 }}>{error}</div>}

      <section className="hero-card template-hero" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span className="eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            Application preview
            <span className={`status-pill status-${form.is_published ? 'active' : 'draft'}`} style={{ marginLeft: 8 }}>
              {form.is_published ? '🟢 Published' : '📝 Draft'}
            </span>
          </span>
          <h1>{form.name}</h1>
          <p className="hero-copy">
            {form.description || 'Preview the application experience with conditional logic.'}
          </p>
          {form.is_published ? (
            <p className="hero-copy" style={{ marginTop: 8 }}>
              Public apply link:
              <br />
              <a href={`/apply/${form.id}`} target="_blank" rel="noreferrer">
                {`${window.location.origin}/apply/${form.id}`}
              </a>
            </p>
          ) : (
            <p className="hero-copy" style={{ marginTop: 8, color: '#f59e0b', fontStyle: 'italic' }}>
              Public apply link will be generated once published.
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
          {!form.is_published && (
            <button
              type="button"
              className="primary-button"
              onClick={() => void handlePublish()}
              disabled={publishing}
            >
              {publishing ? 'Publishing…' : '🚀 Publish Form'}
            </button>
          )}
          <Link className="ghost-button" to={`/forms/${form.id}`}>
            Back to Builder
          </Link>
        </div>
      </section>
      <FieldPreview fields={form.fields} title={form.name} />
    </div>
  )
}

