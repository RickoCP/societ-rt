/**
 * EventRsvp — Domain entity representing an RSVP response
 * to a community event.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 14.3, 14.4
 */

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

export type RsvpResponse = 'attending' | 'not_attending';

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface EventRsvp {
  readonly id: string;
  readonly eventId: string;
  readonly userId: string;
  readonly response: RsvpResponse;
  readonly createdAt: Date;
}
