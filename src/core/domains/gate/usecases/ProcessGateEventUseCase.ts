/**
 * ProcessGateEventUseCase — Records a gate state change event.
 *
 * Logic:
 * 1. Record state change via gateRepository.createEvent with duration
 * 2. Update gate status via gateRepository.updateStatus
 * 3. Publish gate event to Realtime Bus channel `gate_events:{tenantId}`
 * 4. Enqueue audit log via AuditQueueProtocol (fire-and-forget)
 * 5. Return ok(gateEvent)
 *
 * @see Requirements 33.1, 33.2, 33.3, 33.4, 33.10
 */

import type {
  AuditQueueProtocol,
  RealtimeBusProtocol,
} from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { fail, ok } from '@core/utils';
import type { GateRepository } from '../repositories/GateRepository';
import type { GateEvent, GateEventState } from '../entities';
import { EVENT_CHANNELS } from '@core/domains/realtimeBus/entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface ProcessGateEventInput {
  readonly tenantId: string;
  readonly gateId: string;
  readonly state: GateEventState;
  /** Duration of the previous state in seconds. */
  readonly previousStateDuration: number;
}

export interface ProcessGateEventUseCase {
  execute(params: ProcessGateEventInput): Promise<DomainResult<GateEvent>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const ProcessGateEventUseCaseImpl = ({
  gateRepository,
  realtimeBusProtocol,
  auditQueueProtocol,
}: {
  gateRepository: GateRepository;
  realtimeBusProtocol: RealtimeBusProtocol;
  auditQueueProtocol: AuditQueueProtocol;
}): ProcessGateEventUseCase => ({
  execute: async ({ tenantId, gateId, state, previousStateDuration }) => {
    // 1. Record the gate event with duration of previous state
    const eventResult = await gateRepository.createEvent(
      tenantId,
      gateId,
      state,
      previousStateDuration,
    );

    if (!eventResult.success) {
      return fail(eventResult.error);
    }

    const gateEvent = eventResult.data;

    // 2. Update gate status to match new state
    const newStatus = state === 'open' ? 'open' : 'closed';
    gateRepository
      .updateStatus(tenantId, gateId, newStatus)
      .catch(() => {
        /* status update failure must not block the response */
      });

    // 3. Publish to Realtime Bus (fire-and-forget)
    const channel = `${EVENT_CHANNELS.GATE_EVENTS}:${tenantId}`;
    realtimeBusProtocol
      .publish(channel, {
        id: gateEvent.id,
        tenantId,
        channel: EVENT_CHANNELS.GATE_EVENTS,
        eventType: `gate_${state}`,
        payload: {
          gateId,
          state,
          duration: previousStateDuration,
          timestamp: gateEvent.timestamp.toISOString(),
        },
        privacy: 'shared',
        timestamp: gateEvent.timestamp,
      })
      .catch(() => {
        /* realtime delivery must not block the response */
      });

    // 4. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId,
        actorUserId: 'system',
        actionType: 'gate_state_changed',
        resourceType: 'gate',
        resourceId: gateId,
        details: {
          state,
          previousStateDuration,
          eventId: gateEvent.id,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 5. Return success
    return ok(gateEvent);
  },
});
