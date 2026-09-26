/**
 * Authorization Audit Logger — Structured audit logging for all authorization decisions.
 *
 * This module provides comprehensive audit logging for authorization decisions
 * as required by FASE 2.13 — Observability and Audit Logging.
 *
 * All authorization decisions (ALLOW and DENY) are logged with structured
 * JSON format for:
 * - Audit trail compliance
 * - Security incident investigation
 * - Debugging and troubleshooting
 * - Performance monitoring
 *
 * SECURITY CONSIDERATIONS:
 * - MUST NOT log sensitive data (passwords, tokens, OTP, CVV, PII)
 * - Denial logs include sufficient context for debugging without exposing security details
 * - All logs include correlationId for request tracing
 *
 * CORRELATION ID INTEGRATION:
 * - Uses `@infrastructure/utils/correlationId` for correlation ID generation
 * - If correlationId is not provided, a fallback value is generated automatically
 * - Ensures consistent correlationId propagation across all log entries for a request
 *
 * @see Requirements 15.1 — Authorization decision audit logging
 * @see Requirements 15.5 — No sensitive data in logs
 * @see Requirements 15.6 — Structured JSON logging format
 * @see Requirements 15.7 — Denial debugging context
 * @see Requirements 15.8 — Integrate with correlationId system
 */

import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import type { Logger } from './Logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Authorization decision outcome.
 */
export type AuthorizationDecision = 'ALLOW' | 'DENY';

/**
 * Reason codes for authorization denials.
 *
 * These codes are stable and searchable for log analysis.
 * Each code maps to a specific denial scenario.
 */
export type AuthorizationDenialReason =
  | 'AUTH_INSUFFICIENT_PERMISSION'
  | 'AUTH_MEMBERSHIP_SUSPENDED'
  | 'AUTH_MEMBERSHIP_REVOKED'
  | 'AUTH_MEMBERSHIP_INACTIVE'
  | 'AUTH_NO_MEMBERSHIP'
  | 'AUTH_TOKEN_INVALID'
  | 'AUTH_TOKEN_EXPIRED'
  | 'AUTH_TOKEN_VERSION_MISMATCH'
  | 'AUTH_TENANT_MISMATCH'
  | 'AUTH_OUT_OF_SCOPE'
  | 'AUTH_CONTEXT_RESOLUTION_FAILED'
  | 'AUTH_USER_QUARANTINED'
  | 'AUTH_UNEXPECTED_ERROR';

/**
 * Denial debugging context — provides sufficient information for debugging
 * authorization denials without exposing security-sensitive details.
 *
 * @see Requirements 15.7 — Denial debugging context
 */
export interface DenialDebuggingContext {
  /**
   * Human-readable description of why the denial occurred.
   * Example: "User lacks required permissions for this endpoint"
   */
  readonly denialDescription?: string;

  /**
   * User's actual permissions at time of denial (redacted to permission names only).
   * SECURITY: Only included in non-production environments or when explicitly enabled.
   * Example: ['resident:read', 'announcement:read']
   */
  readonly actualPermissions?: readonly string[];

  /**
   * Query parameters from the request (sanitized — no sensitive values).
   * Example: { page: '1', limit: '10' }
   */
  readonly queryParams?: Record<string, string>;

  /**
   * Request path parameters (sanitized — UUIDs only, no sensitive data).
   * Example: { id: 'uuid-here', tenantId: 'uuid-here' }
   */
  readonly pathParams?: Record<string, string>;

  /**
   * Membership status at time of denial.
   * Example: 'ACTIVE', 'SUSPENDED', 'REVOKED'
   */
  readonly membershipStatus?: string;

  /**
   * Whether the request was targeting a cross-tenant resource.
   */
  readonly crossTenantAttempt?: boolean;

  /**
   * Token version mismatch details (if applicable).
   * Contains expected vs actual version, not the tokens themselves.
   */
  readonly tokenVersionMismatch?: {
    readonly expected: number;
    readonly actual: number;
  };

  /**
   * Scope mismatch details (if applicable).
   * Example: User tried to access org unit they don't belong to.
   */
  readonly scopeMismatch?: {
    readonly requestedOrgUnitId?: string | null;
    readonly allowedOrgUnitIds?: readonly string[];
  };

  /**
   * Request origin information for debugging routing issues.
   */
  readonly requestOrigin?: {
    readonly userAgent?: string;
    readonly ipHash?: string; // Hashed IP for privacy
    readonly referer?: string;
  };

