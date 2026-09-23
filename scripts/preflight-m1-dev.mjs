/**
 * FASE 1.2c — STEP 2: M1 Primary-DEV PREFLIGHT (READ-ONLY).
 *
 * Connects to DATABASE_URL (from .env) and performs SELECT-only inspection to
 * prove the primary dev DB is in the expected PRE-M1 baseline before any M1 DDL.
 *
 * HARD RULES:
 *   - Enforces SET default_transaction_read_only = on before any inspection.
 *   - NEVER prints DATABASE_URL, password, or a full connection string.
 *   - Emits only sanitized metadata + counts + boolean/existence checks as JSON.
 *   - Performs NO writes / DDL / migration. Read-only only.
 *
 * Usage (PowerShell):
 *   node scripts/preflight-m1-dev.mjs > _m1_dev_preflight.json
 *
 * Exit codes: 0 = PREFLIGHT PASS, 3 = PREFLIGHT FAIL (invariant mismatch), 1 = error.
 */

import 'dotenv/config';
import pg from 'pg';

const EXPECTED_LEGACY = { tenants: 3, users: 21, residents: 54, households: 19 };

// Known validation-clone endpoints from FASE 1.2b (target must NOT be one of these).
const KNOWN_CLONE_HOST_FRAGMENTS = [
  'ep-winter-river-aol4em67',
  'ep-red-dawn-aorpo22p',
  'ep-morning-boat-aophuh8j',
];
// The intended primary dev endpoint prefix (identity, not a secret).
const EXPECTED_DEV_HOST_FRAGMENT = 'ep-dry-cake-aoi3l143';

// M1-specific object names that MUST be absent pre-M1.
const M1_TABLES = ['org_units', 'memberships'];
const M1_ENUMS = ['OrgUnitType', 'MembershipRole', 'MembershipStatus'];
const M1_NAMED_OBJECTS = [
  'org_units_id_tenant_id_key',
  'org_units_path_gin_idx',
  'org_units_parent_same_tenant_fkey',
  'org_units_depth_nonneg_check',
  'memberships_user_tenant_orgunit_uq',
  'memberships_user_tenant_null_orgunit_uq',
  'memberships_org_unit_same_tenant_fkey',
];
// Known B4 drift tables (present in schema.prisma, were absent in dev).
const B4_DRIFT_TABLES = ['gates', 'cctv_cameras', 'homes'];

const OUT = { meta: {}, checks: {}, evidence: {} };

function log(msg) {
  process.stderr.write(msg + '\n');
}

/** Sanitize a host string: strip any credentials, keep only the host identifier. */
function sanitizeHostFromEnv() {
  const url = process.env.DATABASE_URL || '';
  // Extract the host between '@' and the next '/' or ':' — never include user:pass.
  const m = url.match(/@([^/:?]+)/);
  return m ? m[1] : 'unknown';
}

async function q(client, sql, params = []) {
  const res = await client.query(sql, params);
  return res.rows;
}

