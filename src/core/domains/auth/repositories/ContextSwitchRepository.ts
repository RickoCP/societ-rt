/**
 * ContextSwitchRepository — Core repository interface for tenant context switching.
 *
 * Provides operations for switching the user's active tenant/OrgUnit context.
 * Called by SwitchContextUseCase to issue new tokens for the target context.
 *
 * @see Requirements 1.5-1.7
 */

import type { DomainResult } from '@core/utils';
import type { MembershipRole, MembershipStatus } from '@core/domains/membership';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Summary of a user membership for context switching.
 */
export interface MembershipSummary {
  readonly membershipId: string;
  readonly tenantId: string;
  readonly tenantName: string;
  readonly tenantLogoUrl: string | null;
  readonly orgUnitId: string | null;
  readonly orgUnitName: string | null;
  readonly role: MembershipRole;
  readonly status: MembershipStatus;
}

/**
 * @deprecated Use MembershipSummary instead
 */
export type MembershipSummaryDTO = MembershipSummary;

/**
 * Context information returned after a successful switch.
 */
export interface ContextInfo {
  readonly tenantId: string;
  readonly tenantName: string;
  readonly orgUnitId: string | null;
  readonly orgUnitName: string | null;
  readonly role: MembershipRole;
}

/**
 * Result of a successful context switch.
 */
export interface ContextSwitchOutput {
  readonly accessToken: string;
  readonly expiresAt: Date;
  readonly context: ContextInfo;
}

/**
 * @deprecated Use ContextSwitchOutput instead
 */
export type ContextSwitchResult = ContextSwitchOutput;

/**
 * Input for context switch request.
 */
export interface ContextSwitchInput {
  readonly userId: string;
  readonly targetTenantId: string;
  readonly targetOrgUnitId: string | null;
}

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface ContextSwitchRepository {
  /**
   * Get all memberships for a user (for populating the switcher dropdown).
   * Returns only ACTIVE memberships by default.
   *
   * @param userId - The user's ID
   * @returns DomainResult with array of membership summaries
   */
  getMemberships(userId: string): Promise<DomainResult<MembershipSummary[]>>;

  /**
   * Switch the user's context to a different tenant/OrgUnit.
   * Validates the user has an ACTIVE membership in the target context,
   * then issues a new access token scoped to that context.
   *
   * @param input - Context switch parameters
   * @returns DomainResult with new tokens and context info
   */
  switchContext(input: ContextSwitchInput): Promise<DomainResult<ContextSwitchOutput>>;

  /**
   * Validate that a user has an active membership in the target context.
   *
   * @param userId - The user's ID
   * @param tenantId - Target tenant ID
   * @param orgUnitId - Target OrgUnit ID (null for tenant-level)
   * @returns DomainResult with the membership if valid
   */
  validateMembership(
    userId: string,
    tenantId: string,
    orgUnitId: string | null,
  ): Promise<DomainResult<MembershipSummary>>;
}
