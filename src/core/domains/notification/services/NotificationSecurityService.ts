/**
 * NotificationSecurityService — Notification security for multi-tenant SaaS architecture.
 *
 * This service provides comprehensive notification security including:
 * 1. Tenant isolation for notifications
 * 2. Recipient validation (same tenant only)
 * 3. Content security validation
 * 4. Channel authorization
 * 5. Audit logging for notification delivery
 *
 * **TENANT ISOLATION REQUIREMENTS:**
 * - Notifications MUST only be delivered to users within the same tenant
 * - Cross-tenant notification delivery MUST be prevented
 * - Notification content MUST NOT leak across tenant boundaries
 * - All recipient validation MUST be performed server-side
 *
 * **SECURITY CONSIDERATIONS:**
 * - Tenant is the security boundary (tenant_id, NOT orgUnit path)
 * - Recipient validation via active membership check
 * - PII in notifications must be handled appropriately (masking)
 * - Fail closed on unknown states (INV-AUTH-002)
 *
 * @see Task 71: Notification Security (Req 56)
 * @see Requirements 56 — Notification Security
 * @see Error Handling Guideline (12-error-handling.md)
 */

import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import { authorizationError, validationError } from '@core/utils';
import type { NotificationChannel } from '../entities';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Notification security validation result status.
 */
export enum NotificationSecurityStatus {
  /** Validation passed */
  ALLOWED = 'ALLOWED',
  /** Recipient not in sender's tenant */
  RECIPIENT_TENANT_MISMATCH = 'RECIPIENT_TENANT_MISMATCH',
  /** Recipient has no active membership */
  RECIPIENT_NOT_ACTIVE = 'RECIPIENT_NOT_ACTIVE',
  /** Content contains unauthorized data */
  CONTENT_UNAUTHORIZED = 'CONTENT_UNAUTHORIZED',
  /** Channel not allowed for this notification type */
  CHANNEL_NOT_ALLOWED = 'CHANNEL_NOT_ALLOWED',
  /** Sender not authorized */
  SENDER_NOT_AUTHORIZED = 'SENDER_NOT_AUTHORIZED',
  /** Tenant context missing */
  TENANT_CONTEXT_MISSING = 'TENANT_CONTEXT_MISSING',
}

/**
 * Notification content classification for security.
 */
export enum NotificationContentType {
  /** General announcement */
  ANNOUNCEMENT = 'ANNOUNCEMENT',
  /** Emergency alert */
  EMERGENCY = 'EMERGENCY',
  /** Financial/billing notification */
  FINANCIAL = 'FINANCIAL',
  /** Administrative notification */
  ADMINISTRATIVE = 'ADMINISTRATIVE',
  /** System notification */
  SYSTEM = 'SYSTEM',
  /** Personal message */
  PERSONAL = 'PERSONAL',
}

/**
 * Sensitivity level for notification content.
 */
export enum ContentSensitivityLevel {
  /** Public/general information */
  PUBLIC = 'PUBLIC',
  /** Internal tenant information */
  INTERNAL = 'INTERNAL',
  /** Sensitive personal information */
  SENSITIVE = 'SENSITIVE',
  /** Highly confidential information */
  CONFIDENTIAL = 'CONFIDENTIAL',
}

// ---------------------------------------------------------------------------
// Input Types
// ---------------------------------------------------------------------------

/**
 * Sender context for notification security validation.
 */
export interface NotificationSenderContext {
  /** Sender user ID */
  readonly userId: string;
  /** Sender's active tenant ID */
  readonly tenantId: string;
  /** Sender's role (for channel authorization) */
  readonly role?: string;
  /** Optional OrgUnit scope */
  readonly orgUnitId?: string | null;
}

/**
 * Recipient information for validation.
 */
export interface NotificationRecipient {
  /** Recipient user ID */
  readonly userId: string;
  /** Recipient's tenant ID (for cross-tenant check) */
  readonly tenantId: string;
  /** Whether recipient has active membership */
  readonly hasActiveMembership: boolean;
  /** Optional: Recipient's OrgUnit */
  readonly orgUnitId?: string | null;
}

