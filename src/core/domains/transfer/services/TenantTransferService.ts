/**
 * TenantTransferService — Domain service for secure tenant ownership transfer.
 *
 * This service orchestrates the complete ownership transfer flow:
 * 1. Initiate: Current TENANT_OWNER initiates transfer to target user
 * 2. Accept: Target user re-authenticates and accepts the transfer
 * 3. Complete: System atomically swaps ownership (revoke old, grant new)
 *
 * **CRITICAL SECURITY RULES:**
 * - ONLY current TENANT_OWNER can initiate transfer
 * - Target user MUST re-authenticate before accepting
 * - Cannot transfer to quarantined users
 * - Cannot transfer if target already has TENANT_OWNER in same tenant
 * - All operations MUST be audit logged with before/after state
 *
 * @see Requirements 54 (Ownership Transfer & Last-Admin Protection)
 * @see Task 52: Tenant Transfer Flow
 */

import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type {
  TenantTransfer,
  InitiateTransferInput,
  AcceptTransferInput,
  CancelTransferInput,
  TransferAuditRecord,
  OwnershipStateSnapshot,
} from '../entities';
import { DEFAULT_TRANSFER_EXPIRY_MS } from '../entities';
import type { ITenantTransferRepository } from '../repositories';
import {
  TenantTransferStatus,
  isTerminalTransferStatus,
  isCancellableStatus,
  isValidTransferStatusTransition,
} from '../types';
import {
  transferNotInitiatedByOwner,
  transferTargetNotFound,
  transferTargetQuarantined,
  transferTargetAlreadyOwner,
  transferTargetNoMembership,
  transferAlreadyPending,
  transferExpired,
  transferAlreadyCompleted,
  transferCancelled,
  reAuthenticationRequired,
  transferNotTargetUser,
  transferNotInitiator,
  transferCannotBeCancelled,
  transferNotFound,
  invalidTransferStatusTransition,
  transferToSelfNotAllowed,
  invalidReauthToken,
} from '../errors';
import type { Membership } from '@core/domains/membership/entities';
import { MembershipRole, MembershipStatus } from '@core/domains/membership/types';

// ---------------------------------------------------------------------------
// Audit Event Types
// ---------------------------------------------------------------------------

/**
 * Transfer audit event types for comprehensive logging.
 */
export enum TransferAuditEventType {
  /** Transfer initiated by current owner */
  TRANSFER_INITIATED = 'TRANSFER_INITIATED',
  /** Transfer accepted by target user */
  TRANSFER_ACCEPTED = 'TRANSFER_ACCEPTED',
  /** Transfer completed successfully */
  TRANSFER_COMPLETED = 'TRANSFER_COMPLETED',
  /** Transfer cancelled by initiator */
  TRANSFER_CANCELLED = 'TRANSFER_CANCELLED',
  /** Transfer expired without acceptance */
  TRANSFER_EXPIRED = 'TRANSFER_EXPIRED',
  /** Transfer failed due to validation error */
  TRANSFER_FAILED = 'TRANSFER_FAILED',
}

/**
 * Transfer audit event payload.
 */
export interface TransferAuditEvent {
  /** Event type */
  readonly type: TransferAuditEventType;
  /** Transfer request ID */
  readonly transferId: string;
  /** Tenant ID */
  readonly tenantId: string;
  /** Initiator user ID (current owner) */
  readonly initiatorUserId: string;
  /** Target user ID (new owner) */
  readonly targetUserId: string;
  /** Before state (for completed transfers) */
  readonly beforeState?: OwnershipStateSnapshot;
  /** After state (for completed transfers) */
  readonly afterState?: OwnershipStateSnapshot;
  /** Reason (for cancelled/failed events) */
  readonly reason?: string;
  /** Event timestamp */
  readonly timestamp: Date;
}

/**
 * Interface for transfer audit event emitter.
 */
export interface ITransferAuditEmitter {
  /**
   * Emit a transfer audit event.
   * @param event - The audit event to emit
   */
  emit(event: TransferAuditEvent): Promise<void>;
}

// ---------------------------------------------------------------------------
// Re-authentication Service Interface
// ---------------------------------------------------------------------------

/**
 * Interface for re-authentication verification service.
 * Step-up authentication is required for sensitive operations like ownership transfer.
 */
