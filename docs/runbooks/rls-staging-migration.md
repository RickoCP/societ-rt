# RLS Staging Migration Runbook

## Overview

This runbook documents the process for executing PostgreSQL Row-Level Security (RLS) migration on the staging environment. RLS provides database-level tenant isolation as part of the Multi-Tenant SaaS Architecture.

**Critical Information:**
- RLS migration is **atomic** — all policies are applied or none are
- Automatic rollback occurs on failure, but **rollback failure requires manual intervention**
- This runbook is for **staging environment only**
- Production deployment uses CI/CD pipeline with additional gates

---

## Pre-Migration Checklist

Before executing the RLS migration, verify all items:

### Environment Validation

- [ ] `DATABASE_URL` points to **staging** database (not production)
- [ ] Database URL contains staging indicator (`staging`, `stg`, `uat`, `test`)
- [ ] PostgreSQL version is 10+ (verify with `SELECT version()`)
- [ ] Database user has `SUPERUSER` or sufficient privileges for `ALTER TABLE`
- [ ] No active long-running transactions on affected tables

### Backup Verification

- [ ] Full database backup taken within last 24 hours
- [ ] Backup restoration process verified and documented
- [ ] Point-in-time recovery (PITR) enabled if available

### Team Coordination

- [ ] Notify #staging-deployments Slack channel
- [ ] Confirm no other migrations running
- [ ] On-call DBA aware of migration window
- [ ] Expected downtime window communicated (typically 5-15 minutes)

### Pre-Flight Tests

- [ ] Application health check passing
- [ ] No pending schema migrations in queue
- [ ] RLS migration dry-run executed successfully
- [ ] Cross-tenant test suite prepared for post-migration validation

---

## Migration Execution

### Step 1: Dry Run (Required)

Always execute a dry run first to preview the migration:

```bash
# Set environment
export DATABASE_URL="postgresql://user:pass@staging-host:5432/societ_rt_staging"
export NODE_ENV=staging

# Execute dry run
npx tsx scripts/rls/execute-staging-migration.ts --dry-run
```

**Expected Output:**
```
============================================================
RLS STAGING MIGRATION — DRY RUN
============================================================
Correlation ID: abc12345-xxxx-xxxx-xxxx-xxxxxxxxxxxx
Environment:    staging
...
✅ STATUS: SUCCESS
Duration: XXms
Migration Status: success
Affected Tables: 38
Policy Count: 152
Message: Dry run completed. Would affect 38 tables.
```

**Verify:**
- [ ] Affected tables count matches expected (38+ tables)
- [ ] Policy count matches expected (4 operations × table count)
- [ ] No errors in output

### Step 2: Execute Migration

Once dry run succeeds, execute the actual migration:

```bash
# Execute RLS enable migration
npx tsx scripts/rls/execute-staging-migration.ts --verbose
```

**Monitor for:**
- Progress messages for each table
- Any warnings or errors
- Total execution time (expected: < 30 seconds for empty tables)

### Step 3: Verify Migration

Immediately verify the migration state:

```bash
npx tsx scripts/rls/execute-staging-migration.ts --verify
```

**Expected Output:**
```
✅ STATUS: SUCCESS
Verification:
  Valid: ✅ YES
  Enabled Tables: 38
  Missing RLS Tables: 0
  Unexpected RLS Tables: 0
```

### Step 4: Post-Migration Validation

Run cross-tenant security tests:

```bash
# Run cross-tenant isolation tests
npm run test:rls-isolation

# Or run specific test
npx vitest run __tests__/integration/rls-cross-tenant.test.ts
```

---

## Expected Outputs

### Successful Migration

