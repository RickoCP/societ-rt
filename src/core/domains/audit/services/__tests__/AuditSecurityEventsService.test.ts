/**
 * Unit tests for AuditSecurityEventsService.
 *
 * These tests verify comprehensive security event auditing including:
 * - Authentication event logging (login, logout, failed attempts, token refresh)
 * - Authorization denial logging (permission denied, scope violations)
 * - Privilege escalation detection (role changes, permission grants)
 * - Anomaly detection events (brute force, cross-tenant attempts)
 *
 * @see Task 65: Audit Security Events (Req 30)
 * @see Testing Pattern (04-testing-pattern.md)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  AuditSecurityEventsServiceImpl,
  type IAuditSecurityEventsService,
  SecurityEventCategory,
  SecurityEventSeverity,
  AuthenticationEventType,
  AuthorizationDenialReason,
  PrivilegeEscalationType,
  AnomalyType,
} from '../AuditSecurityEventsService';
import type {
  IAuditTrailRepository,
  AuditEvent,
  CreateAuditEventInput,
  AuditEventPage,
} from '../AuditTrailService';
import { ok, fail } from '@core/utils';
import { technicalError } from '@core/utils';

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
  eventType: 'AUTH_LOGIN_SUCCESS' as AuditEvent['eventType'],
  resourceId: null,
  resourceType: 'SECURITY_EVENT',
  details: {},
  ipAddress: null,
  userAgent: null,
  correlationId: null,
  impersonatorId: null,
  orgUnitId: null,
  success: true,
  errorCode: null,
  ...overrides,
});

/**
 * Create a mock repository.
 */
