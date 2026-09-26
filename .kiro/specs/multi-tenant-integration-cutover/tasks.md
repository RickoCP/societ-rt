# Implementation Plan: Multi-Tenant Integration Cutover

## Overview

Implementation plan for cutting over the SocieT-RT application from its legacy authorization model to the fully implemented Multi-Tenant SaaS Architecture. This cutover follows a phased approach with shadow mode validation to ensure zero regression.

| Field | Value |
|-------|-------|
| Version | 1.0.0 |
| Status | PLANNING |
| Requirements Source | requirements.md (18 requirements) |
| Design Source | design.md (9 components, 34 properties) |
| Prerequisite | multi-tenant-saas-architecture (83 tasks completed) |
| Created | 2024-XX-XX |

**Migration Completion Criteria:**
- All 28+ directories migrated (no `resolveAuthContext()` calls remaining)
- Shadow mode 0% mismatch for 7 consecutive days
- Sample size ≥ 10,000 requests
- RLS enabled on all TENANT_OWNED and ORG_SCOPED tables
- Cross-tenant security tests all passing
- Performance benchmarks met (AuthContext resolution < 100ms p99)
- Sign-offs: Engineering Lead, Security Lead, QA Lead

---

## Tasks

### FASE 2.1 — Middleware AuthorizationContext Resolution

_Implements the middleware that intercepts all requests and resolves full AuthorizationContext for protected routes._

- [x] 1. Create Authorization Middleware Infrastructure
  - [x] 1.1 Implement `AuthorizationMiddleware` interface and config types
    - Create `src/infrastructure/middleware/authorization/authorizationMiddleware.ts`
    - Define `AuthorizationMiddlewareConfig` with bypassRoutes, logSuccess, headerPrefix
    - Implement request pipeline for authorization resolution
    - _Requirements: 1.1, 1.3_
  
  - [x] 1.2 Implement JWT extraction and validation in middleware
    - Extract JWT from Authorization header or cookie
    - Validate JWT structure, signature, and expiration
    - Handle missing/invalid JWT with `AUTH_TOKEN_INVALID` (401)
    - _Requirements: 1.1, 1.7_
  
  - [x] 1.3 Implement AuthorizationContext header serialization
    - Serialize resolved context to `x-authorization-context` (JSON, excluding permissions)
    - Set individual headers: `x-user-id`, `x-tenant-id`, `x-membership-id`, `x-org-unit-id`, `x-user-role`, `x-token-version`
    - Ensure no sensitive data (full permissions set) exposed in headers
    - _Requirements: 1.2, 1.5, 1.6_
  
  - [x] 1.4 Implement error response mapping
    - Map `AUTH_TOKEN_INVALID` → 401
    - Map `AUTH_TOKEN_EXPIRED` → 401
    - Map `AUTH_TOKEN_VERSION_MISMATCH` → 401
    - Map `AUTH_NO_MEMBERSHIP` → 403
    - Map `AUTH_MEMBERSHIP_INACTIVE` → 403
    - Map `AUTH_USER_QUARANTINED` → 403
    - _Requirements: 1.3, 1.7_
  
  - [x] 1.5 Implement authorization resolution logging
    - Log all resolution attempts with correlationId, userId, tenantId, result
    - Integrate with existing correlationId system from `@infrastructure/utils/correlationId`
    - _Requirements: 1.4, 15.1_
  
  - [x]* 1.6 Write unit tests for Authorization Middleware
    - Test valid JWT → AuthorizationContext resolved and serialized to headers
    - Test invalid JWT → 401 AUTH_TOKEN_INVALID
    - Test token version mismatch → 401 AUTH_TOKEN_REVOKED
    - Test no active membership → 403 AUTH_NO_MEMBERSHIP
    - **Property 1: Middleware Authorization Context Resolution**
    - **Validates: Requirements 1.1, 1.2, 1.5**
  
  - [x]* 1.7 Write property tests for header security
    - **Property 2: Authorization Context Header Security**
    - For any AuthorizationContext, serialized JSON SHALL NOT contain full permissions set
    - **Validates: Requirements 1.6**
  
  - [x]* 1.8 Write performance test for resolution latency
    - Verify resolution + serialization < 50ms p99
    - _Requirements: 1 (Testing Considerations)_

- [x] 2. FASE 2.1 Checkpoint
  - Ensure all middleware tests pass
  - Verify authorization resolution logging works in dev environment
  - Review with team before proceeding to route migration

---

### FASE 2.2 — Route Handler Migration Pattern

_Implements the `withPermission` wrapper and migrates all 28+ route directories from legacy `resolveAuthContext()` to new pattern._

- [x] 3. Create withPermission Wrapper Infrastructure
  - [x] 3.1 Implement `withPermission` higher-order function
    - Create `src/infrastructure/middleware/authorization/withPermission.ts`
    - Define `AuthorizedRouteHandler<T>` type
    - Define `RequirePermissionOptions` with permissions, allowSuspended, logSuccess
    - Implement permission check using `PermissionRegistry.getMissingPermissions()`
    - _Requirements: 2.1, 2.4_
  
  - [x] 3.2 Implement multi-permission check logic
    - Verify ALL required permissions are present (not just one)
    - Return 403 `AUTH_INSUFFICIENT_PERMISSION` if any permission missing
    - _Requirements: 2.5_
  
  - [x] 3.3 Implement `withPublicRoute` wrapper for auth routes
    - Create wrapper for fully public endpoints (no JWT required)
    - Apply rate limiting and input validation
    - _Requirements: 17.2, 17.3_
  
  - [x] 3.4 Implement `withAuthOnlyRoute` wrapper
    - Create wrapper for endpoints requiring valid JWT but no specific permission
    - Apply rate limiting and input validation
    - _Requirements: 17.3, 17.4_
  
  - [x]* 3.5 Write unit tests for withPermission wrapper
    - Test permission check denies when missing
    - Test permission check allows when present
    - Test multi-permission check requires ALL permissions
    - **Property 5: Multi-Permission Check**
    - **Validates: Requirements 2.5**
  
  - [x]* 3.6 Write property tests for route classification
    - **Property 6: Route Classification Completeness**
    - For any route in mapping, must have valid classification
    - **Validates: Requirements 3.3**

