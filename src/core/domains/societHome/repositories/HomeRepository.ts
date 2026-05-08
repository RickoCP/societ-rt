/**
 * HomeRepository — Core repository interface for SocieT-Home persistence
 * operations.
 *
 * All methods return DomainResult to keep success/error paths explicit.
 * Infrastructure layer provides the concrete implementation.
 *
 * @see Requirements 37.1, 37.2, 37.5, 37.7
 */

import type { DomainResult } from '@core/utils';
import type {
  Home,
  CreateHomeInput,
  DeviceDashboardItem,
  DeviceAlertPreferences,
  ConfigureDeviceAlertsInput,
} from '../entities';

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface HomeRepository {
  /** Create a new Home record linking a Home_Owner to a Household. */
  createHome(data: CreateHomeInput): Promise<DomainResult<Home>>;

  /** Find all Home records for a specific household within a tenant. */
  findByHousehold(
    tenantId: string,
    householdId: string,
  ): Promise<DomainResult<Home[]>>;

  /** Find all Home records owned by a specific user within a tenant. */
  findByOwner(
    tenantId: string,
    ownerId: string,
  ): Promise<DomainResult<Home[]>>;

  /** Get the device dashboard for a household: all paired devices with status. */
  getDeviceDashboard(
    tenantId: string,
    householdId: string,
  ): Promise<DomainResult<DeviceDashboardItem[]>>;

  /** Get alert preferences for a specific device. */
  getDeviceAlertPreferences(
    tenantId: string,
    deviceId: string,
  ): Promise<DomainResult<DeviceAlertPreferences | null>>;

  /** Save or update alert preferences for a specific device. */
  saveDeviceAlertPreferences(
    tenantId: string,
    data: ConfigureDeviceAlertsInput,
  ): Promise<DomainResult<DeviceAlertPreferences>>;

  /** Transfer device ownership to a new household and owner. */
  transferDeviceOwnership(
    tenantId: string,
    deviceId: string,
    newHouseholdId: string,
  ): Promise<DomainResult<void>>;
}