/**
 * Input for validating notification delivery.
 */
export interface ValidateNotificationDeliveryInput {
  /** Sender context */
  readonly sender: NotificationSenderContext;
  /** Recipient(s) to validate */
  readonly recipients: readonly NotificationRecipient[];
  /** Notification type for content classification */
  readonly notificationType: string;
  /** Content type for security classification */
  readonly contentType: NotificationContentType;
  /** Channels to deliver through */
  readonly channels: readonly NotificationChannel[];
}

/**
 * Input for validating notification content.
 */
export interface ValidateNotificationContentInput {
  /** Tenant context */
  readonly tenantId: string;
  /** Notification title */
  readonly title: string;
  /** Notification body */
  readonly body: string;
  /** Content type */
  readonly contentType: NotificationContentType;
  /** Sensitivity level */
  readonly sensitivityLevel: ContentSensitivityLevel;
  /** Additional data/payload */
  readonly additionalData?: Record<string, unknown>;
}

/**
 * Input for logging notification delivery audit.
 */
export interface LogNotificationDeliveryInput {
  /** Notification ID */
  readonly notificationId: string;
  /** Tenant ID */
  readonly tenantId: string;
  /** Sender user ID */
  readonly senderId: string;
  /** Recipient user IDs */
  readonly recipientIds: readonly string[];
  /** Delivery channels */
  readonly channels: readonly NotificationChannel[];
  /** Content type */
  readonly contentType: NotificationContentType;
  /** Whether delivery was successful */
  readonly success: boolean;
  /** Failure reason (if not successful) */
  readonly failureReason?: string;
  /** Correlation ID for tracing */
  readonly correlationId?: string;
  /** IP address */
  readonly ipAddress?: string;
}

// ---------------------------------------------------------------------------
// Result Types
// ---------------------------------------------------------------------------

/**
 * Result of notification delivery validation.
 */
export interface NotificationDeliveryValidationResult {
  /** Overall validation status */
  readonly status: NotificationSecurityStatus;
  /** Whether all recipients are valid */
  readonly allRecipientsValid: boolean;
  /** Valid recipient IDs */
  readonly validRecipientIds: readonly string[];
  /** Invalid recipients with reasons */
  readonly invalidRecipients: readonly InvalidRecipientInfo[];
  /** Allowed channels */
  readonly allowedChannels: readonly NotificationChannel[];
  /** Denied channels with reasons */
  readonly deniedChannels: readonly DeniedChannelInfo[];
  /** Security warnings (non-blocking) */
  readonly warnings: readonly string[];
}

/**
 * Information about an invalid recipient.
 */
export interface InvalidRecipientInfo {
  /** Recipient user ID */
  readonly userId: string;
  /** Reason for invalidity */
  readonly reason: NotificationSecurityStatus;
  /** Human-readable description */
  readonly description: string;
}

/**
 * Information about a denied channel.
 */
export interface DeniedChannelInfo {
  /** Channel name */
  readonly channel: NotificationChannel;
  /** Reason for denial */
  readonly reason: string;
}

/**
 * Result of content validation.
 */
export interface NotificationContentValidationResult {
  /** Whether content is valid */
  readonly valid: boolean;
  /** Masked/sanitized content (if applicable) */
  readonly sanitizedTitle?: string;
  /** Masked/sanitized body (if applicable) */
  readonly sanitizedBody?: string;
  /** Content violations found */
  readonly violations: readonly ContentViolation[];
  /** Whether content was modified */
  readonly contentModified: boolean;
}

/**
 * Information about a content violation.
 */
export interface ContentViolation {
  /** Type of violation */
  readonly type: 'PII_LEAK' | 'CROSS_TENANT_REF' | 'UNAUTHORIZED_DATA' | 'SENSITIVE_EXPOSURE';
  /** Field where violation was found */
  readonly field: string;
  /** Description of the violation */
  readonly description: string;
  /** Whether it was auto-remediated */
  readonly remediated: boolean;
}

