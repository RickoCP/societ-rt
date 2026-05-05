-- ============================================================================
-- Dummy Data: Voting for Platform Admin tenant
-- Tenant ID: 00000000-0000-0000-0000-000000000010
-- User ID (Super Admin): 00000000-0000-0000-0000-000000000020
-- Run this in Neon SQL Editor
-- ============================================================================

-- Vote 1: Active vote (deadline in the future)
INSERT INTO votes (id, tenant_id, title, description, mode, deadline, created_by, created_at, updated_at)
VALUES
  ('d0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Pemilihan Ketua RT Periode 2026-2028', 'Silakan pilih calon Ketua RT untuk periode berikutnya.', 'verified', '2026-12-31 23:59:59', '00000000-0000-0000-0000-000000000020', NOW(), NOW()),
  ('d0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000010', 'Penggunaan Dana Kas untuk Perbaikan Jalan', 'Apakah warga setuju dana kas digunakan untuk perbaikan jalan utama?', 'anonymous', '2026-06-30 23:59:59', '00000000-0000-0000-0000-000000000020', NOW(), NOW()),
  ('d0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000010', 'Jadwal Kerja Bakti Bulanan', 'Pilih hari yang paling cocok untuk kerja bakti bulanan.', 'anonymous', '2025-03-01 23:59:59', '00000000-0000-0000-0000-000000000020', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Vote Options
INSERT INTO vote_options (id, vote_id, label, vote_count)
VALUES
  -- Vote 1: Pemilihan Ketua RT
  ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'Budi Santoso', 0),
  ('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'Ahmad Hidayat', 0),
  ('e0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001', 'Hendra Wijaya', 0),

  -- Vote 2: Dana Kas
  ('e0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000002', 'Setuju', 0),
  ('e0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000002', 'Tidak Setuju', 0),
  ('e0000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000002', 'Abstain', 0),

  -- Vote 3: Kerja Bakti (closed - already has votes)
  ('e0000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000003', 'Sabtu Pagi', 3),
  ('e0000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000003', 'Minggu Pagi', 5),
  ('e0000000-0000-0000-0000-000000000009', 'd0000000-0000-0000-0000-000000000003', 'Minggu Sore', 2)
ON CONFLICT (id) DO NOTHING;

-- Verify
SELECT 'Votes:' AS label, COUNT(*)::text AS count FROM votes WHERE tenant_id = '00000000-0000-0000-0000-000000000010'
UNION ALL
SELECT 'Options:', COUNT(*)::text FROM vote_options WHERE vote_id IN (SELECT id FROM votes WHERE tenant_id = '00000000-0000-0000-0000-000000000010');