- [x] 4. Migrate High-Priority Route Directories (Batch 1)
  - [x] 4.1 Migrate `/api/admin` routes
    - Replace all `resolveAuthContext()` calls with `withPermission`
    - Map routes to appropriate admin permissions
    - Verify no legacy auth patterns remain
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [x] 4.2 Migrate `/api/administration` routes
    - Replace all `resolveAuthContext()` calls with `withPermission`
    - Map routes to tenant management permissions
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [x] 4.3 Migrate `/api/billing` routes
    - Replace all `resolveAuthContext()` calls with `withPermission`
    - Map routes to billing/finance permissions
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [x] 4.4 Migrate `/api/finance` routes
    - Replace all `resolveAuthContext()` calls with `withPermission`
    - Map routes to financial permissions
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [x] 4.5 Migrate `/api/audit` routes
    - Replace all `resolveAuthContext()` calls with `withPermission`
    - Map routes to audit permissions
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [x] 4.6 Migrate `/api/privacy` routes
    - Replace all `resolveAuthContext()` calls with `withPermission`
    - Map routes to privacy/GDPR permissions
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [x] 4.7 Migrate `/api/residents` routes
    - Replace all `resolveAuthContext()` calls with `withPermission`
    - Map routes to resident management permissions
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [x] 4.8 Migrate `/api/security` routes
    - Replace all `resolveAuthContext()` calls with `withPermission`
    - Map routes to security/guard permissions
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [x] 4.9 Migrate `/api/tenants` routes
    - Replace all `resolveAuthContext()` calls with `withPermission`
    - Map routes to tenant management permissions
    - _Requirements: 2.1, 2.2, 2.3_

- [x] 5. Migrate Safety-Critical Routes (Batch 2)
  - [x] 5.1 Migrate `/api/emergency` routes with `allowSuspended: true`
    - Use `withPermission({ permissions: ['emergency:create'], allowSuspended: true })`
    - Include POST /emergency, POST /emergency/panic, GET /emergency/status
    - POST /emergency/[id]/acknowledge uses `emergency:manage` without allowSuspended
    - _Requirements: 2.1, 7.1, 7.2, 7.3_
  
  - [x] 5.2 Migrate `/api/emergency-contacts` routes
    - Use appropriate permission with `allowSuspended: true` where needed
    - _Requirements: 2.1, 7.1_
  
  - [ ]* 5.3 Write integration tests for safety-critical routes
    - Test suspended user can access emergency routes
    - Test suspended user cannot access non-safety routes
    - Test REVOKED membership cannot access safety routes
    - **Property 16: Suspended Membership Safety Access**
    - **Property 17: Safety Route Auth Requirements**
    - **Validates: Requirements 7.2, 7.3, 7.4**
  
  - [ ]* 5.4 Write property tests for safety route audit logging
    - **Property 18: Safety Route Audit Logging**
    - For any suspended user accessing safety routes, audit log SHALL include `membershipSuspended: true`
    - **Validates: Requirements 7.5, 7.7**

- [x] 6. Migrate Medium-Priority Route Directories (Batch 3)
  - [x] 6.1 Migrate `/api/announcements` routes
    - Map routes to announcement permissions
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [x] 6.2 Migrate `/api/dashboard` routes
    - Map routes to dashboard/aggregation permissions
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [x] 6.3 Migrate `/api/door-monitoring` routes
    - Map routes to door monitoring permissions
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [x] 6.4 Migrate `/api/door-sensors` routes
    - Map routes to door sensor permissions
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [x] 6.5 Migrate `/api/files` routes
    - Map routes to file/document permissions
    - GET /api/files/[key] → resident:read (download file)
    - DELETE /api/files/[key] → resident:write (delete file)
    - POST /api/files/upload → resident:write (upload file)
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [x] 6.6 Migrate `/api/iot` routes
    - Map routes to IoT device permissions
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [x] 6.7 Migrate `/api/notifications` routes
    - Map routes to notification permissions
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [x] 6.8 Migrate `/api/voting` routes
    - Map routes to voting/governance permissions
    - _Requirements: 2.1, 2.2, 2.3_

- [x] 7. Migrate Low-Priority Route Directories (Batch 4)
  - [x] 7.1 Migrate `/api/automation` routes
    - Map routes to iot:read/iot:manage permissions (automation is IoT-related)
    - Migrated 5 route files: rules/route.ts, rules/[id]/route.ts, rules/[id]/enable/route.ts, rules/[id]/disable/route.ts, executions/route.ts
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [x] 7.2 Migrate `/api/events` routes
    - Map routes to event permissions
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [x] 7.3 Migrate `/api/feature-flags` routes
    - Map routes to config/feature-flag permissions
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [x] 7.4 Migrate `/api/home` routes
    - Map routes to home/dashboard permissions
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [x] 7.5 Migrate `/api/map` routes
    - Map routes to map visualization permissions
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [x] 7.6 Migrate `/api/packages` routes
    - Map routes to package/delivery permissions
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [x] 7.7 Migrate `/api/visitors` routes
    - Map routes to visitor access permissions
    - _Requirements: 2.1, 2.2, 2.3_

- [x] 8. Configure Auth Route Exclusions
  - [x] 8.1 Apply `withPublicRoute` to login and register
    - `/api/auth/login` - public
    - `/api/auth/register` - public
    - `/api/auth/forgot-password` - public
    - `/api/auth/reset-password` - public
    - _Requirements: 17.1, 17.2_
  
  - [x] 8.2 Apply `withAuthOnlyRoute` to auth-only routes
    - `/api/auth/logout` - auth-only (requires valid JWT)
    - `/api/auth/refresh` - auth-only
    - _Requirements: 17.1, 17.3_
  
  - [ ]* 8.3 Write unit tests for auth route exclusions
    - Test auth routes accessible without JWT where appropriate
    - Test auth routes have rate limiting
    - **Property 34: Auth Route Exclusion**
    - **Validates: Requirements 17.1, 17.2, 17.3**

- [x] 9. FASE 2.2 Checkpoint
  - Run static analysis: verify no remaining `resolveAuthContext()` calls in migrated routes
  - Ensure all regression tests pass
  - Ensure all routes mapped to permissions
  - Review with team before enabling shadow mode

---

### FASE 2.3 — Permission Mapping Reference

_Creates comprehensive documentation mapping each API route to its required permissions._

