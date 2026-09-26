-- ============================================================
-- Multi-Tenant RLS Policy Migration (ENABLE)
-- FASE 2.7 Task 15: RLS Database Migration
-- ============================================================
--
-- This migration enables PostgreSQL Row-Level Security (RLS) on all
-- TENANT_OWNED and ORG_SCOPED tables to enforce tenant isolation at 
-- the database layer.
--
-- CRITICAL RULES:
-- 1. NO RLS on users table (GLOBAL_IDENTITY per INV-USER-001)
-- 2. NO RLS on subscription_plans, feature_flags (PLATFORM_SHARED)
-- 3. NO generic bypass mechanism for PLATFORM_ADMIN
-- 4. Fail closed if session variable not set
-- 5. Use SET LOCAL (transaction-scoped) for connection pool safety
--
-- Session variable: app.current_tenant_id
--
-- @see Requirement 8: RLS Database Migration Creation
-- @see Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
-- @see Design Section 7: RLS Database Migration
-- ============================================================

-- ============================================================
-- STEP 0: Transaction block for atomic migration
-- ============================================================
-- This migration MUST be executed within a transaction to ensure
-- atomicity. If any statement fails, all changes are rolled back.

BEGIN;

-- ============================================================
-- STEP 1: Enable Row Level Security on TENANT_OWNED tables
-- ============================================================
-- Note: ENABLE + FORCE ensures RLS applies even to table owner

-- Primary tenant-scoped tables with direct tenant_id column
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;

ALTER TABLE "org_units" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "org_units" FORCE ROW LEVEL SECURITY;

ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;

ALTER TABLE "households" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "households" FORCE ROW LEVEL SECURITY;

ALTER TABLE "residents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "residents" FORCE ROW LEVEL SECURITY;

ALTER TABLE "financial_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "financial_transactions" FORCE ROW LEVEL SECURITY;

ALTER TABLE "announcements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "announcements" FORCE ROW LEVEL SECURITY;

ALTER TABLE "votes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "votes" FORCE ROW LEVEL SECURITY;

ALTER TABLE "emergency_alerts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "emergency_alerts" FORCE ROW LEVEL SECURITY;

ALTER TABLE "iot_devices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "iot_devices" FORCE ROW LEVEL SECURITY;

ALTER TABLE "iuran_statuses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "iuran_statuses" FORCE ROW LEVEL SECURITY;

ALTER TABLE "device_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "device_events" FORCE ROW LEVEL SECURITY;

ALTER TABLE "patrol_schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "patrol_schedules" FORCE ROW LEVEL SECURITY;

ALTER TABLE "incident_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "incident_reports" FORCE ROW LEVEL SECURITY;

ALTER TABLE "letter_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "letter_requests" FORCE ROW LEVEL SECURITY;

ALTER TABLE "community_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "community_events" FORCE ROW LEVEL SECURITY;

ALTER TABLE "visitor_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "visitor_logs" FORCE ROW LEVEL SECURITY;

ALTER TABLE "package_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "package_logs" FORCE ROW LEVEL SECURITY;

ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;

ALTER TABLE "feature_flag_overrides" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "feature_flag_overrides" FORCE ROW LEVEL SECURITY;

ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;

ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "push_subscriptions" FORCE ROW LEVEL SECURITY;

ALTER TABLE "incidents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "incidents" FORCE ROW LEVEL SECURITY;

ALTER TABLE "gates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gates" FORCE ROW LEVEL SECURITY;

ALTER TABLE "gate_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gate_events" FORCE ROW LEVEL SECURITY;

ALTER TABLE "cctv_cameras" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cctv_cameras" FORCE ROW LEVEL SECURITY;

ALTER TABLE "cctv_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cctv_snapshots" FORCE ROW LEVEL SECURITY;

ALTER TABLE "patrol_routes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "patrol_routes" FORCE ROW LEVEL SECURITY;

ALTER TABLE "patrol_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "patrol_sessions" FORCE ROW LEVEL SECURITY;

