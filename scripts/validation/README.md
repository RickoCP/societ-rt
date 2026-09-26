# Validation Scripts

This folder contains validation scripts for the Multi-Tenant Integration Cutover migration completion validation (FASE 2.16).

## Scripts

### generate-completion-report.ts (Task 27.7)

**Master orchestrator script** that runs all validation scripts and generates a comprehensive completion report.

This script:
1. Runs all validation scripts (27.1-27.6) in sequence
2. Collects and aggregates results from each validation
3. Generates a human-readable markdown report at `.kiro/specs/multi-tenant-integration-cutover/COMPLETION_REPORT.md`
4. Generates a machine-readable JSON report at `.kiro/specs/multi-tenant-integration-cutover/completion-report.json`
5. Includes executive summary, detailed validation results, sign-off section, and legacy removal timeline

**Report Contents:**
- **Executive Summary** - Overall pass/fail status, blockers, warnings
- **Migration Status** - All 28+ directories migrated status
- **RLS Coverage** - All tables covered with policies
- **Test Results** - Integration test pass rates
- **Performance Benchmarks** - All latency targets met
- **Shadow Mode Metrics** - 0% mismatch for 7 days validation
- **Cross-Tenant Security** - All security tests passing
- **Sign-off Section** - Placeholders for Engineering, Security, QA Leads
- **Timeline for Legacy Removal** - 30 days after completion

**Usage:**

```bash
# Full validation (runs all scripts)
npx tsx scripts/validation/generate-completion-report.ts

# Quick check (skip tests and database validations)
npx tsx scripts/validation/generate-completion-report.ts --skip-tests --skip-database

# Verbose output
npx tsx scripts/validation/generate-completion-report.ts --verbose

# JSON output only
npx tsx scripts/validation/generate-completion-report.ts --json
```

**Exit Codes:**

| Code | Description |
|------|-------------|
| 0 | All validations passed (ready for cutover) |
| 1 | One or more validations failed (not ready) |
| 2 | Error during execution |

**Related Requirements:**
- **Requirement 16.8**: Generate a completion report with sign-off from Engineering Lead, Security Lead, QA Lead

---

### verify-tests-passing.ts

Runs the full test suite and validates that all tests pass. This script:

1. Executes the test suite using vitest
2. Captures test results including:
   - Total tests
   - Passed tests
   - Failed tests
   - Skipped tests
   - Test duration
3. Optionally captures coverage results
4. Generates a summary report
5. Exits with code 1 if any tests fail

**Usage:**

```bash
# Basic usage - run all tests
npx tsx scripts/validation/verify-tests-passing.ts

# With verbose output
npx tsx scripts/validation/verify-tests-passing.ts --verbose

# Include coverage analysis
npx tsx scripts/validation/verify-tests-passing.ts --coverage

# Output results as JSON
npx tsx scripts/validation/verify-tests-passing.ts --json

# Save results to a file
npx tsx scripts/validation/verify-tests-passing.ts --output results.json

# Combine options
npx tsx scripts/validation/verify-tests-passing.ts --coverage --verbose --output validation-report.json
```

**Exit Codes:**

| Code | Description |
|------|-------------|
| 0 | All tests passed (and coverage met if --coverage) |
| 1 | One or more tests failed or coverage below threshold |
| 2 | Error during execution |

**Coverage Thresholds:**

When running with `--coverage`, the script validates against these thresholds (as defined in vitest.config.ts):

- Statements: >= 80%
- Branches: >= 80%
- Functions: >= 80%
- Lines: >= 80%

---

### verify-cross-tenant-security.ts

Verifies that all cross-tenant security tests pass. This script validates:

1. **Tenant A cannot access Tenant B's data** - RLS properly isolates tenant data
2. **RLS policies block unauthorized access** - Row-Level Security enforcement
3. **Permission checks work correctly** - Authorization validation

The script runs the cross-tenant security test suite from `scripts/rls/cross-tenant-security-tests.ts` and validates the results.

**Security Tests Include:**

- Cross-tenant READ tests (SELECT) - Verifies zero rows returned
- Cross-tenant INSERT tests - Verifies constraint violations
- Cross-tenant UPDATE tests - Verifies zero rows affected
- Cross-tenant DELETE tests - Verifies zero rows affected
- JOIN query isolation tests - Complex queries properly isolated
- Subquery isolation tests
- Aggregation query isolation tests

**Usage:**

```bash
# Basic usage
npx tsx scripts/validation/verify-cross-tenant-security.ts

# With verbose output (shows all test details)
npx tsx scripts/validation/verify-cross-tenant-security.ts --verbose

# Output results as JSON
npx tsx scripts/validation/verify-cross-tenant-security.ts --json

# Save results to a file
npx tsx scripts/validation/verify-cross-tenant-security.ts --output security-results.json

# Skip cleanup on failure (for debugging)
npx tsx scripts/validation/verify-cross-tenant-security.ts --skip-cleanup
```

**Exit Codes:**

| Code | Description |
|------|-------------|
| 0 | All cross-tenant security tests passed |
| 1 | One or more security tests failed (CRITICAL - blocks deployment) |
| 2 | Error during execution |

**Environment Variables:**

| Variable | Required | Description |
|----------|----------|-------------|
| DATABASE_URL | Yes | PostgreSQL connection string |

**Related Requirements:**

- **Requirement 11.1**: Tenant B user cannot read Tenant A's data
- **Requirement 11.2**: Tenant B user cannot write to Tenant A's data
- **Requirement 11.3**: Tenant B user cannot delete Tenant A's data
- **Requirement 11.7**: Complex queries (joins, subqueries) also isolated
- **Requirement 16.7**: Verify cross-tenant access tests all passing

---

## Related Requirements

- **Requirement 16.4**: Verify all integration tests passing
- **Requirement 16.7**: Verify cross-tenant access tests all passing
- **Task 27.3**: Verify all integration tests passing (FASE 2.16)
- **Task 27.6**: Verify cross-tenant tests passing (FASE 2.16)

## Integration with CI/CD

These scripts can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
jobs:
  validate-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx tsx scripts/validation/verify-tests-passing.ts --coverage --output test-validation.json
      - uses: actions/upload-artifact@v4
        with:
          name: test-validation-report
          path: test-validation.json

  validate-security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx tsx scripts/validation/verify-cross-tenant-security.ts --json --output security-validation.json
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
      - uses: actions/upload-artifact@v4
        with:
          name: security-validation-report
          path: security-validation.json
```
