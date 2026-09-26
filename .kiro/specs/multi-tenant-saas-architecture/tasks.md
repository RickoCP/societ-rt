# Implementation Plan: Multi-Tenant SaaS Architecture

## Overview

Implementation plan for Multi-Tenant SaaS Architecture following Clean Architecture principles with phased migration strategy. Tasks follow strict dependency order: Additive → Backfill/Compatibility → New Read Path → Shadow Validation → Controlled Cutover → Stop Legacy Writes → Stabilization → RLS Enforcement → Legacy Cleanup.

| Field | Value |
|-------|-------|
| Version | 1.1.1 |
| Status | PLANNING — FINAL RECONCILIATION |
| Requirements Source | requirements.md V1_FROZEN (62 requirements) |
| Design Source | design.md V1.3 FROZEN |
| Tag Reference | master-architecture-design-v1 |
| Created | 2026-09-24 |
| Reconciled | 2026-09-24 (TPR-01 through TPR-08, TPR-05-FINAL) |

## Tasks

### FASE 1.6 — Membership Read Model / Repository
- [x] 1. Membership Domain Types
- [x] 2. Membership Repository Interface
- [x] 3. Quarantine Manifest Configuration
- [x] 4. Membership Repository Prisma Adapter
- [x] 5. Membership Resolution Logic
- [x] 6. OrgUnit Hierarchy Read Support
- [x] 7. DomainResult Pattern Implementation
- [x] 8. Unit Tests for Membership Repository
- [x] 9. Integration Tests with M2 Fixtures
- [x] 10. Property-Based Tests
- [x] 11. FASE 1.6 Validation Gate

### FASE 1.7 — Centralized Authorization Foundation
- [x] 12. Permission Registry Implementation
- [x] 13. Authorization Context Resolver
- [x] 14. Route Authorization Decorator
- [x] 15. OrgUnit Scope Authorizer
- [x] 16. FASE 1.7 Unit Tests
- [x] 17. FASE 1.7 Validation Gate

### FASE 1.8 — Active Tenant / OrgUnit Context
- [x] 18. Context Switch Service
- [x] 19. JWT Claims Update
- [x] 20. FASE 1.8 Tests and Validation Gate

### FASE 1.9 — Shadow Authorization Validation
- [x] 21. Shadow Authorization Service
- [x] 22. Shadow Mode Feature Flag
- [x] 23. FASE 1.9 Validation Gate

### FASE 1.9.5 — Pre-Cutover Write Compatibility Gate
- [x] 24. Pre-Cutover Authorization Write Compatibility

### FASE 1.10 — Authorization Cutover
- [x] 25. Authorization Cutover Service
- [x] 26. Cutover Execution and Monitoring
- [x] 27. FASE 1.10 Validation Gate

### FASE 1.11 — Post-Cutover Write Path Finalization
- [x] 28. Post-Cutover Write Path Finalization
- [x] 29. FASE 1.11 Validation Gate

### FASE 1.12 — PostgreSQL RLS
- [x] 30. RLS Policy Implementation
- [x] 31. RLS Coverage Enforcement
- [x] 32. FASE 1.12 Validation Gate

### FASE 1.13 — Legacy Data Remediation
- [x] 33. Evidence-Based Remediation Workflow
- [x] 34. FASE 1.13 Validation Gate

### FASE 1.14 — Remove User.tenantId Dependency
- [x] 35. Code Path Analysis and Update
- [x] 36. FASE 1.14 Validation Gate

### FASE 1.15 — Legacy Cleanup
- [x] 37. Legacy Schema Cleanup
- [x] 38. FASE 1.15 Validation Gate

### FASE 1.16 — Session / Refresh Token Hardening
- [x] 39. Refresh Token Implementation
- [x] 40. Token Security Hardening (Req 51)
- [x] 41. Session Invalidation (Req 52)
- [x] 42. Refresh Token Security (Req 53)
- [x] 43. FASE 1.16 Validation Gate

### FASE 1.17 — Subscription / Entitlement
- [x] 44. Subscription Plan Management
- [x] 45. Entitlement Enforcer
- [x] 46. Safety-Critical Protection
- [x] 47. Billing and Payment Integration (Req 57)
- [x] 48. FASE 1.17 Validation Gate

### FASE 1.18 — Tenant Onboarding / Membership Lifecycle
- [x] 49. Tenant Onboarding Flow
- [x] 50. Membership Lifecycle Management
- [x] 51. Delegation Matrix Implementation
- [x] 52. Tenant Transfer Flow (Req 27)
- [x] 53. Membership Invitation Flow (Req 31)
- [x] 54. Admin Membership Management (Req 50)
- [x] 55. Household Isolation Enforcement (INV-HOUSEHOLD-001)
- [x] 56. FASE 1.18 Validation Gate

### FASE 1.19 — OrgUnit Hierarchy Management
- [x] 57. OrgUnit Management Service
- [x] 58. OrgUnit CRUD Operations (Req 34)
- [x] 59. Multi-Cluster Support (Req 58)
- [x] 60. IoT Device Isolation Enforcement (INV-IOT-001)
- [x] 61. FASE 1.19 Validation Gate

### FASE 1.20 — Audit / Security Context
- [x] 62. Audit Trail Implementation
- [x] 63. Authorization Concurrency Handling (Req 28)
- [x] 64. Cache Invalidation Strategy (Req 29)
- [x] 65. Audit Security Events (Req 30)
- [x] 66. Batch Operations Support (Req 33)
- [x] 67. Permission Sync Mechanism (Req 35)
- [x] 68. Tenant Data Isolation Audit (Req 38)
- [x] 69. Authorization Error Handling (Req 39)
- [x] 70. Security Event Logging (Req 55)
- [x] 71. Notification Security (Req 56)
- [x] 72. Cross-Tenant Prevention Validation (Req 59)
- [x] 73. Error Code Standardization (Req 61)
- [x] 74. FASE 1.20 Validation Gate

### FASE 1.21 — Multi-Tenant Security Validation
- [x] 75. Security Validation Suite
- [x] 76. Security Testing Suite (Req 37)
- [x] 77. FASE 1.21 Validation Gate

### FASE 1.22 — Operational / Performance Validation
- [x] 78. Performance Validation
- [x] 79. Disaster Recovery Testing (Req 32)
- [x] 80. Performance Targets Validation (Req 40)
- [x] 81. FASE 1.22 Validation Gate

### FASE 1.23 — Architecture Implementation Freeze
- [x] 82. Implementation Freeze Checklist
- [x] 83. Architecture Freeze Tag

## Task Dependency Graph

```json
{
  "waves": [
    {
      "name": "Wave 1: Foundation - Membership Read Model (FASE 1.6)",
      "tasks": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    },
    {
      "name": "Wave 2: Authorization Foundation (FASE 1.7)",
      "tasks": [12, 13, 14, 15, 16, 17],
      "dependsOn": [11]
    },
    {
      "name": "Wave 3: Context Switching (FASE 1.8)",
      "tasks": [18, 19, 20],
      "dependsOn": [17]
    },
    {
      "name": "Wave 4: Shadow Validation (FASE 1.9)",
      "tasks": [21, 22, 23],
      "dependsOn": [20]
    },
    {
      "name": "Wave 4.5: Pre-Cutover Write Compatibility (FASE 1.9.5)",
      "tasks": [24],
      "dependsOn": [23],
      "gate": "WRITE_COMPATIBILITY_GATE: IMPLEMENT + VERIFY — zero legacy-only auth writers, all auth-affecting writes synchronized"
    },
    {
      "name": "Wave 5: Authorization Cutover (FASE 1.10)",
      "tasks": [25, 26, 27],
      "dependsOn": [24],
      "gate": "SECURITY_GATE: mismatch rate < 0.1% AND pre-cutover write compatibility PASS (Task 24 complete)"
    },
    {
      "name": "Wave 6: Post-Cutover Write Path Finalization (FASE 1.11)",
      "tasks": [28, 29],
      "dependsOn": [27],
      "gate": "CUTOVER_STABLE_GATE: all routes cut over and stable"
    },
    {
      "name": "Wave 7: RLS Implementation (FASE 1.12)",
      "tasks": [30, 31, 32],
      "dependsOn": [29]
    },
    {
      "name": "Wave 8: Legacy Remediation (FASE 1.13)",
      "tasks": [33, 34],
      "dependsOn": [32]
    },
    {
      "name": "Wave 9: Remove tenantId Dependencies (FASE 1.14)",
      "tasks": [35, 36],
      "dependsOn": [34]
    },
    {
      "name": "Wave 10: Legacy Cleanup (FASE 1.15)",
      "tasks": [37, 38],
      "dependsOn": [36],
      "gate": "DESTRUCTIVE_GATE: 24-hour stabilization"
    },
    {
      "name": "Wave 11: Refresh Tokens (FASE 1.16)",
      "tasks": [39, 40, 41, 42, 43],
      "dependsOn": [38]
    },
    {
      "name": "Wave 12: Subscription & Entitlement (FASE 1.17)",
      "tasks": [44, 45, 46, 47, 48],
      "dependsOn": [43]
    },
    {
      "name": "Wave 13: Tenant & Membership Lifecycle (FASE 1.18)",
      "tasks": [49, 50, 51, 52, 53, 54, 55, 56],
      "dependsOn": [48]
    },
    {
      "name": "Wave 14: OrgUnit Management (FASE 1.19)",
      "tasks": [57, 58, 59, 60, 61],
      "dependsOn": [56]
    },
    {
      "name": "Wave 15: Audit Trail (FASE 1.20)",
      "tasks": [62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74],
      "dependsOn": [61]
    },
    {
      "name": "Wave 16: Security Validation (FASE 1.21)",
      "tasks": [75, 76, 77],
      "dependsOn": [74],
      "gate": "SECURITY_GATE: all isolation tests pass"
    },
    {
      "name": "Wave 17: Performance Validation (FASE 1.22)",
      "tasks": [78, 79, 80, 81],
      "dependsOn": [77]
    },
    {
      "name": "Wave 18: Architecture Freeze (FASE 1.23)",
      "tasks": [82, 83],
      "dependsOn": [81]
    }
  ]
}
```

