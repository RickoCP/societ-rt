/**
 * Authorization Cutover Service Tests
 *
 * Tests for the Authorization Cutover Service covering:
 * - Gate verification tests
 * - Per-route cutover tests
 * - Rollback tests
 * - Audit logging tests
 *
 * @see Task 25: Authorization Cutover Service
 * @see Requirements 8 (AC 1-7)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AuthorizationCutoverServiceImpl,
} from '../AuthorizationCutoverService';
import {
  CutoverStatus,
  CutoverAuditAction,
  CUTOVER_MISMATCH_THRESHOLD,
  type IAuthorizationCutoverService,
  type ICutoverAlertEmitter,
} from '../types';
import type { IPreCutoverGateService, PreCutoverGateResult } from '../../compatibility';
import type { IShadowAuthorizationService } from '@core/domains/authorization/services/ShadowAuthorizationService';
import type { CutoverEligibilityResult, ShadowAuthorizationMetrics } from '@core/domains/authorization/types';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

const createMockPreCutoverGateService = (
  overrides: Partial<{
    canProceed: boolean;
    gateResult: Partial<PreCutoverGateResult>;
  }> = {},
): IPreCutoverGateService => {
  const canProceed = overrides.canProceed ?? true;
  const gateResult: PreCutoverGateResult = {
    passed: canProceed,
    checkedAt: new Date(),
    checkVersion: '1.0.0',
    criteria: [],
    legacyOnlyWriterCount: canProceed ? 0 : 1,
    totalWritePathCount: 10,
    compatibleWritePathCount: canProceed ? 10 : 9,
    summary: canProceed ? 'PASS' : 'FAIL',
    ...overrides.gateResult,
  };

  return {
    runGateCheck: vi.fn().mockResolvedValue(gateResult),
    canProceedWithCutover: vi.fn().mockResolvedValue(canProceed),
    getBlockingIssues: vi.fn().mockResolvedValue([]),
  };
};

const createMockShadowAuthService = (
  overrides: Partial<{
    eligible: boolean;
    mismatchRate: number;
    totalChecks: number;
    problemRoutes: Array<{ routeId: string; mismatchRate: number; mismatchCount: number }>;
  }> = {},
): IShadowAuthorizationService => {
  const eligible = overrides.eligible ?? true;
  const mismatchRate = overrides.mismatchRate ?? 0.0005; // 0.05%
  const totalChecks = overrides.totalChecks ?? 1000;
  const problemRoutes = overrides.problemRoutes ?? [];

  const eligibilityResult: CutoverEligibilityResult = {
    eligible,
    currentMismatchRate: mismatchRate,
    requiredThreshold: CUTOVER_MISMATCH_THRESHOLD,
    reason: eligible ? undefined : `Mismatch rate ${mismatchRate * 100}% exceeds threshold`,
    recommendations: [],
    problemRoutes,
  };

  const metrics: ShadowAuthorizationMetrics = {
    totalChecks,
    mismatchCount: Math.round(mismatchRate * totalChecks),
    falsePositives: 0,
    falseNegatives: 0,
    mismatchRate,
    excludedCount: 0,
    warningThresholdExceeded: false,
    cutoverEligible: eligible,
    lastUpdated: new Date(),
    windowStart: new Date(),
    perRouteMetrics: new Map(),
  };

  return {
    executeShadowAuth: vi.fn(),
    logMismatch: vi.fn(),
    getMismatchRate: vi.fn().mockReturnValue(mismatchRate),
    getMetrics: vi.fn().mockReturnValue(metrics),
    isRouteEnabled: vi.fn().mockReturnValue(true),
    enableRoute: vi.fn(),
    disableRoute: vi.fn(),
    checkCutoverEligibility: vi.fn().mockReturnValue(eligibilityResult),
    resetMetrics: vi.fn(),
    getThresholds: vi.fn().mockReturnValue({
      warningThreshold: 0.01,
      cutoverThreshold: CUTOVER_MISMATCH_THRESHOLD,
    }),
    setThresholds: vi.fn(),
  };
};

const createMockAlertEmitter = (): ICutoverAlertEmitter => ({
  emitCriticalAlert: vi.fn(),
  emitInfoAlert: vi.fn(),
});

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('AuthorizationCutoverService', () => {
  let service: IAuthorizationCutoverService;
  let mockPreCutoverGateService: IPreCutoverGateService;
  let mockShadowAuthService: IShadowAuthorizationService;
  let mockAlertEmitter: ICutoverAlertEmitter;

  beforeEach(() => {
    mockPreCutoverGateService = createMockPreCutoverGateService();
    mockShadowAuthService = createMockShadowAuthService();
    mockAlertEmitter = createMockAlertEmitter();

    service = AuthorizationCutoverServiceImpl({
      preCutoverGateService: mockPreCutoverGateService,
      shadowAuthService: mockShadowAuthService,
      alertEmitter: mockAlertEmitter,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Gate Verification Tests
  // =========================================================================

  describe('verifyCutoverPrerequisites', () => {
    /**
     * **Validates: Requirements 8 (AC 5)**
     * Cutover SHALL require mismatch rate below threshold before allowing cutover.
     */
    it('should return allMet=true when all prerequisites pass', async () => {
      const result = await service.verifyCutoverPrerequisites();

      expect(result.allMet).toBe(true);
      expect(result.writeCompatibilityGate.met).toBe(true);
      expect(result.mismatchRateGate.met).toBe(true);
      expect(result.legacyWritersGate.met).toBe(true);
      expect(result.blockingIssues).toHaveLength(0);
      expect(result.summary).toContain('All prerequisites met');
    });

    /**
     * **Validates: Requirements 8 (AC 5)**
     * Cutover SHALL require mismatch rate below threshold.
     */
    it('should fail when mismatch rate exceeds threshold', async () => {
      mockShadowAuthService = createMockShadowAuthService({
        eligible: false,
        mismatchRate: 0.005, // 0.5% > 0.1%
      });

      service = AuthorizationCutoverServiceImpl({
        preCutoverGateService: mockPreCutoverGateService,
        shadowAuthService: mockShadowAuthService,
        alertEmitter: mockAlertEmitter,
      });

      const result = await service.verifyCutoverPrerequisites();

      expect(result.allMet).toBe(false);
      expect(result.mismatchRateGate.met).toBe(false);
      expect(result.blockingIssues.length).toBeGreaterThan(0);
      expect(result.blockingIssues.some((i) => i.includes('Mismatch rate'))).toBe(true);
    });

    /**
     * **Validates: Task 24 dependency**
     * Cutover MUST NOT proceed if pre-cutover write compatibility gate fails.
     */
    it('should fail when pre-cutover write compatibility gate fails', async () => {
      mockPreCutoverGateService = createMockPreCutoverGateService({
        canProceed: false,
        gateResult: { legacyOnlyWriterCount: 2 },
      });

      service = AuthorizationCutoverServiceImpl({
        preCutoverGateService: mockPreCutoverGateService,
        shadowAuthService: mockShadowAuthService,
        alertEmitter: mockAlertEmitter,
      });

      const result = await service.verifyCutoverPrerequisites();

      expect(result.allMet).toBe(false);
      expect(result.writeCompatibilityGate.met).toBe(false);
      expect(result.legacyWritersGate.met).toBe(false);
      expect(result.blockingIssues.some((i) => i.includes('legacy-only'))).toBe(true);
    });

    /**
     * **Validates: Requirements 8 (AC 6)**
     * System SHALL maintain audit log of prerequisite verification.
     */
    it('should create audit entry for successful verification', async () => {
      await service.verifyCutoverPrerequisites();

      const auditLog = service.getAuditLog();
      expect(auditLog.length).toBeGreaterThan(0);

      const prereqEntry = auditLog.find(
        (e) => e.action === CutoverAuditAction.PREREQUISITES_VERIFIED,
      );
      expect(prereqEntry).toBeDefined();
      expect(prereqEntry?.success).toBe(true);
    });

    it('should create audit entry for failed verification', async () => {
      mockShadowAuthService = createMockShadowAuthService({ eligible: false });
      service = AuthorizationCutoverServiceImpl({
        preCutoverGateService: mockPreCutoverGateService,
        shadowAuthService: mockShadowAuthService,
        alertEmitter: mockAlertEmitter,
      });

      await service.verifyCutoverPrerequisites();

      const auditLog = service.getAuditLog();
      const prereqEntry = auditLog.find(
        (e) => e.action === CutoverAuditAction.PREREQUISITES_FAILED,
      );
      expect(prereqEntry).toBeDefined();
      expect(prereqEntry?.success).toBe(false);
    });
  });

  // =========================================================================
  // Per-Route Cutover Tests
  // =========================================================================

  describe('initiateRouteCutover', () => {
    const routeId = 'get-residents';
    const routeName = 'Get Residents API';
    const operatorId = 'admin-123';

    beforeEach(() => {
      service.registerRoute(routeId, routeName);
    });

    /**
     * **Validates: Requirements 8 (AC 1-2)**
     * Cutover SHALL support atomic switching via feature flag and per-route cutover.
     */
    it('should successfully cut over a route when prerequisites are met', async () => {
      const result = await service.initiateRouteCutover({
        routeId,
        operatorId,
        reason: 'Production cutover after shadow validation',
      });

      expect(result.success).toBe(true);
      expect(result.newStatus).toBe(CutoverStatus.MEMBERSHIP_AUTHORITATIVE);
      expect(result.auditEntry.action).toBe(CutoverAuditAction.CUTOVER_COMPLETED);
      expect(result.auditEntry.success).toBe(true);
    });

    /**
     * **Validates: Requirements 8 (AC 3)**
     * WHEN cutover is initiated, System SHALL use only new authorization for that route.
     */
    it('should mark route as cut over after successful cutover', async () => {
      await service.initiateRouteCutover({
        routeId,
        operatorId,
        reason: 'Test cutover',
      });

      const status = service.getRouteCutoverStatus(routeId);
      expect(status?.status).toBe(CutoverStatus.MEMBERSHIP_AUTHORITATIVE);
      expect(status?.cutoverAt).toBeDefined();
      expect(status?.lastOperatorId).toBe(operatorId);

      expect(service.isRouteCutOver(routeId)).toBe(true);
    });

    /**
     * **Validates: Requirements 8 (AC 5)**
     * Cutover SHALL require prerequisites to be met.
     */
    it('should fail cutover when prerequisites are not met', async () => {
      mockShadowAuthService = createMockShadowAuthService({ eligible: false });
      service = AuthorizationCutoverServiceImpl({
        preCutoverGateService: mockPreCutoverGateService,
        shadowAuthService: mockShadowAuthService,
        alertEmitter: mockAlertEmitter,
      });
      service.registerRoute(routeId, routeName);

      const result = await service.initiateRouteCutover({
        routeId,
        operatorId,
        reason: 'Test cutover',
      });

      expect(result.success).toBe(false);
      expect(result.auditEntry.action).toBe(CutoverAuditAction.CUTOVER_FAILED);
      expect(result.errorMessage).toContain('Prerequisites not met');
    });

    it('should fail cutover for unregistered route', async () => {
      const result = await service.initiateRouteCutover({
        routeId: 'unknown-route',
        operatorId,
        reason: 'Test cutover',
      });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('not registered');
    });

    it('should fail cutover if route is already cut over', async () => {
      // First cutover
      await service.initiateRouteCutover({
        routeId,
        operatorId,
        reason: 'First cutover',
      });

      // Second cutover attempt
      const result = await service.initiateRouteCutover({
        routeId,
        operatorId,
        reason: 'Second cutover',
      });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('already cut over');
    });

    /**
     * **Validates: Requirements 8 (AC 6)**
     * System SHALL maintain audit log of cutover actions.
     */
    it('should create audit entry for cutover operation', async () => {
      await service.initiateRouteCutover({
        routeId,
        operatorId,
        reason: 'Test cutover',
      });

      const auditLog = service.getAuditLog({ routeId });
      const cutoverEntry = auditLog.find(
        (e) => e.action === CutoverAuditAction.CUTOVER_COMPLETED,
      );

      expect(cutoverEntry).toBeDefined();
      expect(cutoverEntry?.routesAffected).toContain(routeId);
      expect(cutoverEntry?.operatorId).toBe(operatorId);
      expect(cutoverEntry?.newStatus).toBe(CutoverStatus.MEMBERSHIP_AUTHORITATIVE);
    });

    it('should emit info alert on successful cutover', async () => {
      await service.initiateRouteCutover({
        routeId,
        operatorId,
        reason: 'Test cutover',
      });

      expect(mockAlertEmitter.emitInfoAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'CUTOVER_SUCCESS',
          routeId,
          operatorId,
        }),
      );
    });

    it('should allow skipping prerequisite check for testing', async () => {
      mockShadowAuthService = createMockShadowAuthService({ eligible: false });
      service = AuthorizationCutoverServiceImpl({
        preCutoverGateService: mockPreCutoverGateService,
        shadowAuthService: mockShadowAuthService,
        alertEmitter: mockAlertEmitter,
      });
      service.registerRoute(routeId, routeName);

      const result = await service.initiateRouteCutover({
        routeId,
        operatorId,
        reason: 'Test cutover',
        skipPrerequisiteCheck: true,
      });

      expect(result.success).toBe(true);
    });
  });

  // =========================================================================
  // Rollback Tests
  // =========================================================================

  describe('rollbackRouteCutover', () => {
    const routeId = 'get-residents';
    const routeName = 'Get Residents API';
    const operatorId = 'admin-123';

    beforeEach(async () => {
      service.registerRoute(routeId, routeName);
      // Perform initial cutover
      await service.initiateRouteCutover({
        routeId,
        operatorId,
        reason: 'Initial cutover for rollback test',
      });
    });

    /**
     * **Validates: Requirements 8 (AC 4)**
     * Cutover SHALL support instant rollback to legacy authorization.
     */
    it('should successfully rollback a cut over route', async () => {
      const result = await service.rollbackRouteCutover({
        routeId,
        operatorId,
        reason: 'Issue detected, rolling back',
      });

      expect(result.success).toBe(true);
      expect(result.newStatus).toBe(CutoverStatus.ROLLED_BACK);
      expect(result.alertEmitted).toBe(true);
    });

    /**
     * **Validates: Requirements 8 (AC 4)**
     * After rollback, route should use legacy authorization.
     */
    it('should mark route as rolled back after rollback', async () => {
      await service.rollbackRouteCutover({
        routeId,
        operatorId,
        reason: 'Test rollback',
      });

      const status = service.getRouteCutoverStatus(routeId);
      expect(status?.status).toBe(CutoverStatus.ROLLED_BACK);
      expect(status?.rolledBackAt).toBeDefined();
      expect(service.isRouteCutOver(routeId)).toBe(false);
    });

    /**
     * **Validates: Requirements 8 (AC 7)**
     * IF rollback is triggered, System SHALL emit critical alert.
     */
    it('should emit critical alert on rollback', async () => {
      await service.rollbackRouteCutover({
        routeId,
        operatorId,
        reason: 'Critical issue detected',
      });

      expect(mockAlertEmitter.emitCriticalAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'CUTOVER_ROLLBACK',
          routeId,
          reason: 'Critical issue detected',
          operatorId,
        }),
      );
    });

    /**
     * **Validates: Requirements 8 (AC 6)**
     * System SHALL maintain audit log of rollback actions.
     */
    it('should create audit entry for rollback operation', async () => {
      await service.rollbackRouteCutover({
        routeId,
        operatorId,
        reason: 'Test rollback',
      });

      const auditLog = service.getAuditLog({ routeId });
      const rollbackEntry = auditLog.find(
        (e) => e.action === CutoverAuditAction.ROLLBACK_COMPLETED,
      );

      expect(rollbackEntry).toBeDefined();
      expect(rollbackEntry?.routesAffected).toContain(routeId);
      expect(rollbackEntry?.operatorId).toBe(operatorId);
      expect(rollbackEntry?.previousStatus).toBe(CutoverStatus.MEMBERSHIP_AUTHORITATIVE);
      expect(rollbackEntry?.newStatus).toBe(CutoverStatus.ROLLED_BACK);
    });

    it('should fail rollback for route already in legacy state', async () => {
      // First rollback
      await service.rollbackRouteCutover({
        routeId,
        operatorId,
        reason: 'First rollback',
      });

      // Second rollback attempt
      const result = await service.rollbackRouteCutover({
        routeId,
        operatorId,
        reason: 'Second rollback',
      });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('already using legacy');
    });

    it('should fail rollback for unregistered route', async () => {
      const result = await service.rollbackRouteCutover({
        routeId: 'unknown-route',
        operatorId,
        reason: 'Test rollback',
      });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('not registered');
    });

    it('should track emergency flag in audit metadata', async () => {
      await service.rollbackRouteCutover({
        routeId,
        operatorId,
        reason: 'Emergency rollback',
        isEmergency: true,
      });

      const auditLog = service.getAuditLog({ routeId });
      const rollbackEntry = auditLog.find(
        (e) => e.action === CutoverAuditAction.ROLLBACK_COMPLETED,
      );

      expect(rollbackEntry?.metadata).toHaveProperty('isEmergency', true);
    });
  });

  // =========================================================================
  // Audit Logging Tests
  // =========================================================================

  describe('getAuditLog', () => {
    const routeId1 = 'get-residents';
    const routeId2 = 'create-resident';
    const operatorId1 = 'admin-123';
    const operatorId2 = 'admin-456';

    beforeEach(async () => {
      service.registerRoute(routeId1, 'Get Residents');
      service.registerRoute(routeId2, 'Create Resident');

      // Create some audit entries
      await service.initiateRouteCutover({
        routeId: routeId1,
        operatorId: operatorId1,
        reason: 'Cutover 1',
      });

      await service.initiateRouteCutover({
        routeId: routeId2,
        operatorId: operatorId2,
        reason: 'Cutover 2',
      });

      await service.rollbackRouteCutover({
        routeId: routeId1,
        operatorId: operatorId1,
        reason: 'Rollback 1',
      });
    });

    it('should return all audit entries when no filter', () => {
      const auditLog = service.getAuditLog();
      // At least: prerequisite verifications + cutover operations + rollback
      expect(auditLog.length).toBeGreaterThan(3);
    });

    it('should filter by routeId', () => {
      const auditLog = service.getAuditLog({ routeId: routeId1 });
      expect(auditLog.every((e) => e.routesAffected.includes(routeId1))).toBe(true);
    });

    it('should filter by action', () => {
      const auditLog = service.getAuditLog({
        action: CutoverAuditAction.CUTOVER_COMPLETED,
      });
      expect(auditLog.every((e) => e.action === CutoverAuditAction.CUTOVER_COMPLETED)).toBe(
        true,
      );
    });

    it('should filter by operatorId', () => {
      const auditLog = service.getAuditLog({ operatorId: operatorId1 });
      expect(auditLog.every((e) => e.operatorId === operatorId1)).toBe(true);
    });

    it('should filter by success only', () => {
      const auditLog = service.getAuditLog({ successOnly: true });
      expect(auditLog.every((e) => e.success)).toBe(true);
    });

    it('should limit results', () => {
      const auditLog = service.getAuditLog({ limit: 2 });
      expect(auditLog.length).toBeLessThanOrEqual(2);
    });

    it('should return entries sorted by timestamp descending', () => {
      const auditLog = service.getAuditLog();
      for (let i = 1; i < auditLog.length; i++) {
        expect(auditLog[i - 1]!.timestamp.getTime()).toBeGreaterThanOrEqual(
          auditLog[i]!.timestamp.getTime(),
        );
      }
    });
  });

  // =========================================================================
  // Cutover Status Tests
  // =========================================================================

  describe('getCutoverStatus', () => {
    it('should return LEGACY status when no routes registered', () => {
      const status = service.getCutoverStatus();
      expect(status.globalStatus).toBe(CutoverStatus.LEGACY);
      expect(status.routes).toHaveLength(0);
      expect(status.isFullyCutOver).toBe(false);
    });

    it('should track status counts correctly', async () => {
      service.registerRoute('route-1', 'Route 1');
      service.registerRoute('route-2', 'Route 2');
      service.registerRoute('route-3', 'Route 3');

      // Cut over route-1
      await service.initiateRouteCutover({
        routeId: 'route-1',
        operatorId: 'admin',
        reason: 'Test',
      });

      const status = service.getCutoverStatus();
      expect(status.statusCounts[CutoverStatus.LEGACY]).toBe(2);
      expect(status.statusCounts[CutoverStatus.MEMBERSHIP_AUTHORITATIVE]).toBe(1);
      expect(status.isFullyCutOver).toBe(false);
    });

    it('should return isFullyCutOver=true when all routes cut over', async () => {
      service.registerRoute('route-1', 'Route 1');
      service.registerRoute('route-2', 'Route 2');

      await service.initiateRouteCutover({
        routeId: 'route-1',
        operatorId: 'admin',
        reason: 'Test',
      });
      await service.initiateRouteCutover({
        routeId: 'route-2',
        operatorId: 'admin',
        reason: 'Test',
      });

      const status = service.getCutoverStatus();
      expect(status.isFullyCutOver).toBe(true);
      expect(status.globalStatus).toBe(CutoverStatus.MEMBERSHIP_AUTHORITATIVE);
    });

    it('should track hasRolledBackRoutes', async () => {
      service.registerRoute('route-1', 'Route 1');

      await service.initiateRouteCutover({
        routeId: 'route-1',
        operatorId: 'admin',
        reason: 'Test',
      });

      await service.rollbackRouteCutover({
        routeId: 'route-1',
        operatorId: 'admin',
        reason: 'Test rollback',
      });

      const status = service.getCutoverStatus();
      expect(status.hasRolledBackRoutes).toBe(true);
      expect(status.globalStatus).toBe(CutoverStatus.ROLLED_BACK);
    });
  });

  // =========================================================================
  // Route Registration Tests
  // =========================================================================

  describe('registerRoute', () => {
    it('should register a new route', () => {
      service.registerRoute('new-route', 'New Route');

      const routes = service.getRegisteredRoutes();
      expect(routes).toContain('new-route');

      const status = service.getRouteCutoverStatus('new-route');
      expect(status?.status).toBe(CutoverStatus.LEGACY);
    });

    it('should update route name if already registered', () => {
      service.registerRoute('route-1', 'Original Name');
      service.registerRoute('route-1', 'Updated Name');

      const routes = service.getRegisteredRoutes();
      expect(routes.filter((r) => r === 'route-1').length).toBe(1);

      const status = service.getRouteCutoverStatus('route-1');
      expect(status?.routeName).toBe('Updated Name');
    });

    it('should return all registered routes', () => {
      service.registerRoute('route-1', 'Route 1');
      service.registerRoute('route-2', 'Route 2');
      service.registerRoute('route-3', 'Route 3');

      const routes = service.getRegisteredRoutes();
      expect(routes).toHaveLength(3);
      expect(routes).toContain('route-1');
      expect(routes).toContain('route-2');
      expect(routes).toContain('route-3');
    });
  });

  // =========================================================================
  // isRouteCutOver Tests
  // =========================================================================

  describe('isRouteCutOver', () => {
    it('should return false for unregistered route', () => {
      expect(service.isRouteCutOver('unknown-route')).toBe(false);
    });

    it('should return false for registered route in LEGACY state', () => {
      service.registerRoute('route-1', 'Route 1');
      expect(service.isRouteCutOver('route-1')).toBe(false);
    });

    it('should return true for cut over route', async () => {
      service.registerRoute('route-1', 'Route 1');
      await service.initiateRouteCutover({
        routeId: 'route-1',
        operatorId: 'admin',
        reason: 'Test',
      });

      expect(service.isRouteCutOver('route-1')).toBe(true);
    });

    it('should return false for rolled back route', async () => {
      service.registerRoute('route-1', 'Route 1');
      await service.initiateRouteCutover({
        routeId: 'route-1',
        operatorId: 'admin',
        reason: 'Test',
      });
      await service.rollbackRouteCutover({
        routeId: 'route-1',
        operatorId: 'admin',
        reason: 'Test rollback',
      });

      expect(service.isRouteCutOver('route-1')).toBe(false);
    });
  });
});
