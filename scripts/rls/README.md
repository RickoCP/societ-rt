# RLS Security Test Scripts

This folder contains scripts for testing Row-Level Security (RLS) enforcement on the SocieT-RT database.

## Scripts

### `cross-tenant-security-tests.ts`

Comprehensive cross-tenant security test suite that validates RLS enforcement on staging/production databases.

**Purpose:**
- Tests that cross-tenant READ operations are blocked (return zero rows)
- Tests that cross-tenant INSERT operations are blocked (constraint violation)
- Tests that cross-tenant UPDATE operations are blocked (zero rows affected)
- Tests that cross-tenant DELETE operations are blocked (zero rows affected)
- Tests complex query scenarios (JOINs, subqueries, aggregations)

**Requirements Validated:**
- Requirement 11.1: Cross-tenant READ blocked
- Requirement 11.2: Cross-tenant INSERT blocked
- Requirement 11.3: Cross-tenant DELETE blocked
- Requirement 11.4: All TENANT_OWNED tables tested
- Requirement 11.5: Empty result verification (not just filtered)
- Requirement 11.7: Complex query isolation

**Usage:**
```bash
# Set DATABASE_URL in .env or export
export DATABASE_URL="postgresql://user:pass@localhost:5432/societ_staging"

# Run tests
npx tsx scripts/rls/cross-tenant-security-tests.ts

# Verbose mode
VERBOSE=true npx tsx scripts/rls/cross-tenant-security-tests.ts

# Skip cleanup on failure (for debugging)
SKIP_CLEANUP=true npx tsx scripts/rls/cross-tenant-security-tests.ts

# CI mode with JSON output
CI_OUTPUT_JSON=true npx tsx scripts/rls/cross-tenant-security-tests.ts
```

**Exit Codes:**
- `0` - All cross-tenant access properly blocked (tests pass)
- `1` - Cross-tenant access detected (SECURITY ISSUE)
- `2` - Error during execution

**What the Tests Do:**

1. **Setup Phase:**
   - Creates two test tenants (Tenant A and Tenant B)
   - Creates test data for Tenant A in all RLS-protected tables

2. **Test Phase:**
   - Authenticates as Tenant B (sets RLS context to Tenant B)
   - Attempts to access Tenant A's data
   - Verifies that all access attempts are blocked

3. **Cleanup Phase:**
   - Deletes all test data created during the test
   - Can be skipped with `SKIP_CLEANUP=true` for debugging

### `test-utils.ts`

Shared utilities for RLS testing including:
- UUID generation and validation
- RLS context management (`setTenantContext`, `clearTenantContext`)
- Transaction-scoped test execution
- Test tenant setup/cleanup helpers
- RLS verification helpers

## Tables Tested

The test suite covers all TENANT_OWNED and ORG_SCOPED tables that have direct tenant_id columns:

- `tenants` (uses `id` instead of `tenant_id`)
- `org_units`
- `memberships`
- `households`
- `residents`
- `financial_transactions`
- `announcements`
- `votes`
- `emergency_alerts`
- `iot_devices`
- `iuran_statuses`
- `device_events`
- `patrol_schedules`
- `incident_reports`
- `letter_requests`
- `community_events`
- `visitor_logs`
- `package_logs`
- `invoices`
- `feature_flag_overrides`
- `notifications`
- `audit_logs`
- `push_subscriptions`
- `incidents`
- `gates`
- `gate_events`
- `cctv_cameras`
- `cctv_snapshots`
- `patrol_routes`
- `patrol_sessions`
- `alarm_devices`
- `alarm_events`
- `automation_rules`
- `automation_executions`
- `homes`
- `door_sensor_configs`
- `door_installation_requests`
- `emergency_contacts`
- `invitation_tokens`

## Tables NOT Tested (Excluded)

Per the architecture design, these tables do NOT have RLS:

- `users` - GLOBAL_IDENTITY (user exists across tenants)
- `subscription_plans` - PLATFORM_SHARED (read-all for authenticated users)
- `feature_flags` - PLATFORM_SHARED (read-all for authenticated users)

## CI/CD Integration

The script is designed for CI/CD pipeline integration:

```yaml
# Example GitHub Actions workflow
- name: Run RLS Security Tests
  env:
    DATABASE_URL: ${{ secrets.STAGING_DATABASE_URL }}
    CI_OUTPUT_JSON: 'true'
  run: npx tsx scripts/rls/cross-tenant-security-tests.ts
```

## Interpreting Results

### Success Output
```
═══════════════════════════════════════════════════════════════════════════════
  CROSS-TENANT SECURITY TEST RESULTS
═══════════════════════════════════════════════════════════════════════════════

  Status: ✅ ALL TESTS PASSED
  Total Tests: 150
  Passed: 150
  Failed: 0
```

### Failure Output
```
═══════════════════════════════════════════════════════════════════════════════
  CROSS-TENANT SECURITY TEST RESULTS
═══════════════════════════════════════════════════════════════════════════════

  Status: ❌ SECURITY ISSUES DETECTED
  Total Tests: 150
  Passed: 148
  Failed: 2

────────────────────────────────────────────────────────────────────────────────
  ❌ FAILED TESTS (SECURITY ISSUES):
────────────────────────────────────────────────────────────────────────────────

  Table: residents
  Operation: READ
  Details: SECURITY ISSUE: 5 rows returned when accessing Tenant A data as Tenant B
  Query: SELECT * FROM "residents" WHERE tenant_id = $1
  Result Set: [...]
```

## Troubleshooting

### Common Issues

1. **DATABASE_URL not set**
   ```
   ERROR: DATABASE_URL environment variable is required
   ```
   Solution: Set the DATABASE_URL environment variable

2. **RLS not enabled on table**
   ```
   SECURITY ISSUE: X rows returned when accessing Tenant A data as Tenant B
   ```
   Solution: Ensure RLS migration has been run on the database

3. **Connection refused**
   ```
   Error: connect ECONNREFUSED
   ```
   Solution: Verify the database is running and accessible

4. **Permission denied**
   ```
   Error: permission denied for table xxx
   ```
   Solution: Ensure the database user has appropriate permissions

## Related Documentation

- [RLS Migration](../../src/infrastructure/rls/migrations/enable_rls.sql)
- [Table Classification Registry](../../src/infrastructure/rls/TableClassificationRegistry.ts)
- [RLS Session Context](../../src/infrastructure/rls/RlsSessionContext.ts)
- [Requirements Document](../../.kiro/specs/multi-tenant-integration-cutover/requirements.md)
- [Design Document](../../.kiro/specs/multi-tenant-integration-cutover/design.md)
