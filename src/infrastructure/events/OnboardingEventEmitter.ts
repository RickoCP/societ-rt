/**
 * OnboardingEventEmitter — Infrastructure implementation for tenant onboarding events.
 *
 * This module provides implementations of IOnboardingEventEmitter that can:
 * - Log events for debugging/development
 * - Support multiple event handlers
 *
 * **Event Flow:**
 * 1. TenantOnboardingService emits event via IOnboardingEventEmitter
 * 2. Event is logged (always)
 * 3. Event is forwarded to registered handlers
 *
 * @see FASE 1.18 Task 49: Tenant Onboarding Flow
 * @see Requirements 23 (AC 1-9), Requirements 49 (AC 1-10)
 */

import type {
  IOnboardingEventEmitter,
  OnboardingEvent,
} from '@core/domains/tenant/services';

/**
 * Event handler function type.
 */
export type OnboardingEventHandler = (event: OnboardingEvent) => Promise<void>;

/**
 * Logging-only event emitter for development/debugging.
 *
 * This implementation logs all events to console with structured format.
 * Use this for development or when event outbox is not configured.
 */
export const LoggingOnboardingEventEmitter = (): IOnboardingEventEmitter => {
  return {
    async emit(event: OnboardingEvent): Promise<void> {
      console.log('[OnboardingEvent]', JSON.stringify({
        type: event.type,
        tenantId: event.tenantId,
        timestamp: event.timestamp.toISOString(),
        initiatedBy: event.initiatedBy,
        details: event.details,
        error: event.error,
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
export const CompositeOnboardingEventEmitter = ({
  handlers,
}: {
  handlers: OnboardingEventHandler[];
}): IOnboardingEventEmitter => {
  return {
    async emit(event: OnboardingEvent): Promise<void> {
      // Run all handlers in parallel
      const results = await Promise.allSettled(
        handlers.map(handler => handler(event)),
      );

      // Log any failed handlers
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(
            `[OnboardingEventEmitter] Handler ${index} failed:`,
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
export const NoOpOnboardingEventEmitter = (): IOnboardingEventEmitter => {
  return {
    async emit(_event: OnboardingEvent): Promise<void> {
      // Do nothing
    },
  };
};

/**
 * Event handler that logs events to structured console output.
 */
export const createOnboardingLoggingHandler = (): OnboardingEventHandler => {
  return async (event: OnboardingEvent): Promise<void> => {
    console.log('[OnboardingEvent]', {
      type: event.type,
      tenantId: event.tenantId,
      timestamp: event.timestamp.toISOString(),
      initiatedBy: event.initiatedBy,
    });
  };
};
