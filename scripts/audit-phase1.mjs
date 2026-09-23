/**
 * FASE 1.2a — Pre-Migration Anomaly Audit (READ-ONLY).
 *
 * SELECT-only. Tidak melakukan DDL/DML/mutasi apa pun. Tidak menampilkan
 * plaintext NIK / password / token / secret. NIK hanya diukur via COUNT dan
 * distribusi panjang; tidak pernah di-SELECT nilainya ke output.
 *
 * Usage: node scripts/audit-phase1.mjs > audit-out.json
 * (DATABASE_URL diambil dari .env via dotenv, konsisten dengan seed.ts)
 */

import 'dotenv/config';
import pg from 'pg';

const OUT = {};

function section(name, rows) {
  OUT[name] = rows;
}

async function q(client, sql, params = []) {
  const res = await client.query(sql, params);
  return res.rows;
}

async function tableExists(client, table) {
  const rows = await q(
    client,
    `SELECT to_regclass($1) IS NOT NULL AS exists`,
    [`public.${table}`],
  );
  return rows[0]?.exists === true;
}

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    // Guard: this session must never write. Enforce read-only at TX level.
    await client.query('SET default_transaction_read_only = on');

    // ---- meta / snapshot context (no credentials) ----
    section('meta', await q(client, `
      SELECT current_database() AS database,
             current_user       AS db_user,
             now()              AS audited_at,
             version()          AS pg_version
    `));

    // ---- row counts (core tables) ----
    section('row_counts', await q(client, `
      SELECT 'tenants' AS t, count(*)::int AS n FROM tenants
      UNION ALL SELECT 'users', count(*)::int FROM users
      UNION ALL SELECT 'users_not_deleted', count(*)::int FROM users WHERE deleted_at IS NULL
      UNION ALL SELECT 'residents', count(*)::int FROM residents
      UNION ALL SELECT 'residents_not_deleted', count(*)::int FROM residents WHERE deleted_at IS NULL
      UNION ALL SELECT 'households', count(*)::int FROM households
      UNION ALL SELECT 'subscription_plans', count(*)::int FROM subscription_plans
      ORDER BY t
    `));

    // ---- TENANT anomalies ----
    section('tenant_total', await q(client, `SELECT count(*)::int AS n FROM tenants`));
    section('tenant_null_blank_rtrw', await q(client, `
      SELECT count(*)::int AS n FROM tenants
      WHERE rt_rw_number IS NULL OR btrim(rt_rw_number) = ''
    `));
    section('tenant_null_blank_region', await q(client, `
      SELECT count(*)::int AS n FROM tenants
      WHERE region IS NULL OR btrim(region) = ''
    `));
    section('tenant_null_blank_name', await q(client, `
      SELECT count(*)::int AS n FROM tenants
      WHERE name IS NULL OR btrim(name) = ''
    `));
    // duplicate normalized (rt_rw_number, region)
    section('tenant_dup_rtrw_region_normalized', await q(client, `
      SELECT lower(btrim(rt_rw_number)) AS rtrw_norm,
             lower(btrim(region))       AS region_norm,
             count(*)::int              AS n
      FROM tenants
      GROUP BY 1,2 HAVING count(*) > 1
      ORDER BY n DESC
    `));
    // status distribution + siren inventory (device id masked to boolean presence)
    section('tenant_status_dist', await q(client, `
      SELECT status, count(*)::int AS n FROM tenants GROUP BY status ORDER BY n DESC
    `));
    section('tenant_siren_presence', await q(client, `
      SELECT (siren_device_id IS NOT NULL AND btrim(siren_device_id) <> '') AS has_siren,
             count(*)::int AS n
      FROM tenants GROUP BY 1
    `));

    // ---- USER / identity anomalies ----
    section('user_total', await q(client, `SELECT count(*)::int AS n FROM users`));
    section('user_orphan_tenant', await q(client, `
      SELECT count(*)::int AS n FROM users u
      LEFT JOIN tenants t ON t.id = u.tenant_id
      WHERE t.id IS NULL
    `));
    section('user_null_blank_email', await q(client, `
      SELECT count(*)::int AS n FROM users
      WHERE email IS NULL OR btrim(email) = ''
    `));
    // duplicate normalized email WITHIN tenant (should be blocked by unique, verify)
    section('user_dup_email_within_tenant', await q(client, `
      SELECT tenant_id, lower(btrim(email)) AS email_norm, count(*)::int AS n
      FROM users
      GROUP BY 1,2 HAVING count(*) > 1
      ORDER BY n DESC
    `));
    // duplicate normalized email ACROSS tenants (candidate identity, NOT proof)
    section('user_dup_email_cross_tenant', await q(client, `
      SELECT email_norm, tenant_count, user_count FROM (
        SELECT lower(btrim(email)) AS email_norm,
               count(DISTINCT tenant_id)::int AS tenant_count,
               count(*)::int AS user_count
        FROM users
        WHERE email IS NOT NULL AND btrim(email) <> ''
        GROUP BY 1
      ) s WHERE tenant_count > 1
      ORDER BY tenant_count DESC, user_count DESC
    `));
    // role distribution (global + per tenant flag for platform tenant)
    section('user_role_dist', await q(client, `
      SELECT role, count(*)::int AS n FROM users GROUP BY role ORDER BY n DESC
    `));
    section('user_status_dist', await q(client, `
      SELECT status, count(*)::int AS n FROM users GROUP BY status ORDER BY n DESC
    `));

    // ---- Super_Admin semantics (platform vs tenant-scoped) ----
    // Show which tenants Super_Admins belong to + whether that tenant looks like
    // the platform tenant (subdomain='platform'). No emails/PII in output.
    section('super_admin_by_tenant', await q(client, `
      SELECT u.tenant_id,
             t.subdomain,
             (t.subdomain = 'platform') AS is_platform_tenant,
             count(*)::int AS super_admin_count
      FROM users u
      LEFT JOIN tenants t ON t.id = u.tenant_id
      WHERE u.role = 'Super_Admin'
      GROUP BY u.tenant_id, t.subdomain
      ORDER BY super_admin_count DESC
    `));
    section('pengurus_by_tenant', await q(client, `
      SELECT tenant_id, count(*)::int AS pengurus_count
      FROM users WHERE role = 'Pengurus'
      GROUP BY tenant_id ORDER BY pengurus_count DESC
    `));

    // ---- RESIDENT anomalies (NIK never shown in plaintext) ----
    section('resident_total', await q(client, `SELECT count(*)::int AS n FROM residents`));
    section('resident_orphan_tenant', await q(client, `
      SELECT count(*)::int AS n FROM residents r
      LEFT JOIN tenants t ON t.id = r.tenant_id WHERE t.id IS NULL
    `));
    section('resident_orphan_household', await q(client, `
      SELECT count(*)::int AS n FROM residents r
      LEFT JOIN households h ON h.id = r.household_id WHERE h.id IS NULL
    `));
    section('resident_null_blank_nik', await q(client, `
      SELECT count(*)::int AS n FROM residents
      WHERE nik IS NULL OR btrim(nik) = ''
    `));
    // NIK length distribution (structure signal only; NOT the value)
    section('resident_nik_length_dist', await q(client, `
      SELECT length(btrim(nik)) AS nik_length, count(*)::int AS n
      FROM residents WHERE nik IS NOT NULL
      GROUP BY 1 ORDER BY 1
    `));
    // duplicate NIK within tenant (should be blocked by unique; verify count only)
    section('resident_dup_nik_within_tenant', await q(client, `
      SELECT count(*)::int AS colliding_groups FROM (
        SELECT tenant_id, btrim(nik) AS nik_norm
        FROM residents WHERE nik IS NOT NULL AND btrim(nik) <> ''
        GROUP BY 1,2 HAVING count(*) > 1
      ) s
    `));
    // duplicate NIK cross tenant (count of NIK values shared across >1 tenant; value hashed/masked)
    section('resident_dup_nik_cross_tenant', await q(client, `
      SELECT count(*)::int AS nik_shared_across_tenants FROM (
        SELECT btrim(nik) AS nik_norm, count(DISTINCT tenant_id) AS tc
        FROM residents WHERE nik IS NOT NULL AND btrim(nik) <> ''
        GROUP BY 1 HAVING count(DISTINCT tenant_id) > 1
      ) s
    `));

    // ---- HOUSEHOLD anomalies ----
    section('household_total', await q(client, `SELECT count(*)::int AS n FROM households`));
    section('household_orphan_tenant', await q(client, `
      SELECT count(*)::int AS n FROM households h
      LEFT JOIN tenants t ON t.id = h.tenant_id WHERE t.id IS NULL
    `));
    section('household_dup_number_within_tenant', await q(client, `
      SELECT count(*)::int AS colliding_groups FROM (
        SELECT tenant_id, btrim(household_number) AS hh_norm
        FROM households
        GROUP BY 1,2 HAVING count(*) > 1
      ) s
    `));
    section('household_orphan_resident_refs', await q(client, `
      SELECT count(*)::int AS residents_pointing_to_missing_household
      FROM residents r
      LEFT JOIN households h ON h.id = r.household_id
      WHERE r.household_id IS NOT NULL AND h.id IS NULL
    `));

    // ---- Resident <-> User relationship (are there any linking columns?) ----
    section('resident_columns', await q(client, `
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='residents'
      ORDER BY ordinal_position
    `));

    // ---- IoT ownership inventory (read-only, presence/counts only) ----
    for (const tbl of ['iot_devices','gates','cctv_cameras','alarm_devices','door_sensor_configs','homes','device_events']) {
      if (await tableExists(client, tbl)) {
        section(`iot_count_${tbl}`, await q(client, `SELECT count(*)::int AS n FROM ${tbl}`));
      } else {
        section(`iot_count_${tbl}`, [{ n: null, note: 'table missing' }]);
      }
    }
    if (await tableExists(client, 'iot_devices')) {
      section('iot_devices_ownership', await q(client, `
        SELECT (tenant_id IS NOT NULL) AS has_tenant,
               (household_id IS NOT NULL) AS has_household,
               count(*)::int AS n
        FROM iot_devices GROUP BY 1,2
      `));
    }
    if (await tableExists(client, 'door_sensor_configs')) {
      section('door_sensor_binding', await q(client, `
        SELECT (iot_device_id IS NOT NULL) AS has_device,
               enabled, count(*)::int AS n
        FROM door_sensor_configs GROUP BY 1,2 ORDER BY n DESC
      `));
    }

    // ---- OrgUnit / Membership existence check (should be absent) ----
    section('target_tables_exist', await q(client, `
      SELECT
        to_regclass('public.org_units')  IS NOT NULL AS org_units_exists,
        to_regclass('public.memberships') IS NOT NULL AS memberships_exists
    `));

    process.stdout.write(JSON.stringify(OUT, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  process.stderr.write('AUDIT_ERROR: ' + (err?.message ?? String(err)) + '\n');
  process.exit(1);
});
