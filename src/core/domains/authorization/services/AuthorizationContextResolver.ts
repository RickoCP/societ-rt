/**
 * AuthorizationContextResolver — Resolves complete authorization context from JWT claims.
 *
 * This service implements the Authorization Context Resolution process per Requirements 3:
 * - Extracts userId, activeTenantId, activeOrgUnitId, tokenVersion from JWT claims
 * - Validates tokenVersion exact match (JWT.tokenVersion === User.tokenVersion)
 * - Rejects quarantined users (INV-QUARANTINE-001)
 * - Resolves membership via MembershipResolutionService
 * - Resolves permissions via PermissionRegistry
 * - Returns typed errors per design (AUTH_TOKEN_INVALID, AUTH_TOKEN_VERSION_MISMATCH, etc.)
 *
 * **CRITICAL SECURITY RULES:**
 * - JWT carries identity/context ONLY, NOT authorization authority (INV-AUTH-001)
 * - Role and permissions are ALWAYS resolved server-side from Permission Registry
 * - membershipId is ALWAYS resolved server-side, NEVER from JWT
 * - tokenVersion MUST exactly match User.tokenVersion (Property 7)
 * - Fails closed on unknown/invalid states (INV-AUTH-002)
 *
 * **Resolution Flow:**
 * 1. Validate JWT claims structure
 * 2. Validate tokenVersion exact match
 * 3. Check if user is quarantined → reject
 * 4. Resolve membership via MembershipResolutionService
 * 5. Resolve permissions from PermissionRegistry based on role
 * 6. Build and return AuthorizationContext
 *
 * @see Requirements 3 (AC 1-7)
 * @see Design Authorization Context Resolution, Property 7
 * @see INV-AUTH-001, INV-AUTH-002, INV-QUARANTINE-001
 */

import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type {
  IMembershipResolutionService,
  MembershipResolutionResult,
} from '@core/domains/membership/services';
import type { MembershipResolutionKey } from '@core/domains/membership/types';
import { createResolutionKey, isAuthoritativeStatus } from '@core/domains/membership/types';
import { getPermissionsForRole } from '../permissions/PermissionRegistry';
import type {
  AuthorizationContext,
  AuthorizationContextInput,
  AuthorizationContextMetadata,
  AuthorizationContextResult,
  PartialJWTClaims,
} from '../types';
import {
  authTokenInvalid,
  authTokenVersionMismatch,
  authContextResolutionFailed,
} from '../errors';
import { authMembershipInactive } from '@core/domains/membership/errors';

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

/**
 * AuthorizationContextResolver interface.
 *
 * This service resolves complete authorization context from JWT claims.
 * It is the entry point for the authorization pipeline.
 */
export interface IAuthorizationContextResolver {
  /**
   * Resolve complete authorization context from JWT claims.
   *
   * This is the PRIMARY method for authorization context resolution.
   * Called by middleware/route handlers after JWT validation.
   *
   * @param input - JWT claims and current token version
   * @returns DomainResult with AuthorizationContextResult or typed error
   *
   * @throws Never throws — all errors returned as DomainResult
   */
  resolve(
    input: AuthorizationContextInput,
  ): Promise<DomainResult<AuthorizationContextResult>>;

  /**
   * Validate JWT claims structure.
   *
   * This is a fast-fail validation before resolution.
   * Checks that required fields exist and have valid types.
   *
   * @param claims - The JWT claims to validate
   * @returns DomainResult with validated claims or error
   */
  validateClaims(
    claims: unknown,
  ): DomainResult<PartialJWTClaims>;

