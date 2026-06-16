import { useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

/**
 * TrackRedirectPage — /track/:linkId
 *
 * Public page (no auth required). When a candidate clicks a tracking link:
 * 1. Fires a POST /api/tracking-links/:linkId/click (fire-and-forget)
 * 2. Fetches the destination URL via GET /api/tracking-links/:linkId/resolve
 * 3. Redirects the candidate to the apply form
 *
 * This is the "short URL" landing page that enables click attribution.
 */
export function TrackRedirectPage() {
  const { linkId } = useParams<{ linkId: string }>()
  const navigate = useNavigate()
  const didRun = useRef(false)

  useEffect(() => {
    // Strict-mode guard — run once only
    if (didRun.current) return
    didRun.current = true

    if (!linkId) {
      navigate('/', { replace: true })
      return
    }

    async function trackAndRedirect() {
      try {
        // 1. Fire click — fire-and-forget, never block the redirect
        fetch(`${BASE_URL}/api/tracking-links/${linkId}/click`, {
          method: 'POST',
        }).catch(() => {/* swallow silently */})

        // 2. Resolve destination URL
        const res = await fetch(`${BASE_URL}/api/tracking-links/${linkId}/resolve`)
        if (res.ok) {
          const { full_url } = await res.json() as { full_url: string }
          if (full_url) {
            window.location.replace(full_url)
            return
          }
        }
      } catch {
        // If resolution fails, fall through to navigate home
      }
      // Fallback — send to home page
      navigate('/', { replace: true })
    }

    void trackAndRedirect()
  }, [linkId, navigate])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
        color: '#fff',
        fontFamily: 'Inter, system-ui, sans-serif',
        gap: '1.5rem',
      }}
    >
      {/* Spinner */}
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          border: '4px solid rgba(255,255,255,0.15)',
          borderTopColor: '#a78bfa',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <p style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.7)', margin: 0 }}>
        Redirecting you to the application…
      </p>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
