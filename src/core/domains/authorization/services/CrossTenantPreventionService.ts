/**
 * CrossTenantPreventionService — Cross-tenant access prevention validation.
 *
 * This service provides comprehensive cross-tenant access prevention including:
 * 1. Validate all data access requests include tenant context
 * 2. Verify tenant boundary on all resource operations (CRUD)
 * 3. Detect and block cross-tenant access attempts
 * 4. Log all cross-tenant violation attempts for security audit
 *
 * **TENANT ISOLATION REQUIREMENTS:**
 * - Tenant is the security boundary (tenant_id, NOT orgUnit path)
 * - All data access requests MUST include tenant context
 * - Cross-tenant access attempts MUST be blocked and logged
 * - Fail closed on ambiguous tenant context (INV-AUTH-002)
 *
 * **SECURITY CONSIDERATIONS:**
 * - Resource-to-tenant ownership validation
 * - User-to-tenant membership validation
 * - Request context tenant verification
 * - Multi-resource batch operation tenant validation
 * - All violations logged with full context for security audit
 *
 * @see Task 72: Cross-Tenant Prevention Validation (Req 59)
 * @see Requirements 38, 41, 60 — Tenant Isolation
 * @see Error Handling Guideline (12-error-handling.md)
 */

import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import { authorizationError, validationError, businessError } from '@core/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Types of cross-tenant prevention checks.
 */
export enum CrossTenantCheckType {
  /** Resource ownership validation */
  RESOURCE_OWNERSHIP = 'RESOURCE_OWNERSHIP',
  /** User membership validation */
  USER_MEMBERSHIP = 'USER_MEMBERSHIP',
  /** Request context validation */
  REQUEST_CONTEXT = 'REQUEST_CONTEXT',
  /** Batch operation validation */
  BATCH_OPERATION = 'BATCH_OPERATION',
  /** Query tenant filter validation */
  QUERY_TENANT_FILTER = 'QUERY_TENANT_FILTER',
  /** Mutation tenant target validation */
  MUTATION_TENANT_TARGET = 'MUTATION_TENANT_TARGET',
}

/**
 * Operation types that can be validated.
 */
export enum OperationType {
  /** Create operation */
  CREATE = 'CREATE',
  /** Read operation */
  READ = 'READ',
  /** Update operation */
  UPDATE = 'UPDATE',
  /** Delete operation */
  DELETE = 'DELETE',
  /** Query/list operation */
  QUERY = 'QUERY',
  /** Batch operation */
  BATCH = 'BATCH',
}

/**
 * Resource types that can be involved in cross-tenant checks.
 */
export enum ResourceType {
  USER = 'USER',
  MEMBERSHIP = 'MEMBERSHIP',
  ORGUNIT = 'ORGUNIT',
  HOUSEHOLD = 'HOUSEHOLD',
  RESIDENT = 'RESIDENT',
  ANNOUNCEMENT = 'ANNOUNCEMENT',
  VOTE = 'VOTE',
  FINANCIAL_TRANSACTION = 'FINANCIAL_TRANSACTION',
  EMERGENCY_ALERT = 'EMERGENCY_ALERT',
  IOT_DEVICE = 'IOT_DEVICE',
  NOTIFICATION = 'NOTIFICATION',
  AUDIT_EVENT = 'AUDIT_EVENT',
  GENERIC = 'GENERIC',
}

/**
 * Prevention check result status.
 */
export enum PreventionCheckStatus {
  /** Check passed - access allowed */
  ALLOWED = 'ALLOWED',
  /** Check failed - cross-tenant access blocked */
  BLOCKED = 'BLOCKED',
  /** Check failed - missing tenant context */
  MISSING_CONTEXT = 'MISSING_CONTEXT',
  /** Check failed - tenant mismatch */
  TENANT_MISMATCH = 'TENANT_MISMATCH',
  /** Check failed - user not member of tenant */
  NOT_MEMBER = 'NOT_MEMBER',
  /** Check failed - batch contains cross-tenant resources */
  BATCH_CROSS_TENANT = 'BATCH_CROSS_TENANT',
}

/**
 * Severity level for prevention events.
 */
export enum PreventionEventSeverity {
  /** Normal operation blocked */
  NORMAL = 'NORMAL',
  /** Suspicious pattern detected */
  SUSPICIOUS = 'SUSPICIOUS',
  /** Potential security breach attempt */
  CRITICAL = 'CRITICAL',
}

// ---------------------------------------------------------------------------
// Input Types
// ---------------------------------------------------------------------------

/**
 * Tenant context for validation.
 */
