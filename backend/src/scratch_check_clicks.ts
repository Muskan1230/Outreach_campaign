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
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public';
    `);
    console.log("Tables in public schema:");
    result.rows.forEach(row => console.log(` - ${row.table_name}`));

    const columns = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'link_clicks'
      ORDER BY ordinal_position;
    `);
    console.log("\nlink_clicks columns:");
    columns.rows.forEach(row => console.log(` - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable}, default: ${row.column_default})`));
  } finally {
    if (client) client.release();
    if (pool) await pool.end();
  }
}

check().catch(console.error);
