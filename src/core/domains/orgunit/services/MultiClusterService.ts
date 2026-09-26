/**
 * MultiClusterService — Domain service for multi-cluster management within tenants.
 *
 * This service supports multiple clusters (OrgUnits with type=CLUSTER) per tenant:
 * - Create Cluster: Create a new CLUSTER OrgUnit under a parent organization or root
 * - List Clusters: Get all clusters in a tenant
 * - Get Cluster: Get cluster details with its OrgUnit tree
 * - Switch Cluster: User context switch between clusters
 * - Cross-Cluster Navigation: Navigate between clusters within same tenant
 * - Cluster-Level Scoping: Memberships can be scoped to specific clusters
 *
 * **HIERARCHY:**
 * ORGANIZATION > CLUSTER > RW > RT
 *
 * **SECURITY CONSIDERATIONS:**
 * - All operations validate tenant boundary
 * - Cluster access respects membership scope
 * - Users can only switch to clusters within their scope
 *
 * **CLUSTER INVARIANTS:**
 * - CLUSTER type can only be a child of ORGANIZATION type
 * - Cluster-scoped memberships limit access to that cluster's subtree
 * - Cluster deletion validates no active memberships or children
 *
 * @see FASE 1.19 Task 59: Multi-Cluster Support (Req 58)
 * @see Requirements 58 (Multi-Cluster Support)
 * @see Design OrgUnit Hierarchy Model
 */

import type { DomainResult, AppError } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { OrgUnit } from '../entities';
import type { IOrgUnitRepository } from '../repositories';
import type { IOrgUnitHierarchyReader } from './OrgUnitHierarchyReader';
import type {
  IOrgUnitManagementService,
  CreateOrgUnitCommand,
  CreateOrgUnitResult,
  DeleteOrgUnitResult,
} from './OrgUnitManagementService';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { IOrgUnitScopeAuthorizer } from '@core/domains/authorization/services/OrgUnitScopeAuthorizer';
import { OrgUnitType, canBeParent } from '../types';
import { MembershipRole } from '@core/domains/membership/types';

// ---------------------------------------------------------------------------
// Error Factories
// ---------------------------------------------------------------------------

/**
 * Create cluster not found error.
 */
const clusterNotFound = (clusterId: string): AppError => ({
  code: 'CLUSTER_NOT_FOUND',
  type: 'not_found',
  message: `Cluster not found: ${clusterId}`,
  userMessage: 'Cluster tidak ditemukan.',
  retryable: false,
});

/**
 * Create cluster is not CLUSTER type error.
 */
const notACluster = (orgUnitId: string, actualType: OrgUnitType): AppError => ({
  code: 'CLUSTER_TYPE_MISMATCH',
  type: 'validation',
  message: `OrgUnit ${orgUnitId} is type ${actualType}, not CLUSTER`,
  userMessage: 'OrgUnit ini bukan tipe Cluster.',
  retryable: false,
});

/**
 * Create invalid cluster parent error.
 */
const invalidClusterParent = (
  parentId: string | null,
  parentType: OrgUnitType | null,
): AppError => ({
  code: 'CLUSTER_INVALID_PARENT',
  type: 'validation',
  message: `Cluster can only be created under ORGANIZATION, got ${parentType ?? 'null (root)'}`,
  userMessage: 'Cluster hanya dapat dibuat di bawah Organization.',
  retryable: false,
});

/**
 * Create cluster switch out of scope error.
 */
const clusterSwitchOutOfScope = (clusterId: string): AppError => ({
  code: 'CLUSTER_SWITCH_OUT_OF_SCOPE',
  type: 'authorization',
  message: `User cannot switch to cluster ${clusterId}: out of membership scope`,
  userMessage: 'Anda tidak memiliki akses ke cluster ini.',
  retryable: false,
});

/**
 * Create cluster switch tenant mismatch error.
 */