  /**
   * Validate token version exact match.
   *
   * JWT.tokenVersion MUST exactly equal User.tokenVersion.
   * Any mismatch (less than, greater than, missing, or malformed) results in AUTH_TOKEN_VERSION_MISMATCH.
   *
   * @see Requirements 15.4, Design Property 7
   *
   * @param jwtTokenVersion - The tokenVersion from JWT claims
   * @param currentTokenVersion - The current tokenVersion from User record
   * @returns DomainResult with void on success, error on mismatch
   */
  validateTokenVersion(
    jwtTokenVersion: number,
    currentTokenVersion: number,
  ): DomainResult<void>;
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create an AuthorizationContextResolver instance.
 *
 * This pattern follows Clean Architecture DI principles — dependencies are
 * injected via the factory parameter, making the service testable and
 * decoupled from concrete implementations.
 *
 * @param membershipResolutionService - Service for membership resolution
 * @returns An implementation of IAuthorizationContextResolver
 *
 * @example
 * ```typescript
 * // DI Registration (in container setup)
 * container.register({
 *   authorizationContextResolver: asFunction(AuthorizationContextResolverImpl).singleton(),
 * });
 *
 * // Usage in middleware
 * const resolver = DI.resolve('authorizationContextResolver');
 * const result = await resolver.resolve({
 *   jwtClaims: extractedClaims,
 *   currentTokenVersion: user.tokenVersion,
 * });
 * ```
 */
export const AuthorizationContextResolverImpl = ({
  membershipResolutionService,
}: {
  membershipResolutionService: IMembershipResolutionService;
}): IAuthorizationContextResolver => {
  // -------------------------------------------------------------------------
  // Helper Functions
  // -------------------------------------------------------------------------

  /**
   * Check if a value is a non-empty string.
   */
  const isNonEmptyString = (value: unknown): value is string =>
    typeof value === 'string' && value.trim().length > 0;

  /**
   * Check if a value is a valid integer.
   */
  const isValidInteger = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value);

  /**
   * Extract and validate JWT claims structure.
   * 
   * Accepts either:
   * - Raw JWT claims with `sub` field (from JWT parser)
   * - PartialJWTClaims with `userId` field (already processed)
   */
  const extractClaims = (claims: unknown): DomainResult<PartialJWTClaims> => {
    if (!claims || typeof claims !== 'object') {
      return fail(authTokenInvalid('Claims object is missing or invalid'));
    }

    const claimsObj = claims as Record<string, unknown>;

    // Extract userId - support both 'sub' (raw JWT) and 'userId' (PartialJWTClaims)
    const userId = claimsObj.sub ?? claimsObj.userId;
    if (!isNonEmptyString(userId)) {
      return fail(authTokenInvalid('Missing or invalid user ID (sub claim)'));
    }

    // Extract activeTenantId
    const activeTenantId = claimsObj.activeTenantId;
    if (!isNonEmptyString(activeTenantId)) {
      return fail(authTokenInvalid('Missing or invalid active tenant ID'));
    }

    // Extract activeOrgUnitId (can be null)
    const activeOrgUnitId = claimsObj.activeOrgUnitId;
    if (activeOrgUnitId !== null && !isNonEmptyString(activeOrgUnitId)) {
      return fail(authTokenInvalid('Invalid active OrgUnit ID'));
    }

    // Extract tokenVersion
    const tokenVersion = claimsObj.tokenVersion;
    if (!isValidInteger(tokenVersion)) {
      return fail(authTokenInvalid('Missing or invalid token version'));
    }

    return ok({
      userId,
      activeTenantId,
      activeOrgUnitId: activeOrgUnitId as string | null,
      tokenVersion,
    });
  };

  /**
   * Build the authorization context from resolved membership.
   */
  const buildContext = (
    jwtClaims: PartialJWTClaims,
    resolutionResult: MembershipResolutionResult,
  ): AuthorizationContext => {
    const { membership, isAuthoritative, isTenantLevel } = resolutionResult;

    // Resolve permissions from Permission Registry based on role
    // This ensures INV-AUTH-001: permissions are NEVER from JWT
    const permissions = getPermissionsForRole(membership.role);

    return {
      userId: jwtClaims.userId,
      tenantId: jwtClaims.activeTenantId,
      membershipId: membership.id,
      orgUnitId: jwtClaims.activeOrgUnitId,
      role: membership.role,
      permissions,
      tokenVersion: jwtClaims.tokenVersion,
      isAuthoritative,
      isTenantLevel,
      membership,
    };
  };

  /**
   * Build the resolution metadata.
   */
  const buildMetadata = (
    resolutionResult: MembershipResolutionResult,
  ): AuthorizationContextMetadata => ({
    resolvedAt: new Date(),
    membershipCountInTenant: resolutionResult.membershipCountInTenant,
    isMultiMembership: resolutionResult.membershipCountInTenant > 1,
  });

  // -------------------------------------------------------------------------
  // Service Implementation
  // -------------------------------------------------------------------------

