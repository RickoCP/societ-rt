/**
 * CreateOrgUnitUseCase — Creates a new OrgUnit within the tenant hierarchy.
 *
 * This use case orchestrates the creation of a new OrgUnit, validating:
 * 1. Actor has orgunit:write permission
 * 2. Parent OrgUnit exists and belongs to the same tenant
 * 3. The new OrgUnit type is valid under the parent type (type hierarchy enforcement)
 * 4. Name is provided and valid
 *
 * **TYPE HIERARCHY ENFORCEMENT (Requirements 8.3):**
 * - ORGANIZATION → CLUSTER (only)
 * - CLUSTER → RW (only)
 * - RW → RT (only)
 * - RT cannot have children
 *
 * @see Requirements 8.4 (Create OrgUnit)
 * @see Requirements 8.3 (Type hierarchy validation)
 * @see Design Components and Interfaces > 8. OrgUnit CRUD Operations
 */

import type { DomainResult } from '@core/utils';
import { fail, authorizationError, validationError, businessError } from '@core/utils';
import type { OrgUnit } from '../entities';
import type { OrgUnitRepository, CreateOrgUnitRequest } from '../repositories/OrgUnitRepository';
import { canMoveToParent, isLeafType, isValidOrgUnitType, OrgUnitType } from '../types';
import {
  orgUnitNotFound,
  orgUnitNameRequired,
  orgUnitTypeRequired,
  orgUnitInvalidTypeForPosition,
} from '../errors';

// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------

const CREATE_ORGUNIT_ERROR_CODES = {
  INSUFFICIENT_PERMISSION: 'ORGUNIT_INSUFFICIENT_PERMISSION',
  NO_TENANT_CONTEXT: 'ORGUNIT_NO_TENANT_CONTEXT',
  PARENT_REQUIRED: 'ORGUNIT_PARENT_REQUIRED',
  PARENT_IS_LEAF: 'ORGUNIT_PARENT_IS_LEAF',
  INVALID_TYPE: 'ORGUNIT_INVALID_TYPE',
} as const;

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * Input parameters for creating an OrgUnit via the use case.
 */
export interface CreateOrgUnitUseCaseInput {
  /**
   * The tenant to create the OrgUnit in.
   */
  readonly tenantId: string;

  /**
   * The parent OrgUnit ID (required - root creation not supported via this use case).
   */
  readonly parentId: string;

  /**
   * The name for the new OrgUnit.
   */
  readonly name: string;

  /**
   * The type for the new OrgUnit (must be valid child type of parent).
   */
  readonly type: string;

  /**
   * Whether the actor has orgunit:write permission.
   * Should be validated from the authorization context before calling.
   */
  readonly hasWritePermission: boolean;
}

/**
 * CreateOrgUnitUseCase interface — creates a new OrgUnit with type hierarchy validation.
 */
export interface CreateOrgUnitUseCase {
  /**
   * Execute the create OrgUnit operation.
   *
   * @param input - The input parameters
   * @returns DomainResult with created OrgUnit or error
   */
  execute(input: CreateOrgUnitUseCaseInput): Promise<DomainResult<OrgUnit>>;
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a CreateOrgUnitUseCase instance.
 *
 * @param dependencies - The use case dependencies
 * @returns An implementation of CreateOrgUnitUseCase
 */
export const CreateOrgUnitUseCaseImpl = ({
  orgUnitAdminRepository,
}: {
  orgUnitAdminRepository: OrgUnitRepository;
}): CreateOrgUnitUseCase => ({
  execute: async (input: CreateOrgUnitUseCaseInput): Promise<DomainResult<OrgUnit>> => {
    const { tenantId, parentId, name, type, hasWritePermission } = input;

    // Step 1: Validate actor has orgunit:write permission
    if (!hasWritePermission) {
      return fail(
        authorizationError(
          CREATE_ORGUNIT_ERROR_CODES.INSUFFICIENT_PERMISSION,
          'User does not have orgunit:write permission',
          { userMessage: 'You do not have permission to create organization units' },
        ),
      );
    }

    // Step 2: Validate tenant context
    if (!tenantId) {
      return fail(
        authorizationError(
          CREATE_ORGUNIT_ERROR_CODES.NO_TENANT_CONTEXT,
          'Tenant context is required to create OrgUnit',
          { userMessage: 'A tenant context is required to create organization units' },
        ),
      );
    }

    // Step 3: Validate parent ID is provided
    if (!parentId) {
      return fail(
        validationError(
          CREATE_ORGUNIT_ERROR_CODES.PARENT_REQUIRED,
          'Parent OrgUnit ID is required for creating child OrgUnits',
          { userMessage: 'A parent organization unit must be specified' },
        ),
      );
    }

    // Step 4: Validate name is provided
    if (!name || name.trim().length === 0) {
      return fail(orgUnitNameRequired());
    }

    // Step 5: Validate type is provided and valid
    if (!type) {
      return fail(orgUnitTypeRequired());
    }

    if (!isValidOrgUnitType(type)) {
      return fail(
        validationError(
          CREATE_ORGUNIT_ERROR_CODES.INVALID_TYPE,
          `Invalid OrgUnit type: ${type}`,
          { userMessage: 'The specified organization unit type is not valid' },
        ),
      );
    }

    // Step 6: Fetch parent OrgUnit to validate type hierarchy
    const parentResult = await orgUnitAdminRepository.getById(parentId, tenantId);
    if (parentResult.success === false) {
      // Parent not found or tenant mismatch
      return fail(orgUnitNotFound(parentId));
    }

    const parentOrgUnit = parentResult.data;

    // Step 7: Check if parent type can have children
    if (isLeafType(parentOrgUnit.type)) {
      return fail(
        businessError(
          CREATE_ORGUNIT_ERROR_CODES.PARENT_IS_LEAF,
          `OrgUnit type ${parentOrgUnit.type} cannot have children`,
          { userMessage: `Organization units of type ${parentOrgUnit.type} cannot have child units` },
        ),
      );
    }

    // Step 8: Validate type hierarchy - child type must be valid under parent type
    const childType = type as OrgUnitType;
    if (!canMoveToParent(childType, parentOrgUnit.type)) {
      return fail(orgUnitInvalidTypeForPosition(type, parentOrgUnit.type));
    }

    // Step 9: Create the OrgUnit via repository
    const createRequest: CreateOrgUnitRequest = {
      parentId,
      name: name.trim(),
      type,
    };

    const createResult = await orgUnitAdminRepository.create(tenantId, createRequest);

    // Step 10: Return result directly
    return createResult;
  },
});

/**
 * Type alias for cleaner DI registration.
 */
export type CreateOrgUnitUseCaseType = CreateOrgUnitUseCase;
