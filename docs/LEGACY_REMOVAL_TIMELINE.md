# Legacy Authorization Code Removal Timeline

## Overview

This document outlines the timeline and process for removing deprecated legacy authorization components after the Multi-Tenant Integration Cutover is complete. The legacy removal follows a controlled, manual-gated process to ensure safe decommissioning of deprecated code.

**Purpose:**
- Define clear removal milestones
- Document deprecated components scheduled for removal
- Provide pre-removal checklists
- Establish rollback procedures if issues arise

**Governing Requirement:** Requirements 18.6, 16.9

---

## Deprecated Components

### 1. `resolveAuthContext()` Function

**Location:** `src/infrastructure/auth/resolveAuthContext.ts`

**Description:** Legacy function that resolves basic authentication context from HTTP requests. Returns simple `AuthContext { userId, tenantId, role }` object.

**Replaced By:** `AuthorizationContextResolver.resolve()` which returns full `AuthorizationContext` with memberships, permissions, activeOrgUnitId, and subscriptionStatus.

**Migration Pattern:**
```typescript
// Legacy (deprecated)
const authContext = await resolveAuthContext(request);

// New pattern
export default withPermission(['permission:name'], async (authContext, request) => {
  // authContext is now full AuthorizationContext
});
```

**Removal Impact:**
- Route handlers using legacy pattern will fail compilation
- Any code importing `resolveAuthContext` will need updates
- Tests mocking `resolveAuthContext` will need refactoring

---

### 2. `AuthContext` Interface/Type

**Location:** `src/core/protocols/auth/AuthContext.ts`

**Description:** Legacy simple authentication context interface with only `userId`, `tenantId`, and `role` fields.

**Replaced By:** `AuthorizationContext` from `@core/domains/authorization/types` containing:
- `userId`
- `tenantId`
- `membershipId`
- `orgUnitId`
- `role` (MembershipRole)
- `permissions` (Set<Permission>)
- `tokenVersion`
- `subscriptionStatus`

**Migration Pattern:**
```typescript
// Legacy type (deprecated)
import { AuthContext } from '@core/protocols';

// New type
import { AuthorizationContext } from '@core/domains/authorization/types';
```

**Removal Impact:**
- TypeScript compilation will fail for references to `AuthContext`
- Use case parameters need migration to `AuthorizationContext`

---

### 3. Shadow Mode Infrastructure

**Location:** `src/infrastructure/shadow/`

**Components:**
- `ShadowAuthExecutor.ts`
- `ShadowAuthConfig.ts`
- `ShadowMetrics.ts`
- Related shadow mode configuration flags

**Description:** Parallel execution infrastructure that runs both legacy and new authorization for validation purposes.

**Status:** To be disabled after 7-day validation period, then removed after full cutover.

**Removal Impact:**
- No direct code dependencies (shadow mode is middleware-level)
- Metrics dashboards referencing shadow metrics will need updates
- Configuration cleanup required

---

## Timeline

### Day 0: Migration Completion Validation Passes

**Prerequisites Before Day 0:**
- [x] All 28+ API directories migrated to `withPermission` wrapper
- [x] No remaining `resolveAuthContext()` calls in route handlers
- [x] RLS enabled on all TENANT_OWNED and ORG_SCOPED tables
- [x] All integration tests passing
- [x] All performance benchmarks met (AuthContext resolution < 100ms p99)
- [x] Cross-tenant security tests all passing
- [x] Sign-offs obtained: Engineering Lead, Security Lead, QA Lead

**Day 0 Actions:**
1. Generate and archive completion report
2. Lock cutover flags to new authorization mode
3. Begin monitoring period

---

### Days 1-7: Monitoring Period (Shadow Mode Active)

**Duration:** 7 calendar days

**Activities:**
- Shadow mode continues running for validation
- Monitor mismatch rate (target: 0% for 7 consecutive days)
- Monitor authorization latency (p99 < 100ms)
- Monitor error rates and incident reports
- Daily review of metrics dashboard

