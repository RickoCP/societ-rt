/**
 * ListMembersUseCase — Retrieves paginated members for Admin UI with scope-based filtering.
 *
 * This use case orchestrates the retrieval of members for the MemberList screen,
 * applying authorization scope filtering based on the actor's role:
 * - Tenant-level admins (PLATFORM_ADMIN, TENANT_OWNER): see all members in tenant
 * - Org-scoped admins (ORG_ADMIN, RT_ADMIN): see members in their OrgUnit and descendants
 *
 * **ORCHESTRATION FLOW:**
 * 1. Validate actor has membership:read permission
 * 2. Determine actor's authorization scope
 * 3. Call repository with scope-filtered query options
 * 4. Return paginated members
 *
 * @see Requirements 2.3-2.8 (Member List Screen)
 * @see Design Components and Interfaces > 2. Membership Management
 */

import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { PaginatedMembers } from '../entities/Member';
import type { MemberListQueryOptions } from '../entities/MemberFilters';
import type { MembershipAdminRepository } from '../repositories/MembershipAdminRepository';
import { authInsufficientPermission, authNoMembership } from '../errors';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * Input parameters for listing members.
 */
export interface ListMembersInput {
  /**
   * The tenant to list members for.
   */
  readonly tenantId: string;

  /**
   * The actor's OrgUnit scope (null for tenant-level admins).
   * This is the actor's orgUnitId from their membership, NOT a filter parameter.
   */
  readonly actorOrgUnitId: string | null;

  /**
   * Whether the actor has membership:read permission.
   * Should be validated from the authorization context before calling.
   */
  readonly hasReadPermission: boolean;

  /**
   * Query options (filters, pagination, sorting).
   */
  readonly options: MemberListQueryOptions;
}

/**
 * ListMembersUseCase interface — retrieves paginated members with scope filtering.
 */
export interface ListMembersUseCase {
  /**
   * Execute the list members operation.
   *
   * @param input - The input parameters
   * @returns DomainResult with paginated members or error
   */
  execute(input: ListMembersInput): Promise<DomainResult<PaginatedMembers>>;
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a ListMembersUseCase instance.
 *
 * @param dependencies - The use case dependencies
 * @returns An implementation of ListMembersUseCase
 */
export const ListMembersUseCaseImpl = ({
  membershipAdminRepository,
}: {
  membershipAdminRepository: MembershipAdminRepository;
}): ListMembersUseCase => ({
  execute: async (input: ListMembersInput): Promise<DomainResult<PaginatedMembers>> => {
    const { tenantId, actorOrgUnitId, hasReadPermission, options } = input;

    // Step 1: Validate actor has membership:read permission
    if (!hasReadPermission) {
      return fail(authInsufficientPermission(['membership:read']));
    }

    // Step 2: Validate tenantId is provided
    if (!tenantId) {
      return fail(authNoMembership());
    }

    // Step 3: Call repository with scope-filtered query
    // The repository handles scope-based filtering internally based on actorOrgUnitId:
    // - null actorOrgUnitId = tenant-level admin → sees all members
    // - non-null actorOrgUnitId = org-scoped admin → sees members in their scope
    const result = await membershipAdminRepository.listMembers(
      tenantId,
      actorOrgUnitId,
      options,
    );

    // Step 4: Return result directly (repository returns DomainResult)
    return result;
  },
});

/**
 * Type alias for cleaner DI registration.
 */
export type ListMembersUseCaseType = ListMembersUseCase;
