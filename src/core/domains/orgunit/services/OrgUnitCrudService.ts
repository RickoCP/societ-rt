/**
 * OrgUnitCrudService — Authorization-aware CRUD operations for OrgUnits.
 *
 * This service wraps OrgUnitManagementService with authorization checks:
 * - Validates user has permission to perform CRUD operations
 * - Uses OrgUnitScopeAuthorizer for scope validation
 * - Provides authorization-aware read operations (list OrgUnits user can access)
 *
 * **AUTHORIZATION FLOW:**
 * 1. Validate user has required permission (via PermissionRegistry)
 * 2. Validate user scope covers the target OrgUnit (via OrgUnitScopeAuthorizer)
 * 3. Delegate to OrgUnitManagementService for actual operation
 *
 * **SECURITY CONSIDERATIONS:**
 * - All operations require authentication (AuthorizationContext)
 * - Create: requires 'orgunit:create' permission + parent scope
 * - Read: requires 'orgunit:read' permission + scope validation
 * - Update: requires 'orgunit:update' permission + scope validation
 * - Delete: requires 'orgunit:delete' permission + scope validation
 *
 * @see FASE 1.19 Task 58: OrgUnit CRUD Operations (Req 34)
 * @see Requirements 6 (OrgUnit Scope Authorization)
 * @see Design OrgUnit Hierarchy Model
 */

import type { DomainResult, AppError } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { OrgUnit } from '../entities';
import type {
  IOrgUnitManagementService,
  CreateOrgUnitCommand,
  UpdateOrgUnitCommand,
  MoveOrgUnitCommand,
  DeleteOrgUnitCommand,
  CreateOrgUnitResult,
  UpdateOrgUnitResult,
  MoveOrgUnitResult,
  DeleteOrgUnitResult,
} from './OrgUnitManagementService';
import type { IOrgUnitHierarchyReader } from './OrgUnitHierarchyReader';
import type { IOrgUnitScopeAuthorizer } from '@core/domains/authorization/services/OrgUnitScopeAuthorizer';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { IOrgUnitRepository } from '../repositories';
import { MembershipRole } from '@core/domains/membership/types';

// ---------------------------------------------------------------------------
// Permission Constants
// ---------------------------------------------------------------------------

/**
 * OrgUnit-related permissions.
 * Must match the Permission Registry definition.
 */
export const ORGUNIT_PERMISSIONS = {
  CREATE: 'orgunit:create',
  READ: 'orgunit:read',
  UPDATE: 'orgunit:update',
  DELETE: 'orgunit:delete',
  MOVE: 'orgunit:move',
} as const;

// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------

/**
 * Create authorization insufficient permission error.
 */
const authInsufficientPermission = (
  requiredPermission: string,
  userPermissions?: string[],
): AppError => ({
  code: 'AUTH_INSUFFICIENT_PERMISSION',
  type: 'authorization',
  message: `User lacks required permission: ${requiredPermission}`,
  userMessage: 'Anda tidak memiliki izin untuk melakukan operasi ini.',
  retryable: false,
  cause: { requiredPermission, userPermissions },
});

/**
 * Create authorization context required error.
 */