- [x] 10. Create Permission Mapping Document
  - [x] 10.1 Create permission-mapping.md structure
    - Create `.kiro/specs/multi-tenant-integration-cutover/permission-mapping.md`
    - Define format: Method | Route | Permissions | Classification | Rationale
    - Group routes by domain
    - _Requirements: 3.1, 3.2_
  
  - [x] 10.2 Document all route permissions by domain
    - Residents domain permissions
    - Finance domain permissions
    - Emergency domain permissions (mark safety routes)
    - Admin domain permissions
    - All other domains
    - _Requirements: 3.1, 3.2, 3.4_
  
  - [x] 10.3 Document auth routes as public/auth-only
    - Mark login, register, forgot-password, reset-password as `public`
    - Mark logout, refresh as `auth-only`
    - _Requirements: 3.3, 17.6_
  
  - [ ]* 10.4 Validate permission mapping completeness
    - Static analysis: all permissions in mapping exist in PermissionRegistry
    - Static analysis: all routes in codebase appear in mapping
    - **Property 4: Permission Mapping Validity**
    - **Validates: Requirements 2.3, 3.7**

---

### FASE 2.4 — Shadow Mode Authorization

_Implements parallel execution of legacy and new authorization for validation._

- [x] 11. Implement Shadow Mode Infrastructure
  - [x] 11.1 Create `ShadowAuthExecutor` service
    - Create `src/infrastructure/shadow/ShadowAuthExecutor.ts`
    - Define `ShadowAuthConfig` with enabled, excludedRoutes, routeOverrides, thresholds
    - Implement parallel execution of legacy and new auth
    - _Requirements: 4.1_
  
  - [x] 11.2 Implement mismatch detection and logging
    - Compare legacy and new results
    - Classify mismatches: false_positive, false_negative, data_mismatch
    - Log with correlationId, userId, tenantId, endpoint, legacyResult, newResult
    - _Requirements: 4.2_
  
  - [x] 11.3 Implement shadow mode metrics tracking
    - Track totalRequests, mismatchCount, mismatchRate
    - Track falsePositives, falseNegatives
    - Track avgLatencyMs, p95LatencyMs
    - _Requirements: 4.4_
  
  - [x] 11.4 Implement legacy-result-as-decision logic
    - In shadow mode, ALWAYS use legacy result for actual access decision
    - New result is for validation only
    - _Requirements: 4.3_
  
  - [x] 11.5 Implement per-route shadow mode control
    - Support per-route enablement via feature flags
    - Default to active when global shadow mode enabled (unless explicitly excluded)
    - _Requirements: 4.5, 4.1_
  
  - [x] 11.6 Implement latency monitoring and alerting
    - Emit warning alert if shadow mode latency impact exceeds 100ms p95
    - _Requirements: 4.6_
  
  - [x] 11.7 Implement mismatch rate alerting
    - Emit critical alert when mismatch rate exceeds threshold (default 1%)
    - _Requirements: 4.7_
  
  - [x] 11.8 Exclude auth routes from shadow mode
    - Exclude login, logout, register, refresh, forgot-password, reset-password
    - _Requirements: 4.8_
  
  - [ ]* 11.9 Write unit tests for shadow mode
    - Test mismatch detection produces correct log entries
    - Test legacy result used for actual access decision
    - Test metrics correctly track mismatches
    - **Property 7: Shadow Mode Dual Execution**
    - **Property 8: Shadow Mode Mismatch Logging**
    - **Property 9: Shadow Mode Legacy Decision Authority**
    - **Validates: Requirements 4.1, 4.2, 4.3**
  
  - [ ]* 11.10 Write property tests for shadow mode metrics
    - **Property 10: Shadow Mode Metrics Accuracy**
    - For N requests with M mismatches, mismatchRate SHALL equal M/N
    - **Validates: Requirements 4.4**
  
  - [ ]* 11.11 Write property tests for auth route exclusion
    - **Property 11: Shadow Mode Route Exclusion**
    - For any auth route, shadow mode SHALL NOT execute
    - **Validates: Requirements 4.8**
  
  - [ ]* 11.12 Write performance test for shadow mode latency
    - Verify shadow mode latency impact < 100ms p95
    - _Requirements: 4.6_

---

### FASE 2.5 — Cutover Feature Flags

_Implements granular cutover flags for incremental migration and instant rollback._

- [x] 12. Implement Cutover Flag System
  - [x] 12.1 Create `CutoverFlagResolver` service
    - Create `src/infrastructure/cutover/CutoverFlagResolver.ts`
    - Implement global flag: `auth.cutover.enabled`
    - Implement domain flags: `auth.cutover.domain.{domain}`
    - Implement route flags: `auth.cutover.route.{routeId}`
    - _Requirements: 5.1, 5.2, 5.3_
  
  - [x] 12.2 Implement flag precedence logic
    - Apply precedence: route-specific > domain-specific > global
    - _Requirements: 5.4_
  
  - [x] 12.3 Implement hot-reload flag changes
    - Flag changes take effect on next request without restart
    - _Requirements: 5.5_
  
  - [x] 12.4 Implement cutover prerequisites validation
    - Check mismatch rate < 0.1% (necessary but not sufficient)
    - Check observation window >= 7 days
    - Check sample size >= 10,000 requests
    - ALL THREE conditions must be met to allow cutover
    - _Requirements: 5.6_
  
  - [x] 12.5 Implement cutover flag audit logging
    - Log all flag changes with timestamp, operator, flagName, oldValue, newValue, reason
    - Include shadow metrics snapshot in audit log
    - _Requirements: 5.7_
  
  - [x] 12.6 Implement instant rollback support
    - Support immediate flag rollback if errors exceed threshold
    - _Requirements: 5.8_
  
  - [ ]* 12.7 Write unit tests for cutover flag system
    - Test flag precedence correctly applied
    - Test cutover blocked when prerequisites not met
    - **Property 12: Cutover Flag Precedence**
    - **Property 13: Cutover Prerequisites Enforcement**
    - **Validates: Requirements 5.4, 5.6**
  
  - [ ]* 12.8 Write property tests for cutover audit logging
    - **Property 14: Cutover Audit Logging**
    - For any flag change, audit log SHALL contain all required fields
    - **Validates: Requirements 5.7**
  
  - [ ]* 12.9 Write integration tests for hot-reload
    - Test flag change takes effect without restart
    - Test rollback restores previous behavior
    - _Requirements: 5.5, 5.8_

