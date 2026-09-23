/**
 * FASE 1.2b — M1 (OrgUnit + Membership) CLONE VALIDATION (Attempt #2, hardened).
 *
 * Validates prisma/migration-add-orgunit-membership.sql on a FRESH Neon
 * CLONE/BRANCH, NOT the primary development database (locked decision B5).
 *
 * SAFETY GUARD:
 *   - Connection string MUST be provided via CLONE_DATABASE_URL (NOT DATABASE_URL).
 *   - Refuses to run if CLONE_DATABASE_URL is missing or equals DATABASE_URL.
 *   - PREFLIGHT: refuses to run unless the clone is in the expected PRE-M1 state
 *     (org_units + memberships absent AND legacy counts = 3/21/54/19). This makes
 *     the run prove a clean PRE-M1 -> run#1 -> run#2 sequence on a *fresh* clone.
 *   - All negative/positive constraint tests run inside a transaction that is
 *     ALWAYS rolled back; a post-rollback residue check proves nothing persisted.
 *
 * Sequence (no stage skipped even if earlier stages pass):
 *   0. Guard + connect.
 *   1. PREFLIGHT (expected pre-M1 state; STOP if not).
 *   2. M1 run #1  (apply).
 *   3. M1 run #2  (idempotency): must not error; schema snapshot must be identical
 *      to the post-run#1 snapshot (no duplicate/changed objects).
 *   4. Object inspection: columns/types/nullability, CHECK, enums+labels, indexes,
 *      GIN path index, candidate unique index (id,tenant_id), FKs.
 *   5. Composite-FK-target PROOF: confirm the two composite FKs actually exist and
 *      reference org_units(id, tenant_id).
 *   6. Constraint tests NT1..NT7 (+ explicit partial-unique coverage) inside ONE
 *      transaction that is ROLLED BACK. Each records SQLSTATE + constraint name.
 *   7. Post-verification: object counts; post-rollback residue proof.
 *   8. Legacy preservation: pre/post counts identical; no legacy DML.
 *
 * Usage (PowerShell):
 *   $env:CLONE_DATABASE_URL = "postgresql://...FRESH-neon-branch..."
 *   node scripts/validate-m1-clone.mjs > _m1_clone_out_v2.json
 */

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

const MIGRATION_FILE = 'prisma/migration-add-orgunit-membership.sql';
const EXPECTED_LEGACY = { tenants: 3, users: 21, residents: 54, households: 19 };

// Expected enum labels in EXACT order (matches the M1 migration and target design).
const EXPECTED_ENUMS = {
  OrgUnitType: ['ORGANIZATION', 'CLUSTER', 'RW', 'RT'],
  MembershipRole: ['PLATFORM_ADMIN', 'TENANT_OWNER', 'ORG_ADMIN', 'RT_ADMIN', 'SECURITY', 'RESIDENT'],
  MembershipStatus: ['INVITED', 'ACTIVE', 'SUSPENDED', 'REVOKED'],
};

/**
 * Normalize the `labels` value returned for `array_agg(...)`. The node-postgres
 * driver may return a text[] either as a real JS array OR as its PostgreSQL
 * array-literal string form `{A,B,C}` (observed in Attempt #2). Return a JS array
 * of labels in either case. Any other shape returns null (treated as invalid).
 */
function normalizeEnumLabels(labels) {
  if (Array.isArray(labels)) return labels;
  if (typeof labels === 'string') {
    const s = labels.trim();
    if (s.startsWith('{') && s.endsWith('}')) {
      const inner = s.slice(1, -1);
      if (inner === '') return [];
      // enum labels here contain no commas/quotes, so a plain split is safe.
      return inner.split(',').map(x => x.trim());
    }
  }
  return null;
}

/** Exact ordered equality of two string arrays. */
function arraysEqualOrdered(a, b) {
  return (
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === b.length &&
    a.every((v, i) => v === b[i])
  );
}

const OUT = { meta: {}, steps: {} };

function log(msg) {
  process.stderr.write(msg + '\n');
}

async function q(client, sql, params = []) {
  const res = await client.query(sql, params);
  return res.rows;
}

