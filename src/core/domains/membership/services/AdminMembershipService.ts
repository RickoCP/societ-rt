/**
 * AdminMembershipService — Domain service for admin membership management.
 *
 * This service provides administrative operations for managing memberships:
 * - List memberships with filtering and pagination
 * - Get membership details
 * - Update membership status (with authorization)
 * - Bulk status updates
 * - Export memberships for reporting
 *
 * **AUTHORIZATION RULES:**
 * - Admin must have appropriate role (TENANT_OWNER, ORG_ADMIN, RT_ADMIN)
 * - Operations must respect OrgUnit scope (admin can only manage memberships in their scope)
 * - Uses OrgUnitHierarchyReader for scope checking
 *
 * **AUDIT LOGGING:**
 * - All admin actions are logged with: adminUserId, targetMembershipId, action, reason, timestamp
 * - Includes before/after state for modifications
 *
 * **ERROR TYPES:**
 * - ADMIN_NOT_AUTHORIZED - Admin doesn't have required role
 * - ADMIN_OUT_OF_SCOPE - Target membership outside admin's scope
 * - MEMBERSHIP_NOT_FOUND - Target membership doesn't exist
 * - INVALID_BULK_OPERATION - Bulk operation parameters invalid
 * - BULK_OPERATION_PARTIAL_FAILURE - Some items in bulk operation failed
 *
 * @see FASE 1.18 Task 54: Admin Membership Management (Req 50)
 * @see Requirements 50 (Admin Membership Management)
 */

import type { DomainResult } from '@core/utils';
import { ok, fail, businessError, validationError } from '@core/utils';
import type { Membership } from '../entities';
import type { MembershipRole, MembershipStatus } from '../types';
import {
  MembershipRole as MembershipRoleEnum,
  MembershipStatus as MembershipStatusEnum,
} from '../types';
import type {
  IMembershipLifecycleService,
  TransitionStatusResult,
} from './MembershipLifecycleService';
import type { IOrgUnitHierarchyReader } from '@core/domains/orgunit/services';

// ---------------------------------------------------------------------------
// Admin Roles Configuration
// ---------------------------------------------------------------------------

/**
 * Roles that have admin privileges for membership management.
 * Sorted by scope hierarchy: TENANT_OWNER > ORG_ADMIN > RT_ADMIN
 */
export const ADMIN_ROLES: ReadonlySet<MembershipRole> = new Set([
  MembershipRoleEnum.TENANT_OWNER,
  MembershipRoleEnum.ORG_ADMIN,
  MembershipRoleEnum.RT_ADMIN,
]);

/**
 * Check if a role has admin privileges for membership management.
 */
export function isAdminRole(role: MembershipRole): boolean {
  return ADMIN_ROLES.has(role);
}

// ---------------------------------------------------------------------------
// Admin Context Types
// ---------------------------------------------------------------------------

/**
 * Admin context for authorization.
 * Contains information about the admin performing the action.
 */
export interface AdminContext {
  /** The admin's user ID */
  readonly userId: string;
  /** The admin's membership ID */
  readonly membershipId: string;
  /** The admin's tenant ID */
  readonly tenantId: string;
  /** The admin's OrgUnit ID (null for tenant-level admins) */
  readonly orgUnitId: string | null;
  /** The admin's role */
  readonly role: MembershipRole;
}

// ---------------------------------------------------------------------------
// Filter & Pagination Types
// ---------------------------------------------------------------------------

/**
 * Filters for listing memberships.
 */
export interface MembershipFilters {
  /** Filter by status(es) */
  readonly status?: MembershipStatus | MembershipStatus[];
  /** Filter by role(s) */
  readonly role?: MembershipRole | MembershipRole[];
  /** Filter by OrgUnit ID(s) - within admin's scope */
  readonly orgUnitId?: string | string[];
  /** Search by user name/email (partial match) */
  readonly userSearch?: string;
  /** Filter by created date range */
  readonly createdAfter?: Date;
  readonly createdBefore?: Date;
  /** Filter by updated date range */
  readonly updatedAfter?: Date;
  readonly updatedBefore?: Date;
}

/**
 * Pagination options.
 */