ALTER TABLE "alarm_devices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "alarm_devices" FORCE ROW LEVEL SECURITY;

ALTER TABLE "alarm_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "alarm_events" FORCE ROW LEVEL SECURITY;

ALTER TABLE "automation_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "automation_rules" FORCE ROW LEVEL SECURITY;

ALTER TABLE "automation_executions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "automation_executions" FORCE ROW LEVEL SECURITY;

ALTER TABLE "homes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "homes" FORCE ROW LEVEL SECURITY;

ALTER TABLE "door_sensor_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "door_sensor_configs" FORCE ROW LEVEL SECURITY;

ALTER TABLE "door_installation_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "door_installation_requests" FORCE ROW LEVEL SECURITY;

ALTER TABLE "emergency_contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "emergency_contacts" FORCE ROW LEVEL SECURITY;

ALTER TABLE "invitation_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invitation_tokens" FORCE ROW LEVEL SECURITY;

-- ============================================================
-- STEP 2: Create tenant isolation policies - SELECT
-- ============================================================
-- Create separate policies for each operation to enable fine-grained
-- control and better auditability

-- Policy for tenants (uses id instead of tenant_id)
CREATE POLICY "tenants_tenant_select" ON "tenants"
  FOR SELECT
  TO PUBLIC
  USING (id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for org_units
CREATE POLICY "org_units_tenant_select" ON "org_units"
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for memberships
CREATE POLICY "memberships_tenant_select" ON "memberships"
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for households
CREATE POLICY "households_tenant_select" ON "households"
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for residents (ORG_SCOPED - tenant RLS, OrgUnit check at app level)
CREATE POLICY "residents_tenant_select" ON "residents"
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for financial_transactions
CREATE POLICY "financial_transactions_tenant_select" ON "financial_transactions"
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for announcements
CREATE POLICY "announcements_tenant_select" ON "announcements"
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for votes
CREATE POLICY "votes_tenant_select" ON "votes"
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for emergency_alerts
CREATE POLICY "emergency_alerts_tenant_select" ON "emergency_alerts"
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for iot_devices
CREATE POLICY "iot_devices_tenant_select" ON "iot_devices"
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for iuran_statuses
CREATE POLICY "iuran_statuses_tenant_select" ON "iuran_statuses"
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for device_events
CREATE POLICY "device_events_tenant_select" ON "device_events"
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for patrol_schedules
CREATE POLICY "patrol_schedules_tenant_select" ON "patrol_schedules"
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for incident_reports
CREATE POLICY "incident_reports_tenant_select" ON "incident_reports"
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for letter_requests
CREATE POLICY "letter_requests_tenant_select" ON "letter_requests"
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for community_events
CREATE POLICY "community_events_tenant_select" ON "community_events"
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for visitor_logs
CREATE POLICY "visitor_logs_tenant_select" ON "visitor_logs"
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for package_logs
CREATE POLICY "package_logs_tenant_select" ON "package_logs"
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for invoices
CREATE POLICY "invoices_tenant_select" ON "invoices"
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for feature_flag_overrides
CREATE POLICY "feature_flag_overrides_tenant_select" ON "feature_flag_overrides"
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for notifications
CREATE POLICY "notifications_tenant_select" ON "notifications"
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for audit_logs
CREATE POLICY "audit_logs_tenant_select" ON "audit_logs"
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for push_subscriptions
CREATE POLICY "push_subscriptions_tenant_select" ON "push_subscriptions"
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for incidents
CREATE POLICY "incidents_tenant_select" ON "incidents"
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for gates
CREATE POLICY "gates_tenant_select" ON "gates"
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for gate_events
CREATE POLICY "gate_events_tenant_select" ON "gate_events"
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for cctv_cameras
CREATE POLICY "cctv_cameras_tenant_select" ON "cctv_cameras"
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for cctv_snapshots
CREATE POLICY "cctv_snapshots_tenant_select" ON "cctv_snapshots"
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for patrol_routes
CREATE POLICY "patrol_routes_tenant_select" ON "patrol_routes"
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for patrol_sessions
CREATE POLICY "patrol_sessions_tenant_select" ON "patrol_sessions"
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for alarm_devices
CREATE POLICY "alarm_devices_tenant_select" ON "alarm_devices"
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for alarm_events
CREATE POLICY "alarm_events_tenant_select" ON "alarm_events"
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for automation_rules
CREATE POLICY "automation_rules_tenant_select" ON "automation_rules"
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for automation_executions
CREATE POLICY "automation_executions_tenant_select" ON "automation_executions"
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for homes
CREATE POLICY "homes_tenant_select" ON "homes"
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for door_sensor_configs
CREATE POLICY "door_sensor_configs_tenant_select" ON "door_sensor_configs"
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for door_installation_requests
CREATE POLICY "door_installation_requests_tenant_select" ON "door_installation_requests"
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for emergency_contacts
CREATE POLICY "emergency_contacts_tenant_select" ON "emergency_contacts"
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for invitation_tokens
CREATE POLICY "invitation_tokens_tenant_select" ON "invitation_tokens"
  FOR SELECT
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ============================================================
-- STEP 3: Create tenant isolation policies - INSERT
-- ============================================================

-- Policy for tenants INSERT
CREATE POLICY "tenants_tenant_insert" ON "tenants"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for org_units INSERT
CREATE POLICY "org_units_tenant_insert" ON "org_units"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for memberships INSERT
CREATE POLICY "memberships_tenant_insert" ON "memberships"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for households INSERT
CREATE POLICY "households_tenant_insert" ON "households"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for residents INSERT
CREATE POLICY "residents_tenant_insert" ON "residents"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for financial_transactions INSERT
CREATE POLICY "financial_transactions_tenant_insert" ON "financial_transactions"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for announcements INSERT
CREATE POLICY "announcements_tenant_insert" ON "announcements"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for votes INSERT
CREATE POLICY "votes_tenant_insert" ON "votes"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for emergency_alerts INSERT
CREATE POLICY "emergency_alerts_tenant_insert" ON "emergency_alerts"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for iot_devices INSERT
CREATE POLICY "iot_devices_tenant_insert" ON "iot_devices"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for iuran_statuses INSERT
CREATE POLICY "iuran_statuses_tenant_insert" ON "iuran_statuses"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for device_events INSERT
CREATE POLICY "device_events_tenant_insert" ON "device_events"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for patrol_schedules INSERT
CREATE POLICY "patrol_schedules_tenant_insert" ON "patrol_schedules"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for incident_reports INSERT
CREATE POLICY "incident_reports_tenant_insert" ON "incident_reports"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for letter_requests INSERT
CREATE POLICY "letter_requests_tenant_insert" ON "letter_requests"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for community_events INSERT
CREATE POLICY "community_events_tenant_insert" ON "community_events"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for visitor_logs INSERT
CREATE POLICY "visitor_logs_tenant_insert" ON "visitor_logs"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for package_logs INSERT
CREATE POLICY "package_logs_tenant_insert" ON "package_logs"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for invoices INSERT
CREATE POLICY "invoices_tenant_insert" ON "invoices"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for feature_flag_overrides INSERT
CREATE POLICY "feature_flag_overrides_tenant_insert" ON "feature_flag_overrides"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for notifications INSERT
CREATE POLICY "notifications_tenant_insert" ON "notifications"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for audit_logs INSERT
CREATE POLICY "audit_logs_tenant_insert" ON "audit_logs"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for push_subscriptions INSERT
CREATE POLICY "push_subscriptions_tenant_insert" ON "push_subscriptions"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for incidents INSERT
CREATE POLICY "incidents_tenant_insert" ON "incidents"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for gates INSERT
CREATE POLICY "gates_tenant_insert" ON "gates"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for gate_events INSERT
CREATE POLICY "gate_events_tenant_insert" ON "gate_events"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for cctv_cameras INSERT
CREATE POLICY "cctv_cameras_tenant_insert" ON "cctv_cameras"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for cctv_snapshots INSERT
CREATE POLICY "cctv_snapshots_tenant_insert" ON "cctv_snapshots"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for patrol_routes INSERT
CREATE POLICY "patrol_routes_tenant_insert" ON "patrol_routes"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for patrol_sessions INSERT
CREATE POLICY "patrol_sessions_tenant_insert" ON "patrol_sessions"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for alarm_devices INSERT
CREATE POLICY "alarm_devices_tenant_insert" ON "alarm_devices"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for alarm_events INSERT
CREATE POLICY "alarm_events_tenant_insert" ON "alarm_events"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for automation_rules INSERT
CREATE POLICY "automation_rules_tenant_insert" ON "automation_rules"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for automation_executions INSERT
CREATE POLICY "automation_executions_tenant_insert" ON "automation_executions"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for homes INSERT
CREATE POLICY "homes_tenant_insert" ON "homes"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for door_sensor_configs INSERT
CREATE POLICY "door_sensor_configs_tenant_insert" ON "door_sensor_configs"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for door_installation_requests INSERT
CREATE POLICY "door_installation_requests_tenant_insert" ON "door_installation_requests"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for emergency_contacts INSERT
CREATE POLICY "emergency_contacts_tenant_insert" ON "emergency_contacts"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for invitation_tokens INSERT
CREATE POLICY "invitation_tokens_tenant_insert" ON "invitation_tokens"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ============================================================
-- STEP 4: Create tenant isolation policies - UPDATE
-- ============================================================

-- Policy for tenants UPDATE
CREATE POLICY "tenants_tenant_update" ON "tenants"
  FOR UPDATE
  TO PUBLIC
  USING (id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for org_units UPDATE
CREATE POLICY "org_units_tenant_update" ON "org_units"
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for memberships UPDATE
CREATE POLICY "memberships_tenant_update" ON "memberships"
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for households UPDATE
CREATE POLICY "households_tenant_update" ON "households"
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for residents UPDATE
CREATE POLICY "residents_tenant_update" ON "residents"
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for financial_transactions UPDATE
CREATE POLICY "financial_transactions_tenant_update" ON "financial_transactions"
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for announcements UPDATE
CREATE POLICY "announcements_tenant_update" ON "announcements"
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for votes UPDATE
CREATE POLICY "votes_tenant_update" ON "votes"
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for emergency_alerts UPDATE
CREATE POLICY "emergency_alerts_tenant_update" ON "emergency_alerts"
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for iot_devices UPDATE
CREATE POLICY "iot_devices_tenant_update" ON "iot_devices"
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for iuran_statuses UPDATE
CREATE POLICY "iuran_statuses_tenant_update" ON "iuran_statuses"
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for device_events UPDATE
CREATE POLICY "device_events_tenant_update" ON "device_events"
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for patrol_schedules UPDATE
CREATE POLICY "patrol_schedules_tenant_update" ON "patrol_schedules"
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for incident_reports UPDATE
CREATE POLICY "incident_reports_tenant_update" ON "incident_reports"
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for letter_requests UPDATE
CREATE POLICY "letter_requests_tenant_update" ON "letter_requests"
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for community_events UPDATE
CREATE POLICY "community_events_tenant_update" ON "community_events"
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for visitor_logs UPDATE
CREATE POLICY "visitor_logs_tenant_update" ON "visitor_logs"
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for package_logs UPDATE
CREATE POLICY "package_logs_tenant_update" ON "package_logs"
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for invoices UPDATE
CREATE POLICY "invoices_tenant_update" ON "invoices"
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for feature_flag_overrides UPDATE
CREATE POLICY "feature_flag_overrides_tenant_update" ON "feature_flag_overrides"
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for notifications UPDATE
CREATE POLICY "notifications_tenant_update" ON "notifications"
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for audit_logs UPDATE (Immutable - only SELECT/INSERT should be allowed typically)
CREATE POLICY "audit_logs_tenant_update" ON "audit_logs"
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for push_subscriptions UPDATE
CREATE POLICY "push_subscriptions_tenant_update" ON "push_subscriptions"
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for incidents UPDATE
CREATE POLICY "incidents_tenant_update" ON "incidents"
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for gates UPDATE
CREATE POLICY "gates_tenant_update" ON "gates"
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for gate_events UPDATE
CREATE POLICY "gate_events_tenant_update" ON "gate_events"
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for cctv_cameras UPDATE
CREATE POLICY "cctv_cameras_tenant_update" ON "cctv_cameras"
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for cctv_snapshots UPDATE
CREATE POLICY "cctv_snapshots_tenant_update" ON "cctv_snapshots"
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for patrol_routes UPDATE
CREATE POLICY "patrol_routes_tenant_update" ON "patrol_routes"
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for patrol_sessions UPDATE
CREATE POLICY "patrol_sessions_tenant_update" ON "patrol_sessions"
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for alarm_devices UPDATE
CREATE POLICY "alarm_devices_tenant_update" ON "alarm_devices"
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for alarm_events UPDATE
CREATE POLICY "alarm_events_tenant_update" ON "alarm_events"
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for automation_rules UPDATE
CREATE POLICY "automation_rules_tenant_update" ON "automation_rules"
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for automation_executions UPDATE
CREATE POLICY "automation_executions_tenant_update" ON "automation_executions"
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for homes UPDATE
CREATE POLICY "homes_tenant_update" ON "homes"
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for door_sensor_configs UPDATE
CREATE POLICY "door_sensor_configs_tenant_update" ON "door_sensor_configs"
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for door_installation_requests UPDATE
CREATE POLICY "door_installation_requests_tenant_update" ON "door_installation_requests"
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for emergency_contacts UPDATE
CREATE POLICY "emergency_contacts_tenant_update" ON "emergency_contacts"
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for invitation_tokens UPDATE
CREATE POLICY "invitation_tokens_tenant_update" ON "invitation_tokens"
  FOR UPDATE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ============================================================
-- STEP 5: Create tenant isolation policies - DELETE
-- ============================================================

-- Policy for tenants DELETE
CREATE POLICY "tenants_tenant_delete" ON "tenants"
  FOR DELETE
  TO PUBLIC
  USING (id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for org_units DELETE
CREATE POLICY "org_units_tenant_delete" ON "org_units"
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for memberships DELETE
CREATE POLICY "memberships_tenant_delete" ON "memberships"
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for households DELETE
CREATE POLICY "households_tenant_delete" ON "households"
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for residents DELETE
CREATE POLICY "residents_tenant_delete" ON "residents"
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for financial_transactions DELETE
CREATE POLICY "financial_transactions_tenant_delete" ON "financial_transactions"
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for announcements DELETE
CREATE POLICY "announcements_tenant_delete" ON "announcements"
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for votes DELETE
CREATE POLICY "votes_tenant_delete" ON "votes"
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for emergency_alerts DELETE
CREATE POLICY "emergency_alerts_tenant_delete" ON "emergency_alerts"
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for iot_devices DELETE
CREATE POLICY "iot_devices_tenant_delete" ON "iot_devices"
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for iuran_statuses DELETE
CREATE POLICY "iuran_statuses_tenant_delete" ON "iuran_statuses"
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for device_events DELETE
CREATE POLICY "device_events_tenant_delete" ON "device_events"
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for patrol_schedules DELETE
CREATE POLICY "patrol_schedules_tenant_delete" ON "patrol_schedules"
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for incident_reports DELETE
CREATE POLICY "incident_reports_tenant_delete" ON "incident_reports"
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for letter_requests DELETE
CREATE POLICY "letter_requests_tenant_delete" ON "letter_requests"
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for community_events DELETE
CREATE POLICY "community_events_tenant_delete" ON "community_events"
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for visitor_logs DELETE
CREATE POLICY "visitor_logs_tenant_delete" ON "visitor_logs"
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for package_logs DELETE
CREATE POLICY "package_logs_tenant_delete" ON "package_logs"
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for invoices DELETE
CREATE POLICY "invoices_tenant_delete" ON "invoices"
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for feature_flag_overrides DELETE
CREATE POLICY "feature_flag_overrides_tenant_delete" ON "feature_flag_overrides"
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for notifications DELETE
CREATE POLICY "notifications_tenant_delete" ON "notifications"
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for audit_logs DELETE (Immutable - should not be deleted, but policy for completeness)
CREATE POLICY "audit_logs_tenant_delete" ON "audit_logs"
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for push_subscriptions DELETE
CREATE POLICY "push_subscriptions_tenant_delete" ON "push_subscriptions"
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for incidents DELETE
CREATE POLICY "incidents_tenant_delete" ON "incidents"
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for gates DELETE
CREATE POLICY "gates_tenant_delete" ON "gates"
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for gate_events DELETE
CREATE POLICY "gate_events_tenant_delete" ON "gate_events"
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for cctv_cameras DELETE
CREATE POLICY "cctv_cameras_tenant_delete" ON "cctv_cameras"
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for cctv_snapshots DELETE
CREATE POLICY "cctv_snapshots_tenant_delete" ON "cctv_snapshots"
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for patrol_routes DELETE
CREATE POLICY "patrol_routes_tenant_delete" ON "patrol_routes"
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for patrol_sessions DELETE
CREATE POLICY "patrol_sessions_tenant_delete" ON "patrol_sessions"
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for alarm_devices DELETE
CREATE POLICY "alarm_devices_tenant_delete" ON "alarm_devices"
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for alarm_events DELETE
CREATE POLICY "alarm_events_tenant_delete" ON "alarm_events"
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for automation_rules DELETE
CREATE POLICY "automation_rules_tenant_delete" ON "automation_rules"
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for automation_executions DELETE
CREATE POLICY "automation_executions_tenant_delete" ON "automation_executions"
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for homes DELETE
CREATE POLICY "homes_tenant_delete" ON "homes"
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for door_sensor_configs DELETE
CREATE POLICY "door_sensor_configs_tenant_delete" ON "door_sensor_configs"
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for door_installation_requests DELETE
CREATE POLICY "door_installation_requests_tenant_delete" ON "door_installation_requests"
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for emergency_contacts DELETE
CREATE POLICY "emergency_contacts_tenant_delete" ON "emergency_contacts"
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy for invitation_tokens DELETE
CREATE POLICY "invitation_tokens_tenant_delete" ON "invitation_tokens"
  FOR DELETE
  TO PUBLIC
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

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
-- STEP 6: Verification queries
-- ============================================================
-- Run these to verify RLS is properly enabled after migration

-- Verify all tables have RLS enabled:
-- SELECT c.relname AS table_name,
--        c.relrowsecurity AS rls_enabled,
--        c.relforcerowsecurity AS rls_forced,
--        array_agg(DISTINCT p.polname) FILTER (WHERE p.polname IS NOT NULL) AS policies
-- FROM pg_class c
-- LEFT JOIN pg_policy p ON p.polrelid = c.oid
-- WHERE c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
--   AND c.relkind = 'r'
--   AND c.relrowsecurity = true
-- GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
-- ORDER BY c.relname;

-- Verify no RLS on excluded tables:
-- SELECT c.relname AS table_name,
--        c.relrowsecurity AS rls_enabled
-- FROM pg_class c
-- WHERE c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
--   AND c.relkind = 'r'
--   AND c.relname IN ('users', 'subscription_plans', 'feature_flags')
-- ORDER BY c.relname;

-- ============================================================
-- COMMIT: Atomic migration complete
-- ============================================================
COMMIT;
