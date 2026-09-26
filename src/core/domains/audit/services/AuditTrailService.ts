/**
 * AuditTrailService — Domain service for comprehensive audit trail management.
 *
 * This service provides centralized audit trail functionality for security-sensitive
 * operations including:
 * 1. Event capture for membership, authorization, authentication operations
 * 2. Structured audit log format with timestamp, userId, tenantId, eventType, resourceId, details
 * 3. Tenant-scoped audit queries
 * 4. Immutable audit record storage (records cannot be modified after creation)
 *
 * **AUDIT REQUIREMENTS:**
 * - All security operations MUST be logged
 * - Audit records MUST be immutable (no update/delete operations)
 * - All queries MUST be tenant-scoped
 * - Never log sensitive data (tokens, passwords, PII, etc.)
 *
 * @see Task 62: Audit Trail Implementation
 * @see Requirements 30, 55, 70 — Security Event Logging
 * @see Error Handling Guideline (12-error-handling.md)
 */

import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import { businessError, technicalError, validationError, notFoundError } from '@core/utils';

// ---------------------------------------------------------------------------
// Audit Event Types
// ---------------------------------------------------------------------------

/**
 * Comprehensive audit event types for security-sensitive operations.
 *
 * Categories:
 * - AUTH_* — Authentication events
 * - MEMBERSHIP_* — Membership lifecycle events
 * - PERMISSION_* — Permission/authorization events
 * - CONTEXT_* — Tenant/OrgUnit context switch events
 * - RESOURCE_* — Resource access events
 * - ADMIN_* — Administrative action events
 */
export enum AuditEventType {
  // Authentication Events
  AUTH_LOGIN_SUCCESS = 'AUTH_LOGIN_SUCCESS',
  AUTH_LOGIN_FAILURE = 'AUTH_LOGIN_FAILURE',
  AUTH_LOGOUT = 'AUTH_LOGOUT',
  AUTH_TOKEN_REFRESH = 'AUTH_TOKEN_REFRESH',
  AUTH_TOKEN_REVOKED = 'AUTH_TOKEN_REVOKED',
  AUTH_PASSWORD_CHANGED = 'AUTH_PASSWORD_CHANGED',
  AUTH_PASSWORD_RESET_REQUESTED = 'AUTH_PASSWORD_RESET_REQUESTED',
  AUTH_PASSWORD_RESET_COMPLETED = 'AUTH_PASSWORD_RESET_COMPLETED',
  AUTH_MFA_ENABLED = 'AUTH_MFA_ENABLED',
  AUTH_MFA_DISABLED = 'AUTH_MFA_DISABLED',
  AUTH_SESSION_INVALIDATED = 'AUTH_SESSION_INVALIDATED',

  // Membership Events
  MEMBERSHIP_CREATED = 'MEMBERSHIP_CREATED',
  MEMBERSHIP_UPDATED = 'MEMBERSHIP_UPDATED',
  MEMBERSHIP_REVOKED = 'MEMBERSHIP_REVOKED',
  MEMBERSHIP_SUSPENDED = 'MEMBERSHIP_SUSPENDED',
  MEMBERSHIP_REACTIVATED = 'MEMBERSHIP_REACTIVATED',
  MEMBERSHIP_ROLE_CHANGED = 'MEMBERSHIP_ROLE_CHANGED',
  MEMBERSHIP_INVITATION_SENT = 'MEMBERSHIP_INVITATION_SENT',
  MEMBERSHIP_INVITATION_ACCEPTED = 'MEMBERSHIP_INVITATION_ACCEPTED',
  MEMBERSHIP_INVITATION_EXPIRED = 'MEMBERSHIP_INVITATION_EXPIRED',

  // Permission/Authorization Events
  PERMISSION_GRANTED = 'PERMISSION_GRANTED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  PERMISSION_REVOKED = 'PERMISSION_REVOKED',
  AUTHORIZATION_CHECK_PASSED = 'AUTHORIZATION_CHECK_PASSED',
  AUTHORIZATION_CHECK_FAILED = 'AUTHORIZATION_CHECK_FAILED',

  // Context Switch Events
  TENANT_SWITCH = 'TENANT_SWITCH',
  ORGUNIT_SWITCH = 'ORGUNIT_SWITCH',
  CONTEXT_SWITCH_DENIED = 'CONTEXT_SWITCH_DENIED',

