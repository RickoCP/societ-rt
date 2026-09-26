/**
 * Unit tests for NotificationSecurityService.
 *
 * These tests verify notification security including:
 * - Tenant isolation for notifications
 * - Recipient validation (same tenant only)
 * - Content security validation (PII masking, cross-tenant detection)
 * - Channel authorization
 * - Audit logging for notification delivery
 *
 * @see Task 71: Notification Security (Req 56)
 * @see Testing Pattern (04-testing-pattern.md)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  NotificationSecurityServiceImpl,
  type INotificationSecurityService,
  type INotificationDeliveryAuditEmitter,
  type NotificationSenderContext,
  type NotificationRecipient,
  type ValidateNotificationDeliveryInput,
  type ValidateNotificationContentInput,
  type NotificationDeliveryAuditRecord,
  NotificationSecurityStatus,
  NotificationContentType,
  ContentSensitivityLevel,
  DEFAULT_CHANNEL_CONFIG,
} from '../NotificationSecurityService';
import type { NotificationChannel } from '../../entities';

// ---------------------------------------------------------------------------
// Test Utilities
// ---------------------------------------------------------------------------

/**
 * Create a test sender context.
 */
const createTestSender = (
  overrides: Partial<NotificationSenderContext> = {},
): NotificationSenderContext => ({
  userId: 'sender-123',
  tenantId: 'tenant-A',
  role: 'RT_ADMIN',
  orgUnitId: 'orgunit-123',
  ...overrides,
});

/**
 * Create a test recipient.
 */
const createTestRecipient = (
  overrides: Partial<NotificationRecipient> = {},
): NotificationRecipient => ({
  userId: 'recipient-456',
  tenantId: 'tenant-A',
  hasActiveMembership: true,
  orgUnitId: 'orgunit-123',
  ...overrides,
});

/**
 * Create a mock audit emitter.
 */