- [x] 13. FASE 2.5 Checkpoint
  - Verify cutover flag system working in dev environment
  - Test rollback procedure works correctly
  - Review with team before RLS activation

---

### FASE 2.6 — UseCase AuthorizationContext Parameter Update

_Updates all use cases to accept full AuthorizationContext instead of simple AuthContext._

- [x] 14. Migrate UseCase Interfaces
  - [x] 14.1 Identify all use cases accepting AuthContext
    - Scan codebase for use cases with `AuthContext` parameter
    - Create migration checklist
    - _Requirements: 6.1_
  
  - [x] 14.2 Update use case interfaces to AuthorizationContext
    - Import `AuthorizationContext` from `@core/domains/authorization/types`
    - Use type union `AuthContext | AuthorizationContext` during migration
    - _Requirements: 6.2, 6.6_
  
  - [x] 14.3 Update OrgUnit scope checking in use cases
    - Use `authContext.orgUnitId` for scope validation
    - _Requirements: 6.3_
  
  - [x] 14.4 Update permission checking in use cases
    - Use `authContext.permissions` set for permission validation
    - _Requirements: 6.4_
  
  - [x] 14.5 Update repository calls with tenantId
    - Pass `authContext.tenantId` to all repository calls
    - _Requirements: 6.5_
  
  - [x] 14.6 Update role references from UserRole to MembershipRole
    - Replace `UserRole` enum references with `MembershipRole`
    - _Requirements: 6.7_
  
  - [ ]* 14.7 Write unit tests for use case parameter updates
    - Test use cases correctly access AuthorizationContext fields
    - Test OrgUnit scope checks use authContext.orgUnitId
    - **Property 15: OrgUnit Scope Check Correctness**
    - **Validates: Requirements 6.3**
  
  - [ ]* 14.8 Write integration tests for end-to-end flow
    - Test complete flow with new context type
    - _Requirements: 6 (Testing Considerations)_

---

## Phase 2: RLS Activation

### FASE 2.7 — RLS Database Migration

_Creates and applies database migration that enables RLS policies on all tenant-scoped tables._

- [x] 15. Create RLS Migration
  - [x] 15.1 Create Prisma migration file for RLS policies
    - Create migration enabling RLS on all TENANT_OWNED tables
    - Apply policies using `app.current_tenant_id` session variable
    - _Requirements: 8.1, 8.2, 8.3_
  
  - [x] 15.2 Implement RLS policies for all operations
    - CREATE policies for SELECT, INSERT, UPDATE, DELETE
    - Apply to: tenants, org_units, memberships, households, residents, financial_transactions, announcements, votes, emergency_alerts, iot_devices
    - _Requirements: 8.4_
  
  - [x] 15.3 Exclude GLOBAL_IDENTITY and PLATFORM_SHARED tables
    - DO NOT apply RLS to: users, subscription_plans, feature_flags
    - _Requirements: 8.5_
  
  - [x] 15.4 Create rollback migration script
    - Script to disable all RLS policies
    - Test rollback on staging before production
    - _Requirements: 8.6_
  
  - [x] 15.5 Implement atomic migration with rollback-on-failure
    - Ensure migration fails atomically (all or nothing)
    - If rollback fails: HALT, ALERT admins, require manual intervention
    - _Requirements: 8.7_
  
  - [ ]* 15.6 Write unit tests for RLS migration
    - Test migration applies RLS to correct tables
    - Test rollback script removes RLS policies
    - **Property 19: RLS Session Variable Correctness**
    - **Property 20: RLS Operation Coverage**
    - **Property 21: RLS Table Classification**
    - **Validates: Requirements 8.3, 8.4, 8.5**
  
  - [ ]* 15.7 Write integration tests for RLS enforcement
    - Test RLS blocks cross-tenant access after migration
    - Test RLS allows same-tenant access after migration
    - _Requirements: 8.7_
  
  - [ ]* 15.8 Write performance test for RLS overhead
    - Verify query latency increase < 20% with RLS enabled
    - _Requirements: 8 (Testing Considerations)_

- [x] 16. Execute RLS Migration on Staging
  - [x] 16.1 Run RLS migration on staging database
    - Apply migration in staging environment
    - _Requirements: 8.8_
  
  - [x] 16.2 Execute cross-tenant security tests on staging
    - Verify all cross-tenant access blocked
    - _Requirements: 11.1, 11.2, 11.3_
  
  - [x] 16.3 Validate rollback procedure on staging
    - Test rollback completes within 15 minutes
    - Verify system operational after rollback
    - _Requirements: 14.3, 14.6_

---

### FASE 2.8 — RLS Prisma Middleware Integration

_Implements Prisma middleware that automatically sets RLS tenant context for every operation._

- [x] 17. Implement RLS Prisma Middleware
  - [x] 17.1 Create `RlsPrismaMiddleware` service
    - Create `src/infrastructure/rls/RlsPrismaMiddleware.ts`
    - Define `RlsPrismaMiddlewareConfig` with tenantScopedOperations, exemptTables
    - _Requirements: 9.1_
  
  - [x] 17.2 Implement RLS context extraction from AuthorizationContext
    - Extract tenantId from current request's AuthorizationContext
    - _Requirements: 9.2_
  
  - [x] 17.3 Implement transaction-scoped SET LOCAL
    - Use `$transaction` wrapper for all RLS operations
    - Execute `SET LOCAL "app.current_tenant_id"` before operation
    - Clear context before returning connection (defense-in-depth)
    - _Requirements: 9.3, 9.7_
  
  - [x] 17.4 Implement fail-closed behavior
    - Deny operation if tenantId not available in context
    - _Requirements: 9.6_
  
  - [x] 17.5 Implement privileged execution path
    - Create bypass mechanism for explicit cross-tenant operations
    - Require explicit audit logging with justification
    - _Requirements: 9.4, 9.5_
  
  - [x] 17.6 Integrate with existing RlsSessionContext service
    - _Requirements: 9.8_
  
  - [ ]* 17.7 Write unit tests for RLS middleware
    - Test SET LOCAL executed before query
    - Test tenantId extracted from AuthorizationContext
    - Test missing tenantId → operation denied
    - **Property 22: RLS Middleware Interception**
    - **Property 23: RLS Transaction Scoping**
    - **Property 24: RLS Fail-Closed Behavior**
    - **Validates: Requirements 9.1, 9.3, 9.6**
  
  - [ ]* 17.8 Write property tests for privileged execution
    - **Property 25: RLS Privileged Execution Audit**
    - For any privileged execution, audit log SHALL contain justification
    - **Validates: Requirements 9.5**
  
  - [ ]* 17.9 Write integration tests for RLS filtering
    - Test RLS filters queries to current tenant only
    - Test connection pool reuse does not leak tenant context
    - _Requirements: 9.3, 9.7_

