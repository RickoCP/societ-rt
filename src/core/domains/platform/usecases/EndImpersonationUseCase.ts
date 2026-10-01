/**
 * EndImpersonationUseCase — Ends active tenant impersonation and restores Platform Admin context.
 *
 * This use case handles ending an impersonation session:
 * 1. Validates that the actor is a PLATFORM_ADMIN
 * 2. Validates an active impersonation session exists
 * 3. Ends the impersonation session in the backend
 * 4. Logs the impersonation end to audit trail
 * 5. Returns success for UI to restore original context
 *
 * **AUTHORIZATION:**
 * Only PLATFORM_ADMIN role can end impersonation.
 * The actor must be the original impersonator or another PLATFORM_ADMIN.
 *
 * **CONTEXT RESTORATION:**
 * After ending impersonation, the UI should:
 * - Clear impersonation state from stores
 * - Remove the impersonation banner
 * - Restore the original PLATFORM_ADMIN context
 * - Redirect to platform admin dashboard
 *
 * @see Requirements 20.5 (Exit impersonation restores PLATFORM_ADMIN context, logs end)
 * @see Requirements 20.9 (All operations logged to audit trail)
 */

import type { DomainResult } from '@core/utils';
import { fail } from '@core/utils';
import type { PlatformRepository } from '../repositories/PlatformRepository';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Input parameters for ending tenant impersonation.
 */
export interface EndImpersonationUseCaseInput {
  /**
   * Whether the actor is a platform admin.
   * Only PLATFORM_ADMIN role can end impersonation.
   */
  readonly isPlatformAdmin: boolean;

  /**
   * Actor's user ID (Platform Admin ending impersonation).
   * This should be the original impersonator's ID.
   */
  readonly actorUserId: string;

  /**
   * Impersonation session ID to end.
   * Required to identify the session.
   */
  readonly impersonationSessionId: string;

  /**
   * IP address of the request (for audit).
   */
  readonly ipAddress?: string;

  /**
   * User agent of the request (for audit).
   */
  readonly userAgent?: string;
}

/**
 * Result of ending impersonation.
 */
export interface EndImpersonationResult {
  /**
   * Whether the session was successfully ended.
   */
  readonly success: boolean;

  /**
   * ID of the ended session.
   */
  readonly sessionId: string;

  /**
   * Timestamp when the session ended.
   */
  readonly endedAt: Date;

  /**
   * ID of the tenant that was impersonated.
   */
  readonly impersonatedTenantId: string;

  /**
   * Name of the tenant that was impersonated.
   */
  readonly impersonatedTenantName: string;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * EndImpersonationUseCase interface — ends tenant impersonation.
 */
export interface EndImpersonationUseCase {
  /**
   * Execute the end impersonation operation.
   *
   * @param input - The input parameters
   * @returns DomainResult with EndImpersonationResult or error
   *
   * @see Requirements 20.5 (Exit impersonation)
   */
  execute(input: EndImpersonationUseCaseInput): Promise<DomainResult<EndImpersonationResult>>;
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
    message: 'Only PLATFORM_ADMIN role can end impersonation',
    userMessage: 'platform.unauthorized',
    retryable: false,
  };
}

/**
 * Creates a validation error for missing session ID.
 */
function missingSessionIdError() {
  return {
    type: 'validation' as const,
    code: 'IMPERSONATION_MISSING_SESSION_ID',
    message: 'Impersonation session ID is required',
    userMessage: 'impersonation.missing_session',
    retryable: false,
  };
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create an EndImpersonationUseCase instance.
 *
 * @param dependencies - The use case dependencies
 * @returns An implementation of EndImpersonationUseCase
 */
export const EndImpersonationUseCaseImpl = ({
  platformRepository,
}: {
  platformRepository: PlatformRepository;
}): EndImpersonationUseCase => ({
  execute: async (
    input: EndImpersonationUseCaseInput,
  ): Promise<DomainResult<EndImpersonationResult>> => {
    const {
      isPlatformAdmin,
      actorUserId,
      impersonationSessionId,
      ipAddress,
      userAgent,
    } = input;

    // -------------------------------------------------------------------------
    // Step 1: Validate actor has PLATFORM_ADMIN role
    // -------------------------------------------------------------------------
    if (!isPlatformAdmin) {
      return fail(authPlatformAdminRequired());
    }

    // -------------------------------------------------------------------------
    // Step 2: Validate input parameters
    // -------------------------------------------------------------------------
    if (!impersonationSessionId?.trim()) {
      return fail(missingSessionIdError());
    }

    // -------------------------------------------------------------------------
    // Step 3: Call repository to end impersonation session
    // Repository handles:
    // - Validating session exists and belongs to actor
    // - Ending the session in backend
    // - Logging impersonation end to audit trail
    //
    // @see Requirements 20.5 (Exit impersonation restores context)
    // @see Requirements 20.9 (All operations logged to audit trail)
    // -------------------------------------------------------------------------
    const result = await platformRepository.endTenantImpersonation({
      actorUserId,
      impersonationSessionId,
      ipAddress,
      userAgent,
    });

    return result;
  },
});

/**
 * Type alias for cleaner DI registration.
 */
export type EndImpersonationUseCaseType = EndImpersonationUseCase;
