/**
 * GateEvent — Domain entity representing a single open/close event
 * recorded by a gate sensor.
 *
 * Each event captures the new state and the duration (in seconds)
 * of the previous state.
 *
 * @see Requirements 33.2, 33.6
 */

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

export type GateEventState = 'open' | 'closed';

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface GateEvent {
  readonly id: string;
  readonly gateId: string;
  readonly tenantId: string;
  readonly state: GateEventState;
  /** Duration of the previous state in seconds. */
  readonly duration: number;
  readonly timestamp: Date;
}

// ---------------------------------------------------------------------------
// Analytics type
// ---------------------------------------------------------------------------

/** Aggregated gate analytics for a given time range. */
export interface GateAnalytics {
  readonly totalEvents: number;
  readonly averageOpenDuration: number;
  readonly longestOpenDuration: number;
  readonly openCount: number;
  readonly closedCount: number;
  readonly timeRange: {
    readonly from: Date;
    readonly to: Date;
  };
}
