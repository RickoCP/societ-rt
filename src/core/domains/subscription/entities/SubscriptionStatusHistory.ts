/**
 * SubscriptionStatusHistory — Domain entity for audit trail of status changes.
 *
 * Maintains timestamps for each status transition for audit purposes (Req 18 AC 4).
 * This is an append-only log — entries are never updated or deleted.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 18 (AC 4-5)
 * @see Design Components > Subscription Status Management
 */

import type { SubscriptionStatus } from '../types';

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/**
 * SubscriptionStatusHistory entity — immutable audit log entry.
 *
 * INVARIANTS:
 * - Entries are append-only
 * - Each entry has a unique ID
 * - Timestamps are in UTC
 */
export interface SubscriptionStatusHistory {
  /** Unique identifier for this history entry */
  readonly id: string;

  /** Reference to the subscription */
  readonly subscriptionId: string;

  /** Reference to the tenant (denormalized for query efficiency) */
  readonly tenantId: string;

  /** Previous status before the transition */
  readonly fromStatus: SubscriptionStatus | null;

  /** New status after the transition */
  readonly toStatus: SubscriptionStatus;

  /** Reason for the transition (for audit) */
  readonly reason: string | null;

  /** User who initiated the transition (system for automated) */
  readonly changedBy: string;

  /** Whether this was an automated system transition */
  readonly isAutomated: boolean;

  /** Additional metadata about the transition */
  readonly metadata: Record<string, unknown> | null;

  /** When the transition occurred */
  readonly changedAt: Date;

  /** When the entry was created (same as changedAt for new entries) */
  readonly createdAt: Date;
}

/**
 * Data required to create a new status history entry.
 */
export interface CreateStatusHistoryInput {
  readonly subscriptionId: string;
  readonly tenantId: string;
  readonly fromStatus: SubscriptionStatus | null;
  readonly toStatus: SubscriptionStatus;
  readonly reason?: string | null;
  readonly changedBy: string;
  readonly isAutomated?: boolean;
  readonly metadata?: Record<string, unknown> | null;
}

/**
 * Query options for retrieving status history.
 */
export interface StatusHistoryQueryOptions {
  readonly subscriptionId?: string;
  readonly tenantId?: string;
  readonly fromStatus?: SubscriptionStatus;
  readonly toStatus?: SubscriptionStatus;
  readonly changedBy?: string;
  readonly startDate?: Date;
  readonly endDate?: Date;
  readonly limit?: number;
  readonly offset?: number;
}

/**
 * Status transition event emitted for downstream systems (Req 18 AC 5).
 */
export interface StatusTransitionEvent {
  readonly eventType: 'SUBSCRIPTION_STATUS_CHANGED';
  readonly subscriptionId: string;
  readonly tenantId: string;
  readonly fromStatus: SubscriptionStatus | null;
  readonly toStatus: SubscriptionStatus;
  readonly reason: string | null;
  readonly changedBy: string;
  readonly timestamp: Date;
}

/**
 * Create a status transition event from a history entry.
 */
export function createStatusTransitionEvent(
  history: SubscriptionStatusHistory,
): StatusTransitionEvent {
  return {
    eventType: 'SUBSCRIPTION_STATUS_CHANGED',
    subscriptionId: history.subscriptionId,
    tenantId: history.tenantId,
    fromStatus: history.fromStatus,
    toStatus: history.toStatus,
    reason: history.reason,
    changedBy: history.changedBy,
    timestamp: history.changedAt,
  };
}
