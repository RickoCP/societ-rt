-- ============================================================================
-- Update Dummy Households with Coordinates
-- Run this in Neon SQL Editor after seed-dummy-residents.sql
-- Coordinates are around Karawang area (example)
-- ============================================================================

UPDATE households SET latitude = -6.3230, longitude = 107.2970 WHERE id = 'a0000000-0000-0000-0000-000000000001';
UPDATE households SET latitude = -6.3235, longitude = 107.2975 WHERE id = 'a0000000-0000-0000-0000-000000000002';
UPDATE households SET latitude = -6.3240, longitude = 107.2965 WHERE id = 'a0000000-0000-0000-0000-000000000003';
UPDATE households SET latitude = -6.3225, longitude = 107.2980 WHERE id = 'a0000000-0000-0000-0000-000000000004';
UPDATE households SET latitude = -6.3245, longitude = 107.2960 WHERE id = 'a0000000-0000-0000-0000-000000000005';

-- Verify
SELECT id, household_number, address, latitude, longitude FROM households WHERE tenant_id = '00000000-0000-0000-0000-000000000010';
