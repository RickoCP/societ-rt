/**
 * AuditEventType — Domain value type for categorizing audit events in Admin UI.
 *
 * These event types are used for filtering and displaying audit logs in the
 * Audit Log Viewer screen. They correspond to categories of auditable actions
 * performed within the multi-tenant system.
 *
 * Plain TypeScript type — no classes, no decorators, no external deps.
 *
 * @see Requirements 17.3 (Audit Log Table columns)
 * @see Requirements 17.9 (Event type dropdown categories)
 * @see Design Components > 10. Audit Log > AuditLogEntry interface
 */

// ---------------------------------------------------------------------------
// Event Type Categories
// ---------------------------------------------------------------------------

/**
 * Audit event type categories for the Admin UI filter panel.
 *
 * These are the high-level categories shown in the event type multi-select
 * dropdown in the Audit Log Viewer.
 *
 * @see Requirements 17.9 (Event type dropdown categories)
 */
export type AuditEventCategory =
  | 'AUTH'          // Authentication events (login, logout, token refresh)
  | 'MEMBERSHIP'    // Membership lifecycle events (invite, suspend, revoke, role change)
  | 'ORGUNIT'       // OrgUnit management events (create, update, delete, move)
  | 'TENANT'        // Tenant management events (settings, lifecycle, config)
  | 'SUBSCRIPTION'  // Subscription events (plan change, payment, billing)
  | 'EMERGENCY'     // Emergency-related events (panic activation, response)
  | 'IOT';          // IoT device events (siren test, connection status)

/**
 * All valid audit event categories.
 */
export const ALL_AUDIT_EVENT_CATEGORIES: readonly AuditEventCategory[] = [
  'AUTH',
  'MEMBERSHIP',
  'ORGUNIT',
  'TENANT',
  'SUBSCRIPTION',
  'EMERGENCY',
  'IOT',
] as const;

// ---------------------------------------------------------------------------
// Granular Event Types
// ---------------------------------------------------------------------------

/**
 * Authentication-related audit event types.
 */
export type AuthAuditEventType =
  | 'AUTH_LOGIN_SUCCESS'
  | 'AUTH_LOGIN_FAILED'
  | 'AUTH_LOGOUT'
  | 'AUTH_TOKEN_REFRESH'
  | 'AUTH_PASSWORD_CHANGED'
  | 'AUTH_PASSWORD_RESET_REQUESTED'
  | 'AUTH_MFA_ENABLED'
  | 'AUTH_MFA_DISABLED'
  | 'AUTH_CONTEXT_SWITCH';

/**
 * Membership-related audit event types.
 */
export type MembershipAuditEventType =
  | 'MEMBERSHIP_INVITED'
  | 'MEMBERSHIP_INVITATION_ACCEPTED'
  | 'MEMBERSHIP_INVITATION_CANCELLED'
  | 'MEMBERSHIP_INVITATION_RESENT'
  | 'MEMBERSHIP_ACTIVATED'
  | 'MEMBERSHIP_SUSPENDED'
  | 'MEMBERSHIP_REVOKED'
  | 'MEMBERSHIP_ROLE_CHANGED'
  | 'MEMBERSHIP_ORGUNIT_CHANGED'
  | 'MEMBERSHIP_BULK_SUSPENDED'
  | 'MEMBERSHIP_BULK_ACTIVATED'
  | 'MEMBERSHIP_BULK_ROLE_CHANGED';

/**
 * OrgUnit-related audit event types.
 */
export type OrgUnitAuditEventType =
  | 'ORGUNIT_CREATED'
  | 'ORGUNIT_UPDATED'
  | 'ORGUNIT_DELETED'
  | 'ORGUNIT_MOVED'
  | 'ORGUNIT_MEMBER_ASSIGNED'
  | 'ORGUNIT_MEMBER_REMOVED';

/**
 * Tenant-related audit event types.
 */
export type TenantAuditEventType =
  | 'TENANT_PROFILE_UPDATED'
  | 'TENANT_CONFIG_UPDATED'
  | 'TENANT_SUSPENDED'
  | 'TENANT_REACTIVATED'
  | 'TENANT_CLOSED'
  | 'TENANT_PROVISIONED'
  | 'TENANT_IMPERSONATION_STARTED'
  | 'TENANT_IMPERSONATION_ENDED'
  | 'TENANT_TOKEN_VERSION_RESET';

