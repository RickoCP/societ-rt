-- ============================================================================
-- Dummy Data: Package Logs for Platform Admin tenant
-- Tenant ID: 00000000-0000-0000-0000-000000000010
-- User ID (Super Admin): 00000000-0000-0000-0000-000000000020
-- Household IDs: a0000000-0000-0000-0000-000000000001 to 005
-- Run this in Neon SQL Editor
-- ============================================================================

INSERT INTO package_logs (id, tenant_id, recipient_household_id, courier_name, description, arrival_timestamp, logged_by, created_at)
VALUES
  ('j0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'JNE', 'Paket besar - elektronik', NOW() - INTERVAL '2 hours', '00000000-0000-0000-0000-000000000020', NOW()),
  ('j0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000002', 'J&T Express', 'Amplop dokumen', NOW() - INTERVAL '4 hours', '00000000-0000-0000-0000-000000000020', NOW()),
  ('j0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000003', 'SiCepat', 'Paket kecil - buku', NOW() - INTERVAL '1 day', '00000000-0000-0000-0000-000000000020', NOW()),
  ('j0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000004', 'Grab Express', 'Makanan - box besar', NOW() - INTERVAL '30 minutes', '00000000-0000-0000-0000-000000000020', NOW()),
  ('j0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000005', 'Pos Indonesia', 'Surat tercatat', NOW() - INTERVAL '3 days', '00000000-0000-0000-0000-000000000020', NOW())
ON CONFLICT (id) DO NOTHING;

-- Verify
SELECT 'Packages:' AS label, COUNT(*)::text AS count FROM package_logs WHERE tenant_id = '00000000-0000-0000-0000-000000000010';
