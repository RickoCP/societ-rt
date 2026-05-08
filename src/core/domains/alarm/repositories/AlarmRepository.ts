/**
 * AlarmRepository — Core repository interface for smart alarm/siren
 * persistence operations.
 *
 * All methods return DomainResult to keep success/error paths explicit.
 * Infrastructure layer provides the concrete implementation.
 *
 * @see Requirements 36.1, 36.2, 36.4, 36.5, 36.6, 36.9
 */

import type { DomainResult } from '@core/utils';
import type {
  AlarmDevice,
  AlarmEvent,
  RegisterAlarmDeviceInput,
  CreateAlarmEventInput,
} from '../entities';

// ---------------------------------------------------------------------------
// Schedule type
// ---------------------------------------------------------------------------

export interface AlarmSchedule {
  readonly deviceId: string;
  readonly deviceName: string;
  readonly scheduleArm: string | null;
  readonly scheduleDisarm: string | null;
}

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface AlarmRepository {
  /** Register a new alarm/siren device within a tenant. */
  registerDevice(
    tenantId: string,
    data: RegisterAlarmDeviceInput,
  ): Promise<DomainResult<AlarmDevice>>;

  /** Find all alarm devices for a tenant. */
  findByTenant(tenantId: string): Promise<DomainResult<AlarmDevice[]>>;

  /** Find alarm devices associated with a specific zone within a tenant. */
  findByZone(
    tenantId: string,
    zone: string,
  ): Promise<DomainResult<AlarmDevice[]>>;

  /** Activate a siren device (set status to 'triggered'). */
  activateSiren(
    tenantId: string,
    deviceId: string,
  ): Promise<DomainResult<AlarmDevice>>;

  /** Deactivate a siren device (set status back to 'armed' or 'disarmed'). */
  deactivateSiren(
    tenantId: string,
    deviceId: string,
  ): Promise<DomainResult<AlarmDevice>>;

  /** Record an alarm activation/deactivation event. */
  createEvent(
    tenantId: string,
    data: CreateAlarmEventInput,
  ): Promise<DomainResult<AlarmEvent>>;

  /** Get alarm schedules for all devices within a tenant. */
  getSchedule(tenantId: string): Promise<DomainResult<AlarmSchedule[]>>;
}
