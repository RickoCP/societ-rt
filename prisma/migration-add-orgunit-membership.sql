-- ============================================================================
-- M1 — OrgUnit + Membership foundation (FASE 1.2b)
--
-- ADDITIVE ONLY. Idempotent. DDL ONLY (no data backfill = no M2/M3 here).
-- Run via scripts/run-migration.mjs <file> OR Neon SQL editor.
--
-- Conventions (match existing migrations):
--   - id is TEXT (uuid-as-text), default gen_random_uuid()::text
--   - snake_case columns, plural table names
--   - enum create guarded by EXCEPTION WHEN duplicate_object
--   - CREATE TABLE/INDEX IF NOT EXISTS
--
-- Locked decisions applied:
--   B1: PLATFORM_ADMIN membership uses org_unit_id = NULL (tenant-level).
--   B2: (role mapping applies at M3 backfill, not here.)
--   B3: two partial uniques (org-scoped vs tenant-level).
--   Same-tenant integrity: declarative composite FK (id, tenant_id).
--   path TEXT[] (logical UUID ids in existing TEXT storage convention).
--
-- Invariants enforced by THIS migration (DB-level):
--   I1  org_units.tenant_id REFERENCES tenants(id)               [FK]
--   I2  org_units.parent_id REFERENCES org_units(id)             [self FK]
--   I3  parent.tenant_id = child.tenant_id                        [composite FK]
--   I4  depth >= 0                                                [CHECK]
--   I5  root has parent_id NULL (allowed); non-root may set parent [FK/NULL]
--   I6  memberships.user_id REFERENCES users(id)                 [FK]
--   I7  memberships.tenant_id REFERENCES tenants(id)             [FK]
--   I8  membership org_unit belongs to same tenant                [composite FK, checked only when org_unit_id NOT NULL]
--   I9  one org-scoped membership per (user, tenant, org_unit)    [partial unique]
--   I10 one tenant-level membership per (user, tenant)            [partial unique]
--
-- Invariants DEFERRED (NOT enforced here; see report):
--   - path/depth correctness & no-cycle & subtree-move  -> hierarchy service (post-M1)
--   - membership.org_unit_id NOT NULL                    -> after M3 backfill
--   - authorization semantics                            -> auth cutover phase
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enums (idempotent)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "OrgUnitType" AS ENUM ('ORGANIZATION','CLUSTER','RW','RT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "MembershipRole" AS ENUM
    ('PLATFORM_ADMIN','TENANT_OWNER','ORG_ADMIN','RT_ADMIN','SECURITY','RESIDENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "MembershipStatus" AS ENUM ('INVITED','ACTIVE','SUSPENDED','REVOKED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 2. org_units table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "org_units" (
  "id"         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenant_id"  TEXT NOT NULL,
  "parent_id"  TEXT,
  "type"       "OrgUnitType" NOT NULL,
  "name"       TEXT NOT NULL,
  "path"       TEXT[] NOT NULL DEFAULT '{}',
  "depth"      INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT "org_units_depth_nonneg_check" CHECK ("depth" >= 0)
);

-- I1: org_unit belongs to a valid tenant.
DO $$ BEGIN
  ALTER TABLE "org_units"
    ADD CONSTRAINT "org_units_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Candidate key required so composite FK (id, tenant_id) can reference it.
-- Implemented as a UNIQUE INDEX (not ADD CONSTRAINT ... UNIQUE) so it is natively
-- idempotent via IF NOT EXISTS. A unique index on (id, tenant_id) is a valid
-- referenced target for the composite foreign keys below, exactly like a unique
-- constraint. Using ADD CONSTRAINT ... UNIQUE was NOT idempotent: on re-run it
-- raised SQLSTATE 42P07 (duplicate_table, from its backing index), which the
-- EXCEPTION WHEN duplicate_object (42710) guard does not catch. See
-- PHASE_1_2B_M1_VALIDATION_REPORT.md Section 8a (Validation Attempt #1 FAIL).
CREATE UNIQUE INDEX IF NOT EXISTS "org_units_id_tenant_id_key"
  ON "org_units" ("id", "tenant_id");

-- I2 + I3: parent must exist AND be in the same tenant (declarative composite FK).
-- When parent_id IS NULL, PostgreSQL does NOT check this FK (MATCH SIMPLE default),
-- so root nodes (parent_id NULL) are allowed.
DO $$ BEGIN
  ALTER TABLE "org_units"
    ADD CONSTRAINT "org_units_parent_same_tenant_fkey"
    FOREIGN KEY ("parent_id", "tenant_id")
    REFERENCES "org_units"("id", "tenant_id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "org_units_tenant_id_idx"
  ON "org_units" ("tenant_id");
CREATE INDEX IF NOT EXISTS "org_units_parent_id_idx"
  ON "org_units" ("parent_id");
CREATE INDEX IF NOT EXISTS "org_units_path_gin_idx"
  ON "org_units" USING gin ("path");

-- ---------------------------------------------------------------------------
-- 3. memberships table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "memberships" (
  "id"          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "user_id"     TEXT NOT NULL,
  "tenant_id"   TEXT NOT NULL,
  "org_unit_id" TEXT,
  "role"        "MembershipRole" NOT NULL,
  "status"      "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT now(),
  "revoked_at"  TIMESTAMP(3)
);

-- I6: membership belongs to a valid user.
DO $$ BEGIN
  ALTER TABLE "memberships"
    ADD CONSTRAINT "memberships_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- I7: membership belongs to a valid tenant.
DO $$ BEGIN
  ALTER TABLE "memberships"
    ADD CONSTRAINT "memberships_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- I8: when org_unit_id is set, it must be an org_unit in the SAME tenant.
-- Composite FK (org_unit_id, tenant_id) -> org_units(id, tenant_id).
-- With org_unit_id NULL (MATCH SIMPLE default), the FK is not checked, so
-- tenant-level memberships remain valid.
DO $$ BEGIN
  ALTER TABLE "memberships"
    ADD CONSTRAINT "memberships_org_unit_same_tenant_fkey"
    FOREIGN KEY ("org_unit_id", "tenant_id")
    REFERENCES "org_units"("id", "tenant_id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "memberships_user_id_idx"
  ON "memberships" ("user_id");
CREATE INDEX IF NOT EXISTS "memberships_tenant_id_idx"
  ON "memberships" ("tenant_id");
CREATE INDEX IF NOT EXISTS "memberships_org_unit_id_idx"
  ON "memberships" ("org_unit_id");

-- I9: one org-scoped membership per (user, tenant, org_unit).
CREATE UNIQUE INDEX IF NOT EXISTS "memberships_user_tenant_orgunit_uq"
  ON "memberships" ("user_id", "tenant_id", "org_unit_id")
  WHERE "org_unit_id" IS NOT NULL;

-- I10: one tenant-level membership per (user, tenant).
CREATE UNIQUE INDEX IF NOT EXISTS "memberships_user_tenant_null_orgunit_uq"
  ON "memberships" ("user_id", "tenant_id")
  WHERE "org_unit_id" IS NULL;

-- ---------------------------------------------------------------------------
-- 4. Structural verification (read-only SELECTs; safe to re-run)
-- ---------------------------------------------------------------------------
SELECT
  to_regclass('public.org_units')  AS org_units_table,
  to_regclass('public.memberships') AS memberships_table;
