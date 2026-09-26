# Authorization Write Path Inventory

**Task 24: Pre-Cutover Authorization Write Compatibility (TPR-05-FINAL)**

| Field | Value |
|-------|-------|
| Document Version | 1.0.0 |
| Created | 2026-09-24 |
| Status | ✅ GATE PASS |
| Legacy-Only Writers | 0 |
| Total Write Paths | 8 |
| Compatible Write Paths | 8 |

---

## Executive Summary

This document inventories **ALL authorization-affecting write operations** in the SocieT-RT system. Per TPR-05-FINAL, authorization cutover MUST NOT proceed until:

1. ✅ All auth-affecting write paths are inventoried
2. ✅ Every writer is classified (MEMBERSHIP_AUTHORITATIVE, DUAL_WRITE, or DISABLED)
3. ✅ ZERO legacy-only writers remain
4. ✅ Every required compatibility writer is active
5. ✅ Pre-cutover gate passes

**RESULT: CUTOVER CAN PROCEED** — All criteria met.

---

## Write Path Classifications

| Classification | Description | Cutover Safe |
|---------------|-------------|--------------|
| MEMBERSHIP_AUTHORITATIVE | Writes Membership as source of truth | ✅ Yes |
| DUAL_WRITE | Atomically writes both legacy and Membership | ✅ Yes |
| LEGACY_ONLY | Only writes to legacy fields | ❌ BLOCKS CUTOVER |
| DISABLED | Operation blocked/removed | ✅ Yes |

---

## Inventoried Write Paths

### WP-001: User Registration via Invitation

| Field | Value |
|-------|-------|
| ID | WP-001 |
| Category | USER_CREATION |
| Classification | DUAL_WRITE |
| Status | IMPLEMENTED |
| Location | `src/infrastructure/repositories/auth/AuthRepositoryImpl.ts::register` |
| Affected Fields | User.id, User.tenantId, User.role, Membership.id, Membership.role, Membership.status |
| Atomic Transaction | ✅ Yes |
| Respects Quarantine | ✅ Yes |

**Compatibility Mechanism:**
`AuthorizationWriteCompatibilityService.createUserWithMembership()` wraps registration to create both User and Membership atomically. Invitation-based registration creates User and corresponding ACTIVE Membership in a single transaction.

---

### WP-002: RBAC Role Assignment

| Field | Value |
|-------|-------|
| ID | WP-002 |
| Category | ROLE_ASSIGNMENT |
| Classification | DUAL_WRITE |
| Status | IMPLEMENTED |
| Location | `src/infrastructure/repositories/rbac/RbacRepositoryImpl.ts::assignRole` |
| Affected Fields | User.role, Membership.role |
| Atomic Transaction | ✅ Yes |
| Respects Quarantine | ✅ Yes |

**Compatibility Mechanism:**
`AuthorizationWriteCompatibilityService.updateRoleWithMembership()` wraps role assignment to update both User.role and Membership.role atomically. Role changes update both legacy User.role and new Membership.role.

---

### WP-003: Membership Creation (Direct)

| Field | Value |
|-------|-------|
| ID | WP-003 |
| Category | MEMBERSHIP_CRUD |
| Classification | MEMBERSHIP_AUTHORITATIVE |
| Status | IMPLEMENTED |
| Location | `src/infrastructure/repositories/membership/PrismaMembershipRepository.ts` |
| Affected Fields | Membership.id, Membership.userId, Membership.tenantId, Membership.role, Membership.status, Membership.orgUnitId |
| Atomic Transaction | ✅ Yes |
| Respects Quarantine | ✅ Yes |

**Compatibility Mechanism:**
Direct Membership writes are authoritative; no legacy sync required. New membership creation path (FASE 1.18) is Membership-authoritative by design.

---

### WP-004: Membership Status Update

| Field | Value |
|-------|-------|
| ID | WP-004 |
| Category | MEMBERSHIP_CRUD |
| Classification | MEMBERSHIP_AUTHORITATIVE |
| Status | IMPLEMENTED |
| Location | `src/infrastructure/repositories/membership/PrismaMembershipRepository.ts` |
| Affected Fields | Membership.status, Membership.revokedAt |
| Atomic Transaction | ✅ Yes |
| Respects Quarantine | ✅ Yes |

**Compatibility Mechanism:**
Membership status changes are authoritative; affects authorization resolution. Status transitions (ACTIVE → SUSPENDED → REVOKED) are Membership-authoritative.

---

### WP-005: Membership Revocation

| Field | Value |
|-------|-------|
| ID | WP-005 |
| Category | MEMBERSHIP_CRUD |
| Classification | MEMBERSHIP_AUTHORITATIVE |
| Status | IMPLEMENTED |
| Location | `src/infrastructure/repositories/membership/PrismaMembershipRepository.ts` |
| Affected Fields | Membership.status, Membership.revokedAt |
| Atomic Transaction | ✅ Yes |
| Respects Quarantine | ✅ Yes |

**Compatibility Mechanism:**
Revocation sets Membership.status=REVOKED and revokedAt timestamp. Revocation is terminal state; User continues to exist but loses membership.

---

### WP-006: Legacy User Role Update (Admin Panel)

