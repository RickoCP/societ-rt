# Requirements Document

## Introduction

This document specifies the comprehensive requirements for transforming SocieT-RT from a legacy single-tenant-per-user architecture into a scalable multi-tenant SaaS platform. The transformation encompasses:

1. **Organizational Hierarchy** — OrgUnit model (Organization → Cluster → RW → RT)
2. **Membership-Based Authorization** — Replacing legacy `User.tenantId` 1:1 relationship
3. **Central Permission System** — Explicit Role → Permission mapping (NO inheritance)
4. **Three Authorization Axes** — Role/Permission, Org Scope, Subscription Entitlement
5. **Session & Token Hardening** — Refresh tokens, token versioning, revocation
6. **PostgreSQL RLS** — Defense-in-depth tenant isolation (NO generic bypass)
7. **Subscription & Entitlement Foundation** — Plan-based feature gating

The implementation is phased across multiple milestones aligned with the project roadmap, with emphasis on data integrity, migration safety, and zero-downtime cutover. Specific milestone assignments will be determined during design and planning phases.

**Critical Design Principles:**
- Tenant is the security boundary (tenant_id, NOT orgUnit path)
- parentId is canonical for hierarchy (path/depth are derived)
- Membership becomes authorization authority (NOT User.tenantId)
- JWT is NOT authorization authority (identity/context only)
- Fail closed on unknown states
- Safety-critical functions (panic, emergency) must work during subscription suspension
- Role → Permission mapping is EXPLICIT (no inheritance between roles)
- Platform anomalies are QUARANTINED, never auto-remediated

---

## Decision Classification

### LOCKED (Frozen from M1/M2 — Cannot Change)

| ID | Decision | Evidence |
|----|----------|----------|
| L1 | 2 OrgUnits created: rt01 root `2459b0bb-115e-52ce-88cd-c176a9aa1e39`, rt02 root `50197f3e-5ebc-5547-91ba-e54b604e0edb` | M2_CLONE_VALIDATION_REPORT |
| L2 | 16 Memberships: 3 platform PLATFORM_ADMIN (tenant-level) + 13 RT org-scoped | M2_CLONE_VALIDATION_REPORT |
| L3 | 5 Platform anomalies quarantined in explicit manifest (PNA-01 through PNA-05) | PHASE_1_2A_ANOMALY_AUDIT |
| L4 | UUIDv5 deterministic OrgUnit IDs with namespace `f0e1d2c3-b4a5-5968-8776-655443322110` | M2_BACKFILL_DESIGN D2 |
| L5 | Role mapping: Ketua_RT → RT_ADMIN, Pengurus → ORG_ADMIN, Warga → RESIDENT, Security_Guard → SECURITY, Super_Admin → PLATFORM_ADMIN | M2 migration artifact |
| L6 | Non-admin RT users are org-scoped to RT root OrgUnit (NOT tenant-wide null) | M2_CLONE_VALIDATION_REPORT |
| L7 | OrgUnit path invariant: root has depth=0, path=[id]; depth = path.length - 1 | ARCHITECTURE_TARGET_DESIGN §1.2 |
| L8 | Tenant lifecycle state machine SEPARATE from Subscription_Status | Req 49 (PROVISIONING → ACTIVE → SUSPENDED → CLOSING → CLOSED → PURGED) |
| L9 | Role delegation via explicit matrix, NOT permission counting | Req 25 correction — TENANT_OWNER/ORG_ADMIN/RT_ADMIN have explicit delegation sets |
| L10 | Emergency access for SUSPENDED membership is allowed by default | Req 20 correction — safety priority over membership suspension state |
| L11 | Privileged execution is narrow capability, not superuser switch | Req 43 correction — not a generic RLS bypass flag |
| L12 | Tenant.lifecycleStatus is separate from Subscription.status | Req 23/49 correction — two independent state machines |

### DESIGN_DECISION (Implementation Choices Made)

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | JWT access token expiry: 15 minutes | Balance security vs. UX; authoritative validation each request |
| D2 | Refresh token: opaque 256-bit, SHA-256 hashed storage, 30-day expiry | Industry standard, reuse detection capable |
| D3 | JWT algorithm: HS256 | Sufficient for single-issuer; symmetric key rotation simpler |
| D4 | OrgUnit path storage: `uuid[]` (not ltree) | Prisma native support, shallow hierarchy ≤5 levels |
| D5 | Role → Permission: config-based static mapping | MVP simplicity; UI management deferred |
| D6 | RLS session variable: `app.current_tenant_id` | PostgreSQL standard pattern |
| D7 | Invitation expiry default: 7 days | Balance user convenience vs. security |
| D8 | Recovery token expiry: 1 hour | Short window reduces compromise risk |
| D9 | Step-up authentication validity: 5 minutes | Operation-scoped, minimizes replay window |
| D10 | Emergency escalation timeout default: 2 minutes | Balance urgency vs. false alarm handling |
| D11 | Signed URL TTL default: 15 minutes | Short-lived access for file downloads |

### VALIDATION_TARGET (Must Be Tested)

| ID | Property | Test Type |
|----|----------|-----------|
| V1 | Authorization context resolution < 100ms p99 | Performance test |
| V2 | Permission lookup < 10ms p99 | Performance test |
| V3 | RLS overhead < 20% query latency | Performance test |
| V4 | Token version mismatch → immediate rejection | Unit test |
| V5 | Refresh token reuse → family-wide revocation | Integration test |
| V6 | OrgUnit path consistency with parentId chain | Property test |
| V7 | Emergency operations succeed during SUSPENDED status | Integration test |

### OPEN_DECISION (Deferred)

| ID | Decision | Blocker |
|----|----------|---------|
| O1 | NIK uniqueness constraint: `UNIQUE(tenant_id, nik_hmac)` vs indexed lookup | Resident/residency model not final |
| O2 | TRIAL/PAST_DUE quota limits | Business rules not finalized |
| O3 | Authorization cache TTL and invalidation strategy | Redis infrastructure decision pending |
| O4 | User impersonation capability | High-risk, optional feature deferred |

---

## Glossary

- **Authorization_Pipeline**: The sequence of validation steps from authenticated user to resource access decision: Active Context → Membership → Status → Role → Permission → OrgUnit Scope → Entitlement → Resource Scope → ALLOW/DENY
- **Active_Context**: The currently selected tenant and OrgUnit combination for an authenticated user session
- **Membership**: A record linking a User to a Tenant with a role, optionally scoped to a specific OrgUnit
- **OrgUnit**: An organizational unit in the tenant hierarchy (ORGANIZATION, CLUSTER, RW, RT)
- **OrgUnit_Hierarchy**: The tree structure where ORGANIZATION > CLUSTER > RW > RT
- **Permission**: A specific action that can be performed on a resource (e.g., `resident:read`, `finance:write`)
- **Permission_Registry**: The central configuration mapping roles to explicit permission sets (NO inheritance)
- **Role**: A named authorization level with explicit permission grants: PLATFORM_ADMIN, TENANT_OWNER, ORG_ADMIN, RT_ADMIN, SECURITY, RESIDENT
- **Entitlement**: A feature or capability enabled by a tenant's subscription plan
- **Subscription_Plan**: A billing plan (Basic, Standard, Pro) that determines feature availability
- **Subscription_Status**: The lifecycle state of a tenant's subscription (TRIAL, ACTIVE, PAST_DUE, SUSPENDED, CLOSED)
- **Token_Version**: An integer on the User record used to force-invalidate all outstanding access tokens
- **Refresh_Token**: An opaque, revocable token stored server-side for obtaining new access tokens
- **Shadow_Authorization**: Parallel execution of legacy and new authorization logic for validation before cutover
- **RLS**: PostgreSQL Row-Level Security policies that enforce tenant isolation at the database layer
- **Safety_Critical_Operation**: Operations like panic alerts and emergency commands that must function during subscription suspension
- **Tenant_Isolation**: The security principle ensuring one tenant cannot access another tenant's data
- **Quarantine_Manifest**: Explicit list of known anomaly records excluded from automated migration (5 platform anomalies)
- **Privileged_Execution_Path**: Explicit, audited code path for cross-tenant operations (NOT generic RLS bypass)
- **Service_Principal**: Non-human identity for scheduled jobs and system integrations
- **Idempotency_Key**: Client-generated unique identifier enabling safe operation retries
- **Event_Outbox**: Transactional pattern for reliable at-least-once event publishing
- **Delegation_Matrix**: Explicit configuration of which roles can grant which other roles (TENANT_OWNER → {ORG_ADMIN, RT_ADMIN, SECURITY, RESIDENT}, ORG_ADMIN → {RT_ADMIN, SECURITY, RESIDENT}, RT_ADMIN → {SECURITY, RESIDENT})
- **Step_Up_Authentication**: Re-verification of identity for high-risk operations within an active session, requiring fresh credential proof
- **Emergency_Lifecycle**: State machine tracking panic/emergency from TRIGGERED → DISPATCHED → DELIVERED → ACKNOWLEDGED → RESPONDING → RESOLVED (with terminal states: CANCELLED, FALSE_ALARM, DELIVERY_FAILED)
- **IoT_Command_Lifecycle**: State machine tracking device commands from DESIRED → DISPATCHED → ACK_RECEIVED → VERIFIED/FAILED/TIMEOUT
- **Data_Classification**: Categorization of data sensitivity (PUBLIC, INTERNAL, CONFIDENTIAL, SENSITIVE, SAFETY_CRITICAL) for retention and access control
- **Tenant_Lifecycle**: State machine for tenant provisioning/termination: PROVISIONING → ACTIVE → SUSPENDED → CLOSING → CLOSED → PURGED (SEPARATE from Subscription_Status)
- **Invariant_Registry**: Central registry of machine-verifiable domain and security invariants with automated validation
- **Effective_Administrator**: A user who can administer a scope either directly (has admin role in that scope) or via authorized ancestor scope
- **Emergency_Policy**: Explicit configuration determining emergency access rights for edge cases like SUSPENDED membership

---

## Requirements

---

### Requirement 1: Membership Read Model

**User Story:** As a system architect, I want a membership read model that efficiently resolves user authorization context, so that authorization lookups are performant and accurate.

#### Acceptance Criteria

1. WHEN the System resolves a user's authorization context, THE Membership_Read_Model SHALL return all active memberships for the user within 50ms for up to 100 memberships
2. THE Membership_Read_Model SHALL include membership id, userId, tenantId, orgUnitId (nullable only for tenant-level admin roles), role, and status for each membership
3. THE Membership_Read_Model SHALL only return memberships with status ACTIVE when queried for authorization purposes
4. THE Membership_Read_Model SHALL filter memberships by tenantId when the active tenant context is provided
5. WHEN a membership status changes, THE System SHALL invalidate any cached authorization context for the affected user within 1 second
6. THE Membership_Read_Model SHALL support querying memberships scoped to a specific OrgUnit or any of its descendants
7. THE Membership_Read_Model SHALL NOT return memberships for the 5 quarantined platform anomalies (PNA-01 through PNA-05) in authorization queries

#### Testing Considerations
- Property test: For all users with memberships, querying without tenant filter returns superset of querying with tenant filter
- Property test: Active membership count ≤ total membership count (invariant)
- Integration test: Cache invalidation occurs within 1 second of status change
- Unit test: Quarantined anomaly users excluded from authorization resolution

---

### Requirement 2: Central Permission Registry (Explicit Mapping)

**User Story:** As a developer, I want a central permission registry with explicit role-to-permission mapping, so that authorization logic is consistent and auditable.

#### Acceptance Criteria

1. THE Permission_Registry SHALL define all valid permissions as typed constants using the pattern `{domain}:{action}` (e.g., `resident:read`, `finance:write`)
2. THE Permission_Registry SHALL map each MembershipRole to an EXPLICIT set of permissions (NO inheritance from other roles)
3. THE Permission_Registry SHALL treat SECURITY and RESIDENT as DISTINCT capability sets with different permissions (NOT equivalent hierarchy levels)
4. THE Permission_Registry SHALL be configuration-based (not hardcoded per route handler)
5. WHEN a role is queried for permissions, THE Permission_Registry SHALL return ONLY the explicitly mapped permissions for that role
6. THE Permission_Registry SHALL be loadable at application startup and SHALL be immutable during runtime
7. IF a permission check references an undefined permission, THEN THE System SHALL log an error and deny access (fail-closed)
8. THE Permission_Registry SHALL document the rationale for each permission grant per role

#### Testing Considerations
- Unit test: SECURITY role permissions differ from RESIDENT role permissions
- Unit test: All permissions referenced in route handlers exist in registry
- Unit test: Undefined permission check fails closed with logging
- Property test: Permission sets are explicit (no computed inheritance)

---

### Requirement 3: Authorization Context Resolution

**User Story:** As a route handler, I want to resolve complete authorization context from the authenticated user, so that I can make authorization decisions.

#### Acceptance Criteria

1. WHEN a request arrives with valid JWT, THE Authorization_Context_Resolver SHALL extract userId, tenantId, and tokenVersion from JWT claims
2. WHEN a request arrives with valid JWT, THE Authorization_Context_Resolver SHALL resolve the active membership from the Membership_Read_Model using userId and tenantId from JWT
3. IF the resolved membership status is not ACTIVE, THEN THE Authorization_Context_Resolver SHALL return an authorization denial with code `AUTH_MEMBERSHIP_INACTIVE`
4. IF no membership exists for the userId and tenantId combination, THEN THE Authorization_Context_Resolver SHALL return an authorization denial with code `AUTH_NO_MEMBERSHIP`
5. THE Authorization_Context_Resolver SHALL include the following in the resolved context: userId, tenantId, activeOrgUnitId (nullable only for tenant-level admins), role (from membership), permissions (from explicit registry lookup), tokenVersion
6. WHEN the user's tokenVersion in the database does not match the tokenVersion in the JWT, THE Authorization_Context_Resolver SHALL return an authorization denial with code `AUTH_TOKEN_REVOKED`
7. THE Authorization_Context_Resolver SHALL reject requests from users in the quarantine manifest (5 platform anomalies) with code `AUTH_USER_QUARANTINED`

#### Testing Considerations
- Property test: Valid JWT + active membership → authorization context is not null
- Unit test: Membership status SUSPENDED → AUTH_MEMBERSHIP_INACTIVE
- Unit test: Token version mismatch → AUTH_TOKEN_REVOKED
- Unit test: Quarantined user → AUTH_USER_QUARANTINED
- Integration test: E2E flow from JWT to resolved permissions

---

### Requirement 4: Active Tenant and OrgUnit Context

**User Story:** As a user with multiple tenant memberships, I want to switch between tenants and organizational units, so that I can work in the appropriate context.

