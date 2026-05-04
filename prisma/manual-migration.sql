-- =============================================================================
-- SocieT-RT Manual Migration SQL
-- Run this in Neon SQL Editor if prisma migrate/db push is blocked
-- Split into 3 parts — run each part separately in Neon SQL Editor
-- =============================================================================
-- PART 1: Enums + Core Tables (subscription_plans, tenants, users, invitation_tokens)
-- PART 2: Domain Tables (households, residents, finance, voting, announcements, emergency)
-- PART 3: Remaining Tables (security, admin, events, visitors, billing, flags, notifications, audit)
-- =============================================================================

-- ===================== PART 1 =====================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "TenantStatus" AS ENUM ('active', 'suspended');
CREATE TYPE "UserRole" AS ENUM ('Super_Admin', 'Ketua_RT', 'Pengurus', 'Warga', 'Security_Guard');
CREATE TYPE "UserStatus" AS ENUM ('active', 'locked', 'inactive');
CREATE TYPE "ResidencyStatus" AS ENUM ('tetap', 'kontrak', 'kos', 'pindah');
CREATE TYPE "Gender" AS ENUM ('male', 'female');
CREATE TYPE "TransactionType" AS ENUM ('income', 'expense');
CREATE TYPE "IuranPaymentStatus" AS ENUM ('paid', 'unpaid');
CREATE TYPE "VoteMode" AS ENUM ('anonymous', 'verified');
CREATE TYPE "AnnouncementCategory" AS ENUM ('umum', 'keamanan', 'keuangan', 'kegiatan', 'darurat');
CREATE TYPE "EmergencyAlertStatus" AS ENUM ('active', 'responding', 'resolved');
CREATE TYPE "SeverityLevel" AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE "LetterType" AS ENUM ('surat_pengantar', 'domisili', 'SKTM');
CREATE TYPE "LetterRequestStatus" AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE "RsvpResponse" AS ENUM ('attending', 'not_attending');
CREATE TYPE "InvoiceStatus" AS ENUM ('pending', 'paid', 'failed');

CREATE TABLE "subscription_plans" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "max_users" INTEGER,
  "features" TEXT[] NOT NULL DEFAULT '{}',
  "price" DECIMAL(10,2) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tenants" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "subdomain" TEXT NOT NULL,
  "rt_rw_number" TEXT NOT NULL,
  "region" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "contact_person" TEXT NOT NULL,
  "logo_url" TEXT,
  "primary_color" TEXT,
  "secondary_color" TEXT,
  "status" "TenantStatus" NOT NULL DEFAULT 'active',
  "subscription_plan_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenants_subdomain_key" UNIQUE ("subdomain"),
  CONSTRAINT "tenants_rt_rw_number_region_unique" UNIQUE ("rt_rw_number", "region"),
  CONSTRAINT "tenants_subscription_plan_id_fkey" FOREIGN KEY ("subscription_plan_id") REFERENCES "subscription_plans"("id")
);

CREATE TABLE "users" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'Warga',
  "status" "UserStatus" NOT NULL DEFAULT 'active',
  "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
  "locked_until" TIMESTAMP(3),
  "consent_timestamp" TIMESTAMP(3),
  "consent_version" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "users_tenant_id_email_unique" UNIQUE ("tenant_id", "email"),
  CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
);
CREATE INDEX "users_tenant_id_id_idx" ON "users"("tenant_id", "id");
CREATE INDEX "users_tenant_id_created_at_idx" ON "users"("tenant_id", "created_at");
CREATE INDEX "users_tenant_id_status_idx" ON "users"("tenant_id", "status");

CREATE TABLE "invitation_tokens" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" "UserRole" NOT NULL,
  "token" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "used_at" TIMESTAMP(3),
  CONSTRAINT "invitation_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invitation_tokens_token_key" UNIQUE ("token"),
  CONSTRAINT "invitation_tokens_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
);
CREATE INDEX "invitation_tokens_tenant_id_id_idx" ON "invitation_tokens"("tenant_id", "id");
CREATE INDEX "invitation_tokens_tenant_id_created_at_idx" ON "invitation_tokens"("tenant_id", "created_at");
