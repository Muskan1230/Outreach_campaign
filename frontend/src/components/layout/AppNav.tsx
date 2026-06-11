import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/context/AuthContext'

export function AppNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()

  const isCampaigns = location.pathname.startsWith('/campaigns')
  const isTemplates = location.pathname.startsWith('/templates')
  const isForms = location.pathname.startsWith('/forms')

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
      </nav>

      <div className="topbar-user">
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
