# Deprecated Code Removal Approval Process

This document defines the manual-gated removal process for deprecated code in the SocieT-RT application, as specified in Requirement 18.7 of the Multi-Tenant Integration Cutover specification.

## Overview

**IMPORTANT:** Deprecated code removal is **NOT automatic**. After the 30-day deprecation window expires, code is flagged for review and requires explicit authorization before removal.

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Deprecation   │───▶│   30-Day Wait   │───▶│   Eligibility   │───▶│   Authorized    │
│    Marked       │    │    Window       │    │     Check       │    │    Approval     │
└─────────────────┘    └─────────────────┘    └─────────────────┘    └─────────────────┘
                                                                             │
                                                                             ▼
                                              ┌─────────────────┐    ┌─────────────────┐
                                              │    Removal      │◀───│   Code Review   │
                                              │   Completed     │    │   & Removal     │
                                              └─────────────────┘    └─────────────────┘
```

---

## 1. Who Can Authorize Removal

Only the following roles are authorized to approve deprecated code removal:

| Role | Description | Approval Scope |
|------|-------------|----------------|
| **Engineering Lead** | Technical leadership for the engineering team | All deprecated code |
| **Tech Lead** | Technical lead for specific feature areas | All deprecated code |
| **Principal Engineer** | Senior technical expert | All deprecated code |

### Authorization Requirements

- Approver must be an active team member with one of the above roles
- Approver must not be the author of the deprecation (separation of duties)
- Approval must be documented with timestamp and justification
- All approvals are logged in `.kiro/removal-audit-log.json`

---

## 2. Approval Workflow

### Step 1: Eligibility Check

Run the eligibility check script to identify deprecated items ready for removal:

```bash
# Check which items are eligible for removal
npx tsx scripts/deprecation/check-removal-eligibility.ts --check
```

The script will report:
- Items that have passed the 30-day deprecation window (eligible)
- Items still within the deprecation window (not yet eligible)
- Items already approved but not yet removed
- Items that have been removed

### Step 2: Review Eligible Items

Before approving removal, verify:

1. **Migration Completion**: All consumers have migrated to the new pattern
2. **No Active Usage**: No route handlers or use cases still use the deprecated code
3. **Shadow Mode Clean**: Shadow mode shows 0% mismatch rate (if applicable)
4. **Tests Updated**: All tests use the new patterns
5. **Documentation Updated**: Migration guides are accurate and complete

### Step 3: Approve Removal

Set the `AUTHORIZED_REMOVER` environment variable and run with `--approve`:

```bash
# Approve specific items
AUTHORIZED_REMOVER="john.doe:engineering-lead" \
  npx tsx scripts/deprecation/check-removal-eligibility.ts --approve resolve-auth-context-fn,auth-context-type

# Or approve all eligible items at once
AUTHORIZED_REMOVER="jane.smith:tech-lead" \
  npx tsx scripts/deprecation/check-removal-eligibility.ts --approve-all
