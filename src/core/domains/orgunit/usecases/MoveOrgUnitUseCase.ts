/**
 * MoveOrgUnitUseCase — Moves an OrgUnit to a new parent in the tenant hierarchy (reparenting).
 *
 * This use case orchestrates the reparenting of an OrgUnit, validating:
 * 1. Actor has orgunit:write permission
 * 2. OrgUnit exists and belongs to the specified tenant
 * 3. Target parent exists and belongs to the same tenant
 * 4. Cycle prevention (target cannot be a descendant of source)
 * 5. Type compatibility (source type must be valid under target type)
 * 6. Cross-tenant blocking (source and target must be in the same tenant)
 * 7. Root immovability (root OrgUnits cannot be moved)
 *
 * **VALIDATION RULES (Requirements 10.4):**
 * - Cycle prevention → error i18n key `orgunit.move_cycle_error`
 * - Type compatibility → error i18n key `orgunit.move_type_error`
 * - Cross-tenant block → error i18n key `orgunit.move_cross_tenant_error`
 * - Root immovability → error i18n key `orgunit.move_root_error`
 *
 * @see Requirements 10.4, 10.7, 10.8 (OrgUnit Reparenting)
 * @see Design Components and Interfaces > 6.5 Drag and Drop Validation
 * @see Design Property 17: OrgUnit move validation - cycle prevention
 * @see Design Property 18: OrgUnit move validation - type compatibility
 */

import type { DomainResult } from '@core/utils';
import { fail, ok, authorizationError, validationError, businessError } from '@core/utils';
import type { OrgUnit } from '../entities';
import type { OrgUnitRepository, MoveOrgUnitRequest } from '../repositories/OrgUnitRepository';
import { canMoveToParent, OrgUnitType } from '../types';
import {
  orgUnitNotFound,
  orgUnitCannotMoveToDescendant,
  orgUnitInvalidTypeForPosition,
} from '../errors';

// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------

const MOVE_ORGUNIT_ERROR_CODES = {
  INSUFFICIENT_PERMISSION: 'ORGUNIT_INSUFFICIENT_PERMISSION',
  NO_TENANT_CONTEXT: 'ORGUNIT_NO_TENANT_CONTEXT',
  ORGUNIT_ID_REQUIRED: 'ORGUNIT_ID_REQUIRED',
  TARGET_PARENT_REQUIRED: 'ORGUNIT_TARGET_PARENT_REQUIRED',
  CANNOT_MOVE_ROOT: 'ORGUNIT_CANNOT_MOVE_ROOT',
  CROSS_TENANT_MOVE_BLOCKED: 'ORGUNIT_CROSS_TENANT_MOVE_BLOCKED',
  SAME_PARENT: 'ORGUNIT_SAME_PARENT',
  MOVE_TO_SELF: 'ORGUNIT_MOVE_TO_SELF',
} as const;

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/**
 * Input parameters for moving an OrgUnit via the use case.
 */
export interface MoveOrgUnitUseCaseInput {
  /**
   * The tenant the OrgUnit belongs to.
   */
  readonly tenantId: string;

  /**
   * The OrgUnit ID to move.
   */
  readonly orgUnitId: string;

  /**
   * The new parent OrgUnit ID.
   */
  readonly newParentId: string;

  /**
   * Whether the actor has orgunit:write permission.
   * Should be validated from the authorization context before calling.
   */
  readonly hasWritePermission: boolean;
}

/**
 * Result of the move operation with additional context.
 */
export interface MoveOrgUnitResult {
  /**
   * The moved OrgUnit with updated path.
   */
  readonly orgUnit: OrgUnit;

  /**
   * Count of descendants affected by the move.
   */
  readonly affectedDescendantCount: number;
}

/**
 * MoveOrgUnitUseCase interface — moves an OrgUnit to a new parent with comprehensive validation.
 */
export interface MoveOrgUnitUseCase {
  /**
   * Execute the move OrgUnit operation.
   *
   * @param input - The input parameters
   * @returns DomainResult with moved OrgUnit and affected count, or error
   */
  execute(input: MoveOrgUnitUseCaseInput): Promise<DomainResult<MoveOrgUnitResult>>;