  // Resource Access Events
  RESOURCE_ACCESS_GRANTED = 'RESOURCE_ACCESS_GRANTED',
  RESOURCE_ACCESS_DENIED = 'RESOURCE_ACCESS_DENIED',
  RESOURCE_CREATED = 'RESOURCE_CREATED',
  RESOURCE_UPDATED = 'RESOURCE_UPDATED',
  RESOURCE_DELETED = 'RESOURCE_DELETED',

  // Admin Actions
  ADMIN_ACTION = 'ADMIN_ACTION',
  ADMIN_USER_CREATED = 'ADMIN_USER_CREATED',
  ADMIN_USER_SUSPENDED = 'ADMIN_USER_SUSPENDED',
  ADMIN_USER_DELETED = 'ADMIN_USER_DELETED',
  ADMIN_TENANT_CREATED = 'ADMIN_TENANT_CREATED',
  ADMIN_TENANT_SUSPENDED = 'ADMIN_TENANT_SUSPENDED',
  ADMIN_TENANT_ACTIVATED = 'ADMIN_TENANT_ACTIVATED',
  ADMIN_ROLE_DELEGATED = 'ADMIN_ROLE_DELEGATED',
  ADMIN_BULK_OPERATION = 'ADMIN_BULK_OPERATION',

  // Security Events
  SECURITY_ALERT_TRIGGERED = 'SECURITY_ALERT_TRIGGERED',
  SECURITY_CROSS_TENANT_ATTEMPT = 'SECURITY_CROSS_TENANT_ATTEMPT',
  SECURITY_SUSPICIOUS_ACTIVITY = 'SECURITY_SUSPICIOUS_ACTIVITY',
  SECURITY_RATE_LIMIT_EXCEEDED = 'SECURITY_RATE_LIMIT_EXCEEDED',

  // Household/IoT Isolation Events
  HOUSEHOLD_ACCESS_GRANTED = 'HOUSEHOLD_ACCESS_GRANTED',
  HOUSEHOLD_ACCESS_DENIED = 'HOUSEHOLD_ACCESS_DENIED',
  IOT_DEVICE_ACCESS_GRANTED = 'IOT_DEVICE_ACCESS_GRANTED',
  IOT_DEVICE_ACCESS_DENIED = 'IOT_DEVICE_ACCESS_DENIED',

  // Transfer Events
  OWNERSHIP_TRANSFER_INITIATED = 'OWNERSHIP_TRANSFER_INITIATED',
  OWNERSHIP_TRANSFER_COMPLETED = 'OWNERSHIP_TRANSFER_COMPLETED',
  OWNERSHIP_TRANSFER_CANCELLED = 'OWNERSHIP_TRANSFER_CANCELLED',
}

// ---------------------------------------------------------------------------
// Audit Event Entity
// ---------------------------------------------------------------------------

/**
 * Structured audit event for security-sensitive operations.
 *
 * All fields are readonly to ensure immutability at the type level.
 */
export interface AuditEvent {
  /** Unique identifier for the audit event */
  readonly id: string;
  /** Timestamp when the event occurred */
  readonly timestamp: Date;
  /** User who performed the action (null for system events) */
  readonly userId: string | null;
  /** Tenant context for the event */
  readonly tenantId: string;
  /** Type of audit event */
  readonly eventType: AuditEventType;
  /** ID of the affected resource (if applicable) */
  readonly resourceId: string | null;
  /** Type of resource affected (e.g., 'MEMBERSHIP', 'USER', 'TENANT') */
  readonly resourceType: string | null;
  /** Additional event details (sanitized, no sensitive data) */
  readonly details: Record<string, unknown>;
  /** IP address of the actor (if available) */
  readonly ipAddress: string | null;
  /** User agent of the actor (if available) */
  readonly userAgent: string | null;
  /** Correlation ID for request tracing */
  readonly correlationId: string | null;
  /** Impersonator user ID (if action was performed via impersonation) */
  readonly impersonatorId: string | null;
  /** OrgUnit context (if applicable) */
  readonly orgUnitId: string | null;
  /** Whether the action was successful */
  readonly success: boolean;
  /** Error code if action failed */
  readonly errorCode: string | null;
}

/**
 * Input for creating a new audit event.
 */
