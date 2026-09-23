/**
 * FASE 1.5 — M2 PRIMARY-DEV READ-ONLY PREFLIGHT + PRE-M2 FINGERPRINT.
 *
 * Targets DATABASE_URL (primary dev) ONLY. SELECT-only; enforces
 * SET default_transaction_read_only = on. NO INSERT/UPDATE/DELETE/DDL.
 * Never prints DATABASE_URL / CLONE_DATABASE_URL or any credential.
 * Emits no PII (no names/emails/NIK/household/phone) — only ids/roles/scope
 * counts and deterministic aggregate hashes.
 *
 * Usage (PowerShell):
 *   node scripts/preflight-m2-dev.mjs > _m2_dev_preflight.json
 *
 * Exit: 0 = M2_PRIMARY_PREFLIGHT_PASS, 3 = FAIL, 1 = error, 2 = guard refusal.
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import pg from 'pg';

const PLATFORM = '00000000-0000-0000-0000-000000000010';
const RT01 = '00000000-0000-0000-0000-000000000011';
const RT02 = '00000000-0000-0000-0000-000000000012';
const EXPECTED_LEGACY = { tenants: 3, users: 21, residents: 54, households: 19 };
const PRIMARY_HOST_PREFIX = 'ep-dry-cake-aoi3l143';
const CLONE_HOST_PREFIX = 'ep-winter-river-aol4em67';

const EXPECTED_ENUMS = {
  OrgUnitType: ['ORGANIZATION', 'CLUSTER', 'RW', 'RT'],
  MembershipRole: ['PLATFORM_ADMIN', 'TENANT_OWNER', 'ORG_ADMIN', 'RT_ADMIN', 'SECURITY', 'RESIDENT'],
  MembershipStatus: ['INVITED', 'ACTIVE', 'SUSPENDED', 'REVOKED'],
};
const MANIFEST = [
  { user_id: '00000000-0000-0000-0000-000000000021', tenant_id: PLATFORM, role: 'Ketua_RT' },
  { user_id: '00000000-0000-0000-0000-000000000022', tenant_id: PLATFORM, role: 'Pengurus' },
  { user_id: '00000000-0000-0000-0000-000000000023', tenant_id: PLATFORM, role: 'Warga' },
  { user_id: '00000000-0000-0000-0000-000000000024', tenant_id: PLATFORM, role: 'Security_Guard' },
  { user_id: '42cc1bea-9a68-44b1-aadf-1bb0bb609028', tenant_id: PLATFORM, role: 'Warga' },
];
const MANIFEST_IDS = MANIFEST.map(m => m.user_id);

const OUT = { meta: {}, checks: {}, evidence: {}, fingerprint: {} };
function log(m) { process.stderr.write(m + '\n'); }
async function q(c, sql, p = []) { return (await c.query(sql, p)).rows; }
function normLabels(l) {
  if (Array.isArray(l)) return l;
  if (typeof l === 'string' && l.startsWith('{') && l.endsWith('}')) {
    const inner = l.slice(1, -1); return inner === '' ? [] : inner.split(',').map(x => x.trim());
  }
  return null;
}
function arrEq(a, b) { return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]); }
const sha = s => createHash('sha256').update(s).digest('hex');

async function main() {
  const dev = process.env.DATABASE_URL;
  const clone = process.env.CLONE_DATABASE_URL;
  if (!dev || dev.trim() === '') { log('M2_PREFLIGHT_ERROR: DATABASE_URL not set.'); process.exit(2); }

  const devHost = (dev.match(/@([^/:?]+)/)?.[1]) ?? '';
  const cloneHost = (clone?.match(/@([^/:?]+)/)?.[1]) ?? '';
  const pool = new pg.Pool({ connectionString: dev });
  const client = await pool.connect();
  try {
    await client.query('SET default_transaction_read_only = on');
    OUT.checks.read_only_enforced = (await q(client, 'SHOW default_transaction_read_only'))[0].default_transaction_read_only === 'on';

    // STEP 2 — target identity + isolation
    const meta = (await q(client, `SELECT current_database() db, current_user u, version() v`))[0];
    OUT.meta = { database: meta.db, db_user: meta.u, pg_version: meta.v, host_prefix: devHost.split('-pooler')[0] };
    OUT.checks.target_host_prefix_ok = devHost.startsWith(PRIMARY_HOST_PREFIX);
    OUT.checks.target_database_ok = meta.db === 'neondb';
    OUT.checks.target_not_clone = !devHost.startsWith(CLONE_HOST_PREFIX) &&
      (!clone || dev.trim() !== clone.trim());
    OUT.checks.clone_prefix_distinct = cloneHost === '' || cloneHost.startsWith(CLONE_HOST_PREFIX);

    // STEP 3 — M1 installed + PRE-M2 state
    const reg = (await q(client, `SELECT to_regclass('public.org_units') ou, to_regclass('public.memberships') mem`))[0];
    OUT.checks.m1_installed = reg.ou !== null && reg.mem !== null;
    const rows = (await q(client, `SELECT (SELECT count(*)::int FROM org_units) ou, (SELECT count(*)::int FROM memberships) mem`))[0];
    OUT.evidence.target_rows = rows;
    OUT.checks.org_units_zero = rows.ou === 0;
    OUT.checks.memberships_zero = rows.mem === 0;
    OUT.checks.no_partial_m2 = rows.ou === 0 && rows.mem === 0;

    // legacy counts
    const counts = await q(client, `SELECT 'tenants' t, count(*)::int n FROM tenants
      UNION ALL SELECT 'users', count(*)::int FROM users WHERE deleted_at IS NULL
      UNION ALL SELECT 'residents', count(*)::int FROM residents
      UNION ALL SELECT 'households', count(*)::int FROM households ORDER BY t`);
    const cmap = Object.fromEntries(counts.map(r => [r.t, r.n]));
    OUT.evidence.legacy_counts = cmap;
    OUT.checks.legacy_counts_ok = cmap.tenants === EXPECTED_LEGACY.tenants && cmap.users === EXPECTED_LEGACY.users &&
      cmap.residents === EXPECTED_LEGACY.residents && cmap.households === EXPECTED_LEGACY.households;

    // source-role classification
    const sa = (await q(client, `SELECT count(*)::int n FROM users WHERE deleted_at IS NULL AND tenant_id=$1 AND role='Super_Admin'`, [PLATFORM]))[0].n;
    const rt = (await q(client, `SELECT count(*)::int n FROM users WHERE deleted_at IS NULL AND tenant_id IN ($1,$2)`, [RT01, RT02]))[0].n;
    const anomalies = (await q(client, `SELECT count(*)::int n FROM users WHERE deleted_at IS NULL AND tenant_id=$1 AND role<>'Super_Admin'`, [PLATFORM]))[0].n;
    OUT.evidence.source_roles = { platform_super_admin: sa, ordinary_rt_users: rt, platform_anomalies: anomalies };
    OUT.checks.platform_super_admin_ok = sa === 3;
    OUT.checks.ordinary_rt_users_ok = rt === 13;
    OUT.checks.platform_anomalies_ok = anomalies === 5;

    // exclusion manifest exact
    const manifestMatch = (await q(client, `SELECT count(*)::int n FROM users u
      WHERE u.deleted_at IS NULL AND (u.id,u.tenant_id,u.role::text) IN (
        ('00000000-0000-0000-0000-000000000021','${PLATFORM}','Ketua_RT'),
        ('00000000-0000-0000-0000-000000000022','${PLATFORM}','Pengurus'),
        ('00000000-0000-0000-0000-000000000023','${PLATFORM}','Warga'),
        ('00000000-0000-0000-0000-000000000024','${PLATFORM}','Security_Guard'),
        ('42cc1bea-9a68-44b1-aadf-1bb0bb609028','${PLATFORM}','Warga'))`))[0].n;
    const outside = (await q(client, `SELECT count(*)::int n FROM users u
      WHERE u.deleted_at IS NULL AND u.tenant_id=$1 AND u.role<>'Super_Admin' AND u.id <> ALL($2::text[])`, [PLATFORM, MANIFEST_IDS]))[0].n;
    OUT.evidence.exclusion_manifest = { matched: manifestMatch, outside_manifest: outside };
    OUT.checks.manifest_exact_five = manifestMatch === 5 && outside === 0;

    // unknown role / orphan / null tenant
    const unknownRole = (await q(client, `SELECT count(*)::int n FROM users WHERE deleted_at IS NULL AND role NOT IN ('Super_Admin','Ketua_RT','Pengurus','Warga','Security_Guard')`))[0].n;
    const orphan = (await q(client, `SELECT count(*)::int n FROM users u LEFT JOIN tenants t ON t.id=u.tenant_id WHERE u.deleted_at IS NULL AND t.id IS NULL`))[0].n;
    const nullTenant = (await q(client, `SELECT count(*)::int n FROM users WHERE deleted_at IS NULL AND tenant_id IS NULL`))[0].n;
    OUT.evidence.integrity = { unknown_role: unknownRole, orphan_user_tenant: orphan, null_tenant_users: nullTenant };
    OUT.checks.no_unknown_role = unknownRole === 0;
    OUT.checks.no_orphan_user = orphan === 0;
    OUT.checks.tenant_ownership_ok = nullTenant === 0;

    // M1 structure: enums + composite FKs + key indexes
    const enums = await q(client, `SELECT t.typname n, array_agg(e.enumlabel ORDER BY e.enumsortorder) labels
      FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
      WHERE t.typname IN ('OrgUnitType','MembershipRole','MembershipStatus') GROUP BY t.typname`);
    const eByName = Object.fromEntries(enums.map(e => [e.n, normLabels(e.labels)]));
    OUT.checks.enums_exact = arrEq(eByName.OrgUnitType, EXPECTED_ENUMS.OrgUnitType) &&
      arrEq(eByName.MembershipRole, EXPECTED_ENUMS.MembershipRole) &&
      arrEq(eByName.MembershipStatus, EXPECTED_ENUMS.MembershipStatus);
    const fks = await q(client, `SELECT con.conname n, pg_get_constraintdef(con.oid) def
      FROM pg_constraint con JOIN pg_class rel ON rel.oid=con.conrelid JOIN pg_namespace ns ON ns.oid=rel.relnamespace
      WHERE ns.nspname='public' AND con.contype='f' AND rel.relname IN ('org_units','memberships')`);
    const norm = s => (s || '').replace(/"/g, '');
    OUT.checks.composite_fks_present =
      fks.some(f => f.n === 'org_units_parent_same_tenant_fkey' && /REFERENCES org_units\(id, tenant_id\)/.test(norm(f.def))) &&
      fks.some(f => f.n === 'memberships_org_unit_same_tenant_fkey' && /REFERENCES org_units\(id, tenant_id\)/.test(norm(f.def)));
    const idx = await q(client, `SELECT indexname n FROM pg_indexes WHERE schemaname='public' AND tablename IN ('org_units','memberships')`);
    const idxNames = idx.map(i => i.n);
    OUT.checks.m1_indexes_present = ['org_units_id_tenant_id_key', 'org_units_path_gin_idx',
      'memberships_user_tenant_orgunit_uq', 'memberships_user_tenant_null_orgunit_uq'].every(n => idxNames.includes(n));

    // B4 drift — must remain absent (unchanged)
    const drift = {};
    for (const t of ['gates', 'cctv_cameras', 'homes']) {
      drift[t] = (await q(client, `SELECT to_regclass($1) IS NOT NULL e`, [`public.${t}`]))[0].e === true;
    }
    OUT.evidence.b4_drift = drift;
    OUT.checks.b4_drift_unchanged = drift.gates === false && drift.cctv_cameras === false && drift.homes === false;

    // STEP 4 — sanitized PRE-M2 fingerprint (aggregate hashes, no PII)
    const roleMatrix = await q(client, `SELECT tenant_id, role::text role, count(*)::int n FROM users WHERE deleted_at IS NULL
      GROUP BY tenant_id, role ORDER BY tenant_id, role`);
    const roleMatrixStr = roleMatrix.map(r => `${r.tenant_id}|${r.role}|${r.n}`).join(';');
    const manifestStr = MANIFEST.map(m => `${m.user_id}|${m.tenant_id}|${m.role}`).join(';');
    // ordered list of RT-tenant source (id|tenant|role) — ids are controlled seeds, not PII, but hash anyway
    const rtRows = await q(client, `SELECT id, tenant_id, role::text role FROM users
      WHERE deleted_at IS NULL AND tenant_id IN ($1,$2) ORDER BY id`, [RT01, RT02]);
    const rtStr = rtRows.map(r => `${r.id}|${r.tenant_id}|${r.role}`).join(';');
    const saRows = await q(client, `SELECT id FROM users WHERE deleted_at IS NULL AND tenant_id=$1 AND role='Super_Admin' ORDER BY id`, [PLATFORM]);
    const saStr = saRows.map(r => r.id).join(';');
    OUT.fingerprint = {
      tenants: cmap.tenants, users: cmap.users, residents: cmap.residents, households: cmap.households,
      org_units: rows.ou, memberships: rows.mem,
      platform_admin_source_count: sa, ordinary_rt_source_count: rt,
      excluded_manifest_count: manifestMatch, unexpected_platform_nonadmin_count: outside,
      legacy_integrity_ok: unknownRole === 0 && orphan === 0 && nullTenant === 0,
      role_matrix_sha256: sha(roleMatrixStr),
      exclusion_manifest_sha256: sha(manifestStr),
      rt_source_identity_sha256: sha(rtStr),
      platform_super_admin_identity_sha256: sha(saStr),
    };

    const c = OUT.checks;
    c.M2_PRIMARY_PREFLIGHT_PASS =
      c.read_only_enforced && c.target_host_prefix_ok && c.target_database_ok && c.target_not_clone &&
      c.m1_installed && c.org_units_zero && c.memberships_zero && c.no_partial_m2 &&
      c.legacy_counts_ok && c.platform_super_admin_ok && c.ordinary_rt_users_ok && c.platform_anomalies_ok &&
      c.manifest_exact_five && c.no_unknown_role && c.no_orphan_user && c.tenant_ownership_ok &&
      c.enums_exact && c.composite_fks_present && c.m1_indexes_present && c.b4_drift_unchanged;

    process.stdout.write(JSON.stringify(OUT, null, 2));
    log('M2_PREFLIGHT_DONE: M2_PRIMARY_PREFLIGHT_PASS=' + c.M2_PRIMARY_PREFLIGHT_PASS);
    process.exitCode = c.M2_PRIMARY_PREFLIGHT_PASS ? 0 : 3;
  } catch (e) {
    OUT.error = { message: e.message, code: e.code };
    process.stdout.write(JSON.stringify(OUT, null, 2));
    log('M2_PREFLIGHT_ERROR: ' + e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(e => { log('M2_PREFLIGHT_FATAL: ' + (e?.message ?? e)); process.exit(1); });