  /**
   * Validate if an OrgUnit can be moved to a new parent without actually moving.
   *
   * Useful for UI to show valid drop targets during drag-and-drop.
   *
   * @param input - The input parameters
   * @returns DomainResult with validation details or error
   */
  validateMove(input: MoveOrgUnitUseCaseInput): Promise<DomainResult<MoveValidationDetails>>;
}

/**
 * Details returned from move validation.
 */
export interface MoveValidationDetails {
  /**
   * Whether the move is valid.
   */
  readonly valid: boolean;

  /**
   * Error i18n key if move is invalid.
   */
  readonly errorKey?: string;

  /**
   * Error message for internal logging.
   */
  readonly errorMessage?: string;

  /**
   * Count of descendants that would be affected by the move.
   */
  readonly affectedDescendantCount: number;

  /**
   * Source OrgUnit details.
   */
  readonly source: {
    readonly id: string;
    readonly name: string;
    readonly type: OrgUnitType;
    readonly path: string[];
  };

  /**
   * Target parent OrgUnit details.
   */
  readonly target: {
    readonly id: string;
    readonly name: string;
    readonly type: OrgUnitType;
    readonly path: string[];
  };
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a MoveOrgUnitUseCase instance.
 *
 * @param dependencies - The use case dependencies
 * @returns An implementation of MoveOrgUnitUseCase
 */
export const MoveOrgUnitUseCaseImpl = ({
  orgUnitAdminRepository,
}: {
  orgUnitAdminRepository: OrgUnitRepository;
}): MoveOrgUnitUseCase => ({
  execute: async (input: MoveOrgUnitUseCaseInput): Promise<DomainResult<MoveOrgUnitResult>> => {
    const { tenantId, orgUnitId, newParentId, hasWritePermission } = input;

    // Step 1: Basic validation - permission check
    const permissionCheckResult = validatePermissions(tenantId, hasWritePermission);
    if (permissionCheckResult) {
      return fail(permissionCheckResult);
    }

    // Step 2: Validate required fields
    const fieldValidationResult = validateRequiredFields(orgUnitId, newParentId);
    if (fieldValidationResult) {
      return fail(fieldValidationResult);
    }

    // Step 3: Check for trivial invalid moves (same ID, same parent)
    if (orgUnitId === newParentId) {
      return fail(
        validationError(
          MOVE_ORGUNIT_ERROR_CODES.MOVE_TO_SELF,
          'Cannot move OrgUnit to itself',
          { userMessage: 'Cannot move an organization unit to itself' },
        ),
      );
    }

    // Step 4: Fetch source OrgUnit to validate existence and get details
    const sourceResult = await orgUnitAdminRepository.getById(orgUnitId, tenantId);
    if (sourceResult.success === false) {
      return fail(orgUnitNotFound(orgUnitId));
    }
    const sourceOrgUnit = sourceResult.data;

    // Step 5: Check if source is a root OrgUnit (cannot move root)
    const isRootOrgUnit = await orgUnitAdminRepository.isRoot(orgUnitId, tenantId);
    if (isRootOrgUnit) {
      return fail(
        businessError(
          MOVE_ORGUNIT_ERROR_CODES.CANNOT_MOVE_ROOT,
          `Cannot move root OrgUnit ${orgUnitId}`,
          { userMessage: 'Root organization units cannot be moved' },
        ),
      );
    }

    // Step 6: Check if moving to the same parent (no-op)
    if (sourceOrgUnit.parentId === newParentId) {
      return fail(
        validationError(
          MOVE_ORGUNIT_ERROR_CODES.SAME_PARENT,
          'OrgUnit is already under the specified parent',
          { userMessage: 'The organization unit is already under this parent' },
        ),
      );
    }

    // Step 7: Fetch target parent OrgUnit to validate existence and get details
    const targetResult = await orgUnitAdminRepository.getById(newParentId, tenantId);
    if (targetResult.success === false) {
      return fail(orgUnitNotFound(newParentId));
    }
    const targetOrgUnit = targetResult.data;

    // Step 8: Cross-tenant validation (both must belong to same tenant)
    if (sourceOrgUnit.tenantId !== targetOrgUnit.tenantId) {
      return fail(
        businessError(
          MOVE_ORGUNIT_ERROR_CODES.CROSS_TENANT_MOVE_BLOCKED,
          `Cannot move OrgUnit ${orgUnitId} to a different tenant`,
          { userMessage: 'Cannot move organization unit to a different tenant' },
        ),
      );
    }

    // Step 9: Cycle prevention - target cannot be a descendant of source
    const isTargetDescendant = await orgUnitAdminRepository.isAncestor(
      orgUnitId,
      newParentId,
      tenantId,
    );
    if (isTargetDescendant) {
      return fail(orgUnitCannotMoveToDescendant(orgUnitId, newParentId));
    }

    // Step 10: Type compatibility - source type must be valid under target type
    if (!canMoveToParent(sourceOrgUnit.type, targetOrgUnit.type)) {
      return fail(orgUnitInvalidTypeForPosition(sourceOrgUnit.type, targetOrgUnit.type));
    }

    // Step 11: Get descendant count for the result
    const moveValidation = await orgUnitAdminRepository.validateMove(
      orgUnitId,
      newParentId,
      tenantId,
    );
    const affectedDescendantCount = moveValidation.affectedDescendantCount ?? 0;

    // Step 12: Execute the move via repository
    const moveRequest: MoveOrgUnitRequest = {
      orgUnitId,
      newParentId,
    };

    const moveResult = await orgUnitAdminRepository.move(moveRequest, tenantId);

    // Step 13: Map result with affected count
    if (moveResult.success === false) {
      return fail(moveResult.error);
    }

    return ok({
      orgUnit: moveResult.data,
      affectedDescendantCount,
    });
  },

  validateMove: async (input: MoveOrgUnitUseCaseInput): Promise<DomainResult<MoveValidationDetails>> => {
    const { tenantId, orgUnitId, newParentId, hasWritePermission } = input;

    // Step 1: Basic validation - permission check
    const permissionCheckResult = validatePermissions(tenantId, hasWritePermission);
    if (permissionCheckResult) {
      return fail(permissionCheckResult);
    }

    // Step 2: Validate required fields
    const fieldValidationResult = validateRequiredFields(orgUnitId, newParentId);
    if (fieldValidationResult) {
      return fail(fieldValidationResult);
    }

    // Step 3: Check for trivial invalid moves (same ID)
    if (orgUnitId === newParentId) {
      return fail(
        validationError(
          MOVE_ORGUNIT_ERROR_CODES.MOVE_TO_SELF,
          'Cannot move OrgUnit to itself',
          { userMessage: 'Cannot move an organization unit to itself' },
        ),
      );
    }

    // Step 4: Fetch source OrgUnit
    const sourceResult = await orgUnitAdminRepository.getById(orgUnitId, tenantId);
    if (sourceResult.success === false) {
      return fail(orgUnitNotFound(orgUnitId));
    }
    const sourceOrgUnit = sourceResult.data;

    // Step 5: Fetch target parent OrgUnit
    const targetResult = await orgUnitAdminRepository.getById(newParentId, tenantId);
    if (targetResult.success === false) {
      return fail(orgUnitNotFound(newParentId));
    }
    const targetOrgUnit = targetResult.data;

    // Step 6: Build validation details
    const validationDetails: MoveValidationDetails = {
      valid: true,
      affectedDescendantCount: 0,
      source: {
        id: sourceOrgUnit.id,
        name: sourceOrgUnit.name,
        type: sourceOrgUnit.type,
        path: sourceOrgUnit.path,
      },
      target: {
        id: targetOrgUnit.id,
        name: targetOrgUnit.name,
        type: targetOrgUnit.type,
        path: targetOrgUnit.path,
      },
    };

    // Step 7: Check if source is a root OrgUnit (cannot move root)
    const isRootOrgUnit = await orgUnitAdminRepository.isRoot(orgUnitId, tenantId);
    if (isRootOrgUnit) {
      return ok({
        ...validationDetails,
        valid: false,
        errorKey: 'orgunit.move_root_error',
        errorMessage: 'Root organization units cannot be moved',
      });
    }

    // Step 8: Check if moving to the same parent (no-op)
    if (sourceOrgUnit.parentId === newParentId) {
      return ok({
        ...validationDetails,
        valid: false,
        errorKey: 'orgunit.move_same_parent_error',
        errorMessage: 'The organization unit is already under this parent',
      });
    }

    // Step 9: Cross-tenant validation
    if (sourceOrgUnit.tenantId !== targetOrgUnit.tenantId) {
      return ok({
        ...validationDetails,
        valid: false,
        errorKey: 'orgunit.move_cross_tenant_error',
        errorMessage: 'Cannot move organization unit to a different tenant',
      });
    }

    // Step 10: Cycle prevention - target cannot be a descendant of source
    const isTargetDescendant = await orgUnitAdminRepository.isAncestor(
      orgUnitId,
      newParentId,
      tenantId,
    );
    if (isTargetDescendant) {
      return ok({
        ...validationDetails,
        valid: false,
        errorKey: 'orgunit.move_cycle_error',
        errorMessage: 'Cannot move an organization unit into one of its own descendants',
      });
    }

    // Step 11: Type compatibility - source type must be valid under target type
    if (!canMoveToParent(sourceOrgUnit.type, targetOrgUnit.type)) {
      return ok({
        ...validationDetails,
        valid: false,
        errorKey: 'orgunit.move_type_error',
        errorMessage: `Organization unit type ${sourceOrgUnit.type} cannot be a child of ${targetOrgUnit.type}`,
      });
    }

    // Step 12: Get affected descendant count via repository validation
    const moveValidation = await orgUnitAdminRepository.validateMove(
      orgUnitId,
      newParentId,
      tenantId,
    );

    return ok({
      ...validationDetails,
      valid: moveValidation.valid,
      errorKey: moveValidation.errorKey,
      errorMessage: moveValidation.errorDetails,
      affectedDescendantCount: moveValidation.affectedDescendantCount ?? 0,
    });
  },
});

// ---------------------------------------------------------------------------
// Private Helper Functions
// ---------------------------------------------------------------------------

/**
 * Validates that the actor has the required permission and tenant context.
 *
 * @param tenantId - The tenant context
 * @param hasWritePermission - Whether the actor has orgunit:write permission
 * @returns AppError if validation fails, undefined if valid
 */
function validatePermissions(
  tenantId: string | undefined,
  hasWritePermission: boolean,
) {
  if (!hasWritePermission) {
    return authorizationError(
      MOVE_ORGUNIT_ERROR_CODES.INSUFFICIENT_PERMISSION,
      'User does not have orgunit:write permission',
      { userMessage: 'You do not have permission to move organization units' },
    );
  }

  if (!tenantId) {
    return authorizationError(
      MOVE_ORGUNIT_ERROR_CODES.NO_TENANT_CONTEXT,
      'Tenant context is required to move OrgUnit',
      { userMessage: 'A tenant context is required to move organization units' },
    );
  }

  return undefined;
}

/**
 * Validates that required fields are provided.
 *
 * @param orgUnitId - The OrgUnit ID to move
 * @param newParentId - The target parent OrgUnit ID
 * @returns AppError if validation fails, undefined if valid
 */
function validateRequiredFields(
  orgUnitId: string | undefined,
  newParentId: string | undefined,
) {
  if (!orgUnitId) {
    return validationError(
      MOVE_ORGUNIT_ERROR_CODES.ORGUNIT_ID_REQUIRED,
      'OrgUnit ID is required',
      { userMessage: 'An organization unit ID must be specified' },
    );
  }

  if (!newParentId) {
    return validationError(
      MOVE_ORGUNIT_ERROR_CODES.TARGET_PARENT_REQUIRED,
      'Target parent OrgUnit ID is required',
      { userMessage: 'A target parent organization unit must be specified' },
    );
  }

  return undefined;
}

/**
 * Type alias for cleaner DI registration.
 */
export type MoveOrgUnitUseCaseType = MoveOrgUnitUseCase;
