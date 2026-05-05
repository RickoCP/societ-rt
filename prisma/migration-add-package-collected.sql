-- ============================================================================
-- Migration: Add collected_at column to package_logs
-- Run this in Neon SQL Editor
-- ============================================================================

ALTER TABLE package_logs ADD COLUMN IF NOT EXISTS collected_at TIMESTAMP DEFAULT NULL;

-- NULL means not yet collected, a timestamp means collected
-- Verify
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'package_logs' AND column_name = 'collected_at';
