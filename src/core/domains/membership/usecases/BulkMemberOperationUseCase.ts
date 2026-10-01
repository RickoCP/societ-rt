/**
 * BulkMemberOperationUseCase — Handles bulk member operations for Admin UI.
 *
 * This use case orchestrates bulk operations on multiple members,
 * including status changes (suspend, activate, revoke) and role changes.
 * Operations are processed sequentially with progress tracking.
 *
 * **KEY BEHAVIORS:**
 * - Processes operations sequentially (not in parallel)
 * - Tracks progress (completed count, successes, failures)
 * - Continues processing on individual failures (no rollback)
 * - Returns comprehensive summary results
 * - Respects batch size limits (100 members max)
 *
 * **ORCHESTRATION FLOW:**
 * 1. Validate actor has required permission
 * 2. Validate batch size limit
 * 3. Process each operation sequentially
 * 4. Track progress and accumulate results
 * 5. Return summary with successes and failures
 *
 * @see Requirements 6.6 (sequential processing, progress, continue on failure)
 * @see Requirements 6.7 (continue processing, display error report)
 * @see Design Components and Interfaces > 5. Bulk Operations
 */

import type { DomainResult } from '@core/utils';
import { ok, fail, validationError, businessError } from '@core/utils';
import type { Member } from '../entities/Member';
import type {
  MembershipAdminRepository,
  ChangeMemberStatusInput,
  ChangeMemberRoleInput,
} from '../repositories/MembershipAdminRepository';
import { BULK_OPERATION_LIMITS } from '../repositories/MembershipAdminRepository';
import type { MembershipRole } from '../types/MembershipRole';
import type { MembershipStatus } from '../types/MembershipStatus';
import { authInsufficientPermission, authNoMembership } from '../errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Operation type for bulk operations.
 */
export type BulkOperationType =
  | 'SUSPEND'
  | 'ACTIVATE'
  | 'REVOKE'
  | 'CHANGE_ROLE';

/**
 * Progress tracking for bulk operations.
 * Updated during sequential processing.
 *
 * @see Requirements 6.6 (progress tracking)
 */
export interface BulkOperationProgress {
  /** Total number of members to process. */
  readonly total: number;
  /** Number of members processed so far. */
  readonly completed: number;
  /** Membership IDs of successful operations. */
  readonly successes: string[];
  /** Details of failed operations. */
  readonly failures: BulkOperationFailure[];
  /** Current processing status. */
  readonly status: 'pending' | 'running' | 'completed';
}

/**
 * Failure details for a single operation in a bulk batch.
 */
export interface BulkOperationFailure {
  /** The membership ID that failed. */
  readonly membershipId: string;
  /** Error code for programmatic handling. */
  readonly errorCode: string;
  /** Human-readable error message. */
  readonly errorMessage: string;
}

/**
 * Summary result of a bulk operation.
 *
 * @see Requirements 6.6 (summary results), 6.7 (error report)
 */
export interface BulkOperationResult {
  /** Total number of members processed. */
  readonly total: number;
  /** Number of successful operations. */
  readonly successCount: number;
  /** Number of failed operations. */
  readonly failureCount: number;
  /** Membership IDs of successful operations. */
  readonly successes: string[];
  /** Details of failed operations. */
  readonly failures: BulkOperationFailure[];
  /** Whether all operations succeeded. */
  readonly allSucceeded: boolean;
  /** Whether all operations failed. */
  readonly allFailed: boolean;
}

/**
 * Base input for all bulk operations.
 */
interface BulkOperationBaseInput {
  /**
   * The tenant context for operations.
   */
  readonly tenantId: string;

  /**
   * The actor's membership ID (for audit).
   */
  readonly actorMembershipId: string;

  /**
   * The actor's role (for delegation validation).
   */
  readonly actorRole: MembershipRole;

  /**
   * The actor's membership status (must be ACTIVE).
   */
  readonly actorStatus: MembershipStatus;

  /**
   * Whether the actor has the required permission.
   */
  readonly hasWritePermission: boolean;

  /**
   * List of membership IDs to operate on.
   * Limited to 100 members per batch.
   */
  readonly membershipIds: string[];

  /**
   * Optional progress callback for UI updates.
   * Called after each operation completes.
   */
  readonly onProgress?: (progress: BulkOperationProgress) => void;
}

/**
 * Input for bulk status change operations (suspend, activate, revoke).
 */
export interface BulkStatusChangeInput extends BulkOperationBaseInput {
  /**
   * The operation type.
   */
  readonly operationType: 'SUSPEND' | 'ACTIVATE' | 'REVOKE';

  /**
   * Optional reason for the status change (used for audit).
   */
  readonly reason?: string;
}

/**
 * Input for bulk role change operations.
 */
