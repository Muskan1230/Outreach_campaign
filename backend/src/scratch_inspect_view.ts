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
      SELECT definition
      FROM pg_views
      WHERE schemaname = 'public' AND viewname = 'vw_application_queue';
    `);
    console.log("vw_application_queue definition:");
    if (result.rows.length > 0) {
      console.log(result.rows[0].definition);
    } else {
      console.log("View not found!");
    }
  } finally {
    if (client) client.release();
    if (pool) await pool.end();
  }
}

check().catch(console.error);