export interface TenantContext {
  /** User ID making the request */
  readonly userId: string;
  /** Active tenant ID from request/session */
  readonly activeTenantId: string;
  /** Optional OrgUnit ID for scope validation */
  readonly orgUnitId?: string | null;
  /** Correlation ID for request tracing */
  readonly correlationId?: string;
  /** IP address of the requester */
  readonly ipAddress?: string;
}

/**
 * Resource information for ownership validation.
 */
export interface ResourceInfo {
  /** Resource ID */
  readonly resourceId: string;
  /** Resource type */
  readonly resourceType: ResourceType;
  /** Tenant ID that owns the resource */
  readonly resourceTenantId: string;
  /** Optional OrgUnit ID of the resource */
  readonly resourceOrgUnitId?: string | null;
}

/**
 * Input for validating resource access.
 */
export interface ValidateResourceAccessInput {
  /** Tenant context from request */
  readonly context: TenantContext;
  /** Resource to validate access to */
  readonly resource: ResourceInfo;
  /** Operation being attempted */
  readonly operation: OperationType;
}

/**
 * Input for validating user membership.
 */
export interface ValidateUserMembershipInput {
  /** User ID to validate */
  readonly userId: string;
  /** Tenant ID to check membership in */
  readonly tenantId: string;
  /** Whether membership must be active */
  readonly requireActive?: boolean;
  /** Correlation ID for tracing */
  readonly correlationId?: string;
}

/**
 * Input for validating request tenant context.
 */
export interface ValidateRequestContextInput {
  /** User ID making the request */
  readonly userId: string;
  /** Tenant ID from request header/session */
  readonly requestTenantId?: string;
  /** Tenant ID from JWT claims */
  readonly jwtTenantId?: string;
  /** Tenant ID from resource being accessed */
  readonly resourceTenantId?: string;
  /** Correlation ID for tracing */
  readonly correlationId?: string;
  /** IP address */
  readonly ipAddress?: string;
}

/**
 * Batch resource item.
 */
export interface BatchResourceItem {
  /** Resource ID */
  readonly resourceId: string;
  /** Resource type */
  readonly resourceType: ResourceType;
  /** Tenant ID that owns the resource */
  readonly resourceTenantId: string;
}

/**
 * Input for validating batch operations.
 */
export interface ValidateBatchOperationInput {
  /** Tenant context from request */
  readonly context: TenantContext;
  /** Resources in the batch */
  readonly resources: readonly BatchResourceItem[];
  /** Operation being attempted */
  readonly operation: OperationType;
}

/**
 * Input for validating query tenant filter.
 */
export interface ValidateQueryTenantFilterInput {
  /** Tenant context from request */
  readonly context: TenantContext;
  /** Tenant ID used in query filter */
  readonly queryTenantId: string;
  /** Whether query is platform-wide (PLATFORM_ADMIN only) */
  readonly isPlatformWideQuery?: boolean;
  /** Whether requester has platform admin role */
  readonly isPlatformAdmin?: boolean;
}

/**
 * Input for validating mutation tenant target.
 */
export interface ValidateMutationTargetInput {
  /** Tenant context from request */
  readonly context: TenantContext;
  /** Target tenant ID for mutation */
  readonly targetTenantId: string;
  /** Operation being attempted */
  readonly operation: OperationType;
  /** Resource type being mutated */
  readonly resourceType: ResourceType;
}

// ---------------------------------------------------------------------------
// Result Types
// ---------------------------------------------------------------------------

/**
 * Result of a prevention check.
 */
export interface PreventionCheckResult {
  /** Check status */
  readonly status: PreventionCheckStatus;
  /** Check type that was performed */
  readonly checkType: CrossTenantCheckType;
  /** Whether access is allowed */
  readonly allowed: boolean;
  /** Reason for the result */
  readonly reason: string;
  /** Severity of the event (if blocked) */
  readonly severity?: PreventionEventSeverity;
  /** Details for logging/debugging */
  readonly details?: Record<string, unknown>;
}

/**
 * Result of batch validation.
 */
export interface BatchValidationResult {
  /** Overall status */
  readonly status: PreventionCheckStatus;
  /** Whether all resources are valid */
  readonly allValid: boolean;
  /** Number of valid resources */
  readonly validCount: number;
  /** Number of invalid resources */
  readonly invalidCount: number;
  /** Invalid resource IDs with reasons */
  readonly invalidResources: readonly InvalidResourceInfo[];
  /** Severity of the event (if blocked) */
  readonly severity?: PreventionEventSeverity;
}

