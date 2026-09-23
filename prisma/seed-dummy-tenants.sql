-- =============================================================================
-- Seed Dummy Tenants: rt01.societ.app dan rt02.societ.app
-- =============================================================================
-- Jalankan script ini setelah menjalankan seed.ts (untuk memastikan subscription_plans ada)
-- Usage: Jalankan di Neon SQL Editor atau psql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tenant RT 01 - Perumahan Harmoni Indah
-- -----------------------------------------------------------------------------
INSERT INTO "tenants" (
  "id",
  "name",
  "subdomain",
  "rt_rw_number",
  "region",
  "address",
  "contact_person",
  "logo_url",
  "primary_color",
  "secondary_color",
  "status",
  "subscription_plan_id",
  "created_at",
  "updated_at"
) VALUES (
  '00000000-0000-0000-0000-000000000011',
  'RT 01 Perumahan Harmoni Indah',
  'rt01',
  '001/005',
  'Kelurahan Sukamaju, Kecamatan Cilodong, Kota Depok',
  'Jl. Harmoni Raya No. 1, Perumahan Harmoni Indah, Depok 16415',
  'Budi Santoso',
  NULL,
  '#2563eb',
  '#1e40af',
  'active',
  '00000000-0000-0000-0000-000000000002', -- Pro Plan
  NOW(),
  NOW()
) ON CONFLICT ("subdomain") DO UPDATE SET
  "name" = EXCLUDED."name",
  "rt_rw_number" = EXCLUDED."rt_rw_number",
  "region" = EXCLUDED."region",
  "address" = EXCLUDED."address",
  "contact_person" = EXCLUDED."contact_person",
  "primary_color" = EXCLUDED."primary_color",
  "secondary_color" = EXCLUDED."secondary_color",
  "updated_at" = NOW();

-- User Ketua RT untuk RT 01
INSERT INTO "users" (
  "id",
  "tenant_id",
  "name",
  "email",
  "password_hash",
  "role",
  "status",
  "created_at",
  "updated_at"
) VALUES (
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000011',
  'Budi Santoso',
  'ketua@rt01.societ.app',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4hHcqI0QmyYKhGam', -- Admin@123456
  'Ketua_RT',
  'active',
  NOW(),
  NOW()
) ON CONFLICT ("tenant_id", "email") DO UPDATE SET
  "name" = EXCLUDED."name",
  "updated_at" = NOW();

-- User Pengurus untuk RT 01
INSERT INTO "users" (
  "id",
  "tenant_id",
  "name",
  "email",
  "password_hash",
  "role",
  "status",
  "created_at",
  "updated_at"
) VALUES (
  '00000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-000000000011',
  'Siti Rahayu',
  'sekretaris@rt01.societ.app',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4hHcqI0QmyYKhGam', -- Admin@123456
  'Pengurus',
  'active',
  NOW(),
  NOW()
) ON CONFLICT ("tenant_id", "email") DO UPDATE SET
  "name" = EXCLUDED."name",
  "updated_at" = NOW();

-- User Warga untuk RT 01
INSERT INTO "users" (
  "id",
  "tenant_id",
  "name",
  "email",
  "password_hash",
  "role",
  "status",
  "created_at",
  "updated_at"
) VALUES (
  '00000000-0000-0000-0000-000000000103',
  '00000000-0000-0000-0000-000000000011',
  'Ahmad Wijaya',
  'ahmad@rt01.societ.app',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4hHcqI0QmyYKhGam', -- Admin@123456
  'Warga',
  'active',
  NOW(),
  NOW()
) ON CONFLICT ("tenant_id", "email") DO UPDATE SET
  "name" = EXCLUDED."name",
  "updated_at" = NOW();

-- Security Guard untuk RT 01
INSERT INTO "users" (
  "id",
  "tenant_id",
  "name",
  "email",
  "password_hash",
  "role",
  "status",
  "created_at",
  "updated_at"
) VALUES (
  '00000000-0000-0000-0000-000000000104',
  '00000000-0000-0000-0000-000000000011',
  'Joko Susilo',
  'satpam@rt01.societ.app',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4hHcqI0QmyYKhGam', -- Admin@123456
  'Security_Guard',
  'active',
  NOW(),
  NOW()
) ON CONFLICT ("tenant_id", "email") DO UPDATE SET
  "name" = EXCLUDED."name",
  "updated_at" = NOW();

