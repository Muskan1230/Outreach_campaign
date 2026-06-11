import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(currentDir, '../../.env') });

const { pool } = await import('./lib/postgres.js');

const migrationPath = path.resolve(currentDir, '../supabase/migrations/006b_patch_tracking_links.sql');

async function run() {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  const client = await pool.connect();
  try {
    console.log("Executing patch migration...");
    await client.query(sql);
    console.log("Patch migration executed successfully!");
    
    // Verify schema now
    const result = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tracking_links'
      ORDER BY ordinal_position;
    `);
    console.log("\nUpdated tracking_links columns:");
    result.rows.forEach(row => console.log(` - ${row.column_name}: ${row.data_type}`));
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(console.error);