const authContextRequired = (): AppError => ({
  code: 'AUTH_CONTEXT_REQUIRED',
  type: 'authentication',
  message: 'Authorization context is required for this operation',
  userMessage: 'Silakan login terlebih dahulu.',
  retryable: false,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Extended create command with authorization context.
 */
export interface AuthorizedCreateOrgUnitCommand extends CreateOrgUnitCommand {
  /** The authorization context from the request */
  readonly authContext: AuthorizationContext;
}

/**
 * Extended update command with authorization context.
 */
export interface AuthorizedUpdateOrgUnitCommand extends UpdateOrgUnitCommand {
  /** The authorization context from the request */
  readonly authContext: AuthorizationContext;
}

/**
 * Extended move command with authorization context.
 */
export interface AuthorizedMoveOrgUnitCommand extends MoveOrgUnitCommand {
  /** The authorization context from the request */
  readonly authContext: AuthorizationContext;
}

/**
 * Extended delete command with authorization context.
 */
export interface AuthorizedDeleteOrgUnitCommand extends DeleteOrgUnitCommand {
  /** The authorization context from the request */
  readonly authContext: AuthorizationContext;
}

/**
 * Query for listing OrgUnits with authorization context.
 */
export interface ListOrgUnitsQuery {
  /** The authorization context from the request */
  readonly authContext: AuthorizationContext;
  /** Optional parent ID to filter children */
  readonly parentId?: string | null;
  /** Include descendants in the result */
  readonly includeDescendants?: boolean;
}

/**
 * Result of listing OrgUnits.
 */
export interface ListOrgUnitsResult {
  /** OrgUnits the user can access */
  readonly orgUnits: OrgUnit[];
  /** Total count of accessible OrgUnits */
  readonly totalCount: number;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

/**
 * OrgUnitCrudService interface.
 *
 * Provides authorization-aware CRUD operations for OrgUnits.
 */
export interface IOrgUnitCrudService {
  // ---------------------------------------------------------------------------
  // Authorized CRUD Operations
  // ---------------------------------------------------------------------------

  /**
   * Create a new OrgUnit with authorization check.
   *
   * Authorization:
   * - User must have 'orgunit:create' permission
   * - User must have scope over the parent OrgUnit (or tenant-level for root)
   *
   * @param command - The authorized create command
   * @returns DomainResult with created OrgUnit or error
   */
  create(command: AuthorizedCreateOrgUnitCommand): Promise<DomainResult<CreateOrgUnitResult>>;

  /**
   * Update an OrgUnit with authorization check.
   *
   * Authorization:
   * - User must have 'orgunit:update' permission
   * - User must have scope over the target OrgUnit
   *
   * @param command - The authorized update command
   * @returns DomainResult with updated OrgUnit or error
   */
  update(command: AuthorizedUpdateOrgUnitCommand): Promise<DomainResult<UpdateOrgUnitResult>>;

  /**
   * Move an OrgUnit with authorization check.
   *
   * Authorization:
   * - User must have 'orgunit:move' permission
   * - User must have scope over both source OrgUnit and new parent
   *
   * @param command - The authorized move command
   * @returns DomainResult with moved OrgUnit or error
   */
  move(command: AuthorizedMoveOrgUnitCommand): Promise<DomainResult<MoveOrgUnitResult>>;

  /**
   * Delete an OrgUnit with authorization check.
   *
   * Authorization:
   * - User must have 'orgunit:delete' permission
   * - User must have scope over the target OrgUnit
   *
   * @param command - The authorized delete command
   * @returns DomainResult with delete result or error
   */
  delete(command: AuthorizedDeleteOrgUnitCommand): Promise<DomainResult<DeleteOrgUnitResult>>;

  // ---------------------------------------------------------------------------
  // Authorized Read Operations
  // ---------------------------------------------------------------------------

  /**
   * Get a single OrgUnit by ID with authorization check.
   *
   * Authorization:
   * - User must have 'orgunit:read' permission
   * - User must have scope over the target OrgUnit
   *
   * @param orgUnitId - The OrgUnit ID
   * @param authContext - The authorization context
   * @returns DomainResult with OrgUnit or error
   */
  getById(
    orgUnitId: string,
    authContext: AuthorizationContext,
  ): Promise<DomainResult<OrgUnit>>;

  /**
   * List OrgUnits that the user can access.
   *
   * Authorization:
   * - User must have 'orgunit:read' permission
   * - Returns only OrgUnits within user's scope
   *
   * @param query - The list query with authorization context
   * @returns DomainResult with list of accessible OrgUnits
   */
  list(query: ListOrgUnitsQuery): Promise<DomainResult<ListOrgUnitsResult>>;

  /**
   * Get children of an OrgUnit with authorization check.
   *
   * Authorization:
   * - User must have 'orgunit:read' permission
   * - User must have scope over the parent OrgUnit
   *
   * @param parentId - The parent OrgUnit ID
   * @param authContext - The authorization context
   * @returns DomainResult with list of child OrgUnits
   */
  getChildren(
    parentId: string,
    authContext: AuthorizationContext,
  ): Promise<DomainResult<OrgUnit[]>>;

  // ---------------------------------------------------------------------------
  // Authorization Helpers
  // ---------------------------------------------------------------------------

  /**
   * Check if user has permission to perform an operation.
   *
   * @param authContext - The authorization context
   * @param permission - The required permission
   * @returns true if user has permission
   */
  hasPermission(authContext: AuthorizationContext, permission: string): boolean;

  /**
   * Check if user has scope over an OrgUnit.
   *
   * @param orgUnitId - The OrgUnit ID
   * @param authContext - The authorization context
   * @returns DomainResult with true if in scope
   */
  isInScope(
    orgUnitId: string,
    authContext: AuthorizationContext,
  ): Promise<DomainResult<boolean>>;
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Roles that can manage OrgUnits at tenant level.
 */
const TENANT_LEVEL_MANAGEMENT_ROLES: ReadonlySet<MembershipRole> = new Set([
  MembershipRole.PLATFORM_ADMIN,
  MembershipRole.TENANT_OWNER,
]);

/**
 * Factory function to create an OrgUnitCrudService instance.
 *
 * @param dependencies - The service dependencies
 * @returns An implementation of IOrgUnitCrudService
 */
export const OrgUnitCrudServiceImpl = ({
  orgUnitManagementService,
  orgUnitScopeAuthorizer,
  orgUnitRepository,
  hierarchyReader,
}: {
  orgUnitManagementService: IOrgUnitManagementService;
  orgUnitScopeAuthorizer: IOrgUnitScopeAuthorizer;
  orgUnitRepository: IOrgUnitRepository;
  hierarchyReader: IOrgUnitHierarchyReader;
}): IOrgUnitCrudService => {
  // -------------------------------------------------------------------------
  // Internal Helpers
  // -------------------------------------------------------------------------

  /**
   * Validate authorization context is present.
   */
  const validateAuthContext = (
    authContext: AuthorizationContext | null | undefined,
  ): DomainResult<AuthorizationContext> => {
    if (!authContext) {
      return fail(authContextRequired());
    }
    return ok(authContext);
  };

  /**
   * Check if user has a specific permission.
   */
  const checkPermission = (
    authContext: AuthorizationContext,
    permission: string,
  ): DomainResult<void> => {
    const hasPermission = authContext.permissions.has(permission);
    if (!hasPermission) {
      return fail(
        authInsufficientPermission(permission, Array.from(authContext.permissions)),
      );
    }
    return ok(undefined);
  };

  /**
   * Check scope authorization for an OrgUnit.
   */
  const checkScope = async (
    resourceOrgUnitId: string,
    authContext: AuthorizationContext,
  ): Promise<DomainResult<void>> => {
    return orgUnitScopeAuthorizer.checkScope({
      authContext,
      resourceTenantId: authContext.tenantId,
      resourceOrgUnitId,
    });
  };

  /**
   * Check if user has tenant-level management scope.
   * Tenant-level admins can create root OrgUnits.
   */
  const hasTenantLevelScope = (authContext: AuthorizationContext): boolean => {
    return (
      TENANT_LEVEL_MANAGEMENT_ROLES.has(authContext.role) &&
      authContext.orgUnitId === null
    );
  };

  // -------------------------------------------------------------------------
  // Service Implementation
  // -------------------------------------------------------------------------

  const service: IOrgUnitCrudService = {
    // -------------------------------------------------------------------------
    // Authorized CRUD Operations
    // -------------------------------------------------------------------------

    async create(
      command: AuthorizedCreateOrgUnitCommand,
    ): Promise<DomainResult<CreateOrgUnitResult>> {
      const { authContext, tenantId, parentId, ...rest } = command;

      // Step 1: Validate auth context
      const authResult = validateAuthContext(authContext);
      if (!authResult.success) {
        return authResult;
      }

      // Step 2: Check permission
      const permissionResult = checkPermission(authContext, ORGUNIT_PERMISSIONS.CREATE);
      if (!permissionResult.success) {
        return permissionResult;
      }

      // Step 3: Validate tenant match
      if (authContext.tenantId !== tenantId) {
        return fail({
          code: 'AUTH_TENANT_MISMATCH',
          type: 'authorization',
          message: `Cannot create OrgUnit in different tenant`,
          userMessage: 'Anda tidak dapat membuat OrgUnit di tenant lain.',
          retryable: false,
        });
      }

      // Step 4: Check scope authorization
      if (parentId !== null) {
        // Creating under a parent - must have scope over parent
        const scopeResult = await checkScope(parentId, authContext);
        if (!scopeResult.success) {
          return scopeResult;
        }
      } else {
        // Creating a root OrgUnit - requires tenant-level scope
        if (!hasTenantLevelScope(authContext)) {
          return fail({
            code: 'AUTH_OUT_OF_SCOPE',
            type: 'authorization',
            message: 'Only tenant-level admins can create root OrgUnits',
            userMessage: 'Hanya admin tenant yang dapat membuat OrgUnit root.',
            retryable: false,
          });
        }
      }

      // Step 5: Delegate to management service
      return orgUnitManagementService.create({
        ...rest,
        tenantId,
        parentId,
        performedBy: authContext.userId,
      });
    },

    async update(
      command: AuthorizedUpdateOrgUnitCommand,
    ): Promise<DomainResult<UpdateOrgUnitResult>> {
      const { authContext, orgUnitId, tenantId, ...rest } = command;

      // Step 1: Validate auth context
      const authResult = validateAuthContext(authContext);
      if (!authResult.success) {
        return authResult;
      }

      // Step 2: Check permission
      const permissionResult = checkPermission(authContext, ORGUNIT_PERMISSIONS.UPDATE);
      if (!permissionResult.success) {
        return permissionResult;
      }

      // Step 3: Validate tenant match
      if (authContext.tenantId !== tenantId) {
        return fail({
          code: 'AUTH_TENANT_MISMATCH',
          type: 'authorization',
          message: `Cannot update OrgUnit in different tenant`,
          userMessage: 'Anda tidak dapat mengubah OrgUnit di tenant lain.',
          retryable: false,
        });
      }

      // Step 4: Check scope authorization
      const scopeResult = await checkScope(orgUnitId, authContext);
      if (!scopeResult.success) {
        return scopeResult;
      }

      // Step 5: Delegate to management service
      return orgUnitManagementService.update({
        ...rest,
        orgUnitId,
        tenantId,
        performedBy: authContext.userId,
      });
    },

    async move(
      command: AuthorizedMoveOrgUnitCommand,
    ): Promise<DomainResult<MoveOrgUnitResult>> {
      const { authContext, orgUnitId, tenantId, newParentId, ...rest } = command;

      // Step 1: Validate auth context
      const authResult = validateAuthContext(authContext);
      if (!authResult.success) {
        return authResult;
      }

      // Step 2: Check permission
      const permissionResult = checkPermission(authContext, ORGUNIT_PERMISSIONS.MOVE);
      if (!permissionResult.success) {
        return permissionResult;
      }

      // Step 3: Validate tenant match
      if (authContext.tenantId !== tenantId) {
        return fail({
          code: 'AUTH_TENANT_MISMATCH',
          type: 'authorization',
          message: `Cannot move OrgUnit in different tenant`,
          userMessage: 'Anda tidak dapat memindahkan OrgUnit di tenant lain.',
          retryable: false,
        });
      }

      // Step 4: Check scope over source OrgUnit
      const sourceScope = await checkScope(orgUnitId, authContext);
      if (!sourceScope.success) {
        return sourceScope;
      }

      // Step 5: Check scope over destination
      if (newParentId !== null) {
        const destScope = await checkScope(newParentId, authContext);
        if (!destScope.success) {
          return destScope;
        }
      } else {
        // Moving to root - requires tenant-level scope
        if (!hasTenantLevelScope(authContext)) {
          return fail({
            code: 'AUTH_OUT_OF_SCOPE',
            type: 'authorization',
            message: 'Only tenant-level admins can move OrgUnits to root',
            userMessage: 'Hanya admin tenant yang dapat memindahkan OrgUnit ke root.',
            retryable: false,
          });
        }
      }

      // Step 6: Delegate to management service
      return orgUnitManagementService.move({
        ...rest,
        orgUnitId,
        tenantId,
        newParentId,
        performedBy: authContext.userId,
      });
    },

    async delete(
      command: AuthorizedDeleteOrgUnitCommand,
    ): Promise<DomainResult<DeleteOrgUnitResult>> {
      const { authContext, orgUnitId, tenantId, ...rest } = command;

      // Step 1: Validate auth context
      const authResult = validateAuthContext(authContext);
      if (!authResult.success) {
        return authResult;
      }

      // Step 2: Check permission
      const permissionResult = checkPermission(authContext, ORGUNIT_PERMISSIONS.DELETE);
      if (!permissionResult.success) {
        return permissionResult;
      }

      // Step 3: Validate tenant match
      if (authContext.tenantId !== tenantId) {
        return fail({
          code: 'AUTH_TENANT_MISMATCH',
          type: 'authorization',
          message: `Cannot delete OrgUnit in different tenant`,
          userMessage: 'Anda tidak dapat menghapus OrgUnit di tenant lain.',
          retryable: false,
        });
      }

      // Step 4: Check scope authorization
      const scopeResult = await checkScope(orgUnitId, authContext);
      if (!scopeResult.success) {
        return scopeResult;
      }

      // Step 5: Delegate to management service
      return orgUnitManagementService.delete({
        ...rest,
        orgUnitId,
        tenantId,
        performedBy: authContext.userId,
      });
    },

    // -------------------------------------------------------------------------
    // Authorized Read Operations
    // -------------------------------------------------------------------------

    async getById(
      orgUnitId: string,
      authContext: AuthorizationContext,
    ): Promise<DomainResult<OrgUnit>> {
      // Step 1: Validate auth context
      const authResult = validateAuthContext(authContext);
      if (!authResult.success) {
        return authResult;
      }

      // Step 2: Check permission
      const permissionResult = checkPermission(authContext, ORGUNIT_PERMISSIONS.READ);
      if (!permissionResult.success) {
        return permissionResult;
      }

      // Step 3: Check scope authorization
      const scopeResult = await checkScope(orgUnitId, authContext);
      if (!scopeResult.success) {
        return scopeResult;
      }

      // Step 4: Get OrgUnit
      const orgUnit = await orgUnitManagementService.getById(orgUnitId, authContext.tenantId);
      if (!orgUnit) {
        return fail({
          code: 'ORGUNIT_NOT_FOUND',
          type: 'not_found',
          message: `OrgUnit not found: ${orgUnitId}`,
          userMessage: 'OrgUnit tidak ditemukan.',
          retryable: false,
        });
      }

      return ok(orgUnit);
    },

    async list(query: ListOrgUnitsQuery): Promise<DomainResult<ListOrgUnitsResult>> {
      const { authContext, parentId, includeDescendants } = query;

      // Step 1: Validate auth context
      const authResult = validateAuthContext(authContext);
      if (!authResult.success) {
        return authResult;
      }

      // Step 2: Check permission
      const permissionResult = checkPermission(authContext, ORGUNIT_PERMISSIONS.READ);
      if (!permissionResult.success) {
        return permissionResult;
      }

      // Step 3: Get OrgUnits based on user's scope
      let orgUnits: OrgUnit[];

      if (hasTenantLevelScope(authContext)) {
        // Tenant-level admin sees all OrgUnits in tenant
        if (parentId !== undefined) {
          if (parentId === null) {
            // List root OrgUnits
            orgUnits = await orgUnitRepository.findRoots(authContext.tenantId);
          } else if (includeDescendants) {
            // List descendants of parent
            orgUnits = await orgUnitRepository.findDescendants(parentId, authContext.tenantId);
          } else {
            // List direct children
            orgUnits = await orgUnitRepository.findChildren(parentId, authContext.tenantId);
          }
        } else {
          // List all OrgUnits
          orgUnits = await orgUnitRepository.findAllInTenant(authContext.tenantId);
        }
      } else {
        // Org-scoped user only sees OrgUnits within their scope
        const membershipOrgUnitId = authContext.orgUnitId;
        if (!membershipOrgUnitId) {
          return fail({
            code: 'AUTH_INVALID_SCOPE',
            type: 'authorization',
            message: 'Org-scoped user must have an orgUnitId',
            userMessage: 'Pengguna tidak memiliki scope OrgUnit yang valid.',
            retryable: false,
          });
        }

        // Get the user's scope OrgUnit and its descendants
        const scopeOrgUnit = await orgUnitRepository.findById(
          membershipOrgUnitId,
          authContext.tenantId,
        );
        if (!scopeOrgUnit) {
          return fail({
            code: 'ORGUNIT_NOT_FOUND',
            type: 'not_found',
            message: `User's scope OrgUnit not found`,
            userMessage: 'OrgUnit scope pengguna tidak ditemukan.',
            retryable: false,
          });
        }

        // Get all OrgUnits in user's scope (self + descendants)
        const descendants = await orgUnitRepository.findDescendants(
          membershipOrgUnitId,
          authContext.tenantId,
        );
        const allInScope = [scopeOrgUnit, ...descendants];

        // Apply filters
        if (parentId !== undefined) {
          if (parentId === null) {
            // User can't see root OrgUnits if not tenant-level
            // But they can see their scope OrgUnit if it's at the top of their view
            orgUnits = allInScope.filter(ou => ou.parentId === membershipOrgUnitId || ou.id === membershipOrgUnitId);
          } else {
            // Filter by parent within scope
            if (includeDescendants) {
              orgUnits = allInScope.filter(ou => ou.path.includes(parentId));
            } else {
              orgUnits = allInScope.filter(ou => ou.parentId === parentId);
            }
          }
        } else {
          orgUnits = allInScope;
        }
      }

      return ok({
        orgUnits,
        totalCount: orgUnits.length,
      });
    },

    async getChildren(
      parentId: string,
      authContext: AuthorizationContext,
    ): Promise<DomainResult<OrgUnit[]>> {
      // Step 1: Validate auth context
      const authResult = validateAuthContext(authContext);
      if (!authResult.success) {
        return authResult;
      }

      // Step 2: Check permission
      const permissionResult = checkPermission(authContext, ORGUNIT_PERMISSIONS.READ);
      if (!permissionResult.success) {
        return permissionResult;
      }

      // Step 3: Check scope authorization for parent
      const scopeResult = await checkScope(parentId, authContext);
      if (!scopeResult.success) {
        return scopeResult;
      }

      // Step 4: Get children
      const children = await orgUnitRepository.findChildren(parentId, authContext.tenantId);

      return ok(children);
    },

    // -------------------------------------------------------------------------
    // Authorization Helpers
    // -------------------------------------------------------------------------

    hasPermission(authContext: AuthorizationContext, permission: string): boolean {
      return authContext.permissions.has(permission);
    },

    async isInScope(
      orgUnitId: string,
      authContext: AuthorizationContext,
    ): Promise<DomainResult<boolean>> {
      const scopeResult = await checkScope(orgUnitId, authContext);
      if (!scopeResult.success) {
        // Check if it's an OUT_OF_SCOPE error or another error
        if (scopeResult.error.code === 'AUTH_OUT_OF_SCOPE') {
          return ok(false);
        }
        return scopeResult;
      }
      return ok(true);
    },
  };

  return service;
};

/**
 * Type alias for the factory function for cleaner DI registration.
 */
export type OrgUnitCrudService = IOrgUnitCrudService;
