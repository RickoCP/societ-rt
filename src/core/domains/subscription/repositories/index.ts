/**
 * Subscription Repository barrel export.
 *
 * Exports the repository interfaces for the subscription domain.
 * Interfaces are defined in core (Clean Architecture) while implementations
 * live in infrastructure.
 *
 * @see Requirements 17, 18
 */

// Repository interfaces
export type { ISubscriptionPlanRepository, PlanQueryOptions } from './ISubscriptionPlanRepository';
export type { ISubscriptionRepository, SubscriptionQueryOptions } from './ISubscriptionRepository';
