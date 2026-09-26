/**
 * TenantTransferStatus — Lifecycle status of a tenant ownership transfer.
 *
 * Transfer state machine:
 * - PENDING → ACCEPTED → COMPLETED (successful transfer)
 * - PENDING → CANCELLED (owner cancelled)
 * - PENDING → EXPIRED (time limit exceeded)
 *
 * @see Requirements 54 (Ownership Transfer & Last-Admin Protection)
 * @see Task 52: Tenant Transfer Flow
 */

export enum TenantTransferStatus {
  /**
   * Transfer has been initiated by current TENANT_OWNER.
   * Waiting for target user to accept.
   */
  PENDING = 'PENDING',

  /**
   * Target user has accepted the transfer.
   * Awaiting final completion (atomic membership swap).
   */
  ACCEPTED = 'ACCEPTED',

  /**
   * Transfer has been completed successfully.
   * Terminal state - ownership has changed.
   */
  COMPLETED = 'COMPLETED',

  /**
   * Transfer was cancelled by the initiator (current owner).
   * Terminal state - no ownership change occurred.
   */
  CANCELLED = 'CANCELLED',

  /**
   * Transfer expired without acceptance within time limit.
   * Terminal state - no ownership change occurred.
   */
  EXPIRED = 'EXPIRED',
}

/**
 * Statuses that are terminal (cannot transition out of these).
 */
export const TERMINAL_TRANSFER_STATUSES: ReadonlySet<TenantTransferStatus> =
  new Set([
    TenantTransferStatus.COMPLETED,
    TenantTransferStatus.CANCELLED,
    TenantTransferStatus.EXPIRED,
  ]);

/**
 * Statuses that can still be cancelled (only PENDING).
 */
export const CANCELLABLE_STATUSES: ReadonlySet<TenantTransferStatus> = new Set([
  TenantTransferStatus.PENDING,
]);

/**
 * Valid status transitions map.
 * Key is current status, value is set of valid next statuses.
 */
export const TRANSFER_STATUS_TRANSITIONS: ReadonlyMap<
  TenantTransferStatus,
  ReadonlySet<TenantTransferStatus>
> = new Map([
  [
    TenantTransferStatus.PENDING,
    new Set([
      TenantTransferStatus.ACCEPTED,
      TenantTransferStatus.CANCELLED,
      TenantTransferStatus.EXPIRED,
    ]),
  ],
  [TenantTransferStatus.ACCEPTED, new Set([TenantTransferStatus.COMPLETED])],
  [TenantTransferStatus.COMPLETED, new Set()], // Terminal
  [TenantTransferStatus.CANCELLED, new Set()], // Terminal
  [TenantTransferStatus.EXPIRED, new Set()], // Terminal
]);

/**
 * Check if a status transition is valid.
 */
export function isValidTransferStatusTransition(
  from: TenantTransferStatus,
  to: TenantTransferStatus,
): boolean {
  const validTargets = TRANSFER_STATUS_TRANSITIONS.get(from);
  return validTargets?.has(to) ?? false;
}

/**
 * Check if a status is terminal (cannot transition out of it).
 */
export function isTerminalTransferStatus(status: TenantTransferStatus): boolean {
  return TERMINAL_TRANSFER_STATUSES.has(status);
}

/**
 * Check if a transfer can be cancelled (only PENDING).
 */
export function isCancellableStatus(status: TenantTransferStatus): boolean {
  return CANCELLABLE_STATUSES.has(status);
}

/**
 * All valid TenantTransferStatus values for exhaustiveness checking.
 */
export const ALL_TRANSFER_STATUSES: readonly TenantTransferStatus[] =
  Object.freeze([
    TenantTransferStatus.PENDING,
    TenantTransferStatus.ACCEPTED,
    TenantTransferStatus.COMPLETED,
    TenantTransferStatus.CANCELLED,
    TenantTransferStatus.EXPIRED,
  ]);
