-- ============================================================================
-- Dummy Data: Letter Requests for Platform Admin tenant
-- Tenant ID: 00000000-0000-0000-0000-000000000010
-- User ID (Super Admin): 00000000-0000-0000-0000-000000000020
-- Run this in Neon SQL Editor
-- ============================================================================

INSERT INTO letter_requests (id, tenant_id, user_id, letter_type, purpose, status, rejection_reason, document_url, decided_by, decided_at, created_at, updated_at)
VALUES
  ('h0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000020', 'surat_pengantar', 'Untuk keperluan melamar pekerjaan di PT ABC', 'pending', NULL, NULL, NULL, NULL, NOW() - INTERVAL '2 days', NOW()),
  ('h0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000020', 'domisili', 'Untuk keperluan pembuatan SIM', 'approved', NULL, NULL, '00000000-0000-0000-0000-000000000020', NOW() - INTERVAL '1 day', NOW() - INTERVAL '3 days', NOW()),
  ('h0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000020', 'SKTM', 'Untuk keperluan beasiswa anak', 'rejected', 'Data penghasilan tidak sesuai kriteria SKTM', NULL, '00000000-0000-0000-0000-000000000020', NOW() - INTERVAL '1 day', NOW() - INTERVAL '4 days', NOW()),
  ('h0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000020', 'surat_pengantar', 'Untuk keperluan membuka rekening bank', 'pending', NULL, NULL, NULL, NULL, NOW() - INTERVAL '1 day', NOW()),
  ('h0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000020', 'domisili', 'Untuk keperluan pendaftaran sekolah anak', 'approved', NULL, NULL, '00000000-0000-0000-0000-000000000020', NOW(), NOW() - INTERVAL '5 days', NOW())
ON CONFLICT (id) DO NOTHING;

-- Verify
SELECT 'Letters:' AS label, COUNT(*)::text AS count FROM letter_requests WHERE tenant_id = '00000000-0000-0000-0000-000000000010';
