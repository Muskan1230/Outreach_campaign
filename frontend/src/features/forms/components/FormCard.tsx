import { Link } from 'react-router-dom'
import type { ApplicationFormListItem } from '../../../../../shared/applicationForm'

interface FormCardProps {
  form: ApplicationFormListItem
  onDelete?: (id: string) => void
}

export function FormCard({ form, onDelete }: FormCardProps) {
  return (
    <article className="template-card">
      <div className="template-card-head">
        <div>
          <span className="status-pill status-active">Application Form</span>
          <h3>{form.name}</h3>
          <p>{form.description || 'No description'}</p>
        </div>
      </div>
      <div className="template-snippet">
        v{form.version} · {form.field_count} field{form.field_count === 1 ? '' : 's'}
      </div>
      <p className="template-media">
        {form.campaign_id ? 'Linked to campaign' : 'Standalone form'}
        {form.supported_languages?.length ? ` · ${form.supported_languages.join(', ')}` : ''}
      </p>
      <div className="template-actions">
        <Link className="ghost-button" to={`/forms/${form.id}`}>
          Edit
        </Link>
        <Link className="ghost-button" to={`/forms/${form.id}/preview`}>
          Preview
        </Link>
        {onDelete ? (
          <button className="ghost-button" type="button" onClick={() => onDelete(form.id)}>
            Delete
          </button>
        ) : null}
      </div>
    </article>
  )
}
