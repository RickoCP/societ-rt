/**
 * TenantSettingsRepository — Core repository interface for tenant settings operations.
 *
 * This repository provides methods for managing tenant profile, configuration,
 * and lifecycle status for the Admin UI Tenant Settings feature.
 *
 * All methods return DomainResult to keep success/error paths explicit.
 * Infrastructure layer provides the concrete implementation.
 *
 * @see Requirements 11.5-11.10 (Profile), 12.2-12.10 (Configuration), 13.1-13.11 (Lifecycle)
 */

import type { DomainResult } from '@core/utils';
import type {
  TenantProfile,
  UpdateTenantProfileInput,
} from '../entities/TenantProfile';
import type {
  TenantConfiguration,
  UpdateTenantConfigInput,
} from '../entities/TenantConfiguration';
import type {
  TenantLifecycleStatus,
  LifecycleTransitionInput,
  LifecycleEvent,
  LifecycleStatusValue,
} from '../entities/TenantLifecycleStatus';

// ---------------------------------------------------------------------------
// Combined Settings Type
// ---------------------------------------------------------------------------

/**
 * Combined tenant settings including profile, configuration, and lifecycle status.
 */
export interface TenantSettings {
  /** Tenant profile information (branding, contact). */
  readonly profile: TenantProfile;

  /** Tenant configuration settings (IoT, notifications, timezone). */
  readonly configuration: TenantConfiguration;

  /** Tenant lifecycle status and history. */
  readonly lifecycle: TenantLifecycleStatus;
}

// ---------------------------------------------------------------------------
// Repository Interface
// ---------------------------------------------------------------------------

/**
 * TenantSettingsRepository interface for tenant settings operations.
 */
export interface TenantSettingsRepository {
  // -------------------------------------------------------------------------
  // Read Operations
  // -------------------------------------------------------------------------

  /**
   * Get all tenant settings (profile, configuration, lifecycle) in one call.
   *
   * @param tenantId - The tenant ID
   * @returns DomainResult with combined TenantSettings or error
   */
  getSettings(tenantId: string): Promise<DomainResult<TenantSettings>>;

  /**
   * Get tenant profile information.
   *
   * @param tenantId - The tenant ID
   * @returns DomainResult with TenantProfile or error
   */
  getProfile(tenantId: string): Promise<DomainResult<TenantProfile>>;

  /**
   * Get tenant configuration settings.
   *
   * @param tenantId - The tenant ID
   * @returns DomainResult with TenantConfiguration or error
   */
  getConfiguration(tenantId: string): Promise<DomainResult<TenantConfiguration>>;

  /**
   * Get tenant lifecycle status and history.
   *
   * @param tenantId - The tenant ID
   * @param historyLimit - Maximum number of history events to return (default: 10)
   * @returns DomainResult with TenantLifecycleStatus or error
   */
  getLifecycleStatus(
    tenantId: string,
    historyLimit?: number,
  ): Promise<DomainResult<TenantLifecycleStatus>>;

  // -------------------------------------------------------------------------
  // Write Operations
  // -------------------------------------------------------------------------

  /**
   * Update tenant profile information.
   *
   * @param input - The profile update input
   * @returns DomainResult with updated TenantProfile or error
   */
  updateProfile(
    input: UpdateTenantProfileInput,
  ): Promise<DomainResult<TenantProfile>>;

  /**
   * Update tenant configuration settings.
   *
   * @param input - The configuration update input
   * @returns DomainResult with updated TenantConfiguration or error
   */
  updateConfiguration(
    input: UpdateTenantConfigInput,
  ): Promise<DomainResult<TenantConfiguration>>;

  /**
   * Execute a lifecycle status transition.
   *
   * @param input - The lifecycle transition input
   * @returns DomainResult with updated TenantLifecycleStatus or error
   */
  transitionLifecycle(
    input: LifecycleTransitionInput,
  ): Promise<DomainResult<TenantLifecycleStatus>>;

  // -------------------------------------------------------------------------
  // Additional Operations
  // -------------------------------------------------------------------------

  /**
   * Get lifecycle history for a tenant.
   *
   * @param tenantId - The tenant ID
   * @param limit - Maximum number of events to return
   * @param offset - Number of events to skip
   * @returns DomainResult with array of LifecycleEvent or error
   */
  getLifecycleHistory(
    tenantId: string,
    limit?: number,
    offset?: number,
  ): Promise<DomainResult<LifecycleEvent[]>>;

  /**
   * Check if a tenant exists.
   *
   * @param tenantId - The tenant ID
   * @returns DomainResult with boolean indicating existence or error
   */
  exists(tenantId: string): Promise<DomainResult<boolean>>;

  /**
   * Get the current lifecycle status value for a tenant.
   * This is a lightweight check that doesn't include history.
   *
   * @param tenantId - The tenant ID
   * @returns DomainResult with current LifecycleStatusValue or error
   */
  getCurrentLifecycleStatus(
    tenantId: string,
  ): Promise<DomainResult<LifecycleStatusValue>>;
}
