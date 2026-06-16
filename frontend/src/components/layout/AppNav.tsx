import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/context/AuthContext'
import { getRecruiterUnreadCount } from '../../features/notifications/services/recruiterNotificationService'

export function AppNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)

  const isCampaigns = location.pathname.startsWith('/campaigns') && !location.pathname.endsWith('/analytics')
  const isTemplates = location.pathname.startsWith('/templates')
  const isForms = location.pathname.startsWith('/forms')
  const isAnalytics = location.pathname.includes('/analytics')

  useEffect(() => {
    let active = true

    async function loadUnreadCount() {
      try {
        const result = await getRecruiterUnreadCount()
        if (active) {
          setUnreadCount(result.unread_count)
        }
      } catch {
        if (active) {
          setUnreadCount(0)
        }
      }
    }

    void loadUnreadCount()

    const refresh = () => {
      void loadUnreadCount()
    }

    window.addEventListener('focus', refresh)
    window.addEventListener('recruiter-notifications-updated', refresh)
    const timer = window.setInterval(refresh, 30000)

    return () => {
      active = false
      window.removeEventListener('focus', refresh)
      window.removeEventListener('recruiter-notifications-updated', refresh)
      window.clearInterval(timer)
    }
  }, [location.pathname, user?.id])

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <div className="topbar-logo">🚀</div>
        <div>
          <p className="topbar-kicker">Outreach Platform</p>
          <h2>Gig Worker Campaigns</h2>
        </div>
      </div>

      <nav className="topbar-nav">
        <Link className={isCampaigns ? 'nav-pill active' : 'nav-pill'} to="/campaigns">
          📋 Campaigns
        </Link>
        <Link className={isTemplates ? 'nav-pill active' : 'nav-pill'} to="/templates">
          ✉️ Templates
        </Link>
        <Link className={isForms ? 'nav-pill active' : 'nav-pill'} to="/forms">
          📝 Forms
        </Link>
        <Link className={isAnalytics ? 'nav-pill active' : 'nav-pill'} to="/campaigns">
          📊 Analytics
        </Link>
      </nav>

      <div className="topbar-user">
        <Link className="topbar-notification-link" to="/notifications" aria-label="Recruiter notifications">
          <span className="topbar-notification-icon">🔔</span>
          {unreadCount > 0 ? <span className="topbar-notification-badge">{unreadCount}</span> : null}
        </Link>
        {user?.email && (
          <span className="topbar-email" title={user.email}>
            {user.email}
          </span>
        )}
        <button
          id="sign-out-btn"
          type="button"
          className="sign-out-button"
          onClick={handleSignOut}
        >
          Sign out
        </button>
      </div>
    </header>
  )
}
