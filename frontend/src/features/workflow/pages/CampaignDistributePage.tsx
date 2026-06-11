import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { CampaignRecord, CampaignStatus } from '../../../../../shared/campaign'
import type { TemplateListItem } from '../../../../../shared/template'
import { getCampaign, updateCampaignStatus } from '../../campaigns/services/campaignService'
import { listCampaignTemplates } from '../services/templateService'
import { getForm } from '../../forms/services/formService'
import { createTrackingLink, getTrackingLinks, type TrackingLink } from '../../campaigns/services/trackingLinkService'
import type { ApplicationFormWithFields } from '../../../../../shared/applicationForm'

/* ─── Types ─────────────────────────────────────────────────── */

type ChannelKey = 'whatsapp' | 'linkedin' | 'facebook' | 'instagram' | 'job_portal'

interface ChannelConfig {
  key: ChannelKey
  label: string
  icon: ReactNode
  srcParam: string
  color: string
  hint: string
  postingGuide: string
}

/* ─── Channel config ─────────────────────────────────────────── */

const CHANNELS: ChannelConfig[] = [
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
    ),
    srcParam: 'wa',
    color: '#25d366',
    hint: 'Broadcast lists, groups, or direct message',
    postingGuide: 'Paste into WhatsApp Web or Business App. Use Broadcast Lists to reach multiple candidates at once.',
  },
  {
    key: 'linkedin',
    label: 'LinkedIn',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
      </svg>
    ),
    srcParam: 'li',
    color: '#0077b5',
    hint: 'Job posts, articles, or InMail',
    postingGuide: 'Post as a LinkedIn Update or Job Posting. For direct outreach, use LinkedIn InMail or connection requests.',
  },
  {
    key: 'facebook',
    label: 'Facebook',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    ),
    srcParam: 'fb',
    color: '#1877f2',
    hint: 'Groups, Pages, or Marketplace',
    postingGuide: 'Post in relevant local job groups or your company Facebook Page. Pin the post for better visibility.',
  },
  {
    key: 'instagram',
    label: 'Instagram',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
      </svg>
    ),
    srcParam: 'ig',
    color: '#e1306c',
    hint: 'Stories, Reels, or feed posts',
    postingGuide: 'Use Instagram Stories with a link sticker, or post as a Reel with the link in bio. Add relevant hashtags.',
  },
  {
    key: 'job_portal',
    label: 'Job Portal',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
      </svg>
    ),
    srcParam: 'nk',
    color: '#6366f1',
    hint: 'Naukri, WorkIndia, Apna, and more',
    postingGuide: 'Copy the job description and paste into portal job posting forms. Include the tracking link in the application URL field.',
  },
]

/* ─── Helpers ────────────────────────────────────────────────── */

function buildApplyUrlFromTrackingLink(trackingLink: TrackingLink): string {
  return `${window.location.origin}/apply/${trackingLink.campaign_id.slice(0, 8)}?track=${trackingLink.id}`
}

function buildApplyUrlLegacy(formId: string | null | undefined, srcParam: string): string {
  if (!formId) return ''
  return `${window.location.origin}/apply/${formId}?src=${srcParam}`
}

function buildTrackingUrl(
  trackingLinks: Map<string, TrackingLink>,
  config: ChannelConfig,
  formId: string | null | undefined,
): string {
  const tl = trackingLinks.get(config.key)
  if (tl) return `${window.location.origin}/apply/${formId}?track=${tl.id}`
  return buildApplyUrlLegacy(formId, config.srcParam)
}

function buildRenderedMessage(template: TemplateListItem | null | undefined, campaign: CampaignRecord, trackingUrl: string): string {
  if (!template?.message_body) {
    return `Hi! We have an exciting opportunity for ${campaign.opportunity_title} in ${campaign.target_region}.\n\nApply now: ${trackingUrl}`
  }
  const tokens: Record<string, string> = {
    '{{campaign_title}}': campaign.name,
    '{{campaign_name}}': campaign.name,
    '{{candidate_name}}': 'Candidate',
    '{{recruiter_name}}': 'Recruiter',
    '{{opportunity_type}}': campaign.opportunity_title,
    '{{worker_type}}': campaign.worker_type,
    '{{city}}': campaign.target_region,
    '{{earning_range}}': typeof campaign.compensation_details?.raw === 'string'
      ? campaign.compensation_details.raw
      : campaign.compensation_model,
    '{{form_link}}': trackingUrl,
  }
  let msg = template.message_body
  for (const [k, v] of Object.entries(tokens)) {
    msg = msg.replaceAll(k, v)
  }
  if (!msg.includes(trackingUrl)) {
    msg = `${msg}\n\nApply here: ${trackingUrl}`
  }
  return msg
}

