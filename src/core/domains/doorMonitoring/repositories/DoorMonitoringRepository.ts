/**
 * DoorMonitoringRepository — Core repository interface for door-sensor
 * configuration, installation requests, and the door-state dashboard read
 * model.
 *
 * All methods return DomainResult to keep success/error paths explicit.
 * Infrastructure provides the concrete Prisma implementation.
 */

import type { DomainResult } from '@core/utils';
import type {
  DoorSensorConfig,
  DoorState,
  DoorInstallationRequest,
  DoorInstallationRequestView,
  DoorInstallationStatus,
  DoorStateMarker,
} from '../entities';

// ---------------------------------------------------------------------------
// Input types (persistence-level, distinct from use-case inputs)
// ---------------------------------------------------------------------------

/** Fields an admin sets when binding a physical device + siren zone. */
export interface BindDoorSensorData {
  readonly iotDeviceId: string;
  readonly sirenZone: string;
}

/** Fields a resident sets for their monitoring window. */
export interface UpdateWindowData {
  readonly monitorStart: string;
  readonly monitorEnd: string;
  readonly enabled: boolean;
}

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface DoorMonitoringRepository {
  // --- DoorSensorConfig ----------------------------------------------------

  /** Ensure a config row exists for the household, returning it. */
  ensureConfig(
    tenantId: string,
    householdId: string,
  ): Promise<DomainResult<DoorSensorConfig>>;

  /** Find the config for a household (null when none exists). */
  findByHousehold(
    tenantId: string,
    householdId: string,
  ): Promise<DomainResult<DoorSensorConfig | null>>;

  /**
   * Find the config bound to a given IoTDevice id, across tenants — used by the
   * webhook trigger path which resolves tenant from the device.
   */
  findByDeviceId(
    iotDeviceId: string,
  ): Promise<DomainResult<DoorSensorConfig | null>>;

  /** Bind a registered device + siren zone to a household (admin action). */
  bindDevice(
    tenantId: string,
    householdId: string,
    data: BindDoorSensorData,
  ): Promise<DomainResult<DoorSensorConfig>>;

  /** Update the resident-configured monitoring window. */
  updateWindow(
    tenantId: string,
    householdId: string,
    data: UpdateWindowData,
  ): Promise<DomainResult<DoorSensorConfig>>;

  /** Update the last known physical door state (from webhook events). */
  updateDoorState(
    tenantId: string,
    householdId: string,
    state: DoorState,
    changedAt: Date,
  ): Promise<DomainResult<DoorSensorConfig>>;

  /** Dashboard read model: all configured households with door state + coords. */
  listDoorStateMarkers(
    tenantId: string,
  ): Promise<DomainResult<DoorStateMarker[]>>;

  // --- DoorInstallationRequest --------------------------------------------

  /** Create a new installation request (RT action). */
  createInstallationRequest(
    tenantId: string,
    householdId: string,
    requestedBy: string,
    note: string | null,
  ): Promise<DomainResult<DoorInstallationRequest>>;

  /** Find a single installation request by id, tenant-scoped. */
  findInstallationRequest(
    tenantId: string,
    id: string,
  ): Promise<DomainResult<DoorInstallationRequest | null>>;

  /**
   * List installation requests for a tenant, optionally filtered by status.
   * Each row is enriched with the target household's number/address/block.
   */
  listInstallationRequests(
    tenantId: string,
    status?: DoorInstallationStatus,
  ): Promise<DomainResult<DoorInstallationRequestView[]>>;

  /** Resolve (approve/reject) an installation request. */
  resolveInstallationRequest(
    tenantId: string,
    id: string,
    status: Exclude<DoorInstallationStatus, 'pending'>,
    resolvedBy: string,
  ): Promise<DomainResult<DoorInstallationRequest>>;
}
