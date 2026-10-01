/**
 * SwitchContextUseCase Unit Tests
 *
 * Tests the use case that orchestrates context switching for the Tenant Switcher UI.
 *
 * @see Requirements 1.5-1.7 (Tenant Switcher)
 * @see Task 3.3: Create SwitchContext use case and repository
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { ok, fail, technicalError, businessError } from '@core/utils';
import { MembershipRole } from '@core/domains/membership';
import type { AuditQueueProtocol } from '@core/protocols';
import type { IContextSwitchService, ContextSwitchResult } from '@core/domains/context';
import type { ContextSwitchRepository, ContextSwitchOutput } from '../../repositories/ContextSwitchRepository';
import { SwitchContextUseCaseImpl, type SwitchContextUseCase } from '../SwitchContextUseCase';

// ---------------------------------------------------------------------------
// Test Fixtures and Factories
// ---------------------------------------------------------------------------

const TEST_USER_ID = 'user-123-uuid';
const TEST_TENANT_ID = 'tenant-456-uuid';
const TEST_ORGUNIT_ID = 'orgunit-789-uuid';
const TEST_MEMBERSHIP_ID = 'membership-abc-uuid';
const TEST_ACCESS_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';

function createContextSwitchResult(overrides: Partial<ContextSwitchResult> = {}): ContextSwitchResult {
  return {
    newContext: {
      tenantId: TEST_TENANT_ID,
      orgUnitId: TEST_ORGUNIT_ID,
      role: MembershipRole.RESIDENT,
    },
    membershipId: TEST_MEMBERSHIP_ID,
    ...overrides,
  };
}

function createContextSwitchOutput(overrides: Partial<ContextSwitchOutput> = {}): ContextSwitchOutput {
  return {
    accessToken: TEST_ACCESS_TOKEN,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
    context: {
      tenantId: TEST_TENANT_ID,
      tenantName: 'Test Tenant',
      orgUnitId: TEST_ORGUNIT_ID,
      orgUnitName: 'Test OrgUnit',
      role: MembershipRole.RESIDENT,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock Setup
// ---------------------------------------------------------------------------

interface MockDependencies {
  contextSwitchService: {
    switchContext: Mock;
    validateSwitch: Mock;
    getAvailableContexts: Mock;
    getAvailableContextsForTenant: Mock;
  };
  contextSwitchRepository: {
    switchContext: Mock;
    getMemberships: Mock;
  };
  auditQueueProtocol: {
    enqueueAudit: Mock;
  };
}

function createMockDependencies(): MockDependencies {
  return {
    contextSwitchService: {
      switchContext: vi.fn(),
      validateSwitch: vi.fn(),
      getAvailableContexts: vi.fn(),
      getAvailableContextsForTenant: vi.fn(),
    },
    contextSwitchRepository: {
      switchContext: vi.fn(),
      getMemberships: vi.fn(),
    },
    auditQueueProtocol: {
      enqueueAudit: vi.fn().mockResolvedValue(undefined),
    },
  };
}

function createUseCase(mocks: MockDependencies): SwitchContextUseCase {
  return SwitchContextUseCaseImpl({
    contextSwitchService: mocks.contextSwitchService as unknown as IContextSwitchService,
    contextSwitchRepository: mocks.contextSwitchRepository as unknown as ContextSwitchRepository,
    auditQueueProtocol: mocks.auditQueueProtocol as unknown as AuditQueueProtocol,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SwitchContextUseCase', () => {
  let mocks: MockDependencies;
  let useCase: SwitchContextUseCase;

  beforeEach(() => {
    mocks = createMockDependencies();
    useCase = createUseCase(mocks);
  });

  describe('execute - Success Path', () => {
    it('should successfully switch context and return new token', async () => {
      // Arrange
      const contextResult = createContextSwitchResult();
      mocks.contextSwitchService.switchContext.mockResolvedValue(ok(contextResult));

      const tokenOutput = createContextSwitchOutput();
      mocks.contextSwitchRepository.switchContext.mockResolvedValue(ok(tokenOutput));

      // Act
      const result = await useCase.execute({
        userId: TEST_USER_ID,
        targetTenantId: TEST_TENANT_ID,
        targetOrgUnitId: TEST_ORGUNIT_ID,
      });

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.accessToken).toBe(TEST_ACCESS_TOKEN);
        expect(result.data.newContext.tenantId).toBe(TEST_TENANT_ID);
        expect(result.data.newContext.orgUnitId).toBe(TEST_ORGUNIT_ID);
        expect(result.data.membershipId).toBe(TEST_MEMBERSHIP_ID);
      }
    });

    it('should switch to tenant-level context (null orgUnitId)', async () => {
      // Arrange
      const contextResult = createContextSwitchResult({
        newContext: {
          tenantId: TEST_TENANT_ID,
          orgUnitId: null,
          role: MembershipRole.TENANT_OWNER,
        },
      });
      mocks.contextSwitchService.switchContext.mockResolvedValue(ok(contextResult));

      const tokenOutput = createContextSwitchOutput({
        context: {
          tenantId: TEST_TENANT_ID,
          tenantName: 'Test Tenant',
          orgUnitId: null,
          orgUnitName: null,
          role: MembershipRole.TENANT_OWNER,
        },
      });
      mocks.contextSwitchRepository.switchContext.mockResolvedValue(ok(tokenOutput));

      // Act
      const result = await useCase.execute({
        userId: TEST_USER_ID,
        targetTenantId: TEST_TENANT_ID,
        targetOrgUnitId: null,
      });

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.newContext.orgUnitId).toBeNull();
        expect(result.data.newContext.role).toBe(MembershipRole.TENANT_OWNER);
      }
    });

    it('should enqueue audit log on successful switch', async () => {
      // Arrange
      const contextResult = createContextSwitchResult();
      mocks.contextSwitchService.switchContext.mockResolvedValue(ok(contextResult));

      const tokenOutput = createContextSwitchOutput();
      mocks.contextSwitchRepository.switchContext.mockResolvedValue(ok(tokenOutput));

      // Act
      await useCase.execute({
        userId: TEST_USER_ID,
        targetTenantId: TEST_TENANT_ID,
        targetOrgUnitId: TEST_ORGUNIT_ID,
        ipAddress: '192.168.1.1',
      });

      // Assert - give time for async audit
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(mocks.auditQueueProtocol.enqueueAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TEST_TENANT_ID,
          actorUserId: TEST_USER_ID,
          actionType: 'context_switch',
          resourceType: 'tenant',
          resourceId: TEST_TENANT_ID,
          ipAddress: '192.168.1.1',
        }),
      );
    });
  });

  describe('execute - Error Paths', () => {
    it('should fail when context switch validation fails', async () => {
      // Arrange
      const validationError = businessError(
        'CONTEXT_SWITCH_NO_MEMBERSHIP',
        'No active membership in target tenant',
      );
      mocks.contextSwitchService.switchContext.mockResolvedValue(fail(validationError));

      // Act
      const result = await useCase.execute({
        userId: TEST_USER_ID,
        targetTenantId: TEST_TENANT_ID,
        targetOrgUnitId: TEST_ORGUNIT_ID,
      });

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONTEXT_SWITCH_NO_MEMBERSHIP');
      }
      expect(mocks.contextSwitchRepository.switchContext).not.toHaveBeenCalled();
    });

    it('should fail when token issuance fails', async () => {
      // Arrange
      const contextResult = createContextSwitchResult();
      mocks.contextSwitchService.switchContext.mockResolvedValue(ok(contextResult));

      const tokenError = technicalError(
        'CONTEXT_SWITCH_FAILED',
        'Failed to issue new token',
      );
      mocks.contextSwitchRepository.switchContext.mockResolvedValue(fail(tokenError));

      // Act
      const result = await useCase.execute({
        userId: TEST_USER_ID,
        targetTenantId: TEST_TENANT_ID,
        targetOrgUnitId: TEST_ORGUNIT_ID,
      });

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONTEXT_SWITCH_FAILED');
      }
    });

    it('should not block on audit log failures', async () => {
      // Arrange
      const contextResult = createContextSwitchResult();
      mocks.contextSwitchService.switchContext.mockResolvedValue(ok(contextResult));

      const tokenOutput = createContextSwitchOutput();
      mocks.contextSwitchRepository.switchContext.mockResolvedValue(ok(tokenOutput));

      // Simulate audit failure
      mocks.auditQueueProtocol.enqueueAudit.mockRejectedValue(new Error('Audit failed'));

      // Act
      const result = await useCase.execute({
        userId: TEST_USER_ID,
        targetTenantId: TEST_TENANT_ID,
        targetOrgUnitId: TEST_ORGUNIT_ID,
      });

      // Assert - should still succeed despite audit failure
      expect(result.success).toBe(true);
    });
  });

  describe('execute - Service Call Verification', () => {
    it('should call contextSwitchService with correct parameters', async () => {
      // Arrange
      const contextResult = createContextSwitchResult();
      mocks.contextSwitchService.switchContext.mockResolvedValue(ok(contextResult));

      const tokenOutput = createContextSwitchOutput();
      mocks.contextSwitchRepository.switchContext.mockResolvedValue(ok(tokenOutput));

      // Act
      await useCase.execute({
        userId: TEST_USER_ID,
        targetTenantId: TEST_TENANT_ID,
        targetOrgUnitId: TEST_ORGUNIT_ID,
      });

      // Assert
      expect(mocks.contextSwitchService.switchContext).toHaveBeenCalledWith({
        userId: TEST_USER_ID,
        targetTenantId: TEST_TENANT_ID,
        targetOrgUnitId: TEST_ORGUNIT_ID,
      });
    });

    it('should call contextSwitchRepository with correct parameters', async () => {
      // Arrange
      const contextResult = createContextSwitchResult();
      mocks.contextSwitchService.switchContext.mockResolvedValue(ok(contextResult));

      const tokenOutput = createContextSwitchOutput();
      mocks.contextSwitchRepository.switchContext.mockResolvedValue(ok(tokenOutput));

      // Act
      await useCase.execute({
        userId: TEST_USER_ID,
        targetTenantId: TEST_TENANT_ID,
        targetOrgUnitId: TEST_ORGUNIT_ID,
      });

      // Assert
      expect(mocks.contextSwitchRepository.switchContext).toHaveBeenCalledWith({
        userId: TEST_USER_ID,
        targetTenantId: TEST_TENANT_ID,
        targetOrgUnitId: TEST_ORGUNIT_ID,
      });
    });
  });
});
