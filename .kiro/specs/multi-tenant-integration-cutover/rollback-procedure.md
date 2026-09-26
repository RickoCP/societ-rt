# Rollback Procedure — Multi-Tenant Integration Cutover

> **⚠️ EMERGENCY RUNBOOK**
> 
> This document is designed to be followed under pressure. Each section has time estimates and clear action steps. If in doubt, **execute rollback first, investigate later**.

---

## Overview and Purpose

This document provides step-by-step rollback procedures for the Multi-Tenant Integration Cutover. Use this runbook when:

- New authorization system causes errors or unexpected behavior
- Performance degradation exceeds acceptable thresholds
- Cross-tenant data access is detected
- Shadow mode validation shows critical mismatches
- Any production incident related to authorization or RLS

**Key Principles:**
- **Fail Safe** — When in doubt, rollback to legacy authorization
- **Speed Over Investigation** — Execute rollback first, investigate after system is stable
- **Document Everything** — Record correlation IDs, timestamps, and observations

**Time Targets:**
| Rollback Type | Target Time | Maximum Time |
|---------------|-------------|--------------|
| Cutover Flag Rollback | < 2 minutes | 5 minutes |
| RLS Rollback | < 10 minutes | 15 minutes |
| Full System Rollback | < 15 minutes | 20 minutes |

---

## Prerequisites

### Access Requirements

Before you can execute rollbacks, ensure you have:

- [ ] **Application access** — Shell access to application servers or CI/CD pipeline
- [ ] **Database access** — `psql` connectivity to production/staging database
- [ ] **Environment variables** — `DATABASE_URL` properly configured
- [ ] **DI Container access** — Ability to resolve `cutoverFlagResolver` service (for programmatic rollback)

### Required Credentials

| System | Access Type | Contact for Access |
|--------|-------------|-------------------|
| Application Server | SSH/kubectl | Platform Team |
| PostgreSQL Database | psql connection | DBA Team |
| Feature Flags | Admin UI or API | Platform Team |

### Pre-Rollback Checklist

- [ ] Confirm you're targeting the correct environment (staging/production)
- [ ] Note the current timestamp and correlation ID from incident
- [ ] Notify #incidents channel that rollback is starting
- [ ] Have this runbook open and ready to follow

---

## Decision Criteria: When to Rollback

### IMMEDIATE ROLLBACK (No Approval Required)

Execute rollback immediately if ANY of these conditions exist:

| Condition | Detection Method | Rollback Type |
|-----------|------------------|---------------|
| Cross-tenant data exposure | Security alert, audit log | **FULL SYSTEM** |
| Error rate > 5% on authorization endpoints | Monitoring dashboard | Cutover Flags |
| p99 latency > 500ms on auth resolution | APM metrics | Cutover Flags |
| RLS "access denied" errors in production | Error logs | RLS |
| User-reported access issues (multiple) | Support tickets | Cutover Flags |

### CONSIDERED ROLLBACK (Requires Lead Approval)

Discuss with Engineering Lead before rollback:

| Condition | Detection Method | Discussion Point |
|-----------|------------------|------------------|
| Error rate 1-5% | Monitoring | May be temporary |
| Shadow mode mismatch > 1% | Shadow metrics | Investigate cause first |
| Isolated user complaints | Support ticket | May be user-specific issue |
| Performance degradation 20-50% | APM | May be acceptable during transition |

---

## Cutover Flag Rollback Procedure

**Target Time: < 5 minutes**

The cutover flag system controls which routes use new vs. legacy authorization. Rollback is instant and requires no restart.

### Step 1: Identify Scope (30 seconds)

Determine what needs to be rolled back:

| Scenario | Flags to Rollback |
|----------|-------------------|
| All routes affected | Global flag: `auth.cutover.enabled` |
| Single domain affected | Domain flag: `auth.cutover.domain.{domain}` |
| Single route affected | Route flag: `auth.cutover.route.{routeId}` |

### Step 2: Execute Rollback via Script (1-2 minutes)

