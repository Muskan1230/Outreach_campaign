import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(currentDir, '../../.env') });

const { pool } = await import('./lib/postgres.js');

async function check() {
  const client = pool ? await pool.connect() : null;
  if (!client) {
    console.log("No pool connected");
    return;
  }
  try {
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'candidate_applications'
      ORDER BY ordinal_position;
    `);
    console.log("candidate_applications columns:");
    result.rows.forEach(row => console.log(` - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`));
  } finally {
    if (client) client.release();
    if (pool) await pool.end();
  }
}

check().catch(console.error);