/**
 * Information about an invalid resource in batch.
 */
export interface InvalidResourceInfo {
  /** Resource ID */
  readonly resourceId: string;
  /** Resource type */
  readonly resourceType: ResourceType;
  /** Expected tenant ID */
  readonly expectedTenantId: string;
  /** Actual tenant ID */
  readonly actualTenantId: string;
  /** Reason for invalidity */
  readonly reason: string;
}

/**
 * Prevention violation event for logging.
 */
export interface PreventionViolationEvent {
  /** Unique event ID */
  readonly eventId: string;
  /** Timestamp */
  readonly timestamp: Date;
  /** User ID who attempted the violation */
  readonly userId: string;
  /** Active tenant ID from context */
  readonly activeTenantId: string;
  /** Target tenant ID (if different) */
  readonly targetTenantId?: string;
  /** Check type that detected the violation */
  readonly checkType: CrossTenantCheckType;
  /** Operation that was attempted */
  readonly operation: OperationType;
  /** Resource type involved */
  readonly resourceType?: ResourceType;
  /** Resource ID involved */
  readonly resourceId?: string;
  /** Severity */
  readonly severity: PreventionEventSeverity;
  /** Detailed reason */
  readonly reason: string;
  /** Correlation ID */
  readonly correlationId?: string;
  /** IP address */
  readonly ipAddress?: string;
  /** Additional context */
  readonly additionalContext?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Audit Emitter Interface
// ---------------------------------------------------------------------------

/**
 * Interface for emitting cross-tenant prevention audit events.
 */
export interface ICrossTenantPreventionAuditEmitter {
  /**
   * Emit a prevention violation event.
   */
  emitViolationEvent(event: PreventionViolationEvent): Promise<void>;

  /**
   * Emit a batch violation event.
   */
  emitBatchViolationEvent(
    context: TenantContext,
    invalidResources: readonly InvalidResourceInfo[],
    operation: OperationType,
  ): Promise<void>;

  /**
   * Emit a critical prevention event (potential breach).
   */
  emitCriticalEvent(event: PreventionViolationEvent): Promise<void>;
}

/**
 * Console-based audit emitter for development/testing.
 */
export const ConsoleCrossTenantPreventionAuditEmitter: ICrossTenantPreventionAuditEmitter = {
  async emitViolationEvent(event) {
    console.warn('[CROSS_TENANT_PREVENTION] Violation:', {
      eventId: event.eventId,
      userId: event.userId,
      activeTenantId: event.activeTenantId,
      targetTenantId: event.targetTenantId,
      checkType: event.checkType,
      operation: event.operation,
      severity: event.severity,
      reason: event.reason,
      timestamp: event.timestamp.toISOString(),
    });
  },

  async emitBatchViolationEvent(context, invalidResources, operation) {
    console.warn('[CROSS_TENANT_PREVENTION] Batch violation:', {
      userId: context.userId,
      activeTenantId: context.activeTenantId,
      operation,
      invalidCount: invalidResources.length,
      invalidResources: invalidResources.map(r => ({
        resourceId: r.resourceId,
        resourceType: r.resourceType,
        actualTenantId: r.actualTenantId,
      })),
      timestamp: new Date().toISOString(),
    });
  },

  async emitCriticalEvent(event) {
    console.error('[CROSS_TENANT_PREVENTION] CRITICAL:', {
      eventId: event.eventId,
      userId: event.userId,
      activeTenantId: event.activeTenantId,
      targetTenantId: event.targetTenantId,
      checkType: event.checkType,
      operation: event.operation,
      reason: event.reason,
      timestamp: event.timestamp.toISOString(),
    });
  },
};

// ---------------------------------------------------------------------------
// User Membership Checker Interface
// ---------------------------------------------------------------------------

/**
 * Interface for checking user membership.
 * This abstracts the membership repository lookup.
 */
export interface IUserMembershipChecker {
  /**
   * Check if user has membership in tenant.
   *
   * @param userId - User ID to check
   * @param tenantId - Tenant ID to check membership in
   * @param requireActive - Whether membership must be active
   * @returns Whether user has membership
   */
  hasActiveMembership(
    userId: string,
    tenantId: string,
    requireActive?: boolean,
  ): Promise<boolean>;
}

/**
 * Default membership checker that always returns true (for testing).
 * In production, inject a real membership repository adapter.
 */
export const DefaultUserMembershipChecker: IUserMembershipChecker = {
  async hasActiveMembership() {
    // Default implementation - should be replaced with real checker in DI
    return true;
  },
};

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

/**
 * ICrossTenantPreventionService interface.
 *
 * Provides comprehensive cross-tenant access prevention validation including
 * resource ownership validation, user membership validation, request context
 * verification, and batch operation validation.
 */
export interface ICrossTenantPreventionService {
  // ---------------------------------------------------------------------------
  // Resource Ownership Validation
  // ---------------------------------------------------------------------------