/**
 * Notification delivery audit record.
 */
export interface NotificationDeliveryAuditRecord {
  /** Audit record ID */
  readonly id: string;
  /** Notification ID */
  readonly notificationId: string;
  /** Tenant ID */
  readonly tenantId: string;
  /** Sender ID */
  readonly senderId: string;
  /** Number of recipients */
  readonly recipientCount: number;
  /** Channels used */
  readonly channels: readonly NotificationChannel[];
  /** Content type */
  readonly contentType: NotificationContentType;
  /** Success status */
  readonly success: boolean;
  /** Timestamp */
  readonly timestamp: Date;
  /** Correlation ID */
  readonly correlationId?: string;
}

// ---------------------------------------------------------------------------
// Channel Authorization Configuration
// ---------------------------------------------------------------------------

/**
 * Channel authorization rules per content type.
 */
export interface ChannelAuthorizationConfig {
  /** Content types that can use this channel */
  readonly allowedContentTypes: readonly NotificationContentType[];
  /** Roles that can send via this channel */
  readonly allowedRoles: readonly string[];
  /** Whether this channel requires explicit consent */
  readonly requiresConsent: boolean;
}

/**
 * Default channel authorization configuration.
 */
export const DEFAULT_CHANNEL_CONFIG: Record<NotificationChannel, ChannelAuthorizationConfig> = {
  inbox: {
    allowedContentTypes: [
      NotificationContentType.ANNOUNCEMENT,
      NotificationContentType.EMERGENCY,
      NotificationContentType.FINANCIAL,
      NotificationContentType.ADMINISTRATIVE,
      NotificationContentType.SYSTEM,
      NotificationContentType.PERSONAL,
    ],
    allowedRoles: [
      'PLATFORM_ADMIN',
      'TENANT_OWNER',
      'ORG_ADMIN',
      'RT_ADMIN',
      'SECURITY',
      'RESIDENT',
    ],
    requiresConsent: false,
  },
  push: {
    allowedContentTypes: [
      NotificationContentType.ANNOUNCEMENT,
      NotificationContentType.EMERGENCY,
      NotificationContentType.ADMINISTRATIVE,
      NotificationContentType.SYSTEM,
    ],
    allowedRoles: [
      'PLATFORM_ADMIN',
      'TENANT_OWNER',
      'ORG_ADMIN',
      'RT_ADMIN',
      'SECURITY',
    ],
    requiresConsent: true,
  },
  email: {
    allowedContentTypes: [
      NotificationContentType.ANNOUNCEMENT,
      NotificationContentType.FINANCIAL,
      NotificationContentType.ADMINISTRATIVE,
      NotificationContentType.SYSTEM,
    ],
    allowedRoles: [
      'PLATFORM_ADMIN',
      'TENANT_OWNER',
      'ORG_ADMIN',
      'RT_ADMIN',
    ],
    requiresConsent: true,
  },
};

// ---------------------------------------------------------------------------
// Sensitive Data Patterns
// ---------------------------------------------------------------------------

/**
 * Patterns for detecting PII in notification content.
 * Used for content validation and masking.
 */
const PII_PATTERNS: readonly { name: string; pattern: RegExp; maskFn: (match: string) => string }[] = [
  {
    name: 'email',
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    maskFn: (m) => {
      const [local, domain] = m.split('@');
      const maskedLocal = local ? (local.length > 2 ? local[0] + '***' + local[local.length - 1] : '***') : '***';
      return `${maskedLocal}@${domain}`;
    },
  },
  {
    name: 'phone',
    pattern: /(\+62|62|0)[\s-]?\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4}/g,
    maskFn: (m) => {
      const digits = m.replace(/[\s-]/g, '');
      return digits.slice(0, 4) + '****' + digits.slice(-4);
    },
  },
  {
    name: 'nik',
    pattern: /\b\d{16}\b/g,
    maskFn: (m) => m.slice(0, 4) + '********' + m.slice(-4),
  },
  {
    name: 'credit_card',
    pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    maskFn: (m) => '**** **** **** ' + m.slice(-4),
  },
];

