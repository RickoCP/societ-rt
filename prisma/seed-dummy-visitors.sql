-- ============================================================================
-- Dummy Data: Visitor Logs for Platform Admin tenant
-- Tenant ID: 00000000-0000-0000-0000-000000000010
-- User ID (Super Admin): 00000000-0000-0000-0000-000000000020
-- Household IDs: a0000000-0000-0000-0000-000000000001 to 005
-- Run this in Neon SQL Editor
-- ============================================================================

INSERT INTO visitor_logs (id, tenant_id, visitor_name, purpose, destination_household_id, entry_timestamp, exit_timestamp, logged_by, created_at, updated_at)
VALUES
  ('i0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Pak Kurir JNE', 'Antar paket', 'a0000000-0000-0000-0000-000000000001', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour', '00000000-0000-0000-0000-000000000020', NOW(), NOW()),
  ('i0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000010', 'Ibu Sari', 'Berkunjung ke keluarga', 'a0000000-0000-0000-0000-000000000002', NOW() - INTERVAL '3 hours', NULL, '00000000-0000-0000-0000-000000000020', NOW(), NOW()),
  ('i0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000010', 'Teknisi PLN', 'Perbaikan listrik', 'a0000000-0000-0000-0000-000000000003', NOW() - INTERVAL '5 hours', NOW() - INTERVAL '3 hours', '00000000-0000-0000-0000-000000000020', NOW(), NOW()),
  ('i0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000010', 'Tukang Ledeng', 'Perbaikan pipa air', 'a0000000-0000-0000-0000-000000000004', NOW() - INTERVAL '1 hour', NULL, '00000000-0000-0000-0000-000000000020', NOW(), NOW()),
  ('i0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000010', 'Pak RT Sebelah', 'Koordinasi kegiatan', 'a0000000-0000-0000-0000-000000000005', NOW() - INTERVAL '6 hours', NOW() - INTERVAL '5 hours', '00000000-0000-0000-0000-000000000020', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Verify
SELECT 'Visitors:' AS label, COUNT(*)::text AS count FROM visitor_logs WHERE tenant_id = '00000000-0000-0000-0000-000000000010';
