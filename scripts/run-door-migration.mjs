// Runs the door-monitoring migration SQL against DATABASE_URL.
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import pkg from 'pg';

const { Client } = pkg;
const sql = readFileSync(
  new URL('../prisma/migration-add-door-monitoring.sql', import.meta.url),
  'utf8',
);

const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  // Note: ALTER TYPE ... ADD VALUE cannot run inside a transaction block in
  // Postgres, and the file uses IF NOT EXISTS guards, so run the whole script
  // as a single simple query (no explicit BEGIN/COMMIT).
  await client.query(sql);
  console.log('MIGRATION_OK');

  const res = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_name IN ('door_sensor_configs','door_installation_requests')
     ORDER BY table_name;`,
  );
  console.log('FOUND_TABLES:', JSON.stringify(res.rows));
} catch (e) {
  console.log('MIGRATION_ERROR:', e.message);
} finally {
  await client.end();
}
