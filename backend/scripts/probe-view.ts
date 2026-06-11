// Probe: discover view columns and table schemas via raw SQL
import dotenv from 'dotenv'
import { Client } from 'pg'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(currentDir, '../../.env') })

const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL
if (!connectionString) throw new Error('DATABASE_URL or SUPABASE_DB_URL must be set')

async function main() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })
  await client.connect()

  const targets = [
    'vw_application_queue',
    'candidate_applications',
    'worker_profiles',
    'workflow_events',
  ]

  for (const name of targets) {
    console.log(`\n── ${name} ──`)
    const { rows } = await client.query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [name],
    )
    if (rows.length === 0) {
      console.log('  (not found or no columns)')
    } else {
      rows.forEach(r => console.log(`  ${r.column_name.padEnd(35)} ${r.data_type}`))
    }
  }

  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
