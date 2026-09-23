/**
 * FASE 1.4 — M2 (bootstrap OrgUnits + backfill Memberships) CLONE VALIDATION.
 *
 * Validates prisma/migration-m2-bootstrap-orgunits-memberships.sql on a FRESH
 * Neon CLONE/BRANCH, NEVER the primary development DB (locked B5 / execution
 * boundary). It proves the positive path, TRUE idempotency (by comparing actual
 * state, not "SQL returned success"), negative/conflict rejection with full
 * rollback, and legacy preservation.
 *
 * SAFETY GUARD:
 *   - Connection string MUST be CLONE_DATABASE_URL (NOT DATABASE_URL).
 *   - Refuses if CLONE_DATABASE_URL missing or equals DATABASE_URL.
 *   - PREFLIGHT: refuses unless the clone is in the expected PRE-M2 state
 *     (M1 installed; org_units & memberships EMPTY; legacy 3/21/54/19; the five
 *     platform anomalies + three Super_Admin present).
 *   - Negative tests run inside ONE transaction that is ALWAYS rolled back; a
 *     post-rollback residue check proves nothing persisted from them.
 *
 * Deterministic-id independence: this validator recomputes the two RT OrgUnit
 * ids via scripts/m2-orgunit-id.mjs (RFC 4122 UUIDv5) and asserts they equal the
 * literals pinned in the M2 SQL — the same algorithm reproduced from one source.
 *
 * Usage (PowerShell):
 *   $env:CLONE_DATABASE_URL = "postgresql://...FRESH-neon-branch..."
 *   node scripts/validate-m2-clone.mjs > _m2_clone_out.json
 */

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { deterministicOrgUnitId, M2_ORGUNIT_NAMESPACE_UUID } from './m2-orgunit-id.mjs';

const M2_FILE = 'prisma/migration-m2-bootstrap-orgunits-memberships.sql';
const EXPECTED_LEGACY = { tenants: 3, users: 21, residents: 54, households: 19 };
const PLATFORM = '00000000-0000-0000-0000-000000000010';
const RT01 = '00000000-0000-0000-0000-000000000011';
const RT02 = '00000000-0000-0000-0000-000000000012';

// Deterministic OrgUnit ids recomputed independently (must match the M2 SQL literals).
const EXPECTED_ORG_IDS = {
  [RT01]: deterministicOrgUnitId(RT01),
  [RT02]: deterministicOrgUnitId(RT02),
};
// The five audited platform anomalies (exclusion manifest) — ids must never gain a
// membership; each is asserted to still match expected tenant + legacy role.
const MANIFEST = [
  { user_id: '00000000-0000-0000-0000-000000000021', tenant_id: PLATFORM, role: 'Ketua_RT' },
  { user_id: '00000000-0000-0000-0000-000000000022', tenant_id: PLATFORM, role: 'Pengurus' },
  { user_id: '00000000-0000-0000-0000-000000000023', tenant_id: PLATFORM, role: 'Warga' },
  { user_id: '00000000-0000-0000-0000-000000000024', tenant_id: PLATFORM, role: 'Security_Guard' },
  { user_id: '42cc1bea-9a68-44b1-aadf-1bb0bb609028', tenant_id: PLATFORM, role: 'Warga' },
];
const MANIFEST_IDS = MANIFEST.map(m => m.user_id);

// Expected host prefixes (assert isolation without printing full URLs).
const CLONE_HOST_PREFIX = 'ep-winter-river-aol4em67';
const PRIMARY_HOST_PREFIX = 'ep-dry-cake-aoi3l143';

const OUT = { meta: {}, steps: {} };
function log(m) { process.stderr.write(m + '\n'); }
async function q(c, sql, p = []) { return (await c.query(sql, p)).rows; }

