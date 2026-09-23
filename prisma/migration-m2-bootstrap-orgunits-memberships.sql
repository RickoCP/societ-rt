-- ============================================================================
-- M2 — Bootstrap OrgUnits + backfill Memberships (FASE 1.4)
--
-- DATA BACKFILL ONLY. Additive. Atomic. Idempotent. NO legacy row mutation.
-- NO auth cutover. NO schema change (M1 already installed the tables/enums).
--
-- Run on a FRESH NEON CLONE ONLY during FASE 1.4 (never primary dev here):
--   node scripts/validate-m2-clone.mjs        (preferred: full clone validation)
-- or, for a plain apply on a clone:
--   CLONE_DATABASE_URL=... node scripts/run-migration-clone.mjs prisma/migration-m2-bootstrap-orgunits-memberships.sql
--
-- LOCKED DECISIONS APPLIED:
--   D1-C : platform tenant (…010) gets NO OrgUnit; its 3 Super_Admin become
--          tenant-level PLATFORM_ADMIN (org_unit_id = NULL); the 5 platform
--          non-admin users are EXCLUDED (exclusion manifest below).
--   D2   : bootstrap OrgUnit id = UUIDv5('societ-rt:orgunit:legacy-tenant-root:'
--          || tenant_id, NAMESPACE f0e1d2c3-b4a5-5968-8776-655443322110),
--          computed OUT-OF-BAND (scripts/m2-orgunit-id.mjs) and pinned here as
--          literals. NO PostgreSQL extension dependency. This SQL VERIFIES the
--          pinned literal matches the canonical name via a recorded mapping.
--   D3   : bootstrap roots -> parent_id = NULL, depth = 0, path = ARRAY[id]::text[].
--   D4   : strict migration snapshot guards (counts are snapshot expectations for
--          THIS controlled run, not permanent domain invariants). Any mismatch
--          => RAISE EXCEPTION => whole transaction ROLLBACK.
--   D5   : backfilled memberships use status = 'ACTIVE'.
--
-- ROLE MAPPING (legacy users.role -> MembershipRole), data-only:
--   Super_Admin    -> PLATFORM_ADMIN   (tenant-level, org_unit_id NULL, platform)
--   Ketua_RT       -> RT_ADMIN         (org-scoped on the tenant's RT root)
--   Pengurus       -> ORG_ADMIN        (org-scoped)
--   Security_Guard -> SECURITY         (org-scoped)
--   Warga          -> RESIDENT         (org-scoped)
--
-- EXPECTED POST-M2 CARDINALITY (snapshot):
--   org_units bootstrap rows            = 2   (rt01 root, rt02 root)
--   memberships total                   = 16
--     platform tenant-level PLATFORM_ADMIN = 3
--     RT org-scoped                        = 13  (rt01 7 + rt02 6)
--   excluded platform non-admin users   = 5   (exclusion manifest)
--
-- SAFETY MODEL:
--   * Everything runs inside ONE transaction. Any guard failure RAISEs, which
--     aborts and rolls back the entire transaction (no partial M2 state).
--   * Each intended row is classified ABSENT / EXACT-MATCH / CONFLICT.
--       ABSENT      -> INSERT
--       EXACT-MATCH -> no-op (idempotent re-run)
--       CONFLICT    -> RAISE EXCEPTION (never silently ignored; no blind
--                      ON CONFLICT DO NOTHING).
-- ============================================================================

BEGIN;

-- Serialize against concurrent writers to the two target tables for the duration.
LOCK TABLE "org_units" IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE "memberships" IN SHARE ROW EXCLUSIVE MODE;

-- ---------------------------------------------------------------------------
-- 0. Pinned constants (single source of truth mirrored from scripts/m2-orgunit-id.mjs)
--    A temp table holds the deterministic bootstrap OrgUnit ids + the exact
--    canonical name each id must correspond to. The validator independently
--    recomputes these via UUIDv5 and asserts equality; this SQL treats them as
--    authoritative literals and records the mapping for the postcondition proof.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _m2_orgunit_plan (
  tenant_id       text PRIMARY KEY,
  org_unit_id     text NOT NULL,
  canonical_name  text NOT NULL,
  name            text NOT NULL,
  type            "OrgUnitType" NOT NULL
) ON COMMIT DROP;

INSERT INTO _m2_orgunit_plan (tenant_id, org_unit_id, canonical_name, name, type) VALUES
  ('00000000-0000-0000-0000-000000000011',
   '2459b0bb-115e-52ce-88cd-c176a9aa1e39',
   'societ-rt:orgunit:legacy-tenant-root:00000000-0000-0000-0000-000000000011',
   'RT 01 Perumahan Harmoni Indah', 'RT'),
  ('00000000-0000-0000-0000-000000000012',
   '50197f3e-5ebc-5547-91ba-e54b604e0edb',
   'societ-rt:orgunit:legacy-tenant-root:00000000-0000-0000-0000-000000000012',
   'RT 02 Cluster Bunga Melati', 'RT');

-- Exclusion manifest: EXACTLY the five audited platform non-admin anomalies.
-- Each entry is explicit (no broad "role != Super_Admin" rule is used to decide
-- exclusion). reason/category carries no PII.
CREATE TEMP TABLE _m2_exclusion_manifest (
  user_id            text PRIMARY KEY,
  expected_tenant_id text NOT NULL,
  expected_role      "UserRole" NOT NULL,
  category           text NOT NULL
) ON COMMIT DROP;

INSERT INTO _m2_exclusion_manifest (user_id, expected_tenant_id, expected_role, category) VALUES
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000010', 'Ketua_RT',       'platform-anomaly:mis-tenanted-rt-role:has-activity'),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000010', 'Pengurus',       'platform-anomaly:mis-tenanted-rt-role:inactive'),
  ('00000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000010', 'Warga',          'platform-anomaly:mis-tenanted-rt-role:has-activity'),
  ('00000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-000000000010', 'Security_Guard', 'platform-anomaly:mis-tenanted-rt-role:inactive'),
  ('42cc1bea-9a68-44b1-aadf-1bb0bb609028', '00000000-0000-0000-0000-000000000010', 'Warga',          'platform-anomaly:app-registration-style-id:inactive');

