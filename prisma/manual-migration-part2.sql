-- ===================== PART 2: Domain Tables =====================

CREATE TABLE "households" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "household_number" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "block" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "households_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "households_tenant_id_household_number_unique" UNIQUE ("tenant_id", "household_number"),
  CONSTRAINT "households_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
);
CREATE INDEX "households_tenant_id_id_idx" ON "households"("tenant_id", "id");

CREATE TABLE "residents" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "household_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "nik" TEXT NOT NULL,
  "date_of_birth" TIMESTAMP(3) NOT NULL,
  "gender" "Gender" NOT NULL,
  "phone" TEXT,
  "status" "ResidencyStatus" NOT NULL DEFAULT 'tetap',
  "categories" TEXT[] NOT NULL DEFAULT '{}',
  "emergency_contact_name" TEXT,
  "emergency_contact_phone" TEXT,
  "emergency_contact_relationship" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "residents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "residents_tenant_id_nik_unique" UNIQUE ("tenant_id", "nik"),
  CONSTRAINT "residents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id"),
  CONSTRAINT "residents_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id")
);
CREATE INDEX "residents_tenant_id_id_idx" ON "residents"("tenant_id", "id");
CREATE INDEX "residents_tenant_id_created_at_idx" ON "residents"("tenant_id", "created_at");
CREATE INDEX "residents_tenant_id_status_idx" ON "residents"("tenant_id", "status");

CREATE TABLE "financial_transactions" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "type" "TransactionType" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "description" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "financial_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "financial_transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
);
CREATE INDEX "financial_transactions_tenant_id_id_idx" ON "financial_transactions"("tenant_id", "id");
CREATE INDEX "financial_transactions_tenant_id_created_at_idx" ON "financial_transactions"("tenant_id", "created_at");
CREATE INDEX "financial_transactions_tenant_id_date_idx" ON "financial_transactions"("tenant_id", "date");

CREATE TABLE "iuran_statuses" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "household_id" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "status" "IuranPaymentStatus" NOT NULL DEFAULT 'unpaid',
  "paid_at" TIMESTAMP(3),
  "transaction_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "iuran_statuses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "iuran_statuses_tenant_id_household_id_month_unique" UNIQUE ("tenant_id", "household_id", "month"),
  CONSTRAINT "iuran_statuses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id"),
  CONSTRAINT "iuran_statuses_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id")
);
CREATE INDEX "iuran_statuses_tenant_id_id_idx" ON "iuran_statuses"("tenant_id", "id");

CREATE TABLE "votes" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "mode" "VoteMode" NOT NULL,
  "deadline" TIMESTAMP(3) NOT NULL,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "votes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "votes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
);
CREATE INDEX "votes_tenant_id_id_idx" ON "votes"("tenant_id", "id");
CREATE INDEX "votes_tenant_id_created_at_idx" ON "votes"("tenant_id", "created_at");

CREATE TABLE "vote_options" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "vote_id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "vote_count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "vote_options_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vote_options_vote_id_fkey" FOREIGN KEY ("vote_id") REFERENCES "votes"("id")
);
CREATE INDEX "vote_options_vote_id_idx" ON "vote_options"("vote_id");

CREATE TABLE "ballots" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "vote_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "option_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ballots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ballots_vote_id_user_id_unique" UNIQUE ("vote_id", "user_id"),
  CONSTRAINT "ballots_vote_id_fkey" FOREIGN KEY ("vote_id") REFERENCES "votes"("id")
);

CREATE TABLE "announcements" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "category" "AnnouncementCategory" NOT NULL,
  "created_by" TEXT NOT NULL,
  "published_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "announcements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "announcements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
);
CREATE INDEX "announcements_tenant_id_id_idx" ON "announcements"("tenant_id", "id");
CREATE INDEX "announcements_tenant_id_created_at_idx" ON "announcements"("tenant_id", "created_at");

CREATE TABLE "announcement_attachments" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "announcement_id" TEXT NOT NULL,
  "file_url" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "file_size" INTEGER NOT NULL,
  "mime_type" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "announcement_attachments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "announcement_attachments_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id")
);
CREATE INDEX "announcement_attachments_announcement_id_idx" ON "announcement_attachments"("announcement_id");

CREATE TABLE "emergency_alerts" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "location_unavailable" BOOLEAN NOT NULL DEFAULT false,
  "status" "EmergencyAlertStatus" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "emergency_alerts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "emergency_alerts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
);
CREATE INDEX "emergency_alerts_tenant_id_id_idx" ON "emergency_alerts"("tenant_id", "id");
CREATE INDEX "emergency_alerts_tenant_id_status_idx" ON "emergency_alerts"("tenant_id", "status");