  /**
   * Validate that a resource belongs to the requester's active tenant.
   *
   * This is the primary check for preventing cross-tenant data access.
   * All resource CRUD operations SHOULD use this validation.
   *
   * @param input - Resource access validation input
   * @returns Prevention check result
   */
  validateResourceAccess(
    input: ValidateResourceAccessInput,
  ): Promise<DomainResult<PreventionCheckResult>>;

  /**
   * Validate resource ownership without request context.
   *
   * Use when you have the tenant IDs directly and need a simple check.
   *
   * @param resourceTenantId - Tenant ID that owns the resource
   * @param requestTenantId - Tenant ID from the request
   * @param operation - Operation being attempted
   * @param resourceType - Type of resource
   * @param resourceId - ID of the resource
   * @returns Whether ownership is valid
   */
  validateResourceOwnership(
    resourceTenantId: string,
    requestTenantId: string,
    operation: OperationType,
    resourceType: ResourceType,
    resourceId?: string,
  ): DomainResult<boolean>;

  // ---------------------------------------------------------------------------
  // User Membership Validation
  // ---------------------------------------------------------------------------

  /**
   * Validate that a user has membership in a tenant.
   *
   * @param input - User membership validation input
   * @returns Prevention check result
   */
  validateUserMembership(
    input: ValidateUserMembershipInput,
  ): Promise<DomainResult<PreventionCheckResult>>;

  // ---------------------------------------------------------------------------
  // Request Context Validation
  // ---------------------------------------------------------------------------

  /**
   * Validate request tenant context is consistent.
   *
   * Checks that tenant IDs from different sources (header, JWT, resource)
   * are consistent and valid.
   *
   * @param input - Request context validation input
   * @returns Prevention check result
   */
  validateRequestContext(
    input: ValidateRequestContextInput,
  ): Promise<DomainResult<PreventionCheckResult>>;

  /**
   * Validate that tenant context is present and not empty.
   *
   * Fail closed - missing context should deny access.
   *
   * @param tenantId - Tenant ID to validate
   * @param source - Source of the tenant ID (for logging)
   * @returns Whether context is valid
   */
  validateTenantContextPresent(
    tenantId: string | undefined | null,
    source: string,
  ): DomainResult<boolean>;

  // ---------------------------------------------------------------------------
  // Batch Operation Validation
  // ---------------------------------------------------------------------------

  /**
   * Validate that all resources in a batch belong to the same tenant.
   *
   * Used for bulk operations to ensure no cross-tenant data is included.
   *
   * @param input - Batch operation validation input
   * @returns Batch validation result
   */
  validateBatchOperation(
    input: ValidateBatchOperationInput,
  ): Promise<DomainResult<BatchValidationResult>>;

  // ---------------------------------------------------------------------------
  // Query/Mutation Tenant Validation
  // ---------------------------------------------------------------------------

  /**
   * Validate query tenant filter matches request context.
   *
   * Ensures queries cannot filter on other tenants' data.
   *
   * @param input - Query tenant filter validation input
   * @returns Prevention check result
   */
  validateQueryTenantFilter(
    input: ValidateQueryTenantFilterInput,
  ): DomainResult<PreventionCheckResult>;

  /**
   * Validate mutation target tenant matches request context.
   *
   * Ensures mutations cannot target other tenants' data.
   *
   * @param input - Mutation target validation input
   * @returns Prevention check result
   */
  validateMutationTarget(
    input: ValidateMutationTargetInput,
  ): DomainResult<PreventionCheckResult>;

  // ---------------------------------------------------------------------------
  // Utility Methods
  // ---------------------------------------------------------------------------