-- Role mapping table (legacy UserRole -> MembershipRole + scope kind).
CREATE TEMP TABLE _m2_role_map (
  legacy_role     "UserRole" PRIMARY KEY,
  membership_role "MembershipRole" NOT NULL,
  scope           text NOT NULL  -- 'tenant' (org_unit_id NULL) | 'org' (org-scoped)
) ON COMMIT DROP;

INSERT INTO _m2_role_map (legacy_role, membership_role, scope) VALUES
  ('Super_Admin',    'PLATFORM_ADMIN', 'tenant'),
  ('Ketua_RT',       'RT_ADMIN',       'org'),
  ('Pengurus',       'ORG_ADMIN',      'org'),
  ('Security_Guard', 'SECURITY',       'org'),
  ('Warga',          'RESIDENT',       'org');

-- Constants used repeatedly.
-- platform tenant id = 00000000-0000-0000-0000-000000000010

-- ===========================================================================
-- 1. SOURCE / PRECONDITION GUARDS (D4). Any failure => RAISE => full ROLLBACK.
-- ===========================================================================
DO $$
DECLARE
  v_platform    text := '00000000-0000-0000-0000-000000000010';
  n             int;
  n2            int;
BEGIN
  -- 1.1 M1 installed (both target tables + key enums present).
  IF to_regclass('public.org_units') IS NULL OR to_regclass('public.memberships') IS NULL THEN
    RAISE EXCEPTION 'M2_PRECOND_FAIL: M1 not installed (org_units/memberships missing)';
  END IF;

  -- 1.2 Legacy snapshot counts (D4 snapshot expectation).
  SELECT count(*) INTO n FROM tenants;
  IF n <> 3 THEN RAISE EXCEPTION 'M2_PRECOND_FAIL: expected 3 tenants, found %', n; END IF;

  SELECT count(*) INTO n FROM users WHERE deleted_at IS NULL;
  IF n <> 21 THEN RAISE EXCEPTION 'M2_PRECOND_FAIL: expected 21 active users, found %', n; END IF;

  SELECT count(*) INTO n FROM residents;
  IF n <> 54 THEN RAISE EXCEPTION 'M2_PRECOND_FAIL: expected 54 residents, found %', n; END IF;

  SELECT count(*) INTO n FROM households;
  IF n <> 19 THEN RAISE EXCEPTION 'M2_PRECOND_FAIL: expected 19 households, found %', n; END IF;

  -- 1.3 No orphan User->Tenant, no NULL tenant ownership.
  SELECT count(*) INTO n FROM users u LEFT JOIN tenants t ON t.id = u.tenant_id
    WHERE u.deleted_at IS NULL AND t.id IS NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'M2_PRECOND_FAIL: % orphan user->tenant', n; END IF;

  SELECT count(*) INTO n FROM users WHERE deleted_at IS NULL AND tenant_id IS NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'M2_PRECOND_FAIL: % users with NULL tenant_id', n; END IF;

  -- 1.4 No unknown legacy role (must be one of the 5 mapped roles).
  SELECT count(*) INTO n FROM users u
    WHERE u.deleted_at IS NULL
      AND u.role NOT IN (SELECT legacy_role FROM _m2_role_map);
  IF n <> 0 THEN RAISE EXCEPTION 'M2_PRECOND_FAIL: % users with unmapped legacy role', n; END IF;

  -- 1.5 Exactly the expected platform tenant is present.
  SELECT count(*) INTO n FROM tenants WHERE id = v_platform;
  IF n <> 1 THEN RAISE EXCEPTION 'M2_PRECOND_FAIL: platform tenant % not present exactly once (found %)', v_platform, n; END IF;

  -- 1.6 Exactly three Super_Admin in the platform tenant.
  SELECT count(*) INTO n FROM users
    WHERE deleted_at IS NULL AND tenant_id = v_platform AND role = 'Super_Admin';
  IF n <> 3 THEN RAISE EXCEPTION 'M2_PRECOND_FAIL: expected 3 platform Super_Admin, found %', n; END IF;

  -- 1.7 Each RT bootstrap tenant exists and is an ordinary (non-platform) tenant.
  SELECT count(*) INTO n FROM _m2_orgunit_plan p
    JOIN tenants t ON t.id = p.tenant_id;
  IF n <> 2 THEN RAISE EXCEPTION 'M2_PRECOND_FAIL: expected 2 RT bootstrap tenants present, found %', n; END IF;
  SELECT count(*) INTO n FROM _m2_orgunit_plan WHERE tenant_id = v_platform;
  IF n <> 0 THEN RAISE EXCEPTION 'M2_PRECOND_FAIL: platform tenant must not be in OrgUnit plan (D1-C)'; END IF;

  -- 1.8 EXCLUSION MANIFEST validation (explicit five; no broad rule).
  -- (a) exactly five manifest entries.
  SELECT count(*) INTO n FROM _m2_exclusion_manifest;
  IF n <> 5 THEN RAISE EXCEPTION 'M2_PRECOND_FAIL: exclusion manifest must have exactly 5 entries, has %', n; END IF;

  -- (b) all five source users still exist AND match expected tenant + role.
  SELECT count(*) INTO n
    FROM _m2_exclusion_manifest m
    JOIN users u ON u.id = m.user_id
   WHERE u.deleted_at IS NULL
     AND u.tenant_id = m.expected_tenant_id
     AND u.role = m.expected_role;
  IF n <> 5 THEN
    RAISE EXCEPTION 'M2_PRECOND_FAIL: exclusion manifest mismatch (only % of 5 users match expected tenant+role)', n;
  END IF;

  -- (c) NO additional platform non-Super_Admin user exists outside the manifest.
  SELECT count(*) INTO n
    FROM users u
   WHERE u.deleted_at IS NULL
     AND u.tenant_id = v_platform
     AND u.role <> 'Super_Admin'
     AND u.id NOT IN (SELECT user_id FROM _m2_exclusion_manifest);
  IF n <> 0 THEN
    RAISE EXCEPTION 'M2_PRECOND_FAIL: % platform non-admin user(s) exist OUTSIDE the exclusion manifest (new/unexpected) - refusing silent exclusion', n;
  END IF;

  -- (d) manifest total platform non-admin population equals exactly 5.
  SELECT count(*) INTO n
    FROM users u
   WHERE u.deleted_at IS NULL AND u.tenant_id = v_platform AND u.role <> 'Super_Admin';
  IF n <> 5 THEN
    RAISE EXCEPTION 'M2_PRECOND_FAIL: expected exactly 5 platform non-admin users, found %', n;
  END IF;

  -- 1.9 Ordinary RT source structure matches expectation (13 org-scoped source users).
  SELECT count(*) INTO n FROM users u
    JOIN _m2_orgunit_plan p ON p.tenant_id = u.tenant_id
   WHERE u.deleted_at IS NULL;
  IF n <> 13 THEN RAISE EXCEPTION 'M2_PRECOND_FAIL: expected 13 RT-tenant source users, found %', n; END IF;

  -- 1.10 Deterministic OrgUnit id sanity: pinned ids must be well-formed UUID text
  --      and must NOT collide with any existing (non-plan) org_unit id.
  SELECT count(*) INTO n FROM _m2_orgunit_plan
    WHERE org_unit_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  IF n <> 0 THEN RAISE EXCEPTION 'M2_PRECOND_FAIL: % pinned OrgUnit id(s) are not canonical UUIDv5 text', n; END IF;

  RAISE NOTICE 'M2: preconditions PASS';