```
============================================================
RLS STAGING MIGRATION — ENABLE
============================================================
Correlation ID: a1b2c3d4-xxxx-xxxx-xxxx-xxxxxxxxxxxx
Environment:    staging
Timestamp:      2024-XX-XXTXX:XX:XX.XXXZ
Mode:           ENABLE
============================================================

🔌 Database connection established

✅ Connected to: PostgreSQL 15.X

🚀 Executing RLS ENABLE migration...

  → Starting RLS enablement for 38 tables...
  → Executing atomic RLS migration within transaction...
  → RLS migration completed successfully.

🔍 Verifying migration result...

------------------------------------------------------------
MIGRATION RESULT
------------------------------------------------------------
✅ STATUS: SUCCESS
Duration: 2847ms
Migration Status: success
Affected Tables: 38
Policy Count: 152
Message: Successfully enabled RLS on 38 tables with 152 policies.

Verification:
  Valid: ✅ YES
  Enabled Tables: 38
  Missing RLS Tables: 0
  Unexpected RLS Tables: 0
------------------------------------------------------------
```

### Rolled Back Migration

If migration fails, automatic rollback occurs:

```
❌ STATUS: FAILED (but rolled back)
Migration Status: rolled_back
Message: Migration failed and was rolled back successfully.
Error:
  Code: RLS_MIGRATION_FAILED
  Message: [original error message]
```

**Action Required:** Investigate error, fix issue, and retry.

### Rollback Failure (CRITICAL)

If both migration AND rollback fail:

```
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
CRITICAL: ROLLBACK FAILED
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

The RLS migration failed and automatic rollback also failed.
The database may be in an INCONSISTENT state.

REQUIRED ACTIONS:
1. HALT all deployments immediately
2. Alert database administrators
3. Manual intervention required to restore database state
4. Do NOT retry migration until database is verified
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
```