## Notes

### Task Plan Reconciliation V1.1

| Code | Correction |
|------|------------|
| TPR-01 | Versioned Quarantine Manifest (no hardcoded UUIDs in business logic) |
| TPR-02 | OrgUnit Read/Policy Separation (FASE 1.6 policy-neutral) |
| TPR-03 | Status-Aware Membership Resolution (no emergency policy in resolution) |
| TPR-04 | ACTIVE Query Not Sole Authority (status-aware reads) |
| TPR-05 | Pre-Cutover Write Compatibility Gate (blocking dependency) |
| TPR-05-FINAL | Pre-Cutover Write Compatibility Sequencing: auth-critical sync implemented (not just verified) before cutover; Task 24 = IMPLEMENT + verify + gate; Task 28 = post-cutover finalization |
| TPR-06 | Shadow Threshold Semantics (warning vs cutover) |
| TPR-07 | Destructive Cleanup Ordering (stabilization before drop) |
| TPR-08 | Executable Requirement/Invariant Traceability |

### Migration Strategy Overview

Tasks follow this dependency order (NO deviation without explicit review):

1. **Additive** — New models, interfaces, types (no breaking changes)
2. **Backfill / Compatibility** — Dual-write, shadow paths
3. **New Read Path** — New authorization reads alongside legacy
4. **Shadow Validation** — Parallel execution comparing old vs new
5. **Pre-Cutover Write Compatibility** — Inventory, IMPLEMENT required synchronization, verify, and gate (TPR-05-FINAL). Zero legacy-only authorization writers before cutover.
6. **Controlled Cutover** — Per-route migration with rollback
7. **Post-Cutover Write Path Finalization** — Complete write migration, retire legacy writes when safe, verify Membership-authoritative
8. **Stabilization** — Monitoring period before cleanup
9. **RLS Enforcement** — Defense-in-depth (NOT authorization authority)
10. **Legacy Cleanup** — Remove deprecated columns/code (ONLY after verified stability)

### Task Details

#### Task 1: Membership Domain Types
- **Objective:** Define TypeScript types/interfaces for Membership domain model aligned with frozen design.
- **Requirements Covered:** Req 1, Req 3
- **Design Sections:** Components and Interfaces > 3. Membership Model, Membership Resolution Flow
- **Dependencies:** None (foundation task)
- **Files:**
  - `src/core/domains/membership/entities/` — Membership entity types
  - `src/core/domains/membership/types/` — MembershipRole, MembershipStatus enums
  - `src/core/domains/membership/errors/` — Domain error types
- **Database/Schema Impact:** NONE (using existing M1/M2 schema)
- **Migration Impact:** NONE
- **Security Considerations:**
  - membershipId MUST NOT be accepted from external sources
  - Role enum values must match frozen L5 mapping
- **Tenant Isolation Considerations:**
  - Membership.tenantId is required field
  - INV-MEM-001: Membership OrgUnit belongs to Membership tenant
- **Backward Compatibility:** Types must coexist with legacy User.role and User.tenantId
- **Tests Required:**
  - Unit: Type validation, enum exhaustiveness
  - Property: MembershipStatus transitions follow state machine
- **Validation Commands:** TypeScript compilation passes, No `any` types in domain layer
- **Completion Criteria:**
  - Membership interface defined with all fields from design
  - MembershipRole enum: PLATFORM_ADMIN, TENANT_OWNER, ORG_ADMIN, RT_ADMIN, SECURITY, RESIDENT
  - MembershipStatus enum: INVITED, ACTIVE, SUSPENDED, REVOKED
  - MembershipResolutionKey type: {userId, activeTenantId, activeOrgUnitId}
  - Domain error types: AUTH_NO_MEMBERSHIP, AUTH_MEMBERSHIP_INACTIVE, AUTH_USER_QUARANTINED

#### Task 2: Membership Repository Interface (TPR-04 Applied)
- **Objective:** Define repository contract for Membership queries, independent of database implementation. Repository supports status-aware authoritative membership reads with ACTIVE-only convenience queries.
- **Requirements Covered:** Req 1 (AC 1-7)
- **Design Sections:** Membership Resolution Flow, Membership Invariants
- **Dependencies:** Task 1
- **Files:**
  - `src/core/domains/membership/repositories/` — IMembershipRepository interface
- **Database/Schema Impact:** NONE
- **Migration Impact:** NONE
- **Security Considerations:**
  - Interface MUST support quarantine exclusion
  - Interface MUST support status-aware authoritative reads (not only ACTIVE-only)
- **Tenant Isolation Considerations:** All queries MUST include tenantId filter option
- **Backward Compatibility:** Interface is new; no legacy code affected
- **Tests Required:** Unit: Interface contract validation (compile-time)
- **Validation Commands:** TypeScript strict mode passes
- **Completion Criteria:**
  - findByUserId(userId, options?) → Promise<Membership[]>
  - findByUserAndTenant(userId, tenantId) → Promise<Membership[]>
  - findActiveByUserAndTenant(userId, tenantId) → Promise<Membership[]> (convenience query)
  - findByUserAndTenantWithStatus(userId, tenantId) → Promise<Membership[]> (authoritative status-aware)
  - resolveMembership(key: MembershipResolutionKey) → Promise<DomainResult<Membership>> (preserves status)
  - isQuarantined(userId) → Promise<boolean>
  - Options support: includeInactive, excludeQuarantined (default true)
  - Authoritative resolution path MUST preserve Membership.status field

#### Task 3: Quarantine Manifest Configuration (TPR-01 Applied)
- **Objective:** Implement versioned quarantine manifest configuration for PNA-01 through PNA-05 exclusion.
- **Requirements Covered:** Req 1 (AC 7), Req 3 (AC 7), Req 11 (AC 8-9)
- **Design Sections:** Quarantine Manifest table, INV-QUARANTINE-001
- **Dependencies:** Task 1
- **Files:**
  - `src/infrastructure/quarantine/` — QuarantineManifest service
  - `src/infrastructure/quarantine/quarantine-manifest.json` — Versioned configuration artifact
- **Database/Schema Impact:** NONE (manifest is versioned configuration, not DB table)
- **Migration Impact:** NONE
- **Security Considerations:**
  - Manifest MUST exactly match 5 users from PHASE_1_2A_ANOMALY_AUDIT
  - No automatic remediation allowed
  - Unexpected malformed/missing manifest MUST fail safely
- **Tenant Isolation Considerations:** Quarantined users span multiple tenants; this is platform-level
- **Backward Compatibility:** Quarantined users continue to function via legacy path until remediation
- **Tests Required:**
  - Unit: Manifest contains exactly 5 users
  - Unit: isQuarantined returns true for all 5 PNA users
  - Unit: isQuarantined returns false for normal users
  - Unit: Malformed manifest fails safely with clear error
  - Unit: Missing manifest fails safely with clear error
- **Validation Commands:** Verify PNA-01 through PNA-05 UUIDs match audit report
- **Completion Criteria:**
  - Versioned quarantine manifest configuration artifact created
  - Manifest has explicit provenance to frozen M2 anomaly audit (PHASE_1_2A_ANOMALY_AUDIT)
  - Manifest contains exactly 5 quarantine identities with version metadata
  - Manifest is version-controlled (in repository)
  - Loading/validation is deterministic
  - Business/domain logic consumes quarantine abstraction: isQuarantined(userId) function exported
  - UUIDs are NOT duplicated throughout business logic (single source of truth)
  - No database mutation in FASE 1.6
  - Verification that manifest count = 5 at startup
  - Preserve INV-QUARANTINE-001: Quarantined users cannot receive Membership until explicit remediation

#### Task 4: Membership Repository Prisma Adapter
- **Objective:** Implement repository using Prisma against existing M1/M2 schema.
- **Requirements Covered:** Req 1 (AC 1-7)
- **Design Sections:** Components and Interfaces > 3. Membership Model, Data Entity Classification
- **Dependencies:** Task 2, Task 3
- **Files:**
  - `src/infrastructure/repositories/membership/` — PrismaMembershipRepository
