# RLS Rollback Procedure

> **Document Purpose:** Operational runbook for disabling PostgreSQL Row-Level Security (RLS) policies at database level.
>
> **Target Rollback Time:** < 15 minutes
>
> **Last Updated:** Auto-generated from spec requirements
>
> **Requirement Reference:** Requirement 14.2, 14.3 from `requirements.md`

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [When to Execute RLS Rollback](#when-to-execute-rls-rollback)
4. [Rollback Procedure](#rollback-procedure)
   - [Option A: Automated Script (Recommended)](#option-a-automated-script-recommended)
   - [Option B: Manual SQL Execution](#option-b-manual-sql-execution)
5. [SQL Commands Reference](#sql-commands-reference)
6. [Post-Rollback Verification](#post-rollback-verification)
7. [Health Check Commands](#health-check-commands)
8. [Failure Handling (HALT Procedure)](#failure-handling-halt-procedure)
9. [Escalation Contacts](#escalation-contacts)
10. [Rollback Decision Criteria](#rollback-decision-criteria)

---

## Overview

This document describes how to disable PostgreSQL Row-Level Security (RLS) policies on all tenant-scoped tables in the SocieT-RT database. RLS rollback removes database-layer tenant isolation, reverting to application-layer authorization only.

### What RLS Rollback Does

1. **Drops all RLS policies** (SELECT, INSERT, UPDATE, DELETE) on tenant-scoped tables
2. **Disables RLS** on 39 tenant-owned tables
3. **Executes atomically** within a single transaction (all-or-nothing)

### Tables Affected (39 Total)

| Core Tables | Security Tables | IoT/Device Tables | Other Tables |
|-------------|-----------------|-------------------|--------------|
| `tenants` | `incidents` | `iot_devices` | `announcements` |
| `org_units` | `incident_reports` | `device_events` | `votes` |
| `memberships` | `gates` | `alarm_devices` | `invoices` |
| `households` | `gate_events` | `alarm_events` | `notifications` |
| `residents` | `patrol_routes` | `door_sensor_configs` | `audit_logs` |
| `financial_transactions` | `patrol_sessions` | `door_installation_requests` | `push_subscriptions` |
| `emergency_alerts` | `patrol_schedules` | `automation_rules` | `feature_flag_overrides` |
| `emergency_contacts` | `visitor_logs` | `automation_executions` | `invitation_tokens` |
| `homes` | `package_logs` | `cctv_cameras` | |
| `iuran_statuses` | `letter_requests` | `cctv_snapshots` | |
| `community_events` | | | |

### Tables NOT Affected (RLS Exempt)

- `users` - GLOBAL_IDENTITY (user exists across tenants)
- `subscription_plans` - PLATFORM_SHARED
- `feature_flags` - PLATFORM_SHARED

---

## Prerequisites

Before executing RLS rollback:

- [ ] **Database Access:** DBA or superuser credentials with ALTER TABLE permissions
- [ ] **Connection String:** Valid `DATABASE_URL` environment variable
- [ ] **Backup:** Confirm recent database backup exists
- [ ] **Notification:** Alert on-call team that rollback is starting
- [ ] **Monitoring:** Have database monitoring dashboard open

### Required Tools

```bash
# Verify psql is available
psql --version

# Or use Node.js script
npx tsx --version
```

---

## When to Execute RLS Rollback

Execute RLS rollback when ANY of the following occur:

| Trigger | Description |
|---------|-------------|
| **Performance Degradation** | RLS query overhead exceeds 50% latency increase |
| **Cross-Tenant Data Leak** | Any confirmed cross-tenant data exposure |
| **Application Errors** | Widespread 500 errors from RLS context failures |
| **Security Incident** | RLS policies blocking legitimate access |
| **Migration Failure** | RLS enable migration failed partially |

### DO NOT Rollback For

- Normal elevated latency during initial RLS activation (< 20% increase is expected)
- Isolated single-user authorization issues (investigate root cause first)
- Non-critical background job failures

---

## Rollback Procedure

### Estimated Timing

| Phase | Duration |
|-------|----------|
| Pre-checks | 1-2 minutes |
| SQL Execution | 2-5 minutes |
| Verification | 2-3 minutes |
| Health Checks | 2-3 minutes |
| **Total** | **< 15 minutes** |

---

### Option A: Automated Script (Recommended)

The automated validation script executes the rollback and performs all verification:

```bash
# Navigate to project root
cd /path/to/SocieT-RT

# Set database connection
export DATABASE_URL="postgresql://user:password@host:5432/database"

# Execute rollback with validation
npx tsx scripts/rls/validate-rollback-procedure.ts
```

#### Script Options

```bash
# Dry run - preview what would happen without making changes
npx tsx scripts/rls/validate-rollback-procedure.ts --dry-run

# Verify only - check current RLS state without rollback
npx tsx scripts/rls/validate-rollback-procedure.ts --verify-only
```

#### Expected Output (Success)

```
═══════════════════════════════════════════════════════════════════════════
  RLS ROLLBACK VALIDATION RESULTS
═══════════════════════════════════════════════════════════════════════════

  Status: ✅ SUCCESS
  Duration: 3m 42s (222000ms)
  Duration (minutes): 3.70
  Time limit (minutes): 15
  Within time limit: ✅ Yes

  Tables processed: 39
  Policies dropped: 156

  Health check: ✅ Passed

  ✅ ROLLBACK VALIDATION PASSED
```

---

### Option B: Manual SQL Execution

If the automated script is unavailable, execute the SQL directly:

#### Step 1: Connect to Database

```bash
# Using psql
psql $DATABASE_URL

# Or with explicit parameters
psql -h hostname -U username -d database_name
```

#### Step 2: Execute Rollback SQL

The complete rollback SQL is located at:
```
src/infrastructure/rls/migrations/disable_rls.sql
```

Execute the file:

```bash
# From psql
\i src/infrastructure/rls/migrations/disable_rls.sql

# Or from command line
psql $DATABASE_URL -f src/infrastructure/rls/migrations/disable_rls.sql
```

#### Step 3: Verify Success

```sql
-- Check no RLS-enabled tables remain
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled
FROM pg_class c
WHERE c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  AND c.relkind = 'r'
  AND c.relrowsecurity = true;

-- Expected: Empty result (no rows)
```

---

## SQL Commands Reference

### Quick Reference: Disable RLS on All Tables

```sql
-- Execute within transaction for atomicity
BEGIN;

-- Disable RLS on all tenant tables
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

COMMIT;
```

### Single Table Rollback (Emergency)

If you need to rollback a single table:

```sql
-- Drop policies for specific table
DROP POLICY IF EXISTS "tablename_tenant_select" ON "tablename";
DROP POLICY IF EXISTS "tablename_tenant_insert" ON "tablename";
DROP POLICY IF EXISTS "tablename_tenant_update" ON "tablename";
DROP POLICY IF EXISTS "tablename_tenant_delete" ON "tablename";

-- Disable RLS
ALTER TABLE "tablename" DISABLE ROW LEVEL SECURITY;
```

---

## Post-Rollback Verification

### Verification Checklist

After rollback completes, verify:

- [ ] **No RLS-enabled tables remain**
- [ ] **No RLS policies remain**
- [ ] **Database is responsive**
- [ ] **Basic CRUD operations work**
- [ ] **Application health checks pass**

### Verification SQL Queries

```sql
-- 1. Verify no tables have RLS enabled
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM pg_class c
WHERE c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  AND c.relkind = 'r'
  AND c.relrowsecurity = true
ORDER BY c.relname;

-- Expected: Empty result set (0 rows)

-- 2. Verify no RLS policies remain
SELECT p.polname AS policy_name,
       c.relname AS table_name,
       p.polcmd AS operation
FROM pg_policy p
JOIN pg_class c ON p.polrelid = c.oid
WHERE c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
ORDER BY c.relname, p.polname;

-- Expected: Empty result set (0 rows)

-- 3. Verify database is responsive
SELECT 1 AS ping;
-- Expected: Returns 1

-- 4. Test basic read operation
SELECT COUNT(*) FROM tenants;
-- Expected: Returns count (any number)

-- 5. Verify transactions work
BEGIN;
SELECT 1;
ROLLBACK;
-- Expected: No error
```

---

## Health Check Commands

### Automated Health Check

```bash
# Run post-rollback health check script
npx tsx scripts/rls/post-rollback-health-check.ts
```

### Manual Health Check Endpoints

```bash
# Application health endpoint
curl -f http://localhost:3000/api/health

# Database-specific health
curl -f http://localhost:3000/api/health/db
```

### Health Check Success Criteria

| Check | Expected Result |
|-------|-----------------|
| Database connectivity | Response < 100ms |
| No RLS policies | 0 policies found |
| No RLS-enabled tables | 0 tables with RLS |
| Transaction support | BEGIN/ROLLBACK works |
| Basic CRUD | SELECT on core tables works |

---

## Failure Handling (HALT Procedure)

### If Rollback Fails

Per **Requirement 8.7**: If automatic rollback does not succeed, the system SHALL:

1. **HALT** deployment immediately
2. **ALERT** administrators with critical severity
3. **FLAG** database as in inconsistent state requiring manual intervention

### HALT Procedure Steps

```
┌─────────────────────────────────────────────────────────────────┐
│  🚨 RLS ROLLBACK FAILED - HALT PROCEDURE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. DO NOT attempt automatic retry                              │
│                                                                 │
│  2. IMMEDIATELY notify:                                         │
│     - Database Administrator (DBA)                              │
│     - Engineering Lead                                          │
│     - Security Lead                                             │
│                                                                 │
│  3. PRESERVE the current database state:                        │
│     - Do not make additional changes                            │
│     - Capture error messages and logs                           │
│     - Document which statements succeeded/failed                │
│                                                                 │
│  4. CREATE incident ticket with:                                │
│     - Timestamp of failure                                      │
│     - Error message                                             │
│     - Current RLS state (partial rollback status)               │
│     - Steps attempted                                           │
│                                                                 │
│  5. AWAIT manual DBA intervention                               │
│                                                                 │
│  ⚠️  Human intervention is MANDATORY - NO automatic retry      │
└─────────────────────────────────────────────────────────────────┘
```

### Capturing Failure State

If rollback fails, capture current state:

```sql
-- Check which tables still have RLS enabled
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       count(p.polname) AS policy_count
FROM pg_class c
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  AND c.relkind = 'r'
  AND c.relname IN (
    'tenants', 'org_units', 'memberships', 'households', 'residents',
    'financial_transactions', 'announcements', 'votes', 'emergency_alerts',
    'iot_devices'
  )
GROUP BY c.relname, c.relrowsecurity
ORDER BY c.relname;
```

---

## Escalation Contacts

### On-Call Escalation Matrix

| Level | Contact | When to Escalate |
|-------|---------|------------------|
| **L1** | On-call Engineer | First line, any rollback attempt |
| **L2** | Database Administrator | Rollback failure, manual intervention needed |
| **L3** | Engineering Lead | Decision to halt production, incident declaration |
| **L4** | Security Lead | Cross-tenant data exposure suspected |

### Contact Methods

1. **PagerDuty:** Trigger incident via PagerDuty
2. **Slack:** #incident-response channel
3. **Phone:** Emergency contact list (see internal wiki)

### Alert Message Template

```
🚨 RLS ROLLBACK ALERT

Environment: [STAGING/PRODUCTION]
Time: [ISO 8601 timestamp]
Status: [IN_PROGRESS/FAILED/COMPLETED]

Action Required: [NONE/MONITOR/IMMEDIATE_INTERVENTION]

Details:
- Rollback Duration: [X minutes]
- Tables Processed: [N/39]
- Policies Dropped: [N/156]
- Error (if any): [error message]

Operator: [username]
Correlation ID: [correlation-id]
```

---

## Rollback Decision Criteria

### When to Rollback (Decision Tree)

```
                    ┌────────────────────────┐
                    │ Issue Detected         │
                    └───────────┬────────────┘
                                │
                    ┌───────────▼────────────┐
                    │ Is it RLS-related?     │
                    └───────────┬────────────┘
                         Yes    │    No
                    ┌───────────▼────────────┐
                    │ Investigate further     │
                    └─────────────────────────┘
                                │
                    ┌───────────▼────────────┐
                    │ Data leak confirmed?    │──Yes──► IMMEDIATE ROLLBACK
                    └───────────┬────────────┘
                         No     │
                    ┌───────────▼────────────┐
                    │ Performance > 50%      │──Yes──► ROLLBACK after monitoring
                    │ degradation?           │
                    └───────────┬────────────┘
                         No     │
                    ┌───────────▼────────────┐
                    │ Wide-spread app errors?│──Yes──► ROLLBACK if > 5% error rate
                    └───────────┬────────────┘
                         No     │
                    ┌───────────▼────────────┐
                    │ Isolated issue?        │──Yes──► Investigate, don't rollback
                    └─────────────────────────┘
```

### Rollback Authority

| Environment | Approval Required |
|-------------|-------------------|
| Development | Any developer |
| Staging | Engineering Lead or DBA |
| Production | Engineering Lead AND Security Lead |

---

## Post-Rollback Actions

After successful rollback:

1. **Document the incident** - Create post-mortem ticket
2. **Notify stakeholders** - Send update to #engineering channel
3. **Monitor application** - Watch error rates for 30 minutes
4. **Plan re-enablement** - Schedule RLS re-activation after root cause fix

### Application Impact After Rollback

| Impact | Description |
|--------|-------------|
| **Tenant Isolation** | Relies on application-layer authorization only |
| **Performance** | Query latency returns to pre-RLS baseline |
| **Security Posture** | Database-layer defense removed |

---

## Related Documentation

- [RLS Enable Migration](../../../src/infrastructure/rls/migrations/enable_rls.sql)
- [RLS Disable Migration](../../../src/infrastructure/rls/migrations/disable_rls.sql)
- [Rollback Validation Script](../../../scripts/rls/validate-rollback-procedure.ts)
- [Cross-Tenant Security Tests](../../../scripts/rls/cross-tenant-security-tests.ts)
- [Main Rollback Procedure](./rollback-procedure.md)
- [Requirements Document](../requirements.md) - Requirement 14

---

## Revision History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| Auto | 1.0.0 | Kiro | Initial documentation from Task 24.2 |
