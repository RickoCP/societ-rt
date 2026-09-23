-- ============================================================================
-- Migration: Emergency Contacts (per-RT callable emergency numbers)
--
-- Idempotent (IF NOT EXISTS / guarded). Run via scripts/run-migration.mjs
-- or the Neon SQL Editor. id is TEXT to match the existing tenants.id FK type.
-- ============================================================================

-- 1. Enum ------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "EmergencyContactCategory" AS ENUM (
    'police','ambulance','fire','hospital','security','rt_officer','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Table -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "emergency_contacts" (
  "id"          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenant_id"   TEXT NOT NULL,
  "label"       TEXT NOT NULL,
  "phone"       TEXT NOT NULL,
  "category"    "EmergencyContactCategory" NOT NULL DEFAULT 'other',
  "description" TEXT,
  "sort_order"  INTEGER NOT NULL DEFAULT 0,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT "emergency_contacts_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
);

CREATE INDEX IF NOT EXISTS "emergency_contacts_tenant_id_sort_order_idx"
  ON "emergency_contacts" ("tenant_id", "sort_order");

-- 3. Verify ----------------------------------------------------------------
SELECT table_name FROM information_schema.tables
WHERE table_name = 'emergency_contacts';