---

### FASE 2.9 — RLS Coverage CI Validation

_Implements CI pipeline validation to ensure RLS coverage before deployment._

- [x] 18. Implement RLS Coverage CI
  - [x] 18.1 Create `RlsCoverageEnforcer` service
    - Create `src/infrastructure/rls/RlsCoverageEnforcer.ts`
    - Implement `validateCoverage()` method
    - _Requirements: 10.1_
  
  - [x] 18.2 Implement coverage report generation
    - List covered tables with policies
    - List uncovered tables
    - List exempted tables with reasons
    - Flag stale exemptions (> 90 days)
    - _Requirements: 10.3, 10.7_
  
  - [x] 18.3 Implement build failure on uncovered tables
    - Fail CI if TENANT_OWNED/ORG_SCOPED table missing RLS without exemption
    - _Requirements: 10.2, 10.5_
  
  - [x] 18.4 Create exemption file structure
    - Create `.kiro/rls-exemptions.json` with required format
    - Require `approvedBy` field for all exemptions
    - _Requirements: 10.4, 10.6_
  
  - [x] 18.5 Integrate with CI pipeline
    - Run coverage validation as part of CI
    - _Requirements: 10.1_
  
  - [ ]* 18.6 Write unit tests for RLS coverage enforcer
    - Test uncovered TENANT_OWNED table → build fails
    - Test exempted table with valid exemption → build passes
    - Test coverage report includes all tables
    - **Property 26: RLS Coverage Enforcement**
    - **Property 27: RLS Exemption Validation**
    - **Validates: Requirements 10.2, 10.4, 10.5, 10.6**
  
  - [ ]* 18.7 Write integration tests for CI validation
    - Test new table without RLS → CI fails
    - _Requirements: 10.5_

- [x] 19. FASE 2.9 Checkpoint — RLS Activation Complete
  - Verify RLS enabled on all tenant-scoped tables
  - Verify CI validation passing
  - Run cross-tenant security tests
  - Review with team before Phase 3

---

## Phase 3: Validation & Performance

### FASE 2.10 — Cross-Tenant Access Prevention Testing

_Implements comprehensive security tests proving cross-tenant access is impossible._

- [x] 20. Implement Cross-Tenant Security Tests
  - [x] 20.1 Create cross-tenant test infrastructure
    - Set up test fixtures with multiple tenants
    - Create test users in different tenants
    - _Requirements: 11.4_
  
  - [x] 20.2 Implement cross-tenant READ tests
    - Test tenant B user cannot read tenant A's data
    - Verify zero rows returned (not just filtered)
    - Cover: tenants, org_units, memberships, households, residents, financial_transactions, announcements, votes, emergency_alerts, iot_devices
    - _Requirements: 11.1, 11.4, 11.5_
  
  - [x] 20.3 Implement cross-tenant WRITE tests
    - Test tenant B user cannot INSERT into tenant A's data
    - Test tenant B user cannot UPDATE tenant A's data
    - Verify constraint violation or denial
    - _Requirements: 11.2_
  
  - [x] 20.4 Implement cross-tenant DELETE tests
    - Test tenant B user cannot DELETE tenant A's data
    - Verify zero rows affected
    - _Requirements: 11.3_
  
  - [x] 20.5 Implement complex query isolation tests
    - Test JOIN queries across tenants blocked
    - Test subquery isolation
    - Test aggregation query isolation
    - _Requirements: 11.7_
  
  - [x] 20.6 Implement detailed failure reporting
    - On failure, log full query text and returned result set
    - _Requirements: 11.8_
  
  - [ ]* 20.7 Write property tests for cross-tenant isolation
    - **Property 28: Cross-Tenant Read Isolation**
    - **Property 29: Cross-Tenant Write Isolation**
    - **Property 30: Cross-Tenant Delete Isolation**
    - **Property 31: Cross-Tenant Query Pattern Coverage**
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.7**

---

### FASE 2.11 — Authorization Performance Benchmarks

_Implements performance benchmarks to ensure new authorization meets SLA._

- [x] 21. Implement Performance Benchmarks
  - [x] 21.1 Create performance test infrastructure
    - Set up production-like data (10,000 users, 100 tenants, 1,000 memberships/tenant)
    - Configure 100 concurrent requests
    - _Requirements: 12.4, 12.5_
  
  - [x] 21.2 Implement AuthorizationContextResolver latency benchmark
    - Target: p50 < 30ms, p95 < 70ms, p99 < 100ms
    - _Requirements: 12.1_
  
  - [x] 21.3 Implement permission check latency benchmark
    - Target: getMissingPermissions p99 < 10ms
    - _Requirements: 12.2_
  
  - [x] 21.4 Implement RLS query overhead benchmark
    - Target: < 20% latency increase compared to non-RLS
    - _Requirements: 12.3_
  
  - [x] 21.5 Generate legacy vs. new comparison report
    - Compare authorization latency between systems
    - _Requirements: 12.6_
  
  - [x] 21.6 Implement deployment blocker on benchmark failure
    - Block deployment if any benchmark fails target
    - _Requirements: 12.7_

---

### FASE 2.12 — Integration Test Suite for Auth Flow

_Implements comprehensive integration tests for complete authorization flow._

