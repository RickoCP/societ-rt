/**
 * Unit tests for DelegationMatrixService
 *
 * Tests delegation matrix enforcement including:
 * - Explicit matrix lookup (NOT permission counting)
 * - PLATFORM_ADMIN cannot be granted
 * - TENANT_OWNER cannot be granted (except via transfer flow)
 * - Valid delegation paths
 * - Delegator status validation
 * - Audit logging
 *
 * **Validates: Requirements 25 (AC 1-9)**
 *
 * @see FASE 1.18 Task 51: Delegation Matrix Implementation
 * @see Design Section 9: Delegation Matrix (LOCKED L9)
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  DelegationMatrixServiceImpl,
  DELEGATION_MATRIX,
  NON_DELEGATABLE_ROLES,
  DelegationDecisionReason,
  DelegationAuditEventType,
  canDelegate,
  getDelegatableRolesFor,
  isGrantableThroughDelegation,
  type IDelegationMatrixService,
  type IDelegationAuditEmitter,
  type DelegationAuditEvent,
  type DelegationValidationInput,
  type DelegationCheckInput,
} from '../DelegationMatrixService';
import { MembershipRole, MembershipStatus } from '../../types';

// ---------------------------------------------------------------------------
// Mock Setup
// ---------------------------------------------------------------------------

const createMockAuditEmitter = (): { emitter: IDelegationAuditEmitter; events: DelegationAuditEvent[] } => {
  const events: DelegationAuditEvent[] = [];
  const emitter: IDelegationAuditEmitter = {
    emit: vi.fn(async (event: DelegationAuditEvent) => {
      events.push(event);
    }),
  };
  return { emitter, events };
};

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('DelegationMatrixService', () => {
  let service: IDelegationMatrixService;
  let mockAuditEmitter: { emitter: IDelegationAuditEmitter; events: DelegationAuditEvent[] };

  beforeEach(() => {
    mockAuditEmitter = createMockAuditEmitter();
    service = DelegationMatrixServiceImpl({
      auditEmitter: mockAuditEmitter.emitter,
    });
  });

  // -------------------------------------------------------------------------
  // DELEGATION_MATRIX Configuration Tests (LOCKED L9)
  // -------------------------------------------------------------------------

  describe('DELEGATION_MATRIX Configuration', () => {
    it('should have PLATFORM_ADMIN with empty delegation set', () => {
      expect(DELEGATION_MATRIX[MembershipRole.PLATFORM_ADMIN]).toEqual([]);
    });

    it('should have TENANT_OWNER able to delegate ORG_ADMIN, RT_ADMIN, SECURITY, RESIDENT', () => {
      expect(DELEGATION_MATRIX[MembershipRole.TENANT_OWNER]).toEqual([
        MembershipRole.ORG_ADMIN,
        MembershipRole.RT_ADMIN,
        MembershipRole.SECURITY,
        MembershipRole.RESIDENT,
      ]);
    });

    it('should have ORG_ADMIN able to delegate RT_ADMIN, SECURITY, RESIDENT', () => {
      expect(DELEGATION_MATRIX[MembershipRole.ORG_ADMIN]).toEqual([
        MembershipRole.RT_ADMIN,
        MembershipRole.SECURITY,
        MembershipRole.RESIDENT,
      ]);
    });

    it('should have RT_ADMIN able to delegate SECURITY, RESIDENT', () => {
      expect(DELEGATION_MATRIX[MembershipRole.RT_ADMIN]).toEqual([
        MembershipRole.SECURITY,
        MembershipRole.RESIDENT,
      ]);
    });

    it('should have SECURITY with empty delegation set', () => {
      expect(DELEGATION_MATRIX[MembershipRole.SECURITY]).toEqual([]);
    });

    it('should have RESIDENT with empty delegation set', () => {
      expect(DELEGATION_MATRIX[MembershipRole.RESIDENT]).toEqual([]);
    });

    it('should be immutable (frozen)', () => {
      expect(Object.isFrozen(DELEGATION_MATRIX)).toBe(true);
      expect(Object.isFrozen(DELEGATION_MATRIX[MembershipRole.TENANT_OWNER])).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // NON_DELEGATABLE_ROLES Tests (Req 25 AC 4, AC 5)
  // -------------------------------------------------------------------------

  describe('NON_DELEGATABLE_ROLES', () => {
    it('should include PLATFORM_ADMIN', () => {
      expect(NON_DELEGATABLE_ROLES.has(MembershipRole.PLATFORM_ADMIN)).toBe(true);
    });

    it('should include TENANT_OWNER', () => {
      expect(NON_DELEGATABLE_ROLES.has(MembershipRole.TENANT_OWNER)).toBe(true);
    });

    it('should NOT include ORG_ADMIN', () => {
      expect(NON_DELEGATABLE_ROLES.has(MembershipRole.ORG_ADMIN)).toBe(false);
    });

    it('should NOT include RT_ADMIN', () => {
      expect(NON_DELEGATABLE_ROLES.has(MembershipRole.RT_ADMIN)).toBe(false);
    });

    it('should NOT include SECURITY', () => {
      expect(NON_DELEGATABLE_ROLES.has(MembershipRole.SECURITY)).toBe(false);
    });

    it('should NOT include RESIDENT', () => {
      expect(NON_DELEGATABLE_ROLES.has(MembershipRole.RESIDENT)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // canDelegateRole Tests (Req 25 AC 2)
  // -------------------------------------------------------------------------

  describe('canDelegateRole', () => {
    describe('TENANT_OWNER delegation', () => {
      it('should allow TENANT_OWNER to delegate ORG_ADMIN', () => {
        expect(service.canDelegateRole(MembershipRole.TENANT_OWNER, MembershipRole.ORG_ADMIN)).toBe(true);
      });

      it('should allow TENANT_OWNER to delegate RT_ADMIN', () => {
        expect(service.canDelegateRole(MembershipRole.TENANT_OWNER, MembershipRole.RT_ADMIN)).toBe(true);
      });

      it('should allow TENANT_OWNER to delegate SECURITY', () => {
        expect(service.canDelegateRole(MembershipRole.TENANT_OWNER, MembershipRole.SECURITY)).toBe(true);
      });

      it('should allow TENANT_OWNER to delegate RESIDENT', () => {
        expect(service.canDelegateRole(MembershipRole.TENANT_OWNER, MembershipRole.RESIDENT)).toBe(true);
      });

      it('should NOT allow TENANT_OWNER to delegate PLATFORM_ADMIN (Req 25 AC 4)', () => {
        expect(service.canDelegateRole(MembershipRole.TENANT_OWNER, MembershipRole.PLATFORM_ADMIN)).toBe(false);
      });

      it('should NOT allow TENANT_OWNER to delegate TENANT_OWNER (Req 25 AC 5)', () => {
        expect(service.canDelegateRole(MembershipRole.TENANT_OWNER, MembershipRole.TENANT_OWNER)).toBe(false);
      });
    });

    describe('ORG_ADMIN delegation', () => {
      it('should allow ORG_ADMIN to delegate RT_ADMIN', () => {
        expect(service.canDelegateRole(MembershipRole.ORG_ADMIN, MembershipRole.RT_ADMIN)).toBe(true);
      });

      it('should allow ORG_ADMIN to delegate SECURITY', () => {
        expect(service.canDelegateRole(MembershipRole.ORG_ADMIN, MembershipRole.SECURITY)).toBe(true);
      });

      it('should allow ORG_ADMIN to delegate RESIDENT', () => {
        expect(service.canDelegateRole(MembershipRole.ORG_ADMIN, MembershipRole.RESIDENT)).toBe(true);
      });

      it('should NOT allow ORG_ADMIN to delegate ORG_ADMIN', () => {
        expect(service.canDelegateRole(MembershipRole.ORG_ADMIN, MembershipRole.ORG_ADMIN)).toBe(false);
      });

      it('should NOT allow ORG_ADMIN to delegate TENANT_OWNER', () => {
        expect(service.canDelegateRole(MembershipRole.ORG_ADMIN, MembershipRole.TENANT_OWNER)).toBe(false);
      });

      it('should NOT allow ORG_ADMIN to delegate PLATFORM_ADMIN', () => {
        expect(service.canDelegateRole(MembershipRole.ORG_ADMIN, MembershipRole.PLATFORM_ADMIN)).toBe(false);
      });
    });

    describe('RT_ADMIN delegation', () => {
      it('should allow RT_ADMIN to delegate SECURITY', () => {
        expect(service.canDelegateRole(MembershipRole.RT_ADMIN, MembershipRole.SECURITY)).toBe(true);
      });

      it('should allow RT_ADMIN to delegate RESIDENT', () => {
        expect(service.canDelegateRole(MembershipRole.RT_ADMIN, MembershipRole.RESIDENT)).toBe(true);
      });

      it('should NOT allow RT_ADMIN to delegate RT_ADMIN', () => {
        expect(service.canDelegateRole(MembershipRole.RT_ADMIN, MembershipRole.RT_ADMIN)).toBe(false);
      });

      it('should NOT allow RT_ADMIN to delegate ORG_ADMIN', () => {
        expect(service.canDelegateRole(MembershipRole.RT_ADMIN, MembershipRole.ORG_ADMIN)).toBe(false);
      });

      it('should NOT allow RT_ADMIN to delegate TENANT_OWNER', () => {
        expect(service.canDelegateRole(MembershipRole.RT_ADMIN, MembershipRole.TENANT_OWNER)).toBe(false);
      });
    });

    describe('No delegation rights', () => {
      it('should NOT allow PLATFORM_ADMIN to delegate any role', () => {
        expect(service.canDelegateRole(MembershipRole.PLATFORM_ADMIN, MembershipRole.ORG_ADMIN)).toBe(false);
        expect(service.canDelegateRole(MembershipRole.PLATFORM_ADMIN, MembershipRole.RT_ADMIN)).toBe(false);
        expect(service.canDelegateRole(MembershipRole.PLATFORM_ADMIN, MembershipRole.SECURITY)).toBe(false);
        expect(service.canDelegateRole(MembershipRole.PLATFORM_ADMIN, MembershipRole.RESIDENT)).toBe(false);
      });

      it('should NOT allow SECURITY to delegate any role', () => {
        expect(service.canDelegateRole(MembershipRole.SECURITY, MembershipRole.RESIDENT)).toBe(false);
        expect(service.canDelegateRole(MembershipRole.SECURITY, MembershipRole.SECURITY)).toBe(false);
      });

      it('should NOT allow RESIDENT to delegate any role', () => {
        expect(service.canDelegateRole(MembershipRole.RESIDENT, MembershipRole.RESIDENT)).toBe(false);
        expect(service.canDelegateRole(MembershipRole.RESIDENT, MembershipRole.SECURITY)).toBe(false);
      });
    });
  });

  // -------------------------------------------------------------------------
  // getDelegatableRoles Tests
  // -------------------------------------------------------------------------

  describe('getDelegatableRoles', () => {
    it('should return correct roles for TENANT_OWNER', () => {
      const roles = service.getDelegatableRoles(MembershipRole.TENANT_OWNER);
      expect(roles).toEqual([
        MembershipRole.ORG_ADMIN,
        MembershipRole.RT_ADMIN,
        MembershipRole.SECURITY,
        MembershipRole.RESIDENT,
      ]);
    });

    it('should return correct roles for ORG_ADMIN', () => {
      const roles = service.getDelegatableRoles(MembershipRole.ORG_ADMIN);
      expect(roles).toEqual([
        MembershipRole.RT_ADMIN,
        MembershipRole.SECURITY,
        MembershipRole.RESIDENT,
      ]);
    });

    it('should return correct roles for RT_ADMIN', () => {
      const roles = service.getDelegatableRoles(MembershipRole.RT_ADMIN);
      expect(roles).toEqual([
        MembershipRole.SECURITY,
        MembershipRole.RESIDENT,
      ]);
    });

    it('should return empty array for PLATFORM_ADMIN', () => {
      const roles = service.getDelegatableRoles(MembershipRole.PLATFORM_ADMIN);
      expect(roles).toEqual([]);
    });

    it('should return empty array for SECURITY', () => {
      const roles = service.getDelegatableRoles(MembershipRole.SECURITY);
      expect(roles).toEqual([]);
    });

    it('should return empty array for RESIDENT', () => {
      const roles = service.getDelegatableRoles(MembershipRole.RESIDENT);
      expect(roles).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // isRoleDelegatable Tests (Req 25 AC 4, AC 5)
  // -------------------------------------------------------------------------

  describe('isRoleDelegatable', () => {
    it('should return false for PLATFORM_ADMIN (Req 25 AC 4)', () => {
      expect(service.isRoleDelegatable(MembershipRole.PLATFORM_ADMIN)).toBe(false);
    });

    it('should return false for TENANT_OWNER (Req 25 AC 5)', () => {
      expect(service.isRoleDelegatable(MembershipRole.TENANT_OWNER)).toBe(false);
    });

    it('should return true for ORG_ADMIN', () => {
      expect(service.isRoleDelegatable(MembershipRole.ORG_ADMIN)).toBe(true);
    });

    it('should return true for RT_ADMIN', () => {
      expect(service.isRoleDelegatable(MembershipRole.RT_ADMIN)).toBe(true);
    });

    it('should return true for SECURITY', () => {
      expect(service.isRoleDelegatable(MembershipRole.SECURITY)).toBe(true);
    });

    it('should return true for RESIDENT', () => {
      expect(service.isRoleDelegatable(MembershipRole.RESIDENT)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // validateDelegation Tests (Req 25 AC 2, AC 4, AC 5, AC 7, AC 8)
  // -------------------------------------------------------------------------

  describe('validateDelegation', () => {
    describe('Delegator status validation (Req 25 AC 8)', () => {
      it('should fail if delegator status is not ACTIVE', () => {
        const input: DelegationValidationInput = {
          delegatorRole: MembershipRole.TENANT_OWNER,
          delegatorStatus: MembershipStatus.SUSPENDED,
          targetRole: MembershipRole.RESIDENT,
        };

        const result = service.validateDelegation(input);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('AUTH_MEMBERSHIP_INACTIVE');
        }
      });

      it('should fail if delegator status is INVITED', () => {
        const input: DelegationValidationInput = {
          delegatorRole: MembershipRole.TENANT_OWNER,
          delegatorStatus: MembershipStatus.INVITED,
          targetRole: MembershipRole.RESIDENT,
        };

        const result = service.validateDelegation(input);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('AUTH_MEMBERSHIP_INACTIVE');
        }
      });

      it('should fail if delegator status is REVOKED', () => {
        const input: DelegationValidationInput = {
          delegatorRole: MembershipRole.TENANT_OWNER,
          delegatorStatus: MembershipStatus.REVOKED,
          targetRole: MembershipRole.RESIDENT,
        };

        const result = service.validateDelegation(input);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('AUTH_MEMBERSHIP_INACTIVE');
        }
      });
    });

    describe('Non-delegatable roles (Req 25 AC 4, AC 5)', () => {
      it('should return not allowed for PLATFORM_ADMIN target (Req 25 AC 4)', () => {
        const input: DelegationValidationInput = {
          delegatorRole: MembershipRole.TENANT_OWNER,
          delegatorStatus: MembershipStatus.ACTIVE,
          targetRole: MembershipRole.PLATFORM_ADMIN,
        };

        const result = service.validateDelegation(input);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.allowed).toBe(false);
          expect(result.data.reason).toBe(DelegationDecisionReason.NON_DELEGATABLE_ROLE);
        }
      });

      it('should return not allowed for TENANT_OWNER target (Req 25 AC 5)', () => {
        const input: DelegationValidationInput = {
          delegatorRole: MembershipRole.TENANT_OWNER,
          delegatorStatus: MembershipStatus.ACTIVE,
          targetRole: MembershipRole.TENANT_OWNER,
        };

        const result = service.validateDelegation(input);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.allowed).toBe(false);
          expect(result.data.reason).toBe(DelegationDecisionReason.NON_DELEGATABLE_ROLE);
        }
      });
    });

    describe('No delegation rights', () => {
      it('should return not allowed for PLATFORM_ADMIN trying to delegate', () => {
        const input: DelegationValidationInput = {
          delegatorRole: MembershipRole.PLATFORM_ADMIN,
          delegatorStatus: MembershipStatus.ACTIVE,
          targetRole: MembershipRole.RESIDENT,
        };

        const result = service.validateDelegation(input);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.allowed).toBe(false);
          expect(result.data.reason).toBe(DelegationDecisionReason.NO_DELEGATION_RIGHTS);
        }
      });

      it('should return not allowed for SECURITY trying to delegate', () => {
        const input: DelegationValidationInput = {
          delegatorRole: MembershipRole.SECURITY,
          delegatorStatus: MembershipStatus.ACTIVE,
          targetRole: MembershipRole.RESIDENT,
        };

        const result = service.validateDelegation(input);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.allowed).toBe(false);
          expect(result.data.reason).toBe(DelegationDecisionReason.NO_DELEGATION_RIGHTS);
        }
      });

      it('should return not allowed for RESIDENT trying to delegate', () => {
        const input: DelegationValidationInput = {
          delegatorRole: MembershipRole.RESIDENT,
          delegatorStatus: MembershipStatus.ACTIVE,
          targetRole: MembershipRole.RESIDENT,
        };

        const result = service.validateDelegation(input);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.allowed).toBe(false);
          expect(result.data.reason).toBe(DelegationDecisionReason.NO_DELEGATION_RIGHTS);
        }
      });
    });

    describe('Not in matrix (Req 25 AC 2)', () => {
      it('should return not allowed for ORG_ADMIN trying to delegate ORG_ADMIN', () => {
        const input: DelegationValidationInput = {
          delegatorRole: MembershipRole.ORG_ADMIN,
          delegatorStatus: MembershipStatus.ACTIVE,
          targetRole: MembershipRole.ORG_ADMIN,
        };

        const result = service.validateDelegation(input);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.allowed).toBe(false);
          expect(result.data.reason).toBe(DelegationDecisionReason.NOT_IN_MATRIX);
        }
      });

      it('should return not allowed for RT_ADMIN trying to delegate ORG_ADMIN', () => {
        const input: DelegationValidationInput = {
          delegatorRole: MembershipRole.RT_ADMIN,
          delegatorStatus: MembershipStatus.ACTIVE,
          targetRole: MembershipRole.ORG_ADMIN,
        };

        const result = service.validateDelegation(input);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.allowed).toBe(false);
          expect(result.data.reason).toBe(DelegationDecisionReason.NOT_IN_MATRIX);
        }
      });

      it('should return not allowed for RT_ADMIN trying to delegate RT_ADMIN', () => {
        const input: DelegationValidationInput = {
          delegatorRole: MembershipRole.RT_ADMIN,
          delegatorStatus: MembershipStatus.ACTIVE,
          targetRole: MembershipRole.RT_ADMIN,
        };

        const result = service.validateDelegation(input);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.allowed).toBe(false);
          expect(result.data.reason).toBe(DelegationDecisionReason.NOT_IN_MATRIX);
        }
      });
    });

    describe('Valid delegations (Req 25 AC 2)', () => {
      it('should allow TENANT_OWNER to delegate ORG_ADMIN', () => {
        const input: DelegationValidationInput = {
          delegatorRole: MembershipRole.TENANT_OWNER,
          delegatorStatus: MembershipStatus.ACTIVE,
          targetRole: MembershipRole.ORG_ADMIN,
        };

        const result = service.validateDelegation(input);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.allowed).toBe(true);
          expect(result.data.reason).toBe(DelegationDecisionReason.ALLOWED);
        }
      });

      it('should allow ORG_ADMIN to delegate RT_ADMIN', () => {
        const input: DelegationValidationInput = {
          delegatorRole: MembershipRole.ORG_ADMIN,
          delegatorStatus: MembershipStatus.ACTIVE,
          targetRole: MembershipRole.RT_ADMIN,
        };

        const result = service.validateDelegation(input);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.allowed).toBe(true);
          expect(result.data.reason).toBe(DelegationDecisionReason.ALLOWED);
        }
      });

      it('should allow RT_ADMIN to delegate SECURITY', () => {
        const input: DelegationValidationInput = {
          delegatorRole: MembershipRole.RT_ADMIN,
          delegatorStatus: MembershipStatus.ACTIVE,
          targetRole: MembershipRole.SECURITY,
        };

        const result = service.validateDelegation(input);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.allowed).toBe(true);
          expect(result.data.reason).toBe(DelegationDecisionReason.ALLOWED);
        }
      });
    });
  });

  // -------------------------------------------------------------------------
  // validateAndAudit Tests (Req 25 AC 6, AC 7)
  // -------------------------------------------------------------------------

  describe('validateAndAudit', () => {
    it('should emit audit event for allowed delegation (Req 25 AC 6)', async () => {
      const input: DelegationCheckInput = {
        delegatorRole: MembershipRole.TENANT_OWNER,
        delegatorStatus: MembershipStatus.ACTIVE,
        targetRole: MembershipRole.RESIDENT,
        delegatorOrgUnitId: null,
        targetOrgUnitId: 'orgunit-001',
        tenantId: 'tenant-001',
      };

      const result = await service.validateAndAudit(input, 'user-delegator', 'user-target');

      expect(result.success).toBe(true);
      expect(mockAuditEmitter.events).toHaveLength(1);

      const event = mockAuditEmitter.events[0];
      expect(event?.type).toBe(DelegationAuditEventType.DELEGATION_ALLOWED);
      expect(event?.delegatorUserId).toBe('user-delegator');
      expect(event?.delegatorRole).toBe(MembershipRole.TENANT_OWNER);
      expect(event?.targetUserId).toBe('user-target');
      expect(event?.requestedRole).toBe(MembershipRole.RESIDENT);
      expect(event?.targetOrgUnitId).toBe('orgunit-001');
      expect(event?.tenantId).toBe('tenant-001');
      expect(event?.decision).toBe(true);
      expect(event?.reason).toBe(DelegationDecisionReason.ALLOWED);
    });

    it('should emit audit event for denied delegation (Req 25 AC 6)', async () => {
      const input: DelegationCheckInput = {
        delegatorRole: MembershipRole.ORG_ADMIN,
        delegatorStatus: MembershipStatus.ACTIVE,
        targetRole: MembershipRole.ORG_ADMIN, // Cannot delegate ORG_ADMIN
        delegatorOrgUnitId: 'orgunit-001',
        targetOrgUnitId: 'orgunit-002',
        tenantId: 'tenant-001',
      };

      const result = await service.validateAndAudit(input, 'user-delegator', 'user-target');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_DELEGATION_VIOLATION');
      }

      expect(mockAuditEmitter.events).toHaveLength(1);

      const event = mockAuditEmitter.events[0];
      expect(event?.type).toBe(DelegationAuditEventType.DELEGATION_DENIED);
      expect(event?.decision).toBe(false);
      expect(event?.reason).toBe(DelegationDecisionReason.NOT_IN_MATRIX);
    });

    it('should return AUTH_DELEGATION_VIOLATION for failed delegation (Req 25 AC 7)', async () => {
      const input: DelegationCheckInput = {
        delegatorRole: MembershipRole.RT_ADMIN,
        delegatorStatus: MembershipStatus.ACTIVE,
        targetRole: MembershipRole.PLATFORM_ADMIN, // Cannot be delegated
        delegatorOrgUnitId: 'orgunit-001',
        targetOrgUnitId: 'orgunit-001',
        tenantId: 'tenant-001',
      };

      const result = await service.validateAndAudit(input, 'user-delegator', 'user-target');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_DELEGATION_VIOLATION');
      }
    });

    it('should emit audit event for inactive delegator status', async () => {
      const input: DelegationCheckInput = {
        delegatorRole: MembershipRole.TENANT_OWNER,
        delegatorStatus: MembershipStatus.SUSPENDED,
        targetRole: MembershipRole.RESIDENT,
        delegatorOrgUnitId: null,
        targetOrgUnitId: 'orgunit-001',
        tenantId: 'tenant-001',
      };

      const result = await service.validateAndAudit(input, 'user-delegator', 'user-target');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_MEMBERSHIP_INACTIVE');
      }

      // Should still emit audit event
      expect(mockAuditEmitter.events).toHaveLength(1);
      const event = mockAuditEmitter.events[0];
      expect(event?.type).toBe(DelegationAuditEventType.DELEGATION_DENIED);
      expect(event?.reason).toBe(DelegationDecisionReason.DELEGATOR_NOT_ACTIVE);
    });

    it('should include timestamp in audit event', async () => {
      const input: DelegationCheckInput = {
        delegatorRole: MembershipRole.TENANT_OWNER,
        delegatorStatus: MembershipStatus.ACTIVE,
        targetRole: MembershipRole.RESIDENT,
        delegatorOrgUnitId: null,
        targetOrgUnitId: 'orgunit-001',
        tenantId: 'tenant-001',
      };

      const beforeTime = new Date();
      await service.validateAndAudit(input, 'user-delegator', 'user-target');
      const afterTime = new Date();

      const event = mockAuditEmitter.events[0];
      expect(event?.timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(event?.timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });
  });

  // -------------------------------------------------------------------------
  // Helper Function Tests
  // -------------------------------------------------------------------------

  describe('canDelegate helper function', () => {
    it('should return true for valid delegation', () => {
      expect(canDelegate(MembershipRole.TENANT_OWNER, MembershipRole.ORG_ADMIN)).toBe(true);
    });

    it('should return false for invalid delegation', () => {
      expect(canDelegate(MembershipRole.RT_ADMIN, MembershipRole.ORG_ADMIN)).toBe(false);
    });

    it('should return false for non-delegatable roles', () => {
      expect(canDelegate(MembershipRole.TENANT_OWNER, MembershipRole.PLATFORM_ADMIN)).toBe(false);
      expect(canDelegate(MembershipRole.TENANT_OWNER, MembershipRole.TENANT_OWNER)).toBe(false);
    });
  });

  describe('getDelegatableRolesFor helper function', () => {
    it('should return correct roles for each delegator role', () => {
      expect(getDelegatableRolesFor(MembershipRole.TENANT_OWNER)).toHaveLength(4);
      expect(getDelegatableRolesFor(MembershipRole.ORG_ADMIN)).toHaveLength(3);
      expect(getDelegatableRolesFor(MembershipRole.RT_ADMIN)).toHaveLength(2);
      expect(getDelegatableRolesFor(MembershipRole.PLATFORM_ADMIN)).toHaveLength(0);
      expect(getDelegatableRolesFor(MembershipRole.SECURITY)).toHaveLength(0);
      expect(getDelegatableRolesFor(MembershipRole.RESIDENT)).toHaveLength(0);
    });
  });

  describe('isGrantableThroughDelegation helper function', () => {
    it('should return false for PLATFORM_ADMIN and TENANT_OWNER', () => {
      expect(isGrantableThroughDelegation(MembershipRole.PLATFORM_ADMIN)).toBe(false);
      expect(isGrantableThroughDelegation(MembershipRole.TENANT_OWNER)).toBe(false);
    });

    it('should return true for other roles', () => {
      expect(isGrantableThroughDelegation(MembershipRole.ORG_ADMIN)).toBe(true);
      expect(isGrantableThroughDelegation(MembershipRole.RT_ADMIN)).toBe(true);
      expect(isGrantableThroughDelegation(MembershipRole.SECURITY)).toBe(true);
      expect(isGrantableThroughDelegation(MembershipRole.RESIDENT)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Property-Based Tests (Req 25 Testing Considerations)
  // -------------------------------------------------------------------------

  describe('Property-based: Delegation Matrix Enforcement', () => {
    /**
     * Property: For all delegation attempts, granted role must be in delegator's matrix entry
     * Validates: Requirements 25.2 — Delegation via explicit matrix
     */
    it('should satisfy: delegation allowed IFF targetRole is in matrix entry', () => {
      const allRoles = [
        MembershipRole.PLATFORM_ADMIN,
        MembershipRole.TENANT_OWNER,
        MembershipRole.ORG_ADMIN,
        MembershipRole.RT_ADMIN,
        MembershipRole.SECURITY,
        MembershipRole.RESIDENT,
      ];

      for (const delegatorRole of allRoles) {
        const delegatableRoles = DELEGATION_MATRIX[delegatorRole];
        
        for (const targetRole of allRoles) {
          const canDelegateResult = service.canDelegateRole(delegatorRole, targetRole);
          const isInMatrix = delegatableRoles.includes(targetRole);
          const isDelegatable = !NON_DELEGATABLE_ROLES.has(targetRole);

          if (isInMatrix && isDelegatable) {
            expect(canDelegateResult).toBe(true);
          } else {
            expect(canDelegateResult).toBe(false);
          }
        }
      }
    });

    /**
     * Property: PLATFORM_ADMIN and TENANT_OWNER can NEVER be granted through delegation
     * Validates: Requirements 25.4, 25.5
     */
    it('should satisfy: no role can grant PLATFORM_ADMIN or TENANT_OWNER', () => {
      const allRoles = [
        MembershipRole.PLATFORM_ADMIN,
        MembershipRole.TENANT_OWNER,
        MembershipRole.ORG_ADMIN,
        MembershipRole.RT_ADMIN,
        MembershipRole.SECURITY,
        MembershipRole.RESIDENT,
      ];

      for (const delegatorRole of allRoles) {
        expect(service.canDelegateRole(delegatorRole, MembershipRole.PLATFORM_ADMIN)).toBe(false);
        expect(service.canDelegateRole(delegatorRole, MembershipRole.TENANT_OWNER)).toBe(false);
      }
    });

    /**
     * Property: Roles with empty delegation sets cannot delegate anything
     * Validates: Design Section 9 — PLATFORM_ADMIN, SECURITY, RESIDENT have []
     */
    it('should satisfy: roles with empty matrix entries cannot delegate', () => {
      const emptyMatrixRoles = [
        MembershipRole.PLATFORM_ADMIN,
        MembershipRole.SECURITY,
        MembershipRole.RESIDENT,
      ];

      const allDelegatableTargets = [
        MembershipRole.ORG_ADMIN,
        MembershipRole.RT_ADMIN,
        MembershipRole.SECURITY,
        MembershipRole.RESIDENT,
      ];

      for (const delegatorRole of emptyMatrixRoles) {
        for (const targetRole of allDelegatableTargets) {
          expect(service.canDelegateRole(delegatorRole, targetRole)).toBe(false);
        }
      }
    });
  });
});