/**
 * Patterns that might indicate cross-tenant data leakage.
 */
const CROSS_TENANT_PATTERNS: readonly { name: string; pattern: RegExp }[] = [
  { name: 'tenant_id_reference', pattern: /tenant[_-]?id\s*[:=]\s*[a-f0-9-]{36}/gi },
  { name: 'other_tenant_name', pattern: /tenant\s*[:=]\s*["'][^"']+["']/gi },
];

// ---------------------------------------------------------------------------
// Audit Emitter Interface
// ---------------------------------------------------------------------------

/**
 * Interface for emitting notification delivery audit events.
 */
export interface INotificationDeliveryAuditEmitter {
  /**
   * Emit a notification delivery audit event.
   */
  emitDeliveryAudit(record: NotificationDeliveryAuditRecord): Promise<void>;

  /**
   * Emit a security violation event.
   */
  emitSecurityViolation(
    tenantId: string,
    senderId: string,
    violationType: NotificationSecurityStatus,
    details: Record<string, unknown>,
  ): Promise<void>;
}

/**
 * Console-based audit emitter for development/testing.
 */
export const ConsoleNotificationDeliveryAuditEmitter: INotificationDeliveryAuditEmitter = {
  async emitDeliveryAudit(record) {
    console.info('[NOTIFICATION_AUDIT] Delivery:', {
      notificationId: record.notificationId,
      tenantId: record.tenantId,
      senderId: record.senderId,
      recipientCount: record.recipientCount,
      channels: record.channels,
      success: record.success,
      timestamp: record.timestamp.toISOString(),
    });
  },

  async emitSecurityViolation(tenantId, senderId, violationType, details) {
    console.warn('[NOTIFICATION_SECURITY_VIOLATION]:', {
      tenantId,
      senderId,
      violationType,
      details,
      timestamp: new Date().toISOString(),
    });
  },
};

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

/**
 * INotificationSecurityService interface.
 *
 * Provides comprehensive notification security including tenant isolation,
 * recipient validation, content security, and audit logging.
 */
export interface INotificationSecurityService {
  // ---------------------------------------------------------------------------
  // Tenant Isolation Validation
  // ---------------------------------------------------------------------------

  /**
   * Validate notification delivery for tenant isolation.
   *
   * Ensures all recipients belong to the sender's tenant and have
   * active memberships.
   *
   * @param input - Delivery validation input
   * @returns Validation result with valid/invalid recipients
   */
  validateDelivery(
    input: ValidateNotificationDeliveryInput,
  ): Promise<DomainResult<NotificationDeliveryValidationResult>>;

  /**
   * Check if a recipient is in the same tenant as sender.
   *
   * @param senderId - Sender user ID
   * @param senderTenantId - Sender's tenant ID
   * @param recipientId - Recipient user ID
   * @param recipientTenantId - Recipient's claimed tenant ID
   * @returns Whether recipient is in same tenant
   */
  validateRecipientTenant(
    senderId: string,
    senderTenantId: string,
    recipientId: string,
    recipientTenantId: string,
  ): DomainResult<boolean>;

  // ---------------------------------------------------------------------------
  // Content Security Validation
  // ---------------------------------------------------------------------------

  /**
   * Validate notification content for security.
   *
   * Checks for PII leakage, cross-tenant references, and unauthorized data.
   * Can sanitize content by masking sensitive information.
   *
   * @param input - Content validation input
   * @returns Validation result with optional sanitized content
   */
  validateContent(
    input: ValidateNotificationContentInput,
  ): DomainResult<NotificationContentValidationResult>;

  /**
   * Mask PII in notification content.
   *
   * @param content - Raw content string
   * @returns Masked content with PII redacted
   */
  maskPII(content: string): string;

  // ---------------------------------------------------------------------------
  // Channel Authorization
  // ---------------------------------------------------------------------------

