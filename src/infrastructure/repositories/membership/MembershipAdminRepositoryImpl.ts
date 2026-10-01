/**
 * MembershipAdminRepositoryImpl — Infrastructure implementation of MembershipAdminRepository.
 *
 * This repository provides Admin UI membership operations by calling the backend API.
 * It maps API responses to domain entities and handles errors appropriately.
 *
 * **SCOPE-BASED FILTERING:**
 * - Tenant-level admins (null actorOrgUnitId): receive all members in tenant
 * - Org-scoped admins (non-null actorOrgUnitId): receive members in their scope and descendants
 * The backend API enforces scope filtering based on the authorization context.
 *
 * **ERROR HANDLING:**
 * - Maps API errors to appropriate AppError types
 * - Returns DomainResult<T> for explicit success/error handling
 * - Never exposes internal error details to callers
 *
 * @see Requirements 2.3-2.8 (Member List Screen)
 * @see MembershipAdminRepository interface for full contract
 */

import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError, notFoundError, validationError } from '@core/utils';
import type {
  MembershipAdminRepository,
  InviteMemberInput,
  BulkInviteMemberInput,
  BulkInviteResult,
  ChangeMemberStatusInput,
  ChangeMemberRoleInput,
} from '@core/domains/membership/repositories/MembershipAdminRepository';
import type {
  Member,
  MemberSummary,
  PaginatedMembers,
  RoleChangeHistory,
} from '@core/domains/membership/entities/Member';
import type { MemberListQueryOptions } from '@core/domains/membership/entities/MemberFilters';
import type { MembershipRole } from '@core/domains/membership/types/MembershipRole';
import type { MembershipStatus } from '@core/domains/membership/types/MembershipStatus';
import type { HttpProtocol } from '@core/protocols';

// ---------------------------------------------------------------------------
// API Response Types
// ---------------------------------------------------------------------------

/**
 * API response for a single member.
 */
interface MemberApiResponse {
  id: string;
  userId: string;
  tenantId: string;
  orgUnitId: string | null;
  orgUnitName: string | null;
  role: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  revokedAt?: string;
  // User profile fields
  name: string;
  email: string;
  profilePictureUrl?: string;
  phoneNumber?: string;
}

/**
 * API response for paginated members.
 */
