/**
 * ManageTenantLifecycleUseCase — Manages tenant lifecycle status transitions.
 *
 * This use case orchestrates lifecycle transitions for tenants including:
 * - SUSPEND: ACTIVE → SUSPENDED (requires tenant:manage)
 * - REACTIVATE: SUSPENDED → ACTIVE (requires tenant:manage)
 * - CLOSE: SUSPENDED → CLOSING (requires PLATFORM_ADMIN)
 *
 * **ORCHESTRATION FLOW:**
 * 1. Validate actor has required permission for the action
 * 2. Validate transition is valid from current status
 * 3. Execute transition via repository
 * 4. Enqueue audit log with reason
 * 5. Return updated lifecycle status
 *
 * @see Requirements 13.5-13.9 (Tenant Lifecycle Management)
 * @see Design Document: Tenant Lifecycle State Machine
 */

import type { DomainResult } from '@core/utils';
import { ok, fail, businessError, authorizationError } from '@core/utils';
import type { AuditQueueProtocol } from '@core/protocols';
import type { TenantSettingsRepository } from '../repositories/TenantSettingsRepository';
import type {
  TenantLifecycleStatus,
  LifecycleTransitionInput,
  LifecycleActionValue,
} from '../entities/TenantLifecycleStatus';
import {
  LifecycleAction,
  LifecycleStatus,
  isValidLifecycleTransition,
  getTargetStatusForAction,
  requiresPlatformAdminForAction,
} from '../entities/TenantLifecycleStatus';
import { tenantNotFound, tenantAccessDenied } from '../errors/tenantErrors';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * Input parameters for managing tenant lifecycle.
 */
export interface ManageTenantLifecycleInput {
  /**
   * Tenant ID to manage.
   */
  readonly tenantId: string;

  /**
   * The lifecycle action to perform.
   */
  readonly action: LifecycleActionValue;

  /**
   * Reason for the action (required for SUSPEND, optional for others).
   */
  readonly reason?: string;

  /**
   * Whether the actor has tenant:manage permission.
   */
  readonly hasManagePermission: boolean;

  /**
   * Whether the actor is a PLATFORM_ADMIN (required for CLOSE).
   */
  readonly isPlatformAdmin: boolean;

  /**
   * User ID of the actor (for audit).
   */
  readonly actorUserId: string;

  /**
   * IP address of the request (for audit).
   */
  readonly ipAddress?: string;
}

/**
 * ManageTenantLifecycleUseCase interface — manages lifecycle transitions.
 */
export interface ManageTenantLifecycleUseCase {
  /**
   * Execute a lifecycle transition.
   *
   * @param input - The input parameters
   * @returns DomainResult with updated TenantLifecycleStatus or error
   */
  execute(
    input: ManageTenantLifecycleInput,
  ): Promise<DomainResult<TenantLifecycleStatus>>;
}

// ---------------------------------------------------------------------------
// Error Helpers
// ---------------------------------------------------------------------------

/**
 * Create an error for invalid lifecycle transition.
 */
function invalidLifecycleTransition(
  currentStatus: string,
  action: string,
): ReturnType<typeof businessError> {
  return businessError(
    'TENANT_LIFECYCLE_INVALID_TRANSITION',
    `Cannot perform action '${action}' from status '${currentStatus}'`,
    {
      userMessage: 'This action cannot be performed on the tenant in its current state',
    },
  );
}

/**
 * Create an error for missing suspension reason.
 */
function suspensionReasonRequired(): ReturnType<typeof businessError> {
  return businessError(
    'TENANT_LIFECYCLE_REASON_REQUIRED',
    'Suspension reason is required',
    {
      userMessage: 'Please provide a reason for suspending the tenant',
    },
  );
}

/**
 * Create an error for insufficient permission (PLATFORM_ADMIN required).
 */
function platformAdminRequired(): ReturnType<typeof authorizationError> {
  return authorizationError(
    'TENANT_LIFECYCLE_PLATFORM_ADMIN_REQUIRED',
    'PLATFORM_ADMIN role is required to close a tenant',
    {
      userMessage: 'Only platform administrators can close tenants',
    },
  );
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a ManageTenantLifecycleUseCase instance.
 *
 * @param dependencies - The use case dependencies
 * @returns An implementation of ManageTenantLifecycleUseCase
 */
export const ManageTenantLifecycleUseCaseImpl = ({
  tenantSettingsRepository,
  auditQueueProtocol,
}: {
  tenantSettingsRepository: TenantSettingsRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): ManageTenantLifecycleUseCase => ({
  execute: async (
    input: ManageTenantLifecycleInput,
  ): Promise<DomainResult<TenantLifecycleStatus>> => {
    const {
      tenantId,
      action,
      reason,
      hasManagePermission,
      isPlatformAdmin,
      actorUserId,
      ipAddress,
    } = input;

    // Step 1: Validate base permission (tenant:manage required for all actions)
    if (!hasManagePermission) {
      return fail(tenantAccessDenied());
    }

    // Step 2: Check if PLATFORM_ADMIN is required for this action
    if (requiresPlatformAdminForAction(action) && !isPlatformAdmin) {
      return fail(platformAdminRequired());
    }

    // Step 3: Validate reason is provided for SUSPEND action
    if (action === LifecycleAction.SUSPEND && (!reason || reason.trim().length === 0)) {
      return fail(suspensionReasonRequired());
    }

    // Step 4: Check tenant exists and get current status
    const currentStatusResult =
      await tenantSettingsRepository.getCurrentLifecycleStatus(tenantId);
    if (!currentStatusResult.success) {
      // Check if error is "not found" type
      if (currentStatusResult.error.code === 'TENANT_NOT_FOUND') {
        return fail(tenantNotFound());
      }
      return fail(currentStatusResult.error);
    }

    const currentStatus = currentStatusResult.data;

    // Step 5: Determine target status for the action
    const targetStatus = getTargetStatusForAction(currentStatus, action);
    if (targetStatus === null) {
      return fail(invalidLifecycleTransition(currentStatus, action));
    }

    // Step 6: Validate the transition is allowed
    if (!isValidLifecycleTransition(currentStatus, targetStatus)) {
      return fail(invalidLifecycleTransition(currentStatus, action));
    }

    // Step 7: Execute the transition
    const transitionInput: LifecycleTransitionInput = {
      tenantId,
      targetStatus,
      action,
      reason: reason?.trim(),
      actorUserId,
      ipAddress,
    };

    const transitionResult =
      await tenantSettingsRepository.transitionLifecycle(transitionInput);
    if (!transitionResult.success) {
      return fail(transitionResult.error);
    }

    // Step 8: Enqueue audit log
    const actionTypeMap: Record<LifecycleActionValue, string> = {
      [LifecycleAction.SUSPEND]: 'tenant_suspended',
      [LifecycleAction.REACTIVATE]: 'tenant_reactivated',
      [LifecycleAction.CLOSE]: 'tenant_closed',
    };

    auditQueueProtocol
      .enqueueAudit({
        tenantId,
        actorUserId,
        actionType: actionTypeMap[action] ?? `tenant_lifecycle_${action.toLowerCase()}`,
        resourceType: 'tenant',
        resourceId: tenantId,
        details: {
          action,
          fromStatus: currentStatus,
          toStatus: targetStatus,
          ...(reason && { reason }),
        },
        ipAddress,
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // Step 9: Return updated lifecycle status
    return ok(transitionResult.data);
  },
});

/**
 * Type alias for cleaner DI registration.
 */
export type ManageTenantLifecycleUseCaseType = ManageTenantLifecycleUseCase;
