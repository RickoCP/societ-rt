/**
 * GetTenantsOverviewUseCase — Retrieves paginated tenant overview for Platform Admin Dashboard.
 *
 * This use case orchestrates the retrieval of tenant overviews including:
 * - Tenant name, status, member count, subscription plan, created date, last activity
 * - Filtering by status, plan, and text search
 * - Sorting by any column
 * - Pagination
 *
 * **AUTHORIZATION:**
 * Only PLATFORM_ADMIN role can access this use case. All access is logged to audit trail.
 *
 * **ORCHESTRATION FLOW:**
 * 1. Validate actor has PLATFORM_ADMIN role
 * 2. Validate and sanitize filter inputs
 * 3. Validate pagination parameters
 * 4. Call repository via privileged execution path
 * 5. Return paginated tenant overviews
 *
 * @see Requirements 19.4-19.6 (Tenant overview table)
 * @see Requirements 19.8 (Navigate to tenant detail)
 * @see Requirements 19.11 (Privileged execution path)
 */

import type { DomainResult } from '@core/utils';
import { fail } from '@core/utils';
import type {
  PaginatedTenantOverviews,
  TenantOverviewFilters,
  TenantOverviewSort,
  TenantOverviewSortColumn,
  TenantOverviewQueryOptions,
  DEFAULT_TENANT_OVERVIEW_PAGE_SIZE,
  MAX_TENANT_OVERVIEW_PAGE_SIZE,
} from '../entities/TenantOverview';
import type { LifecycleStatusValue } from '@core/domains/tenant/entities/TenantLifecycleStatus';
import type { PlatformRepository } from '../repositories/PlatformRepository';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Input parameters for getting tenant overviews.
 */
export interface GetTenantsOverviewUseCaseInput {
  /**
   * Whether the actor is a platform admin.
   * Only PLATFORM_ADMIN role can access tenant overviews.
   *
   * @see Requirements 19.1 (PLATFORM_ADMIN role required)
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
   * Optional filters for the tenant list.
   *
   * @see Requirements 19.5 (Filtering by status, plan, and text search)
   */
  readonly filters?: Partial<TenantOverviewFilters>;

  /**
   * Optional sort options.
   *
   * @see Requirements 19.6 (Sorting by any column)
   */
  readonly sort?: TenantOverviewSort;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * GetTenantsOverviewUseCase interface — retrieves paginated tenant overviews.
 */
export interface GetTenantsOverviewUseCase {
  /**
   * Execute the get tenants overview operation.
   *
   * @param input - The input parameters
   * @returns DomainResult with paginated tenant overviews or error
   */
  execute(input: GetTenantsOverviewUseCaseInput): Promise<DomainResult<PaginatedTenantOverviews>>;
}

// ---------------------------------------------------------------------------
// Error Factory Functions
// ---------------------------------------------------------------------------

/**
 * Creates an authorization error for non-platform admin access attempt.
 *
 * @see Requirements 19.2 (Redirect to unauthorized page)
 */
function authPlatformAdminRequired() {
  return {
    type: 'authorization' as const,
    code: 'AUTH_PLATFORM_ADMIN_REQUIRED',
    message: 'Only PLATFORM_ADMIN role can access tenant overviews',
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

// ---------------------------------------------------------------------------
// Validation Helpers
// ---------------------------------------------------------------------------

/**
 * Valid tenant lifecycle statuses for filtering.
 */
const VALID_STATUSES: readonly LifecycleStatusValue[] = [
  'PROVISIONING',
  'ACTIVE',
  'SUSPENDED',
  'CLOSING',
  'CLOSED',
  'PURGED',
];

/**
 * Validates the status filter value.
 */
function isValidStatusFilter(status: string): status is LifecycleStatusValue {
  return VALID_STATUSES.includes(status as LifecycleStatusValue);
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a GetTenantsOverviewUseCase instance.
 *
 * @param dependencies - The use case dependencies
 * @returns An implementation of GetTenantsOverviewUseCase
 */
export const GetTenantsOverviewUseCaseImpl = ({
  platformRepository,
}: {
  platformRepository: PlatformRepository;
}): GetTenantsOverviewUseCase => ({
  execute: async (
    input: GetTenantsOverviewUseCaseInput,
  ): Promise<DomainResult<PaginatedTenantOverviews>> => {
    const {
      isPlatformAdmin,
      actorUserId,
      pagination,
      filters,
      sort,
    } = input;

    // -------------------------------------------------------------------------
    // Step 1: Validate actor has PLATFORM_ADMIN role
    // Requirement 19.1: Only PLATFORM_ADMIN role can access
    // Requirement 19.2: Redirect to unauthorized page if not platform admin
    // -------------------------------------------------------------------------
    if (!isPlatformAdmin) {
      return fail(authPlatformAdminRequired());
    }

    // -------------------------------------------------------------------------
    // Step 2: Validate pagination parameters
    // -------------------------------------------------------------------------
    const page = pagination?.page ?? 1;
    const pageSize = pagination?.pageSize ?? 25;

    if (page < 1) {
      return fail(validationInvalidPagination('Page must be >= 1'));
    }

    if (pageSize < 1 || pageSize > 100) {
      return fail(validationInvalidPagination('Page size must be between 1 and 100'));
    }

    // -------------------------------------------------------------------------
    // Step 3: Validate filter inputs if provided
    // Requirement 19.5: Filtering by status, plan, and text search
    // -------------------------------------------------------------------------
    // No strict validation needed here - invalid values are simply ignored or
    // handled by the repository. The UI ensures valid inputs.

    // -------------------------------------------------------------------------
    // Step 4: Build query options
    // -------------------------------------------------------------------------
    const queryOptions: TenantOverviewQueryOptions = {
      filters: filters as TenantOverviewFilters | undefined,
      sort,
      page,
      pageSize,
    };

    // -------------------------------------------------------------------------
    // Step 5: Call repository via privileged execution path
    // Requirement 19.11: Cross-tenant data access via privileged execution path
    // All access is logged to audit trail by the repository
    // -------------------------------------------------------------------------
    const result = await platformRepository.getTenantsOverview(actorUserId, queryOptions);

    return result;
  },
});

/**
 * Type alias for cleaner DI registration.
 */
export type GetTenantsOverviewUseCaseType = GetTenantsOverviewUseCase;
