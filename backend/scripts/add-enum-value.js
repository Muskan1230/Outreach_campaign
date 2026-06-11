import dotenv from 'dotenv'
import { Client } from 'pg'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(currentDir, '../../.env') })

const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL

if (!connectionString) {
  throw new Error('DATABASE_URL or SUPABASE_DB_URL must be set')
}

async function main() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  })

  await client.connect()
  console.log('Connected to database.')

  try {
    // In PostgreSQL, ADD VALUE cannot run inside a transaction block, so we run it directly.
    await client.query("ALTER TYPE public.consent_type ADD VALUE IF NOT EXISTS 'data_storage_contact'")
    console.log("Successfully added 'data_storage_contact' to consent_type enum.")
  } catch (error) {
    console.error('Error adding enum value:', error)
  } finally {
    await client.end()
  }
}

main()
