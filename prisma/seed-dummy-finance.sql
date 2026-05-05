-- ============================================================================
-- Dummy Data: Financial Transactions for Platform Admin tenant
-- Tenant ID: 00000000-0000-0000-0000-000000000010
-- User ID (Super Admin): 00000000-0000-0000-0000-000000000020
-- Run this in Neon SQL Editor
-- ============================================================================

INSERT INTO financial_transactions (id, tenant_id, type, amount, description, category, date, created_by, created_at, updated_at)
VALUES
  -- Income transactions
  ('c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'income', 500000, 'Iuran bulanan Januari - KK Budi Santoso', 'iuran', '2025-01-05', '00000000-0000-0000-0000-000000000020', NOW(), NOW()),
  ('c0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000010', 'income', 500000, 'Iuran bulanan Januari - KK Ahmad Hidayat', 'iuran', '2025-01-07', '00000000-0000-0000-0000-000000000020', NOW(), NOW()),
  ('c0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000010', 'income', 500000, 'Iuran bulanan Januari - KK Hendra Wijaya', 'iuran', '2025-01-10', '00000000-0000-0000-0000-000000000020', NOW(), NOW()),
  ('c0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000010', 'income', 1000000, 'Donasi warga untuk perbaikan jalan', 'donasi', '2025-01-15', '00000000-0000-0000-0000-000000000020', NOW(), NOW()),
  ('c0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000010', 'income', 500000, 'Iuran bulanan Februari - KK Budi Santoso', 'iuran', '2025-02-05', '00000000-0000-0000-0000-000000000020', NOW(), NOW()),
  ('c0000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000010', 'income', 500000, 'Iuran bulanan Februari - KK Ahmad Hidayat', 'iuran', '2025-02-08', '00000000-0000-0000-0000-000000000020', NOW(), NOW()),

  -- Expense transactions
  ('c0000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000010', 'expense', 200000, 'Gaji satpam Januari', 'keamanan', '2025-01-25', '00000000-0000-0000-0000-000000000020', NOW(), NOW()),
  ('c0000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000010', 'expense', 150000, 'Biaya kebersihan Januari', 'kebersihan', '2025-01-28', '00000000-0000-0000-0000-000000000020', NOW(), NOW()),
  ('c0000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000010', 'expense', 300000, 'Perbaikan lampu jalan', 'operasional', '2025-02-10', '00000000-0000-0000-0000-000000000020', NOW(), NOW()),
  ('c0000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000010', 'expense', 100000, 'ATK dan fotokopi surat', 'operasional', '2025-02-15', '00000000-0000-0000-0000-000000000020', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Verify
SELECT 'Transactions:' AS label, COUNT(*)::text AS count FROM financial_transactions WHERE tenant_id = '00000000-0000-0000-0000-000000000010'
UNION ALL
SELECT 'Total Income:', SUM(amount)::text FROM financial_transactions WHERE tenant_id = '00000000-0000-0000-0000-000000000010' AND type = 'income'
UNION ALL
SELECT 'Total Expense:', SUM(amount)::text FROM financial_transactions WHERE tenant_id = '00000000-0000-0000-0000-000000000010' AND type = 'expense';