- **Database/Schema Impact:** NONE (read-only against existing schema)
- **Migration Impact:** NONE
- **Security Considerations:**
  - Queries MUST exclude quarantined users by default
  - Queries MUST NOT expose membershipId for client trust
- **Tenant Isolation Considerations:** All queries filtered by tenantId, No cross-tenant data leakage
- **Backward Compatibility:** Does not modify existing queries; additive only
- **Tests Required:**
  - Unit: Mock Prisma client, verify query construction
  - Integration: Query against M2 test fixtures
  - Property: Active membership count ≤ total membership count
- **Validation Commands:** Query returns correct M2 fixture memberships, Quarantined users excluded from results
- **Completion Criteria:**
  - PrismaMembershipRepository implements IMembershipRepository
  - findActiveByUserAndTenant filters status = ACTIVE
  - findByUserAndTenantWithStatus returns all statuses (status-aware)
  - resolveMembership uses 3-part key correctly and preserves status
  - Quarantine exclusion integrated via manifest abstraction
  - Query performance < 50ms for 100 memberships (Req 1 AC 1)

#### Task 5: Membership Resolution Logic (TPR-03 Applied)
- **Objective:** Implement deterministic membership resolution supporting multi-membership scenarios. Resolution returns authoritative membership state INCLUDING status. Resolution is SEPARATE from operation authorization.
- **Requirements Covered:** Req 1 (AC 2-6), Req 3 (AC 1-7), Req 4 (AC 8)
- **Design Sections:** Membership Resolution Flow, Multi-Membership Resolution Behavior Matrix, membershipId Resolution Rules
- **Dependencies:** Task 4
- **Files:**
  - `src/core/domains/membership/services/` — MembershipResolutionService
- **Database/Schema Impact:** NONE
- **Migration Impact:** NONE
- **Security Considerations:**
  - membershipId MUST be resolved server-side, NEVER from JWT
  - Resolution MUST fail closed on ambiguous state
  - Quarantined users MUST be rejected
  - Resolution layer MUST NOT know whether operation is emergency (TPR-03)
- **Tenant Isolation Considerations:** Resolution key includes activeTenantId, Cross-tenant resolution impossible by design
- **Backward Compatibility:** New service; legacy authorization unaffected
- **Tests Required:**
  - Unit: Single membership → direct match
  - Unit: Multiple memberships in one tenant → activeOrgUnitId distinguishes
  - Unit: Tenant-level membership (null orgUnitId) → role validation
  - Unit: Quarantined user → AUTH_USER_QUARANTINED
  - Unit: No membership → AUTH_NO_MEMBERSHIP
  - Unit: ACTIVE membership → resolvable with status ACTIVE
  - Unit: SUSPENDED membership → resolvable with status SUSPENDED (no emergency policy here)
  - Unit: INVITED membership → resolvable with status INVITED (marked non-authoritative)
  - Unit: REVOKED membership → resolvable with status REVOKED (marked non-authoritative)
  - Property: Resolution is deterministic (same input → same output)
- **Validation Commands:** All resolution scenarios from design matrix covered
- **Completion Criteria:**
  - MembershipResolutionService.resolve(key) → DomainResult<Membership>
  - Handles single membership case
  - Handles multiple memberships in same tenant via activeOrgUnitId
  - Validates tenant-level roles (PLATFORM_ADMIN, TENANT_OWNER) allow null orgUnitId
  - Validates org-scoped roles require valid orgUnitId
  - Returns typed errors per design error codes
  - Resolution returns authoritative membership state INCLUDING status field
  - Resolution layer does NOT apply emergency policy (authorization layer responsibility)
  - Authorization policy (FASE 1.7+) decides eligibility based on status + operation type

#### Task 6: OrgUnit Hierarchy Read Support (TPR-02 Applied)
- **Objective:** Implement OrgUnit hierarchy read operations for FASE 1.6. This task is POLICY-NEUTRAL — it provides read capability only, NOT authorization decisions.
- **Requirements Covered:** Req 1 (AC 6), Req 6 (AC 1-2, 5)
- **Design Sections:** OrgUnit Hierarchy Model, INV-ORG-003, INV-ORG-004
- **Dependencies:** Task 1
- **Files:**
  - `src/core/domains/orgunit/services/` — OrgUnitHierarchyReader
- **Database/Schema Impact:** NONE
- **Migration Impact:** NONE
- **Security Considerations:**
  - Tenant boundary MUST be checked before OrgUnit reads
  - INV-ORG-001: OrgUnit parent must belong to same tenant
- **Tenant Isolation Considerations:** OrgUnit path queries MUST filter by tenantId first
- **Backward Compatibility:** New service; no legacy impact
- **Tests Required:**
  - Unit: isDescendantOrEqual for direct match
  - Unit: isDescendantOrEqual for descendant via path array
  - Unit: isDescendantOrEqual for sibling → false
  - Property: depth = path.length - 1 for all test OrgUnits
- **Validation Commands:** Test against M2 OrgUnit fixtures (rt01, rt02 roots)
- **Completion Criteria:**
  - isDescendantOrEqual(resourceOrgUnitId, membershipOrgUnitId, tenantId) implemented as PRIMITIVE
  - Uses path array for efficient descendant checking
  - Validates depth = path.length - 1 invariant (INV-ORG-003)
  - Validates root OrgUnit has parentId=NULL, depth=0, path=[id] (INV-ORG-004)
  - NO policy language (NO "grants full tenant access", NO ALLOW/DENY decisions)
  - Policy decisions belong to FASE 1.7 OrgUnit Scope Authorizer (Task 15)
  - Task 6 is policy-neutral: read hierarchy, determine descendant/equality, query path/depth, validate invariants ONLY
  - Preserve INV-ORG-001, INV-ORG-002, INV-ORG-003, INV-ORG-004

#### Task 7: DomainResult Pattern Implementation
- **Objective:** Implement typed Result pattern for domain operations.
- **Requirements Covered:** Req 3 (AC 3-4, 6-7), Req 47 (error codes)
- **Design Sections:** Authorization Error Standardization, INV-AUTH-002: Fails closed
- **Dependencies:** Task 1
- **Files:**
  - `src/core/shared/` — DomainResult<T, E> type
  - `src/core/domains/membership/errors/` — MembershipError types
- **Database/Schema Impact:** NONE
- **Migration Impact:** NONE
- **Security Considerations:**
  - Errors MUST NOT expose internal details
  - Fail closed on unknown error states
- **Tenant Isolation Considerations:** Error responses MUST NOT leak cross-tenant information
- **Backward Compatibility:** New pattern; can coexist with existing error handling
- **Tests Required:**
  - Unit: Success case unwrapping
  - Unit: Failure case with typed error
  - Unit: Error code mapping to HTTP status
- **Validation Commands:** Type safety verified by TypeScript compiler
- **Completion Criteria:**
  - DomainResult<T, E> = Success<T> | Failure<E>
  - MembershipError union type with all error codes
  - Error codes match Req 47 specification
  - No internal details in user-facing errors

#### Task 8: Unit Tests for Membership Repository
- **Objective:** Comprehensive unit test coverage for membership repository.
- **Requirements Covered:** Req 1 testing considerations
- **Design Sections:** Testing Strategy
- **Dependencies:** Tasks 1-7
- **Files:**
  - `src/core/domains/membership/__tests__/` — Unit test files
- **Database/Schema Impact:** NONE
- **Migration Impact:** NONE
- **Tests Required:**
  - Unit: All repository methods with mocked Prisma
  - Unit: Quarantine exclusion via manifest abstraction
  - Unit: Resolution key validation
  - Unit: Error case handling
  - Unit: Status-aware reads (TPR-04)
- **Validation Commands:** `npm test -- --coverage` shows >80% coverage for membership domain
- **Completion Criteria:**
  - Repository interface fully tested
  - Resolution service fully tested
  - Quarantine manifest tested (including malformed/missing scenarios)
  - Coverage >= 80%

#### Task 9: Integration Tests with M2 Fixtures
- **Objective:** Verify membership repository against actual M2 database state.
- **Requirements Covered:** Req 1 (AC 1)
- **Design Sections:** M1/M2 Frozen State
- **Dependencies:** Task 8
- **Files:**
  - `src/infrastructure/repositories/membership/__tests__/` — Integration tests
- **Database/Schema Impact:** NONE (read-only tests)
- **Migration Impact:** NONE
- **Security Considerations:** Tests MUST NOT modify M2 data
- **Tests Required:**
  - Integration: Query 16 M2 memberships correctly
  - Integration: 3 PLATFORM_ADMIN memberships have null orgUnitId
  - Integration: 13 RT memberships have correct OrgUnit scope
  - Integration: Performance < 50ms for membership queries
- **Validation Commands:** Integration tests pass against M2 clone database
- **Completion Criteria:**
  - All 16 M2 memberships queryable
  - OrgUnit scoping correct per L6 frozen decision
  - Performance requirement met

