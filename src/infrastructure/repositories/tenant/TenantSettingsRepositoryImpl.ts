/**
 * TenantSettingsRepositoryImpl — Infrastructure implementation of TenantSettingsRepository.
 *
 * This repository provides Admin UI tenant settings operations by calling the backend
 * TenantOnboardingService endpoints. It maps API responses to domain entities and
 * handles errors appropriately.
 *
 * **ERROR HANDLING:**
 * - Maps API errors to appropriate AppError types
 * - Returns DomainResult<T> for explicit success/error handling
 * - Never exposes internal error details to callers
 *
 * @see Requirements 11.5-11.10 (Profile), 12.2-12.10 (Configuration), 13.1-13.11 (Lifecycle)
 * @see TenantSettingsRepository interface for full contract
 */

import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError, notFoundError, validationError } from '@core/utils';
import type {
  TenantSettingsRepository,
  TenantSettings,
} from '@core/domains/tenant/repositories/TenantSettingsRepository';
import type {
  TenantProfile,
  UpdateTenantProfileInput,
} from '@core/domains/tenant/entities/TenantProfile';
import type {
  TenantConfiguration,
  UpdateTenantConfigInput,
  NotificationChannels,
  SirenConnectionStatus,
} from '@core/domains/tenant/entities/TenantConfiguration';
import type {
  TenantLifecycleStatus,
  LifecycleTransitionInput,
  LifecycleEvent,
  LifecycleStatusValue,
  LifecycleActionValue,
} from '@core/domains/tenant/entities/TenantLifecycleStatus';
import {
  LifecycleStatus,
  getAvailableActions,
  LIFECYCLE_TRANSITIONS,
} from '@core/domains/tenant/entities/TenantLifecycleStatus';
import type { HttpProtocol } from '@core/protocols';

// ---------------------------------------------------------------------------
// API Response Types
// ---------------------------------------------------------------------------

/**
 * API response for tenant profile.
 */
