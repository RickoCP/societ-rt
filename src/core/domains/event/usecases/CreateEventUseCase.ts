/**
 * CreateEventUseCase — Creates a new community event within a tenant.
 *
 * Logic:
 * 1. Create event via eventRepository.createEvent
 * 2. Enqueue audit (action: 'event_created', fire-and-forget)
 * 3. Return ok(event)
 *
 * @see Requirements 14.1, 14.2
 */

import type { AuditQueueProtocol } from '@core/protocols';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import { getTenantId, getUserId } from '@core/domains/authorization/types';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { EventRepository } from '../repositories/EventRepository';
import type { CommunityEvent, CreateEventInput } from '../entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface CreateEventUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    data: CreateEventInput;
  }): Promise<DomainResult<CommunityEvent>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const CreateEventUseCaseImpl = ({
  eventRepository,
  auditQueueProtocol,
}: {
  eventRepository: EventRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): CreateEventUseCase => ({
  execute: async ({ authContext, data }) => {
    const tenantId = getTenantId(authContext);
    const userId = getUserId(authContext);
    
    // 1. Create event via repository
    const result = await eventRepository.createEvent(
      tenantId,
      data,
      userId,
    );

    if (!result.success) {
      return fail(result.error);
    }

    const event = result.data;

    // 2. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId,
        actorUserId: userId,
        actionType: 'event_created',
        resourceType: 'community_event',
        resourceId: event.id,
        details: { title: data.title, date: data.date.toISOString() },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 3. Return success
    return ok(event);
  },
});
