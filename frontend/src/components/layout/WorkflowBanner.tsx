import { Link } from 'react-router-dom'

interface WorkflowBannerProps {
  step: string
  title: string
  description: string
  badge?: string
  badgeHint?: string
  backLink?: string
  backLabel?: string
  nextLink?: string
  nextLabel?: string
}

export function WorkflowBanner({
  step,
  title,
  description,
  badge,
  badgeHint,
  backLink,
  backLabel,
  nextLink,
  nextLabel,
}: WorkflowBannerProps) {
  return (
    <section className="hero-card workflow-hero">
      <div>
        <span className="eyebrow">{step}</span>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0 }}>{title}</h1>
          {badge ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: '24px',
                  padding: '0 10px',
                  borderRadius: '999px',
                  background: 'rgba(16, 185, 129, 0.14)',
                  border: '1px solid rgba(16, 185, 129, 0.28)',
                  color: '#6ee7b7',
                  fontSize: '0.72rem',
                  fontWeight: '800',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}
              >
                {badge}
              </span>
              {badgeHint ? (
                <span style={{ color: '#94a3b8', fontSize: '0.78rem', lineHeight: 1.35 }}>
                  {badgeHint}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
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