#### Task 10: Property-Based Tests
- **Objective:** Implement property-based tests for membership invariants.
- **Requirements Covered:** Req 1 testing, INV-MEM-001, INV-MEM-002, INV-MEM-003
- **Design Sections:** Correctness Properties
- **Dependencies:** Task 8
- **Files:**
  - `src/core/domains/membership/__tests__/` — Property test files
- **Tests Required:**
  - Property: Active membership count ≤ total membership count
  - Property: Resolution is deterministic
  - Property: Tenant-level roles have null orgUnitId
  - Property: Org-scoped roles have valid orgUnitId
- **Validation Commands:** Property tests pass with 100+ iterations
- **Completion Criteria:**
  - Fast-check or similar library configured
  - All membership invariants have property tests
  - Tests run in CI pipeline

#### Task 11: FASE 1.6 Validation Gate
- **Objective:** Verify FASE 1.6 completion criteria before proceeding.
- **Requirements Covered:** All FASE 1.6 requirements
- **Dependencies:** Tasks 1-10
- **Files:** None (validation only)
- **Validation Commands:**
  - All unit tests pass
  - All integration tests pass
  - All property tests pass
  - No TypeScript errors
  - No eslint errors
  - Coverage >= 80%
  - No modifications to M2 data
- **Completion Criteria:**
  - Membership Read Model fully functional
  - All tests pass
  - Documentation updated
  - Ready for FASE 1.7

#### Task 12: Permission Registry Implementation
- **Objective:** Implement central permission registry with explicit role→permission mapping.
- **Requirements Covered:** Req 2 (AC 1-8)
- **Design Sections:** Permission Registry section
- **Dependencies:** Task 11 (FASE 1.6 complete)
- **Files:**
  - `src/core/authorization/` — PermissionRegistry, Permission types
- **Database/Schema Impact:** NONE (configuration-based)
- **Migration Impact:** NONE
- **Security Considerations:**
  - NO inheritance between roles
  - SECURITY and RESIDENT have DISTINCT permission sets
  - Unknown permission → fail closed
- **Completion Criteria:**
  - All permissions defined as typed constants
  - ROLE_PERMISSIONS map from design implemented
  - PLATFORM_ADMIN has explicit platform permissions only
  - Immutable at runtime

#### Task 13: Authorization Context Resolver
- **Objective:** Resolve complete authorization context from JWT claims.
- **Requirements Covered:** Req 3 (AC 1-7)
- **Design Sections:** Authorization Context Resolution section
- **Dependencies:** Task 11, Task 12
- **Files:**
  - `src/core/authorization/` — AuthorizationContextResolver
- **Security Considerations:**
  - JWT provides identity/context ONLY
  - Role and permissions resolved server-side
  - membershipId resolved server-side (NEVER from JWT)
  - tokenVersion exact match required
- **Completion Criteria:**
  - Extracts userId, activeTenantId, activeOrgUnitId, tokenVersion from JWT
  - Resolves membership via MembershipResolutionService
  - Resolves permissions via PermissionRegistry
  - Validates tokenVersion exact match
  - Rejects quarantined users
  - Returns typed errors per design

#### Task 14: Route Authorization Decorator
- **Objective:** Create decorator/middleware for permission-based route authorization.
- **Requirements Covered:** Req 5 (AC 1-7)
- **Design Sections:** Authorization Pipeline
- **Dependencies:** Task 13
- **Files:**
  - `src/infrastructure/middleware/` — RequirePermission decorator
- **Security Considerations:**
  - Fail closed on unknown errors
  - Log all denials with correlationId
- **Completion Criteria:**
  - @RequirePermission(['permission:action']) decorator
  - Resolves AuthorizationContext
  - Checks ALL required permissions present
  - Returns 403 with AUTH_INSUFFICIENT_PERMISSION if missing
  - Logs denials

#### Task 15: OrgUnit Scope Authorizer
- **Objective:** Implement OrgUnit scope checking for resource access. This task applies authorization POLICY (uses Task 6 primitives).
- **Requirements Covered:** Req 6 (AC 1-7)
- **Design Sections:** OrgUnit Scope Authorization section
- **Dependencies:** Task 6, Task 13
- **Files:**
  - `src/core/authorization/` — OrgUnitScopeAuthorizer
- **Security Considerations:**
  - Tenant check BEFORE OrgUnit scope check
  - AUTH_TENANT_MISMATCH has higher priority
- **Completion Criteria:**
  - Verifies resource OrgUnit is within membership scope (uses Task 6 primitive)
  - Tenant-level admins have full tenant scope (POLICY decision, NOT in Task 6)
  - Returns AUTH_OUT_OF_SCOPE if not in scope
  - Returns AUTH_TENANT_MISMATCH if tenant differs

#### Task 16: FASE 1.7 Unit Tests
- **Objective:** Test coverage for authorization foundation.
- **Requirements Covered:** Req 2, 3, 5, 6 testing considerations
- **Dependencies:** Tasks 12-15
- **Tests Required:**
  - Unit: Permission registry returns correct permissions per role
  - Unit: SECURITY ≠ RESIDENT permissions
  - Unit: Unknown permission → fail closed
  - Unit: Context resolution success path
  - Unit: Context resolution error paths
  - Unit: OrgUnit scope checking
- **Completion Criteria:**
  - Coverage >= 80%
  - All error codes tested

#### Task 17: FASE 1.7 Validation Gate
- **Objective:** Verify FASE 1.7 completion.
- **Dependencies:** Tasks 12-16
- **Completion Criteria:**
  - Permission Registry operational
  - Authorization Context Resolver operational
  - Route authorization decorator ready (not yet applied to routes)
  - OrgUnit scope authorizer ready
  - All tests pass

#### Task 18: Context Switch Service
- **Objective:** Allow users to switch active tenant and OrgUnit context.
- **Requirements Covered:** Req 4 (AC 1-8)
- **Design Sections:** Context Switch Validation
- **Dependencies:** Task 17 (FASE 1.7 complete)
- **Security Considerations:**
  - Validate membership exists in target tenant
  - Validate target OrgUnit belongs to active tenant
  - Validate membership scope includes target OrgUnit
- **Completion Criteria:**
  - validateContextSwitch(userId, targetTenantId, targetOrgUnitId)
  - Issues new JWT with updated claims on success
  - Returns CONTEXT_SWITCH_INVALID on failure
  - Only tenant-level admins can have null activeOrgUnitId

#### Task 19: JWT Claims Update
- **Objective:** Update JWT structure per frozen design.
- **Requirements Covered:** Req 44 (AC 1-6)
- **Design Sections:** JWT Structure section
- **Dependencies:** Task 18
- **Security Considerations:**
  - NO role or permissions in JWT
  - 15-minute expiry
  - HS256 signing
  - No PII beyond userId
- **Completion Criteria:**
  - JWT contains: sub, activeTenantId, activeOrgUnitId, tokenVersion, iat, exp
  - Role and permissions NOT in JWT
  - Access token expiry = 15 minutes

#### Task 20: FASE 1.8 Tests and Validation Gate
- **Objective:** Verify FASE 1.8 completion.
- **Dependencies:** Tasks 18-19
- **Completion Criteria:**
  - Context switch tested
  - JWT structure validated
  - All tests pass

#### Task 21: Shadow Authorization Service (TPR-06 Applied)
- **Objective:** Execute both legacy and new authorization, log mismatches. WARNING threshold (>1%) for operational alerts, CUTOVER ELIGIBILITY threshold (<0.1%) for security gate.
- **Requirements Covered:** Req 7 (AC 1-8)
- **Design Sections:** Shadow Authorization Validation section
- **Dependencies:** Task 20 (FASE 1.8 complete)
- **Security Considerations:**
  - Legacy result used for actual decision during shadow mode
  - Exclude quarantined anomalies from mismatch calculations
- **Completion Criteria:**
  - Executes legacy (User.tenantId + UserRole) and new (Membership-based)
  - Logs mismatches with full context
  - Tracks mismatch rate metrics
  - Per-route opt-in support
  - Latency impact < 50ms p95
  - WARNING/ALERT threshold (> 1%) → operational alert, monitoring trigger
  - CUTOVER ELIGIBILITY threshold (< 0.1%) → security gate required before authority switch
  - Document that cutover threshold is stricter than warning threshold

#### Task 22: Shadow Mode Feature Flag
- **Objective:** Control shadow authorization per route.
- **Dependencies:** Task 21
- **Completion Criteria:**
  - Feature flag for global shadow mode
  - Per-route shadow mode override
  - Monitoring dashboard for mismatch rate

#### Task 23: FASE 1.9 Validation Gate
- **Objective:** Verify FASE 1.9 completion.
- **Dependencies:** Tasks 21-22
- **Completion Criteria:**
  - Shadow mode operational
  - Mismatch logging working
  - Metrics dashboard available
  - Ready for pre-cutover write compatibility check

