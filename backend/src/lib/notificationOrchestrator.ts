/**
 * notificationOrchestrator.ts
 *
 * Lightweight HTTP client for the DataAlchemy Notification Orchestrator.
 *
 * Configuration (via environment variables):
 *   NOTIFICATION_ORCHESTRATOR_URL      — base URL of the orchestrator service
 *   NOTIFICATION_ORCHESTRATOR_API_KEY  — API key sent as the X-Api-Key header
 *
 * No credentials are stored in code. Update NOTIFICATION_ORCHESTRATOR_API_KEY
 * in .env when the key is rotated.
 */

function getBaseUrl(): string {
  const url = process.env.NOTIFICATION_ORCHESTRATOR_URL
  if (!url) {
    throw new Error('NOTIFICATION_ORCHESTRATOR_URL is not set in environment variables')
  }
  return url.replace(/\/$/, '') // strip trailing slash
}

function getApiKey(): string {
  const key = process.env.NOTIFICATION_ORCHESTRATOR_API_KEY
  if (!key) {
    throw new Error('NOTIFICATION_ORCHESTRATOR_API_KEY is not set in environment variables')
  }
  return key
}

// ── Internal fetch wrapper ────────────────────────────────────────────────────

async function orchestratorFetch(endpoint: string, init: RequestInit): Promise<Response> {
  const url = `${getBaseUrl()}${endpoint}`

  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': getApiKey(),
      ...((init.headers as Record<string, string>) ?? {}),
    },
  })

  return response
}

// ── Error helper ──────────────────────────────────────────────────────────────

function buildOrchestratorError(status: number, data: unknown): Error {
  const message =
    (data as any)?.detail ??
    (data as any)?.message ??
    `Orchestrator error (HTTP ${status})`

  const err = new Error(message) as Error & { status: number; data: unknown }
  err.status = status
  err.data = data
  return err
}

// ── Public API methods ────────────────────────────────────────────────────────

/**
 * GET /api/v1/tenant/templates/
 *
 * Fetch all templates for the current tenant from the orchestrator.
 */
export async function getOrchestratorTemplates(): Promise<unknown> {
  const response = await orchestratorFetch('/api/v1/tenant/templates/', {
    method: 'GET',
  })

  const data = await response.json()

  if (!response.ok) {
    console.error('[orchestrator] getTemplates failed:', response.status, JSON.stringify(data))
    throw buildOrchestratorError(response.status, data)
  }

  return data
}

/**
 * POST /api/v1/tenant/templates/
 *
 * Create and save a raw notification template in the orchestrator.
 * Returns the full template record as created by the orchestrator.
 */
export async function createOrchestratorTemplate(
  payload: Record<string, unknown>,
): Promise<unknown> {
  console.log('[orchestrator] createTemplate →', JSON.stringify(payload))

  const response = await orchestratorFetch('/api/v1/tenant/templates/', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

  const data = await response.json()

  if (!response.ok) {
    console.error('[orchestrator] createTemplate failed:', response.status, JSON.stringify(data))
    throw buildOrchestratorError(response.status, data)
  }

  console.log('[orchestrator] createTemplate ←', JSON.stringify(data))
  return data
}

/**
 * POST /api/v1/notifications/send
 *
 * Send one notification to one recipient using a saved orchestrator template.
 * Returns the delivery receipt/response from the orchestrator.
 */
export async function sendOrchestratorNotification(
  payload: Record<string, unknown>,
): Promise<unknown> {
  console.log('[orchestrator] sendNotification →', JSON.stringify(payload))

  const response = await orchestratorFetch('/api/v1/notifications/send', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

  const data = await response.json()

  if (!response.ok) {
    console.error('[orchestrator] sendNotification failed:', response.status, JSON.stringify(data))
    throw buildOrchestratorError(response.status, data)
  }

  console.log('[orchestrator] sendNotification ←', JSON.stringify(data))
  return data
}