**Success Criteria:**
| Metric | Target |
|--------|--------|
| Shadow mismatch rate | 0% |
| Authorization p99 latency | < 100ms |
| Permission check p99 | < 10ms |
| Error rate increase | 0% |
| Incident count | 0 |

**Exit Criteria:** All targets met for 7 consecutive days.

---

### Day 7: Disable Shadow Mode

**Prerequisites:**
- [ ] 7-day monitoring period complete with all metrics passing
- [ ] No incidents related to authorization
- [ ] Engineering Lead approval

**Actions:**
1. Disable global shadow mode flag: `auth.shadow.enabled = false`
2. Verify system continues operating correctly
3. Archive shadow mode metrics
4. Update monitoring dashboards

**Verification:**
```bash
# Verify shadow mode disabled
curl -X GET /api/internal/diagnostics/shadow-status
# Expected: { "enabled": false, "disabledAt": "..." }

# Verify authorization still working
npm run test:integration -- --grep "authorization"
```

---

### Days 8-29: Stabilization Period

**Duration:** 22 calendar days

**Activities:**
- Monitor production for any authorization-related issues
- Collect feedback from development teams
- Document any edge cases discovered
- Prepare removal PR(s)
- Schedule code review for removal changes

**Preparation Checklist:**
- [ ] Create branch for legacy code removal
- [ ] Identify all files to be modified/deleted
- [ ] Update import statements across codebase
- [ ] Update tests that reference deprecated code
- [ ] Prepare rollback plan

---

### Day 30: Remove Deprecated Code

**Prerequisites:**
- [ ] 30 days elapsed since Day 0
- [ ] No incidents during stabilization period
- [ ] Removal PR(s) prepared and reviewed
- [ ] Authorized developer approval obtained (manual gate)

**Approval Required From:**
- Engineering Lead
- Security Lead

**Actions:**
1. Merge removal PR(s)
2. Deploy to staging
3. Run full test suite
4. Deploy to production
5. Monitor for issues
6. Archive cutover flags (do not delete)

---

## Removal Process

### Pre-Removal Checklist

Before initiating code removal, verify the following:

**Codebase Verification:**
- [ ] Run static analysis: `npm run lint:legacy-auth`
- [ ] Verify no production code references `resolveAuthContext()`
- [ ] Verify no production code imports `AuthContext` from legacy path
- [ ] All tests pass without legacy auth mocks
- [ ] No shadow mode dependencies in production code

**Metrics Verification:**
- [ ] 30-day mismatch rate = 0%
- [ ] No authorization-related incidents in past 30 days
- [ ] Performance metrics stable (p99 < 100ms)
- [ ] Error rates unchanged

**Approval Verification:**
- [ ] Engineering Lead signed off
- [ ] Security Lead signed off
- [ ] Removal scheduled during low-traffic window

---

### Files to Be Removed

**Direct Removal (Delete Files):**

```
src/infrastructure/auth/resolveAuthContext.ts
src/infrastructure/auth/resolveAuthContext.test.ts
src/core/protocols/auth/AuthContext.ts
src/infrastructure/shadow/ShadowAuthExecutor.ts
src/infrastructure/shadow/ShadowAuthConfig.ts
src/infrastructure/shadow/ShadowMetrics.ts
src/infrastructure/shadow/index.ts
```

**Modifications Required:**

| File | Change |
|------|--------|
| `src/core/protocols/index.ts` | Remove `AuthContext` export |
| `src/infrastructure/auth/index.ts` | Remove `resolveAuthContext` export |
| `src/infrastructure/di/registry/authContainer.ts` | Remove legacy auth registrations |
| `src/infrastructure/middleware/authorization/index.ts` | Remove shadow mode integration |
| `.kiro/specs/multi-tenant-integration-cutover/` | Archive to `.kiro/archive/` |

---

### Code Changes Required

**1. Remove Legacy Exports:**

```typescript
// src/core/protocols/index.ts
// REMOVE:
export { AuthContext } from './auth/AuthContext';

// src/infrastructure/auth/index.ts
// REMOVE:
export { resolveAuthContext } from './resolveAuthContext';
```