export interface CreateAuditEventInput {
  /** User who performed the action (null for system events) */
  readonly userId: string | null;
  /** Tenant context for the event */
  readonly tenantId: string;
  /** Type of audit event */
  readonly eventType: AuditEventType;
  /** ID of the affected resource (if applicable) */
  readonly resourceId?: string | null;
  /** Type of resource affected */
  readonly resourceType?: string | null;
  /** Additional event details */
  readonly details?: Record<string, unknown>;
  /** IP address of the actor */
  readonly ipAddress?: string | null;
  /** User agent of the actor */
  readonly userAgent?: string | null;
  /** Correlation ID for request tracing */
  readonly correlationId?: string | null;
  /** Impersonator user ID */
  readonly impersonatorId?: string | null;
  /** OrgUnit context */
  readonly orgUnitId?: string | null;
  /** Whether the action was successful */
  readonly success?: boolean;
  /** Error code if action failed */
  readonly errorCode?: string | null;
}

// ---------------------------------------------------------------------------
// Audit Query Types
// ---------------------------------------------------------------------------

/**
 * Filters for querying audit events.
 */
export interface AuditEventFilters {
  /** Filter by event type */
  readonly eventType?: AuditEventType | AuditEventType[];
  /** Filter by user ID */
  readonly userId?: string;
  /** Filter by resource ID */
  readonly resourceId?: string;
  /** Filter by resource type */
  readonly resourceType?: string;
  /** Filter by start date */
  readonly startDate?: Date;
  /** Filter by end date */
  readonly endDate?: Date;
  /** Filter by success status */
  readonly success?: boolean;
  /** Filter by correlation ID */
  readonly correlationId?: string;
  /** Filter by OrgUnit ID */
  readonly orgUnitId?: string;
}

/**
 * Pagination options for audit queries.
 */
export interface AuditPaginationOptions {
  /** Page number (1-indexed) */
  readonly page: number;
  /** Items per page */
  readonly pageSize: number;
}

/**
 * Paginated result for audit queries.
 */
export interface AuditEventPage {
  /** Audit events for the current page */
  readonly events: AuditEvent[];
  /** Total number of events matching the filter */
  readonly total: number;
  /** Current page number */
  readonly page: number;
  /** Items per page */
  readonly pageSize: number;
  /** Whether there are more pages */
  readonly hasMore: boolean;
}

// ---------------------------------------------------------------------------
// Repository Interface
// ---------------------------------------------------------------------------

/**
 * Repository interface for audit event persistence.
 *
 * IMPORTANT: This interface is APPEND-ONLY. No update or delete operations
 * are exposed to ensure audit records remain immutable.
 */
export interface IAuditTrailRepository {
  /**
   * Create (append) a new audit event.
   *
   * @param event - The audit event to create
   * @returns Created audit event with generated ID
   */
  create(event: CreateAuditEventInput): Promise<DomainResult<AuditEvent>>;

  /**
   * Find audit events by tenant with filtering and pagination.
   *
   * All queries MUST be tenant-scoped for security.
   *
   * @param tenantId - The tenant ID (required for isolation)
   * @param filters - Optional filters
   * @param pagination - Pagination options
   * @returns Paginated audit events
   */
  findByTenant(
    tenantId: string,
    filters?: AuditEventFilters,
    pagination?: AuditPaginationOptions,
  ): Promise<DomainResult<AuditEventPage>>;

  /**
   * Find a single audit event by ID within a tenant.
   *
   * @param tenantId - The tenant ID (required for isolation)
   * @param eventId - The audit event ID
   * @returns Audit event if found
   */
  findById(
    tenantId: string,
    eventId: string,
  ): Promise<DomainResult<AuditEvent | null>>;

  /**
   * Count audit events for a tenant with optional filters.
   *
   * @param tenantId - The tenant ID
   * @param filters - Optional filters
   * @returns Count of matching events
   */
  countByTenant(
    tenantId: string,
    filters?: AuditEventFilters,
  ): Promise<DomainResult<number>>;

  /**
   * Find audit events by user across a tenant.
   *
   * @param tenantId - The tenant ID
   * @param userId - The user ID
   * @param pagination - Pagination options
   * @returns Paginated audit events for the user
   */
  findByUser(
    tenantId: string,
    userId: string,
    pagination?: AuditPaginationOptions,
  ): Promise<DomainResult<AuditEventPage>>;

  /**
   * Find audit events by resource.
   *
   * @param tenantId - The tenant ID
   * @param resourceType - The resource type
   * @param resourceId - The resource ID
   * @param pagination - Pagination options
   * @returns Paginated audit events for the resource
   */
  findByResource(
    tenantId: string,
    resourceType: string,
    resourceId: string,
    pagination?: AuditPaginationOptions,
  ): Promise<DomainResult<AuditEventPage>>;
}