const createMockRepository = (): IAuditTrailRepository & {
  createCalls: CreateAuditEventInput[];
  findByTenantCalls: Array<{
    tenantId: string;
    filters?: unknown;
    pagination?: unknown;
  }>;
  reset: () => void;
} => {
  const createCalls: CreateAuditEventInput[] = [];
  const findByTenantCalls: Array<{
    tenantId: string;
    filters?: unknown;
    pagination?: unknown;
  }> = [];

  return {
    createCalls,
    findByTenantCalls,
    reset: () => {
      createCalls.length = 0;
      findByTenantCalls.length = 0;
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
    findByTenant: vi.fn(async (tenantId, filters, pagination) => {
      findByTenantCalls.push({ tenantId, filters, pagination });
      return ok<AuditEventPage>({
        events: [],
        total: 0,
        page: 1,
        pageSize: 50,
        hasMore: false,
      });
    }),
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

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('AuditSecurityEventsService', () => {
  let service: IAuditSecurityEventsService;
  let mockRepository: ReturnType<typeof createMockRepository>;

  beforeEach(() => {
    mockRepository = createMockRepository();
    service = AuditSecurityEventsServiceImpl({
      auditTrailRepository: mockRepository,
    });
  });

  afterEach(() => {
    mockRepository.reset();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Authentication Event Logging Tests
  // -------------------------------------------------------------------------

  describe('Authentication Event Logging', () => {
    describe('logAuthenticationEvent', () => {
      it('should log successful login event', async () => {
        const result = await service.logAuthenticationEvent({
          eventType: AuthenticationEventType.LOGIN_SUCCESS,
          userId: 'user-123',
          tenantId: 'tenant-123',
          success: true,
          metadata: {
            ipAddress: '192.168.1.1',
            userAgent: 'Mozilla/5.0',
          },
        });

        expect(result.success).toBe(true);
        expect(mockRepository.createCalls).toHaveLength(1);

        const call = mockRepository.createCalls[0];
        expect(call.userId).toBe('user-123');
        expect(call.tenantId).toBe('tenant-123');
        expect(call.success).toBe(true);
        expect(call.ipAddress).toBe('192.168.1.1');
        expect(call.userAgent).toBe('Mozilla/5.0');
      });

      it('should log failed login event with failure reason', async () => {
        const result = await service.logAuthenticationEvent({
          eventType: AuthenticationEventType.LOGIN_FAILURE,
          userId: 'user-123',
          tenantId: 'tenant-123',
          success: false,
          failureReason: 'Invalid password',
          errorCode: 'AUTH_INVALID_PASSWORD',
        });

        expect(result.success).toBe(true);
        expect(mockRepository.createCalls).toHaveLength(1);

        const call = mockRepository.createCalls[0];
        expect(call.success).toBe(false);
        expect(call.errorCode).toBe('AUTH_INVALID_PASSWORD');
        expect(call.details).toHaveProperty('failureReason', 'Invalid password');
      });

      it('should reject events without tenant ID', async () => {
        const result = await service.logAuthenticationEvent({
          eventType: AuthenticationEventType.LOGIN_SUCCESS,
          userId: 'user-123',
          tenantId: '',
          success: true,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('SECURITY_AUDIT_TENANT_REQUIRED');
        }
      });

      it('should handle null userId for failed login attempts', async () => {
        const result = await service.logAuthenticationEvent({
          eventType: AuthenticationEventType.LOGIN_FAILURE,
          userId: null,
          tenantId: 'tenant-123',
          success: false,
          failureReason: 'User not found',
        });

        expect(result.success).toBe(true);
        expect(mockRepository.createCalls[0].userId).toBeNull();
      });
    });

    describe('logLoginSuccess', () => {
      it('should log successful login with metadata', async () => {
        const result = await service.logLoginSuccess('user-123', 'tenant-123', {
          ipAddress: '10.0.0.1',
          userAgent: 'TestAgent',
          correlationId: 'corr-123',
        });

        expect(result.success).toBe(true);
        expect(mockRepository.createCalls[0].success).toBe(true);
        expect(mockRepository.createCalls[0].correlationId).toBe('corr-123');
      });
    });

    describe('logLoginFailure', () => {
      it('should log failed login with failure reason', async () => {
        const result = await service.logLoginFailure(
          'user-123',
          'tenant-123',
          'Account locked',
          { ipAddress: '192.168.1.100' },
        );

        expect(result.success).toBe(true);
        expect(mockRepository.createCalls[0].success).toBe(false);
        expect(mockRepository.createCalls[0].details).toHaveProperty(
          'failureReason',
          'Account locked',
        );
      });
    });

    describe('logLogout', () => {
      it('should log logout event', async () => {
        const result = await service.logLogout('user-123', 'tenant-123');

        expect(result.success).toBe(true);
        expect(mockRepository.createCalls[0].details).toHaveProperty(
          'authEventType',
          AuthenticationEventType.LOGOUT,
        );
      });
    });

    describe('logTokenRefresh', () => {
      it('should log successful token refresh', async () => {
        const result = await service.logTokenRefresh('user-123', 'tenant-123', true);

        expect(result.success).toBe(true);
        expect(mockRepository.createCalls[0].success).toBe(true);
      });

      it('should log failed token refresh', async () => {
        const result = await service.logTokenRefresh('user-123', 'tenant-123', false);

        expect(result.success).toBe(true);
        expect(mockRepository.createCalls[0].success).toBe(false);
        expect(mockRepository.createCalls[0].errorCode).toBe('AUTH_TOKEN_REFRESH_FAILED');
      });
    });
  });

  // -------------------------------------------------------------------------
  // Authorization Denial Logging Tests
  // -------------------------------------------------------------------------

  describe('Authorization Denial Logging', () => {
    describe('logAuthorizationDenial', () => {
      it('should log permission-based denial', async () => {
        const result = await service.logAuthorizationDenial({
          userId: 'user-123',
          tenantId: 'tenant-123',
          reason: AuthorizationDenialReason.INSUFFICIENT_PERMISSION,
          requiredPermissions: ['resident:write', 'finance:read'],
          userPermissions: ['resident:read'],
        });

        expect(result.success).toBe(true);
        expect(mockRepository.createCalls[0].success).toBe(false);
        expect(mockRepository.createCalls[0].errorCode).toBe('AUTH_INSUFFICIENT_PERMISSION');
        expect(mockRepository.createCalls[0].details).toHaveProperty(
          'denialReason',
          AuthorizationDenialReason.INSUFFICIENT_PERMISSION,
        );
      });

      it('should log scope violation denial', async () => {
        const result = await service.logAuthorizationDenial({
          userId: 'user-123',
          tenantId: 'tenant-123',
          reason: AuthorizationDenialReason.OUT_OF_SCOPE,
          resourceType: 'RESIDENT',
          resourceId: 'resident-456',
          orgUnitId: 'org-789',
        });

        expect(result.success).toBe(true);
        expect(mockRepository.createCalls[0].details).toHaveProperty(
          'denialReason',
          AuthorizationDenialReason.OUT_OF_SCOPE,
        );
      });

      it('should log tenant mismatch as critical severity', async () => {
        const result = await service.logAuthorizationDenial({
          userId: 'user-123',
          tenantId: 'tenant-123',
          reason: AuthorizationDenialReason.TENANT_MISMATCH,
        });

        expect(result.success).toBe(true);
        expect(mockRepository.createCalls[0].details).toHaveProperty(
          'severity',
          SecurityEventSeverity.CRITICAL,
        );
      });

      it('should log quarantined user denial', async () => {
        const result = await service.logAuthorizationDenial({
          userId: 'quarantined-user',
          tenantId: 'tenant-123',
          reason: AuthorizationDenialReason.USER_QUARANTINED,
        });

        expect(result.success).toBe(true);
        expect(mockRepository.createCalls[0].errorCode).toBe('AUTH_USER_QUARANTINED');
      });
    });

    describe('logPermissionDenied', () => {
      it('should log permission denied event', async () => {
        const result = await service.logPermissionDenied(
          'user-123',
          'tenant-123',
          ['admin:delete', 'admin:create'],
        );

        expect(result.success).toBe(true);
        expect(mockRepository.createCalls[0].details).toHaveProperty('requiredPermissions');
      });
    });

    describe('logScopeViolation', () => {
      it('should log scope violation with org unit context', async () => {
        const result = await service.logScopeViolation(
          'user-123',
          'tenant-123',
          'target-org-unit',
          'user-org-unit',
        );

        expect(result.success).toBe(true);
        expect(mockRepository.createCalls[0].details).toHaveProperty(
          'resourceOrgUnitId',
          'target-org-unit',
        );
        expect(mockRepository.createCalls[0].details).toHaveProperty(
          'userOrgUnitId',
          'user-org-unit',
        );
      });
    });
  });

  // -------------------------------------------------------------------------
  // Privilege Escalation Detection Tests
  // -------------------------------------------------------------------------

  describe('Privilege Escalation Detection', () => {
    describe('logPrivilegeEscalation', () => {
      it('should log role upgrade event', async () => {
        const result = await service.logPrivilegeEscalation({
          escalationType: PrivilegeEscalationType.ROLE_UPGRADED,
          actorUserId: 'admin-123',
          targetUserId: 'user-456',
          tenantId: 'tenant-123',
          previousState: { role: 'RESIDENT' },
          newState: { role: 'RT_ADMIN' },
          membershipId: 'membership-789',
        });

        expect(result.success).toBe(true);
        expect(mockRepository.createCalls[0].details).toHaveProperty(
          'escalationType',
          PrivilegeEscalationType.ROLE_UPGRADED,
        );
        expect(mockRepository.createCalls[0].details).toHaveProperty('targetUserId', 'user-456');
      });

      it('should log admin role assignment with high severity', async () => {
        const result = await service.logPrivilegeEscalation({
          escalationType: PrivilegeEscalationType.ADMIN_ROLE_ASSIGNED,
          actorUserId: 'super-admin',
          targetUserId: 'user-123',
          tenantId: 'tenant-123',
          newState: { role: 'TENANT_OWNER' },
        });

        expect(result.success).toBe(true);
        expect(mockRepository.createCalls[0].details).toHaveProperty(
          'severity',
          SecurityEventSeverity.HIGH,
        );
      });

      it('should log impersonation start event', async () => {
        const result = await service.logPrivilegeEscalation({
          escalationType: PrivilegeEscalationType.IMPERSONATION_STARTED,
          actorUserId: 'admin-123',
          targetUserId: 'user-456',
          tenantId: 'tenant-123',
        });

        expect(result.success).toBe(true);
        expect(mockRepository.createCalls[0].details).toHaveProperty(
          'escalationType',
          PrivilegeEscalationType.IMPERSONATION_STARTED,
        );
      });
    });

    describe('logRoleChange', () => {
      it('should detect role upgrade', async () => {
        const result = await service.logRoleChange(
          'admin-123',
          'user-456',
          'tenant-123',
          'RESIDENT',
          'RT_ADMIN',
          'membership-789',
        );

        expect(result.success).toBe(true);
        expect(mockRepository.createCalls[0].details).toHaveProperty(
          'escalationType',
          PrivilegeEscalationType.ROLE_UPGRADED,
        );
      });

      it('should detect role downgrade', async () => {
        const result = await service.logRoleChange(
          'admin-123',
          'user-456',
          'tenant-123',
          'RT_ADMIN',
          'RESIDENT',
          'membership-789',
        );

        expect(result.success).toBe(true);
        expect(mockRepository.createCalls[0].details).toHaveProperty(
          'escalationType',
          PrivilegeEscalationType.ROLE_DOWNGRADED,
        );
      });
    });

    describe('logPermissionGrant', () => {
      it('should log permission grant event', async () => {
        const result = await service.logPermissionGrant(
          'admin-123',
          'user-456',
          'tenant-123',
          ['emergency:create', 'iot:command'],
        );

        expect(result.success).toBe(true);
        expect(mockRepository.createCalls[0].details).toHaveProperty('newState');
      });
    });
  });

  // -------------------------------------------------------------------------
  // Anomaly Detection Tests
  // -------------------------------------------------------------------------

  describe('Anomaly Detection', () => {
    describe('logAnomalyEvent', () => {
      it('should log brute force attempt with critical severity', async () => {
        const result = await service.logAnomalyEvent({
          anomalyType: AnomalyType.BRUTE_FORCE_ATTEMPT,
          userId: 'user-123',
          tenantId: 'tenant-123',
          severity: SecurityEventSeverity.CRITICAL,
          description: 'Multiple failed login attempts detected',
          indicators: { attemptCount: 10, timeWindow: '5 minutes' },
        });

        expect(result.success).toBe(true);
        expect(mockRepository.createCalls[0].details).toHaveProperty(
          'anomalyType',
          AnomalyType.BRUTE_FORCE_ATTEMPT,
        );
        expect(mockRepository.createCalls[0].details).toHaveProperty(
          'severity',
          SecurityEventSeverity.CRITICAL,
        );
      });

      it('should log cross-tenant attempt', async () => {
        const result = await service.logAnomalyEvent({
          anomalyType: AnomalyType.CROSS_TENANT_ATTEMPT,
          userId: 'user-123',
          tenantId: 'tenant-123',
          severity: SecurityEventSeverity.CRITICAL,
          description: 'Cross-tenant access attempt detected',
          indicators: {
            sourceTenant: 'tenant-123',
            targetTenant: 'tenant-456',
          },
        });

        expect(result.success).toBe(true);
        expect(mockRepository.createCalls[0].errorCode).toBe('ANOMALY_CROSS_TENANT_ATTEMPT');
      });

      it('should include recommended action when provided', async () => {
        const result = await service.logAnomalyEvent({
          anomalyType: AnomalyType.UNUSUAL_LOCATION,
          userId: 'user-123',
          tenantId: 'tenant-123',
          severity: SecurityEventSeverity.HIGH,
          description: 'Login from unusual location',
          indicators: { location: 'Unknown Country' },
          recommendedAction: 'Verify user identity',
        });

        expect(result.success).toBe(true);
        expect(mockRepository.createCalls[0].details).toHaveProperty(
          'recommendedAction',
          'Verify user identity',
        );
      });

      it('should record automatic action when taken', async () => {
        const result = await service.logAnomalyEvent({
          anomalyType: AnomalyType.SESSION_HIJACK_ATTEMPT,
          userId: 'user-123',
          tenantId: 'tenant-123',
          severity: SecurityEventSeverity.CRITICAL,
          description: 'Session hijack attempt detected',
          indicators: { ipChanged: true, userAgentChanged: true },
          automaticActionTaken: true,
          automaticAction: 'Session invalidated',
        });

        expect(result.success).toBe(true);
        expect(mockRepository.createCalls[0].details).toHaveProperty('automaticActionTaken', true);
        expect(mockRepository.createCalls[0].details).toHaveProperty(
          'automaticAction',
          'Session invalidated',
        );
      });
    });

    describe('logBruteForceAttempt', () => {
      it('should log brute force attempt with details', async () => {
        const result = await service.logBruteForceAttempt(
          'user-123',
          'tenant-123',
          15,
          5,
          { ipAddress: '192.168.1.1' },
        );

        expect(result.success).toBe(true);
        expect(mockRepository.createCalls[0].details).toHaveProperty(
          'description',
        );
        const description = mockRepository.createCalls[0].details.description as string;
        expect(description).toContain('15 failed logins');
        expect(description).toContain('5 minutes');
      });
    });

    describe('logCrossTenantAttempt', () => {
      it('should log cross-tenant access attempt', async () => {
        const result = await service.logCrossTenantAttempt(
          'user-123',
          'source-tenant',
          'target-tenant',
        );

        expect(result.success).toBe(true);
        expect(mockRepository.createCalls[0].tenantId).toBe('source-tenant');
        expect(mockRepository.createCalls[0].details).toHaveProperty('indicators');
      });
    });

    describe('logSuspiciousActivity', () => {
      it('should log generic suspicious activity', async () => {
        const result = await service.logSuspiciousActivity(
          'user-123',
          'tenant-123',
          'Unusual data access pattern detected',
          SecurityEventSeverity.WARNING,
        );

        expect(result.success).toBe(true);
        expect(mockRepository.createCalls[0].details).toHaveProperty(
          'description',
          'Unusual data access pattern detected',
        );
      });
    });
  });

  // -------------------------------------------------------------------------
  // Brute Force Detection Tests
  // -------------------------------------------------------------------------

  describe('Brute Force Detection', () => {
    describe('detectBruteForce', () => {
      it('should return false when no failed attempts', async () => {
        const result = await service.detectBruteForce(
          'user-123',
          '192.168.1.1',
          15,
          5,
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(false);
        }
      });

      it('should return true after multiple failed login events', async () => {
        // Log multiple failed attempts to trigger brute force detection
        const ipAddress = '192.168.1.100';
        for (let i = 0; i < 6; i++) {
          await service.logLoginFailure('user-123', 'tenant-123', 'Invalid password', {
            ipAddress,
          });
        }

        const result = await service.detectBruteForce('user-123', ipAddress, 60, 5);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(true);
        }
      });

      it('should require IP address', async () => {
        const result = await service.detectBruteForce('user-123', '', 15, 5);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('SECURITY_AUDIT_IP_REQUIRED');
        }
      });
    });
  });

  // -------------------------------------------------------------------------
  // Security Summary Tests
  // -------------------------------------------------------------------------

  describe('Security Summary', () => {
    describe('getSecuritySummary', () => {
      it('should return empty summary for tenant with no events', async () => {
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const result = await service.getSecuritySummary('tenant-123', yesterday, now);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.totalEvents).toBe(0);
          expect(result.data.tenantId).toBe('tenant-123');
        }
      });

      it('should require tenant ID', async () => {
        const result = await service.getSecuritySummary(
          '',
          new Date(),
          new Date(),
        );

        expect(result.success).toBe(false);
      });
    });

    describe('getRecentCriticalEvents', () => {
      it('should return empty array when no critical events', async () => {
        const result = await service.getRecentCriticalEvents('tenant-123', 10);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual([]);
        }
      });

      it('should require tenant ID', async () => {
        const result = await service.getRecentCriticalEvents('', 10);

        expect(result.success).toBe(false);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Sensitive Data Sanitization Tests
  // -------------------------------------------------------------------------

  describe('Sensitive Data Sanitization', () => {
    it('should redact password from details', async () => {
      await service.logAuthenticationEvent({
        eventType: AuthenticationEventType.LOGIN_FAILURE,
        userId: 'user-123',
        tenantId: 'tenant-123',
        success: false,
        details: {
          password: 'secret123',
          username: 'testuser',
        },
      });

      const call = mockRepository.createCalls[0];
      expect(call.details).toHaveProperty('password', '[REDACTED]');
      expect(call.details).toHaveProperty('username', 'testuser');
    });

    it('should redact token from details', async () => {
      await service.logAuthenticationEvent({
        eventType: AuthenticationEventType.TOKEN_REFRESH,
        userId: 'user-123',
        tenantId: 'tenant-123',
        success: true,
        details: {
          refreshToken: 'eyJhbGciOiJIUzI1NiIsInR...',
          tokenId: 'token-123',
        },
      });

      const call = mockRepository.createCalls[0];
      expect(call.details).toHaveProperty('refreshToken', '[REDACTED]');
    });

    it('should redact nested sensitive fields', async () => {
      await service.logAnomalyEvent({
        anomalyType: AnomalyType.SUSPICIOUS_USER_AGENT,
        userId: 'user-123',
        tenantId: 'tenant-123',
        severity: SecurityEventSeverity.WARNING,
        description: 'Suspicious activity',
        indicators: {
          nested: {
            apiKey: 'sk_live_1234567890',
            normalField: 'value',
          },
        },
      });

      const call = mockRepository.createCalls[0];
      const indicators = call.details.indicators as Record<string, unknown>;
      expect((indicators.nested as Record<string, unknown>).apiKey).toBe('[REDACTED]');
      expect((indicators.nested as Record<string, unknown>).normalField).toBe('value');
    });
  });

  // -------------------------------------------------------------------------
  // Error Handling Tests
  // -------------------------------------------------------------------------

  describe('Error Handling', () => {
    it('should propagate repository errors', async () => {
      const errorRepository: IAuditTrailRepository = {
        create: vi.fn(async () =>
          fail(technicalError('REPOSITORY_ERROR', 'Database connection failed')),
        ),
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

      const errorService = AuditSecurityEventsServiceImpl({
        auditTrailRepository: errorRepository,
      });

      const result = await errorService.logLoginSuccess('user-123', 'tenant-123');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('REPOSITORY_ERROR');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Category and Severity Mapping Tests
  // -------------------------------------------------------------------------

  describe('Category and Severity Mapping', () => {
    it('should set authentication category for login events', async () => {
      await service.logLoginSuccess('user-123', 'tenant-123');

      const call = mockRepository.createCalls[0];
      expect(call.details).toHaveProperty('category', SecurityEventCategory.AUTHENTICATION);
    });

    it('should set authorization denial category', async () => {
      await service.logPermissionDenied('user-123', 'tenant-123', ['admin:delete']);

      const call = mockRepository.createCalls[0];
      expect(call.details).toHaveProperty('category', SecurityEventCategory.AUTHORIZATION_DENIAL);
    });

    it('should set privilege escalation category', async () => {
      await service.logRoleChange(
        'admin-123',
        'user-456',
        'tenant-123',
        'RESIDENT',
        'RT_ADMIN',
        'membership-789',
      );

      const call = mockRepository.createCalls[0];
      expect(call.details).toHaveProperty('category', SecurityEventCategory.PRIVILEGE_ESCALATION);
    });

    it('should set anomaly detection category', async () => {
      await service.logSuspiciousActivity(
        'user-123',
        'tenant-123',
        'Test',
        SecurityEventSeverity.WARNING,
      );

      const call = mockRepository.createCalls[0];
      expect(call.details).toHaveProperty('category', SecurityEventCategory.ANOMALY_DETECTION);
    });
  });
});