#### Acceptance Criteria

1. THE System SHALL store the active tenant context (activeTenantId) in the JWT access token claims
2. THE System SHALL store the active OrgUnit context (activeOrgUnitId) in the JWT access token claims
3. WHEN a user requests to switch active tenant, THE Context_Switcher SHALL validate that the user has an ACTIVE membership in the target tenant
4. WHEN a user requests to switch active OrgUnit, THE Context_Switcher SHALL validate that the target OrgUnit belongs to the active tenant
5. WHEN a user requests to switch active OrgUnit, THE Context_Switcher SHALL validate that the user's membership scope includes the target OrgUnit
6. WHEN a valid context switch is completed, THE Context_Switcher SHALL issue a new access token with updated activeTenantId and activeOrgUnitId
7. IF a context switch request targets an invalid tenant or OrgUnit, THEN THE Context_Switcher SHALL return an error with code `CONTEXT_SWITCH_INVALID` and not modify the session
8. THE System SHALL allow activeOrgUnitId to be null ONLY for users with tenant-level admin roles (PLATFORM_ADMIN, TENANT_OWNER)

#### Testing Considerations
- Property test: After successful tenant switch, new JWT claims match requested tenant
- Unit test: Switch to tenant without membership → CONTEXT_SWITCH_INVALID
- Unit test: Switch to OrgUnit in different tenant → CONTEXT_SWITCH_INVALID
- Unit test: Non-admin user cannot have null activeOrgUnitId
- Integration test: Full token refresh cycle after context switch

---

### Requirement 5: Permission-Based Route Authorization

**User Story:** As a route handler, I want to authorize requests based on permissions, so that authorization is consistent across all endpoints.

#### Acceptance Criteria

1. THE Route_Authorizer SHALL accept a list of required permissions for each endpoint
2. WHEN checking authorization, THE Route_Authorizer SHALL resolve the authorization context for the current request
3. THE Route_Authorizer SHALL grant access only if ALL required permissions are present in the resolved context
4. IF any required permission is missing, THEN THE Route_Authorizer SHALL return a 403 response with code `AUTH_INSUFFICIENT_PERMISSION`
5. THE Route_Authorizer SHALL provide a decorator or middleware pattern for declaring required permissions on route handlers
6. THE Route_Authorizer SHALL log all authorization denials with correlationId, userId, tenantId, endpoint, and missing permissions
7. WHEN an unknown error occurs during authorization, THE Route_Authorizer SHALL fail closed and return a 500 response without exposing internal details

#### Testing Considerations
- Property test: User with all required permissions → access granted
- Property test: User missing at least one required permission → access denied
- Unit test: Unknown error during authorization → fail closed with 500
- Integration test: Authorization denial logs contain all required fields

---

### Requirement 6: OrgUnit Scope Authorization

**User Story:** As a route handler, I want to authorize requests based on OrgUnit scope, so that users can only access resources within their organizational scope.

#### Acceptance Criteria

1. WHEN checking OrgUnit scope authorization, THE OrgUnit_Scope_Authorizer SHALL verify the resource's OrgUnit is within the user's membership scope
2. THE OrgUnit_Scope_Authorizer SHALL consider a resource in scope if its orgUnitId matches the user's membership orgUnitId OR is a descendant of it
3. THE OrgUnit_Scope_Authorizer SHALL grant tenant-wide scope ONLY when the user has a tenant-level admin role (PLATFORM_ADMIN, TENANT_OWNER) with orgUnitId = null
4. IF the resource's OrgUnit is not within the user's scope, THEN THE OrgUnit_Scope_Authorizer SHALL return a 403 response with code `AUTH_OUT_OF_SCOPE`
5. THE OrgUnit_Scope_Authorizer SHALL use the OrgUnit path array for efficient descendant checking where depth = path.length - 1
6. THE OrgUnit_Scope_Authorizer SHALL always verify that the resource's tenantId matches the user's active tenantId (tenant is the security boundary, not OrgUnit path)
7. IF the tenant check fails, THEN THE OrgUnit_Scope_Authorizer SHALL return a 403 response with code `AUTH_TENANT_MISMATCH`

#### Testing Considerations
- Property test: Resource in descendant OrgUnit of membership scope → access granted
- Property test: Resource in sibling or parent OrgUnit of membership scope → access denied
- Unit test: Tenant mismatch → AUTH_TENANT_MISMATCH (higher priority than scope check)
- Unit test: Only tenant-level admins can have null orgUnitId for tenant-wide scope
- Property test: For all OrgUnits, depth = path.length - 1

---

### Requirement 7: Shadow Authorization Validation

**User Story:** As a system operator, I want to run shadow authorization that compares legacy and new authorization results, so that I can validate the new system before cutover.

#### Acceptance Criteria

1. WHEN shadow mode is enabled, THE Shadow_Authorization_Validator SHALL execute both legacy authorization (User.tenantId + UserRole) and new authorization (Membership-based) for each request
2. THE Shadow_Authorization_Validator SHALL log any mismatches between legacy and new authorization results with full context including correlationId, userId, tenantId, endpoint, legacyResult, and newResult
3. WHILE in shadow mode, THE System SHALL use the legacy authorization result for the actual access decision
4. THE Shadow_Authorization_Validator SHALL expose metrics for mismatch rate, false positives (new allows when legacy denies), and false negatives (new denies when legacy allows)
5. THE Shadow_Authorization_Validator SHALL support per-route opt-in for shadow validation during phased rollout
6. THE Shadow_Authorization_Validator SHALL NOT impact request latency by more than 50ms in the 95th percentile
7. WHEN mismatch rate exceeds a configurable threshold (default 1%), THE System SHALL emit an alert
8. THE Shadow_Authorization_Validator SHALL exclude the 5 quarantined platform anomalies from mismatch calculations

#### Testing Considerations
- Integration test: Mismatch detection and logging
- Performance test: Latency impact < 50ms p95
- Unit test: Quarantined anomalies excluded from mismatch rate

---

### Requirement 8: Authorization Cutover

**User Story:** As a system operator, I want to cut over from legacy to new authorization with minimal risk, so that I can complete the migration safely.

#### Acceptance Criteria

1. THE Authorization_Cutover SHALL support atomic switching from legacy to new authorization via feature flag
2. THE Authorization_Cutover SHALL support per-route granular cutover (not only global)
3. WHEN cutover is initiated for a route, THE System SHALL stop using legacy authorization and use only new authorization for that route
4. THE Authorization_Cutover SHALL support instant rollback to legacy authorization if issues are detected
5. THE Authorization_Cutover SHALL require shadow authorization mismatch rate below threshold (default 0.1%) before allowing cutover
6. THE Authorization_Cutover SHALL maintain an audit log of all cutover and rollback actions with timestamp, operator, routes affected, and reason
7. IF a rollback is triggered, THEN THE System SHALL emit a critical alert and log the reason

#### Testing Considerations
- Unit test: Cutover respects mismatch threshold
- Unit test: Rollback restores legacy authorization behavior
- Integration test: Per-route cutover independence
- E2E test: Full cutover and rollback cycle

---

### Requirement 9: Write-Path Migration for Membership

**User Story:** As a system architect, I want all write operations to maintain membership data alongside legacy User.tenantId, so that data remains consistent during the migration period.

#### Acceptance Criteria

1. WHEN a new user is created in a tenant, THE System SHALL create a corresponding Membership record with status ACTIVE
2. WHEN a user's role is updated via legacy API, THE System SHALL update the corresponding Membership record's role
3. WHEN a user is removed from a tenant, THE System SHALL update the Membership status to REVOKED and set revokedAt timestamp
4. THE System SHALL execute legacy User updates and Membership updates in a single database transaction to ensure atomicity
5. IF the Membership update fails, THEN THE entire transaction SHALL be rolled back (no partial state)
6. THE System SHALL log all dual-write operations with correlationId for debugging
7. THE System SHALL NOT automatically create memberships for the 5 quarantined platform anomalies

#### Testing Considerations
- Property test: After user creation, corresponding membership exists with matching role
- Property test: After role update, User.role and Membership.role match
- Unit test: Membership update failure → full transaction rollback
- Unit test: Quarantined anomaly users do not get automatic memberships

---

### Requirement 10: PostgreSQL Row-Level Security Foundation (No Generic Bypass)

**User Story:** As a security architect, I want PostgreSQL RLS policies that enforce tenant isolation at the database layer without generic bypass mechanisms.

#### Acceptance Criteria

1. THE RLS_Foundation SHALL create RLS policies on all tenant-scoped tables that filter by tenant_id
2. THE RLS_Foundation SHALL use a session variable (e.g., `app.current_tenant_id`) to set the current tenant context
3. WHEN a query is executed, THE RLS policy SHALL only return rows where tenant_id matches the session variable
4. THE RLS_Foundation SHALL deny INSERT, UPDATE, DELETE operations on rows where tenant_id does not match the session variable
5. THE RLS_Foundation SHALL NOT provide a generic bypass mechanism for PLATFORM_ADMIN role
6. THE RLS_Foundation SHALL require cross-tenant operations to use an EXPLICIT privileged execution path with mandatory audit logging
7. IF the session variable is not set, THEN THE RLS policy SHALL deny all access (fail-closed)
8. THE RLS_Foundation SHALL include policies for at least the following tables: users, memberships, org_units, households, residents, financial_transactions, announcements, votes, emergency_alerts, iot_devices
9. THE RLS_Foundation SHALL NOT apply to intentionally shared cross-tenant lookup tables (e.g., subscription_plans)

#### Testing Considerations
- Property test: Query without session variable → empty result set
- Property test: Query with session variable → only matching tenant rows
- Unit test: INSERT with mismatched tenant_id → denied
- Unit test: PLATFORM_ADMIN cannot bypass RLS without privileged execution path
- Integration test: Privileged execution path logs all cross-tenant operations

---

### Requirement 11: Legacy Data Remediation (Excluding Quarantined Anomalies)

**User Story:** As a data engineer, I want to remediate legacy data while explicitly excluding quarantined anomalies, so that the new authorization system works correctly for legitimate users.

#### Acceptance Criteria

1. THE Legacy_Data_Remediation SHALL identify all users without a corresponding Membership record EXCLUDING the 5 quarantined platform anomalies
2. THE Legacy_Data_Remediation SHALL create Membership records for users based on their existing User.tenantId and User.role
3. THE Legacy_Data_Remediation SHALL map legacy UserRole values to MembershipRole values: Super_Admin → PLATFORM_ADMIN, Ketua_RT → RT_ADMIN, Pengurus → ORG_ADMIN, Warga → RESIDENT, Security_Guard → SECURITY
4. THE Legacy_Data_Remediation SHALL set orgUnitId to the RT root OrgUnit for non-admin RT users (NOT null tenant-wide scope)
5. THE Legacy_Data_Remediation SHALL generate a report listing all created memberships with before/after state
6. THE Legacy_Data_Remediation SHALL support dry-run mode that generates the report without making changes
7. IF a user has User.tenantId but the tenant does not exist, THEN THE Legacy_Data_Remediation SHALL log a warning and skip that user
8. THE Legacy_Data_Remediation SHALL NEVER automatically remediate the 5 quarantined platform anomalies (PNA-01 through PNA-05)
9. THE Legacy_Data_Remediation SHALL verify the quarantine manifest matches exactly 5 users with expected tenant and role before proceeding

#### Testing Considerations
- Property test: After remediation, non-quarantined user count with memberships = total eligible user count
- Unit test: Dry-run mode makes no database changes
- Unit test: Quarantined anomalies remain without memberships
- Unit test: Manifest verification fails if anomaly count ≠ 5
- Integration test: Full remediation on test dataset excludes anomalies

---

### Requirement 12: Remove Legacy User.tenantId Dependency

**User Story:** As a developer, I want to remove all code dependencies on User.tenantId, so that the codebase uses only the new authorization model.

#### Acceptance Criteria

1. THE Legacy_Removal SHALL identify all code paths that read User.tenantId for authorization purposes
2. THE Legacy_Removal SHALL update all identified code paths to resolve tenant from the active authorization context (derived from Membership)
3. THE Legacy_Removal SHALL NOT remove the User.tenantId column until all code dependencies are removed
4. THE Legacy_Removal SHALL maintain backward compatibility for any external integrations that depend on User.tenantId during the transition
5. WHEN all code dependencies are removed, THE Legacy_Removal SHALL add a deprecation warning to any remaining User.tenantId access
6. THE Legacy_Removal SHALL validate that all route handlers use Membership-based authorization before marking complete

#### Testing Considerations
- Static analysis: Grep for User.tenantId usage in authorization paths
- Unit test: All route handlers resolve tenant from authorization context
- Integration test: E2E flows work without User.tenantId

---

### Requirement 13: Legacy Schema Cleanup

**User Story:** As a database administrator, I want to remove deprecated columns and tables after successful migration, so that the schema is clean and maintainable.

#### Acceptance Criteria

1. THE Legacy_Schema_Cleanup SHALL only execute after all code dependencies on legacy fields are removed
2. THE Legacy_Schema_Cleanup SHALL remove the User.tenantId column from the users table
3. THE Legacy_Schema_Cleanup SHALL remove the legacy UserRole enum values that are no longer used
4. THE Legacy_Schema_Cleanup SHALL create a backup of affected tables before any destructive operation
5. THE Legacy_Schema_Cleanup SHALL support rollback by restoring from backup if issues are detected within 24 hours
6. THE Legacy_Schema_Cleanup SHALL update Prisma schema to reflect the removed fields
7. THE Legacy_Schema_Cleanup SHALL be executed during a maintenance window with the application in read-only mode

#### Testing Considerations
- Pre-condition test: All code dependencies removed before execution
- Unit test: Backup is created before cleanup
- Integration test: Application functions correctly after cleanup
- Rollback test: Restore from backup restores full functionality

---

### Requirement 14: Refresh Token Implementation

**User Story:** As a security engineer, I want a secure refresh token system, so that users can maintain sessions without exposing long-lived credentials.

#### Acceptance Criteria

1. THE Refresh_Token_System SHALL generate opaque random 256-bit refresh tokens (not JWT)
2. THE Refresh_Token_System SHALL store only the SHA-256 hash of the refresh token in the database
3. THE Refresh_Token_System SHALL associate each refresh token with a familyId for rotation tracking, where familyId remains STABLE across all rotations within the same family
4. THE Refresh_Token_System SHALL maintain a generation/sequence counter that increments monotonically with each rotation within the same family
5. WHEN a refresh token is used, THE System SHALL issue a new refresh token (incrementing generation) and mark the old one as revoked with replacedBy reference
6. IF a revoked refresh token is used, THEN THE System SHALL revoke all tokens in the same family (reuse detection) and return error code `AUTH_TOKEN_REUSE_DETECTED`
7. THE Refresh_Token_System SHALL store refresh tokens as HttpOnly, Secure, SameSite=Strict cookies
8. THE Refresh_Token_System SHALL set refresh token expiry to 30 days by default (configurable)
9. THE Refresh_Token_System SHALL log all refresh token operations with userId, familyId, generation, and action (create, refresh, revoke)

