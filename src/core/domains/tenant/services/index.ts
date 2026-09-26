/**
 * Tenant services barrel export.
 *
 * @see FASE 1.18 Task 49: Tenant Onboarding Flow
 */

// TenantOnboardingService
export type {
  ITenantOnboardingService,
  IOnboardingEventEmitter,
  OnboardingEvent,
  OnboardTenantCommand,
  OnboardingResult,
  TenantOnboardingRepository,
  OrgUnitOnboardingRepository,
  SubscriptionOnboardingRepository,
} from './TenantOnboardingService';

export {
  TenantOnboardingServiceImpl,
  TenantLifecycleStatus,
  LIFECYCLE_TRANSITIONS,
  isValidLifecycleTransition,
  OnboardingEventType,
  onboardingTenantDuplicate,
  onboardingOwnerAlreadyExists,
  onboardingUserQuarantined,
  onboardingInvalidPlan,
  onboardingFailed,
  onboardingInvalidTransition,
} from './TenantOnboardingService';

export type { TenantOnboardingService } from './TenantOnboardingService';