**IMMEDIATE ACTIONS:**
1. **DO NOT** retry the migration
2. Page on-call DBA immediately
3. Follow [Critical Failure Recovery](#critical-failure-recovery) section

---

## Troubleshooting

### Common Issues

#### Error: `BLOCKED: DATABASE_URL appears to be a production database`

**Cause:** Script detected production indicators in DATABASE_URL.

**Solution:** Verify you're targeting the correct staging database URL.

#### Error: `relation "xxx" does not exist`

**Cause:** Schema mismatch — migration SQL references tables not in database.

**Solution:**
1. Run pending Prisma migrations first: `npx prisma migrate deploy`
2. Verify schema is up to date

#### Error: `permission denied for table xxx`

**Cause:** Database user lacks sufficient privileges.

**Solution:**
1. Connect as superuser
2. Grant privileges: `GRANT ALL ON ALL TABLES IN SCHEMA public TO migration_user;`

#### Error: `current transaction is aborted`

**Cause:** Previous query in same transaction failed.

**Solution:** Migration runs in atomic transaction — this indicates partial failure. Check logs for root cause.

#### Slow Migration (> 5 minutes)

**Cause:** Large tables, table locks, or long-running transactions.

**Solution:**
1. Check for blocking transactions: `SELECT * FROM pg_stat_activity WHERE state = 'active';`
2. Consider scheduling during low-traffic window
3. For very large tables, consider batched approach (consult DBA)

---

## Rollback Procedure

**Important:** The rollback procedure MUST complete within **15 minutes**. This is validated by `validate-rollback-procedure.ts` and is a hard requirement per Requirement 14.3.

### Rollback Validation (Pre-Production Gate)

Before production cutover, the rollback procedure MUST be validated on staging:

```bash
# Validate rollback procedure (executes rollback and times it)
npx tsx scripts/rls/validate-rollback-procedure.ts

# Dry run to preview without executing
npx tsx scripts/rls/validate-rollback-procedure.ts --dry-run

# Verify current RLS state only (no rollback)
npx tsx scripts/rls/validate-rollback-procedure.ts --verify-only
```

**Expected Output for Successful Validation:**
```
═══════════════════════════════════════════════════════════════════════
  RLS ROLLBACK VALIDATION RESULTS
═══════════════════════════════════════════════════════════════════════

  Status: ✅ SUCCESS
  Duration: 2m 34s (154231ms)
  Duration (minutes): 2.57
  Time limit (minutes): 15
  Within time limit: ✅ Yes

  Tables processed: 38
  Policies dropped: 152
  Health check: ✅ Passed

  ✅ ROLLBACK VALIDATION PASSED

  The rollback procedure completed successfully within the
  required 15 minute time limit.

  This staging validation satisfies Requirement 14.3 and 14.6.
```

### Rollback Validation Acceptance Criteria

| Criteria | Target | Validation Method |
|----------|--------|-------------------|
| Completion Time | < 15 minutes | Automated timing in script |
| Tables Processed | All tenant tables (38+) | Script counts affected tables |
| Health Check | All critical checks pass | `post-rollback-health-check.ts` |
| RLS Disabled | No policies remain | Query `pg_policy` system catalog |

**Staging rollback validation is a HARD GATE** for production cutover. If validation fails:
1. Do NOT proceed to production
2. Investigate and resolve the issue
3. Re-run validation until it passes

### Post-Rollback Health Check

After any rollback (validation or emergency), run the health check:

```bash
# Full health check with details
npx tsx scripts/rls/post-rollback-health-check.ts --verbose

# JSON output for automation/CI
npx tsx scripts/rls/post-rollback-health-check.ts --json
```

**Health Check Verifies:**
1. ✅ Database connectivity
2. ✅ RLS policies removed from all tenant tables
3. ✅ Basic read operations work without RLS context
4. ✅ Basic write operations (INSERT/UPDATE/DELETE) work
5. ✅ Transaction support functional
6. ✅ Connection pool health
7. ✅ Session variable operations (for future re-enable)

### Standard Rollback

If you need to disable RLS policies (e.g., issues discovered after migration):

```bash
# Execute rollback
npx tsx scripts/rls/execute-staging-migration.ts --rollback

# Verify rollback
npx tsx scripts/rls/execute-staging-migration.ts --verify

# Run post-rollback health check
npx tsx scripts/rls/post-rollback-health-check.ts
```

**Expected verification after rollback:**
```
Verification:
  Valid: ✅ YES (no expected RLS)
  Enabled Tables: 0
  Missing RLS Tables: 38 (expected after rollback)
```

### Manual Rollback

If script is unavailable, execute SQL directly:

```sql
-- Load rollback SQL
\i src/infrastructure/rls/migrations/disable_rls.sql
```

Or execute from file:

```bash
psql $DATABASE_URL -f src/infrastructure/rls/migrations/disable_rls.sql
```

### Emergency Rollback Procedure

In case of emergency requiring immediate rollback:

**Step 1: Execute Rollback**
```bash
# Fastest method - direct execution
npx tsx scripts/rls/execute-staging-migration.ts --rollback
```

**Step 2: Verify Rollback**
```bash
# Verify RLS is disabled
npx tsx scripts/rls/post-rollback-health-check.ts
```

**Step 3: Notify Team**
- Post in #staging-deployments with correlation ID
- Page on-call if in production

**Expected Timing:**
| Phase | Expected Duration | Max Duration |
|-------|-------------------|--------------|
| Execute rollback | 2-5 minutes | 10 minutes |
| Health check | 30 seconds | 2 minutes |
| Total | 3-6 minutes | 15 minutes |

### What If Rollback Fails?

If rollback fails or exceeds the 15-minute limit:

1. **DO NOT retry immediately** — Assess the situation first
2. **Check database state:**
   ```sql
   -- Which tables still have RLS?
   SELECT relname, relrowsecurity 
   FROM pg_class 
   WHERE relnamespace = 'public'::regnamespace 
     AND relrowsecurity = true;
   ```
3. **Try manual policy removal** for stuck tables:
   ```sql
   -- Drop all policies on a specific table
   DROP POLICY IF EXISTS "tablename_tenant_select" ON "tablename";
   DROP POLICY IF EXISTS "tablename_tenant_insert" ON "tablename";
   DROP POLICY IF EXISTS "tablename_tenant_update" ON "tablename";
   DROP POLICY IF EXISTS "tablename_tenant_delete" ON "tablename";
   ALTER TABLE "tablename" DISABLE ROW LEVEL SECURITY;
   ```
4. **Page on-call DBA** if manual intervention doesn't resolve
5. **Follow Critical Failure Recovery** section below

---

## Critical Failure Recovery

**This section applies when automatic rollback fails.**

### Immediate Actions

1. **Stop all deployments** — Notify via Slack/PagerDuty
2. **Page on-call DBA** — This requires manual database intervention
3. **Document the failure** — Capture correlation ID, error messages, timestamp

### Assessment Queries

Connect to database and assess state:

```sql
-- Check which tables have RLS enabled
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM pg_class c
WHERE c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  AND c.relkind = 'r'
ORDER BY c.relname;

-- Check existing policies
SELECT p.polname AS policy_name, 
       c.relname AS table_name,
       p.polcmd AS command
FROM pg_policy p
JOIN pg_class c ON p.polrelid = c.oid
WHERE c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
ORDER BY c.relname, p.polname;
```

### Manual Recovery

Based on assessment, DBA should:

1. **If partial RLS applied:** Execute `disable_rls.sql` to restore clean state
2. **If policy conflicts exist:** Drop individual policies manually
3. **If schema corrupted:** Restore from backup

### Post-Recovery

After DBA confirms database is restored:

1. Verify application health
2. Run smoke tests
3. Document incident in post-mortem
4. Schedule root cause analysis

---

## Monitoring & Alerting

### Key Metrics to Watch

After migration, monitor:

1. **Query latency** — Expect < 20% increase with RLS
2. **Error rate** — Should remain stable
3. **Database CPU** — May increase slightly during initial queries

### Alert Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| Query latency p99 | +30% baseline | +50% baseline |
| Error rate | > 0.1% | > 1% |
| Database CPU | > 70% | > 90% |

---

## Contacts

| Role | Contact | When to Contact |
|------|---------|-----------------|
| On-call DBA | #dba-oncall | Rollback failure, performance issues |
| Platform Lead | @platform-lead | Any blocking issue |
| Security | @security-team | Cross-tenant access detected |

---

## Appendix

### Files Reference

| File | Purpose |
|------|---------|
| `scripts/rls/execute-staging-migration.ts` | Migration execution script |
| `scripts/rls/validate-rollback-procedure.ts` | Rollback validation (times & verifies) |
| `scripts/rls/post-rollback-health-check.ts` | Post-rollback health verification |
| `src/infrastructure/rls/migrations/enable_rls.sql` | Enable RLS SQL |
| `src/infrastructure/rls/migrations/disable_rls.sql` | Disable RLS SQL (rollback) |
| `src/infrastructure/rls/RlsMigrationService.ts` | Migration service implementation |

### Command Reference

```bash
# ==========================================
# MIGRATION COMMANDS
# ==========================================

# Dry run (safe preview)
npx tsx scripts/rls/execute-staging-migration.ts --dry-run

# Execute migration
npx tsx scripts/rls/execute-staging-migration.ts

# Verify state
npx tsx scripts/rls/execute-staging-migration.ts --verify

# Rollback
npx tsx scripts/rls/execute-staging-migration.ts --rollback

# Verbose mode
npx tsx scripts/rls/execute-staging-migration.ts --verbose

# ==========================================
# ROLLBACK VALIDATION COMMANDS
# ==========================================

# Validate rollback procedure (executes and times)
npx tsx scripts/rls/validate-rollback-procedure.ts

# Rollback dry run (preview only)
npx tsx scripts/rls/validate-rollback-procedure.ts --dry-run

# Verify current RLS state (no rollback)
npx tsx scripts/rls/validate-rollback-procedure.ts --verify-only

# ==========================================
# HEALTH CHECK COMMANDS
# ==========================================

# Run post-rollback health check
npx tsx scripts/rls/post-rollback-health-check.ts

# Verbose output with details
npx tsx scripts/rls/post-rollback-health-check.ts --verbose

# JSON output for CI/automation
npx tsx scripts/rls/post-rollback-health-check.ts --json
```

### Related Documentation

- [Multi-Tenant Architecture Design](/.kiro/specs/multi-tenant-saas-architecture/design.md)
- [RLS Integration Cutover](/.kiro/specs/multi-tenant-integration-cutover/)
- [TableClassificationRegistry](/../src/infrastructure/rls/TableClassificationRegistry.ts)

---

*Last Updated: Task 16.3 — RLS Rollback Validation*
*Version: 1.1.0*
*Added: Rollback validation scripts, post-rollback health checks, timing requirements*
