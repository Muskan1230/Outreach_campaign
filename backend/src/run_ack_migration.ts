/**
 * run_ack_migration.ts
 *
 * Runs 007_acknowledgment_columns.sql against the configured Postgres database.
 *
 * Usage:
 *   npx tsx src/run_ack_migration.ts
 */

import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(currentDir, '../../.env') })

const { pool } = await import('./lib/postgres.js')

const migrationPath = path.resolve(
  currentDir,
  '../supabase/migrations/007_acknowledgment_columns.sql',
)

async function run() {
  const sql = fs.readFileSync(migrationPath, 'utf8')
  const client = await pool.connect()

  try {
    console.log('Running 007_acknowledgment_columns migration...')
    await client.query(sql)
    console.log('✅  Migration executed successfully!\n')

    // Verify campaigns columns
    const campaignCols = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'campaigns'
        AND column_name IN ('acknowledgment_channels', 'acknowledgment_email_template_id')
      ORDER BY column_name;
    `)
    console.log('campaigns — new columns:')
    campaignCols.rows.forEach((row: any) =>
      console.log(`  ${row.column_name}: ${row.data_type} (default: ${row.column_default})`)
    )

    // Verify candidate_applications columns
    const appCols = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'candidate_applications'
        AND column_name IN ('ack_email_status', 'ack_sent_at')
      ORDER BY column_name;
    `)
    console.log('\ncandidate_applications — new columns:')
    appCols.rows.forEach((row: any) =>
      console.log(`  ${row.column_name}: ${row.data_type}`)
    )
  } finally {
    client.release()
    await pool.end()
  }
}

run().catch(console.error)
