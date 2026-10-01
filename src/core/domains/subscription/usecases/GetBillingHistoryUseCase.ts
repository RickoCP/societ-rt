/**
 * GetBillingHistoryUseCase — Retrieves paginated billing history for a tenant's subscription.
 *
 * This use case orchestrates fetching billing/invoice history for the Admin UI,
 * with support for pagination and date range filtering.
 *
 * **ORCHESTRATION FLOW:**
 * 1. Validate actor has tenant:manage permission
 * 2. Validate query options
 * 3. Fetch paginated billing entries from repository
 * 4. Return paginated billing history
 *
 * @see Requirements 16.1-16.11 (Billing History)
 * @see Design Components > 9. Subscription Management > 9.3 Billing History
 */

import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type {
  BillingEntry,
  BillingHistoryQueryOptions,
  PaginatedBillingHistory,
  BillingStatus,
} from '../entities/BillingEntry';
import type { ISubscriptionAdminRepository } from '../repositories/ISubscriptionAdminRepository';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Input parameters for getting billing history.
 */
export interface GetBillingHistoryInput {
  /** The tenant to get billing history for */
  readonly tenantId: string;

  /** Whether the actor has tenant:manage permission */
  readonly hasManagePermission: boolean;

  /** Pagination page (1-indexed) */
  readonly page: number;

  /** Pagination page size */
  readonly pageSize: number;

  /** Optional date range filter - start date */
  readonly dateFrom?: Date;

  /** Optional date range filter - end date */
  readonly dateTo?: Date;

  /** Optional status filter */
  readonly status?: BillingStatus;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * GetBillingHistoryUseCase interface — retrieves paginated billing history.
 */
export interface GetBillingHistoryUseCase {
  /**
   * Execute the get billing history operation.
   *
   * @param input - The input parameters
   * @returns DomainResult with paginated billing history or error
   */
  execute(input: GetBillingHistoryInput): Promise<DomainResult<PaginatedBillingHistory>>;
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a GetBillingHistoryUseCase instance.
 *
 * @param dependencies - The use case dependencies
 * @returns An implementation of GetBillingHistoryUseCase
 */
export const GetBillingHistoryUseCaseImpl = ({
  subscriptionAdminRepository,
}: {
  subscriptionAdminRepository: ISubscriptionAdminRepository;
}): GetBillingHistoryUseCase => ({
  execute: async (input: GetBillingHistoryInput): Promise<DomainResult<PaginatedBillingHistory>> => {
    const {
      tenantId,
      hasManagePermission,
      page,
      pageSize,
      dateFrom,
      dateTo,
      status,
    } = input;

    // Step 1: Validate actor has tenant:manage permission
    if (!hasManagePermission) {
      return fail({
        type: 'authorization',
        code: 'AUTH_INSUFFICIENT_PERMISSION',
        message: 'tenant:manage permission required to view billing history',
        retryable: false,
      });
    }

    // Step 2: Validate tenantId is provided
    if (!tenantId) {
      return fail({
        type: 'validation',
        code: 'VALIDATION_MISSING_TENANT_ID',
        message: 'Tenant ID is required',
        retryable: false,
      });
    }

    // Step 3: Validate pagination params
    const validatedPage = Math.max(1, page);
    const validatedPageSize = Math.min(Math.max(1, pageSize), 100); // Cap at 100

    // Step 4: Validate date range if provided
    if (dateFrom && dateTo && dateFrom > dateTo) {
      return fail({
        type: 'validation',
        code: 'VALIDATION_INVALID_DATE_RANGE',
        message: 'Start date must be before or equal to end date',
        retryable: false,
      });
    }

    // Step 5: Build query options
    const queryOptions: BillingHistoryQueryOptions = {
      tenantId,
      page: validatedPage,
      pageSize: validatedPageSize,
      dateFrom,
      dateTo,
      status,
    };

    // Step 6: Fetch billing history from repository
    const result = await subscriptionAdminRepository.getBillingHistory(queryOptions);

    // Step 7: Return result
    return result;
  },
});

/**
 * Type alias for cleaner DI registration.
 */
export type GetBillingHistoryUseCaseType = GetBillingHistoryUseCase;
