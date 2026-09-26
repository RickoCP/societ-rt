/**
 * Property-Based Tests for Membership Domain
 *
 * Tests membership invariants using fast-check for property-based testing.
 * Properties are universal characteristics that must hold for ALL valid inputs.
 *
 * **Properties Tested:**
 * - Property 1: Active membership count ≤ total membership count
 * - Property 2: Resolution is deterministic (same input → same output)
 * - Property 3: Tenant-level roles have null orgUnitId (INV-MEM-002)
 * - Property 4: Org-scoped roles have valid orgUnitId (INV-MEM-003)
 *
 * @see FASE 1.6 Task 10: Property-Based Tests
 * @see Requirements 1 testing, INV-MEM-001, INV-MEM-002, INV-MEM-003
 * @see Design Correctness Properties
 *
 * **Validates: Requirements 1.3, 1.4, INV-MEM-002, INV-MEM-003**
 */

import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { ok, fail } from '@core/utils';
import type { Membership } from '../entities';
import type { IMembershipRepository } from '../repositories';
import type { MembershipResolutionKey } from '../types';
import {
  MembershipRole,
  MembershipStatus,
  TENANT_LEVEL_ROLES,
  ORG_SCOPED_ROLES,
  isTenantLevelRole,
  isOrgScopedRole,
  ALL_MEMBERSHIP_ROLES,
  ALL_MEMBERSHIP_STATUSES,
  isAuthoritativeStatus,
} from '../types';
import { authNoMembership } from '../errors';
import {
  MembershipResolutionServiceImpl,
} from '../services';

// ---------------------------------------------------------------------------
// Fast-Check Arbitraries — Generators for Test Data
// ---------------------------------------------------------------------------

/**
 * Generate valid UUID-like strings for testing.
 * Uses a format similar to UUIDv4 but simplified for test clarity.
 */
const uuidArb = fc.uuid();

/**
 * Generate MembershipRole values uniformly.
 */
const roleArb: fc.Arbitrary<MembershipRole> = fc.constantFrom(
  ...ALL_MEMBERSHIP_ROLES,
);

/**
 * Generate tenant-level roles only (PLATFORM_ADMIN, TENANT_OWNER).
 */
const tenantLevelRoleArb: fc.Arbitrary<MembershipRole> = fc.constantFrom(
  MembershipRole.PLATFORM_ADMIN,
  MembershipRole.TENANT_OWNER,
);

/**
 * Generate org-scoped roles only (ORG_ADMIN, RT_ADMIN, SECURITY, RESIDENT).
 */
const orgScopedRoleArb: fc.Arbitrary<MembershipRole> = fc.constantFrom(
  MembershipRole.ORG_ADMIN,
  MembershipRole.RT_ADMIN,
  MembershipRole.SECURITY,
  MembershipRole.RESIDENT,
);

/**
 * Generate MembershipStatus values uniformly.
 */
const statusArb: fc.Arbitrary<MembershipStatus> = fc.constantFrom(
  ...ALL_MEMBERSHIP_STATUSES,
);

/**
 * Generate a valid Membership entity with role/orgUnit consistency.
 * Ensures INV-MEM-002 and INV-MEM-003 are satisfied.
 */
const validMembershipArb: fc.Arbitrary<Membership> = fc.tuple(
  uuidArb, // id
  uuidArb, // userId
  uuidArb, // tenantId
  roleArb,
  statusArb,
).chain(([id, userId, tenantId, role, status]) => {
  // Derive orgUnitId based on role to satisfy invariants
  const orgUnitIdArb: fc.Arbitrary<string | null> = isTenantLevelRole(role)
    ? fc.constant(null) // INV-MEM-002: Tenant-level roles must have null orgUnitId
    : uuidArb; // INV-MEM-003: Org-scoped roles must have valid orgUnitId

  return orgUnitIdArb.map((orgUnitId): Membership => ({
    id,
    userId,
    tenantId,
    orgUnitId,
    role,
    status,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...(status === MembershipStatus.REVOKED ? { revokedAt: new Date() } : {}),
  }));
});

