import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  listRecruiterNotifications,
  markAllRecruiterNotificationsRead,
  markRecruiterNotificationRead,
  type RecruiterNotification,
} from '../services/recruiterNotificationService'

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function RecruiterNotificationsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notifications, setNotifications] = useState<RecruiterNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isUpdating, setIsUpdating] = useState(false)

  async function loadNotifications() {
    setError('')
    setLoading(true)

    try {
      const result = await listRecruiterNotifications({ limit: 50 })
      setNotifications(result.data)
      setUnreadCount(result.unread_count)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load notifications')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadNotifications()
  }, [])

  async function handleMarkRead(id: string) {
    setIsUpdating(true)
    try {
      await markRecruiterNotificationRead(id)
      window.dispatchEvent(new Event('recruiter-notifications-updated'))
      await loadNotifications()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to update notification')
    } finally {
      setIsUpdating(false)
    }
  }

  async function handleMarkAllRead() {
    setIsUpdating(true)
    try {
      await markAllRecruiterNotificationsRead()
      window.dispatchEvent(new Event('recruiter-notifications-updated'))
      await loadNotifications()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to update notifications')
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div className="page-shell notifications-page">
      <section className="panel notifications-hero">
        <div>
          <span className="eyebrow">Recruiter notifications</span>
          <h1>New application alerts</h1>
          <p>
            Track fresh candidate applications in one place. Unread alerts stay visible in the top bar until they are opened or marked read.
          </p>
        </div>
        <div className="notifications-hero__actions">
          <span className="notifications-hero__count">{unreadCount} unread</span>
          <button className="ghost-button" type="button" onClick={loadNotifications} disabled={loading || isUpdating}>
            Refresh
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => void handleMarkAllRead()}
            disabled={unreadCount === 0 || loading || isUpdating}
          >
            Mark all read
          </button>
        </div>
      </section>

      {error ? <div className="alert error">{error}</div> : null}

      <section className="panel notifications-panel">
        {loading ? (
          <div className="empty-state">Loading notifications...</div>
        ) : notifications.length === 0 ? (
          <div className="empty-state">
            <p>No recruiter alerts yet.</p>
            <span>When candidates apply, the newest application will appear here and trigger an email alert too.</span>
          </div>
        ) : (
          <div className="notification-list">
            {notifications.map((notification) => {
              const payload = notification.payload || {}
              const reviewLink = typeof payload.review_link === 'string' ? payload.review_link : ''
              const listLink = typeof payload.list_link === 'string' ? payload.list_link : '/campaigns'
              const candidateName = typeof payload.candidate_name === 'string' ? payload.candidate_name : 'Candidate'
              const campaignTitle = typeof payload.campaign_title === 'string' ? payload.campaign_title : notification.title
              const sourceChannel = typeof payload.source_channel === 'string' ? payload.source_channel : 'direct'

              return (
                <article
                  key={notification.id}
                  className={notification.is_read ? 'notification-card' : 'notification-card notification-card--unread'}
                >
                  <div className="notification-card__header">
                    <div>
                      <h3>{notification.title}</h3>
                      <p>{notification.message}</p>
                    </div>
                    {!notification.is_read ? <span className="notification-card__badge">New</span> : null}
                  </div>

                  <div className="notification-meta">
                    <span>Candidate: {candidateName}</span>
                    <span>Campaign: {campaignTitle}</span>
                    <span>Source: {sourceChannel}</span>
                    <span>{formatDateTime(notification.created_at)}</span>
                  </div>

                  <div className="notification-card__actions">
                    {reviewLink ? (
                      <Link className="ghost-button" to={reviewLink}>
                        Review application
                      </Link>
                    ) : null}
                    {!notification.is_read ? (
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => void handleMarkRead(notification.id)}
                        disabled={isUpdating}
                      >
                        Mark read
                      </button>
                    ) : null}
                    {listLink ? (
                      <Link className="ghost-button" to={listLink}>
                        Open queue
                      </Link>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

