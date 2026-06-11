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
  
  const constraints = await client.query(`
    SELECT
        tc.table_name, 
        kcu.column_name, 
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name 
    FROM 
        information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema='public'
  `)
  
  console.log('Foreign Keys:')
  constraints.rows.forEach(r => {
    console.log(`- ${r.table_name}.${r.column_name} -> ${r.foreign_table_name}.${r.foreign_column_name}`)
  })

  await client.end()
}

main().catch(console.error)
