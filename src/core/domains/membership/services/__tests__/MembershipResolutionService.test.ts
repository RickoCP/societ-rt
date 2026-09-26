/**
 * MembershipResolutionService Unit Tests
 *
 * Tests the membership resolution logic per Task 5 requirements:
 * - Single membership → direct match
 * - Multiple memberships in one tenant → activeOrgUnitId distinguishes
 * - Tenant-level membership (null orgUnitId) → role validation
 * - Quarantined user → AUTH_USER_QUARANTINED
 * - No membership → AUTH_NO_MEMBERSHIP
 * - Status preservation (ACTIVE, SUSPENDED, INVITED, REVOKED)
 * - Property: Resolution is deterministic (same input → same output)
 *
 * @see FASE 1.6 Task 5: Membership Resolution Logic
 * @see Requirements 1 (AC 2-6), 3 (AC 1-7), 4 (AC 8)
 * @see TPR-03: Resolution returns authoritative state, no emergency policy
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ok, fail } from '@core/utils';
import type { Membership } from '../../entities';
import type { IMembershipRepository } from '../../repositories';
import type { MembershipResolutionKey } from '../../types';
import { MembershipRole, MembershipStatus } from '../../types';
import { authNoMembership, authMembershipContextInvalid } from '../../errors';
import {
  MembershipResolutionServiceImpl,
  type IMembershipResolutionService,
} from '../MembershipResolutionService';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const createMembership = (
  overrides: Partial<Membership> = {},
): Membership => ({
  id: 'mem-001',
  userId: 'user-001',
  tenantId: 'tenant-001',
  orgUnitId: 'orgunit-001',
  role: MembershipRole.RESIDENT,
  status: MembershipStatus.ACTIVE,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

const createResolutionKey = (
  overrides: Partial<MembershipResolutionKey> = {},
): MembershipResolutionKey => ({
  userId: 'user-001',
  activeTenantId: 'tenant-001',
  activeOrgUnitId: 'orgunit-001',
  ...overrides,
});

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
// Test Suite
// ---------------------------------------------------------------------------

describe('MembershipResolutionService', () => {
  let service: IMembershipResolutionService;
  let mockRepository: IMembershipRepository;

  beforeEach(() => {
    mockRepository = createMockRepository();
    service = MembershipResolutionServiceImpl({
      membershipRepository: mockRepository,
    });
  });

  // -------------------------------------------------------------------------
  // Single Membership Resolution
  // -------------------------------------------------------------------------

  describe('Single membership resolution', () => {
    it('should resolve single ACTIVE membership with direct match', async () => {
      const membership = createMembership({
        status: MembershipStatus.ACTIVE,
      });
      const key = createResolutionKey();

      mockRepository.resolveMembership = vi.fn().mockResolvedValue(ok(membership));
      mockRepository.countByUserAndTenant = vi.fn().mockResolvedValue(1);

      const result = await service.resolve(key);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.membership).toEqual(membership);
        expect(result.data.isAuthoritative).toBe(true);
        expect(result.data.membershipCountInTenant).toBe(1);
        expect(result.data.isTenantLevel).toBe(false);
      }
    });

    it('should mark membership as authoritative for ACTIVE status', async () => {
      const membership = createMembership({
        status: MembershipStatus.ACTIVE,
      });
      const key = createResolutionKey();

      mockRepository.resolveMembership = vi.fn().mockResolvedValue(ok(membership));
      mockRepository.countByUserAndTenant = vi.fn().mockResolvedValue(1);

      const result = await service.resolve(key);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isAuthoritative).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Status-Aware Resolution (TPR-03)
  // -------------------------------------------------------------------------

  describe('Status-aware resolution (TPR-03)', () => {
    it('should resolve SUSPENDED membership with status preserved', async () => {
      const membership = createMembership({
        status: MembershipStatus.SUSPENDED,
      });
      const key = createResolutionKey();

      mockRepository.resolveMembership = vi.fn().mockResolvedValue(ok(membership));
      mockRepository.countByUserAndTenant = vi.fn().mockResolvedValue(1);

      const result = await service.resolve(key);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.membership.status).toBe(MembershipStatus.SUSPENDED);
        expect(result.data.isAuthoritative).toBe(true); // SUSPENDED is authoritative per design
      }
    });

    it('should resolve INVITED membership marked as non-authoritative', async () => {
      const membership = createMembership({
        status: MembershipStatus.INVITED,
      });
      const key = createResolutionKey();

      mockRepository.resolveMembership = vi.fn().mockResolvedValue(ok(membership));
      mockRepository.countByUserAndTenant = vi.fn().mockResolvedValue(1);

      const result = await service.resolve(key);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.membership.status).toBe(MembershipStatus.INVITED);
        expect(result.data.isAuthoritative).toBe(false);
      }
    });

    it('should resolve REVOKED membership marked as non-authoritative', async () => {
      const membership = createMembership({
        status: MembershipStatus.REVOKED,
        revokedAt: new Date('2024-01-15'),
      });
      const key = createResolutionKey();

      mockRepository.resolveMembership = vi.fn().mockResolvedValue(ok(membership));
      mockRepository.countByUserAndTenant = vi.fn().mockResolvedValue(1);

      const result = await service.resolve(key);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.membership.status).toBe(MembershipStatus.REVOKED);
        expect(result.data.isAuthoritative).toBe(false);
      }
    });

    it('should NOT apply emergency policy during resolution (TPR-03)', async () => {
      // Resolution only returns state; authorization layer decides eligibility
      const membership = createMembership({
        status: MembershipStatus.SUSPENDED,
      });
      const key = createResolutionKey();

      mockRepository.resolveMembership = vi.fn().mockResolvedValue(ok(membership));
      mockRepository.countByUserAndTenant = vi.fn().mockResolvedValue(1);

      const result = await service.resolve(key);

      // Service DOES NOT block SUSPENDED — it returns it
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.membership.status).toBe(MembershipStatus.SUSPENDED);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Tenant-Level Membership Resolution
  // -------------------------------------------------------------------------

  describe('Tenant-level membership resolution', () => {
    it('should resolve PLATFORM_ADMIN with null orgUnitId', async () => {
      const membership = createMembership({
        role: MembershipRole.PLATFORM_ADMIN,
        orgUnitId: null,
      });
      const key = createResolutionKey({
        activeOrgUnitId: null,
      });

      mockRepository.resolveMembership = vi.fn().mockResolvedValue(ok(membership));
      mockRepository.countByUserAndTenant = vi.fn().mockResolvedValue(1);

      const result = await service.resolve(key);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.membership.role).toBe(MembershipRole.PLATFORM_ADMIN);
        expect(result.data.isTenantLevel).toBe(true);
      }
    });

    it('should resolve TENANT_OWNER with null orgUnitId', async () => {
      const membership = createMembership({
        role: MembershipRole.TENANT_OWNER,
        orgUnitId: null,
      });
      const key = createResolutionKey({
        activeOrgUnitId: null,
      });

      mockRepository.resolveMembership = vi.fn().mockResolvedValue(ok(membership));
      mockRepository.countByUserAndTenant = vi.fn().mockResolvedValue(1);

      const result = await service.resolve(key);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.membership.role).toBe(MembershipRole.TENANT_OWNER);
        expect(result.data.isTenantLevel).toBe(true);
      }
    });

    it('should fail INV-MEM-002 when tenant-level role has non-null orgUnitId', async () => {
      // This tests invariant violation detection
      const membership = createMembership({
        role: MembershipRole.PLATFORM_ADMIN,
        orgUnitId: 'should-be-null', // Violates INV-MEM-002
      });
      const key = createResolutionKey({
        activeOrgUnitId: 'should-be-null',
      });

      mockRepository.resolveMembership = vi.fn().mockResolvedValue(ok(membership));

      const result = await service.resolve(key);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('MEMBERSHIP_INVARIANT_VIOLATION');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Org-Scoped Membership Resolution
  // -------------------------------------------------------------------------

  describe('Org-scoped membership resolution', () => {
    it('should resolve RT_ADMIN with valid orgUnitId', async () => {
      const membership = createMembership({
        role: MembershipRole.RT_ADMIN,
        orgUnitId: 'orgunit-001',
      });
      const key = createResolutionKey({
        activeOrgUnitId: 'orgunit-001',
      });

      mockRepository.resolveMembership = vi.fn().mockResolvedValue(ok(membership));
      mockRepository.countByUserAndTenant = vi.fn().mockResolvedValue(1);

      const result = await service.resolve(key);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.membership.role).toBe(MembershipRole.RT_ADMIN);
        expect(result.data.isTenantLevel).toBe(false);
      }
    });

    it('should fail INV-MEM-003 when org-scoped role has null orgUnitId', async () => {
      // This tests invariant violation detection
      const membership = createMembership({
        role: MembershipRole.RESIDENT,
        orgUnitId: null, // Violates INV-MEM-003
      });
      const key = createResolutionKey({
        activeOrgUnitId: null,
      });

      mockRepository.resolveMembership = vi.fn().mockResolvedValue(ok(membership));

      const result = await service.resolve(key);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('MEMBERSHIP_INVARIANT_VIOLATION');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Multiple Memberships Resolution
  // -------------------------------------------------------------------------

  describe('Multiple memberships in one tenant', () => {
    it('should report correct membership count', async () => {
      const membership = createMembership();
      const key = createResolutionKey();

      mockRepository.resolveMembership = vi.fn().mockResolvedValue(ok(membership));
      mockRepository.countByUserAndTenant = vi.fn().mockResolvedValue(3);

      const result = await service.resolve(key);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.membershipCountInTenant).toBe(3);
      }
    });

    it('should delegate multi-membership resolution to repository', async () => {
      // The repository handles the activeOrgUnitId distinction logic
      const key = createResolutionKey({
        activeOrgUnitId: 'specific-orgunit',
      });

      mockRepository.resolveMembership = vi.fn().mockResolvedValue(
        fail(authMembershipContextInvalid()),
      );

      const result = await service.resolve(key);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_MEMBERSHIP_CONTEXT_INVALID');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Quarantine Handling
  // -------------------------------------------------------------------------

  describe('Quarantine handling (INV-QUARANTINE-001)', () => {
    it('should reject quarantined user with AUTH_USER_QUARANTINED', async () => {
      const key = createResolutionKey();

      mockRepository.isQuarantined = vi.fn().mockResolvedValue(true);

      const result = await service.resolve(key);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_USER_QUARANTINED');
      }
    });

    it('should not call resolveMembership for quarantined users', async () => {
      const key = createResolutionKey();

      mockRepository.isQuarantined = vi.fn().mockResolvedValue(true);
      const resolveSpy = vi.spyOn(mockRepository, 'resolveMembership');

      await service.resolve(key);

      expect(resolveSpy).not.toHaveBeenCalled();
    });

    it('should check quarantine via isUserQuarantined method', async () => {
      mockRepository.isQuarantined = vi.fn().mockResolvedValue(true);

      const isQuarantined = await service.isUserQuarantined('pna-01-user');

      expect(isQuarantined).toBe(true);
      expect(mockRepository.isQuarantined).toHaveBeenCalledWith('pna-01-user');
    });
  });

  // -------------------------------------------------------------------------
  // No Membership Found
  // -------------------------------------------------------------------------

  describe('No membership found', () => {
    it('should return AUTH_NO_MEMBERSHIP when no membership exists', async () => {
      const key = createResolutionKey();

      mockRepository.resolveMembership = vi.fn().mockResolvedValue(
        fail(authNoMembership()),
      );

      const result = await service.resolve(key);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_NO_MEMBERSHIP');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Key Validation
  // -------------------------------------------------------------------------

  describe('Key validation', () => {
    it('should reject empty userId', () => {
      const key = createResolutionKey({ userId: '' });

      const result = service.validateKey(key);

      expect(result.success).toBe(false);
    });

    it('should reject empty activeTenantId', () => {
      const key = createResolutionKey({ activeTenantId: '' });

      const result = service.validateKey(key);

      expect(result.success).toBe(false);
    });

    it('should accept null activeOrgUnitId', () => {
      const key = createResolutionKey({ activeOrgUnitId: null });

      const result = service.validateKey(key);

      expect(result.success).toBe(true);
    });

    it('should reject empty string activeOrgUnitId', () => {
      const key = createResolutionKey({ activeOrgUnitId: '' });

      const result = service.validateKey(key);

      expect(result.success).toBe(false);
    });

    it('should accept valid key with all fields', () => {
      const key = createResolutionKey();

      const result = service.validateKey(key);

      expect(result.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Helper Methods
  // -------------------------------------------------------------------------

  describe('hasResolvableMembership', () => {
    it('should return false for quarantined users', async () => {
      mockRepository.isQuarantined = vi.fn().mockResolvedValue(true);

      const result = await service.hasResolvableMembership('user-001', 'tenant-001');

      expect(result).toBe(false);
    });

    it('should return true when active membership exists', async () => {
      mockRepository.isQuarantined = vi.fn().mockResolvedValue(false);
      mockRepository.hasActiveMembershipInTenant = vi.fn().mockResolvedValue(true);

      const result = await service.hasResolvableMembership('user-001', 'tenant-001');

      expect(result).toBe(true);
    });

    it('should return false when no active membership exists', async () => {
      mockRepository.isQuarantined = vi.fn().mockResolvedValue(false);
      mockRepository.hasActiveMembershipInTenant = vi.fn().mockResolvedValue(false);

      const result = await service.hasResolvableMembership('user-001', 'tenant-001');

      expect(result).toBe(false);
    });
  });

  describe('validateScopeInvariant', () => {
    it('should pass for valid RESIDENT with orgUnitId', () => {
      const membership = createMembership({
        role: MembershipRole.RESIDENT,
        orgUnitId: 'orgunit-001',
      });

      const result = service.validateScopeInvariant(membership);

      expect(result.success).toBe(true);
    });

    it('should pass for valid TENANT_OWNER with null orgUnitId', () => {
      const membership = createMembership({
        role: MembershipRole.TENANT_OWNER,
        orgUnitId: null,
      });

      const result = service.validateScopeInvariant(membership);

      expect(result.success).toBe(true);
    });

    it('should fail for RESIDENT with null orgUnitId', () => {
      const membership = createMembership({
        role: MembershipRole.RESIDENT,
        orgUnitId: null,
      });

      const result = service.validateScopeInvariant(membership);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('MEMBERSHIP_INVARIANT_VIOLATION');
      }
    });

    it('should fail for TENANT_OWNER with non-null orgUnitId', () => {
      const membership = createMembership({
        role: MembershipRole.TENANT_OWNER,
        orgUnitId: 'should-be-null',
      });

      const result = service.validateScopeInvariant(membership);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('MEMBERSHIP_INVARIANT_VIOLATION');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Determinism Property Test
  // -------------------------------------------------------------------------

  describe('Property: Resolution is deterministic', () => {
    it('should return same result for same input (deterministic)', async () => {
      const membership = createMembership();
      const key = createResolutionKey();

      mockRepository.resolveMembership = vi.fn().mockResolvedValue(ok(membership));
      mockRepository.countByUserAndTenant = vi.fn().mockResolvedValue(1);

      // Resolve multiple times
      const result1 = await service.resolve(key);
      const result2 = await service.resolve(key);
      const result3 = await service.resolve(key);

      // All results should be identical
      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);
    });

    it('should return consistent error for same invalid input', async () => {
      const key = createResolutionKey();

      mockRepository.resolveMembership = vi.fn().mockResolvedValue(
        fail(authNoMembership()),
      );

      const result1 = await service.resolve(key);
      const result2 = await service.resolve(key);

      expect(result1.success).toBe(false);
      expect(result2.success).toBe(false);
      if (!result1.success && !result2.success) {
        expect(result1.error.code).toBe(result2.error.code);
      }
    });
  });

  // -------------------------------------------------------------------------
  // All Role Types
  // -------------------------------------------------------------------------

  describe('All role types', () => {
    const testCases: Array<{
      role: MembershipRole;
      orgUnitId: string | null;
      expectTenantLevel: boolean;
    }> = [
      { role: MembershipRole.PLATFORM_ADMIN, orgUnitId: null, expectTenantLevel: true },
      { role: MembershipRole.TENANT_OWNER, orgUnitId: null, expectTenantLevel: true },
      { role: MembershipRole.ORG_ADMIN, orgUnitId: 'org-001', expectTenantLevel: false },
      { role: MembershipRole.RT_ADMIN, orgUnitId: 'rt-001', expectTenantLevel: false },
      { role: MembershipRole.SECURITY, orgUnitId: 'rt-001', expectTenantLevel: false },
      { role: MembershipRole.RESIDENT, orgUnitId: 'rt-001', expectTenantLevel: false },
    ];

    testCases.forEach(({ role, orgUnitId, expectTenantLevel }) => {
      it(`should correctly resolve ${role} role`, async () => {
        const membership = createMembership({ role, orgUnitId });
        const key = createResolutionKey({ activeOrgUnitId: orgUnitId });

        mockRepository.resolveMembership = vi.fn().mockResolvedValue(ok(membership));
        mockRepository.countByUserAndTenant = vi.fn().mockResolvedValue(1);

        const result = await service.resolve(key);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.membership.role).toBe(role);
          expect(result.data.isTenantLevel).toBe(expectTenantLevel);
        }
      });
    });
  });
});
