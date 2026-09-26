/**
 * RequireEntitlement Middleware Unit Tests
 *
 * Tests the entitlement enforcement middleware:
 * - Feature entitlement checking integration
 * - Subscription status restrictions
 * - Safety-critical operation bypass
 * - Error response mapping
 * - Logging of denials
 *
 * @see Requirements 19 (AC 1-7) — Entitlement Enforcement
 * @see Requirements 20 (AC 1-11) — Safety-Critical Protection
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { ok } from '@core/utils';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { IEntitlementService, EntitlementCheckResult } from '@core/domains/subscription/services';
import { MembershipRole, MembershipStatus } from '@core/domains/membership/types';
import { PlanFeature, SubscriptionStatus } from '@core/domains/subscription/types';

// Mock the container before importing the module under test
vi.mock('@infrastructure/di/container', () => ({
  container: {
    resolve: vi.fn(),
  },
}));

// Mock the error mapping utility
vi.mock('@infrastructure/utils/errorMapping', () => ({
  mapAppErrorToHttpResponse: vi.fn((error, correlationId) => {
    return NextResponse.json(
      {
        code: error.code,
        message: error.userMessage ?? error.message,
        correlationId,
      },
      { status: error.type === 'business' ? 403 : 500 },
    );
  }),
}));

// Mock correlation ID generator
vi.mock('@infrastructure/utils/correlationId', () => ({
  generateCorrelationId: vi.fn(() => 'test-correlation-id'),
}));

// Import the module under test AFTER mocks are set up
import { withEntitlement, requireEntitlement } from '../requireEntitlement';
import { container } from '@infrastructure/di/container';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createMockRequest(options: {
  path?: string;
  method?: string;
  headers?: Record<string, string>;
} = {}): NextRequest {
  const { path = '/api/iot/commands', method = 'POST', headers = {} } = options;
  
  const request = new NextRequest(new URL(`http://localhost${path}`), {
    method,
    headers: new Headers(headers),
  });
  
  return request;
}

function createMockAuthContext(overrides: Partial<AuthorizationContext> = {}): AuthorizationContext {
  return {
    userId: 'user-123',
    tenantId: 'tenant-123',
    membershipId: 'membership-123',
    orgUnitId: 'orgunit-123',
    role: MembershipRole.RT_ADMIN,
    permissions: new Set(['iot:command']),
    tokenVersion: 1,
    isAuthoritative: true,
    isTenantLevel: false,
    membership: {
      id: 'membership-123',
      userId: 'user-123',
      tenantId: 'tenant-123',
      orgUnitId: 'orgunit-123',
      role: MembershipRole.RT_ADMIN,
      status: MembershipStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
      revokedAt: undefined,
    },
    ...overrides,
  };
}

function createMockEntitlementService(): IEntitlementService {
  return {
    checkEntitlement: vi.fn(),
    isFeatureInPlan: vi.fn(),
    getTenantFeatures: vi.fn(),
    isSafetyCritical: vi.fn(),
  };
}

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

function createEntitlementResult(
  overrides: Partial<EntitlementCheckResult> = {},
): EntitlementCheckResult {
  return {
    allowed: true,
    subscriptionStatus: SubscriptionStatus.ACTIVE,
    planName: 'Pro',
    feature: PlanFeature.IOT_INTEGRATION,
    isSafetyCritical: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RequireEntitlement Middleware', () => {
  let mockEntitlementService: IEntitlementService;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    mockEntitlementService = createMockEntitlementService();
    mockLogger = createMockLogger();

    vi.mocked(container.resolve).mockImplementation((key: string) => {
      if (key === 'entitlementService') return mockEntitlementService;
      if (key === 'logger') return mockLogger;
      throw new Error(`Unknown dependency: ${key}`);
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // requireEntitlement Helper Function
  // =========================================================================

  describe('requireEntitlement helper', () => {
    it('should call entitlement service with correct parameters', async () => {
      const authContext = createMockAuthContext();
      const result = createEntitlementResult();

      vi.mocked(mockEntitlementService.checkEntitlement).mockResolvedValue(ok(result));

      await requireEntitlement(authContext, PlanFeature.IOT_INTEGRATION);

      expect(mockEntitlementService.checkEntitlement).toHaveBeenCalledWith({
        tenantId: 'tenant-123',
        requiredFeature: PlanFeature.IOT_INTEGRATION,
        isSafetyCritical: false,
        isBillingFlow: false,
      });
    });

    it('should pass isSafetyCritical flag', async () => {
      const authContext = createMockAuthContext();
      const result = createEntitlementResult({ isSafetyCritical: true });

      vi.mocked(mockEntitlementService.checkEntitlement).mockResolvedValue(ok(result));

      await requireEntitlement(authContext, PlanFeature.PANIC_BUTTON, {
        isSafetyCritical: true,
      });

      expect(mockEntitlementService.checkEntitlement).toHaveBeenCalledWith(
        expect.objectContaining({
          isSafetyCritical: true,
        }),
      );
    });

    it('should pass isBillingFlow flag', async () => {
      const authContext = createMockAuthContext();
      const result = createEntitlementResult();

      vi.mocked(mockEntitlementService.checkEntitlement).mockResolvedValue(ok(result));

      await requireEntitlement(authContext, PlanFeature.FINANCE_BASIC, {
        isBillingFlow: true,
      });

      expect(mockEntitlementService.checkEntitlement).toHaveBeenCalledWith(
        expect.objectContaining({
          isBillingFlow: true,
        }),
      );
    });

    it('should return service unavailable error when container fails', async () => {
      vi.mocked(container.resolve).mockImplementation(() => {
        throw new Error('Service not found');
      });

      const authContext = createMockAuthContext();
      const result = await requireEntitlement(authContext, PlanFeature.IOT_INTEGRATION);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('ENTITLEMENT_SERVICE_UNAVAILABLE');
      }
    });
  });

  // =========================================================================
  // withEntitlement Higher-Order Function
  // =========================================================================

  describe('withEntitlement wrapper', () => {
    it('should allow request when entitlement is granted', async () => {
      const result = createEntitlementResult({ allowed: true });
      vi.mocked(mockEntitlementService.checkEntitlement).mockResolvedValue(ok(result));

      const handler = vi.fn().mockResolvedValue(
        NextResponse.json({ success: true }),
      );
      const wrapped = withEntitlement(
        { requiredFeature: PlanFeature.IOT_INTEGRATION },
        handler,
      );

      const request = createMockRequest();
      const authContext = createMockAuthContext();

      await wrapped(request, authContext);

      expect(handler).toHaveBeenCalledWith(request, authContext, undefined);
    });

    it('should return 403 with ENTITLEMENT_NOT_AVAILABLE when feature not in plan', async () => {
      const result = createEntitlementResult({
        allowed: false,
        errorCode: 'ENTITLEMENT_NOT_AVAILABLE',
        denialReason: "Feature 'iot_integration' is not available in the 'Basic' plan",
        planName: 'Basic',
      });
      vi.mocked(mockEntitlementService.checkEntitlement).mockResolvedValue(ok(result));

      const handler = vi.fn();
      const wrapped = withEntitlement(
        { requiredFeature: PlanFeature.IOT_INTEGRATION },
        handler,
      );

      const request = createMockRequest();
      const authContext = createMockAuthContext();

      const response = await wrapped(request, authContext);
      const body = await response.json();

      expect(handler).not.toHaveBeenCalled();
      expect(response.status).toBe(403);
      expect(body.code).toBe('ENTITLEMENT_NOT_AVAILABLE');
    });

    it('should return 403 with TENANT_SUSPENDED when tenant is suspended', async () => {
      const result = createEntitlementResult({
        allowed: false,
        errorCode: 'TENANT_SUSPENDED',
        denialReason: 'Tenant subscription is suspended',
        subscriptionStatus: SubscriptionStatus.SUSPENDED,
      });
      vi.mocked(mockEntitlementService.checkEntitlement).mockResolvedValue(ok(result));

      const handler = vi.fn();
      const wrapped = withEntitlement(
        { requiredFeature: PlanFeature.IOT_INTEGRATION },
        handler,
      );

      const request = createMockRequest();
      const authContext = createMockAuthContext();

      const response = await wrapped(request, authContext);
      const body = await response.json();

      expect(handler).not.toHaveBeenCalled();
      expect(response.status).toBe(403);
      expect(body.code).toBe('TENANT_SUSPENDED');
    });

    it('should return 403 with TENANT_CLOSED when tenant is closed', async () => {
      const result = createEntitlementResult({
        allowed: false,
        errorCode: 'TENANT_CLOSED',
        denialReason: 'Tenant subscription is closed',
        subscriptionStatus: SubscriptionStatus.CLOSED,
      });
      vi.mocked(mockEntitlementService.checkEntitlement).mockResolvedValue(ok(result));

      const handler = vi.fn();
      const wrapped = withEntitlement(
        { requiredFeature: PlanFeature.IOT_INTEGRATION },
        handler,
      );

      const request = createMockRequest();
      const authContext = createMockAuthContext();

      const response = await wrapped(request, authContext);
      const body = await response.json();

      expect(handler).not.toHaveBeenCalled();
      expect(response.status).toBe(403);
      expect(body.code).toBe('TENANT_CLOSED');
    });

    it('should log denial with required context (Req 19 AC 7)', async () => {
      const result = createEntitlementResult({
        allowed: false,
        errorCode: 'TENANT_SUSPENDED',
        denialReason: 'Tenant subscription is suspended',
        subscriptionStatus: SubscriptionStatus.SUSPENDED,
      });
      vi.mocked(mockEntitlementService.checkEntitlement).mockResolvedValue(ok(result));

      const handler = vi.fn();
      const wrapped = withEntitlement(
        { requiredFeature: PlanFeature.IOT_INTEGRATION },
        handler,
      );

      const request = createMockRequest({ path: '/api/iot/commands' });
      const authContext = createMockAuthContext();

      await wrapped(request, authContext);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Entitlement denied',
        expect.objectContaining({
          tenant_id: 'tenant-123',
          user_id: 'user-123',
          feature: PlanFeature.IOT_INTEGRATION,
          plan: 'Pro',
          status: SubscriptionStatus.SUSPENDED,
          decision: 'DENY',
          error_code: 'TENANT_SUSPENDED',
        }),
      );
    });

    it('should log success when logSuccess option is true', async () => {
      const result = createEntitlementResult({ allowed: true });
      vi.mocked(mockEntitlementService.checkEntitlement).mockResolvedValue(ok(result));

      const handler = vi.fn().mockResolvedValue(
        NextResponse.json({ success: true }),
      );
      const wrapped = withEntitlement(
        { requiredFeature: PlanFeature.IOT_INTEGRATION, logSuccess: true },
        handler,
      );

      const request = createMockRequest();
      const authContext = createMockAuthContext();

      await wrapped(request, authContext);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Entitlement granted',
        expect.objectContaining({
          tenant_id: 'tenant-123',
          feature: PlanFeature.IOT_INTEGRATION,
          decision: 'ALLOW',
        }),
      );
    });

    it('should NOT log success by default', async () => {
      const result = createEntitlementResult({ allowed: true });
      vi.mocked(mockEntitlementService.checkEntitlement).mockResolvedValue(ok(result));

      const handler = vi.fn().mockResolvedValue(
        NextResponse.json({ success: true }),
      );
      const wrapped = withEntitlement(
        { requiredFeature: PlanFeature.IOT_INTEGRATION },
        handler,
      );

      const request = createMockRequest();
      const authContext = createMockAuthContext();

      await wrapped(request, authContext);

      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it('should return 500 on unexpected errors (fail closed)', async () => {
      vi.mocked(mockEntitlementService.checkEntitlement).mockRejectedValue(
        new Error('Unexpected database error'),
      );

      const handler = vi.fn();
      const wrapped = withEntitlement(
        { requiredFeature: PlanFeature.IOT_INTEGRATION },
        handler,
      );

      const request = createMockRequest();
      const authContext = createMockAuthContext();

      const response = await wrapped(request, authContext);
      const body = await response.json();

      expect(handler).not.toHaveBeenCalled();
      expect(response.status).toBe(500);
      expect(body.code).toBe('ENTITLEMENT_CHECK_FAILED');
    });

    it('should use correlation ID from header if present', async () => {
      const result = createEntitlementResult({
        allowed: false,
        errorCode: 'TENANT_SUSPENDED',
      });
      vi.mocked(mockEntitlementService.checkEntitlement).mockResolvedValue(ok(result));

      const handler = vi.fn();
      const wrapped = withEntitlement(
        { requiredFeature: PlanFeature.IOT_INTEGRATION },
        handler,
      );

      const request = createMockRequest({
        headers: { 'x-correlation-id': 'custom-correlation-id' },
      });
      const authContext = createMockAuthContext();

      await wrapped(request, authContext);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Entitlement denied',
        expect.objectContaining({
          correlation_id: 'custom-correlation-id',
        }),
      );
    });
  });

  // =========================================================================
  // Safety-Critical Operations
  // =========================================================================

  describe('Safety-critical operations', () => {
    it('should allow safety-critical feature for suspended tenant', async () => {
      const result = createEntitlementResult({
        allowed: true,
        isSafetyCritical: true,
        subscriptionStatus: SubscriptionStatus.SUSPENDED,
      });
      vi.mocked(mockEntitlementService.checkEntitlement).mockResolvedValue(ok(result));

      const handler = vi.fn().mockResolvedValue(
        NextResponse.json({ success: true }),
      );
      const wrapped = withEntitlement(
        { requiredFeature: PlanFeature.PANIC_BUTTON, isSafetyCritical: true },
        handler,
      );

      const request = createMockRequest();
      const authContext = createMockAuthContext();

      const response = await wrapped(request, authContext);

      expect(handler).toHaveBeenCalled();
      expect(response.status).toBe(200);
    });

    it('should pass isSafetyCritical flag to entitlement service', async () => {
      const result = createEntitlementResult({ allowed: true, isSafetyCritical: true });
      vi.mocked(mockEntitlementService.checkEntitlement).mockResolvedValue(ok(result));

      const handler = vi.fn().mockResolvedValue(
        NextResponse.json({ success: true }),
      );
      const wrapped = withEntitlement(
        { requiredFeature: PlanFeature.EMERGENCY_ALERT, isSafetyCritical: true },
        handler,
      );

      const request = createMockRequest();
      const authContext = createMockAuthContext();

      await wrapped(request, authContext);

      expect(mockEntitlementService.checkEntitlement).toHaveBeenCalledWith(
        expect.objectContaining({
          isSafetyCritical: true,
        }),
      );
    });
  });

  // =========================================================================
  // Billing Flow Operations
  // =========================================================================

  describe('Billing flow operations', () => {
    it('should allow billing flow for suspended tenant', async () => {
      const result = createEntitlementResult({
        allowed: true,
        subscriptionStatus: SubscriptionStatus.SUSPENDED,
      });
      vi.mocked(mockEntitlementService.checkEntitlement).mockResolvedValue(ok(result));

      const handler = vi.fn().mockResolvedValue(
        NextResponse.json({ success: true }),
      );
      const wrapped = withEntitlement(
        { requiredFeature: PlanFeature.FINANCE_BASIC, isBillingFlow: true },
        handler,
      );

      const request = createMockRequest();
      const authContext = createMockAuthContext();

      const response = await wrapped(request, authContext);

      expect(handler).toHaveBeenCalled();
      expect(response.status).toBe(200);
    });

    it('should pass isBillingFlow flag to entitlement service', async () => {
      const result = createEntitlementResult({ allowed: true });
      vi.mocked(mockEntitlementService.checkEntitlement).mockResolvedValue(ok(result));

      const handler = vi.fn().mockResolvedValue(
        NextResponse.json({ success: true }),
      );
      const wrapped = withEntitlement(
        { requiredFeature: PlanFeature.FINANCE_BASIC, isBillingFlow: true },
        handler,
      );

      const request = createMockRequest();
      const authContext = createMockAuthContext();

      await wrapped(request, authContext);

      expect(mockEntitlementService.checkEntitlement).toHaveBeenCalledWith(
        expect.objectContaining({
          isBillingFlow: true,
        }),
      );
    });
  });
});