**Option A: Command Line (Recommended)**

```bash
# Rollback global cutover flag
npx tsx scripts/cutover/rollback-flags.ts --global --reason "Production incident {TICKET_ID}"

# Rollback specific domain
npx tsx scripts/cutover/rollback-flags.ts --domain residents --reason "Residents auth errors"

# Rollback specific route
npx tsx scripts/cutover/rollback-flags.ts --route residents.list --reason "List endpoint errors"
```

**Option B: Programmatic via DI (If script unavailable)**

```typescript
// In Node.js REPL or emergency script
const container = require('./src/infrastructure/di/container').default;
const flagResolver = container.resolve('cutoverFlagResolver');

await flagResolver.rollback({
  operatorId: 'oncall-engineer',
  reason: 'Production incident {TICKET_ID}',
  correlationId: '{CORRELATION_ID_FROM_INCIDENT}',
});
```

**Option C: Environment Variable Override (Last Resort)**

```bash
# Set environment variable to force legacy auth
export AUTH_CUTOVER_FORCE_LEGACY=true

# Restart application (only if flag system is broken)
pm2 restart all
# OR
kubectl rollout restart deployment/societ-rt
```

### Step 3: Verify Rollback (1 minute)

```bash
# Check current flag state
npx tsx scripts/cutover/check-flags.ts

# Expected output for successful rollback:
# Global Cutover: DISABLED
# Active Domain Flags: 0
# Active Route Flags: 0
```

**Manual Verification:**

1. Check application logs for `"Using legacy authorization"` messages
2. Verify shadow mode is active (both auth paths running)
3. Confirm error rate returning to baseline

### Step 4: Document and Notify (30 seconds)

```
@channel Cutover flag rollback executed
- Time: {TIMESTAMP}
- Operator: {YOUR_NAME}
- Reason: {BRIEF_REASON}
- Correlation ID: {CORRELATION_ID}
- Flags rolled back: {LIST_OF_FLAGS}
- Status: System stable / Monitoring
```

---

## RLS Rollback Procedure

**Target Time: < 15 minutes**

RLS rollback disables Row-Level Security policies at the database level. This is more invasive and requires database access.

### When to Rollback RLS

- Queries failing with "permission denied" or "row security policy violation"
- Database connection pool exhaustion
- Extreme query latency (> 10x baseline)
- Cross-tenant data access detected (CRITICAL — requires FULL rollback)

### Step 1: Prepare Database Connection (1 minute)

```bash
# Verify you're on the correct database
echo $DATABASE_URL | grep -E '(staging|production)'

# Test connection
psql $DATABASE_URL -c "SELECT current_database(), version();"
```

**⚠️ CRITICAL: Triple-check you're on the correct environment before proceeding!**

### Step 2: Execute RLS Rollback (2-5 minutes)

**Option A: Script Execution (Recommended)**

```bash
# Execute rollback with timing
time npx tsx scripts/rls/execute-staging-migration.ts --rollback --verbose

# For production, use production-specific script
time npx tsx scripts/rls/execute-production-rollback.ts --reason "Production incident"
```

**Option B: Direct SQL Execution**

```bash
# Execute the disable_rls.sql migration
psql $DATABASE_URL -f src/infrastructure/rls/migrations/disable_rls.sql
```

**Option C: Manual SQL (If scripts unavailable)**

Execute in `psql`:

```sql
-- Start transaction
BEGIN;

-- Drop SELECT policies
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
-- (Continue for all tables - see full list in disable_rls.sql)

-- Drop INSERT policies
DROP POLICY IF EXISTS "tenants_tenant_insert" ON "tenants";
DROP POLICY IF EXISTS "org_units_tenant_insert" ON "org_units";
-- (Continue for all tables)

-- Drop UPDATE policies
DROP POLICY IF EXISTS "tenants_tenant_update" ON "tenants";
DROP POLICY IF EXISTS "org_units_tenant_update" ON "org_units";
-- (Continue for all tables)

-- Drop DELETE policies
DROP POLICY IF EXISTS "tenants_tenant_delete" ON "tenants";
DROP POLICY IF EXISTS "org_units_tenant_delete" ON "org_units";
-- (Continue for all tables)

-- Disable RLS on all tables
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
-- (Continue for all 38+ tables)

-- Commit transaction
COMMIT;
```