```

### Step 4: Code Review & Removal

After approval, create a PR to remove the deprecated code:

1. Create a feature branch: `git checkout -b chore/remove-deprecated-<item-id>`
2. Remove the deprecated files/code
3. Update any remaining references
4. Update `.kiro/deprecation-tracking.json` to mark items as removed
5. Create PR with reference to the approval audit log entry
6. Request review from the approver (or another authorized role)

### Step 5: Post-Removal Verification

After the PR is merged:

1. Run the full test suite
2. Verify no runtime errors in staging
3. Monitor error rates for 24 hours after deployment
4. Update the removal audit log with completion status

---

## 3. Required Checklist Before Removal

Before approving any deprecated code for removal, verify the following:

### 3.1 Migration Verification

- [ ] All route handlers migrated to `withPermission` wrapper
- [ ] No remaining `resolveAuthContext()` calls in route handlers
- [ ] All use cases accept `AuthorizationContext` (not legacy `AuthContext`)
- [ ] No TypeScript errors related to removed types

### 3.2 Testing Verification

- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] All E2E tests passing
- [ ] Shadow mode mismatch rate at 0% for 7 consecutive days

### 3.3 Performance Verification

- [ ] Authorization resolution < 100ms p99
- [ ] Permission check < 10ms p99
- [ ] No performance regression in route handlers

### 3.4 Security Verification

- [ ] Cross-tenant security tests passing
- [ ] RLS enabled on all tenant-scoped tables
- [ ] No security vulnerabilities introduced

### 3.5 Documentation Verification

- [ ] Migration guide is accurate
- [ ] API documentation updated
- [ ] README updated if necessary
- [ ] Changelog entry prepared

### 3.6 Rollback Verification

- [ ] Rollback procedure tested in staging
- [ ] Emergency rollback flag available (for cutover flags)
- [ ] Team aware of rollback procedure

---

## 4. Post-Removal Verification Steps

After code removal is deployed:

### Immediate (0-1 hour)

1. Monitor error dashboards for new errors
2. Check application logs for deprecation-related issues
3. Verify all API endpoints responding correctly
4. Run smoke tests on critical paths

### Short-term (1-24 hours)

1. Monitor error rates for any increase
2. Check performance metrics for degradation
3. Review user feedback channels
4. Verify analytics/logging still working

### Long-term (24-72 hours)

1. Confirm no delayed issues surfaced
2. Archive any related documentation
3. Update the removal audit log with final status
4. Schedule cleanup of related test fixtures

---

## 5. Emergency Rollback

If issues are discovered after removal:

### Option A: Feature Flag Rollback (if cutover flags preserved)

```bash
# Re-enable legacy authorization (if cutover flags were archived, not deleted)
# See .kiro/specs/multi-tenant-integration-cutover/rollback-procedure.md
```

### Option B: Git Revert

```bash
# Revert the removal PR
git revert <removal-commit-sha>
git push
```

### Option C: Re-deploy Previous Version

```bash
# Deploy the last known good version
# Follow standard deployment rollback procedure
```

---

## 6. Deprecated Items Inventory

The following items are tracked in `.kiro/deprecation-tracking.json`:

| Item ID | Name | Category | Status |
|---------|------|----------|--------|
| `resolve-auth-context-fn` | resolveAuthContext() function | function | Deprecated |
| `auth-context-type` | AuthContext type | type | Deprecated |
| `user-role-enum` | UserRole enum | enum | Deprecated |
| `legacy-auth-result-type` | LegacyAuthResult type | type | Deprecated |
| `legacy-authorization-adapter` | LegacyAuthorizationAdapter class | class | Deprecated |
| `legacy-authz-error-codes` | LEGACY_AUTHZ_ERROR_CODES constants | module | Deprecated |
| `cutover-flags-system` | Cutover Feature Flag System | module | Deprecated (Archive only) |
| `shadow-auth-executor` | ShadowAuthExecutor service | class | Deprecated |

**Note:** The Cutover Feature Flag System should be **archived, not removed**, to maintain emergency rollback capability.

---

## 7. Audit Log Format

All removal decisions are logged in `.kiro/removal-audit-log.json`:

```json
{
  "version": "1.0.0",
  "entries": [
    {
      "timestamp": "2024-01-15T10:30:00.000Z",
      "action": "approved",
      "itemId": "resolve-auth-context-fn",
      "itemName": "resolveAuthContext() function",
      "filePath": "src/infrastructure/utils/resolveAuthContext.ts",
      "authorizedBy": "john.doe",
      "role": "engineering-lead",
      "reason": "Approved after 45 days deprecation window",
      "daysDeprecated": 45,
      "correlationId": "REM-LT2A8B-X9Y3ZQ"
    }
  ]
}
```

---

## 8. Script Reference

### Check Eligibility

```bash
npx tsx scripts/deprecation/check-removal-eligibility.ts --check
```

### Approve Specific Items

```bash
AUTHORIZED_REMOVER="name:role" \
  npx tsx scripts/deprecation/check-removal-eligibility.ts --approve item1,item2
```

### Approve All Eligible Items

```bash
AUTHORIZED_REMOVER="name:role" \
  npx tsx scripts/deprecation/check-removal-eligibility.ts --approve-all
```

### JSON Output (for CI/CD)

```bash
npx tsx scripts/deprecation/check-removal-eligibility.ts --check --json
```

---

## 9. CI/CD Integration

The eligibility check script can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
check-deprecation:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
      with:
        node-version: '20'
    - run: npm ci
    - name: Check deprecation eligibility
      run: npx tsx scripts/deprecation/check-removal-eligibility.ts --check --json
      continue-on-error: true
    - name: Post results to PR
      if: github.event_name == 'pull_request'
      uses: actions/github-script@v6
      with:
        script: |
          // Post deprecation report as PR comment
```

Exit codes:
- `0`: No action required (no eligible items or all approved)
- `1`: Error occurred
- `2`: Action required (items eligible for removal)

---

## 10. Related Documentation

- [Requirements: Requirement 18 - Legacy Code Deprecation Path](../.kiro/specs/multi-tenant-integration-cutover/requirements.md)
- [Tasks: FASE 2.15 - Legacy Code Deprecation](../.kiro/specs/multi-tenant-integration-cutover/tasks.md)
- [Rollback Procedure](../.kiro/specs/multi-tenant-integration-cutover/rollback-procedure.md)
- [Migration Completion Validation Checklist](../.kiro/specs/multi-tenant-integration-cutover/tasks.md#fase-216--migration-completion-validation)

---

## Revision History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2024-XX-XX | 1.0.0 | System | Initial version |
