-- ============================================================
-- Multi-Tenant RLS Policy Migration (DISABLE / ROLLBACK)
-- FASE 2.7 Task 15: RLS Database Migration
-- ============================================================
--
-- This migration DISABLES PostgreSQL Row-Level Security (RLS) on all
-- TENANT_OWNED and ORG_SCOPED tables as a rollback mechanism.
--
-- ⚠️  WARNING: Executing this migration will DISABLE tenant isolation
--     at the database layer. Only use for rollback scenarios!
--
-- @see Requirement 8: RLS Database Migration Creation
-- @see Requirements: 8.6 (Create rollback migration script)
-- @see Design Section 7: RLS Database Migration
-- ============================================================

-- ============================================================
-- STEP 0: Transaction block for atomic rollback
-- ============================================================
-- This rollback MUST be executed within a transaction to ensure
-- atomicity. If any statement fails, all changes are rolled back.

BEGIN;

-- ============================================================
-- STEP 1: Drop all SELECT policies
-- ============================================================

DROP POLICY IF EXISTS "tenants_tenant_select" ON "tenants";
DROP POLICY IF EXISTS "org_units_tenant_select" ON "org_units";
DROP POLICY IF EXISTS "memberships_tenant_select" ON "memberships";
DROP POLICY IF EXISTS "households_tenant_select" ON "households";
DROP POLICY IF EXISTS "residents_tenant_select" ON "residents";
DROP POLICY IF EXISTS "financial_transactions_tenant_select" ON "financial_transactions";
DROP POLICY IF EXISTS "announcements_tenant_select" ON "announcements";
DROP POLICY IF EXISTS "votes_tenant_select" ON "votes";
DROP POLICY IF EXISTS "emergency_alerts_tenant_select" ON "emergency_alerts";
DROP POLICY IF EXISTS "iot_devices_tenant_select" ON "iot_devices";
DROP POLICY IF EXISTS "iuran_statuses_tenant_select" ON "iuran_statuses";
DROP POLICY IF EXISTS "device_events_tenant_select" ON "device_events";
DROP POLICY IF EXISTS "patrol_schedules_tenant_select" ON "patrol_schedules";
DROP POLICY IF EXISTS "incident_reports_tenant_select" ON "incident_reports";
DROP POLICY IF EXISTS "letter_requests_tenant_select" ON "letter_requests";
DROP POLICY IF EXISTS "community_events_tenant_select" ON "community_events";
DROP POLICY IF EXISTS "visitor_logs_tenant_select" ON "visitor_logs";
DROP POLICY IF EXISTS "package_logs_tenant_select" ON "package_logs";
DROP POLICY IF EXISTS "invoices_tenant_select" ON "invoices";
DROP POLICY IF EXISTS "feature_flag_overrides_tenant_select" ON "feature_flag_overrides";
DROP POLICY IF EXISTS "notifications_tenant_select" ON "notifications";
DROP POLICY IF EXISTS "audit_logs_tenant_select" ON "audit_logs";
DROP POLICY IF EXISTS "push_subscriptions_tenant_select" ON "push_subscriptions";
DROP POLICY IF EXISTS "incidents_tenant_select" ON "incidents";
DROP POLICY IF EXISTS "gates_tenant_select" ON "gates";
DROP POLICY IF EXISTS "gate_events_tenant_select" ON "gate_events";
DROP POLICY IF EXISTS "cctv_cameras_tenant_select" ON "cctv_cameras";
DROP POLICY IF EXISTS "cctv_snapshots_tenant_select" ON "cctv_snapshots";
DROP POLICY IF EXISTS "patrol_routes_tenant_select" ON "patrol_routes";
DROP POLICY IF EXISTS "patrol_sessions_tenant_select" ON "patrol_sessions";
DROP POLICY IF EXISTS "alarm_devices_tenant_select" ON "alarm_devices";
DROP POLICY IF EXISTS "alarm_events_tenant_select" ON "alarm_events";
DROP POLICY IF EXISTS "automation_rules_tenant_select" ON "automation_rules";
DROP POLICY IF EXISTS "automation_executions_tenant_select" ON "automation_executions";
DROP POLICY IF EXISTS "homes_tenant_select" ON "homes";
DROP POLICY IF EXISTS "door_sensor_configs_tenant_select" ON "door_sensor_configs";
DROP POLICY IF EXISTS "door_installation_requests_tenant_select" ON "door_installation_requests";
DROP POLICY IF EXISTS "emergency_contacts_tenant_select" ON "emergency_contacts";
DROP POLICY IF EXISTS "invitation_tokens_tenant_select" ON "invitation_tokens";

