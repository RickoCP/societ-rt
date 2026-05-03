/**
 * EventRepository — Core repository interface for community event
 * operations.
 *
 * All methods return DomainResult to keep success/error paths explicit.
 * Infrastructure layer provides the concrete implementation.
 *
 * @see Requirements 14.1, 14.2, 14.3, 14.4
 */

import type { DomainResult } from '@core/utils';
import type { CommunityEvent, CreateEventInput, EventRsvp, RsvpResponse } from '../entities';

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface EventRepository {
  /** Create a new community event within a tenant. */
  createEvent(
    tenantId: string,
    data: CreateEventInput,
    createdBy: string,
  ): Promise<DomainResult<CommunityEvent>>;

  /** Submit an RSVP for an event. */
  submitRsvp(
    eventId: string,
    userId: string,
    response: RsvpResponse,
  ): Promise<DomainResult<EventRsvp>>;

  /** Find all events within a tenant. */
  findByTenant(tenantId: string): Promise<DomainResult<CommunityEvent[]>>;

  /** Find all RSVPs for a specific event. */
  findRsvpsByEvent(eventId: string): Promise<DomainResult<EventRsvp[]>>;
}