  /**
   * Create a standardized violation event for logging.
   *
   * @param context - Tenant context
   * @param checkType - Type of check that detected violation
   * @param operation - Operation that was attempted
   * @param reason - Reason for violation
   * @param severity - Severity level
   * @param additionalContext - Additional context for logging
   * @returns Violation event
   */
  createViolationEvent(
    context: TenantContext,
    checkType: CrossTenantCheckType,
    operation: OperationType,
    reason: string,
    severity: PreventionEventSeverity,
    additionalContext?: Record<string, unknown>,
  ): PreventionViolationEvent;
}

// ---------------------------------------------------------------------------
// Sensitive Data Sanitization
// ---------------------------------------------------------------------------

/**
 * Keys that should be redacted from violation event details.
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
  'authorization',
  'bearer',
  'nik',
]);

/**
 * Sanitize details object by redacting sensitive fields.
 */
function sanitizeDetails(details: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(details)) {
    const lowerKey = key.toLowerCase();

    if (SENSITIVE_KEYS.has(lowerKey)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeDetails(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a CrossTenantPreventionService instance.
 *
 * This pattern follows Clean Architecture DI principles — dependencies are
 * injected via the factory parameter, making the service testable and
 * decoupled from concrete implementations.
 *
 * @param dependencies - Service dependencies
 * @returns An implementation of ICrossTenantPreventionService
 *
 * @example
 * ```typescript
 * // DI Registration (in container setup)
 * container.register({
 *   crossTenantPreventionService: asFunction(CrossTenantPreventionServiceImpl).singleton(),
 * });
 *
 * // Usage
 * const prevention = DI.resolve('crossTenantPreventionService');
 * const result = await prevention.validateResourceAccess({
 *   context: { userId: 'user-123', activeTenantId: 'tenant-A' },
 *   resource: { resourceId: 'res-456', resourceType: ResourceType.HOUSEHOLD, resourceTenantId: 'tenant-A' },
 *   operation: OperationType.READ,
 * });
 * ```
 */
export const CrossTenantPreventionServiceImpl = ({
  auditEmitter = ConsoleCrossTenantPreventionAuditEmitter,
  membershipChecker = DefaultUserMembershipChecker,
}: {
  auditEmitter?: ICrossTenantPreventionAuditEmitter;
  membershipChecker?: IUserMembershipChecker;
}): ICrossTenantPreventionService => {
  // ---------------------------------------------------------------------------
  // Helper Functions
  // ---------------------------------------------------------------------------

  /**
   * Generate a unique ID for events.
   */
  const generateEventId = (): string => {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `ctp-${timestamp}-${random}`;
  };

  /**
   * Validate that a string is non-empty.
   */
  const isNonEmpty = (value: string | undefined | null): value is string => {
    return typeof value === 'string' && value.trim().length > 0;
  };

  /**
   * Determine severity based on operation type and context.
   */
  const determineSeverity = (
    operation: OperationType,
    checkType: CrossTenantCheckType,
  ): PreventionEventSeverity => {
    // Mutations are more critical than reads
    if (operation === OperationType.CREATE ||
        operation === OperationType.UPDATE ||
        operation === OperationType.DELETE) {
      return PreventionEventSeverity.CRITICAL;
    }

    // Batch operations with cross-tenant data are suspicious
    if (checkType === CrossTenantCheckType.BATCH_OPERATION) {
      return PreventionEventSeverity.SUSPICIOUS;
    }

    return PreventionEventSeverity.NORMAL;
  };

  /**
   * Create a blocked result with logging.
   */
  const createBlockedResult = async (
    context: TenantContext,
    checkType: CrossTenantCheckType,
    status: PreventionCheckStatus,
    reason: string,
    operation: OperationType,
    severity: PreventionEventSeverity,
    additionalDetails?: Record<string, unknown>,
  ): Promise<PreventionCheckResult> => {
    const event = createViolationEventInternal(
      context,
      checkType,
      operation,
      reason,
      severity,
      additionalDetails,
    );

    // Emit audit event
    if (severity === PreventionEventSeverity.CRITICAL) {
      await auditEmitter.emitCriticalEvent(event);
    } else {
      await auditEmitter.emitViolationEvent(event);
    }

    return {
      status,
      checkType,
      allowed: false,
      reason,
      severity,
      details: sanitizeDetails(additionalDetails ?? {}),
    };
  };

  /**
   * Internal helper to create violation event.
   */
  const createViolationEventInternal = (
    context: TenantContext,
    checkType: CrossTenantCheckType,
    operation: OperationType,
    reason: string,
    severity: PreventionEventSeverity,
    additionalContext?: Record<string, unknown>,
  ): PreventionViolationEvent => ({
    eventId: generateEventId(),
    timestamp: new Date(),
    userId: context.userId,
    activeTenantId: context.activeTenantId,
    checkType,
    operation,
    severity,
    reason,
    correlationId: context.correlationId,
    ipAddress: context.ipAddress,
    additionalContext: additionalContext ? sanitizeDetails(additionalContext) : undefined,
  });

  // ---------------------------------------------------------------------------
  // Service Implementation
  // ---------------------------------------------------------------------------

  return {
    // -------------------------------------------------------------------------
    // Resource Ownership Validation
    // -------------------------------------------------------------------------

    async validateResourceAccess(
      input: ValidateResourceAccessInput,
    ): Promise<DomainResult<PreventionCheckResult>> {
      const { context, resource, operation } = input;

      // Validate context tenant ID is present
      if (!isNonEmpty(context.activeTenantId)) {
        const result = await createBlockedResult(
          { ...context, activeTenantId: 'UNKNOWN' },
          CrossTenantCheckType.RESOURCE_OWNERSHIP,
          PreventionCheckStatus.MISSING_CONTEXT,
          'Active tenant ID is required for resource access validation',
          operation,
          PreventionEventSeverity.SUSPICIOUS,
          { resourceId: resource.resourceId, resourceType: resource.resourceType },
        );
        return ok(result);
      }

      // Validate resource tenant ID is present
      if (!isNonEmpty(resource.resourceTenantId)) {
        return fail(validationError(
          'CROSS_TENANT_PREVENTION_RESOURCE_TENANT_REQUIRED',
          'Resource tenant ID is required for validation',
        ));
      }

      // Check tenant match
      if (resource.resourceTenantId !== context.activeTenantId) {
        const result = await createBlockedResult(
          context,
          CrossTenantCheckType.RESOURCE_OWNERSHIP,
          PreventionCheckStatus.TENANT_MISMATCH,
          `Cross-tenant access blocked: resource belongs to tenant '${resource.resourceTenantId}', request from tenant '${context.activeTenantId}'`,
          operation,
          determineSeverity(operation, CrossTenantCheckType.RESOURCE_OWNERSHIP),
          {
            resourceId: resource.resourceId,
            resourceType: resource.resourceType,
            resourceTenantId: resource.resourceTenantId,
            requestTenantId: context.activeTenantId,
          },
        );
        return ok(result);
      }

      // Success - tenant match
      return ok({
        status: PreventionCheckStatus.ALLOWED,
        checkType: CrossTenantCheckType.RESOURCE_OWNERSHIP,
        allowed: true,
        reason: 'Resource belongs to active tenant',
      });
    },

    validateResourceOwnership(
      resourceTenantId: string,
      requestTenantId: string,
      operation: OperationType,
      resourceType: ResourceType,
      resourceId?: string,
    ): DomainResult<boolean> {
      // Validate inputs are present
      if (!isNonEmpty(resourceTenantId)) {
        return fail(validationError(
          'CROSS_TENANT_PREVENTION_RESOURCE_TENANT_REQUIRED',
          'Resource tenant ID is required for ownership validation',
        ));
      }

      if (!isNonEmpty(requestTenantId)) {
        return fail(authorizationError(
          'CROSS_TENANT_PREVENTION_CONTEXT_REQUIRED',
          'Request tenant ID is required for ownership validation',
        ));
      }

      // Check match
      if (resourceTenantId !== requestTenantId) {
        return fail(authorizationError(
          'CROSS_TENANT_ACCESS_BLOCKED',
          `Cross-tenant access blocked: resource (${resourceType}${resourceId ? `:${resourceId}` : ''}) belongs to tenant '${resourceTenantId}', request from tenant '${requestTenantId}'`,
        ));
      }

      return ok(true);
    },

    // -------------------------------------------------------------------------
    // User Membership Validation
    // -------------------------------------------------------------------------

    async validateUserMembership(
      input: ValidateUserMembershipInput,
    ): Promise<DomainResult<PreventionCheckResult>> {
      const { userId, tenantId, requireActive = true, correlationId } = input;

      // Validate inputs
      if (!isNonEmpty(userId)) {
        return fail(validationError(
          'CROSS_TENANT_PREVENTION_USER_REQUIRED',
          'User ID is required for membership validation',
        ));
      }

      if (!isNonEmpty(tenantId)) {
        return fail(validationError(
          'CROSS_TENANT_PREVENTION_TENANT_REQUIRED',
          'Tenant ID is required for membership validation',
        ));
      }

      // Check membership
      const hasMembership = await membershipChecker.hasActiveMembership(
        userId,
        tenantId,
        requireActive,
      );

      if (!hasMembership) {
        const context: TenantContext = {
          userId,
          activeTenantId: tenantId,
          correlationId,
        };

        const result = await createBlockedResult(
          context,
          CrossTenantCheckType.USER_MEMBERSHIP,
          PreventionCheckStatus.NOT_MEMBER,
          `User '${userId}' does not have ${requireActive ? 'active ' : ''}membership in tenant '${tenantId}'`,
          OperationType.READ,
          PreventionEventSeverity.SUSPICIOUS,
          { userId, tenantId, requireActive },
        );
        return ok(result);
      }

      return ok({
        status: PreventionCheckStatus.ALLOWED,
        checkType: CrossTenantCheckType.USER_MEMBERSHIP,
        allowed: true,
        reason: 'User has valid membership in tenant',
      });
    },

    // -------------------------------------------------------------------------
    // Request Context Validation
    // -------------------------------------------------------------------------

    async validateRequestContext(
      input: ValidateRequestContextInput,
    ): Promise<DomainResult<PreventionCheckResult>> {
      const { userId, requestTenantId, jwtTenantId, resourceTenantId, correlationId, ipAddress } = input;

      // Validate user ID
      if (!isNonEmpty(userId)) {
        return fail(validationError(
          'CROSS_TENANT_PREVENTION_USER_REQUIRED',
          'User ID is required for request context validation',
        ));
      }

      // Collect non-null tenant IDs
      const tenantIds: { source: string; value: string }[] = [];
      if (isNonEmpty(requestTenantId)) {
        tenantIds.push({ source: 'request', value: requestTenantId });
      }
      if (isNonEmpty(jwtTenantId)) {
        tenantIds.push({ source: 'jwt', value: jwtTenantId });
      }
      if (isNonEmpty(resourceTenantId)) {
        tenantIds.push({ source: 'resource', value: resourceTenantId });
      }

      // Must have at least one tenant ID
      if (tenantIds.length === 0) {
        const context: TenantContext = {
          userId,
          activeTenantId: 'UNKNOWN',
          correlationId,
          ipAddress,
        };

        const result = await createBlockedResult(
          context,
          CrossTenantCheckType.REQUEST_CONTEXT,
          PreventionCheckStatus.MISSING_CONTEXT,
          'No tenant context found in request - at least one tenant ID (request, JWT, or resource) is required',
          OperationType.READ,
          PreventionEventSeverity.SUSPICIOUS,
          { userId },
        );
        return ok(result);
      }

      // All provided tenant IDs must match
      const firstTenantId = tenantIds[0].value;
      const mismatch = tenantIds.find(t => t.value !== firstTenantId);

      if (mismatch) {
        const context: TenantContext = {
          userId,
          activeTenantId: firstTenantId,
          correlationId,
          ipAddress,
        };

        const result = await createBlockedResult(
          context,
          CrossTenantCheckType.REQUEST_CONTEXT,
          PreventionCheckStatus.TENANT_MISMATCH,
          `Tenant context mismatch: ${tenantIds[0].source}='${tenantIds[0].value}' vs ${mismatch.source}='${mismatch.value}'`,
          OperationType.READ,
          PreventionEventSeverity.CRITICAL,
          {
            userId,
            tenantSources: tenantIds.reduce((acc, t) => ({ ...acc, [t.source]: t.value }), {}),
          },
        );
        return ok(result);
      }

      return ok({
        status: PreventionCheckStatus.ALLOWED,
        checkType: CrossTenantCheckType.REQUEST_CONTEXT,
        allowed: true,
        reason: 'Request context is consistent',
      });
    },

    validateTenantContextPresent(
      tenantId: string | undefined | null,
      source: string,
    ): DomainResult<boolean> {
      if (!isNonEmpty(tenantId)) {
        return fail(authorizationError(
          'CROSS_TENANT_PREVENTION_CONTEXT_MISSING',
          `Tenant context missing from ${source} - access denied (fail closed)`,
        ));
      }
      return ok(true);
    },

    // -------------------------------------------------------------------------
    // Batch Operation Validation
    // -------------------------------------------------------------------------

    async validateBatchOperation(
      input: ValidateBatchOperationInput,
    ): Promise<DomainResult<BatchValidationResult>> {
      const { context, resources, operation } = input;

      // Validate context
      if (!isNonEmpty(context.activeTenantId)) {
        return fail(authorizationError(
          'CROSS_TENANT_PREVENTION_CONTEXT_REQUIRED',
          'Active tenant ID is required for batch operation validation',
        ));
      }

      // Validate resources
      if (!resources || resources.length === 0) {
        return ok({
          status: PreventionCheckStatus.ALLOWED,
          allValid: true,
          validCount: 0,
          invalidCount: 0,
          invalidResources: [],
        });
      }

      // Check each resource
      const invalidResources: InvalidResourceInfo[] = [];

      for (const resource of resources) {
        if (resource.resourceTenantId !== context.activeTenantId) {
          invalidResources.push({
            resourceId: resource.resourceId,
            resourceType: resource.resourceType,
            expectedTenantId: context.activeTenantId,
            actualTenantId: resource.resourceTenantId,
            reason: `Resource belongs to different tenant`,
          });
        }
      }

      // If there are invalid resources, emit batch violation event
      if (invalidResources.length > 0) {
        await auditEmitter.emitBatchViolationEvent(context, invalidResources, operation);

        const severity = determineSeverity(operation, CrossTenantCheckType.BATCH_OPERATION);

        return ok({
          status: PreventionCheckStatus.BATCH_CROSS_TENANT,
          allValid: false,
          validCount: resources.length - invalidResources.length,
          invalidCount: invalidResources.length,
          invalidResources,
          severity,
        });
      }

      return ok({
        status: PreventionCheckStatus.ALLOWED,
        allValid: true,
        validCount: resources.length,
        invalidCount: 0,
        invalidResources: [],
      });
    },

    // -------------------------------------------------------------------------
    // Query/Mutation Tenant Validation
    // -------------------------------------------------------------------------

    validateQueryTenantFilter(
      input: ValidateQueryTenantFilterInput,
    ): DomainResult<PreventionCheckResult> {
      const { context, queryTenantId, isPlatformWideQuery = false, isPlatformAdmin = false } = input;

      // Validate context
      if (!isNonEmpty(context.activeTenantId)) {
        return fail(authorizationError(
          'CROSS_TENANT_PREVENTION_CONTEXT_REQUIRED',
          'Active tenant ID is required for query tenant filter validation',
        ));
      }

      // Platform admins can do platform-wide queries
      if (isPlatformWideQuery) {
        if (!isPlatformAdmin) {
          return fail(authorizationError(
            'CROSS_TENANT_QUERY_UNAUTHORIZED',
            'Platform-wide queries require PLATFORM_ADMIN role',
          ));
        }
        // Platform admin doing platform-wide query - allowed
        return ok({
          status: PreventionCheckStatus.ALLOWED,
          checkType: CrossTenantCheckType.QUERY_TENANT_FILTER,
          allowed: true,
          reason: 'Platform admin authorized for platform-wide query',
        });
      }

      // Non-platform-wide: query tenant must match active tenant
      if (queryTenantId !== context.activeTenantId) {
        return fail(authorizationError(
          'CROSS_TENANT_QUERY_BLOCKED',
          `Query tenant filter '${queryTenantId}' does not match active tenant '${context.activeTenantId}'`,
        ));
      }

      return ok({
        status: PreventionCheckStatus.ALLOWED,
        checkType: CrossTenantCheckType.QUERY_TENANT_FILTER,
        allowed: true,
        reason: 'Query tenant filter matches active tenant',
      });
    },

    validateMutationTarget(
      input: ValidateMutationTargetInput,
    ): DomainResult<PreventionCheckResult> {
      const { context, targetTenantId, operation, resourceType } = input;

      // Validate context
      if (!isNonEmpty(context.activeTenantId)) {
        return fail(authorizationError(
          'CROSS_TENANT_PREVENTION_CONTEXT_REQUIRED',
          'Active tenant ID is required for mutation target validation',
        ));
      }

      // Validate target tenant
      if (!isNonEmpty(targetTenantId)) {
        return fail(validationError(
          'CROSS_TENANT_PREVENTION_TARGET_REQUIRED',
          'Target tenant ID is required for mutation validation',
        ));
      }

      // Mutation target must match active tenant
      if (targetTenantId !== context.activeTenantId) {
        return fail(authorizationError(
          'CROSS_TENANT_MUTATION_BLOCKED',
          `Cross-tenant mutation blocked: cannot ${operation} ${resourceType} in tenant '${targetTenantId}' from tenant '${context.activeTenantId}'`,
        ));
      }

      return ok({
        status: PreventionCheckStatus.ALLOWED,
        checkType: CrossTenantCheckType.MUTATION_TENANT_TARGET,
        allowed: true,
        reason: 'Mutation target tenant matches active tenant',
      });
    },

    // -------------------------------------------------------------------------
    // Utility Methods
    // -------------------------------------------------------------------------

    createViolationEvent(
      context: TenantContext,
      checkType: CrossTenantCheckType,
      operation: OperationType,
      reason: string,
      severity: PreventionEventSeverity,
      additionalContext?: Record<string, unknown>,
    ): PreventionViolationEvent {
      return createViolationEventInternal(
        context,
        checkType,
        operation,
        reason,
        severity,
        additionalContext,
      );
    },
  };
};

