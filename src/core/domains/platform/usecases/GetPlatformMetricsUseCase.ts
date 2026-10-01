/**
 * GetPlatformMetricsUseCase — Retrieves platform-wide metrics for Platform Admin Dashboard.
 *
 * This use case orchestrates the retrieval of system-wide metrics including:
 * - Tenant counts by status (Active, Suspended, Closed)
 * - Total member count across all tenants
 * - Active sessions count
 * - System health indicators (API response time, database latency, error rate)
 *
 * **AUTHORIZATION:**
 * Only PLATFORM_ADMIN role can access this use case. All access is logged to audit trail.
 *
 * **ORCHESTRATION FLOW:**
 * 1. Validate actor has PLATFORM_ADMIN role
 * 2. Call repository via privileged execution path
 * 3. Return platform metrics
 *
 * @see Requirements 19.1-19.3 (Platform Admin Dashboard)
 * @see Requirements 19.10 (Auto-refresh every 60 seconds)
 * @see Requirements 19.11 (Privileged execution path)
 */

import type { DomainResult } from '@core/utils';
import { fail } from '@core/utils';
import type { PlatformMetrics, GetPlatformMetricsOptions } from '../entities/PlatformMetrics';
import type { PlatformRepository } from '../repositories/PlatformRepository';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Input parameters for getting platform metrics.
 */
export interface GetPlatformMetricsUseCaseInput {
  /**
   * Whether the actor is a platform admin.
   * Only PLATFORM_ADMIN role can access platform metrics.
   *
   * @see Requirements 19.1 (PLATFORM_ADMIN role required)
   */
  readonly isPlatformAdmin: boolean;

  /**
   * Actor's user ID for audit logging.
   */
  readonly actorUserId: string;

  /**
   * Whether to include system health metrics.
   * Default: true
   *
   * @see Requirements 19.3 (System health indicators)
   */
  readonly includeHealthMetrics?: boolean;

  /**
   * Whether to force refresh (bypass cache).
   * Useful for manual refresh.
   *
   * @see Requirements 19.10 (Manual refresh with visual indicator)
   */
  readonly forceRefresh?: boolean;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * GetPlatformMetricsUseCase interface — retrieves platform-wide metrics.
 */
export interface GetPlatformMetricsUseCase {
  /**
   * Execute the get platform metrics operation.
   *
   * @param input - The input parameters
   * @returns DomainResult with platform metrics or error
   */
  execute(input: GetPlatformMetricsUseCaseInput): Promise<DomainResult<PlatformMetrics>>;
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
    message: 'Only PLATFORM_ADMIN role can access platform metrics',
    userMessage: 'platform.unauthorized',
    retryable: false,
  };
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a GetPlatformMetricsUseCase instance.
 *
 * @param dependencies - The use case dependencies
 * @returns An implementation of GetPlatformMetricsUseCase
 */
export const GetPlatformMetricsUseCaseImpl = ({
  platformRepository,
}: {
  platformRepository: PlatformRepository;
}): GetPlatformMetricsUseCase => ({
  execute: async (
    input: GetPlatformMetricsUseCaseInput,
  ): Promise<DomainResult<PlatformMetrics>> => {
    const {
      isPlatformAdmin,
      actorUserId,
      includeHealthMetrics = true,
      forceRefresh = false,
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
    // Step 2: Build repository options
    // -------------------------------------------------------------------------
    const options: GetPlatformMetricsOptions = {
      includeHealthMetrics,
      forceRefresh,
    };

    // -------------------------------------------------------------------------
    // Step 3: Call repository via privileged execution path
    // Requirement 19.11: Cross-tenant data access via privileged execution path
    // All access is logged to audit trail by the repository
    // -------------------------------------------------------------------------
    const result = await platformRepository.getPlatformMetrics(actorUserId, options);

    return result;
  },
});

/**
 * Type alias for cleaner DI registration.
 */
export type GetPlatformMetricsUseCaseType = GetPlatformMetricsUseCase;
