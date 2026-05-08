/**
 * Gate — Domain entity representing a community gate monitored
 * via IoT sensor within a tenant.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 33.1, 33.2, 33.7
 */

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

export type GateStatus = 'open' | 'closed' | 'offline';

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface Gate {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly location: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly deviceId: string;
  readonly status: GateStatus;
  readonly lastStateChange: Date;
  readonly createdAt: Date;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Data required to register a new gate. */
export interface RegisterGateInput {
  readonly name: string;
  readonly location: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly deviceId: string;
}
