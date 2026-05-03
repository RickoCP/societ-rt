/**
 * SubmitRsvpUseCase — Submits an RSVP for a community event.
 *
 * Logic:
 * 1. Submit RSVP via eventRepository.submitRsvp
 *    (repository checks duplicate via unique constraint → returns EVENT_DUPLICATE_RSVP)
 * 2. Enqueue audit (action: 'event_rsvp_submitted', fire-and-forget)
 * 3. Return ok(rsvp)
 *
 * @see Requirements 14.3, 14.4
 */

import type { AuthContext, AuditQueueProtocol } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { EventRepository } from '../repositories/EventRepository';
import type { EventRsvp, RsvpResponse } from '../entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface SubmitRsvpUseCase {
  execute(params: {
    authContext: AuthContext;
    eventId: string;
    response: RsvpResponse;
  }): Promise<DomainResult<EventRsvp>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const SubmitRsvpUseCaseImpl = ({
  eventRepository,
  auditQueueProtocol,
}: {
  eventRepository: EventRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): SubmitRsvpUseCase => ({
  execute: async ({ authContext, eventId, response }) => {
    // 1. Submit RSVP via repository (duplicate check via unique constraint)
    const result = await eventRepository.submitRsvp(
      eventId,
      authContext.userId,
      response,
    );

    if (!result.success) {
      return fail(result.error);
    }

    const rsvp = result.data;

    // 2. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'event_rsvp_submitted',
        resourceType: 'event_rsvp',
        resourceId: rsvp.id,
        details: { eventId, response },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 3. Return success
    return ok(rsvp);
  },
});