export interface IReauthenticationService {
  /**
   * Verify a re-authentication token.
   * @param userId - The user ID
   * @param token - The re-authentication token
   * @param operation - The operation being performed (for audit/scoping)
   * @returns true if token is valid, false otherwise
   */
  verifyToken(
    userId: string,
    token: string,
    operation: string,
  ): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Membership Query Service Interface
// ---------------------------------------------------------------------------

/**
 * Interface for querying membership data (read-only).
 * Used for validating transfer eligibility.
 */
export interface IMembershipQueryService {
  /**
   * Find TENANT_OWNER membership for a user in a tenant.
   * @param userId - The user ID
   * @param tenantId - The tenant ID
   * @returns Membership if found, null otherwise
   */
  findTenantOwnerMembership(
    userId: string,
    tenantId: string,
  ): Promise<Membership | null>;

  /**
   * Find any ACTIVE membership for a user in a tenant.
   * @param userId - The user ID
   * @param tenantId - The tenant ID
   * @returns Membership if found, null otherwise
   */
  findActiveMembership(
    userId: string,
    tenantId: string,
  ): Promise<Membership | null>;

  /**
   * Check if a user is quarantined.
   * @param userId - The user ID
   * @returns true if quarantined
   */
  isUserQuarantined(userId: string): Promise<boolean>;

