/**
 * IoTDeviceIsolationService Unit Tests
 *
 * Tests for IoT device data isolation enforcement including:
 * - Tenant ownership validation (INV-IOT-001)
 * - Authorization via membership
 * - Cross-tenant prevention
 * - OrgUnit scope validation
 *
 * @see Task 60: IoT Device Isolation Enforcement
 * @see INV-IOT-001: IoTDevice.tenantId must match the accessor's tenant context
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IIoTDeviceIsolationRepository, IoTDeviceWithContext } from '../../repositories';
import type {
  IIoTDeviceIsolationAuditEmitter,
  IoTDeviceIsolationAuditEvent,
} from '../IoTDeviceIsolationService';
import {
  IoTDeviceIsolationServiceImpl,
  IoTDeviceAccessReason,
  IoTDeviceIsolationAuditEventType,
} from '../IoTDeviceIsolationService';
import type { IoTDevice } from '../../entities';
import { ok, fail } from '@core/utils';

// ---------------------------------------------------------------------------
// Test Data
// ---------------------------------------------------------------------------

const TEST_TENANT_ID = 'tenant-001';
const TEST_TENANT_ID_2 = 'tenant-002';
const TEST_DEVICE_ID = 'device-001';
const TEST_DEVICE_ID_2 = 'device-002';
const TEST_USER_ID = 'user-001';
const TEST_USER_ID_2 = 'user-002';
const TEST_USER_HEAD = 'user-head-001';
const TEST_HOUSEHOLD_ID = 'household-001';
const TEST_ORGUNIT_ID = 'orgunit-001';
const TEST_ORGUNIT_ID_2 = 'orgunit-002';

const createTestDevice = (
  id: string = TEST_DEVICE_ID,
  tenantId: string = TEST_TENANT_ID,
  householdId: string = TEST_HOUSEHOLD_ID,
): IoTDevice => ({
  id,
  tenantId,
  householdId,
  tuyaDeviceId: 'tuya-device-001',
  deviceType: 'panic_button',
  name: 'Test Panic Button',
  onlineStatus: 'online',
  batteryLevel: 100,
  lastSeen: new Date(),
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
});

const createTestDeviceWithContext = (
  deviceId: string = TEST_DEVICE_ID,
  tenantId: string = TEST_TENANT_ID,
  householdId: string = TEST_HOUSEHOLD_ID,
  orgUnitId: string | null = TEST_ORGUNIT_ID,
): IoTDeviceWithContext => ({
  device: createTestDevice(deviceId, tenantId, householdId),
  householdId,
  orgUnitId,
});

// ---------------------------------------------------------------------------
// Mock Repository
// ---------------------------------------------------------------------------

const createMockRepository = (): IIoTDeviceIsolationRepository & {
  findById: ReturnType<typeof vi.fn>;
  exists: ReturnType<typeof vi.fn>;
  findWithContext: ReturnType<typeof vi.fn>;
  findByHousehold: ReturnType<typeof vi.fn>;
  isUserHouseholdMember: ReturnType<typeof vi.fn>;
  isUserHouseholdHead: ReturnType<typeof vi.fn>;
  findByUserId: ReturnType<typeof vi.fn>;
  getDeviceOrgUnitId: ReturnType<typeof vi.fn>;
  findByOrgUnit: ReturnType<typeof vi.fn>;
  validateTenantOwnership: ReturnType<typeof vi.fn>;
  validateDeviceHouseholdTenant: ReturnType<typeof vi.fn>;
  getDeviceHouseholdId: ReturnType<typeof vi.fn>;
} => ({
  findById: vi.fn(),
  exists: vi.fn(),
  findWithContext: vi.fn(),
  findByHousehold: vi.fn(),
  isUserHouseholdMember: vi.fn(),
  isUserHouseholdHead: vi.fn(),
  findByUserId: vi.fn(),
  getDeviceOrgUnitId: vi.fn(),
  findByOrgUnit: vi.fn(),
  validateTenantOwnership: vi.fn(),
  validateDeviceHouseholdTenant: vi.fn(),
  getDeviceHouseholdId: vi.fn(),
});

// ---------------------------------------------------------------------------
// Mock Audit Emitter
// ---------------------------------------------------------------------------

const createMockAuditEmitter = (): IIoTDeviceIsolationAuditEmitter & {
  emittedEvents: IoTDeviceIsolationAuditEvent[];
  emit: ReturnType<typeof vi.fn>;
} => {
  const emittedEvents: IoTDeviceIsolationAuditEvent[] = [];
  return {
    emittedEvents,
    emit: vi.fn().mockImplementation(async (event: IoTDeviceIsolationAuditEvent) => {
      emittedEvents.push(event);
    }),
  };
};

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('IoTDeviceIsolationService', () => {
  let mockRepository: ReturnType<typeof createMockRepository>;
  let mockAuditEmitter: ReturnType<typeof createMockAuditEmitter>;
  let service: ReturnType<typeof IoTDeviceIsolationServiceImpl>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepository = createMockRepository();
    mockAuditEmitter = createMockAuditEmitter();
    service = IoTDeviceIsolationServiceImpl({
      iotDeviceIsolationRepository: mockRepository,
      iotDeviceIsolationAuditEmitter: mockAuditEmitter,
    });
  });

  // -------------------------------------------------------------------------
  // Tenant Ownership Validation Tests (INV-IOT-001)
  // -------------------------------------------------------------------------

  describe('validateTenantOwnership', () => {
    it('should return success when device belongs to the expected tenant', async () => {
      const device = createTestDevice();
      mockRepository.findById.mockResolvedValue(device);

      const result = await service.validateTenantOwnership(TEST_DEVICE_ID, TEST_TENANT_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
      expect(mockRepository.findById).toHaveBeenCalledWith(TEST_DEVICE_ID, TEST_TENANT_ID);
      expect(mockAuditEmitter.emittedEvents).toHaveLength(1);
      expect(mockAuditEmitter.emittedEvents[0]!.type).toBe(
        IoTDeviceIsolationAuditEventType.TENANT_OWNERSHIP_VALIDATED,
      );
    });

    it('should return error when device is not found', async () => {
      mockRepository.findById.mockResolvedValue(null);

      const result = await service.validateTenantOwnership(TEST_DEVICE_ID, TEST_TENANT_ID);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('IOT_DEVICE_NOT_FOUND_IN_TENANT');
      }
      expect(mockAuditEmitter.emittedEvents).toHaveLength(1);
      expect(mockAuditEmitter.emittedEvents[0]!.type).toBe(
        IoTDeviceIsolationAuditEventType.TENANT_OWNERSHIP_FAILED,
      );
    });

    it('should return error when device tenant ID does not match', async () => {
      // Device exists but with different tenant ID
      const device = createTestDevice(TEST_DEVICE_ID, TEST_TENANT_ID_2);
      mockRepository.findById.mockResolvedValue(device);

      const result = await service.validateTenantOwnership(TEST_DEVICE_ID, TEST_TENANT_ID);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('IOT_DEVICE_TENANT_MISMATCH');
      }
    });
  });

  describe('validateDeviceHouseholdTenant', () => {
    it('should return success when device and household belong to same tenant', async () => {
      const device = createTestDevice();
      mockRepository.findById.mockResolvedValue(device);
      mockRepository.findWithContext.mockResolvedValue(
        createTestDeviceWithContext(),
      );
      mockRepository.validateDeviceHouseholdTenant.mockResolvedValue(ok(true));

      const result = await service.validateDeviceHouseholdTenant(TEST_DEVICE_ID, TEST_TENANT_ID);

      expect(result.success).toBe(true);
    });

    it('should return error when device and household have mismatched tenants (INV-IOT-001 violation)', async () => {
      const device = createTestDevice();
      mockRepository.findById.mockResolvedValue(device);
      mockRepository.findWithContext.mockResolvedValue(
        createTestDeviceWithContext(),
      );
      mockRepository.validateDeviceHouseholdTenant.mockResolvedValue(
        fail({ code: 'TENANT_MISMATCH', message: 'Tenant mismatch' }),
      );

      const result = await service.validateDeviceHouseholdTenant(TEST_DEVICE_ID, TEST_TENANT_ID);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('IOT_DEVICE_INVARIANT_VIOLATION');
      }

      // Check audit event was emitted for invariant violation
      const violationEvent = mockAuditEmitter.emittedEvents.find(
        (e) => e.type === IoTDeviceIsolationAuditEventType.INVARIANT_VIOLATION,
      );
      expect(violationEvent).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Authorization via Membership Tests
  // -------------------------------------------------------------------------

  describe('checkIsHouseholdMember', () => {
    it('should return true when user is a household member', async () => {
      const device = createTestDevice();
      mockRepository.findById.mockResolvedValue(device);
      mockRepository.isUserHouseholdMember.mockResolvedValue(true);

      const result = await service.checkIsHouseholdMember(TEST_USER_ID, TEST_DEVICE_ID, TEST_TENANT_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });

    it('should return false when user is not a household member', async () => {
      const device = createTestDevice();
      mockRepository.findById.mockResolvedValue(device);
      mockRepository.isUserHouseholdMember.mockResolvedValue(false);

      const result = await service.checkIsHouseholdMember(TEST_USER_ID_2, TEST_DEVICE_ID, TEST_TENANT_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });

    it('should return error when device does not exist', async () => {
      mockRepository.findById.mockResolvedValue(null);

      const result = await service.checkIsHouseholdMember(TEST_USER_ID, TEST_DEVICE_ID, TEST_TENANT_ID);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('IOT_DEVICE_NOT_FOUND_IN_TENANT');
      }
    });
  });

  describe('checkIsHouseholdHead', () => {
    it('should return true when user is the household head', async () => {
      const device = createTestDevice();
      mockRepository.findById.mockResolvedValue(device);
      mockRepository.isUserHouseholdHead.mockResolvedValue(true);

      const result = await service.checkIsHouseholdHead(TEST_USER_HEAD, TEST_DEVICE_ID, TEST_TENANT_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });

    it('should return false when user is not the household head', async () => {
      const device = createTestDevice();
      mockRepository.findById.mockResolvedValue(device);
      mockRepository.isUserHouseholdHead.mockResolvedValue(false);

      const result = await service.checkIsHouseholdHead(TEST_USER_ID, TEST_DEVICE_ID, TEST_TENANT_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Device Access Validation Tests
  // -------------------------------------------------------------------------

  describe('validateDeviceAccess', () => {
    it('should grant access when user is the household head', async () => {
      const device = createTestDevice();
      mockRepository.findById.mockResolvedValue(device);
      mockRepository.isUserHouseholdHead.mockResolvedValue(true);

      const result = await service.validateDeviceAccess({
        userId: TEST_USER_HEAD,
        deviceId: TEST_DEVICE_ID,
        tenantId: TEST_TENANT_ID,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(true);
        expect(result.data.reason).toBe(IoTDeviceAccessReason.IS_HOUSEHOLD_HEAD);
        expect(result.data.isHouseholdHead).toBe(true);
        expect(result.data.isHouseholdMember).toBe(true);
        expect(result.data.isAdminAccess).toBe(false);
      }
    });

    it('should grant access when user is a household member', async () => {
      const device = createTestDevice();
      mockRepository.findById.mockResolvedValue(device);
      mockRepository.isUserHouseholdHead.mockResolvedValue(false);
      mockRepository.isUserHouseholdMember.mockResolvedValue(true);

      const result = await service.validateDeviceAccess({
        userId: TEST_USER_ID,
        deviceId: TEST_DEVICE_ID,
        tenantId: TEST_TENANT_ID,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(true);
        expect(result.data.reason).toBe(IoTDeviceAccessReason.IS_HOUSEHOLD_MEMBER);
        expect(result.data.isHouseholdHead).toBe(false);
        expect(result.data.isHouseholdMember).toBe(true);
      }
    });

    it('should grant access when user has admin role', async () => {
      const device = createTestDevice();
      mockRepository.findById.mockResolvedValue(device);
      mockRepository.isUserHouseholdHead.mockResolvedValue(false);
      mockRepository.isUserHouseholdMember.mockResolvedValue(false);

      const result = await service.validateDeviceAccess({
        userId: TEST_USER_ID,
        deviceId: TEST_DEVICE_ID,
        tenantId: TEST_TENANT_ID,
        userRole: 'RT_ADMIN' as any,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(true);
        expect(result.data.reason).toBe(IoTDeviceAccessReason.ADMIN_SCOPE_ACCESS);
        expect(result.data.isAdminAccess).toBe(true);
      }

      const adminEvent = mockAuditEmitter.emittedEvents.find(
        (e) => e.type === IoTDeviceIsolationAuditEventType.ADMIN_OVERRIDE_GRANTED,
      );
      expect(adminEvent).toBeDefined();
    });

    it('should deny access when user is not a member and has no admin role', async () => {
      const device = createTestDevice();
      mockRepository.findById.mockResolvedValue(device);
      mockRepository.isUserHouseholdHead.mockResolvedValue(false);
      mockRepository.isUserHouseholdMember.mockResolvedValue(false);

      const result = await service.validateDeviceAccess({
        userId: TEST_USER_ID,
        deviceId: TEST_DEVICE_ID,
        tenantId: TEST_TENANT_ID,
        userRole: 'RESIDENT' as any, // RESIDENT is not an admin role
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(false);
        expect(result.data.reason).toBe(IoTDeviceAccessReason.NOT_HOUSEHOLD_MEMBER);
      }
    });

    it('should return device not found when device does not exist', async () => {
      mockRepository.findById.mockResolvedValue(null);

      const result = await service.validateDeviceAccess({
        userId: TEST_USER_ID,
        deviceId: TEST_DEVICE_ID,
        tenantId: TEST_TENANT_ID,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(false);
        expect(result.data.reason).toBe(IoTDeviceAccessReason.DEVICE_NOT_FOUND);
      }
    });
  });

  describe('authorizeDeviceAccess', () => {
    it('should succeed when access is allowed', async () => {
      const device = createTestDevice();
      mockRepository.findById.mockResolvedValue(device);
      mockRepository.isUserHouseholdHead.mockResolvedValue(true);

      const result = await service.authorizeDeviceAccess({
        userId: TEST_USER_HEAD,
        deviceId: TEST_DEVICE_ID,
        tenantId: TEST_TENANT_ID,
      });

      expect(result.success).toBe(true);

      const grantedEvent = mockAuditEmitter.emittedEvents.find(
        (e) => e.type === IoTDeviceIsolationAuditEventType.DEVICE_ACCESS_GRANTED,
      );
      expect(grantedEvent).toBeDefined();
    });

    it('should fail with appropriate error when access is denied', async () => {
      const device = createTestDevice();
      mockRepository.findById.mockResolvedValue(device);
      mockRepository.isUserHouseholdHead.mockResolvedValue(false);
      mockRepository.isUserHouseholdMember.mockResolvedValue(false);

      const result = await service.authorizeDeviceAccess({
        userId: TEST_USER_ID,
        deviceId: TEST_DEVICE_ID,
        tenantId: TEST_TENANT_ID,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('IOT_DEVICE_HOUSEHOLD_ACCESS_DENIED');
      }

      const deniedEvent = mockAuditEmitter.emittedEvents.find(
        (e) => e.type === IoTDeviceIsolationAuditEventType.DEVICE_ACCESS_DENIED,
      );
      expect(deniedEvent).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Cross-Tenant Prevention Tests
  // -------------------------------------------------------------------------

  describe('validateCrossTenantIsolation', () => {
    it('should allow access when user and device are in the same tenant', async () => {
      const result = await service.validateCrossTenantIsolation({
        userId: TEST_USER_ID,
        userTenantId: TEST_TENANT_ID,
        deviceTenantId: TEST_TENANT_ID,
      });

      expect(result.success).toBe(true);
    });

    it('should deny cross-tenant access even for admin roles', async () => {
      const result = await service.validateCrossTenantIsolation({
        userId: TEST_USER_ID,
        userTenantId: TEST_TENANT_ID,
        deviceTenantId: TEST_TENANT_ID_2,
        userRole: 'PLATFORM_ADMIN' as any, // Even PLATFORM_ADMIN cannot bypass
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CROSS_TENANT_IOT_ACCESS_DENIED');
      }

      const deniedEvent = mockAuditEmitter.emittedEvents.find(
        (e) => e.type === IoTDeviceIsolationAuditEventType.CROSS_TENANT_ACCESS_DENIED,
      );
      expect(deniedEvent).toBeDefined();
    });

    it('should deny cross-tenant access when no role is provided', async () => {
      const result = await service.validateCrossTenantIsolation({
        userId: TEST_USER_ID,
        userTenantId: TEST_TENANT_ID,
        deviceTenantId: TEST_TENANT_ID_2,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CROSS_TENANT_IOT_ACCESS_DENIED');
      }
    });
  });

  // -------------------------------------------------------------------------
  // OrgUnit Scope Validation Tests
  // -------------------------------------------------------------------------

  describe('validateOrgUnitScope', () => {
    it('should allow access for tenant-level admins (null orgUnitId)', async () => {
      const result = await service.validateOrgUnitScope(
        TEST_USER_ID,
        TEST_DEVICE_ID,
        TEST_TENANT_ID,
        null, // Tenant-level scope
        'TENANT_OWNER' as any,
      );

      expect(result.success).toBe(true);

      const passedEvent = mockAuditEmitter.emittedEvents.find(
        (e) => e.type === IoTDeviceIsolationAuditEventType.SCOPE_VALIDATION_PASSED,
      );
      expect(passedEvent).toBeDefined();
    });

    it('should allow access when device has no OrgUnit scope', async () => {
      mockRepository.getDeviceOrgUnitId.mockResolvedValue(null);

      const result = await service.validateOrgUnitScope(
        TEST_USER_ID,
        TEST_DEVICE_ID,
        TEST_TENANT_ID,
        TEST_ORGUNIT_ID,
        'RT_ADMIN' as any,
      );

      expect(result.success).toBe(true);
    });

    it('should allow access when user OrgUnit matches device OrgUnit', async () => {
      mockRepository.getDeviceOrgUnitId.mockResolvedValue(TEST_ORGUNIT_ID);

      const result = await service.validateOrgUnitScope(
        TEST_USER_ID,
        TEST_DEVICE_ID,
        TEST_TENANT_ID,
        TEST_ORGUNIT_ID, // Same as device
        'RT_ADMIN' as any,
      );

      expect(result.success).toBe(true);
    });

    it('should deny access when device OrgUnit is different from user OrgUnit', async () => {
      mockRepository.getDeviceOrgUnitId.mockResolvedValue(TEST_ORGUNIT_ID_2);

      const result = await service.validateOrgUnitScope(
        TEST_USER_ID,
        TEST_DEVICE_ID,
        TEST_TENANT_ID,
        TEST_ORGUNIT_ID, // Different from device
        'RT_ADMIN' as any,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('IOT_DEVICE_OUT_OF_SCOPE');
      }

      const failedEvent = mockAuditEmitter.emittedEvents.find(
        (e) => e.type === IoTDeviceIsolationAuditEventType.SCOPE_VALIDATION_FAILED,
      );
      expect(failedEvent).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Utility Methods Tests
  // -------------------------------------------------------------------------

  describe('getUserAccessibleDevices', () => {
    it('should return devices for a user', async () => {
      const devices = [createTestDevice()];
      mockRepository.findByUserId.mockResolvedValue(devices);

      const result = await service.getUserAccessibleDevices(TEST_USER_ID, TEST_TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe(TEST_DEVICE_ID);
    });

    it('should return empty array when user has no devices', async () => {
      mockRepository.findByUserId.mockResolvedValue([]);

      const result = await service.getUserAccessibleDevices(TEST_USER_ID, TEST_TENANT_ID);

      expect(result).toHaveLength(0);
    });
  });

  describe('getDeviceWithContext', () => {
    it('should return device with context for a valid device', async () => {
      const device = createTestDevice();
      const deviceContext = createTestDeviceWithContext();
      mockRepository.findById.mockResolvedValue(device);
      mockRepository.findWithContext.mockResolvedValue(deviceContext);

      const result = await service.getDeviceWithContext(TEST_DEVICE_ID, TEST_TENANT_ID);

      expect(result).not.toBeNull();
      expect(result?.device.id).toBe(TEST_DEVICE_ID);
      expect(result?.householdId).toBe(TEST_HOUSEHOLD_ID);
      expect(result?.orgUnitId).toBe(TEST_ORGUNIT_ID);
    });

    it('should return null when device does not exist', async () => {
      mockRepository.findById.mockResolvedValue(null);

      const result = await service.getDeviceWithContext(TEST_DEVICE_ID, TEST_TENANT_ID);

      expect(result).toBeNull();
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