const clusterSwitchTenantMismatch = (): AppError => ({
  code: 'CLUSTER_SWITCH_TENANT_MISMATCH',
  type: 'authorization',
  message: 'Cannot switch to cluster in different tenant',
  userMessage: 'Cluster berada di tenant yang berbeda.',
  retryable: false,
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

/**
 * Create authorization insufficient permission error.
 */
const authInsufficientPermission = (requiredPermission: string): AppError => ({
  code: 'AUTH_INSUFFICIENT_PERMISSION',
  type: 'authorization',
  message: `User lacks required permission: ${requiredPermission}`,
  userMessage: 'Anda tidak memiliki izin untuk melakukan operasi ini.',
  retryable: false,
});

// ---------------------------------------------------------------------------
// Permission Constants
// ---------------------------------------------------------------------------

/**
 * Cluster-related permissions.
 * Must match the Permission Registry definition.
 */
export const CLUSTER_PERMISSIONS = {
  CREATE: 'cluster:create',
  READ: 'cluster:read',
  UPDATE: 'cluster:update',
  DELETE: 'cluster:delete',
  SWITCH: 'cluster:switch',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Command for creating a new cluster.
 */
export interface CreateClusterCommand {
  /** The tenant the cluster belongs to */
  readonly tenantId: string;
  /** Parent OrgUnit ID (must be ORGANIZATION type, or null if allowed for legacy) */
  readonly parentId: string | null;
  /** The cluster name */
  readonly name: string;
  /** User performing the action (for audit) */
  readonly performedBy?: string;
  /** Authorization context from the request */
  readonly authContext: AuthorizationContext;
}

/**
 * Command for switching to a cluster context.
 */
export interface SwitchClusterCommand {
  /** The target cluster ID */
  readonly clusterId: string;
  /** The tenant ID */
  readonly tenantId: string;
  /** Authorization context from the request */
  readonly authContext: AuthorizationContext;
}

/**
 * Command for deleting a cluster.
 */
export interface DeleteClusterCommand {
  /** The cluster ID to delete */
  readonly clusterId: string;
  /** The tenant ID */
  readonly tenantId: string;
  /** Whether to cascade delete children */
  readonly cascade?: boolean;
  /** Reason for deletion */
  readonly reason?: string;
  /** User performing the action (for audit) */
  readonly performedBy?: string;
  /** Authorization context from the request */
  readonly authContext: AuthorizationContext;
}

/**
 * Result of listing clusters.
 */
export interface ListClustersResult {
  /** Array of cluster OrgUnits */
  readonly clusters: OrgUnit[];
  /** Total count of clusters */
  readonly totalCount: number;
}

/**
 * Result of getting cluster details.
 */
export interface ClusterDetailsResult {
  /** The cluster OrgUnit */
  readonly cluster: OrgUnit;
  /** Children OrgUnits of the cluster */
  readonly children: OrgUnit[];
  /** All descendants of the cluster */
  readonly descendants: OrgUnit[];
  /** Total count of descendants */
  readonly descendantCount: number;
}

/**
 * Result of cluster switch validation.
 */
export interface ClusterSwitchResult {
  /** Whether the switch is valid */
  readonly valid: boolean;
  /** The target cluster if valid */
  readonly cluster?: OrgUnit;
  /** New activeOrgUnitId to use in JWT/context */
  readonly newActiveOrgUnitId: string;
}

/**
 * Available clusters for a user within a tenant.
 */
export interface AvailableClustersResult {
  /** Clusters the user can access */
  readonly accessibleClusters: OrgUnit[];
  /** Total clusters in tenant (for reference) */
  readonly totalClustersInTenant: number;
  /** Whether user has full tenant scope (can access all clusters) */
  readonly hasFullTenantScope: boolean;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

/**
 * MultiClusterService interface.
 *
 * Provides operations for managing multiple clusters within a tenant.
 */
export interface IMultiClusterService {
  // ---------------------------------------------------------------------------
  // Cluster CRUD Operations
  // ---------------------------------------------------------------------------

  /**
   * Create a new cluster OrgUnit.
   *
   * Authorization:
   * - User must have 'cluster:create' permission
   * - User must have scope over the parent (or tenant-level for root)
   *
   * Validation:
   * - Parent must be ORGANIZATION type (or null for legacy support)
   * - Name must be non-empty
   *
   * @param command - The create cluster command
   * @returns DomainResult with created cluster OrgUnit or error
   */
  createCluster(command: CreateClusterCommand): Promise<DomainResult<CreateOrgUnitResult>>;

  /**
   * Delete a cluster OrgUnit.
   *
   * Authorization:
   * - User must have 'cluster:delete' permission
   * - User must have scope over the cluster
   *
   * Validation:
   * - Cluster must exist and be of type CLUSTER
   * - No active memberships (unless cascade)
   *
   * @param command - The delete cluster command
   * @returns DomainResult with delete result or error
   */
  deleteCluster(command: DeleteClusterCommand): Promise<DomainResult<DeleteOrgUnitResult>>;

  // ---------------------------------------------------------------------------
  // Cluster Query Operations
  // ---------------------------------------------------------------------------

  /**
   * List all clusters in a tenant.
   *
   * Authorization:
   * - User must have 'cluster:read' permission
   * - Returns only clusters within user's scope (unless tenant-level admin)
   *
   * @param tenantId - The tenant ID
   * @param authContext - The authorization context
   * @returns DomainResult with list of cluster OrgUnits
   */
  listClusters(
    tenantId: string,
    authContext: AuthorizationContext,
  ): Promise<DomainResult<ListClustersResult>>;

  /**
   * Get cluster details with its OrgUnit tree.
   *
   * Authorization:
   * - User must have 'cluster:read' permission
   * - User must have scope over the cluster
   *
   * @param clusterId - The cluster OrgUnit ID
   * @param tenantId - The tenant ID
   * @param authContext - The authorization context
   * @returns DomainResult with cluster details including children/descendants
   */
  getClusterDetails(
    clusterId: string,
    tenantId: string,
    authContext: AuthorizationContext,
  ): Promise<DomainResult<ClusterDetailsResult>>;

  /**
   * Get available clusters for a user within a tenant.
   *
   * Returns clusters the user can access based on their membership scope.
   *
   * @param tenantId - The tenant ID
   * @param authContext - The authorization context
   * @returns DomainResult with available clusters
   */
  getAvailableClusters(
    tenantId: string,
    authContext: AuthorizationContext,
  ): Promise<DomainResult<AvailableClustersResult>>;

  // ---------------------------------------------------------------------------
  // Cluster Navigation Operations
  // ---------------------------------------------------------------------------

  /**
   * Switch user context to a different cluster.
   *
   * Authorization:
   * - User must have 'cluster:switch' permission (or implicit via role)
   * - Target cluster must be within user's membership scope
   *
   * This validates the switch and returns the new activeOrgUnitId.
   * The caller is responsible for updating JWT/context.
   *
   * @param command - The switch cluster command
   * @returns DomainResult with switch result or error
   */
  switchCluster(command: SwitchClusterCommand): Promise<DomainResult<ClusterSwitchResult>>;

  /**
   * Validate if user can navigate to a cluster without performing the switch.
   *
   * @param clusterId - The target cluster ID
   * @param tenantId - The tenant ID
   * @param authContext - The authorization context
   * @returns DomainResult with true if navigation is allowed
   */
  canNavigateToCluster(
    clusterId: string,
    tenantId: string,
    authContext: AuthorizationContext,
  ): Promise<DomainResult<boolean>>;

  // ---------------------------------------------------------------------------
  // Cluster Scope Utilities
  // ---------------------------------------------------------------------------

  /**
   * Check if an OrgUnit is within a specific cluster's scope.
   *
   * @param orgUnitId - The OrgUnit ID to check
   * @param clusterId - The cluster OrgUnit ID
   * @param tenantId - The tenant ID
   * @returns DomainResult with true if OrgUnit is within cluster's subtree
   */
  isWithinCluster(
    orgUnitId: string,
    clusterId: string,
    tenantId: string,
  ): Promise<DomainResult<boolean>>;

  /**
   * Get the cluster that contains a given OrgUnit.
   *
   * Traverses up the hierarchy to find the nearest CLUSTER type ancestor.
   *
   * @param orgUnitId - The OrgUnit ID
   * @param tenantId - The tenant ID
   * @returns DomainResult with the containing cluster, or null if not in any cluster
   */
  getContainingCluster(
    orgUnitId: string,
    tenantId: string,
  ): Promise<DomainResult<OrgUnit | null>>;
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Roles that have implicit full tenant scope for cluster operations.
 */
const TENANT_LEVEL_MANAGEMENT_ROLES: ReadonlySet<MembershipRole> = new Set([
  MembershipRole.PLATFORM_ADMIN,
  MembershipRole.TENANT_OWNER,
]);

/**
 * Factory function to create a MultiClusterService instance.
 *
 * This pattern follows Clean Architecture DI principles — dependencies are
 * injected via the factory parameter, making the service testable and
 * decoupled from concrete implementations.
 *
 * @param dependencies - The service dependencies
 * @returns An implementation of IMultiClusterService
 */
export const MultiClusterServiceImpl = ({
  orgUnitRepository,
  orgUnitManagementService,
  hierarchyReader,
  orgUnitScopeAuthorizer,
}: {
  orgUnitRepository: IOrgUnitRepository;
  orgUnitManagementService: IOrgUnitManagementService;
  hierarchyReader: IOrgUnitHierarchyReader;
  orgUnitScopeAuthorizer: IOrgUnitScopeAuthorizer;
}): IMultiClusterService => {
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
      return fail(authInsufficientPermission(permission));
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
   */
  const hasTenantLevelScope = (authContext: AuthorizationContext): boolean => {
    return (
      TENANT_LEVEL_MANAGEMENT_ROLES.has(authContext.role) &&
      authContext.orgUnitId === null
    );
  };

  /**
   * Verify an OrgUnit is of type CLUSTER.
   */
  const verifyIsCluster = (orgUnit: OrgUnit): DomainResult<OrgUnit> => {
    if (orgUnit.type !== OrgUnitType.CLUSTER) {
      return fail(notACluster(orgUnit.id, orgUnit.type));
    }
    return ok(orgUnit);
  };

  /**
   * Get all clusters in tenant.
   */
  const getAllClustersInTenant = async (tenantId: string): Promise<OrgUnit[]> => {
    const allOrgUnits = await orgUnitRepository.findAllInTenant(tenantId);
    return allOrgUnits.filter((ou) => ou.type === OrgUnitType.CLUSTER);
  };

  // -------------------------------------------------------------------------
  // Service Implementation
  // -------------------------------------------------------------------------

  const service: IMultiClusterService = {
    // -------------------------------------------------------------------------
    // Cluster CRUD Operations
    // -------------------------------------------------------------------------

    async createCluster(
      command: CreateClusterCommand,
    ): Promise<DomainResult<CreateOrgUnitResult>> {
      const { tenantId, parentId, name, performedBy, authContext } = command;

      // Step 1: Validate auth context
      const authResult = validateAuthContext(authContext);
      if (!authResult.success) {
        return authResult;
      }

      // Step 2: Check permission
      const permissionResult = checkPermission(authContext, CLUSTER_PERMISSIONS.CREATE);
      if (!permissionResult.success) {
        return permissionResult;
      }

      // Step 3: Validate tenant match
      if (authContext.tenantId !== tenantId) {
        return fail({
          code: 'AUTH_TENANT_MISMATCH',
          type: 'authorization',
          message: `Cannot create cluster in different tenant`,
          userMessage: 'Anda tidak dapat membuat cluster di tenant lain.',
          retryable: false,
        });
      }

      // Step 4: Validate parent (must be ORGANIZATION type or null for legacy)
      if (parentId !== null) {
        const parent = await orgUnitRepository.findById(parentId, tenantId);
        if (!parent) {
          return fail({
            code: 'ORGUNIT_NOT_FOUND',
            type: 'not_found',
            message: `Parent OrgUnit not found: ${parentId}`,
            userMessage: 'Parent OrgUnit tidak ditemukan.',
            retryable: false,
          });
        }

        // CLUSTER can only be child of ORGANIZATION
        if (!canBeParent(parent.type, OrgUnitType.CLUSTER)) {
          return fail(invalidClusterParent(parentId, parent.type));
        }

        // Check scope over parent
        const scopeResult = await checkScope(parentId, authContext);
        if (!scopeResult.success) {
          return scopeResult;
        }
      } else {
        // Creating a root cluster - requires tenant-level scope
        if (!hasTenantLevelScope(authContext)) {
          return fail({
            code: 'AUTH_OUT_OF_SCOPE',
            type: 'authorization',
            message: 'Only tenant-level admins can create root clusters',
            userMessage: 'Hanya admin tenant yang dapat membuat cluster root.',
            retryable: false,
          });
        }
      }

      // Step 5: Delegate to OrgUnitManagementService
      const createCommand: CreateOrgUnitCommand = {
        tenantId,
        parentId,
        type: OrgUnitType.CLUSTER,
        name,
        performedBy: performedBy ?? authContext.userId,
      };

      return orgUnitManagementService.create(createCommand);
    },

    async deleteCluster(
      command: DeleteClusterCommand,
    ): Promise<DomainResult<DeleteOrgUnitResult>> {
      const { clusterId, tenantId, cascade, reason, performedBy, authContext } = command;

      // Step 1: Validate auth context
      const authResult = validateAuthContext(authContext);
      if (!authResult.success) {
        return authResult;
      }

      // Step 2: Check permission
      const permissionResult = checkPermission(authContext, CLUSTER_PERMISSIONS.DELETE);
      if (!permissionResult.success) {
        return permissionResult;
      }

      // Step 3: Validate tenant match
      if (authContext.tenantId !== tenantId) {
        return fail({
          code: 'AUTH_TENANT_MISMATCH',
          type: 'authorization',
          message: `Cannot delete cluster in different tenant`,
          userMessage: 'Anda tidak dapat menghapus cluster di tenant lain.',
          retryable: false,
        });
      }

      // Step 4: Verify cluster exists and is of type CLUSTER
      const cluster = await orgUnitRepository.findById(clusterId, tenantId);
      if (!cluster) {
        return fail(clusterNotFound(clusterId));
      }

      const verifyResult = verifyIsCluster(cluster);
      if (!verifyResult.success) {
        return verifyResult;
      }

      // Step 5: Check scope
      const scopeResult = await checkScope(clusterId, authContext);
      if (!scopeResult.success) {
        return scopeResult;
      }

      // Step 6: Delegate to OrgUnitManagementService
      return orgUnitManagementService.delete({
        orgUnitId: clusterId,
        tenantId,
        cascade,
        reason,
        performedBy: performedBy ?? authContext.userId,
      });
    },

    // -------------------------------------------------------------------------
    // Cluster Query Operations
    // -------------------------------------------------------------------------

    async listClusters(
      tenantId: string,
      authContext: AuthorizationContext,
    ): Promise<DomainResult<ListClustersResult>> {
      // Step 1: Validate auth context
      const authResult = validateAuthContext(authContext);
      if (!authResult.success) {
        return authResult;
      }

      // Step 2: Check permission
      const permissionResult = checkPermission(authContext, CLUSTER_PERMISSIONS.READ);
      if (!permissionResult.success) {
        return permissionResult;
      }

      // Step 3: Validate tenant match
      if (authContext.tenantId !== tenantId) {
        return fail({
          code: 'AUTH_TENANT_MISMATCH',
          type: 'authorization',
          message: `Cannot list clusters in different tenant`,
          userMessage: 'Anda tidak dapat melihat cluster di tenant lain.',
          retryable: false,
        });
      }

      // Step 4: Get all clusters in tenant
      const allClusters = await getAllClustersInTenant(tenantId);

      // Step 5: Filter by user's scope if not tenant-level admin
      let accessibleClusters: OrgUnit[];

      if (hasTenantLevelScope(authContext)) {
        accessibleClusters = allClusters;
      } else {
        // Filter to clusters within user's scope
        accessibleClusters = [];
        const membershipOrgUnitId = authContext.orgUnitId;

        if (membershipOrgUnitId) {
          for (const cluster of allClusters) {
            // Check if cluster is descendant of user's scope or user's scope is descendant of cluster
            const isInScopeResult = await hierarchyReader.isDescendantOrEqual(
              cluster.id,
              membershipOrgUnitId,
              tenantId,
            );

            if (isInScopeResult.success && isInScopeResult.data) {
              accessibleClusters.push(cluster);
            } else {
              // Also check if user's scope is within this cluster
              const scopeInClusterResult = await hierarchyReader.isDescendantOrEqual(
                membershipOrgUnitId,
                cluster.id,
                tenantId,
              );
              if (scopeInClusterResult.success && scopeInClusterResult.data) {
                accessibleClusters.push(cluster);
              }
            }
          }
        }
      }

      return ok({
        clusters: accessibleClusters,
        totalCount: accessibleClusters.length,
      });
    },

    async getClusterDetails(
      clusterId: string,
      tenantId: string,
      authContext: AuthorizationContext,
    ): Promise<DomainResult<ClusterDetailsResult>> {
      // Step 1: Validate auth context
      const authResult = validateAuthContext(authContext);
      if (!authResult.success) {
        return authResult;
      }

      // Step 2: Check permission
      const permissionResult = checkPermission(authContext, CLUSTER_PERMISSIONS.READ);
      if (!permissionResult.success) {
        return permissionResult;
      }

      // Step 3: Validate tenant match
      if (authContext.tenantId !== tenantId) {
        return fail({
          code: 'AUTH_TENANT_MISMATCH',
          type: 'authorization',
          message: `Cannot get cluster details in different tenant`,
          userMessage: 'Anda tidak dapat melihat detail cluster di tenant lain.',
          retryable: false,
        });
      }

      // Step 4: Get cluster
      const cluster = await orgUnitRepository.findById(clusterId, tenantId);
      if (!cluster) {
        return fail(clusterNotFound(clusterId));
      }

      // Step 5: Verify is CLUSTER type
      const verifyResult = verifyIsCluster(cluster);
      if (!verifyResult.success) {
        return verifyResult;
      }

      // Step 6: Check scope
      const canAccessResult = await service.canNavigateToCluster(clusterId, tenantId, authContext);
      if (!canAccessResult.success) {
        return canAccessResult;
      }
      if (!canAccessResult.data) {
        return fail(clusterSwitchOutOfScope(clusterId));
      }

      // Step 7: Get children and descendants
      const children = await orgUnitRepository.findChildren(clusterId, tenantId);
      const descendants = await orgUnitRepository.findDescendants(clusterId, tenantId);

      return ok({
        cluster,
        children,
        descendants,
        descendantCount: descendants.length,
      });
    },

    async getAvailableClusters(
      tenantId: string,
      authContext: AuthorizationContext,
    ): Promise<DomainResult<AvailableClustersResult>> {
      // Get all clusters in tenant
      const allClusters = await getAllClustersInTenant(tenantId);

      // Check if user has full tenant scope
      const hasFullScope = hasTenantLevelScope(authContext);

      if (hasFullScope) {
        return ok({
          accessibleClusters: allClusters,
          totalClustersInTenant: allClusters.length,
          hasFullTenantScope: true,
        });
      }

      // Filter clusters by user's scope
      const accessibleClusters: OrgUnit[] = [];
      const membershipOrgUnitId = authContext.orgUnitId;

      if (membershipOrgUnitId) {
        for (const cluster of allClusters) {
          // Check bidirectional: cluster in scope OR scope in cluster
          const isInScopeResult = await hierarchyReader.isDescendantOrEqual(
            cluster.id,
            membershipOrgUnitId,
            tenantId,
          );

          if (isInScopeResult.success && isInScopeResult.data) {
            accessibleClusters.push(cluster);
          } else {
            const scopeInClusterResult = await hierarchyReader.isDescendantOrEqual(
              membershipOrgUnitId,
              cluster.id,
              tenantId,
            );
            if (scopeInClusterResult.success && scopeInClusterResult.data) {
              accessibleClusters.push(cluster);
            }
          }
        }
      }

      return ok({
        accessibleClusters,
        totalClustersInTenant: allClusters.length,
        hasFullTenantScope: false,
      });
    },

    // -------------------------------------------------------------------------
    // Cluster Navigation Operations
    // -------------------------------------------------------------------------

    async switchCluster(
      command: SwitchClusterCommand,
    ): Promise<DomainResult<ClusterSwitchResult>> {
      const { clusterId, tenantId, authContext } = command;

      // Step 1: Validate auth context
      const authResult = validateAuthContext(authContext);
      if (!authResult.success) {
        return authResult;
      }

      // Step 2: Validate tenant match
      if (authContext.tenantId !== tenantId) {
        return fail(clusterSwitchTenantMismatch());
      }

      // Step 3: Get cluster
      const cluster = await orgUnitRepository.findById(clusterId, tenantId);
      if (!cluster) {
        return fail(clusterNotFound(clusterId));
      }

      // Step 4: Verify is CLUSTER type
      const verifyResult = verifyIsCluster(cluster);
      if (!verifyResult.success) {
        return verifyResult;
      }

      // Step 5: Check if user can navigate to this cluster
      const canNavigateResult = await service.canNavigateToCluster(
        clusterId,
        tenantId,
        authContext,
      );

      if (!canNavigateResult.success) {
        return canNavigateResult;
      }

      if (!canNavigateResult.data) {
        return fail(clusterSwitchOutOfScope(clusterId));
      }

      // Step 6: Return success with new context
      return ok({
        valid: true,
        cluster,
        newActiveOrgUnitId: clusterId,
      });
    },

    async canNavigateToCluster(
      clusterId: string,
      tenantId: string,
      authContext: AuthorizationContext,
    ): Promise<DomainResult<boolean>> {
      // Tenant-level admins can navigate to any cluster
      if (hasTenantLevelScope(authContext)) {
        // Just verify cluster exists
        const exists = await orgUnitRepository.exists(clusterId, tenantId);
        return ok(exists);
      }

      // For org-scoped users, check if cluster is in their scope
      const membershipOrgUnitId = authContext.orgUnitId;
      if (!membershipOrgUnitId) {
        return ok(false);
      }

      // Check if cluster is descendant of membership scope
      const clusterInScopeResult = await hierarchyReader.isDescendantOrEqual(
        clusterId,
        membershipOrgUnitId,
        tenantId,
      );

      if (clusterInScopeResult.success && clusterInScopeResult.data) {
        return ok(true);
      }

      // Check if membership scope is within the cluster (user can navigate to parent cluster)
      const scopeInClusterResult = await hierarchyReader.isDescendantOrEqual(
        membershipOrgUnitId,
        clusterId,
        tenantId,
      );

      if (scopeInClusterResult.success && scopeInClusterResult.data) {
        return ok(true);
      }

      return ok(false);
    },

    // -------------------------------------------------------------------------
    // Cluster Scope Utilities
    // -------------------------------------------------------------------------

    async isWithinCluster(
      orgUnitId: string,
      clusterId: string,
      tenantId: string,
    ): Promise<DomainResult<boolean>> {
      // Check if orgUnitId is a descendant of (or equal to) clusterId
      return hierarchyReader.isDescendantOrEqual(orgUnitId, clusterId, tenantId);
    },

    async getContainingCluster(
      orgUnitId: string,
      tenantId: string,
    ): Promise<DomainResult<OrgUnit | null>> {
      // Get the OrgUnit
      const orgUnit = await orgUnitRepository.findById(orgUnitId, tenantId);
      if (!orgUnit) {
        return fail({
          code: 'ORGUNIT_NOT_FOUND',
          type: 'not_found',
          message: `OrgUnit not found: ${orgUnitId}`,
          userMessage: 'OrgUnit tidak ditemukan.',
          retryable: false,
        });
      }

      // If this is a cluster, return itself
      if (orgUnit.type === OrgUnitType.CLUSTER) {
        return ok(orgUnit);
      }

      // Traverse up the path to find the nearest CLUSTER ancestor
      // Path contains all ancestor IDs including self
      for (const ancestorId of orgUnit.path) {
        if (ancestorId === orgUnitId) {
          continue; // Skip self
        }

        const ancestor = await orgUnitRepository.findById(ancestorId, tenantId);
        if (ancestor && ancestor.type === OrgUnitType.CLUSTER) {
          return ok(ancestor);
        }
      }

      // No cluster found in ancestry
      return ok(null);
    },
  };

  return service;
};

/**
 * Type alias for the factory function for cleaner DI registration.
 */
export type MultiClusterService = IMultiClusterService;
