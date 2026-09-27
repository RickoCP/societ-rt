/**
 * Unit tests for TenantDataIsolationAuditService.
 *
 * These tests verify tenant data isolation auditing including:
 * - Cross-tenant access attempt detection
 * - Isolation violation alerting
 * - Periodic isolation verification
 * - Audit report generation
 *
 * @see Task 68: Tenant Data Isolation Audit (Req 38)
 * @see Testing Pattern (04-testing-pattern.md)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  TenantDataIsolationAuditServiceImpl,
  type ITenantDataIsolationAuditService,
  type IIsolationAlertEmitter,
  IsolationViolationType,
  IsolationEventSeverity,
  VerificationStatus,
  IsolatedResourceType,
  DEFAULT_ISOLATION_ALERT_CONFIG,
} from '../TenantDataIsolationAuditService';
import type {
  IAuditTrailRepository,
  AuditEvent,
  CreateAuditEventInput,
  AuditEventPage,
} from '../AuditTrailService';
import { ok } from '@core/utils';

// ---------------------------------------------------------------------------
// Test Utilities
// ---------------------------------------------------------------------------

/**
 * Create a test audit event.
 */
const createTestAuditEvent = (
  overrides: Partial<AuditEvent> = {},
): AuditEvent => ({
  id: `event-${Date.now()}`,
  timestamp: new Date(),
  userId: 'user-123',
  tenantId: 'tenant-123',
  eventType: 'SECURITY_CROSS_TENANT_ATTEMPT' as AuditEvent['eventType'],
  resourceId: null,
  resourceType: 'ISOLATION_AUDIT',
  details: {},
  ipAddress: null,
  userAgent: null,
  correlationId: null,
  impersonatorId: null,
  orgUnitId: null,
  success: false,
  errorCode: null,
  ...overrides,
});

/**
 * Create a mock repository.
 */
const createMockRepository = (): IAuditTrailRepository & {
  createCalls: CreateAuditEventInput[];
  reset: () => void;
} => {
  const createCalls: CreateAuditEventInput[] = [];

  return {
    createCalls,
    reset: () => {
      createCalls.length = 0;
    },
    create: vi.fn(async (input: CreateAuditEventInput) => {
      createCalls.push(input);
      return ok(createTestAuditEvent({
        userId: input.userId,
        tenantId: input.tenantId,
        eventType: input.eventType,
        details: input.details,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        correlationId: input.correlationId,
        success: input.success,
        errorCode: input.errorCode,
      }));
    }),
    findByTenant: vi.fn(async () =>
      ok<AuditEventPage>({
        events: [],
        total: 0,
        page: 1,
        pageSize: 50,
        hasMore: false,
      }),
    ),
    findById: vi.fn(async () => ok(null)),
    countByTenant: vi.fn(async () => ok(0)),
    findByUser: vi.fn(async () =>
      ok<AuditEventPage>({
        events: [],
        total: 0,
        page: 1,
        pageSize: 50,
        hasMore: false,
      }),
    ),
    findByResource: vi.fn(async () =>
      ok<AuditEventPage>({
        events: [],
        total: 0,
        page: 1,
        pageSize: 50,
        hasMore: false,
      }),
    ),
  };
};

/**
 * Create a mock alert emitter.
 */
