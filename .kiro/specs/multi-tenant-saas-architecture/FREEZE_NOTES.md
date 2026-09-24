# FREEZE_NOTES.md — Master Architecture Design V1

**Tag:** `master-architecture-design-v1`
**Base Commit:** `585a8b8` (phase-1-m2-dev-promoted)
**Freeze Date:** 2026-09-24

---

## Purpose

This document captures implementation clarifications that emerged during the V1.3 reconciliation passes. These notes preserve design intent for implementers without modifying the frozen specifications.

---

## NOTE A: Legacy Tenant.status Field

**Context:** The `Tenant` model contains two status-related fields:
- `status: TenantStatus` — legacy field with values `active | suspended`
- `lifecycleStatus: TenantLifecycleStatus` — new field with PROVISIONING | ACTIVE | SUSPENDED | CLOSING | CLOSED | PURGED

**Clarification:**
1. `Tenant.status` is a **LEGACY TRANSITIONAL FIELD** retained for backward compatibility
2. All NEW authorization and lifecycle logic MUST use `lifecycleStatus`
3. The legacy `status` field MUST NOT be used for authorization decisions
4. During migration, both fields may coexist; `lifecycleStatus` is authoritative
5. The legacy `status` field will be deprecated after full migration (similar to User.tenantId)

**Implementation Guidance:**
```typescript
// WRONG: Using legacy status
if (tenant.status === 'active') { ... }

// CORRECT: Using lifecycleStatus
if (tenant.lifecycleStatus === 'ACTIVE') { ... }
```

---

## NOTE B: Event Outbox Ordering Semantics

**Context:** design.md states "Ordering within aggregate (per tenant, per user)"

**Clarification:**
1. Outbox events are ordered **within their aggregate boundary** (tenant or user)
2. Cross-aggregate ordering is **NOT guaranteed**
3. Consumer processing MUST be idempotent
4. For strict cross-aggregate ordering, use explicit sequencing (e.g., saga pattern)

**Ordering Guarantees:**

| Scope | Guarantee | Use Case |
|-------|-----------|----------|
| Same tenant, same user | Strict FIFO | User action sequences |
| Same tenant, different users | No ordering | Independent user actions |
| Cross-tenant | No ordering | Multi-tenant batch jobs |

**Implementation Guidance:**
- Outbox table includes `aggregate_id` (tenant_id or user_id) for partitioned ordering
- Consumers should NOT assume global ordering
- Idempotency keys prevent duplicate processing regardless of delivery order

---

## NOTE C: Migration Auto-Rollback Threshold

**Context:** design.md mentions "Automatic rollback on error rate threshold" under Migration Safety Net

**Clarification:**
1. Auto-rollback is a **safety mechanism**, not a substitute for pre-migration validation
2. The error rate threshold is **configurable per migration type**
3. Default thresholds:
   - Schema migrations: 0% (any error triggers rollback)
   - Data migrations: 1% row-level errors (configurable)
   - Authorization cutover: 0.1% mismatch rate (per Req 8)

**Auto-Rollback Behavior:**

| Migration Type | Error Threshold | Rollback Scope |
|----------------|-----------------|----------------|
| DDL (schema) | Any failure | Full transaction |
| DML (data backfill) | > 1% rows | Batch rollback |
| Authorization cutover | > 0.1% mismatch | Instant route revert |
| Feature flag toggle | Any failure | Immediate revert |

**Implementation Guidance:**
1. All migrations MUST support dry-run mode
2. Auto-rollback MUST be triggered by monitoring, not manual observation
3. Post-rollback verification MUST confirm pre-migration state
4. Rollback events MUST emit security telemetry alert
5. Migrations MUST NOT proceed if pre-migration snapshot is missing

---

## Verification Checklist (Pre-Freeze)

| Check | Status |
|-------|--------|
| design.md V1.3 reconciled | ✅ |
| requirements.md V1_FROZEN (62 requirements) | ✅ |
| 16 invariants documented (INV-*) | ✅ |
| 12 locked decisions (L1-L12) | ✅ |
| 14 design decisions (D1-D14) | ✅ |
| 7 validation targets (V1-V7) | ✅ |
| 4 open decisions (O1-O4) | ✅ |
| 22 correctness properties | ✅ |
| C12/C13/C14 patches applied | ✅ |
| Working tree clean (except spec dir) | ✅ |

---

## Constraints Observed

- ✅ NO implementation code modified
- ✅ NO schema/migration changes
- ✅ NO database mutations
- ✅ NO push to remote

---

## Related Documents

| Document | Version | Status |
|----------|---------|--------|
| requirements.md | V1_FROZEN | FROZEN |
| design.md | 1.3 | FROZEN — MASTER ARCHITECTURE DESIGN V1 |
| FREEZE_NOTES.md | 1.0 | FROZEN |