-- -----------------------------------------------------------------------------
-- 2. Tenant RT 02 - Cluster Bunga Melati
-- -----------------------------------------------------------------------------
INSERT INTO "tenants" (
  "id",
  "name",
  "subdomain",
  "rt_rw_number",
  "region",
  "address",
  "contact_person",
  "logo_url",
  "primary_color",
  "secondary_color",
  "status",
  "subscription_plan_id",
  "created_at",
  "updated_at"
) VALUES (
  '00000000-0000-0000-0000-000000000012',
  'RT 02 Cluster Bunga Melati',
  'rt02',
  '002/005',
  'Kelurahan Sukamaju, Kecamatan Cilodong, Kota Depok',
  'Jl. Melati Raya Blok A, Cluster Bunga Melati, Depok 16415',
  'Hendra Kusuma',
  NULL,
  '#059669',
  '#047857',
  'active',
  '00000000-0000-0000-0000-000000000003', -- Enterprise Plan
  NOW(),
  NOW()
) ON CONFLICT ("subdomain") DO UPDATE SET
  "name" = EXCLUDED."name",
  "rt_rw_number" = EXCLUDED."rt_rw_number",
  "region" = EXCLUDED."region",
  "address" = EXCLUDED."address",
  "contact_person" = EXCLUDED."contact_person",
  "primary_color" = EXCLUDED."primary_color",
  "secondary_color" = EXCLUDED."secondary_color",
  "updated_at" = NOW();

-- User Ketua RT untuk RT 02
INSERT INTO "users" (
  "id",
  "tenant_id",
  "name",
  "email",
  "password_hash",
  "role",
  "status",
  "created_at",
  "updated_at"
) VALUES (
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000012',
  'Hendra Kusuma',
  'ketua@rt02.societ.app',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4hHcqI0QmyYKhGam', -- Admin@123456
  'Ketua_RT',
  'active',
  NOW(),
  NOW()
) ON CONFLICT ("tenant_id", "email") DO UPDATE SET
  "name" = EXCLUDED."name",
  "updated_at" = NOW();

-- User Pengurus (Bendahara) untuk RT 02
INSERT INTO "users" (
  "id",
  "tenant_id",
  "name",
  "email",
  "password_hash",
  "role",
  "status",
  "created_at",
  "updated_at"
) VALUES (
  '00000000-0000-0000-0000-000000000202',
  '00000000-0000-0000-0000-000000000012',
  'Dewi Lestari',
  'bendahara@rt02.societ.app',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4hHcqI0QmyYKhGam', -- Admin@123456
  'Pengurus',
  'active',
  NOW(),
  NOW()
) ON CONFLICT ("tenant_id", "email") DO UPDATE SET
  "name" = EXCLUDED."name",
  "updated_at" = NOW();

-- User Warga untuk RT 02
INSERT INTO "users" (
  "id",
  "tenant_id",
  "name",
  "email",
  "password_hash",
  "role",
  "status",
  "created_at",
  "updated_at"
) VALUES (
  '00000000-0000-0000-0000-000000000203',
  '00000000-0000-0000-0000-000000000012',
  'Rizki Pratama',
  'rizki@rt02.societ.app',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4hHcqI0QmyYKhGam', -- Admin@123456
  'Warga',
  'active',
  NOW(),
  NOW()
) ON CONFLICT ("tenant_id", "email") DO UPDATE SET
  "name" = EXCLUDED."name",
  "updated_at" = NOW();

-- Security Guard untuk RT 02
INSERT INTO "users" (
  "id",
  "tenant_id",
  "name",
  "email",
  "password_hash",
  "role",
  "status",
  "created_at",
  "updated_at"
) VALUES (
  '00000000-0000-0000-0000-000000000204',
  '00000000-0000-0000-0000-000000000012',
  'Agus Setiawan',
  'satpam@rt02.societ.app',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4hHcqI0QmyYKhGam', -- Admin@123456
  'Security_Guard',
  'active',
  NOW(),
  NOW()
) ON CONFLICT ("tenant_id", "email") DO UPDATE SET
  "name" = EXCLUDED."name",
  "updated_at" = NOW();

-- =============================================================================
-- VERIFIKASI
-- =============================================================================
-- Setelah menjalankan script, cek dengan query berikut:
-- SELECT id, name, subdomain, status FROM tenants WHERE subdomain IN ('rt01', 'rt02');
-- SELECT id, name, email, role FROM users WHERE tenant_id IN ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012');
-- =============================================================================

-- =============================================================================
-- INFORMASI LOGIN
-- =============================================================================
-- Semua user menggunakan password: Admin@123456
--
-- RT 01 (rt01.societ.app):
--   - Ketua RT: ketua@rt01.societ.app
--   - Sekretaris: sekretaris@rt01.societ.app
--   - Warga: ahmad@rt01.societ.app
--   - Satpam: satpam@rt01.societ.app
--
-- RT 02 (rt02.societ.app):
--   - Ketua RT: ketua@rt02.societ.app
--   - Bendahara: bendahara@rt02.societ.app
--   - Warga: rizki@rt02.societ.app
--   - Satpam: satpam@rt02.societ.app
-- =============================================================================
