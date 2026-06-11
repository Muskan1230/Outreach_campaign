import { Pool } from 'pg'

const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL

if (!connectionString) {
  throw new Error('DATABASE_URL or SUPABASE_DB_URL must be set')
}

export const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
})
