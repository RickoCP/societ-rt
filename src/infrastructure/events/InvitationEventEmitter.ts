/**
 * InvitationEventEmitter — Infrastructure implementation for invitation lifecycle events.
 *
 * This module provides implementations of IInvitationEventEmitter that can:
 * - Log events for debugging/development
 * - Publish to event outbox for production
 * - Support multiple event handlers
 *
 * **Event Flow:**
 * 1. MembershipInvitationService emits event via IInvitationEventEmitter
 * 2. Event is logged (always)
 * 3. Event is published to outbox (if configured)
 * 4. Event is forwarded to registered handlers
 *
 * @see FASE 1.18 Task 53: Membership Invitation Flow
 * @see Requirements 22 (AC 7), 25 (AC 6): Event emission for invitation lifecycle
 */

import type {
  IInvitationEventEmitter,
  InvitationLifecycleEvent,
} from '@core/domains/membership/services';

/**
 * Event handler function type.
 */
export type InvitationEventHandler = (event: InvitationLifecycleEvent) => Promise<void>;

/**
 * Logging-only event emitter for development/debugging.
 *
 * This implementation logs all events to console with structured format.
 * Use this for development or when event outbox is not configured.
 */
export const LoggingInvitationEventEmitter = (): IInvitationEventEmitter => {
  return {
    async emit(event: InvitationLifecycleEvent): Promise<void> {
      console.log('[InvitationEvent]', JSON.stringify({
        type: event.type,
        invitationId: event.invitationId,
        membershipId: event.membershipId,
        tenantId: event.tenantId,
        inviterUserId: event.inviterUserId,
        invitedUserId: event.invitedUserId,
        invitedEmail: event.invitedEmail,
        role: event.role,
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
export const CompositeInvitationEventEmitter = ({
  handlers,
}: {
  handlers: InvitationEventHandler[];
}): IInvitationEventEmitter => {
  return {
    async emit(event: InvitationLifecycleEvent): Promise<void> {
      // Run all handlers in parallel
      const results = await Promise.allSettled(
        handlers.map(handler => handler(event)),
      );

      // Log any failed handlers
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(
            `[InvitationEventEmitter] Handler ${index} failed:`,
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
export const NoOpInvitationEventEmitter = (): IInvitationEventEmitter => {
  return {
    async emit(_event: InvitationLifecycleEvent): Promise<void> {
      // Do nothing
    },
  };
};

/**
 * Event handler that logs events to structured console output.
 */
export const createInvitationLoggingHandler = (): InvitationEventHandler => {
  return async (event: InvitationLifecycleEvent): Promise<void> => {
    console.log('[InvitationEvent]', {
      type: event.type,
      invitationId: event.invitationId,
      membershipId: event.membershipId,
      tenantId: event.tenantId,
      timestamp: event.timestamp.toISOString(),
    });
  };
};

/**
 * Event handler that stores events in the event outbox for reliable delivery.
 *
 * NOTE: Implementation depends on the event outbox infrastructure (FASE 1.20, Task 33).
 * For now, this is a placeholder that logs the event would be stored.
 */
export const createInvitationOutboxHandler = ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prismaClient,
}: {
  _prismaClient: unknown; // Replace with actual PrismaClient when outbox is implemented
}): InvitationEventHandler => {
  return async (event: InvitationLifecycleEvent): Promise<void> => {
    // TODO: Implement event outbox storage (FASE 1.20, Task 33)
    // For now, just log that the event would be stored
    console.log('[InvitationEventOutbox] Would store event:', {
      type: event.type,
      invitationId: event.invitationId,
      timestamp: event.timestamp.toISOString(),
    });
  };
};