function statusLabel(status: CampaignStatus): string {
  const labels: Record<CampaignStatus, string> = {
    draft: 'Draft',
    pending_approval: 'Pending Approval',
    active: 'Active',
    paused: 'Paused',
    archived: 'Archived',
  }
  return labels[status] ?? status
}

/* ─── Quick copy mini-button ─────────────────────────────────── */

function QuickCopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(text)
    setDone(true)
    setTimeout(() => setDone(false), 1800)
  }
  return (
    <button type="button" className={`dist-quick-copy${done ? ' dist-quick-copy--done' : ''}`} onClick={() => void copy()}>
      {done ? '✓' : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
      )}
    </button>
  )
}

/* ─── Channel Card (Redesigned) ──────────────────────────────── */

function ChannelCard({
  config,
  template,
  campaign,
  isActive,
  isFormPublished,
  trackingLinks,
}: {
  config: ChannelConfig
  template: TemplateListItem | null | undefined
  campaign: CampaignRecord
  isActive: boolean
  isFormPublished: boolean
  trackingLinks: Map<string, TrackingLink>
}) {
  const [copiedAll, setCopiedAll] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  const trackingUrl = isFormPublished
    ? buildTrackingUrl(trackingLinks, config, campaign.application_form_id)
    : ''
  const trackingLink = trackingLinks.get(config.key)
  const fullMessage = isFormPublished ? buildRenderedMessage(template, campaign, trackingUrl) : ''
  const hasForm = isFormPublished

  const copyAll = async () => {
    await navigator.clipboard.writeText(fullMessage)
    setCopiedAll(true)
    setTimeout(() => setCopiedAll(false), 2000)
  }

  const copyLink = async () => {
    await navigator.clipboard.writeText(trackingUrl)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
  }

  return (
    <div className={`dist-channel-card${isActive ? ' dist-channel-card--active' : ''}`}>

      {/* ── Card Header ── */}
      <div className="dist-channel-header">
        <div className="dist-channel-icon" style={{ background: `${config.color}18`, color: config.color }}>
          {config.icon}
        </div>
        <div className="dist-channel-meta">
          <span className="dist-channel-name">{config.label}</span>
          <span className="dist-channel-hint">{config.hint}</span>
        </div>
        <div className="dist-channel-header-right">
          {template ? (
            <span className="dist-badge dist-badge--green">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Template ready
            </span>
          ) : (
            <span className="dist-badge dist-badge--muted">No template</span>
          )}
        </div>
      </div>

      {/* ── Tracking Link Card ── */}
      <div className="dist-link-section">
        <div className="dist-section-label">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
          </svg>
          Tracking Link
          {trackingLink ? (
            <span className="dist-param-chip dist-param-chip--tracked">
              {trackingLink.total_clicks} click{trackingLink.total_clicks !== 1 ? 's' : ''}
            </span>
          ) : (
            <span className="dist-param-chip">?src={config.srcParam}</span>
          )}
        </div>

        {hasForm ? (
          <div className="dist-link-field">
            <div className="dist-link-field-url">
              <span className="dist-link-field-text">{trackingUrl}</span>
            </div>
            <button
              type="button"
              className={`dist-link-copy-btn${copiedLink ? ' dist-link-copy-btn--done' : ''}`}
              onClick={() => void copyLink()}
            >
              {copiedLink ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Copied
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                  Copy link
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="dist-link-field dist-link-field--empty">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span>Publish the application form first to generate tracking links</span>
          </div>
        )}
      </div>

      {/* ── Message Preview ── */}
      <div className="dist-message-section">
        <div className="dist-section-label">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          Message Preview
        </div>
        <pre className="dist-message-body">
          {hasForm
            ? fullMessage
            : (template?.message_body || 'No message template configured for this channel.')}
        </pre>
      </div>

      {/* ── Posting Guide ── */}
      <div className="dist-guide-row">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2, color: '#4b5563' }}>
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>{config.postingGuide}</span>
      </div>

      {/* ── Primary Action ── */}
      <div className="dist-card-footer">
        <button
          type="button"
          className={`dist-primary-action${copiedAll ? ' dist-primary-action--done' : ''}${!hasForm ? ' dist-primary-action--disabled' : ''}`}
          onClick={() => void copyAll()}
          disabled={!hasForm}
          title={!hasForm ? 'Publish form first to enable copying' : `Copy ${config.label} message + tracking link`}
        >
          {copiedAll ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Copied to clipboard!
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              Copy message + link
            </>
          )}
        </button>
      </div>
    </div>
  )
}

