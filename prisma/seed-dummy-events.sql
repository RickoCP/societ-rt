-- ============================================================================
-- Dummy Data: Community Events for Platform Admin tenant
-- Tenant ID: 00000000-0000-0000-0000-000000000010
-- User ID (Super Admin): 00000000-0000-0000-0000-000000000020
-- Run this in Neon SQL Editor
-- ============================================================================

INSERT INTO community_events (id, tenant_id, title, description, date, time, location, created_by, created_at, updated_at)
VALUES
  ('g0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Kerja Bakti Bulanan', 'Kerja bakti membersihkan lingkungan RT. Semua warga diharapkan hadir.', '2026-06-15 07:00:00', '07:00 - 10:00', 'Lapangan RT', '00000000-0000-0000-0000-000000000020', NOW(), NOW()),
  ('g0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000010', 'Rapat Warga Triwulan II', 'Rapat membahas program kerja triwulan II dan laporan keuangan.', '2026-07-01 19:00:00', '19:00 - 21:00', 'Balai Warga', '00000000-0000-0000-0000-000000000020', NOW(), NOW()),
  ('g0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000010', 'Lomba 17 Agustus', 'Berbagai lomba menyambut HUT RI: balap karung, makan kerupuk, tarik tambang, dll.', '2026-08-17 08:00:00', '08:00 - 15:00', 'Jalan Utama RT', '00000000-0000-0000-0000-000000000020', NOW(), NOW()),
  ('g0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000010', 'Posyandu Balita', 'Pemeriksaan kesehatan rutin untuk balita. Bawa buku KIA.', '2026-06-20 09:00:00', '09:00 - 12:00', 'Pos RT Blok A', '00000000-0000-0000-0000-000000000020', NOW(), NOW()),
  ('g0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000010', 'Pengajian Rutin', 'Pengajian bulanan bersama ustadz setempat. Terbuka untuk semua warga.', '2026-06-25 18:30:00', '18:30 - 20:00', 'Musholla RT', '00000000-0000-0000-0000-000000000020', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Verify
SELECT 'Events:' AS label, COUNT(*)::text AS count FROM community_events WHERE tenant_id = '00000000-0000-0000-0000-000000000010';