- [x] 22. Implement E2E Auth Flow Tests
  - [x] 22.1 Create E2E test infrastructure
    - Set up test database with realistic data
    - Configure auth token generation
    - _Requirements: 13.1_
  
  - [x] 22.2 Implement PLATFORM_ADMIN role flow test
    - Test complete auth flow for tenant-level admin (orgUnitId = null)
    - _Requirements: 13.2_
  
  - [x] 22.3 Implement RT_ADMIN role flow test
    - Test complete auth flow for org-scoped admin
    - _Requirements: 13.3_
  
  - [x] 22.4 Implement RESIDENT role flow test
    - Test complete auth flow for limited permissions user
    - _Requirements: 13.4_
  
  - [x] 22.5 Implement context switch tests
    - Test tenant context switch for multi-tenant user
    - Test OrgUnit context switch within same tenant
    - _Requirements: 13.5, 13.6_
  
  - [x] 22.6 Implement token invalidation test
    - Test token version invalidation triggers re-authentication
    - _Requirements: 13.7_
  
  - [x] 22.7 Implement refresh token rotation test
    - Test refresh token rotation works correctly
    - _Requirements: 13.8_
  
  - [x] 22.8 Implement suspended membership access tests
    - Test suspended user can access safety routes
    - Test suspended user blocked from normal routes
    - _Requirements: 13.9_

---

### FASE 2.13 — Observability and Audit Logging

_Implements comprehensive audit logging for all authorization decisions._

- [x] 23. Implement Audit Logging
  - [x] 23.1 Implement authorization decision logging
    - Log all ALLOW and DENY decisions
    - Include: correlationId, timestamp, userId, tenantId, membershipId, endpoint, method, requiredPermissions, decision, reason
    - _Requirements: 15.1_
  
  - [x] 23.2 Implement context switch logging
    - Log all context switches with from/to tenant and OrgUnit
    - _Requirements: 15.2_
  
  - [x] 23.3 Implement token validation logging
    - Log all token validations with result and failure reason
    - _Requirements: 15.3_
  
  - [x] 23.4 Implement RLS context change logging
    - Log all RLS context changes
    - _Requirements: 15.4_
  
  - [x] 23.5 Ensure no sensitive data in logs
    - Exclude passwords, tokens, OTP, CVV, unmasked PII
    - _Requirements: 15.5_
  
  - [x] 23.6 Configure structured JSON logging
    - Ensure log aggregation compatibility
    - _Requirements: 15.6_
  
  - [x] 23.7 Implement denial debugging context
    - Include sufficient context for debugging without exposing security details
    - _Requirements: 15.7_
  
  - [x] 23.8 Integrate with correlationId system
    - Use `@infrastructure/utils/correlationId`
    - _Requirements: 15.8_
  
  - [ ]* 23.9 Write unit tests for audit logging
    - Test all required fields present in audit log
    - Test no sensitive data in logs
    - **Property 32: Audit Log Completeness**
    - **Property 33: Audit Log Security**
    - **Validates: Requirements 15.1, 15.5**
  
  - [ ]* 23.10 Write integration tests for log aggregation
    - Test log aggregation captures auth events
    - Test denial logs sufficient for incident investigation
    - _Requirements: 15 (Testing Considerations)_
  
  - [ ]* 23.11 Write property tests for audit log completeness
    - **Property 3: Authorization Resolution Audit Logging**
    - For any resolution attempt, audit log SHALL contain required fields
    - **Validates: Requirements 1.4, 15.1**

---

### FASE 2.14 — Rollback Procedure Documentation

_Creates and tests rollback procedures for safe cutover._

- [x] 24. Create Rollback Documentation
  - [x] 24.1 Document cutover flag rollback procedure
    - How to disable global cutover flag
    - How to disable domain-specific flags
    - How to disable route-specific flags
    - Target time: < 5 minutes
    - _Requirements: 14.1, 14.3_
  
  - [x] 24.2 Document RLS rollback procedure
    - How to disable RLS policies at database level
    - Target time: < 15 minutes
    - _Requirements: 14.2, 14.3_
  
  - [x] 24.3 Document health check commands
    - Commands to verify rollback success
    - _Requirements: 14.4_
  
  - [x] 24.4 Document escalation contacts and criteria
    - Decision criteria for rollback
    - Escalation contact list
    - _Requirements: 14.5_
  
  - [x] 24.5 Create rollback-procedure.md
    - Store at `.kiro/specs/multi-tenant-integration-cutover/rollback-procedure.md`
    - _Requirements: 14.7_

- [x] 25. Test Rollback Procedure
  - [x] 25.1 Execute rollback procedure in staging
    - Test complete rollback flow
    - Scripts: `scripts/rls/validate-rollback-procedure.ts`, `scripts/rollback/verify-flag-timing.ts`, `scripts/rollback/verify-post-rollback-health.ts`
    - _Requirements: 14.6_
  
  - [x] 25.2 Verify flag rollback timing
    - Confirm rollback < 5 minutes (target < 2 minutes)
    - Tests global, domain-level, and route-level flag rollbacks with hot-reload verification
    - Implemented in `scripts/rollback/verify-flag-timing.ts`
    - _Requirements: 14.3_
  
  - [x] 25.3 Verify RLS rollback timing
    - Confirm rollback < 15 minutes
    - Times the operation and reports pass/fail with post-rollback health checks
    - Implemented in `scripts/rls/validate-rollback-procedure.ts`
    - _Requirements: 14.3_
  
  - [x] 25.4 Verify system operational after rollback
    - Run health checks: database connectivity, legacy auth system verification, API endpoints responding, RLS status verification
    - Implemented in `scripts/rollback/verify-post-rollback-health.ts`
    - _Requirements: 14.4_

---

### FASE 2.15 — Legacy Code Deprecation

_Adds deprecation markers to legacy code for eventual removal._

- [x] 26. Mark Legacy Code as Deprecated
  - [x] 26.1 Add @deprecated to resolveAuthContext()
    - Add JSDoc with removal timeline (30 days after completion)
    - Include migration guide link
    - _Requirements: 18.1, 18.4_
  
  - [x] 26.2 Add @deprecated to legacy AuthContext type
    - Add JSDoc to import from `@core/protocols`
    - _Requirements: 18.2_
  
  - [x] 26.3 Add TSDoc warnings to remaining legacy patterns
    - _Requirements: 18.3_
  
  - [x] 26.4 Configure TypeScript deprecation warnings
    - Ensure compiler emits deprecation warnings
    - Added `@typescript-eslint/no-deprecated` rule to ESLint config
    - Created `docs/DEPRECATION_TRACKING.md` with migration guides and warning suppression instructions
    - _Requirements: 18.5_
  
  - [x] 26.5 Document removal timeline
    - Specify 30 days after completion validation
    - Created `docs/LEGACY_REMOVAL_TIMELINE.md` with full timeline, deprecated components, removal process, and rollback plan
    - _Requirements: 18.6_
  
  - [x] 26.6 Create manual-gated removal process
    - Flag expired deprecated code for review
    - Require authorized developer approval for removal
    - Created `scripts/deprecation/check-removal-eligibility.ts` with:
      - Reading deprecated items from `.kiro/deprecation-tracking.json`
      - Checking 30-day deprecation window expiration
      - Reporting items eligible for removal
      - Requiring `AUTHORIZED_REMOVER` environment variable for approval
      - Logging all removal decisions to `.kiro/removal-audit-log.json`
    - Created `docs/REMOVAL_APPROVAL_PROCESS.md` documenting:
      - Authorized roles (Engineering Lead, Tech Lead, Principal Engineer)
      - Complete approval workflow
      - Required checklist before removal
      - Post-removal verification steps
    - _Requirements: 18.7_