-- ============================================================
-- STEP 2: Drop all INSERT policies
-- ============================================================

DROP POLICY IF EXISTS "tenants_tenant_insert" ON "tenants";
DROP POLICY IF EXISTS "org_units_tenant_insert" ON "org_units";
DROP POLICY IF EXISTS "memberships_tenant_insert" ON "memberships";
DROP POLICY IF EXISTS "households_tenant_insert" ON "households";
DROP POLICY IF EXISTS "residents_tenant_insert" ON "residents";
DROP POLICY IF EXISTS "financial_transactions_tenant_insert" ON "financial_transactions";
DROP POLICY IF EXISTS "announcements_tenant_insert" ON "announcements";
DROP POLICY IF EXISTS "votes_tenant_insert" ON "votes";
DROP POLICY IF EXISTS "emergency_alerts_tenant_insert" ON "emergency_alerts";
DROP POLICY IF EXISTS "iot_devices_tenant_insert" ON "iot_devices";
DROP POLICY IF EXISTS "iuran_statuses_tenant_insert" ON "iuran_statuses";
DROP POLICY IF EXISTS "device_events_tenant_insert" ON "device_events";
DROP POLICY IF EXISTS "patrol_schedules_tenant_insert" ON "patrol_schedules";
DROP POLICY IF EXISTS "incident_reports_tenant_insert" ON "incident_reports";
DROP POLICY IF EXISTS "letter_requests_tenant_insert" ON "letter_requests";
DROP POLICY IF EXISTS "community_events_tenant_insert" ON "community_events";
DROP POLICY IF EXISTS "visitor_logs_tenant_insert" ON "visitor_logs";
DROP POLICY IF EXISTS "package_logs_tenant_insert" ON "package_logs";
DROP POLICY IF EXISTS "invoices_tenant_insert" ON "invoices";
DROP POLICY IF EXISTS "feature_flag_overrides_tenant_insert" ON "feature_flag_overrides";
DROP POLICY IF EXISTS "notifications_tenant_insert" ON "notifications";
DROP POLICY IF EXISTS "audit_logs_tenant_insert" ON "audit_logs";
DROP POLICY IF EXISTS "push_subscriptions_tenant_insert" ON "push_subscriptions";
DROP POLICY IF EXISTS "incidents_tenant_insert" ON "incidents";
DROP POLICY IF EXISTS "gates_tenant_insert" ON "gates";
DROP POLICY IF EXISTS "gate_events_tenant_insert" ON "gate_events";
DROP POLICY IF EXISTS "cctv_cameras_tenant_insert" ON "cctv_cameras";
DROP POLICY IF EXISTS "cctv_snapshots_tenant_insert" ON "cctv_snapshots";
DROP POLICY IF EXISTS "patrol_routes_tenant_insert" ON "patrol_routes";
DROP POLICY IF EXISTS "patrol_sessions_tenant_insert" ON "patrol_sessions";
DROP POLICY IF EXISTS "alarm_devices_tenant_insert" ON "alarm_devices";
DROP POLICY IF EXISTS "alarm_events_tenant_insert" ON "alarm_events";
DROP POLICY IF EXISTS "automation_rules_tenant_insert" ON "automation_rules";
DROP POLICY IF EXISTS "automation_executions_tenant_insert" ON "automation_executions";
DROP POLICY IF EXISTS "homes_tenant_insert" ON "homes";
DROP POLICY IF EXISTS "door_sensor_configs_tenant_insert" ON "door_sensor_configs";
DROP POLICY IF EXISTS "door_installation_requests_tenant_insert" ON "door_installation_requests";
DROP POLICY IF EXISTS "emergency_contacts_tenant_insert" ON "emergency_contacts";
DROP POLICY IF EXISTS "invitation_tokens_tenant_insert" ON "invitation_tokens";

-- ============================================================
-- STEP 3: Drop all UPDATE policies
-- ============================================================

