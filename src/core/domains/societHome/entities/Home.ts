/**
 * Home — Domain entity representing a SocieT-Home instance associated
 * with a Household within a tenant.
 *
 * A Home links a Home_Owner to their Household for smart home device
 * management, dashboard access, and device alert configuration.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 37.1, 37.2, 37.5
 */

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface Home {
  readonly id: string;
  readonly tenantId: string;
  readonly householdId: string;
  readonly ownerId: string;
  readonly createdAt: Date;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Data required to create a new Home record. */
export interface CreateHomeInput {
  readonly tenantId: string;
  readonly householdId: string;
  readonly ownerId: string;
}

// ---------------------------------------------------------------------------
// Supporting types
// ---------------------------------------------------------------------------

/** Device dashboard item showing paired device status for a Home_Owner. */
export interface DeviceDashboardItem {
  readonly deviceId: string;
  readonly name: string;
  readonly deviceType: string;
  readonly onlineStatus: 'online' | 'offline';
  readonly batteryLevel: number | null;
  readonly lastSeen: Date;
  readonly lastActivity: Date | null;
}

/** Alert preferences for a specific device. */
export interface DeviceAlertPreferences {
  readonly deviceId: string;
  readonly eventFilters: string[];
  readonly quietHoursStart: string | null; // HH:mm format
  readonly quietHoursEnd: string | null; // HH:mm format
  readonly enabled: boolean;
}

/** Input for configuring device alert preferences. */
export interface ConfigureDeviceAlertsInput {
  readonly deviceId: string;
  readonly eventFilters: string[];
  readonly quietHoursStart: string | null;
  readonly quietHoursEnd: string | null;
  readonly enabled: boolean;
}

/** Input for transferring device ownership. */
export interface TransferDeviceOwnershipInput {
  readonly deviceId: string;
  readonly newOwnerId: string;
  readonly newHouseholdId: string;
}