#### Testing Considerations
- Property test: familyId remains stable across all rotations within the same family
- Property test: generation increments monotonically on each rotation within the same family
- Unit test: Revoked token usage triggers family-wide revocation
- Unit test: Token hash matches original token
- Integration test: Full refresh flow with cookie handling

---

### Requirement 15: Token Version for Forced Invalidation

**User Story:** As a security engineer, I want to force-invalidate all user tokens instantly, so that I can respond to security incidents.

#### Acceptance Criteria

1. THE Token_Version_System SHALL add a tokenVersion integer column to the User table with default value 0
2. THE Token_Version_System SHALL include tokenVersion in JWT access token claims
3. WHEN validating a JWT, THE System SHALL compare the token's tokenVersion with the user's current tokenVersion in the database
4. IF the tokenVersion in JWT is less than the user's current tokenVersion, THEN THE System SHALL reject the token with code `AUTH_TOKEN_REVOKED`
5. THE Token_Version_System SHALL provide an API to increment a user's tokenVersion (force logout all sessions)
6. THE Token_Version_System SHALL increment tokenVersion AND revoke all refresh tokens when called
7. THE Token_Version_System SHALL support bulk tokenVersion increment for all users in a tenant (tenant-wide force logout)

#### Testing Considerations
- Property test: tokenVersion increment → all existing tokens rejected
- Unit test: Stale tokenVersion in JWT → AUTH_TOKEN_REVOKED
- Integration test: Force logout revokes both access and refresh tokens

---

### Requirement 16: Session Revocation and Logout

**User Story:** As a user, I want to log out from my current session or all sessions, so that I can secure my account.

#### Acceptance Criteria

1. WHEN a user logs out, THE Session_Manager SHALL revoke the current refresh token
2. WHEN a user logs out, THE Session_Manager SHALL clear the access token cookie
3. THE Session_Manager SHALL provide a "logout all devices" action that increments tokenVersion and revokes all refresh tokens for the user
4. THE Session_Manager SHALL provide a "logout from tenant" action that revokes all refresh tokens associated with a specific tenant
5. WHEN a membership is revoked, THE System SHALL automatically trigger "logout from tenant" for the affected user and tenant
6. THE Session_Manager SHALL return success even if the token is already revoked (idempotent)
7. THE Session_Manager SHALL log all logout operations with userId, action type, and correlationId

#### Testing Considerations
- Property test: After logout, refresh token is not valid
- Unit test: Logout all devices increments tokenVersion
- Unit test: Membership revocation triggers tenant logout
- Integration test: E2E logout flow clears cookies

---

### Requirement 17: Subscription Plan Management

**User Story:** As a platform administrator, I want to manage subscription plans, so that I can define feature entitlements for tenants.

#### Acceptance Criteria

1. THE Subscription_Plan_Manager SHALL support CRUD operations for subscription plans
2. THE Subscription_Plan_Manager SHALL define each plan with: name, maxUsers (nullable for unlimited), features array, and price
3. THE Subscription_Plan_Manager SHALL enforce that plan names are unique
4. THE Subscription_Plan_Manager SHALL support at minimum three plans: Basic, Standard, Pro
5. WHEN a plan is deleted, THE System SHALL verify no tenants are currently subscribed to that plan
6. IF a plan has active subscribers, THEN THE System SHALL reject deletion with error code `PLAN_HAS_SUBSCRIBERS`
7. THE Subscription_Plan_Manager SHALL log all plan changes with before/after state and operator userId

#### Testing Considerations
- Unit test: Plan with subscribers cannot be deleted
- Unit test: Duplicate plan name rejected
- Integration test: Plan CRUD operations

---

### Requirement 18: Tenant Subscription Status Management

**User Story:** As a billing system, I want to manage tenant subscription status, so that entitlements are enforced based on payment status.

#### Acceptance Criteria

1. THE Subscription_Status_Manager SHALL support the following statuses: TRIAL, ACTIVE, PAST_DUE, SUSPENDED, CLOSED
2. WHEN a tenant transitions to SUSPENDED status, THE System SHALL restrict non-critical operations per the policy matrix
3. WHEN a tenant transitions to CLOSED status, THE System SHALL deny all operations except data export
4. THE Subscription_Status_Manager SHALL maintain status history with timestamps for audit
5. THE Subscription_Status_Manager SHALL emit events on status transitions for downstream systems
6. THE Subscription_Status_Manager SHALL enforce status transition rules: TRIAL → ACTIVE, ACTIVE → PAST_DUE → SUSPENDED → CLOSED (with allowed skips)
7. IF an invalid status transition is attempted, THEN THE System SHALL reject with error code `INVALID_STATUS_TRANSITION`

#### Testing Considerations
- Property test: Valid status transitions form a directed acyclic graph
- Unit test: Invalid transition rejected
- Integration test: Status transition emits event

---

### Requirement 19: Entitlement Enforcement

**User Story:** As a route handler, I want to check tenant entitlements before allowing access to premium features, so that feature access is controlled by subscription.

#### Acceptance Criteria

1. THE Entitlement_Enforcer SHALL resolve tenant's subscription plan and status before checking entitlements
2. THE Entitlement_Enforcer SHALL deny access to features not included in the tenant's plan with error code `ENTITLEMENT_NOT_AVAILABLE`
3. THE Entitlement_Enforcer SHALL provide a decorator or middleware pattern for declaring required entitlements on route handlers
4. WHILE tenant status is SUSPENDED, THE Entitlement_Enforcer SHALL allow only safety-critical operations and billing/recovery flows
5. WHILE tenant status is SUSPENDED, THE Entitlement_Enforcer SHALL deny normal IoT commands with error code `TENANT_SUSPENDED`
6. THE Entitlement_Enforcer SHALL never deny emergency/panic operations regardless of subscription status
7. THE Entitlement_Enforcer SHALL log all entitlement denials with tenantId, feature, plan, and status

#### Testing Considerations
- Unit test: Feature not in plan → ENTITLEMENT_NOT_AVAILABLE
- Unit test: SUSPENDED tenant → emergency operations allowed
- Unit test: SUSPENDED tenant → normal commands denied
- Integration test: Full entitlement check flow

---

### Requirement 20: Safety-Critical Operation Protection (Emergency Delivery Guarantee)

**User Story:** As a resident, I want panic and emergency functions to always work, so that my safety is not compromised by billing issues or accidental membership suspension.

#### Acceptance Criteria

1. THE Safety_Critical_Protection SHALL define a list of safety-critical operations: emergency_alert:create, alarm:trigger, panic_button:activate
2. THE Safety_Critical_Protection SHALL bypass subscription status checks for all safety-critical operations
3. THE Safety_Critical_Protection SHALL still enforce authentication and tenant membership for safety-critical operations
4. THE Safety_Critical_Protection SHALL log all safety-critical operation invocations with elevated audit level
5. WHEN a safety-critical operation is invoked during subscription SUSPENDED status, THE System SHALL emit an alert to billing team
6. THE Safety_Critical_Protection SHALL NOT bypass permission checks (user must still have the required permission)
7. IF a non-safety-critical operation claims to be safety-critical, THEN THE System SHALL reject and log a security event
8. THE Safety_Critical_Protection SHALL use a dedicated high-priority message queue for emergency operations
9. THE Safety_Critical_Protection SHALL retry emergency operations up to 3 times with exponential backoff before failing
10. THE Safety_Critical_Protection SHALL apply the following Emergency_Policy for membership status and emergency access:
    - REVOKED membership → panic DENIED
    - INVITED membership → panic DENIED
    - ACTIVE membership → panic ALLOWED
    - SUSPENDED membership → panic ALLOWED with elevated audit (safety priority over membership suspension)
11. WHEN emergency access is granted for SUSPENDED membership, THE System SHALL log the incident with full context and alert administrators

#### Testing Considerations
- Unit test: Emergency alert works during subscription SUSPENDED status
- Unit test: Emergency alert works during membership SUSPENDED status (with audit)
- Unit test: Emergency denied for REVOKED or INVITED membership
- Unit test: Normal operation denied during SUSPENDED status
- Unit test: Safety-critical still requires valid membership (not REVOKED)
- Integration test: Full emergency flow during subscription suspension
- Integration test: Full emergency flow during membership suspension
- Integration test: Emergency delivery succeeds under degraded conditions

---

### Requirement 21: OrgUnit Hierarchy Management

**User Story:** As a tenant administrator, I want to manage the organizational hierarchy, so that I can structure my tenant appropriately.

#### Acceptance Criteria

1. THE OrgUnit_Manager SHALL support creating OrgUnits with type: ORGANIZATION, CLUSTER, RW, RT
2. THE OrgUnit_Manager SHALL enforce hierarchy rules: ORGANIZATION can contain CLUSTER, CLUSTER can contain RW, RW can contain RT
3. THE OrgUnit_Manager SHALL enforce same-tenant constraint: child OrgUnit must have same tenantId as parent
4. WHEN an OrgUnit is created, THE System SHALL compute and set path and depth from parentId where depth = path.length - 1
5. THE OrgUnit_Manager SHALL support moving an OrgUnit subtree to a new parent within the same tenant
6. WHEN a subtree is moved, THE System SHALL update path and depth for all descendants in a single transaction
7. THE OrgUnit_Manager SHALL prevent cycles in the hierarchy
8. THE OrgUnit_Manager SHALL prevent deleting an OrgUnit that has children or memberships
9. THE OrgUnit_Manager SHALL ensure root OrgUnits have depth=0 and path=[id] (array containing only their own id)

#### Testing Considerations
- Property test: For all OrgUnits, depth = path.length - 1
- Property test: Root OrgUnits have depth=0 and path=[id]
- Property test: No cycles exist in hierarchy
- Unit test: Cross-tenant parent rejected
- Unit test: Delete with children rejected
- Integration test: Subtree move updates all descendants

---

### Requirement 22: Membership Lifecycle Management

**User Story:** As a tenant administrator, I want to manage user memberships, so that I can control who has access to my tenant.

#### Acceptance Criteria

1. THE Membership_Manager SHALL support creating memberships with status INVITED or ACTIVE
2. THE Membership_Manager SHALL enforce uniqueness: one org-scoped membership per (userId, tenantId, orgUnitId), one tenant-level membership per (userId, tenantId) where orgUnitId is null
3. THE Membership_Manager SHALL support transitioning membership status: INVITED → ACTIVE, ACTIVE → SUSPENDED → REVOKED
4. WHEN a membership is REVOKED, THE System SHALL set revokedAt timestamp and never allow reactivation of that specific membership record
5. THE Membership_Manager SHALL validate that role assignment respects delegation rules (see Requirement 25)
6. THE Membership_Manager SHALL validate that orgUnitId (if provided) belongs to the same tenant
7. THE Membership_Manager SHALL emit events on membership status changes for audit and session management

#### Testing Considerations
- Unit test: Duplicate membership rejected
- Unit test: Cross-tenant OrgUnit rejected
- Integration test: Status change emits event

---

### Requirement 23: Tenant Onboarding Flow

**User Story:** As a new tenant, I want to onboard my organization through a guided process, so that my tenant is properly configured.

#### Acceptance Criteria

1. THE Tenant_Onboarding_Flow SHALL create a new Tenant with lifecycleStatus = PROVISIONING (separate from subscription status)
2. THE Tenant_Onboarding_Flow SHALL create a Subscription with status = TRIAL for the new tenant
3. THE Tenant_Onboarding_Flow SHALL create a root OrgUnit of type ORGANIZATION for the new tenant with depth=0 and path=[id]
4. THE Tenant_Onboarding_Flow SHALL create a Membership with role TENANT_OWNER for the onboarding user
5. THE Tenant_Onboarding_Flow SHALL set the new user's active context to the new tenant
6. THE Tenant_Onboarding_Flow SHALL assign a default subscription plan (configurable, default: Basic)
7. THE Tenant_Onboarding_Flow SHALL execute all operations in a single transaction (all-or-nothing)
8. WHEN provisioning completes successfully, THE System SHALL transition Tenant.lifecycleStatus to ACTIVE (Subscription.status remains TRIAL)
9. IF any step fails, THEN THE Tenant_Onboarding_Flow SHALL rollback all changes and return a specific error code

#### Testing Considerations
- Property test: After successful onboarding, tenant has exactly one TENANT_OWNER membership
- Property test: Root OrgUnit has depth=0 and path=[id]
- Unit test: Tenant.lifecycleStatus = PROVISIONING during onboarding, ACTIVE after completion
- Unit test: Subscription.status = TRIAL independent of Tenant.lifecycleStatus
- Unit test: Partial failure → complete rollback
- Integration test: Full onboarding flow

---

### Requirement 24: Audit Trail for Authorization Events (Immutable)

**User Story:** As a security auditor, I want complete immutable audit trails of authorization events, so that I can investigate security incidents.

#### Acceptance Criteria

1. THE Audit_Trail SHALL log all authorization decisions (allow and deny) with: timestamp, correlationId, userId, tenantId, orgUnitId, endpoint, decision, reason
2. THE Audit_Trail SHALL log all membership changes with: timestamp, userId, membershipId, oldStatus, newStatus, changedBy
3. THE Audit_Trail SHALL log all permission checks with result and missing permissions if denied
4. THE Audit_Trail SHALL log all token operations: issue, refresh, revoke, forced invalidation
5. THE Audit_Trail SHALL retain audit logs for a configurable period (default: 90 days)
6. THE Audit_Trail SHALL never log sensitive data: passwords, tokens, PII
7. THE Audit_Trail SHALL support querying by userId, tenantId, timeRange, and event type
8. THE Audit_Trail SHALL be append-only and immutable (even PLATFORM_ADMIN cannot delete audit entries)
9. THE Audit_Trail SHALL use cryptographic chaining (hash of previous entry) to detect tampering

#### Testing Considerations
- Property test: Every authorization decision has corresponding audit log entry
- Unit test: Sensitive data is not logged
- Unit test: Delete operation on audit trail fails
- Integration test: Audit query returns matching events
- Integration test: Tampering detection via hash chain verification

---

### Requirement 25: Delegated Administration