### Step 3: Verify RLS Disabled (2 minutes)

**Script Verification:**

```bash
npx tsx scripts/rls/post-rollback-health-check.ts --verbose
```

**Manual Verification:**

```sql
-- Check no tables have RLS enabled
SELECT relname AS table_name, relrowsecurity AS rls_enabled
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relkind = 'r'
  AND relrowsecurity = true;

-- Expected result: 0 rows
```

### Step 4: Run Health Check (2-3 minutes)

```bash
# Full health check
npx tsx scripts/rls/post-rollback-health-check.ts

# Expected output:
# ✅ Database connectivity: OK
# ✅ RLS policies removed: YES (0 policies remaining)
# ✅ Basic read operations: OK
# ✅ Basic write operations: OK
# ✅ Transaction support: OK
# ✅ Connection pool health: OK
```

### Step 5: Document and Notify

```
@channel RLS rollback executed
- Time: {TIMESTAMP}
- Operator: {YOUR_NAME}
- Reason: {BRIEF_REASON}
- Database: {DATABASE_NAME}
- Tables affected: 38
- Policies removed: 152
- Health check: PASSED
- Status: RLS disabled, application using legacy auth
```

---

## Health Check Commands

### Quick Health Check (30 seconds)

```bash
# All-in-one health check
npx tsx scripts/health/auth-system-check.ts
```

### Individual Checks

**Authorization System Status:**

```bash
# Check if new auth is active
curl -s http://localhost:3000/api/health/auth | jq .

# Expected response:
# {
#   "status": "healthy",
#   "authMode": "legacy|shadow|cutover",
#   "cutoverFlags": { "global": false },
#   "rlsEnabled": false,
#   "shadowModeActive": true
# }
```

**Database RLS Status:**

```bash
# Check RLS state via script
npx tsx scripts/rls/execute-staging-migration.ts --verify
```

Or directly via SQL:

```sql
-- Count of tables with RLS enabled
SELECT COUNT(*) AS tables_with_rls
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relkind = 'r'
  AND relrowsecurity = true;
```

**Cutover Flag Status:**

```bash
# Check all cutover flags
npx tsx scripts/cutover/check-flags.ts --verbose
```

**Shadow Mode Metrics:**

```bash
# Get current shadow mode statistics
npx tsx scripts/shadow/get-metrics.ts

# Expected output:
# Total Requests: 50000
# Mismatch Rate: 0.001%
# False Positives: 2
# False Negatives: 0
# Observation Window: 14 days
```

**Application Error Rate:**

```bash
# Check recent error logs for auth failures
grep -E "(AUTH_|PERMISSION_|RLS_)" /var/log/societ-rt/error.log | tail -50
```

### Post-Rollback Verification Checklist

After ANY rollback, verify all items:

- [ ] Application health endpoint returns 200
- [ ] Error rate returned to baseline (< 0.1%)
- [ ] p99 latency returned to baseline
- [ ] No new AUTH_* errors in logs
- [ ] Users can access previously blocked resources
- [ ] Shadow mode is active (if applicable)
- [ ] Monitoring dashboards show green status

---

## Escalation Contacts and Criteria

### Escalation Matrix

| Severity | Criteria | First Contact | Escalation |
|----------|----------|---------------|------------|
| **P1 (Critical)** | Cross-tenant access, data breach | Security On-Call | Security Lead → CISO |
| **P2 (High)** | Service unavailable, 50%+ users affected | Platform On-Call | Platform Lead → Engineering Director |
| **P3 (Medium)** | Performance degraded, partial functionality | Platform On-Call | Platform Lead |
| **P4 (Low)** | Isolated issues, workaround available | Create ticket | Engineering Team |

### Contact Information

