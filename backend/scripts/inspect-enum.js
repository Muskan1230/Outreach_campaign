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

async function inspect(enumName) {
  const client = new Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false,
    },
  })

  await client.connect()
  const result = await client.query(`
    SELECT enumlabel 
    FROM pg_enum 
    JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
    WHERE pg_type.typname = $1
  `, [enumName])
  await client.end()
  console.log('Enum values:', result.rows.map(r => r.enumlabel))
}

const enumName = process.argv[2] || 'form_field_type'
inspect(enumName).catch((error) => {
  console.error(error)
  process.exit(1)
})
