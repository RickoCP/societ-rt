/**
 * GetOrgUnitTreeUseCase — Retrieves hierarchical OrgUnit tree for Admin UI with scope-based filtering.
 *
 * This use case orchestrates the retrieval of OrgUnit hierarchy tree for the OrgUnit Tree screen,
 * applying authorization scope filtering based on the actor's role:
 * - Tenant-level admins (PLATFORM_ADMIN, TENANT_OWNER): see full tenant hierarchy
 * - Org-scoped admins (ORG_ADMIN, RT_ADMIN): see their OrgUnit and descendants only
 *
 * **ORCHESTRATION FLOW:**
 * 1. Validate actor has orgunit:read permission
 * 2. Get actor's authorization scope (actorOrgUnitId)
 * 3. Call repository to fetch hierarchy tree filtered by scope
 * 4. Return DomainResult with OrgUnitNode[] tree
 *
 * @see Requirements 7.4-7.6 (OrgUnit Hierarchy Tree View)
 * @see Design Components and Interfaces > 6. OrgUnit Hierarchy Tree
 */

import type { DomainResult } from '@core/utils';
import { ok, fail, authorizationError } from '@core/utils';
import type { OrgUnitNode } from '../entities/OrgUnitNode';
import type { OrgUnitRepository, TreeQueryOptions } from '../repositories/OrgUnitRepository';

// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------

const ORGUNIT_ERROR_CODES = {
  INSUFFICIENT_PERMISSION: 'ORGUNIT_INSUFFICIENT_PERMISSION',
  NO_TENANT_CONTEXT: 'ORGUNIT_NO_TENANT_CONTEXT',
} as const;

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * Input parameters for getting OrgUnit tree.
 */
export interface GetOrgUnitTreeInput {
  /**
   * The tenant to fetch hierarchy for.
   */
  readonly tenantId: string;

  /**
   * The actor's OrgUnit scope (null for tenant-level admins).
   * This determines the root of the visible hierarchy:
   * - null = see full tenant hierarchy (tenant-level admin)
   * - non-null = see only this OrgUnit and its descendants (org-scoped admin)
   */
  readonly actorOrgUnitId: string | null;

  /**
   * Whether the actor has orgunit:read permission.
   * Should be validated from the authorization context before calling.
   */
  readonly hasReadPermission: boolean;

  /**
   * Optional tree query options for lazy loading and performance.
   */
  readonly options?: TreeQueryOptions;
}

/**
 * GetOrgUnitTreeUseCase interface — retrieves hierarchical OrgUnit tree with scope filtering.
 */
export interface GetOrgUnitTreeUseCase {
  /**
   * Execute the get OrgUnit tree operation.
   *
   * @param input - The input parameters
   * @returns DomainResult with hierarchical OrgUnitNode array or error
   */
  execute(input: GetOrgUnitTreeInput): Promise<DomainResult<OrgUnitNode[]>>;
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a GetOrgUnitTreeUseCase instance.
 *
 * @param dependencies - The use case dependencies
 * @returns An implementation of GetOrgUnitTreeUseCase
 */
export const GetOrgUnitTreeUseCaseImpl = ({
  orgUnitAdminRepository,
}: {
  orgUnitAdminRepository: OrgUnitRepository;
}): GetOrgUnitTreeUseCase => ({
  execute: async (input: GetOrgUnitTreeInput): Promise<DomainResult<OrgUnitNode[]>> => {
    const { tenantId, actorOrgUnitId, hasReadPermission, options } = input;

    // Step 1: Validate actor has orgunit:read permission
    if (!hasReadPermission) {
      return fail(
        authorizationError(
          ORGUNIT_ERROR_CODES.INSUFFICIENT_PERMISSION,
          'User does not have orgunit:read permission',
        ),
      );
    }

    // Step 2: Validate tenantId is provided
    if (!tenantId) {
      return fail(
        authorizationError(
          ORGUNIT_ERROR_CODES.NO_TENANT_CONTEXT,
          'Tenant context is required to fetch OrgUnit hierarchy',
        ),
      );
    }

    // Step 3: Call repository with scope-filtered query
    // The repository handles scope-based filtering internally based on actorOrgUnitId:
    // - null actorOrgUnitId = tenant-level admin → sees full tenant hierarchy
    // - non-null actorOrgUnitId = org-scoped admin → sees their OrgUnit and descendants
    const result = await orgUnitAdminRepository.getHierarchyTree(
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
export type GetOrgUnitTreeUseCaseType = GetOrgUnitTreeUseCase;