#### Task 24: Pre-Cutover Authorization Write Compatibility (TPR-05-FINAL)
- **Objective:** Inventory, implement, and verify authorization-affecting write compatibility BEFORE cutover. Authorization cutover MUST NOT proceed until this task completes successfully.
- **Requirements Covered:** Req 8 (blocking dependency), Req 9 (write path consistency), Req 45 (migration safety)
- **Design Sections:** Write-Path Migration, Authorization Cutover
- **Dependencies:** Task 23 (FASE 1.9 complete)
- **Files:**
  - Documentation artifact: Authorization Write Path Inventory
  - `src/infrastructure/compatibility/` — Write compatibility implementation and verification
- **Database/Schema Impact:** NONE (uses existing Membership/User schema)
- **Migration Impact:** NONE for schema migration
- **Runtime Impact:** EXPECTED — authorization-affecting write compatibility MUST be implemented before cutover (not just verified)
- **Security Considerations:**
  - Cutover MUST NOT proceed if any auth-affecting legacy-only writer remains
  - All authorization-affecting writes must synchronize Membership BEFORE cutover
  - No legacy-only authorization writer may survive into cutover phase
- **Completion Criteria:**
  - A. INVENTORY: All authorization-affecting write paths inventoried (user creation, role assignment, tenant assignment, membership CRUD, orgUnit scope changes, any User.role/User.tenantId writes)
  - B. IMPLEMENTATION: For every authorization-affecting legacy writer, IMPLEMENT one of:
    - Write Membership as authoritative state, OR
    - Dual-write legacy + Membership atomically, OR
    - Disable/block that legacy writer before cutover
  - C. TRANSACTION CONSISTENCY: Atomic updates where legacy and Membership updated together; failure rolls back complete authorization-affecting change; no partial authorization state allowed
  - D. QUARANTINE: PNA-01..PNA-05 remain excluded; no compatibility mechanism creates Membership for quarantined identities
  - E. VERIFICATION: All auth-affecting write paths inventoried; every writer classified; every required compatibility writer active; no legacy-only auth writer remains; transaction consistency tests pass; quarantine protection passes
  - F. GATE: Explicit pre-cutover approval gate passes; cutover blocked if any criterion fails
  - ZERO LEGACY-ONLY AUTHORIZATION-AFFECTING WRITERS WHEN TASK 24 COMPLETES

#### Task 25: Authorization Cutover Service (TPR-06 Applied)
- **Objective:** Atomic switching from legacy to new authorization.
- **Requirements Covered:** Req 8 (AC 1-7)
- **Design Sections:** Authorization Cutover section
- **Dependencies:** Task 24 (Pre-Cutover Write Compatibility PASS — HARD DEPENDENCY), mismatch rate < 0.1%
- **BLOCKING GATE:** PRE_CUTOVER_WRITE_COMPATIBILITY_GATE must be PASS before this task can execute. Fail closed if any auth-affecting writer remains legacy-only.
- **Security Considerations:**
  - Require mismatch rate < 0.1% before cutover (CUTOVER ELIGIBILITY threshold)
  - Require pre-cutover write compatibility gate PASSED (Task 24 complete with zero legacy-only auth writers)
  - Instant rollback support
  - Audit log all cutover/rollback actions
- **Completion Criteria:**
  - Pre-cutover write compatibility gate verified PASS
  - Atomic switch via feature flag
  - Per-route granular cutover
  - Instant rollback capability
  - Mismatch threshold gate (< 0.1% cutover eligibility)
  - Zero legacy-only authorization writers confirmed
  - Audit logging

#### Task 26: Cutover Execution and Monitoring
- **Objective:** Execute cutover and verify stability.
- **Dependencies:** Task 25
- **Completion Criteria:**
  - Cutover executed per route
  - Monitoring confirms stability
  - Rollback tested

#### Task 27: FASE 1.10 Validation Gate
- **Objective:** Verify FASE 1.10 completion.
- **Dependencies:** Tasks 25-26
- **Completion Criteria:**
  - All routes cut over
  - No rollbacks triggered
  - Stability confirmed for 24 hours

#### Task 28: Post-Cutover Write Path Finalization
- **Objective:** Finalize write path migration AFTER cutover. Authorization-critical synchronization was already implemented in Task 24; this task completes the transition and retires legacy writes when safe.
- **Requirements Covered:** Req 9 (AC 1-7), Req 48 (rollback safety)
- **Design Sections:** Write-Path Migration section
- **Dependencies:** Task 27 (FASE 1.10 complete — cutover stable)
- **Security Considerations:**
  - Verify Membership is authoritative for all authorization writes
  - Maintain rollback compatibility for required stabilization window
  - Exclude quarantined anomalies
  - Do NOT stop compatibility behavior prematurely if rollback still depends on it
- **Completion Criteria:**
  - Verify Membership-authoritative write path operational (already synchronized since Task 24)
  - Migrate remaining non-critical compatibility write paths to Membership-first
  - Progressively retire temporary dual-write mechanisms when stability confirmed
  - Remove obsolete legacy-only writes only when safe and rollback no longer required
  - Ensure new writes use Membership as authoritative model
  - Verify no data inconsistency between legacy and Membership
  - Preserve quarantine rules (PNA-01..PNA-05 unchanged)
  - NOTE: This is POST-CUTOVER finalization, NOT initial dual-write implementation (that was Task 24)

#### Task 29: FASE 1.11 Validation Gate
- **Objective:** Verify FASE 1.11 write path finalization complete.
- **Dependencies:** Task 28
- **Completion Criteria:**
  - Membership-authoritative write path fully operational
  - Authorization-critical writes synchronized since pre-cutover (Task 24)
  - Post-cutover write path finalization complete
  - Legacy writes retired only where safe (rollback window satisfied)
  - Rollback/stabilization requirements met
  - No stale authorization state
  - No cross-tenant inconsistencies
  - Quarantine unchanged (PNA-01..PNA-05)
  - All relevant tests pass

#### Task 30: RLS Policy Implementation
- **Objective:** Create RLS policies on tenant-scoped tables.
- **Requirements Covered:** Req 10 (AC 1-9), Req 60 (AC 1-8)
- **Design Sections:** RLS Foundation section
- **Dependencies:** Task 29 (FASE 1.11 complete)
- **Database/Schema Impact:** EXPECTED — New RLS policies
- **Migration Impact:** EXPECTED — RLS migration
- **Security Considerations:**
  - NO RLS on users table (GLOBAL_IDENTITY)
  - NO generic bypass mechanism
  - Fail closed if session variable not set
  - SET LOCAL (transaction-scoped)
- **Completion Criteria:**
  - RLS enabled on all TENANT_OWNED tables
  - Session variable app.current_tenant_id used
  - No bypass for PLATFORM_ADMIN
  - users table has NO RLS (per INV-USER-001)
  - Connection pool safety (SET LOCAL, clear on return)

#### Task 31: RLS Coverage Enforcement
- **Objective:** CI enforcement for RLS coverage.
- **Requirements Covered:** Req 60 (AC 4-8)
- **Dependencies:** Task 30
- **Completion Criteria:**
  - Table classification registry
  - CI fails for unclassified new tables
  - Periodic audit for coverage gaps

#### Task 32: FASE 1.12 Validation Gate
- **Objective:** Verify FASE 1.12 completion.
- **Dependencies:** Tasks 30-31
- **Completion Criteria:**
  - RLS policies operational
  - Cross-tenant queries return empty (not error)
  - No performance regression > 20%

#### Task 33: Evidence-Based Remediation Workflow
- **Objective:** Implement remediation with explicit approval.
- **Requirements Covered:** Req 11 (AC 1-9)
- **Design Sections:** Legacy Data Remediation section
- **Dependencies:** Task 32 (FASE 1.12 complete)
- **Database/Schema Impact:** EXPECTED — Membership creation
- **Security Considerations:**
  - NEVER auto-remediate PNA-01..PNA-05
  - Verify manifest = exactly 5 users
  - Evidence-based workflow, not automatic
- **Completion Criteria:**
  - Identify users without Membership (excluding quarantine)
  - Map legacy roles per L5
  - Set orgUnitId to RT root for non-admins
  - Dry-run mode
  - Report generation
  - Quarantine verification

#### Task 34: FASE 1.13 Validation Gate
- **Objective:** Verify FASE 1.13 completion.
- **Dependencies:** Task 33
- **Completion Criteria:**
  - All eligible users have Membership
  - Quarantined users NOT remediated
  - Audit trail complete

#### Task 35: Code Path Analysis and Update
- **Objective:** Identify and update all User.tenantId usages.
- **Requirements Covered:** Req 12 (AC 1-6)
- **Dependencies:** Task 34 (FASE 1.13 complete)
- **Completion Criteria:**
  - All authorization paths use Membership
  - User.tenantId reads deprecated
  - No external integration breakage

#### Task 36: FASE 1.14 Validation Gate
- **Objective:** Verify FASE 1.14 completion.
- **Dependencies:** Task 35
- **Completion Criteria:**
  - No authorization code uses User.tenantId
  - All tests pass
  - Ready for cleanup

