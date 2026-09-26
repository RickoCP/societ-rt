/**
 * Unit tests for SecurityValidationSuite.
 *
 * Tests comprehensive security validation for multi-tenant SaaS architecture:
 * - Tenant isolation validation (no cross-tenant data leakage)
 * - Authorization boundary testing (permission checks work correctly)
 * - Session security validation (token refresh, session invalidation)
 * - Cross-tenant access prevention validation
 * - OrgUnit scope authorization validation
 * - Membership resolution security
 *
 * Security Invariants Tested:
 * - INV-TENANT-001: Single Tenant Subscription
 * - INV-MEM-001: Membership OrgUnit belongs to Membership tenant
 * - INV-AUTH-001: JWT role/permission claims are never authorization authority
 * - INV-AUTH-002: Fails closed on unknown error states
 *
 * @see FASE 1.21 Task 75: Security Validation Suite
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SecurityValidationSuiteImpl,
  SecurityValidationStatus,
  SecurityValidationCategory,
  SecurityValidationSeverity,
  SecurityTestType,
  SECURITY_VALIDATION_SCENARIOS,
  SUPPORTED_SECURITY_INVARIANTS,
  type ISecurityValidationSuite,
  type SecurityValidationSuiteDependencies,
} from '../SecurityValidationSuite';
import { MembershipRole, MembershipStatus } from '@core/domains/membership/types';
import type { AuthorizationContext } from '../../types';
import type { Membership } from '@core/domains/membership/entities';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

const createMockPermissionRegistry = () => ({
  getPermissionsForRole: vi.fn((role: MembershipRole) => {
    const permissionMap: Record<MembershipRole, Set<string>> = {
      [MembershipRole.PLATFORM_ADMIN]: new Set([
        'platform:config:read',
        'platform:config:write',
        'platform:tenant:provision',
      ]),
      [MembershipRole.TENANT_OWNER]: new Set([
        'tenant:manage',
        'membership:delegate',
        'resident:read',
        'resident:write',
        'finance:read',
        'finance:write',
      ]),
      [MembershipRole.ORG_ADMIN]: new Set([
        'membership:delegate',
        'resident:read',
        'resident:write',
        'finance:read',
      ]),
      [MembershipRole.RT_ADMIN]: new Set([
        'membership:delegate',
        'resident:read',
        'resident:write',
        'iot:command',
      ]),
      [MembershipRole.SECURITY]: new Set([
        'resident:read',
        'emergency:create',
        'patrol:manage',
        'incident:report',
      ]),
      [MembershipRole.RESIDENT]: new Set([
        'emergency:create',
        'announcement:read',
        'vote:cast',
      ]),
    };
    return permissionMap[role] ?? new Set();
  }),
  hasPermission: vi.fn((role: MembershipRole, permission: string) => {
    const permissionMap: Record<MembershipRole, Set<string>> = {
      [MembershipRole.PLATFORM_ADMIN]: new Set([
        'platform:config:read',
        'platform:config:write',
        'platform:tenant:provision',
      ]),
      [MembershipRole.TENANT_OWNER]: new Set([
        'tenant:manage',
        'membership:delegate',
        'resident:read',
        'resident:write',
        'finance:read',
        'finance:write',
      ]),
      [MembershipRole.ORG_ADMIN]: new Set([
        'membership:delegate',
        'resident:read',
        'resident:write',
        'finance:read',
      ]),
      [MembershipRole.RT_ADMIN]: new Set([
        'membership:delegate',
        'resident:read',
        'resident:write',
        'iot:command',
      ]),
      [MembershipRole.SECURITY]: new Set([
        'resident:read',
        'emergency:create',
        'patrol:manage',
        'incident:report',
      ]),
      [MembershipRole.RESIDENT]: new Set([
        'emergency:create',
        'announcement:read',
        'vote:cast',
      ]),
    };
    return permissionMap[role]?.has(permission) ?? false;
  }),
});

const createMockOrgUnitHierarchyReader = () => ({
  isDescendantOrEqual: vi.fn(
    async (
      resourceOrgUnitId: string,
      membershipOrgUnitId: string,
      _tenantId: string,
    ) => {
      // Simple mock: descendant if resource starts with membership prefix
      return resourceOrgUnitId.startsWith(membershipOrgUnitId) ||
        resourceOrgUnitId === membershipOrgUnitId;
    },
  ),
  validateOrgUnitBelongsToTenant: vi.fn(
    async (_orgUnitId: string, _tenantId: string) => true,
  ),
});

const createMockQuarantineManifest = () => ({
  isQuarantined: vi.fn(async (userId: string) => {
    // Mock: quarantine specific test users
    const quarantinedUsers = new Set([
      'quarantined-user-1',
      'quarantined-user-2',
      'pna-01-user',
    ]);
    return quarantinedUsers.has(userId);
  }),
});

const createMockMembership = (
  overrides: Partial<Membership> = {},
): Membership => ({
  id: 'membership-123',
  userId: 'user-123',
  tenantId: 'tenant-123',
  orgUnitId: 'orgunit-123',
  role: MembershipRole.RT_ADMIN,
  status: MembershipStatus.ACTIVE,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const createMockAuthContext = (
  overrides: Partial<AuthorizationContext> = {},
): AuthorizationContext => ({
  userId: 'user-123',
  tenantId: 'tenant-123',
  membershipId: 'membership-123',
  orgUnitId: 'orgunit-123',
  role: MembershipRole.RT_ADMIN,
  permissions: new Set(['resident:read', 'resident:write', 'iot:command']),
  tokenVersion: 1,
  isAuthoritative: true,
  isTenantLevel: false,
  membership: createMockMembership(),
  ...overrides,
});

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('SecurityValidationSuite', () => {
  let suite: ISecurityValidationSuite;
  let mockDeps: SecurityValidationSuiteDependencies;

  beforeEach(() => {
    mockDeps = {
      permissionRegistry: createMockPermissionRegistry(),
      orgUnitHierarchyReader: createMockOrgUnitHierarchyReader(),
      quarantineManifest: createMockQuarantineManifest(),
    };
    suite = SecurityValidationSuiteImpl(mockDeps);
  });

  // -------------------------------------------------------------------------
  // Static Data Tests
  // -------------------------------------------------------------------------

  describe('getSupportedScenarios', () => {
    it('should return all predefined security validation scenarios', () => {
      const scenarios = suite.getSupportedScenarios();

      expect(scenarios).toBeDefined();
      expect(scenarios.length).toBeGreaterThan(0);
      expect(scenarios).toEqual(SECURITY_VALIDATION_SCENARIOS);
    });

    it('should include scenarios for all security categories', () => {
      const scenarios = suite.getSupportedScenarios();
      const categories = new Set(scenarios.map((s) => s.category));

      expect(categories.has(SecurityValidationCategory.TENANT_ISOLATION)).toBe(
        true,
      );
      expect(
        categories.has(SecurityValidationCategory.AUTHORIZATION_BOUNDARY),
      ).toBe(true);
      expect(categories.has(SecurityValidationCategory.SESSION_SECURITY)).toBe(
        true,
      );
      expect(categories.has(SecurityValidationCategory.ORGUNIT_SCOPE)).toBe(
        true,
      );
      expect(
        categories.has(SecurityValidationCategory.MEMBERSHIP_SECURITY),
      ).toBe(true);
    });

    it('should have invariant references for all scenarios', () => {
      const scenarios = suite.getSupportedScenarios();

      for (const scenario of scenarios) {
        expect(scenario.invariants.length).toBeGreaterThan(0);
        expect(scenario.severity).toBeDefined();
        expect(scenario.testType).toBeDefined();
      }
    });
  });

  describe('getSupportedInvariants', () => {
    it('should return all supported security invariants', () => {
      const invariants = suite.getSupportedInvariants();

      expect(invariants).toBeDefined();
      expect(invariants.length).toBeGreaterThan(0);
      expect(invariants).toEqual(SUPPORTED_SECURITY_INVARIANTS);
    });

    it('should include critical invariants', () => {
      const invariants = suite.getSupportedInvariants();

      expect(invariants).toContain('INV-TENANT-001');
      expect(invariants).toContain('INV-MEM-001');
      expect(invariants).toContain('INV-AUTH-001');
      expect(invariants).toContain('INV-AUTH-002');
      expect(invariants).toContain('INV-QUARANTINE-001');
    });
  });

  // -------------------------------------------------------------------------
  // Full Suite Validation Tests
  // -------------------------------------------------------------------------

  describe('runFullValidation', () => {
    it('should run all validations and return comprehensive summary', async () => {
      const result = await suite.runFullValidation();

      expect(result.success).toBe(true);
      if (result.success) {
        const summary = result.data;
        expect(summary.totalCount).toBeGreaterThan(0);
        expect(summary.startedAt).toBeDefined();
        expect(summary.completedAt).toBeDefined();
        expect(summary.totalDurationMs).toBeGreaterThanOrEqual(0);
        expect(summary.byCategory).toBeDefined();
        expect(summary.bySeverity).toBeDefined();
      }
    });

    it('should filter validations by category when specified', async () => {
      const result = await suite.runFullValidation({
        categories: [SecurityValidationCategory.TENANT_ISOLATION],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const summary = result.data;
        // All results should be from TENANT_ISOLATION category
        for (const r of summary.results) {
          expect(r.scenario.category).toBe(
            SecurityValidationCategory.TENANT_ISOLATION,
          );
        }
      }
    });

    it('should skip validations when invariants are excluded', async () => {
      const result = await suite.runFullValidation({
        skipInvariants: ['INV-TENANT-001'],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const summary = result.data;
        // No results should have INV-TENANT-001 as their only invariant
        for (const r of summary.results) {
          if (r.scenario.invariants.length === 1) {
            expect(r.scenario.invariants[0]).not.toBe('INV-TENANT-001');
          }
        }
      }
    });

    it('should calculate correct statistics in summary', async () => {
      const result = await suite.runFullValidation();

      expect(result.success).toBe(true);
      if (result.success) {
        const summary = result.data;
        const calculatedTotal =
          summary.passedCount +
          summary.failedCount +
          summary.skippedCount +
          summary.errorCount;
        expect(summary.totalCount).toBe(calculatedTotal);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Tenant Isolation Validation Tests
  // -------------------------------------------------------------------------

  describe('validateTenantIsolation', () => {
    it('should pass when user accesses resource in same tenant', async () => {
      const authContext = createMockAuthContext({ tenantId: 'tenant-123' });

      const result = await suite.validateTenantIsolation({
        authContext,
        targetTenantId: 'tenant-123',
        resourceType: 'resident',
        resourceId: 'resident-456',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.PASSED);
        expect(result.data.message).toContain('same tenant access allowed');
      }
    });

    it('should pass (block detection) when user attempts cross-tenant access', async () => {
      const authContext = createMockAuthContext({ tenantId: 'tenant-123' });

      const result = await suite.validateTenantIsolation({
        authContext,
        targetTenantId: 'tenant-456', // Different tenant
        resourceType: 'resident',
        resourceId: 'resident-789',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.PASSED);
        expect(result.data.message).toContain('Cross-tenant access correctly blocked');
      }
    });
  });

  describe('testCrossTenantAccessPrevention', () => {
    it('should validate cross-tenant attack would be blocked', async () => {
      const result = await suite.testCrossTenantAccessPrevention({
        sourceTenantId: 'attacker-tenant',
        targetTenantId: 'victim-tenant',
        userId: 'attacker-user',
        resourceType: 'financial_transaction',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.PASSED);
        expect(result.data.details?.wouldBeBlocked).toBe(true);
      }
    });

    it('should skip when source and target are same tenant', async () => {
      const result = await suite.testCrossTenantAccessPrevention({
        sourceTenantId: 'same-tenant',
        targetTenantId: 'same-tenant',
        userId: 'user-123',
        resourceType: 'resident',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.SKIPPED);
      }
    });
  });

  describe('validateNoCrossTenantLeakage', () => {
    it('should pass when all query results belong to current tenant', async () => {
      const authContext = createMockAuthContext({ tenantId: 'tenant-123' });
      const queryResults = [
        { tenantId: 'tenant-123' },
        { tenantId: 'tenant-123' },
        { tenantId: 'tenant-123' },
      ];

      const result = await suite.validateNoCrossTenantLeakage(
        authContext,
        queryResults,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.PASSED);
        expect(result.data.message).toContain('No cross-tenant data leakage');
      }
    });

    it('should fail when query results include other tenant data', async () => {
      const authContext = createMockAuthContext({ tenantId: 'tenant-123' });
      const queryResults = [
        { tenantId: 'tenant-123' },
        { tenantId: 'tenant-456' }, // Leaked data!
        { tenantId: 'tenant-123' },
      ];

      const result = await suite.validateNoCrossTenantLeakage(
        authContext,
        queryResults,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.FAILED);
        expect(result.data.message).toContain('Cross-tenant data leakage detected');
        expect(result.data.details?.leakedCount).toBe(1);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Authorization Boundary Validation Tests
  // -------------------------------------------------------------------------

  describe('validateAuthorizationBoundary', () => {
    it('should pass when user has required permission', async () => {
      const authContext = createMockAuthContext({
        role: MembershipRole.RT_ADMIN,
      });

      const result = await suite.validateAuthorizationBoundary({
        authContext,
        requiredPermission: 'resident:read',
        targetOrgUnitId: 'orgunit-123',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.PASSED);
        expect(result.data.details?.hasPermission).toBe(true);
      }
    });

    it('should pass (denial) when user lacks required permission', async () => {
      const authContext = createMockAuthContext({
        role: MembershipRole.RESIDENT,
      });

      const result = await suite.validateAuthorizationBoundary({
        authContext,
        requiredPermission: 'tenant:manage',
        targetOrgUnitId: 'orgunit-123',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.PASSED);
        expect(result.data.details?.hasPermission).toBe(false);
        expect(result.data.message).toContain('missing permission');
      }
    });

    it('should allow suspended membership for safety-critical operations', async () => {
      const authContext = createMockAuthContext({
        role: MembershipRole.SECURITY,
        membership: createMockMembership({ status: MembershipStatus.SUSPENDED }),
      });

      const result = await suite.validateAuthorizationBoundary({
        authContext,
        requiredPermission: 'emergency:create',
        targetOrgUnitId: 'orgunit-123',
        isSafetyCritical: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.PASSED);
        expect(result.data.details?.isSuspendedEmergencyAccess).toBe(true);
      }
    });
  });

  describe('testPermissionBoundary', () => {
    it('should pass when role has expected permission', async () => {
      const result = await suite.testPermissionBoundary({
        role: MembershipRole.TENANT_OWNER,
        permission: 'tenant:manage',
        expectedHasPermission: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.PASSED);
      }
    });

    it('should pass when role correctly lacks permission', async () => {
      const result = await suite.testPermissionBoundary({
        role: MembershipRole.RESIDENT,
        permission: 'tenant:manage',
        expectedHasPermission: false,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.PASSED);
      }
    });

    it('should fail when expectation does not match reality', async () => {
      const result = await suite.testPermissionBoundary({
        role: MembershipRole.RESIDENT,
        permission: 'tenant:manage',
        expectedHasPermission: true, // Wrong expectation
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.FAILED);
        expect(result.data.message).toContain('Permission boundary violation');
      }
    });

    it('should validate SECURITY and RESIDENT have distinct permissions (INV-AUTH-001)', async () => {
      // SECURITY has patrol:manage, RESIDENT does not
      const securityResult = await suite.testPermissionBoundary({
        role: MembershipRole.SECURITY,
        permission: 'patrol:manage',
        expectedHasPermission: true,
      });

      const residentResult = await suite.testPermissionBoundary({
        role: MembershipRole.RESIDENT,
        permission: 'patrol:manage',
        expectedHasPermission: false,
      });

      expect(securityResult.success).toBe(true);
      expect(residentResult.success).toBe(true);
      if (securityResult.success && residentResult.success) {
        expect(securityResult.data.status).toBe(SecurityValidationStatus.PASSED);
        expect(residentResult.data.status).toBe(SecurityValidationStatus.PASSED);
      }
    });
  });

  describe('validateFailClosedBehavior', () => {
    it('should pass when auth attempt fails (fail-closed)', async () => {
      const result = await suite.validateFailClosedBehavior(
        'unknown-state-test',
        async () => false, // Auth attempt returns false
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.PASSED);
        expect(result.data.details?.accessGranted).toBe(false);
      }
    });

    it('should pass when auth attempt throws error (fail-closed)', async () => {
      const result = await suite.validateFailClosedBehavior(
        'error-state-test',
        async () => {
          throw new Error('Unknown auth state');
        },
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.PASSED);
        expect(result.data.details?.errorThrown).toBe(true);
      }
    });

    it('should fail when auth unexpectedly succeeds', async () => {
      const result = await suite.validateFailClosedBehavior(
        'should-fail-test',
        async () => true, // Auth incorrectly succeeds
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.FAILED);
        expect(result.data.message).toContain('Fail-closed violation');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Session Security Validation Tests
  // -------------------------------------------------------------------------

  describe('validateSessionSecurity', () => {
    it('should pass when token versions match', async () => {
      const result = await suite.validateSessionSecurity({
        userId: 'user-123',
        jwtTokenVersion: 5,
        dbTokenVersion: 5,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.PASSED);
        expect(result.data.message).toContain('token version matches');
      }
    });

    it('should pass (detect mismatch) when token versions differ', async () => {
      const result = await suite.validateSessionSecurity({
        userId: 'user-123',
        jwtTokenVersion: 3,
        dbTokenVersion: 5, // Version bumped - tokens invalidated
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.PASSED);
        expect(result.data.details?.mismatchDetected).toBe(true);
      }
    });
  });

  describe('testTokenVersionMismatchRejection', () => {
    it('should validate rejection on version mismatch', async () => {
      const result = await suite.testTokenVersionMismatchRejection(3, 5);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.PASSED);
        expect(result.data.details?.rejected).toBe(true);
      }
    });

    it('should validate no rejection when versions match', async () => {
      const result = await suite.testTokenVersionMismatchRejection(5, 5);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.PASSED);
        expect(result.data.details?.rejected).toBeUndefined();
      }
    });
  });

  describe('testRefreshTokenReuseDetection', () => {
    it('should detect refresh token reuse attack', async () => {
      const result = await suite.testRefreshTokenReuseDetection({
        familyId: 'family-123',
        presentedGeneration: 2, // Old token
        currentValidGeneration: 5, // Current is 5
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.PASSED);
        expect(result.data.details?.reuseDetected).toBe(true);
        expect(result.data.details?.action).toBe('REVOKE_FAMILY');
      }
    });

    it('should pass valid refresh token generation', async () => {
      const result = await suite.testRefreshTokenReuseDetection({
        familyId: 'family-123',
        presentedGeneration: 5,
        currentValidGeneration: 5,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.PASSED);
        expect(result.data.details?.reuseDetected).toBeUndefined();
      }
    });
  });

  // -------------------------------------------------------------------------
  // OrgUnit Scope Validation Tests
  // -------------------------------------------------------------------------

  describe('validateOrgUnitScopeAuthorization', () => {
    it('should pass when resource is within OrgUnit scope', async () => {
      const authContext = createMockAuthContext({
        tenantId: 'tenant-123',
        orgUnitId: 'orgunit-123',
      });

      const result = await suite.validateOrgUnitScopeAuthorization(
        authContext,
        'orgunit-123-child', // Descendant
        'tenant-123',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.PASSED);
        expect(result.data.details?.isInScope).toBe(true);
      }
    });

    it('should pass (block) when tenant boundary check fails first', async () => {
      const authContext = createMockAuthContext({
        tenantId: 'tenant-123',
        orgUnitId: 'orgunit-123',
      });

      const result = await suite.validateOrgUnitScopeAuthorization(
        authContext,
        'orgunit-456',
        'tenant-456', // Different tenant!
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.PASSED);
        expect(result.data.details?.errorCode).toBe('AUTH_TENANT_MISMATCH');
      }
    });

    it('should grant full scope to tenant-level admins', async () => {
      const authContext = createMockAuthContext({
        tenantId: 'tenant-123',
        orgUnitId: null, // Tenant-level
        role: MembershipRole.TENANT_OWNER,
        isTenantLevel: true,
      });

      const result = await suite.validateOrgUnitScopeAuthorization(
        authContext,
        'any-orgunit',
        'tenant-123',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.PASSED);
        expect(result.data.details?.isTenantLevel).toBe(true);
      }
    });
  });

  describe('testTenantBoundaryPrecedence', () => {
    it('should confirm tenant check happens before OrgUnit scope', async () => {
      const result = await suite.testTenantBoundaryPrecedence(
        'tenant-123',
        'tenant-456', // Different tenant
        'orgunit-123',
        'orgunit-123', // Same OrgUnit would be in scope, but tenant fails first
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.PASSED);
        expect(result.data.details?.tenantMismatch).toBe(true);
        expect(result.data.details?.orgUnitCheckSkipped).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Membership Security Validation Tests
  // -------------------------------------------------------------------------

  describe('validateMembershipResolutionSecurity', () => {
    it('should pass for valid active membership', async () => {
      const result = await suite.validateMembershipResolutionSecurity({
        userId: 'user-123',
        activeTenantId: 'tenant-123',
        activeOrgUnitId: 'orgunit-123',
        role: MembershipRole.RT_ADMIN,
        membershipStatus: MembershipStatus.ACTIVE,
        isQuarantined: false,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.PASSED);
      }
    });

    it('should pass (reject) quarantined users', async () => {
      const result = await suite.validateMembershipResolutionSecurity({
        userId: 'quarantined-user-1',
        activeTenantId: 'tenant-123',
        activeOrgUnitId: 'orgunit-123',
        role: MembershipRole.RESIDENT,
        membershipStatus: MembershipStatus.ACTIVE,
        isQuarantined: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.PASSED);
        expect(result.data.details?.errorCode).toBe('AUTH_USER_QUARANTINED');
      }
    });

    it('should fail when tenant-level role has non-null orgUnitId (INV-MEM-002)', async () => {
      const result = await suite.validateMembershipResolutionSecurity({
        userId: 'user-123',
        activeTenantId: 'tenant-123',
        activeOrgUnitId: 'orgunit-123', // Should be null for TENANT_OWNER!
        role: MembershipRole.TENANT_OWNER,
        membershipStatus: MembershipStatus.ACTIVE,
        isQuarantined: false,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.FAILED);
        expect(result.data.details?.invariantViolation).toBe('INV-MEM-002');
      }
    });

    it('should fail when org-scoped role has null orgUnitId (INV-MEM-003)', async () => {
      const result = await suite.validateMembershipResolutionSecurity({
        userId: 'user-123',
        activeTenantId: 'tenant-123',
        activeOrgUnitId: null, // Should NOT be null for RT_ADMIN!
        role: MembershipRole.RT_ADMIN,
        membershipStatus: MembershipStatus.ACTIVE,
        isQuarantined: false,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.FAILED);
        expect(result.data.details?.invariantViolation).toBe('INV-MEM-003');
      }
    });
  });

  describe('testQuarantinedUserRejection', () => {
    it('should validate quarantined user is correctly identified', async () => {
      const result = await suite.testQuarantinedUserRejection(
        'quarantined-user-1',
        true,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.PASSED);
        expect(result.data.details?.action).toBe('REJECT_AUTH_USER_QUARANTINED');
      }
    });

    it('should validate non-quarantined user is correctly allowed', async () => {
      const result = await suite.testQuarantinedUserRejection(
        'normal-user',
        false,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.PASSED);
        expect(result.data.details?.isQuarantined).toBe(false);
      }
    });

    it('should fail when quarantine status does not match', async () => {
      const result = await suite.testQuarantinedUserRejection(
        'quarantined-user-1',
        false, // Wrong expectation
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.FAILED);
      }
    });
  });

  describe('testMembershipIdServerResolution', () => {
    it('should validate membershipId from JWT is ignored', async () => {
      const result = await suite.testMembershipIdServerResolution(
        'jwt-membership-id-123', // Attacker tries to inject
        'server-resolved-id-456', // Server ignores JWT, uses this
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.PASSED);
        expect(result.data.details?.jwtMembershipIdIgnored).toBe(true);
      }
    });

    it('should pass when no membershipId in JWT', async () => {
      const result = await suite.testMembershipIdServerResolution(
        undefined,
        'server-resolved-id-456',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.PASSED);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Invariant Compliance Validation Tests
  // -------------------------------------------------------------------------

  describe('validateInvariantCompliance', () => {
    it('should validate INV-TENANT-001 compliance', async () => {
      const result = await suite.validateInvariantCompliance('INV-TENANT-001', {
        recordTenantId: 'tenant-123',
        referencedTenantId: 'tenant-123',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.PASSED);
      }
    });

    it('should fail INV-TENANT-001 on cross-tenant reference', async () => {
      const result = await suite.validateInvariantCompliance('INV-TENANT-001', {
        recordTenantId: 'tenant-123',
        referencedTenantId: 'tenant-456', // Cross-tenant!
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.FAILED);
      }
    });

    it('should validate INV-MEM-001 compliance', async () => {
      const result = await suite.validateInvariantCompliance('INV-MEM-001', {
        membershipTenantId: 'tenant-123',
        orgUnitTenantId: 'tenant-123',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.PASSED);
      }
    });

    it('should fail INV-MEM-001 when OrgUnit belongs to different tenant', async () => {
      const result = await suite.validateInvariantCompliance('INV-MEM-001', {
        membershipTenantId: 'tenant-123',
        orgUnitTenantId: 'tenant-456', // Different tenant!
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.FAILED);
      }
    });

    it('should validate INV-ORG-003 (depth = path.length - 1)', async () => {
      const result = await suite.validateInvariantCompliance('INV-ORG-003', {
        depth: 2,
        pathLength: 3, // depth should be 2
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.PASSED);
      }
    });

    it('should fail INV-ORG-003 when depth calculation is wrong', async () => {
      const result = await suite.validateInvariantCompliance('INV-ORG-003', {
        depth: 3,
        pathLength: 3, // depth should be 2, not 3
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.FAILED);
      }
    });

    it('should validate INV-IOT-001 compliance', async () => {
      const result = await suite.validateInvariantCompliance('INV-IOT-001', {
        deviceTenantId: 'tenant-123',
        ownerTenantId: 'tenant-123',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.PASSED);
      }
    });

    it('should fail INV-IOT-001 when device and owner tenant mismatch', async () => {
      const result = await suite.validateInvariantCompliance('INV-IOT-001', {
        deviceTenantId: 'tenant-123',
        ownerTenantId: 'tenant-456', // Different tenant!
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityValidationStatus.FAILED);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Security Scenario Coverage Tests
  // -------------------------------------------------------------------------

  describe('Security Scenario Coverage', () => {
    it('should have scenarios for all critical invariants', () => {
      const criticalInvariants = [
        'INV-TENANT-001',
        'INV-AUTH-001',
        'INV-AUTH-002',
        'INV-QUARANTINE-001',
      ];

      for (const invariant of criticalInvariants) {
        const coveringScenarios = SECURITY_VALIDATION_SCENARIOS.filter((s) =>
          s.invariants.includes(invariant as any),
        );
        expect(coveringScenarios.length).toBeGreaterThan(0);
      }
    });

    it('should have CRITICAL severity for tenant isolation scenarios', () => {
      const tenantIsolationScenarios = SECURITY_VALIDATION_SCENARIOS.filter(
        (s) => s.category === SecurityValidationCategory.TENANT_ISOLATION,
      );

      for (const scenario of tenantIsolationScenarios) {
        expect(scenario.severity).toBe(SecurityValidationSeverity.CRITICAL);
      }
    });

    it('should include both positive and negative test types', () => {
      const testTypes = new Set(
        SECURITY_VALIDATION_SCENARIOS.map((s) => s.testType),
      );

      expect(testTypes.has(SecurityTestType.POSITIVE)).toBe(true);
      expect(testTypes.has(SecurityTestType.NEGATIVE)).toBe(true);
      expect(testTypes.has(SecurityTestType.BOUNDARY)).toBe(true);
      expect(testTypes.has(SecurityTestType.ATTACK_SIMULATION)).toBe(true);
    });
  });
});
