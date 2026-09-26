/**
 * Unit tests for DelegatedMembershipService
 *
 * Tests the orchestration of delegation validation + membership creation including:
 * - Delegation matrix validation before creation
 * - Scope validation (target within delegator's scope)
 * - Membership creation through delegation
 * - Audit logging
 *
 * **Validates: Requirements 25 (AC 1-9)**
 *
 * @see FASE 1.18 Task 51: Delegation Matrix Implementation
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  DelegatedMembershipServiceImpl,
  type IDelegatedMembershipService,
  type DelegatedCreateMembershipInput,
} from '../DelegatedMembershipService';
import type {
  IDelegationMatrixService,
  DelegationValidationResult,
} from '../DelegationMatrixService';
import { DelegationDecisionReason } from '../DelegationMatrixService';
import type {
  IMembershipLifecycleService,
  CreateMembershipResult,
  MembershipLifecycleEvent,
} from '../MembershipLifecycleService';
import { MembershipEventType } from '../MembershipLifecycleService';
import type { IOrgUnitHierarchyReader } from '@core/domains/orgunit/services';
import type { Membership } from '../../entities';
import { MembershipRole, MembershipStatus } from '../../types';

// ---------------------------------------------------------------------------
// Mock Type Helper
// ---------------------------------------------------------------------------

type Mocked<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R ? Mock<(...args: A) => R> : T[K];
};

// ---------------------------------------------------------------------------
// Mock Setup
// ---------------------------------------------------------------------------

const createMockDelegationMatrixService = (): Mocked<IDelegationMatrixService> => ({
  canDelegateRole: vi.fn(),
  getDelegatableRoles: vi.fn(),
  validateDelegation: vi.fn(),
  validateAndAudit: vi.fn(),
  isRoleDelegatable: vi.fn(),
});

const createMockMembershipLifecycleService = (): Mocked<IMembershipLifecycleService> => ({
  create: vi.fn(),
  transitionStatus: vi.fn(),
  activate: vi.fn(),
  suspend: vi.fn(),
  reactivate: vi.fn(),
  revoke: vi.fn(),
  existsActiveMembership: vi.fn(),
  getById: vi.fn(),
});

const createMockOrgUnitHierarchyReader = (): Mocked<IOrgUnitHierarchyReader> => ({
  isDescendantOrEqual: vi.fn(),
  getPath: vi.fn(),
  getDepth: vi.fn(),
  validatePathInvariant: vi.fn(),
  validateRootInvariant: vi.fn(),
  findAncestors: vi.fn(),
  findDescendants: vi.fn(),
});

const createTestMembership = (overrides?: Partial<Membership>): Membership => ({
  id: 'membership-001',
  userId: 'target-user-001',
  tenantId: 'tenant-001',
  orgUnitId: 'orgunit-001',
  role: MembershipRole.RESIDENT,
  status: MembershipStatus.ACTIVE,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

const createTestEvent = (): MembershipLifecycleEvent => ({
  type: MembershipEventType.CREATED,
  membershipId: 'membership-001',
  userId: 'target-user-001',
  tenantId: 'tenant-001',
  orgUnitId: 'orgunit-001',
  role: MembershipRole.RESIDENT,
  newStatus: MembershipStatus.ACTIVE,
  oldStatus: null,
  timestamp: new Date(),
});

const createTestInput = (overrides?: Partial<DelegatedCreateMembershipInput>): DelegatedCreateMembershipInput => ({
  delegatorUserId: 'delegator-001',
  delegatorMembership: {
    role: MembershipRole.TENANT_OWNER,
    status: MembershipStatus.ACTIVE,
    orgUnitId: null,
  },
  targetUserId: 'target-user-001',
  tenantId: 'tenant-001',
  targetOrgUnitId: 'orgunit-001',
  targetRole: MembershipRole.RESIDENT,
  initialStatus: MembershipStatus.ACTIVE,
  reason: 'Test delegation',
  ...overrides,
});

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('DelegatedMembershipService', () => {
  let service: IDelegatedMembershipService;
  let mockDelegationMatrixService: Mocked<IDelegationMatrixService>;
  let mockMembershipLifecycleService: Mocked<IMembershipLifecycleService>;
  let mockOrgUnitHierarchyReader: Mocked<IOrgUnitHierarchyReader>;

  beforeEach(() => {
    mockDelegationMatrixService = createMockDelegationMatrixService();
    mockMembershipLifecycleService = createMockMembershipLifecycleService();
    mockOrgUnitHierarchyReader = createMockOrgUnitHierarchyReader();

    service = DelegatedMembershipServiceImpl({
      delegationMatrixService: mockDelegationMatrixService,
      membershipLifecycleService: mockMembershipLifecycleService,
      orgUnitHierarchyReader: mockOrgUnitHierarchyReader,
    });
  });

  // -------------------------------------------------------------------------
  // createThroughDelegation Tests
  // -------------------------------------------------------------------------

  describe('createThroughDelegation', () => {
    describe('Successful delegation', () => {
      it('should create membership when all validations pass', async () => {
        // Arrange
        const input = createTestInput();
        const membership = createTestMembership();
        const event = createTestEvent();

        const validationResult: DelegationValidationResult = {
          allowed: true,
          reason: DelegationDecisionReason.ALLOWED,
          explanation: 'Delegation allowed',
        };

        mockDelegationMatrixService.validateAndAudit.mockResolvedValue({
          success: true,
          data: validationResult,
        });
        mockOrgUnitHierarchyReader.isDescendantOrEqual.mockResolvedValue(true);
        mockMembershipLifecycleService.create.mockResolvedValue({
          success: true,
          data: { membership, event },
        });

        // Act
        const result = await service.createThroughDelegation(input);

        // Assert
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.membership).toEqual(membership);
          expect(result.data.delegationAllowed).toBe(true);
        }
      });

      it('should pass correct parameters to membership lifecycle service', async () => {
        // Arrange
        const input = createTestInput({
          targetUserId: 'user-target',
          tenantId: 'tenant-xyz',
          targetOrgUnitId: 'orgunit-abc',
          targetRole: MembershipRole.SECURITY,
          initialStatus: MembershipStatus.INVITED,
          reason: 'Custom reason',
        });

        mockDelegationMatrixService.validateAndAudit.mockResolvedValue({
          success: true,
          data: {
            allowed: true,
            reason: DelegationDecisionReason.ALLOWED,
            explanation: 'Delegation allowed',
          },
        });
        mockOrgUnitHierarchyReader.isDescendantOrEqual.mockResolvedValue(true);
        mockMembershipLifecycleService.create.mockResolvedValue({
          success: true,
          data: { membership: createTestMembership(), event: createTestEvent() },
        });

        // Act
        await service.createThroughDelegation(input);

        // Assert
        expect(mockMembershipLifecycleService.create).toHaveBeenCalledWith({
          userId: 'user-target',
          tenantId: 'tenant-xyz',
          orgUnitId: 'orgunit-abc',
          role: MembershipRole.SECURITY,
          status: MembershipStatus.INVITED,
          performedBy: input.delegatorUserId,
          reason: 'Custom reason',
        });
      });
    });

    describe('Delegation matrix validation failures', () => {
      it('should fail if delegator membership is not ACTIVE', async () => {
        // Arrange
        const input = createTestInput({
          delegatorMembership: {
            role: MembershipRole.TENANT_OWNER,
            status: MembershipStatus.SUSPENDED,
            orgUnitId: null,
          },
        });

        mockDelegationMatrixService.validateAndAudit.mockResolvedValue({
          success: false,
          error: {
            type: 'authorization',
            code: 'AUTH_MEMBERSHIP_INACTIVE',
            message: 'Delegator membership is not active',
          },
        });

        // Act
        const result = await service.createThroughDelegation(input);

        // Assert
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('AUTH_MEMBERSHIP_INACTIVE');
        }
      });

      it('should fail if target role cannot be delegated (PLATFORM_ADMIN)', async () => {
        // Arrange
        const input = createTestInput({
          targetRole: MembershipRole.PLATFORM_ADMIN,
        });

        mockDelegationMatrixService.validateAndAudit.mockResolvedValue({
          success: true,
          data: {
            allowed: false,
            reason: DelegationDecisionReason.NON_DELEGATABLE_ROLE,
            explanation: 'PLATFORM_ADMIN cannot be delegated',
          },
        });

        // Act
        const result = await service.createThroughDelegation(input);

        // Assert
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('AUTH_DELEGATION_VIOLATION');
        }
      });

      it('should fail if target role is not in delegator matrix', async () => {
        // Arrange
        const input = createTestInput({
          delegatorMembership: {
            role: MembershipRole.RT_ADMIN,
            status: MembershipStatus.ACTIVE,
            orgUnitId: 'orgunit-001',
          },
          targetRole: MembershipRole.ORG_ADMIN, // RT_ADMIN cannot delegate ORG_ADMIN
        });

        mockDelegationMatrixService.validateAndAudit.mockResolvedValue({
          success: true,
          data: {
            allowed: false,
            reason: DelegationDecisionReason.NOT_IN_MATRIX,
            explanation: 'Role not in delegation matrix',
          },
        });

        // Act
        const result = await service.createThroughDelegation(input);

        // Assert
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('AUTH_DELEGATION_VIOLATION');
        }
      });
    });

    describe('Scope validation (Req 25 AC 1)', () => {
      it('should fail if target OrgUnit is outside delegator scope', async () => {
        // Arrange
        const input = createTestInput({
          delegatorMembership: {
            role: MembershipRole.ORG_ADMIN,
            status: MembershipStatus.ACTIVE,
            orgUnitId: 'orgunit-delegator',
          },
          targetOrgUnitId: 'orgunit-outside-scope',
        });

        mockDelegationMatrixService.validateAndAudit.mockResolvedValue({
          success: true,
          data: {
            allowed: true,
            reason: DelegationDecisionReason.ALLOWED,
            explanation: 'Delegation allowed',
          },
        });
        mockOrgUnitHierarchyReader.isDescendantOrEqual.mockResolvedValue(false);

        // Act
        const result = await service.createThroughDelegation(input);

        // Assert
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('AUTH_OUT_OF_SCOPE');
        }
      });

      it('should allow tenant-level delegator to delegate to any OrgUnit', async () => {
        // Arrange
        const input = createTestInput({
          delegatorMembership: {
            role: MembershipRole.TENANT_OWNER,
            status: MembershipStatus.ACTIVE,
            orgUnitId: null, // Tenant-level
          },
          targetOrgUnitId: 'any-orgunit',
        });

        mockDelegationMatrixService.validateAndAudit.mockResolvedValue({
          success: true,
          data: {
            allowed: true,
            reason: DelegationDecisionReason.ALLOWED,
            explanation: 'Delegation allowed',
          },
        });
        mockMembershipLifecycleService.create.mockResolvedValue({
          success: true,
          data: { membership: createTestMembership(), event: createTestEvent() },
        });

        // Act
        const result = await service.createThroughDelegation(input);

        // Assert
        expect(result.success).toBe(true);
        // isDescendantOrEqual should NOT be called for tenant-level delegator
        expect(mockOrgUnitHierarchyReader.isDescendantOrEqual).not.toHaveBeenCalled();
      });

      it('should fail if org-scoped delegator tries to create tenant-level membership', async () => {
        // Arrange
        const input = createTestInput({
          delegatorMembership: {
            role: MembershipRole.ORG_ADMIN,
            status: MembershipStatus.ACTIVE,
            orgUnitId: 'orgunit-001', // Org-scoped
          },
          targetOrgUnitId: null, // Tenant-level target
        });

        mockDelegationMatrixService.validateAndAudit.mockResolvedValue({
          success: true,
          data: {
            allowed: true,
            reason: DelegationDecisionReason.ALLOWED,
            explanation: 'Delegation allowed',
          },
        });

        // Act
        const result = await service.createThroughDelegation(input);

        // Assert
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('AUTH_OUT_OF_SCOPE');
        }
      });
    });

    describe('Membership creation errors', () => {
      it('should propagate membership creation errors', async () => {
        // Arrange
        const input = createTestInput();

        mockDelegationMatrixService.validateAndAudit.mockResolvedValue({
          success: true,
          data: {
            allowed: true,
            reason: DelegationDecisionReason.ALLOWED,
            explanation: 'Delegation allowed',
          },
        });
        mockOrgUnitHierarchyReader.isDescendantOrEqual.mockResolvedValue(true);
        mockMembershipLifecycleService.create.mockResolvedValue({
          success: false,
          error: {
            type: 'business',
            code: 'MEMBERSHIP_ALREADY_EXISTS',
            message: 'Membership already exists',
          },
        });

        // Act
        const result = await service.createThroughDelegation(input);

        // Assert
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('MEMBERSHIP_ALREADY_EXISTS');
        }
      });
    });
  });

  // -------------------------------------------------------------------------
  // canCreateThroughDelegation Tests
  // -------------------------------------------------------------------------

  describe('canCreateThroughDelegation', () => {
    it('should return true when delegation would be allowed', async () => {
      // Arrange
      mockDelegationMatrixService.validateDelegation.mockReturnValue({
        success: true,
        data: {
          allowed: true,
          reason: DelegationDecisionReason.ALLOWED,
          explanation: 'Delegation allowed',
        },
      });
      mockOrgUnitHierarchyReader.isDescendantOrEqual.mockResolvedValue(true);

      // Act
      const result = await service.canCreateThroughDelegation(
        MembershipRole.TENANT_OWNER,
        MembershipStatus.ACTIVE,
        null,
        MembershipRole.RESIDENT,
        'orgunit-001',
        'tenant-001',
      );

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when delegation validation fails', async () => {
      // Arrange
      mockDelegationMatrixService.validateDelegation.mockReturnValue({
        success: true,
        data: {
          allowed: false,
          reason: DelegationDecisionReason.NOT_IN_MATRIX,
          explanation: 'Not in matrix',
        },
      });

      // Act
      const result = await service.canCreateThroughDelegation(
        MembershipRole.RT_ADMIN,
        MembershipStatus.ACTIVE,
        'orgunit-001',
        MembershipRole.ORG_ADMIN,
        'orgunit-002',
        'tenant-001',
      );

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when scope validation fails', async () => {
      // Arrange
      mockDelegationMatrixService.validateDelegation.mockReturnValue({
        success: true,
        data: {
          allowed: true,
          reason: DelegationDecisionReason.ALLOWED,
          explanation: 'Delegation allowed',
        },
      });
      mockOrgUnitHierarchyReader.isDescendantOrEqual.mockResolvedValue(false);

      // Act
      const result = await service.canCreateThroughDelegation(
        MembershipRole.ORG_ADMIN,
        MembershipStatus.ACTIVE,
        'orgunit-001',
        MembershipRole.RESIDENT,
        'orgunit-outside-scope',
        'tenant-001',
      );

      // Assert
      expect(result).toBe(false);
    });

    it('should not call audit emitter (uses validateDelegation, not validateAndAudit)', async () => {
      // Arrange
      mockDelegationMatrixService.validateDelegation.mockReturnValue({
        success: true,
        data: {
          allowed: true,
          reason: DelegationDecisionReason.ALLOWED,
          explanation: 'Delegation allowed',
        },
      });

      // Act
      await service.canCreateThroughDelegation(
        MembershipRole.TENANT_OWNER,
        MembershipStatus.ACTIVE,
        null,
        MembershipRole.RESIDENT,
        'orgunit-001',
        'tenant-001',
      );

      // Assert
      expect(mockDelegationMatrixService.validateAndAudit).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Property-Based Tests
  // -------------------------------------------------------------------------

  describe('Property-based: Delegation + Scope validation order', () => {
    it('should validate delegation BEFORE checking scope', async () => {
      // Arrange
      const callOrder: string[] = [];

      mockDelegationMatrixService.validateAndAudit.mockImplementation(async () => {
        callOrder.push('delegationValidation');
        return {
          success: true,
          data: {
            allowed: false,
            reason: DelegationDecisionReason.NOT_IN_MATRIX,
            explanation: 'Not in matrix',
          },
        };
      });

      mockOrgUnitHierarchyReader.isDescendantOrEqual.mockImplementation(async () => {
        callOrder.push('scopeValidation');
        return true;
      });

      // Act
      await service.createThroughDelegation(createTestInput());

      // Assert
      expect(callOrder).toEqual(['delegationValidation']);
      // Scope validation should NOT be called if delegation fails
      expect(mockOrgUnitHierarchyReader.isDescendantOrEqual).not.toHaveBeenCalled();
    });

    it('should validate scope BEFORE creating membership', async () => {
      // Arrange
      const callOrder: string[] = [];

      mockDelegationMatrixService.validateAndAudit.mockImplementation(async () => {
        callOrder.push('delegationValidation');
        return {
          success: true,
          data: {
            allowed: true,
            reason: DelegationDecisionReason.ALLOWED,
            explanation: 'Allowed',
          },
        };
      });

      mockOrgUnitHierarchyReader.isDescendantOrEqual.mockImplementation(async () => {
        callOrder.push('scopeValidation');
        return false; // Scope validation fails
      });

      mockMembershipLifecycleService.create.mockImplementation(async () => {
        callOrder.push('membershipCreation');
        return {
          success: true,
          data: { membership: createTestMembership(), event: createTestEvent() },
        };
      });

      // Act
      const input = createTestInput({
        delegatorMembership: {
          role: MembershipRole.ORG_ADMIN,
          status: MembershipStatus.ACTIVE,
          orgUnitId: 'orgunit-001',
        },
      });
      await service.createThroughDelegation(input);

      // Assert
      expect(callOrder).toEqual(['delegationValidation', 'scopeValidation']);
      // Membership creation should NOT be called if scope validation fails
      expect(mockMembershipLifecycleService.create).not.toHaveBeenCalled();
    });
  });
});
