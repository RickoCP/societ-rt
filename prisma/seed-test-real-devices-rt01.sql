-- ============================================================================
-- Registrasi PERANGKAT NYATA untuk testing — RT 01
-- Tenant: 00000000-0000-0000-0000-000000000011
--
-- Door sensor : a3cb31139c7e5b2cc6lq6u  -> Rumah A3 (household a103), zona pos-utara
-- Sirine      : a38950d3d819b7d448gimn  -> AlarmDevice zona pos-utara
--
-- Membuat tabel alarm (jika belum ada) lalu mendaftarkan kedua perangkat.
-- Idempotent. Jalankan: node scripts/run-migration.mjs prisma/seed-test-real-devices-rt01.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Enum + tabel alarm (jika belum ada di database)
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "AlarmDeviceStatus" AS ENUM ('armed','disarmed','triggered','offline');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AlarmTriggerSource" AS ENUM ('manual','automation','schedule');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "alarm_devices" (
  "id"              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenant_id"       TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "location"        TEXT NOT NULL,
  "device_id"       TEXT NOT NULL,
  "zones"           TEXT[] NOT NULL DEFAULT '{}',
  "schedule_arm"    TEXT,
  "schedule_disarm" TEXT,
  "status"          "AlarmDeviceStatus" NOT NULL DEFAULT 'disarmed',
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT "alarm_devices_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
);
CREATE INDEX IF NOT EXISTS "alarm_devices_tenant_id_status_idx"
  ON "alarm_devices" ("tenant_id", "status");

CREATE TABLE IF NOT EXISTS "alarm_events" (
  "id"              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "alarm_device_id" TEXT NOT NULL,
  "tenant_id"       TEXT NOT NULL,
  "trigger_source"  "AlarmTriggerSource" NOT NULL,
  "trigger_type"    TEXT NOT NULL,
  "duration"        INTEGER NOT NULL,
  "activated_at"    TIMESTAMP(3) NOT NULL DEFAULT now(),
  "deactivated_at"  TIMESTAMP(3),
  CONSTRAINT "alarm_events_alarm_device_id_fkey"
    FOREIGN KEY ("alarm_device_id") REFERENCES "alarm_devices"("id")
);
CREATE INDEX IF NOT EXISTS "alarm_events_alarm_device_id_activated_at_idx"
  ON "alarm_events" ("alarm_device_id", "activated_at");
CREATE INDEX IF NOT EXISTS "alarm_events_tenant_id_activated_at_idx"
  ON "alarm_events" ("tenant_id", "activated_at");

-- ----------------------------------------------------------------------------
-- 1. Door sensor NYATA -> iot_devices (Rumah A3)
-- ----------------------------------------------------------------------------
INSERT INTO iot_devices (id, tenant_id, household_id, tuya_device_id, device_type, name, online_status, battery_level, last_seen, metadata, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-0000000d9001', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-00000000a103', 'a3cb31139c7e5b2cc6lq6u', 'door_sensor', 'Sensor Pintu (Test) - Rumah A3', 'online', 100, NOW(), '{"test":true}', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. Door sensor config (Rumah A3, zona pos-utara, monitoring aktif 24 jam
--    supaya mudah ditest kapan saja)
-- ----------------------------------------------------------------------------
INSERT INTO door_sensor_configs (id, tenant_id, household_id, iot_device_id, siren_zone, monitor_start, monitor_end, enabled, current_state, last_state_change, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-0000000e9001', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-00000000a103', '00000000-0000-0000-0000-0000000d9001', 'pos-utara', '00:00', '23:59', TRUE, 'closed', NOW(), NOW(), NOW())
ON CONFLICT (household_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. Sirine NYATA -> alarm_devices (zona pos-utara)
-- ----------------------------------------------------------------------------
INSERT INTO alarm_devices (id, tenant_id, name, location, device_id, zones, status, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-0000000a9001', '00000000-0000-0000-0000-000000000011', 'Sirine Pos Utara (Test)', 'Pos Keamanan Utara', 'a38950d3d819b7d448gimn', ARRAY['pos-utara'], 'armed', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. Verifikasi
-- ----------------------------------------------------------------------------
SELECT 'Door sensor (A3):' AS label, tuya_device_id AS nilai
  FROM iot_devices WHERE id = '00000000-0000-0000-0000-0000000d9001'
UNION ALL
SELECT 'Door config zona:', siren_zone
  FROM door_sensor_configs WHERE id = '00000000-0000-0000-0000-0000000e9001'
UNION ALL
SELECT 'Sirine device:', device_id
  FROM alarm_devices WHERE id = '00000000-0000-0000-0000-0000000a9001';