/* ─── Campaign Status Sidebar ────────────────────────────────── */

function StatusSidebar({
  campaign,
  templates,
  form,
  isFormPublished,
  onStatusChange,
  saving,
  statusError,
  activeChannel,
  setActiveChannel,
}: {
  campaign: CampaignRecord
  templates: TemplateListItem[]
  form: ApplicationFormWithFields | null
  isFormPublished: boolean
  onStatusChange: (status: CampaignStatus) => void
  saving: boolean
  statusError: string
  activeChannel: ChannelKey
  setActiveChannel: (key: ChannelKey) => void
}) {
  const status = campaign.status
  const isLive = status === 'active'
  const templateMap = new Map(templates.map(t => [t.channel, t]))

  const steps = [
    { key: 'draft', label: 'Draft', done: status !== 'draft' },
    { key: 'pending_approval', label: 'In Review', done: status === 'active' || status === 'paused' },
    { key: 'active', label: 'Live', done: status === 'active' },
  ]

  return (
    <aside className="dist-sidebar">

      {/* Campaign identity */}
      <div className="dist-sidebar-section dist-sidebar-identity">
        <div className="dist-campaign-eyebrow">Campaign</div>
        <div className="dist-campaign-name">{campaign.name}</div>
        <div className={`dist-status-chip dist-status-chip--${status}`}>
          {isLive && <span className="dist-live-dot" />}
          {statusLabel(status)}
        </div>
      </div>

      {/* Workflow progress */}
      <div className="dist-sidebar-section">
        <div className="dist-sidebar-label">Progress</div>
        <div className="dist-workflow-steps">
          {steps.map((step, i) => (
            <div key={step.key} className="dist-workflow-step">
              <div className={`dist-workflow-node${step.done ? ' done' : ''}${campaign.status === step.key ? ' current' : ''}`}>
                {step.done
                  ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  : <span>{i + 1}</span>
                }
              </div>
              {i < steps.length - 1 && (
                <div className={`dist-workflow-line${step.done ? ' done' : ''}`} />
              )}
              <span className="dist-workflow-label">{step.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Form publish warning */}
      {!isFormPublished && (
        <div className="dist-warn-block">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <div>
            <strong>Form not published</strong>
            <p>Publish the application form in Stage 3 to activate tracking links.</p>
          </div>
        </div>
      )}

      {/* Status error */}
      {statusError && (
        <div className="dist-error-block">{statusError}</div>
      )}

      {/* Action buttons */}
      <div className="dist-sidebar-section dist-sidebar-actions">
        <div className="dist-sidebar-label">Actions</div>

        {status === 'draft' && (
          <>
            <button type="button" className="dist-action-btn dist-action-btn--ghost" onClick={() => onStatusChange('pending_approval')} disabled={saving}>
              {saving ? 'Updating…' : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                  Request Approval
                </>
              )}
            </button>
            <button type="button" className="dist-action-btn dist-action-btn--primary" onClick={() => onStatusChange('active')} disabled={saving}>
              {saving ? 'Activating…' : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3"/>
                  </svg>
                  Go Live Now
                </>
              )}
            </button>
          </>
        )}

        {status === 'pending_approval' && (
          <>
            <button type="button" className="dist-action-btn dist-action-btn--ghost" onClick={() => onStatusChange('draft')} disabled={saving}>
              Back to Draft
            </button>
            <button type="button" className="dist-action-btn dist-action-btn--primary" onClick={() => onStatusChange('active')} disabled={saving}>
              {saving ? 'Approving…' : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3"/>
                  </svg>
                  Approve & Go Live
                </>
              )}
            </button>
          </>
        )}

        {status === 'active' && (
          <button type="button" className="dist-action-btn dist-action-btn--ghost" onClick={() => onStatusChange('paused')} disabled={saving}>
            {saving ? 'Pausing…' : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="6" y="4" width="4" height="16"/>
                  <rect x="14" y="4" width="4" height="16"/>
                </svg>
                Pause Campaign
              </>
            )}
          </button>
        )}

        {status === 'paused' && (
          <button type="button" className="dist-action-btn dist-action-btn--primary" onClick={() => onStatusChange('active')} disabled={saving}>
            {saving ? 'Resuming…' : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                Resume Campaign
              </>
            )}
          </button>
        )}
      </div>

      {/* Campaign details */}
      <div className="dist-sidebar-section">
        <div className="dist-sidebar-label">Campaign Details</div>
        <div className="dist-detail-rows">
          <div className="dist-detail-row">
            <span className="dist-detail-key">Role</span>
            <span className="dist-detail-val">{campaign.opportunity_title}</span>
          </div>
          <div className="dist-detail-row">
            <span className="dist-detail-key">Region</span>
            <span className="dist-detail-val">{campaign.target_region}</span>
          </div>
          <div className="dist-detail-row">
            <span className="dist-detail-key">Worker type</span>
            <span className="dist-detail-val">{campaign.worker_type}</span>
          </div>
          <div className="dist-detail-row">
            <span className="dist-detail-key">Pay</span>
            <span className="dist-detail-val">
              {typeof campaign.compensation_details?.raw === 'string'
                ? campaign.compensation_details.raw
                : campaign.compensation_model}
            </span>
          </div>
          <div className="dist-detail-row">
            <span className="dist-detail-key">Apply page</span>
            <span className="dist-detail-val">
              {isFormPublished ? (
                <a href={`/apply/${campaign.application_form_id}`} target="_blank" rel="noreferrer" className="dist-apply-link">
                  View ↗
                </a>
              ) : (
                <span style={{ color: '#6b7280', fontStyle: 'italic' }}>Not published</span>
              )}
            </span>
          </div>
          <div className="dist-detail-row">
            <span className="dist-detail-key">Templates</span>
            <span className="dist-detail-val">{templates.length} / {CHANNELS.length} channels</span>
          </div>
        </div>
      </div>

      {/* Channel readiness */}
      <div className="dist-sidebar-section">
        <div className="dist-sidebar-label">Channels</div>
        <div className="dist-channel-list">
          {CHANNELS.map(c => {
            const has = templateMap.has(c.key)
            const isSelected = activeChannel === c.key
            return (
              <button
                key={c.key}
                type="button"
                className={`dist-ch-row${isSelected ? ' dist-ch-row--active' : ''}${!has ? ' dist-ch-row--missing' : ''}`}
                onClick={() => setActiveChannel(c.key)}
              >
                <span className="dist-ch-row-icon" style={{ color: has ? c.color : undefined }}>{c.icon}</span>
                <span className="dist-ch-row-label">{c.label}</span>
                <span className={`dist-ch-row-dot${has ? ' dist-ch-row-dot--ready' : ''}`} />
              </button>
            )
          })}
        </div>
      </div>

    </aside>
  )
}

