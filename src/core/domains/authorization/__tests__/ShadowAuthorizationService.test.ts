/**
 * Shadow Authorization Service Unit Tests
 *
 * Tests the shadow authorization validation functionality including:
 * - Dual authorization execution (legacy + new)
 * - Mismatch detection and logging
 * - Quarantine exclusion from metrics
 * - Per-route opt-in support
 * - Threshold checks (1% warning, 0.1% cutover)
 * - Metrics tracking
 *
 * @see Requirements 7 (AC 1-8)
 * @see Design Shadow Authorization Validation section
 * @see TPR-06: Warning vs Cutover threshold semantics
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ok, fail } from '@core/utils';
import { MembershipRole, MembershipStatus } from '@core/domains/membership/types';
import type { Membership } from '@core/domains/membership/entities';
import { UserRole } from '@core/protocols';
import type {
  IAuthorizationContextResolver,
} from '../services/AuthorizationContextResolver';
import type {
  ILegacyAuthorizationAdapter,
  LegacyUserData,
} from '@infrastructure/authorization';
import {
  ShadowAuthorizationServiceImpl,
  type IShadowAuthorizationService,
  type IMismatchLogger,
} from '../services/ShadowAuthorizationService';
import type {
  ShadowAuthorizationRequest,
  AuthorizationDecision,
} from '../types';
import { DEFAULT_SHADOW_THRESHOLDS } from '../types';

// Mock the quarantine module
vi.mock('@infrastructure/quarantine', () => ({
  isQuarantined: vi.fn().mockReturnValue(false),
}));

import { isQuarantined } from '@infrastructure/quarantine';

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

const createMockLegacyUserData = (
  overrides: Partial<LegacyUserData> = {},
): LegacyUserData => ({
  id: 'user-123',
  tenantId: 'tenant-456',
  role: UserRole.Warga,
  tokenVersion: 1,
  ...overrides,
});

const createValidRequest = (
  overrides: Partial<ShadowAuthorizationRequest> = {},
): ShadowAuthorizationRequest => ({
  correlationId: 'corr-123',
  userId: 'user-123',
  activeTenantId: 'tenant-456',
  activeOrgUnitId: 'orgunit-789',
  tokenVersion: 1,
  routeId: 'get-resident',
  endpoint: '/api/residents/:id',
  method: 'GET',
  requiredPermissions: ['resident:read'],
  ...overrides,
});

// ---------------------------------------------------------------------------
// Mock Service Factories
// ---------------------------------------------------------------------------

const createMockAuthorizationContextResolver = (
  overrides: Partial<IAuthorizationContextResolver> = {},
): IAuthorizationContextResolver => ({
  resolve: vi.fn().mockResolvedValue(
    ok({
      context: {
        userId: 'user-123',
        tenantId: 'tenant-456',
        membershipId: 'membership-123',
        orgUnitId: 'orgunit-789',
        role: MembershipRole.RESIDENT,
        permissions: new Set(['resident:read', 'emergency:create']),
        tokenVersion: 1,
        isAuthoritative: true,
        isTenantLevel: false,
        membership: createMockMembership(),
      },
      metadata: {
        resolvedAt: new Date(),
        membershipCountInTenant: 1,
        isMultiMembership: false,
      },
    }),
  ),
  validateClaims: vi.fn().mockReturnValue(
    ok({
      userId: 'user-123',
      activeTenantId: 'tenant-456',
      activeOrgUnitId: 'orgunit-789',
      tokenVersion: 1,
    }),
  ),
  validateTokenVersion: vi.fn().mockReturnValue(ok(undefined)),
  ...overrides,
});

const createMockLegacyAuthorizationAdapter = (
  overrides: Partial<ILegacyAuthorizationAdapter> = {},
): ILegacyAuthorizationAdapter => ({
  authorize: vi.fn().mockResolvedValue(
    ok({
      allowed: true,
      reason: 'Legacy authorization passed',
      role: UserRole.Warga,
      tenantId: 'tenant-456',
    } satisfies AuthorizationDecision),
  ),
  getLegacyUserData: vi.fn().mockResolvedValue(createMockLegacyUserData()),
  ...overrides,
});

const createMockMismatchLogger = (): IMismatchLogger => ({
  log: vi.fn(),
  warn: vi.fn(),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ShadowAuthorizationService', () => {
  let service: IShadowAuthorizationService;
  let mockAuthResolver: IAuthorizationContextResolver;
  let mockLegacyAdapter: ILegacyAuthorizationAdapter;
  let mockLogger: IMismatchLogger;

  beforeEach(() => {
    vi.clearAllMocks();
    (isQuarantined as ReturnType<typeof vi.fn>).mockReturnValue(false);

    mockAuthResolver = createMockAuthorizationContextResolver();
    mockLegacyAdapter = createMockLegacyAuthorizationAdapter();
    mockLogger = createMockMismatchLogger();

    service = ShadowAuthorizationServiceImpl({
      authorizationContextResolver: mockAuthResolver,
      legacyAuthorizationAdapter: mockLegacyAdapter,
      mismatchLogger: mockLogger,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // AC 1: Executes legacy and new authorization
  // -------------------------------------------------------------------------

  describe('executeShadowAuth - AC 1: Dual Authorization Execution', () => {
    it('should execute both legacy and new authorization for each request', async () => {
      const request = createValidRequest();

      const result = await service.executeShadowAuth(request);

      expect(result.success).toBe(true);
      expect(mockLegacyAdapter.authorize).toHaveBeenCalledOnce();
      expect(mockAuthResolver.resolve).toHaveBeenCalledOnce();
    });

    it('should return both legacy and new results in the response', async () => {
      const request = createValidRequest();

      const result = await service.executeShadowAuth(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.legacyResult).toBeDefined();
        expect(result.data.newResult).toBeDefined();
        expect(result.data.legacyResult.allowed).toBe(true);
        expect(result.data.newResult.allowed).toBe(true);
      }
    });

    it('should use legacy result for final decision in shadow mode', async () => {
      // Legacy allows, new denies
      mockLegacyAdapter.authorize = vi.fn().mockResolvedValue(
        ok({
          allowed: true,
          reason: 'Legacy passed',
          role: UserRole.Warga,
        } satisfies AuthorizationDecision),
      );
      mockAuthResolver.resolve = vi.fn().mockResolvedValue(
        ok({
          context: {
            userId: 'user-123',
            tenantId: 'tenant-456',
            membershipId: 'membership-123',
            orgUnitId: 'orgunit-789',
            role: MembershipRole.RESIDENT,
            permissions: new Set([]), // No permissions - will fail check
            tokenVersion: 1,
            isAuthoritative: true,
            isTenantLevel: false,
            membership: createMockMembership(),
          },
          metadata: {
            resolvedAt: new Date(),
            membershipCountInTenant: 1,
            isMultiMembership: false,
          },
        }),
      );

      const request = createValidRequest();
      const result = await service.executeShadowAuth(request);

      expect(result.success).toBe(true);
      if (result.success) {
        // Final decision should be LEGACY (allowed = true)
        expect(result.data.finalDecision.allowed).toBe(true);
        expect(result.data.hasMismatch).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // AC 2: Mismatch detection and logging
  // -------------------------------------------------------------------------

  describe('executeShadowAuth - AC 2: Mismatch Detection and Logging', () => {
    it('should detect false positive mismatch (new allows, legacy denies)', async () => {
      mockLegacyAdapter.authorize = vi.fn().mockResolvedValue(
        ok({
          allowed: false,
          reason: 'Legacy denied',
          errorCode: 'AUTH_INSUFFICIENT_PERMISSION',
        } satisfies AuthorizationDecision),
      );

      const request = createValidRequest();
      const result = await service.executeShadowAuth(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.hasMismatch).toBe(true);
        expect(result.data.mismatchType).toBe('false_positive');
        expect(mockLogger.log).toHaveBeenCalledOnce();
      }
    });

    it('should detect false negative mismatch (new denies, legacy allows)', async () => {
      mockAuthResolver.resolve = vi.fn().mockResolvedValue(
        ok({
          context: {
            userId: 'user-123',
            tenantId: 'tenant-456',
            membershipId: 'membership-123',
            orgUnitId: 'orgunit-789',
            role: MembershipRole.RESIDENT,
            permissions: new Set([]), // No permissions
            tokenVersion: 1,
            isAuthoritative: true,
            isTenantLevel: false,
            membership: createMockMembership(),
          },
          metadata: {
            resolvedAt: new Date(),
            membershipCountInTenant: 1,
            isMultiMembership: false,
          },
        }),
      );

      const request = createValidRequest();
      const result = await service.executeShadowAuth(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.hasMismatch).toBe(true);
        expect(result.data.mismatchType).toBe('false_negative');
        expect(mockLogger.log).toHaveBeenCalledOnce();
      }
    });

    it('should not detect mismatch when both agree (allow)', async () => {
      const request = createValidRequest();
      const result = await service.executeShadowAuth(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.hasMismatch).toBe(false);
        expect(result.data.mismatchType).toBeNull();
        expect(mockLogger.log).not.toHaveBeenCalled();
      }
    });

    it('should not detect mismatch when both agree (deny)', async () => {
      mockLegacyAdapter.authorize = vi.fn().mockResolvedValue(
        ok({
          allowed: false,
          reason: 'Legacy denied',
          errorCode: 'AUTH_TENANT_MISMATCH',
        } satisfies AuthorizationDecision),
      );
      mockAuthResolver.resolve = vi.fn().mockResolvedValue(
        fail({
          type: 'authorization',
          code: 'AUTH_NO_MEMBERSHIP',
          message: 'No membership',
        }),
      );

      const request = createValidRequest();
      const result = await service.executeShadowAuth(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.hasMismatch).toBe(false);
        expect(result.data.legacyResult.allowed).toBe(false);
        expect(result.data.newResult.allowed).toBe(false);
      }
    });

    it('should log mismatch with full context including correlationId', async () => {
      mockLegacyAdapter.authorize = vi.fn().mockResolvedValue(
        ok({
          allowed: false,
          reason: 'Legacy denied',
          errorCode: 'AUTH_INSUFFICIENT_PERMISSION',
        } satisfies AuthorizationDecision),
      );

      const request = createValidRequest({ correlationId: 'test-corr-id' });
      await service.executeShadowAuth(request);

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          correlationId: 'test-corr-id',
          userId: 'user-123',
          tenantId: 'tenant-456',
          endpoint: '/api/residents/:id',
          mismatchType: 'false_positive',
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // AC 4: Metrics tracking
  // -------------------------------------------------------------------------

  describe('getMetrics - AC 4: Metrics Tracking', () => {
    it('should track total checks', async () => {
      const request = createValidRequest();

      await service.executeShadowAuth(request);
      await service.executeShadowAuth(request);
      await service.executeShadowAuth(request);

      const metrics = service.getMetrics();
      expect(metrics.totalChecks).toBe(3);
    });

    it('should track mismatch count and rate', async () => {
      // 2 mismatches out of 4 checks = 50%
      mockLegacyAdapter.authorize = vi.fn()
        .mockResolvedValueOnce(ok({ allowed: true, reason: 'pass' }))
        .mockResolvedValueOnce(ok({ allowed: false, reason: 'fail' })) // mismatch
        .mockResolvedValueOnce(ok({ allowed: true, reason: 'pass' }))
        .mockResolvedValueOnce(ok({ allowed: false, reason: 'fail' })); // mismatch

      const request = createValidRequest();

      await service.executeShadowAuth(request);
      await service.executeShadowAuth(request);
      await service.executeShadowAuth(request);
      await service.executeShadowAuth(request);

      const metrics = service.getMetrics();
      expect(metrics.totalChecks).toBe(4);
      expect(metrics.mismatchCount).toBe(2);
      expect(metrics.mismatchRate).toBe(0.5);
    });

    it('should track false positives and false negatives separately', async () => {
      // First: false positive (new allows, legacy denies)
      mockLegacyAdapter.authorize = vi.fn().mockResolvedValueOnce(
        ok({ allowed: false, reason: 'denied' }),
      );
      await service.executeShadowAuth(createValidRequest());

      // Second: false negative (new denies, legacy allows)
      mockLegacyAdapter.authorize = vi.fn().mockResolvedValue(
        ok({ allowed: true, reason: 'passed' }),
      );
      mockAuthResolver.resolve = vi.fn().mockResolvedValue(
        ok({
          context: {
            userId: 'user-123',
            tenantId: 'tenant-456',
            membershipId: 'membership-123',
            orgUnitId: 'orgunit-789',
            role: MembershipRole.RESIDENT,
            permissions: new Set([]), // No permissions
            tokenVersion: 1,
            isAuthoritative: true,
            isTenantLevel: false,
            membership: createMockMembership(),
          },
          metadata: {
            resolvedAt: new Date(),
            membershipCountInTenant: 1,
            isMultiMembership: false,
          },
        }),
      );
      await service.executeShadowAuth(createValidRequest());

      const metrics = service.getMetrics();
      expect(metrics.falsePositives).toBe(1);
      expect(metrics.falseNegatives).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // AC 5: Per-route opt-in
  // -------------------------------------------------------------------------

  describe('isRouteEnabled - AC 5: Per-route Opt-in', () => {
    it('should return false for routes not enabled', () => {
      expect(service.isRouteEnabled('unknown-route')).toBe(false);
    });

    it('should return true for enabled routes', () => {
      service.enableRoute('my-route');
      expect(service.isRouteEnabled('my-route')).toBe(true);
    });

    it('should allow disabling routes', () => {
      service.enableRoute('my-route');
      service.disableRoute('my-route');
      expect(service.isRouteEnabled('my-route')).toBe(false);
    });

    it('should track metrics per route', async () => {
      service.enableRoute('route-a');
      service.enableRoute('route-b');

      await service.executeShadowAuth(createValidRequest({ routeId: 'route-a' }));
      await service.executeShadowAuth(createValidRequest({ routeId: 'route-a' }));
      await service.executeShadowAuth(createValidRequest({ routeId: 'route-b' }));

      const metrics = service.getMetrics();
      const routeAMetrics = metrics.perRouteMetrics.get('route-a');
      const routeBMetrics = metrics.perRouteMetrics.get('route-b');

      expect(routeAMetrics?.totalChecks).toBe(2);
      expect(routeBMetrics?.totalChecks).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // AC 7: Warning threshold (> 1%)
  // -------------------------------------------------------------------------

  describe('WARNING threshold - AC 7: Operational Alerts', () => {
    it('should warn when mismatch rate exceeds 1%', async () => {
      // Create scenario with > 1% mismatch rate
      // Need enough checks to have meaningful rate
      mockLegacyAdapter.authorize = vi.fn().mockResolvedValue(
        ok({ allowed: false, reason: 'denied' }),
      );

      // Execute 10 requests, all will be false positives
      for (let i = 0; i < 10; i++) {
        await service.executeShadowAuth(createValidRequest({ correlationId: `corr-${i}` }));
      }

      // Should have warned since rate is 100% > 1%
      expect(mockLogger.warn).toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('exceeds WARNING threshold'),
        expect.objectContaining({
          threshold: 0.01,
        }),
      );
    });

    it('should report warningThresholdExceeded in metrics', async () => {
      mockLegacyAdapter.authorize = vi.fn().mockResolvedValue(
        ok({ allowed: false, reason: 'denied' }),
      );

      await service.executeShadowAuth(createValidRequest());

      const metrics = service.getMetrics();
      expect(metrics.warningThresholdExceeded).toBe(true);
    });

    it('should not warn when mismatch rate is below 1%', async () => {
      // All requests match - no mismatches
      for (let i = 0; i < 10; i++) {
        await service.executeShadowAuth(createValidRequest({ correlationId: `corr-${i}` }));
      }

      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // AC 8: Cutover eligibility (< 0.1%)
  // -------------------------------------------------------------------------

  describe('checkCutoverEligibility - AC 8: Security Gate', () => {
    it('should require minimum sample size for cutover eligibility', () => {
      // No checks yet
      const eligibility = service.checkCutoverEligibility();
      
      expect(eligibility.eligible).toBe(false);
      expect(eligibility.reason).toContain('Insufficient sample size');
    });

    it('should be eligible when mismatch rate < 0.1% with sufficient samples', async () => {
      // Run 100+ checks with no mismatches
      for (let i = 0; i < 110; i++) {
        await service.executeShadowAuth(createValidRequest({ correlationId: `corr-${i}` }));
      }

      const eligibility = service.checkCutoverEligibility();
      
      expect(eligibility.eligible).toBe(true);
      expect(eligibility.currentMismatchRate).toBe(0);
      expect(eligibility.requiredThreshold).toBe(0.001);
    });

    it('should not be eligible when mismatch rate >= 0.1%', async () => {
      // Run 100 checks with 1 mismatch = 1% > 0.1%
      for (let i = 0; i < 99; i++) {
        await service.executeShadowAuth(createValidRequest({ correlationId: `corr-${i}` }));
      }
      
      // Add one mismatch
      mockLegacyAdapter.authorize = vi.fn().mockResolvedValue(
        ok({ allowed: false, reason: 'denied' }),
      );
      await service.executeShadowAuth(createValidRequest({ correlationId: 'mismatch' }));

      const eligibility = service.checkCutoverEligibility();
      
      expect(eligibility.eligible).toBe(false);
      expect(eligibility.currentMismatchRate).toBe(0.01); // 1/100 = 1%
      expect(eligibility.reason).toContain('exceeds threshold');
    });

    it('should provide recommendations for achieving eligibility', async () => {
      // Run with high mismatch rate
      mockLegacyAdapter.authorize = vi.fn().mockResolvedValue(
        ok({ allowed: false, reason: 'denied' }),
      );

      for (let i = 0; i < 50; i++) {
        await service.executeShadowAuth(createValidRequest({ routeId: 'problem-route' }));
      }

      const eligibility = service.checkCutoverEligibility();
      
      expect(eligibility.recommendations.length).toBeGreaterThan(0);
      expect(eligibility.problemRoutes.length).toBeGreaterThan(0);
      const topRoute = eligibility.problemRoutes[0];
      expect(topRoute).toBeDefined();
      expect(topRoute?.routeId).toBe('problem-route');
    });

    it('should document that cutover threshold (0.1%) is stricter than warning threshold (1%)', () => {
      const thresholds = service.getThresholds();
      
      expect(thresholds.warningThreshold).toBe(0.01); // 1%
      expect(thresholds.cutoverThreshold).toBe(0.001); // 0.1%
      expect(thresholds.cutoverThreshold).toBeLessThan(thresholds.warningThreshold);
    });
  });

  // -------------------------------------------------------------------------
  // Quarantine Exclusion
  // -------------------------------------------------------------------------

  describe('Quarantine Exclusion', () => {
    it('should exclude quarantined users from mismatch calculations', async () => {
      (isQuarantined as ReturnType<typeof vi.fn>).mockReturnValue(true);

      // This would be a mismatch, but user is quarantined
      mockLegacyAdapter.authorize = vi.fn().mockResolvedValue(
        ok({ allowed: false, reason: 'denied' }),
      );

      await service.executeShadowAuth(createValidRequest());

      const metrics = service.getMetrics();
      expect(metrics.totalChecks).toBe(0); // Not counted
      expect(metrics.mismatchCount).toBe(0); // Not counted
      expect(metrics.excludedCount).toBe(1); // Counted as excluded
    });

    it('should mark excluded requests in result', async () => {
      (isQuarantined as ReturnType<typeof vi.fn>).mockReturnValue(true);

      const result = await service.executeShadowAuth(createValidRequest());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.excludedFromMetrics).toBe(true);
      }
    });

    it('should not log mismatch for quarantined users', async () => {
      (isQuarantined as ReturnType<typeof vi.fn>).mockReturnValue(true);

      mockLegacyAdapter.authorize = vi.fn().mockResolvedValue(
        ok({ allowed: false, reason: 'denied' }),
      );

      await service.executeShadowAuth(createValidRequest());

      expect(mockLogger.log).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Threshold Configuration
  // -------------------------------------------------------------------------

  describe('Threshold Configuration', () => {
    it('should use default thresholds (TPR-06)', () => {
      const thresholds = service.getThresholds();
      
      expect(thresholds).toEqual(DEFAULT_SHADOW_THRESHOLDS);
      expect(thresholds.warningThreshold).toBe(0.01);
      expect(thresholds.cutoverThreshold).toBe(0.001);
    });

    it('should allow updating thresholds', () => {
      service.setThresholds({ warningThreshold: 0.02 });
      
      const thresholds = service.getThresholds();
      expect(thresholds.warningThreshold).toBe(0.02);
      expect(thresholds.cutoverThreshold).toBe(0.001); // Unchanged
    });
  });

  // -------------------------------------------------------------------------
  // Metrics Reset
  // -------------------------------------------------------------------------

  describe('resetMetrics', () => {
    it('should reset all metrics to initial state', async () => {
      // Run some checks
      for (let i = 0; i < 5; i++) {
        await service.executeShadowAuth(createValidRequest({ correlationId: `corr-${i}` }));
      }

      expect(service.getMetrics().totalChecks).toBe(5);

      // Reset
      service.resetMetrics();

      const metrics = service.getMetrics();
      expect(metrics.totalChecks).toBe(0);
      expect(metrics.mismatchCount).toBe(0);
      expect(metrics.falsePositives).toBe(0);
      expect(metrics.falseNegatives).toBe(0);
      expect(metrics.excludedCount).toBe(0);
      expect(metrics.perRouteMetrics.size).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Duration Tracking
  // -------------------------------------------------------------------------

  describe('Duration Tracking', () => {
    it('should track execution duration', async () => {
      const result = await service.executeShadowAuth(createValidRequest());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.durationMs).toBeDefined();
        expect(typeof result.data.durationMs).toBe('number');
        expect(result.data.durationMs).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Error Handling
  // -------------------------------------------------------------------------

  describe('Error Handling', () => {
    it('should fail when legacy adapter returns error', async () => {
      mockLegacyAdapter.authorize = vi.fn().mockResolvedValue(
        fail({
          type: 'unexpected',
          code: 'LEGACY_AUTH_FAILED',
          message: 'Internal error',
        }),
      );

      const result = await service.executeShadowAuth(createValidRequest());

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('LEGACY_AUTH_FAILED');
      }
    });

    it('should handle new authorization errors gracefully', async () => {
      mockAuthResolver.resolve = vi.fn().mockRejectedValue(new Error('Resolver crash'));

      // Should still return a result (with new auth showing as denied)
      const result = await service.executeShadowAuth(createValidRequest());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.newResult.allowed).toBe(false);
        expect(result.data.newResult.errorCode).toBe('AUTH_NEW_ERROR');
      }
    });
  });
});

