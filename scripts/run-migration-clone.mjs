/**
 * FASE 1.4 — Apply an arbitrary SQL migration to a FRESH NEON CLONE ONLY.
 *
 * Hard safety guard (mirrors validate-m1-clone.mjs, locked B5):
 *   - Uses CLONE_DATABASE_URL (NOT DATABASE_URL).
 *   - Refuses to run if CLONE_DATABASE_URL is missing OR equals DATABASE_URL.
 * This exists so M2 is never accidentally applied to the primary dev DB via the
 * generic run-migration.mjs (which targets DATABASE_URL).
 *
 * Usage (PowerShell):
 *   $env:CLONE_DATABASE_URL = "postgresql://...FRESH-neon-branch..."
 *   node scripts/run-migration-clone.mjs prisma/migration-m2-bootstrap-orgunits-memberships.sql
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pkg from 'pg';

const { Client } = pkg;

const relPath = process.argv[2];
if (!relPath) {
  console.log('CLONE_MIGRATION_ERROR: no SQL file path provided');
  process.exit(1);
}

const cloneUrl = process.env.CLONE_DATABASE_URL;
const devUrl = process.env.DATABASE_URL;
if (!cloneUrl || cloneUrl.trim() === '') {
  console.log('CLONE_MIGRATION_ERROR: CLONE_DATABASE_URL not set. Refusing (B5).');
  process.exit(2);
}
if (devUrl && cloneUrl.trim() === devUrl.trim()) {
  console.log('CLONE_MIGRATION_ERROR: CLONE_DATABASE_URL equals DATABASE_URL (primary dev). Refusing (B5).');
  process.exit(2);
}

const sql = readFileSync(resolve(process.cwd(), relPath), 'utf8');
const client = new Client({ connectionString: cloneUrl });

try {
  await client.connect();
  await client.query(sql);
  const host = (cloneUrl.match(/@([^/:?]+)/)?.[1]) ?? 'unknown';
  console.log('CLONE_MIGRATION_OK:', relPath, 'on', host);
} catch (e) {
  console.log('CLONE_MIGRATION_ERROR:', e.message, '(code', e.code, ')');
  process.exitCode = 1;
} finally {
  await client.end();
}