  /**
   * Time-related context for debugging temporal issues.
   */
  readonly timeContext?: {
    readonly requestTimestamp: string;
    readonly tokenIssuedAt?: string;
    readonly tokenExpiresAt?: string;
  };

  /**
   * Suggested remediation steps for the denial.
   * Helps engineers understand what needs to be fixed.
   */
  readonly suggestedRemediation?: string;
}

/**
 * Input for logging an authorization decision.
 *
 * Contains all required fields for audit logging as per Requirements 15.1.
 */
export interface AuthorizationDecisionLogInput {
  /**
   * Unique correlation ID for request tracing.
   * If not provided, a fallback ID is generated using `@infrastructure/utils/correlationId`.
   * @see Requirements 15.8 — Integrate with correlationId system
   */
  readonly correlationId?: string;

  /**
   * User ID making the request.
   * May be undefined if context resolution failed.
   */
  readonly userId?: string;

  /**
   * Tenant ID for the request.
   * May be undefined if context resolution failed.
   */
  readonly tenantId?: string;

  /**
   * Active membership ID for the request.
   * May be undefined if context resolution failed.
   */
  readonly membershipId?: string;

  /**
   * API endpoint being accessed (route path).
   */
  readonly endpoint: string;

  /**
   * HTTP method (GET, POST, PUT, DELETE, etc.).
   */
  readonly method: string;

  /**
   * List of permissions that were required for this endpoint.
   */
  readonly requiredPermissions: readonly string[];

  /**
   * The authorization decision (ALLOW or DENY).
   */
  readonly decision: AuthorizationDecision;

  /**
   * Reason code for the decision.
   * Required for DENY decisions.
   * Optional for ALLOW decisions (usually undefined).
   */
  readonly reason?: AuthorizationDenialReason | string;

  /**
   * User's role at time of decision.
   * Useful for debugging permission issues.
   */
  readonly role?: string;

  /**
   * Organization unit ID scope.
   * May be null for tenant-level operations.
   */
  readonly orgUnitId?: string | null;

  /**
   * List of permissions that were missing (for DENY decisions).
   * SECURITY: Only logged in development mode to avoid leaking permission info.
   */
  readonly missingPermissions?: readonly string[];

  /**
   * Whether user's membership is suspended.
   * Required for safety-critical route audit (Requirements 7.5, 7.7).
   */
  readonly membershipSuspended?: boolean;

  /**
   * Whether this is a safety-critical route.
   * Required for safety-critical route audit (Requirements 7.5, 7.7).
   */
  readonly isSafetyRoute?: boolean;

  /**
   * Additional context for debugging.
   * MUST NOT contain sensitive data.
   */
  readonly additionalContext?: Record<string, unknown>;

  /**
   * Denial debugging context (Requirements 15.7).
   * Provides sufficient information for debugging authorization denials
   * without exposing security-sensitive details.
   * Only populated for DENY decisions.
   */
  readonly denialContext?: DenialDebuggingContext;
}

/**
 * Authorization Audit Logger interface.
 *
 * Provides structured audit logging for all authorization decisions.
 */
export interface AuthorizationAuditLogger {
  /**
   * Log an authorization decision (ALLOW or DENY).
   *
   * @param input - The authorization decision details to log
   */
  logDecision(input: AuthorizationDecisionLogInput): void;

  /**
   * Log an authorization ALLOW decision.
   *
   * Convenience method for successful authorization.
   *
   * @param input - The authorization decision details (decision field is auto-set to ALLOW)
   */
  logAllow(input: Omit<AuthorizationDecisionLogInput, 'decision'>): void;

