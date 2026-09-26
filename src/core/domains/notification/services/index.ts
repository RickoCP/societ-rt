/**
 * Notification Services — Domain services for notification management.
 *
 * @see Task 71: Notification Security (Req 56)
 */

export {
  NotificationSecurityServiceImpl,
  ConsoleNotificationDeliveryAuditEmitter,
  DEFAULT_CHANNEL_CONFIG,
  NotificationSecurityStatus,
  NotificationContentType,
  ContentSensitivityLevel,
} from './NotificationSecurityService';

export type {
  INotificationSecurityService,
  INotificationDeliveryAuditEmitter,
  NotificationSenderContext,
  NotificationRecipient,
  ValidateNotificationDeliveryInput,
  ValidateNotificationContentInput,
  LogNotificationDeliveryInput,
  NotificationDeliveryValidationResult,
  NotificationContentValidationResult,
  NotificationDeliveryAuditRecord,
  InvalidRecipientInfo,
  DeniedChannelInfo,
  ContentViolation,
  ChannelAuthorizationConfig,
} from './NotificationSecurityService';
