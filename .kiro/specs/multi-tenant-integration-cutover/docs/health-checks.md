# Health Check Commands — Rollback Verification

This document provides health check commands to verify system health after a rollback operation. Use these commands to confirm that the rollback was successful and the system is operational.

**Reference:** Requirement 14.4 — Document commands to verify rollback success

---

## Table of Contents

1. [Quick Health Check Summary](#quick-health-check-summary)
2. [Auth System Health Checks](#auth-system-health-checks)
3. [RLS State Health Checks](#rls-state-health-checks)
4. [API Endpoint Health Checks](#api-endpoint-health-checks)
5. [Feature Flag Health Checks](#feature-flag-health-checks)
6. [Automated Health Check Script](#automated-health-check-script)
7. [Expected Outputs Reference](#expected-outputs-reference)

---

## Quick Health Check Summary

Run all critical health checks in sequence:

```bash
# 1. Run automated post-rollback health check
npx tsx scripts/rls/post-rollback-health-check.ts

# 2. Verify auth endpoints respond
curl -s http://localhost:3000/api/health | jq .

# 3. Check feature flags state
curl -s http://localhost:3000/api/feature-flags/cutover-status | jq .

# 4. Run database connectivity check
npx tsx -e "import pg from 'pg'; const p = new pg.Pool({connectionString: process.env.DATABASE_URL}); p.query('SELECT 1').then(() => {console.log('✅ DB OK'); p.end()}).catch(e => {console.log('❌ DB FAIL:', e.message); process.exit(1)})"
```

**Expected Result:** All commands exit with code 0 and show healthy/OK status.

---

## Auth System Health Checks

### 1. Verify Login Endpoint Responds

```bash
# Test login endpoint availability (should return 401 for no credentials)
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/auth/login

# Expected: 401 (Unauthorized - endpoint is responding)
```

**✅ Healthy Output:**
```
401
```

**❌ Unhealthy Output:**
```
000    # Connection refused
502    # Bad Gateway
503    # Service Unavailable
```

### 2. Test Login Flow with Valid Credentials

```bash
# Attempt login with test credentials
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "testpassword"}' \
  | jq '.code, .message'

# For valid credentials, expect: token in response
# For invalid credentials, expect: AUTH_INVALID_CREDENTIALS
```

**✅ Healthy Output (valid credentials):**
```json
{
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "...",
    "expiresIn": 3600
  }
}
```

**✅ Healthy Output (invalid credentials - endpoint working):**
```json
{
  "code": "AUTH_INVALID_CREDENTIALS",
  "message": "Invalid email or password"
}
```

**❌ Unhealthy Output:**
```json
{
  "code": "COMMON_UNEXPECTED_ERROR",
  "message": "Internal server error"
}
```

### 3. Test Logout Endpoint

```bash
# Test logout endpoint with a valid token
TOKEN="your-access-token-here"
curl -s -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  | jq .

# Expected: 200 OK or appropriate auth error
```

**✅ Healthy Output:**
```json
{
  "message": "Logged out successfully"
}
```

### 4. Verify Legacy Auth Context Resolution

After rollback to legacy auth, verify `resolveAuthContext()` works:

```bash
# Make authenticated request to a protected endpoint
TOKEN="your-access-token-here"
curl -s http://localhost:3000/api/residents \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.data | length'

# Expected: Returns data count (not an auth error)
```

**✅ Healthy Output:**
```
42    # Number of residents returned (data access working)
```

**❌ Unhealthy Output:**
```json
{
  "code": "AUTH_UNAUTHORIZED",
  "message": "Authorization context resolution failed"
}
```

---

## RLS State Health Checks

### 1. Verify RLS is Disabled on Tenant Tables

```bash
# Run the post-rollback health check script
npx tsx scripts/rls/post-rollback-health-check.ts --verbose
```

**✅ Healthy Output:**
```
═══════════════════════════════════════════════════════════════════════
  POST-ROLLBACK HEALTH CHECK REPORT
═══════════════════════════════════════════════════════════════════════

  Overall Status: ✅ HEALTHY
  RLS Disabled: ✅ Yes
  System Operational: ✅ Yes

  ✅ RLS Policies Removed [CRITICAL]
     All 42 tenant tables have RLS disabled
```

**❌ Unhealthy Output:**
```
  Overall Status: ❌ UNHEALTHY
  RLS Disabled: ❌ No

  ❌ RLS Policies Removed [CRITICAL]
     3 tenant tables still have RLS enabled
     Details: {"tablesWithRls": [{"table": "residents", ...}]}
```

### 2. Direct Database Query for RLS Status

```bash
# Connect to database and check RLS status
npx tsx -e "
import pg from 'pg';
const pool = new pg.Pool({connectionString: process.env.DATABASE_URL});
pool.query(\`
  SELECT relname, relrowsecurity, relforcerowsecurity,
    (SELECT COUNT(*) FROM pg_policy WHERE polrelid = c.oid) as policy_count
  FROM pg_class c
  WHERE c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    AND c.relkind = 'r'
    AND c.relrowsecurity = true
  ORDER BY relname;
\`).then(r => {
  if (r.rows.length === 0) {
    console.log('✅ No tables have RLS enabled');
  } else {
    console.log('❌ Tables with RLS still enabled:');
    console.table(r.rows);
    process.exit(1);
  }
  pool.end();
});
"
```

**✅ Healthy Output:**
```
✅ No tables have RLS enabled
```

**❌ Unhealthy Output:**
```
❌ Tables with RLS still enabled:
┌─────────┬──────────────────────┬────────────────────┬───────────────────────┬──────────────┐
│ (index) │       relname        │  relrowsecurity    │ relforcerowsecurity   │ policy_count │
├─────────┼──────────────────────┼────────────────────┼───────────────────────┼──────────────┤
│    0    │     'residents'      │        true        │         true          │      4       │
│    1    │     'tenants'        │        true        │         true          │      4       │
└─────────┴──────────────────────┴────────────────────┴───────────────────────┴──────────────┘
```

### 3. Verify Session Variable Operations

```bash
# Test that session variables still work (for future RLS re-enable)
npx tsx -e "
import pg from 'pg';
const pool = new pg.Pool({connectionString: process.env.DATABASE_URL});
pool.query('BEGIN').then(() =>
  pool.query(\`SET LOCAL \"app.current_tenant_id\" = '00000000-0000-0000-0000-000000000000'\`)
).then(() =>
  pool.query(\`SELECT current_setting('app.current_tenant_id', true) AS tenant_id\`)
).then(r => {
  const tenantId = r.rows[0]?.tenant_id;
  if (tenantId === '00000000-0000-0000-0000-000000000000') {
    console.log('✅ Session variables work correctly');
  } else {
    console.log('❌ Session variable mismatch:', tenantId);
    process.exit(1);
  }
}).finally(() => pool.query('ROLLBACK').then(() => pool.end()));
"
```

**✅ Healthy Output:**
```
✅ Session variables work correctly
```

### 4. Verify Cross-Tenant Access Works (RLS Disabled)

After RLS rollback, queries should NOT be filtered by tenant:

```bash
# This query should return ALL tenants (not filtered)
npx tsx -e "
import pg from 'pg';
const pool = new pg.Pool({connectionString: process.env.DATABASE_URL});
pool.query('SELECT COUNT(*)::int as count FROM tenants').then(r => {
  const count = r.rows[0]?.count ?? 0;
  console.log(\`✅ Cross-tenant access confirmed: \${count} tenants visible\`);
  pool.end();
}).catch(e => {
  console.log('❌ Query failed:', e.message);
  process.exit(1);
});
"
```

**✅ Healthy Output:**
```
✅ Cross-tenant access confirmed: 15 tenants visible
```

---

## API Endpoint Health Checks

### 1. Verify Health Endpoint

```bash
curl -s http://localhost:3000/api/health | jq .
```

**✅ Healthy Output:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "database": "connected",
  "version": "1.0.0"
}
```

**❌ Unhealthy Output:**
```json
{
  "status": "error",
  "database": "disconnected",
  "error": "Connection refused"
}
```

### 2. Verify Protected Endpoints with Token

```bash
# Test a protected endpoint (residents)
TOKEN="your-access-token-here"

curl -s -o /dev/null -w "%{http_code}" \
  http://localhost:3000/api/residents \
  -H "Authorization: Bearer $TOKEN"

# Expected: 200 (with valid token) or 401 (with invalid/no token)
```

**✅ Healthy Output (valid token):**
```
200
```

**✅ Healthy Output (invalid token - endpoint responding):**
```
401
```

**❌ Unhealthy Output:**
```
500    # Internal server error
502    # Bad Gateway
000    # Connection refused
```

### 3. Verify Emergency (Safety-Critical) Endpoints

Emergency endpoints should work even without full auth context:

```bash
TOKEN="your-access-token-here"

# Test emergency status endpoint
curl -s http://localhost:3000/api/emergency/status \
  -H "Authorization: Bearer $TOKEN" \
  | jq .status

# Expected: Returns status (not an error)
```

**✅ Healthy Output:**
```json
{
  "status": "active",
  "activeAlerts": 0
}
```

### 4. API Response Time Check

```bash
# Measure response time for critical endpoints
for endpoint in "/api/health" "/api/residents" "/api/auth/login"; do
  time=$(curl -s -o /dev/null -w "%{time_total}" "http://localhost:3000$endpoint")
  echo "$endpoint: ${time}s"
done

# Expected: All responses < 2s
```

**✅ Healthy Output:**
```
/api/health: 0.023s
/api/residents: 0.156s
/api/auth/login: 0.089s
```

**❌ Unhealthy Output:**
```
/api/health: 5.234s    # Timeout
/api/residents: 10.000s  # Very slow
```

---

## Feature Flag Health Checks

### 1. Verify Cutover Flags are Disabled

```bash
# Check cutover flag status via API (if available)
curl -s http://localhost:3000/api/feature-flags/cutover-status | jq .

# Or check directly in the application logs
grep "cutover.*enabled" /var/log/societ-rt/app.log | tail -5
```

**✅ Healthy Output (Rollback Complete):**
```json
{
  "auth.cutover.enabled": false,
  "auth.cutover.domain.residents": false,
  "auth.cutover.domain.finance": false,
  "status": "legacy_auth_active"
}
```

**❌ Unhealthy Output (Rollback Incomplete):**
```json
{
  "auth.cutover.enabled": true,
  "status": "new_auth_active"
}
```

### 2. Verify Shadow Mode Disabled

```bash
# Check shadow mode status
curl -s http://localhost:3000/api/feature-flags/shadow-mode | jq .enabled

# Expected: false (shadow mode disabled after rollback)
```

**✅ Healthy Output:**
```
false
```

### 3. Check Feature Flag Audit Log

```bash
# View recent flag changes to confirm rollback
curl -s http://localhost:3000/api/audit/feature-flags?limit=10 | jq '.entries[] | {timestamp, flagName, newValue, reason}'
```

**✅ Healthy Output (shows rollback entries):**
```json
{
  "timestamp": "2024-01-15T10:25:00.000Z",
  "flagName": "auth.cutover.enabled",
  "newValue": false,
  "reason": "ROLLBACK: Authorization errors detected"
}
```

### 4. Programmatic Flag State Check

```bash
npx tsx -e "
// Check cutover flags directly
const flags = {
  'auth.cutover.enabled': false,  // Expected after rollback
};

console.log('Feature Flag State Check:');
Object.entries(flags).forEach(([flag, expected]) => {
  const actual = process.env[\`FEATURE_\${flag.replace(/\\./g, '_').toUpperCase()}\`] === 'true';
  const status = actual === expected ? '✅' : '❌';
  console.log(\`  \${status} \${flag}: \${actual} (expected: \${expected})\`);
});
"
```

---

## Automated Health Check Script

Run the comprehensive health check script:

```bash
# Full health check with verbose output
npx tsx scripts/rls/post-rollback-health-check.ts --verbose

# JSON output for automation/monitoring
npx tsx scripts/rls/post-rollback-health-check.ts --json

# Quick check (default)
npx tsx scripts/rls/post-rollback-health-check.ts
```

### Script Exit Codes

| Exit Code | Meaning | Action Required |
|-----------|---------|-----------------|
| 0 | All health checks passed | None - system healthy |
| 1 | One or more checks failed | Review failed checks |
| 2 | Script execution error | Check database connection |

### Health Check Components

The automated script checks:

1. **Database Connectivity** — Verifies PostgreSQL is responsive
2. **RLS Policies Removed** — Confirms RLS disabled on tenant tables
3. **Basic Read Operation** — Tests SELECT without RLS context
4. **Basic Write Operation** — Tests INSERT/UPDATE/DELETE
5. **Transaction Support** — Verifies BEGIN/COMMIT/ROLLBACK
6. **Connection Pool Health** — Tests concurrent connections
7. **Session Variable Operations** — Verifies SET LOCAL works

---

## Expected Outputs Reference

### Healthy System After Rollback

```
═══════════════════════════════════════════════════════════════════════
  POST-ROLLBACK HEALTH CHECK REPORT
═══════════════════════════════════════════════════════════════════════

  Overall Status: ✅ HEALTHY
  Timestamp: 2024-01-15T10:30:00.000Z
  Duration: 234ms

  Checks: 7/7 passed
  RLS Disabled: ✅ Yes
  System Operational: ✅ Yes

──────────────────────────────────────────────────────────────────────
  INDIVIDUAL CHECKS
──────────────────────────────────────────────────────────────────────

  ✅ Database Connectivity [CRITICAL]
     Database connection successful
     Duration: 12ms

  ✅ RLS Policies Removed [CRITICAL]
     All 42 tenant tables have RLS disabled
     Duration: 45ms

  ✅ Basic Read Operation [CRITICAL]
     Read operation successful (tenants count: 15)
     Duration: 18ms

  ✅ Basic Write Operation [CRITICAL]
     CRUD operations work correctly
     Duration: 23ms

  ✅ Transaction Support [WARNING]
     Transaction operations work correctly
     Duration: 15ms

  ✅ Connection Pool Health [WARNING]
     Connection pool healthy (3 concurrent connections successful)
     Duration: 98ms

  ✅ Session Variable Operations [INFO]
     Session variable SET/GET works correctly
     Duration: 23ms

──────────────────────────────────────────────────────────────────────
  ✅ SYSTEM HEALTHY AFTER ROLLBACK

  All critical health checks passed. The system is operational
  and RLS has been successfully disabled.

  This satisfies Requirement 14.6: Verify system operational after rollback.
═══════════════════════════════════════════════════════════════════════
```

### Unhealthy System (Requires Attention)

```
═══════════════════════════════════════════════════════════════════════
  POST-ROLLBACK HEALTH CHECK REPORT
═══════════════════════════════════════════════════════════════════════

  Overall Status: ❌ UNHEALTHY
  Timestamp: 2024-01-15T10:30:00.000Z
  Duration: 456ms

  Checks: 5/7 passed
  RLS Disabled: ❌ No
  System Operational: ❌ No

──────────────────────────────────────────────────────────────────────
  INDIVIDUAL CHECKS
──────────────────────────────────────────────────────────────────────

  ✅ Database Connectivity [CRITICAL]
     Database connection successful
     Duration: 12ms

  ❌ RLS Policies Removed [CRITICAL]
     3 tenant tables still have RLS enabled
     Duration: 45ms
     Details: {"tablesWithRls": ["residents", "tenants", "memberships"]}

  ❌ Basic Read Operation [CRITICAL]
     Read operation failed: permission denied for table residents
     Duration: 18ms

  ...

──────────────────────────────────────────────────────────────────────
  ❌ SYSTEM UNHEALTHY

  Critical health checks failed. The system may not be fully
  operational. Review the failures above and take action.

  RECOMMENDED: Contact DBA and review database state manually.
═══════════════════════════════════════════════════════════════════════
```

---

## Troubleshooting Failed Health Checks

### RLS Policies Not Removed

If RLS policies remain after rollback:

```bash
# Manually disable RLS on remaining tables
npx tsx scripts/rls/rollback-rls.ts --force

# Or manually via psql
psql $DATABASE_URL -c "
  ALTER TABLE residents DISABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS residents_tenant_select ON residents;
  DROP POLICY IF EXISTS residents_tenant_insert ON residents;
  DROP POLICY IF EXISTS residents_tenant_update ON residents;
  DROP POLICY IF EXISTS residents_tenant_delete ON residents;
"
```

### Database Connection Failed

```bash
# Check database is running
docker ps | grep postgres

# Check connection string
echo $DATABASE_URL

# Test direct connection
psql $DATABASE_URL -c "SELECT 1"
```

### Feature Flags Not Rolled Back

```bash
# Force flag rollback via API
curl -X POST http://localhost:3000/api/feature-flags/rollback \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"reason": "Manual rollback verification"}'

# Or set via environment
export FEATURE_AUTH_CUTOVER_ENABLED=false
# Restart application
```

---

## See Also

- [Rollback Procedure](./rollback-procedure.md) — Full rollback steps
- [RLS Migration](../../../docs/runbooks/rls-staging-migration.md) — RLS migration guide
- **Requirement 14** — Rollback Procedure Documentation
- **Design Section 7** — RLS Database Migration