**User Story:** As an ORG_ADMIN, I want to manage users within my OrgUnit subtree without being able to escalate privileges.

#### Acceptance Criteria

1. THE Delegated_Administration SHALL allow administrators to create memberships only within their OrgUnit subtree
2. THE Delegated_Administration SHALL enforce an EXPLICIT Delegation_Matrix that defines which roles can grant which other roles:
   - TENANT_OWNER → can delegate {ORG_ADMIN, RT_ADMIN, SECURITY, RESIDENT}
   - ORG_ADMIN → can delegate {RT_ADMIN, SECURITY, RESIDENT}
   - RT_ADMIN → can delegate {SECURITY, RESIDENT}
3. THE Delegated_Administration SHALL NOT calculate "delegatable roles" by counting or comparing permission sets (NO implicit hierarchy)
4. THE Delegated_Administration SHALL prevent any role from granting PLATFORM_ADMIN (platform-level operation only)
5. THE Delegated_Administration SHALL prevent any role from granting TENANT_OWNER except through explicit ownership transfer flow (Req 54)
6. THE Delegated_Administration SHALL log all delegation attempts (successful and failed) with delegator role, target user, requested role, and OrgUnit
7. IF a delegation attempt violates the Delegation_Matrix, THEN THE System SHALL reject with code `AUTH_DELEGATION_VIOLATION`
8. THE Delegated_Administration SHALL validate that the delegator's membership is ACTIVE before allowing any delegation
9. THE Delegation_Matrix SHALL be configurable per tenant (with platform defaults) to allow tenants to further restrict delegation

#### Testing Considerations
- Unit test: ORG_ADMIN can grant RT_ADMIN, SECURITY, RESIDENT roles
- Unit test: ORG_ADMIN cannot grant TENANT_OWNER or ORG_ADMIN roles
- Unit test: RT_ADMIN can only grant SECURITY or RESIDENT roles
- Unit test: No role can grant PLATFORM_ADMIN
- Property test: For all delegation attempts, granted role is in delegator's Delegation_Matrix entry
- Integration test: Delegation audit trail complete

---

### Requirement 26: Resource Scope Matrix

**User Story:** As a system architect, I want a clear matrix defining which operations respect OrgUnit scope vs tenant-wide access.

#### Acceptance Criteria

1. THE Resource_Scope_Matrix SHALL classify all resource operations as: ORG_SCOPED, TENANT_WIDE, or PLATFORM_WIDE
2. THE Resource_Scope_Matrix SHALL enforce ORG_SCOPED access for: Residents, Households, Announcements (local), Votes (local), IoT devices
3. THE Resource_Scope_Matrix SHALL enforce TENANT_WIDE access for: Tenant settings, Subscription management, User directory
4. THE Resource_Scope_Matrix SHALL enforce PLATFORM_WIDE access for: Plan management, Platform configuration (PLATFORM_ADMIN only)
5. THE Resource_Scope_Matrix SHALL be documented and versioned alongside the API
6. IF a route is not classified in the matrix, THEN THE System SHALL default to ORG_SCOPED (fail-safe)
7. THE Resource_Scope_Matrix SHALL be validated at startup to ensure all routes are classified

#### Testing Considerations
- Unit test: Unclassified route defaults to ORG_SCOPED
- Integration test: All existing routes have matrix classification
- Property test: Access patterns match matrix classification

---

### Requirement 27: Household/Resident Authorization

**User Story:** As a household head, I want to manage my household members, but I must not be able to access other households.

#### Acceptance Criteria

