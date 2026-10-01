/**
 * Platform use cases index.
 *
 * Re-exports all platform-related use cases.
 */

// GetPlatformMetrics
export type {
  GetPlatformMetricsUseCase,
  GetPlatformMetricsUseCaseInput,
  GetPlatformMetricsUseCaseType,
} from './GetPlatformMetricsUseCase';
export { GetPlatformMetricsUseCaseImpl } from './GetPlatformMetricsUseCase';

// GetTenantsOverview
export type {
  GetTenantsOverviewUseCase,
  GetTenantsOverviewUseCaseInput,
  GetTenantsOverviewUseCaseType,
} from './GetTenantsOverviewUseCase';
export { GetTenantsOverviewUseCaseImpl } from './GetTenantsOverviewUseCase';

// GetSecurityEvents
export type {
  GetSecurityEventsUseCase,
  GetSecurityEventsUseCaseInput,
  GetSecurityEventsUseCaseType,
} from './GetSecurityEventsUseCase';
export { GetSecurityEventsUseCaseImpl } from './GetSecurityEventsUseCase';

// ImpersonateTenant (Platform Admin impersonation)
export type {
  ImpersonateTenantUseCase,
  ImpersonateTenantUseCaseInput,
  ImpersonateTenantUseCaseType,
} from './ImpersonateTenantUseCase';
export { ImpersonateTenantUseCaseImpl } from './ImpersonateTenantUseCase';

// EndImpersonation (Platform Admin end impersonation)
// Note: EndImpersonationResult is exported from the use case file, not repository
export type {
  EndImpersonationUseCase as EndTenantImpersonationUseCase,
  EndImpersonationUseCaseInput as EndTenantImpersonationUseCaseInput,
  EndImpersonationResult as EndTenantImpersonationResult,
  EndImpersonationUseCaseType as EndTenantImpersonationUseCaseType,
} from './EndImpersonationUseCase';
export { EndImpersonationUseCaseImpl as EndTenantImpersonationUseCaseImpl } from './EndImpersonationUseCase';
