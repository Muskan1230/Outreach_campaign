import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import path from 'node:path'

// Load from current working directory and parent directory
dotenv.config({ path: path.join(process.cwd(), '.env') })
dotenv.config({ path: path.join(process.cwd(), '..', '.env') })

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SERVICE_ROLE_KEY
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.warn('⚠️  SUPABASE_URL and/or SERVICE_ROLE_KEY not configured. Supabase will not work.')
}

/**
 * Service-role client — bypasses RLS entirely.
 * Used by the Express backend after the JWT has already been verified
 * by the requireAuth middleware.
 */
export const supabase = createClient(supabaseUrl || '', serviceRoleKey || '', {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

/**
 * User-scoped client — respects RLS policies.
 * Pass the user's access token to create a client that operates as that user.
 * Useful for future per-row ownership queries.
 */
export function createUserClient(accessToken: string) {
  if (!supabaseAnonKey) {
    throw new Error('SUPABASE_ANON_KEY must be set to create a user-scoped client')
  }
  return createClient(supabaseUrl!, supabaseAnonKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