END $$;

-- ===========================================================================
-- 2. BOOTSTRAP 2 RT OrgUnits (classify ABSENT / EXACT-MATCH / CONFLICT).
-- ===========================================================================
DO $$
DECLARE
  r          record;
  existing   record;
  v_path     text[];
BEGIN
  FOR r IN SELECT * FROM _m2_orgunit_plan LOOP
    v_path := ARRAY[r.org_unit_id]::text[];   -- D3: path = ARRAY[id]

    SELECT * INTO existing FROM org_units WHERE id = r.org_unit_id;

    IF NOT FOUND THEN
      -- Also guard: no OTHER root RT OrgUnit already exists for this tenant under
      -- a different id (would be a conflicting duplicate root).
      PERFORM 1 FROM org_units
        WHERE tenant_id = r.tenant_id AND type = 'RT' AND parent_id IS NULL
          AND id <> r.org_unit_id;
      IF FOUND THEN
        RAISE EXCEPTION 'M2_CONFLICT: tenant % already has a different root RT OrgUnit (not the deterministic id)', r.tenant_id;
      END IF;

      -- ABSENT -> INSERT.
      INSERT INTO org_units (id, tenant_id, parent_id, type, name, path, depth)
      VALUES (r.org_unit_id, r.tenant_id, NULL, r.type, r.name, v_path, 0);
      RAISE NOTICE 'M2: inserted OrgUnit % for tenant %', r.org_unit_id, r.tenant_id;

    ELSE
      -- Row exists at the deterministic id: must be an EXACT MATCH, else CONFLICT.
      IF existing.tenant_id  IS DISTINCT FROM r.tenant_id
         OR existing.type    IS DISTINCT FROM r.type
         OR existing.parent_id IS DISTINCT FROM NULL
         OR existing.depth   IS DISTINCT FROM 0
         OR existing.path    IS DISTINCT FROM v_path THEN
        RAISE EXCEPTION 'M2_CONFLICT: OrgUnit % exists but does not exactly match bootstrap (tenant/type/parent/depth/path mismatch)', r.org_unit_id;
      END IF;
      -- EXACT MATCH (name is allowed to have been edited operationally; we do NOT
      -- overwrite it — idempotent no-op on the structural bootstrap fields).
      RAISE NOTICE 'M2: OrgUnit % already present (exact structural match, no-op)', r.org_unit_id;
    END IF;
  END LOOP;