1. THE Household_Authorization SHALL allow household head to view and update their own household data
2. THE Household_Authorization SHALL allow household head to act on behalf of dependents within their household
3. THE Household_Authorization SHALL prevent any user from accessing households other than their own (except authorized admins)
4. THE Household_Authorization SHALL validate household membership before allowing dependent actions
5. THE Household_Authorization SHALL log all household-scope operations with householdId and actingUserId
6. IF a user attempts to access a household they don't belong to, THEN THE System SHALL return code `AUTH_HOUSEHOLD_MISMATCH`
7. THE Household_Authorization SHALL respect OrgUnit scope (household must be within user's org scope for admin access)

#### Testing Considerations
- Unit test: User cannot access other household's data
- Unit test: Household head can view dependents
- Unit test: Admin can access household only within their OrgUnit scope
- Integration test: Household authorization audit trail

---

### Requirement 28: TOCTOU Prevention

**User Story:** As a security engineer, I want to prevent time-of-check to time-of-use race conditions in sensitive operations.

#### Acceptance Criteria

1. THE TOCTOU_Prevention SHALL use database-level locking for critical membership operations
2. THE TOCTOU_Prevention SHALL use optimistic concurrency control with version checks for resource updates
3. THE TOCTOU_Prevention SHALL validate authorization immediately before executing mutating operations (not just at request start)
4. THE TOCTOU_Prevention SHALL detect and reject concurrent conflicting operations with code `CONFLICT_DETECTED`
5. THE TOCTOU_Prevention SHALL use SELECT FOR UPDATE for operations that depend on current state
6. THE TOCTOU_Prevention SHALL document which operations are TOCTOU-sensitive
7. IF a TOCTOU race is detected, THEN THE System SHALL log the incident with full context for security review

#### Testing Considerations
- Concurrency test: Parallel membership modifications detected
- Concurrency test: Authorization checked after state change detected
- Unit test: Version mismatch rejects update
- Integration test: SELECT FOR UPDATE prevents race condition

---

### Requirement 29: Service Principal / Machine Identity

**User Story:** As a system architect, I want non-human identities for scheduled jobs and integrations, so that system operations don't require human credentials.

#### Acceptance Criteria

1. THE Service_Principal_System SHALL support creating machine identities distinct from user accounts
2. THE Service_Principal_System SHALL authenticate service principals using API keys (not JWT)
3. THE Service_Principal_System SHALL scope service principal permissions to specific operations (least privilege)
4. THE Service_Principal_System SHALL associate each service principal with a tenant (or platform for cross-tenant jobs)
5. THE Service_Principal_System SHALL support API key rotation without service downtime
6. THE Service_Principal_System SHALL log all service principal operations with the principal's identity
7. THE Service_Principal_System SHALL NOT allow service principals to impersonate users
8. IF a service principal API key is compromised, THEN THE System SHALL support immediate revocation

#### Testing Considerations
- Unit test: Service principal cannot use user authentication endpoints
- Unit test: Service principal respects permission scope
- Integration test: API key rotation maintains service continuity
- Security test: Revoked API key immediately rejected

---

### Requirement 30: Webhook/M2M Authentication

**User Story:** As an integration developer, I want secure webhook authentication, so that inbound integrations can be verified.

#### Acceptance Criteria

1. THE Webhook_Authentication SHALL verify HMAC-SHA256 signatures on inbound webhooks
2. THE Webhook_Authentication SHALL use per-integration shared secrets for signature verification
3. THE Webhook_Authentication SHALL reject requests with invalid or missing signatures with code `WEBHOOK_SIGNATURE_INVALID`
4. THE Webhook_Authentication SHALL validate timestamp in webhook payload to prevent replay attacks (within 5 minutes)
5. THE Webhook_Authentication SHALL support secret rotation with overlap period for zero-downtime updates
6. THE Webhook_Authentication SHALL log all webhook attempts (valid and invalid) for debugging
7. THE Webhook_Authentication SHALL rate-limit webhook endpoints per source IP

#### Testing Considerations
- Unit test: Invalid signature rejected
- Unit test: Expired timestamp rejected (replay prevention)
- Integration test: Valid webhook processed successfully
- Security test: Rate limiting prevents abuse

---

### Requirement 31: Tenant Offboarding

**User Story:** As a platform operator, I want to offboard tenants safely with proper data retention and export.

#### Acceptance Criteria

1. THE Tenant_Offboarding SHALL provide data export before closure (all tenant data in portable format)
2. THE Tenant_Offboarding SHALL maintain closed tenant data for regulatory retention period (configurable, default: 7 years)
3. THE Tenant_Offboarding SHALL revoke all memberships and sessions on closure
4. THE Tenant_Offboarding SHALL prevent any new operations after CLOSED status except data export
5. WHEN retention period expires, THE System SHALL perform hard delete of all tenant data
6. THE Tenant_Offboarding SHALL generate audit trail of offboarding process
7. THE Tenant_Offboarding SHALL notify affected users of closure with configurable notice period

#### Testing Considerations
- Integration test: Data export contains all tenant data
- Unit test: CLOSED tenant blocks all operations except export
- Integration test: Hard delete after retention period
- Audit test: Offboarding process fully logged

---

### Requirement 32: Backup/DR Requirements

**User Story:** As a platform operator, I want backup and disaster recovery capabilities to meet SLA requirements.

#### Acceptance Criteria

1. THE Backup_System SHALL perform point-in-time recovery capable backups at minimum every 1 hour
2. THE Backup_System SHALL support cross-region replication for disaster recovery
3. THE Backup_System SHALL define RTO (Recovery Time Objective) of 4 hours and RPO (Recovery Point Objective) of 1 hour
4. THE Backup_System SHALL encrypt all backups at rest
5. THE Backup_System SHALL test backup restoration quarterly and document results
6. THE Backup_System SHALL maintain backup integrity verification (checksums)
7. THE Backup_System SHALL support tenant-specific data restoration without affecting other tenants

#### Testing Considerations
- Quarterly DR test: Full restoration within RTO
- Integration test: Point-in-time recovery accuracy
- Security test: Backup encryption verification
- Isolation test: Single-tenant restoration doesn't affect others

---

### Requirement 33: Event Outbox Pattern

**User Story:** As a system architect, I want reliable event publishing with at-least-once delivery guarantee.

#### Acceptance Criteria

1. THE Event_Outbox SHALL store events in a transactional outbox table alongside business data
2. THE Event_Outbox SHALL process events asynchronously with at-least-once delivery guarantee
3. THE Event_Outbox SHALL include idempotency keys in events for safe consumer retry
4. THE Event_Outbox SHALL support event ordering within aggregate (e.g., per tenant, per user)
5. THE Event_Outbox SHALL monitor for stuck/unprocessed events and alert if events older than 5 minutes exist
6. THE Event_Outbox SHALL support dead-letter queue for permanently failed events
7. THE Event_Outbox SHALL log all event publishing attempts with event type and outcome

#### Testing Considerations
- Property test: Transaction commit → event guaranteed in outbox
- Integration test: Consumer receives event at least once
- Failure test: System crash after commit → event still delivered
- Monitoring test: Stuck event alert triggers

---

### Requirement 34: IoT Device Abstraction

**User Story:** As a system architect, I want an abstraction layer for IoT devices, so that future ESP32/sensor integration is supported.

#### Acceptance Criteria

1. THE IoT_Device_Abstraction SHALL define a device identity model separate from user identity
2. THE IoT_Device_Abstraction SHALL support device registration with tenant and OrgUnit binding
3. THE IoT_Device_Abstraction SHALL authenticate devices using certificates or pre-shared keys (not user tokens)
4. THE IoT_Device_Abstraction SHALL scope device permissions to specific data ingestion and command capabilities
5. THE IoT_Device_Abstraction SHALL support device deprovisioning and key revocation
6. THE IoT_Device_Abstraction SHALL log all device communication attempts
7. THE IoT_Device_Abstraction SHALL enforce tenant isolation at the device level

#### Testing Considerations
- Unit test: Device cannot access other tenant's data
- Unit test: Device authentication distinct from user authentication
- Integration test: Device registration and binding flow
- Security test: Revoked device immediately rejected

---

### Requirement 35: Observability Foundation

**User Story:** As a platform operator, I want comprehensive observability for monitoring and debugging.

#### Acceptance Criteria

1. THE Observability_Foundation SHALL implement structured JSON logging with consistent field names
2. THE Observability_Foundation SHALL include correlationId in all logs for request tracing
3. THE Observability_Foundation SHALL implement distributed tracing across service boundaries
4. THE Observability_Foundation SHALL collect metrics for: request latency, error rates, queue depths, cache hit rates
5. THE Observability_Foundation SHALL mask PII in logs (use masking helper for NIK, email, phone)
6. THE Observability_Foundation SHALL support log level configuration without restart
7. THE Observability_Foundation SHALL define dashboards for: system health, authorization performance, tenant activity

#### Testing Considerations
- Unit test: PII masking in logs
- Unit test: CorrelationId propagation
- Integration test: Trace spans across boundaries
- Monitoring test: Dashboard displays correct metrics

---

### Requirement 36: Migration Safety Net

**User Story:** As a system operator, I want migration safety mechanisms to prevent data corruption.

#### Acceptance Criteria

1. THE Migration_Safety_Net SHALL support shadow mode for parallel execution of old and new code paths
2. THE Migration_Safety_Net SHALL define automatic rollback triggers based on error rate thresholds
3. THE Migration_Safety_Net SHALL implement canary promotion gates requiring manual approval
4. THE Migration_Safety_Net SHALL create pre-migration snapshots for rollback
5. THE Migration_Safety_Net SHALL verify data consistency after migration (row counts, checksums)
6. THE Migration_Safety_Net SHALL support dry-run mode for migrations
7. THE Migration_Safety_Net SHALL log all migration steps with timing and outcome

#### Testing Considerations
- Integration test: Shadow mode mismatch detection
- Unit test: Rollback trigger fires at threshold
- Integration test: Canary gate blocks without approval
- Consistency test: Post-migration verification passes

---

### Requirement 37: Environment Separation

**User Story:** As a security engineer, I want strict environment separation to prevent cross-environment data leakage.

#### Acceptance Criteria

1. THE Environment_Separation SHALL enforce distinct databases for dev/staging/prod
2. THE Environment_Separation SHALL prevent production credentials from being used in non-production
3. THE Environment_Separation SHALL use distinct signing keys per environment
4. THE Environment_Separation SHALL prevent production data export to non-production environments
5. THE Environment_Separation SHALL label all logs and metrics with environment identifier
6. THE Environment_Separation SHALL validate environment configuration at startup
7. IF environment misconfiguration is detected, THEN THE System SHALL refuse to start with clear error message

#### Testing Considerations
- Unit test: Production key rejected in non-production
- Startup test: Misconfiguration prevents boot
- Security test: No cross-environment credential reuse

---

### Requirement 38: PII/NIK Protection

**User Story:** As a compliance officer, I want NIK and PII protected according to regulations.

#### Acceptance Criteria

1. THE PII_Protection SHALL encrypt NIK at rest using AES-256-GCM
2. THE PII_Protection SHALL store NIK HMAC for equality lookup (nik_hmac column)
3. THE PII_Protection SHALL mask NIK in all logs and error messages (format: `3201••••••••1234`)
4. THE PII_Protection SHALL audit all NIK access with accessor identity and purpose
5. THE PII_Protection SHALL support key rotation without service downtime (key versioning)
6. THE PII_Protection SHALL restrict NIK decryption to authorized services only
7. IF NIK decryption key is lost, THE System SHALL have documented recovery procedure from key backup

#### Testing Considerations
- Unit test: NIK masked in logs
- Unit test: NIK HMAC lookup returns correct record
- Integration test: Key rotation maintains data accessibility
- Audit test: All NIK access logged

---

### Requirement 39: Idempotency Keys

**User Story:** As an API consumer, I want to safely retry failed requests without causing duplicate operations.

#### Acceptance Criteria

1. THE Idempotency_System SHALL accept client-generated idempotency keys for mutating operations
2. THE Idempotency_System SHALL return cached response for duplicate idempotency key within TTL (default: 24 hours)
3. THE Idempotency_System SHALL store idempotency key, request hash, and response for deduplication
4. THE Idempotency_System SHALL reject requests with same idempotency key but different request body with code `IDEMPOTENCY_MISMATCH`
5. THE Idempotency_System SHALL scope idempotency keys using composite key: `(tenantId, actorType, actorId, operation, idempotencyKey)` where actorType ∈ {USER, SERVICE_PRINCIPAL, DEVICE, WEBHOOK_PROVIDER, SYSTEM}
6. THE Idempotency_System SHALL support all actor types:
   - USER: regular authenticated user (actorId = userId)
   - SERVICE_PRINCIPAL: machine identity (actorId = servicePrincipalId)
   - DEVICE: IoT device (actorId = deviceId)
   - WEBHOOK_PROVIDER: inbound webhook source (actorId = webhookProviderId)
   - SYSTEM: internal system operations (actorId = "system" or job identifier)
7. THE Idempotency_System SHALL clean up expired idempotency records periodically
8. THE Idempotency_System SHALL document which endpoints support idempotency keys and which actor types are applicable

#### Testing Considerations
- Unit test: Duplicate request returns cached response
- Unit test: Different body with same key rejected
- Unit test: Same idempotency key with different actorType → treated as different keys
- Unit test: Webhook provider can use idempotency keys
- Integration test: Retry after timeout succeeds safely
- Property test: No duplicate side effects with retries across all actor types

---

### Requirement 40: Rate Limiting

**User Story:** As a platform operator, I want rate limiting to prevent abuse and ensure fair resource usage.

#### Acceptance Criteria

1. THE Rate_Limiting_System SHALL enforce per-tenant rate limits (requests per minute)
2. THE Rate_Limiting_System SHALL enforce per-user rate limits within a tenant
3. THE Rate_Limiting_System SHALL return 429 Too Many Requests with Retry-After header when limit exceeded
4. THE Rate_Limiting_System SHALL implement graceful degradation for normal operations
5. THE Rate_Limiting_System SHALL use sliding window algorithm for fair limiting
6. THE Rate_Limiting_System SHALL support rate limit configuration per plan tier
7. THE Rate_Limiting_System SHALL provide DEDICATED emergency abuse protection for safety-critical operations that is SEPARATE from general rate limiting:
   - Safety-critical operations (emergency_alert:create, alarm:trigger, panic_button:activate) are NOT blocked by subscription quotas or general rate limits
   - BUT safety-critical operations HAVE their own abuse protection:
     a. Deduplication/coalescing: same panic from same user/device within 30 seconds → coalesce into existing incident, NOT reject
     b. Anomaly detection: alert on patterns like >5 panics/hour from same user or coordinated cross-user triggers
     c. Emergency-specific limits: separate from general tenant limits, used as abuse SIGNAL not as hard reject
8. THE Rate_Limiting_System SHALL log all rate limit events with tenant, user/device, and endpoint context
9. WHEN emergency abuse threshold is reached, THE System SHALL:
   - Continue processing potentially valid emergency requests (coalesce where appropriate)
   - Log and alert security team on anomalous patterns
   - NOT silently discard a distinct emergency solely because a numerical rate threshold is reached
   - Use rate threshold as abuse SIGNAL for alerting and investigation, NOT as sole criteria for dropping emergencies

#### Testing Considerations
- Unit test: Rate limit triggered at threshold for normal operations
- Unit test: Retry-After header value correct
- Unit test: Emergency operations not blocked by general rate limits
- Unit test: Emergency coalescing/dedup returns acknowledgment of existing incident
- Unit test: Emergency anomaly detection triggers alert, does NOT hard-reject valid emergencies
- Load test: Rate limiting prevents system overload
- Security test: Leaked panic endpoint abuse detected and alerted (not silently dropped)

---

### Requirement 41: Cross-Tenant Security Validation

**User Story:** As a security engineer, I want automated validation of multi-tenant isolation, so that I can verify the security model is correctly implemented.

#### Acceptance Criteria

1. THE Security_Validator SHALL verify RLS policies prevent cross-tenant data access
2. THE Security_Validator SHALL verify authorization pipeline rejects requests with mismatched tenantId
3. THE Security_Validator SHALL verify membership scope constraints prevent unauthorized OrgUnit access
4. THE Security_Validator SHALL provide a test suite that can be run against production-like environments
5. THE Security_Validator SHALL report any isolation violations with full context for remediation
6. THE Security_Validator SHALL verify fail-closed behavior when context is missing or invalid
7. THE Security_Validator SHALL be runnable as part of CI/CD pipeline
8. THE Security_Validator SHALL verify quarantined anomaly users remain blocked

#### Testing Considerations
- Integration test: Cross-tenant query returns empty (not error)
- Integration test: Mismatched tenant in request → denied
- Integration test: Fail-closed on missing context
- Unit test: Quarantined users blocked

---

### Requirement 42: Performance Validation for Authorization

**User Story:** As a platform operator, I want authorization performance to meet SLA requirements, so that the system remains responsive under load.

#### Acceptance Criteria

1. THE Performance_Validator SHALL measure authorization context resolution latency
2. THE Performance_Validator SHALL verify authorization context resolution completes within 100ms at p99
3. THE Performance_Validator SHALL verify permission lookup completes within 10ms at p99
4. THE Performance_Validator SHALL measure RLS query overhead
5. THE Performance_Validator SHALL verify RLS adds no more than 20% query latency overhead
6. THE Performance_Validator SHALL support load testing with concurrent users across multiple tenants
7. THE Performance_Validator SHALL report degradation alerts when SLAs are not met

#### Testing Considerations
- Performance test: Authorization resolution < 100ms p99
- Performance test: Permission lookup < 10ms p99
- Performance test: RLS overhead < 20%
- Load test: 1000 concurrent users

---

### Requirement 43: Privileged Execution Path for Cross-Tenant Operations

**User Story:** As a platform administrator, I want explicit, audited paths for cross-tenant operations without generic RLS bypass.

#### Acceptance Criteria

1. THE Privileged_Execution_Path SHALL require explicit invocation (not implicit PLATFORM_ADMIN bypass)
2. THE Privileged_Execution_Path SHALL use a dedicated database role OR controlled service path (NOT a session flag that opens all RLS)
3. THE Privileged_Execution_Path SHALL be available ONLY for explicitly allowlisted operations (NOT arbitrary SQL execution)
4. THE Privileged_Execution_Path SHALL NOT be inheritable by normal request context
5. THE Privileged_Execution_Path SHALL be transaction-scoped and automatically cleared after the operation completes
6. THE Privileged_Execution_Path SHALL require explicit specification of affected tenant(s) in the operation
7. THE Privileged_Execution_Path SHALL log all privileged operations with operator, reason, affected tenants, and operation details
8. THE Privileged_Execution_Path SHALL require documented justification for each invocation
9. THE Privileged_Execution_Path SHALL require step-up authentication for human actors invoking privileged operations
10. THE Privileged_Execution_Path SHALL timeout after a configurable duration (default: 30 seconds)
11. THE Privileged_Execution_Path SHALL emit security alerts for any privileged execution
12. THE Privileged_Execution_Path SHALL NOT be available via public API endpoints
13. THE Privileged_Execution_Path is a NARROW capability for specific audited cross-tenant operations, NOT a superuser switch

#### Testing Considerations
- Unit test: Privileged path requires explicit invocation with allowlisted operation
- Unit test: Privileged path requires affected tenant specification
- Unit test: Privileged path logs all operations
- Unit test: Privileged path timeout enforced
- Unit test: Privileged path clears automatically after operation
- Security test: No public API access to privileged path
- Security test: Privileged path cannot execute arbitrary SQL
- Security test: Privileged path requires step-up auth for human actors

---

### Requirement 44: JWT Claims Structure Update

**User Story:** As a system architect, I want the JWT structure updated to support the new authorization model, so that tokens carry the necessary context.

#### Acceptance Criteria

1. THE JWT_Structure SHALL include the following claims:
   - `sub` — userId
   - `activeTenantId` — current active tenant
   - `activeOrgUnitId` — current active OrgUnit (nullable only for tenant-level admins)
   - `tokenVersion` — for forced invalidation
   - `iat` — issued at timestamp
   - `exp` — expiration timestamp
2. THE JWT_Structure SHALL NOT include role or permissions in claims (resolved server-side)
3. THE JWT_Structure SHALL set access token expiry to 15 minutes (configurable)
4. THE JWT_Structure SHALL be signed with a strong secret (minimum 256 bits)
5. THE JWT_Structure SHALL use HS256 algorithm for signature
6. THE JWT_Structure SHALL NOT include any PII beyond userId

#### Testing Considerations
- Unit test: JWT contains all required claims
- Unit test: JWT does not contain role/permissions
- Unit test: JWT expiry is 15 minutes
- Security test: JWT signature verification

---

### Requirement 45: Backward Compatibility During Migration

**User Story:** As a system operator, I want backward compatibility maintained during migration, so that existing functionality is not disrupted.

#### Acceptance Criteria

1. WHILE migration is in progress, THE System SHALL support both legacy and new authorization paths
2. THE System SHALL maintain User.tenantId column until legacy code removal is complete
3. THE System SHALL maintain legacy UserRole enum values until mapping migration is complete
4. THE System SHALL ensure API response formats remain unchanged during migration
5. THE System SHALL ensure existing client applications continue to function without updates
6. WHEN backward compatibility is no longer needed, THE System SHALL provide a clear deprecation notice with timeline
7. THE System SHALL track backward compatibility usage metrics to identify remaining dependencies

#### Testing Considerations
- Integration test: Legacy client requests succeed during migration
- Integration test: API response format unchanged
- Monitoring: Track legacy path usage

---

### Requirement 46: OrgUnit Path Integrity Maintenance

**User Story:** As a system architect, I want OrgUnit path and depth fields maintained correctly, so that hierarchy queries are efficient and accurate.

#### Acceptance Criteria

1. THE Path_Integrity_System SHALL recompute path and depth when parentId changes
2. THE Path_Integrity_System SHALL recompute path and depth for all descendants when a subtree moves
3. THE Path_Integrity_System SHALL validate that path is consistent with parentId chain on every update
4. THE Path_Integrity_System SHALL provide a repair utility that can fix inconsistent path/depth values
5. THE Path_Integrity_System SHALL log warnings when path inconsistencies are detected
6. THE Path_Integrity_System SHALL execute path updates in a single transaction to prevent partial updates
7. IF path becomes inconsistent, THEN THE System SHALL continue to function using parentId (path is optimization only)
8. THE Path_Integrity_System SHALL enforce root OrgUnits have depth=0 and path=[id]
9. THE Path_Integrity_System SHALL enforce depth = path.length - 1 for all OrgUnits

#### Testing Considerations
- Property test: For all OrgUnits, depth = path.length - 1
- Property test: Root OrgUnits have depth=0 and path=[id]
- Unit test: Subtree move updates all descendants
- Integration test: Repair utility fixes inconsistencies

---

### Requirement 47: Authorization Error Standardization

**User Story:** As a developer, I want standardized authorization error codes, so that clients can handle authorization failures consistently.

#### Acceptance Criteria

1. THE Error_Standardization SHALL define the following error codes:
   - `AUTH_TOKEN_INVALID` — JWT is missing, malformed, or expired
   - `AUTH_TOKEN_REVOKED` — tokenVersion mismatch
   - `AUTH_TOKEN_REUSE_DETECTED` — refresh token reuse attempted
   - `AUTH_NO_MEMBERSHIP` — user has no membership in the requested tenant
   - `AUTH_MEMBERSHIP_INACTIVE` — membership status is not ACTIVE
   - `AUTH_INSUFFICIENT_PERMISSION` — user lacks required permission
   - `AUTH_OUT_OF_SCOPE` — resource is outside user's OrgUnit scope
   - `AUTH_TENANT_MISMATCH` — resource tenant does not match user's active tenant
   - `AUTH_USER_QUARANTINED` — user is in the quarantine manifest
   - `AUTH_DELEGATION_VIOLATION` — attempted privilege escalation via delegation
   - `AUTH_HOUSEHOLD_MISMATCH` — attempted access to another household
   - `TENANT_SUSPENDED` — tenant subscription is suspended
   - `ENTITLEMENT_NOT_AVAILABLE` — feature not included in subscription plan
   - `CONTEXT_SWITCH_INVALID` — invalid tenant or OrgUnit switch request
   - `CONFLICT_DETECTED` — TOCTOU race condition detected
   - `IDEMPOTENCY_MISMATCH` — idempotency key reused with different request
   - `WEBHOOK_SIGNATURE_INVALID` — webhook signature verification failed
2. THE Error_Standardization SHALL include correlationId in all error responses
3. THE Error_Standardization SHALL NOT expose internal details in error messages
4. THE Error_Standardization SHALL map all error codes to appropriate HTTP status codes

#### Testing Considerations
- Unit test: Each error code maps to correct HTTP status
- Unit test: Error response includes correlationId
- Unit test: Error response does not expose internal details

---

### Requirement 48: Migration Rollback Support

**User Story:** As a system operator, I want rollback capability at each migration phase, so that I can recover from failed migrations.

#### Acceptance Criteria

1. THE Migration_Rollback SHALL support rollback for each migration milestone independently
2. THE Migration_Rollback SHALL create automated backups before each migration step
3. THE Migration_Rollback SHALL provide a rollback procedure document for each migration
4. THE Migration_Rollback SHALL support data-only rollback (schema changes remain) where safe
5. THE Migration_Rollback SHALL support full rollback (schema + data) for destructive changes
6. THE Migration_Rollback SHALL define a rollback time window for each migration (default: 24 hours)
7. IF rollback is triggered, THEN THE System SHALL restore to pre-migration state and emit an alert

#### Testing Considerations
- Integration test: Rollback restores data to pre-migration state
- Integration test: Rollback procedure document is accurate
- Chaos test: Forced rollback during migration

---

### Requirement 49: Tenant Provisioning & Lifecycle State Machine

**User Story:** As a platform operator, I want tenant lifecycle managed separately from subscription status, so that provisioning, suspension, and termination are handled independently.

#### Acceptance Criteria

1. THE Tenant_Lifecycle_Manager SHALL maintain a state machine SEPARATE from Subscription_Status: PROVISIONING → ACTIVE → SUSPENDED → CLOSING → CLOSED → PURGED
2. WHILE in PROVISIONING state, THE Tenant SHALL have incomplete setup (seed data, billing setup pending) and limited functionality
3. WHEN a tenant transitions to ACTIVE state, THE Tenant SHALL be fully operational with all configured features available
4. WHEN a tenant transitions to SUSPENDED state (tenant-level), THE System SHALL restrict operations according to tenant suspension policy (distinct from subscription SUSPENDED)
5. WHEN a tenant transitions to CLOSING state, THE System SHALL enable data export, prevent new write operations, and start grace period countdown
6. WHEN a tenant transitions to CLOSED state, THE System SHALL retain data per policy in read-only mode for compliance purposes only
7. WHEN a tenant transitions to PURGED state, THE System SHALL perform hard delete of all tenant data (irrecoverable)
8. THE Tenant_Lifecycle_Manager SHALL require explicit API calls for state transitions with audit logging
9. THE Tenant_Lifecycle_Manager SHALL prevent state skipping (e.g., ACTIVE → PURGED is forbidden; must go through CLOSING → CLOSED)
10. IF a tenant remains in PROVISIONING for longer than the timeout (default 24 hours), THEN THE System SHALL trigger auto-cleanup with notification

#### Testing Considerations
- Property test: Tenant lifecycle state transitions follow defined DAG (no skipping)
- Unit test: PROVISIONING timeout triggers auto-cleanup
- Unit test: Tenant status change independent of subscription status change
- Integration test: Full lifecycle from PROVISIONING to PURGED
- Integration test: CLOSED tenant allows only data export

---

### Requirement 50: Invitation & User Identity Linking

**User Story:** As a tenant administrator, I want to invite users to my tenant with secure, time-limited invitations that support both new and existing accounts.

#### Acceptance Criteria

1. THE Invitation_System SHALL generate cryptographically random 256-bit invitation tokens (one-time use)
2. THE Invitation_System SHALL set invitation expiry to a configurable duration (default 7 days)
3. WHEN an invitation is revoked, THE Invitation_System SHALL invalidate the token immediately
4. WHEN an invitation is resent, THE Invitation_System SHALL generate a NEW token and invalidate the previous one
5. THE Invitation_System SHALL normalize email addresses (lowercase, trim whitespace) and validate format before creating invitation
6. WHEN an invited email matches an existing user account, THE Invitation_System SHALL identify that account as a CANDIDATE for linking (email match alone is NOT sufficient for linking)
7. WHEN accepting an invitation that targets an existing account, THE User SHALL authenticate as that existing account AND verify control of the invited email address before linking is completed
8. WHEN an invited email does not match an existing user, THE Invitation_System SHALL create a new account atomically with invitation acceptance
9. THE Invitation_System SHALL NOT merge two User identities automatically (account linking is explicit, authenticated action — not automatic email matching)
10. THE Invitation_System SHALL require email verification for the invited email address before linking to an existing account (prevent account takeover)
11. THE Invitation_System SHALL prevent duplicate pending invitations to the same email within the same tenant
12. THE Invitation_System SHALL maintain audit log of all invitation events: created, sent, accepted, expired, revoked, linking_attempted

#### Testing Considerations
- Unit test: Duplicate invitation to same email in same tenant rejected
- Unit test: Revoked invitation token immediately invalid
- Unit test: Resent invitation invalidates previous token
- Unit test: Email normalization (uppercase → lowercase)
- Unit test: Email match alone does NOT complete linking
- Integration test: New user account creation flow
- Integration test: Existing user linking flow with authentication AND email verification
- Security test: Invitation token is cryptographically random
- Security test: Cannot link invitation to account without authenticating as that account

---

### Requirement 51: Account Recovery & Credential Security

**User Story:** As a user, I want secure account recovery options, and as an admin, I want to enforce credential policies that protect against compromise.

#### Acceptance Criteria

1. THE Credential_Security_System SHALL enforce configurable password policy (default: minimum 12 characters, complexity rules per tenant)
2. THE Credential_Security_System SHALL rate-limit forgot-password requests (max 3 per hour per email)
3. THE Credential_Security_System SHALL generate recovery tokens with 1-hour expiry, one-time use, invalidated after use or expiry
4. WHEN a password is reset, THE Credential_Security_System SHALL invalidate ALL user sessions by incrementing tokenVersion
5. THE Credential_Security_System SHALL require email verification for new accounts and email address changes
6. THE Credential_Security_System SHALL implement login attempt protection with account lockout after N failures (default 5) and exponential backoff
7. THE Credential_Security_System SHALL allow administrators to force password reset for a user in response to potential compromise
8. THE Credential_Security_System SHALL prevent reuse of the last N passwords (configurable, default 5)
9. THE Credential_Security_System SHALL MANDATE session invalidation after password change (no exceptions)
10. THE Credential_Security_System SHALL verify that recovery email matches a verified email on the account before processing

#### Testing Considerations
- Unit test: Password policy enforcement
- Unit test: Rate limiting on forgot-password requests
- Unit test: Recovery token one-time use
- Unit test: Password reset invalidates all sessions (tokenVersion incremented)
- Unit test: Password history prevents reuse
- Integration test: Account lockout after failed attempts
- Security test: Recovery token not predictable

---

### Requirement 52: MFA & Step-Up Authentication

**User Story:** As a security-conscious user, I want multi-factor authentication options, and as a platform operator, I want to require MFA for high-privilege operations.

#### Acceptance Criteria

1. THE MFA_System SHALL support multiple MFA methods: TOTP (Google Authenticator compatible), WebAuthn (passkeys/hardware keys), and backup codes
2. THE MFA_System SHALL make MFA enrollment optional for RESIDENT role but REQUIRED for PLATFORM_ADMIN and TENANT_OWNER roles
3. THE MFA_System SHALL support step-up authentication to re-verify identity for sensitive operations
4. THE MFA_System SHALL require step-up authentication for: NIK decrypt/export, privileged execution path, billing changes, TENANT_OWNER transfer, tenant deletion, encryption key rotation
5. THE MFA_System SHALL limit step-up session validity to 5 minutes, scoped to the specific operation
6. THE MFA_System SHALL provide MFA recovery via backup codes (one-time use, 10 codes generated at enrollment) and admin-assisted reset with identity verification
7. THE MFA_System SHALL allow PLATFORM_ADMIN to temporarily disable MFA for account recovery with full audit logging
8. THE MFA_System SHALL support optional "remember this device" to reduce MFA prompts on trusted devices (configurable per tenant policy)

#### Testing Considerations
- Unit test: MFA required for PLATFORM_ADMIN enrollment
- Unit test: Step-up session expires after 5 minutes
- Unit test: Backup code one-time use
- Integration test: TOTP verification flow
- Integration test: WebAuthn registration and verification
- Security test: Step-up session cannot be reused across operations

---

### Requirement 53: Sensitive Operation Re-authentication

**User Story:** As a security engineer, I want destructive or high-risk operations to require fresh authentication, even for already logged-in users.

#### Acceptance Criteria

1. THE Re_Authentication_System SHALL require fresh credential proof for sensitive operations: export all resident data, privileged execution path, TENANT_OWNER transfer, credential/encryption key rotation, tenant deletion, bulk membership changes (>10 at once)
2. THE Re_Authentication_System SHALL limit re-auth validity to 5 minutes and scope it to the specific operation requested
3. THE Re_Authentication_System SHALL require password + MFA (if enrolled) for re-authentication
4. WHEN re-authentication fails, THE System SHALL log the attempt with full context and alert security team
5. THE Re_Authentication_System SHALL NOT allow cached or reused re-auth across different operations
6. WHEN a protected operation is attempted without recent re-auth, THE System SHALL return error code `AUTH_REAUTH_REQUIRED` with operation context for client handling

#### Testing Considerations
- Unit test: Sensitive operation without re-auth returns AUTH_REAUTH_REQUIRED
- Unit test: Re-auth validity expires after 5 minutes
- Unit test: Re-auth for operation A cannot be used for operation B
- Integration test: Full re-auth flow with MFA
- Security test: Failed re-auth attempts logged and alerted

---

### Requirement 54: Ownership Transfer & Last-Admin Protection

**User Story:** As a TENANT_OWNER, I want to transfer ownership safely, and as a platform operator, I want to prevent tenants from accidentally losing all administrators.

#### Acceptance Criteria

1. THE Ownership_Transfer_System SHALL require current TENANT_OWNER approval AND new owner acceptance for ownership transfer
2. THE Ownership_Transfer_System SHALL require re-authentication from both parties during transfer
3. THE Last_Admin_Protection SHALL ensure that every administrative scope that requires administration retains at least one Effective_Administrator according to the explicit administration policy
4. THE Last_Admin_Protection SHALL enforce tenant-level requirement: >= 1 TENANT_OWNER (mandatory, cannot demote/revoke last one)
5. THE Last_Admin_Protection SHALL enforce OrgUnit-level administration based on type and policy:
   - Administrator requirement depends on OrgUnit type and tenant configuration
   - RT may be administered by RT_ADMIN OR an authorized ancestor administrator (ORG_ADMIN at parent OrgUnit with scope including the RT)
   - Do NOT force every OrgUnit subtree to have a direct ORG_ADMIN
6. THE Last_Admin_Protection SHALL allow PLATFORM_ADMIN override for recovery scenarios with full audit logging and approval workflow
7. THE Ownership_Transfer_System SHALL log complete before/after state for all ownership transfers
8. THE Ownership_Transfer_System SHALL allow pending transfer to be cancelled by current owner before new owner acceptance

#### Testing Considerations
- Unit test: Cannot demote last TENANT_OWNER
- Unit test: RT can be administered via ancestor ORG_ADMIN (no direct RT_ADMIN required)
- Unit test: Pending transfer can be cancelled
- Integration test: Full ownership transfer flow with re-auth
- Integration test: PLATFORM_ADMIN recovery override with audit
- Security test: Transfer requires both parties to authenticate

---

### Requirement 55: Secure File/Object Storage Tenant Isolation

**User Story:** As a security architect, I want file storage to enforce tenant isolation independently of database RLS.

#### Acceptance Criteria

1. THE File_Storage_System SHALL enforce storage path structure: `/{tenantId}/{category}/{uuid}.{ext}` with tenantId MANDATORY in path
2. THE File_Storage_System SHALL define allowed categories: documents, receipts, photos, reports, attachments
3. THE File_Storage_System SHALL verify tenantId match AND user permission before generating signed URLs for access
4. THE File_Storage_System SHALL generate signed URLs with short TTL (default 15 minutes) and support single-use option for sensitive files
5. THE File_Storage_System SHALL validate uploads: file type whitelist, max size per category (configurable), malware scan where available
6. THE File_Storage_System SHALL make all files private by default with no public URLs without explicit authorization
7. THE File_Storage_System SHALL audit all file downloads with userId, tenantId, fileId, and timestamp
8. THE File_Storage_System SHALL implement orphan cleanup: files not referenced in DB after N days → soft delete → hard delete after grace period
9. THE File_Storage_System SHALL FORBID cross-tenant file access with NO privileged bypass mechanism for file storage
10. THE File_Storage_System SHALL encrypt all files at rest using AES-256 with tenant-aware key management

#### Testing Considerations
- Unit test: Storage path without tenantId rejected
- Unit test: Signed URL expires after TTL
- Unit test: Cross-tenant file access forbidden
- Unit test: File type validation rejects unauthorized types
- Integration test: Full upload and download flow with audit
- Security test: No path traversal to access other tenant files

---

### Requirement 56: Notification Architecture

**User Story:** As a platform architect, I want a unified notification abstraction supporting multiple channels (Telegram, WhatsApp, email, SMS, push).

#### Acceptance Criteria

1. THE Notification_System SHALL define NotificationProvider interface with: send(channel, recipient, template, context) method
2. THE Notification_System SHALL implement providers: TelegramProvider, WhatsAppProvider, EmailProvider, SMSProvider, PushProvider
3. THE Notification_System SHALL support versioned templates with tenant context and variable substitution
4. THE Notification_System SHALL track delivery status lifecycle: QUEUED → DISPATCHED → DELIVERED → READ (if channel supports) → FAILED
5. THE Notification_System SHALL implement configurable retry policy per channel with exponential backoff and max attempts
6. THE Notification_System SHALL deduplicate: same notification to same recipient within dedup window → skip (not reject)
7. THE Notification_System SHALL support fallback channel: if primary fails after max retries, attempt secondary (e.g., WhatsApp → SMS)
8. THE Notification_System SHALL respect user preferences: opt-out per channel, quiet hours (except safety-critical)
9. THE Notification_System SHALL allow safety-critical notifications to bypass quiet hours and opt-out settings
10. THE Notification_System SHALL isolate provider credentials per tenant where the channel supports multi-tenant API keys

#### Testing Considerations
- Unit test: Notification deduplication within window
- Unit test: Fallback channel activated after primary failure
- Unit test: Safety-critical bypasses quiet hours
- Unit test: User opt-out respected for non-critical notifications
- Integration test: Full send flow through each provider
- Integration test: Delivery status tracking

---

### Requirement 57: Emergency Acknowledgement & Escalation

**User Story:** As a safety system, I want emergency alerts to track acknowledgement and escalate automatically if no responder confirms receipt.

#### Acceptance Criteria

1. THE Emergency_System SHALL track emergency lifecycle states: TRIGGERED → DISPATCHED → DELIVERED → ACKNOWLEDGED → RESPONDING → RESOLVED
2. THE Emergency_System SHALL support terminal states:
   - CANCELLED: user cancelled before responder dispatch/acknowledgement
   - FALSE_ALARM: resolved as false alarm (tracked separately from normal RESOLVED for pattern analysis)
   - DELIVERY_FAILED: all delivery attempts exhausted, no provider confirmation received
3. WHEN a user triggers emergency (panic button), THE System SHALL record TRIGGERED state immediately
4. WHEN emergency notification is sent to responders, THE System SHALL transition to DISPATCHED state
5. WHEN at least one responder receives the notification (delivery confirmed by provider), THE System SHALL transition to DELIVERED state
6. THE Emergency_System SHALL only transition to DELIVERED when provider supplies authoritative delivery evidence; if provider does not support delivery receipt, remain in DISPATCHED state
7. WHEN a responder explicitly confirms receipt (acknowledgement button press required), THE System SHALL transition to ACKNOWLEDGED state
8. WHEN a responder indicates they are taking action, THE System SHALL transition to RESPONDING state
9. WHEN the incident is closed with resolution notes, THE System SHALL transition to RESOLVED state (or FALSE_ALARM if closed as false alarm)
10. IF no acknowledgement is received within escalation timeout (default 2 minutes), THEN THE System SHALL escalate to next tier
11. THE Emergency_System SHALL define escalation tiers: on-duty security → all security → RT_ADMIN → ORG_ADMIN → TENANT_OWNER
12. THE Emergency_System SHALL log escalation events with timestamp, tier, and recipients at each level
13. THE Emergency_System SHALL support false alarm resolution with reason=FALSE_ALARM and track patterns for abuse detection
14. ESCALATION may occur in parallel to the primary state (ESCALATED is an event/sub-state, not a replacement of main lifecycle state)
15. Different notification providers (Telegram, WhatsApp, SMS) have different delivery semantics; the System SHALL handle provider-specific delivery evidence accordingly

#### Testing Considerations
- Unit test: State transition from TRIGGERED through RESOLVED
- Unit test: Terminal state CANCELLED, FALSE_ALARM, DELIVERY_FAILED
- Unit test: Escalation triggered after timeout with no ACK
- Unit test: Each escalation tier receives notification
- Unit test: DELIVERED only when provider confirms delivery
- Integration test: Full emergency lifecycle with acknowledgement
- Integration test: False alarm handling and pattern tracking
- Integration test: Different provider delivery semantics
- Performance test: Emergency notification delivery < 5 seconds

---

### Requirement 58: IoT Provider Abstraction & Command Safety

**User Story:** As a platform architect, I want an IoT provider abstraction with safe command lifecycle tracking.

#### Acceptance Criteria

1. THE IoT_Provider_System SHALL define IoTProvider interface with methods: connect, disconnect, sendCommand, receiveEvent, healthCheck, discoverCapabilities
2. THE IoT_Provider_System SHALL implement providers: TuyaProvider, MQTTProvider, HomeAssistantProvider (future: ESP32DirectProvider)
3. THE IoT_Provider_System SHALL normalize commands to standard set: TURN_ON, TURN_OFF, SET_VALUE, GET_STATUS (provider maps to native protocol)
4. THE IoT_Provider_System SHALL track command lifecycle: DESIRED → DISPATCHED → ACK_RECEIVED → VERIFIED → FAILED/TIMEOUT
5. WHEN user requests command, THE System SHALL record DESIRED state with user intent
6. WHEN command is sent to provider, THE System SHALL transition to DISPATCHED state
7. WHEN provider confirms receipt, THE System SHALL transition to ACK_RECEIVED state
8. ACK_RECEIVED SHALL NOT imply physical command success; ACK_RECEIVED means provider/device acknowledged receipt of command only
9. WHEN physical device state is confirmed via authoritative device readback OR provider state confirmation classified as authoritative, THE System SHALL transition to VERIFIED state
10. IF no ACK is received within timeout, THE System SHALL transition to TIMEOUT state and optionally retry or alert
11. THE IoT_Provider_System SHALL deduplicate: same command within short window → return existing command status
12. THE IoT_Provider_System SHALL handle stale ACK: ACK for old/expired command OR ACK arriving after command is already in FAILED/TIMEOUT state → log warning, ignore (late ACK SHALL NOT resurrect a command already in terminal state)
13. THE IoT_Provider_System SHALL support offline device handling: queue commands, reconcile on reconnect (configurable per device type)
14. THE IoT_Provider_System SHALL reconcile actual physical state against durable desired/projected state on device reconnect (critical for safety devices: alarms, door sensors, relays, sirens)
15. THE IoT_Provider_System SHALL isolate provider credentials per tenant
16. THE IoT_Provider_System SHALL map provider-specific errors to normalized error codes

#### Testing Considerations
- Unit test: Command lifecycle state transitions
- Unit test: Command deduplication within window
- Unit test: Stale ACK handling (logged, ignored)
- Unit test: Late ACK does NOT resurrect FAILED/TIMEOUT command
- Unit test: ACK_RECEIVED does NOT imply physical success
- Unit test: Timeout transition after no ACK
- Integration test: Full command flow through provider
- Integration test: Offline queue and reconnect reconciliation
- Integration test: Safety device state reconciliation on reconnect

---

### Requirement 59: Background Job & Worker Reliability

**User Story:** As a platform architect, I want reliable background job processing with proper lifecycle management beyond simple event outbox.

#### Acceptance Criteria

1. THE Job_System SHALL track job lifecycle: PENDING → CLAIMED → RUNNING → COMPLETED/FAILED/DEAD_LETTER
2. THE Job_System SHALL implement claim/lease mechanism where worker claims job with lease expiry that can be extended via heartbeat
3. THE Job_System SHALL support configurable retry policy per job type with exponential backoff and jitter
4. THE Job_System SHALL move jobs to DEAD_LETTER queue after max retry attempts exceeded
5. THE Job_System SHALL detect poison jobs (same job failing repeatedly) and isolate them with alert
6. THE Job_System SHALL support graceful shutdown where worker completes current job before exit or releases lease
7. THE Job_System SHALL enforce concurrency limits per-worker and per-job-type
8. THE Job_System SHALL require all jobs to be idempotent (safe to retry)
9. THE Job_System SHALL recover stuck jobs: lease expired with no heartbeat → release for retry
10. THE Job_System SHALL expose observability metrics: job duration, success/failure rate, queue depth, DLQ size
11. THE Job_System SHALL support priority queues: CRITICAL > HIGH > NORMAL > LOW

#### Testing Considerations
- Unit test: Job lease mechanism and heartbeat extension
- Unit test: Retry with exponential backoff
- Unit test: Dead-letter queue after max retries
- Unit test: Stuck job recovery after lease expiry
- Integration test: Full job lifecycle from PENDING to COMPLETED
- Integration test: Graceful shutdown releases lease
- Performance test: Queue depth monitoring and alerting

---

### Requirement 60: RLS Connection Pool Safety & Coverage Enforcement

**User Story:** As a security engineer, I want to prevent tenant context leakage in pooled database connections and ensure all tenant tables have RLS policies.

#### Acceptance Criteria

1. THE RLS_Connection_Safety SHALL require tenant context to be transaction-scoped using SET LOCAL (NOT session-level SET)
2. THE RLS_Connection_Safety SHALL clear tenant context before returning connection to pool
3. THE RLS_Connection_Safety SHALL pass concurrent tenant test: interleaved requests from different tenants must not leak data
4. THE RLS_Coverage_Enforcement SHALL maintain a registry classifying every table as: TENANT_SCOPED (requires RLS), PLATFORM_SHARED (no RLS), or SYSTEM (no tenant context)
5. THE RLS_Coverage_Enforcement SHALL fail CI build if a new table is added without explicit classification
6. WHEN a new column tenant_id is added to a table, THE RLS_Coverage_Enforcement SHALL require RLS policy in the same migration
7. THE RLS_Coverage_Enforcement SHALL run periodic audit scanning for tables with tenant_id column but missing RLS policy
8. THE RLS_Coverage_Enforcement SHALL alert on any detected RLS coverage gaps

#### Testing Considerations
- Concurrency test: Interleaved tenant requests do not leak data
- Unit test: SET LOCAL used (not SET) for tenant context
- Unit test: Connection returned to pool has cleared context
- CI test: New unclassified table fails build
- Integration test: Table with tenant_id without RLS detected and flagged
- Security test: Full RLS coverage verification

---

### Requirement 61: Data Classification, Retention & Timestamp Semantics

**User Story:** As a compliance officer, I want unified data governance with clear classification, retention policies, and timestamp handling standards.

#### Acceptance Criteria

1. THE Data_Governance_System SHALL define data classifications: PUBLIC, INTERNAL, CONFIDENTIAL, SENSITIVE, SAFETY_CRITICAL
2. THE Data_Governance_System SHALL classify data types:
   - PUBLIC: announcement titles, public event names
   - INTERNAL: operational logs, system metrics
   - CONFIDENTIAL: resident names, addresses, phone numbers
   - SENSITIVE: NIK, financial data, health information
   - SAFETY_CRITICAL: panic records, emergency logs
3. THE Data_Governance_System SHALL enforce retention per classification:
   - PUBLIC: tenant lifetime
   - INTERNAL: 90 days
   - CONFIDENTIAL: 7 years (compliance requirement)
   - SENSITIVE: 7 years encrypted, purge on tenant deletion after grace period
   - SAFETY_CRITICAL: 10 years, immutable
4. THE Data_Governance_System SHALL standardize timestamps:
   - Storage: UTC always (database and API responses)
   - Presentation: convert to tenant/user timezone for display
   - Server timestamp: authoritative for audit, billing, and security events
   - Client/device timestamp: informational only, store both occurredAt (client-provided) and receivedAt (server-assigned)
5. THE Data_Governance_System SHALL reject events with future timestamp > 5 minutes (clock skew tolerance)
6. THE Data_Governance_System SHALL use server receivedAt for event ordering, occurredAt for user display
7. THE Data_Governance_System SHALL enforce timestamp immutability: audit events, panic records, and financial events cannot have timestamps modified after creation

#### Testing Considerations
- Unit test: Data classification assignment for each data type
- Unit test: Retention policy enforcement per classification
- Unit test: Future timestamp rejection (>5 min skew)
- Unit test: Timestamp immutability for audit/panic/financial
- Integration test: UTC storage and timezone conversion
- Integration test: Dual timestamp (occurredAt, receivedAt) recording

---

### Requirement 62: Security & Domain Invariant Registry

**User Story:** As a security engineer, I want all critical domain and security invariants registered centrally with automated validation, so that invariant violations are detected before production.

#### Acceptance Criteria

1. THE Invariant_Registry SHALL maintain a central registry of all critical domain and security invariants
2. EACH registered invariant SHALL specify:
   - Invariant ID (e.g., INV-001)
   - Description
   - Enforcement layer: DATABASE_CONSTRAINT, APPLICATION, or BOTH
   - Affected entities
   - Violation error code
   - Migration impact assessment
   - Automated test reference
3. THE Invariant_Registry SHALL include at minimum the following invariants:

   ### Tenant Isolation Invariants
   - INV-TENANT-001: Tenant-owned records cannot reference another tenant (no cross-tenant FK for tenant-scoped entities)

   ### OrgUnit Hierarchy Invariants
   - INV-ORG-001: OrgUnit parent must belong to same tenant as the OrgUnit
   - INV-ORG-002: OrgUnit hierarchy cannot contain cycles
   - INV-ORG-003: OrgUnit depth = path.length - 1
   - INV-ORG-004: Root OrgUnit has parentId=NULL, depth=0, path=[id]

   ### Membership Invariants
   - INV-MEM-001: Membership OrgUnit, when non-null, belongs to Membership tenant
   - INV-MEM-002: Tenant-level membership (PLATFORM_ADMIN, TENANT_OWNER) has orgUnitId=NULL
   - INV-MEM-003: Org-scoped roles requiring OrgUnit scope cannot have invalid/null orgUnitId

   ### Administration Invariants
   - INV-OWNER-001: Tenant requiring administration cannot lose its final TENANT_OWNER

   ### Identity Invariants
   - INV-IDENTITY-001: Ambiguous User identities are never automatically merged

   ### Quarantine Invariants
   - INV-QUARANTINE-001: Known quarantined legacy users (PNA-01 through PNA-05) cannot receive Membership until explicit remediation

   ### IoT Invariants
   - INV-IOT-001: IoT device owner and IoT device must belong to same tenant

   ### Household/Resident Invariants
   - INV-HOUSEHOLD-001: Household.tenantId == Resident.tenantId for all residents in household

   ### Authorization Invariants
   - INV-AUTH-001: JWT role/permission claims are never authorization authority (resolved from Membership and Permission Registry server-side)
   - INV-AUTH-002: Authorization fails closed when authoritative context cannot be resolved

4. THE Invariant_Registry SHALL require automated validation for each invariant (CI SHALL fail when a security-critical registered invariant has no automated validation after its enforcement milestone becomes active)
5. THE Invariant_Registry SHALL be updated when new invariants are identified during development
6. THE Invariant_Registry SHALL support invariant categorization: SECURITY_CRITICAL, DATA_INTEGRITY, BUSINESS_RULE
7. WHEN a migration may affect an invariant, THE Migration_System SHALL flag the affected invariants for review
8. THIS is a registry/contract; do NOT implement all invariants during this documentation pass

#### Testing Considerations
- CI test: Every SECURITY_CRITICAL invariant has corresponding automated validation
- Property test: All registered invariants hold for production data snapshot
- Unit test: Invariant violation produces correct error code
- Integration test: Migration that would break invariant is flagged

---

## Reconciliation Report

### Contradictions Resolved

| # | Original Statement | Correction | Rationale |
|---|-------------------|------------|-----------|
| 1 | "permissions(R1) ⊇ permissions(R2)" for role hierarchy | REMOVED - Role → Permission is EXPLICIT with no inheritance | SECURITY and RESIDENT have different capabilities, not hierarchy levels |
| 2 | "PLATFORM_ADMIN bypass mechanism" for RLS | REMOVED - Requires explicit privileged execution path | Prevents accidental cross-tenant access; maintains audit trail |
| 3 | "orgUnitId to null for migrated memberships" | CORRECTED - Non-admin RT users get org-scoped to RT root OrgUnit | Only tenant-level admins should have null orgUnitId |
| 4 | "depth = path.length" | CORRECTED - depth = path.length - 1 (root has depth=0, path=[id]) | Aligns with ARCHITECTURE_TARGET_DESIGN §1.2 |
| 5 | "TENANT_OWNER for Ketua_RT who are primary contacts" | REMOVED - Ketua_RT → RT_ADMIN only | Contact-person status doesn't imply ownership role |
| 6 | "create Membership records for users" including anomalies | CORRECTED - Excludes 5 quarantined platform anomalies | Anomalies are explicitly quarantined in manifest, never auto-remediated |

### Corrections Applied

| ID | Correction | Requirements Affected |
|----|------------|----------------------|
| C1 | Role Hierarchy removal | Req 2 (Permission Registry) |
| C2 | Anomaly quarantine enforcement | Req 1, 3, 7, 9, 11, 41 |
| C3 | RLS bypass prohibition | Req 10, 43 (new) |
| C4 | Legacy scope correction | Req 4, 6, 11, 23 |
| C5 | OrgUnit path invariant | Req 6, 21, 23, 46 |

### New Requirements Added

| ID | Requirement | Category |
|----|-------------|----------|
| 25 | Delegated Administration | Authorization |
| 26 | Resource Scope Matrix | Authorization |
| 27 | Household/Resident Authorization | Authorization |
| 28 | TOCTOU Prevention | Security |
| 29 | Service Principal / Machine Identity | Identity |
| 30 | Webhook/M2M Authentication | Security |
| 31 | Tenant Offboarding | Lifecycle |
| 32 | Backup/DR Requirements | Operations |
| 33 | Event Outbox Pattern | Integration |
| 34 | IoT Device Abstraction | IoT |
| 35 | Observability Foundation | Operations |
| 36 | Migration Safety Net | Migration |
| 37 | Environment Separation | Security |
| 38 | PII/NIK Protection | Privacy |
| 39 | Idempotency Keys | API |
| 40 | Rate Limiting | Operations |
| 43 | Privileged Execution Path | Security |
| (Safety-critical merged into Req 20) | Emergency Delivery Guarantee | Safety |

---

### Second Reconciliation Pass (User Feedback Iteration)

#### Corrections Applied to Existing Requirements

| ID | Requirement | Correction | Rationale |
|----|-------------|------------|-----------|
| C6 | Req 25 (Delegated Administration) | Replaced "FEWER or EQUAL permissions" with explicit Delegation_Matrix | Permission counting implicitly creates role hierarchy; explicit matrix is clearer and auditable |
| C7 | Req 39 (Idempotency Keys) | Changed scope from "per user" to composite `(tenantId, actorType, actorId, operation, idempotencyKey)` | Webhooks, IoT devices, and Service Principals don't have userId; need unified actor model |
| C8 | Req 40 (Rate Limiting) | Replaced "exempt safety-critical" with dedicated emergency abuse protection | Leaked panic endpoint can be spammed; need dedup, burst limits, and anomaly detection while still prioritizing delivery |

#### New Requirements Added (Second Pass)

| ID | Requirement | Category | Rationale |
|----|-------------|----------|-----------|
| 49 | Tenant Provisioning & Lifecycle State Machine | Lifecycle | Tenant status (provisioning, suspension, closure) is distinct from billing Subscription_Status |
| 50 | Invitation & User Identity Linking | Identity | Complete invitation lifecycle beyond Membership INVITED status |
| 51 | Account Recovery & Credential Security | Security | Password reset, lockout, credential rotation, compromise response |
| 52 | MFA & Step-Up Authentication | Security | Required for high-privilege roles; step-up for sensitive operations |
| 53 | Sensitive Operation Re-authentication | Security | Fresh auth for destructive operations even if logged in |
| 54 | Ownership Transfer & Last-Admin Protection | Authorization | Prevent tenant from losing all administrators |
| 55 | Secure File/Object Storage Tenant Isolation | Security | RLS doesn't protect object storage; explicit path-based isolation |
| 56 | Notification Architecture | Integration | Abstraction for Telegram/WhatsApp/push/email/SMS |
| 57 | Emergency Acknowledgement & Escalation | Safety | Panic success = delivered, but need ACK and escalation tracking |
| 58 | IoT Provider Abstraction & Command Safety | IoT | Provider abstraction + command lifecycle states |
| 59 | Background Job & Worker Reliability | Operations | Complete worker lifecycle beyond simple event outbox |
| 60 | RLS Connection Pool Safety & Coverage Enforcement | Security | Prevent tenant context leak in pooled connections |
| 61 | Data Classification, Retention & Timestamp Semantics | Governance | Unified data governance for compliance |

#### Design Decisions Added (Second Pass)

| ID | Decision | Rationale |
|----|----------|-----------|
| D7 | Invitation expiry default 7 days | Balance user convenience vs. security |
| D8 | Recovery token expiry 1 hour | Short window reduces compromise risk |
| D9 | Step-up authentication validity 5 minutes | Operation-scoped, minimizes replay window |
| D10 | Emergency escalation timeout default 2 minutes | Balance urgency vs. false alarm handling |
| D11 | Signed URL TTL default 15 minutes | Short-lived access for file downloads |

#### Locked Decisions Added (Second Pass)

| ID | Decision | Evidence |
|----|----------|----------|
| L8 | Tenant lifecycle separate from Subscription_Status | Req 49 — PROVISIONING → ACTIVE → SUSPENDED → CLOSING → CLOSED → PURGED |
| L9 | Role delegation via explicit matrix, not permission counting | Req 25 correction — prevents implicit hierarchy interpretation |

### Traceability Matrix

> **Note:** Milestone assignments (M3, M4, etc.) are placeholders. Specific milestone assignments will be determined during design and planning phases aligned with the actual FASE 1.6+ roadmap.

| Requirement ID | Architecture Decision | Test Suite |
|----------------|----------------------|------------|
| Req 1 | §2.1 Membership Model | `membership.test.ts` |
| Req 2 | §4 Role & Permission | `permission-registry.test.ts` |
| Req 10 | §1.2 OrgUnit, §3.3 RLS | `rls-isolation.test.ts` |
| Req 11 | L3, L5, L6 (Locked) | `m2-validation.mjs` |
| Req 14 | D2 (Refresh Token) | `refresh-token.test.ts` |
| Req 20 | L10, Emergency_Policy | `emergency-delivery.test.ts` |
| Req 21 | §1.2 OrgUnit, L7 | `orgunit-hierarchy.test.ts` |
| Req 23 | L12, Tenant Lifecycle | `tenant-onboarding.test.ts` |
| Req 25 | L9, Delegation_Matrix | `delegation.test.ts` |
| Req 39 | Actor Types | `idempotency.test.ts` |
| Req 40 | Emergency Abuse Protection | `rate-limiting.test.ts` |
| Req 43 | L11, Privileged Execution | `privileged-execution.test.ts` |
| Req 49 | L8, L12, Tenant Lifecycle | `tenant-lifecycle.test.ts` |
| Req 50 | D7, Invitation System | `invitation.test.ts` |
| Req 51 | D8, Credential Security | `credential-security.test.ts` |
| Req 52 | D9, MFA System | `mfa.test.ts` |
| Req 53 | D9, Re-authentication | `reauth.test.ts` |
| Req 54 | Last-Admin Protection, Effective_Administrator | `ownership-transfer.test.ts` |
| Req 55 | D11, File Storage | `file-storage.test.ts` |
| Req 56 | Notification Providers | `notification.test.ts` |
| Req 57 | D10, Emergency Lifecycle | `emergency-escalation.test.ts` |
| Req 58 | IoT Providers | `iot-provider.test.ts` |
| Req 59 | Job System | `job-worker.test.ts` |
| Req 60 | RLS Coverage | `rls-coverage.test.ts` |
| Req 61 | Data Classification | `data-governance.test.ts` |
| Req 62 | Invariant_Registry | `invariant-registry.test.ts` |

### M2 State Preservation Verification

| Item | Expected | Locked |
|------|----------|--------|
| OrgUnits | 2 (rt01 root, rt02 root) | ✅ L1 |
| Memberships | 16 (3 platform + 13 RT-scoped) | ✅ L2 |
| Quarantined anomalies | 5 (PNA-01 through PNA-05) | ✅ L3 |
| OrgUnit ID derivation | UUIDv5 with namespace `f0e1d2c3-b4a5-5968-8776-655443322110` | ✅ L4 |
| Role mapping | Super_Admin→PLATFORM_ADMIN, Ketua_RT→RT_ADMIN, etc. | ✅ L5 |
| Non-admin scope | Org-scoped to RT root OrgUnit | ✅ L6 |
| Path invariant | Root: depth=0, path=[id]; depth = path.length - 1 | ✅ L7 |

---

### Third Reconciliation Pass (Final)

#### Mandatory Corrections Applied

| ID | Requirement | Correction | Rationale |
|----|-------------|------------|-----------|
| C9 | Req 23 (Tenant Onboarding) | Separated Tenant.lifecycleStatus from Subscription.status; tenant created with lifecycleStatus=PROVISIONING, Subscription.status=TRIAL | Tenant provisioning state is independent of billing state; mixing them creates semantic confusion |
| C10 | Req 54 (Last-Admin Protection) | Replaced rigid "last ORG_ADMIN per subtree" with policy-based Effective_Administrator model | RT may only have RT_ADMIN with ancestor ORG_ADMIN; forcing ORG_ADMIN per subtree is too restrictive |
| C11 | Req 43 (Privileged Execution) | Tightened from "session flag" to narrow capability: dedicated DB role, allowlisted operations only, NOT arbitrary SQL, requires step-up auth | Session flag could become stealth RLS bypass; privileged execution must be narrow and audited |
| C12 | Req 20 (Safety-Critical) | Added explicit Emergency_Policy for SUSPENDED membership; default allows emergency with elevated audit | Safety takes priority; accidental membership suspension should not block life-safety operations |
| C13 | Req 40 (Rate Limiting) | Changed emergency burst from hard-reject to coalescing/alerting; rate threshold is abuse SIGNAL, not drop criteria | Valid 11th emergency should not be discarded; coalesce into incident, alert on abuse pattern |
| C14 | Req 57 (Emergency Lifecycle) | Added terminal states CANCELLED, FALSE_ALARM, DELIVERY_FAILED; clarified DELIVERED requires provider evidence | Missing terminal states; DELIVERED semantics vary by provider |
| C15 | Req 58 (IoT Command) | Clarified ACK_RECEIVED ≠ physical success; late ACK cannot resurrect terminal state; added reconnect reconciliation for safety devices | ACK is receipt confirmation only; safety devices need state reconciliation on reconnect |
| C16 | Req 50 (Invitation Linking) | Email match identifies candidate only; linking requires authentication as existing account + email verification | Email string match alone is insufficient for identity linking; prevents account takeover |

#### Technical Corrections Applied

| ID | Correction | Rationale |
|----|------------|-----------|
| T1 | Req 14: Changed property test from "familyId generation increases" to "familyId stable, generation increases" | familyId is stable across rotations; generation/sequence is what increments |
| T2 | Traceability Matrix: Removed incorrect D7 reference from Req 39; removed frozen milestone assignments | D7 is invitation expiry, unrelated to idempotency; milestones not yet aligned with FASE 1.6+ roadmap |
| T3 | Introduction: Softened "1.5B through 1.23" milestone reference | Specific milestone numbers not aligned with actual roadmap; defer until planning |

#### New Requirement Added

| ID | Requirement | Category | Rationale |
|----|-------------|----------|-----------|
| 62 | Security & Domain Invariant Registry | Security/Governance | Centralize all critical invariants with automated validation; detect violations before production |

#### Locked Decisions Added (Third Pass)

| ID | Decision | Evidence |
|----|----------|----------|
| L10 | Emergency access for SUSPENDED membership is allowed by default (safety priority) | Req 20 correction — C12 |
| L11 | Privileged execution is narrow capability, not superuser switch | Req 43 correction — C11 |
| L12 | Tenant.lifecycleStatus is separate from Subscription.status | Req 23/49 correction — C9 |

#### Glossary Additions (Third Pass)

- **Invariant_Registry**: Central registry of machine-verifiable domain and security invariants with automated validation
- **Effective_Administrator**: A user who can administer a scope either directly (has admin role in that scope) or via authorized ancestor scope
- **Emergency_Policy**: Explicit configuration determining emergency access rights for edge cases like SUSPENDED membership



---

## Final Consistency Audit — REQUIREMENTS_V1_FROZEN Checklist

### Core Architecture Principles Verified

| Principle | Status | Evidence |
|-----------|--------|----------|
| Tenant = SaaS/security boundary | ✅ | Req 10, 41, 55, INV-TENANT-001 |
| User = global identity | ✅ | Req 50, INV-IDENTITY-001 |
| Membership = future authorization authority | ✅ | Req 1, 3, 22, INV-MEM-* |
| JWT = identity/context only (NOT authorization) | ✅ | Req 44, INV-AUTH-001 |
| Permission + scope = authorization | ✅ | Req 2, 5, 6 |
| orgUnitId NULL valid for tenant-level membership | ✅ | Req 4, INV-MEM-002 |
| No implicit role inheritance | ✅ | Req 2, L9 |
| No generic PLATFORM_ADMIN bypass | ✅ | Req 10, 43, L11 |
| User.tenantId remains during migration | ✅ | Req 9, 12, 13 |
| RLS after authorization context is stable | ✅ | Req 10, 60 |
| 5 legacy anomaly users remain quarantined | ✅ | Req 1, 3, 7, 9, 11, L3, INV-QUARANTINE-001 |
| M2 state: 2 OrgUnits / 16 Memberships | ✅ | L1, L2 |
| No M1/M2 historical facts rewritten | ✅ | L1-L7 preserved |

### State Machine Independence Verified

| State Machine | Status | Requirements |
|---------------|--------|--------------|
| Tenant.lifecycleStatus | Independent | Req 23, 49, L8, L12 |
| Subscription.status | Independent | Req 18, 23 |
| Membership.status | Independent | Req 20, 22 |
| Emergency_Lifecycle | Defined | Req 57 |
| IoT_Command_Lifecycle | Defined | Req 58 |

### Remaining TBD Decisions

| ID | Decision | Blocker |
|----|----------|---------|
| O1 | NIK uniqueness constraint | Resident/residency model not final |
| O2 | TRIAL/PAST_DUE quota limits | Business rules not finalized |
| O3 | Authorization cache TTL | Redis infrastructure decision pending |
| O4 | User impersonation capability | High-risk, optional feature deferred |

### Remaining Contradictions

None identified. All contradictions from Reconciliation Passes 1-3 have been resolved.

### Files Changed

- `.kiro/specs/multi-tenant-saas-architecture/requirements.md` — requirements document only

### Implementation Artifacts NOT Changed

| Artifact | Status | Reason |
|----------|--------|--------|
| Application code | NOT CHANGED | Requirements/documentation only |
| Database schema | NOT CHANGED | Requirements/documentation only |
| Prisma schema | NOT CHANGED | Requirements/documentation only |
| Migrations | NOT RUN | Requirements/documentation only |
| M1/M2 frozen artifacts | NOT MODIFIED | Locked per L1-L7 |
| Git push | NOT PERFORMED | Local documentation only |

---

## REQUIREMENTS_V1_FROZEN

Total Requirements: 62

All requirements have been reconciled. No security or architecture contradictions remain.

Ready for FASE 1.6 design phase.