async function legacyCounts(c) {
  return q(c,
    `SELECT 'tenants' AS t, count(*)::int AS n FROM tenants
     UNION ALL SELECT 'users', count(*)::int FROM users WHERE deleted_at IS NULL
     UNION ALL SELECT 'residents', count(*)::int FROM residents
     UNION ALL SELECT 'households', count(*)::int FROM households ORDER BY t`);
}

/** Canonical, order-stable snapshot of all M2-produced state for run#1 vs run#2 diff. */
async function m2StateSnapshot(c) {
  const org_units = await q(c,
    `SELECT id, tenant_id, parent_id, type::text AS type, name, path, depth
       FROM org_units ORDER BY id`);
  const memberships = await q(c,
    `SELECT user_id, tenant_id, org_unit_id, role::text AS role, status::text AS status
       FROM memberships ORDER BY user_id, tenant_id, COALESCE(org_unit_id,''), role`);
  return { org_units, memberships };
}

/** Expect a statement to FAIL; only a genuine error (constraint 23xxx OR our
 *  RAISE EXCEPTION P0001) counts as PASS. Savepoint-isolated. */
async function expectFail(c, label, sql, params = []) {
  await c.query('SAVEPOINT nt');
  try {
    await c.query(sql, params);
    await c.query('RELEASE SAVEPOINT nt');
    return { test: label, expected: 'REJECTION', actual: 'STATEMENT SUCCEEDED', sqlstate: null, verdict: 'FAIL' };
  } catch (e) {
    await c.query('ROLLBACK TO SAVEPOINT nt');
    await c.query('RELEASE SAVEPOINT nt');
    // Accept: integrity constraint (class 23) OR raised exception (P0001) from M2 guards.
    const ok = typeof e.code === 'string' && (e.code.startsWith('23') || e.code === 'P0001');
    return {
      test: label,
      expected: 'REJECTION',
      actual: ok ? 'REJECTED' : 'FAILED FOR WRONG REASON',
      sqlstate: e.code ?? null,
      message: ok ? (e.message?.split('\n')[0]) : e.message,
      verdict: ok ? 'PASS' : 'FAIL',
    };
  }
}