| Role | Primary Contact | Slack Channel | PagerDuty |
|------|-----------------|---------------|-----------|
| Platform On-Call | Rotation | #platform-oncall | `platform-oncall` |
| DBA On-Call | Rotation | #dba-oncall | `dba-oncall` |
| Security On-Call | Rotation | #security-incident | `security-oncall` |
| Platform Lead | @platform-lead | Direct Message | Direct escalation |
| Engineering Director | @eng-director | Direct Message | Via Platform Lead |

### When to Escalate

**Escalate IMMEDIATELY if:**

1. ❌ Cross-tenant data access confirmed
2. ❌ Rollback procedures failing
3. ❌ Database in inconsistent state
4. ❌ Multiple P1 errors in short window (< 5 minutes)
5. ❌ Customer-reported security concern

**Escalate within 30 minutes if:**

1. ⚠️ Rollback successful but root cause unknown
2. ⚠️ Performance not recovering after rollback
3. ⚠️ Repeated incidents (3+ in 24 hours)

### Escalation Communication Template

```
INCIDENT: Multi-Tenant Auth System Issue
Severity: P{1|2|3|4}
Time Detected: {TIMESTAMP}
Correlation ID: {CORRELATION_ID}

IMPACT:
- Users affected: {NUMBER/PERCENTAGE}
- Services affected: {LIST}
- Data integrity: {CONFIRMED_OK | INVESTIGATING | COMPROMISED}

ACTIONS TAKEN:
1. {ACTION_1} at {TIME}
2. {ACTION_2} at {TIME}

CURRENT STATUS:
- System: {STABLE | DEGRADED | DOWN}
- Rollback: {EXECUTED | IN_PROGRESS | NOT_NEEDED}

NEXT STEPS:
- {NEXT_ACTION}

REQUESTING:
- {SPECIFIC_HELP_NEEDED}
```

---

## Post-Rollback Verification Checklist

### Immediate Verification (< 5 minutes after rollback)

- [ ] **System Health**
  - [ ] Health endpoint returns 200
  - [ ] All application pods/servers running
  - [ ] No crash loops detected

- [ ] **Authorization Status**
  - [ ] Cutover flags in expected state (disabled for rollback)
  - [ ] Shadow mode active (if expected)
  - [ ] Legacy auth path operational

- [ ] **Database Status**
  - [ ] Connection pool healthy
  - [ ] No blocked transactions
  - [ ] RLS state matches expectation (enabled/disabled)

### Extended Verification (5-15 minutes after rollback)

- [ ] **Error Rates**
  - [ ] Auth error rate < 0.1%
  - [ ] 4xx response rate back to baseline
  - [ ] 5xx response rate < 0.01%

- [ ] **Performance**
  - [ ] p50 latency at baseline
  - [ ] p95 latency at baseline
  - [ ] p99 latency < 100ms for auth

- [ ] **Functionality**
  - [ ] Login working for test account
  - [ ] Permission-protected routes accessible with correct role
  - [ ] Permission-protected routes denied with incorrect role

### Documentation Requirements

After rollback is verified, document:

1. **Incident Timeline**
   - When issue detected
   - When rollback initiated
   - When rollback completed
   - When system verified stable

2. **Root Cause (if known)**
   - What triggered the issue
   - Which components were affected

3. **Impact Assessment**
   - Users affected
   - Duration of impact
   - Data integrity confirmation

4. **Action Items**
   - Preventive measures for future
   - Monitoring improvements needed
   - Code/config changes required

---

## Appendix: Command Reference

### Cutover Flag Commands

```bash
# ==========================================
# CUTOVER FLAG MANAGEMENT
# ==========================================

# Check current flag state
npx tsx scripts/cutover/check-flags.ts

# Rollback global flag
npx tsx scripts/cutover/rollback-flags.ts --global --reason "{REASON}"

# Rollback specific domain
npx tsx scripts/cutover/rollback-flags.ts --domain {DOMAIN} --reason "{REASON}"

# Rollback specific route
npx tsx scripts/cutover/rollback-flags.ts --route {ROUTE_ID} --reason "{REASON}"

# Enable cutover (with prerequisite check)
npx tsx scripts/cutover/enable-cutover.ts --global --operator {OPERATOR_ID}

# View audit log
npx tsx scripts/cutover/audit-log.ts --limit 50
```