interface PaginatedMembersApiResponse {
  members: MemberApiResponse[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

/**
 * API response for role change history.
 */
interface RoleChangeHistoryApiResponse {
  id: string;
  previousRole: string;
  newRole: string;
  previousOrgUnitId: string | null;
  newOrgUnitId: string | null;
  changedAt: string;
  changedBy: {
    id: string;
    name: string;
    email: string;
  };
  reason?: string;
}

/**
 * API response for member summary (search results).
 */
interface MemberSummaryApiResponse {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  orgUnitId: string | null;
  orgUnitName: string | null;
  profilePictureUrl?: string;
}

/**
 * API response for invitation result.
 */
interface InviteResultApiResponse {
  invitationId: string;
}

/**
 * API response for bulk invite result.
 */
interface BulkInviteResultApiResponse {
  successes: string[];
  failures: Array<{
    email: string;
    errorCode: string;
    errorMessage: string;
  }>;
}

/**
 * API response for bulk operation result.
 */
interface BulkOperationResultApiResponse {
  successes: string[];
  failures: Array<{
    membershipId: string;
    errorCode: string;
    errorMessage: string;
  }>;
}

/**
 * API error response.
 */
interface ApiErrorResponse {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

/**
 * Maps API member response to domain Member entity.
 */
function mapMemberFromApi(api: MemberApiResponse): Member {
  return {
    id: api.id,
    userId: api.userId,
    tenantId: api.tenantId,
    orgUnitId: api.orgUnitId,
    orgUnitName: api.orgUnitName,
    role: api.role as MembershipRole,
    status: api.status as MembershipStatus,
    createdAt: new Date(api.createdAt),
    updatedAt: new Date(api.updatedAt),
    revokedAt: api.revokedAt ? new Date(api.revokedAt) : undefined,
    name: api.name,
    email: api.email,
    profilePictureUrl: api.profilePictureUrl,
    phoneNumber: api.phoneNumber,
  };
}

/**
 * Maps API paginated response to domain PaginatedMembers.
 */
function mapPaginatedMembersFromApi(api: PaginatedMembersApiResponse): PaginatedMembers {
  return {
    members: api.members.map(mapMemberFromApi),
    page: api.page,
    pageSize: api.pageSize,
    totalCount: api.totalCount,
    totalPages: api.totalPages,
  };
}

/**
 * Maps API role change history to domain RoleChangeHistory.
 */
function mapRoleChangeHistoryFromApi(api: RoleChangeHistoryApiResponse): RoleChangeHistory {
  return {
    id: api.id,
    previousRole: api.previousRole as MembershipRole,
    newRole: api.newRole as MembershipRole,
    previousOrgUnitId: api.previousOrgUnitId,
    newOrgUnitId: api.newOrgUnitId,
    changedAt: new Date(api.changedAt),
    changedBy: api.changedBy,
    reason: api.reason,
  };
}

/**
 * Maps API member summary to domain MemberSummary.
 */
function mapMemberSummaryFromApi(api: MemberSummaryApiResponse): MemberSummary {
  return {
    id: api.id,
    userId: api.userId,
    name: api.name,
    email: api.email,
    role: api.role as MembershipRole,
    orgUnitId: api.orgUnitId,
    orgUnitName: api.orgUnitName,
    profilePictureUrl: api.profilePictureUrl,
  };
}

/**
 * Maps API error to DomainResult failure.
 */
function mapApiError<T>(error: unknown): DomainResult<T> {
  // Handle axios-like error response
  const errorResponse = error as { response?: { status?: number; data?: ApiErrorResponse } };
  const status = errorResponse?.response?.status;
  const data = errorResponse?.response?.data;

  if (status === 404) {
    return fail(notFoundError(
      data?.code ?? 'MEMBERSHIP_NOT_FOUND',
      data?.message ?? 'Member not found',
    ));
  }

  if (status === 400) {
    return fail(validationError(
      data?.code ?? 'VALIDATION_ERROR',
      data?.message ?? 'Invalid request',
    ));
  }

  if (status === 403) {
    return fail({
      type: 'authorization',
      code: data?.code ?? 'AUTH_FORBIDDEN',
      message: data?.message ?? 'Access denied',
      retryable: false,
    });
  }

  // Generic technical error for unknown cases
  return fail(technicalError(
    data?.code ?? 'MEMBERSHIP_API_ERROR',
    data?.message ?? 'Failed to process membership operation',
    { retryable: true },
  ));
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a MembershipAdminRepository implementation.
 *
 * @param dependencies - The repository dependencies
 * @returns An implementation of MembershipAdminRepository
 */
export const MembershipAdminRepositoryImpl = ({
  httpProtocol,
}: {
  httpProtocol: HttpProtocol;
}): MembershipAdminRepository => {
  const baseUrl = '/api/admin/members';

  return {
    // -------------------------------------------------------------------------
    // List/Query Operations
    // -------------------------------------------------------------------------

    /**
     * List members with pagination, sorting, and filtering.
     *
     * @see MembershipAdminRepository.listMembers
     */
    async listMembers(
      tenantId: string,
      actorOrgUnitId: string | null,
      options: MemberListQueryOptions,
    ): Promise<DomainResult<PaginatedMembers>> {
      try {
        // Build query parameters
        const params = new URLSearchParams();
        params.set('tenantId', tenantId);
        
        if (actorOrgUnitId !== null) {
          params.set('actorOrgUnitId', actorOrgUnitId);
        }

        // Pagination
        params.set('page', String(options.pagination.page));
        params.set('pageSize', String(options.pagination.pageSize));

        // Sorting
        if (options.sort) {
          params.set('sortColumn', options.sort.column);
          params.set('sortDirection', options.sort.direction);
        }

        // Filters
        if (options.filters) {
          if (options.filters.search) {
            params.set('search', options.filters.search);
          }
          if (options.filters.role) {
            params.set('role', options.filters.role);
          }
          if (options.filters.status) {
            params.set('status', options.filters.status);
          }
          if (options.filters.orgUnitId) {
            params.set('filterOrgUnitId', options.filters.orgUnitId);
          }
          if (options.filters.includeDescendants !== undefined) {
            params.set('includeDescendants', String(options.filters.includeDescendants));
          }
        }

        const response = await httpProtocol.get<PaginatedMembersApiResponse>(
          `${baseUrl}?${params.toString()}`,
        );

        return ok(mapPaginatedMembersFromApi(response));
      } catch (error) {
        return mapApiError<PaginatedMembers>(error);
      }
    },

    /**
     * Get a single member by membership ID.
     *
     * @see MembershipAdminRepository.getMember
     */
    async getMember(
      membershipId: string,
      tenantId: string,
    ): Promise<DomainResult<Member>> {
      try {
        const params = new URLSearchParams({ tenantId });
        const response = await httpProtocol.get<MemberApiResponse>(
          `${baseUrl}/${membershipId}?${params.toString()}`,
        );

        return ok(mapMemberFromApi(response));
      } catch (error) {
        return mapApiError<Member>(error);
      }
    },

    /**
     * Get role change history for a member.
     *
     * @see MembershipAdminRepository.getRoleChangeHistory
     */
    async getRoleChangeHistory(
      membershipId: string,
      tenantId: string,
    ): Promise<DomainResult<RoleChangeHistory[]>> {
      try {
        const params = new URLSearchParams({ tenantId });
        const response = await httpProtocol.get<RoleChangeHistoryApiResponse[]>(
          `${baseUrl}/${membershipId}/history?${params.toString()}`,
        );

        return ok(response.map(mapRoleChangeHistoryFromApi));
      } catch (error) {
        return mapApiError<RoleChangeHistory[]>(error);
      }
    },

    /**
     * Search members by name or email.
     *
     * @see MembershipAdminRepository.searchMembers
     */
    async searchMembers(
      tenantId: string,
      actorOrgUnitId: string | null,
      query: string,
      excludeIds?: string[],
      limit?: number,
    ): Promise<DomainResult<MemberSummary[]>> {
      try {
        const params = new URLSearchParams();
        params.set('tenantId', tenantId);
        params.set('query', query);
        
        if (actorOrgUnitId !== null) {
          params.set('actorOrgUnitId', actorOrgUnitId);
        }
        if (excludeIds?.length) {
          params.set('excludeIds', excludeIds.join(','));
        }
        if (limit !== undefined) {
          params.set('limit', String(limit));
        }

        const response = await httpProtocol.get<MemberSummaryApiResponse[]>(
          `${baseUrl}/search?${params.toString()}`,
        );

        return ok(response.map(mapMemberSummaryFromApi));
      } catch (error) {
        return mapApiError<MemberSummary[]>(error);
      }
    },

    // -------------------------------------------------------------------------
    // Invitation Operations
    // -------------------------------------------------------------------------

    /**
     * Invite a new member to the tenant.
     *
     * @see MembershipAdminRepository.inviteMember
     */
    async inviteMember(
      tenantId: string,
      actorMembershipId: string,
      input: InviteMemberInput,
    ): Promise<DomainResult<{ invitationId: string }>> {
      try {
        const response = await httpProtocol.post<InviteResultApiResponse>(
          `${baseUrl}/invite`,
          {
            tenantId,
            actorMembershipId,
            email: input.email,
            role: input.role,
            orgUnitId: input.orgUnitId,
          },
        );

        return ok({ invitationId: response.invitationId });
      } catch (error) {
        return mapApiError<{ invitationId: string }>(error);
      }
    },

    /**
     * Invite multiple members in a single batch.
     *
     * @see MembershipAdminRepository.bulkInviteMembers
     */
    async bulkInviteMembers(
      tenantId: string,
      actorMembershipId: string,
      input: BulkInviteMemberInput,
    ): Promise<DomainResult<BulkInviteResult>> {
      try {
        const response = await httpProtocol.post<BulkInviteResultApiResponse>(
          `${baseUrl}/invite/bulk`,
          {
            tenantId,
            actorMembershipId,
            emails: input.emails,
            role: input.role,
            orgUnitId: input.orgUnitId,
          },
        );

        return ok({
          successes: response.successes,
          failures: response.failures,
        });
      } catch (error) {
        return mapApiError<BulkInviteResult>(error);
      }
    },

    /**
     * Resend an invitation email.
     *
     * @see MembershipAdminRepository.resendInvitation
     */
    async resendInvitation(
      membershipId: string,
      tenantId: string,
    ): Promise<DomainResult<void>> {
      try {
        await httpProtocol.post<void>(
          `${baseUrl}/${membershipId}/resend-invitation`,
          { tenantId },
        );

        return ok(undefined);
      } catch (error) {
        return mapApiError<void>(error);
      }
    },

    /**
     * Cancel a pending invitation.
     *
     * @see MembershipAdminRepository.cancelInvitation
     */
    async cancelInvitation(
      membershipId: string,
      tenantId: string,
    ): Promise<DomainResult<void>> {
      try {
        await httpProtocol.post<void>(
          `${baseUrl}/${membershipId}/cancel-invitation`,
          { tenantId },
        );

        return ok(undefined);
      } catch (error) {
        return mapApiError<void>(error);
      }
    },

    // -------------------------------------------------------------------------
    // Status Management Operations
    // -------------------------------------------------------------------------

    /**
     * Change a member's status.
     *
     * @see MembershipAdminRepository.changeMemberStatus
     */
    async changeMemberStatus(
      membershipId: string,
      tenantId: string,
      actorMembershipId: string,
      input: ChangeMemberStatusInput,
    ): Promise<DomainResult<Member>> {
      try {
        const response = await httpProtocol.patch<MemberApiResponse>(
          `${baseUrl}/${membershipId}/status`,
          {
            tenantId,
            actorMembershipId,
            newStatus: input.newStatus,
            reason: input.reason,
          },
        );

        return ok(mapMemberFromApi(response));
      } catch (error) {
        return mapApiError<Member>(error);
      }
    },

    // -------------------------------------------------------------------------
    // Role Management Operations
    // -------------------------------------------------------------------------

    /**
     * Change a member's role and/or OrgUnit assignment.
     *
     * @see MembershipAdminRepository.changeMemberRole
     */
    async changeMemberRole(
      membershipId: string,
      tenantId: string,
      actorMembershipId: string,
      input: ChangeMemberRoleInput,
    ): Promise<DomainResult<Member>> {
      try {
        const response = await httpProtocol.patch<MemberApiResponse>(
          `${baseUrl}/${membershipId}/role`,
          {
            tenantId,
            actorMembershipId,
            newRole: input.newRole,
            newOrgUnitId: input.newOrgUnitId,
            reason: input.reason,
          },
        );

        return ok(mapMemberFromApi(response));
      } catch (error) {
        return mapApiError<Member>(error);
      }
    },

    // -------------------------------------------------------------------------
    // Bulk Operations
    // -------------------------------------------------------------------------

    /**
     * Perform bulk status change on multiple members.
     *
     * @see MembershipAdminRepository.bulkChangeMemberStatus
     */
    async bulkChangeMemberStatus(
      membershipIds: string[],
      tenantId: string,
      actorMembershipId: string,
      input: ChangeMemberStatusInput,
    ): Promise<DomainResult<{
      successes: string[];
      failures: Array<{
        membershipId: string;
        errorCode: string;
        errorMessage: string;
      }>;
    }>> {
      try {
        const response = await httpProtocol.post<BulkOperationResultApiResponse>(
          `${baseUrl}/bulk/status`,
          {
            membershipIds,
            tenantId,
            actorMembershipId,
            newStatus: input.newStatus,
            reason: input.reason,
          },
        );

        return ok({
          successes: response.successes,
          failures: response.failures,
        });
      } catch (error) {
        return mapApiError<{
          successes: string[];
          failures: Array<{
            membershipId: string;
            errorCode: string;
            errorMessage: string;
          }>;
        }>(error);
      }
    },

    /**
     * Perform bulk role change on multiple members.
     *
     * @see MembershipAdminRepository.bulkChangeMemberRole
     */
    async bulkChangeMemberRole(
      membershipIds: string[],
      tenantId: string,
      actorMembershipId: string,
      input: ChangeMemberRoleInput,
    ): Promise<DomainResult<{
      successes: string[];
      failures: Array<{
        membershipId: string;
        errorCode: string;
        errorMessage: string;
      }>;
    }>> {
      try {
        const response = await httpProtocol.post<BulkOperationResultApiResponse>(
          `${baseUrl}/bulk/role`,
          {
            membershipIds,
            tenantId,
            actorMembershipId,
            newRole: input.newRole,
            newOrgUnitId: input.newOrgUnitId,
            reason: input.reason,
          },
        );

        return ok({
          successes: response.successes,
          failures: response.failures,
        });
      } catch (error) {
        return mapApiError<{
          successes: string[];
          failures: Array<{
            membershipId: string;
            errorCode: string;
            errorMessage: string;
          }>;
        }>(error);
      }
    },
  };
};