DROP POLICY IF EXISTS "tenants_tenant_update" ON "tenants";
DROP POLICY IF EXISTS "org_units_tenant_update" ON "org_units";
DROP POLICY IF EXISTS "memberships_tenant_update" ON "memberships";
DROP POLICY IF EXISTS "households_tenant_update" ON "households";
DROP POLICY IF EXISTS "residents_tenant_update" ON "residents";
DROP POLICY IF EXISTS "financial_transactions_tenant_update" ON "financial_transactions";
DROP POLICY IF EXISTS "announcements_tenant_update" ON "announcements";
DROP POLICY IF EXISTS "votes_tenant_update" ON "votes";
DROP POLICY IF EXISTS "emergency_alerts_tenant_update" ON "emergency_alerts";
DROP POLICY IF EXISTS "iot_devices_tenant_update" ON "iot_devices";
DROP POLICY IF EXISTS "iuran_statuses_tenant_update" ON "iuran_statuses";
DROP POLICY IF EXISTS "device_events_tenant_update" ON "device_events";
DROP POLICY IF EXISTS "patrol_schedules_tenant_update" ON "patrol_schedules";
DROP POLICY IF EXISTS "incident_reports_tenant_update" ON "incident_reports";
DROP POLICY IF EXISTS "letter_requests_tenant_update" ON "letter_requests";
DROP POLICY IF EXISTS "community_events_tenant_update" ON "community_events";
DROP POLICY IF EXISTS "visitor_logs_tenant_update" ON "visitor_logs";
DROP POLICY IF EXISTS "package_logs_tenant_update" ON "package_logs";
DROP POLICY IF EXISTS "invoices_tenant_update" ON "invoices";
DROP POLICY IF EXISTS "feature_flag_overrides_tenant_update" ON "feature_flag_overrides";
DROP POLICY IF EXISTS "notifications_tenant_update" ON "notifications";
DROP POLICY IF EXISTS "audit_logs_tenant_update" ON "audit_logs";
DROP POLICY IF EXISTS "push_subscriptions_tenant_update" ON "push_subscriptions";
DROP POLICY IF EXISTS "incidents_tenant_update" ON "incidents";
DROP POLICY IF EXISTS "gates_tenant_update" ON "gates";
DROP POLICY IF EXISTS "gate_events_tenant_update" ON "gate_events";
DROP POLICY IF EXISTS "cctv_cameras_tenant_update" ON "cctv_cameras";
DROP POLICY IF EXISTS "cctv_snapshots_tenant_update" ON "cctv_snapshots";
DROP POLICY IF EXISTS "patrol_routes_tenant_update" ON "patrol_routes";
DROP POLICY IF EXISTS "patrol_sessions_tenant_update" ON "patrol_sessions";
DROP POLICY IF EXISTS "alarm_devices_tenant_update" ON "alarm_devices";
DROP POLICY IF EXISTS "alarm_events_tenant_update" ON "alarm_events";
DROP POLICY IF EXISTS "automation_rules_tenant_update" ON "automation_rules";
DROP POLICY IF EXISTS "automation_executions_tenant_update" ON "automation_executions";
DROP POLICY IF EXISTS "homes_tenant_update" ON "homes";
DROP POLICY IF EXISTS "door_sensor_configs_tenant_update" ON "door_sensor_configs";
DROP POLICY IF EXISTS "door_installation_requests_tenant_update" ON "door_installation_requests";
DROP POLICY IF EXISTS "emergency_contacts_tenant_update" ON "emergency_contacts";
DROP POLICY IF EXISTS "invitation_tokens_tenant_update" ON "invitation_tokens";

-- ============================================================
-- STEP 4: Drop all DELETE policies
-- ============================================================