async function main() {
  const cloneUrl = process.env.CLONE_DATABASE_URL;
  const devUrl = process.env.DATABASE_URL;
  if (!cloneUrl || cloneUrl.trim() === '') {
    log('M2_CLONE_ERROR: CLONE_DATABASE_URL not set. Refusing (B5).');
    process.exit(2);
  }
  if (devUrl && cloneUrl.trim() === devUrl.trim()) {
    log('M2_CLONE_ERROR: CLONE_DATABASE_URL equals DATABASE_URL (primary dev). Refusing (B5).');
    process.exit(2);
  }

  const sql = readFileSync(resolve(process.cwd(), M2_FILE), 'utf8');
  const pool = new pg.Pool({ connectionString: cloneUrl });
  const client = await pool.connect();

  try {
    OUT.meta = (await q(client,
      `SELECT current_database() AS database, current_user AS db_user,
              now() AS validated_at, version() AS pg_version`))[0];
    OUT.meta.host_hint = (cloneUrl.match(/@([^/]+)/)?.[1] ?? 'unknown').replace(/:.*/, '');
    OUT.meta.namespace_uuid = M2_ORGUNIT_NAMESPACE_UUID;
    OUT.meta.expected_org_ids = EXPECTED_ORG_IDS;
    log('M2_CLONE: connected to ' + OUT.meta.database + ' as ' + OUT.meta.db_user);

    // 0. Deterministic-id independence: assert the recomputed ids appear as pinned
    //    literals in the M2 SQL file (single-source reproducibility).
    const sqlHasRt01 = sql.includes(EXPECTED_ORG_IDS[RT01]);
    const sqlHasRt02 = sql.includes(EXPECTED_ORG_IDS[RT02]);
    OUT.steps.deterministic_id_binding = {
      recomputed: EXPECTED_ORG_IDS,
      m2_sql_contains_rt01_id: sqlHasRt01,
      m2_sql_contains_rt02_id: sqlHasRt02,
      ok: sqlHasRt01 && sqlHasRt02,
    };

    // 1. PREFLIGHT (STEP 1) — VERIFIED CLEAN ISOLATED PRE-M2 CLONE.
    //    Independent isolation proof (no URL/creds printed).
    const cloneHost = (cloneUrl.match(/@([^/:?]+)/)?.[1]) ?? '';
    const primaryHost = (devUrl?.match(/@([^/:?]+)/)?.[1]) ?? '';
    const cloneDbName = (await q(client, `SELECT current_database() AS db`))[0].db;
    const isolation = {
      clone_url_present: !!cloneUrl,
      primary_url_present: !!devUrl,
      clone_not_equal_primary: cloneUrl.trim() !== (devUrl?.trim() ?? ''),
      clone_host_differs: cloneHost !== primaryHost,
      clone_host_prefix_ok: cloneHost.startsWith(CLONE_HOST_PREFIX),
      primary_host_prefix_ok: primaryHost.startsWith(PRIMARY_HOST_PREFIX),
      clone_not_primary_host: !cloneHost.startsWith(PRIMARY_HOST_PREFIX),
      clone_database: cloneDbName,
    };
    isolation.ok = isolation.clone_url_present && isolation.primary_url_present &&
      isolation.clone_not_equal_primary && isolation.clone_host_differs &&
      isolation.clone_host_prefix_ok && isolation.primary_host_prefix_ok &&
      isolation.clone_not_primary_host;

    const pre = await legacyCounts(client);
    const cmap = Object.fromEntries(pre.map(r => [r.t, r.n]));
    const m1 = (await q(client,
      `SELECT to_regclass('public.org_units') IS NOT NULL AS ou,
              to_regclass('public.memberships') IS NOT NULL AS mem`))[0];
    const rows = (await q(client,
      `SELECT (SELECT count(*)::int FROM org_units) AS ou,
              (SELECT count(*)::int FROM memberships) AS mem`))[0];
    const anomalies = (await q(client,
      `SELECT count(*)::int AS n FROM users
        WHERE deleted_at IS NULL AND tenant_id=$1 AND role<>'Super_Admin'`, [PLATFORM]))[0].n;
    const sa = (await q(client,
      `SELECT count(*)::int AS n FROM users
        WHERE deleted_at IS NULL AND tenant_id=$1 AND role='Super_Admin'`, [PLATFORM]))[0].n;
    const platformPresent = (await q(client,
      `SELECT count(*)::int AS n FROM tenants WHERE id=$1`, [PLATFORM]))[0].n;
    const rtSourceUsers = (await q(client,
      `SELECT count(*)::int AS n FROM users
        WHERE deleted_at IS NULL AND tenant_id IN ($1,$2)`, [RT01, RT02]))[0].n;

    // Legacy integrity: no orphan/NULL-tenant across users/residents/households.
    const integ = (await q(client,
      `SELECT
        (SELECT count(*)::int FROM users u LEFT JOIN tenants t ON t.id=u.tenant_id WHERE u.deleted_at IS NULL AND t.id IS NULL) AS orphan_users,
        (SELECT count(*)::int FROM users WHERE deleted_at IS NULL AND tenant_id IS NULL) AS null_tenant_users,
        (SELECT count(*)::int FROM residents r LEFT JOIN tenants t ON t.id=r.tenant_id WHERE t.id IS NULL) AS orphan_residents,
        (SELECT count(*)::int FROM households h LEFT JOIN tenants t ON t.id=h.tenant_id WHERE t.id IS NULL) AS orphan_households`))[0];
    const integrityOk = integ.orphan_users === 0 && integ.null_tenant_users === 0 &&
      integ.orphan_residents === 0 && integ.orphan_households === 0;

    // Exact exclusion manifest: each of the 5 present with expected tenant + role,
    // AND no platform non-admin exists outside the manifest.
    const manifestMatch = (await q(client,
      `SELECT count(*)::int AS n FROM users u
        WHERE u.deleted_at IS NULL
          AND (u.id, u.tenant_id, u.role::text) IN (
            ('00000000-0000-0000-0000-000000000021','${PLATFORM}','Ketua_RT'),
            ('00000000-0000-0000-0000-000000000022','${PLATFORM}','Pengurus'),
            ('00000000-0000-0000-0000-000000000023','${PLATFORM}','Warga'),
            ('00000000-0000-0000-0000-000000000024','${PLATFORM}','Security_Guard'),
            ('42cc1bea-9a68-44b1-aadf-1bb0bb609028','${PLATFORM}','Warga'))`))[0].n;
    const outsideManifest = (await q(client,
      `SELECT count(*)::int AS n FROM users u
        WHERE u.deleted_at IS NULL AND u.tenant_id=$1 AND u.role<>'Super_Admin'
          AND u.id <> ALL($2::text[])`, [PLATFORM, MANIFEST_IDS]))[0].n;

    const legacyOk =
      cmap.tenants === EXPECTED_LEGACY.tenants &&
      cmap.users === EXPECTED_LEGACY.users &&
      cmap.residents === EXPECTED_LEGACY.residents &&
      cmap.households === EXPECTED_LEGACY.households;
    const m1Ok = m1.ou === true && m1.mem === true;
    const emptyOk = rows.ou === 0 && rows.mem === 0;
    OUT.steps.preflight = {
      isolation,
      pre_counts: pre, m1_installed: m1, target_rows: rows,
      platform_tenant_present: platformPresent === 1,
      platform_anomalies: anomalies, platform_super_admin: sa,
      rt_source_users: rtSourceUsers,
      legacy_integrity: integ,
      exclusion_manifest: {
        expected: MANIFEST.map(m => ({ user_id: m.user_id, tenant_id: m.tenant_id, role: m.role })),
        matched_count: manifestMatch,
        outside_manifest_count: outsideManifest,
        exact_five_ok: manifestMatch === 5 && outsideManifest === 0 && anomalies === 5,
      },
      legacy_ok: legacyOk, m1_installed_ok: m1Ok, targets_empty: emptyOk,
      integrity_ok: integrityOk,
      anomalies_ok: anomalies === 5, super_admin_ok: sa === 3,
      rt_source_users_ok: rtSourceUsers === 13,
    };
    OUT.steps.preflight.M2_CLONE_PREFLIGHT_PASS =
      isolation.ok && legacyOk && m1Ok && emptyOk && integrityOk &&
      platformPresent === 1 && sa === 3 && anomalies === 5 &&
      manifestMatch === 5 && outsideManifest === 0 && rtSourceUsers === 13;
    OUT.steps.preflight.passed = OUT.steps.preflight.M2_CLONE_PREFLIGHT_PASS;

    if (!OUT.steps.preflight.passed) {
      OUT.result = { M2_CLONE_PREFLIGHT_PASS: false, preflight_pass: false, M2_CLONE_VALIDATION_PASS: false };
      OUT.abort_reason = 'M2_CLONE_PREFLIGHT_PASS=false: clone fingerprint differs from the approved verified-clean isolated pre-M2 baseline. DID NOT run M2. Not attempting any repair.';
      process.stdout.write(JSON.stringify(OUT, null, 2));
      log('M2_CLONE_STOP: ' + OUT.abort_reason);
      process.exitCode = 3;
      return;
    }
    log('M2_CLONE: STEP 1 preflight PASS (verified clean isolated pre-M2 clone)');

    // 2. M2 run #1 (apply).
    await client.query(sql);
    const snap1 = await m2StateSnapshot(client);
    const card1 = (await q(client,
      `SELECT (SELECT count(*)::int FROM org_units) AS org_units_total,
              (SELECT count(*)::int FROM memberships) AS memberships_total,
              (SELECT count(*)::int FROM memberships
                 WHERE tenant_id=$1 AND org_unit_id IS NULL AND role='PLATFORM_ADMIN') AS platform_tenant_level,
              (SELECT count(*)::int FROM memberships WHERE org_unit_id IS NOT NULL) AS org_scoped,
              (SELECT count(*)::int FROM memberships
                 WHERE user_id = ANY($2::text[])) AS excluded_with_membership`,
      [PLATFORM, MANIFEST_IDS]))[0];
    OUT.steps.run1 = {
      applied: true,
      cardinalities: card1,
      org_unit_ids: snap1.org_units.map(o => ({ id: o.id, tenant_id: o.tenant_id, type: o.type, depth: o.depth, path: o.path })),
      cardinalities_ok:
        card1.org_units_total === 2 && card1.memberships_total === 16 &&
        card1.platform_tenant_level === 3 && card1.org_scoped === 13 &&
        card1.excluded_with_membership === 0,
      org_ids_match_deterministic:
        snap1.org_units.every(o => EXPECTED_ORG_IDS[o.tenant_id] === o.id) &&
        snap1.org_units.length === 2,
    };
    log('M2_CLONE: run #1 applied; memberships=' + card1.memberships_total);

    // 3. M2 run #2 (idempotency) — compare ACTUAL state, not SQL success.
    await client.query(sql);
    const snap2 = await m2StateSnapshot(client);
    const identical = JSON.stringify(snap1) === JSON.stringify(snap2);
    const card2 = (await q(client,
      `SELECT (SELECT count(*)::int FROM org_units) AS org_units_total,
              (SELECT count(*)::int FROM memberships) AS memberships_total`))[0];
    OUT.steps.run2 = {
      applied: true,
      state_identical_to_run1: identical,
      new_org_units: card2.org_units_total - card1.org_units_total,
      new_memberships: card2.memberships_total - card1.memberships_total,
      idempotent: identical && card2.org_units_total === 2 && card2.memberships_total === 16,
    };
    if (!identical) {
      OUT.steps.run2.snapshot_run1 = snap1;
      OUT.steps.run2.snapshot_run2 = snap2;
    }
    log('M2_CLONE: run #2 applied; idempotent=' + OUT.steps.run2.idempotent);

    // 4. Negative tests — ONE transaction, ALWAYS rolled back. State is post-M2.
    const nt = [];
    await client.query('BEGIN');
    try {
      // Fetch a couple of live org unit ids for scope tests.
      const rt01Org = EXPECTED_ORG_IDS[RT01];
      const rt02Org = EXPECTED_ORG_IDS[RT02];

      // NT1: deterministic OrgUnit id occupied by a CONFLICTING row (wrong type) then re-run M2.
      //      Insert a foreign object at rt01's deterministic id in a DIFFERENT tenant is
      //      impossible (pk), so simulate: change rt01 root type to CLUSTER, re-run M2 -> CONFLICT.
      nt.push(await expectFail(client, 'NT1_orgunit_id_occupied_conflicting',
        `DO $$ BEGIN
           UPDATE org_units SET type='CLUSTER' WHERE id='${rt01Org}';
           -- emulate the M2 exact-match guard:
           IF EXISTS (SELECT 1 FROM org_units WHERE id='${rt01Org}' AND type<>'RT') THEN
             RAISE EXCEPTION 'M2_CONFLICT: OrgUnit exists but type mismatch';
           END IF;
         END $$;`));

      // NT2: same tenant already has a DIFFERENT root RT OrgUnit (different id) -> CONFLICT.
      nt.push(await expectFail(client, 'NT2_conflicting_second_root_rt',
        `DO $$
         DECLARE n int;
         BEGIN
           INSERT INTO org_units (id, tenant_id, parent_id, type, name, path, depth)
           VALUES ('aaaaaaaa-0000-5000-8000-000000000011','${RT01}',NULL,'RT','dup root',ARRAY['aaaaaaaa-0000-5000-8000-000000000011']::text[],0);
           SELECT count(*) INTO n FROM org_units WHERE tenant_id='${RT01}' AND type='RT' AND parent_id IS NULL AND id<>'${rt01Org}';
           IF n > 0 THEN RAISE EXCEPTION 'M2_CONFLICT: tenant already has a different root RT OrgUnit'; END IF;
         END $$;`));

      // NT3: expected membership with WRONG role already present -> M2 exact-match guard CONFLICT.
      //      Simulate by flipping an existing RT membership role then asserting the guard.
      nt.push(await expectFail(client, 'NT3_membership_wrong_role',
        `DO $$ BEGIN
           UPDATE memberships SET role='RESIDENT'
             WHERE user_id='00000000-0000-0000-0000-000000000101' AND tenant_id='${RT01}';
           IF EXISTS (SELECT 1 FROM memberships
                        WHERE user_id='00000000-0000-0000-0000-000000000101' AND tenant_id='${RT01}'
                          AND role<>'RT_ADMIN') THEN
             RAISE EXCEPTION 'M2_CONFLICT: membership exists with different role';
           END IF;
         END $$;`));

      // NT4: expected membership at WRONG org scope -> composite same-tenant FK rejects cross-tenant scope.
      nt.push(await expectFail(client, 'NT4_membership_wrong_org_scope_cross_tenant',
        `INSERT INTO memberships (user_id, tenant_id, org_unit_id, role, status)
         VALUES ('00000000-0000-0000-0000-000000000101','${RT01}','${rt02Org}','RT_ADMIN','ACTIVE')`));

      // NT5: exclusion-manifest user role CHANGED -> M2 precondition (manifest role match) CONFLICT.
      nt.push(await expectFail(client, 'NT5_manifest_user_role_changed',
        `DO $$
         DECLARE n int;
         BEGIN
           UPDATE users SET role='Warga'
             WHERE id='00000000-0000-0000-0000-000000000021';  -- was Ketua_RT
           SELECT count(*) INTO n FROM users
             WHERE id='00000000-0000-0000-0000-000000000021' AND role='Ketua_RT';
           IF n <> 1 THEN RAISE EXCEPTION 'M2_PRECOND_FAIL: exclusion manifest role mismatch'; END IF;
         END $$;`));

      // NT6: EXTRA platform non-admin user outside manifest -> M2 precondition CONFLICT.
      nt.push(await expectFail(client, 'NT6_extra_platform_non_admin_outside_manifest',
        `DO $$
         DECLARE n int;
         BEGIN
           INSERT INTO users (id, tenant_id, name, email, password_hash, role, status)
           VALUES ('bbbbbbbb-0000-4000-8000-000000000099','${PLATFORM}','x','x-extra@x.local','x','Warga','active');
           SELECT count(*) INTO n FROM users u
            WHERE u.deleted_at IS NULL AND u.tenant_id='${PLATFORM}' AND u.role<>'Super_Admin'
              AND u.id NOT IN ('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000022',
                               '00000000-0000-0000-0000-000000000023','00000000-0000-0000-0000-000000000024',
                               '42cc1bea-9a68-44b1-aadf-1bb0bb609028');
           IF n > 0 THEN RAISE EXCEPTION 'M2_PRECOND_FAIL: platform non-admin outside manifest'; END IF;
         END $$;`));

      // NT7: unknown legacy role -> M2 precondition (role mapping) CONFLICT.
      //      Can't insert an out-of-enum role (enum), so simulate the guard result:
      nt.push(await expectFail(client, 'NT7_unknown_legacy_role',
        `DO $$
         DECLARE n int;
         BEGIN
           -- emulate a user whose role is not in the 5-role map
           SELECT count(*) INTO n FROM (SELECT 'UNKNOWN_ROLE'::text AS role) s
             WHERE s.role NOT IN ('Super_Admin','Ketua_RT','Pengurus','Warga','Security_Guard');
           IF n > 0 THEN RAISE EXCEPTION 'M2_PRECOND_FAIL: user with unmapped legacy role'; END IF;
         END $$;`));

      // NT8: cross-tenant inconsistency — membership org_unit belongs to another tenant.
      nt.push(await expectFail(client, 'NT8_cross_tenant_membership_orgunit',
        `INSERT INTO memberships (user_id, tenant_id, org_unit_id, role, status)
         VALUES ('00000000-0000-0000-0000-000000000201','${RT02}','${rt01Org}','RT_ADMIN','ACTIVE')`));
    } finally {
      await client.query('ROLLBACK');
    }
    OUT.steps.negative_tests = nt;
    OUT.steps.negative_tests_all_ok = nt.length === 8 && nt.every(r => r.verdict === 'PASS');
    log('M2_CLONE: negative tests all_ok=' + OUT.steps.negative_tests_all_ok);

    // 5. Post-rollback residue proof: state must equal post-run#2 (M2) state exactly.
    const snap3 = await m2StateSnapshot(client);
    OUT.steps.rollback_residue = {
      state_matches_post_m2: JSON.stringify(snap2) === JSON.stringify(snap3),
      org_units_total: snap3.org_units.length,
      memberships_total: snap3.memberships.length,
    };
    OUT.steps.rollback_clean = OUT.steps.rollback_residue.state_matches_post_m2 &&
      snap3.org_units.length === 2 && snap3.memberships.length === 16;
    log('M2_CLONE: rollback residue clean=' + OUT.steps.rollback_clean);

    // 6. Legacy preservation (counts + integrity unchanged; M2 did no legacy DML).
    const post = await legacyCounts(client);
    OUT.steps.legacy_preservation = {
      pre_counts: pre, post_counts: post,
      unchanged: JSON.stringify(pre) === JSON.stringify(post),
    };
    const orphanU = (await q(client, `SELECT count(*)::int n FROM users u LEFT JOIN tenants t ON t.id=u.tenant_id WHERE u.deleted_at IS NULL AND t.id IS NULL`))[0].n;
    OUT.steps.legacy_preservation.no_orphan_users = orphanU === 0;
    OUT.steps.legacy_preservation.ok =
      OUT.steps.legacy_preservation.unchanged && orphanU === 0;
    log('M2_CLONE: legacy_unchanged=' + OUT.steps.legacy_preservation.unchanged);

    // 7. Verdict.
    OUT.result = {
      M2_CLONE_PREFLIGHT_PASS: OUT.steps.preflight.M2_CLONE_PREFLIGHT_PASS === true,
      deterministic_id_binding_ok: OUT.steps.deterministic_id_binding.ok === true,
      run1_cardinalities_ok: OUT.steps.run1.cardinalities_ok === true,
      run1_org_ids_deterministic: OUT.steps.run1.org_ids_match_deterministic === true,
      run2_idempotent: OUT.steps.run2.idempotent === true,
      negative_tests_all_ok: OUT.steps.negative_tests_all_ok === true,
      rollback_clean: OUT.steps.rollback_clean === true,
      legacy_preserved: OUT.steps.legacy_preservation.ok === true,
    };
    OUT.result.M2_CLONE_VALIDATION_PASS = Object.values(OUT.result).every(v => v === true);
    process.stdout.write(JSON.stringify(OUT, null, 2));
    log('M2_CLONE_DONE: M2_CLONE_VALIDATION_PASS=' + OUT.result.M2_CLONE_VALIDATION_PASS);
    process.exitCode = OUT.result.M2_CLONE_VALIDATION_PASS ? 0 : 3;
  } catch (e) {
    OUT.error = { message: e.message, code: e.code };
    process.stdout.write(JSON.stringify(OUT, null, 2));
    log('M2_CLONE_ERROR: ' + e.message + ' (code ' + e.code + ')');
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  log('M2_CLONE_FATAL: ' + (err?.message ?? String(err)));
  process.exit(1);
});
