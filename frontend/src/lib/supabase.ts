import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || ''
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || ''

if (!supabaseUrl || !supabaseAnonKey) {
  // Don't throw during development — warn so the app can render.
  // Keep exporting a client so existing imports don't break immediately.
  // Network requests will fail until correct env vars are provided.
  // This makes it easier to run the app without Supabase configured.
  // If you prefer the app to fail fast, restore the throw above.
  // eslint-disable-next-line no-console
  console.warn('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in your .env file')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