DROP POLICY IF EXISTS "tenants_tenant_delete" ON "tenants";
DROP POLICY IF EXISTS "org_units_tenant_delete" ON "org_units";
DROP POLICY IF EXISTS "memberships_tenant_delete" ON "memberships";
DROP POLICY IF EXISTS "households_tenant_delete" ON "households";
DROP POLICY IF EXISTS "residents_tenant_delete" ON "residents";
DROP POLICY IF EXISTS "financial_transactions_tenant_delete" ON "financial_transactions";
DROP POLICY IF EXISTS "announcements_tenant_delete" ON "announcements";
DROP POLICY IF EXISTS "votes_tenant_delete" ON "votes";
DROP POLICY IF EXISTS "emergency_alerts_tenant_delete" ON "emergency_alerts";
DROP POLICY IF EXISTS "iot_devices_tenant_delete" ON "iot_devices";
DROP POLICY IF EXISTS "iuran_statuses_tenant_delete" ON "iuran_statuses";
DROP POLICY IF EXISTS "device_events_tenant_delete" ON "device_events";
DROP POLICY IF EXISTS "patrol_schedules_tenant_delete" ON "patrol_schedules";
DROP POLICY IF EXISTS "incident_reports_tenant_delete" ON "incident_reports";
DROP POLICY IF EXISTS "letter_requests_tenant_delete" ON "letter_requests";
DROP POLICY IF EXISTS "community_events_tenant_delete" ON "community_events";
DROP POLICY IF EXISTS "visitor_logs_tenant_delete" ON "visitor_logs";
DROP POLICY IF EXISTS "package_logs_tenant_delete" ON "package_logs";
DROP POLICY IF EXISTS "invoices_tenant_delete" ON "invoices";
DROP POLICY IF EXISTS "feature_flag_overrides_tenant_delete" ON "feature_flag_overrides";
DROP POLICY IF EXISTS "notifications_tenant_delete" ON "notifications";
DROP POLICY IF EXISTS "audit_logs_tenant_delete" ON "audit_logs";
DROP POLICY IF EXISTS "push_subscriptions_tenant_delete" ON "push_subscriptions";
DROP POLICY IF EXISTS "incidents_tenant_delete" ON "incidents";
DROP POLICY IF EXISTS "gates_tenant_delete" ON "gates";
DROP POLICY IF EXISTS "gate_events_tenant_delete" ON "gate_events";
DROP POLICY IF EXISTS "cctv_cameras_tenant_delete" ON "cctv_cameras";
DROP POLICY IF EXISTS "cctv_snapshots_tenant_delete" ON "cctv_snapshots";
DROP POLICY IF EXISTS "patrol_routes_tenant_delete" ON "patrol_routes";
DROP POLICY IF EXISTS "patrol_sessions_tenant_delete" ON "patrol_sessions";
DROP POLICY IF EXISTS "alarm_devices_tenant_delete" ON "alarm_devices";
DROP POLICY IF EXISTS "alarm_events_tenant_delete" ON "alarm_events";
DROP POLICY IF EXISTS "automation_rules_tenant_delete" ON "automation_rules";
DROP POLICY IF EXISTS "automation_executions_tenant_delete" ON "automation_executions";
DROP POLICY IF EXISTS "homes_tenant_delete" ON "homes";
DROP POLICY IF EXISTS "door_sensor_configs_tenant_delete" ON "door_sensor_configs";
DROP POLICY IF EXISTS "door_installation_requests_tenant_delete" ON "door_installation_requests";
DROP POLICY IF EXISTS "emergency_contacts_tenant_delete" ON "emergency_contacts";
DROP POLICY IF EXISTS "invitation_tokens_tenant_delete" ON "invitation_tokens";

-- ============================================================
-- STEP 5: Drop legacy combined policies (if they exist from old migration)
-- ============================================================
-- These are the combined ALL policies from the original migration-rls-policies.sql
-- Drop them in case the database has the old policies

DROP POLICY IF EXISTS "tenants_tenant_isolation" ON "tenants";
DROP POLICY IF EXISTS "org_units_tenant_isolation" ON "org_units";
DROP POLICY IF EXISTS "memberships_tenant_isolation" ON "memberships";
DROP POLICY IF EXISTS "households_tenant_isolation" ON "households";
DROP POLICY IF EXISTS "residents_tenant_isolation" ON "residents";
DROP POLICY IF EXISTS "financial_transactions_tenant_isolation" ON "financial_transactions";
DROP POLICY IF EXISTS "announcements_tenant_isolation" ON "announcements";
DROP POLICY IF EXISTS "votes_tenant_isolation" ON "votes";
DROP POLICY IF EXISTS "emergency_alerts_tenant_isolation" ON "emergency_alerts";
DROP POLICY IF EXISTS "iot_devices_tenant_isolation" ON "iot_devices";
DROP POLICY IF EXISTS "iuran_statuses_tenant_isolation" ON "iuran_statuses";
DROP POLICY IF EXISTS "device_events_tenant_isolation" ON "device_events";
DROP POLICY IF EXISTS "patrol_schedules_tenant_isolation" ON "patrol_schedules";
DROP POLICY IF EXISTS "incident_reports_tenant_isolation" ON "incident_reports";
DROP POLICY IF EXISTS "letter_requests_tenant_isolation" ON "letter_requests";
DROP POLICY IF EXISTS "community_events_tenant_isolation" ON "community_events";
DROP POLICY IF EXISTS "visitor_logs_tenant_isolation" ON "visitor_logs";
DROP POLICY IF EXISTS "package_logs_tenant_isolation" ON "package_logs";
DROP POLICY IF EXISTS "invoices_tenant_isolation" ON "invoices";
DROP POLICY IF EXISTS "feature_flag_overrides_tenant_isolation" ON "feature_flag_overrides";
DROP POLICY IF EXISTS "notifications_tenant_isolation" ON "notifications";
DROP POLICY IF EXISTS "audit_logs_tenant_isolation" ON "audit_logs";
DROP POLICY IF EXISTS "push_subscriptions_tenant_isolation" ON "push_subscriptions";
DROP POLICY IF EXISTS "incidents_tenant_isolation" ON "incidents";
DROP POLICY IF EXISTS "gates_tenant_isolation" ON "gates";
DROP POLICY IF EXISTS "gate_events_tenant_isolation" ON "gate_events";
DROP POLICY IF EXISTS "cctv_cameras_tenant_isolation" ON "cctv_cameras";
DROP POLICY IF EXISTS "cctv_snapshots_tenant_isolation" ON "cctv_snapshots";
DROP POLICY IF EXISTS "patrol_routes_tenant_isolation" ON "patrol_routes";
DROP POLICY IF EXISTS "patrol_sessions_tenant_isolation" ON "patrol_sessions";
DROP POLICY IF EXISTS "alarm_devices_tenant_isolation" ON "alarm_devices";
DROP POLICY IF EXISTS "alarm_events_tenant_isolation" ON "alarm_events";
DROP POLICY IF EXISTS "automation_rules_tenant_isolation" ON "automation_rules";
DROP POLICY IF EXISTS "automation_executions_tenant_isolation" ON "automation_executions";
DROP POLICY IF EXISTS "homes_tenant_isolation" ON "homes";
DROP POLICY IF EXISTS "door_sensor_configs_tenant_isolation" ON "door_sensor_configs";
DROP POLICY IF EXISTS "door_installation_requests_tenant_isolation" ON "door_installation_requests";
DROP POLICY IF EXISTS "emergency_contacts_tenant_isolation" ON "emergency_contacts";
DROP POLICY IF EXISTS "invitation_tokens_tenant_isolation" ON "invitation_tokens";