async function main() {
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
    log('PREFLIGHT_ERROR: DATABASE_URL is not set.');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    // Enforce read-only for the whole session.
    await client.query('SET default_transaction_read_only = on');

    // 1. Identity (sanitized, no secret).
    const meta = (
      await q(
        client,
        `SELECT current_database() AS database, current_user AS db_user,
                now() AS checked_at, version() AS pg_version`,
      )
    )[0];
    const hostFragment = sanitizeHostFromEnv();
    OUT.meta = {
      database: meta.database,
      db_user: meta.db_user,
      pg_version: meta.pg_version,
      checked_at: meta.checked_at,
      host_identifier: hostFragment, // host only, no credentials
    };

    const isKnownClone = KNOWN_CLONE_HOST_FRAGMENTS.some(f => hostFragment.includes(f));
    const isExpectedDev = hostFragment.includes(EXPECTED_DEV_HOST_FRAGMENT);
    OUT.checks.target_identity_ok =
      isExpectedDev && !isKnownClone && meta.database === 'neondb';
    OUT.evidence.identity = {
      matches_expected_dev_prefix: isExpectedDev,
      matches_known_clone: isKnownClone,
      database_is_neondb: meta.database === 'neondb',
    };

    // 2. Read-only enforced (verify the GUC actually took).
    const roRow = (await q(client, `SHOW default_transaction_read_only`))[0];
    OUT.checks.read_only_enforced =
      (roRow.default_transaction_read_only ?? roRow['default_transaction_read_only']) === 'on';

    // 3. Legacy counts.
    const counts = await q(
      client,
      `SELECT 'tenants' AS t, count(*)::int AS n FROM tenants
       UNION ALL SELECT 'users', count(*)::int FROM users
       UNION ALL SELECT 'residents', count(*)::int FROM residents
       UNION ALL SELECT 'households', count(*)::int FROM households
       ORDER BY t`,
    );
    const countMap = Object.fromEntries(counts.map(r => [r.t, r.n]));
    OUT.evidence.legacy_counts = { expected: EXPECTED_LEGACY, actual: countMap };
    OUT.checks.legacy_counts_ok =
      countMap.tenants === EXPECTED_LEGACY.tenants &&
      countMap.users === EXPECTED_LEGACY.users &&
      countMap.residents === EXPECTED_LEGACY.residents &&
      countMap.households === EXPECTED_LEGACY.households;

    // 4. PRE-M1 state: target tables absent.
    const tableExistence = {};
    for (const t of M1_TABLES) {
      const r = (await q(client, `SELECT to_regclass($1) IS NOT NULL AS exists`, [
        `public.${t}`,
      ]))[0];
      tableExistence[t] = r.exists === true;
    }
    OUT.evidence.m1_tables = tableExistence;
    OUT.checks.targets_absent = M1_TABLES.every(t => tableExistence[t] === false);

    // 4b. M1 partial footprint: enums + named objects absent.
    const enumsFound = await q(
      client,
      `SELECT typname FROM pg_type WHERE typname = ANY($1::text[]) AND typtype = 'e'`,
      [M1_ENUMS],
    );
    const namedFound = await q(
      client,
      `SELECT conname AS name FROM pg_constraint WHERE conname = ANY($1::text[])
       UNION ALL
       SELECT indexname AS name FROM pg_indexes WHERE indexname = ANY($1::text[])`,
      [M1_NAMED_OBJECTS],
    );
    OUT.evidence.m1_partial_footprint = {
      enums_found: enumsFound.map(r => r.typname),
      named_objects_found: namedFound.map(r => r.name),
    };
    OUT.checks.m1_objects_absent =
      enumsFound.length === 0 && namedFound.length === 0 && OUT.checks.targets_absent;

    // 5. Schema baseline / known B4 drift (expected still ABSENT in dev).
    const driftExistence = {};
    for (const t of B4_DRIFT_TABLES) {
      const r = (await q(client, `SELECT to_regclass($1) IS NOT NULL AS exists`, [
        `public.${t}`,
      ]))[0];
      driftExistence[t] = r.exists === true;
    }
    OUT.evidence.b4_drift_tables = driftExistence;
    // Baseline OK = the drift condition is unchanged (all three still absent, as audited).
    OUT.checks.schema_baseline_ok = B4_DRIFT_TABLES.every(t => driftExistence[t] === false);

    // 6. Legacy integrity (counts only, no PII).
    const orphanUsers = (
      await q(
        client,
        `SELECT count(*)::int AS n FROM users u
         LEFT JOIN tenants t ON t.id = u.tenant_id WHERE t.id IS NULL`,
      )
    )[0].n;
    const orphanResidents = (
      await q(
        client,
        `SELECT count(*)::int AS n FROM residents r
         LEFT JOIN tenants t ON t.id = r.tenant_id WHERE t.id IS NULL`,
      )
    )[0].n;
    const orphanHouseholds = (
      await q(
        client,
        `SELECT count(*)::int AS n FROM households h
         LEFT JOIN tenants t ON t.id = h.tenant_id WHERE t.id IS NULL`,
      )
    )[0].n;
    const nullTenantUsers = (
      await q(client, `SELECT count(*)::int AS n FROM users WHERE tenant_id IS NULL`)
    )[0].n;
    const nullTenantResidents = (
      await q(client, `SELECT count(*)::int AS n FROM residents WHERE tenant_id IS NULL`)
    )[0].n;
    const nullTenantHouseholds = (
      await q(client, `SELECT count(*)::int AS n FROM households WHERE tenant_id IS NULL`)
    )[0].n;
    // Platform tenant existence (by known id from prior phases; count only).
    const platformTenant = (
      await q(
        client,
        `SELECT count(*)::int AS n FROM tenants WHERE id = '00000000-0000-0000-0000-000000000010'`,
      )
    )[0].n;

    OUT.evidence.legacy_integrity = {
      orphan_users: orphanUsers,
      orphan_residents: orphanResidents,
      orphan_households: orphanHouseholds,
      null_tenant_users: nullTenantUsers,
      null_tenant_residents: nullTenantResidents,
      null_tenant_households: nullTenantHouseholds,
      platform_tenant_present: platformTenant === 1,
    };
    OUT.checks.legacy_integrity_ok =
      orphanUsers === 0 &&
      orphanResidents === 0 &&
      orphanHouseholds === 0 &&
      nullTenantUsers === 0 &&
      nullTenantResidents === 0 &&
      nullTenantHouseholds === 0 &&
      platformTenant === 1;

    // 7. Verdict.
    OUT.checks.STEP_2_PREFLIGHT_PASS =
      OUT.checks.target_identity_ok === true &&
      OUT.checks.read_only_enforced === true &&
      OUT.checks.legacy_counts_ok === true &&
      OUT.checks.targets_absent === true &&
      OUT.checks.m1_objects_absent === true &&
      OUT.checks.schema_baseline_ok === true &&
      OUT.checks.legacy_integrity_ok === true;

    process.stdout.write(JSON.stringify(OUT, null, 2));
    log('PREFLIGHT_DONE: STEP_2_PREFLIGHT_PASS=' + OUT.checks.STEP_2_PREFLIGHT_PASS);
    process.exitCode = OUT.checks.STEP_2_PREFLIGHT_PASS ? 0 : 3;
  } catch (e) {
    OUT.error = { message: e.message, code: e.code };
    process.stdout.write(JSON.stringify(OUT, null, 2));
    log('PREFLIGHT_ERROR: ' + e.message + ' (code ' + (e.code ?? 'n/a') + ')');
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  log('PREFLIGHT_FATAL: ' + (err?.message ?? String(err)));
  process.exit(1);
});
