/**
 * Unit tests for CrossTenantPreventionService.
 *
 * These tests verify cross-tenant access prevention validation including:
 * - Resource ownership validation
 * - User membership validation
 * - Request context validation
 * - Batch operation validation
 * - Query/mutation tenant validation
 *
 * @see Task 72: Cross-Tenant Prevention Validation (Req 59)
 * @see Testing Pattern (04-testing-pattern.md)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  CrossTenantPreventionServiceImpl,
  type ICrossTenantPreventionService,
  type ICrossTenantPreventionAuditEmitter,
  type IUserMembershipChecker,
  type TenantContext,
  type ResourceInfo,
  type PreventionViolationEvent,
  type InvalidResourceInfo,
  CrossTenantCheckType,
  OperationType,
  ResourceType,
  PreventionCheckStatus,
  PreventionEventSeverity,
} from '../CrossTenantPreventionService';

// ---------------------------------------------------------------------------
// Test Utilities
// ---------------------------------------------------------------------------

/**
 * Create a test tenant context.
 */
const createTestContext = (
  overrides: Partial<TenantContext> = {},
): TenantContext => ({
  userId: 'user-123',
  activeTenantId: 'tenant-A',
  correlationId: 'corr-123',
  ipAddress: '192.168.1.1',
  ...overrides,
});

/**
 * Create a test resource info.
 */
const createTestResource = (
  overrides: Partial<ResourceInfo> = {},
): ResourceInfo => ({
  resourceId: 'resource-456',
  resourceType: ResourceType.HOUSEHOLD,
  resourceTenantId: 'tenant-A',
  ...overrides,
});

/**
 * Create a mock audit emitter.
 */
const createMockAuditEmitter = (): ICrossTenantPreventionAuditEmitter & {
  violationEvents: PreventionViolationEvent[];
  batchViolationEvents: Array<{ context: TenantContext; invalidResources: readonly InvalidResourceInfo[]; operation: OperationType }>;
  criticalEvents: PreventionViolationEvent[];
  reset: () => void;
} => {
  const violationEvents: PreventionViolationEvent[] = [];
  const batchViolationEvents: Array<{ context: TenantContext; invalidResources: readonly InvalidResourceInfo[]; operation: OperationType }> = [];
  const criticalEvents: PreventionViolationEvent[] = [];

  return {
    violationEvents,
    batchViolationEvents,
    criticalEvents,
    reset: () => {
      violationEvents.length = 0;
      batchViolationEvents.length = 0;
      criticalEvents.length = 0;
    },
    emitViolationEvent: vi.fn(async (event) => {
      violationEvents.push(event);
    }),
    emitBatchViolationEvent: vi.fn(async (context, invalidResources, operation) => {
      batchViolationEvents.push({ context, invalidResources, operation });
    }),
    emitCriticalEvent: vi.fn(async (event) => {
      criticalEvents.push(event);
    }),
  };
};

/**
 * Create a mock membership checker.
 */
