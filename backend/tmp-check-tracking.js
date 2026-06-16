const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const envPath = path.resolve(__dirname, '..', '.env');
const env = fs.readFileSync(envPath, 'utf8');
const match = env.match(/DATABASE_URL\s*=\s*(.+)/);
if (!match) {
  console.error('DATABASE_URL not found');
  process.exit(1);
}
const conn = match[1].trim().replace(/^['\"]|['\"]$/g, '');
(async () => {
  const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_name = 'tracking_links'");
  console.log(JSON.stringify(res.rows));
  await client.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
