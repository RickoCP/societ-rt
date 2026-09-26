/**
 * SafetyCriticalProtectionService Unit Tests
 *
 * Tests business logic for safety-critical operation protection:
 * - Operation code validation (AC 1, 7)
 * - Subscription status bypass (AC 2)
 * - Membership status policy (AC 10)
 * - Elevated audit logging (AC 4)
 * - Alert emission (AC 5, 11)
 * - Queue integration (AC 8-9)
 *
 * Test Requirements per Req 20:
 * - Unit test: Emergency alert works during subscription SUSPENDED status
 * - Unit test: Emergency alert works during membership SUSPENDED status (with audit)
 * - Unit test: Emergency denied for REVOKED or INVITED membership
 * - Unit test: Normal operation denied during SUSPENDED status (covered in EntitlementService)
 * - Unit test: Safety-critical still requires valid membership (not REVOKED)
 *
 * @see Requirements 20 (AC 1-11)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createSafetyCriticalProtectionService,
  type ISafetyCriticalProtectionService,
  type IMembershipStatusResolver,
  type ISubscriptionStatusResolver,
  type ISafetyCriticalAuditLogger,
  type IBillingAlertEmitter,
  type IAdminAlertEmitter,
  type IEmergencyQueueProtocol,
  type ISecurityEventLogger,
} from '../SafetyCriticalProtectionService';
import {
  SafetyCriticalOperationCode,
  isSafetyCriticalOperationCode,
  EMERGENCY_ALLOWED_STATUSES,
  EMERGENCY_DENIED_STATUSES,
} from '../../types';
import type { SafetyCriticalOperationRequest } from '../../types';
import { MembershipStatus } from '@core/domains/membership/types/MembershipStatus';
import { SubscriptionStatus } from '@core/domains/subscription/types';

// ---------------------------------------------------------------------------
// Mock Factory Functions
// ---------------------------------------------------------------------------

function createMockMembershipStatusResolver(): IMembershipStatusResolver {
  return {
    getMembershipStatus: vi.fn(),
  };
}

function createMockSubscriptionStatusResolver(): ISubscriptionStatusResolver {
  return {
    getSubscriptionStatus: vi.fn(),
  };
}

function createMockAuditLogger(): ISafetyCriticalAuditLogger {
  return {
    logSafetyCriticalOperation: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockBillingAlertEmitter(): IBillingAlertEmitter {
  return {
    emitEmergencyDuringSubscriptionSuspension: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockAdminAlertEmitter(): IAdminAlertEmitter {
  return {
    emitEmergencyDuringMembershipSuspension: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockEmergencyQueue(): IEmergencyQueueProtocol {
  return {
    enqueueEmergencyOperation: vi.fn().mockResolvedValue('msg-123'),
  };
}

function createMockSecurityEventLogger(): ISecurityEventLogger {
  return {
    logInvalidSafetyCriticalClaim: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Test Data Factory
// ---------------------------------------------------------------------------

function createTestRequest(
  overrides: Partial<SafetyCriticalOperationRequest> = {},
): SafetyCriticalOperationRequest {
  return {
    operationCode: SafetyCriticalOperationCode.PANIC_BUTTON_ACTIVATE,
    userId: 'user-123',
    tenantId: 'tenant-123',
    membershipId: 'membership-123',
    correlationId: 'corr-123',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SafetyCriticalProtectionService', () => {
  let service: ISafetyCriticalProtectionService;
  let mockMembershipResolver: IMembershipStatusResolver;
  let mockSubscriptionResolver: ISubscriptionStatusResolver;
  let mockAuditLogger: ISafetyCriticalAuditLogger;
  let mockBillingAlertEmitter: IBillingAlertEmitter;
  let mockAdminAlertEmitter: IAdminAlertEmitter;
  let mockEmergencyQueue: IEmergencyQueueProtocol;
  let mockSecurityEventLogger: ISecurityEventLogger;

  beforeEach(() => {
    mockMembershipResolver = createMockMembershipStatusResolver();
    mockSubscriptionResolver = createMockSubscriptionStatusResolver();
    mockAuditLogger = createMockAuditLogger();
    mockBillingAlertEmitter = createMockBillingAlertEmitter();
    mockAdminAlertEmitter = createMockAdminAlertEmitter();
    mockEmergencyQueue = createMockEmergencyQueue();
    mockSecurityEventLogger = createMockSecurityEventLogger();

    service = createSafetyCriticalProtectionService({
      membershipStatusResolver: mockMembershipResolver,
      subscriptionStatusResolver: mockSubscriptionResolver,
      auditLogger: mockAuditLogger,
      billingAlertEmitter: mockBillingAlertEmitter,
      adminAlertEmitter: mockAdminAlertEmitter,
      emergencyQueue: mockEmergencyQueue,
      securityEventLogger: mockSecurityEventLogger,
    });
  });

  // =========================================================================
  // AC 1: Define safety-critical operations
  // =========================================================================

  describe('isSafetyCriticalOperation (AC 1)', () => {
    it('should return true for emergency_alert:create', () => {
      expect(service.isSafetyCriticalOperation('emergency_alert:create')).toBe(true);
    });

    it('should return true for alarm:trigger', () => {
      expect(service.isSafetyCriticalOperation('alarm:trigger')).toBe(true);
    });

    it('should return true for panic_button:activate', () => {
      expect(service.isSafetyCriticalOperation('panic_button:activate')).toBe(true);
    });

    it('should return false for non-safety-critical operations', () => {
      expect(service.isSafetyCriticalOperation('resident:create')).toBe(false);
      expect(service.isSafetyCriticalOperation('finance:read')).toBe(false);
      expect(service.isSafetyCriticalOperation('announcement:publish')).toBe(false);
    });

    it('should return false for unknown operation codes', () => {
      expect(service.isSafetyCriticalOperation('unknown:operation')).toBe(false);
      expect(service.isSafetyCriticalOperation('')).toBe(false);
    });
  });

  // =========================================================================
  // AC 10: Emergency Policy for Membership Status
  // =========================================================================

  describe('getEmergencyPolicy (AC 10)', () => {
    it('should return ALLOWED for ACTIVE membership', () => {
      expect(service.getEmergencyPolicy(MembershipStatus.ACTIVE)).toBe('ALLOWED');
    });

    it('should return ALLOWED_WITH_AUDIT for SUSPENDED membership (L10)', () => {
      // L10: Emergency access for SUSPENDED membership is allowed by default
      expect(service.getEmergencyPolicy(MembershipStatus.SUSPENDED)).toBe('ALLOWED_WITH_AUDIT');
    });

    it('should return DENIED for REVOKED membership', () => {
      expect(service.getEmergencyPolicy(MembershipStatus.REVOKED)).toBe('DENIED');
    });

    it('should return DENIED for INVITED membership', () => {
      expect(service.getEmergencyPolicy(MembershipStatus.INVITED)).toBe('DENIED');
    });
  });

  // =========================================================================
  // AC 2, 3, 10: checkSafetyCriticalAccess - ACTIVE membership
  // =========================================================================

  describe('checkSafetyCriticalAccess - ACTIVE membership', () => {
    it('should allow panic button for ACTIVE membership with ACTIVE subscription', async () => {
      vi.mocked(mockMembershipResolver.getMembershipStatus).mockResolvedValue({
        status: MembershipStatus.ACTIVE,
        membershipId: 'membership-123',
      });
      vi.mocked(mockSubscriptionResolver.getSubscriptionStatus).mockResolvedValue(
        SubscriptionStatus.ACTIVE,
      );

      const request = createTestRequest();
      const result = await service.checkSafetyCriticalAccess(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(true);
        expect(result.data.operationCode).toBe(SafetyCriticalOperationCode.PANIC_BUTTON_ACTIVATE);
        expect(result.data.requiresElevatedAudit).toBe(false);
        expect(result.data.alertBillingTeam).toBe(false);
        expect(result.data.alertAdminTeam).toBe(false);
        expect(result.data.membershipStatus).toBe(MembershipStatus.ACTIVE);
      }
    });

    it('should allow emergency alert for ACTIVE membership with ACTIVE subscription', async () => {
      vi.mocked(mockMembershipResolver.getMembershipStatus).mockResolvedValue({
        status: MembershipStatus.ACTIVE,
        membershipId: 'membership-123',
      });
      vi.mocked(mockSubscriptionResolver.getSubscriptionStatus).mockResolvedValue(
        SubscriptionStatus.ACTIVE,
      );

      const request = createTestRequest({
        operationCode: SafetyCriticalOperationCode.EMERGENCY_ALERT_CREATE,
      });
      const result = await service.checkSafetyCriticalAccess(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(true);
        expect(result.data.operationCode).toBe(SafetyCriticalOperationCode.EMERGENCY_ALERT_CREATE);
      }
    });

    it('should allow alarm trigger for ACTIVE membership with ACTIVE subscription', async () => {
      vi.mocked(mockMembershipResolver.getMembershipStatus).mockResolvedValue({
        status: MembershipStatus.ACTIVE,
        membershipId: 'membership-123',
      });
      vi.mocked(mockSubscriptionResolver.getSubscriptionStatus).mockResolvedValue(
        SubscriptionStatus.ACTIVE,
      );

      const request = createTestRequest({
        operationCode: SafetyCriticalOperationCode.ALARM_TRIGGER,
      });
      const result = await service.checkSafetyCriticalAccess(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(true);
        expect(result.data.operationCode).toBe(SafetyCriticalOperationCode.ALARM_TRIGGER);
      }
    });
  });

  // =========================================================================
  // AC 2: Bypass subscription status for SUSPENDED subscription
  // =========================================================================

  describe('checkSafetyCriticalAccess - SUSPENDED subscription (AC 2, AC 5)', () => {
    it('should allow emergency for ACTIVE membership during SUSPENDED subscription', async () => {
      vi.mocked(mockMembershipResolver.getMembershipStatus).mockResolvedValue({
        status: MembershipStatus.ACTIVE,
        membershipId: 'membership-123',
      });
      vi.mocked(mockSubscriptionResolver.getSubscriptionStatus).mockResolvedValue(
        SubscriptionStatus.SUSPENDED,
      );

      const request = createTestRequest();
      const result = await service.checkSafetyCriticalAccess(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(true);
        expect(result.data.subscriptionStatus).toBe(SubscriptionStatus.SUSPENDED);
        expect(result.data.alertBillingTeam).toBe(true); // AC 5
        expect(result.data.requiresElevatedAudit).toBe(true);
      }
    });
  });

  // =========================================================================
  // AC 10: SUSPENDED membership - emergency ALLOWED with audit (L10)
  // =========================================================================

  describe('checkSafetyCriticalAccess - SUSPENDED membership (AC 10, L10)', () => {
    it('should allow emergency for SUSPENDED membership with elevated audit', async () => {
      vi.mocked(mockMembershipResolver.getMembershipStatus).mockResolvedValue({
        status: MembershipStatus.SUSPENDED,
        membershipId: 'membership-123',
      });
      vi.mocked(mockSubscriptionResolver.getSubscriptionStatus).mockResolvedValue(
        SubscriptionStatus.ACTIVE,
      );

      const request = createTestRequest();
      const result = await service.checkSafetyCriticalAccess(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(true);
        expect(result.data.membershipStatus).toBe(MembershipStatus.SUSPENDED);
        expect(result.data.requiresElevatedAudit).toBe(true);
        expect(result.data.alertAdminTeam).toBe(true); // AC 11
      }
    });

    it('should allow emergency for SUSPENDED membership during SUSPENDED subscription', async () => {
      vi.mocked(mockMembershipResolver.getMembershipStatus).mockResolvedValue({
        status: MembershipStatus.SUSPENDED,
        membershipId: 'membership-123',
      });
      vi.mocked(mockSubscriptionResolver.getSubscriptionStatus).mockResolvedValue(
        SubscriptionStatus.SUSPENDED,
      );

      const request = createTestRequest();
      const result = await service.checkSafetyCriticalAccess(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(true);
        expect(result.data.alertBillingTeam).toBe(true); // AC 5
        expect(result.data.alertAdminTeam).toBe(true); // AC 11
      }
    });
  });

  // =========================================================================
  // AC 10: REVOKED membership - emergency DENIED
  // =========================================================================

  describe('checkSafetyCriticalAccess - REVOKED membership (AC 10)', () => {
    it('should deny emergency for REVOKED membership', async () => {
      vi.mocked(mockMembershipResolver.getMembershipStatus).mockResolvedValue({
        status: MembershipStatus.REVOKED,
        membershipId: 'membership-123',
      });
      vi.mocked(mockSubscriptionResolver.getSubscriptionStatus).mockResolvedValue(
        SubscriptionStatus.ACTIVE,
      );

      const request = createTestRequest();
      const result = await service.checkSafetyCriticalAccess(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(false);
        expect(result.data.denialReason).toBe('MEMBERSHIP_REVOKED');
        expect(result.data.membershipStatus).toBe(MembershipStatus.REVOKED);
      }
    });

    it('should deny panic button for REVOKED membership even with ACTIVE subscription', async () => {
      vi.mocked(mockMembershipResolver.getMembershipStatus).mockResolvedValue({
        status: MembershipStatus.REVOKED,
        membershipId: 'membership-123',
      });
      vi.mocked(mockSubscriptionResolver.getSubscriptionStatus).mockResolvedValue(
        SubscriptionStatus.ACTIVE,
      );

      const request = createTestRequest();
      const result = await service.checkSafetyCriticalAccess(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(false);
        expect(result.data.denialReason).toBe('MEMBERSHIP_REVOKED');
      }
    });
  });

  // =========================================================================
  // AC 10: INVITED membership - emergency DENIED
  // =========================================================================

  describe('checkSafetyCriticalAccess - INVITED membership (AC 10)', () => {
    it('should deny emergency for INVITED membership', async () => {
      vi.mocked(mockMembershipResolver.getMembershipStatus).mockResolvedValue({
        status: MembershipStatus.INVITED,
        membershipId: 'membership-123',
      });
      vi.mocked(mockSubscriptionResolver.getSubscriptionStatus).mockResolvedValue(
        SubscriptionStatus.ACTIVE,
      );

      const request = createTestRequest();
      const result = await service.checkSafetyCriticalAccess(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(false);
        expect(result.data.denialReason).toBe('MEMBERSHIP_INVITED');
        expect(result.data.membershipStatus).toBe(MembershipStatus.INVITED);
      }
    });
  });

  // =========================================================================
  // AC 3: No membership - emergency DENIED
  // =========================================================================

  describe('checkSafetyCriticalAccess - No membership (AC 3)', () => {
    it('should deny emergency when no membership exists', async () => {
      vi.mocked(mockMembershipResolver.getMembershipStatus).mockResolvedValue(null);
      vi.mocked(mockSubscriptionResolver.getSubscriptionStatus).mockResolvedValue(
        SubscriptionStatus.ACTIVE,
      );

      const request = createTestRequest();
      const result = await service.checkSafetyCriticalAccess(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(false);
        expect(result.data.denialReason).toBe('NO_TENANT_MEMBERSHIP');
        expect(result.data.membershipStatus).toBe('NONE');
      }
    });
  });

  // =========================================================================
  // CLOSED subscription - emergency DENIED
  // =========================================================================

  describe('checkSafetyCriticalAccess - CLOSED subscription', () => {
    it('should deny emergency when subscription is CLOSED (tenant terminated)', async () => {
      vi.mocked(mockMembershipResolver.getMembershipStatus).mockResolvedValue({
        status: MembershipStatus.ACTIVE,
        membershipId: 'membership-123',
      });
      vi.mocked(mockSubscriptionResolver.getSubscriptionStatus).mockResolvedValue(
        SubscriptionStatus.CLOSED,
      );

      const request = createTestRequest();
      const result = await service.checkSafetyCriticalAccess(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(false);
        expect(result.data.denialReason).toBe('TENANT_CLOSED');
        expect(result.data.subscriptionStatus).toBe(SubscriptionStatus.CLOSED);
      }
    });
  });

  // =========================================================================
  // AC 7: Invalid operation code - reject and log security event
  // =========================================================================

  describe('checkSafetyCriticalAccess - Invalid operation (AC 7)', () => {
    it('should reject non-safety-critical operation claiming to be safety-critical', async () => {
      vi.mocked(mockMembershipResolver.getMembershipStatus).mockResolvedValue({
        status: MembershipStatus.ACTIVE,
        membershipId: 'membership-123',
      });

      const request = createTestRequest({
        operationCode: 'resident:create' as SafetyCriticalOperationCode,
      });
      const result = await service.checkSafetyCriticalAccess(request);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_SAFETY_CRITICAL_OPERATION');
      }
    });

    it('should log security event when invalid operation claims to be safety-critical', async () => {
      const request = createTestRequest({
        operationCode: 'finance:read' as SafetyCriticalOperationCode,
      });
      await service.checkSafetyCriticalAccess(request);

      expect(mockSecurityEventLogger.logInvalidSafetyCriticalClaim).toHaveBeenCalledWith(
        expect.objectContaining({
          claimedOperationCode: 'finance:read',
          userId: 'user-123',
          tenantId: 'tenant-123',
          correlationId: 'corr-123',
        }),
      );
    });
  });

  // =========================================================================
  // AC 4, 8: executeSafetyCriticalOperation - Audit and Queue
  // =========================================================================

  describe('executeSafetyCriticalOperation (AC 4, AC 8)', () => {
    it('should log operation with elevated audit (AC 4)', async () => {
      const request = createTestRequest();
      const checkResult = {
        allowed: true,
        operationCode: SafetyCriticalOperationCode.PANIC_BUTTON_ACTIVATE,
        requiresElevatedAudit: true,
        alertBillingTeam: false,
        alertAdminTeam: false,
        membershipStatus: MembershipStatus.ACTIVE,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
      };

      await service.executeSafetyCriticalOperation(request, checkResult);

      expect(mockAuditLogger.logSafetyCriticalOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          auditType: 'SAFETY_CRITICAL',
          operationCode: SafetyCriticalOperationCode.PANIC_BUTTON_ACTIVATE,
          userId: 'user-123',
          tenantId: 'tenant-123',
          membershipId: 'membership-123',
          membershipStatus: MembershipStatus.ACTIVE,
          allowed: true,
          correlationId: 'corr-123',
        }),
      );
    });

    it('should enqueue to emergency queue (AC 8)', async () => {
      const request = createTestRequest();
      const checkResult = {
        allowed: true,
        operationCode: SafetyCriticalOperationCode.PANIC_BUTTON_ACTIVATE,
        requiresElevatedAudit: true,
        alertBillingTeam: false,
        alertAdminTeam: false,
        membershipStatus: MembershipStatus.ACTIVE,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
      };

      const result = await service.executeSafetyCriticalOperation(request, checkResult);

      expect(mockEmergencyQueue.enqueueEmergencyOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          operationCode: SafetyCriticalOperationCode.PANIC_BUTTON_ACTIVATE,
          userId: 'user-123',
          tenantId: 'tenant-123',
          membershipId: 'membership-123',
          correlationId: 'corr-123',
          retryAttempt: 0,
          priority: 1,
        }),
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.messageId).toBe('msg-123');
      }
    });
  });

  // =========================================================================
  // AC 5: Alert billing team during SUSPENDED subscription
  // =========================================================================

  describe('executeSafetyCriticalOperation - Billing Alert (AC 5)', () => {
    it('should emit billing alert when emergency during SUSPENDED subscription', async () => {
      const request = createTestRequest();
      const checkResult = {
        allowed: true,
        operationCode: SafetyCriticalOperationCode.PANIC_BUTTON_ACTIVATE,
        requiresElevatedAudit: true,
        alertBillingTeam: true,
        alertAdminTeam: false,
        membershipStatus: MembershipStatus.ACTIVE,
        subscriptionStatus: SubscriptionStatus.SUSPENDED,
      };

      await service.executeSafetyCriticalOperation(request, checkResult);

      expect(mockBillingAlertEmitter.emitEmergencyDuringSubscriptionSuspension).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          tenantId: 'tenant-123',
          operationCode: SafetyCriticalOperationCode.PANIC_BUTTON_ACTIVATE,
          correlationId: 'corr-123',
        }),
      );
    });

    it('should NOT emit billing alert when subscription is ACTIVE', async () => {
      const request = createTestRequest();
      const checkResult = {
        allowed: true,
        operationCode: SafetyCriticalOperationCode.PANIC_BUTTON_ACTIVATE,
        requiresElevatedAudit: false,
        alertBillingTeam: false,
        alertAdminTeam: false,
        membershipStatus: MembershipStatus.ACTIVE,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
      };

      await service.executeSafetyCriticalOperation(request, checkResult);

      expect(mockBillingAlertEmitter.emitEmergencyDuringSubscriptionSuspension).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // AC 11: Alert admin team during SUSPENDED membership
  // =========================================================================

  describe('executeSafetyCriticalOperation - Admin Alert (AC 11)', () => {
    it('should emit admin alert when emergency during SUSPENDED membership', async () => {
      const request = createTestRequest();
      const checkResult = {
        allowed: true,
        operationCode: SafetyCriticalOperationCode.PANIC_BUTTON_ACTIVATE,
        requiresElevatedAudit: true,
        alertBillingTeam: false,
        alertAdminTeam: true,
        membershipStatus: MembershipStatus.SUSPENDED,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
      };

      await service.executeSafetyCriticalOperation(request, checkResult);

      expect(mockAdminAlertEmitter.emitEmergencyDuringMembershipSuspension).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          tenantId: 'tenant-123',
          membershipId: 'membership-123',
          operationCode: SafetyCriticalOperationCode.PANIC_BUTTON_ACTIVATE,
          correlationId: 'corr-123',
        }),
      );
    });

    it('should NOT emit admin alert when membership is ACTIVE', async () => {
      const request = createTestRequest();
      const checkResult = {
        allowed: true,
        operationCode: SafetyCriticalOperationCode.PANIC_BUTTON_ACTIVATE,
        requiresElevatedAudit: false,
        alertBillingTeam: false,
        alertAdminTeam: false,
        membershipStatus: MembershipStatus.ACTIVE,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
      };

      await service.executeSafetyCriticalOperation(request, checkResult);

      expect(mockAdminAlertEmitter.emitEmergencyDuringMembershipSuspension).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // executeSafetyCriticalOperation - Denied operations
  // =========================================================================

  describe('executeSafetyCriticalOperation - Denied', () => {
    it('should return error when check result is not allowed', async () => {
      const request = createTestRequest();
      const checkResult = {
        allowed: false,
        operationCode: SafetyCriticalOperationCode.PANIC_BUTTON_ACTIVATE,
        requiresElevatedAudit: true,
        alertBillingTeam: false,
        alertAdminTeam: false,
        denialReason: 'MEMBERSHIP_REVOKED' as const,
        membershipStatus: MembershipStatus.REVOKED,
      };

      const result = await service.executeSafetyCriticalOperation(request, checkResult);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('EMERGENCY_ACCESS_DENIED_MEMBERSHIP_REVOKED');
      }
    });

    it('should still log denied operations for audit', async () => {
      const request = createTestRequest();
      const checkResult = {
        allowed: false,
        operationCode: SafetyCriticalOperationCode.PANIC_BUTTON_ACTIVATE,
        requiresElevatedAudit: true,
        alertBillingTeam: false,
        alertAdminTeam: false,
        denialReason: 'MEMBERSHIP_REVOKED' as const,
        membershipStatus: MembershipStatus.REVOKED,
      };

      await service.executeSafetyCriticalOperation(request, checkResult);

      expect(mockAuditLogger.logSafetyCriticalOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          allowed: false,
          denialReason: 'MEMBERSHIP_REVOKED',
        }),
      );
    });
  });
});

// =========================================================================
// Type Helper Tests (isSafetyCriticalOperationCode)
// =========================================================================

describe('isSafetyCriticalOperationCode', () => {
  it('should return true for all defined safety-critical operations', () => {
    expect(isSafetyCriticalOperationCode('emergency_alert:create')).toBe(true);
    expect(isSafetyCriticalOperationCode('alarm:trigger')).toBe(true);
    expect(isSafetyCriticalOperationCode('panic_button:activate')).toBe(true);
  });

  it('should return false for non-safety-critical operations', () => {
    expect(isSafetyCriticalOperationCode('resident:read')).toBe(false);
    expect(isSafetyCriticalOperationCode('finance:write')).toBe(false);
    expect(isSafetyCriticalOperationCode('')).toBe(false);
    expect(isSafetyCriticalOperationCode('random:operation')).toBe(false);
  });
});

// =========================================================================
// Emergency Status Sets Tests
// =========================================================================

describe('Emergency Status Sets', () => {
  describe('EMERGENCY_ALLOWED_STATUSES', () => {
    it('should include ACTIVE', () => {
      expect(EMERGENCY_ALLOWED_STATUSES.has('ACTIVE')).toBe(true);
    });

    it('should include SUSPENDED', () => {
      expect(EMERGENCY_ALLOWED_STATUSES.has('SUSPENDED')).toBe(true);
    });

    it('should NOT include REVOKED', () => {
      expect(EMERGENCY_ALLOWED_STATUSES.has('REVOKED')).toBe(false);
    });

    it('should NOT include INVITED', () => {
      expect(EMERGENCY_ALLOWED_STATUSES.has('INVITED')).toBe(false);
    });
  });

  describe('EMERGENCY_DENIED_STATUSES', () => {
    it('should include REVOKED', () => {
      expect(EMERGENCY_DENIED_STATUSES.has('REVOKED')).toBe(true);
    });

    it('should include INVITED', () => {
      expect(EMERGENCY_DENIED_STATUSES.has('INVITED')).toBe(true);
    });

    it('should NOT include ACTIVE', () => {
      expect(EMERGENCY_DENIED_STATUSES.has('ACTIVE')).toBe(false);
    });

    it('should NOT include SUSPENDED', () => {
      expect(EMERGENCY_DENIED_STATUSES.has('SUSPENDED')).toBe(false);
    });
  });
});