const createMockMembershipChecker = (
  defaultResult = true,
): IUserMembershipChecker & {
  setResult: (result: boolean) => void;
  calls: Array<{ userId: string; tenantId: string; requireActive?: boolean }>;
  reset: () => void;
} => {
  let result = defaultResult;
  const calls: Array<{ userId: string; tenantId: string; requireActive?: boolean }> = [];

  return {
    calls,
    setResult: (newResult: boolean) => {
      result = newResult;
    },
    reset: () => {
      calls.length = 0;
      result = defaultResult;
    },
    hasActiveMembership: vi.fn(async (userId, tenantId, requireActive) => {
      calls.push({ userId, tenantId, requireActive });
      return result;
    }),
  };
};

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('CrossTenantPreventionService', () => {
  let service: ICrossTenantPreventionService;
  let mockAuditEmitter: ReturnType<typeof createMockAuditEmitter>;
  let mockMembershipChecker: ReturnType<typeof createMockMembershipChecker>;

  beforeEach(() => {
    mockAuditEmitter = createMockAuditEmitter();
    mockMembershipChecker = createMockMembershipChecker();
    service = CrossTenantPreventionServiceImpl({
      auditEmitter: mockAuditEmitter,
      membershipChecker: mockMembershipChecker,
    });
  });

  afterEach(() => {
    mockAuditEmitter.reset();
    mockMembershipChecker.reset();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Resource Ownership Validation Tests
  // -------------------------------------------------------------------------

  describe('Resource Ownership Validation', () => {
    describe('validateResourceAccess', () => {
      it('should allow access when resource belongs to active tenant', async () => {
        const context = createTestContext({ activeTenantId: 'tenant-A' });
        const resource = createTestResource({ resourceTenantId: 'tenant-A' });

        const result = await service.validateResourceAccess({
          context,
          resource,
          operation: OperationType.READ,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(PreventionCheckStatus.ALLOWED);
          expect(result.data.allowed).toBe(true);
          expect(result.data.checkType).toBe(CrossTenantCheckType.RESOURCE_OWNERSHIP);
        }
      });

      it('should block access when resource belongs to different tenant', async () => {
        const context = createTestContext({ activeTenantId: 'tenant-A' });
        const resource = createTestResource({ resourceTenantId: 'tenant-B' });

        const result = await service.validateResourceAccess({
          context,
          resource,
          operation: OperationType.READ,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(PreventionCheckStatus.TENANT_MISMATCH);
          expect(result.data.allowed).toBe(false);
          expect(result.data.reason).toContain('tenant-A');
          expect(result.data.reason).toContain('tenant-B');
        }
      });

      it('should emit audit event when cross-tenant access is blocked', async () => {
        const context = createTestContext({ activeTenantId: 'tenant-A' });
        const resource = createTestResource({ resourceTenantId: 'tenant-B' });

        await service.validateResourceAccess({
          context,
          resource,
          operation: OperationType.READ,
        });

        expect(mockAuditEmitter.violationEvents).toHaveLength(1);
        expect(mockAuditEmitter.violationEvents[0]!.activeTenantId).toBe('tenant-A');
        expect(mockAuditEmitter.violationEvents[0]!.checkType).toBe(CrossTenantCheckType.RESOURCE_OWNERSHIP);
      });

      it('should emit critical event for mutation attempts across tenants', async () => {
        const context = createTestContext({ activeTenantId: 'tenant-A' });
        const resource = createTestResource({ resourceTenantId: 'tenant-B' });

        await service.validateResourceAccess({
          context,
          resource,
          operation: OperationType.DELETE,
        });

        expect(mockAuditEmitter.criticalEvents).toHaveLength(1);
        expect(mockAuditEmitter.criticalEvents[0]!.severity).toBe(PreventionEventSeverity.CRITICAL);
      });

      it('should block access when active tenant ID is missing', async () => {
        const context = createTestContext({ activeTenantId: '' });
        const resource = createTestResource();

        const result = await service.validateResourceAccess({
          context,
          resource,
          operation: OperationType.READ,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(PreventionCheckStatus.MISSING_CONTEXT);
          expect(result.data.allowed).toBe(false);
        }
      });

      it('should fail when resource tenant ID is empty', async () => {
        const context = createTestContext();
        const resource = createTestResource({ resourceTenantId: '' });

        const result = await service.validateResourceAccess({
          context,
          resource,
          operation: OperationType.READ,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('CROSS_TENANT_PREVENTION_RESOURCE_TENANT_REQUIRED');
        }
      });

      it('should include resource details in blocked result', async () => {
        const context = createTestContext({ activeTenantId: 'tenant-A' });
        const resource = createTestResource({
          resourceId: 'household-789',
          resourceType: ResourceType.HOUSEHOLD,
          resourceTenantId: 'tenant-B',
        });

        const result = await service.validateResourceAccess({
          context,
          resource,
          operation: OperationType.UPDATE,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.details).toHaveProperty('resourceId', 'household-789');
          expect(result.data.details).toHaveProperty('resourceType', ResourceType.HOUSEHOLD);
        }
      });
    });

    describe('validateResourceOwnership', () => {
      it('should return true when tenant IDs match', () => {
        const result = service.validateResourceOwnership(
          'tenant-A',
          'tenant-A',
          OperationType.READ,
          ResourceType.RESIDENT,
          'res-123',
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(true);
        }
      });

      it('should fail when tenant IDs do not match', () => {
        const result = service.validateResourceOwnership(
          'tenant-A',
          'tenant-B',
          OperationType.READ,
          ResourceType.RESIDENT,
          'res-123',
        );

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('CROSS_TENANT_ACCESS_BLOCKED');
          expect(result.error.message).toContain('tenant-A');
          expect(result.error.message).toContain('tenant-B');
        }
      });

      it('should fail when resource tenant ID is empty', () => {
        const result = service.validateResourceOwnership(
          '',
          'tenant-A',
          OperationType.READ,
          ResourceType.RESIDENT,
        );

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('CROSS_TENANT_PREVENTION_RESOURCE_TENANT_REQUIRED');
        }
      });

      it('should fail when request tenant ID is empty', () => {
        const result = service.validateResourceOwnership(
          'tenant-A',
          '',
          OperationType.READ,
          ResourceType.RESIDENT,
        );

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('CROSS_TENANT_PREVENTION_CONTEXT_REQUIRED');
        }
      });
    });
  });

  // -------------------------------------------------------------------------
  // User Membership Validation Tests
  // -------------------------------------------------------------------------

  describe('User Membership Validation', () => {
    describe('validateUserMembership', () => {
      it('should allow access when user has active membership', async () => {
        mockMembershipChecker.setResult(true);

        const result = await service.validateUserMembership({
          userId: 'user-123',
          tenantId: 'tenant-A',
          requireActive: true,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(PreventionCheckStatus.ALLOWED);
          expect(result.data.allowed).toBe(true);
        }
        expect(mockMembershipChecker.calls).toHaveLength(1);
        expect(mockMembershipChecker.calls[0]).toEqual({
          userId: 'user-123',
          tenantId: 'tenant-A',
          requireActive: true,
        });
      });

      it('should block access when user lacks membership', async () => {
        mockMembershipChecker.setResult(false);

        const result = await service.validateUserMembership({
          userId: 'user-123',
          tenantId: 'tenant-A',
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(PreventionCheckStatus.NOT_MEMBER);
          expect(result.data.allowed).toBe(false);
        }
      });

      it('should emit audit event when membership check fails', async () => {
        mockMembershipChecker.setResult(false);

        await service.validateUserMembership({
          userId: 'user-123',
          tenantId: 'tenant-A',
          correlationId: 'corr-456',
        });

        expect(mockAuditEmitter.violationEvents).toHaveLength(1);
        expect(mockAuditEmitter.violationEvents[0]!.userId).toBe('user-123');
        expect(mockAuditEmitter.violationEvents[0]!.checkType).toBe(CrossTenantCheckType.USER_MEMBERSHIP);
      });

      it('should fail when user ID is empty', async () => {
        const result = await service.validateUserMembership({
          userId: '',
          tenantId: 'tenant-A',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('CROSS_TENANT_PREVENTION_USER_REQUIRED');
        }
      });

      it('should fail when tenant ID is empty', async () => {
        const result = await service.validateUserMembership({
          userId: 'user-123',
          tenantId: '',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('CROSS_TENANT_PREVENTION_TENANT_REQUIRED');
        }
      });

      it('should pass requireActive flag to membership checker', async () => {
        await service.validateUserMembership({
          userId: 'user-123',
          tenantId: 'tenant-A',
          requireActive: false,
        });

        expect(mockMembershipChecker.calls[0]!.requireActive).toBe(false);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Request Context Validation Tests
  // -------------------------------------------------------------------------

  describe('Request Context Validation', () => {
    describe('validateRequestContext', () => {
      it('should allow when all tenant IDs match', async () => {
        const result = await service.validateRequestContext({
          userId: 'user-123',
          requestTenantId: 'tenant-A',
          jwtTenantId: 'tenant-A',
          resourceTenantId: 'tenant-A',
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(PreventionCheckStatus.ALLOWED);
          expect(result.data.allowed).toBe(true);
        }
      });

      it('should allow when only one tenant ID is provided', async () => {
        const result = await service.validateRequestContext({
          userId: 'user-123',
          requestTenantId: 'tenant-A',
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(PreventionCheckStatus.ALLOWED);
        }
      });

      it('should block when request and JWT tenant IDs mismatch', async () => {
        const result = await service.validateRequestContext({
          userId: 'user-123',
          requestTenantId: 'tenant-A',
          jwtTenantId: 'tenant-B',
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(PreventionCheckStatus.TENANT_MISMATCH);
          expect(result.data.allowed).toBe(false);
          expect(result.data.reason).toContain('request');
          expect(result.data.reason).toContain('jwt');
        }
      });

      it('should block when JWT and resource tenant IDs mismatch', async () => {
        const result = await service.validateRequestContext({
          userId: 'user-123',
          jwtTenantId: 'tenant-A',
          resourceTenantId: 'tenant-B',
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(PreventionCheckStatus.TENANT_MISMATCH);
          expect(result.data.allowed).toBe(false);
        }
      });

      it('should emit critical event for context mismatch', async () => {
        await service.validateRequestContext({
          userId: 'user-123',
          requestTenantId: 'tenant-A',
          jwtTenantId: 'tenant-B',
        });

        expect(mockAuditEmitter.criticalEvents).toHaveLength(1);
        expect(mockAuditEmitter.criticalEvents[0]!.severity).toBe(PreventionEventSeverity.CRITICAL);
      });

      it('should block when no tenant context is provided', async () => {
        const result = await service.validateRequestContext({
          userId: 'user-123',
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(PreventionCheckStatus.MISSING_CONTEXT);
          expect(result.data.allowed).toBe(false);
        }
      });

      it('should fail when user ID is empty', async () => {
        const result = await service.validateRequestContext({
          userId: '',
          requestTenantId: 'tenant-A',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('CROSS_TENANT_PREVENTION_USER_REQUIRED');
        }
      });

      it('should ignore empty string tenant IDs', async () => {
        const result = await service.validateRequestContext({
          userId: 'user-123',
          requestTenantId: 'tenant-A',
          jwtTenantId: '',
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(PreventionCheckStatus.ALLOWED);
        }
      });
    });

    describe('validateTenantContextPresent', () => {
      it('should return true when tenant ID is present', () => {
        const result = service.validateTenantContextPresent('tenant-A', 'request');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(true);
        }
      });

      it('should fail when tenant ID is undefined', () => {
        const result = service.validateTenantContextPresent(undefined, 'request');

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('CROSS_TENANT_PREVENTION_CONTEXT_MISSING');
          expect(result.error.message).toContain('request');
        }
      });

      it('should fail when tenant ID is null', () => {
        const result = service.validateTenantContextPresent(null, 'jwt');

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.message).toContain('jwt');
        }
      });

      it('should fail when tenant ID is empty string', () => {
        const result = service.validateTenantContextPresent('', 'resource');

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.message).toContain('resource');
        }
      });

      it('should fail when tenant ID is whitespace only', () => {
        const result = service.validateTenantContextPresent('   ', 'session');

        expect(result.success).toBe(false);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Batch Operation Validation Tests
  // -------------------------------------------------------------------------

  describe('Batch Operation Validation', () => {
    describe('validateBatchOperation', () => {
      it('should allow when all resources belong to active tenant', async () => {
        const context = createTestContext({ activeTenantId: 'tenant-A' });
        const resources = [
          { resourceId: 'res-1', resourceType: ResourceType.HOUSEHOLD, resourceTenantId: 'tenant-A' },
          { resourceId: 'res-2', resourceType: ResourceType.HOUSEHOLD, resourceTenantId: 'tenant-A' },
          { resourceId: 'res-3', resourceType: ResourceType.RESIDENT, resourceTenantId: 'tenant-A' },
        ];

        const result = await service.validateBatchOperation({
          context,
          resources,
          operation: OperationType.BATCH,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(PreventionCheckStatus.ALLOWED);
          expect(result.data.allValid).toBe(true);
          expect(result.data.validCount).toBe(3);
          expect(result.data.invalidCount).toBe(0);
        }
      });

      it('should block when batch contains cross-tenant resources', async () => {
        const context = createTestContext({ activeTenantId: 'tenant-A' });
        const resources = [
          { resourceId: 'res-1', resourceType: ResourceType.HOUSEHOLD, resourceTenantId: 'tenant-A' },
          { resourceId: 'res-2', resourceType: ResourceType.HOUSEHOLD, resourceTenantId: 'tenant-B' },
          { resourceId: 'res-3', resourceType: ResourceType.RESIDENT, resourceTenantId: 'tenant-C' },
        ];

        const result = await service.validateBatchOperation({
          context,
          resources,
          operation: OperationType.BATCH,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(PreventionCheckStatus.BATCH_CROSS_TENANT);
          expect(result.data.allValid).toBe(false);
          expect(result.data.validCount).toBe(1);
          expect(result.data.invalidCount).toBe(2);
        }
      });

      it('should return invalid resources with details', async () => {
        const context = createTestContext({ activeTenantId: 'tenant-A' });
        const resources = [
          { resourceId: 'res-1', resourceType: ResourceType.HOUSEHOLD, resourceTenantId: 'tenant-B' },
        ];

        const result = await service.validateBatchOperation({
          context,
          resources,
          operation: OperationType.UPDATE,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.invalidResources).toHaveLength(1);
          expect(result.data.invalidResources[0]).toEqual({
            resourceId: 'res-1',
            resourceType: ResourceType.HOUSEHOLD,
            expectedTenantId: 'tenant-A',
            actualTenantId: 'tenant-B',
            reason: 'Resource belongs to different tenant',
          });
        }
      });

      it('should emit batch violation event', async () => {
        const context = createTestContext({ activeTenantId: 'tenant-A' });
        const resources = [
          { resourceId: 'res-1', resourceType: ResourceType.HOUSEHOLD, resourceTenantId: 'tenant-B' },
        ];

        await service.validateBatchOperation({
          context,
          resources,
          operation: OperationType.DELETE,
        });

        expect(mockAuditEmitter.batchViolationEvents).toHaveLength(1);
        expect(mockAuditEmitter.batchViolationEvents[0]!.context).toEqual(context);
        expect(mockAuditEmitter.batchViolationEvents[0]!.operation).toBe(OperationType.DELETE);
      });

      it('should allow empty batch', async () => {
        const context = createTestContext();

        const result = await service.validateBatchOperation({
          context,
          resources: [],
          operation: OperationType.QUERY,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.allValid).toBe(true);
          expect(result.data.validCount).toBe(0);
        }
      });

      it('should fail when active tenant ID is missing', async () => {
        const context = createTestContext({ activeTenantId: '' });

        const result = await service.validateBatchOperation({
          context,
          resources: [{ resourceId: 'res-1', resourceType: ResourceType.HOUSEHOLD, resourceTenantId: 'tenant-A' }],
          operation: OperationType.BATCH,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('CROSS_TENANT_PREVENTION_CONTEXT_REQUIRED');
        }
      });

      it('should assign suspicious severity to batch violations', async () => {
        const context = createTestContext({ activeTenantId: 'tenant-A' });
        const resources = [
          { resourceId: 'res-1', resourceType: ResourceType.HOUSEHOLD, resourceTenantId: 'tenant-B' },
        ];

        const result = await service.validateBatchOperation({
          context,
          resources,
          operation: OperationType.READ,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.severity).toBe(PreventionEventSeverity.SUSPICIOUS);
        }
      });

      it('should assign critical severity to batch mutation violations', async () => {
        const context = createTestContext({ activeTenantId: 'tenant-A' });
        const resources = [
          { resourceId: 'res-1', resourceType: ResourceType.FINANCIAL_TRANSACTION, resourceTenantId: 'tenant-B' },
        ];

        const result = await service.validateBatchOperation({
          context,
          resources,
          operation: OperationType.DELETE,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.severity).toBe(PreventionEventSeverity.CRITICAL);
        }
      });
    });
  });

  // -------------------------------------------------------------------------
  // Query/Mutation Tenant Validation Tests
  // -------------------------------------------------------------------------

  describe('Query/Mutation Tenant Validation', () => {
    describe('validateQueryTenantFilter', () => {
      it('should allow when query tenant matches active tenant', () => {
        const context = createTestContext({ activeTenantId: 'tenant-A' });

        const result = service.validateQueryTenantFilter({
          context,
          queryTenantId: 'tenant-A',
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(PreventionCheckStatus.ALLOWED);
          expect(result.data.checkType).toBe(CrossTenantCheckType.QUERY_TENANT_FILTER);
        }
      });

      it('should block when query tenant differs from active tenant', () => {
        const context = createTestContext({ activeTenantId: 'tenant-A' });

        const result = service.validateQueryTenantFilter({
          context,
          queryTenantId: 'tenant-B',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('CROSS_TENANT_QUERY_BLOCKED');
        }
      });

      it('should allow platform-wide query for platform admin', () => {
        const context = createTestContext({ activeTenantId: 'tenant-A' });

        const result = service.validateQueryTenantFilter({
          context,
          queryTenantId: 'tenant-B',
          isPlatformWideQuery: true,
          isPlatformAdmin: true,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(PreventionCheckStatus.ALLOWED);
          expect(result.data.reason).toContain('Platform admin');
        }
      });

      it('should block platform-wide query for non-admin', () => {
        const context = createTestContext({ activeTenantId: 'tenant-A' });

        const result = service.validateQueryTenantFilter({
          context,
          queryTenantId: 'tenant-B',
          isPlatformWideQuery: true,
          isPlatformAdmin: false,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('CROSS_TENANT_QUERY_UNAUTHORIZED');
        }
      });

      it('should fail when active tenant ID is missing', () => {
        const context = createTestContext({ activeTenantId: '' });

        const result = service.validateQueryTenantFilter({
          context,
          queryTenantId: 'tenant-A',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('CROSS_TENANT_PREVENTION_CONTEXT_REQUIRED');
        }
      });
    });

    describe('validateMutationTarget', () => {
      it('should allow when target tenant matches active tenant', () => {
        const context = createTestContext({ activeTenantId: 'tenant-A' });

        const result = service.validateMutationTarget({
          context,
          targetTenantId: 'tenant-A',
          operation: OperationType.CREATE,
          resourceType: ResourceType.HOUSEHOLD,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(PreventionCheckStatus.ALLOWED);
          expect(result.data.checkType).toBe(CrossTenantCheckType.MUTATION_TENANT_TARGET);
        }
      });

      it('should block when target tenant differs from active tenant', () => {
        const context = createTestContext({ activeTenantId: 'tenant-A' });

        const result = service.validateMutationTarget({
          context,
          targetTenantId: 'tenant-B',
          operation: OperationType.UPDATE,
          resourceType: ResourceType.RESIDENT,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('CROSS_TENANT_MUTATION_BLOCKED');
          expect(result.error.message).toContain('tenant-A');
          expect(result.error.message).toContain('tenant-B');
          expect(result.error.message).toContain('UPDATE');
          expect(result.error.message).toContain('RESIDENT');
        }
      });

      it('should fail when active tenant ID is missing', () => {
        const context = createTestContext({ activeTenantId: '' });

        const result = service.validateMutationTarget({
          context,
          targetTenantId: 'tenant-A',
          operation: OperationType.CREATE,
          resourceType: ResourceType.ANNOUNCEMENT,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('CROSS_TENANT_PREVENTION_CONTEXT_REQUIRED');
        }
      });

      it('should fail when target tenant ID is empty', () => {
        const context = createTestContext({ activeTenantId: 'tenant-A' });

        const result = service.validateMutationTarget({
          context,
          targetTenantId: '',
          operation: OperationType.DELETE,
          resourceType: ResourceType.VOTE,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('CROSS_TENANT_PREVENTION_TARGET_REQUIRED');
        }
      });
    });
  });

  // -------------------------------------------------------------------------
  // Utility Method Tests
  // -------------------------------------------------------------------------

  describe('Utility Methods', () => {
    describe('createViolationEvent', () => {
      it('should create violation event with all fields', () => {
        const context = createTestContext({
          userId: 'user-456',
          activeTenantId: 'tenant-X',
          correlationId: 'corr-789',
          ipAddress: '10.0.0.1',
        });

        const event = service.createViolationEvent(
          context,
          CrossTenantCheckType.RESOURCE_OWNERSHIP,
          OperationType.DELETE,
          'Test violation reason',
          PreventionEventSeverity.CRITICAL,
          { customField: 'customValue' },
        );

        expect(event.eventId).toBeDefined();
        expect(event.eventId).toMatch(/^ctp-/);
        expect(event.timestamp).toBeInstanceOf(Date);
        expect(event.userId).toBe('user-456');
        expect(event.activeTenantId).toBe('tenant-X');
        expect(event.checkType).toBe(CrossTenantCheckType.RESOURCE_OWNERSHIP);
        expect(event.operation).toBe(OperationType.DELETE);
        expect(event.severity).toBe(PreventionEventSeverity.CRITICAL);
        expect(event.reason).toBe('Test violation reason');
        expect(event.correlationId).toBe('corr-789');
        expect(event.ipAddress).toBe('10.0.0.1');
        expect(event.additionalContext).toEqual({ customField: 'customValue' });
      });

      it('should sanitize sensitive data in additional context', () => {
        const context = createTestContext();

        const event = service.createViolationEvent(
          context,
          CrossTenantCheckType.REQUEST_CONTEXT,
          OperationType.READ,
          'Test',
          PreventionEventSeverity.NORMAL,
          {
            normalField: 'visible',
            password: 'secret123',
            accessToken: 'token456',
          },
        );

        expect(event.additionalContext).toEqual({
          normalField: 'visible',
          password: '[REDACTED]',
          accessToken: '[REDACTED]',
        });
      });

      it('should generate unique event IDs', () => {
        const context = createTestContext();

        const event1 = service.createViolationEvent(
          context,
          CrossTenantCheckType.RESOURCE_OWNERSHIP,
          OperationType.READ,
          'Test 1',
          PreventionEventSeverity.NORMAL,
        );

        const event2 = service.createViolationEvent(
          context,
          CrossTenantCheckType.RESOURCE_OWNERSHIP,
          OperationType.READ,
          'Test 2',
          PreventionEventSeverity.NORMAL,
        );

        expect(event1.eventId).not.toBe(event2.eventId);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Severity Determination Tests
  // -------------------------------------------------------------------------

  describe('Severity Determination', () => {
    it('should assign CRITICAL severity to DELETE operations', async () => {
      const context = createTestContext({ activeTenantId: 'tenant-A' });
      const resource = createTestResource({ resourceTenantId: 'tenant-B' });

      await service.validateResourceAccess({
        context,
        resource,
        operation: OperationType.DELETE,
      });

      expect(mockAuditEmitter.criticalEvents).toHaveLength(1);
    });

    it('should assign CRITICAL severity to CREATE operations', async () => {
      const context = createTestContext({ activeTenantId: 'tenant-A' });
      const resource = createTestResource({ resourceTenantId: 'tenant-B' });

      await service.validateResourceAccess({
        context,
        resource,
        operation: OperationType.CREATE,
      });

      expect(mockAuditEmitter.criticalEvents).toHaveLength(1);
    });

    it('should assign CRITICAL severity to UPDATE operations', async () => {
      const context = createTestContext({ activeTenantId: 'tenant-A' });
      const resource = createTestResource({ resourceTenantId: 'tenant-B' });

      await service.validateResourceAccess({
        context,
        resource,
        operation: OperationType.UPDATE,
      });

      expect(mockAuditEmitter.criticalEvents).toHaveLength(1);
    });

    it('should assign NORMAL severity to READ operations', async () => {
      const context = createTestContext({ activeTenantId: 'tenant-A' });
      const resource = createTestResource({ resourceTenantId: 'tenant-B' });

      const result = await service.validateResourceAccess({
        context,
        resource,
        operation: OperationType.READ,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.severity).toBe(PreventionEventSeverity.NORMAL);
      }
      expect(mockAuditEmitter.violationEvents).toHaveLength(1);
      expect(mockAuditEmitter.criticalEvents).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Integration-like Tests
  // -------------------------------------------------------------------------

  describe('Integration Scenarios', () => {
    it('should handle full resource access validation flow', async () => {
      const context: TenantContext = {
        userId: 'user-001',
        activeTenantId: 'tenant-production',
        orgUnitId: 'org-unit-001',
        correlationId: 'req-12345',
        ipAddress: '203.0.113.42',
      };

      const resource: ResourceInfo = {
        resourceId: 'household-777',
        resourceType: ResourceType.HOUSEHOLD,
        resourceTenantId: 'tenant-production',
        resourceOrgUnitId: 'org-unit-001',
      };

      const result = await service.validateResourceAccess({
        context,
        resource,
        operation: OperationType.UPDATE,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(true);
        expect(result.data.status).toBe(PreventionCheckStatus.ALLOWED);
      }
    });

    it('should detect and block complex cross-tenant attack', async () => {
      // Simulate an attacker trying to access another tenant's data
      const attackerContext: TenantContext = {
        userId: 'attacker-user',
        activeTenantId: 'tenant-attacker',
        correlationId: 'suspicious-req',
        ipAddress: '192.0.2.1',
      };

      const victimResource: ResourceInfo = {
        resourceId: 'sensitive-data-123',
        resourceType: ResourceType.FINANCIAL_TRANSACTION,
        resourceTenantId: 'tenant-victim',
      };

      const result = await service.validateResourceAccess({
        context: attackerContext,
        resource: victimResource,
        operation: OperationType.READ,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(false);
        expect(result.data.status).toBe(PreventionCheckStatus.TENANT_MISMATCH);
      }

      // Verify audit trail
      expect(mockAuditEmitter.violationEvents.length + mockAuditEmitter.criticalEvents.length).toBeGreaterThan(0);
    });

    it('should validate batch import with mixed tenant data', async () => {
      const context = createTestContext({ activeTenantId: 'tenant-importer' });

      // Simulate importing data where some records belong to other tenants
      const importedRecords = [
        { resourceId: 'record-1', resourceType: ResourceType.RESIDENT, resourceTenantId: 'tenant-importer' },
        { resourceId: 'record-2', resourceType: ResourceType.RESIDENT, resourceTenantId: 'tenant-importer' },
        { resourceId: 'record-3', resourceType: ResourceType.RESIDENT, resourceTenantId: 'tenant-other' }, // Suspicious!
        { resourceId: 'record-4', resourceType: ResourceType.RESIDENT, resourceTenantId: 'tenant-importer' },
      ];

      const result = await service.validateBatchOperation({
        context,
        resources: importedRecords,
        operation: OperationType.CREATE,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allValid).toBe(false);
        expect(result.data.validCount).toBe(3);
        expect(result.data.invalidCount).toBe(1);
        expect(result.data.invalidResources[0]!.resourceId).toBe('record-3');
      }
    });
  });
});
