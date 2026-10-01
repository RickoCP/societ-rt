/**
 * ImpersonateTenantUseCase — Switches Platform Admin context to selected tenant for support.
 *
 * This use case handles the tenant impersonation flow for platform administrators:
 * 1. Validates that the actor is a PLATFORM_ADMIN
 * 2. Validates the target tenant exists and is impersonatable
 * 3. Creates an impersonation session in the backend
 * 4. Issues a new access token scoped to the impersonated tenant
 * 5. Logs the impersonation start to audit trail
 * 6. Returns impersonation result with token and session details
 *
 * **AUTHORIZATION:**
 * Only PLATFORM_ADMIN role can impersonate tenants.
 * All impersonation actions are logged with the impersonator's ID.
 *
 * **SESSION CONSTRAINTS:**
 * - Impersonation auto-expires after 30 minutes (configurable)
 * - Only one active impersonation session per admin at a time
 * - All actions during impersonation are tagged with impersonation flag
 *
 * @see Requirements 20.3 (Switch context to selected tenant with banner)
 * @see Requirements 20.4 (Display tenant dashboard, Exit button, log actions)
 * @see Requirements 20.5 (Exit impersonation restores context)
 * @see Requirements 20.9 (All operations logged to audit trail)
 */

import type { DomainResult } from '@core/utils';
import { fail } from '@core/utils';
import type { PlatformRepository, ImpersonationResult } from '../repositories/PlatformRepository';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default impersonation duration in minutes.
 * @see Task requirement: Auto-expire after 30 minutes
 */
const DEFAULT_IMPERSONATION_DURATION_MINUTES = 30;

/**
 * Maximum allowed impersonation duration in minutes.
 */
const MAX_IMPERSONATION_DURATION_MINUTES = 60;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Input parameters for tenant impersonation.
 */
export interface ImpersonateTenantUseCaseInput {
  /**
   * Whether the actor is a platform admin.
   * Only PLATFORM_ADMIN role can impersonate tenants.
   *
   * @see Requirements 20.2 (Administrative actions require PLATFORM_ADMIN)
   */
  readonly isPlatformAdmin: boolean;

  /**
   * Actor's user ID (Platform Admin performing impersonation).
   * Required for audit logging.
   */
  readonly actorUserId: string;

  /**
   * Actor's email for display in audit logs.
   */
  readonly actorEmail?: string;

  /**
   * Target tenant ID to impersonate.
   *
   * @see Requirements 20.3 (Switch context to selected tenant)
   */
  readonly tenantId: string;

  /**
   * Optional impersonation duration in minutes.
   * Default: 30 minutes.
   * Maximum: 60 minutes.
   *
   * @see Task requirement: Auto-expire after 30 minutes
   */
  readonly durationMinutes?: number;

  /**
   * IP address of the request (for audit).
   */
  readonly ipAddress?: string;

  /**
   * User agent of the request (for audit).
   */
  readonly userAgent?: string;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * ImpersonateTenantUseCase interface — starts tenant impersonation.
 */
export interface ImpersonateTenantUseCase {
  /**
   * Execute the tenant impersonation operation.
   *
   * @param input - The input parameters
   * @returns DomainResult with ImpersonationResult or error
   *
   * @see Requirements 20.3-20.5 (Impersonation flow)
   */
  execute(input: ImpersonateTenantUseCaseInput): Promise<DomainResult<ImpersonationResult>>;
}

// ---------------------------------------------------------------------------
// Error Factory Functions
// ---------------------------------------------------------------------------

/**
 * Creates an authorization error for non-platform admin access attempt.
 *
 * @see Requirements 20.2 (PLATFORM_ADMIN role required)
 */
function authPlatformAdminRequired() {
  return {
    type: 'authorization' as const,
    code: 'AUTH_PLATFORM_ADMIN_REQUIRED',
    message: 'Only PLATFORM_ADMIN role can impersonate tenants',
    userMessage: 'platform.unauthorized',
    retryable: false,
  };
}

/**
 * Creates a validation error for invalid impersonation duration.
 */
function invalidDurationError(maxMinutes: number) {
  return {
    type: 'validation' as const,
    code: 'IMPERSONATION_INVALID_DURATION',
    message: `Impersonation duration must be between 1 and ${maxMinutes} minutes`,
    userMessage: 'impersonation.invalid_duration',
    retryable: false,
  };
}

/**
 * Creates a validation error for missing tenant ID.
 */
function missingTenantIdError() {
  return {
    type: 'validation' as const,
    code: 'IMPERSONATION_MISSING_TENANT_ID',
    message: 'Target tenant ID is required for impersonation',
    userMessage: 'impersonation.missing_tenant',
    retryable: false,
  };
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create an ImpersonateTenantUseCase instance.
 *
 * @param dependencies - The use case dependencies
 * @returns An implementation of ImpersonateTenantUseCase
 */
export const ImpersonateTenantUseCaseImpl = ({
  platformRepository,
}: {
  platformRepository: PlatformRepository;
}): ImpersonateTenantUseCase => ({
  execute: async (
    input: ImpersonateTenantUseCaseInput,
  ): Promise<DomainResult<ImpersonationResult>> => {
    const {
      isPlatformAdmin,
      actorUserId,
      actorEmail,
      tenantId,
      durationMinutes = DEFAULT_IMPERSONATION_DURATION_MINUTES,
      ipAddress,
      userAgent,
    } = input;

    // -------------------------------------------------------------------------
    // Step 1: Validate actor has PLATFORM_ADMIN role
    // Requirement 20.2: Administrative actions require PLATFORM_ADMIN role
    // -------------------------------------------------------------------------
    if (!isPlatformAdmin) {
      return fail(authPlatformAdminRequired());
    }

    // -------------------------------------------------------------------------
    // Step 2: Validate input parameters
    // -------------------------------------------------------------------------
    if (!tenantId?.trim()) {
      return fail(missingTenantIdError());
    }

    if (durationMinutes < 1 || durationMinutes > MAX_IMPERSONATION_DURATION_MINUTES) {
      return fail(invalidDurationError(MAX_IMPERSONATION_DURATION_MINUTES));
    }

    // -------------------------------------------------------------------------
    // Step 3: Call repository to start impersonation session
    // Repository handles:
    // - Validating tenant exists and is impersonatable
    // - Creating impersonation session in backend
    // - Issuing new access token scoped to tenant
    // - Logging impersonation start to audit trail
    //
    // @see Requirements 20.3 (Switch context to selected tenant with banner)
    // @see Requirements 20.9 (All operations logged to audit trail)
    // -------------------------------------------------------------------------
    const result = await platformRepository.startTenantImpersonation({
      actorUserId,
      actorEmail,
      tenantId,
      durationMinutes,
      ipAddress,
      userAgent,
    });

    return result;
  },
});

/**
 * Type alias for cleaner DI registration.
 */
export type ImpersonateTenantUseCaseType = ImpersonateTenantUseCase;
