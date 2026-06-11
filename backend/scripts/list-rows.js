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
    ssl: {
      rejectUnauthorized: false,
    },
  })

  await client.connect()
  
  const tableName = process.argv[2] || 'tracking_links'
  const result = await client.query(`SELECT * FROM public.${tableName} LIMIT 10`)
  console.log(`Rows from ${tableName}:`, result.rows)

  await client.end()
}

main().catch(console.error)
