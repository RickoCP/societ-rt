/**
 * Platform domain — Core entities and repository for Platform Admin operations.
 *
 * This module provides the domain layer for Platform Admin Dashboard features,
 * including system metrics, tenant overview, and security event management.
 *
 * @see Requirements 19-21 (Platform Admin)
 */

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export * from './entities';

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export type {
  PlatformRepository,
  GetPlatformMetricsInput,
  GetTenantsOverviewInput,
  GetSecurityEventsInput,
  AcknowledgeSecurityEventInput,
  GetSecurityEventTrendInput,
  ImpersonationResult,
  ForceSuspendTenantInput,
  ForceCloseTenantInput,
  ResetTokenVersionInput,
  StartTenantImpersonationInput,
  EndTenantImpersonationInput,
  EndImpersonationResult,
} from './repositories/PlatformRepository';

export { PLATFORM_ERROR_CODES } from './repositories/PlatformRepository';

// ---------------------------------------------------------------------------
// Use Cases
// ---------------------------------------------------------------------------

// GetPlatformMetrics
export type {
  GetPlatformMetricsUseCase,
  GetPlatformMetricsUseCaseInput,
} from './usecases';
export { GetPlatformMetricsUseCaseImpl } from './usecases';

// GetTenantsOverview
export type {
  GetTenantsOverviewUseCase,
  GetTenantsOverviewUseCaseInput,
} from './usecases';
export { GetTenantsOverviewUseCaseImpl } from './usecases';

// GetSecurityEvents
export type {
  GetSecurityEventsUseCase,
  GetSecurityEventsUseCaseInput,
} from './usecases';
export { GetSecurityEventsUseCaseImpl } from './usecases';

// ImpersonateTenant (Platform Admin impersonation)
export type {
  ImpersonateTenantUseCase,
  ImpersonateTenantUseCaseInput,
} from './usecases';
export { ImpersonateTenantUseCaseImpl } from './usecases';

// EndTenantImpersonation (Platform Admin end impersonation)
export type {
  EndTenantImpersonationUseCase,
  EndTenantImpersonationUseCaseInput,
  EndTenantImpersonationResult,
} from './usecases';
export { EndTenantImpersonationUseCaseImpl } from './usecases';
