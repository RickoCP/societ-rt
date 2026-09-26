/**
 * HouseholdIsolationService Unit Tests
 *
 * Tests for household data isolation enforcement including:
 * - Tenant ownership validation (INV-HOUSEHOLD-001)
 * - Household head authorization
 * - Member access control
 * - Cross-household isolation
 *
 * @see Task 55: Household Isolation Enforcement
 * @see INV-HOUSEHOLD-001: Household.tenantId == Resident.tenantId
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IHouseholdRepository } from '../../repositories';
import type {
  IHouseholdIsolationAuditEmitter,
  HouseholdIsolationAuditEvent,
} from '../HouseholdIsolationService';
import {
  HouseholdIsolationServiceImpl,
  HouseholdAccessReason,
  HouseholdIsolationAuditEventType,
} from '../HouseholdIsolationService';
import type { Household } from '@core/domains/resident/entities';
import type { HouseholdMember } from '../../entities';

// ---------------------------------------------------------------------------
// Test Data
// ---------------------------------------------------------------------------

const TEST_TENANT_ID = 'tenant-001';
const TEST_TENANT_ID_2 = 'tenant-002';
const TEST_HOUSEHOLD_ID = 'household-001';
const TEST_HOUSEHOLD_ID_2 = 'household-002';
const TEST_USER_ID = 'user-001';
const TEST_USER_ID_2 = 'user-002';
const TEST_USER_HEAD = 'user-head-001';
const TEST_RESIDENT_ID = 'resident-001';

const createTestHousehold = (
  id: string = TEST_HOUSEHOLD_ID,
  tenantId: string = TEST_TENANT_ID,
): Household => ({
  id,
  tenantId,
  householdNumber: 'HH-001',
  address: '123 Test Street',
  block: 'A',
  latitude: 0,
  longitude: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const createTestMember = (
  residentId: string,
  userId: string | null,
  householdId: string = TEST_HOUSEHOLD_ID,
  tenantId: string = TEST_TENANT_ID,
  isHead: boolean = false,
): HouseholdMember => ({
  residentId,
  userId,
  tenantId,
  householdId,
  isHead,
});

// ---------------------------------------------------------------------------
// Mock Repository
// ---------------------------------------------------------------------------

const createMockRepository = (): IHouseholdRepository & {
  findById: ReturnType<typeof vi.fn>;
  exists: ReturnType<typeof vi.fn>;
  findWithHead: ReturnType<typeof vi.fn>;
  getMembers: ReturnType<typeof vi.fn>;
  findHead: ReturnType<typeof vi.fn>;
  isUserMember: ReturnType<typeof vi.fn>;
  isUserHead: ReturnType<typeof vi.fn>;
  findByUserId: ReturnType<typeof vi.fn>;
  findResidentById: ReturnType<typeof vi.fn>;
  getResidentHouseholdId: ReturnType<typeof vi.fn>;
  validateTenantOwnership: ReturnType<typeof vi.fn>;
  validateResidentHouseholdTenant: ReturnType<typeof vi.fn>;
} => ({
  findById: vi.fn(),
  exists: vi.fn(),
  findWithHead: vi.fn(),
  getMembers: vi.fn(),
  findHead: vi.fn(),
  isUserMember: vi.fn(),
  isUserHead: vi.fn(),
  findByUserId: vi.fn(),
  findResidentById: vi.fn(),
  getResidentHouseholdId: vi.fn(),
  validateTenantOwnership: vi.fn(),
  validateResidentHouseholdTenant: vi.fn(),
});

// ---------------------------------------------------------------------------
// Mock Audit Emitter
// ---------------------------------------------------------------------------

const createMockAuditEmitter = (): IHouseholdIsolationAuditEmitter & {
  emittedEvents: HouseholdIsolationAuditEvent[];
  emit: ReturnType<typeof vi.fn>;
} => {
  const emittedEvents: HouseholdIsolationAuditEvent[] = [];
  return {
    emittedEvents,
    emit: vi.fn().mockImplementation(async (event: HouseholdIsolationAuditEvent) => {
      emittedEvents.push(event);
    }),
  };
};

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('HouseholdIsolationService', () => {
  let mockRepository: ReturnType<typeof createMockRepository>;
  let mockAuditEmitter: ReturnType<typeof createMockAuditEmitter>;
  let service: ReturnType<typeof HouseholdIsolationServiceImpl>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepository = createMockRepository();
    mockAuditEmitter = createMockAuditEmitter();
    service = HouseholdIsolationServiceImpl({
      householdRepository: mockRepository,
      auditEmitter: mockAuditEmitter,
    });
  });

  // -------------------------------------------------------------------------
  // Tenant Ownership Validation Tests (INV-HOUSEHOLD-001)
  // -------------------------------------------------------------------------

  describe('validateTenantOwnership', () => {
    it('should return success when household belongs to the expected tenant', async () => {
      const household = createTestHousehold();
      mockRepository.findById.mockResolvedValue(household);

      const result = await service.validateTenantOwnership(TEST_HOUSEHOLD_ID, TEST_TENANT_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
      expect(mockRepository.findById).toHaveBeenCalledWith(TEST_HOUSEHOLD_ID, TEST_TENANT_ID);
      expect(mockAuditEmitter.emittedEvents).toHaveLength(1);
      expect(mockAuditEmitter.emittedEvents[0].type).toBe(
        HouseholdIsolationAuditEventType.TENANT_OWNERSHIP_VALIDATED,
      );
    });

    it('should return error when household is not found', async () => {
      mockRepository.findById.mockResolvedValue(null);

      const result = await service.validateTenantOwnership(TEST_HOUSEHOLD_ID, TEST_TENANT_ID);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('HOUSEHOLD_NOT_FOUND');
      }
      expect(mockAuditEmitter.emittedEvents).toHaveLength(1);
      expect(mockAuditEmitter.emittedEvents[0].type).toBe(
        HouseholdIsolationAuditEventType.TENANT_OWNERSHIP_FAILED,
      );
    });

    it('should return error when household tenant ID does not match', async () => {
      // Household exists but with different tenant ID
      const household = createTestHousehold(TEST_HOUSEHOLD_ID, TEST_TENANT_ID_2);
      mockRepository.findById.mockResolvedValue(household);

      const result = await service.validateTenantOwnership(TEST_HOUSEHOLD_ID, TEST_TENANT_ID);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('HOUSEHOLD_TENANT_MISMATCH');
      }
    });
  });

  describe('validateHouseholdResidentsTenant', () => {
    it('should return success when all residents belong to the same tenant', async () => {
      const household = createTestHousehold();
      mockRepository.findById.mockResolvedValue(household);
      
      const members: HouseholdMember[] = [
        createTestMember('resident-1', 'user-1', TEST_HOUSEHOLD_ID, TEST_TENANT_ID, true),
        createTestMember('resident-2', 'user-2', TEST_HOUSEHOLD_ID, TEST_TENANT_ID, false),
      ];
      mockRepository.getMembers.mockResolvedValue(members);

      const result = await service.validateHouseholdResidentsTenant(TEST_HOUSEHOLD_ID, TEST_TENANT_ID);

      expect(result.success).toBe(true);
    });

    it('should return error when a resident has mismatched tenant (INV-HOUSEHOLD-001 violation)', async () => {
      const household = createTestHousehold();
      mockRepository.findById.mockResolvedValue(household);
      
      // One member has different tenant - invariant violation
      const members: HouseholdMember[] = [
        createTestMember('resident-1', 'user-1', TEST_HOUSEHOLD_ID, TEST_TENANT_ID, true),
        createTestMember('resident-2', 'user-2', TEST_HOUSEHOLD_ID, TEST_TENANT_ID_2, false), // Different tenant!
      ];
      mockRepository.getMembers.mockResolvedValue(members);

      const result = await service.validateHouseholdResidentsTenant(TEST_HOUSEHOLD_ID, TEST_TENANT_ID);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('HOUSEHOLD_INVARIANT_VIOLATION');
      }
      
      // Check audit event was emitted for invariant violation
      const violationEvent = mockAuditEmitter.emittedEvents.find(
        (e) => e.type === HouseholdIsolationAuditEventType.INVARIANT_VIOLATION,
      );
      expect(violationEvent).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Household Head Authorization Tests
  // -------------------------------------------------------------------------

  describe('checkIsHouseholdHead', () => {
    it('should return true when user is the household head', async () => {
      const household = createTestHousehold();
      mockRepository.findById.mockResolvedValue(household);
      mockRepository.isUserHead.mockResolvedValue(true);

      const result = await service.checkIsHouseholdHead(TEST_USER_HEAD, TEST_HOUSEHOLD_ID, TEST_TENANT_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });

    it('should return false when user is not the household head', async () => {
      const household = createTestHousehold();
      mockRepository.findById.mockResolvedValue(household);
      mockRepository.isUserHead.mockResolvedValue(false);

      const result = await service.checkIsHouseholdHead(TEST_USER_ID, TEST_HOUSEHOLD_ID, TEST_TENANT_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });

    it('should return error when household does not exist', async () => {
      mockRepository.findById.mockResolvedValue(null);

      const result = await service.checkIsHouseholdHead(TEST_USER_ID, TEST_HOUSEHOLD_ID, TEST_TENANT_ID);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('HOUSEHOLD_NOT_FOUND');
      }
    });
  });

  describe('authorizeHouseholdHead', () => {
    it('should succeed when user is the household head', async () => {
      const household = createTestHousehold();
      mockRepository.findById.mockResolvedValue(household);
      mockRepository.isUserHead.mockResolvedValue(true);

      const result = await service.authorizeHouseholdHead(TEST_USER_HEAD, TEST_HOUSEHOLD_ID, TEST_TENANT_ID);

      expect(result.success).toBe(true);
      
      const grantedEvent = mockAuditEmitter.emittedEvents.find(
        (e) => e.type === HouseholdIsolationAuditEventType.HEAD_AUTHORIZATION_GRANTED,
      );
      expect(grantedEvent).toBeDefined();
    });

    it('should fail when user is not the household head', async () => {
      const household = createTestHousehold();
      mockRepository.findById.mockResolvedValue(household);
      mockRepository.isUserHead.mockResolvedValue(false);

      const result = await service.authorizeHouseholdHead(TEST_USER_ID, TEST_HOUSEHOLD_ID, TEST_TENANT_ID);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_HOUSEHOLD_HEAD');
      }
      
      const deniedEvent = mockAuditEmitter.emittedEvents.find(
        (e) => e.type === HouseholdIsolationAuditEventType.HEAD_AUTHORIZATION_DENIED,
      );
      expect(deniedEvent).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Member Access Control Tests
  // -------------------------------------------------------------------------

  describe('checkIsMember', () => {
    it('should return true when user is a household member', async () => {
      const household = createTestHousehold();
      mockRepository.findById.mockResolvedValue(household);
      mockRepository.isUserMember.mockResolvedValue(true);

      const result = await service.checkIsMember(TEST_USER_ID, TEST_HOUSEHOLD_ID, TEST_TENANT_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });

    it('should return false when user is not a household member', async () => {
      const household = createTestHousehold();
      mockRepository.findById.mockResolvedValue(household);
      mockRepository.isUserMember.mockResolvedValue(false);

      const result = await service.checkIsMember(TEST_USER_ID_2, TEST_HOUSEHOLD_ID, TEST_TENANT_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });
  });

  describe('validateHouseholdAccess', () => {
    it('should grant access when user is the household head', async () => {
      const household = createTestHousehold();
      mockRepository.findById.mockResolvedValue(household);
      mockRepository.isUserHead.mockResolvedValue(true);

      const result = await service.validateHouseholdAccess({
        userId: TEST_USER_HEAD,
        householdId: TEST_HOUSEHOLD_ID,
        tenantId: TEST_TENANT_ID,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(true);
        expect(result.data.reason).toBe(HouseholdAccessReason.IS_HOUSEHOLD_HEAD);
        expect(result.data.isHead).toBe(true);
        expect(result.data.isMember).toBe(true);
        expect(result.data.isAdminAccess).toBe(false);
      }
    });

    it('should grant access when user is a household member', async () => {
      const household = createTestHousehold();
      mockRepository.findById.mockResolvedValue(household);
      mockRepository.isUserHead.mockResolvedValue(false);
      mockRepository.isUserMember.mockResolvedValue(true);

      const result = await service.validateHouseholdAccess({
        userId: TEST_USER_ID,
        householdId: TEST_HOUSEHOLD_ID,
        tenantId: TEST_TENANT_ID,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(true);
        expect(result.data.reason).toBe(HouseholdAccessReason.IS_HOUSEHOLD_MEMBER);
        expect(result.data.isHead).toBe(false);
        expect(result.data.isMember).toBe(true);
      }
    });

    it('should grant access when user has admin role', async () => {
      const household = createTestHousehold();
      mockRepository.findById.mockResolvedValue(household);
      mockRepository.isUserHead.mockResolvedValue(false);
      mockRepository.isUserMember.mockResolvedValue(false);

      const result = await service.validateHouseholdAccess({
        userId: TEST_USER_ID,
        householdId: TEST_HOUSEHOLD_ID,
        tenantId: TEST_TENANT_ID,
        userRole: 'RT_ADMIN' as any,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(true);
        expect(result.data.reason).toBe(HouseholdAccessReason.ADMIN_SCOPE_ACCESS);
        expect(result.data.isAdminAccess).toBe(true);
      }

      const adminEvent = mockAuditEmitter.emittedEvents.find(
        (e) => e.type === HouseholdIsolationAuditEventType.ADMIN_OVERRIDE_GRANTED,
      );
      expect(adminEvent).toBeDefined();
    });

    it('should deny access when user is not a member and has no admin role', async () => {
      const household = createTestHousehold();
      mockRepository.findById.mockResolvedValue(household);
      mockRepository.isUserHead.mockResolvedValue(false);
      mockRepository.isUserMember.mockResolvedValue(false);

      const result = await service.validateHouseholdAccess({
        userId: TEST_USER_ID,
        householdId: TEST_HOUSEHOLD_ID,
        tenantId: TEST_TENANT_ID,
        userRole: 'RESIDENT' as any, // RESIDENT is not an admin role
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(false);
        expect(result.data.reason).toBe(HouseholdAccessReason.NOT_A_MEMBER);
      }
    });

    it('should return household not found when household does not exist', async () => {
      mockRepository.findById.mockResolvedValue(null);

      const result = await service.validateHouseholdAccess({
        userId: TEST_USER_ID,
        householdId: TEST_HOUSEHOLD_ID,
        tenantId: TEST_TENANT_ID,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(false);
        expect(result.data.reason).toBe(HouseholdAccessReason.HOUSEHOLD_NOT_FOUND);
      }
    });
  });

  describe('authorizeHouseholdAccess', () => {
    it('should succeed when access is allowed', async () => {
      const household = createTestHousehold();
      mockRepository.findById.mockResolvedValue(household);
      mockRepository.isUserHead.mockResolvedValue(true);

      const result = await service.authorizeHouseholdAccess({
        userId: TEST_USER_HEAD,
        householdId: TEST_HOUSEHOLD_ID,
        tenantId: TEST_TENANT_ID,
      });

      expect(result.success).toBe(true);
      
      const grantedEvent = mockAuditEmitter.emittedEvents.find(
        (e) => e.type === HouseholdIsolationAuditEventType.MEMBER_ACCESS_GRANTED,
      );
      expect(grantedEvent).toBeDefined();
    });

    it('should fail with appropriate error when access is denied', async () => {
      const household = createTestHousehold();
      mockRepository.findById.mockResolvedValue(household);
      mockRepository.isUserHead.mockResolvedValue(false);
      mockRepository.isUserMember.mockResolvedValue(false);

      const result = await service.authorizeHouseholdAccess({
        userId: TEST_USER_ID,
        householdId: TEST_HOUSEHOLD_ID,
        tenantId: TEST_TENANT_ID,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_HOUSEHOLD_MEMBER');
      }

      const deniedEvent = mockAuditEmitter.emittedEvents.find(
        (e) => e.type === HouseholdIsolationAuditEventType.MEMBER_ACCESS_DENIED,
      );
      expect(deniedEvent).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Cross-Household Isolation Tests
  // -------------------------------------------------------------------------

  describe('validateCrossHouseholdIsolation', () => {
    it('should allow access when source and target households are the same', async () => {
      const result = await service.validateCrossHouseholdIsolation({
        userId: TEST_USER_ID,
        sourceHouseholdId: TEST_HOUSEHOLD_ID,
        targetHouseholdId: TEST_HOUSEHOLD_ID,
        tenantId: TEST_TENANT_ID,
      });

      expect(result.success).toBe(true);
    });

    it('should allow cross-household access for admin roles', async () => {
      const result = await service.validateCrossHouseholdIsolation({
        userId: TEST_USER_ID,
        sourceHouseholdId: TEST_HOUSEHOLD_ID,
        targetHouseholdId: TEST_HOUSEHOLD_ID_2,
        tenantId: TEST_TENANT_ID,
        userRole: 'TENANT_OWNER' as any,
      });

      expect(result.success).toBe(true);

      const adminEvent = mockAuditEmitter.emittedEvents.find(
        (e) => e.type === HouseholdIsolationAuditEventType.ADMIN_OVERRIDE_GRANTED,
      );
      expect(adminEvent).toBeDefined();
    });

    it('should deny cross-household access for non-admin users', async () => {
      const result = await service.validateCrossHouseholdIsolation({
        userId: TEST_USER_ID,
        sourceHouseholdId: TEST_HOUSEHOLD_ID,
        targetHouseholdId: TEST_HOUSEHOLD_ID_2,
        tenantId: TEST_TENANT_ID,
        userRole: 'RESIDENT' as any,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CROSS_HOUSEHOLD_ACCESS_DENIED');
      }

      const deniedEvent = mockAuditEmitter.emittedEvents.find(
        (e) => e.type === HouseholdIsolationAuditEventType.CROSS_HOUSEHOLD_ACCESS_DENIED,
      );
      expect(deniedEvent).toBeDefined();
    });

    it('should deny cross-household access when no role is provided', async () => {
      const result = await service.validateCrossHouseholdIsolation({
        userId: TEST_USER_ID,
        sourceHouseholdId: TEST_HOUSEHOLD_ID,
        targetHouseholdId: TEST_HOUSEHOLD_ID_2,
        tenantId: TEST_TENANT_ID,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CROSS_HOUSEHOLD_ACCESS_DENIED');
      }
    });
  });

  describe('validateResourceHouseholdAccess', () => {
    it('should allow access when resource is in user household', async () => {
      const household = createTestHousehold();
      mockRepository.findById.mockResolvedValue(household);

      const result = await service.validateResourceHouseholdAccess(
        TEST_HOUSEHOLD_ID,
        TEST_HOUSEHOLD_ID,
        TEST_USER_ID,
        TEST_TENANT_ID,
      );

      expect(result.success).toBe(true);
    });

    it('should allow access when user is member of resource household', async () => {
      const household = createTestHousehold();
      mockRepository.findById.mockResolvedValue(household);
      mockRepository.isUserMember.mockResolvedValue(true);

      const result = await service.validateResourceHouseholdAccess(
        TEST_HOUSEHOLD_ID,
        TEST_HOUSEHOLD_ID_2, // Different household
        TEST_USER_ID,
        TEST_TENANT_ID,
      );

      expect(result.success).toBe(true);
    });

    it('should deny access when resource is in different household and user is not member or admin', async () => {
      const household = createTestHousehold();
      mockRepository.findById.mockResolvedValue(household);
      mockRepository.isUserMember.mockResolvedValue(false);

      const result = await service.validateResourceHouseholdAccess(
        TEST_HOUSEHOLD_ID,
        TEST_HOUSEHOLD_ID_2,
        TEST_USER_ID,
        TEST_TENANT_ID,
        'RESIDENT' as any,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('RESOURCE_BELONGS_TO_DIFFERENT_HOUSEHOLD');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Utility Methods Tests
  // -------------------------------------------------------------------------

  describe('getUserHouseholds', () => {
    it('should return households for a user', async () => {
      const households = [createTestHousehold()];
      mockRepository.findByUserId.mockResolvedValue(households);

      const result = await service.getUserHouseholds(TEST_USER_ID, TEST_TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(TEST_HOUSEHOLD_ID);
    });

    it('should return empty array when user has no households', async () => {
      mockRepository.findByUserId.mockResolvedValue([]);

      const result = await service.getUserHouseholds(TEST_USER_ID, TEST_TENANT_ID);

      expect(result).toHaveLength(0);
    });
  });

  describe('getHouseholdMembers', () => {
    it('should return members for a valid household', async () => {
      const household = createTestHousehold();
      mockRepository.findById.mockResolvedValue(household);
      const members = [
        createTestMember('resident-1', 'user-1', TEST_HOUSEHOLD_ID, TEST_TENANT_ID, true),
      ];
      mockRepository.getMembers.mockResolvedValue(members);

      const result = await service.getHouseholdMembers(TEST_HOUSEHOLD_ID, TEST_TENANT_ID);

      expect(result).toHaveLength(1);
    });

    it('should return empty array when household does not exist', async () => {
      mockRepository.findById.mockResolvedValue(null);

      const result = await service.getHouseholdMembers(TEST_HOUSEHOLD_ID, TEST_TENANT_ID);

      expect(result).toHaveLength(0);
    });
  });

  describe('isAdminRole', () => {
    it('should return true for PLATFORM_ADMIN', () => {
      expect(service.isAdminRole('PLATFORM_ADMIN' as any)).toBe(true);
    });

    it('should return true for TENANT_OWNER', () => {
      expect(service.isAdminRole('TENANT_OWNER' as any)).toBe(true);
    });

    it('should return true for ORG_ADMIN', () => {
      expect(service.isAdminRole('ORG_ADMIN' as any)).toBe(true);
    });

    it('should return true for RT_ADMIN', () => {
      expect(service.isAdminRole('RT_ADMIN' as any)).toBe(true);
    });

    it('should return false for SECURITY', () => {
      expect(service.isAdminRole('SECURITY' as any)).toBe(false);
    });

    it('should return false for RESIDENT', () => {
      expect(service.isAdminRole('RESIDENT' as any)).toBe(false);
    });
  });
});
