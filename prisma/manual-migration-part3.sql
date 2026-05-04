-- ===================== PART 3: Remaining Tables =====================

CREATE TABLE "patrol_schedules" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "time_slot" TEXT NOT NULL,
  "assigned_user_ids" TEXT[] NOT NULL DEFAULT '{}',
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "patrol_schedules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "patrol_schedules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
);
CREATE INDEX "patrol_schedules_tenant_id_id_idx" ON "patrol_schedules"("tenant_id", "id");
CREATE INDEX "patrol_schedules_tenant_id_date_idx" ON "patrol_schedules"("tenant_id", "date");

CREATE TABLE "patrol_attendances" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "schedule_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "check_in_timestamp" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "patrol_attendances_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "patrol_attendances_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "patrol_schedules"("id")
);
CREATE INDEX "patrol_attendances_schedule_id_idx" ON "patrol_attendances"("schedule_id");

CREATE TABLE "incident_reports" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "time" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "location" TEXT NOT NULL,
  "severity_level" "SeverityLevel" NOT NULL,
  "reported_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "incident_reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "incident_reports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
);
CREATE INDEX "incident_reports_tenant_id_id_idx" ON "incident_reports"("tenant_id", "id");
CREATE INDEX "incident_reports_tenant_id_created_at_idx" ON "incident_reports"("tenant_id", "created_at");

CREATE TABLE "letter_requests" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "letter_type" "LetterType" NOT NULL,
  "purpose" TEXT NOT NULL,
  "status" "LetterRequestStatus" NOT NULL DEFAULT 'pending',
  "rejection_reason" TEXT,
  "document_url" TEXT,
  "decided_by" TEXT,
  "decided_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "letter_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "letter_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
);
CREATE INDEX "letter_requests_tenant_id_id_idx" ON "letter_requests"("tenant_id", "id");
CREATE INDEX "letter_requests_tenant_id_created_at_idx" ON "letter_requests"("tenant_id", "created_at");
CREATE INDEX "letter_requests_tenant_id_user_id_idx" ON "letter_requests"("tenant_id", "user_id");

CREATE TABLE "community_events" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "time" TEXT NOT NULL,
  "location" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "community_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "community_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
);
CREATE INDEX "community_events_tenant_id_id_idx" ON "community_events"("tenant_id", "id");
CREATE INDEX "community_events_tenant_id_date_idx" ON "community_events"("tenant_id", "date");

CREATE TABLE "event_rsvps" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "event_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "response" "RsvpResponse" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_rsvps_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_rsvps_event_id_user_id_unique" UNIQUE ("event_id", "user_id"),
  CONSTRAINT "event_rsvps_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "community_events"("id")
);

CREATE TABLE "visitor_logs" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "visitor_name" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "destination_household_id" TEXT NOT NULL,
  "entry_timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "exit_timestamp" TIMESTAMP(3),
  "logged_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "visitor_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "visitor_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
);
CREATE INDEX "visitor_logs_tenant_id_id_idx" ON "visitor_logs"("tenant_id", "id");
CREATE INDEX "visitor_logs_tenant_id_created_at_idx" ON "visitor_logs"("tenant_id", "created_at");

CREATE TABLE "package_logs" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "recipient_household_id" TEXT NOT NULL,
  "courier_name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "arrival_timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "logged_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "package_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "package_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
);
CREATE INDEX "package_logs_tenant_id_id_idx" ON "package_logs"("tenant_id", "id");
CREATE INDEX "package_logs_tenant_id_created_at_idx" ON "package_logs"("tenant_id", "created_at");

CREATE TABLE "invoices" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "plan_name" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "billing_period_start" TIMESTAMP(3) NOT NULL,
  "billing_period_end" TIMESTAMP(3) NOT NULL,
  "due_date" TIMESTAMP(3) NOT NULL,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'pending',
  "gateway_transaction_id" TEXT,
  "paid_at" TIMESTAMP(3),
  "retry_count" INTEGER NOT NULL DEFAULT 0,
  "idempotency_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invoices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invoices_idempotency_key_key" UNIQUE ("idempotency_key"),
  CONSTRAINT "invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
);
CREATE INDEX "invoices_tenant_id_status_due_date_idx" ON "invoices"("tenant_id", "status", "due_date");

CREATE TABLE "payment_reconciliations" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "gateway_transaction_id" TEXT NOT NULL,
  "internal_invoice_id" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "status" TEXT NOT NULL,
  "gateway_response" JSONB NOT NULL,
  "reconciled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_reconciliations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "feature_flags" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "feature_name" TEXT NOT NULL,
  "plan_id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "feature_flag_overrides" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "feature_name" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  "overridden_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "feature_flag_overrides_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "feature_flag_overrides_tenant_id_feature_name_unique" UNIQUE ("tenant_id", "feature_name"),
  CONSTRAINT "feature_flag_overrides_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
);

CREATE TABLE "notifications" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'unread',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
);
CREATE INDEX "notifications_tenant_id_user_id_status_created_at_idx" ON "notifications"("tenant_id", "user_id", "status", "created_at");

CREATE TABLE "audit_logs" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "action_type" TEXT NOT NULL,
  "resource_type" TEXT NOT NULL,
  "resource_id" TEXT NOT NULL,
  "details" JSONB NOT NULL,
  "ip_address" TEXT,
  "impersonator_id" TEXT,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
);
CREATE INDEX "audit_logs_tenant_id_timestamp_idx" ON "audit_logs"("tenant_id", "timestamp");
CREATE INDEX "audit_logs_tenant_id_action_type_idx" ON "audit_logs"("tenant_id", "action_type");

CREATE TABLE "push_subscriptions" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "user_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh_key" TEXT NOT NULL,
  "auth_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "push_subscriptions_user_id_endpoint_unique" UNIQUE ("user_id", "endpoint"),
  CONSTRAINT "push_subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
);
CREATE INDEX "push_subscriptions_tenant_id_user_id_idx" ON "push_subscriptions"("tenant_id", "user_id");