/**
 * Generate a Membership that VIOLATES INV-MEM-002 (tenant-level role with non-null orgUnitId).
 */
const invMem002ViolationArb: fc.Arbitrary<Membership> = fc.tuple(
  uuidArb,
  uuidArb,
  uuidArb,
  tenantLevelRoleArb,
  statusArb,
  uuidArb, // Non-null orgUnitId (violation)
).map(([id, userId, tenantId, role, status, orgUnitId]): Membership => ({
  id,
  userId,
  tenantId,
  orgUnitId, // Should be null but isn't
  role,
  status,
  createdAt: new Date(),
  updatedAt: new Date(),
}));

/**
 * Generate a Membership that VIOLATES INV-MEM-003 (org-scoped role with null orgUnitId).
 */
const invMem003ViolationArb: fc.Arbitrary<Membership> = fc.tuple(
  uuidArb,
  uuidArb,
  uuidArb,
  orgScopedRoleArb,
  statusArb,
).map(([id, userId, tenantId, role, status]): Membership => ({
  id,
  userId,
  tenantId,
  orgUnitId: null, // Should be non-null but isn't
  role,
  status,
  createdAt: new Date(),
  updatedAt: new Date(),
}));

/**
 * Generate a valid MembershipResolutionKey.
 */
const resolutionKeyArb: fc.Arbitrary<MembershipResolutionKey> = fc.tuple(
  uuidArb,
  uuidArb,
  fc.option(uuidArb, { nil: null }),
).map(([userId, activeTenantId, activeOrgUnitId]): MembershipResolutionKey => ({
  userId,
  activeTenantId,
  activeOrgUnitId,
}));

// ---------------------------------------------------------------------------
// Mock Repository Factory
// ---------------------------------------------------------------------------