#### Task 37: Legacy Schema Cleanup (TPR-07 Applied)
- **Objective:** Remove User.tenantId column with proper ordering: stabilization before destructive operation.
- **Requirements Covered:** Req 13 (AC 1-7)
- **Dependencies:** Task 36 (FASE 1.14 complete), 24-hour rollback window
- **Database/Schema Impact:** EXPECTED — Column removal
- **Migration Impact:** EXPECTED — Destructive migration
- **Security Considerations:**
  - Backup before destructive operation
  - Maintenance window required
- **Completion Criteria (ORDERED per TPR-07):**
  1. Stop legacy dependency (complete)
  2. Verify zero authorization dependency on User.tenantId
  3. Verify zero required legacy writes
  4. Stabilization/rollback observation window passes (24 hours)
  5. Backup/recovery checkpoint created
  6. Explicit destructive-operation approval gate
  7. Drop User.tenantId column
  8. Post-drop validation
  - Prisma schema updated after column drop

#### Task 38: FASE 1.15 Validation Gate
- **Objective:** Verify FASE 1.15 completion.
- **Dependencies:** Task 37
- **Completion Criteria:**
  - Legacy cleanup complete
  - No regressions
  - Schema clean

#### Task 39: Refresh Token Implementation
- **Objective:** Opaque refresh tokens with reuse detection.
- **Requirements Covered:** Req 14 (AC 1-9), Req 15 (AC 1-7), Req 16 (AC 1-7)
- **Design Sections:** Refresh Token System, Token Versioning sections
- **Dependencies:** Task 38 (FASE 1.15 complete)
- **Database/Schema Impact:** EXPECTED — RefreshToken table
- **Security Considerations:**
  - SHA-256 hash storage
  - familyId stable across rotations
  - Reuse detection → revoke family
  - HttpOnly, Secure, SameSite=Strict
- **Completion Criteria:**
  - RefreshToken model implemented
  - Token rotation working
  - Reuse detection working
  - tokenVersion validation exact match

#### Task 40: Token Security Hardening (Req 51)
- **Objective:** Implement comprehensive token security measures.
- **Requirements Covered:** Req 51 (Token Security)
- **Dependencies:** Task 39
- **Completion Criteria:**
  - Token entropy validation
  - Secure token storage patterns
  - Token leak detection mechanisms
  - Security audit logging for token operations

#### Task 41: Session Invalidation (Req 52)
- **Objective:** Implement reliable session invalidation mechanisms.
- **Requirements Covered:** Req 52 (Session Invalidation)
- **Dependencies:** Task 39
- **Completion Criteria:**
  - Immediate session invalidation on logout
  - Session invalidation on password change
  - Bulk session invalidation for user
  - Cross-device session termination

#### Task 42: Refresh Token Security (Req 53)
- **Objective:** Enhanced refresh token security controls.
- **Requirements Covered:** Req 53 (Refresh Token Security)
- **Dependencies:** Task 39
- **Completion Criteria:**
  - Refresh token binding validation
  - Device fingerprint tracking
  - Anomaly detection for refresh patterns
  - Automatic revocation on suspicious activity

#### Task 43: FASE 1.16 Validation Gate
- **Objective:** Verify FASE 1.16 completion.
- **Dependencies:** Tasks 39-42
- **Completion Criteria:**
  - Refresh token system operational
  - Reuse detection tested
  - Token versioning tested
  - Token security hardening complete
  - Session invalidation working
  - Refresh token security validated

#### Task 44: Subscription Plan Management
- **Objective:** CRUD for subscription plans.
- **Requirements Covered:** Req 17 (AC 1-7), Req 18 (AC 1-7)
- **Dependencies:** Task 43 (FASE 1.16 complete)
- **Completion Criteria:**
  - Plan CRUD operations
  - Status state machine
  - Status history tracking

#### Task 45: Entitlement Enforcer
- **Objective:** Check entitlements before premium features.
- **Requirements Covered:** Req 19 (AC 1-7)
- **Dependencies:** Task 44
- **Completion Criteria:**
  - Plan resolution
  - Feature entitlement checking
  - ENTITLEMENT_NOT_AVAILABLE error

#### Task 46: Safety-Critical Protection
- **Objective:** Ensure emergency operations bypass subscription checks.
- **Requirements Covered:** Req 20 (AC 1-11)
- **Design Sections:** Safety-Critical Operations section
- **Security Considerations:**
  - Emergency ALLOWED for SUSPENDED subscription (NOT CLOSED)
  - Emergency ALLOWED for SUSPENDED membership with audit
  - Emergency DENIED for REVOKED/INVITED membership
- **Completion Criteria:**
  - Safety-critical operations defined
  - Subscription bypass for emergency
  - Membership status emergency policy
  - Elevated audit logging

#### Task 47: Billing and Payment Integration (Req 57)
- **Objective:** Implement billing and payment integration.
- **Requirements Covered:** Req 57 (Billing/Payment)
- **Dependencies:** Task 44
- **Completion Criteria:**
  - Payment gateway integration
  - Invoice generation
  - Payment status tracking
  - Subscription billing cycles

#### Task 48: FASE 1.17 Validation Gate
- **Objective:** Verify FASE 1.17 completion.
- **Dependencies:** Tasks 44-47
- **Completion Criteria:**
  - Subscription management working
  - Entitlement enforcement working
  - Emergency protection tested
  - Billing integration operational

#### Task 49: Tenant Onboarding Flow
- **Objective:** Guided tenant creation process.
- **Requirements Covered:** Req 23 (AC 1-9), Req 49 (AC 1-10)
- **Design Sections:** Tenant Lifecycle State Machine
- **Security Considerations:**
  - Tenant.lifecycleStatus SEPARATE from Subscription.status (L8, L12)
  - PROVISIONING → ACTIVE transition
- **Completion Criteria:**
  - Tenant creation with lifecycleStatus = PROVISIONING
  - Root OrgUnit creation (depth=0, path=[id])
  - TENANT_OWNER membership creation
  - Subscription.status = TRIAL
  - Transition to ACTIVE on completion

#### Task 50: Membership Lifecycle Management
- **Objective:** Manage membership creation, transitions, revocation.
- **Requirements Covered:** Req 22 (AC 1-7)
- **Dependencies:** Task 49
- **Completion Criteria:**
  - Membership CRUD
  - Status transitions
  - Uniqueness enforcement
  - Event emission

#### Task 51: Delegation Matrix Implementation
- **Objective:** Enforce explicit delegation rules.
- **Requirements Covered:** Req 25 (AC 1-9)
- **Design Sections:** Delegation Matrix section
- **Security Considerations:**
  - Explicit matrix, NOT permission counting
  - No role can grant PLATFORM_ADMIN
  - No role can grant TENANT_OWNER (except transfer flow)
- **Completion Criteria:**
  - DELEGATION_MATRIX from design implemented
  - AUTH_DELEGATION_VIOLATION on violation
  - Audit logging

#### Task 52: Tenant Transfer Flow (Req 27)
- **Objective:** Implement secure tenant ownership transfer.
- **Requirements Covered:** Req 27 (Tenant Transfer)
- **Dependencies:** Task 51
- **Completion Criteria:**
  - Tenant transfer initiation by current owner
  - Transfer acceptance by new owner
  - Re-authentication required for both parties
  - Before/after state audit logging
  - Transfer cancellation support

#### Task 53: Membership Invitation Flow (Req 31)
- **Objective:** Implement membership invitation system.
- **Requirements Covered:** Req 31 (Membership Invitation)
- **Dependencies:** Task 50
- **Completion Criteria:**
  - Invitation creation with expiry
  - Invitation acceptance flow
  - Invitation expiry handling
  - Role assignment during invitation
  - OrgUnit scope assignment

#### Task 54: Admin Membership Management (Req 50)
- **Objective:** Admin interfaces for membership management.
- **Requirements Covered:** Req 50 (Admin Membership Management)
- **Dependencies:** Task 50
- **Completion Criteria:**
  - Admin membership listing
  - Admin membership modification
  - Bulk membership operations
  - Audit logging for admin actions

#### Task 55: Household Isolation Enforcement (INV-HOUSEHOLD-001)
- **Objective:** Enforce household data isolation invariant.
- **Requirements Covered:** INV-HOUSEHOLD-001
- **Dependencies:** Task 49
- **Completion Criteria:**
  - Household belongs to single tenant
  - Household head authorization
  - Household member access control
  - Cross-household isolation validation

#### Task 56: FASE 1.18 Validation Gate
- **Objective:** Verify FASE 1.18 completion.
- **Dependencies:** Tasks 49-55
- **Completion Criteria:**
  - Tenant onboarding tested
  - Membership lifecycle tested
  - Delegation rules enforced
  - Tenant transfer working
  - Invitation flow working
  - Admin management working
  - Household isolation enforced

#### Task 57: OrgUnit Management Service
- **Objective:** Create, move, delete OrgUnits.
- **Requirements Covered:** Req 21 (AC 1-9), Req 46 (AC 1-9)
- **Design Sections:** OrgUnit Hierarchy Model
- **Security Considerations:**
  - Same-tenant constraint (INV-ORG-001)
  - No cycles (INV-ORG-002)
  - depth = path.length - 1 (INV-ORG-003)