// ---------------------------------------------------------------------------
// Audit Emitter Interface
// ---------------------------------------------------------------------------

/**
 * Interface for audit trail event emitter.
 *
 * This provides a fire-and-forget pattern for emitting audit events
 * from domain services. The emitter handles persistence asynchronously.
 */
export interface IAuditTrailEmitter {
  /**
   * Emit an audit event.
   *
   * This method should not throw - errors are logged internally.
   *
   * @param event - The audit event to emit
   */
  emit(event: CreateAuditEventInput): Promise<void>;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

/**
 * IAuditTrailService interface.
 *
 * Provides operations for comprehensive audit trail management including
 * event capture, tenant-scoped queries, and immutable record storage.
 */
export interface IAuditTrailService {
  // ---------------------------------------------------------------------------
  // Event Capture
  // ---------------------------------------------------------------------------

  /**
   * Capture an audit event for a security-sensitive operation.
   *
   * @param input - The audit event input
   * @returns Created audit event
   */
  captureEvent(input: CreateAuditEventInput): Promise<DomainResult<AuditEvent>>;

  /**
   * Capture an authentication event.
   *
   * @param eventType - The authentication event type
   * @param userId - The user ID (null for failed login attempts with unknown user)
   * @param tenantId - The tenant ID
   * @param details - Additional details
   * @param options - Optional metadata (ipAddress, userAgent, etc.)
   */
  captureAuthEvent(
    eventType: AuditEventType,
    userId: string | null,
    tenantId: string,
    details?: Record<string, unknown>,
    options?: {
      ipAddress?: string;
      userAgent?: string;
      correlationId?: string;
      success?: boolean;
      errorCode?: string;
    },
  ): Promise<DomainResult<AuditEvent>>;

  /**
   * Capture a membership lifecycle event.
   *
   * @param eventType - The membership event type
   * @param userId - The acting user ID
   * @param tenantId - The tenant ID
   * @param membershipId - The affected membership ID
   * @param details - Additional details (before/after state, etc.)
   * @param options - Optional metadata
   */
  captureMembershipEvent(
    eventType: AuditEventType,
    userId: string,
    tenantId: string,
    membershipId: string,
    details?: Record<string, unknown>,
    options?: {
      orgUnitId?: string;
      correlationId?: string;
      impersonatorId?: string;
    },
  ): Promise<DomainResult<AuditEvent>>;

  /**
   * Capture an authorization/permission event.
   *
   * @param eventType - The authorization event type
   * @param userId - The user ID
   * @param tenantId - The tenant ID
   * @param resourceType - The resource type being accessed
   * @param resourceId - The resource ID being accessed
   * @param details - Additional details (required permissions, etc.)
   * @param options - Optional metadata
   */
  captureAuthorizationEvent(
    eventType: AuditEventType,
    userId: string,
    tenantId: string,
    resourceType: string,
    resourceId: string,
    details?: Record<string, unknown>,
    options?: {
      orgUnitId?: string;
      correlationId?: string;
      success?: boolean;
      errorCode?: string;
    },
  ): Promise<DomainResult<AuditEvent>>;

  /**
   * Capture an admin action event.
   *
   * @param userId - The admin user ID
   * @param tenantId - The tenant ID
   * @param action - Description of the admin action
   * @param resourceType - The affected resource type
   * @param resourceId - The affected resource ID
   * @param details - Additional details
   * @param options - Optional metadata
   */
  captureAdminAction(
    userId: string,
    tenantId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    details?: Record<string, unknown>,
    options?: {
      orgUnitId?: string;
      correlationId?: string;
      impersonatorId?: string;
    },
  ): Promise<DomainResult<AuditEvent>>;

  // ---------------------------------------------------------------------------
  // Tenant-Scoped Queries
  // ---------------------------------------------------------------------------

  /**
   * Query audit events for a tenant.
   *
   * All queries are tenant-scoped for security isolation.
   *
   * @param tenantId - The tenant ID (required)
   * @param filters - Optional filters
   * @param pagination - Pagination options
   * @returns Paginated audit events
   */
  queryEvents(
    tenantId: string,
    filters?: AuditEventFilters,
    pagination?: AuditPaginationOptions,
  ): Promise<DomainResult<AuditEventPage>>;