**2. Clean Up DI Container:**

```typescript
// src/infrastructure/di/registry/authContainer.ts
// REMOVE legacy registrations:
// container.register({
//   resolveAuthContext: asFunction(resolveAuthContextImpl).singleton(),
// });
```

**3. Remove Shadow Mode Integration:**

```typescript
// src/infrastructure/middleware/authorization/authorizationMiddleware.ts
// REMOVE shadow mode imports and calls:
// import { ShadowAuthExecutor } from '@infrastructure/shadow';
// const shadowResult = await shadowExecutor.execute(...);
```

**4. Update Test Files:**

Remove or update tests that:
- Mock `resolveAuthContext`
- Import `AuthContext` from legacy path
- Test shadow mode behavior

---

## Rollback Plan

### If Issues Found Before Removal (Days 1-30)

**Severity: Low-Medium**
- Issues can be fixed without rollback
- Shadow mode data helps identify root cause

**Actions:**
1. Investigate using shadow mode metrics
2. Fix issue in new authorization system
3. Reset 30-day countdown if fix is significant

---

### If Issues Found During Removal

**Severity: High**
- Deployment fails or tests fail

**Actions:**
1. **STOP** deployment immediately
2. Revert removal PR
3. Redeploy previous version
4. Investigate root cause
5. Reschedule removal

---

### If Issues Found After Removal (Production)

**Severity: Critical**
- Production authorization failures detected

**Immediate Actions (< 5 minutes):**

1. **Enable emergency cutover flags:**
```bash
# Re-enable legacy authorization
curl -X POST /api/internal/cutover/emergency-rollback \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"reason": "Post-removal authorization failure"}'
```

2. **Verify rollback:**
```bash
curl -X GET /api/internal/diagnostics/auth-mode
# Expected: { "mode": "legacy", "rolledBackAt": "..." }
```

3. **Notify stakeholders:**
- Page on-call engineer
- Notify Engineering Lead
- Create incident ticket

**Recovery Actions (< 24 hours):**

1. Analyze incident logs
2. Identify affected requests
3. Prepare fix for new authorization
4. Restore from archived removal code if needed
5. Conduct post-incident review

---

### Emergency Restoration

If legacy code must be restored after removal:

1. **Retrieve archived code:**
```bash
git checkout origin/archive/legacy-auth-removal -- src/infrastructure/auth/resolveAuthContext.ts
git checkout origin/archive/legacy-auth-removal -- src/core/protocols/auth/AuthContext.ts
```

2. **Re-register in DI container**

3. **Re-enable cutover flags:**
```bash
# Set cutover to legacy mode
curl -X POST /api/internal/cutover/flags \
  -d '{"auth.cutover.enabled": false}'
```

4. **Deploy and verify:**
```bash
npm run test:integration
npm run deploy:emergency
```

---

## Contacts

### Escalation Path

| Role | Responsibility |
|------|---------------|
| On-Call Engineer | First response, initial triage |
| Engineering Lead | Approval for removal, escalation decisions |
| Security Lead | Security-related concerns, audit |
| QA Lead | Test verification, regression concerns |

### Decision Authority

| Decision | Authority |
|----------|-----------|
| Proceed with removal | Engineering Lead + Security Lead |
| Emergency rollback | On-Call Engineer (immediate), Engineering Lead (confirm) |
| Extend timeline | Engineering Lead |
| Cancel removal | Engineering Lead + Security Lead |

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | TBD | Migration Team | Initial document |

---

## References

- [Requirements Document](../.kiro/specs/multi-tenant-integration-cutover/requirements.md) - Requirement 18.6
- [Rollback Procedure](../.kiro/specs/multi-tenant-integration-cutover/rollback-procedure.md)
- [Permission Mapping](../.kiro/specs/multi-tenant-integration-cutover/permission-mapping.md)
- [Multi-Tenant Architecture Design](../.kiro/specs/multi-tenant-saas-architecture/design.md)