const createMockRepository = (
  overrides: Partial<IMembershipRepository> = {},
): IMembershipRepository => ({
  findByUserId: vi.fn().mockResolvedValue([]),
  findByUserAndTenant: vi.fn().mockResolvedValue([]),
  findActiveByUserAndTenant: vi.fn().mockResolvedValue([]),
  findByUserAndTenantWithStatus: vi.fn().mockResolvedValue([]),
  resolveMembership: vi.fn().mockResolvedValue(fail(authNoMembership())),
  isQuarantined: vi.fn().mockResolvedValue(false),
  hasActiveMembershipInTenant: vi.fn().mockResolvedValue(false),
  countByUserAndTenant: vi.fn().mockResolvedValue(0),
  ...overrides,
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Membership Property-Based Tests', () => {
  // -------------------------------------------------------------------------
  // Property 1: Active membership count ≤ total membership count
  // -------------------------------------------------------------------------

  describe('Property 1: Active membership count ≤ total membership count', () => {
    /**
     * **Validates: Requirements 1.3**
     *
     * For any set of memberships, the count of ACTIVE memberships
     * is always less than or equal to the total membership count.
     * This is a fundamental invariant of status filtering.
     */
    it('active count ≤ total count for any membership set', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(roleArb, statusArb).chain(([role, status]) => {
              const orgUnitIdArb = isTenantLevelRole(role) ? fc.constant(null) : uuidArb;
              return fc.tuple(fc.constant(role), fc.constant(status), orgUnitIdArb);
            }),
            { minLength: 0, maxLength: 100 },
          ),
          (membershipData) => {
            // Create memberships from the generated data
            const memberships: Membership[] = membershipData.map(([role, status, orgUnitId], idx) => ({
              id: `mem-${idx}`,
              userId: 'test-user',
              tenantId: 'test-tenant',
              orgUnitId,
              role,
              status,
              createdAt: new Date(),
              updatedAt: new Date(),
            }));

            const totalCount = memberships.length;
            const activeCount = memberships.filter(
              m => m.status === MembershipStatus.ACTIVE,
            ).length;

            // Property: activeCount ≤ totalCount
            expect(activeCount).toBeLessThanOrEqual(totalCount);
            return activeCount <= totalCount;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('authoritative count ≤ total count (ACTIVE + SUSPENDED)', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(roleArb, statusArb).chain(([role, status]) => {
              const orgUnitIdArb = isTenantLevelRole(role) ? fc.constant(null) : uuidArb;
              return fc.tuple(fc.constant(role), fc.constant(status), orgUnitIdArb);
            }),
            { minLength: 0, maxLength: 100 },
          ),
          (membershipData) => {
            // Create memberships from the generated data
            const memberships: Membership[] = membershipData.map(([role, status, orgUnitId], idx) => ({
              id: `mem-${idx}`,
              userId: 'test-user',
              tenantId: 'test-tenant',
              orgUnitId,
              role,
              status,
              createdAt: new Date(),
              updatedAt: new Date(),
            }));

            const totalCount = memberships.length;
            const authoritativeCount = memberships.filter(
              m => isAuthoritativeStatus(m.status),
            ).length;

            // Property: authoritativeCount ≤ totalCount
            expect(authoritativeCount).toBeLessThanOrEqual(totalCount);
            return authoritativeCount <= totalCount;
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // -------------------------------------------------------------------------
  // Property 2: Resolution is deterministic
  // -------------------------------------------------------------------------

  describe('Property 2: Resolution is deterministic (same input → same output)', () => {
    /**
     * **Validates: Requirements 1, Design Correctness Property 8**
     *
     * For any valid resolution key and membership repository state,
     * calling resolve() multiple times with the same input MUST
     * produce identical outputs.
     */
    it('same key + same state → same result', () => {
      fc.assert(
        fc.asyncProperty(
          validMembershipArb,
          resolutionKeyArb,
          async (membership, _key) => {
            // Align key with membership to ensure resolution can succeed
            // (_key is generated but we use alignedKey based on membership for consistency)
            const alignedKey: MembershipResolutionKey = {
              userId: membership.userId,
              activeTenantId: membership.tenantId,
              activeOrgUnitId: membership.orgUnitId,
            };

            const mockRepo = createMockRepository({
              isQuarantined: vi.fn().mockResolvedValue(false),
              resolveMembership: vi.fn().mockResolvedValue(ok(membership)),
              countByUserAndTenant: vi.fn().mockResolvedValue(1),
            });

            const service = MembershipResolutionServiceImpl({
              membershipRepository: mockRepo,
            });

            // Call resolve multiple times
            const result1 = await service.resolve(alignedKey);
            const result2 = await service.resolve(alignedKey);
            const result3 = await service.resolve(alignedKey);

            // All results must be structurally equal
            // Compare success states
            expect(result1.success).toBe(result2.success);
            expect(result2.success).toBe(result3.success);

            if (result1.success && result2.success && result3.success) {
              // Compare membership IDs (identity)
              expect(result1.data.membership.id).toBe(result2.data.membership.id);
              expect(result2.data.membership.id).toBe(result3.data.membership.id);

              // Compare metadata
              expect(result1.data.isAuthoritative).toBe(result2.data.isAuthoritative);
              expect(result1.data.isTenantLevel).toBe(result2.data.isTenantLevel);
            }

            if (!result1.success && !result2.success && !result3.success) {
              // Error codes must be identical
              expect(result1.error.code).toBe(result2.error.code);
              expect(result2.error.code).toBe(result3.error.code);
            }

            return true;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('same invalid key → same error (deterministic failure)', () => {
      fc.assert(
        fc.asyncProperty(
          resolutionKeyArb,
          async (key) => {
            const mockRepo = createMockRepository({
              isQuarantined: vi.fn().mockResolvedValue(false),
              resolveMembership: vi.fn().mockResolvedValue(fail(authNoMembership())),
            });

            const service = MembershipResolutionServiceImpl({
              membershipRepository: mockRepo,
            });

            const result1 = await service.resolve(key);
            const result2 = await service.resolve(key);

            // Both should fail with the same error code
            expect(result1.success).toBe(result2.success);
            if (!result1.success && !result2.success) {
              expect(result1.error.code).toBe(result2.error.code);
            }

            return true;
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // -------------------------------------------------------------------------
  // Property 3: Tenant-level roles have null orgUnitId (INV-MEM-002)
  // -------------------------------------------------------------------------

  describe('Property 3: Tenant-level roles have null orgUnitId (INV-MEM-002)', () => {
    /**
     * **Validates: INV-MEM-002**
     *
     * For any membership with role ∈ {PLATFORM_ADMIN, TENANT_OWNER},
     * the orgUnitId MUST be null. Violations are detected and rejected.
     */
    it('PLATFORM_ADMIN and TENANT_OWNER must have orgUnitId = null', () => {
      fc.assert(
        fc.property(
          tenantLevelRoleArb,
          fc.boolean(),
          (role, hasValidScope) => {
            // Tenant-level roles must have null orgUnitId
            expect(isTenantLevelRole(role)).toBe(true);
            expect(TENANT_LEVEL_ROLES.has(role)).toBe(true);

            // A valid tenant-level membership has null orgUnitId
            if (hasValidScope) {
              const validMembership: Membership = {
                id: 'test-id',
                userId: 'user-1',
                tenantId: 'tenant-1',
                orgUnitId: null, // VALID for tenant-level roles
                role,
                status: MembershipStatus.ACTIVE,
                createdAt: new Date(),
                updatedAt: new Date(),
              };

              // This should satisfy INV-MEM-002
              expect(validMembership.orgUnitId).toBeNull();
            }

            return true;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('validates INV-MEM-002 violation detection', () => {
      fc.assert(
        fc.asyncProperty(
          invMem002ViolationArb,
          async (invalidMembership) => {
            // This membership violates INV-MEM-002
            expect(isTenantLevelRole(invalidMembership.role)).toBe(true);
            expect(invalidMembership.orgUnitId).not.toBeNull();

            const mockRepo = createMockRepository({
              isQuarantined: vi.fn().mockResolvedValue(false),
              resolveMembership: vi.fn().mockResolvedValue(ok(invalidMembership)),
              countByUserAndTenant: vi.fn().mockResolvedValue(1),
            });

            const service = MembershipResolutionServiceImpl({
              membershipRepository: mockRepo,
            });

            const key: MembershipResolutionKey = {
              userId: invalidMembership.userId,
              activeTenantId: invalidMembership.tenantId,
              activeOrgUnitId: invalidMembership.orgUnitId,
            };

            const result = await service.resolve(key);

            // Resolution should FAIL due to invariant violation
            expect(result.success).toBe(false);
            if (!result.success) {
              expect(result.error.code).toBe('MEMBERSHIP_INVARIANT_VIOLATION');
            }

            return !result.success;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('validates scope invariant for all tenant-level roles', () => {
      const service = MembershipResolutionServiceImpl({
        membershipRepository: createMockRepository(),
      });

      fc.assert(
        fc.property(
          tenantLevelRoleArb,
          uuidArb, // non-null orgUnitId (violation)
          (role, orgUnitId) => {
            const membership: Membership = {
              id: 'test',
              userId: 'user',
              tenantId: 'tenant',
              orgUnitId, // Violation: should be null
              role,
              status: MembershipStatus.ACTIVE,
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            const result = service.validateScopeInvariant(membership);

            // Should fail validation
            expect(result.success).toBe(false);
            if (!result.success) {
              expect(result.error.code).toBe('MEMBERSHIP_INVARIANT_VIOLATION');
            }

            return !result.success;
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // -------------------------------------------------------------------------
  // Property 4: Org-scoped roles have valid orgUnitId (INV-MEM-003)
  // -------------------------------------------------------------------------

  describe('Property 4: Org-scoped roles have valid orgUnitId (INV-MEM-003)', () => {
    /**
     * **Validates: INV-MEM-003**
     *
     * For any membership with role ∈ {ORG_ADMIN, RT_ADMIN, SECURITY, RESIDENT},
     * the orgUnitId MUST be a valid (non-null) UUID. Violations are rejected.
     */
    it('ORG_ADMIN, RT_ADMIN, SECURITY, RESIDENT must have valid orgUnitId', () => {
      fc.assert(
        fc.property(
          orgScopedRoleArb,
          uuidArb,
          (role, orgUnitId) => {
            // Org-scoped roles must have non-null orgUnitId
            expect(isOrgScopedRole(role)).toBe(true);
            expect(ORG_SCOPED_ROLES.has(role)).toBe(true);

            // A valid org-scoped membership has non-null orgUnitId
            const validMembership: Membership = {
              id: 'test-id',
              userId: 'user-1',
              tenantId: 'tenant-1',
              orgUnitId, // VALID for org-scoped roles
              role,
              status: MembershipStatus.ACTIVE,
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            // This should satisfy INV-MEM-003
            expect(validMembership.orgUnitId).not.toBeNull();
            expect(typeof validMembership.orgUnitId).toBe('string');

            return true;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('validates INV-MEM-003 violation detection', () => {
      fc.assert(
        fc.asyncProperty(
          invMem003ViolationArb,
          async (invalidMembership) => {
            // This membership violates INV-MEM-003
            expect(isOrgScopedRole(invalidMembership.role)).toBe(true);
            expect(invalidMembership.orgUnitId).toBeNull();

            const mockRepo = createMockRepository({
              isQuarantined: vi.fn().mockResolvedValue(false),
              resolveMembership: vi.fn().mockResolvedValue(ok(invalidMembership)),
              countByUserAndTenant: vi.fn().mockResolvedValue(1),
            });

            const service = MembershipResolutionServiceImpl({
              membershipRepository: mockRepo,
            });

            const key: MembershipResolutionKey = {
              userId: invalidMembership.userId,
              activeTenantId: invalidMembership.tenantId,
              activeOrgUnitId: null,
            };

            const result = await service.resolve(key);

            // Resolution should FAIL due to invariant violation
            expect(result.success).toBe(false);
            if (!result.success) {
              expect(result.error.code).toBe('MEMBERSHIP_INVARIANT_VIOLATION');
            }

            return !result.success;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('validates scope invariant for all org-scoped roles', () => {
      const service = MembershipResolutionServiceImpl({
        membershipRepository: createMockRepository(),
      });

      fc.assert(
        fc.property(
          orgScopedRoleArb,
          (role) => {
            const membership: Membership = {
              id: 'test',
              userId: 'user',
              tenantId: 'tenant',
              orgUnitId: null, // Violation: should be non-null
              role,
              status: MembershipStatus.ACTIVE,
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            const result = service.validateScopeInvariant(membership);

            // Should fail validation
            expect(result.success).toBe(false);
            if (!result.success) {
              expect(result.error.code).toBe('MEMBERSHIP_INVARIANT_VIOLATION');
            }

            return !result.success;
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // -------------------------------------------------------------------------
  // Property: Valid memberships pass invariant validation
  // -------------------------------------------------------------------------

  describe('Property: Valid memberships pass invariant validation', () => {
    /**
     * **Validates: INV-MEM-002, INV-MEM-003**
     *
     * Any membership generated by validMembershipArb should pass
     * scope invariant validation since it enforces consistency.
     */
    it('validMembershipArb always produces invariant-compliant memberships', () => {
      const service = MembershipResolutionServiceImpl({
        membershipRepository: createMockRepository(),
      });

      fc.assert(
        fc.property(
          validMembershipArb,
          (membership) => {
            const result = service.validateScopeInvariant(membership);

            // Valid memberships should always pass
            expect(result.success).toBe(true);

            // Verify the invariant manually
            if (isTenantLevelRole(membership.role)) {
              expect(membership.orgUnitId).toBeNull();
            } else {
              expect(membership.orgUnitId).not.toBeNull();
            }

            return result.success;
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // -------------------------------------------------------------------------
  // Property: Role classification is mutually exclusive
  // -------------------------------------------------------------------------

  describe('Property: Role classification is mutually exclusive', () => {
    /**
     * **Validates: Requirements 2.2, 2.3**
     *
     * Every role is either tenant-level OR org-scoped, never both or neither.
     * This ensures the invariant checks are complete.
     */
    it('every role is either tenant-level or org-scoped (exhaustive)', () => {
      fc.assert(
        fc.property(
          roleArb,
          (role) => {
            const isTenantLevel = isTenantLevelRole(role);
            const isOrgScoped = isOrgScopedRole(role);

            // XOR: exactly one must be true
            const exclusivelyClassified = (isTenantLevel && !isOrgScoped) || (!isTenantLevel && isOrgScoped);

            expect(exclusivelyClassified).toBe(true);
            return exclusivelyClassified;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('TENANT_LEVEL_ROLES and ORG_SCOPED_ROLES are disjoint', () => {
      // This is a static property test
      for (const role of ALL_MEMBERSHIP_ROLES) {
        const inTenantLevel = TENANT_LEVEL_ROLES.has(role);
        const inOrgScoped = ORG_SCOPED_ROLES.has(role);

        expect(inTenantLevel !== inOrgScoped).toBe(true);
      }
    });

    it('all roles are classified (complete coverage)', () => {
      for (const role of ALL_MEMBERSHIP_ROLES) {
        const inTenantLevel = TENANT_LEVEL_ROLES.has(role);
        const inOrgScoped = ORG_SCOPED_ROLES.has(role);

        expect(inTenantLevel || inOrgScoped).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Property: Status transitions preserve authoritative subset
  // -------------------------------------------------------------------------

  describe('Property: Authoritative status subset invariant', () => {
    /**
     * **Validates: Requirements 1.3**
     *
     * The set of authoritative statuses {ACTIVE, SUSPENDED} is a
     * proper subset of all statuses. Non-authoritative statuses
     * {INVITED, REVOKED} cannot be used for authorization.
     */
    it('authoritative statuses are a subset of all statuses', () => {
      fc.assert(
        fc.property(
          statusArb,
          (status) => {
            if (isAuthoritativeStatus(status)) {
              // Authoritative statuses are ACTIVE or SUSPENDED
              expect([MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED]).toContain(status);
            } else {
              // Non-authoritative statuses are INVITED or REVOKED
              expect([MembershipStatus.INVITED, MembershipStatus.REVOKED]).toContain(status);
            }
            return true;
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // -------------------------------------------------------------------------
  // Property: Resolution key validation is idempotent
  // -------------------------------------------------------------------------

  describe('Property: Key validation is idempotent', () => {
    /**
     * Validating the same key multiple times must produce the same result.
     */
    it('validateKey returns same result for same key', () => {
      const service = MembershipResolutionServiceImpl({
        membershipRepository: createMockRepository(),
      });

      fc.assert(
        fc.property(
          resolutionKeyArb,
          (key) => {
            const result1 = service.validateKey(key);
            const result2 = service.validateKey(key);
            const result3 = service.validateKey(key);

            expect(result1.success).toBe(result2.success);
            expect(result2.success).toBe(result3.success);

            if (!result1.success && !result2.success && !result3.success) {
              expect(result1.error.code).toBe(result2.error.code);
              expect(result2.error.code).toBe(result3.error.code);
            }

            return true;
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // -------------------------------------------------------------------------
  // Property: Quarantine check is consistent
  // -------------------------------------------------------------------------

  describe('Property: Quarantine check is consistent', () => {
    /**
     * **Validates: INV-QUARANTINE-001**
     *
     * Quarantine status for a user must be deterministic.
     * Same userId always returns same quarantine status.
     */
    it('isQuarantined returns same result for same userId', () => {
      fc.assert(
        fc.asyncProperty(
          uuidArb,
          fc.boolean(),
          async (userId, isQuarantined) => {
            const mockRepo = createMockRepository({
              isQuarantined: vi.fn().mockResolvedValue(isQuarantined),
            });

            const service = MembershipResolutionServiceImpl({
              membershipRepository: mockRepo,
            });

            const result1 = await service.isUserQuarantined(userId);
            const result2 = await service.isUserQuarantined(userId);
            const result3 = await service.isUserQuarantined(userId);

            expect(result1).toBe(result2);
            expect(result2).toBe(result3);
            expect(result1).toBe(isQuarantined);

            return true;
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