/**
 * Subscription-related audit event types.
 */
export type SubscriptionAuditEventType =
  | 'SUBSCRIPTION_PLAN_UPGRADED'
  | 'SUBSCRIPTION_PLAN_DOWNGRADED'
  | 'SUBSCRIPTION_TRIAL_STARTED'
  | 'SUBSCRIPTION_TRIAL_ENDED'
  | 'SUBSCRIPTION_PAYMENT_SUCCESS'
  | 'SUBSCRIPTION_PAYMENT_FAILED'
  | 'SUBSCRIPTION_PAYMENT_RETRIED'
  | 'SUBSCRIPTION_INVOICE_DOWNLOADED';

/**
 * Emergency-related audit event types.
 */
export type EmergencyAuditEventType =
  | 'EMERGENCY_PANIC_ACTIVATED'
  | 'EMERGENCY_PANIC_DEACTIVATED'
  | 'EMERGENCY_RESPONSE_INITIATED'
  | 'EMERGENCY_CONTACT_NOTIFIED'
  | 'EMERGENCY_ESCALATION_TRIGGERED';

/**
 * IoT device-related audit event types.
 */
export type IoTAuditEventType =
  | 'IOT_SIREN_TEST_TRIGGERED'
  | 'IOT_DEVICE_CONNECTED'
  | 'IOT_DEVICE_DISCONNECTED'
  | 'IOT_DEVICE_REGISTERED'
  | 'IOT_DEVICE_REMOVED';

/**
 * Audit export event types.
 */
export type AuditExportEventType = 'AUDIT_LOG_EXPORTED';

/**
 * Combined audit event type — union of all granular event types.
 *
 * This is the primary type used in AuditLogEntry.eventType.
 */
export type AuditEventType =
  | AuthAuditEventType
  | MembershipAuditEventType
  | OrgUnitAuditEventType
  | TenantAuditEventType
  | SubscriptionAuditEventType
  | EmergencyAuditEventType
  | IoTAuditEventType
  | AuditExportEventType;

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Get the category for a given event type.
 *
 * Used for filtering and grouping in the Audit Log Viewer.
 */
export function getEventCategory(eventType: AuditEventType): AuditEventCategory {
  if (eventType.startsWith('AUTH_')) return 'AUTH';
  if (eventType.startsWith('MEMBERSHIP_')) return 'MEMBERSHIP';
  if (eventType.startsWith('ORGUNIT_')) return 'ORGUNIT';
  if (eventType.startsWith('TENANT_')) return 'TENANT';
  if (eventType.startsWith('SUBSCRIPTION_')) return 'SUBSCRIPTION';
  if (eventType.startsWith('EMERGENCY_')) return 'EMERGENCY';
  if (eventType.startsWith('IOT_')) return 'IOT';
  if (eventType.startsWith('AUDIT_')) return 'TENANT'; // Audit exports are tenant-level
  return 'TENANT'; // Default fallback
}

/**
 * Get i18n key for an event type label.
 *
 * @example getEventTypeI18nKey('AUTH_LOGIN_SUCCESS') => 'audit.event_type.auth_login_success'
 */
export function getEventTypeI18nKey(eventType: AuditEventType): string {
  return `audit.event_type.${eventType.toLowerCase()}`;
}

/**
 * Get i18n key for an event category label.
 *
 * @example getCategoryI18nKey('AUTH') => 'audit.category.auth'
 */
export function getCategoryI18nKey(category: AuditEventCategory): string {
  return `audit.category.${category.toLowerCase()}`;
}

/**
 * All auth event types for filtering.
 */
export const AUTH_EVENT_TYPES: readonly AuthAuditEventType[] = [
  'AUTH_LOGIN_SUCCESS',
  'AUTH_LOGIN_FAILED',
  'AUTH_LOGOUT',
  'AUTH_TOKEN_REFRESH',
  'AUTH_PASSWORD_CHANGED',
  'AUTH_PASSWORD_RESET_REQUESTED',
  'AUTH_MFA_ENABLED',
  'AUTH_MFA_DISABLED',
  'AUTH_CONTEXT_SWITCH',
] as const;

/**
 * All membership event types for filtering.
 */