const createMockAlertEmitter = (): IIsolationAlertEmitter & {
  criticalAlerts: Array<{ tenantId: string; violationType: string; description: string }>;
  highAlerts: Array<{ tenantId: string; violationType: string; description: string }>;
  thresholdAlerts: Array<{ userId: string; attemptCount: number }>;
  reset: () => void;
} => {
  const criticalAlerts: Array<{ tenantId: string; violationType: string; description: string }> = [];
  const highAlerts: Array<{ tenantId: string; violationType: string; description: string }> = [];
  const thresholdAlerts: Array<{ userId: string; attemptCount: number }> = [];

  return {
    criticalAlerts,
    highAlerts,
    thresholdAlerts,
    reset: () => {
      criticalAlerts.length = 0;
      highAlerts.length = 0;
      thresholdAlerts.length = 0;
    },
    emitCriticalAlert: vi.fn(async (tenantId, violationType, description) => {
      criticalAlerts.push({ tenantId, violationType, description });
    }),
    emitHighAlert: vi.fn(async (tenantId, violationType, description) => {
      highAlerts.push({ tenantId, violationType, description });
    }),
    emitThresholdAlert: vi.fn(async (userId, attemptCount) => {
      thresholdAlerts.push({ userId, attemptCount });
    }),
  };
};

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('TenantDataIsolationAuditService', () => {
  let service: ITenantDataIsolationAuditService;
  let mockRepository: ReturnType<typeof createMockRepository>;
  let mockAlertEmitter: ReturnType<typeof createMockAlertEmitter>;

  beforeEach(() => {
    mockRepository = createMockRepository();
    mockAlertEmitter = createMockAlertEmitter();
    service = TenantDataIsolationAuditServiceImpl({
      auditTrailRepository: mockRepository,
      alertEmitter: mockAlertEmitter,
      config: DEFAULT_ISOLATION_ALERT_CONFIG,
    });
  });

  afterEach(() => {
    mockRepository.reset();
    mockAlertEmitter.reset();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Cross-Tenant Access Detection Tests
  // -------------------------------------------------------------------------

  describe('Cross-Tenant Access Detection', () => {
    describe('logCrossTenantAttempt', () => {
      it('should log cross-tenant access attempt with full context', async () => {
        const result = await service.logCrossTenantAttempt({
          userId: 'user-123',
          sourceTenantId: 'tenant-A',
          targetTenantId: 'tenant-B',
          resourceType: IsolatedResourceType.HOUSEHOLD,
          resourceId: 'household-456',
          operationType: 'READ',
          violationType: IsolationViolationType.CROSS_TENANT_ACCESS,
          metadata: {
            ipAddress: '192.168.1.1',
            userAgent: 'Mozilla/5.0',
            correlationId: 'corr-123',
          },
        });

        expect(result.success).toBe(true);
        expect(mockRepository.createCalls).toHaveLength(1);

        const call = mockRepository.createCalls[0]!;
        expect(call.userId).toBe('user-123');
        expect(call.tenantId).toBe('tenant-A');
        expect(call.success).toBe(false);
        expect(call.details).toHaveProperty('sourceTenantId', 'tenant-A');
        expect(call.details).toHaveProperty('targetTenantId', 'tenant-B');
        expect(call.details).toHaveProperty('resourceType', IsolatedResourceType.HOUSEHOLD);
        expect(call.details).toHaveProperty('operationType', 'READ');
        expect(call.ipAddress).toBe('192.168.1.1');
        expect(call.correlationId).toBe('corr-123');
      });

      it('should emit high alert for cross-tenant access attempt', async () => {
        await service.logCrossTenantAttempt({
          userId: 'user-123',
          sourceTenantId: 'tenant-A',
          targetTenantId: 'tenant-B',
          resourceType: IsolatedResourceType.RESIDENT,
          operationType: 'READ',
          violationType: IsolationViolationType.CROSS_TENANT_ACCESS,
        });

        expect(mockAlertEmitter.highAlerts).toHaveLength(1);
        expect(mockAlertEmitter.highAlerts[0]!.tenantId).toBe('tenant-A');
        expect(mockAlertEmitter.highAlerts[0]!.violationType).toBe(IsolationViolationType.CROSS_TENANT_ACCESS);
      });

      it('should emit critical alert for cross-tenant mutation attempt', async () => {
        await service.logCrossTenantAttempt({
          userId: 'user-123',
          sourceTenantId: 'tenant-A',
          targetTenantId: 'tenant-B',
          resourceType: IsolatedResourceType.FINANCIAL_TRANSACTION,
          operationType: 'WRITE',
          violationType: IsolationViolationType.CROSS_TENANT_MUTATION,
        });

        expect(mockAlertEmitter.criticalAlerts).toHaveLength(1);
        expect(mockAlertEmitter.criticalAlerts[0]!.violationType).toBe(IsolationViolationType.CROSS_TENANT_MUTATION);
      });

      it('should reject empty source tenant ID', async () => {
        const result = await service.logCrossTenantAttempt({
          userId: 'user-123',
          sourceTenantId: '',
          targetTenantId: 'tenant-B',
          resourceType: IsolatedResourceType.HOUSEHOLD,
          operationType: 'READ',
          violationType: IsolationViolationType.CROSS_TENANT_ACCESS,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('ISOLATION_AUDIT_TENANT_REQUIRED');
        }
      });

      it('should sanitize sensitive data in details', async () => {
        await service.logCrossTenantAttempt({
          userId: 'user-123',
          sourceTenantId: 'tenant-A',
          targetTenantId: 'tenant-B',
          resourceType: IsolatedResourceType.MEMBERSHIP,
          operationType: 'READ',
          violationType: IsolationViolationType.CROSS_TENANT_ACCESS,
          details: {
            accessToken: 'secret-token-123',
            normalField: 'visible-value',
            password: 'super-secret',
          },
        });

        const call = mockRepository.createCalls[0]!;
        expect(call.details).toHaveProperty('accessToken', '[REDACTED]');
        expect(call.details).toHaveProperty('normalField', 'visible-value');
        expect(call.details).toHaveProperty('password', '[REDACTED]');
      });
    });

    describe('detectCrossTenantPattern', () => {
      it('should detect pattern when threshold is exceeded', async () => {
        // Log multiple cross-tenant attempts
        for (let i = 0; i < 6; i++) {
          await service.logCrossTenantAttempt({
            userId: 'user-pattern-test',
            sourceTenantId: 'tenant-A',
            targetTenantId: `tenant-${i}`,
            resourceType: IsolatedResourceType.HOUSEHOLD,
            operationType: 'READ',
            violationType: IsolationViolationType.CROSS_TENANT_ACCESS,
          });
        }

        const result = await service.detectCrossTenantPattern('user-pattern-test', 10, 5);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(true);
        }
      });

      it('should not detect pattern when below threshold', async () => {
        // Log only 2 attempts
        for (let i = 0; i < 2; i++) {
          await service.logCrossTenantAttempt({
            userId: 'user-low-attempts',
            sourceTenantId: 'tenant-A',
            targetTenantId: `tenant-${i}`,
            resourceType: IsolatedResourceType.HOUSEHOLD,
            operationType: 'READ',
            violationType: IsolationViolationType.CROSS_TENANT_ACCESS,
          });
        }

        const result = await service.detectCrossTenantPattern('user-low-attempts', 10, 5);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(false);
        }
      });

      it('should reject empty user ID', async () => {
        const result = await service.detectCrossTenantPattern('', 10, 5);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('ISOLATION_AUDIT_USER_REQUIRED');
        }
      });
    });
  });

  // -------------------------------------------------------------------------
  // Isolation Violation Alerting Tests
  // -------------------------------------------------------------------------

  describe('Isolation Violation Alerting', () => {
    describe('logIsolationViolation', () => {
      it('should log isolation violation with full context', async () => {
        const result = await service.logIsolationViolation({
          userId: 'user-123',
          tenantId: 'tenant-123',
          violationType: IsolationViolationType.RESOURCE_TENANT_MISMATCH,
          severity: IsolationEventSeverity.HIGH,
          description: 'Resource tenant does not match request context',
          resourceType: IsolatedResourceType.ANNOUNCEMENT,
          resourceId: 'ann-456',
          indicators: {
            expectedTenantId: 'tenant-123',
            actualTenantId: 'tenant-456',
          },
        });

        expect(result.success).toBe(true);
        expect(mockRepository.createCalls).toHaveLength(1);

        const call = mockRepository.createCalls[0]!;
        expect(call.details).toHaveProperty('description');
        expect(call.details).toHaveProperty('indicators');
      });

      it('should emit alert based on severity', async () => {
        await service.logIsolationViolation({
          userId: 'user-123',
          tenantId: 'tenant-123',
          violationType: IsolationViolationType.RLS_BYPASS_ATTEMPT,
          severity: IsolationEventSeverity.CRITICAL,
          description: 'RLS bypass attempted',
        });

        expect(mockAlertEmitter.criticalAlerts).toHaveLength(1);
      });

      it('should handle automatic actions', async () => {
        const result = await service.logIsolationViolation({
          userId: 'user-123',
          tenantId: 'tenant-123',
          violationType: IsolationViolationType.SESSION_TENANT_MISMATCH,
          severity: IsolationEventSeverity.WARNING,
          description: 'Session tenant mismatch detected',
          automaticActionTaken: true,
          automaticAction: 'Session terminated',
        });

        expect(result.success).toBe(true);
        const call = mockRepository.createCalls[0]!;
        expect(call.details).toHaveProperty('automaticActionTaken', true);
        expect(call.details).toHaveProperty('automaticAction', 'Session terminated');
      });
    });

    describe('logRlsBypassAttempt', () => {
      it('should log RLS bypass attempt with critical severity', async () => {
        const result = await service.logRlsBypassAttempt(
          'user-123',
          'tenant-123',
          'users',
          'SET LOCAL bypass flag',
          { ipAddress: '10.0.0.1' },
        );

        expect(result.success).toBe(true);
        expect(mockAlertEmitter.criticalAlerts).toHaveLength(1);

        const call = mockRepository.createCalls[0]!;
        expect(call.details).toHaveProperty('description');
        expect((call.details as Record<string, unknown>).description).toContain('users');
        expect(call.errorCode).toBe(IsolationViolationType.RLS_BYPASS_ATTEMPT);
      });
    });

    describe('logMissingTenantContext', () => {
      it('should log missing tenant context with warning severity', async () => {
        const result = await service.logMissingTenantContext(
          'user-123',
          'CREATE_HOUSEHOLD',
          { requestPath: '/api/households' },
        );

        expect(result.success).toBe(true);

        const call = mockRepository.createCalls[0]!;
        expect(call.tenantId).toBe('SYSTEM');
        expect(call.errorCode).toBe(IsolationViolationType.MISSING_TENANT_CONTEXT);
      });

      it('should handle null user ID for system events', async () => {
        const result = await service.logMissingTenantContext(
          null,
          'SCHEDULED_JOB',
        );

        expect(result.success).toBe(true);
        expect(mockRepository.createCalls[0]!.userId).toBeNull();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Periodic Isolation Verification Tests
  // -------------------------------------------------------------------------

  describe('Periodic Isolation Verification', () => {
    describe('runIsolationVerification', () => {
      it('should run tenant-specific verification', async () => {
        const result = await service.runIsolationVerification('tenant-123', 'corr-123');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toHaveProperty('verificationId');
          expect(result.data.tenantId).toBe('tenant-123');
          expect(result.data.checks.length).toBeGreaterThan(0);
          expect(result.data.overallStatus).toBe(VerificationStatus.PASSED);
        }
      });

      it('should run platform-wide verification when tenant is null', async () => {
        const result = await service.runIsolationVerification(null);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.tenantId).toBeNull();
        }
      });

      it('should calculate check statistics correctly', async () => {
        const result = await service.runIsolationVerification('tenant-123');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.totalChecks).toBe(result.data.checks.length);
          expect(result.data.checksPassed).toBeLessThanOrEqual(result.data.totalChecks);
        }
      });

      it('should include duration metrics', async () => {
        const result = await service.runIsolationVerification('tenant-123');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.durationMs).toBeGreaterThanOrEqual(0);
          expect(result.data.startedAt).toBeInstanceOf(Date);
          expect(result.data.completedAt).toBeInstanceOf(Date);
        }
      });
    });

    describe('verifyRlsPolicies', () => {
      it('should verify RLS policies for a tenant', async () => {
        const result = await service.verifyRlsPolicies('tenant-123');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.checkName).toBe('RLS Policy Verification');
          expect(result.data.status).toBe(VerificationStatus.PASSED);
        }
      });

      it('should reject empty tenant ID', async () => {
        const result = await service.verifyRlsPolicies('');

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('ISOLATION_AUDIT_TENANT_REQUIRED');
        }
      });
    });

    describe('verifyDataIsolation', () => {
      it('should verify data isolation for a tenant', async () => {
        const result = await service.verifyDataIsolation('tenant-123');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.checkName).toBe('Data Isolation Verification');
          expect(result.data.status).toBe(VerificationStatus.PASSED);
        }
      });
    });
  });

  // -------------------------------------------------------------------------
  // Audit Report Generation Tests
  // -------------------------------------------------------------------------

  describe('Audit Report Generation', () => {
    describe('generateAuditReport', () => {
      it('should generate report with basic statistics', async () => {
        const result = await service.generateAuditReport({
          tenantId: 'tenant-123',
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-31'),
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toHaveProperty('reportId');
          expect(result.data.tenantId).toBe('tenant-123');
          expect(result.data.periodStart).toEqual(new Date('2024-01-01'));
          expect(result.data.periodEnd).toEqual(new Date('2024-01-31'));
        }
      });

      it('should include compliance score and status', async () => {
        const result = await service.generateAuditReport({
          tenantId: 'tenant-123',
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-31'),
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.complianceScore).toBeGreaterThanOrEqual(0);
          expect(result.data.complianceScore).toBeLessThanOrEqual(100);
          expect(['COMPLIANT', 'NON_COMPLIANT', 'NEEDS_REVIEW']).toContain(result.data.complianceStatus);
        }
      });

      it('should include recommendations', async () => {
        const result = await service.generateAuditReport({
          tenantId: 'tenant-123',
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-31'),
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.recommendations).toBeInstanceOf(Array);
          expect(result.data.recommendations.length).toBeGreaterThan(0);
        }
      });

      it('should include verification results when requested', async () => {
        const result = await service.generateAuditReport({
          tenantId: 'tenant-123',
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-31'),
          includeVerifications: true,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toHaveProperty('verificationsRun');
          expect(result.data).toHaveProperty('verificationsPassed');
          expect(result.data).toHaveProperty('verificationsFailed');
        }
      });

      it('should include violation details when requested', async () => {
        const result = await service.generateAuditReport({
          tenantId: 'tenant-123',
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-31'),
          includeViolationDetails: true,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toHaveProperty('recentViolations');
          expect(result.data).toHaveProperty('topOffenders');
        }
      });

      it('should generate platform-wide report when tenant is null', async () => {
        const result = await service.generateAuditReport({
          tenantId: null,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-31'),
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.tenantId).toBeNull();
        }
      });

      it('should include breakdown by violation type', async () => {
        const result = await service.generateAuditReport({
          tenantId: 'tenant-123',
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-31'),
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.byViolationType).toBeDefined();
          // All violation types should be present as keys
          Object.values(IsolationViolationType).forEach(type => {
            expect(result.data.byViolationType).toHaveProperty(type);
          });
        }
      });
    });

    describe('getRecentViolations', () => {
      it('should return recent violations for a tenant', async () => {
        const result = await service.getRecentViolations('tenant-123', 10);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(Array.isArray(result.data)).toBe(true);
        }
      });

      it('should return platform-wide violations when tenant is null', async () => {
        const result = await service.getRecentViolations(null, 10);

        expect(result.success).toBe(true);
      });
    });

    describe('getComplianceScore', () => {
      it('should return compliance score for a tenant', async () => {
        const result = await service.getComplianceScore('tenant-123', 30);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBeGreaterThanOrEqual(0);
          expect(result.data).toBeLessThanOrEqual(100);
        }
      });

      it('should reject empty tenant ID', async () => {
        const result = await service.getComplianceScore('', 30);

        expect(result.success).toBe(false);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Configuration Tests
  // -------------------------------------------------------------------------

  describe('Configuration', () => {
    describe('getAlertConfig', () => {
      it('should return current alert configuration', () => {
        const config = service.getAlertConfig();

        expect(config).toHaveProperty('alertOnCritical');
        expect(config).toHaveProperty('alertOnHigh');
        expect(config).toHaveProperty('crossTenantAttemptThreshold');
        expect(config).toHaveProperty('thresholdWindowMinutes');
      });
    });

    describe('updateAlertConfig', () => {
      it('should update alert configuration', () => {
        service.updateAlertConfig({
          alertOnHigh: false,
          crossTenantAttemptThreshold: 10,
        });

        const config = service.getAlertConfig();

        expect(config.alertOnHigh).toBe(false);
        expect(config.crossTenantAttemptThreshold).toBe(10);
        // Other values should remain default
        expect(config.alertOnCritical).toBe(true);
      });

      it('should respect updated alert settings', async () => {
        // Disable high alerts
        service.updateAlertConfig({ alertOnHigh: false });

        await service.logCrossTenantAttempt({
          userId: 'user-123',
          sourceTenantId: 'tenant-A',
          targetTenantId: 'tenant-B',
          resourceType: IsolatedResourceType.HOUSEHOLD,
          operationType: 'READ',
          violationType: IsolationViolationType.CROSS_TENANT_ACCESS,
        });

        // High alert should not be emitted
        expect(mockAlertEmitter.highAlerts).toHaveLength(0);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Threshold Alert Tests
  // -------------------------------------------------------------------------

  describe('Threshold Alerts', () => {
    it('should emit threshold alert when pattern detected', async () => {
      // Use custom threshold config
      const customService = TenantDataIsolationAuditServiceImpl({
        auditTrailRepository: mockRepository,
        alertEmitter: mockAlertEmitter,
        config: {
          ...DEFAULT_ISOLATION_ALERT_CONFIG,
          crossTenantAttemptThreshold: 3,
          thresholdWindowMinutes: 60,
        },
      });

      // Log 4 attempts to exceed threshold of 3
      for (let i = 0; i < 4; i++) {
        await customService.logCrossTenantAttempt({
          userId: 'user-threshold-test',
          sourceTenantId: 'tenant-A',
          targetTenantId: `tenant-${i}`,
          resourceType: IsolatedResourceType.HOUSEHOLD,
          operationType: 'READ',
          violationType: IsolationViolationType.CROSS_TENANT_ACCESS,
        });
      }

      // Threshold alert should have been emitted
      expect(mockAlertEmitter.thresholdAlerts.length).toBeGreaterThan(0);
      expect(mockAlertEmitter.thresholdAlerts[0]!.userId).toBe('user-threshold-test');
    });
  });

  // -------------------------------------------------------------------------
  // Severity Mapping Tests
  // -------------------------------------------------------------------------

  describe('Severity Mapping', () => {
    it('should assign CRITICAL severity to RLS bypass attempts', async () => {
      await service.logCrossTenantAttempt({
        userId: 'user-123',
        sourceTenantId: 'tenant-A',
        targetTenantId: 'tenant-B',
        resourceType: IsolatedResourceType.USER,
        operationType: 'WRITE',
        violationType: IsolationViolationType.RLS_BYPASS_ATTEMPT,
      });

      expect(mockAlertEmitter.criticalAlerts).toHaveLength(1);
    });

    it('should assign HIGH severity to cross-tenant access', async () => {
      await service.logCrossTenantAttempt({
        userId: 'user-123',
        sourceTenantId: 'tenant-A',
        targetTenantId: 'tenant-B',
        resourceType: IsolatedResourceType.HOUSEHOLD,
        operationType: 'READ',
        violationType: IsolationViolationType.CROSS_TENANT_ACCESS,
      });

      expect(mockAlertEmitter.highAlerts).toHaveLength(1);
    });

    it('should assign WARNING severity to missing tenant context', async () => {
      await service.logIsolationViolation({
        userId: 'user-123',
        tenantId: 'SYSTEM',
        violationType: IsolationViolationType.MISSING_TENANT_CONTEXT,
        severity: IsolationEventSeverity.WARNING,
        description: 'Missing tenant context',
      });

      // Warning severity should not trigger high or critical alerts
      expect(mockAlertEmitter.highAlerts).toHaveLength(0);
      expect(mockAlertEmitter.criticalAlerts).toHaveLength(0);
    });
  });
});
