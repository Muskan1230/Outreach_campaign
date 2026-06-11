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
  
  const viewName = process.argv[2] || 'vw_application_queue'
  const result = await client.query(`
    select view_definition
    from information_schema.views
    where table_schema = 'public' and table_name = $1
  `, [viewName])
  
  console.log(`View definition for ${viewName}:`, result.rows[0]?.view_definition)

  await client.end()
}

main().catch(console.error)
