/**
 * GetSecurityEventsUseCase — Retrieves security events for Platform Admin Dashboard.
 *
 * This use case orchestrates the retrieval of security events including:
 * - Failed login attempts, token reuse detection, unauthorized access attempts
 * - Rate limit violations, cross-tenant access attempts, token version resets
 * - Filtering by severity, event type, tenant, user, acknowledgment status
 * - Pagination and sorting
 *
 * **AUTHORIZATION:**
 * Only PLATFORM_ADMIN role can access this use case. All access is logged to audit trail.
 *
 * **ORCHESTRATION FLOW:**
 * 1. Validate actor has PLATFORM_ADMIN role
 * 2. Validate and sanitize filter inputs
 * 3. Validate pagination parameters
 * 4. Call repository via privileged execution path
 * 5. Return paginated security events
 *
 * @see Requirements 21.1-21.10 (Security Event Alerts)
 */

import type { DomainResult } from '@core/utils';
import { fail } from '@core/utils';
import type {
  PaginatedSecurityEvents,
  SecurityEventFilters,
  SecurityEventSort,
  SecurityEventQueryOptions,
  SecurityEventSeverity,
  SecurityEventType,
  SECURITY_SEVERITY_LEVELS,
  ALL_SECURITY_EVENT_TYPES,
} from '../entities/SecurityEvent';
import type { PlatformRepository } from '../repositories/PlatformRepository';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Input parameters for getting security events.
 */
export interface GetSecurityEventsUseCaseInput {
  /**
   * Whether the actor is a platform admin.
   * Only PLATFORM_ADMIN role can access security events.
   *
   * @see Requirements 21.1 (PLATFORM_ADMIN role required)
   */
  readonly isPlatformAdmin: boolean;

  /**
   * Actor's user ID for audit logging.
   */
  readonly actorUserId: string;

  /**
   * Pagination options.
   */
  readonly pagination?: {
    readonly page?: number;
    readonly pageSize?: number;
  };

  /**
   * Optional filters for security events.
   *
   * @see Requirements 21.4 (Severity filtering)
   */
  readonly filters?: Partial<SecurityEventFilters>;

  /**
   * Optional sort options.
   */
  readonly sort?: SecurityEventSort;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * GetSecurityEventsUseCase interface — retrieves security events.
 */
export interface GetSecurityEventsUseCase {
  /**
   * Execute the get security events operation.
   *
   * @param input - The input parameters
   * @returns DomainResult with paginated security events or error
   */
  execute(input: GetSecurityEventsUseCaseInput): Promise<DomainResult<PaginatedSecurityEvents>>;
}

// ---------------------------------------------------------------------------
// Error Factory Functions
// ---------------------------------------------------------------------------

/**
 * Creates an authorization error for non-platform admin access attempt.
 */
function authPlatformAdminRequired() {
  return {
    type: 'authorization' as const,
    code: 'AUTH_PLATFORM_ADMIN_REQUIRED',
    message: 'Only PLATFORM_ADMIN role can access security events',
    userMessage: 'platform.unauthorized',
    retryable: false,
  };
}

/**
 * Creates a validation error for invalid pagination parameters.
 */
function validationInvalidPagination(message: string) {
  return {
    type: 'validation' as const,
    code: 'VALIDATION_INVALID_PAGINATION',
    message,
    userMessage: 'common.validation_failed',
    retryable: false,
  };
}

/**
 * Creates a validation error for invalid date range.
 */
function validationInvalidDateRange() {
  return {
    type: 'validation' as const,
    code: 'VALIDATION_INVALID_DATE_RANGE',
    message: 'Start date must be before or equal to end date',
    userMessage: 'common.invalid_date_range',
    retryable: false,
  };
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a GetSecurityEventsUseCase instance.
 *
 * @param dependencies - The use case dependencies
 * @returns An implementation of GetSecurityEventsUseCase
 */
export const GetSecurityEventsUseCaseImpl = ({
  platformRepository,
}: {
  platformRepository: PlatformRepository;
}): GetSecurityEventsUseCase => ({
  execute: async (
    input: GetSecurityEventsUseCaseInput,
  ): Promise<DomainResult<PaginatedSecurityEvents>> => {
    const {
      isPlatformAdmin,
      actorUserId,
      pagination,
      filters,
      sort,
    } = input;

    // -------------------------------------------------------------------------
    // Step 1: Validate actor has PLATFORM_ADMIN role
    // Requirement 21.1: Security events only for PLATFORM_ADMIN
    // -------------------------------------------------------------------------
    if (!isPlatformAdmin) {
      return fail(authPlatformAdminRequired());
    }

    // -------------------------------------------------------------------------
    // Step 2: Validate pagination parameters
    // -------------------------------------------------------------------------
    const page = pagination?.page ?? 1;
    const pageSize = pagination?.pageSize ?? 50;

    if (page < 1) {
      return fail(validationInvalidPagination('Page must be >= 1'));
    }

    if (pageSize < 1 || pageSize > 100) {
      return fail(validationInvalidPagination('Page size must be between 1 and 100'));
    }

    // -------------------------------------------------------------------------
    // Step 3: Validate date range if provided
    // -------------------------------------------------------------------------
    if (filters?.dateFrom && filters?.dateTo) {
      if (filters.dateFrom > filters.dateTo) {
        return fail(validationInvalidDateRange());
      }
    }

    // -------------------------------------------------------------------------
    // Step 4: Build query options
    // -------------------------------------------------------------------------
    const queryOptions: SecurityEventQueryOptions = {
      filters: filters as SecurityEventFilters | undefined,
      sort,
      page,
      pageSize,
    };

    // -------------------------------------------------------------------------
    // Step 5: Call repository via privileged execution path
    // All access is logged to audit trail by the repository
    // -------------------------------------------------------------------------
    const result = await platformRepository.getSecurityEvents(actorUserId, queryOptions);

    return result;
  },
});

/**
 * Type alias for cleaner DI registration.
 */
export type GetSecurityEventsUseCaseType = GetSecurityEventsUseCase;
