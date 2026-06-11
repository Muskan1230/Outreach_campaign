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
  
  const tablesRes = await client.query(
    `select table_name
     from information_schema.tables
     where table_schema = 'public'
     order by table_name`
  )
  console.log('Tables:', tablesRes.rows.map(r => r.table_name))

  const enumsRes = await client.query(`
    SELECT t.typname as enum_name, array_agg(e.enumlabel ORDER BY e.enumsortorder) as enum_values
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    GROUP BY t.typname
  `)
  console.log('Enums:')
  enumsRes.rows.forEach(row => {
    const vals = row.enum_values;
    const valsStr = Array.isArray(vals) ? vals.join(', ') : String(vals);
    console.log(`- ${row.enum_name}: ${valsStr}`)
  })

  await client.end()
}

main().catch(console.error)
