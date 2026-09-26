/**
 * ITenantTransferRepository — Repository contract for TenantTransfer queries and mutations.
 *
 * This interface defines the contract for managing tenant ownership transfer
 * requests, independent of database implementation (Clean Architecture).
 *
 * CRITICAL SECURITY RULES:
 * - Transfer requests MUST be validated for proper ownership before mutation
 * - All mutations MUST support atomic transaction with membership updates
 * - Queries MUST be tenant-scoped to prevent cross-tenant leakage
 *
 * @see Requirements 54 (Ownership Transfer & Last-Admin Protection)
 * @see Task 52: Tenant Transfer Flow
 */

import type { DomainResult } from '@core/utils';
import type { TenantTransfer } from '../entities';
import type { TenantTransferStatus } from '../types';

/**
 * Input for creating a new transfer request.
 */
export interface CreateTransferInput {
  /** The tenant whose ownership is being transferred */
  readonly tenantId: string;
  /** User ID of the current TENANT_OWNER initiating the transfer */
  readonly initiatorUserId: string;
  /** User ID of the target user who will become the new owner */
  readonly targetUserId: string;
  /** When the transfer request expires */
  readonly expiresAt: Date;
}

/**
 * Input for updating transfer status.
 */
export interface UpdateTransferStatusInput {
  /** The transfer request ID */
  readonly transferId: string;
  /** New status */
  readonly status: TenantTransferStatus;
  /** Timestamp for acceptedAt (when transitioning to ACCEPTED) */
  readonly acceptedAt?: Date;
  /** Timestamp for completedAt (when transitioning to COMPLETED) */
  readonly completedAt?: Date;
  /** Timestamp for cancelledAt (when transitioning to CANCELLED) */
  readonly cancelledAt?: Date;
  /** Reason for cancellation */
  readonly cancellationReason?: string;
}

/**
 * Repository interface for TenantTransfer operations.
 */
export interface ITenantTransferRepository {
  // ---------------------------------------------------------------------------
  // Create Operations
  // ---------------------------------------------------------------------------

  /**
   * Create a new tenant ownership transfer request.
   *
   * @param input - The transfer creation input
   * @returns DomainResult with created transfer or error
   */
  create(input: CreateTransferInput): Promise<DomainResult<TenantTransfer>>;

  // ---------------------------------------------------------------------------
  // Read Operations
  // ---------------------------------------------------------------------------

  /**
   * Find a transfer request by ID.
   *
   * @param id - The transfer request ID
   * @returns DomainResult with transfer or not found error
   */
  findById(id: string): Promise<DomainResult<TenantTransfer>>;

  /**
   * Find all pending transfers for a tenant.
   *
   * @param tenantId - The tenant ID
   * @returns Array of pending transfers (empty if none)
   */
  findPendingByTenant(tenantId: string): Promise<TenantTransfer[]>;

  /**
   * Find a pending transfer where the user is the target.
   *
   * @param targetUserId - The target user ID
   * @param tenantId - The tenant ID
   * @returns DomainResult with transfer or not found error
   */
  findPendingByTargetUser(
    targetUserId: string,
    tenantId: string,
  ): Promise<DomainResult<TenantTransfer>>;

  /**
   * Check if there is any pending transfer for a tenant.
   *
   * @param tenantId - The tenant ID
   * @returns true if a pending transfer exists
   */
  hasPendingTransfer(tenantId: string): Promise<boolean>;

  /**
   * Find all transfers for a tenant (for history/audit).
   *
   * @param tenantId - The tenant ID
   * @param options - Query options (pagination, filtering)
   * @returns Array of transfers
   */
  findByTenant(
    tenantId: string,
    options?: TransferQueryOptions,
  ): Promise<TenantTransfer[]>;

  /**
   * Find expired transfers that need to be transitioned to EXPIRED status.
   *
   * @returns Array of expired pending transfers
   */
  findExpiredPendingTransfers(): Promise<TenantTransfer[]>;

  // ---------------------------------------------------------------------------
  // Update Operations
  // ---------------------------------------------------------------------------

  /**
   * Update the status of a transfer request.
   *
   * @param input - The status update input
   * @returns DomainResult with updated transfer or error
   */
  updateStatus(input: UpdateTransferStatusInput): Promise<DomainResult<TenantTransfer>>;

  // ---------------------------------------------------------------------------
  // Atomic Operations (for transfer completion)
  // ---------------------------------------------------------------------------

  /**
   * Complete the ownership transfer atomically.
   *
   * This method performs the following in a single transaction:
   * 1. Update transfer status to COMPLETED
   * 2. Revoke the initiator's TENANT_OWNER membership
   * 3. Create or update the target's membership to TENANT_OWNER
   *
   * @param transferId - The transfer request ID
   * @param initiatorMembershipId - The initiator's current TENANT_OWNER membership ID
   * @param targetUserId - The target user who will become the new owner
   * @param tenantId - The tenant ID
   * @returns DomainResult with completed transfer or error
   */
  completeTransferAtomic(
    transferId: string,
    initiatorMembershipId: string,
    targetUserId: string,
    tenantId: string,
  ): Promise<DomainResult<TenantTransfer>>;
}

/**
 * Query options for transfer list operations.
 */
export interface TransferQueryOptions {
  /** Filter by status */
  readonly status?: TenantTransferStatus;
  /** Pagination offset */
  readonly offset?: number;
  /** Pagination limit */
  readonly limit?: number;
  /** Include expired/cancelled transfers */
  readonly includeTerminal?: boolean;
}
