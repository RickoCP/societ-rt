-- ============================================================================
-- Migration: Door Monitoring (per-household Tuya door sensors)
--
-- This database is behind the Prisma schema and is missing the IoT module,
-- so this script is SELF-CONTAINED: it creates the IoT enums + iot_devices +
-- device_events tables (matching prisma/schema.prisma), then the door tables.
--
-- All statements are idempotent (IF NOT EXISTS / guarded) so it is safe to
-- re-run. Run in the Neon SQL Editor or via scripts/run-door-migration.mjs.
-- ============================================================================

-- 1. IoT enums -------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "IoTDeviceType" AS ENUM (
    'panic_button','smart_siren','smart_lock','cctv','motion_sensor',
    'smoke_detector','door_sensor','gate_sensor','smart_switch','smart_lighting'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "IoTDeviceOnlineStatus" AS ENUM ('online','offline');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "DeviceEventType" AS ENUM (
    'panic_button_pressed','gate_open','gate_closed','motion_detected',
    'smoke_detected','alarm_triggered','smart_lock_opened','cctv_motion_detected',
    'device_online','device_offline','battery_low','emergency_alert',
    'smart_switch_toggled','lighting_changed','gate_open_too_long',
    'motion_detection_alert','door_opened','door_closed','door_opened_during_window'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Door enums (may already exist from a prior partial run).
DO $$ BEGIN
  CREATE TYPE "DoorState" AS ENUM ('open','closed','unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "DoorInstallationStatus" AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. iot_devices -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS "iot_devices" (
  "id"            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenant_id"     TEXT NOT NULL,
  "household_id"  TEXT NOT NULL,
  "tuya_device_id" TEXT NOT NULL,
  "device_type"   "IoTDeviceType" NOT NULL,
  "name"          TEXT NOT NULL,
  "online_status" "IoTDeviceOnlineStatus" NOT NULL DEFAULT 'offline',
  "battery_level" INTEGER,
  "last_seen"     TIMESTAMP(3) NOT NULL DEFAULT now(),
  "metadata"      JSONB NOT NULL DEFAULT '{}',
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT "iot_devices_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id"),
  CONSTRAINT "iot_devices_household_id_fkey"
    FOREIGN KEY ("household_id") REFERENCES "households"("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "iot_devices_tuya_device_id_unique"
  ON "iot_devices" ("tuya_device_id");
CREATE INDEX IF NOT EXISTS "iot_devices_tenant_id_household_id_idx"
  ON "iot_devices" ("tenant_id", "household_id");

-- 3. device_events ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS "device_events" (
  "id"                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "device_id"          TEXT NOT NULL,
  "tenant_id"          TEXT NOT NULL,
  "event_type"         "DeviceEventType" NOT NULL,
  "payload"            JSONB NOT NULL DEFAULT '{}',
  "is_shared_security" BOOLEAN NOT NULL DEFAULT FALSE,
  "processed_at"       TIMESTAMP(3),
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT "device_events_device_id_fkey"
    FOREIGN KEY ("device_id") REFERENCES "iot_devices"("id")
);

CREATE INDEX IF NOT EXISTS "device_events_device_id_created_at_idx"
  ON "device_events" ("device_id", "created_at");
CREATE INDEX IF NOT EXISTS "device_events_tenant_id_event_type_created_at_idx"
  ON "device_events" ("tenant_id", "event_type", "created_at");
CREATE INDEX IF NOT EXISTS "device_events_tenant_id_is_shared_security_created_at_idx"
  ON "device_events" ("tenant_id", "is_shared_security", "created_at");

-- 4. door_sensor_configs ---------------------------------------------------
CREATE TABLE IF NOT EXISTS "door_sensor_configs" (
  "id"                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenant_id"         TEXT NOT NULL,
  "household_id"      TEXT NOT NULL,
  "iot_device_id"     TEXT,
  "siren_zone"        TEXT,
  "monitor_start"     TEXT NOT NULL DEFAULT '22:00',
  "monitor_end"       TEXT NOT NULL DEFAULT '05:00',
  "enabled"           BOOLEAN NOT NULL DEFAULT FALSE,
  "current_state"     "DoorState" NOT NULL DEFAULT 'unknown',
  "last_state_change" TIMESTAMP(3),
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT "door_sensor_configs_household_id_key" UNIQUE ("household_id"),
  CONSTRAINT "door_sensor_configs_iot_device_id_key" UNIQUE ("iot_device_id"),
  CONSTRAINT "door_sensor_configs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id"),
  CONSTRAINT "door_sensor_configs_household_id_fkey"
    FOREIGN KEY ("household_id") REFERENCES "households"("id"),
  CONSTRAINT "door_sensor_configs_iot_device_id_fkey"
    FOREIGN KEY ("iot_device_id") REFERENCES "iot_devices"("id")
);

CREATE INDEX IF NOT EXISTS "door_sensor_configs_tenant_id_enabled_idx"
  ON "door_sensor_configs" ("tenant_id", "enabled");
CREATE INDEX IF NOT EXISTS "door_sensor_configs_tenant_id_current_state_idx"
  ON "door_sensor_configs" ("tenant_id", "current_state");

-- 5. door_installation_requests --------------------------------------------
CREATE TABLE IF NOT EXISTS "door_installation_requests" (
  "id"           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenant_id"    TEXT NOT NULL,
  "household_id" TEXT NOT NULL,
  "requested_by" TEXT NOT NULL,
  "status"       "DoorInstallationStatus" NOT NULL DEFAULT 'pending',
  "note"         TEXT,
  "resolved_by"  TEXT,
  "resolved_at"  TIMESTAMP(3),
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT "door_installation_requests_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id"),
  CONSTRAINT "door_installation_requests_household_id_fkey"
    FOREIGN KEY ("household_id") REFERENCES "households"("id")
);

CREATE INDEX IF NOT EXISTS "door_installation_requests_tenant_id_status_created_at_idx"
  ON "door_installation_requests" ("tenant_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "door_installation_requests_household_id_idx"
  ON "door_installation_requests" ("household_id");
