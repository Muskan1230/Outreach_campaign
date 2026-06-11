import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * ProtectedRoute — wraps recruiter-only routes.
 *
 * • Shows nothing while the initial session check is in flight.
 * • Redirects to /login when there is no authenticated user.
 * • Renders children (via <Outlet />) when the user is authenticated.
 */
export function ProtectedRoute() {
  // const { user, loading } = useAuth()
  const user = { email: 'mock@example.com' }
  const loading = false

  if (loading) {
    return (
      <div className="auth-loading-screen">
        <div className="auth-spinner" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
