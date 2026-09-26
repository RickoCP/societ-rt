# Requirements Document

## Introduction

This document specifies the requirements for cutting over the existing SocieT-RT application from its legacy authorization model to the fully implemented Multi-Tenant SaaS Architecture. The Multi-Tenant Architecture has been designed and implemented (83 tasks completed in `.kiro/specs/multi-tenant-saas-architecture/`) but is NOT YET INTEGRATED with the running application.

**Current State (Legacy):**
- Route handlers use `resolveAuthContext()` returning basic `AuthContext { userId, tenantId, role }`
- No permission checks on API routes
- PostgreSQL RLS policies exist in code but are not applied to database
- Middleware performs basic JWT validation only, no `AuthorizationContext` resolution

**Target State (Multi-Tenant Architecture):**
- Route handlers wrapped with `withPermission(['permission:name'])`
- Full `AuthorizationContext` with memberships, permissions, activeOrgUnitId, subscriptionStatus
- RLS active on all tenant-scoped tables with `app.current_tenant_id` enforcement
- Middleware resolves full `AuthorizationContext` via `AuthorizationContextResolver`

**Migration Strategy:**
This cutover follows a phased approach with shadow mode validation to ensure zero regression during the transition. The cutover is organized into three phases:
1. **Phase 1**: Route Handler Integration Cutover
2. **Phase 2**: RLS Activation
3. **Phase 3**: End-to-End Testing and Performance Validation

**Critical Design Principles:**
- Backward compatibility maintained during migration
- Shadow mode validation before full cutover
- Each route mapped to specific permissions from PermissionRegistry
- RLS tested extensively before production activation
- All authorization decisions logged with correlation IDs
- Authorization resolution < 100ms p99

---

## Decision Classification

### LOCKED (From Multi-Tenant Architecture — Cannot Change)

| ID | Decision | Reference |
|----|----------|-----------|
| L1 | AuthorizationContextResolver is the authoritative source for authorization context | multi-tenant-saas-architecture design |
| L2 | withPermission wrapper is the standard route authorization pattern | requirePermission.ts implementation |
| L3 | PermissionRegistry provides explicit role → permission mapping (NO inheritance) | PermissionRegistry.ts implementation |
| L4 | RLS uses `app.current_tenant_id` session variable | RlsSessionContext.ts implementation |
| L5 | SET LOCAL for transaction-scoped RLS context (connection pool safe) | RlsSessionContext.ts implementation |
| L6 | JWT carries identity/context only; authorization resolved server-side | INV-AUTH-001 |
| L7 | 16 Memberships and 2 OrgUnits from M1/M2 migration are canonical | M2_CLONE_VALIDATION_REPORT |

### DESIGN_DECISION (Implementation Choices for Cutover)

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | Shadow mode runs both legacy and new auth paths in parallel | Safe validation before cutover |
| D2 | Per-route cutover flag granularity | Gradual, controlled migration |
| D3 | Mismatch threshold default: 0.1% before cutover allowed | Quality gate |
| D4 | Authorization resolution target: < 100ms p99 | Performance SLA |
| D5 | RLS policies applied in single database migration | Atomic activation |
| D6 | CI pipeline validates RLS coverage before deployment | Prevent regression |

### VALIDATION_TARGET (Must Be Tested)

| ID | Property | Test Type |
|----|----------|-----------|
| V1 | All 28+ route directories use withPermission after cutover | Integration test |
| V2 | Authorization resolution < 100ms p99 | Performance test |
| V3 | RLS prevents cross-tenant access | Security test |
| V4 | Shadow mode mismatch rate measurable | Integration test |
| V5 | Rollback restores legacy behavior within 1 minute | E2E test |
| V6 | Safety-critical routes work during subscription suspension | Integration test |

---

## Glossary

- **Legacy_AuthContext**: The simple `{ userId, tenantId, role }` object returned by current `resolveAuthContext()` function
- **AuthorizationContext**: The full authorization object resolved by `AuthorizationContextResolver` containing userId, tenantId, membershipId, orgUnitId, role, permissions, tokenVersion
- **withPermission_Wrapper**: Higher-order function that wraps route handlers to enforce permission checks before execution
- **Shadow_Mode**: Parallel execution of legacy and new authorization logic for validation, where legacy result is used for actual access decision
- **Route_Migration**: Process of updating a route handler from legacy `resolveAuthContext()` to new `withPermission` wrapper
- **RLS_Activation**: Database-level change to enable Row-Level Security policies on tenant-scoped tables
- **Cutover_Flag**: Feature flag controlling whether a route uses legacy or new authorization
- **Permission_Mapping**: Documentation linking each API route to its required permissions from PermissionRegistry
- **Mismatch_Rate**: Percentage of requests where legacy and new authorization produce different results during shadow mode
- **Rollback**: Process of reverting from new authorization back to legacy authorization

