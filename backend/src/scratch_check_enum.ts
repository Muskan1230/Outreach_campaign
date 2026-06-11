import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(currentDir, '../../.env') });

const { pool } = await import('./lib/postgres.js');

async function check() {
  const client = await pool.connect();
  try {
    // Check the enum type for channel
    const enumResult = await client.query(`
      SELECT t.typname, e.enumlabel
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname LIKE '%channel%' OR t.typname LIKE '%tracking%'
      ORDER BY t.typname, e.enumsortorder;
    `);
    console.log("Enum values for channel-related types:");
    enumResult.rows.forEach(row => console.log(` - ${row.typname}: ${row.enumlabel}`));
  } finally {
    client.release();
    await pool.end();
  }
}

check().catch(console.error);
