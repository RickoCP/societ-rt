-- ============================================================================
-- Dummy Data: Emergency Alerts & Incident Reports
-- Tenant ID: 00000000-0000-0000-0000-000000000010
-- User ID (Super Admin): 00000000-0000-0000-0000-000000000020
-- Run this in Neon SQL Editor
-- ============================================================================

-- Emergency Alerts
INSERT INTO emergency_alerts (id, tenant_id, user_id, latitude, longitude, location_unavailable, status, created_at, updated_at)
VALUES
  ('k0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000020', -6.3230, 107.2970, false, 'active', NOW() - INTERVAL '30 minutes', NOW()),
  ('k0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000020', -6.3235, 107.2975, false, 'responding', NOW() - INTERVAL '2 hours', NOW()),
  ('k0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000020', NULL, NULL, true, 'resolved', NOW() - INTERVAL '1 day', NOW())
ON CONFLICT (id) DO NOTHING;

-- Incident Reports
INSERT INTO incident_reports (id, tenant_id, date, time, description, location, severity_level, reported_by, created_at)
VALUES
  ('l0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', NOW() - INTERVAL '1 day', '22:00', 'Pencurian Motor - Motor Honda Beat warna merah hilang dari parkiran Blok B malam ini sekitar pukul 22.00', 'Parkiran Blok B', 'high', '00000000-0000-0000-0000-000000000020', NOW() - INTERVAL '1 day'),
  ('l0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000010', NOW() - INTERVAL '3 days', '08:00', 'Lampu Jalan Mati - Lampu jalan di depan rumah No. 12 Blok A sudah mati 3 hari', 'Blok A No. 12', 'low', '00000000-0000-0000-0000-000000000020', NOW() - INTERVAL '3 days'),
  ('l0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000010', NOW() - INTERVAL '12 hours', '01:00', 'Orang Mencurigakan - Ada orang tidak dikenal berkeliaran di area Blok C sekitar pukul 01.00 dini hari', 'Blok C', 'medium', '00000000-0000-0000-0000-000000000020', NOW() - INTERVAL '12 hours'),
  ('l0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000010', NOW() - INTERVAL '6 hours', '15:30', 'Kebakaran Kecil - Terjadi kebakaran kecil di dapur rumah Blok D No. 5, sudah dipadamkan', 'Blok D No. 5', 'critical', '00000000-0000-0000-0000-000000000020', NOW() - INTERVAL '6 hours')
ON CONFLICT (id) DO NOTHING;

-- Verify
SELECT 'Emergency Alerts:' AS label, COUNT(*)::text AS count FROM emergency_alerts WHERE tenant_id = '00000000-0000-0000-0000-000000000010'
UNION ALL
SELECT 'Incident Reports:', COUNT(*)::text FROM incident_reports WHERE tenant_id = '00000000-0000-0000-0000-000000000010';