-- ============================================================
-- STEP 6: Disable Row Level Security on all tables
-- ============================================================

ALTER TABLE "tenants" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "org_units" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "memberships" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "households" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "residents" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "financial_transactions" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "announcements" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "votes" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "emergency_alerts" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "iot_devices" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "iuran_statuses" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "device_events" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "patrol_schedules" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "incident_reports" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "letter_requests" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "community_events" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "visitor_logs" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "package_logs" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "invoices" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "feature_flag_overrides" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "push_subscriptions" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "incidents" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "gates" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "gate_events" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "cctv_cameras" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "cctv_snapshots" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "patrol_routes" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "patrol_sessions" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "alarm_devices" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "alarm_events" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "automation_rules" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "automation_executions" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "homes" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "door_sensor_configs" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "door_installation_requests" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "emergency_contacts" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "invitation_tokens" DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- STEP 7: Verification queries
-- ============================================================
-- Run these to verify RLS is properly disabled after rollback

-- Verify all tables have RLS disabled:
-- SELECT c.relname AS table_name,
--        c.relrowsecurity AS rls_enabled,
--        c.relforcerowsecurity AS rls_forced
-- FROM pg_class c
-- WHERE c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
--   AND c.relkind = 'r'
--   AND c.relname IN (
--     'tenants', 'org_units', 'memberships', 'households', 'residents',
--     'financial_transactions', 'announcements', 'votes', 'emergency_alerts',
--     'iot_devices', 'iuran_statuses', 'device_events', 'patrol_schedules',
--     'incident_reports', 'letter_requests', 'community_events', 'visitor_logs',
--     'package_logs', 'invoices', 'feature_flag_overrides', 'notifications',
--     'audit_logs', 'push_subscriptions', 'incidents', 'gates', 'gate_events',
--     'cctv_cameras', 'cctv_snapshots', 'patrol_routes', 'patrol_sessions',
--     'alarm_devices', 'alarm_events', 'automation_rules', 'automation_executions',
--     'homes', 'door_sensor_configs', 'door_installation_requests',
--     'emergency_contacts', 'invitation_tokens'
--   )
-- ORDER BY c.relname;

-- Verify no policies remain:
-- SELECT p.polname AS policy_name, c.relname AS table_name
-- FROM pg_policy p
-- JOIN pg_class c ON p.polrelid = c.oid
-- WHERE c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
-- ORDER BY c.relname, p.polname;

-- ============================================================
-- COMMIT: Atomic rollback complete
-- ============================================================
COMMIT;

-- ============================================================
-- POST-ROLLBACK NOTES
-- ============================================================
-- After executing this rollback:
-- 1. Tenant isolation is NO LONGER enforced at database level
-- 2. Application-level authorization must be relied upon for security
-- 3. Re-apply enable_rls.sql when ready to re-enable RLS
-- 4. Test thoroughly on staging before production rollback
-- ============================================================