---

## Requirements

---

### Requirement 1: Middleware AuthorizationContext Resolution

**User Story:** As an API consumer, I want the middleware to resolve my full authorization context before my request reaches the route handler, so that permission checks can be performed consistently.

#### Acceptance Criteria

1. WHEN a request arrives with valid JWT, THE Middleware SHALL extract JWT claims and invoke `AuthorizationContextResolver.resolve()` to build the full `AuthorizationContext`
2. THE Middleware SHALL serialize the resolved `AuthorizationContext` into request headers for route handler consumption
3. IF the `AuthorizationContextResolver` returns an error, THEN THE Middleware SHALL return the appropriate HTTP error response (401 for token issues, 403 for authorization issues)
4. THE Middleware SHALL log all authorization resolution attempts with correlationId, userId, tenantId, and resolution result
5. WHEN the resolution succeeds, THE Middleware SHALL set headers: `x-authorization-context` (JSON serialized), `x-user-id`, `x-tenant-id`, `x-membership-id`, `x-org-unit-id`, `x-user-role`, `x-token-version`
6. THE Middleware SHALL NOT expose sensitive data in headers (exclude full permission set; derive from role at route level)
7. IF the JWT is missing or invalid, THEN THE Middleware SHALL return 401 with code `AUTH_TOKEN_INVALID`

#### Testing Considerations
- Unit test: Valid JWT → AuthorizationContext resolved and serialized to headers
- Unit test: Invalid JWT → 401 AUTH_TOKEN_INVALID
- Unit test: Token version mismatch → 401 AUTH_TOKEN_REVOKED
- Unit test: No active membership → 403 AUTH_NO_MEMBERSHIP
- Property test: For all valid JWTs with active membership, headers contain complete context
- Performance test: Resolution + serialization < 50ms p99

---

### Requirement 2: Route Handler withPermission Migration

**User Story:** As a developer, I want all route handlers migrated to use the `withPermission` wrapper, so that permission enforcement is consistent and declarative.

#### Acceptance Criteria

1. THE Migration SHALL update all route handlers in the following API directories to use `withPermission` wrapper: admin, administration, announcements, audit, auth, automation, billing, dashboard, door-monitoring, door-sensors, emergency, emergency-contacts, events, feature-flags, files, finance, health, home, iot, map, notifications, packages, privacy, residents, security, tenants, visitors, voting
2. WHEN a route handler is migrated, THE Migration SHALL replace `resolveAuthContext(request)` calls with `withPermission` wrapper that receives `AuthorizationContext` as parameter. A handler is ONLY considered migrated once `resolveAuthContext` is fully removed and `withPermission` exclusively supplies `AuthorizationContext`. Handlers that still call `resolveAuthContext(request)` directly but are also wrapped with `withPermission` SHALL NOT be counted as migrated.
3. THE Migration SHALL map each route handler to specific permissions from the existing `PermissionRegistry`
4. THE Migration SHALL update the route handler signature to use `AuthorizedRouteHandler<ResponseType>` type
5. IF a route requires multiple permissions, THEN THE `withPermission` wrapper SHALL specify all required permissions as array
6. THE Migration SHALL preserve existing request/response behavior (only authorization mechanism changes)
7. THE Migration SHALL NOT change any business logic within route handlers
8. THE Migration SHALL document the permission mapping for each migrated route in a central reference

#### Testing Considerations
- Static analysis: No remaining `resolveAuthContext()` calls in migrated routes
- Unit test: Each route denies access when required permission missing
- Unit test: Each route grants access when all required permissions present
- Integration test: End-to-end API call with valid permissions succeeds
- Regression test: All existing API tests pass after migration

---

### Requirement 3: Permission Mapping Reference

**User Story:** As a developer, I want a comprehensive reference mapping each API route to its required permissions, so that I can understand and audit the authorization model.

#### Acceptance Criteria