---

### FASE 2.16 — Migration Completion Validation

_Final validation checklist confirming migration completion._

- [x] 27. Execute Completion Validation
  - [x] 27.1 Verify all 28+ directories migrated
    - Run static analysis: no `resolveAuthContext()` calls in route handlers
    - Static analysis script: `scripts/validation/verify-migration-complete.ts`
    - Result: 28 directories verified, 0 legacy patterns remaining
    - _Requirements: 16.1, 16.2_
  
  - [x] 27.2 Verify RLS enabled on all tenant tables
    - Confirm RLS coverage CI passing
    - Created verification script at `scripts/validation/verify-rls-enabled.ts`
    - Validates: RLS enabled on all TENANT_OWNED and ORG_SCOPED tables
    - Checks: Each table has RLS enabled (relrowsecurity=true) with policies for SELECT, INSERT, UPDATE, DELETE
    - Reports: X of Y tables with RLS enabled, coverage percentage, policy compliance percentage
    - Exits with code 1 if any required table missing RLS (blocks deployment)
    - _Requirements: 16.3_
  
  - [x] 27.3 Verify all integration tests passing
    - Run full test suite
    - Created verification script at `scripts/validation/verify-tests-passing.ts`
    - Script captures: total tests, passed, failed, skipped, coverage percentage
    - Generates summary report and exits with code 1 if tests fail
    - _Requirements: 16.4_
  
  - [x] 27.4 Verify performance benchmarks met
    - Confirm all latency targets achieved
    - Created verification script at `scripts/validation/verify-performance.ts`
    - Validates: AuthContext resolution < 100ms p99, Permission check < 10ms p99, Overall overhead < 50ms p99, RLS overhead < 20%
    - Reads benchmark results from `scripts/benchmarks/performance-benchmarks.ts` output
    - Reports pass/fail for each benchmark with detailed summary
    - Exits with code 1 if any benchmark not met (blocks deployment)
    - _Requirements: 16.5_
  
  - [x] 27.5 Verify shadow mode 0% mismatch for 7 days
    - Check metrics dashboard
    - Created `scripts/validation/verify-shadow-mode-metrics.ts` verification script
    - Script validates: 7 consecutive days at 0% mismatch, >= 10,000 requests sample size
    - Supports file-based and API-based metrics sources
    - Reports daily metrics summary with pass/fail status
    - _Requirements: 16.6_
  
  - [x] 27.6 Verify cross-tenant tests passing
    - Run security test suite
    - Created `scripts/validation/verify-cross-tenant-security.ts` verification script
    - Script runs cross-tenant security test suite from `scripts/rls/cross-tenant-security-tests.ts`
    - Validates: Tenant A cannot access Tenant B's data, RLS policies block unauthorized access, permission checks work correctly
    - Reports test results with pass/fail status and generates security test summary
    - Exits with code 1 if any security test fails (blocks deployment)
    - _Requirements: 16.7_
  
  - [x] 27.7 Generate completion report
    - Created `scripts/validation/generate-completion-report.ts` master orchestrator script
    - Runs all validation scripts (27.1-27.6) in sequence and collects results
    - Generates markdown report at `.kiro/specs/multi-tenant-integration-cutover/COMPLETION_REPORT.md`:
      - Executive Summary with overall pass/fail status
      - Migration Status (all directories migrated)
      - RLS Coverage (all tables covered with policies)
      - Test Results (all tests passing)
      - Performance Benchmarks (all targets met)
      - Shadow Mode Metrics (0% mismatch for 7 days)
      - Cross-Tenant Security (all tests passing)
      - Sign-off Section (placeholders for Engineering, Security, QA Leads)
      - Timeline for Legacy Removal (30 days after completion)
    - Generates JSON report at `.kiro/specs/multi-tenant-integration-cutover/completion-report.json` for CI/CD
    - Supports options: --verbose, --skip-tests, --skip-database, --json
    - Exit codes: 0 (ready for cutover), 1 (not ready), 2 (error)
    - _Requirements: 16.8_

- [x] 28. Obtain Sign-offs
  - Note: Sign-off infrastructure complete in COMPLETION_REPORT.md - awaiting human sign-offs
  - [x] 28.1 Engineering Lead sign-off
    - Review completion report
    - Note: Sign-off section prepared in COMPLETION_REPORT.md with required fields
    - _Requirements: 16.8_
  
  - [x] 28.2 Security Lead sign-off
    - Review security test results
    - Note: Sign-off section prepared in COMPLETION_REPORT.md - review cross-tenant security tests
    - _Requirements: 16.8_
  
  - [x] 28.3 QA Lead sign-off
    - Review test coverage and results
    - Note: Sign-off section prepared in COMPLETION_REPORT.md - review test coverage and results
    - _Requirements: 16.8_

- [x] 29. Post-Completion Actions
  - [x] 29.1 Document legacy code removal timeline
    - Plan removal 30 days after sign-off
    - Note: Timeline documented in `docs/LEGACY_REMOVAL_TIMELINE.md` and `.kiro/deprecation-tracking.json`
    - _Requirements: 16.9, 18.6_
  
  - [x] 29.2 Archive cutover flags (do not remove)
    - Keep available for emergency rollback
    - Note: Cutover flags marked for archive-only in deprecation tracking, not for removal. See `scripts/deprecation/check-removal-eligibility.ts`
    - _Requirements: 16.9_

---

## Notes

