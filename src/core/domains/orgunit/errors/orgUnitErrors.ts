/**
 * OrgUnit-specific error factory functions.
 *
 * Each function returns a typed AppError with a stable, searchable code.
 * Error codes follow the Authorization Error Codes specification from design.md.
 *
 * SECURITY CONSIDERATIONS:
 * - Error messages MUST NOT expose internal details
 * - Fail closed on unknown error states
 * - Errors MUST NOT leak cross-tenant information
 *
 * @see Requirements 6, 21, 46
 * @see Design Error Handling, OrgUnit Hierarchy Model
 */

import type { AppError } from '@core/utils';
import { authorizationError, notFoundError, businessError, validationError } from '@core/utils';

// ---------------------------------------------------------------------------
// OrgUnit Not Found Errors
// ---------------------------------------------------------------------------

/**
 * OrgUnit not found in the specified tenant.
 * HTTP Status: 404
 */
export function orgUnitNotFound(orgUnitId?: string): AppError {
  const details = orgUnitId ? ` (id: ${orgUnitId})` : '';
  return notFoundError(
    'ORGUNIT_NOT_FOUND',
    `OrgUnit not found${details}`,
    { userMessage: 'The requested organization unit was not found' },
  );
}

/**
 * OrgUnit not found in the expected tenant (tenant mismatch during lookup).
 * HTTP Status: 403
 */
export function orgUnitTenantMismatch(): AppError {
  return authorizationError(
    'ORGUNIT_TENANT_MISMATCH',
    'OrgUnit belongs to a different tenant',
    { userMessage: 'You do not have access to this organization unit' },
  );
}

// ---------------------------------------------------------------------------
// OrgUnit Invariant Violation Errors
// ---------------------------------------------------------------------------

/**
 * OrgUnit hierarchy invariant violated.
 * This indicates a data integrity issue.
 */
export function orgUnitInvariantViolation(
  invariantId: 'INV-ORG-001' | 'INV-ORG-002' | 'INV-ORG-003' | 'INV-ORG-004',
  details: string,
): AppError {
  return businessError(
    'ORGUNIT_INVARIANT_VIOLATION',
    `OrgUnit invariant ${invariantId} violated: ${details}`,
    { userMessage: 'A system error occurred. Please contact support.' },
  );
}

/**
 * OrgUnit path/depth consistency error.
 * INV-ORG-003: depth = path.length - 1
 */
export function orgUnitPathDepthMismatch(
  orgUnitId: string,
  actualDepth: number,
  expectedDepth: number,
): AppError {
  return orgUnitInvariantViolation(
    'INV-ORG-003',
    `OrgUnit ${orgUnitId} has depth=${actualDepth} but path.length=${expectedDepth + 1}`,
  );
}

/**
 * Root OrgUnit invariant error.
 * INV-ORG-004: Root OrgUnit has parentId=NULL, depth=0, path=[id]
 */
export function orgUnitRootInvariantViolation(
  orgUnitId: string,
  issue: string,
): AppError {
  return orgUnitInvariantViolation(
    'INV-ORG-004',
    `Root OrgUnit ${orgUnitId}: ${issue}`,
  );
}

/**
 * Parent tenant mismatch error.
 * INV-ORG-001: OrgUnit parent must belong to same tenant.
 */
export function orgUnitParentTenantMismatch(
  orgUnitId: string,
  parentId: string,
): AppError {
  return orgUnitInvariantViolation(
    'INV-ORG-001',
    `OrgUnit ${orgUnitId} has parent ${parentId} in different tenant`,
  );
}

/**
 * Cycle detected in hierarchy.
 * INV-ORG-002: OrgUnit hierarchy cannot contain cycles.
 */
export function orgUnitCycleDetected(orgUnitId: string): AppError {
  return orgUnitInvariantViolation(
    'INV-ORG-002',
    `Cycle detected involving OrgUnit ${orgUnitId}`,
  );
}