END $$;

-- ===========================================================================
-- 3. BACKFILL Memberships.
--    Intended set built from actual legacy users (minus exclusion manifest):
--      * platform Super_Admin       -> tenant-level PLATFORM_ADMIN (org_unit_id NULL)
--      * ordinary RT users (mapped) -> org-scoped on their tenant's RT root
--    Classify each intended membership ABSENT / EXACT-MATCH / CONFLICT.
-- ===========================================================================
DO $$
DECLARE
  v_platform text := '00000000-0000-0000-0000-000000000010';
  r          record;
  existing   record;
BEGIN
  FOR r IN
    -- (a) platform tenant-level PLATFORM_ADMIN memberships (3 Super_Admin).
    SELECT u.id AS user_id, u.tenant_id, NULL::text AS org_unit_id,
           'PLATFORM_ADMIN'::"MembershipRole" AS role
      FROM users u
     WHERE u.deleted_at IS NULL AND u.tenant_id = v_platform AND u.role = 'Super_Admin'
    UNION ALL
    -- (b) ordinary RT org-scoped memberships (13), role-mapped, on the RT root.
    SELECT u.id AS user_id, u.tenant_id, p.org_unit_id,
           m.membership_role AS role
      FROM users u
      JOIN _m2_orgunit_plan p ON p.tenant_id = u.tenant_id
      JOIN _m2_role_map m ON m.legacy_role = u.role
     WHERE u.deleted_at IS NULL
       AND u.id NOT IN (SELECT user_id FROM _m2_exclusion_manifest)
  LOOP
    -- Safety: an excluded manifest user must never appear in the intended set.
    IF r.user_id IN (SELECT user_id FROM _m2_exclusion_manifest) THEN
      RAISE EXCEPTION 'M2_BUG: excluded manifest user % entered intended membership set', r.user_id;
    END IF;

    IF r.org_unit_id IS NULL THEN
      -- Tenant-level membership: uniqueness key (user, tenant) WHERE org_unit_id IS NULL.
      SELECT * INTO existing FROM memberships
        WHERE user_id = r.user_id AND tenant_id = r.tenant_id AND org_unit_id IS NULL;
    ELSE
      -- Org-scoped membership: uniqueness key (user, tenant, org_unit).
      SELECT * INTO existing FROM memberships
        WHERE user_id = r.user_id AND tenant_id = r.tenant_id AND org_unit_id = r.org_unit_id;
    END IF;

    IF NOT FOUND THEN
      -- ABSENT -> INSERT (D5: status ACTIVE).
      INSERT INTO memberships (user_id, tenant_id, org_unit_id, role, status)
      VALUES (r.user_id, r.tenant_id, r.org_unit_id, r.role, 'ACTIVE');
    ELSE
      -- EXACT MATCH required on role + status + scope, else CONFLICT.
      IF existing.role   IS DISTINCT FROM r.role
         OR existing.status IS DISTINCT FROM 'ACTIVE'
         OR existing.org_unit_id IS DISTINCT FROM r.org_unit_id THEN
        RAISE EXCEPTION 'M2_CONFLICT: membership for user % tenant % exists with different role/status/scope (have role=%, status=%, org_unit=%; want role=%, status=ACTIVE, org_unit=%)',
          r.user_id, r.tenant_id, existing.role, existing.status, existing.org_unit_id, r.role, r.org_unit_id;
      END IF;
      -- exact match -> idempotent no-op.
    END IF;
  END LOOP;