1. THE Permission_Mapping_Reference SHALL list every API route with its HTTP method and required permissions
2. THE Permission_Mapping_Reference SHALL group routes by domain (residents, finance, emergency, etc.)
3. WHEN a route has no permission requirement (public endpoint), THE Reference SHALL explicitly mark it as `public` or `auth-only` (requires valid JWT but no specific permission)
4. THE Permission_Mapping_Reference SHALL include rationale for permission choices on sensitive routes
5. THE Permission_Mapping_Reference SHALL be stored in `.kiro/specs/multi-tenant-integration-cutover/permission-mapping.md`
6. WHEN a new route is added, THE Reference SHALL be updated as part of the PR review checklist
7. THE Permission_Mapping_Reference SHALL validate that all referenced permissions exist in PermissionRegistry

#### Testing Considerations
- Static analysis: All permissions in mapping exist in PermissionRegistry
- Static analysis: All routes in codebase appear in mapping
- Review checklist: New route PRs require mapping update

---

### Requirement 4: Shadow Mode Authorization

**User Story:** As a system operator, I want shadow mode that runs both legacy and new authorization in parallel, so that I can validate the new system before cutover.

#### Acceptance Criteria

1. WHEN shadow mode is enabled globally, THE Shadow_Authorization SHALL execute both legacy `resolveAuthContext()` and new `AuthorizationContextResolver` for each request. Per-route shadow mode defaults to active (inheriting the global setting) when global shadow mode is enabled, unless explicitly excluded via a per-route feature flag.
2. THE Shadow_Authorization SHALL log mismatches between legacy and new authorization with: correlationId, userId, tenantId, endpoint, legacyResult, newResult, mismatchType
3. WHILE in shadow mode, THE System SHALL use the LEGACY authorization result for the actual access decision
4. THE Shadow_Authorization SHALL track and expose metrics: total requests, mismatch count, mismatch rate, false positives (new allows when legacy denies), false negatives (new denies when legacy allows)
5. THE Shadow_Authorization SHALL support per-route shadow mode enablement via feature flags
6. IF shadow mode latency impact exceeds 100ms p95, THEN THE System SHALL emit a warning alert
7. WHEN mismatch rate exceeds configurable threshold (default 1%), THE System SHALL emit a critical alert
8. THE Shadow_Authorization SHALL exclude auth routes (login, logout, register) from shadow mode (different flows)

#### Testing Considerations
- Integration test: Mismatch detection produces correct log entries
- Integration test: Legacy result used for actual access decision in shadow mode
- Performance test: Shadow mode latency impact < 100ms p95
- Unit test: Metrics correctly track mismatches
- Integration test: Alert emitted when mismatch rate exceeds threshold

---

### Requirement 5: Cutover Feature Flags

**User Story:** As a system operator, I want granular cutover flags, so that I can migrate routes incrementally and rollback if issues arise.

#### Acceptance Criteria

1. THE Cutover_System SHALL support a global cutover flag (`auth.cutover.enabled`) to switch all routes from legacy to new authorization
2. THE Cutover_System SHALL support per-domain cutover flags (`auth.cutover.domain.{domain}`) to migrate domain groups independently
3. THE Cutover_System SHALL support per-route cutover flags (`auth.cutover.route.{routeId}`) for fine-grained control
4. THE Cutover_System SHALL apply flag precedence: route-specific > domain-specific > global
5. WHEN a cutover flag is changed, THE System SHALL take effect on the next request without restart
6. THE Cutover_System SHALL require shadow mode mismatch rate below threshold (default 0.1%) AND a minimum observation window of 7 days AND a minimum sample size of 10,000 requests before allowing cutover (rate below threshold is necessary but not sufficient)
7. THE Cutover_System SHALL log all cutover flag changes with: timestamp, operator, flagName, oldValue, newValue, reason
8. IF cutover flag change results in errors exceeding threshold, THEN THE System SHALL support instant rollback to previous state

#### Testing Considerations
- Unit test: Flag precedence correctly applied
- Integration test: Flag change takes effect without restart
- Integration test: Rollback restores previous behavior
- Unit test: Cutover blocked when mismatch rate above threshold

---

### Requirement 6: UseCase AuthorizationContext Parameter Update

**User Story:** As a developer, I want all use cases to accept `AuthorizationContext` instead of simple `AuthContext`, so that use cases can perform OrgUnit scope checks and permission validations.

