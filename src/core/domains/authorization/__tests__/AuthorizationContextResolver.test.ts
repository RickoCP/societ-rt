/**
 * AuthorizationContextResolver Unit Tests
 *
 * Tests the authorization context resolution functionality including:
 * - JWT claims extraction and validation
 * - Token version exact match (Property 7)
 * - Membership resolution via MembershipResolutionService
 * - Permission resolution from PermissionRegistry
 * - Error handling for quarantined users, invalid tokens, etc.
 *
 * @see Requirements 3 (AC 1-7)
 * @see Design Authorization Context Resolution
 * @see Property 7: Token Version Exact Match
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ok, fail } from '@core/utils';
import { MembershipRole, MembershipStatus } from '@core/domains/membership/types';
import type { Membership } from '@core/domains/membership/entities';
import type {
  IMembershipResolutionService,
  MembershipResolutionResult,
} from '@core/domains/membership/services';
import { authUserQuarantined, authNoMembership } from '@core/domains/membership/errors';
import { PERMISSIONS } from '../permissions/Permission';
import { getPermissionsForRole } from '../permissions/PermissionRegistry';
import {
  AuthorizationContextResolverImpl,
  type IAuthorizationContextResolver,
} from '../services/AuthorizationContextResolver';
import type {
  AuthorizationContextInput,
  PartialJWTClaims,
} from '../types';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const createMockMembership = (overrides: Partial<Membership> = {}): Membership => ({
  id: 'membership-123',
  userId: 'user-123',
  tenantId: 'tenant-456',
  orgUnitId: 'orgunit-789',
  role: MembershipRole.RESIDENT,
  status: MembershipStatus.ACTIVE,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

const createMockResolutionResult = (
  overrides: Partial<MembershipResolutionResult> = {},
): MembershipResolutionResult => ({
  membership: createMockMembership(),
  isAuthoritative: true,
  membershipCountInTenant: 1,
  isTenantLevel: false,
  ...overrides,
});

const createValidJWTClaims = (): PartialJWTClaims => ({
  userId: 'user-123',
  activeTenantId: 'tenant-456',
  activeOrgUnitId: 'orgunit-789',
  tokenVersion: 1,
});

const createValidInput = (): AuthorizationContextInput => ({
  jwtClaims: createValidJWTClaims(),
  currentTokenVersion: 1,
});

// ---------------------------------------------------------------------------
// Mock Service Factory
// ---------------------------------------------------------------------------

const createMockMembershipResolutionService = (
  overrides: Partial<IMembershipResolutionService> = {},
): IMembershipResolutionService => ({
  resolve: vi.fn().mockResolvedValue(ok(createMockResolutionResult())),
  validateKey: vi.fn().mockReturnValue(ok(undefined)),
  isUserQuarantined: vi.fn().mockResolvedValue(false),
  hasResolvableMembership: vi.fn().mockResolvedValue(true),
  validateScopeInvariant: vi.fn().mockReturnValue(ok(undefined)),
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthorizationContextResolver', () => {
  let resolver: IAuthorizationContextResolver;
  let mockMembershipService: IMembershipResolutionService;

  beforeEach(() => {
    mockMembershipService = createMockMembershipResolutionService();
    resolver = AuthorizationContextResolverImpl({
      membershipResolutionService: mockMembershipService,
    });
  });

  // =========================================================================
  // Requirement 3.1 — Extract JWT claims
  // =========================================================================
  describe('JWT Claims Extraction (Req 3.1)', () => {
    it('should extract userId from sub claim', async () => {
      const input = createValidInput();
      const result = await resolver.resolve(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.context.userId).toBe('user-123');
      }
    });

    it('should extract activeTenantId from claims', async () => {
      const input = createValidInput();
      const result = await resolver.resolve(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.context.tenantId).toBe('tenant-456');
      }
    });

    it('should extract activeOrgUnitId from claims', async () => {
      const input = createValidInput();
      const result = await resolver.resolve(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.context.orgUnitId).toBe('orgunit-789');
      }
    });

    it('should extract tokenVersion from claims', async () => {
      const input = createValidInput();
      const result = await resolver.resolve(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.context.tokenVersion).toBe(1);
      }
    });

    it('should allow null activeOrgUnitId for tenant-level admins', async () => {
      const tenantOwnerMembership = createMockMembership({
        role: MembershipRole.TENANT_OWNER,
        orgUnitId: null,
      });
      mockMembershipService = createMockMembershipResolutionService({
        resolve: vi.fn().mockResolvedValue(
          ok(
            createMockResolutionResult({
              membership: tenantOwnerMembership,
              isTenantLevel: true,
            }),
          ),
        ),
      });
      resolver = AuthorizationContextResolverImpl({
        membershipResolutionService: mockMembershipService,
      });

      const input: AuthorizationContextInput = {
        jwtClaims: {
          ...createValidJWTClaims(),
          activeOrgUnitId: null,
        },
        currentTokenVersion: 1,
      };

      const result = await resolver.resolve(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.context.orgUnitId).toBeNull();
        expect(result.data.context.isTenantLevel).toBe(true);
      }
    });
  });

  // =========================================================================
  // Requirement 3.6 — Token version mismatch rejection
  // =========================================================================
  describe('Token Version Validation (Req 3.6, Property 7)', () => {
    it('should pass when tokenVersion exactly matches', async () => {
      const input = createValidInput();
      const result = await resolver.resolve(input);

      expect(result.success).toBe(true);
    });

    it('should reject when JWT tokenVersion < current (stale token)', async () => {
      const input: AuthorizationContextInput = {
        jwtClaims: { ...createValidJWTClaims(), tokenVersion: 0 },
        currentTokenVersion: 1,
      };

      const result = await resolver.resolve(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_TOKEN_VERSION_MISMATCH');
      }
    });

    it('should reject when JWT tokenVersion > current (invalid/tampered)', async () => {
      const input: AuthorizationContextInput = {
        jwtClaims: { ...createValidJWTClaims(), tokenVersion: 5 },
        currentTokenVersion: 1,
      };

      const result = await resolver.resolve(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_TOKEN_VERSION_MISMATCH');
      }
    });

    it('should pass when both tokenVersions are 0', async () => {
      const input: AuthorizationContextInput = {
        jwtClaims: { ...createValidJWTClaims(), tokenVersion: 0 },
        currentTokenVersion: 0,
      };

      const result = await resolver.resolve(input);

      expect(result.success).toBe(true);
    });
  });

  // =========================================================================
  // Requirement 3.2 — Resolve membership via service
  // =========================================================================
  describe('Membership Resolution (Req 3.2)', () => {
    it('should call MembershipResolutionService with correct key', async () => {
      const input = createValidInput();
      await resolver.resolve(input);

      expect(mockMembershipService.resolve).toHaveBeenCalledWith({
        userId: 'user-123',
        activeTenantId: 'tenant-456',
        activeOrgUnitId: 'orgunit-789',
      });
    });

    it('should resolve membershipId server-side (never from JWT)', async () => {
      const input = createValidInput();
      const result = await resolver.resolve(input);

      expect(result.success).toBe(true);
      if (result.success) {
        // membershipId comes from the resolved membership, not from input
        expect(result.data.context.membershipId).toBe('membership-123');
      }
    });

    it('should include the full membership entity in context', async () => {
      const input = createValidInput();
      const result = await resolver.resolve(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.context.membership).toBeDefined();
        expect(result.data.context.membership.id).toBe('membership-123');
        expect(result.data.context.membership.role).toBe(MembershipRole.RESIDENT);
      }
    });
  });

  // =========================================================================
  // Requirement 3.7 — Reject quarantined users
  // =========================================================================
  describe('Quarantine Check (Req 3.7)', () => {
    it('should reject quarantined users with AUTH_USER_QUARANTINED', async () => {
      mockMembershipService = createMockMembershipResolutionService({
        resolve: vi.fn().mockResolvedValue(fail(authUserQuarantined())),
      });
      resolver = AuthorizationContextResolverImpl({
        membershipResolutionService: mockMembershipService,
      });

      const input = createValidInput();
      const result = await resolver.resolve(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_USER_QUARANTINED');
      }
    });
  });

  // =========================================================================
  // Requirement 3.3 — Reject INACTIVE membership
  // =========================================================================
  describe('Membership Status Validation (Req 3.3)', () => {
    it('should allow ACTIVE membership', async () => {
      const input = createValidInput();
      const result = await resolver.resolve(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.context.membership.status).toBe(MembershipStatus.ACTIVE);
      }
    });

    it('should allow SUSPENDED membership (for emergency access check later)', async () => {
      const suspendedMembership = createMockMembership({
        status: MembershipStatus.SUSPENDED,
      });
      mockMembershipService = createMockMembershipResolutionService({
        resolve: vi.fn().mockResolvedValue(
          ok(
            createMockResolutionResult({
              membership: suspendedMembership,
              isAuthoritative: true, // SUSPENDED is authoritative
            }),
          ),
        ),
      });
      resolver = AuthorizationContextResolverImpl({
        membershipResolutionService: mockMembershipService,
      });

      const input = createValidInput();
      const result = await resolver.resolve(input);

      // SUSPENDED should be allowed through (emergency access check is later)
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.context.membership.status).toBe(MembershipStatus.SUSPENDED);
      }
    });

    it('should reject REVOKED membership with AUTH_MEMBERSHIP_INACTIVE', async () => {
      const revokedMembership = createMockMembership({
        status: MembershipStatus.REVOKED,
      });
      mockMembershipService = createMockMembershipResolutionService({
        resolve: vi.fn().mockResolvedValue(
          ok(
            createMockResolutionResult({
              membership: revokedMembership,
              isAuthoritative: false,
            }),
          ),
        ),
      });
      resolver = AuthorizationContextResolverImpl({
        membershipResolutionService: mockMembershipService,
      });

      const input = createValidInput();
      const result = await resolver.resolve(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_MEMBERSHIP_INACTIVE');
      }
    });

    it('should reject INVITED membership with AUTH_MEMBERSHIP_INACTIVE', async () => {
      const invitedMembership = createMockMembership({
        status: MembershipStatus.INVITED,
      });
      mockMembershipService = createMockMembershipResolutionService({
        resolve: vi.fn().mockResolvedValue(
          ok(
            createMockResolutionResult({
              membership: invitedMembership,
              isAuthoritative: false,
            }),
          ),
        ),
      });
      resolver = AuthorizationContextResolverImpl({
        membershipResolutionService: mockMembershipService,
      });

      const input = createValidInput();
      const result = await resolver.resolve(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_MEMBERSHIP_INACTIVE');
      }
    });
  });

  // =========================================================================
  // Requirement 3.4 — No membership found
  // =========================================================================
  describe('No Membership Error (Req 3.4)', () => {
    it('should return AUTH_NO_MEMBERSHIP when no membership exists', async () => {
      mockMembershipService = createMockMembershipResolutionService({
        resolve: vi.fn().mockResolvedValue(fail(authNoMembership())),
      });
      resolver = AuthorizationContextResolverImpl({
        membershipResolutionService: mockMembershipService,
      });

      const input = createValidInput();
      const result = await resolver.resolve(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_NO_MEMBERSHIP');
      }
    });
  });

  // =========================================================================
  // Requirement 3.5 — Authorization context includes permissions
  // =========================================================================
  describe('Permission Resolution (Req 3.5)', () => {
    it('should resolve permissions from PermissionRegistry based on role', async () => {
      const input = createValidInput();
      const result = await resolver.resolve(input);

      expect(result.success).toBe(true);
      if (result.success) {
        const expectedPermissions = getPermissionsForRole(MembershipRole.RESIDENT);
        expect(result.data.context.permissions).toEqual(expectedPermissions);
      }
    });

    it('should include role in authorization context', async () => {
      const input = createValidInput();
      const result = await resolver.resolve(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.context.role).toBe(MembershipRole.RESIDENT);
      }
    });

    it('should resolve correct permissions for TENANT_OWNER', async () => {
      const tenantOwnerMembership = createMockMembership({
        role: MembershipRole.TENANT_OWNER,
        orgUnitId: null,
      });
      mockMembershipService = createMockMembershipResolutionService({
        resolve: vi.fn().mockResolvedValue(
          ok(
            createMockResolutionResult({
              membership: tenantOwnerMembership,
              isTenantLevel: true,
            }),
          ),
        ),
      });
      resolver = AuthorizationContextResolverImpl({
        membershipResolutionService: mockMembershipService,
      });

      const input: AuthorizationContextInput = {
        jwtClaims: { ...createValidJWTClaims(), activeOrgUnitId: null },
        currentTokenVersion: 1,
      };
      const result = await resolver.resolve(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.context.role).toBe(MembershipRole.TENANT_OWNER);
        expect(result.data.context.permissions.has(PERMISSIONS.TENANT_MANAGE.code)).toBe(true);
        expect(result.data.context.permissions.has(PERMISSIONS.MEMBERSHIP_DELEGATE.code)).toBe(
          true,
        );
      }
    });

    it('should resolve correct permissions for SECURITY', async () => {
      const securityMembership = createMockMembership({
        role: MembershipRole.SECURITY,
      });
      mockMembershipService = createMockMembershipResolutionService({
        resolve: vi.fn().mockResolvedValue(
          ok(
            createMockResolutionResult({
              membership: securityMembership,
            }),
          ),
        ),
      });
      resolver = AuthorizationContextResolverImpl({
        membershipResolutionService: mockMembershipService,
      });

      const input = createValidInput();
      const result = await resolver.resolve(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.context.role).toBe(MembershipRole.SECURITY);
        expect(result.data.context.permissions.has(PERMISSIONS.PATROL_MANAGE.code)).toBe(true);
        expect(result.data.context.permissions.has(PERMISSIONS.EMERGENCY_CREATE.code)).toBe(true);
        // SECURITY should NOT have VOTE_CAST
        expect(result.data.context.permissions.has(PERMISSIONS.VOTE_CAST.code)).toBe(false);
      }
    });
  });

  // =========================================================================
  // Claims Validation
  // =========================================================================
  describe('validateClaims', () => {
    it('should accept valid claims', () => {
      const claims = {
        sub: 'user-123',
        activeTenantId: 'tenant-456',
        activeOrgUnitId: 'orgunit-789',
        tokenVersion: 1,
      };

      const result = resolver.validateClaims(claims);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.userId).toBe('user-123');
        expect(result.data.activeTenantId).toBe('tenant-456');
        expect(result.data.activeOrgUnitId).toBe('orgunit-789');
        expect(result.data.tokenVersion).toBe(1);
      }
    });

    it('should accept claims with null activeOrgUnitId', () => {
      const claims = {
        sub: 'user-123',
        activeTenantId: 'tenant-456',
        activeOrgUnitId: null,
        tokenVersion: 1,
      };

      const result = resolver.validateClaims(claims);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.activeOrgUnitId).toBeNull();
      }
    });

    it('should reject null claims', () => {
      const result = resolver.validateClaims(null);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_TOKEN_INVALID');
      }
    });

    it('should reject undefined claims', () => {
      const result = resolver.validateClaims(undefined);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_TOKEN_INVALID');
      }
    });

    it('should reject claims with missing sub', () => {
      const claims = {
        activeTenantId: 'tenant-456',
        activeOrgUnitId: 'orgunit-789',
        tokenVersion: 1,
      };

      const result = resolver.validateClaims(claims);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_TOKEN_INVALID');
      }
    });

    it('should reject claims with empty sub', () => {
      const claims = {
        sub: '',
        activeTenantId: 'tenant-456',
        activeOrgUnitId: 'orgunit-789',
        tokenVersion: 1,
      };

      const result = resolver.validateClaims(claims);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_TOKEN_INVALID');
      }
    });

    it('should reject claims with missing activeTenantId', () => {
      const claims = {
        sub: 'user-123',
        activeOrgUnitId: 'orgunit-789',
        tokenVersion: 1,
      };

      const result = resolver.validateClaims(claims);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_TOKEN_INVALID');
      }
    });

    it('should reject claims with invalid tokenVersion (string)', () => {
      const claims = {
        sub: 'user-123',
        activeTenantId: 'tenant-456',
        activeOrgUnitId: 'orgunit-789',
        tokenVersion: '1', // Should be number
      };

      const result = resolver.validateClaims(claims);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_TOKEN_INVALID');
      }
    });

    it('should reject claims with invalid tokenVersion (float)', () => {
      const claims = {
        sub: 'user-123',
        activeTenantId: 'tenant-456',
        activeOrgUnitId: 'orgunit-789',
        tokenVersion: 1.5, // Should be integer
      };

      const result = resolver.validateClaims(claims);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_TOKEN_INVALID');
      }
    });

    it('should reject claims with empty activeOrgUnitId (non-null empty string)', () => {
      const claims = {
        sub: 'user-123',
        activeTenantId: 'tenant-456',
        activeOrgUnitId: '', // Should be null or valid string
        tokenVersion: 1,
      };

      const result = resolver.validateClaims(claims);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_TOKEN_INVALID');
      }
    });
  });

  // =========================================================================
  // Token Version Validation
  // =========================================================================
  describe('validateTokenVersion', () => {
    it('should pass for exact match', () => {
      const result = resolver.validateTokenVersion(5, 5);

      expect(result.success).toBe(true);
    });

    it('should fail for less than', () => {
      const result = resolver.validateTokenVersion(4, 5);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_TOKEN_VERSION_MISMATCH');
      }
    });

    it('should fail for greater than', () => {
      const result = resolver.validateTokenVersion(6, 5);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_TOKEN_VERSION_MISMATCH');
      }
    });
  });

  // =========================================================================
  // Metadata
  // =========================================================================
  describe('Resolution Metadata', () => {
    it('should include resolvedAt timestamp', async () => {
      const before = new Date();
      const input = createValidInput();
      const result = await resolver.resolve(input);
      const after = new Date();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.metadata.resolvedAt).toBeInstanceOf(Date);
        expect(result.data.metadata.resolvedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
        expect(result.data.metadata.resolvedAt.getTime()).toBeLessThanOrEqual(after.getTime());
      }
    });

    it('should include membershipCountInTenant', async () => {
      const input = createValidInput();
      const result = await resolver.resolve(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.metadata.membershipCountInTenant).toBe(1);
      }
    });

    it('should indicate isMultiMembership when count > 1', async () => {
      mockMembershipService = createMockMembershipResolutionService({
        resolve: vi.fn().mockResolvedValue(
          ok(
            createMockResolutionResult({
              membershipCountInTenant: 3,
            }),
          ),
        ),
      });
      resolver = AuthorizationContextResolverImpl({
        membershipResolutionService: mockMembershipService,
      });

      const input = createValidInput();
      const result = await resolver.resolve(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.metadata.isMultiMembership).toBe(true);
        expect(result.data.metadata.membershipCountInTenant).toBe(3);
      }
    });

    it('should indicate isMultiMembership = false when count = 1', async () => {
      const input = createValidInput();
      const result = await resolver.resolve(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.metadata.isMultiMembership).toBe(false);
      }
    });
  });

  // =========================================================================
  // Error Handling — Fail Closed (INV-AUTH-002)
  // =========================================================================
  describe('Fail Closed Behavior (INV-AUTH-002)', () => {
    it('should fail closed on unexpected resolution error', async () => {
      mockMembershipService = createMockMembershipResolutionService({
        resolve: vi.fn().mockRejectedValue(new Error('Database connection failed')),
      });
      resolver = AuthorizationContextResolverImpl({
        membershipResolutionService: mockMembershipService,
      });

      const input = createValidInput();
      const result = await resolver.resolve(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_CONTEXT_RESOLUTION_FAILED');
      }
    });
  });
});