/* ─── Main Page ──────────────────────────────────────────────── */

export function CampaignDistributePage() {
  const params = useParams()
  const campaignId = params.id ?? null
  const navigate = useNavigate()

  const [campaign, setCampaign] = useState<CampaignRecord | null>(null)
  const [templates, setTemplates] = useState<TemplateListItem[]>([])
  const [form, setForm] = useState<ApplicationFormWithFields | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusError, setStatusError] = useState('')
  const [saving, setSaving] = useState(false)
  const [activeChannel, setActiveChannel] = useState<ChannelKey>('whatsapp')
  const [justWentLive, setJustWentLive] = useState(false)
  // Tracking links state: channel key → TrackingLink record
  const [trackingLinks, setTrackingLinks] = useState<Map<string, TrackingLink>>(new Map())

  const load = useCallback(async () => {
    if (!campaignId) { setError('Missing campaign ID'); setLoading(false); return }
    setLoading(true); setError('')
    try {
      const [camp, tmplResp] = await Promise.all([
        getCampaign(campaignId),
        listCampaignTemplates(campaignId),
      ])
      setCampaign(camp)
      setTemplates(tmplResp.data)

      let formData: ApplicationFormWithFields | null = null
      if (camp.application_form_id) {
        try {
          formData = await getForm(camp.application_form_id)
          setForm(formData)
        } catch (formLoadErr) {
          console.error('Failed to load linked form details:', formLoadErr)
        }
      }

      // Eagerly load existing tracking links, then create missing ones
      if (camp.application_form_id && formData?.is_published) {
        try {
          // First, fetch existing tracking links
          const existing = await getTrackingLinks(campaignId)
          const linkMap = new Map<string, TrackingLink>()
          existing.data.forEach(tl => linkMap.set(tl.channel, tl))

          // Create tracking links for any channel that doesn't have one yet
          const campaignName = camp.name || ''
          const createPromises = CHANNELS.map(async (ch) => {
            if (!linkMap.has(ch.key)) {
              try {
                const newLink = await createTrackingLink(
                  campaignId,
                  ch.key,
                  ch.srcParam,
                  ch.key === 'job_portal' ? 'job_portal' : 'social',
                  campaignName,
                )
                linkMap.set(ch.key, newLink)
              } catch (createErr) {
                console.warn(`[tracking] Failed to create link for ${ch.key}:`, createErr)
              }
            }
          })
          await Promise.allSettled(createPromises)
          setTrackingLinks(new Map(linkMap))
        } catch (tlErr) {
          console.warn('[tracking] Failed to load tracking links:', tlErr)
        }
      }

      const firstMatch = CHANNELS.find(c => tmplResp.data.some(t => t.channel === c.key))
      if (firstMatch) setActiveChannel(firstMatch.key)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load campaign')
    } finally {
      setLoading(false)
    }
  }, [campaignId])

  useEffect(() => { void load() }, [load])

  const handleStatusChange = async (newStatus: CampaignStatus) => {
    if (!campaignId) return
    setSaving(true); setStatusError('')
    try {
      const updated = await updateCampaignStatus(campaignId, newStatus)
      setCampaign(updated)
      if (newStatus === 'active') {
        setJustWentLive(true)
      }
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : 'Failed to update status')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="page-shell">
        <section className="panel"><div className="empty-state">Loading campaign…</div></section>
      </div>
    )
  }

  if (error || !campaign) {
    return (
      <div className="page-shell">
        <section className="panel"><div className="alert error">{error || 'Campaign not found'}</div></section>
      </div>
    )
  }

  const templateMap = new Map(templates.map(t => [t.channel, t]))
  const isFormPublished = Boolean(campaign.application_form_id && form?.is_published)
  const isLive = campaign.status === 'active'
  const activeConfig = CHANNELS.find(c => c.key === activeChannel)!

  return (
    <div className="page-shell">

      {/* ── Top Navigation Bar ── */}
      <div className="dist-topbar">
        <div className="dist-topbar-left">
          <Link className="dist-nav-link" to={`/campaigns/${campaignId}/form`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Form Builder
          </Link>
          <span className="dist-topbar-divider" />
          <div className="dist-breadcrumb">
            <span className="dist-breadcrumb-stage">Stage 4</span>
            <span className="dist-breadcrumb-title">Distribute & Go Live</span>
          </div>
        </div>
        <div className="dist-topbar-right">
          {isLive && (
            <span className="dist-live-badge">
              <span className="dist-live-dot" />
              Live
            </span>
          )}
          <Link className="dist-nav-link" to={`/campaigns/${campaignId}/applicants`}>
            View Applicants
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Link>
        </div>
      </div>

      {/* ── Form Not Published Banner ── */}
      {!isFormPublished && (
        <div className="dist-global-warn">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span>
            <strong>Application form not published.</strong> Tracking links and copy actions are disabled until you publish the form in Stage 3.
          </span>
          <Link to={`/campaigns/${campaignId}/form`} className="dist-warn-action">
            Go to Form Builder →
          </Link>
        </div>
      )}

      {/* ── Main Layout ── */}
      <div className="dist-layout">

        {/* Left sidebar */}
        <StatusSidebar
          campaign={campaign}
          templates={templates}
          form={form}
          isFormPublished={isFormPublished}
          onStatusChange={(s) => void handleStatusChange(s)}
          saving={saving}
          statusError={statusError}
          activeChannel={activeChannel}
          setActiveChannel={setActiveChannel}
        />

        {/* Right main panel */}
        <main className="dist-main-panel">

          {/* Channel Tab Bar */}
          <div className="dist-tabs">
            {CHANNELS.map(c => {
              const has = templateMap.has(c.key)
              const isSelected = activeChannel === c.key
              return (
                <button
                  key={c.key}
                  type="button"
                  className={`dist-tab${isSelected ? ' dist-tab--active' : ''}`}
                  style={isSelected ? { '--tab-color': c.color } as React.CSSProperties : {}}
                  onClick={() => setActiveChannel(c.key)}
                >
                  <span style={{ color: isSelected ? c.color : undefined }}>{c.icon}</span>
                  {c.label}
                  <span className={`dist-tab-pip${has ? ' dist-tab-pip--ready' : ''}`} />
                </button>
              )
            })}
          </div>

          {/* Active Channel Card */}
          <ChannelCard
            key={activeChannel}
            config={activeConfig}
            template={templateMap.get(activeChannel)}
            campaign={campaign}
            isActive={isLive}
            isFormPublished={isFormPublished}
            trackingLinks={trackingLinks}
          />

          {/* No-template empty state for current channel */}
          {!templateMap.has(activeChannel) && (
            <div className="dist-empty-template">
              <div className="dist-empty-template-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </div>
              <div>
                <p className="dist-empty-template-title">No {activeConfig?.label} template yet</p>
                <p className="dist-empty-template-sub">
                  <Link to={`/campaigns/${campaignId}/outreach`}>Set up an outreach template</Link> to enable message copy for this channel.
                </p>
              </div>
            </div>
          )}

          {/* All-channels summary table — shows all channels with tracking links (not just those with templates) */}
          {isFormPublished && (trackingLinks.size > 0 || templates.length > 1) && (
            <div className="dist-all-links-card">
              <div className="dist-all-links-title">All Channel Tracking Links</div>
              <div className="dist-all-links-table">
                {CHANNELS.map(c => {
                  const url = buildTrackingUrl(trackingLinks, c, campaign.application_form_id)
                  const tl = trackingLinks.get(c.key)
                  if (!url) return null
                  return (
                    <div key={c.key} className="dist-all-links-row">
                      <span className="dist-all-links-channel" style={{ color: c.color }}>
                        {c.icon}
                        {c.label}
                      </span>
                      <span className="dist-all-links-url">{url}</span>
                      {tl && (
                        <span className="dist-all-links-clicks">
                          {tl.total_clicks} click{tl.total_clicks !== 1 ? 's' : ''}
                        </span>
                      )}
                      <QuickCopyBtn text={url} />
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Next step CTA if live (always visible when active) */}
          {isLive && !justWentLive && (
            <div className="dist-next-cta">
              <div>
                <p className="dist-next-cta-title">🟢 Campaign is live</p>
                <p className="dist-next-cta-sub">Copy channel messages above and start posting. Track incoming applicants as they apply.</p>
              </div>
              <button
                type="button"
                className="dist-action-btn dist-action-btn--primary"
                onClick={() => navigate(`/campaigns/${campaignId}/applicants`)}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                Track Applicants
              </button>
            </div>
          )}
        </main>
      </div>

      {/* ── Go-Live Success Banner ── */}
      {justWentLive && (
        <div className="dist-golive-banner">
          <div className="dist-golive-banner__inner">
            <div className="dist-golive-banner__left">
              <span className="dist-golive-banner__pulse" />
              <div>
                <p className="dist-golive-banner__title">🎉 Campaign is now live!</p>
                <p className="dist-golive-banner__sub">
                  Start sharing your channel messages. Applicants who click the link will land on your form.
                </p>
              </div>
            </div>
            <div className="dist-golive-banner__actions">
              <button
                type="button"
                className="primary-button"
                onClick={() => navigate(`/campaigns/${campaignId}/applicants`)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                View Applicants →
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setJustWentLive(false)}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