export const MEMBERSHIP_EVENT_TYPES: readonly MembershipAuditEventType[] = [
  'MEMBERSHIP_INVITED',
  'MEMBERSHIP_INVITATION_ACCEPTED',
  'MEMBERSHIP_INVITATION_CANCELLED',
  'MEMBERSHIP_INVITATION_RESENT',
  'MEMBERSHIP_ACTIVATED',
  'MEMBERSHIP_SUSPENDED',
  'MEMBERSHIP_REVOKED',
  'MEMBERSHIP_ROLE_CHANGED',
  'MEMBERSHIP_ORGUNIT_CHANGED',
  'MEMBERSHIP_BULK_SUSPENDED',
  'MEMBERSHIP_BULK_ACTIVATED',
  'MEMBERSHIP_BULK_ROLE_CHANGED',
] as const;

/**
 * All OrgUnit event types for filtering.
 */
export const ORGUNIT_EVENT_TYPES: readonly OrgUnitAuditEventType[] = [
  'ORGUNIT_CREATED',
  'ORGUNIT_UPDATED',
  'ORGUNIT_DELETED',
  'ORGUNIT_MOVED',
  'ORGUNIT_MEMBER_ASSIGNED',
  'ORGUNIT_MEMBER_REMOVED',
] as const;

/**
 * All tenant event types for filtering.
 */
export const TENANT_EVENT_TYPES: readonly TenantAuditEventType[] = [
  'TENANT_PROFILE_UPDATED',
  'TENANT_CONFIG_UPDATED',
  'TENANT_SUSPENDED',
  'TENANT_REACTIVATED',
  'TENANT_CLOSED',
  'TENANT_PROVISIONED',
  'TENANT_IMPERSONATION_STARTED',
  'TENANT_IMPERSONATION_ENDED',
  'TENANT_TOKEN_VERSION_RESET',
] as const;

/**
 * All subscription event types for filtering.
 */
export const SUBSCRIPTION_EVENT_TYPES: readonly SubscriptionAuditEventType[] = [
  'SUBSCRIPTION_PLAN_UPGRADED',
  'SUBSCRIPTION_PLAN_DOWNGRADED',
  'SUBSCRIPTION_TRIAL_STARTED',
  'SUBSCRIPTION_TRIAL_ENDED',
  'SUBSCRIPTION_PAYMENT_SUCCESS',
  'SUBSCRIPTION_PAYMENT_FAILED',
  'SUBSCRIPTION_PAYMENT_RETRIED',
  'SUBSCRIPTION_INVOICE_DOWNLOADED',
] as const;

/**
 * All emergency event types for filtering.
 */
export const EMERGENCY_EVENT_TYPES: readonly EmergencyAuditEventType[] = [
  'EMERGENCY_PANIC_ACTIVATED',
  'EMERGENCY_PANIC_DEACTIVATED',
  'EMERGENCY_RESPONSE_INITIATED',
  'EMERGENCY_CONTACT_NOTIFIED',
  'EMERGENCY_ESCALATION_TRIGGERED',
] as const;

/**
 * All IoT event types for filtering.
 */
export const IOT_EVENT_TYPES: readonly IoTAuditEventType[] = [
  'IOT_SIREN_TEST_TRIGGERED',
  'IOT_DEVICE_CONNECTED',
  'IOT_DEVICE_DISCONNECTED',
  'IOT_DEVICE_REGISTERED',
  'IOT_DEVICE_REMOVED',
] as const;

/**
 * Get all event types for a category.
 */
export function getEventTypesForCategory(
  category: AuditEventCategory,
): readonly AuditEventType[] {
  switch (category) {
    case 'AUTH':
      return AUTH_EVENT_TYPES;
    case 'MEMBERSHIP':
      return MEMBERSHIP_EVENT_TYPES;
    case 'ORGUNIT':
      return ORGUNIT_EVENT_TYPES;
    case 'TENANT':
      return TENANT_EVENT_TYPES;
    case 'SUBSCRIPTION':
      return SUBSCRIPTION_EVENT_TYPES;
    case 'EMERGENCY':
      return EMERGENCY_EVENT_TYPES;
    case 'IOT':
      return IOT_EVENT_TYPES;
    default:
      return [];
  }
}