- **Completion Criteria:**
  - OrgUnit CRUD
  - Hierarchy rule enforcement
  - Path/depth computation
  - Subtree move support
  - Path repair utility

#### Task 58: OrgUnit CRUD Operations (Req 34)
- **Objective:** Complete OrgUnit CRUD implementation.
- **Requirements Covered:** Req 34 (OrgUnit CRUD)
- **Dependencies:** Task 57
- **Completion Criteria:**
  - OrgUnit creation with validation
  - OrgUnit read with authorization
  - OrgUnit update with constraint checking
  - OrgUnit deletion with cascade handling

#### Task 59: Multi-Cluster Support (Req 58)
- **Objective:** Support multiple clusters per tenant.
- **Requirements Covered:** Req 58 (Multi-Cluster Support)
- **Dependencies:** Task 57
- **Completion Criteria:**
  - Multiple cluster creation per tenant
  - Cross-cluster navigation
  - Cluster-level authorization scoping
  - Cluster management interfaces

#### Task 60: IoT Device Isolation Enforcement (INV-IOT-001)
- **Objective:** Enforce IoT device tenant isolation invariant.
- **Requirements Covered:** INV-IOT-001
- **Dependencies:** Task 57
- **Completion Criteria:**
  - IoT device belongs to single tenant
  - IoT device authorization via membership
  - Cross-tenant IoT access prevention
  - IoT device scope validation

#### Task 61: FASE 1.19 Validation Gate
- **Objective:** Verify FASE 1.19 completion.
- **Dependencies:** Tasks 57-60
- **Completion Criteria:**
  - OrgUnit management tested
  - Path invariants verified
  - CRUD operations complete
  - Multi-cluster support working
  - IoT isolation enforced

#### Task 62: Audit Trail Implementation
- **Objective:** Log all authorization and security events.
- **Requirements Covered:** Req 24 (AC 1-9)
- **Design Sections:** Audit Trail section
- **Security Considerations:**
  - Append-only, immutable
  - Cryptographic chaining
  - No PII in logs
- **Completion Criteria:**
  - Authorization decision logging
  - Membership change logging
  - Token operation logging
  - Hash chain for tamper detection
  - No sensitive data logged

#### Task 63: Authorization Concurrency Handling (Req 28)
- **Objective:** Handle concurrent authorization operations safely.
- **Requirements Covered:** Req 28 (Authorization Concurrency)
- **Dependencies:** Task 62
- **Completion Criteria:**
  - Concurrent membership resolution
  - Race condition prevention
  - Optimistic locking for updates
  - Conflict resolution strategies

#### Task 64: Cache Invalidation Strategy (Req 29)
- **Objective:** Implement authorization cache invalidation.
- **Requirements Covered:** Req 29 (Cache Invalidation)
- **Dependencies:** Task 62
- **Completion Criteria:**
  - Cache invalidation on membership change
  - Cache invalidation on permission change
  - TTL-based expiration
  - Invalidation propagation

#### Task 65: Audit Security Events (Req 30)
- **Objective:** Comprehensive security event auditing.
- **Requirements Covered:** Req 30 (Audit Security Events)
- **Dependencies:** Task 62
- **Completion Criteria:**
  - Authentication event logging
  - Authorization denial logging
  - Privilege escalation detection
  - Anomaly detection events

#### Task 66: Batch Operations Support (Req 33)
- **Objective:** Support batch authorization operations.
- **Requirements Covered:** Req 33 (Batch Operations)
- **Dependencies:** Task 62
- **Completion Criteria:**
  - Batch permission checks
  - Batch membership updates
  - Transaction management for batches
  - Partial failure handling

#### Task 67: Permission Sync Mechanism (Req 35)
- **Objective:** Synchronize permissions across system components.
- **Requirements Covered:** Req 35 (Permission Sync)
- **Dependencies:** Task 62
- **Completion Criteria:**
  - Permission registry synchronization
  - Cross-service permission consistency
  - Sync conflict resolution
  - Sync audit logging

#### Task 68: Tenant Data Isolation Audit (Req 38)
- **Objective:** Audit mechanisms for tenant data isolation.
- **Requirements Covered:** Req 38 (Tenant Data Isolation Audit)
- **Dependencies:** Task 62
- **Completion Criteria:**
  - Cross-tenant access attempt detection
  - Isolation violation alerting
  - Periodic isolation verification
  - Audit report generation

#### Task 69: Authorization Error Handling (Req 39)
- **Objective:** Standardized authorization error handling.
- **Requirements Covered:** Req 39 (Authorization Error Handling)
- **Dependencies:** Task 62
- **Completion Criteria:**
  - Standardized error codes
  - Error context preservation
  - Error response sanitization
  - Error logging with correlation

#### Task 70: Security Event Logging (Req 55)
- **Objective:** Comprehensive security event logging.
- **Requirements Covered:** Req 55 (Security Event Logging)
- **Dependencies:** Task 62
- **Completion Criteria:**
  - Security event taxonomy
  - Event severity classification
  - Real-time event streaming
  - Event retention policies

#### Task 71: Notification Security (Req 56)
- **Objective:** Secure notification delivery.
- **Requirements Covered:** Req 56 (Notification Security)
- **Dependencies:** Task 62
- **Completion Criteria:**
  - Notification authorization
  - Recipient verification
  - Notification content sanitization
  - Delivery audit logging

#### Task 72: Cross-Tenant Prevention Validation (Req 59)
- **Objective:** Validate cross-tenant access prevention.
- **Requirements Covered:** Req 59 (Cross-Tenant Prevention)
- **Dependencies:** Task 62
- **Completion Criteria:**
  - Cross-tenant query prevention tests
  - Cross-tenant mutation prevention tests
  - Boundary violation detection
  - Prevention mechanism audit

#### Task 73: Error Code Standardization (Req 61)
- **Objective:** Standardize error codes across authorization system.
- **Requirements Covered:** Req 61 (Error Code Standardization)
- **Dependencies:** Task 62
- **Completion Criteria:**
  - Error code registry
  - Error code documentation
  - Error code versioning
  - Client-facing error mapping

#### Task 74: FASE 1.20 Validation Gate
- **Objective:** Verify FASE 1.20 completion.
- **Dependencies:** Tasks 62-73
- **Completion Criteria:**
  - Audit trail operational
  - Tamper detection working
  - All security logging operational
  - Error handling standardized

#### Task 75: Security Validation Suite
- **Objective:** Verify tenant isolation and authorization.
- **Requirements Covered:** Req 41 (AC 1-8)
- **Dependencies:** Task 74
- **Completion Criteria:**
  - Cross-tenant access prevention tests
  - Authorization pipeline tests
  - Fail-closed verification
  - Quarantine verification
  - CI integration

#### Task 76: Security Testing Suite (Req 37)
- **Objective:** Comprehensive security testing.
- **Requirements Covered:** Req 37 (Security Testing)
- **Dependencies:** Task 75
- **Completion Criteria:**
  - Penetration testing framework
  - Security regression tests
  - Vulnerability scanning integration
  - Security test automation

#### Task 77: FASE 1.21 Validation Gate
- **Objective:** Verify FASE 1.21 completion.
- **Dependencies:** Tasks 75-76
- **Completion Criteria:**
  - All security tests pass
  - No isolation violations
  - Security testing suite operational

#### Task 78: Performance Validation
- **Objective:** Measure and verify authorization performance.
- **Requirements Covered:** Req 42 (AC 1-7)
- **Dependencies:** Task 77
- **Completion Criteria:**
  - Authorization resolution < 100ms p99
  - Permission lookup < 10ms p99
  - RLS overhead < 20%
  - Load testing complete

#### Task 79: Disaster Recovery Testing (Req 32)
- **Objective:** Validate disaster recovery procedures.
- **Requirements Covered:** Req 32 (Disaster Recovery)
- **Dependencies:** Task 78
- **Completion Criteria:**
  - Backup/restore procedures tested
  - Recovery time objectives validated
  - Data integrity verification
  - Failover procedures documented

#### Task 80: Performance Targets Validation (Req 40)
- **Objective:** Validate all performance targets met.
- **Requirements Covered:** Req 40 (Performance Targets)
- **Dependencies:** Task 78
- **Completion Criteria:**
  - All V1-V7 validation targets met
  - Performance benchmarks documented
  - Scalability limits identified
  - Performance regression prevention

#### Task 81: FASE 1.22 Validation Gate
- **Objective:** Verify FASE 1.22 completion.
- **Dependencies:** Tasks 78-80
- **Completion Criteria:**
  - All performance targets met
  - No degradation alerts
  - DR procedures validated

#### Task 82: Implementation Freeze Checklist
- **Objective:** Verify all requirements implemented.
- **Dependencies:** Task 81
- **Completion Criteria:**
  - All 62 requirements implemented and tested
  - All 16 invariants enforced
  - All validation targets met
  - Documentation complete
  - Ready for production

