/**
 * Subscription use cases barrel export.
 *
 * Use cases for Admin UI subscription management including:
 * - GetSubscriptionUseCase: Fetch subscription overview with usage metrics
 * - ChangePlanUseCase: Handle plan upgrades, downgrades, and trial conversions
 * - GetBillingHistoryUseCase: Fetch paginated billing history
 *
 * @see Requirements 14.1-14.9, 15.5-15.9, 16.1-16.11
 */

// GetSubscriptionUseCase
export type {
  GetSubscriptionUseCase,
  GetSubscriptionInput,
  SubscriptionOverview,
  UsageMetrics,
  GetSubscriptionUseCaseType,
} from './GetSubscriptionUseCase';

export { GetSubscriptionUseCaseImpl } from './GetSubscriptionUseCase';

// ChangePlanUseCase
export type {
  ChangePlanUseCase,
  ChangePlanInput,
  ChangePlanResult,
  PlanChangeType,
  UsageLimitCheck,
  ExceededLimit,
  ChangePlanUseCaseType,
} from './ChangePlanUseCase';

export { ChangePlanUseCaseImpl } from './ChangePlanUseCase';

// GetBillingHistoryUseCase
export type {
  GetBillingHistoryUseCase,
  GetBillingHistoryInput,
  GetBillingHistoryUseCaseType,
} from './GetBillingHistoryUseCase';

export { GetBillingHistoryUseCaseImpl } from './GetBillingHistoryUseCase';

// GetTenantSubscriptionUseCase
export type {
  GetTenantSubscriptionUseCase,
  GetTenantSubscriptionInput,
  TenantSubscriptionView,
  GetTenantSubscriptionUseCaseType,
} from './GetTenantSubscriptionUseCase';

export { GetTenantSubscriptionUseCaseImpl } from './GetTenantSubscriptionUseCase';
