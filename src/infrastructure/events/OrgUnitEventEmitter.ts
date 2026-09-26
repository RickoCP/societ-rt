/**
 * OrgUnitEventEmitter — Infrastructure implementation for OrgUnit lifecycle events.
 *
 * This module provides implementations of IOrgUnitEventEmitter that can:
 * - Log events for debugging/development
 * - Publish to event outbox for production
 * - Support multiple event handlers
 *
 * **Event Flow:**
 * 1. OrgUnitManagementService emits event via IOrgUnitEventEmitter
 * 2. Event is logged (always)
 * 3. Event is published to outbox (if configured)
 * 4. Event is forwarded to registered handlers
 *
 * @see FASE 1.19 Task 57: OrgUnit Management Service
 * @see Requirements 21 (AC 1-9), Requirements 46 (AC 1-9)
 */

import type {
  IOrgUnitEventEmitter,
  OrgUnitLifecycleEvent,
  OrgUnitEventType,
} from '@core/domains/orgunit/services/OrgUnitEventEmitter';

/**
 * Event handler function type.
 */
export type OrgUnitEventHandler = (event: OrgUnitLifecycleEvent) => Promise<void>;

/**
 * Logging-only event emitter for development/debugging.
 *
 * This implementation logs all events to console with structured format.
 * Use this for development or when event outbox is not configured.
 */
export const LoggingOrgUnitEventEmitter = (): IOrgUnitEventEmitter => {
  return {
    async emit(event: OrgUnitLifecycleEvent): Promise<void> {
      const baseLog = {
        type: event.type,
        orgUnitId: event.orgUnitId,
        tenantId: event.tenantId,
        timestamp: event.timestamp.toISOString(),
        performedBy: event.performedBy,
      };

      // Add type-specific fields
      let details: Record<string, unknown> = {};
      switch (event.type) {
        case 'ORGUNIT_CREATED':
          details = {
            name: event.name,
            orgUnitType: event.orgUnitType,
            parentId: event.parentId,
            path: event.path,
            depth: event.depth,
          };
          break;
        case 'ORGUNIT_UPDATED':
          details = {
            oldName: event.oldName,
            newName: event.newName,
            oldType: event.oldType,
            newType: event.newType,
          };
          break;
        case 'ORGUNIT_MOVED':
          details = {
            oldParentId: event.oldParentId,
            newParentId: event.newParentId,
            oldPath: event.oldPath,
            newPath: event.newPath,
            oldDepth: event.oldDepth,
            newDepth: event.newDepth,
            descendantsUpdated: event.descendantsUpdated,
          };
          break;
        case 'ORGUNIT_DELETED':
          details = {
            name: event.name,
            orgUnitType: event.orgUnitType,
            parentId: event.parentId,
            reason: event.reason,
          };
          break;
        case 'ORGUNIT_SUBTREE_DELETED':
          details = {
            rootName: event.rootName,
            deletedCount: event.deletedCount,
            reason: event.reason,
          };
          break;
        case 'ORGUNIT_PATH_REPAIRED':
          details = {
            oldPath: event.oldPath,
            newPath: event.newPath,
            oldDepth: event.oldDepth,
            newDepth: event.newDepth,
          };
          break;
      }

      console.log('[OrgUnitEvent]', JSON.stringify({
        ...baseLog,
        ...details,
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
export const CompositeOrgUnitEventEmitter = ({
  handlers,
}: {
  handlers: OrgUnitEventHandler[];
}): IOrgUnitEventEmitter => {
  return {
    async emit(event: OrgUnitLifecycleEvent): Promise<void> {
      // Run all handlers in parallel
      const results = await Promise.allSettled(
        handlers.map(handler => handler(event)),
      );

      // Log any failed handlers
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(
            `[OrgUnitEventEmitter] Handler ${index} failed:`,
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
export const NoOpOrgUnitEventEmitter = (): IOrgUnitEventEmitter => {
  return {
    async emit(_event: OrgUnitLifecycleEvent): Promise<void> {
      // Do nothing
    },
  };
};

/**
 * Event handler that logs events to structured console output.
 */
export const createOrgUnitLoggingHandler = (): OrgUnitEventHandler => {
  return async (event: OrgUnitLifecycleEvent): Promise<void> => {
    console.log('[OrgUnitEvent]', {
      type: event.type,
      orgUnitId: event.orgUnitId,
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
 * NOTE: Implementation depends on the event outbox infrastructure (FASE 1.20).
 * For now, this is a placeholder that logs the event would be stored.
 */
export const createOrgUnitOutboxHandler = ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prismaClient,
}: {
  _prismaClient: unknown; // Replace with actual PrismaClient when outbox is implemented
}): OrgUnitEventHandler => {
  return async (event: OrgUnitLifecycleEvent): Promise<void> => {
    // TODO: Implement event outbox storage (FASE 1.20)
    // For now, just log that the event would be stored
    console.log('[OrgUnitEventOutbox] Would store event:', {
      type: event.type,
      orgUnitId: event.orgUnitId,
      timestamp: event.timestamp.toISOString(),
    });
  };
};