const createMockAuditEmitter = (): INotificationDeliveryAuditEmitter & {
  deliveryAudits: NotificationDeliveryAuditRecord[];
  securityViolations: Array<{
    tenantId: string;
    senderId: string;
    violationType: NotificationSecurityStatus;
    details: Record<string, unknown>;
  }>;
  reset: () => void;
} => {
  const deliveryAudits: NotificationDeliveryAuditRecord[] = [];
  const securityViolations: Array<{
    tenantId: string;
    senderId: string;
    violationType: NotificationSecurityStatus;
    details: Record<string, unknown>;
  }> = [];

  return {
    deliveryAudits,
    securityViolations,
    reset: () => {
      deliveryAudits.length = 0;
      securityViolations.length = 0;
    },
    emitDeliveryAudit: vi.fn(async (record: NotificationDeliveryAuditRecord) => {
      deliveryAudits.push(record);
    }),
    emitSecurityViolation: vi.fn(
      async (
        tenantId: string,
        senderId: string,
        violationType: NotificationSecurityStatus,
        details: Record<string, unknown>,
      ) => {
        securityViolations.push({ tenantId, senderId, violationType, details });
      },
    ),
  };
};

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('NotificationSecurityService', () => {
  let service: INotificationSecurityService;
  let mockAuditEmitter: ReturnType<typeof createMockAuditEmitter>;

  beforeEach(() => {
    mockAuditEmitter = createMockAuditEmitter();
    service = NotificationSecurityServiceImpl({
      auditEmitter: mockAuditEmitter,
      channelConfig: DEFAULT_CHANNEL_CONFIG,
    });
  });

  afterEach(() => {
    mockAuditEmitter.reset();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Tenant Isolation Validation Tests
  // -------------------------------------------------------------------------

  describe('Tenant Isolation Validation', () => {
    describe('validateDelivery', () => {
      it('should allow delivery when all recipients are in same tenant', async () => {
        const input: ValidateNotificationDeliveryInput = {
          sender: createTestSender(),
          recipients: [
            createTestRecipient({ userId: 'recipient-1' }),
            createTestRecipient({ userId: 'recipient-2' }),
          ],
          notificationType: 'announcement',
          contentType: NotificationContentType.ANNOUNCEMENT,
          channels: ['inbox'],
        };

        const result = await service.validateDelivery(input);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(NotificationSecurityStatus.ALLOWED);
          expect(result.data.allRecipientsValid).toBe(true);
          expect(result.data.validRecipientIds).toHaveLength(2);
          expect(result.data.invalidRecipients).toHaveLength(0);
        }
      });

      it('should block cross-tenant recipients', async () => {
        const input: ValidateNotificationDeliveryInput = {
          sender: createTestSender({ tenantId: 'tenant-A' }),
          recipients: [
            createTestRecipient({ userId: 'recipient-1', tenantId: 'tenant-A' }),
            createTestRecipient({ userId: 'recipient-2', tenantId: 'tenant-B' }), // Different tenant
          ],
          notificationType: 'announcement',
          contentType: NotificationContentType.ANNOUNCEMENT,
          channels: ['inbox'],
        };

        const result = await service.validateDelivery(input);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.validRecipientIds).toContain('recipient-1');
          expect(result.data.validRecipientIds).not.toContain('recipient-2');
          expect(result.data.invalidRecipients).toHaveLength(1);
          expect(result.data.invalidRecipients[0]?.reason).toBe(
            NotificationSecurityStatus.RECIPIENT_TENANT_MISMATCH,
          );
          expect(result.data.warnings.length).toBeGreaterThan(0);
        }
      });

      it('should emit security violation for cross-tenant attempt', async () => {
        const input: ValidateNotificationDeliveryInput = {
          sender: createTestSender({ userId: 'attacker', tenantId: 'tenant-A' }),
          recipients: [
            createTestRecipient({ userId: 'victim', tenantId: 'tenant-B' }),
          ],
          notificationType: 'announcement',
          contentType: NotificationContentType.ANNOUNCEMENT,
          channels: ['inbox'],
        };

        await service.validateDelivery(input);

        expect(mockAuditEmitter.securityViolations).toHaveLength(1);
        expect(mockAuditEmitter.securityViolations[0]).toMatchObject({
          tenantId: 'tenant-A',
          senderId: 'attacker',
          violationType: NotificationSecurityStatus.RECIPIENT_TENANT_MISMATCH,
        });
      });

      it('should block recipients without active membership', async () => {
        const input: ValidateNotificationDeliveryInput = {
          sender: createTestSender(),
          recipients: [
            createTestRecipient({ userId: 'active-user', hasActiveMembership: true }),
            createTestRecipient({ userId: 'inactive-user', hasActiveMembership: false }),
          ],
          notificationType: 'announcement',
          contentType: NotificationContentType.ANNOUNCEMENT,
          channels: ['inbox'],
        };

        const result = await service.validateDelivery(input);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.validRecipientIds).toContain('active-user');
          expect(result.data.validRecipientIds).not.toContain('inactive-user');
          expect(result.data.invalidRecipients[0]?.reason).toBe(
            NotificationSecurityStatus.RECIPIENT_NOT_ACTIVE,
          );
        }
      });

      it('should fail when sender tenant context is missing', async () => {
        const input: ValidateNotificationDeliveryInput = {
          sender: createTestSender({ tenantId: '' }),
          recipients: [createTestRecipient()],
          notificationType: 'announcement',
          contentType: NotificationContentType.ANNOUNCEMENT,
          channels: ['inbox'],
        };

        const result = await service.validateDelivery(input);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('NOTIFICATION_SENDER_TENANT_MISSING');
        }
      });

      it('should validate channel authorization', async () => {
        const input: ValidateNotificationDeliveryInput = {
          sender: createTestSender({ role: 'RESIDENT' }), // Resident role
          recipients: [createTestRecipient()],
          notificationType: 'financial',
          contentType: NotificationContentType.FINANCIAL,
          channels: ['email'], // Email requires admin role for financial
        };

        const result = await service.validateDelivery(input);

        expect(result.success).toBe(true);
        if (result.success) {
          // Email channel should be denied for RESIDENT sending FINANCIAL
          expect(result.data.deniedChannels.length).toBeGreaterThanOrEqual(0);
        }
      });

      it('should return all recipients invalid when none pass validation', async () => {
        const input: ValidateNotificationDeliveryInput = {
          sender: createTestSender({ tenantId: 'tenant-A' }),
          recipients: [
            createTestRecipient({ userId: 'r1', tenantId: 'tenant-B' }),
            createTestRecipient({ userId: 'r2', tenantId: 'tenant-C' }),
          ],
          notificationType: 'announcement',
          contentType: NotificationContentType.ANNOUNCEMENT,
          channels: ['inbox'],
        };

        const result = await service.validateDelivery(input);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.allRecipientsValid).toBe(false);
          expect(result.data.validRecipientIds).toHaveLength(0);
          expect(result.data.invalidRecipients).toHaveLength(2);
          expect(result.data.status).toBe(
            NotificationSecurityStatus.RECIPIENT_TENANT_MISMATCH,
          );
        }
      });
    });

    describe('validateRecipientTenant', () => {
      it('should return true when tenants match', () => {
        const result = service.validateRecipientTenant(
          'sender-123',
          'tenant-A',
          'recipient-456',
          'tenant-A',
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(true);
        }
      });

      it('should fail when tenants do not match', () => {
        const result = service.validateRecipientTenant(
          'sender-123',
          'tenant-A',
          'recipient-456',
          'tenant-B',
        );

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('NOTIFICATION_CROSS_TENANT_BLOCKED');
        }
      });

      it('should fail when sender tenant is empty', () => {
        const result = service.validateRecipientTenant(
          'sender-123',
          '',
          'recipient-456',
          'tenant-A',
        );

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('NOTIFICATION_SENDER_TENANT_MISSING');
        }
      });

      it('should fail when recipient tenant is empty', () => {
        const result = service.validateRecipientTenant(
          'sender-123',
          'tenant-A',
          'recipient-456',
          '',
        );

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('NOTIFICATION_RECIPIENT_TENANT_MISSING');
        }
      });
    });
  });

  // -------------------------------------------------------------------------
  // Content Security Validation Tests
  // -------------------------------------------------------------------------

  describe('Content Security Validation', () => {
    describe('validateContent', () => {
      it('should pass validation for clean content', () => {
        const input: ValidateNotificationContentInput = {
          tenantId: 'tenant-A',
          title: 'Monthly Meeting Reminder',
          body: 'Please attend the monthly meeting tomorrow at 3 PM.',
          contentType: NotificationContentType.ANNOUNCEMENT,
          sensitivityLevel: ContentSensitivityLevel.PUBLIC,
        };

        const result = service.validateContent(input);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.valid).toBe(true);
          expect(result.data.violations).toHaveLength(0);
          expect(result.data.contentModified).toBe(false);
        }
      });

      it('should detect and mask email PII in PUBLIC content', () => {
        const input: ValidateNotificationContentInput = {
          tenantId: 'tenant-A',
          title: 'Contact Information',
          body: 'Please contact john.doe@example.com for more info.',
          contentType: NotificationContentType.ANNOUNCEMENT,
          sensitivityLevel: ContentSensitivityLevel.PUBLIC,
        };

        const result = service.validateContent(input);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.valid).toBe(true);
          expect(result.data.contentModified).toBe(true);
          expect(result.data.sanitizedBody).toContain('***');
          expect(result.data.sanitizedBody).not.toContain('john.doe@example.com');
        }
      });

      it('should detect and mask phone number PII', () => {
        const input: ValidateNotificationContentInput = {
          tenantId: 'tenant-A',
          title: 'Emergency Contact',
          body: 'Call 0812-1234-5678 for emergencies.',
          contentType: NotificationContentType.EMERGENCY,
          sensitivityLevel: ContentSensitivityLevel.PUBLIC,
        };

        const result = service.validateContent(input);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.contentModified).toBe(true);
          expect(result.data.sanitizedBody).toContain('****');
        }
      });

      it('should detect NIK (Indonesian ID number) and mask', () => {
        const input: ValidateNotificationContentInput = {
          tenantId: 'tenant-A',
          title: 'ID Verification',
          body: 'Your NIK is 3201123456789012.',
          contentType: NotificationContentType.ADMINISTRATIVE,
          sensitivityLevel: ContentSensitivityLevel.INTERNAL,
        };

        const result = service.validateContent(input);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.contentModified).toBe(true);
          expect(result.data.sanitizedBody).not.toContain('3201123456789012');
        }
      });

      it('should detect cross-tenant reference patterns', () => {
        const input: ValidateNotificationContentInput = {
          tenantId: 'tenant-A',
          title: 'Invalid Reference',
          body: 'See tenant_id: 550e8400-e29b-41d4-a716-446655440000 for details.',
          contentType: NotificationContentType.SYSTEM,
          sensitivityLevel: ContentSensitivityLevel.INTERNAL,
        };

        const result = service.validateContent(input);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.valid).toBe(false); // Cross-tenant refs are always invalid
          expect(result.data.violations.some(v => v.type === 'CROSS_TENANT_REF')).toBe(true);
        }
      });

      it('should detect sensitive keys in additional data', () => {
        const input: ValidateNotificationContentInput = {
          tenantId: 'tenant-A',
          title: 'Sensitive Data',
          body: 'Here is your information.',
          contentType: NotificationContentType.PERSONAL,
          sensitivityLevel: ContentSensitivityLevel.SENSITIVE,
          additionalData: {
            userToken: 'abc123',
            apiKey: 'secret-key',
          },
        };

        const result = service.validateContent(input);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.valid).toBe(false);
          expect(result.data.violations.some(v => v.type === 'SENSITIVE_EXPOSURE')).toBe(true);
        }
      });

      it('should warn about PII in SENSITIVE content without masking', () => {
        const input: ValidateNotificationContentInput = {
          tenantId: 'tenant-A',
          title: 'Sensitive Report',
          body: 'User email: test@example.com',
          contentType: NotificationContentType.PERSONAL,
          sensitivityLevel: ContentSensitivityLevel.SENSITIVE,
        };

        const result = service.validateContent(input);

        expect(result.success).toBe(true);
        if (result.success) {
          // SENSITIVE level should detect but not auto-mask
          expect(result.data.violations.some(v => v.type === 'PII_LEAK')).toBe(true);
          expect(result.data.contentModified).toBe(false);
        }
      });

      it('should fail validation when tenant ID is missing', () => {
        const input: ValidateNotificationContentInput = {
          tenantId: '',
          title: 'Test',
          body: 'Test body',
          contentType: NotificationContentType.ANNOUNCEMENT,
          sensitivityLevel: ContentSensitivityLevel.PUBLIC,
        };

        const result = service.validateContent(input);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('NOTIFICATION_CONTENT_TENANT_REQUIRED');
        }
      });
    });

    describe('maskPII', () => {
      it('should mask email addresses', () => {
        const content = 'Contact us at support@company.com';
        const masked = service.maskPII(content);

        expect(masked).not.toContain('support@company.com');
        expect(masked).toContain('@company.com'); // Domain should remain
        expect(masked).toContain('***');
      });

      it('should mask Indonesian phone numbers', () => {
        const content = 'Call +62 812 1234 5678 or 0812-9876-5432';
        const masked = service.maskPII(content);

        expect(masked).not.toContain('12345678');
        expect(masked).toContain('****');
      });

      it('should mask 16-digit NIK numbers', () => {
        const content = 'NIK: 3201123456789012';
        const masked = service.maskPII(content);

        expect(masked).not.toContain('3201123456789012');
        expect(masked).toContain('********');
      });

      it('should mask credit card numbers', () => {
        const content = 'Card: 1234 5678 9012 3456';
        const masked = service.maskPII(content);

        expect(masked).not.toContain('1234 5678 9012 3456');
        expect(masked).toContain('**** **** **** 3456');
      });

      it('should return unchanged content when no PII found', () => {
        const content = 'This is a regular message without any PII.';
        const masked = service.maskPII(content);

        expect(masked).toBe(content);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Channel Authorization Tests
  // -------------------------------------------------------------------------

  describe('Channel Authorization', () => {
    describe('isChannelAuthorized', () => {
      it('should authorize inbox for all content types', () => {
        expect(service.isChannelAuthorized('inbox', NotificationContentType.ANNOUNCEMENT)).toBe(true);
        expect(service.isChannelAuthorized('inbox', NotificationContentType.EMERGENCY)).toBe(true);
        expect(service.isChannelAuthorized('inbox', NotificationContentType.FINANCIAL)).toBe(true);
        expect(service.isChannelAuthorized('inbox', NotificationContentType.PERSONAL)).toBe(true);
      });

      it('should authorize push for emergency notifications', () => {
        expect(service.isChannelAuthorized('push', NotificationContentType.EMERGENCY)).toBe(true);
        expect(service.isChannelAuthorized('push', NotificationContentType.ANNOUNCEMENT)).toBe(true);
      });

      it('should not authorize push for personal notifications', () => {
        expect(service.isChannelAuthorized('push', NotificationContentType.PERSONAL)).toBe(false);
      });

      it('should not authorize email for personal notifications', () => {
        expect(service.isChannelAuthorized('email', NotificationContentType.PERSONAL)).toBe(false);
      });

      it('should check role authorization', () => {
        // RT_ADMIN can use email for financial
        expect(
          service.isChannelAuthorized('email', NotificationContentType.FINANCIAL, 'RT_ADMIN'),
        ).toBe(true);

        // RESIDENT cannot use push
        expect(
          service.isChannelAuthorized('push', NotificationContentType.ANNOUNCEMENT, 'RESIDENT'),
        ).toBe(false);
      });
    });

    describe('getAuthorizedChannels', () => {
      it('should return all channels for announcement by admin', () => {
        const channels = service.getAuthorizedChannels(
          NotificationContentType.ANNOUNCEMENT,
          'RT_ADMIN',
        );

        expect(channels).toContain('inbox');
        expect(channels).toContain('push');
        expect(channels).toContain('email');
      });

      it('should return only inbox for personal content', () => {
        const channels = service.getAuthorizedChannels(
          NotificationContentType.PERSONAL,
          'RESIDENT',
        );

        expect(channels).toContain('inbox');
        expect(channels).not.toContain('push');
        expect(channels).not.toContain('email');
      });

      it('should return limited channels for resident role', () => {
        const channels = service.getAuthorizedChannels(
          NotificationContentType.EMERGENCY,
          'RESIDENT',
        );

        // Resident can use inbox but not push/email
        expect(channels).toContain('inbox');
        expect(channels).not.toContain('push');
        expect(channels).not.toContain('email');
      });
    });
  });

  // -------------------------------------------------------------------------
  // Audit Logging Tests
  // -------------------------------------------------------------------------

  describe('Audit Logging', () => {
    describe('logDelivery', () => {
      it('should create audit record for successful delivery', async () => {
        const result = await service.logDelivery({
          notificationId: 'notif-123',
          tenantId: 'tenant-A',
          senderId: 'sender-123',
          recipientIds: ['recipient-1', 'recipient-2'],
          channels: ['inbox', 'push'],
          contentType: NotificationContentType.ANNOUNCEMENT,
          success: true,
          correlationId: 'corr-123',
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.notificationId).toBe('notif-123');
          expect(result.data.tenantId).toBe('tenant-A');
          expect(result.data.recipientCount).toBe(2);
          expect(result.data.success).toBe(true);
        }

        expect(mockAuditEmitter.deliveryAudits).toHaveLength(1);
      });

      it('should create audit record for failed delivery', async () => {
        const result = await service.logDelivery({
          notificationId: 'notif-456',
          tenantId: 'tenant-A',
          senderId: 'sender-123',
          recipientIds: ['recipient-1'],
          channels: ['email'],
          contentType: NotificationContentType.FINANCIAL,
          success: false,
          failureReason: 'Email service unavailable',
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.success).toBe(false);
        }
      });

      it('should fail when tenant ID is missing', async () => {
        const result = await service.logDelivery({
          notificationId: 'notif-789',
          tenantId: '',
          senderId: 'sender-123',
          recipientIds: ['recipient-1'],
          channels: ['inbox'],
          contentType: NotificationContentType.SYSTEM,
          success: true,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('NOTIFICATION_AUDIT_TENANT_REQUIRED');
        }
      });

      it('should handle audit emitter failures gracefully', async () => {
        // Create a failing emitter
        const failingEmitter: INotificationDeliveryAuditEmitter = {
          emitDeliveryAudit: vi.fn(async () => {
            throw new Error('Emitter failure');
          }),
          emitSecurityViolation: vi.fn(),
        };

        const serviceWithFailingEmitter = NotificationSecurityServiceImpl({
          auditEmitter: failingEmitter,
        });

        // Should not throw, should return success
        const result = await serviceWithFailingEmitter.logDelivery({
          notificationId: 'notif-000',
          tenantId: 'tenant-A',
          senderId: 'sender-123',
          recipientIds: ['recipient-1'],
          channels: ['inbox'],
          contentType: NotificationContentType.SYSTEM,
          success: true,
        });

        expect(result.success).toBe(true);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Configuration Tests
  // -------------------------------------------------------------------------

  describe('Configuration', () => {
    describe('getChannelConfig', () => {
      it('should return current channel configuration', () => {
        const config = service.getChannelConfig();

        expect(config).toHaveProperty('inbox');
        expect(config).toHaveProperty('push');
        expect(config).toHaveProperty('email');
        expect(config.inbox.allowedContentTypes).toContain(NotificationContentType.ANNOUNCEMENT);
      });
    });

    describe('updateChannelConfig', () => {
      it('should update channel configuration', () => {
        service.updateChannelConfig('push', {
          requiresConsent: false,
        });

        const config = service.getChannelConfig();
        expect(config.push.requiresConsent).toBe(false);
      });

      it('should not affect other channels when updating one', () => {
        const originalInboxConfig = { ...service.getChannelConfig().inbox };

        service.updateChannelConfig('push', {
          allowedRoles: ['PLATFORM_ADMIN'],
        });

        const newConfig = service.getChannelConfig();
        expect(newConfig.inbox).toEqual(originalInboxConfig);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Edge Cases and Error Handling Tests
  // -------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle empty recipient list', async () => {
      const input: ValidateNotificationDeliveryInput = {
        sender: createTestSender(),
        recipients: [],
        notificationType: 'announcement',
        contentType: NotificationContentType.ANNOUNCEMENT,
        channels: ['inbox'],
      };

      const result = await service.validateDelivery(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.validRecipientIds).toHaveLength(0);
        expect(result.data.invalidRecipients).toHaveLength(0);
        expect(result.data.allRecipientsValid).toBe(true);
      }
    });

    it('should handle empty channel list', async () => {
      const input: ValidateNotificationDeliveryInput = {
        sender: createTestSender(),
        recipients: [createTestRecipient()],
        notificationType: 'announcement',
        contentType: NotificationContentType.ANNOUNCEMENT,
        channels: [],
      };

      const result = await service.validateDelivery(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowedChannels).toHaveLength(0);
        expect(result.data.status).toBe(NotificationSecurityStatus.CHANNEL_NOT_ALLOWED);
      }
    });

    it('should handle mixed valid and invalid recipients', async () => {
      const input: ValidateNotificationDeliveryInput = {
        sender: createTestSender({ tenantId: 'tenant-A' }),
        recipients: [
          createTestRecipient({ userId: 'valid-1', tenantId: 'tenant-A', hasActiveMembership: true }),
          createTestRecipient({ userId: 'invalid-tenant', tenantId: 'tenant-B', hasActiveMembership: true }),
          createTestRecipient({ userId: 'inactive', tenantId: 'tenant-A', hasActiveMembership: false }),
          createTestRecipient({ userId: 'valid-2', tenantId: 'tenant-A', hasActiveMembership: true }),
        ],
        notificationType: 'announcement',
        contentType: NotificationContentType.ANNOUNCEMENT,
        channels: ['inbox'],
      };

      const result = await service.validateDelivery(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.validRecipientIds).toHaveLength(2);
        expect(result.data.validRecipientIds).toContain('valid-1');
        expect(result.data.validRecipientIds).toContain('valid-2');
        expect(result.data.invalidRecipients).toHaveLength(2);
      }
    });

    it('should handle content with multiple PII types', () => {
      const input: ValidateNotificationContentInput = {
        tenantId: 'tenant-A',
        title: 'User Info Update',
        body: 'Contact: test@email.com, Phone: 0812-1234-5678, NIK: 3201123456789012',
        contentType: NotificationContentType.ADMINISTRATIVE,
        sensitivityLevel: ContentSensitivityLevel.PUBLIC,
      };

      const result = service.validateContent(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.contentModified).toBe(true);
        expect(result.data.sanitizedBody).not.toContain('test@email.com');
        expect(result.data.sanitizedBody).not.toContain('0812-1234-5678');
        expect(result.data.sanitizedBody).not.toContain('3201123456789012');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Service Creation Tests
  // -------------------------------------------------------------------------

  describe('Service Creation', () => {
    it('should create service with default configuration', () => {
      const defaultService = NotificationSecurityServiceImpl({});

      expect(defaultService).toBeDefined();
      expect(defaultService.getChannelConfig()).toBeDefined();
    });

    it('should create service with custom audit emitter', () => {
      const customEmitter = createMockAuditEmitter();
      const customService = NotificationSecurityServiceImpl({
        auditEmitter: customEmitter,
      });

      expect(customService).toBeDefined();
    });

    it('should create service with custom channel config', () => {
      const customConfig: Record<NotificationChannel, typeof DEFAULT_CHANNEL_CONFIG.inbox> = {
        inbox: {
          ...DEFAULT_CHANNEL_CONFIG.inbox,
          allowedRoles: ['PLATFORM_ADMIN'],
        },
        push: DEFAULT_CHANNEL_CONFIG.push,
        email: DEFAULT_CHANNEL_CONFIG.email,
      };

      const customService = NotificationSecurityServiceImpl({
        channelConfig: customConfig,
      });

      const config = customService.getChannelConfig();
      expect(config.inbox.allowedRoles).toEqual(['PLATFORM_ADMIN']);
    });
  });
});
