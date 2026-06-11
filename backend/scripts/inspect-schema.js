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

async function inspect(tableName) {
  const client = new Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false,
    },
  })

  await client.connect()
  const result = await client.query(
    `select column_name, data_type, is_nullable, column_default
     from information_schema.columns
     where table_schema = 'public' and table_name = $1
     order by ordinal_position`,
    [tableName],
  )
  await client.end()
  console.log(JSON.stringify(result.rows, null, 2))
}

const tableName = process.argv[2]
if (!tableName) {
  throw new Error('Pass a table name')
}

inspect(tableName).catch((error) => {
  console.error(error)
  process.exit(1)
})
