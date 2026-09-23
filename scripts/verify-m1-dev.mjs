/**
 * FASE 1.2c — STEP 6: POST-M1 STRUCTURAL VERIFICATION (READ-ONLY).
 *
 * Inspects PostgreSQL catalogs on the primary dev DB to prove M1 objects were
 * installed correctly. SELECT-only; enforces default_transaction_read_only = on.
 * Runs NO NT1-NT8 fixtures, NO writes, NO DDL. Never prints DATABASE_URL/creds.
 *
 * Usage (PowerShell):
 *   node scripts/verify-m1-dev.mjs > _m1_dev_postverify.json
 *
 * Exit: 0 = STEP_6_STRUCTURAL_VERIFICATION_PASS, 3 = FAIL, 1 = error.
 */

import 'dotenv/config';
import pg from 'pg';

const EXPECTED_LEGACY = { tenants: 3, users: 21, residents: 54, households: 19 };
const EXPECTED_DEV_HOST_FRAGMENT = 'ep-dry-cake-aoi3l143';
const KNOWN_OTHER_FRAGMENTS = [
  'ep-winter-river-aol4em67',
  'ep-red-dawn-aorpo22p',
  'ep-morning-boat-aophuh8j',
  'recovery',
];

const EXPECTED_ENUMS = {
  OrgUnitType: ['ORGANIZATION', 'CLUSTER', 'RW', 'RT'],
  MembershipRole: ['PLATFORM_ADMIN', 'TENANT_OWNER', 'ORG_ADMIN', 'RT_ADMIN', 'SECURITY', 'RESIDENT'],
  MembershipStatus: ['INVITED', 'ACTIVE', 'SUSPENDED', 'REVOKED'],
};

const OUT = { meta: {}, checks: {}, evidence: {} };

