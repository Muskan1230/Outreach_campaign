import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ApplicationFormListItem } from '../../../../../shared/applicationForm'
import { listForms } from '../services/formService'
import { FormCard } from '../components/FormCard'

export function ApplicationFormsListPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<ApplicationFormListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await listForms()
      setItems(response.data)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to load forms')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <div className="page-shell">
      <section className="hero-card template-hero">
        <div>
          <span className="eyebrow">Application form builder</span>
          <h1>Build dynamic application forms with conditional field logic.</h1>
          <p className="hero-copy">
            Create forms, add reusable field types, and preview the application experience before you publish it.
          </p>
        </div>
        <button className="primary-button" type="button" onClick={() => navigate('/campaigns')}>
          Start from Campaign
        </button>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Application forms</h2>
            <p>Open a builder to edit fields or preview the application experience.</p>
          </div>
          <button className="ghost-button" type="button" onClick={() => navigate('/campaigns')}>
            Start from Campaign
          </button>
        </div>

        {error ? <div className="alert error">{error}</div> : null}
        {loading ? <div className="empty-state">Loading forms...</div> : null}
        {!loading && !items.length ? (
          <div className="empty-state">No forms yet. Create your first application form.</div>
        ) : null}

        {!loading && items.length ? (
          <div className="template-grid">
            {items.map((item) => (
              <FormCard key={item.id} form={item} />
            ))}
          </div>
        ) : null}
      </section>
    </div>
  )
}