/** Expect a statement to FAIL; capture SQLSTATE + constraint name. Savepoint-isolated. */
async function expectFail(client, label, mechanism, sql, params = []) {
  await client.query('SAVEPOINT nt');
  try {
    await client.query(sql, params);
    await client.query('RELEASE SAVEPOINT nt');
    return {
      test: label,
      mechanism,
      expected: 'EXPECTED CONSTRAINT REJECTION',
      actual: 'STATEMENT SUCCEEDED',
      sqlstate: null,
      constraint: null,
      verdict: 'FAIL',
    };
  } catch (e) {
    await client.query('ROLLBACK TO SAVEPOINT nt');
    await client.query('RELEASE SAVEPOINT nt');
    // Only integrity-constraint-violation family (class 23) counts as a genuine
    // constraint rejection. Anything else (42xxx syntax/undefined, etc.) is a
    // setup/SQL error and must NOT be scored as PASS.
    const isConstraintViolation = typeof e.code === 'string' && e.code.startsWith('23');
    return {
      test: label,
      mechanism,
      expected: 'EXPECTED CONSTRAINT REJECTION',
      actual: isConstraintViolation
        ? 'REJECTED BY CONSTRAINT'
        : 'TEST FAILED BECAUSE SQL/SETUP ERROR',
      sqlstate: e.code ?? null,
      constraint: e.constraint ?? null,
      message: isConstraintViolation ? undefined : e.message,
      verdict: isConstraintViolation ? 'PASS' : 'FAIL',
    };
  }
}

/** Expect a statement to SUCCEED; rolled back afterwards so nothing persists. */
async function expectPass(client, label, mechanism, sql, params = []) {
  await client.query('SAVEPOINT nt');
  try {
    await client.query(sql, params);
    await client.query('ROLLBACK TO SAVEPOINT nt');
    await client.query('RELEASE SAVEPOINT nt');
    return {
      test: label,
      mechanism,
      expected: 'EXPECTED SUCCESS',
      actual: 'SUCCEEDED',
      sqlstate: null,
      constraint: null,
      verdict: 'PASS',
    };
  } catch (e) {
    await client.query('ROLLBACK TO SAVEPOINT nt');
    await client.query('RELEASE SAVEPOINT nt');
    return {
      test: label,
      mechanism,
      expected: 'EXPECTED SUCCESS',
      actual: 'TEST FAILED BECAUSE SQL/SETUP ERROR',
      sqlstate: e.code ?? null,
      constraint: e.constraint ?? null,
      message: e.message,
      verdict: 'FAIL',
    };
  }
}

async function legacyCounts(client) {
  return q(
    client,
    `SELECT 'tenants' AS t, count(*)::int AS n FROM tenants
     UNION ALL SELECT 'users', count(*)::int FROM users
     UNION ALL SELECT 'residents', count(*)::int FROM residents
     UNION ALL SELECT 'households', count(*)::int FROM households
     ORDER BY t`,
  );
}

/** Full structural snapshot of the two M1 tables + enums, for run#1 vs run#2 diff. */
async function schemaSnapshot(client) {
  const columns = await q(
    client,
    `SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name IN ('org_units','memberships')
     ORDER BY table_name, ordinal_position`,
  );
  const constraints = await q(
    client,
    `SELECT rel.relname AS table_name, con.conname AS name, con.contype AS type,
            pg_get_constraintdef(con.oid) AS def
     FROM pg_constraint con
     JOIN pg_class rel ON rel.oid = con.conrelid
     JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
     WHERE nsp.nspname='public' AND rel.relname IN ('org_units','memberships')
     ORDER BY rel.relname, con.conname`,
  );
  const indexes = await q(
    client,
    `SELECT tablename AS table_name, indexname AS name, indexdef AS def
     FROM pg_indexes
     WHERE schemaname='public' AND tablename IN ('org_units','memberships')
     ORDER BY tablename, indexname`,
  );
  const enums = await q(
    client,
    `SELECT t.typname AS enum_name, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
     FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
     WHERE t.typname IN ('OrgUnitType','MembershipRole','MembershipStatus')
     GROUP BY t.typname ORDER BY t.typname`,
  );
  return { columns, constraints, indexes, enums };
}

