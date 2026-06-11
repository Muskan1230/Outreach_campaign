import { Link } from 'react-router-dom'

interface WorkflowBannerProps {
  step: string
  title: string
  description: string
  backLink?: string
  backLabel?: string
  nextLink?: string
  nextLabel?: string
}

export function WorkflowBanner({
  step,
  title,
  description,
  backLink,
  backLabel,
  nextLink,
  nextLabel,
}: WorkflowBannerProps) {
  return (
    <section className="hero-card workflow-hero">
      <div>
        <span className="eyebrow">{step}</span>
        <h1>{title}</h1>
        <p className="hero-copy">{description}</p>
      </div>
      <div style={{ display: 'flex', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
        {backLink ? (
          <Link className="ghost-button" to={backLink}>
            {backLabel || 'Back'}
          </Link>
        ) : null}
        {nextLink ? (
          <Link
            className="primary-button"
            to={nextLink}
            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none' }}
          >
            {nextLabel || 'Next →'}
          </Link>
        ) : null}
      </div>
    </section>
  )
}
