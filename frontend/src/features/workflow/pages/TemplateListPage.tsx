import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  templateChannelLabels,
  type TemplateListItem,
} from '../../../../../shared/template'
import { deleteTemplate, listTemplates } from '../services/templateService'

function channelLabel(channel: TemplateListItem['channel']) {
  return templateChannelLabels[channel]
}

export function TemplateListPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<TemplateListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const response = await listTemplates()
      setItems(response.data)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to load templates')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleDelete = async (id: string) => {
    const confirmation = window.confirm('Delete this template? This action cannot be undone.')
    if (!confirmation) return

    try {
      await deleteTemplate(id)
      await refresh()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to delete template')
    }
  }

  return (
    <div className="page-shell">
      <section className="hero-card template-hero">
        <div>
          <span className="eyebrow">Outreach template manager</span>
          <h1>Reusable channel templates with live placeholder preview.</h1>
          <p className="hero-copy">
            Build channel-specific outreach messages for WhatsApp, LinkedIn, Facebook, Instagram,
            and Job Portal campaigns.
          </p>
        </div>
        <button className="primary-button" type="button" onClick={() => navigate('/templates/new')}>
          Create Template
        </button>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Template list</h2>
            <p>Manage existing outreach templates and keep channel messaging consistent.</p>
          </div>
          <button className="ghost-button" type="button" onClick={() => navigate('/templates/new')}>
            Create Template
          </button>
        </div>

        {error ? <div className="alert error">{error}</div> : null}
        {loading ? <div className="empty-state">Loading templates...</div> : null}
        {!loading && !items.length ? <div className="empty-state">No templates yet. Create one to get started.</div> : null}

        {!loading && items.length ? (
          <div className="template-grid">
            {items.map((item) => (
              <article className="template-card" key={item.id}>
                <div className="template-card-head">
                  <div>
                    <span className="status-pill status-active">{channelLabel(item.channel)}</span>
                    <h3>{item.template_name}</h3>
                    <p>{item.language}</p>
                  </div>
                </div>

                <div className="template-snippet">
                  {item.message_body.length > 180
                    ? `${item.message_body.slice(0, 180)}...`
                    : item.message_body}
                </div>
                <p className="template-media">
                  {item.media_attachment_url || 'No media attachment'}
                </p>

                <div className="template-actions">
                  <button className="ghost-button" type="button" onClick={() => navigate(`/templates/${item.id}`)}>
                    Edit
                  </button>
                  <button className="ghost-button" type="button" onClick={() => void handleDelete(item.id)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  )
}