  return {
    /**
     * Resolve complete authorization context from JWT claims.
     *
     * Resolution flow:
     * 1. Validate JWT claims structure
     * 2. Validate tokenVersion exact match
     * 3. Resolve membership via MembershipResolutionService
     *    (includes quarantine check and multi-membership resolution)
     * 4. Check if membership is authoritative for normal operations
     * 5. Resolve permissions from PermissionRegistry
     * 6. Build and return AuthorizationContext
     */
    async resolve(
      input: AuthorizationContextInput,
    ): Promise<DomainResult<AuthorizationContextResult>> {
      try {
        const { jwtClaims, currentTokenVersion } = input;

        // Step 1: Validate JWT claims structure
        // (Already done by caller, but validate again for safety)
        const claimsValidation = this.validateClaims(jwtClaims);
        if (!claimsValidation.success) {
          return claimsValidation as DomainResult<AuthorizationContextResult>;
        }
        const validatedClaims = claimsValidation.data;

        // Step 2: Validate tokenVersion exact match
        // Per Property 7: JWT.tokenVersion MUST exactly equal User.tokenVersion
        const tokenVersionValidation = this.validateTokenVersion(
          validatedClaims.tokenVersion,
          currentTokenVersion,
        );
        if (!tokenVersionValidation.success) {
          return tokenVersionValidation as DomainResult<AuthorizationContextResult>;
        }

        // Step 3: Create resolution key and resolve membership
        // The MembershipResolutionService handles:
        // - Quarantine check (INV-QUARANTINE-001)
        // - Multi-membership resolution
        // - Invariant validation (INV-MEM-002, INV-MEM-003)
        const resolutionKey: MembershipResolutionKey = createResolutionKey({
          sub: validatedClaims.userId,
          activeTenantId: validatedClaims.activeTenantId,
          activeOrgUnitId: validatedClaims.activeOrgUnitId,
        });

        const resolutionResult = await membershipResolutionService.resolve(resolutionKey);
        if (!resolutionResult.success) {
          return resolutionResult as DomainResult<AuthorizationContextResult>;
        }

        // Step 4: Check if membership is authoritative
        // Note: We still return the context even for non-authoritative memberships
        // The authorization layer (FASE 1.7+) decides eligibility based on status + operation
        // However, for normal operations, we reject non-authoritative memberships here
        // Emergency operations have their own bypass logic in the authorization pipeline
        const membershipResult = resolutionResult.data;
        
        // For the context resolver, we only block REVOKED and INVITED statuses
        // SUSPENDED memberships are allowed through (for emergency access check later)
        if (!membershipResult.isAuthoritative) {
          // Check if it's a terminal non-authoritative status (REVOKED or INVITED)
          const status = membershipResult.membership.status;
          if (!isAuthoritativeStatus(status)) {
            return fail(authMembershipInactive());
          }
        }

        // Step 5: Build authorization context
        // Permissions are resolved from PermissionRegistry (INV-AUTH-001)
        const context = buildContext(validatedClaims, membershipResult);

        // Step 6: Build metadata
        const metadata = buildMetadata(membershipResult);

        return ok({ context, metadata });
      } catch (error) {
        // Fail closed (INV-AUTH-002)
        return fail(authContextResolutionFailed(error));
      }
    },

    /**
     * Validate JWT claims structure.
     */
    validateClaims(claims: unknown): DomainResult<PartialJWTClaims> {
      return extractClaims(claims);
    },

    /**
     * Validate token version exact match.
     *
     * Per Property 7 (Token Version Exact Match):
     * - JWT.tokenVersion === User.tokenVersion → CONTINUE
     * - JWT.tokenVersion !== User.tokenVersion → AUTH_TOKEN_VERSION_MISMATCH
     *
     * Rejection conditions:
     * - JWT.tokenVersion < User.tokenVersion → Rejected (stale token)
     * - JWT.tokenVersion > User.tokenVersion → Rejected (invalid/tampered)
     * - JWT.tokenVersion missing → Rejected (handled in validateClaims)
     * - JWT.tokenVersion non-integer → Rejected (handled in validateClaims)
     */
    validateTokenVersion(
      jwtTokenVersion: number,
      currentTokenVersion: number,
    ): DomainResult<void> {
      // Exact match required
      if (jwtTokenVersion !== currentTokenVersion) {
        return fail(authTokenVersionMismatch());
      }
      return ok(undefined);
    },
  };
};

/**
 * Type alias for the factory function for cleaner DI registration.
 */
export type AuthorizationContextResolver = IAuthorizationContextResolver;