export interface PaginationOptions {
  /** Page number (1-indexed) */
  readonly page: number;
  /** Items per page (max 100) */
  readonly pageSize: number;
  /** Sort field */
  readonly sortBy?: 'createdAt' | 'updatedAt' | 'role' | 'status';
  /** Sort direction */
  readonly sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated result.
 */
export interface PaginatedResult<T> {
  /** The data items */
  readonly data: T[];
  /** Total count matching filters */
  readonly total: number;
  /** Current page number */
  readonly page: number;
  /** Items per page */
  readonly pageSize: number;
  /** Total number of pages */
  readonly totalPages: number;
}

// ---------------------------------------------------------------------------
// Export Types
// ---------------------------------------------------------------------------

/**
 * Export format options.
 */
export type ExportFormat = 'json' | 'csv';

/**
 * Membership export data.
 */
export interface MembershipExportData {
  /** The export format */
  readonly format: ExportFormat;
  /** The exported data (JSON string or CSV string) */
  readonly data: string;
  /** The total count of exported records */
  readonly count: number;
  /** When the export was generated */
  readonly generatedAt: Date;
}

// ---------------------------------------------------------------------------
// Bulk Operation Types
// ---------------------------------------------------------------------------

/**
 * Maximum batch size for bulk operations.
 */
export const MAX_BULK_BATCH_SIZE = 100;

/**
 * Result of a single item in a bulk operation.
 */
export interface BulkOperationItemResult {
  /** The membership ID */
  readonly membershipId: string;
  /** Whether the operation succeeded */
  readonly success: boolean;
  /** Error code if failed */
  readonly errorCode?: string;
  /** Error message if failed */
  readonly errorMessage?: string;
}

/**
 * Result of a bulk operation.
 */
export interface BulkOperationResult {
  /** Total items processed */
  readonly totalProcessed: number;
  /** Number of successful operations */
  readonly successCount: number;
  /** Number of failed operations */
  readonly failureCount: number;
  /** Results for each item */
  readonly results: BulkOperationItemResult[];
}

// ---------------------------------------------------------------------------
// Audit Event Types
// ---------------------------------------------------------------------------

/**
 * Admin action types for audit logging.
 */
export enum AdminActionType {
  /** Listed memberships */
  LIST_MEMBERSHIPS = 'LIST_MEMBERSHIPS',
  /** Viewed membership details */
  VIEW_MEMBERSHIP_DETAILS = 'VIEW_MEMBERSHIP_DETAILS',
  /** Updated membership status */
  UPDATE_MEMBERSHIP_STATUS = 'UPDATE_MEMBERSHIP_STATUS',
  /** Performed bulk status update */
  BULK_UPDATE_STATUS = 'BULK_UPDATE_STATUS',
  /** Exported memberships */
  EXPORT_MEMBERSHIPS = 'EXPORT_MEMBERSHIPS',
}

/**
 * Admin audit event payload.
 */
export interface AdminMembershipAuditEvent {
  /** The type of action */
  readonly action: AdminActionType;
  /** The admin's user ID */
  readonly adminUserId: string;
  /** The admin's membership ID */
  readonly adminMembershipId: string;
  /** The admin's role */
  readonly adminRole: MembershipRole;
  /** The tenant context */
  readonly tenantId: string;
  /** Target membership ID(s) - null for list/export operations */
  readonly targetMembershipIds: string[] | null;
  /** The reason provided for the action */
  readonly reason?: string;
  /** State before the action (for modifications) */
  readonly beforeState?: Record<string, unknown>;
  /** State after the action (for modifications) */
  readonly afterState?: Record<string, unknown>;
  /** Additional metadata */
  readonly metadata?: Record<string, unknown>;
  /** Timestamp of the event */
  readonly timestamp: Date;
}

/**
 * Audit emitter interface for admin membership operations.
 */
export interface IAdminMembershipAuditEmitter {
  /**
   * Emit an admin membership audit event.
   * @param event - The audit event to emit
   */
  emit(event: AdminMembershipAuditEvent): Promise<void>;
}

// ---------------------------------------------------------------------------
// Error Helpers
// ---------------------------------------------------------------------------

/**
 * Create an admin not authorized error.
 */
export function adminNotAuthorized(): ReturnType<typeof businessError> {
  return businessError(
    'ADMIN_NOT_AUTHORIZED',
    'Admin does not have the required role for this operation',
    { userMessage: 'You are not authorized to perform this action' },
  );
}

/**
 * Create an admin out of scope error.
 */
export function adminOutOfScope(): ReturnType<typeof businessError> {
  return businessError(
    'ADMIN_OUT_OF_SCOPE',
    'Target membership is outside the admin\'s organizational scope',
    { userMessage: 'You cannot manage memberships outside your organizational scope' },
  );
}

/**
 * Create a membership not found error.
 */
export function membershipNotFoundForAdmin(): ReturnType<typeof businessError> {
  return businessError(
    'MEMBERSHIP_NOT_FOUND',
    'Membership not found in the specified tenant',
    { userMessage: 'Membership not found' },
  );
}

/**
 * Create an invalid bulk operation error.
 */
export function invalidBulkOperation(reason: string): ReturnType<typeof validationError> {
  return validationError(
    'INVALID_BULK_OPERATION',
    reason,
    { userMessage: 'Invalid bulk operation parameters' },
  );
}

/**
 * Create a bulk operation partial failure error.
 */
export function bulkOperationPartialFailure(
  result: BulkOperationResult,
): ReturnType<typeof businessError> {
  return businessError(
    'BULK_OPERATION_PARTIAL_FAILURE',
    `Bulk operation partially failed: ${result.successCount} succeeded, ${result.failureCount} failed`,
    {
      userMessage: `Operation completed with ${result.failureCount} failure(s)`,
      result,
    },
  );
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

/**
 * IAdminMembershipService interface.
 *
 * Provides admin operations for managing memberships with proper
 * authorization, scope validation, and audit logging.
 */
export interface IAdminMembershipService {
  /**
   * List memberships within admin's scope.
   *
   * @param adminContext - The admin context for authorization
   * @param filters - Filters to apply
   * @param pagination - Pagination options
   * @returns Paginated list of memberships or error
   */
  listMemberships(
    adminContext: AdminContext,
    filters?: MembershipFilters,
    pagination?: PaginationOptions,
  ): Promise<DomainResult<PaginatedResult<Membership>>>;

  /**
   * Get detailed membership information.
   *
   * @param adminContext - The admin context for authorization
   * @param membershipId - The target membership ID
   * @returns Membership details or error
   */
  getMembershipDetails(
    adminContext: AdminContext,
    membershipId: string,
  ): Promise<DomainResult<Membership>>;

  /**
   * Update a membership's status.
   *
   * @param adminContext - The admin context for authorization
   * @param membershipId - The target membership ID
   * @param newStatus - The new status
   * @param reason - Reason for the status change
   * @returns Updated membership or error
   */
  updateMembershipStatus(
    adminContext: AdminContext,
    membershipId: string,
    newStatus: MembershipStatus,
    reason?: string,
  ): Promise<DomainResult<TransitionStatusResult>>;

  /**
   * Bulk update membership statuses.
   *
   * Operations are atomic per-item (individual failures don't roll back others).
   *
   * @param adminContext - The admin context for authorization
   * @param membershipIds - The target membership IDs (max 100)
   * @param newStatus - The new status to apply
   * @param reason - Reason for the status changes
   * @returns Bulk operation result
   */
  bulkUpdateStatus(
    adminContext: AdminContext,
    membershipIds: string[],
    newStatus: MembershipStatus,
    reason?: string,
  ): Promise<DomainResult<BulkOperationResult>>;

  /**
   * Export memberships for reporting.
   *
   * @param adminContext - The admin context for authorization
   * @param filters - Filters to apply
   * @param format - Export format (json or csv)
   * @returns Export data or error
   */
  exportMemberships(
    adminContext: AdminContext,
    filters?: MembershipFilters,
    format?: ExportFormat,
  ): Promise<DomainResult<MembershipExportData>>;

  /**
   * Check if admin can manage a specific membership.
   *
   * @param adminContext - The admin context
   * @param targetMembership - The target membership to check
   * @returns true if admin can manage the membership
   */
  canManageMembership(
    adminContext: AdminContext,
    targetMembership: Membership,
  ): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Repository Interface (for admin queries)
// ---------------------------------------------------------------------------

/**
 * Repository interface for admin membership queries.
 * Extends read capabilities for admin-specific operations.
 */
export interface IAdminMembershipRepository {
  /**
   * Find memberships with filters and pagination within a tenant.
   *
   * @param tenantId - The tenant context
   * @param filters - Filters to apply
   * @param pagination - Pagination options
   * @param scopeOrgUnitIds - OrgUnit IDs that are within admin's scope (null for tenant-wide)
   * @returns Paginated memberships
   */
  findWithFilters(
    tenantId: string,
    filters: MembershipFilters,
    pagination: PaginationOptions,
    scopeOrgUnitIds: string[] | null,
  ): Promise<PaginatedResult<Membership>>;

  /**
   * Find a membership by ID within a tenant.
   *
   * @param membershipId - The membership ID
   * @param tenantId - The tenant context
   * @returns The membership if found, null otherwise
   */
  findById(membershipId: string, tenantId: string): Promise<Membership | null>;

  /**
   * Count memberships matching filters.
   *
   * @param tenantId - The tenant context
   * @param filters - Filters to apply
   * @param scopeOrgUnitIds - OrgUnit IDs that are within admin's scope (null for tenant-wide)
   * @returns Count of matching memberships
   */
  countWithFilters(
    tenantId: string,
    filters: MembershipFilters,
    scopeOrgUnitIds: string[] | null,
  ): Promise<number>;
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create an AdminMembershipService instance.
 *
 * @param dependencies - The service dependencies
 * @returns An implementation of IAdminMembershipService
 */
export const AdminMembershipServiceImpl = ({
  adminMembershipRepository,
  membershipLifecycleService,
  orgUnitHierarchyReader,
  auditEmitter,
}: {
  adminMembershipRepository: IAdminMembershipRepository;
  membershipLifecycleService: IMembershipLifecycleService;
  orgUnitHierarchyReader: IOrgUnitHierarchyReader;
  auditEmitter: IAdminMembershipAuditEmitter;
}): IAdminMembershipService => {
  // -------------------------------------------------------------------------
  // Helper Functions
  // -------------------------------------------------------------------------

  /**
   * Validate that admin has an admin role.
   */
  const validateAdminRole = (adminContext: AdminContext): DomainResult<void> => {
    if (!isAdminRole(adminContext.role)) {
      return fail(adminNotAuthorized());
    }
    return ok(undefined);
  };

  /**
   * Check if target OrgUnit is within admin's scope.
   */
  const isWithinAdminScope = async (
    adminContext: AdminContext,
    targetOrgUnitId: string | null,
  ): Promise<boolean> => {
    // Tenant-level admin (TENANT_OWNER) has full tenant scope
    if (adminContext.orgUnitId === null) {
      return true;
    }

    // Target is tenant-level (null) but admin is org-scoped
    if (targetOrgUnitId === null) {
      return false;
    }

    // Check if target is descendant or equal to admin's OrgUnit
    const hierarchyResult = await orgUnitHierarchyReader.isDescendantOrEqual(
      targetOrgUnitId,
      adminContext.orgUnitId,
      adminContext.tenantId,
    );

    return hierarchyResult.success && hierarchyResult.data;
  };

  /**
   * Get all OrgUnit IDs within admin's scope (for filtering queries).
   * Returns null for tenant-level admins (all OrgUnits).
   */
  const getAdminScopeOrgUnitIds = async (
    adminContext: AdminContext,
  ): Promise<string[] | null> => {
    // Tenant-level admin has full tenant scope
    if (adminContext.orgUnitId === null) {
      return null;
    }

    // Get all descendants of admin's OrgUnit
    const descendantsResult = await orgUnitHierarchyReader.getDescendantsInclusive(
      adminContext.orgUnitId,
      adminContext.tenantId,
    );

    if (!descendantsResult.success) {
      return [adminContext.orgUnitId]; // Fallback to just admin's OrgUnit
    }

    return descendantsResult.data.map((ou) => ou.id);
  };

  /**
   * Emit an audit event.
   */
  const emitAuditEvent = async (
    action: AdminActionType,
    adminContext: AdminContext,
    targetMembershipIds: string[] | null,
    options?: {
      reason?: string;
      beforeState?: Record<string, unknown>;
      afterState?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> => {
    const event: AdminMembershipAuditEvent = {
      action,
      adminUserId: adminContext.userId,
      adminMembershipId: adminContext.membershipId,
      adminRole: adminContext.role,
      tenantId: adminContext.tenantId,
      targetMembershipIds,
      reason: options?.reason,
      beforeState: options?.beforeState,
      afterState: options?.afterState,
      metadata: options?.metadata,
      timestamp: new Date(),
    };

    await auditEmitter.emit(event);
  };

  /**
   * Validate pagination options.
   */
  const validatePagination = (
    pagination: PaginationOptions,
  ): DomainResult<PaginationOptions> => {
    const page = Math.max(1, pagination.page);
    const pageSize = Math.min(100, Math.max(1, pagination.pageSize));

    return ok({
      page,
      pageSize,
      sortBy: pagination.sortBy ?? 'createdAt',
      sortOrder: pagination.sortOrder ?? 'desc',
    });
  };

  /**
   * Convert membership to export row.
   */
  const membershipToExportRow = (m: Membership): Record<string, unknown> => ({
    id: m.id,
    userId: m.userId,
    tenantId: m.tenantId,
    orgUnitId: m.orgUnitId,
    role: m.role,
    status: m.status,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
    revokedAt: m.revokedAt?.toISOString() ?? null,
  });

  /**
   * Convert memberships to CSV string.
   */
  const membershipsToCsv = (memberships: Membership[]): string => {
    const headers = [
      'id',
      'userId',
      'tenantId',
      'orgUnitId',
      'role',
      'status',
      'createdAt',
      'updatedAt',
      'revokedAt',
    ];

    const rows = memberships.map((m) => {
      const row = membershipToExportRow(m);
      return headers.map((h) => {
        const value = row[h];
        if (value === null || value === undefined) {
          return '';
        }
        // Escape double quotes and wrap in quotes if needed
        const strValue = String(value);
        if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
          return `"${strValue.replace(/"/g, '""')}"`;
        }
        return strValue;
      }).join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  };

  // -------------------------------------------------------------------------
  // Service Implementation
  // -------------------------------------------------------------------------

  return {
    async listMemberships(
      adminContext: AdminContext,
      filters: MembershipFilters = {},
      pagination: PaginationOptions = { page: 1, pageSize: 20 },
    ): Promise<DomainResult<PaginatedResult<Membership>>> {
      // Step 1: Validate admin role
      const roleValidation = validateAdminRole(adminContext);
      if (!roleValidation.success) {
        return fail(roleValidation.error);
      }

      // Step 2: Validate pagination
      const paginationResult = validatePagination(pagination);
      if (!paginationResult.success) {
        return fail(paginationResult.error);
      }
      const validPagination = paginationResult.data;

      // Step 3: Get admin's scope OrgUnit IDs
      const scopeOrgUnitIds = await getAdminScopeOrgUnitIds(adminContext);

      // Step 4: Query memberships
      const result = await adminMembershipRepository.findWithFilters(
        adminContext.tenantId,
        filters,
        validPagination,
        scopeOrgUnitIds,
      );

      // Step 5: Emit audit event
      await emitAuditEvent(AdminActionType.LIST_MEMBERSHIPS, adminContext, null, {
        metadata: {
          filters,
          pagination: validPagination,
          resultCount: result.total,
        },
      });

      return ok(result);
    },

    async getMembershipDetails(
      adminContext: AdminContext,
      membershipId: string,
    ): Promise<DomainResult<Membership>> {
      // Step 1: Validate admin role
      const roleValidation = validateAdminRole(adminContext);
      if (!roleValidation.success) {
        return fail(roleValidation.error);
      }

      // Step 2: Get the membership
      const membership = await adminMembershipRepository.findById(
        membershipId,
        adminContext.tenantId,
      );

      if (!membership) {
        return fail(membershipNotFoundForAdmin());
      }

      // Step 3: Validate admin scope
      const withinScope = await isWithinAdminScope(adminContext, membership.orgUnitId);
      if (!withinScope) {
        return fail(adminOutOfScope());
      }

      // Step 4: Emit audit event
      await emitAuditEvent(
        AdminActionType.VIEW_MEMBERSHIP_DETAILS,
        adminContext,
        [membershipId],
      );

      return ok(membership);
    },

    async updateMembershipStatus(
      adminContext: AdminContext,
      membershipId: string,
      newStatus: MembershipStatus,
      reason?: string,
    ): Promise<DomainResult<TransitionStatusResult>> {
      // Step 1: Validate admin role
      const roleValidation = validateAdminRole(adminContext);
      if (!roleValidation.success) {
        return fail(roleValidation.error);
      }

      // Step 2: Get the membership
      const membership = await adminMembershipRepository.findById(
        membershipId,
        adminContext.tenantId,
      );

      if (!membership) {
        return fail(membershipNotFoundForAdmin());
      }

      // Step 3: Validate admin scope
      const withinScope = await isWithinAdminScope(adminContext, membership.orgUnitId);
      if (!withinScope) {
        return fail(adminOutOfScope());
      }

      // Step 4: Store before state for audit
      const beforeState = {
        status: membership.status,
        updatedAt: membership.updatedAt.toISOString(),
      };

      // Step 5: Perform status transition using lifecycle service
      let transitionResult: DomainResult<TransitionStatusResult>;

      switch (newStatus) {
        case MembershipStatusEnum.ACTIVE:
          // Could be activation or reactivation
          if (membership.status === MembershipStatusEnum.SUSPENDED) {
            transitionResult = await membershipLifecycleService.reactivate(
              membershipId,
              adminContext.tenantId,
              adminContext.userId,
            );
          } else {
            transitionResult = await membershipLifecycleService.activate(
              membershipId,
              adminContext.tenantId,
              adminContext.userId,
            );
          }
          break;

        case MembershipStatusEnum.SUSPENDED:
          transitionResult = await membershipLifecycleService.suspend(
            membershipId,
            adminContext.tenantId,
            reason,
            adminContext.userId,
          );
          break;

        case MembershipStatusEnum.REVOKED:
          transitionResult = await membershipLifecycleService.revoke(
            membershipId,
            adminContext.tenantId,
            reason,
            adminContext.userId,
          );
          break;

        default:
          transitionResult = await membershipLifecycleService.transitionStatus({
            membershipId,
            targetStatus: newStatus,
            tenantId: adminContext.tenantId,
            performedBy: adminContext.userId,
            reason,
          });
      }

      // Step 6: Emit audit event
      if (transitionResult.success) {
        await emitAuditEvent(
          AdminActionType.UPDATE_MEMBERSHIP_STATUS,
          adminContext,
          [membershipId],
          {
            reason,
            beforeState,
            afterState: {
              status: transitionResult.data.membership.status,
              updatedAt: transitionResult.data.membership.updatedAt.toISOString(),
            },
          },
        );
      }

      return transitionResult;
    },

    async bulkUpdateStatus(
      adminContext: AdminContext,
      membershipIds: string[],
      newStatus: MembershipStatus,
      reason?: string,
    ): Promise<DomainResult<BulkOperationResult>> {
      // Step 1: Validate admin role
      const roleValidation = validateAdminRole(adminContext);
      if (!roleValidation.success) {
        return fail(roleValidation.error);
      }

      // Step 2: Validate batch size
      if (membershipIds.length === 0) {
        return fail(invalidBulkOperation('No membership IDs provided'));
      }

      if (membershipIds.length > MAX_BULK_BATCH_SIZE) {
        return fail(
          invalidBulkOperation(
            `Batch size exceeds maximum of ${MAX_BULK_BATCH_SIZE}`,
          ),
        );
      }

      // Step 3: Remove duplicates
      const uniqueIds = [...new Set(membershipIds)];

      // Step 4: Process each membership individually (atomic per-item)
      const results: BulkOperationItemResult[] = [];
      const beforeStates: Record<string, unknown>[] = [];
      const afterStates: Record<string, unknown>[] = [];

      for (const membershipId of uniqueIds) {
        // Get the membership
        const membership = await adminMembershipRepository.findById(
          membershipId,
          adminContext.tenantId,
        );

        if (!membership) {
          results.push({
            membershipId,
            success: false,
            errorCode: 'MEMBERSHIP_NOT_FOUND',
            errorMessage: 'Membership not found',
          });
          continue;
        }

        // Check scope
        const withinScope = await isWithinAdminScope(adminContext, membership.orgUnitId);
        if (!withinScope) {
          results.push({
            membershipId,
            success: false,
            errorCode: 'ADMIN_OUT_OF_SCOPE',
            errorMessage: 'Membership outside admin scope',
          });
          continue;
        }

        // Store before state
        beforeStates.push({
          membershipId,
          status: membership.status,
        });

        // Perform transition
        const transitionResult = await this.updateMembershipStatus(
          adminContext,
          membershipId,
          newStatus,
          reason,
        );

        if (transitionResult.success) {
          results.push({
            membershipId,
            success: true,
          });
          afterStates.push({
            membershipId,
            status: transitionResult.data.membership.status,
          });
        } else {
          results.push({
            membershipId,
            success: false,
            errorCode: transitionResult.error.code,
            errorMessage: transitionResult.error.message,
          });
        }
      }

      // Step 5: Calculate summary
      const successCount = results.filter((r) => r.success).length;
      const failureCount = results.filter((r) => !r.success).length;

      const bulkResult: BulkOperationResult = {
        totalProcessed: uniqueIds.length,
        successCount,
        failureCount,
        results,
      };

      // Step 6: Emit audit event for bulk operation
      await emitAuditEvent(
        AdminActionType.BULK_UPDATE_STATUS,
        adminContext,
        uniqueIds,
        {
          reason,
          beforeState: { items: beforeStates },
          afterState: { items: afterStates },
          metadata: {
            newStatus,
            totalProcessed: uniqueIds.length,
            successCount,
            failureCount,
          },
        },
      );

      // Step 7: Return result (partial failure is still a success with details)
      if (failureCount > 0 && successCount > 0) {
        // Partial failure - still return ok with the result
        return ok(bulkResult);
      }

      if (failureCount > 0 && successCount === 0) {
        // Complete failure
        return fail(bulkOperationPartialFailure(bulkResult));
      }

      return ok(bulkResult);
    },

    async exportMemberships(
      adminContext: AdminContext,
      filters: MembershipFilters = {},
      format: ExportFormat = 'json',
    ): Promise<DomainResult<MembershipExportData>> {
      // Step 1: Validate admin role
      const roleValidation = validateAdminRole(adminContext);
      if (!roleValidation.success) {
        return fail(roleValidation.error);
      }

      // Step 2: Get admin's scope OrgUnit IDs
      const scopeOrgUnitIds = await getAdminScopeOrgUnitIds(adminContext);

      // Step 3: Get all matching memberships (no pagination for export)
      // We use a large page size to get all results
      const result = await adminMembershipRepository.findWithFilters(
        adminContext.tenantId,
        filters,
        { page: 1, pageSize: 10000 }, // Large limit for export
        scopeOrgUnitIds,
      );

      // Step 4: Convert to export format
      let exportData: string;

      if (format === 'csv') {
        exportData = membershipsToCsv(result.data);
      } else {
        exportData = JSON.stringify(
          result.data.map(membershipToExportRow),
          null,
          2,
        );
      }

      const exportResult: MembershipExportData = {
        format,
        data: exportData,
        count: result.data.length,
        generatedAt: new Date(),
      };

      // Step 5: Emit audit event
      await emitAuditEvent(
        AdminActionType.EXPORT_MEMBERSHIPS,
        adminContext,
        null,
        {
          metadata: {
            filters,
            format,
            exportCount: result.data.length,
          },
        },
      );

      return ok(exportResult);
    },

    async canManageMembership(
      adminContext: AdminContext,
      targetMembership: Membership,
    ): Promise<boolean> {
      // Check admin role
      if (!isAdminRole(adminContext.role)) {
        return false;
      }

      // Check tenant match
      if (targetMembership.tenantId !== adminContext.tenantId) {
        return false;
      }

      // Check scope
      return isWithinAdminScope(adminContext, targetMembership.orgUnitId);
    },
  };
};

/**
 * Type alias for the factory function for cleaner DI registration.
 */
export type AdminMembershipService = IAdminMembershipService;
