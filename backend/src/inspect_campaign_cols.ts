/**
 * inspect_campaign_cols.ts
 *
 * Inspect all columns of campaigns table.
 */

import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(currentDir, '../../.env') })

const { pool } = await import('./lib/postgres.js')

async function run() {
  const client = await pool.connect()

  try {
    const res = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'campaigns'
      ORDER BY ordinal_position;
    `)
    console.log(JSON.stringify(res.rows, null, 2))
  } finally {
    client.release()
    await pool.end()
  }
}

run().catch(console.error)
