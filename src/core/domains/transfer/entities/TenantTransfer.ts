/**
 * TenantTransfer — Domain entity representing a tenant ownership transfer request.
 *
 * This entity tracks the lifecycle of transferring TENANT_OWNER role from one
 * user to another. This is the ONLY way to assign TENANT_OWNER role, as
 * delegation matrix (Task 51) explicitly prohibits it.
 *
 * Transfer flow:
 * 1. Current TENANT_OWNER initiates transfer → PENDING
 * 2. Target user re-authenticates and accepts → ACCEPTED
 * 3. System completes atomic membership swap → COMPLETED
 *
 * Alternative paths:
 * - Current owner cancels → CANCELLED
 * - Time limit exceeded → EXPIRED
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 54 (Ownership Transfer & Last-Admin Protection)
 * @see Task 52: Tenant Transfer Flow
 */

import type { TenantTransferStatus } from '../types';

/**
 * Default transfer expiration time in milliseconds (24 hours).
 * After this time, pending transfers automatically expire.
 */
export const DEFAULT_TRANSFER_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * TenantTransfer entity — tracks ownership transfer lifecycle.
 *
 * SECURITY CONSIDERATIONS:
 * - Transfer can ONLY be initiated by current TENANT_OWNER
 * - Target user MUST re-authenticate before accepting
 * - Cannot transfer to quarantined users
 * - Cannot transfer if target already has TENANT_OWNER in the same tenant
 * - All state transitions MUST be audit logged
 *
 * INVARIANTS:
 * - INV-TRANSFER-001: initiatorUserId must be current TENANT_OWNER of tenantId
 * - INV-TRANSFER-002: targetUserId must have ACTIVE membership in tenantId (any role)
 * - INV-TRANSFER-003: targetUserId must NOT already be TENANT_OWNER in tenantId
 * - INV-TRANSFER-004: Only one PENDING transfer per tenant at a time
 */
export interface TenantTransfer {
  /**
   * Unique identifier for this transfer request.
   */
  readonly id: string;

  /**
   * The tenant whose ownership is being transferred.
   */
  readonly tenantId: string;

  /**
   * User ID of the current TENANT_OWNER who initiated the transfer.
   */
  readonly initiatorUserId: string;

  /**
   * User ID of the target user who will become the new TENANT_OWNER.
   */
  readonly targetUserId: string;

  /**
   * Current status of the transfer request.
   */
  readonly status: TenantTransferStatus;

  /**
   * When the transfer request was created.
   */
  readonly createdAt: Date;

  /**
   * When the transfer request expires (if not accepted).
   * Transfers in PENDING status expire after this timestamp.
   */
  readonly expiresAt: Date;

  /**
   * When the transfer was accepted by the target user.
   * Set when status transitions to ACCEPTED.
   */
  readonly acceptedAt?: Date;

  /**
   * When the transfer was completed (ownership swapped).
   * Set when status transitions to COMPLETED.
   */
  readonly completedAt?: Date;

  /**
   * When the transfer was cancelled.
   * Set when status transitions to CANCELLED.
   */
  readonly cancelledAt?: Date;

  /**
   * Optional reason for cancellation.
   */
  readonly cancellationReason?: string;

  /**
   * When the transfer was last updated.
   */
  readonly updatedAt: Date;
}

/**
 * Data required to initiate a new tenant ownership transfer.
 */
export interface InitiateTransferInput {
  /** The tenant whose ownership is being transferred */
  readonly tenantId: string;
  /** User ID of the current TENANT_OWNER initiating the transfer */
  readonly initiatorUserId: string;
  /** User ID of the target user who will become the new owner */
  readonly targetUserId: string;
  /** Optional custom expiry duration in milliseconds (default: 24 hours) */
  readonly expiryDurationMs?: number;
}

/**
 * Data required to accept a tenant ownership transfer.
 */
export interface AcceptTransferInput {
  /** The transfer request ID */
  readonly transferId: string;
  /** User ID of the user accepting the transfer (must match targetUserId) */
  readonly acceptorUserId: string;
  /** Re-authentication token/proof for security verification */
  readonly reauthToken: string;
}

/**
 * Data required to cancel a tenant ownership transfer.
 */
export interface CancelTransferInput {
  /** The transfer request ID */
  readonly transferId: string;
  /** User ID of the user cancelling the transfer (must be initiator) */
  readonly cancellerUserId: string;
  /** Optional reason for cancellation */
  readonly reason?: string;
}

/**
 * Snapshot of ownership state for audit logging.
 */
export interface OwnershipStateSnapshot {
  /** The tenant ID */
  readonly tenantId: string;
  /** The current TENANT_OWNER user ID */
  readonly ownerUserId: string;
  /** The owner's membership ID */
  readonly ownerMembershipId: string;
  /** Timestamp of the snapshot */
  readonly timestamp: Date;
}

/**
 * Complete audit record for an ownership transfer.
 */
export interface TransferAuditRecord {
  /** The transfer request ID */
  readonly transferId: string;
  /** The tenant ID */
  readonly tenantId: string;
  /** State before the transfer completed */
  readonly beforeState: OwnershipStateSnapshot;
  /** State after the transfer completed */
  readonly afterState: OwnershipStateSnapshot;
  /** When the transfer was completed */
  readonly completedAt: Date;
}