function log(m) {
  process.stderr.write(m + '\n');
}
async function q(client, sql, params = []) {
  return (await client.query(sql, params)).rows;
}
function normLabels(labels) {
  if (Array.isArray(labels)) return labels;
  if (typeof labels === 'string') {
    const s = labels.trim();
    if (s.startsWith('{') && s.endsWith('}')) {
      const inner = s.slice(1, -1);
      return inner === '' ? [] : inner.split(',').map(x => x.trim());
    }
  }
  return null;
}
function arrEq(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
}
function sanitizeHost() {
  const m = (process.env.DATABASE_URL || '').match(/@([^/:?]+)/);
  return m ? m[1] : 'unknown';
}
/** column lookup helper */
function col(cols, table, name) {
  return cols.find(c => c.table_name === table && c.column_name === name);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    log('VERIFY_ERROR: DATABASE_URL not set.');
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('SET default_transaction_read_only = on');

    // 1. Identity
    const meta = (
      await q(client, `SELECT current_database() AS database, current_user AS db_user,
                              now() AS checked_at, version() AS pg_version`)
    )[0];
    const host = sanitizeHost();
    OUT.meta = {
      database: meta.database,
      db_user: meta.db_user,
      pg_version: meta.pg_version,
      checked_at: meta.checked_at,
      host_identifier: host,
    };
    const isDev = host.includes(EXPECTED_DEV_HOST_FRAGMENT);
    const isOther = KNOWN_OTHER_FRAGMENTS.some(f => host.includes(f));
    OUT.checks.target_identity_ok = isDev && !isOther && meta.database === 'neondb';
    const roRow = (await q(client, `SHOW default_transaction_read_only`))[0];
    OUT.checks.read_only_enforced = roRow.default_transaction_read_only === 'on';

    // 2. Tables present
    const tbl = {};
    for (const t of ['org_units', 'memberships']) {
      tbl[t] = (await q(client, `SELECT to_regclass($1) IS NOT NULL AS e`, [`public.${t}`]))[0].e === true;
    }
    OUT.evidence.tables = tbl;
    OUT.checks.tables_present = tbl.org_units === true && tbl.memberships === true;

    // Columns for both tables
    const cols = await q(
      client,
      `SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema='public' AND table_name IN ('org_units','memberships')
       ORDER BY table_name, ordinal_position`,
    );
    OUT.evidence.columns = cols;

    // 3. OrgUnit structure
    const ouExpect = [
      ['id', 'text', 'NO'],
      ['tenant_id', 'text', 'NO'],
      ['parent_id', 'text', 'YES'],
      ['type', 'USER-DEFINED', 'NO', 'OrgUnitType'],
      ['name', 'text', 'NO'],
      ['path', 'ARRAY', 'NO', '_text'],
      ['depth', 'integer', 'NO'],
      ['created_at', 'timestamp without time zone', 'NO'],
      ['updated_at', 'timestamp without time zone', 'NO'],
    ];
    OUT.checks.org_unit_structure_ok = ouExpect.every(([n, dt, nn, udt]) => {
      const c = col(cols, 'org_units', n);
      return c && c.data_type === dt && c.is_nullable === nn && (!udt || c.udt_name === udt);
    });

    // 4. Membership structure
    const mExpect = [
      ['id', 'text', 'NO'],
      ['user_id', 'text', 'NO'],
      ['tenant_id', 'text', 'NO'],
      ['org_unit_id', 'text', 'YES'],
      ['role', 'USER-DEFINED', 'NO', 'MembershipRole'],
      ['status', 'USER-DEFINED', 'NO', 'MembershipStatus'],
      ['created_at', 'timestamp without time zone', 'NO'],
      ['updated_at', 'timestamp without time zone', 'NO'],
      ['revoked_at', 'timestamp without time zone', 'YES'],
    ];
    OUT.checks.membership_structure_ok = mExpect.every(([n, dt, nn, udt]) => {
      const c = col(cols, 'memberships', n);
      return c && c.data_type === dt && c.is_nullable === nn && (!udt || c.udt_name === udt);
    });

    // Constraints (pk / fk / check) for both tables
    const cons = await q(
      client,
      `SELECT rel.relname AS table_name, con.conname AS name, con.contype AS type,
              pg_get_constraintdef(con.oid) AS def
       FROM pg_constraint con
       JOIN pg_class rel ON rel.oid = con.conrelid
       JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
       WHERE nsp.nspname='public' AND rel.relname IN ('org_units','memberships')
       ORDER BY rel.relname, con.conname`,
    );
    OUT.evidence.constraints = cons;
    const hasCon = (table, pred) => cons.some(c => c.table_name === table && pred(c));
    const norm = s => (s || '').replace(/"/g, '');

    OUT.checks.org_unit_constraints_ok =
      hasCon('org_units', c => c.type === 'p' && /\(id\)/.test(norm(c.def))) &&
      hasCon('org_units', c => c.type === 'f' && /FOREIGN KEY \(tenant_id\) REFERENCES tenants\(id\)/.test(norm(c.def))) &&
      hasCon('org_units', c =>
        c.type === 'f' &&
        c.name === 'org_units_parent_same_tenant_fkey' &&
        /FOREIGN KEY \(parent_id, tenant_id\) REFERENCES org_units\(id, tenant_id\)/.test(norm(c.def)),
      ) &&
      hasCon('org_units', c => c.type === 'c' && /depth >= 0/.test(norm(c.def)));

    OUT.checks.membership_constraints_ok =
      hasCon('memberships', c => c.type === 'p' && /\(id\)/.test(norm(c.def))) &&
      hasCon('memberships', c => c.type === 'f' && /FOREIGN KEY \(user_id\) REFERENCES users\(id\)/.test(norm(c.def))) &&
      hasCon('memberships', c => c.type === 'f' && /FOREIGN KEY \(tenant_id\) REFERENCES tenants\(id\)/.test(norm(c.def))) &&
      hasCon('memberships', c =>
        c.type === 'f' &&
        c.name === 'memberships_org_unit_same_tenant_fkey' &&
        /FOREIGN KEY \(org_unit_id, tenant_id\) REFERENCES org_units\(id, tenant_id\)/.test(norm(c.def)),
      );

    // Indexes
    const idx = await q(
      client,
      `SELECT tablename AS table_name, indexname AS name, indexdef AS def
       FROM pg_indexes
       WHERE schemaname='public' AND tablename IN ('org_units','memberships')
       ORDER BY tablename, indexname`,
    );
    OUT.evidence.indexes = idx;
    const hasIdx = (name, pred) => idx.some(i => i.name === name && (!pred || pred(i.def)));

    const candidateUnique = hasIdx('org_units_id_tenant_id_key', d => /UNIQUE/i.test(d) && /\(id, tenant_id\)/.test(norm(d)));
    const ginPath = hasIdx('org_units_path_gin_idx', d => /USING gin/i.test(d) && /\(path\)/.test(norm(d)));
    const ouTenantIdx = hasIdx('org_units_tenant_id_idx');
    const ouParentIdx = hasIdx('org_units_parent_id_idx');
    const orgScopedUq = hasIdx(
      'memberships_user_tenant_orgunit_uq',
      d => /UNIQUE/i.test(d) && /\(user_id, tenant_id, org_unit_id\)/.test(norm(d)) && /WHERE \(org_unit_id IS NOT NULL\)/.test(norm(d)),
    );
    const tenantLevelUq = hasIdx(
      'memberships_user_tenant_null_orgunit_uq',
      d => /UNIQUE/i.test(d) && /\(user_id, tenant_id\)/.test(norm(d)) && /WHERE \(org_unit_id IS NULL\)/.test(norm(d)),
    );
    const mUserIdx = hasIdx('memberships_user_id_idx');
    const mTenantIdx = hasIdx('memberships_tenant_id_idx');
    const mOrgUnitIdx = hasIdx('memberships_org_unit_id_idx');

    OUT.evidence.index_checks = {
      candidate_unique_index: candidateUnique,
      gin_path_index: ginPath,
      org_units_tenant_id_idx: ouTenantIdx,
      org_units_parent_id_idx: ouParentIdx,
      org_scoped_partial_unique: orgScopedUq,
      tenant_level_partial_unique: tenantLevelUq,
      memberships_user_id_idx: mUserIdx,
      memberships_tenant_id_idx: mTenantIdx,
      memberships_org_unit_id_idx: mOrgUnitIdx,
    };
    OUT.checks.indexes_ok =
      candidateUnique && ginPath && ouTenantIdx && ouParentIdx &&
      orgScopedUq && tenantLevelUq && mUserIdx && mTenantIdx && mOrgUnitIdx;

    // Confirm role NOT part of either uniqueness key (defs above already exclude it; assert explicitly)
    const orgScopedDef = norm(idx.find(i => i.name === 'memberships_user_tenant_orgunit_uq')?.def);
    const tenantLevelDef = norm(idx.find(i => i.name === 'memberships_user_tenant_null_orgunit_uq')?.def);
    OUT.evidence.role_not_in_uniqueness =
      !!orgScopedDef && !/role/.test(orgScopedDef) && !!tenantLevelDef && !/role/.test(tenantLevelDef);

    // 5. Enums exact
    const enums = await q(
      client,
      `SELECT t.typname AS enum_name, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
       FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
       WHERE t.typname IN ('OrgUnitType','MembershipRole','MembershipStatus')
       GROUP BY t.typname`,
    );
    const byName = Object.fromEntries(enums.map(e => [e.enum_name, normLabels(e.labels)]));
    OUT.evidence.enums = byName;
    OUT.checks.org_unit_type_enum_exact = arrEq(byName.OrgUnitType, EXPECTED_ENUMS.OrgUnitType);
    OUT.checks.membership_role_enum_exact = arrEq(byName.MembershipRole, EXPECTED_ENUMS.MembershipRole);
    OUT.checks.membership_status_enum_exact = arrEq(byName.MembershipStatus, EXPECTED_ENUMS.MembershipStatus);

    // 6. Zero target rows
    const rows = (
      await q(client, `SELECT (SELECT count(*)::int FROM org_units) AS org_units,
                              (SELECT count(*)::int FROM memberships) AS memberships`)
    )[0];
    OUT.evidence.target_rows = rows;
    OUT.checks.target_rows_zero = rows.org_units === 0 && rows.memberships === 0;

    // 7. Legacy preservation + integrity
    const counts = await q(
      client,
      `SELECT 'tenants' AS t, count(*)::int AS n FROM tenants
       UNION ALL SELECT 'users', count(*)::int FROM users
       UNION ALL SELECT 'residents', count(*)::int FROM residents
       UNION ALL SELECT 'households', count(*)::int FROM households ORDER BY t`,
    );
    const cmap = Object.fromEntries(counts.map(r => [r.t, r.n]));
    OUT.evidence.legacy_counts = { expected: EXPECTED_LEGACY, actual: cmap };
    OUT.checks.legacy_counts_unchanged =
      cmap.tenants === EXPECTED_LEGACY.tenants && cmap.users === EXPECTED_LEGACY.users &&
      cmap.residents === EXPECTED_LEGACY.residents && cmap.households === EXPECTED_LEGACY.households;

    const orphanUsers = (await q(client, `SELECT count(*)::int AS n FROM users u LEFT JOIN tenants t ON t.id=u.tenant_id WHERE t.id IS NULL`))[0].n;
    const orphanResidents = (await q(client, `SELECT count(*)::int AS n FROM residents r LEFT JOIN tenants t ON t.id=r.tenant_id WHERE t.id IS NULL`))[0].n;
    const orphanHouseholds = (await q(client, `SELECT count(*)::int AS n FROM households h LEFT JOIN tenants t ON t.id=h.tenant_id WHERE t.id IS NULL`))[0].n;
    const nullU = (await q(client, `SELECT count(*)::int AS n FROM users WHERE tenant_id IS NULL`))[0].n;
    const nullR = (await q(client, `SELECT count(*)::int AS n FROM residents WHERE tenant_id IS NULL`))[0].n;
    const nullH = (await q(client, `SELECT count(*)::int AS n FROM households WHERE tenant_id IS NULL`))[0].n;
    const platform = (await q(client, `SELECT count(*)::int AS n FROM tenants WHERE id='00000000-0000-0000-0000-000000000010'`))[0].n;
    OUT.evidence.legacy_integrity = {
      orphan_users: orphanUsers, orphan_residents: orphanResidents, orphan_households: orphanHouseholds,
      null_tenant_users: nullU, null_tenant_residents: nullR, null_tenant_households: nullH,
      platform_tenant_present: platform === 1,
    };
    OUT.checks.legacy_integrity_ok =
      orphanUsers === 0 && orphanResidents === 0 && orphanHouseholds === 0 &&
      nullU === 0 && nullR === 0 && nullH === 0 && platform === 1;

    // 8. B4 drift unchanged (still absent)
    const drift = {};
    for (const t of ['gates', 'cctv_cameras', 'homes']) {
      drift[t] = (await q(client, `SELECT to_regclass($1) IS NOT NULL AS e`, [`public.${t}`]))[0].e === true;
    }
    OUT.evidence.b4_drift_tables = drift;
    OUT.checks.schema_baseline_ok = drift.gates === false && drift.cctv_cameras === false && drift.homes === false;

    // 10. Verdict
    const c = OUT.checks;
    c.STEP_6_STRUCTURAL_VERIFICATION_PASS =
      c.target_identity_ok && c.read_only_enforced && c.tables_present &&
      c.org_unit_structure_ok && c.membership_structure_ok &&
      c.org_unit_constraints_ok && c.membership_constraints_ok && c.indexes_ok &&
      c.org_unit_type_enum_exact && c.membership_role_enum_exact && c.membership_status_enum_exact &&
      c.target_rows_zero && c.legacy_counts_unchanged && c.legacy_integrity_ok && c.schema_baseline_ok &&
      OUT.evidence.role_not_in_uniqueness === true;

    process.stdout.write(JSON.stringify(OUT, null, 2));
    log('VERIFY_DONE: STEP_6_STRUCTURAL_VERIFICATION_PASS=' + c.STEP_6_STRUCTURAL_VERIFICATION_PASS);
    process.exitCode = c.STEP_6_STRUCTURAL_VERIFICATION_PASS ? 0 : 3;
  } catch (e) {
    OUT.error = { message: e.message, code: e.code };
    process.stdout.write(JSON.stringify(OUT, null, 2));
    log('VERIFY_ERROR: ' + e.message + ' (code ' + (e.code ?? 'n/a') + ')');
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  log('VERIFY_FATAL: ' + (err?.message ?? String(err)));
  process.exit(1);
});
