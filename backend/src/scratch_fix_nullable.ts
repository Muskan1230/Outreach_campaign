import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(currentDir, '../../.env') });

const { pool } = await import('./lib/postgres.js');

async function fix() {
  const client = await pool.connect();
  try {
    // Make full_url nullable since our code doesn't provide it
    console.log("Making full_url nullable...");
    await client.query(`ALTER TABLE public.tracking_links ALTER COLUMN full_url DROP NOT NULL;`);
    console.log("Done! full_url is now nullable.");
    
    // Verify the RPC function works with a fake UUID
    console.log("Testing RPC function...");
    const { rows } = await client.query(`SELECT increment_tracking_link_clicks('00000000-0000-0000-0000-000000000000')`);
    console.log("RPC test result:", rows);
    
  } finally {
    client.release();
    await pool.end();
  }
}

fix().catch(console.error);