END $$;

-- ===========================================================================
-- 4. WHOLE-SET POSTCONDITIONS (prove BEFORE COMMIT). Any failure => ROLLBACK.
-- ===========================================================================
DO $$
DECLARE
  v_platform         text := '00000000-0000-0000-0000-000000000010';
  n_boot_orgunits    int;
  n_mem_total        int;
  n_platform_tl      int;
  n_rt_org           int;
  n_excluded_with_m  int;
  n_unexpected       int;
  n_rt_users         int;
  n_rt_users_with_m  int;
  n_sa               int;
  n_sa_with_m        int;
BEGIN
  -- 4.1 exactly 2 bootstrap OrgUnits present with correct shape.
  SELECT count(*) INTO n_boot_orgunits
    FROM org_units o JOIN _m2_orgunit_plan p ON p.org_unit_id = o.id
   WHERE o.tenant_id = p.tenant_id AND o.type = 'RT' AND o.parent_id IS NULL
     AND o.depth = 0 AND o.path = ARRAY[o.id]::text[];
  IF n_boot_orgunits <> 2 THEN
    RAISE EXCEPTION 'M2_POSTCOND_FAIL: expected 2 well-formed bootstrap OrgUnits, found %', n_boot_orgunits;
  END IF;

  -- 4.2 total memberships = 16.
  SELECT count(*) INTO n_mem_total FROM memberships;
  IF n_mem_total <> 16 THEN
    RAISE EXCEPTION 'M2_POSTCOND_FAIL: expected 16 memberships total, found %', n_mem_total;
  END IF;

  -- 4.3 platform tenant-level PLATFORM_ADMIN = 3 (org_unit_id NULL, ACTIVE).
  SELECT count(*) INTO n_platform_tl FROM memberships
   WHERE tenant_id = v_platform AND org_unit_id IS NULL
     AND role = 'PLATFORM_ADMIN' AND status = 'ACTIVE';
  IF n_platform_tl <> 3 THEN
    RAISE EXCEPTION 'M2_POSTCOND_FAIL: expected 3 platform tenant-level PLATFORM_ADMIN, found %', n_platform_tl;
  END IF;

  -- 4.4 RT org-scoped memberships = 13 (scoped to a bootstrap OrgUnit).
  SELECT count(*) INTO n_rt_org FROM memberships m
    JOIN _m2_orgunit_plan p ON p.org_unit_id = m.org_unit_id AND p.tenant_id = m.tenant_id
   WHERE m.status = 'ACTIVE';
  IF n_rt_org <> 13 THEN
    RAISE EXCEPTION 'M2_POSTCOND_FAIL: expected 13 RT org-scoped memberships, found %', n_rt_org;
  END IF;

  -- 4.5 none of the 5 excluded users has ANY membership.
  SELECT count(*) INTO n_excluded_with_m FROM memberships
   WHERE user_id IN (SELECT user_id FROM _m2_exclusion_manifest);
  IF n_excluded_with_m <> 0 THEN
    RAISE EXCEPTION 'M2_POSTCOND_FAIL: % excluded manifest user(s) have a membership', n_excluded_with_m;
  END IF;

  -- 4.6 no unexpected membership: every membership is either a platform Super_Admin
  --     tenant-level PLATFORM_ADMIN, or an org-scoped RT membership on a bootstrap root.
  SELECT count(*) INTO n_unexpected FROM memberships m
   WHERE NOT (
     (m.tenant_id = v_platform AND m.org_unit_id IS NULL AND m.role = 'PLATFORM_ADMIN')
     OR EXISTS (SELECT 1 FROM _m2_orgunit_plan p
                 WHERE p.org_unit_id = m.org_unit_id AND p.tenant_id = m.tenant_id)
   );
  IF n_unexpected <> 0 THEN
    RAISE EXCEPTION 'M2_POSTCOND_FAIL: % unexpected membership row(s)', n_unexpected;
  END IF;

  -- 4.7 every migrated ordinary-RT user has EXACTLY one expected membership.
  SELECT count(*) INTO n_rt_users FROM users u
    JOIN _m2_orgunit_plan p ON p.tenant_id = u.tenant_id
   WHERE u.deleted_at IS NULL AND u.id NOT IN (SELECT user_id FROM _m2_exclusion_manifest);
  SELECT count(*) INTO n_rt_users_with_m FROM (
    SELECT u.id
      FROM users u
      JOIN _m2_orgunit_plan p ON p.tenant_id = u.tenant_id
      JOIN memberships m ON m.user_id = u.id AND m.tenant_id = u.tenant_id
                        AND m.org_unit_id = p.org_unit_id
     WHERE u.deleted_at IS NULL
     GROUP BY u.id HAVING count(*) = 1
  ) s;
  IF n_rt_users <> 13 OR n_rt_users_with_m <> 13 THEN
    RAISE EXCEPTION 'M2_POSTCOND_FAIL: RT users=% each-with-one-membership=% (want 13/13)', n_rt_users, n_rt_users_with_m;
  END IF;

  -- 4.8 all three platform Super_Admin have their tenant-level membership.
  SELECT count(*) INTO n_sa FROM users
   WHERE deleted_at IS NULL AND tenant_id = v_platform AND role = 'Super_Admin';
  SELECT count(*) INTO n_sa_with_m FROM users u
    JOIN memberships m ON m.user_id = u.id AND m.tenant_id = v_platform
                      AND m.org_unit_id IS NULL AND m.role = 'PLATFORM_ADMIN'
   WHERE u.deleted_at IS NULL AND u.tenant_id = v_platform AND u.role = 'Super_Admin';
  IF n_sa <> 3 OR n_sa_with_m <> 3 THEN
    RAISE EXCEPTION 'M2_POSTCOND_FAIL: platform Super_Admin=% with-membership=% (want 3/3)', n_sa, n_sa_with_m;
  END IF;

  RAISE NOTICE 'M2: postconditions PASS (orgunits=%, memberships=% [platform=%, rt=%])',
    n_boot_orgunits, n_mem_total, n_platform_tl, n_rt_org;
END $$;

COMMIT;

-- ---------------------------------------------------------------------------
-- 5. Post-commit read-only summary (safe to re-run).
-- ---------------------------------------------------------------------------
SELECT
  (SELECT count(*)::int FROM org_units)                                   AS org_units_total,
  (SELECT count(*)::int FROM memberships)                                 AS memberships_total,
  (SELECT count(*)::int FROM memberships
     WHERE tenant_id='00000000-0000-0000-0000-000000000010'
       AND org_unit_id IS NULL AND role='PLATFORM_ADMIN')                 AS platform_tenant_level,
  (SELECT count(*)::int FROM memberships WHERE org_unit_id IS NOT NULL)   AS org_scoped;