  /**
   * Check if a user exists.
   * @param userId - The user ID
   * @returns true if user exists
   */
  userExists(userId: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

/**
 * TenantTransferService interface.
 *
 * Provides operations for secure tenant ownership transfer.
 */
export interface ITenantTransferService {
  /**
   * Initiate a tenant ownership transfer.
   *
   * Pre-conditions:
   * - Initiator MUST be current TENANT_OWNER of the tenant
   * - Target user MUST exist
   * - Target user MUST NOT be quarantined
   * - Target user MUST NOT already be TENANT_OWNER in the same tenant
   * - Target user MUST have an ACTIVE membership in the tenant
   * - No pending transfer for this tenant
   *
   * @param input - Transfer initiation input
   * @returns DomainResult with created transfer or error
   */
  initiateTransfer(
    input: InitiateTransferInput,
  ): Promise<DomainResult<TenantTransfer>>;

  /**
   * Accept a pending ownership transfer.
   *
   * Pre-conditions:
   * - Transfer MUST exist and be in PENDING status
   * - Transfer MUST NOT be expired
   * - Acceptor MUST be the target user
   * - Acceptor MUST provide valid re-authentication token
   *
   * Post-conditions:
   * - Transfer status changes to ACCEPTED
   * - Transfer completion is triggered automatically
   *
   * @param input - Transfer acceptance input
   * @returns DomainResult with accepted (and completed) transfer or error
   */
  acceptTransfer(
    input: AcceptTransferInput,
  ): Promise<DomainResult<TenantTransfer>>;

  /**
   * Cancel a pending ownership transfer.
   *
   * Pre-conditions:
   * - Transfer MUST exist and be in PENDING status
   * - Canceller MUST be the transfer initiator (current owner)
   *
   * @param input - Transfer cancellation input
   * @returns DomainResult with cancelled transfer or error
   */
  cancelTransfer(
    input: CancelTransferInput,
  ): Promise<DomainResult<TenantTransfer>>;

  /**
   * Get the status of a transfer request.
   *
   * @param transferId - The transfer request ID
   * @returns DomainResult with transfer or error
   */
  getTransferStatus(transferId: string): Promise<DomainResult<TenantTransfer>>;

  /**
   * Get pending transfer for a tenant (if any).
   *
   * @param tenantId - The tenant ID
   * @returns Transfer if pending, null otherwise
   */
  getPendingTransfer(tenantId: string): Promise<TenantTransfer | null>;

  /**
   * Expire all pending transfers that have exceeded their time limit.
   * This should be called by a scheduled job.
   *
   * @returns Number of transfers expired
   */
  expirePendingTransfers(): Promise<number>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a TenantTransferService instance.
 *
 * @param dependencies - Service dependencies
 * @returns An implementation of ITenantTransferService
 */
export const TenantTransferServiceImpl = ({
  transferRepository,
  membershipQueryService,
  reauthenticationService,
  transferAuditEmitter,
}: {
  transferRepository: ITenantTransferRepository;
  membershipQueryService: IMembershipQueryService;
  reauthenticationService: IReauthenticationService;
  transferAuditEmitter: ITransferAuditEmitter;
}): ITenantTransferService => {
  // -------------------------------------------------------------------------
  // Helper Functions
  // -------------------------------------------------------------------------

  /**
   * Validate that a user can initiate a transfer.
   */
  const validateInitiator = async (
    userId: string,
    tenantId: string,
  ): Promise<DomainResult<Membership>> => {
    const ownerMembership = await membershipQueryService.findTenantOwnerMembership(
      userId,
      tenantId,
    );

    if (!ownerMembership) {
      return fail(transferNotInitiatedByOwner());
    }

    return ok(ownerMembership);
  };

  /**
   * Validate that a target user is eligible to receive ownership.
   */
  const validateTarget = async (
    targetUserId: string,
    tenantId: string,
    initiatorUserId: string,
  ): Promise<DomainResult<void>> => {
    // Cannot transfer to self
    if (targetUserId === initiatorUserId) {
      return fail(transferToSelfNotAllowed());
    }

    // Target must exist
    const userExists = await membershipQueryService.userExists(targetUserId);
    if (!userExists) {
      return fail(transferTargetNotFound());
    }

    // Target must not be quarantined
    const isQuarantined = await membershipQueryService.isUserQuarantined(targetUserId);
    if (isQuarantined) {
      return fail(transferTargetQuarantined());
    }

    // Target must not already be TENANT_OWNER
    const existingOwnership = await membershipQueryService.findTenantOwnerMembership(
      targetUserId,
      tenantId,
    );
    if (existingOwnership) {
      return fail(transferTargetAlreadyOwner());
    }

    // Target must have an ACTIVE membership in the tenant
    const activeMembership = await membershipQueryService.findActiveMembership(
      targetUserId,
      tenantId,
    );
    if (!activeMembership) {
      return fail(transferTargetNoMembership());
    }

    return ok(undefined);
  };

  /**
   * Validate transfer for acceptance.
   */
  const validateForAcceptance = (
    transfer: TenantTransfer,
    acceptorUserId: string,
  ): DomainResult<void> => {
    // Check status
    if (transfer.status === TenantTransferStatus.COMPLETED) {
      return fail(transferAlreadyCompleted());
    }
    if (transfer.status === TenantTransferStatus.CANCELLED) {
      return fail(transferCancelled());
    }
    if (transfer.status === TenantTransferStatus.EXPIRED) {
      return fail(transferExpired());
    }

    // Check expiry
    if (new Date() > transfer.expiresAt) {
      return fail(transferExpired());
    }

    // Check acceptor is target
    if (transfer.targetUserId !== acceptorUserId) {
      return fail(transferNotTargetUser());
    }

    return ok(undefined);
  };

  /**
   * Create ownership state snapshot for audit.
   */
  const createOwnershipSnapshot = (
    tenantId: string,
    ownerUserId: string,
    ownerMembershipId: string,
  ): OwnershipStateSnapshot => ({
    tenantId,
    ownerUserId,
    ownerMembershipId,
    timestamp: new Date(),
  });

  /**
   * Emit audit event.
   */
  const emitAuditEvent = async (
    type: TransferAuditEventType,
    transfer: TenantTransfer,
    options?: {
      beforeState?: OwnershipStateSnapshot;
      afterState?: OwnershipStateSnapshot;
      reason?: string;
    },
  ): Promise<void> => {
    await transferAuditEmitter.emit({
      type,
      transferId: transfer.id,
      tenantId: transfer.tenantId,
      initiatorUserId: transfer.initiatorUserId,
      targetUserId: transfer.targetUserId,
      beforeState: options?.beforeState,
      afterState: options?.afterState,
      reason: options?.reason,
      timestamp: new Date(),
    });
  };

  // -------------------------------------------------------------------------
  // Service Implementation
  // -------------------------------------------------------------------------

  return {
    async initiateTransfer(
      input: InitiateTransferInput,
    ): Promise<DomainResult<TenantTransfer>> {
      const { tenantId, initiatorUserId, targetUserId, expiryDurationMs } = input;

      // Step 1: Validate initiator is TENANT_OWNER
      const initiatorResult = await validateInitiator(initiatorUserId, tenantId);
      if (!initiatorResult.success) {
        return initiatorResult;
      }

      // Step 2: Validate target user eligibility
      const targetResult = await validateTarget(targetUserId, tenantId, initiatorUserId);
      if (!targetResult.success) {
        return targetResult;
      }

      // Step 3: Check for existing pending transfer
      const hasPending = await transferRepository.hasPendingTransfer(tenantId);
      if (hasPending) {
        return fail(transferAlreadyPending());
      }

      // Step 4: Create transfer request
      const expiresAt = new Date(
        Date.now() + (expiryDurationMs ?? DEFAULT_TRANSFER_EXPIRY_MS),
      );

      const createResult = await transferRepository.create({
        tenantId,
        initiatorUserId,
        targetUserId,
        expiresAt,
      });

      if (!createResult.success) {
        return createResult;
      }

      // Step 5: Emit audit event
      await emitAuditEvent(TransferAuditEventType.TRANSFER_INITIATED, createResult.data);

      return createResult;
    },

    async acceptTransfer(
      input: AcceptTransferInput,
    ): Promise<DomainResult<TenantTransfer>> {
      const { transferId, acceptorUserId, reauthToken } = input;

      // Step 1: Find the transfer
      const transferResult = await transferRepository.findById(transferId);
      if (!transferResult.success) {
        return fail(transferNotFound());
      }
      const transfer = transferResult.data;

      // Step 2: Validate transfer can be accepted
      const validationResult = validateForAcceptance(transfer, acceptorUserId);
      if (!validationResult.success) {
        return validationResult;
      }

      // Step 3: Verify re-authentication token
      const isValidReauth = await reauthenticationService.verifyToken(
        acceptorUserId,
        reauthToken,
        'TENANT_OWNER_TRANSFER',
      );
      if (!isValidReauth) {
        return fail(invalidReauthToken());
      }

      // Step 4: Get current owner membership for audit
      const ownerMembership = await membershipQueryService.findTenantOwnerMembership(
        transfer.initiatorUserId,
        transfer.tenantId,
      );
      if (!ownerMembership) {
        // This shouldn't happen if validation passed, but fail safely
        return fail(transferNotInitiatedByOwner());
      }

      // Step 5: Create before state snapshot
      const beforeState = createOwnershipSnapshot(
        transfer.tenantId,
        transfer.initiatorUserId,
        ownerMembership.id,
      );

      // Step 6: Update transfer status to ACCEPTED
      const acceptResult = await transferRepository.updateStatus({
        transferId,
        status: TenantTransferStatus.ACCEPTED,
        acceptedAt: new Date(),
      });
      if (!acceptResult.success) {
        return acceptResult;
      }

      // Step 7: Emit acceptance audit event
      await emitAuditEvent(TransferAuditEventType.TRANSFER_ACCEPTED, acceptResult.data);

      // Step 8: Complete the transfer atomically
      const completeResult = await transferRepository.completeTransferAtomic(
        transferId,
        ownerMembership.id,
        transfer.targetUserId,
        transfer.tenantId,
      );

      if (!completeResult.success) {
        return completeResult;
      }

      // Step 9: Get the new owner's membership for after state
      const newOwnerMembership = await membershipQueryService.findTenantOwnerMembership(
        transfer.targetUserId,
        transfer.tenantId,
      );

      // Step 10: Create after state snapshot and emit completion audit
      const afterState = createOwnershipSnapshot(
        transfer.tenantId,
        transfer.targetUserId,
        newOwnerMembership?.id ?? 'UNKNOWN', // Should exist after atomic completion
      );

      await emitAuditEvent(TransferAuditEventType.TRANSFER_COMPLETED, completeResult.data, {
        beforeState,
        afterState,
      });

      return completeResult;
    },

    async cancelTransfer(
      input: CancelTransferInput,
    ): Promise<DomainResult<TenantTransfer>> {
      const { transferId, cancellerUserId, reason } = input;

      // Step 1: Find the transfer
      const transferResult = await transferRepository.findById(transferId);
      if (!transferResult.success) {
        return fail(transferNotFound());
      }
      const transfer = transferResult.data;

      // Step 2: Validate canceller is the initiator
      if (transfer.initiatorUserId !== cancellerUserId) {
        return fail(transferNotInitiator());
      }

      // Step 3: Validate transfer can be cancelled
      if (!isCancellableStatus(transfer.status)) {
        return fail(transferCannotBeCancelled());
      }

      // Step 4: Update transfer status to CANCELLED
      const cancelResult = await transferRepository.updateStatus({
        transferId,
        status: TenantTransferStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: reason,
      });

      if (!cancelResult.success) {
        return cancelResult;
      }

      // Step 5: Emit cancellation audit event
      await emitAuditEvent(TransferAuditEventType.TRANSFER_CANCELLED, cancelResult.data, {
        reason,
      });

      return cancelResult;
    },

    async getTransferStatus(transferId: string): Promise<DomainResult<TenantTransfer>> {
      return transferRepository.findById(transferId);
    },

    async getPendingTransfer(tenantId: string): Promise<TenantTransfer | null> {
      const pending = await transferRepository.findPendingByTenant(tenantId);
      return pending.length > 0 ? pending[0] : null;
    },

    async expirePendingTransfers(): Promise<number> {
      const expiredTransfers = await transferRepository.findExpiredPendingTransfers();
      let expiredCount = 0;

      for (const transfer of expiredTransfers) {
        const updateResult = await transferRepository.updateStatus({
          transferId: transfer.id,
          status: TenantTransferStatus.EXPIRED,
        });

        if (updateResult.success) {
          await emitAuditEvent(TransferAuditEventType.TRANSFER_EXPIRED, updateResult.data);
          expiredCount++;
        }
      }

      return expiredCount;
    },
  };
};

/**
 * Type alias for the factory function for cleaner DI registration.
 */
export type TenantTransferService = ITenantTransferService;