  /**
   * Get a single audit event by ID.
   *
   * @param tenantId - The tenant ID
   * @param eventId - The audit event ID
   * @returns Audit event if found
   */
  getEventById(
    tenantId: string,
    eventId: string,
  ): Promise<DomainResult<AuditEvent>>;

  /**
   * Get audit trail for a specific user.
   *
   * @param tenantId - The tenant ID
   * @param userId - The user ID
   * @param pagination - Pagination options
   * @returns Paginated audit events for the user
   */
  getUserAuditTrail(
    tenantId: string,
    userId: string,
    pagination?: AuditPaginationOptions,
  ): Promise<DomainResult<AuditEventPage>>;

  /**
   * Get audit trail for a specific resource.
   *
   * @param tenantId - The tenant ID
   * @param resourceType - The resource type
   * @param resourceId - The resource ID
   * @param pagination - Pagination options
   * @returns Paginated audit events for the resource
   */
  getResourceAuditTrail(
    tenantId: string,
    resourceType: string,
    resourceId: string,
    pagination?: AuditPaginationOptions,
  ): Promise<DomainResult<AuditEventPage>>;

  /**
   * Get audit event count for a tenant.
   *
   * @param tenantId - The tenant ID
   * @param filters - Optional filters
   * @returns Count of matching events
   */
  getEventCount(
    tenantId: string,
    filters?: AuditEventFilters,
  ): Promise<DomainResult<number>>;

  // ---------------------------------------------------------------------------
  // Security Event Helpers
  // ---------------------------------------------------------------------------

  /**
   * Capture a security alert event.
   *
   * @param tenantId - The tenant ID
   * @param alertType - Type of security alert
   * @param details - Alert details
   * @param options - Optional metadata
   */
  captureSecurityAlert(
    tenantId: string,
    alertType: string,
    details: Record<string, unknown>,
    options?: {
      userId?: string;
      resourceType?: string;
      resourceId?: string;
      correlationId?: string;
    },
  ): Promise<DomainResult<AuditEvent>>;

  /**
   * Capture a cross-tenant access attempt.
   *
   * @param userId - The user ID
   * @param sourceTenantId - The user's current tenant
   * @param targetTenantId - The tenant they attempted to access
   * @param details - Additional details
   */
  captureCrossTenantAttempt(
    userId: string,
    sourceTenantId: string,
    targetTenantId: string,
    details?: Record<string, unknown>,
  ): Promise<DomainResult<AuditEvent>>;
}

// ---------------------------------------------------------------------------
// Sensitive Data Sanitization
// ---------------------------------------------------------------------------

/**
 * List of keys that should be redacted from audit details.
 * Keys are stored in lowercase for case-insensitive matching.
 */
const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'apikey',
  'privatekey',
  'otp',
  'pin',
  'cvv',
  'ssn',
  'creditcard',
  'cardnumber',
]);

/**
 * List of substrings that indicate sensitive data when found in a key name.
 */
const SENSITIVE_SUBSTRINGS = [
  'password',
  'token',
  'secret',
  'key',
  'credential',
  'auth',
];

/**
 * Sanitize details object by redacting sensitive fields.
 */
