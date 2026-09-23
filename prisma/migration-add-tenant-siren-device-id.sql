-- ============================================================================
-- Migration: Add siren_device_id column to tenants
-- Purpose: Each RT (tenant) can have its own physical siren device. The panic
--          button triggers the siren belonging to the triggering user's tenant.
-- Run this in the Neon SQL Editor (or your Postgres client).
-- ============================================================================

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS siren_device_id TEXT DEFAULT NULL;

-- NULL means this RT has no dedicated siren configured yet; the alarm adapter
-- falls back to the ALARM_DEVICE_ID environment variable when this is empty.

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'tenants' AND column_name = 'siren_device_id';
