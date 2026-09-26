-- ============================================================
-- Multi-Tenant RLS Policy Migration
-- FASE 1.12 Task 30: RLS Policy Implementation
-- ============================================================
--
-- This migration enables PostgreSQL Row-Level Security (RLS) on all
-- TENANT_OWNED tables to enforce tenant isolation at the database layer.
--
-- CRITICAL RULES:
-- 1. NO RLS on users table (GLOBAL_IDENTITY per INV-USER-001)
-- 2. NO generic bypass mechanism for PLATFORM_ADMIN
-- 3. Fail closed if session variable not set
-- 4. Use SET LOCAL (transaction-scoped) for connection pool safety
--
-- Session variable: app.current_tenant_id
--
-- @see Requirement 10: PostgreSQL Row-Level Security Foundation
-- @see Requirement 60: RLS Connection Pool Safety & Coverage Enforcement
-- @see Design Section 11: RLS Foundation
-- ============================================================

-- ============================================================
-- STEP 1: Enable Row Level Security on TENANT_OWNED tables
-- ============================================================

ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "org_units" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "households" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "residents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "announcements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "votes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "financial_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "iuran_statuses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "emergency_alerts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "iot_devices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "device_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "patrol_schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "incident_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "letter_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "community_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "visitor_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "package_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "feature_flag_overrides" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "incidents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gate_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cctv_cameras" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cctv_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "patrol_routes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "patrol_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "alarm_devices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "alarm_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "automation_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "automation_executions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "homes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "door_sensor_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "door_installation_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "emergency_contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invitation_tokens" ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- STEP 2: Create tenant isolation policies
-- ============================================================

-- Policy for tenants (uses id instead of tenant_id)
CREATE POLICY "tenants_tenant_isolation" ON "tenants"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (id = current_setting('app.current_tenant_id')::uuid);