// ---------------------------------------------------------------------------
// OrgUnit Management Errors
// ---------------------------------------------------------------------------

/**
 * OrgUnit already exists (duplicate).
 * HTTP Status: 409
 */
export function orgUnitAlreadyExists(name: string, tenantId: string): AppError {
  return businessError(
    'ORGUNIT_ALREADY_EXISTS',
    `OrgUnit with name '${name}' already exists in tenant ${tenantId}`,
    { userMessage: 'An organization unit with this name already exists' },
  );
}

/**
 * Cannot delete OrgUnit with children.
 * HTTP Status: 409
 */
export function orgUnitHasChildren(orgUnitId: string): AppError {
  return businessError(
    'ORGUNIT_HAS_CHILDREN',
    `Cannot delete OrgUnit ${orgUnitId} because it has child OrgUnits`,
    { userMessage: 'Cannot delete organization unit with child units. Delete children first or use cascade delete.' },
  );
}

/**
 * Cannot delete OrgUnit with assigned members.
 * HTTP Status: 409
 */
export function orgUnitHasMembers(orgUnitId: string): AppError {
  return businessError(
    'ORGUNIT_HAS_MEMBERS',
    `Cannot delete OrgUnit ${orgUnitId} because it has assigned members`,
    { userMessage: 'Cannot delete organization unit with assigned members. Reassign or remove members first.' },
  );
}

/**
 * Cannot move OrgUnit to its own descendant.
 * HTTP Status: 400
 */
export function orgUnitCannotMoveToDescendant(
  orgUnitId: string,
  targetParentId: string,
): AppError {
  return businessError(
    'ORGUNIT_CANNOT_MOVE_TO_DESCENDANT',
    `Cannot move OrgUnit ${orgUnitId} to its own descendant ${targetParentId}`,
    { userMessage: 'Cannot move an organization unit into one of its own descendants' },
  );
}

/**
 * Maximum hierarchy depth exceeded.
 * HTTP Status: 400
 */
export function orgUnitMaxDepthExceeded(
  orgUnitId: string,
  currentDepth: number,
  maxDepth: number,
): AppError {
  return businessError(
    'ORGUNIT_MAX_DEPTH_EXCEEDED',
    `OrgUnit ${orgUnitId} would exceed maximum depth. Current: ${currentDepth}, Max: ${maxDepth}`,
    { userMessage: `Organization unit hierarchy cannot exceed ${maxDepth} levels deep` },
  );
}

/**
 * Invalid OrgUnit type for hierarchy position.
 * HTTP Status: 400
 */
export function orgUnitInvalidTypeForPosition(
  childType: string,
  parentType: string,
): AppError {
  return businessError(
    'ORGUNIT_INVALID_TYPE_FOR_POSITION',
    `OrgUnit type ${childType} cannot be a child of ${parentType}`,
    { userMessage: 'This organization unit type cannot be placed at this position in the hierarchy' },
  );
}

/**
 * OrgUnit name is required.
 * HTTP Status: 400
 */
export function orgUnitNameRequired(): AppError {
  return validationError(
    'ORGUNIT_NAME_REQUIRED',
    'OrgUnit name is required',
    { userMessage: 'Organization unit name is required' },
  );
}

/**
 * OrgUnit type is required.
 * HTTP Status: 400
 */
export function orgUnitTypeRequired(): AppError {
  return validationError(
    'ORGUNIT_TYPE_REQUIRED',
    'OrgUnit type is required',
    { userMessage: 'Organization unit type is required' },
  );
}

/**
 * Path repair failed.
 * HTTP Status: 500
 */
export function orgUnitPathRepairFailed(
  orgUnitId: string,
  reason: string,
): AppError {
  return businessError(
    'ORGUNIT_PATH_REPAIR_FAILED',
    `Failed to repair path for OrgUnit ${orgUnitId}: ${reason}`,
    { userMessage: 'Failed to repair organization unit hierarchy. Please contact support.' },
  );
}
