import { supabase } from '../lib/supabase'

const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

export type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown
}

export async function request<T>(path: string, options: RequestOptions = {}) {
  const { body, headers, ...rest } = options

  // Attach the Supabase access token if there is an active session
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token || 'mock-token'

  const response = await fetch(`${baseUrl}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers ?? {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(payload?.message || 'Failed to complete the request')
  }

  return payload as T
}

