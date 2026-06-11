import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(currentDir, '../../.env') })

const client = new Client({
  connectionString: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

const f = await client.query(
  `select column_name, is_nullable, column_default from information_schema.columns
   where table_schema='public' and table_name='form_fields' order by ordinal_position`
)
console.log('=== form_fields columns ===')
f.rows.forEach(r => console.log(r.column_name, '| nullable:', r.is_nullable, '| default:', r.column_default))

const e = await client.query(
  `select t.typname, e.enumlabel
   from pg_type t join pg_enum e on t.oid=e.enumtypid
   where t.typname in ('campaign_mode','campaign_status','worker_type','consent_type')
   order by t.typname, e.enumsortorder`
)
console.log('\n=== Enum values ===')
e.rows.forEach(r => console.log(r.typname, '->', r.enumlabel))

await client.end()