| Field | Value |
|-------|-------|
| ID | WP-006 |
| Category | USER_ROLE_WRITE |
| Classification | DUAL_WRITE |
| Status | IMPLEMENTED |
| Location | `src/app/api/admin/users/[id]/role/route.ts` |
| Affected Fields | User.role, Membership.role |
| Atomic Transaction | ✅ Yes |
| Respects Quarantine | ✅ Yes |

**Compatibility Mechanism:**
Route handler uses `AuthorizationWriteCompatibilityService` for atomic dual-write. Admin role changes go through compatibility service.

---

### WP-007: Membership OrgUnit Scope Change

| Field | Value |
|-------|-------|
| ID | WP-007 |
| Category | ORGUNIT_SCOPE |
| Classification | MEMBERSHIP_AUTHORITATIVE |
| Status | IMPLEMENTED |
| Location | `src/infrastructure/repositories/membership/PrismaMembershipRepository.ts` |
| Affected Fields | Membership.orgUnitId |
| Atomic Transaction | ✅ Yes |
| Respects Quarantine | ✅ Yes |

**Compatibility Mechanism:**
OrgUnit scope is Membership-only field; no legacy equivalent. User model has no equivalent field. Membership is authoritative.

---

### WP-008: Invitation Token Creation

| Field | Value |
|-------|-------|
| ID | WP-008 |
| Category | USER_CREATION |
| Classification | DUAL_WRITE |
| Status | IMPLEMENTED |
| Location | `src/infrastructure/repositories/auth/AuthRepositoryImpl.ts::createInvitation` |
| Affected Fields | InvitationToken.role |
| Atomic Transaction | ✅ Yes |
| Respects Quarantine | N/A (new user creation) |

**Compatibility Mechanism:**
Invitation contains role; when accepted, triggers dual-write user+membership creation. Propagates through WP-001.

---

## Statistics Summary

### By Classification

| Classification | Count |
|---------------|-------|
| MEMBERSHIP_AUTHORITATIVE | 4 |
| DUAL_WRITE | 4 |
| LEGACY_ONLY | 0 |
| DISABLED | 0 |

### By Category

| Category | Count |
|----------|-------|
| USER_CREATION | 2 |
| ROLE_ASSIGNMENT | 1 |
| MEMBERSHIP_CRUD | 3 |
| ORGUNIT_SCOPE | 1 |
| USER_ROLE_WRITE | 1 |

### By Status

| Status | Count |
|--------|-------|
| IMPLEMENTED | 8 |
| PENDING | 0 |
| NOT_ASSESSED | 0 |

---

## Pre-Cutover Gate Results

| Criterion | ID | Status | Message |
|-----------|-----|--------|---------|
| Inventory Completeness | GATE-001 | ✅ PASS | All 8 write paths have complete information |
| Zero Legacy-Only Writers | GATE-002 | ✅ PASS | No legacy-only writers found |
| Implementation Status | GATE-003 | ✅ PASS | All 8 write paths are fully implemented |
| Transaction Consistency | GATE-004 | ✅ PASS | All 4 dual-write paths use atomic transactions |
| Quarantine Configuration | GATE-005 | ✅ PASS | Quarantine manifest correctly configured with 5 users |
| Quarantine Respect | GATE-006 | ✅ PASS | All relevant write paths respect quarantine exclusion |
| Classification Coverage | GATE-007 | ✅ PASS | 4 membership-authoritative, 4 dual-write, 0 disabled |

**GATE RESULT: ✅ PASS**

---

## Quarantine Protection (INV-QUARANTINE-001)

The following platform anomaly users (PNA-01 through PNA-05) are excluded from all authorization-affecting write operations:

- All dual-write operations block quarantined users
- No compatibility mechanism creates Membership for quarantined identities
- Quarantine manifest verified to contain exactly 5 users

**Quarantine is respected and enforced.**

---

## Transaction Consistency

All dual-write operations enforce:

1. **Atomicity:** Legacy and Membership updates in single database transaction
2. **Rollback on Failure:** Any failure rolls back complete authorization-affecting change
3. **No Partial State:** Either both succeed or both fail

**Transaction consistency is enforced.**

---

## Implementation Files

| File | Purpose |
|------|---------|
| `src/infrastructure/compatibility/types.ts` | Type definitions for write path classification |
| `src/infrastructure/compatibility/WritePathInventory.ts` | Write path inventory service |
| `src/infrastructure/compatibility/AuthorizationWriteCompatibilityService.ts` | Dual-write service |
| `src/infrastructure/compatibility/PreCutoverGateService.ts` | Pre-cutover gate verification |
| `src/infrastructure/compatibility/index.ts` | Barrel export |

---

## References

- Task 24: Pre-Cutover Authorization Write Compatibility (TPR-05-FINAL)
- Requirement 8: Authorization Cutover (blocking dependency)
- Requirement 9: Write-Path Migration for Membership
- Requirement 45: Migration Safety
- INV-QUARANTINE-001: Quarantined users cannot receive Membership

---

## Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Implementation | Kiro AI | 2026-09-24 | ✅ Complete |
| Review | Pending | - | - |
| Approval | Pending | - | - |

**Next Step:** Authorization Cutover (Task 25) may proceed after this inventory is reviewed and approved.
