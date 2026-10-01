/**
 * Subscription Repository barrel export.
 *
 * Exports the repository interfaces for the subscription domain.
 * Interfaces are defined in core (Clean Architecture) while implementations
 * live in infrastructure.
 *
 * @see Requirements 14, 15, 16, 17, 18
 */

// Repository interfaces
export type { ISubscriptionPlanRepository, PlanQueryOptions } from './ISubscriptionPlanRepository';
export type { ISubscriptionRepository, SubscriptionQueryOptions } from './ISubscriptionRepository';
export type {
  ISubscriptionAdminRepository,
  PlanChangeResult,
  InvoiceDownload,
  PaymentRetryResult,
} from './ISubscriptionAdminRepository';

// Alternative Admin Repository interface (with additional types)
export type {
  SubscriptionAdminRepository,
  ChangePlanInput as AdminChangePlanInput,
  ChangePlanResult as AdminChangePlanResult,
  RetryPaymentInput,
  RetryPaymentResult,
  InvoiceDownloadResult,
  DowngradeValidationResult,
  DowngradeViolation,
  SubscriptionErrorCode,
} from './SubscriptionAdminRepository';

export { SUBSCRIPTION_ERROR_CODES } from './SubscriptionAdminRepository';
