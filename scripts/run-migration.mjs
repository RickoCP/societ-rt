// Runs an arbitrary SQL migration file against DATABASE_URL.
// Usage: node scripts/run-migration.mjs prisma/migration-add-emergency-contacts.sql
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pkg from 'pg';

const { Client } = pkg;

const relPath = process.argv[2];
if (!relPath) {
  console.log('MIGRATION_ERROR: no SQL file path provided');
  process.exit(1);
}

const sql = readFileSync(resolve(process.cwd(), relPath), 'utf8');
const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query(sql);
  console.log('MIGRATION_OK:', relPath);
} catch (e) {
  console.log('MIGRATION_ERROR:', e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
