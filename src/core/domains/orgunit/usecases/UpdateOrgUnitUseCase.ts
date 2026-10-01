/**
 * UpdateOrgUnitUseCase — Updates an OrgUnit's metadata (name only).
 *
 * This use case orchestrates the update of an OrgUnit, validating:
 * 1. Actor has orgunit:write permission
 * 2. OrgUnit exists and belongs to the specified tenant
 * 3. Name is valid (if provided)
 *
 * **IMPORTANT CONSTRAINT (Requirements 8.8):**
 * - OrgUnit type is IMMUTABLE after creation
 * - Only name can be updated
 *
 * @see Requirements 8.7 (Edit OrgUnit)
 * @see Requirements 8.8 (Type is immutable after creation)
 * @see Design Components and Interfaces > 8. OrgUnit CRUD Operations
 */

import type { DomainResult } from '@core/utils';
import { fail, authorizationError, validationError } from '@core/utils';
import type { OrgUnit } from '../entities';
import type { OrgUnitRepository, UpdateOrgUnitRequest } from '../repositories/OrgUnitRepository';
import { orgUnitNotFound, orgUnitNameRequired } from '../errors';

// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------

const UPDATE_ORGUNIT_ERROR_CODES = {
  INSUFFICIENT_PERMISSION: 'ORGUNIT_INSUFFICIENT_PERMISSION',
  NO_TENANT_CONTEXT: 'ORGUNIT_NO_TENANT_CONTEXT',
  ORGUNIT_ID_REQUIRED: 'ORGUNIT_ID_REQUIRED',
  NO_UPDATE_DATA: 'ORGUNIT_NO_UPDATE_DATA',
} as const;

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * Input parameters for updating an OrgUnit via the use case.
 */
export interface UpdateOrgUnitUseCaseInput {
  /**
   * The tenant the OrgUnit belongs to.
   */
  readonly tenantId: string;

  /**
   * The OrgUnit ID to update.
   */
  readonly orgUnitId: string;

  /**
   * The new name for the OrgUnit (optional).
   * If not provided, no changes will be made.
   */
  readonly name?: string;

  /**
   * Whether the actor has orgunit:write permission.
   * Should be validated from the authorization context before calling.
   */
  readonly hasWritePermission: boolean;
}

/**
 * UpdateOrgUnitUseCase interface — updates an OrgUnit's metadata (name only).
 */
export interface UpdateOrgUnitUseCase {
  /**
   * Execute the update OrgUnit operation.
   *
   * @param input - The input parameters
   * @returns DomainResult with updated OrgUnit or error
   */
  execute(input: UpdateOrgUnitUseCaseInput): Promise<DomainResult<OrgUnit>>;
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create an UpdateOrgUnitUseCase instance.
 *
 * @param dependencies - The use case dependencies
 * @returns An implementation of UpdateOrgUnitUseCase
 */
export const UpdateOrgUnitUseCaseImpl = ({
  orgUnitAdminRepository,
}: {
  orgUnitAdminRepository: OrgUnitRepository;
}): UpdateOrgUnitUseCase => ({
  execute: async (input: UpdateOrgUnitUseCaseInput): Promise<DomainResult<OrgUnit>> => {
    const { tenantId, orgUnitId, name, hasWritePermission } = input;

    // Step 1: Validate actor has orgunit:write permission
    if (!hasWritePermission) {
      return fail(
        authorizationError(
          UPDATE_ORGUNIT_ERROR_CODES.INSUFFICIENT_PERMISSION,
          'User does not have orgunit:write permission',
          { userMessage: 'You do not have permission to update organization units' },
        ),
      );
    }

    // Step 2: Validate tenant context
    if (!tenantId) {
      return fail(
        authorizationError(
          UPDATE_ORGUNIT_ERROR_CODES.NO_TENANT_CONTEXT,
          'Tenant context is required to update OrgUnit',
          { userMessage: 'A tenant context is required to update organization units' },
        ),
      );
    }

    // Step 3: Validate orgUnitId is provided
    if (!orgUnitId) {
      return fail(
        validationError(
          UPDATE_ORGUNIT_ERROR_CODES.ORGUNIT_ID_REQUIRED,
          'OrgUnit ID is required',
          { userMessage: 'An organization unit ID must be specified' },
        ),
      );
    }

    // Step 4: Validate there's something to update
    if (name === undefined) {
      return fail(
        validationError(
          UPDATE_ORGUNIT_ERROR_CODES.NO_UPDATE_DATA,
          'No update data provided',
          { userMessage: 'No changes were specified' },
        ),
      );
    }

    // Step 5: Validate name is not empty if provided
    if (name !== undefined && (!name || name.trim().length === 0)) {
      return fail(orgUnitNameRequired());
    }

    // Step 6: Verify OrgUnit exists and belongs to tenant
    const existingResult = await orgUnitAdminRepository.getById(orgUnitId, tenantId);
    if (existingResult.success === false) {
      return fail(orgUnitNotFound(orgUnitId));
    }

    // Step 7: Build update request (only name can be updated - type is immutable)
    const updateRequest: UpdateOrgUnitRequest = {};
    if (name !== undefined) {
      updateRequest.name = name.trim();
    }

    // Step 8: Update via repository
    const updateResult = await orgUnitAdminRepository.update(
      orgUnitId,
      tenantId,
      updateRequest,
    );

    // Step 9: Return result directly
    return updateResult;
  },
});

/**
 * Type alias for cleaner DI registration.
 */
export type UpdateOrgUnitUseCaseType = UpdateOrgUnitUseCase;