-- Policy for org_units
CREATE POLICY "org_units_tenant_isolation" ON "org_units"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Policy for memberships
CREATE POLICY "memberships_tenant_isolation" ON "memberships"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Policy for households
CREATE POLICY "households_tenant_isolation" ON "households"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Policy for residents
CREATE POLICY "residents_tenant_isolation" ON "residents"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Policy for announcements
CREATE POLICY "announcements_tenant_isolation" ON "announcements"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Policy for votes
CREATE POLICY "votes_tenant_isolation" ON "votes"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Policy for financial_transactions
CREATE POLICY "financial_transactions_tenant_isolation" ON "financial_transactions"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Policy for iuran_statuses
CREATE POLICY "iuran_statuses_tenant_isolation" ON "iuran_statuses"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Policy for emergency_alerts
CREATE POLICY "emergency_alerts_tenant_isolation" ON "emergency_alerts"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Policy for iot_devices
CREATE POLICY "iot_devices_tenant_isolation" ON "iot_devices"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Policy for device_events
CREATE POLICY "device_events_tenant_isolation" ON "device_events"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Policy for patrol_schedules
CREATE POLICY "patrol_schedules_tenant_isolation" ON "patrol_schedules"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Policy for incident_reports
CREATE POLICY "incident_reports_tenant_isolation" ON "incident_reports"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Policy for letter_requests
CREATE POLICY "letter_requests_tenant_isolation" ON "letter_requests"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Policy for community_events
CREATE POLICY "community_events_tenant_isolation" ON "community_events"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Policy for visitor_logs
CREATE POLICY "visitor_logs_tenant_isolation" ON "visitor_logs"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Policy for package_logs
CREATE POLICY "package_logs_tenant_isolation" ON "package_logs"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Policy for invoices
CREATE POLICY "invoices_tenant_isolation" ON "invoices"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Policy for feature_flag_overrides
CREATE POLICY "feature_flag_overrides_tenant_isolation" ON "feature_flag_overrides"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Policy for notifications
CREATE POLICY "notifications_tenant_isolation" ON "notifications"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Policy for audit_logs
CREATE POLICY "audit_logs_tenant_isolation" ON "audit_logs"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Policy for push_subscriptions
CREATE POLICY "push_subscriptions_tenant_isolation" ON "push_subscriptions"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Policy for incidents
CREATE POLICY "incidents_tenant_isolation" ON "incidents"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Policy for gates
CREATE POLICY "gates_tenant_isolation" ON "gates"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Policy for gate_events
CREATE POLICY "gate_events_tenant_isolation" ON "gate_events"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Policy for cctv_cameras
CREATE POLICY "cctv_cameras_tenant_isolation" ON "cctv_cameras"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Policy for cctv_snapshots
CREATE POLICY "cctv_snapshots_tenant_isolation" ON "cctv_snapshots"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Policy for patrol_routes
CREATE POLICY "patrol_routes_tenant_isolation" ON "patrol_routes"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Policy for patrol_sessions
CREATE POLICY "patrol_sessions_tenant_isolation" ON "patrol_sessions"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Policy for alarm_devices
CREATE POLICY "alarm_devices_tenant_isolation" ON "alarm_devices"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Policy for alarm_events
CREATE POLICY "alarm_events_tenant_isolation" ON "alarm_events"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Policy for automation_rules
CREATE POLICY "automation_rules_tenant_isolation" ON "automation_rules"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Policy for automation_executions
CREATE POLICY "automation_executions_tenant_isolation" ON "automation_executions"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Policy for homes
CREATE POLICY "homes_tenant_isolation" ON "homes"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Policy for door_sensor_configs
CREATE POLICY "door_sensor_configs_tenant_isolation" ON "door_sensor_configs"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Policy for door_installation_requests
CREATE POLICY "door_installation_requests_tenant_isolation" ON "door_installation_requests"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Policy for emergency_contacts
CREATE POLICY "emergency_contacts_tenant_isolation" ON "emergency_contacts"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Policy for invitation_tokens
CREATE POLICY "invitation_tokens_tenant_isolation" ON "invitation_tokens"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ============================================================
-- Tables WITHOUT RLS (by design)
-- ============================================================
-- users: GLOBAL_IDENTITY - User table is global identity store
--        Access authorized via Membership lookup, NOT direct tenant filter
--        User.tenantId is LEGACY TRANSITIONAL evidence only
--
-- subscription_plans: PLATFORM_SHARED - Read-all for authenticated users
-- feature_flags: PLATFORM_SHARED - Read-all for authenticated users
--
-- Tables without direct tenant_id are indirectly scoped via FK:
-- - vote_options (via votes)
-- - ballots (via votes)
-- - announcement_attachments (via announcements)
-- - patrol_attendances (via patrol_schedules)
-- - event_rsvps (via community_events)
-- - incident_logs (via incidents)
-- - payment_reconciliations (via invoices)
-- - patrol_checkpoint_visits (via patrol_sessions)
-- ============================================================

-- ============================================================
-- STEP 3: Verification queries
-- ============================================================
-- Run these to verify RLS is properly enabled

-- List all tables with RLS enabled:
-- SELECT c.relname AS table_name,
--        c.relrowsecurity AS rls_enabled,
--        array_agg(p.polname) AS policies
-- FROM pg_class c
-- LEFT JOIN pg_policy p ON p.polrelid = c.oid
-- WHERE c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
--   AND c.relkind = 'r'
-- GROUP BY c.relname, c.relrowsecurity
-- ORDER BY c.relname;

-- ============================================================
-- USAGE PATTERN (Application Layer)
-- ============================================================
-- In application code, use SET LOCAL within transactions:
--
-- await prisma.$transaction(async (tx) => {
--   await tx.$executeRawUnsafe(`SET LOCAL "app.current_tenant_id" = '${tenantId}'`);
--   // All queries now filtered by tenant
--   const residents = await tx.resident.findMany();
--   // Context automatically cleared when transaction ends
--   return residents;
-- });
-- ============================================================