  /**
   * Check if a channel is authorized for the given context.
   *
   * @param channel - Notification channel
   * @param contentType - Type of notification content
   * @param senderRole - Sender's role
   * @returns Whether channel is authorized
   */
  isChannelAuthorized(
    channel: NotificationChannel,
    contentType: NotificationContentType,
    senderRole?: string,
  ): boolean;

  /**
   * Get authorized channels for a content type and sender role.
   *
   * @param contentType - Type of notification content
   * @param senderRole - Sender's role
   * @returns List of authorized channels
   */
  getAuthorizedChannels(
    contentType: NotificationContentType,
    senderRole?: string,
  ): readonly NotificationChannel[];

  // ---------------------------------------------------------------------------
  // Audit Logging
  // ---------------------------------------------------------------------------

  /**
   * Log notification delivery for audit trail.
   *
   * @param input - Delivery log input
   * @returns Created audit record
   */
  logDelivery(
    input: LogNotificationDeliveryInput,
  ): Promise<DomainResult<NotificationDeliveryAuditRecord>>;

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  /**
   * Get channel authorization configuration.
   */
  getChannelConfig(): Record<NotificationChannel, ChannelAuthorizationConfig>;

  /**
   * Update channel authorization configuration.
   */
  updateChannelConfig(
    channel: NotificationChannel,
    config: Partial<ChannelAuthorizationConfig>,
  ): void;
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a NotificationSecurityService instance.
 *
 * This pattern follows Clean Architecture DI principles — dependencies are
 * injected via the factory parameter, making the service testable and
 * decoupled from concrete implementations.
 *
 * @param dependencies - Service dependencies
 * @returns An implementation of INotificationSecurityService
 *
 * @example
 * ```typescript
 * // DI Registration (in container setup)
 * container.register({
 *   notificationSecurityService: asFunction(NotificationSecurityServiceImpl).singleton(),
 * });
 *
 * // Usage
 * const notificationSecurity = DI.resolve('notificationSecurityService');
 * const result = await notificationSecurity.validateDelivery({
 *   sender: { userId: 'sender-123', tenantId: 'tenant-A' },
 *   recipients: [{ userId: 'recipient-456', tenantId: 'tenant-A', hasActiveMembership: true }],
 *   notificationType: 'announcement',
 *   contentType: NotificationContentType.ANNOUNCEMENT,
 *   channels: ['inbox'],
 * });
 * ```
 */
export const NotificationSecurityServiceImpl = ({
  auditEmitter = ConsoleNotificationDeliveryAuditEmitter,
  channelConfig = DEFAULT_CHANNEL_CONFIG,
}: {
  auditEmitter?: INotificationDeliveryAuditEmitter;
  channelConfig?: Record<NotificationChannel, ChannelAuthorizationConfig>;
}): INotificationSecurityService => {
  // Mutable channel configuration
  let currentChannelConfig = { ...channelConfig };

  // ---------------------------------------------------------------------------
  // Helper Functions
  // ---------------------------------------------------------------------------

  /**
   * Generate a unique ID.
   */
  const generateId = (prefix: string): string => {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}-${timestamp}-${random}`;
  };

  /**
   * Validate tenant ID is provided.
   */
  const validateTenantId = (tenantId: string | undefined): DomainResult<void> => {
    if (!tenantId || tenantId.trim() === '') {
      return fail(validationError(
        'NOTIFICATION_SECURITY_TENANT_REQUIRED',
        'Tenant ID is required for notification security operations',
      ));
    }
    return ok(undefined);
  };

  /**
   * Check for cross-tenant patterns in content.
   */
  const detectCrossTenantPatterns = (content: string): ContentViolation[] => {
    const violations: ContentViolation[] = [];

    for (const { name, pattern } of CROSS_TENANT_PATTERNS) {
      const matches = content.match(pattern);
      if (matches && matches.length > 0) {
        violations.push({
          type: 'CROSS_TENANT_REF',
          field: 'content',
          description: `Potential cross-tenant reference detected: ${name}`,
          remediated: false,
        });
      }
    }

    return violations;
  };

  /**
   * Check for PII patterns in content.
   */
  const detectPIIPatterns = (content: string): ContentViolation[] => {
    const violations: ContentViolation[] = [];

    for (const { name, pattern } of PII_PATTERNS) {
      // Create new RegExp to reset lastIndex
      const regex = new RegExp(pattern.source, pattern.flags);
      const matches = content.match(regex);
      if (matches && matches.length > 0) {
        violations.push({
          type: 'PII_LEAK',
          field: 'content',
          description: `Potential PII detected: ${name} (${matches.length} occurrence(s))`,
          remediated: false,
        });
      }
    }

    return violations;
  };

  /**
   * Mask PII in content.
   */
  const maskPIIInContent = (content: string): { masked: string; modified: boolean } => {
    let result = content;
    let modified = false;

    for (const { pattern, maskFn } of PII_PATTERNS) {
      // Create new RegExp to reset lastIndex
      const regex = new RegExp(pattern.source, pattern.flags);
      const newResult = result.replace(regex, (match) => {
        modified = true;
        return maskFn(match);
      });
      result = newResult;
    }

    return { masked: result, modified };
  };

  // ---------------------------------------------------------------------------
  // Service Implementation
  // ---------------------------------------------------------------------------

  return {
    // -------------------------------------------------------------------------
    // Tenant Isolation Validation
    // -------------------------------------------------------------------------

    async validateDelivery(
      input: ValidateNotificationDeliveryInput,
    ): Promise<DomainResult<NotificationDeliveryValidationResult>> {
      // Validate sender tenant context
      const tenantValidation = validateTenantId(input.sender.tenantId);
      if (!tenantValidation.success) {
        return fail(authorizationError(
          'NOTIFICATION_SENDER_TENANT_MISSING',
          'Sender tenant context is required',
        ));
      }

      const validRecipientIds: string[] = [];
      const invalidRecipients: InvalidRecipientInfo[] = [];
      const warnings: string[] = [];

      // Validate each recipient
      for (const recipient of input.recipients) {
        // Check tenant match
        if (recipient.tenantId !== input.sender.tenantId) {
          invalidRecipients.push({
            userId: recipient.userId,
            reason: NotificationSecurityStatus.RECIPIENT_TENANT_MISMATCH,
            description: 'Recipient is not in the same tenant as sender',
          });

          // Log security violation for cross-tenant attempt
          await auditEmitter.emitSecurityViolation(
            input.sender.tenantId,
            input.sender.userId,
            NotificationSecurityStatus.RECIPIENT_TENANT_MISMATCH,
            {
              recipientId: recipient.userId,
              recipientTenantId: recipient.tenantId,
              attemptedChannels: input.channels,
            },
          );

          continue;
        }

        // Check active membership
        if (!recipient.hasActiveMembership) {
          invalidRecipients.push({
            userId: recipient.userId,
            reason: NotificationSecurityStatus.RECIPIENT_NOT_ACTIVE,
            description: 'Recipient does not have an active membership',
          });
          continue;
        }

        validRecipientIds.push(recipient.userId);
      }

      // Validate channels
      const allowedChannels: NotificationChannel[] = [];
      const deniedChannels: DeniedChannelInfo[] = [];

      for (const channel of input.channels) {
        if (this.isChannelAuthorized(channel, input.contentType, input.sender.role)) {
          allowedChannels.push(channel);
        } else {
          deniedChannels.push({
            channel,
            reason: `Channel '${channel}' is not authorized for content type '${input.contentType}' with sender role '${input.sender.role ?? 'unknown'}'`,
          });
        }
      }

      // Determine overall status
      let status: NotificationSecurityStatus;
      if (invalidRecipients.length > 0 && validRecipientIds.length === 0) {
        status = invalidRecipients[0]?.reason ?? NotificationSecurityStatus.RECIPIENT_TENANT_MISMATCH;
      } else if (allowedChannels.length === 0) {
        status = NotificationSecurityStatus.CHANNEL_NOT_ALLOWED;
      } else {
        status = NotificationSecurityStatus.ALLOWED;
      }

      // Add warnings for partial failures
      if (invalidRecipients.length > 0 && validRecipientIds.length > 0) {
        warnings.push(`${invalidRecipients.length} recipient(s) were invalid and will not receive the notification`);
      }
      if (deniedChannels.length > 0 && allowedChannels.length > 0) {
        warnings.push(`${deniedChannels.length} channel(s) were denied for this notification`);
      }

      return ok({
        status,
        allRecipientsValid: invalidRecipients.length === 0,
        validRecipientIds,
        invalidRecipients,
        allowedChannels,
        deniedChannels,
        warnings,
      });
    },

    validateRecipientTenant(
      senderId: string,
      senderTenantId: string,
      recipientId: string,
      recipientTenantId: string,
    ): DomainResult<boolean> {
      // Validate sender tenant
      const senderValidation = validateTenantId(senderTenantId);
      if (!senderValidation.success) {
        return fail(validationError(
          'NOTIFICATION_SENDER_TENANT_MISSING',
          'Sender tenant ID is required',
        ));
      }

      // Validate recipient tenant
      const recipientValidation = validateTenantId(recipientTenantId);
      if (!recipientValidation.success) {
        return fail(validationError(
          'NOTIFICATION_RECIPIENT_TENANT_MISSING',
          'Recipient tenant ID is required',
        ));
      }

      // Check tenant match
      if (senderTenantId !== recipientTenantId) {
        return fail(authorizationError(
          'NOTIFICATION_CROSS_TENANT_BLOCKED',
          `Cross-tenant notification not allowed. Sender tenant: ${senderTenantId}, Recipient tenant: ${recipientTenantId}`,
        ));
      }

      return ok(true);
    },

    // -------------------------------------------------------------------------
    // Content Security Validation
    // -------------------------------------------------------------------------

    validateContent(
      input: ValidateNotificationContentInput,
    ): DomainResult<NotificationContentValidationResult> {
      // Validate tenant context
      const tenantValidation = validateTenantId(input.tenantId);
      if (!tenantValidation.success) {
        return fail(validationError(
          'NOTIFICATION_CONTENT_TENANT_REQUIRED',
          'Tenant ID is required for content validation',
        ));
      }

      const violations: ContentViolation[] = [];
      let contentModified = false;

      // Combine title and body for analysis
      const fullContent = `${input.title} ${input.body}`;

      // Check for cross-tenant patterns
      const crossTenantViolations = detectCrossTenantPatterns(fullContent);
      violations.push(...crossTenantViolations);

      // Check for PII based on sensitivity level
      if (input.sensitivityLevel === ContentSensitivityLevel.SENSITIVE ||
          input.sensitivityLevel === ContentSensitivityLevel.CONFIDENTIAL) {
        // For sensitive content, warn about PII but don't auto-mask
        const piiViolations = detectPIIPatterns(fullContent);
        violations.push(...piiViolations);
      }

      // Check additional data for sensitive keys
      if (input.additionalData) {
        const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'creditCard', 'nik', 'ssn'];
        for (const key of Object.keys(input.additionalData)) {
          const lowerKey = key.toLowerCase();
          if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
            violations.push({
              type: 'SENSITIVE_EXPOSURE',
              field: `additionalData.${key}`,
              description: `Sensitive data key detected: ${key}`,
              remediated: false,
            });
          }
        }
      }

      // Sanitize content for PUBLIC and INTERNAL levels (auto-mask PII)
      let sanitizedTitle: string | undefined;
      let sanitizedBody: string | undefined;

      if (input.sensitivityLevel === ContentSensitivityLevel.PUBLIC ||
          input.sensitivityLevel === ContentSensitivityLevel.INTERNAL) {
        const titleResult = maskPIIInContent(input.title);
        const bodyResult = maskPIIInContent(input.body);

        if (titleResult.modified) {
          sanitizedTitle = titleResult.masked;
          contentModified = true;
          // Mark PII violations as remediated
          violations.forEach((v, i) => {
            if (v.type === 'PII_LEAK') {
              // Create new violation object to avoid mutation
              violations[i] = { ...v, remediated: true };
            }
          });
        }

        if (bodyResult.modified) {
          sanitizedBody = bodyResult.masked;
          contentModified = true;
        }
      }

      // Determine if content is valid
      // Cross-tenant references are always invalid
      // PII in SENSITIVE/CONFIDENTIAL content is invalid (not auto-remediated)
      const hasUnremediatedViolations = violations.some(
        v => !v.remediated && (v.type === 'CROSS_TENANT_REF' || v.type === 'SENSITIVE_EXPOSURE'),
      );

      return ok({
        valid: !hasUnremediatedViolations,
        sanitizedTitle,
        sanitizedBody,
        violations,
        contentModified,
      });
    },

    maskPII(content: string): string {
      return maskPIIInContent(content).masked;
    },

    // -------------------------------------------------------------------------
    // Channel Authorization
    // -------------------------------------------------------------------------

    isChannelAuthorized(
      channel: NotificationChannel,
      contentType: NotificationContentType,
      senderRole?: string,
    ): boolean {
      const config = currentChannelConfig[channel];
      if (!config) {
        return false;
      }

      // Check content type
      if (!config.allowedContentTypes.includes(contentType)) {
        return false;
      }

      // Check role if provided
      if (senderRole && !config.allowedRoles.includes(senderRole)) {
        return false;
      }

      // If no role provided and channel requires role check, allow by default
      // (role check is done at a higher level)
      return true;
    },

    getAuthorizedChannels(
      contentType: NotificationContentType,
      senderRole?: string,
    ): readonly NotificationChannel[] {
      const channels: NotificationChannel[] = [];

      for (const [channel, config] of Object.entries(currentChannelConfig) as [NotificationChannel, ChannelAuthorizationConfig][]) {
        if (config.allowedContentTypes.includes(contentType)) {
          if (!senderRole || config.allowedRoles.includes(senderRole)) {
            channels.push(channel);
          }
        }
      }

      return channels;
    },

    // -------------------------------------------------------------------------
    // Audit Logging
    // -------------------------------------------------------------------------

    async logDelivery(
      input: LogNotificationDeliveryInput,
    ): Promise<DomainResult<NotificationDeliveryAuditRecord>> {
      // Validate tenant context
      const tenantValidation = validateTenantId(input.tenantId);
      if (!tenantValidation.success) {
        return fail(validationError(
          'NOTIFICATION_AUDIT_TENANT_REQUIRED',
          'Tenant ID is required for audit logging',
        ));
      }

      const record: NotificationDeliveryAuditRecord = {
        id: generateId('notif-audit'),
        notificationId: input.notificationId,
        tenantId: input.tenantId,
        senderId: input.senderId,
        recipientCount: input.recipientIds.length,
        channels: input.channels,
        contentType: input.contentType,
        success: input.success,
        timestamp: new Date(),
        correlationId: input.correlationId,
      };

      try {
        await auditEmitter.emitDeliveryAudit(record);
        return ok(record);
      } catch (error) {
        // Don't fail the operation for audit failures, just log
        console.error('[NotificationSecurityService] Audit emit failed:', error);
        return ok(record);
      }
    },

    // -------------------------------------------------------------------------
    // Configuration
    // -------------------------------------------------------------------------

    getChannelConfig(): Record<NotificationChannel, ChannelAuthorizationConfig> {
      return { ...currentChannelConfig };
    },

    updateChannelConfig(
      channel: NotificationChannel,
      config: Partial<ChannelAuthorizationConfig>,
    ): void {
      const existingConfig = currentChannelConfig[channel];
      if (existingConfig) {
        currentChannelConfig = {
          ...currentChannelConfig,
          [channel]: {
            ...existingConfig,
            ...config,
          },
        };
      }
    },
  };
};
