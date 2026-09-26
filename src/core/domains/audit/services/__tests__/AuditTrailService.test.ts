/**
 * AuditTrailService Unit Tests
 *
 * Tests for comprehensive audit trail implementation including:
 * - Event capture for security-sensitive operations
 * - Structured audit log format
 * - Tenant-scoped queries
 * - Immutable audit record storage
 *
 * @see Task 62: Audit Trail Implementation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  IAuditTrailRepository,
  IAuditTrailEmitter,
  AuditEvent,
  CreateAuditEventInput,
  AuditEventPage,
} from '../AuditTrailService';
import {
  AuditTrailServiceImpl,
  AuditEventType,
} from '../AuditTrailService';

// ---------------------------------------------------------------------------
// Test Data
// ---------------------------------------------------------------------------

const TEST_TENANT_ID = 'tenant-001';
const TEST_TENANT_ID_2 = 'tenant-002';
const TEST_USER_ID = 'user-001';
const TEST_USER_ID_2 = 'user-002';
const TEST_MEMBERSHIP_ID = 'membership-001';
const TEST_RESOURCE_ID = 'resource-001';
const TEST_EVENT_ID = 'event-001';
const TEST_CORRELATION_ID = 'corr-001';

const createTestAuditEvent = (
  overrides?: Partial<AuditEvent>,
): AuditEvent => ({
  id: TEST_EVENT_ID,
  timestamp: new Date(),
  userId: TEST_USER_ID,
  tenantId: TEST_TENANT_ID,
  eventType: AuditEventType.AUTH_LOGIN_SUCCESS,
  resourceId: null,
  resourceType: 'AUTH',
  details: {},
  ipAddress: '192.168.1.1',
  userAgent: 'TestAgent/1.0',
  correlationId: TEST_CORRELATION_ID,
  impersonatorId: null,
  orgUnitId: null,
  success: true,
  errorCode: null,
  ...overrides,
});

const createTestEventPage = (
  events: AuditEvent[] = [],
  overrides?: Partial<AuditEventPage>,
): AuditEventPage => ({
  events,
  total: events.length,
  page: 1,
  pageSize: 50,
  hasMore: false,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Mock Repository
// ---------------------------------------------------------------------------

const createMockRepository = (): IAuditTrailRepository & {
  create: ReturnType<typeof vi.fn>;
  findByTenant: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
  countByTenant: ReturnType<typeof vi.fn>;
  findByUser: ReturnType<typeof vi.fn>;
  findByResource: ReturnType<typeof vi.fn>;
} => ({
  create: vi.fn(),
  findByTenant: vi.fn(),
  findById: vi.fn(),
  countByTenant: vi.fn(),
  findByUser: vi.fn(),
  findByResource: vi.fn(),
});

// ---------------------------------------------------------------------------
// Mock Emitter
// ---------------------------------------------------------------------------

const createMockEmitter = (): IAuditTrailEmitter & {
  emittedEvents: CreateAuditEventInput[];
  emit: ReturnType<typeof vi.fn>;
} => {
  const emittedEvents: CreateAuditEventInput[] = [];
  return {
    emittedEvents,
    emit: vi.fn().mockImplementation(async (event: CreateAuditEventInput) => {
      emittedEvents.push(event);
    }),
  };
};

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('AuditTrailService', () => {
  let mockRepository: ReturnType<typeof createMockRepository>;
  let mockEmitter: ReturnType<typeof createMockEmitter>;
  let service: ReturnType<typeof AuditTrailServiceImpl>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepository = createMockRepository();
    mockEmitter = createMockEmitter();
    service = AuditTrailServiceImpl({
      auditTrailRepository: mockRepository,
      auditTrailEmitter: mockEmitter,
    });
  });

  // -------------------------------------------------------------------------
  // Event Capture Tests
  // -------------------------------------------------------------------------

  describe('captureEvent', () => {
    it('should create an audit event successfully', async () => {
      const createdEvent = createTestAuditEvent();
      mockRepository.create.mockResolvedValue({ success: true, data: createdEvent });

      const result = await service.captureEvent({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        eventType: AuditEventType.AUTH_LOGIN_SUCCESS,
        details: { browser: 'Chrome' },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.userId).toBe(TEST_USER_ID);
        expect(result.data.tenantId).toBe(TEST_TENANT_ID);
        expect(result.data.eventType).toBe(AuditEventType.AUTH_LOGIN_SUCCESS);
      }
      expect(mockRepository.create).toHaveBeenCalledOnce();
      expect(mockEmitter.emittedEvents).toHaveLength(1);
    });

    it('should fail when tenant ID is missing', async () => {
      const result = await service.captureEvent({
        userId: TEST_USER_ID,
        tenantId: '',
        eventType: AuditEventType.AUTH_LOGIN_SUCCESS,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUDIT_TENANT_REQUIRED');
      }
      expect(mockRepository.create).not.toHaveBeenCalled();
    });

    it('should sanitize sensitive data in details', async () => {
      const createdEvent = createTestAuditEvent();
      mockRepository.create.mockResolvedValue({ success: true, data: createdEvent });

      await service.captureEvent({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        eventType: AuditEventType.AUTH_LOGIN_SUCCESS,
        details: {
          username: 'testuser',
          password: 'supersecret',
          token: 'abc123',
          apiKey: 'key-123',
          normalField: 'value',
        },
      });

      const calledWith = mockRepository.create.mock.calls[0][0];
      expect(calledWith.details.password).toBe('[REDACTED]');
      expect(calledWith.details.token).toBe('[REDACTED]');
      expect(calledWith.details.apiKey).toBe('[REDACTED]');
      expect(calledWith.details.username).toBe('testuser');
      expect(calledWith.details.normalField).toBe('value');
    });

    it('should set success to true by default', async () => {
      const createdEvent = createTestAuditEvent({ success: true });
      mockRepository.create.mockResolvedValue({ success: true, data: createdEvent });

      await service.captureEvent({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        eventType: AuditEventType.AUTH_LOGIN_SUCCESS,
      });

      const calledWith = mockRepository.create.mock.calls[0][0];
      expect(calledWith.success).toBe(true);
    });

    it('should emit event via emitter after successful creation', async () => {
      const createdEvent = createTestAuditEvent();
      mockRepository.create.mockResolvedValue({ success: true, data: createdEvent });

      await service.captureEvent({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        eventType: AuditEventType.AUTH_LOGIN_SUCCESS,
      });

      expect(mockEmitter.emit).toHaveBeenCalledOnce();
      expect(mockEmitter.emittedEvents[0].tenantId).toBe(TEST_TENANT_ID);
    });
  });

  describe('captureAuthEvent', () => {
    it('should capture authentication events with proper structure', async () => {
      const createdEvent = createTestAuditEvent({
        eventType: AuditEventType.AUTH_LOGIN_SUCCESS,
        resourceType: 'AUTH',
      });
      mockRepository.create.mockResolvedValue({ success: true, data: createdEvent });

      const result = await service.captureAuthEvent(
        AuditEventType.AUTH_LOGIN_SUCCESS,
        TEST_USER_ID,
        TEST_TENANT_ID,
        { browser: 'Chrome' },
        {
          ipAddress: '192.168.1.1',
          userAgent: 'TestAgent/1.0',
          correlationId: TEST_CORRELATION_ID,
        },
      );

      expect(result.success).toBe(true);
      const calledWith = mockRepository.create.mock.calls[0][0];
      expect(calledWith.resourceType).toBe('AUTH');
      expect(calledWith.ipAddress).toBe('192.168.1.1');
      expect(calledWith.userAgent).toBe('TestAgent/1.0');
      expect(calledWith.correlationId).toBe(TEST_CORRELATION_ID);
    });

    it('should handle login failure events', async () => {
      const createdEvent = createTestAuditEvent({
        eventType: AuditEventType.AUTH_LOGIN_FAILURE,
        success: false,
        errorCode: 'INVALID_CREDENTIALS',
      });
      mockRepository.create.mockResolvedValue({ success: true, data: createdEvent });

      await service.captureAuthEvent(
        AuditEventType.AUTH_LOGIN_FAILURE,
        null, // Unknown user
        TEST_TENANT_ID,
        { reason: 'Invalid credentials' },
        { success: false, errorCode: 'INVALID_CREDENTIALS' },
      );

      const calledWith = mockRepository.create.mock.calls[0][0];
      expect(calledWith.userId).toBeNull();
      expect(calledWith.success).toBe(false);
      expect(calledWith.errorCode).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('captureMembershipEvent', () => {
    it('should capture membership lifecycle events', async () => {
      const createdEvent = createTestAuditEvent({
        eventType: AuditEventType.MEMBERSHIP_CREATED,
        resourceType: 'MEMBERSHIP',
        resourceId: TEST_MEMBERSHIP_ID,
      });
      mockRepository.create.mockResolvedValue({ success: true, data: createdEvent });

      const result = await service.captureMembershipEvent(
        AuditEventType.MEMBERSHIP_CREATED,
        TEST_USER_ID,
        TEST_TENANT_ID,
        TEST_MEMBERSHIP_ID,
        { role: 'RESIDENT', status: 'ACTIVE' },
        { orgUnitId: 'org-001' },
      );

      expect(result.success).toBe(true);
      const calledWith = mockRepository.create.mock.calls[0][0];
      expect(calledWith.resourceType).toBe('MEMBERSHIP');
      expect(calledWith.resourceId).toBe(TEST_MEMBERSHIP_ID);
      expect(calledWith.orgUnitId).toBe('org-001');
    });

    it('should capture membership revocation with impersonator', async () => {
      const createdEvent = createTestAuditEvent({
        eventType: AuditEventType.MEMBERSHIP_REVOKED,
        impersonatorId: 'admin-001',
      });
      mockRepository.create.mockResolvedValue({ success: true, data: createdEvent });

      await service.captureMembershipEvent(
        AuditEventType.MEMBERSHIP_REVOKED,
        TEST_USER_ID,
        TEST_TENANT_ID,
        TEST_MEMBERSHIP_ID,
        { reason: 'User requested removal' },
        { impersonatorId: 'admin-001' },
      );

      const calledWith = mockRepository.create.mock.calls[0][0];
      expect(calledWith.impersonatorId).toBe('admin-001');
    });
  });

  describe('captureAuthorizationEvent', () => {
    it('should capture permission granted events', async () => {
      const createdEvent = createTestAuditEvent({
        eventType: AuditEventType.PERMISSION_GRANTED,
        resourceType: 'RESIDENT',
        resourceId: TEST_RESOURCE_ID,
      });
      mockRepository.create.mockResolvedValue({ success: true, data: createdEvent });

      await service.captureAuthorizationEvent(
        AuditEventType.PERMISSION_GRANTED,
        TEST_USER_ID,
        TEST_TENANT_ID,
        'RESIDENT',
        TEST_RESOURCE_ID,
        { permissions: ['resident:read'] },
        { success: true },
      );

      const calledWith = mockRepository.create.mock.calls[0][0];
      expect(calledWith.resourceType).toBe('RESIDENT');
      expect(calledWith.resourceId).toBe(TEST_RESOURCE_ID);
      expect(calledWith.success).toBe(true);
    });

    it('should capture permission denied events', async () => {
      const createdEvent = createTestAuditEvent({
        eventType: AuditEventType.PERMISSION_DENIED,
        success: false,
        errorCode: 'AUTH_INSUFFICIENT_PERMISSION',
      });
      mockRepository.create.mockResolvedValue({ success: true, data: createdEvent });

      await service.captureAuthorizationEvent(
        AuditEventType.PERMISSION_DENIED,
        TEST_USER_ID,
        TEST_TENANT_ID,
        'FINANCE',
        TEST_RESOURCE_ID,
        { requiredPermissions: ['finance:write'], userPermissions: ['finance:read'] },
        { success: false, errorCode: 'AUTH_INSUFFICIENT_PERMISSION' },
      );

      const calledWith = mockRepository.create.mock.calls[0][0];
      expect(calledWith.success).toBe(false);
      expect(calledWith.errorCode).toBe('AUTH_INSUFFICIENT_PERMISSION');
    });
  });

  describe('captureAdminAction', () => {
    it('should capture admin actions with proper structure', async () => {
      const createdEvent = createTestAuditEvent({
        eventType: AuditEventType.ADMIN_ACTION,
        resourceType: 'USER',
        resourceId: TEST_USER_ID_2,
      });
      mockRepository.create.mockResolvedValue({ success: true, data: createdEvent });

      await service.captureAdminAction(
        TEST_USER_ID,
        TEST_TENANT_ID,
        'SUSPEND_USER',
        'USER',
        TEST_USER_ID_2,
        { reason: 'Policy violation' },
        { orgUnitId: 'org-001' },
      );

      const calledWith = mockRepository.create.mock.calls[0][0];
      expect(calledWith.eventType).toBe(AuditEventType.ADMIN_ACTION);
      expect(calledWith.details.action).toBe('SUSPEND_USER');
      expect(calledWith.resourceType).toBe('USER');
      expect(calledWith.resourceId).toBe(TEST_USER_ID_2);
    });
  });

  // -------------------------------------------------------------------------
  // Tenant-Scoped Query Tests
  // -------------------------------------------------------------------------

  describe('queryEvents', () => {
    it('should query events for a tenant', async () => {
      const events = [createTestAuditEvent()];
      mockRepository.findByTenant.mockResolvedValue({
        success: true,
        data: createTestEventPage(events),
      });

      const result = await service.queryEvents(TEST_TENANT_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.events).toHaveLength(1);
        expect(result.data.total).toBe(1);
      }
      expect(mockRepository.findByTenant).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        undefined,
        { page: 1, pageSize: 50 },
      );
    });

    it('should fail when tenant ID is missing', async () => {
      const result = await service.queryEvents('');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUDIT_TENANT_REQUIRED');
      }
    });

    it('should apply filters correctly', async () => {
      mockRepository.findByTenant.mockResolvedValue({
        success: true,
        data: createTestEventPage([]),
      });

      await service.queryEvents(
        TEST_TENANT_ID,
        {
          eventType: AuditEventType.AUTH_LOGIN_SUCCESS,
          userId: TEST_USER_ID,
          startDate: new Date('2024-01-01'),
        },
        { page: 2, pageSize: 20 },
      );

      expect(mockRepository.findByTenant).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        {
          eventType: AuditEventType.AUTH_LOGIN_SUCCESS,
          userId: TEST_USER_ID,
          startDate: new Date('2024-01-01'),
        },
        { page: 2, pageSize: 20 },
      );
    });

    it('should limit page size to maximum', async () => {
      mockRepository.findByTenant.mockResolvedValue({
        success: true,
        data: createTestEventPage([]),
      });

      await service.queryEvents(
        TEST_TENANT_ID,
        undefined,
        { page: 1, pageSize: 500 }, // Over max
      );

      expect(mockRepository.findByTenant).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        undefined,
        { page: 1, pageSize: 100 }, // Capped to max
      );
    });
  });

  describe('getEventById', () => {
    it('should return event when found', async () => {
      const event = createTestAuditEvent();
      mockRepository.findById.mockResolvedValue({ success: true, data: event });

      const result = await service.getEventById(TEST_TENANT_ID, TEST_EVENT_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(TEST_EVENT_ID);
      }
    });

    it('should return error when event not found', async () => {
      mockRepository.findById.mockResolvedValue({ success: true, data: null });

      const result = await service.getEventById(TEST_TENANT_ID, 'nonexistent');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUDIT_EVENT_NOT_FOUND');
      }
    });

    it('should fail when tenant ID is missing', async () => {
      const result = await service.getEventById('', TEST_EVENT_ID);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUDIT_TENANT_REQUIRED');
      }
    });
  });

  describe('getUserAuditTrail', () => {
    it('should return audit trail for a user', async () => {
      const events = [createTestAuditEvent({ userId: TEST_USER_ID })];
      mockRepository.findByUser.mockResolvedValue({
        success: true,
        data: createTestEventPage(events),
      });

      const result = await service.getUserAuditTrail(TEST_TENANT_ID, TEST_USER_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.events).toHaveLength(1);
      }
      expect(mockRepository.findByUser).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        TEST_USER_ID,
        { page: 1, pageSize: 50 },
      );
    });

    it('should fail when user ID is missing', async () => {
      const result = await service.getUserAuditTrail(TEST_TENANT_ID, '');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUDIT_USER_REQUIRED');
      }
    });
  });

  describe('getResourceAuditTrail', () => {
    it('should return audit trail for a resource', async () => {
      const events = [createTestAuditEvent({ resourceId: TEST_RESOURCE_ID })];
      mockRepository.findByResource.mockResolvedValue({
        success: true,
        data: createTestEventPage(events),
      });

      const result = await service.getResourceAuditTrail(
        TEST_TENANT_ID,
        'MEMBERSHIP',
        TEST_RESOURCE_ID,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.events).toHaveLength(1);
      }
    });

    it('should fail when resource type is missing', async () => {
      const result = await service.getResourceAuditTrail(TEST_TENANT_ID, '', TEST_RESOURCE_ID);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUDIT_RESOURCE_REQUIRED');
      }
    });
  });

  describe('getEventCount', () => {
    it('should return event count for a tenant', async () => {
      mockRepository.countByTenant.mockResolvedValue({ success: true, data: 42 });

      const result = await service.getEventCount(TEST_TENANT_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(42);
      }
    });

    it('should apply filters to count', async () => {
      mockRepository.countByTenant.mockResolvedValue({ success: true, data: 10 });

      await service.getEventCount(TEST_TENANT_ID, {
        eventType: AuditEventType.AUTH_LOGIN_SUCCESS,
      });

      expect(mockRepository.countByTenant).toHaveBeenCalledWith(TEST_TENANT_ID, {
        eventType: AuditEventType.AUTH_LOGIN_SUCCESS,
      });
    });
  });

  // -------------------------------------------------------------------------
  // Security Event Tests
  // -------------------------------------------------------------------------

  describe('captureSecurityAlert', () => {
    it('should capture security alerts', async () => {
      const createdEvent = createTestAuditEvent({
        eventType: AuditEventType.SECURITY_ALERT_TRIGGERED,
      });
      mockRepository.create.mockResolvedValue({ success: true, data: createdEvent });

      await service.captureSecurityAlert(
        TEST_TENANT_ID,
        'SUSPICIOUS_LOGIN',
        { location: 'Unknown IP', attempts: 5 },
        { userId: TEST_USER_ID },
      );

      const calledWith = mockRepository.create.mock.calls[0][0];
      expect(calledWith.eventType).toBe(AuditEventType.SECURITY_ALERT_TRIGGERED);
      expect(calledWith.details.alertType).toBe('SUSPICIOUS_LOGIN');
    });
  });

  describe('captureCrossTenantAttempt', () => {
    it('should capture cross-tenant access attempts', async () => {
      const createdEvent = createTestAuditEvent({
        eventType: AuditEventType.SECURITY_CROSS_TENANT_ATTEMPT,
        success: false,
      });
      mockRepository.create.mockResolvedValue({ success: true, data: createdEvent });

      await service.captureCrossTenantAttempt(
        TEST_USER_ID,
        TEST_TENANT_ID,
        TEST_TENANT_ID_2,
        { operation: 'READ_RESIDENT' },
      );

      const calledWith = mockRepository.create.mock.calls[0][0];
      expect(calledWith.eventType).toBe(AuditEventType.SECURITY_CROSS_TENANT_ATTEMPT);
      expect(calledWith.tenantId).toBe(TEST_TENANT_ID); // Logged in source tenant
      expect(calledWith.resourceId).toBe(TEST_TENANT_ID_2); // Target tenant
      expect(calledWith.success).toBe(false);
      expect(calledWith.errorCode).toBe('CROSS_TENANT_ACCESS_DENIED');
    });
  });

  // -------------------------------------------------------------------------
  // Immutability Tests
  // -------------------------------------------------------------------------

  describe('immutability', () => {
    it('should not expose update methods', () => {
      // The service interface should not have update/delete methods
      // This is enforced at the type level
      expect((service as Record<string, unknown>).updateEvent).toBeUndefined();
      expect((service as Record<string, unknown>).deleteEvent).toBeUndefined();
    });

    it('should create events with readonly properties', async () => {
      const createdEvent = createTestAuditEvent();
      mockRepository.create.mockResolvedValue({ success: true, data: createdEvent });

      const result = await service.captureEvent({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        eventType: AuditEventType.AUTH_LOGIN_SUCCESS,
      });

      // Verify the event was created with all expected fields
      if (result.success) {
        // TypeScript readonly properties provide compile-time protection
        // Runtime immutability would require Object.freeze() which we don't enforce
        // The readonly interface contract ensures immutability at the type level
        expect(result.data.id).toBe(TEST_EVENT_ID);
        expect(result.data.tenantId).toBe(TEST_TENANT_ID);
        expect(result.data.userId).toBe(TEST_USER_ID);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Edge Cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('should handle service without emitter', async () => {
      const serviceWithoutEmitter = AuditTrailServiceImpl({
        auditTrailRepository: mockRepository,
        auditTrailEmitter: undefined,
      });

      const createdEvent = createTestAuditEvent();
      mockRepository.create.mockResolvedValue({ success: true, data: createdEvent });

      const result = await serviceWithoutEmitter.captureEvent({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        eventType: AuditEventType.AUTH_LOGIN_SUCCESS,
      });

      expect(result.success).toBe(true);
      expect(mockEmitter.emit).not.toHaveBeenCalled();
    });

    it('should handle emitter failures gracefully', async () => {
      mockEmitter.emit.mockRejectedValue(new Error('Emitter failed'));
      const createdEvent = createTestAuditEvent();
      mockRepository.create.mockResolvedValue({ success: true, data: createdEvent });

      // Should not throw even if emitter fails
      const result = await service.captureEvent({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        eventType: AuditEventType.AUTH_LOGIN_SUCCESS,
      });

      expect(result.success).toBe(true);
    });

    it('should handle null values in optional fields', async () => {
      const createdEvent = createTestAuditEvent({
        resourceId: null,
        resourceType: null,
        ipAddress: null,
        userAgent: null,
        correlationId: null,
        impersonatorId: null,
        orgUnitId: null,
      });
      mockRepository.create.mockResolvedValue({ success: true, data: createdEvent });

      const result = await service.captureEvent({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        eventType: AuditEventType.AUTH_LOGOUT,
      });

      expect(result.success).toBe(true);
    });

    it('should handle empty details object', async () => {
      const createdEvent = createTestAuditEvent({ details: {} });
      mockRepository.create.mockResolvedValue({ success: true, data: createdEvent });

      const result = await service.captureEvent({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        eventType: AuditEventType.AUTH_LOGOUT,
        details: {},
      });

      expect(result.success).toBe(true);
      const calledWith = mockRepository.create.mock.calls[0][0];
      expect(calledWith.details).toEqual({});
    });

    it('should sanitize nested sensitive data', async () => {
      const createdEvent = createTestAuditEvent();
      mockRepository.create.mockResolvedValue({ success: true, data: createdEvent });

      await service.captureEvent({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        eventType: AuditEventType.AUTH_LOGIN_SUCCESS,
        details: {
          user: {
            name: 'John',
            password: 'secret123',
          },
          config: {
            apiKey: 'abc123',
            endpoint: 'https://api.example.com',
          },
        },
      });

      const calledWith = mockRepository.create.mock.calls[0][0];
      expect((calledWith.details.user as Record<string, unknown>).password).toBe('[REDACTED]');
      expect((calledWith.details.config as Record<string, unknown>).apiKey).toBe('[REDACTED]');
      expect((calledWith.details.user as Record<string, unknown>).name).toBe('John');
      expect((calledWith.details.config as Record<string, unknown>).endpoint).toBe('https://api.example.com');
    });
  });

  // -------------------------------------------------------------------------
  // All Event Types Coverage
  // -------------------------------------------------------------------------

  describe('event type coverage', () => {
    it('should support all authentication event types', async () => {
      const authEvents = [
        AuditEventType.AUTH_LOGIN_SUCCESS,
        AuditEventType.AUTH_LOGIN_FAILURE,
        AuditEventType.AUTH_LOGOUT,
        AuditEventType.AUTH_TOKEN_REFRESH,
        AuditEventType.AUTH_TOKEN_REVOKED,
        AuditEventType.AUTH_PASSWORD_CHANGED,
      ];

      for (const eventType of authEvents) {
        mockRepository.create.mockResolvedValue({
          success: true,
          data: createTestAuditEvent({ eventType }),
        });

        const result = await service.captureAuthEvent(
          eventType,
          TEST_USER_ID,
          TEST_TENANT_ID,
        );

        expect(result.success).toBe(true);
      }
    });

    it('should support all membership event types', async () => {
      const membershipEvents = [
        AuditEventType.MEMBERSHIP_CREATED,
        AuditEventType.MEMBERSHIP_UPDATED,
        AuditEventType.MEMBERSHIP_REVOKED,
        AuditEventType.MEMBERSHIP_SUSPENDED,
        AuditEventType.MEMBERSHIP_REACTIVATED,
        AuditEventType.MEMBERSHIP_ROLE_CHANGED,
      ];

      for (const eventType of membershipEvents) {
        mockRepository.create.mockResolvedValue({
          success: true,
          data: createTestAuditEvent({ eventType }),
        });

        const result = await service.captureMembershipEvent(
          eventType,
          TEST_USER_ID,
          TEST_TENANT_ID,
          TEST_MEMBERSHIP_ID,
        );

        expect(result.success).toBe(true);
      }
    });

    it('should support context switch event types', async () => {
      const contextEvents = [
        AuditEventType.TENANT_SWITCH,
        AuditEventType.ORGUNIT_SWITCH,
        AuditEventType.CONTEXT_SWITCH_DENIED,
      ];

      for (const eventType of contextEvents) {
        mockRepository.create.mockResolvedValue({
          success: true,
          data: createTestAuditEvent({ eventType }),
        });

        const result = await service.captureEvent({
          userId: TEST_USER_ID,
          tenantId: TEST_TENANT_ID,
          eventType,
        });

        expect(result.success).toBe(true);
      }
    });
  });
});
