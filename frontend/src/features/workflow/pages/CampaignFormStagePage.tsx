import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { CampaignRecord } from '../../../../../shared/campaign'
import { getCampaign } from '../../campaigns/services/campaignService'
import { ApplicationFormEditorPage } from '../../forms/pages/FormEditorPage'

export function CampaignFormStagePage() {
  const params = useParams()
  const campaignId = params.id ?? null
  const [campaign, setCampaign] = useState<CampaignRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

  if (loading) {
    return (
      <div className="page-shell">
        <section className="panel">
          <div className="empty-state">Loading campaign details...</div>
        </section>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page-shell">
        <section className="panel">
          <div className="alert error">{error}</div>
        </section>
      </div>
    )
  }

  return (
    <ApplicationFormEditorPage
      mode={campaign?.application_form_id ? 'edit' : 'create'}
      campaignId={campaignId}
      campaignName={campaign?.name ?? undefined}
      formId={campaign?.application_form_id ?? null}
    />
  )
}