function sanitizeDetails(details: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(details)) {
    const lowerKey = key.toLowerCase();

    // Check if key is an exact match for sensitive keys or contains sensitive substrings
    const isSensitive = SENSITIVE_KEYS.has(lowerKey) || 
      SENSITIVE_SUBSTRINGS.some(substring => lowerKey.includes(substring));

    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeDetails(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create an AuditTrailService instance.
 *
 * @param dependencies - Service dependencies
 * @returns An implementation of IAuditTrailService
 */
export const AuditTrailServiceImpl = ({
  auditTrailRepository,
  auditTrailEmitter,
}: {
  auditTrailRepository: IAuditTrailRepository;
  auditTrailEmitter?: IAuditTrailEmitter;
}): IAuditTrailService => {
  // -------------------------------------------------------------------------
  // Default pagination
  // -------------------------------------------------------------------------

  const DEFAULT_PAGE_SIZE = 50;
  const MAX_PAGE_SIZE = 100;

  // -------------------------------------------------------------------------
  // Helper Functions
  // -------------------------------------------------------------------------

  /**
   * Validate tenant ID is provided.
   */
  const validateTenantId = (tenantId: string): DomainResult<void> => {
    if (!tenantId || tenantId.trim() === '') {
      return fail(validationError(
        'AUDIT_TENANT_REQUIRED',
        'Tenant ID is required for audit operations',
      ));
    }
    return ok(undefined);
  };

  /**
   * Normalize pagination options.
   */
  const normalizePagination = (options?: AuditPaginationOptions): AuditPaginationOptions => ({
    page: options?.page && options.page > 0 ? options.page : 1,
    pageSize: options?.pageSize 
      ? Math.min(options.pageSize, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE,
  });

  /**
   * Emit event via emitter if available (fire and forget).
   */
  const emitEvent = async (input: CreateAuditEventInput): Promise<void> => {
    if (auditTrailEmitter) {
      try {
        await auditTrailEmitter.emit(input);
      } catch (error) {
        // Log but don't throw - audit emission failures shouldn't block operations
        console.error('[AuditTrailService] Failed to emit event:', error);
      }
    }
  };

  // -------------------------------------------------------------------------
  // Service Implementation
  // -------------------------------------------------------------------------

  return {
    async captureEvent(input: CreateAuditEventInput): Promise<DomainResult<AuditEvent>> {
      // Validate tenant ID
      const validation = validateTenantId(input.tenantId);
      if (!validation.success) {
        return validation as DomainResult<AuditEvent>;
      }

      // Sanitize details to remove sensitive data
      const sanitizedInput: CreateAuditEventInput = {
        ...input,
        details: input.details ? sanitizeDetails(input.details) : {},
        success: input.success ?? true,
      };

      // Persist the event
      const result = await auditTrailRepository.create(sanitizedInput);

      // Also emit via emitter for real-time processing
      if (result.success) {
        await emitEvent(sanitizedInput);
      }

      return result;
    },

    async captureAuthEvent(
      eventType: AuditEventType,
      userId: string | null,
      tenantId: string,
      details?: Record<string, unknown>,
      options?: {
        ipAddress?: string;
        userAgent?: string;
        correlationId?: string;
        success?: boolean;
        errorCode?: string;
      },
    ): Promise<DomainResult<AuditEvent>> {
      return this.captureEvent({
        userId,
        tenantId,
        eventType,
        resourceType: 'AUTH',
        details: details ?? {},
        ipAddress: options?.ipAddress ?? null,
        userAgent: options?.userAgent ?? null,
        correlationId: options?.correlationId ?? null,
        success: options?.success ?? true,
        errorCode: options?.errorCode ?? null,
      });
    },

    async captureMembershipEvent(
      eventType: AuditEventType,
      userId: string,
      tenantId: string,
      membershipId: string,
      details?: Record<string, unknown>,
      options?: {
        orgUnitId?: string;
        correlationId?: string;
        impersonatorId?: string;
      },
    ): Promise<DomainResult<AuditEvent>> {
      return this.captureEvent({
        userId,
        tenantId,
        eventType,
        resourceType: 'MEMBERSHIP',
        resourceId: membershipId,
        details: details ?? {},
        orgUnitId: options?.orgUnitId ?? null,
        correlationId: options?.correlationId ?? null,
        impersonatorId: options?.impersonatorId ?? null,
        success: true,
      });
    },

    async captureAuthorizationEvent(
      eventType: AuditEventType,
      userId: string,
      tenantId: string,
      resourceType: string,
      resourceId: string,
      details?: Record<string, unknown>,
      options?: {
        orgUnitId?: string;
        correlationId?: string;
        success?: boolean;
        errorCode?: string;
      },
    ): Promise<DomainResult<AuditEvent>> {
      return this.captureEvent({
        userId,
        tenantId,
        eventType,
        resourceType,
        resourceId,
        details: details ?? {},
        orgUnitId: options?.orgUnitId ?? null,
        correlationId: options?.correlationId ?? null,
        success: options?.success ?? true,
        errorCode: options?.errorCode ?? null,
      });
    },

    async captureAdminAction(
      userId: string,
      tenantId: string,
      action: string,
      resourceType: string,
      resourceId: string,
      details?: Record<string, unknown>,
      options?: {
        orgUnitId?: string;
        correlationId?: string;
        impersonatorId?: string;
      },
    ): Promise<DomainResult<AuditEvent>> {
      return this.captureEvent({
        userId,
        tenantId,
        eventType: AuditEventType.ADMIN_ACTION,
        resourceType,
        resourceId,
        details: {
          action,
          ...(details ?? {}),
        },
        orgUnitId: options?.orgUnitId ?? null,
        correlationId: options?.correlationId ?? null,
        impersonatorId: options?.impersonatorId ?? null,
        success: true,
      });
    },

    async queryEvents(
      tenantId: string,
      filters?: AuditEventFilters,
      pagination?: AuditPaginationOptions,
    ): Promise<DomainResult<AuditEventPage>> {
      const validation = validateTenantId(tenantId);
      if (!validation.success) {
        return validation as DomainResult<AuditEventPage>;
      }

      const normalizedPagination = normalizePagination(pagination);

      return auditTrailRepository.findByTenant(tenantId, filters, normalizedPagination);
    },

    async getEventById(
      tenantId: string,
      eventId: string,
    ): Promise<DomainResult<AuditEvent>> {
      const validation = validateTenantId(tenantId);
      if (!validation.success) {
        return validation as DomainResult<AuditEvent>;
      }

      const result = await auditTrailRepository.findById(tenantId, eventId);
      
      if (!result.success) {
        return result as DomainResult<AuditEvent>;
      }

      if (result.data === null) {
        return fail(notFoundError(
          'AUDIT_EVENT_NOT_FOUND',
          `Audit event ${eventId} not found in tenant ${tenantId}`,
        ));
      }

      return ok(result.data);
    },

    async getUserAuditTrail(
      tenantId: string,
      userId: string,
      pagination?: AuditPaginationOptions,
    ): Promise<DomainResult<AuditEventPage>> {
      const validation = validateTenantId(tenantId);
      if (!validation.success) {
        return validation as DomainResult<AuditEventPage>;
      }

      if (!userId || userId.trim() === '') {
        return fail(validationError(
          'AUDIT_USER_REQUIRED',
          'User ID is required for user audit trail',
        ));
      }

      const normalizedPagination = normalizePagination(pagination);

      return auditTrailRepository.findByUser(tenantId, userId, normalizedPagination);
    },

    async getResourceAuditTrail(
      tenantId: string,
      resourceType: string,
      resourceId: string,
      pagination?: AuditPaginationOptions,
    ): Promise<DomainResult<AuditEventPage>> {
      const validation = validateTenantId(tenantId);
      if (!validation.success) {
        return validation as DomainResult<AuditEventPage>;
      }

      if (!resourceType || !resourceId) {
        return fail(validationError(
          'AUDIT_RESOURCE_REQUIRED',
          'Resource type and ID are required for resource audit trail',
        ));
      }

      const normalizedPagination = normalizePagination(pagination);

      return auditTrailRepository.findByResource(tenantId, resourceType, resourceId, normalizedPagination);
    },

    async getEventCount(
      tenantId: string,
      filters?: AuditEventFilters,
    ): Promise<DomainResult<number>> {
      const validation = validateTenantId(tenantId);
      if (!validation.success) {
        return validation as DomainResult<number>;
      }

      return auditTrailRepository.countByTenant(tenantId, filters);
    },

    async captureSecurityAlert(
      tenantId: string,
      alertType: string,
      details: Record<string, unknown>,
      options?: {
        userId?: string;
        resourceType?: string;
        resourceId?: string;
        correlationId?: string;
      },
    ): Promise<DomainResult<AuditEvent>> {
      return this.captureEvent({
        userId: options?.userId ?? null,
        tenantId,
        eventType: AuditEventType.SECURITY_ALERT_TRIGGERED,
        resourceType: options?.resourceType ?? 'SECURITY_ALERT',
        resourceId: options?.resourceId ?? null,
        details: {
          alertType,
          ...details,
        },
        correlationId: options?.correlationId ?? null,
        success: true,
      });
    },

    async captureCrossTenantAttempt(
      userId: string,
      sourceTenantId: string,
      targetTenantId: string,
      details?: Record<string, unknown>,
    ): Promise<DomainResult<AuditEvent>> {
      // Log in source tenant
      return this.captureEvent({
        userId,
        tenantId: sourceTenantId,
        eventType: AuditEventType.SECURITY_CROSS_TENANT_ATTEMPT,
        resourceType: 'TENANT',
        resourceId: targetTenantId,
        details: {
          targetTenantId,
          ...(details ?? {}),
        },
        success: false,
        errorCode: 'CROSS_TENANT_ACCESS_DENIED',
      });
    },
  };
};

/**
 * Type alias for the factory function for cleaner DI registration.
 */
export type AuditTrailService = IAuditTrailService;