#### Acceptance Criteria

1. THE UseCase_Migration SHALL identify all use cases currently accepting `AuthContext` parameter
2. THE UseCase_Migration SHALL update use case interfaces to accept `AuthorizationContext` from `@core/domains/authorization/types`
3. WHEN a use case needs OrgUnit scope checking, THE Migration SHALL use `authContext.orgUnitId` for scope validation
4. WHEN a use case needs to check specific permissions, THE Migration SHALL use the `authContext.permissions` set
5. THE UseCase_Migration SHALL update all repository calls to pass tenantId from `authContext.tenantId`
6. THE UseCase_Migration SHALL preserve backward compatibility during migration period using type union `AuthContext | AuthorizationContext`
7. IF a use case references `authContext.role` as legacy `UserRole`, THEN THE Migration SHALL update to use `MembershipRole`

#### Testing Considerations
- Type check: All use case parameters use correct type
- Unit test: Use cases correctly access AuthorizationContext fields
- Unit test: OrgUnit scope checks use authContext.orgUnitId
- Integration test: End-to-end flow with new context type succeeds

---

### Requirement 7: Safety-Critical Route Preservation

**User Story:** As a resident, I want emergency and panic button functionality to work even if my membership is suspended, so that I can always access safety features.

#### Acceptance Criteria

1. THE Safety_Routes SHALL include: `POST /api/emergency`, `POST /api/emergency/panic`, `GET /api/emergency/status`, `POST /api/emergency/acknowledge`
2. WHEN checking authorization for safety-critical routes, THE System SHALL allow SUSPENDED membership status (not only ACTIVE)
3. THE withPermission wrapper SHALL support an `allowSuspended: true` option for safety-critical routes
4. THE Safety_Routes SHALL still require valid JWT and valid (though possibly suspended) membership
5. THE Safety_Routes SHALL log all access attempts with membership status for audit
6. THE Safety_Routes SHALL NOT bypass subscription entitlement checks (safety features are core entitlement)
7. WHEN a suspended user accesses safety routes, THE System SHALL include `membershipSuspended: true` in audit log

#### Testing Considerations
- Integration test: Suspended user can access emergency routes
- Integration test: Suspended user cannot access non-safety routes
- Unit test: Safety routes have allowSuspended flag set
- Integration test: Revoked membership cannot access safety routes (only suspended allowed)

---

### Requirement 8: RLS Database Migration Creation

**User Story:** As a database administrator, I want a database migration that enables RLS policies on all tenant-scoped tables, so that tenant isolation is enforced at the database layer.

#### Acceptance Criteria

1. THE RLS_Migration SHALL create a Prisma migration file that enables RLS on all TENANT_OWNED and ORG_SCOPED tables as defined in TableClassificationRegistry
2. THE RLS_Migration SHALL apply the existing RLS policies from the multi-tenant architecture design
3. THE RLS_Migration SHALL use the `app.current_tenant_id` session variable for tenant filtering
4. THE RLS_Migration SHALL include policies for: SELECT, INSERT, UPDATE, DELETE operations
5. THE RLS_Migration SHALL NOT apply RLS to GLOBAL_IDENTITY tables (users) or PLATFORM_SHARED tables (subscription_plans, feature_flags)
6. THE RLS_Migration SHALL include a rollback script that disables RLS policies
7. IF the migration fails partially, THEN THE System SHALL rollback all changes (atomic migration). IF the automatic rollback does not succeed, THE System SHALL halt deployment and alert administrators immediately, leaving the database in a flagged inconsistent state requiring manual intervention.
8. THE RLS_Migration SHALL be tested on a staging database before production deployment

#### Testing Considerations
- Unit test: Migration applies RLS to correct tables
- Unit test: Rollback script removes RLS policies
- Integration test: RLS blocks cross-tenant access after migration
- Integration test: RLS allows same-tenant access after migration
- Performance test: Query latency increase < 20% with RLS enabled

---

### Requirement 9: RLS Prisma Middleware Integration

**User Story:** As a developer, I want RLS tenant context automatically set in Prisma queries, so that I don't need to manually manage session variables.

#### Acceptance Criteria