#### Task 83: Architecture Freeze Tag
- **Objective:** Create implementation freeze tag.
- **Dependencies:** Task 82
- **Completion Criteria:**
  - Git tag created
  - Release notes documented
  - Handoff complete

### Requirements Traceability Matrix

| Req | Task(s) | Phase | Validation |
|-----|---------|-------|------------|
| 1 | 1-10 | FASE 1.6 | Unit, Integration, Property tests |
| 2 | 12, 16 | FASE 1.7 | Unit tests |
| 3 | 5, 13, 16 | FASE 1.6, 1.7 | Unit, Integration tests |
| 4 | 18, 19 | FASE 1.8 | Unit, Integration tests |
| 5 | 14, 16 | FASE 1.7 | Unit tests |
| 6 | 6, 15, 16 | FASE 1.6, 1.7 | Unit, Property tests |
| 7 | 21, 22 | FASE 1.9 | Integration, Performance tests |
| 8 | 24, 25, 26 | FASE 1.9.5, 1.10 | Integration tests |
| 9 | 24, 28 | FASE 1.9.5, 1.11 | Integration tests |
| 10 | 30, 31 | FASE 1.12 | Security tests |
| 11 | 33 | FASE 1.13 | Integration tests |
| 12 | 35 | FASE 1.14 | Static analysis |
| 13 | 37 | FASE 1.15 | Integration tests |
| 14 | 39 | FASE 1.16 | Unit, Integration tests |
| 15 | 39 | FASE 1.16 | Unit tests |
| 16 | 39 | FASE 1.16 | Integration tests |
| 17 | 44 | FASE 1.17 | Unit tests |
| 18 | 44 | FASE 1.17 | Unit tests |
| 19 | 45 | FASE 1.17 | Unit tests |
| 20 | 46 | FASE 1.17 | Integration tests |
| 21 | 57 | FASE 1.19 | Property tests |
| 22 | 50 | FASE 1.18 | Integration tests |
| 23 | 49 | FASE 1.18 | Integration tests |
| 24 | 62 | FASE 1.20 | Integration tests |
| 25 | 51 | FASE 1.18 | Unit tests |
| 26 | 15 | FASE 1.7 | Unit tests |
| 27 | 52 | FASE 1.18 | Integration tests |
| 28 | 63 | FASE 1.20 | Concurrency tests |
| 29 | 64 | FASE 1.20 | Integration tests |
| 30 | 65 | FASE 1.20 | Security tests |
| 31 | 53 | FASE 1.18 | Integration tests |
| 32 | 79 | FASE 1.22 | DR tests |
| 33 | 66 | FASE 1.20 | Integration tests |
| 34 | 58 | FASE 1.19 | Integration tests |
| 35 | 67 | FASE 1.20 | Integration tests |
| 36 | 21, 25 | FASE 1.9, 1.10 | Integration tests |
| 37 | 76 | FASE 1.21 | Security tests |
| 38 | 68 | FASE 1.20 | Security tests |
| 39 | 69 | FASE 1.20 | Unit tests |
| 40 | 80 | FASE 1.22 | Load tests |
| 41 | 75 | FASE 1.21 | Security tests |
| 42 | 78 | FASE 1.22 | Performance tests |
| 43 | 30 | FASE 1.12 | Security tests |
| 44 | 19 | FASE 1.8 | Unit tests |
| 45 | 21, 25, 28 | FASE 1.9-1.11 | Integration tests |
| 46 | 57 | FASE 1.19 | Property tests |
| 47 | 7 | FASE 1.6 | Unit tests |
| 48 | 25, 37 | FASE 1.10, 1.15 | Integration tests |
| 49 | 49 | FASE 1.18 | Integration tests |
| 50 | 54 | FASE 1.18 | Integration tests |
| 51 | 40 | FASE 1.16 | Security tests |
| 52 | 41 | FASE 1.16 | Integration tests |
| 53 | 42 | FASE 1.16 | Security tests |
| 54 | 51 | FASE 1.18 | Integration tests |
| 55 | 70 | FASE 1.20 | Security tests |
| 56 | 71 | FASE 1.20 | Integration tests |
| 57 | 47 | FASE 1.17 | Integration tests |
| 58 | 59 | FASE 1.19 | Integration tests |
| 59 | 72 | FASE 1.20 | Integration tests |
| 60 | 30, 31 | FASE 1.12 | Security tests |
| 61 | 73 | FASE 1.20 | Unit tests |
| 62 | 82 | FASE 1.23 | CI tests |

**REQUIREMENTS_MAPPED: 62/62**

### Invariant Traceability Matrix

| Invariant | Implementation Task(s) | Validation Task(s) | Phase | Enforcement |
|-----------|----------------------|-------------------|-------|-------------|
| INV-TENANT-001 | 30 | 75 | FASE 1.12, 1.21 | DATABASE + APPLICATION |
| INV-ORG-001 | 57 | 61 | FASE 1.19 | APPLICATION |
| INV-ORG-002 | 57 | 61 | FASE 1.19 | APPLICATION |
| INV-ORG-003 | 6, 57 | 10, 61 | FASE 1.6, 1.19 | APPLICATION |
| INV-ORG-004 | 57 | 61 | FASE 1.19 | APPLICATION |
| INV-MEM-001 | 4, 50 | 10 | FASE 1.6, 1.18 | DATABASE + APPLICATION |
| INV-MEM-002 | 5 | 10 | FASE 1.6 | APPLICATION |
| INV-MEM-003 | 5 | 10 | FASE 1.6 | APPLICATION |
| INV-AUTH-001 | 13, 19 | 16, 75 | FASE 1.7, 1.8, 1.21 | APPLICATION |
| INV-AUTH-002 | 13 | 16 | FASE 1.7 | APPLICATION |
| INV-IOT-001 | 60 | 61, 75 | FASE 1.19, 1.21 | APPLICATION |
| INV-OWNER-001 | 51 | 56 | FASE 1.18 | APPLICATION |
| INV-IDENTITY-001 | 33 | 34 | FASE 1.13 | APPLICATION |
| INV-QUARANTINE-001 | 3 | 8, 9 | FASE 1.6 | APPLICATION |
| INV-HOUSEHOLD-001 | 55 | 56, 75 | FASE 1.18, 1.21 | DATABASE + APPLICATION |
| INV-USER-001 | 30 | 32, 75 | FASE 1.12, 1.21 | APPLICATION |

**INVARIANTS_MAPPED: 16/16**

### Open Decision Impact

| Decision | Dependent Tasks | Earliest Resolution | Blocks FASE 1.6? |
|----------|-----------------|---------------------|------------------|
| O1: NIK uniqueness | Tasks in FASE 1.18+ (Resident model) | FASE 1.18 | **NO** |
| O2: TRIAL/PAST_DUE quotas | Task 45 (Entitlement) | FASE 1.17 | **NO** |
| O3: Authorization cache TTL | Task 64 optimization | FASE 1.20 (optional) | **NO** |
| O4: User impersonation | Deferred feature | Post-FASE 1.23 | **NO** |

**FASE 1.6 is NOT blocked by any open decisions.**

### Task Quality Review Checklist

| Check | Status |
|-------|--------|
| All 62 requirements mapped | ✅ |
| All 16 invariants mapped | ✅ |
| No task applies tenant RLS to User table | ✅ |
| No task trusts role/permissions/membershipId from JWT | ✅ |
| No PLATFORM_ADMIN implicit tenant access | ✅ |
| No generic RLS bypass | ✅ |
| No premature User.tenantId removal | ✅ |
| No premature PNA remediation | ✅ |
| No premature destructive migration | ✅ |
| RLS after authorization foundation | ✅ |
| Shadow auth before cutover | ✅ |
| Pre-cutover write compatibility gate (TPR-05) | ✅ |
| Auth-critical write compatibility before cutover (TPR-05-FINAL) | ✅ |
| Task 24 includes implementation (not just verification) | ✅ |
| Task 28 is post-cutover finalization (not initial dual-write) | ✅ |
| Zero legacy-only auth writers required for cutover | ✅ |
| IoT uses provider abstraction | ✅ |
| M1/M2 frozen facts preserved | ✅ |
| Open decisions remain open | ✅ |
| FASE 1.6 scope narrow | ✅ |
| Quarantine manifest versioned (TPR-01) | ✅ |
| OrgUnit read policy-neutral (TPR-02) | ✅ |
| Membership resolution status-aware (TPR-03) | ✅ |
| Repository status-aware reads (TPR-04) | ✅ |
| Shadow thresholds differentiated (TPR-06) | ✅ |
| Destructive cleanup ordered (TPR-07) | ✅ |
| All deferred requirements have tasks (TPR-08) | ✅ |

### Document Metadata

| Field | Value |
|-------|-------|
| REQUIREMENTS_MAPPED | 62/62 |
| INVARIANTS_MAPPED | 16/16 |
| PHASES_PLANNED | 19 (including 1.9.5) |
| TOTAL_TASK_COUNT | 83 |