### RLS Commands

```bash
# ==========================================
# RLS MANAGEMENT
# ==========================================

# Check current RLS state
npx tsx scripts/rls/execute-staging-migration.ts --verify

# Execute RLS rollback
npx tsx scripts/rls/execute-staging-migration.ts --rollback

# Execute RLS rollback (production)
npx tsx scripts/rls/execute-production-rollback.ts --reason "{REASON}"

# Post-rollback health check
npx tsx scripts/rls/post-rollback-health-check.ts

# Verbose health check
npx tsx scripts/rls/post-rollback-health-check.ts --verbose

# JSON output (for automation)
npx tsx scripts/rls/post-rollback-health-check.ts --json
```

### Health Check Commands

```bash
# ==========================================
# HEALTH CHECKS
# ==========================================

# Full system health check
npx tsx scripts/health/auth-system-check.ts

# Database connectivity check
npx tsx scripts/health/db-check.ts

# API health endpoint
curl -s http://localhost:3000/api/health | jq .

# Auth-specific health
curl -s http://localhost:3000/api/health/auth | jq .
```

### Shadow Mode Commands

```bash
# ==========================================
# SHADOW MODE MANAGEMENT
# ==========================================

# Get shadow mode metrics
npx tsx scripts/shadow/get-metrics.ts

# Enable shadow mode
npx tsx scripts/shadow/enable.ts --global

# Disable shadow mode
npx tsx scripts/shadow/disable.ts --global

# Check mismatch log
npx tsx scripts/shadow/get-mismatches.ts --limit 100
```

### Database Direct Commands

```sql
-- ==========================================
-- DIRECT DATABASE QUERIES
-- ==========================================

-- Check tables with RLS enabled
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relkind = 'r'
  AND relrowsecurity = true;

-- List all RLS policies
SELECT p.polname, c.relname, p.polcmd
FROM pg_policy p
JOIN pg_class c ON p.polrelid = c.oid
WHERE c.relnamespace = 'public'::regnamespace
ORDER BY c.relname, p.polname;

-- Check active connections
SELECT state, count(*)
FROM pg_stat_activity
GROUP BY state;

-- Check blocking transactions
SELECT blocked_locks.pid AS blocked_pid,
       blocked_activity.usename AS blocked_user,
       blocking_locks.pid AS blocking_pid,
       blocking_activity.usename AS blocking_user,
       blocked_activity.query AS blocked_statement,
       blocking_activity.query AS blocking_statement
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity
  ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks
  ON blocking_locks.locktype = blocked_locks.locktype
  AND blocking_locks.relation = blocked_locks.relation
  AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity
  ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;
```

---

## Document Information

| Field | Value |
|-------|-------|
| Version | 1.0.0 |
| Created | 2024-XX-XX |
| Last Updated | 2024-XX-XX |
| Owner | Platform Team |
| Review Frequency | Quarterly or after incident |

**Related Documents:**
- [Requirements 14](./requirements.md#requirement-14-rollback-procedure-documentation)
- [Design: Cutover Feature Flags](./design.md#5-cutover-feature-flags)
- [RLS Staging Migration Runbook](/docs/runbooks/rls-staging-migration.md)
- [Multi-Tenant Architecture](/specs/multi-tenant-saas-architecture/)

**Validates Requirements:**
- 14.1: Document how to disable cutover flags ✅
- 14.2: Document how to disable RLS policies ✅
- 14.3: Include estimated rollback time ✅
- 14.4: Include health check commands ✅
- 14.5: Include escalation contacts and decision criteria ✅
- 14.7: Store in `.kiro/specs/multi-tenant-integration-cutover/rollback-procedure.md` ✅