export interface BulkRoleChangeInput extends BulkOperationBaseInput {
  /**
   * The operation type (must be CHANGE_ROLE).
   */
  readonly operationType: 'CHANGE_ROLE';

  /**
   * The new role to assign to all selected members.
   */
  readonly newRole: MembershipRole;

  /**
   * The new OrgUnit assignment (required for org-scoped roles).
   */
  readonly newOrgUnitId: string | null;

  /**
   * Optional reason for the role change (used for audit).
   */
  readonly reason?: string;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * BulkMemberOperationUseCase interface — handles bulk member operations.
 */
export interface BulkMemberOperationUseCase {
  /**
   * Execute a bulk status change operation.
   *
   * Processes operations sequentially, tracking progress and continuing
   * on individual failures. Returns summary with all successes and failures.
   *
   * @param input - The bulk status change input
   * @returns DomainResult with operation summary
   *
   * @see Requirements 6.6, 6.7
   */
  executeStatusChange(
    input: BulkStatusChangeInput,
  ): Promise<DomainResult<BulkOperationResult>>;

  /**
   * Execute a bulk role change operation.
   *
   * Processes operations sequentially, tracking progress and continuing
   * on individual failures. Returns summary with all successes and failures.
   *
   * @param input - The bulk role change input
   * @returns DomainResult with operation summary
   *
   * @see Requirements 6.6, 6.7
   */
  executeRoleChange(
    input: BulkRoleChangeInput,
  ): Promise<DomainResult<BulkOperationResult>>;
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a BulkMemberOperationUseCase instance.
 *
 * @param dependencies - The use case dependencies
 * @returns An implementation of BulkMemberOperationUseCase
 */
export const BulkMemberOperationUseCaseImpl = ({
  membershipAdminRepository,
}: {
  membershipAdminRepository: MembershipAdminRepository;
}): BulkMemberOperationUseCase => {
  /**
   * Validate common bulk operation inputs.
   */
  const validateCommonInputs = (
    input: BulkOperationBaseInput,
  ): DomainResult<void> => {
    // Step 1: Validate actor has permission
    if (!input.hasWritePermission) {
      return fail(authInsufficientPermission(['membership:write']));
    }

    // Step 2: Validate tenantId is provided
    if (!input.tenantId) {
      return fail(authNoMembership());
    }

    // Step 3: Validate actor's membership is ACTIVE
    if (input.actorStatus !== 'ACTIVE') {
      return fail(
        businessError(
          'ACTOR_MEMBERSHIP_INACTIVE',
          'Actor membership must be ACTIVE to perform bulk operations',
          { userMessage: 'Your membership is not active.' },
        ),
      );
    }

    // Step 4: Validate batch size limit
    if (input.membershipIds.length === 0) {
      return fail(
        validationError(
          'VALIDATION_EMPTY_BATCH',
          'At least one member must be selected for bulk operation',
          { userMessage: 'Please select at least one member.' },
        ),
      );
    }

    if (input.membershipIds.length > BULK_OPERATION_LIMITS.STATUS_CHANGE) {
      return fail(
        validationError(
          'VALIDATION_BATCH_LIMIT_EXCEEDED',
          `Bulk operation limited to ${BULK_OPERATION_LIMITS.STATUS_CHANGE} members per batch`,
          {
            userMessage: `You can only process up to ${BULK_OPERATION_LIMITS.STATUS_CHANGE} members at a time.`,
          },
        ),
      );
    }

    return ok(undefined);
  };

  /**
   * Map operation type to target status.
   */
  const mapOperationToStatus = (
    operationType: 'SUSPEND' | 'ACTIVATE' | 'REVOKE',
  ): MembershipStatus => {
    switch (operationType) {
      case 'SUSPEND':
        return 'SUSPENDED' as MembershipStatus;
      case 'ACTIVATE':
        return 'ACTIVE' as MembershipStatus;
      case 'REVOKE':
        return 'REVOKED' as MembershipStatus;
    }
  };

  /**
   * Create initial progress state.
   */
  const createInitialProgress = (total: number): BulkOperationProgress => ({
    total,
    completed: 0,
    successes: [],
    failures: [],
    status: 'pending',
  });

  /**
   * Create result from final progress state.
   */
  const createResultFromProgress = (
    progress: BulkOperationProgress,
  ): BulkOperationResult => ({
    total: progress.total,
    successCount: progress.successes.length,
    failureCount: progress.failures.length,
    successes: progress.successes,
    failures: progress.failures,
    allSucceeded: progress.failures.length === 0,
    allFailed: progress.successes.length === 0,
  });

  return {
    executeStatusChange: async (
      input: BulkStatusChangeInput,
    ): Promise<DomainResult<BulkOperationResult>> => {
      // Step 1: Validate common inputs
      const validation = validateCommonInputs(input);
      if (!validation.success) {
        return validation;
      }

      const {
        tenantId,
        actorMembershipId,
        membershipIds,
        operationType,
        reason,
        onProgress,
      } = input;

      // Step 2: Initialize progress tracking
      let progress: BulkOperationProgress = {
        ...createInitialProgress(membershipIds.length),
        status: 'running',
      };

      // Notify initial progress
      onProgress?.(progress);

      // Step 3: Map operation type to status change input
      const statusChangeInput: ChangeMemberStatusInput = {
        newStatus: mapOperationToStatus(operationType),
        reason,
      };

      // Step 4: Process each member sequentially
      // @see Requirements 6.6 (process sequentially, continue on failure)
      for (const membershipId of membershipIds) {
        try {
          const result = await membershipAdminRepository.changeMemberStatus(
            membershipId,
            tenantId,
            actorMembershipId,
            statusChangeInput,
          );

          if (result.success) {
            // Operation succeeded
            progress = {
              ...progress,
              completed: progress.completed + 1,
              successes: [...progress.successes, membershipId],
            };
          } else {
            // Operation failed - continue processing
            // @see Requirements 6.7 (continue processing remaining items)
            progress = {
              ...progress,
              completed: progress.completed + 1,
              failures: [
                ...progress.failures,
                {
                  membershipId,
                  errorCode: result.error.code,
                  errorMessage:
                    result.error.userMessage ?? result.error.message,
                },
              ],
            };
          }
        } catch (error) {
          // Unexpected error - log and continue
          // @see Requirements 6.7 (continue on failure)
          progress = {
            ...progress,
            completed: progress.completed + 1,
            failures: [
              ...progress.failures,
              {
                membershipId,
                errorCode: 'UNEXPECTED_ERROR',
                errorMessage:
                  error instanceof Error
                    ? error.message
                    : 'An unexpected error occurred',
              },
            ],
          };
        }

        // Notify progress after each operation
        onProgress?.(progress);
      }

      // Step 5: Mark as completed and return summary
      progress = { ...progress, status: 'completed' };
      onProgress?.(progress);

      return ok(createResultFromProgress(progress));
    },

    executeRoleChange: async (
      input: BulkRoleChangeInput,
    ): Promise<DomainResult<BulkOperationResult>> => {
      // Step 1: Validate common inputs
      const validation = validateCommonInputs(input);
      if (!validation.success) {
        return validation;
      }

      const {
        tenantId,
        actorMembershipId,
        membershipIds,
        newRole,
        newOrgUnitId,
        reason,
        onProgress,
      } = input;

      // Step 2: Initialize progress tracking
      let progress: BulkOperationProgress = {
        ...createInitialProgress(membershipIds.length),
        status: 'running',
      };

      // Notify initial progress
      onProgress?.(progress);

      // Step 3: Create role change input
      const roleChangeInput: ChangeMemberRoleInput = {
        newRole,
        newOrgUnitId,
        reason,
      };

      // Step 4: Process each member sequentially
      // @see Requirements 6.6 (process sequentially, continue on failure)
      for (const membershipId of membershipIds) {
        try {
          const result = await membershipAdminRepository.changeMemberRole(
            membershipId,
            tenantId,
            actorMembershipId,
            roleChangeInput,
          );

          if (result.success) {
            // Operation succeeded
            progress = {
              ...progress,
              completed: progress.completed + 1,
              successes: [...progress.successes, membershipId],
            };
          } else {
            // Operation failed - continue processing
            // @see Requirements 6.7 (continue processing remaining items)
            progress = {
              ...progress,
              completed: progress.completed + 1,
              failures: [
                ...progress.failures,
                {
                  membershipId,
                  errorCode: result.error.code,
                  errorMessage:
                    result.error.userMessage ?? result.error.message,
                },
              ],
            };
          }
        } catch (error) {
          // Unexpected error - log and continue
          // @see Requirements 6.7 (continue on failure)
          progress = {
            ...progress,
            completed: progress.completed + 1,
            failures: [
              ...progress.failures,
              {
                membershipId,
                errorCode: 'UNEXPECTED_ERROR',
                errorMessage:
                  error instanceof Error
                    ? error.message
                    : 'An unexpected error occurred',
              },
            ],
          };
        }

        // Notify progress after each operation
        onProgress?.(progress);
      }

      // Step 5: Mark as completed and return summary
      progress = { ...progress, status: 'completed' };
      onProgress?.(progress);

      return ok(createResultFromProgress(progress));
    },
  };
};

/**
 * Type alias for cleaner DI registration.
 */
export type BulkMemberOperationUseCaseType = BulkMemberOperationUseCase;
