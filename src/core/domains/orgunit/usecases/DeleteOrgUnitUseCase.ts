/**
 * DeleteOrgUnitUseCase — Deletes an OrgUnit from the tenant hierarchy.
 *
 * This use case orchestrates the deletion of an OrgUnit, validating:
 * 1. Actor has orgunit:write permission
 * 2. OrgUnit exists and belongs to the specified tenant
 * 3. OrgUnit has no children (deletion blocked if has children)
 * 4. OrgUnit has no members (deletion blocked if has members)
 *
 * **BLOCKING RULES (Requirements 8.9):**
 * - Cannot delete OrgUnit with children → error i18n key `orgunit.delete_has_children`
 * - Cannot delete OrgUnit with members → error i18n key `orgunit.delete_has_members`
 *
 * @see Requirements 8.9, 8.10 (Delete OrgUnit)
 * @see Design Property 16: OrgUnit delete prevention
 */

import type { DomainResult } from '@core/utils';
import { fail, authorizationError, validationError } from '@core/utils';
import type { OrgUnitRepository } from '../repositories/OrgUnitRepository';
import { orgUnitNotFound, orgUnitHasChildren, orgUnitHasMembers } from '../errors';

// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------

const DELETE_ORGUNIT_ERROR_CODES = {
  INSUFFICIENT_PERMISSION: 'ORGUNIT_INSUFFICIENT_PERMISSION',
  NO_TENANT_CONTEXT: 'ORGUNIT_NO_TENANT_CONTEXT',
  ORGUNIT_ID_REQUIRED: 'ORGUNIT_ID_REQUIRED',
  CANNOT_DELETE_ROOT: 'ORGUNIT_CANNOT_DELETE_ROOT',
} as const;

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * Input parameters for deleting an OrgUnit via the use case.
 */
export interface DeleteOrgUnitUseCaseInput {
  /**
   * The tenant the OrgUnit belongs to.
   */
  readonly tenantId: string;

  /**
   * The OrgUnit ID to delete.
   */
  readonly orgUnitId: string;

  /**
   * Whether the actor has orgunit:write permission.
   * Should be validated from the authorization context before calling.
   */
  readonly hasWritePermission: boolean;
}

/**
 * DeleteOrgUnitUseCase interface — deletes an OrgUnit with children/members blocking.
 */
export interface DeleteOrgUnitUseCase {
  /**
   * Execute the delete OrgUnit operation.
   *
   * @param input - The input parameters
   * @returns DomainResult with void on success or error
   */
  execute(input: DeleteOrgUnitUseCaseInput): Promise<DomainResult<void>>;
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a DeleteOrgUnitUseCase instance.
 *
 * @param dependencies - The use case dependencies
 * @returns An implementation of DeleteOrgUnitUseCase
 */
export const DeleteOrgUnitUseCaseImpl = ({
  orgUnitAdminRepository,
}: {
  orgUnitAdminRepository: OrgUnitRepository;
}): DeleteOrgUnitUseCase => ({
  execute: async (input: DeleteOrgUnitUseCaseInput): Promise<DomainResult<void>> => {
    const { tenantId, orgUnitId, hasWritePermission } = input;

    // Step 1: Validate actor has orgunit:write permission
    if (!hasWritePermission) {
      return fail(
        authorizationError(
          DELETE_ORGUNIT_ERROR_CODES.INSUFFICIENT_PERMISSION,
          'User does not have orgunit:write permission',
          { userMessage: 'You do not have permission to delete organization units' },
        ),
      );
    }

    // Step 2: Validate tenant context
    if (!tenantId) {
      return fail(
        authorizationError(
          DELETE_ORGUNIT_ERROR_CODES.NO_TENANT_CONTEXT,
          'Tenant context is required to delete OrgUnit',
          { userMessage: 'A tenant context is required to delete organization units' },
        ),
      );
    }

    // Step 3: Validate orgUnitId is provided
    if (!orgUnitId) {
      return fail(
        validationError(
          DELETE_ORGUNIT_ERROR_CODES.ORGUNIT_ID_REQUIRED,
          'OrgUnit ID is required',
          { userMessage: 'An organization unit ID must be specified' },
        ),
      );
    }

    // Step 4: Verify OrgUnit exists and belongs to tenant
    const existingResult = await orgUnitAdminRepository.getById(orgUnitId, tenantId);
    if (existingResult.success === false) {
      return fail(orgUnitNotFound(orgUnitId));
    }

    // Step 5: Check if OrgUnit is a root OrgUnit (cannot delete root)
    const isRootOrgUnit = await orgUnitAdminRepository.isRoot(orgUnitId, tenantId);
    if (isRootOrgUnit) {
      return fail(
        authorizationError(
          DELETE_ORGUNIT_ERROR_CODES.CANNOT_DELETE_ROOT,
          `Cannot delete root OrgUnit ${orgUnitId}`,
          { userMessage: 'Root organization units cannot be deleted' },
        ),
      );
    }

    // Step 6: Check if OrgUnit has children (block delete if has children)
    const hasChildren = await orgUnitAdminRepository.hasChildren(orgUnitId, tenantId);
    if (hasChildren) {
      return fail(orgUnitHasChildren(orgUnitId));
    }

    // Step 7: Check if OrgUnit has members (block delete if has members)
    const hasMembers = await orgUnitAdminRepository.hasMembers(orgUnitId, tenantId);
    if (hasMembers) {
      return fail(orgUnitHasMembers(orgUnitId));
    }

    // Step 8: Delete via repository
    const deleteResult = await orgUnitAdminRepository.delete(orgUnitId, tenantId);

    // Step 9: Return result directly
    return deleteResult;
  },
});

/**
 * Type alias for cleaner DI registration.
 */
export type DeleteOrgUnitUseCaseType = DeleteOrgUnitUseCase;