interface TenantProfileApiResponse {
  tenantId: string;
  name: string;
  rtRwNumber: string;
  region: string;
  address: string;
  contactPerson: string;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

/**
 * API response for tenant configuration.
 */
interface TenantConfigurationApiResponse {
  tenantId: string;
  sirenDeviceId: string | null;
  sirenConnectionStatus: string;
  notificationChannels: {
    telegram: boolean;
    whatsapp: boolean;
    email: boolean;
  };
  timezone: string;
  language: string;
  emergencyEscalationTimeout: number;
  updatedAt: string;
  updatedBy: string | null;
}

/**
 * API response for lifecycle event.
 */
interface LifecycleEventApiResponse {
  id: string;
  tenantId: string;
  fromStatus: string;
  toStatus: string;
  action: string;
  reason: string | null;
  timestamp: string;
  actorUserId: string;
  actorName: string | null;
  ipAddress: string | null;
}

/**
 * API response for tenant lifecycle status.
 */
interface TenantLifecycleStatusApiResponse {
  tenantId: string;
  currentStatus: string;
  statusChangedAt: string;
  statusChangedBy: string | null;
  history: LifecycleEventApiResponse[];
}

/**
 * API response for combined tenant settings.
 */
interface TenantSettingsApiResponse {
  profile: TenantProfileApiResponse;
  configuration: TenantConfigurationApiResponse;
  lifecycle: TenantLifecycleStatusApiResponse;
}

/**
 * API error response.
 */
interface ApiErrorResponse {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

/**
 * Maps API profile response to domain TenantProfile entity.
 */
function mapProfileFromApi(api: TenantProfileApiResponse): TenantProfile {
  return {
    tenantId: api.tenantId,
    name: api.name,
    rtRwNumber: api.rtRwNumber,
    region: api.region,
    address: api.address,
    contactPerson: api.contactPerson,
    logoUrl: api.logoUrl,
    primaryColor: api.primaryColor,
    secondaryColor: api.secondaryColor,
    updatedAt: new Date(api.updatedAt),
    updatedBy: api.updatedBy,
  };
}

/**
 * Maps API configuration response to domain TenantConfiguration entity.
 */
function mapConfigurationFromApi(
  api: TenantConfigurationApiResponse,
): TenantConfiguration {
  return {
    tenantId: api.tenantId,
    sirenDeviceId: api.sirenDeviceId,
    sirenConnectionStatus: api.sirenConnectionStatus as SirenConnectionStatus,
    notificationChannels: api.notificationChannels as NotificationChannels,
    timezone: api.timezone,
    language: api.language,
    emergencyEscalationTimeout: api.emergencyEscalationTimeout,
    updatedAt: new Date(api.updatedAt),
    updatedBy: api.updatedBy,
  };
}

/**
 * Maps API lifecycle event to domain LifecycleEvent entity.
 */
function mapLifecycleEventFromApi(api: LifecycleEventApiResponse): LifecycleEvent {
  return {
    id: api.id,
    tenantId: api.tenantId,
    fromStatus: api.fromStatus as LifecycleStatusValue,
    toStatus: api.toStatus as LifecycleStatusValue,
    action: api.action as LifecycleActionValue,
    reason: api.reason,
    timestamp: new Date(api.timestamp),
    actorUserId: api.actorUserId,
    actorName: api.actorName,
    ipAddress: api.ipAddress,
  };
}

/**
 * Maps API lifecycle status response to domain TenantLifecycleStatus entity.
 */
function mapLifecycleStatusFromApi(
  api: TenantLifecycleStatusApiResponse,
  isPlatformAdmin: boolean = false,
): TenantLifecycleStatus {
  const currentStatus = api.currentStatus as LifecycleStatusValue;
  const availableTransitions = LIFECYCLE_TRANSITIONS[currentStatus] ?? [];
  const availableActions = getAvailableActions(currentStatus, isPlatformAdmin);

  return {
    tenantId: api.tenantId,
    currentStatus,
    availableTransitions,
    availableActions,
    history: api.history.map(mapLifecycleEventFromApi),
    statusChangedAt: new Date(api.statusChangedAt),
    statusChangedBy: api.statusChangedBy,
  };
}

/**
 * Maps API error to DomainResult failure.
 */
function mapApiError<T>(error: unknown): DomainResult<T> {
  // Handle axios-like error response
  const errorResponse = error as {
    response?: { status?: number; data?: ApiErrorResponse };
  };
  const status = errorResponse?.response?.status;
  const data = errorResponse?.response?.data;

  if (status === 404) {
    return fail(
      notFoundError(
        data?.code ?? 'TENANT_NOT_FOUND',
        data?.message ?? 'Tenant not found',
      ),
    );
  }

  if (status === 400) {
    return fail(
      validationError(
        data?.code ?? 'VALIDATION_ERROR',
        data?.message ?? 'Invalid request',
      ),
    );
  }

  if (status === 403) {
    return fail({
      type: 'authorization',
      code: data?.code ?? 'AUTH_FORBIDDEN',
      message: data?.message ?? 'Access denied',
      retryable: false,
    });
  }

  if (status === 409) {
    return fail({
      type: 'business',
      code: data?.code ?? 'CONFLICT',
      message: data?.message ?? 'Operation not allowed in current state',
      retryable: false,
    });
  }

  // Generic technical error for unknown cases
  return fail(
    technicalError(
      data?.code ?? 'TENANT_SETTINGS_API_ERROR',
      data?.message ?? 'Failed to process tenant settings operation',
      { retryable: true },
    ),
  );
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a TenantSettingsRepository implementation.
 *
 * @param dependencies - The repository dependencies
 * @returns An implementation of TenantSettingsRepository
 */
export const TenantSettingsRepositoryImpl = ({
  httpProtocol,
}: {
  httpProtocol: HttpProtocol;
}): TenantSettingsRepository => {
  const baseUrl = '/api/admin/tenant-settings';

  return {
    // -------------------------------------------------------------------------
    // Read Operations
    // -------------------------------------------------------------------------

    /**
     * Get all tenant settings (profile, configuration, lifecycle) in one call.
     *
     * @see TenantSettingsRepository.getSettings
     */
    async getSettings(tenantId: string): Promise<DomainResult<TenantSettings>> {
      try {
        const response = await httpProtocol.get<TenantSettingsApiResponse>(
          `${baseUrl}/${tenantId}`,
        );

        return ok({
          profile: mapProfileFromApi(response.profile),
          configuration: mapConfigurationFromApi(response.configuration),
          lifecycle: mapLifecycleStatusFromApi(response.lifecycle),
        });
      } catch (error) {
        return mapApiError<TenantSettings>(error);
      }
    },

    /**
     * Get tenant profile information.
     *
     * @see TenantSettingsRepository.getProfile
     */
    async getProfile(tenantId: string): Promise<DomainResult<TenantProfile>> {
      try {
        const response = await httpProtocol.get<TenantProfileApiResponse>(
          `${baseUrl}/${tenantId}/profile`,
        );

        return ok(mapProfileFromApi(response));
      } catch (error) {
        return mapApiError<TenantProfile>(error);
      }
    },

    /**
     * Get tenant configuration settings.
     *
     * @see TenantSettingsRepository.getConfiguration
     */
    async getConfiguration(
      tenantId: string,
    ): Promise<DomainResult<TenantConfiguration>> {
      try {
        const response = await httpProtocol.get<TenantConfigurationApiResponse>(
          `${baseUrl}/${tenantId}/configuration`,
        );

        return ok(mapConfigurationFromApi(response));
      } catch (error) {
        return mapApiError<TenantConfiguration>(error);
      }
    },

    /**
     * Get tenant lifecycle status and history.
     *
     * @see TenantSettingsRepository.getLifecycleStatus
     */
    async getLifecycleStatus(
      tenantId: string,
      historyLimit: number = 10,
    ): Promise<DomainResult<TenantLifecycleStatus>> {
      try {
        const params = new URLSearchParams({
          historyLimit: String(historyLimit),
        });
        const response = await httpProtocol.get<TenantLifecycleStatusApiResponse>(
          `${baseUrl}/${tenantId}/lifecycle?${params.toString()}`,
        );

        return ok(mapLifecycleStatusFromApi(response));
      } catch (error) {
        return mapApiError<TenantLifecycleStatus>(error);
      }
    },

    // -------------------------------------------------------------------------
    // Write Operations
    // -------------------------------------------------------------------------

    /**
     * Update tenant profile information.
     *
     * @see TenantSettingsRepository.updateProfile
     */
    async updateProfile(
      input: UpdateTenantProfileInput,
    ): Promise<DomainResult<TenantProfile>> {
      try {
        const { tenantId, ...updateData } = input;

        const response = await httpProtocol.patch<TenantProfileApiResponse>(
          `${baseUrl}/${tenantId}/profile`,
          updateData,
        );

        return ok(mapProfileFromApi(response));
      } catch (error) {
        return mapApiError<TenantProfile>(error);
      }
    },

    /**
     * Update tenant configuration settings.
     *
     * @see TenantSettingsRepository.updateConfiguration
     */
    async updateConfiguration(
      input: UpdateTenantConfigInput,
    ): Promise<DomainResult<TenantConfiguration>> {
      try {
        const { tenantId, ...updateData } = input;

        const response = await httpProtocol.patch<TenantConfigurationApiResponse>(
          `${baseUrl}/${tenantId}/configuration`,
          updateData,
        );

        return ok(mapConfigurationFromApi(response));
      } catch (error) {
        return mapApiError<TenantConfiguration>(error);
      }
    },

    /**
     * Execute a lifecycle status transition.
     *
     * @see TenantSettingsRepository.transitionLifecycle
     */
    async transitionLifecycle(
      input: LifecycleTransitionInput,
    ): Promise<DomainResult<TenantLifecycleStatus>> {
      try {
        const { tenantId, ...transitionData } = input;

        const response = await httpProtocol.post<TenantLifecycleStatusApiResponse>(
          `${baseUrl}/${tenantId}/lifecycle/transition`,
          transitionData,
        );

        return ok(mapLifecycleStatusFromApi(response));
      } catch (error) {
        return mapApiError<TenantLifecycleStatus>(error);
      }
    },

    // -------------------------------------------------------------------------
    // Additional Operations
    // -------------------------------------------------------------------------

    /**
     * Get lifecycle history for a tenant.
     *
     * @see TenantSettingsRepository.getLifecycleHistory
     */
    async getLifecycleHistory(
      tenantId: string,
      limit: number = 50,
      offset: number = 0,
    ): Promise<DomainResult<LifecycleEvent[]>> {
      try {
        const params = new URLSearchParams({
          limit: String(limit),
          offset: String(offset),
        });
        const response = await httpProtocol.get<LifecycleEventApiResponse[]>(
          `${baseUrl}/${tenantId}/lifecycle/history?${params.toString()}`,
        );

        return ok(response.map(mapLifecycleEventFromApi));
      } catch (error) {
        return mapApiError<LifecycleEvent[]>(error);
      }
    },

    /**
     * Check if a tenant exists.
     *
     * @see TenantSettingsRepository.exists
     */
    async exists(tenantId: string): Promise<DomainResult<boolean>> {
      try {
        await httpProtocol.get<{ exists: boolean }>(
          `${baseUrl}/${tenantId}/exists`,
        );
        return ok(true);
      } catch (error) {
        const errorResponse = error as {
          response?: { status?: number };
        };
        if (errorResponse?.response?.status === 404) {
          return ok(false);
        }
        return mapApiError<boolean>(error);
      }
    },

    /**
     * Get the current lifecycle status value for a tenant.
     *
     * @see TenantSettingsRepository.getCurrentLifecycleStatus
     */
    async getCurrentLifecycleStatus(
      tenantId: string,
    ): Promise<DomainResult<LifecycleStatusValue>> {
      try {
        const response = await httpProtocol.get<{ status: string }>(
          `${baseUrl}/${tenantId}/lifecycle/status`,
        );

        return ok(response.status as LifecycleStatusValue);
      } catch (error) {
        return mapApiError<LifecycleStatusValue>(error);
      }
    },
  };
};