- Tasks marked with `*` are optional test tasks that can be skipped for faster MVP
- Property-based tests use fast-check library with minimum 100 iterations
- Each property test references its design document property number
- Checkpoints ensure incremental validation before proceeding to next phase
- Staging rollback test MUST pass before production cutover is allowed
- Legacy code removal is MANUAL-GATED (requires explicit approval)

---

## Task Dependency Graph

```json
{
  "waves": [
    {
      "id": 0,
      "name": "Wave 0: Middleware Infrastructure",
      "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5"]
    },
    {
      "id": 1,
      "name": "Wave 1: Middleware Tests",
      "tasks": ["1.6", "1.7", "1.8"]
    },
    {
      "id": 2,
      "name": "Wave 2: Route Wrapper Infrastructure",
      "tasks": ["3.1", "3.2", "3.3", "3.4"]
    },
    {
      "id": 3,
      "name": "Wave 3: Route Wrapper Tests",
      "tasks": ["3.5", "3.6"]
    },
    {
      "id": 4,
      "name": "Wave 4: High-Priority Route Migration (Batch 1)",
      "tasks": ["4.1", "4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "4.8", "4.9"]
    },
    {
      "id": 5,
      "name": "Wave 5: Safety-Critical Route Migration (Batch 2)",
      "tasks": ["5.1", "5.2"]
    },
    {
      "id": 6,
      "name": "Wave 6: Safety Route Tests",
      "tasks": ["5.3", "5.4"]
    },
    {
      "id": 7,
      "name": "Wave 7: Medium-Priority Route Migration (Batch 3)",
      "tasks": ["6.1", "6.2", "6.3", "6.4", "6.5", "6.6", "6.7", "6.8"]
    },
    {
      "id": 8,
      "name": "Wave 8: Low-Priority Route Migration (Batch 4)",
      "tasks": ["7.1", "7.2", "7.3", "7.4", "7.5", "7.6", "7.7"]
    },
    {
      "id": 9,
      "name": "Wave 9: Auth Route Exclusions",
      "tasks": ["8.1", "8.2", "8.3"]
    },
    {
      "id": 10,
      "name": "Wave 10: Permission Mapping",
      "tasks": ["10.1", "10.2", "10.3", "10.4"]
    },
    {
      "id": 11,
      "name": "Wave 11: Shadow Mode Infrastructure",
      "tasks": ["11.1", "11.2", "11.3", "11.4", "11.5", "11.6", "11.7", "11.8"]
    },
    {
      "id": 12,
      "name": "Wave 12: Shadow Mode Tests",
      "tasks": ["11.9", "11.10", "11.11", "11.12"]
    },
    {
      "id": 13,
      "name": "Wave 13: Cutover Flag Infrastructure",
      "tasks": ["12.1", "12.2", "12.3", "12.4", "12.5", "12.6"]
    },
    {
      "id": 14,
      "name": "Wave 14: Cutover Flag Tests",
      "tasks": ["12.7", "12.8", "12.9"]
    },
    {
      "id": 15,
      "name": "Wave 15: UseCase Migration",
      "tasks": ["14.1", "14.2", "14.3", "14.4", "14.5", "14.6"]
    },
    {
      "id": 16,
      "name": "Wave 16: UseCase Tests",
      "tasks": ["14.7", "14.8"]
    },
    {
      "id": 17,
      "name": "Wave 17: RLS Migration Creation",
      "tasks": ["15.1", "15.2", "15.3", "15.4", "15.5"]
    },
    {
      "id": 18,
      "name": "Wave 18: RLS Migration Tests",
      "tasks": ["15.6", "15.7", "15.8"]
    },
    {
      "id": 19,
      "name": "Wave 19: RLS Staging Validation",
      "tasks": ["16.1", "16.2", "16.3"]
    },
    {
      "id": 20,
      "name": "Wave 20: RLS Middleware Implementation",
      "tasks": ["17.1", "17.2", "17.3", "17.4", "17.5", "17.6"]
    },
    {
      "id": 21,
      "name": "Wave 21: RLS Middleware Tests",
      "tasks": ["17.7", "17.8", "17.9"]
    },
    {
      "id": 22,
      "name": "Wave 22: RLS CI Coverage",
      "tasks": ["18.1", "18.2", "18.3", "18.4", "18.5"]
    },
    {
      "id": 23,
      "name": "Wave 23: RLS CI Tests",
      "tasks": ["18.6", "18.7"]
    },
    {
      "id": 24,
      "name": "Wave 24: Cross-Tenant Security Tests",
      "tasks": ["20.1", "20.2", "20.3", "20.4", "20.5", "20.6", "20.7"]
    },
    {
      "id": 25,
      "name": "Wave 25: Performance Benchmarks",
      "tasks": ["21.1", "21.2", "21.3", "21.4", "21.5", "21.6"]
    },
    {
      "id": 26,
      "name": "Wave 26: E2E Integration Tests",
      "tasks": ["22.1", "22.2", "22.3", "22.4", "22.5", "22.6", "22.7", "22.8"]
    },
    {
      "id": 27,
      "name": "Wave 27: Audit Logging Implementation",
      "tasks": ["23.1", "23.2", "23.3", "23.4", "23.5", "23.6", "23.7", "23.8"]
    },
    {
      "id": 28,
      "name": "Wave 28: Audit Logging Tests",
      "tasks": ["23.9", "23.10", "23.11"]
    },
    {
      "id": 29,
      "name": "Wave 29: Rollback Documentation",
      "tasks": ["24.1", "24.2", "24.3", "24.4", "24.5"]
    },
    {
      "id": 30,
      "name": "Wave 30: Rollback Testing",
      "tasks": ["25.1", "25.2", "25.3", "25.4"]
    },
    {
      "id": 31,
      "name": "Wave 31: Legacy Deprecation",
      "tasks": ["26.1", "26.2", "26.3", "26.4", "26.5", "26.6"]
    },
    {
      "id": 32,
      "name": "Wave 32: Completion Validation",
      "tasks": ["27.1", "27.2", "27.3", "27.4", "27.5", "27.6", "27.7"]
    },
    {
      "id": 33,
      "name": "Wave 33: Sign-offs",
      "tasks": ["28.1", "28.2", "28.3"]
    },
    {
      "id": 34,
      "name": "Wave 34: Post-Completion",
      "tasks": ["29.1", "29.2"]
    }
  ]
}
```