1. THE RLS_Middleware SHALL intercept all Prisma operations and set `app.current_tenant_id` using `SET LOCAL` before execution. Interception MUST occur for every Prisma operation prior to SET LOCAL; absence of interception is itself a violation.
2. THE RLS_Middleware SHALL extract tenantId from the current request's `AuthorizationContext`
3. THE RLS_Middleware SHALL use `$transaction` wrapper to ensure SET LOCAL is transaction-scoped. BOTH the transaction wrapper AND transaction-scoped SET LOCAL MUST be used together.
4. THE RLS_Middleware SHALL provide a bypass mechanism for explicit cross-tenant operations (privileged execution path)
5. WHEN the privileged execution path is used, THE RLS_Middleware SHALL require explicit audit logging with justification
6. IF tenantId is not available in context, THEN THE RLS_Middleware SHALL deny the operation (fail-closed)
7. THE RLS_Middleware SHALL clear session variable before returning connection to pool (defense-in-depth, SET LOCAL handles this)
8. THE RLS_Middleware SHALL integrate with existing `RlsSessionContext` service

#### Testing Considerations
- Unit test: SET LOCAL executed before query
- Unit test: tenantId extracted from AuthorizationContext
- Unit test: Missing tenantId → operation denied
- Integration test: RLS filters queries to current tenant only
- Integration test: Connection pool reuse does not leak tenant context

---

### Requirement 10: RLS Coverage CI Validation

**User Story:** As a platform engineer, I want CI pipeline to validate RLS coverage, so that new tables are protected by RLS before deployment.

#### Acceptance Criteria

