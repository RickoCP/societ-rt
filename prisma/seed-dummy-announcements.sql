-- ============================================================================
-- Dummy Data: Announcements for Platform Admin tenant
-- Tenant ID: 00000000-0000-0000-0000-000000000010
-- User ID (Super Admin): 00000000-0000-0000-0000-000000000020
-- Run this in Neon SQL Editor
-- ============================================================================

INSERT INTO announcements (id, tenant_id, title, content, category, created_by, published_at, created_at, updated_at)
VALUES
  ('f0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Jadwal Kerja Bakti Bulan Ini', 'Kerja bakti akan dilaksanakan pada hari Minggu, 15 Juni 2025 pukul 07.00 WIB. Seluruh warga diharapkan berpartisipasi. Peralatan disediakan oleh RT.', 'umum', '00000000-0000-0000-0000-000000000020', NOW(), NOW(), NOW()),
  ('f0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000010', 'Peringatan: Pencurian Motor di Blok B', 'Telah terjadi pencurian motor di area parkir Blok B pada Senin malam. Warga diminta meningkatkan kewaspadaan dan melaporkan aktivitas mencurigakan ke pos keamanan.', 'keamanan', '00000000-0000-0000-0000-000000000020', NOW(), NOW(), NOW()),
  ('f0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000010', 'Laporan Keuangan Triwulan I 2025', 'Total pemasukan: Rp 3.500.000. Total pengeluaran: Rp 750.000. Saldo akhir: Rp 2.750.000. Detail dapat dilihat di halaman Finance.', 'keuangan', '00000000-0000-0000-0000-000000000020', NOW(), NOW(), NOW()),
  ('f0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000010', 'Lomba 17 Agustus 2025', 'Panitia lomba 17 Agustus mengundang seluruh warga untuk berpartisipasi. Pendaftaran dibuka mulai 1 Juli 2025. Lomba meliputi: balap karung, makan kerupuk, tarik tambang.', 'kegiatan', '00000000-0000-0000-0000-000000000020', NOW(), NOW(), NOW()),
  ('f0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000010', 'DARURAT: Banjir di Area Blok C', 'Banjir setinggi 30cm di area Blok C akibat hujan deras. Warga Blok C diminta mengamankan barang berharga. Tim darurat sudah disiagakan.', 'darurat', '00000000-0000-0000-0000-000000000020', NOW(), NOW(), NOW()),
  ('f0000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000010', 'Iuran Bulan Juni Sudah Jatuh Tempo', 'Bagi warga yang belum membayar iuran bulan Juni, harap segera melakukan pembayaran ke bendahara RT. Nominal: Rp 100.000/bulan.', 'umum', '00000000-0000-0000-0000-000000000020', NOW(), NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Verify
SELECT 'Announcements:' AS label, COUNT(*)::text AS count FROM announcements WHERE tenant_id = '00000000-0000-0000-0000-000000000010';
