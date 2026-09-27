/**
 * MembershipEventEmitter — Infrastructure implementation for membership lifecycle events.
 *
 * This module provides implementations of IMembershipEventEmitter that can:
 * - Log events for debugging/development
 * - Publish to event outbox for production
 * - Support multiple event handlers
 *
 * **Event Flow:**
 * 1. MembershipLifecycleService emits event via IMembershipEventEmitter
 * 2. Event is logged (always)
 * 3. Event is published to outbox (if configured)
 * 4. Event is forwarded to registered handlers
 *
 * @see FASE 1.18 Task 50: Membership Lifecycle Management
 * @see Requirements 22 (AC 7): Event emission for membership status changes
 */

import type {
  IMembershipEventEmitter,
  MembershipLifecycleEvent,
} from '@core/domains/membership/services';

/**
 * Event handler function type.
 */
export type MembershipEventHandler = (event: MembershipLifecycleEvent) => Promise<void>;

/**
 * Logging-only event emitter for development/debugging.
 *
 * This implementation logs all events to console with structured format.
 * Use this for development or when event outbox is not configured.
 */
export const LoggingMembershipEventEmitter = (): IMembershipEventEmitter => {
  return {
    async emit(event: MembershipLifecycleEvent): Promise<void> {
      console.log('[MembershipEvent]', JSON.stringify({
        type: event.type,
        membershipId: event.membershipId,
        userId: event.userId,
        tenantId: event.tenantId,
        orgUnitId: event.orgUnitId,
        role: event.role,
        newStatus: event.newStatus,
        oldStatus: event.oldStatus,
        timestamp: event.timestamp.toISOString(),
        performedBy: event.performedBy,
        reason: event.reason,
      }, null, 2));
    },
  };
};

/**
 * Composite event emitter that forwards events to multiple handlers.
 *
 * This allows registering multiple handlers (logging, outbox, notifications, etc.)
 * and ensures all handlers are called for each event.
 */
export const CompositeMembershipEventEmitter = ({
  handlers,
}: {
  handlers: MembershipEventHandler[];
}): IMembershipEventEmitter => {
  return {
    async emit(event: MembershipLifecycleEvent): Promise<void> {
      // Run all handlers in parallel
      const results = await Promise.allSettled(
        handlers.map(handler => handler(event)),
      );

      // Log any failed handlers
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(
            `[MembershipEventEmitter] Handler ${index} failed:`,
            result.reason,
          );
        }
      });
    },
  };
};

/**
 * No-op event emitter for testing or when events should be disabled.
 */
export const NoOpMembershipEventEmitter = (): IMembershipEventEmitter => {
  return {
    async emit(_event: MembershipLifecycleEvent): Promise<void> {
      // Do nothing
    },
  };
};

/**
 * Event handler that logs events to structured console output.
 */
export const createLoggingHandler = (): MembershipEventHandler => {
  return async (event: MembershipLifecycleEvent): Promise<void> => {
    console.log('[MembershipEvent]', {
      type: event.type,
      membershipId: event.membershipId,
      userId: event.userId,
      tenantId: event.tenantId,
      timestamp: event.timestamp.toISOString(),
    });
  };
};

/**
 * Event handler that stores events in the event outbox for reliable delivery.
 *
 * This handler should be used in production to ensure events are persisted
 * and can be processed by downstream systems.
 *
 * NOTE: Implementation depends on the event outbox infrastructure (Task 33).
 * For now, this is a placeholder that logs the event would be stored.
 */
export const createOutboxHandler = ({
  _prismaClient,
}: {
  _prismaClient: unknown; // Replace with actual PrismaClient when outbox is implemented
}): MembershipEventHandler => {
  // Suppress unused variable warning until outbox is implemented
  void _prismaClient;
  
  return async (event: MembershipLifecycleEvent): Promise<void> => {
    // TODO: Implement event outbox storage (FASE 1.20, Task 33)
    // For now, just log that the event would be stored
    console.log('[MembershipEventOutbox] Would store event:', {
      type: event.type,
      membershipId: event.membershipId,
      timestamp: event.timestamp.toISOString(),
    });
  };
};