async function main() {
  const cloneUrl = process.env.CLONE_DATABASE_URL;
  const devUrl = process.env.DATABASE_URL;

  // ---- SAFETY GUARD (B5) ----
  if (!cloneUrl || cloneUrl.trim() === '') {
    log('M1_CLONE_ERROR: CLONE_DATABASE_URL is not set. Refusing to run.');
    process.exit(2);
  }
  if (devUrl && cloneUrl.trim() === devUrl.trim()) {
    log('M1_CLONE_ERROR: CLONE_DATABASE_URL equals DATABASE_URL (dev DB). Refusing (B5).');
    process.exit(2);
  }

  const sql = readFileSync(resolve(process.cwd(), MIGRATION_FILE), 'utf8');
  const pool = new pg.Pool({ connectionString: cloneUrl });
  const client = await pool.connect();

  try {
    // 0. meta
    OUT.meta = (
      await q(
        client,
        `SELECT current_database() AS database, current_user AS db_user,
                now() AS validated_at, version() AS pg_version`,
      )
    )[0];
    OUT.meta.host_hint = (cloneUrl.match(/@([^/]+)/)?.[1] ?? 'unknown').replace(/:.*/, '');
    OUT.meta.attempt = 2;
    log('M1_CLONE: connected to ' + OUT.meta.database + ' as ' + OUT.meta.db_user);

    // 1. PREFLIGHT — must be a FRESH pre-M1 clone.
    const preCounts = await legacyCounts(client);
    const preTarget = (
      await q(
        client,
        `SELECT to_regclass('public.org_units') IS NOT NULL AS org_units_exists,
                to_regclass('public.memberships') IS NOT NULL AS memberships_exists`,
      )
    )[0];
    const countMap = Object.fromEntries(preCounts.map(r => [r.t, r.n]));
    const legacyOk =
      countMap.tenants === EXPECTED_LEGACY.tenants &&
      countMap.users === EXPECTED_LEGACY.users &&
      countMap.residents === EXPECTED_LEGACY.residents &&
      countMap.households === EXPECTED_LEGACY.households;
    const targetsAbsent =
      preTarget.org_units_exists === false && preTarget.memberships_exists === false;

    OUT.steps.preflight = {
      pre_counts: preCounts,
      pre_target_exists: preTarget,
      expected_legacy: EXPECTED_LEGACY,
      legacy_counts_ok: legacyOk,
      targets_absent: targetsAbsent,
      passed: legacyOk && targetsAbsent,
    };

    if (!OUT.steps.preflight.passed) {
      OUT.result = { preflight_pass: false, overall_pass: false };
      OUT.abort_reason =
        'PREFLIGHT FAILED: not a fresh pre-M1 clone ' +
        `(targets_absent=${targetsAbsent}, legacy_counts_ok=${legacyOk}). ` +
        'Create a fresh Neon branch from the same source and retry.';
      process.stdout.write(JSON.stringify(OUT, null, 2));
      log('M1_CLONE_STOP: ' + OUT.abort_reason);
      process.exitCode = 3;
      return;
    }
    log('M1_CLONE: preflight PASS (fresh pre-M1 clone)');

    // 2. M1 run #1
    await client.query(sql);
    const snap1 = await schemaSnapshot(client);
    OUT.steps.run1 = { applied: true };
    log('M1_CLONE: run #1 applied OK');

    // 3. M1 run #2 (idempotency) — must not throw, snapshot must be identical.
    await client.query(sql);
    const snap2 = await schemaSnapshot(client);
    const identical = JSON.stringify(snap1) === JSON.stringify(snap2);
    OUT.steps.run2 = {
      applied: true,
      schema_identical_to_run1: identical,
      idempotent: identical,
    };
    if (!identical) {
      OUT.steps.run2.snapshot_run1 = snap1;
      OUT.steps.run2.snapshot_run2 = snap2;
    }
    log('M1_CLONE: run #2 applied OK, schema_identical=' + identical);

    // 4. Object inspection (post-run#2 authoritative snapshot).
    OUT.steps.inspection = snap2;
    OUT.steps.inspection_checks = {
      org_units_table: snap2.columns.some(c => c.table_name === 'org_units'),
      memberships_table: snap2.columns.some(c => c.table_name === 'memberships'),
      path_is_text_array: snap2.columns.some(
        c => c.table_name === 'org_units' && c.column_name === 'path' && c.udt_name === '_text',
      ),
      depth_column: snap2.columns.some(
        c => c.table_name === 'org_units' && c.column_name === 'depth',
      ),
      depth_check_present: snap2.constraints.some(
        c => c.table_name === 'org_units' && c.type === 'c' && /depth/i.test(c.def),
      ),
      gin_path_index: snap2.indexes.some(
        i => i.table_name === 'org_units' && /USING gin/i.test(i.def) && /path/i.test(i.def),
      ),
      candidate_unique_index: snap2.indexes.some(
        i =>
          i.name === 'org_units_id_tenant_id_key' &&
          /UNIQUE/i.test(i.def) &&
          /\(id, tenant_id\)/i.test(i.def.replace(/"/g, '')),
      ),
      org_scoped_partial_unique: snap2.indexes.some(
        i =>
          i.name === 'memberships_user_tenant_orgunit_uq' &&
          /UNIQUE/i.test(i.def) &&
          /WHERE .*org_unit_id IS NOT NULL/i.test(i.def),
      ),
      tenant_level_partial_unique: snap2.indexes.some(
        i =>
          i.name === 'memberships_user_tenant_null_orgunit_uq' &&
          /UNIQUE/i.test(i.def) &&
          /WHERE .*org_unit_id IS NULL/i.test(i.def),
      ),
    };

    // Enum validation: prove name + EXACT ORDERED labels for each enum.
    // Labels are normalized first (driver may return text[] as a JS array or as
    // the PostgreSQL array-literal string "{A,B,C}" — Attempt #2 returned a string,
    // which made the old Array.isArray() check wrongly report enums_present=false).
    const enumByName = Object.fromEntries(
      snap2.enums.map(e => [e.enum_name, normalizeEnumLabels(e.labels)]),
    );
    const enumChecks = {
      org_unit_type_enum_exact: arraysEqualOrdered(
        enumByName.OrgUnitType,
        EXPECTED_ENUMS.OrgUnitType,
      ),
      membership_role_enum_exact: arraysEqualOrdered(
        enumByName.MembershipRole,
        EXPECTED_ENUMS.MembershipRole,
      ),
      membership_status_enum_exact: arraysEqualOrdered(
        enumByName.MembershipStatus,
        EXPECTED_ENUMS.MembershipStatus,
      ),
    };
    enumChecks.enums_exact =
      enumChecks.org_unit_type_enum_exact &&
      enumChecks.membership_role_enum_exact &&
      enumChecks.membership_status_enum_exact;
    OUT.steps.enum_checks = {
      expected: EXPECTED_ENUMS,
      actual: enumByName,
      ...enumChecks,
    };
    // Aggregate enum result feeds the overall inspection gate.
    OUT.steps.inspection_checks.enums_present = enumChecks.enums_exact;
    log('M1_CLONE: object inspection captured; enums_exact=' + enumChecks.enums_exact);

    // 5. Composite-FK-target PROOF — the two composite FKs must exist and reference
    //    org_units(id, tenant_id). This proves Option A's unique INDEX is accepted
    //    by PostgreSQL as a valid referenced key.
    const fkProof = await q(
      client,
      `SELECT rel.relname AS table_name, con.conname AS name,
              pg_get_constraintdef(con.oid) AS def,
              ref.relname AS referenced_table
       FROM pg_constraint con
       JOIN pg_class rel ON rel.oid = con.conrelid
       JOIN pg_class ref ON ref.oid = con.confrelid
       JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
       WHERE nsp.nspname='public' AND con.contype='f'
         AND rel.relname IN ('org_units','memberships')
       ORDER BY rel.relname, con.conname`,
    );
    const parentFk = fkProof.find(f => f.name === 'org_units_parent_same_tenant_fkey');
    const memberOrgFk = fkProof.find(f => f.name === 'memberships_org_unit_same_tenant_fkey');
    const refsIdTenant = def =>
      !!def && /REFERENCES org_units\(id, tenant_id\)/i.test(def.replace(/"/g, ''));
    OUT.steps.composite_fk_proof = {
      all_fks: fkProof,
      parent_same_tenant_fk_present: !!parentFk,
      parent_refs_id_tenant: refsIdTenant(parentFk?.def),
      membership_org_unit_fk_present: !!memberOrgFk,
      membership_refs_id_tenant: refsIdTenant(memberOrgFk?.def),
      proven:
        !!parentFk &&
        refsIdTenant(parentFk?.def) &&
        !!memberOrgFk &&
        refsIdTenant(memberOrgFk?.def),
    };
    log('M1_CLONE: composite-FK proof proven=' + OUT.steps.composite_fk_proof.proven);

    // 6. Negative/positive constraint tests — ONE transaction, always ROLLED BACK.
    const nt = [];
    await client.query('BEGIN');
    try {
      const tenants = await q(client, `SELECT id FROM tenants ORDER BY id LIMIT 2`);
      const users = await q(client, `SELECT id, tenant_id FROM users ORDER BY id LIMIT 1`);
      if (tenants.length < 2 || users.length < 1) {
        nt.push({
          test: 'FIXTURES',
          verdict: 'FAIL',
          actual: 'TEST FAILED BECAUSE SQL/SETUP ERROR',
          message: 'need >=2 tenants and >=1 user on clone',
        });
      } else {
        const tA = tenants[0].id;
        const tB = tenants[1].id;
        const uid = users[0].id;
        const uTenant = users[0].tenant_id;

        const orgA = (
          await q(
            client,
            `INSERT INTO org_units (tenant_id, type, name) VALUES ($1,'RT','NT Org A') RETURNING id`,
            [tA],
          )
        )[0].id;
        const orgB = (
          await q(
            client,
            `INSERT INTO org_units (tenant_id, type, name) VALUES ($1,'RT','NT Org B') RETURNING id`,
            [tB],
          )
        )[0].id;

        // NT1: cross-tenant parent -> rejected by same-tenant parent composite FK (I3).
        nt.push(
          await expectFail(
            client,
            'NT1_cross_tenant_parent',
            'org_units_parent_same_tenant_fkey (I3)',
            `INSERT INTO org_units (tenant_id, parent_id, type, name)
             VALUES ($1, $2, 'RT', 'NT child cross-tenant parent')`,
            [tA, orgB],
          ),
        );

        // NT2: cross-tenant org-unit membership -> rejected by same-tenant org FK (I8).
        nt.push(
          await expectFail(
            client,
            'NT2_cross_tenant_orgunit_membership',
            'memberships_org_unit_same_tenant_fkey (I8)',
            `INSERT INTO memberships (user_id, tenant_id, org_unit_id, role)
             VALUES ($1, $2, $3, 'RESIDENT')`,
            [uid, tA, orgB],
          ),
        );

        // Seed a valid org-scoped membership to test the org-scoped partial unique.
        await client.query(
          `INSERT INTO memberships (user_id, tenant_id, org_unit_id, role)
           VALUES ($1, $2, $3, 'RESIDENT')`,
          [uid, tA, orgA],
        );
        // NT3 (org-scoped partial unique, I9): duplicate (user, tenant, same orgUnit) -> FAIL.
        nt.push(
          await expectFail(
            client,
            'NT3_duplicate_org_scoped_membership',
            'memberships_user_tenant_orgunit_uq (I9, partial unique WHERE org_unit_id IS NOT NULL)',
            `INSERT INTO memberships (user_id, tenant_id, org_unit_id, role)
             VALUES ($1, $2, $3, 'ORG_ADMIN')`,
            [uid, tA, orgA],
          ),
        );

        // Seed a valid tenant-level membership to test the tenant-level partial unique.
        await client.query(
          `INSERT INTO memberships (user_id, tenant_id, org_unit_id, role)
           VALUES ($1, $2, NULL, 'TENANT_OWNER')`,
          [uid, tA],
        );
        // NT4 (tenant-level partial unique, I10): duplicate (user, tenant, NULL orgUnit) -> FAIL.
        nt.push(
          await expectFail(
            client,
            'NT4_duplicate_tenant_level_membership',
            'memberships_user_tenant_null_orgunit_uq (I10, partial unique WHERE org_unit_id IS NULL)',
            `INSERT INTO memberships (user_id, tenant_id, org_unit_id, role)
             VALUES ($1, $2, NULL, 'PLATFORM_ADMIN')`,
            [uid, tA],
          ),
        );

        // NT5: invalid User FK (I6).
        nt.push(
          await expectFail(
            client,
            'NT5_invalid_user_fk',
            'memberships_user_id_fkey (I6)',
            `INSERT INTO memberships (user_id, tenant_id, org_unit_id, role)
             VALUES ('00000000-0000-0000-0000-0000000000ff', $1, NULL, 'RESIDENT')`,
            [tA],
          ),
        );

        // NT6: invalid Tenant FK (I7).
        nt.push(
          await expectFail(
            client,
            'NT6_invalid_tenant_fk',
            'memberships_tenant_id_fkey (I7)',
            `INSERT INTO memberships (user_id, tenant_id, org_unit_id, role)
             VALUES ($1, '00000000-0000-0000-0000-0000000000fe', NULL, 'RESIDENT')`,
            [uid],
          ),
        );

        // NT7: valid tenant-level membership (orgUnitId NULL) -> PASS.
        nt.push(
          await expectPass(
            client,
            'NT7_valid_tenant_level_membership_null_orgunit',
            'I10 boundary (tenant-level membership allowed)',
            `INSERT INTO memberships (user_id, tenant_id, org_unit_id, role)
             VALUES ($1, $2, NULL, 'RESIDENT')`,
            [uid, uTenant === tA ? tB : uTenant],
          ),
        );

        // NT8: valid org-scoped membership for a DIFFERENT org unit (same user/tenant) -> PASS.
        // Proves the org-scoped partial unique does not over-reject distinct org units.
        const orgA2 = (
          await q(
            client,
            `INSERT INTO org_units (tenant_id, type, name) VALUES ($1,'RT','NT Org A2') RETURNING id`,
            [tA],
          )
        )[0].id;
        nt.push(
          await expectPass(
            client,
            'NT8_second_org_scoped_membership_distinct_orgunit',
            'I9 boundary (distinct org unit allowed)',
            `INSERT INTO memberships (user_id, tenant_id, org_unit_id, role)
             VALUES ($1, $2, $3, 'RESIDENT')`,
            [uid, tA, orgA2],
          ),
        );
      }
    } finally {
      await client.query('ROLLBACK');
    }
    OUT.steps.negative_tests = nt;
    OUT.steps.negative_tests_all_ok =
      nt.length > 0 && nt.every(r => r.verdict === 'PASS');
    log('M1_CLONE: constraint tests done, all_ok=' + OUT.steps.negative_tests_all_ok);

    // 7. Post-verification + post-rollback residue proof.
    const residue = (
      await q(
        client,
        `SELECT (SELECT count(*)::int FROM org_units) AS org_units_rows,
                (SELECT count(*)::int FROM memberships) AS memberships_rows`,
      )
    )[0];
    OUT.steps.post_rollback_residue = residue;
    OUT.steps.residue_clean = residue.org_units_rows === 0 && residue.memberships_rows === 0;
    log(
      'M1_CLONE: residue org_units=' +
        residue.org_units_rows +
        ' memberships=' +
        residue.memberships_rows,
    );

    // 8. Legacy preservation.
    OUT.steps.post_counts = await legacyCounts(client);
    OUT.steps.legacy_unchanged =
      JSON.stringify(OUT.steps.preflight.pre_counts) === JSON.stringify(OUT.steps.post_counts);
    log('M1_CLONE: legacy_unchanged=' + OUT.steps.legacy_unchanged);

    const inspectionAllOk = Object.values(OUT.steps.inspection_checks).every(v => v === true);
    OUT.result = {
      preflight_pass: true,
      run1_ok: true,
      run2_idempotent: OUT.steps.run2.idempotent === true,
      inspection_all_ok: inspectionAllOk,
      composite_fk_proven: OUT.steps.composite_fk_proof.proven === true,
      negative_tests_all_ok: OUT.steps.negative_tests_all_ok === true,
      residue_clean: OUT.steps.residue_clean === true,
      legacy_unchanged: OUT.steps.legacy_unchanged === true,
    };
    OUT.result.overall_pass = Object.values(OUT.result).every(v => v === true);

    process.stdout.write(JSON.stringify(OUT, null, 2));
    log('M1_CLONE_DONE: overall_pass=' + OUT.result.overall_pass);
  } catch (e) {
    OUT.error = { message: e.message, code: e.code };
    process.stdout.write(JSON.stringify(OUT, null, 2));
    log('M1_CLONE_ERROR: ' + e.message + ' (code ' + e.code + ')');
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  log('M1_CLONE_FATAL: ' + (err?.message ?? String(err)));
  process.exit(1);
});