1. THE RLS_Coverage_CI SHALL run `RlsCoverageEnforcer.validateCoverage()` as part of the CI pipeline
2. THE RLS_Coverage_CI SHALL fail the build if any TENANT_OWNED or ORG_SCOPED table is missing RLS policy
3. THE RLS_Coverage_CI SHALL generate a coverage report listing: covered tables, uncovered tables, policy types per table
4. THE RLS_Coverage_CI SHALL allow explicit exemptions for tables with documented reasons (stored in `.kiro/rls-exemptions.json`)
5. WHEN a new table is added, THE CI SHALL actively enforce the requirement for either RLS policy or explicit exemption as part of the build process (CI's enforcement mechanism is part of the requirement).
6. THE RLS_Coverage_CI SHALL validate that exemptions are reviewed and approved (require `approvedBy` field)
7. THE RLS_Coverage_CI SHALL emit warning if exemption is older than 90 days (stale exemption review)

#### Testing Considerations
- Unit test: Uncovered TENANT_OWNED table → build fails
- Unit test: Exempted table with valid exemption → build passes
- Unit test: Coverage report includes all tables
- Integration test: New table without RLS → CI fails

---

### Requirement 11: Cross-Tenant Access Prevention Testing

**User Story:** As a security engineer, I want comprehensive tests proving cross-tenant access is impossible, so that I can validate tenant isolation.

#### Acceptance Criteria

1. THE Cross_Tenant_Tests SHALL attempt to read Tenant A's data while authenticated as Tenant B user
2. THE Cross_Tenant_Tests SHALL attempt to write to Tenant A's data while authenticated as Tenant B user
3. THE Cross_Tenant_Tests SHALL attempt to delete Tenant A's data while authenticated as Tenant B user
4. THE Cross_Tenant_Tests SHALL cover all TENANT_OWNED tables: tenants, org_units, memberships, households, residents, financial_transactions, announcements, votes, emergency_alerts, iot_devices
5. THE Cross_Tenant_Tests SHALL verify that no data is returned (not just filtered) when accessing other tenant's data
6. THE Cross_Tenant_Tests SHALL run with RLS enabled at database level
7. THE Cross_Tenant_Tests SHALL include scenarios: direct query, join query, subquery, aggregation query
8. IF any cross-tenant access succeeds, THEN THE Test SHALL fail with detailed error including the full query text and returned result set (not just pass/fail indicator)

#### Testing Considerations
- Security test: Read cross-tenant → empty result
- Security test: Write cross-tenant → constraint violation or denied
- Security test: Delete cross-tenant → zero rows affected
- Security test: All table types covered
- Security test: Complex queries (joins, subqueries) also isolated

---

### Requirement 12: Authorization Performance Benchmarks

**User Story:** As a platform engineer, I want performance benchmarks for authorization resolution, so that I can ensure the new system meets SLA.

#### Acceptance Criteria

1. THE Performance_Benchmark SHALL measure `AuthorizationContextResolver.resolve()` latency with target: p50 < 30ms, p95 < 70ms, p99 < 100ms
2. THE Performance_Benchmark SHALL measure permission check latency (`getMissingPermissions`) with target: p99 < 10ms
3. THE Performance_Benchmark SHALL measure RLS query overhead with target: < 20% latency increase compared to non-RLS
4. THE Performance_Benchmark SHALL run with production-like data volume (10,000 users, 100 tenants, 1,000 memberships per tenant)
5. THE Performance_Benchmark SHALL measure under concurrent load (100 concurrent requests)
6. THE Performance_Benchmark SHALL generate report comparing legacy vs. new authorization latency
7. IF any benchmark fails target, THEN THE System SHALL block deployment and require optimization

#### Testing Considerations
- Performance test: AuthorizationContextResolver.resolve() < 100ms p99
- Performance test: Permission check < 10ms p99
- Performance test: RLS overhead < 20%
- Load test: Latency under 100 concurrent requests
- Regression test: Compare legacy vs. new latency

---

### Requirement 13: Integration Test Suite for Auth Flow

**User Story:** As a QA engineer, I want comprehensive integration tests for the complete authorization flow, so that I can validate the system works end-to-end.

#### Acceptance Criteria

1. THE Integration_Tests SHALL cover: login → JWT issuance → middleware resolution → route handler → permission check → RLS query → response
2. THE Integration_Tests SHALL test user with PLATFORM_ADMIN role (tenant-level, orgUnitId = null)
3. THE Integration_Tests SHALL test user with RT_ADMIN role (org-scoped)
4. THE Integration_Tests SHALL test user with RESIDENT role (limited permissions)
5. THE Integration_Tests SHALL test context switch between tenants for multi-tenant user
6. THE Integration_Tests SHALL test context switch between OrgUnits within same tenant
7. THE Integration_Tests SHALL test token version invalidation (force logout)
8. THE Integration_Tests SHALL test refresh token rotation
9. THE Integration_Tests SHALL test suspended membership access to safety vs. normal routes (suspended users retain access to safety routes only, blocked from normal routes)

#### Testing Considerations
- E2E test: Complete auth flow for each role type
- E2E test: Context switch validation
- E2E test: Token invalidation triggers re-authentication
- E2E test: Suspended membership edge cases

---

### Requirement 14: Rollback Procedure Documentation

**User Story:** As a system operator, I want documented rollback procedures, so that I can quickly revert if the cutover causes issues.

#### Acceptance Criteria

1. THE Rollback_Procedure SHALL document how to disable cutover flags to revert to legacy authorization
2. THE Rollback_Procedure SHALL document how to disable RLS policies at database level
3. THE Rollback_Procedure SHALL include estimated rollback time (target: < 5 minutes for flags, < 15 minutes for RLS)
4. THE Rollback_Procedure SHALL include health check commands to verify rollback success
5. THE Rollback_Procedure SHALL include escalation contacts and decision criteria for rollback
6. THE Rollback_Procedure SHALL be tested in staging environment before production cutover. Staging rollback test success is a hard gate blocking production cutover; if staging testing reveals issues or cannot be fully executed before the production cutover deadline, production cutover is blocked until staging testing passes.
7. THE Rollback_Procedure SHALL be stored in `.kiro/specs/multi-tenant-integration-cutover/rollback-procedure.md`

#### Testing Considerations
- Runbook test: Rollback procedure executed in staging
- Timing test: Flag rollback < 5 minutes
- Timing test: RLS rollback < 15 minutes
- Health check: System operational after rollback

---

### Requirement 15: Observability and Audit Logging

**User Story:** As a security auditor, I want comprehensive audit logs for all authorization decisions, so that I can investigate security incidents.

#### Acceptance Criteria

1. THE Audit_Logging SHALL log all authorization decisions (ALLOW and DENY) with: correlationId, timestamp, userId, tenantId, membershipId, endpoint, method, requiredPermissions, decision, reason
2. THE Audit_Logging SHALL log all context switches with: correlationId, userId, fromTenantId, toTenantId, fromOrgUnitId, toOrgUnitId, success
3. THE Audit_Logging SHALL log all token validations with: correlationId, userId, tokenVersion, validationResult, failureReason
4. THE Audit_Logging SHALL log all RLS context changes with: correlationId, tenantId, operation, timestamp
5. THE Audit_Logging SHALL NOT log sensitive data (passwords, tokens, PII beyond userId)
6. THE Audit_Logging SHALL support structured logging format (JSON) for log aggregation
7. WHEN an authorization denial occurs, THE Audit_Logging SHALL include sufficient context for debugging without exposing security details to client
8. THE Audit_Logging SHALL integrate with existing correlationId system from `@infrastructure/utils/correlationId`

#### Testing Considerations
- Unit test: All required fields present in audit log
- Unit test: No sensitive data in logs
- Integration test: Log aggregation captures auth events
- Audit test: Denial logs sufficient for incident investigation

---

### Requirement 16: Migration Completion Validation

**User Story:** As a project manager, I want a validation checklist confirming migration completion, so that I can certify the cutover is complete.

#### Acceptance Criteria

1. THE Completion_Validation SHALL verify all 28+ API directories have routes using withPermission wrapper
2. THE Completion_Validation SHALL verify no remaining `resolveAuthContext()` calls in route handlers (excluding auth routes)
3. THE Completion_Validation SHALL verify RLS enabled on all TENANT_OWNED and ORG_SCOPED tables
4. THE Completion_Validation SHALL verify all integration tests passing
5. THE Completion_Validation SHALL verify all performance benchmarks meeting targets
6. THE Completion_Validation SHALL verify shadow mode mismatch rate at 0% for 7 consecutive days
7. THE Completion_Validation SHALL verify cross-tenant access tests all passing
8. THE Completion_Validation SHALL generate a completion report with sign-off from: Engineering Lead, Security Lead, QA Lead
9. AFTER completion validation passes, THE System SHALL remove legacy `resolveAuthContext()` utility and cutover flags

#### Testing Considerations
- Static analysis: No legacy patterns remaining
- Certification: All stakeholder sign-offs obtained
- Validation: 7-day mismatch rate = 0%
- Post-cutover: Legacy code removed

---

### Requirement 17: Auth Route Exclusion Handling

**User Story:** As a developer, I want auth routes (login, logout, register) to work without the new authorization context, so that unauthenticated users can access authentication endpoints.

#### Acceptance Criteria

1. THE Auth_Routes SHALL include: `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/register`, `POST /api/auth/refresh`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`
2. THE Auth_Routes SHALL bypass `withPermission` wrapper (no permission check required)
3. THE Auth_Routes SHALL use a dedicated wrapper for explicit marking: `withPublicRoute` for fully public endpoints (no JWT required) or `withAuthOnlyRoute` for endpoints requiring valid JWT but no specific permission (different wrappers are acceptable based on route semantics)
4. THE Auth_Routes SHALL still perform rate limiting and input validation
5. THE Middleware SHALL NOT attempt `AuthorizationContext` resolution for auth routes
6. THE Auth_Routes SHALL be explicitly documented in the permission mapping as `public` or `auth-only`
7. WHEN a new auth route is added, THE PR checklist SHALL require explicit exclusion documentation

#### Testing Considerations
- Unit test: Auth routes accessible without JWT
- Unit test: Auth routes have rate limiting
- Integration test: Login flow works without authorization context
- Static analysis: Auth routes use correct wrapper type

---

### Requirement 18: Legacy Code Deprecation Path

**User Story:** As a developer, I want clear deprecation markers on legacy code, so that I know which code will be removed after cutover completion.

#### Acceptance Criteria

1. THE Deprecation_Markers SHALL add `@deprecated` JSDoc to `resolveAuthContext()` function with removal timeline
2. THE Deprecation_Markers SHALL add `@deprecated` JSDoc to legacy `AuthContext` type import from `@core/protocols`
3. THE Deprecation_Markers SHALL add TSDoc warnings to any remaining legacy pattern usage
4. THE Deprecation_Markers SHALL include migration guide linking to new pattern
5. WHEN deprecated code is used, THE TypeScript compiler SHALL emit deprecation warning
6. THE Deprecation_Markers SHALL specify removal target: 30 days after completion validation passes
7. AFTER removal timeline expires, THE Cleanup process SHALL flag expired deprecated code for review, and an authorized developer MUST approve and trigger the actual removal (manual-gated removal, not automatic)

#### Testing Considerations
- Compiler test: Deprecation warnings emitted
- Documentation: Migration guide is accurate
- Timeline: Removal occurs on schedule

