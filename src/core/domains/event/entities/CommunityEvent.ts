/**
 * CommunityEvent — Domain entity representing a community event
 * within a tenant.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 14.1, 14.2
 */

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface CommunityEvent {
  readonly id: string;
  readonly tenantId: string;
  readonly title: string;
  readonly description: string;
  readonly date: Date;
  readonly time: string;
  readonly location: string;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Data required to create a new community event. */
export interface CreateEventInput {
  readonly title: string;
  readonly description: string;
  readonly date: Date;
  readonly time: string;
  readonly location: string;
}