  /**
   * Log an authorization DENY decision.
   *
   * Convenience method for denied authorization.
   *
   * @param input - The authorization decision details (decision field is auto-set to DENY)
   */
  logDeny(input: Omit<AuthorizationDecisionLogInput, 'decision'>): void;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Dependencies for the AuthorizationAuditLogger factory.
 */
export interface AuthorizationAuditLoggerDeps {
  readonly logger: Logger;
}

/**
 * Creates an AuthorizationAuditLogger instance.
 *
 * Factory function pattern for DI registration with Awilix.
 *
 * @param deps - Dependencies including the base logger
 * @returns AuthorizationAuditLogger instance
 *
 * @example
 * ```typescript
 * // DI Registration
 * container.register({
 *   authorizationAuditLogger: asFunction(createAuthorizationAuditLogger).singleton(),
 * });
 *
 * // Usage
 * const auditLogger = container.resolve<AuthorizationAuditLogger>('authorizationAuditLogger');
 * auditLogger.logDeny({
 *   correlationId: 'abc-123',
 *   userId: 'user-1',
 *   tenantId: 'tenant-1',
 *   membershipId: 'membership-1',
 *   endpoint: '/api/residents',
 *   method: 'GET',
 *   requiredPermissions: ['resident:read'],
 *   reason: 'AUTH_INSUFFICIENT_PERMISSION',
 * });
 * ```
 */
export function createAuthorizationAuditLogger(
  deps: AuthorizationAuditLoggerDeps,
): AuthorizationAuditLogger {
  const { logger } = deps;

  /**
   * Builds the structured log context from input.
   * Ensures all required fields are present and formatted correctly.
   * Uses fallback correlationId if not provided (per Requirements 15.8).
   */
  function buildLogContext(
    input: AuthorizationDecisionLogInput,
  ): Record<string, unknown> {
    // Use provided correlationId or generate a fallback (Requirements 15.8)
    const effectiveCorrelationId = input.correlationId || generateCorrelationId();
    
    const context: Record<string, unknown> = {
      // Core identification fields (Requirements 15.1)
      correlation_id: effectiveCorrelationId,
      timestamp: new Date().toISOString(),
      
      // User/tenant context
      user_id: input.userId ?? 'unknown',
      tenant_id: input.tenantId ?? 'unknown',
      membership_id: input.membershipId ?? 'unknown',
      
      // Request context
      endpoint: input.endpoint,
      method: input.method,
      
      // Authorization details
      required_permissions: input.requiredPermissions,
      decision: input.decision,
      
      // Event type for log aggregation filtering
      event_type: 'authorization_decision',
      
      // Indicate if fallback correlationId was used (useful for debugging)
      correlation_id_generated: !input.correlationId,
    };

    // Include reason for all decisions (helpful for ALLOW audits too)
    if (input.reason) {
      context.reason = input.reason;
    }

    // Include role for debugging
    if (input.role) {
      context.role = input.role;
    }

    // Include orgUnitId scope
    if (input.orgUnitId !== undefined) {
      context.org_unit_id = input.orgUnitId;
    }

    // Include missing permissions in development only (Requirements 15.5 — security)
    if (
      input.missingPermissions &&
      input.missingPermissions.length > 0 &&
      process.env.NODE_ENV === 'development'
    ) {
      context.missing_permissions = input.missingPermissions;
    }

    // Include membership status for safety route audits (Requirements 7.5, 7.7)
    if (input.membershipSuspended !== undefined) {
      context.membership_suspended = input.membershipSuspended;
    }

    if (input.isSafetyRoute) {
      context.safety_route = true;
    }

    // Include additional context if provided (sanitized by caller)
    if (input.additionalContext) {
      // Flatten additional context to avoid nested objects
      for (const [key, value] of Object.entries(input.additionalContext)) {
        // Prefix with 'ctx_' to distinguish from core fields
        context[`ctx_${key}`] = value;
      }
    }

    // Include denial debugging context for DENY decisions (Requirements 15.7)
    if (input.decision === 'DENY' && input.denialContext) {
      context.denial_debug = buildDenialDebuggingContext(input.denialContext);
    }

    return context;
  }

  /**
   * Builds the denial debugging context for structured logging.
   * Ensures security-sensitive data is NOT included.
   *
   * @see Requirements 15.7 — Denial debugging context
   */
  function buildDenialDebuggingContext(
    denialContext: DenialDebuggingContext,
  ): Record<string, unknown> {
    const debugContext: Record<string, unknown> = {};

    // Human-readable denial description
    if (denialContext.denialDescription) {
      debugContext.description = denialContext.denialDescription;
    }

    // Actual permissions (only in non-production for security)
    if (
      denialContext.actualPermissions &&
      denialContext.actualPermissions.length > 0 &&
      process.env.NODE_ENV !== 'production'
    ) {
      debugContext.actual_permissions = denialContext.actualPermissions;
    }

    // Sanitized query parameters (useful for debugging request issues)
    if (denialContext.queryParams && Object.keys(denialContext.queryParams).length > 0) {
      debugContext.query_params = denialContext.queryParams;
    }

    // Path parameters (sanitized - UUIDs only)
    if (denialContext.pathParams && Object.keys(denialContext.pathParams).length > 0) {
      debugContext.path_params = denialContext.pathParams;
    }

    // Membership status for debugging status-based denials
    if (denialContext.membershipStatus) {
      debugContext.membership_status = denialContext.membershipStatus;
    }

    // Cross-tenant attempt flag
    if (denialContext.crossTenantAttempt !== undefined) {
      debugContext.cross_tenant_attempt = denialContext.crossTenantAttempt;
    }

    // Token version mismatch details (no sensitive data, just version numbers)
    if (denialContext.tokenVersionMismatch) {
      debugContext.token_version_mismatch = {
        expected: denialContext.tokenVersionMismatch.expected,
        actual: denialContext.tokenVersionMismatch.actual,
      };
    }

    // Scope mismatch details for debugging org unit access issues
    if (denialContext.scopeMismatch) {
      debugContext.scope_mismatch = {
        requested_org_unit_id: denialContext.scopeMismatch.requestedOrgUnitId ?? null,
        allowed_org_unit_ids: denialContext.scopeMismatch.allowedOrgUnitIds ?? [],
      };
    }

    // Request origin for debugging routing/client issues (privacy-safe)
    if (denialContext.requestOrigin) {
      debugContext.request_origin = {
        user_agent: denialContext.requestOrigin.userAgent ?? 'unknown',
        ip_hash: denialContext.requestOrigin.ipHash ?? 'unknown',
        referer: denialContext.requestOrigin.referer ?? null,
      };
    }

    // Time context for debugging temporal issues (token expiry, etc.)
    if (denialContext.timeContext) {
      debugContext.time_context = {
        request_timestamp: denialContext.timeContext.requestTimestamp,
        token_issued_at: denialContext.timeContext.tokenIssuedAt ?? null,
        token_expires_at: denialContext.timeContext.tokenExpiresAt ?? null,
      };
    }

    // Suggested remediation for faster debugging
    if (denialContext.suggestedRemediation) {
      debugContext.suggested_remediation = denialContext.suggestedRemediation;
    }

    return debugContext;
  }

  /**
   * Log an authorization decision.
   */
  function logDecision(input: AuthorizationDecisionLogInput): void {
    const context = buildLogContext(input);

    if (input.decision === 'ALLOW') {
      // Log ALLOW decisions at info level
      logger.info('Authorization decision: ALLOW', context);
    } else {
      // Log DENY decisions at warn level for visibility
      // Includes sufficient context for debugging without exposing security details (Requirements 15.7)
      logger.warn('Authorization decision: DENY', context);
    }
  }

  /**
   * Log an authorization ALLOW decision.
   */
  function logAllow(
    input: Omit<AuthorizationDecisionLogInput, 'decision'>,
  ): void {
    logDecision({ ...input, decision: 'ALLOW' });
  }

  /**
   * Log an authorization DENY decision.
   */
  function logDeny(
    input: Omit<AuthorizationDecisionLogInput, 'decision'>,
  ): void {
    logDecision({ ...input, decision: 'DENY' });
  }

  return {
    logDecision,
    logAllow,
    logDeny,
  };
}

// ---------------------------------------------------------------------------
// Helper Functions for Common Denial Scenarios
// ---------------------------------------------------------------------------

/**
 * Creates a standardized denial log input for insufficient permissions.
 *
 * @param baseInput - Base input fields
 * @param missingPermissions - Permissions that were missing
 * @returns Complete AuthorizationDecisionLogInput for logging
 */
export function createInsufficientPermissionDenial(
  baseInput: Omit<AuthorizationDecisionLogInput, 'decision' | 'reason'>,
  missingPermissions: readonly string[],
): AuthorizationDecisionLogInput {
  return {
    ...baseInput,
    decision: 'DENY',
    reason: 'AUTH_INSUFFICIENT_PERMISSION',
    missingPermissions,
  };
}

/**
 * Creates a standardized denial log input for suspended membership.
 *
 * @param baseInput - Base input fields
 * @returns Complete AuthorizationDecisionLogInput for logging
 */
export function createMembershipSuspendedDenial(
  baseInput: Omit<AuthorizationDecisionLogInput, 'decision' | 'reason' | 'membershipSuspended'>,
): AuthorizationDecisionLogInput {
  return {
    ...baseInput,
    decision: 'DENY',
    reason: 'AUTH_MEMBERSHIP_SUSPENDED',
    membershipSuspended: true,
  };
}

/**
 * Creates a standardized denial log input for revoked membership.
 *
 * @param baseInput - Base input fields
 * @returns Complete AuthorizationDecisionLogInput for logging
 */
export function createMembershipRevokedDenial(
  baseInput: Omit<AuthorizationDecisionLogInput, 'decision' | 'reason'>,
): AuthorizationDecisionLogInput {
  return {
    ...baseInput,
    decision: 'DENY',
    reason: 'AUTH_MEMBERSHIP_REVOKED',
  };
}

/**
 * Creates a standardized denial log input for invalid/missing token.
 *
 * @param baseInput - Base input fields (userId, tenantId may be undefined)
 * @returns Complete AuthorizationDecisionLogInput for logging
 */
export function createTokenInvalidDenial(
  baseInput: Omit<AuthorizationDecisionLogInput, 'decision' | 'reason'>,
): AuthorizationDecisionLogInput {
  return {
    ...baseInput,
    decision: 'DENY',
    reason: 'AUTH_TOKEN_INVALID',
  };
}

/**
 * Creates a standardized ALLOW log input for successful authorization.
 *
 * @param baseInput - Base input fields
 * @param options - Optional flags for special scenarios
 * @returns Complete AuthorizationDecisionLogInput for logging
 */
export function createAuthorizationAllow(
  baseInput: Omit<AuthorizationDecisionLogInput, 'decision'>,
  options?: {
    readonly membershipSuspended?: boolean;
    readonly isSafetyRoute?: boolean;
  },
): AuthorizationDecisionLogInput {
  return {
    ...baseInput,
    decision: 'ALLOW',
    membershipSuspended: options?.membershipSuspended,
    isSafetyRoute: options?.isSafetyRoute,
  };
}

// ---------------------------------------------------------------------------
// Helper Functions for Denial Debugging Context (Requirements 15.7)
// ---------------------------------------------------------------------------

/**
 * Creates a denial debugging context for insufficient permissions.
 *
 * @param options - Context options for debugging
 * @returns DenialDebuggingContext for the denial log
 */
export function createInsufficientPermissionDebuggingContext(
  options: {
    readonly actualPermissions?: readonly string[];
    readonly membershipStatus?: string;
    readonly queryParams?: Record<string, string>;
    readonly pathParams?: Record<string, string>;
  },
): DenialDebuggingContext {
  return {
    denialDescription: 'User lacks required permissions for this endpoint',
    actualPermissions: options.actualPermissions,
    membershipStatus: options.membershipStatus,
    queryParams: options.queryParams,
    pathParams: options.pathParams,
    suggestedRemediation: 'Verify user role has the required permissions in PermissionRegistry, or check if the user has been assigned the correct role.',
  };
}

/**
 * Creates a denial debugging context for token version mismatch.
 *
 * @param options - Context options including token version details
 * @returns DenialDebuggingContext for the denial log
 */
export function createTokenVersionMismatchDebuggingContext(
  options: {
    readonly expectedVersion: number;
    readonly actualVersion: number;
    readonly tokenIssuedAt?: string;
    readonly tokenExpiresAt?: string;
    readonly requestTimestamp?: string;
  },
): DenialDebuggingContext {
  return {
    denialDescription: 'Token version does not match server expectation — user needs to re-authenticate',
    tokenVersionMismatch: {
      expected: options.expectedVersion,
      actual: options.actualVersion,
    },
    timeContext: {
      requestTimestamp: options.requestTimestamp ?? new Date().toISOString(),
      tokenIssuedAt: options.tokenIssuedAt,
      tokenExpiresAt: options.tokenExpiresAt,
    },
    suggestedRemediation: 'Token version mismatch indicates the user\'s credentials have been invalidated (password change, logout-all, etc.). User must re-authenticate.',
  };
}

/**
 * Creates a denial debugging context for membership status issues.
 *
 * @param options - Context options including membership status
 * @returns DenialDebuggingContext for the denial log
 */
export function createMembershipStatusDebuggingContext(
  options: {
    readonly membershipStatus: 'SUSPENDED' | 'REVOKED' | 'INVITED' | 'INACTIVE';
    readonly isSafetyRoute?: boolean;
    readonly queryParams?: Record<string, string>;
    readonly pathParams?: Record<string, string>;
  },
): DenialDebuggingContext {
  const statusDescriptions: Record<string, string> = {
    SUSPENDED: 'User membership is suspended — limited to safety-critical routes only',
    REVOKED: 'User membership has been revoked — no access allowed',
    INVITED: 'User membership is pending invitation acceptance — no access allowed',
    INACTIVE: 'User membership is inactive — no access allowed',
  };

  const remediations: Record<string, string> = {
    SUSPENDED: 'Contact tenant administrator to reinstate membership, or verify if this is a safety route that should allow suspended access.',
    REVOKED: 'Membership cannot be restored automatically. Contact tenant administrator.',
    INVITED: 'User must accept invitation to activate membership.',
    INACTIVE: 'Contact tenant administrator to reactivate membership.',
  };

  return {
    denialDescription: statusDescriptions[options.membershipStatus] ?? 'Membership status prevents access',
    membershipStatus: options.membershipStatus,
    queryParams: options.queryParams,
    pathParams: options.pathParams,
    suggestedRemediation: remediations[options.membershipStatus] ?? 'Contact tenant administrator.',
  };
}

/**
 * Creates a denial debugging context for cross-tenant access attempts.
 *
 * @param options - Context options for cross-tenant debugging
 * @returns DenialDebuggingContext for the denial log
 */
export function createCrossTenantDebuggingContext(
  options: {
    readonly requestedTenantId?: string;
    readonly userTenantId?: string;
    readonly queryParams?: Record<string, string>;
    readonly pathParams?: Record<string, string>;
  },
): DenialDebuggingContext {
  return {
    denialDescription: 'User attempted to access resources from a different tenant',
    crossTenantAttempt: true,
    queryParams: options.queryParams,
    pathParams: options.pathParams,
    suggestedRemediation: 'Verify the user is accessing resources within their assigned tenant. If multi-tenant access is required, ensure proper tenant context switching.',
  };
}

/**
 * Creates a denial debugging context for scope/org-unit mismatch.
 *
 * @param options - Context options for scope mismatch debugging
 * @returns DenialDebuggingContext for the denial log
 */
export function createScopeMismatchDebuggingContext(
  options: {
    readonly requestedOrgUnitId?: string | null;
    readonly allowedOrgUnitIds?: readonly string[];
    readonly queryParams?: Record<string, string>;
    readonly pathParams?: Record<string, string>;
  },
): DenialDebuggingContext {
  return {
    denialDescription: 'User attempted to access resources outside their authorized organizational scope',
    scopeMismatch: {
      requestedOrgUnitId: options.requestedOrgUnitId,
      allowedOrgUnitIds: options.allowedOrgUnitIds,
    },
    queryParams: options.queryParams,
    pathParams: options.pathParams,
    suggestedRemediation: 'Verify the user has membership in the requested organizational unit, or adjust the request to target an allowed org unit.',
  };
}

/**
 * Creates a denial debugging context for context resolution failures.
 *
 * @param options - Context options for resolution failure debugging
 * @returns DenialDebuggingContext for the denial log
 */
export function createContextResolutionFailureDebuggingContext(
  options: {
    readonly errorCode?: string;
    readonly errorMessage?: string;
    readonly requestTimestamp?: string;
    readonly userAgent?: string;
    readonly ipHash?: string;
  },
): DenialDebuggingContext {
  return {
    denialDescription: 'Authorization context could not be resolved from the request',
    requestOrigin: {
      userAgent: options.userAgent,
      ipHash: options.ipHash,
    },
    timeContext: {
      requestTimestamp: options.requestTimestamp ?? new Date().toISOString(),
    },
    suggestedRemediation: `Context resolution failed with error: ${options.errorCode ?? 'UNKNOWN'}. Check that the request includes valid authentication headers and the user has an active membership.`,
  };
}

/**
 * Creates a comprehensive denial log input with full debugging context.
 * This is the preferred method for logging denials as it ensures
 * all debugging information is included consistently.
 *
 * @param baseInput - Base input fields
 * @param reason - Denial reason code
 * @param denialContext - Debugging context for the denial
 * @returns Complete AuthorizationDecisionLogInput with debugging context
 */
export function createDenialWithDebuggingContext(
  baseInput: Omit<AuthorizationDecisionLogInput, 'decision' | 'reason' | 'denialContext'>,
  reason: AuthorizationDenialReason,
  denialContext: DenialDebuggingContext,
): AuthorizationDecisionLogInput {
  return {
    ...baseInput,
    decision: 'DENY',
    reason,
    denialContext,
  };
}
