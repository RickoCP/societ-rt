/**
 * PlanFeature — Enum representing available features in subscription plans.
 *
 * Features are used by the Entitlement Enforcer (Task 45) to gate access
 * to premium functionality based on the tenant's subscription plan.
 *
 * @see Requirements 17 (AC 2), 19 (AC 1-7)
 * @see Design Components > Entitlement Enforcement
 */

/**
 * All available subscription plan features.
 * These strings are stored in SubscriptionPlan.features array.
 */
export const PlanFeature = {
  // Core Features (available on all plans)
  RESIDENT_MANAGEMENT: 'resident_management',
  HOUSEHOLD_MANAGEMENT: 'household_management',
  ANNOUNCEMENT_BASIC: 'announcement_basic',
  EMERGENCY_ALERT: 'emergency_alert',

  // Standard Features
  FINANCE_BASIC: 'finance_basic',
  VOTING: 'voting',
  EVENT_MANAGEMENT: 'event_management',
  VISITOR_LOG: 'visitor_log',
  PATROL_SCHEDULE: 'patrol_schedule',

  // Pro Features
  FINANCE_ADVANCED: 'finance_advanced',
  IOT_INTEGRATION: 'iot_integration',
  DOOR_MONITORING: 'door_monitoring',
  CCTV_INTEGRATION: 'cctv_integration',
  AUTOMATION_RULES: 'automation_rules',
  ADVANCED_ANALYTICS: 'advanced_analytics',
  CUSTOM_BRANDING: 'custom_branding',

  // Enterprise Features
  MULTI_CLUSTER: 'multi_cluster',
  API_ACCESS: 'api_access',
  CUSTOM_INTEGRATIONS: 'custom_integrations',
  PRIORITY_SUPPORT: 'priority_support',
  SLA_GUARANTEE: 'sla_guarantee',
  AUDIT_LOG_EXPORT: 'audit_log_export',
  SSO_INTEGRATION: 'sso_integration',

  // Safety-Critical (always available regardless of plan)
  PANIC_BUTTON: 'panic_button',
  EMERGENCY_SIREN: 'emergency_siren',
} as const;

export type PlanFeature = (typeof PlanFeature)[keyof typeof PlanFeature];

/**
 * All plan feature values.
 */
export const ALL_PLAN_FEATURES: readonly PlanFeature[] = Object.values(PlanFeature);

/**
 * Safety-critical features that MUST be available regardless of subscription status.
 * These features bypass entitlement checks per Requirement 20.
 */
export const SAFETY_CRITICAL_FEATURES: readonly PlanFeature[] = [
  PlanFeature.PANIC_BUTTON,
  PlanFeature.EMERGENCY_SIREN,
  PlanFeature.EMERGENCY_ALERT,
] as const;

/**
 * Features included in each default plan tier.
 */
export const DEFAULT_PLAN_FEATURES: Record<string, readonly PlanFeature[]> = {
  Basic: [
    PlanFeature.RESIDENT_MANAGEMENT,
    PlanFeature.HOUSEHOLD_MANAGEMENT,
    PlanFeature.ANNOUNCEMENT_BASIC,
    PlanFeature.EMERGENCY_ALERT,
    PlanFeature.PANIC_BUTTON,
    PlanFeature.EMERGENCY_SIREN,
  ],
  Standard: [
    // All Basic features
    PlanFeature.RESIDENT_MANAGEMENT,
    PlanFeature.HOUSEHOLD_MANAGEMENT,
    PlanFeature.ANNOUNCEMENT_BASIC,
    PlanFeature.EMERGENCY_ALERT,
    PlanFeature.PANIC_BUTTON,
    PlanFeature.EMERGENCY_SIREN,
    // Standard additions
    PlanFeature.FINANCE_BASIC,
    PlanFeature.VOTING,
    PlanFeature.EVENT_MANAGEMENT,
    PlanFeature.VISITOR_LOG,
    PlanFeature.PATROL_SCHEDULE,
  ],
  Pro: [
    // All Standard features
    PlanFeature.RESIDENT_MANAGEMENT,
    PlanFeature.HOUSEHOLD_MANAGEMENT,
    PlanFeature.ANNOUNCEMENT_BASIC,
    PlanFeature.EMERGENCY_ALERT,
    PlanFeature.PANIC_BUTTON,
    PlanFeature.EMERGENCY_SIREN,
    PlanFeature.FINANCE_BASIC,
    PlanFeature.VOTING,
    PlanFeature.EVENT_MANAGEMENT,
    PlanFeature.VISITOR_LOG,
    PlanFeature.PATROL_SCHEDULE,
    // Pro additions
    PlanFeature.FINANCE_ADVANCED,
    PlanFeature.IOT_INTEGRATION,
    PlanFeature.DOOR_MONITORING,
    PlanFeature.CCTV_INTEGRATION,
    PlanFeature.AUTOMATION_RULES,
    PlanFeature.ADVANCED_ANALYTICS,
    PlanFeature.CUSTOM_BRANDING,
  ],
} as const;

/**
 * Check if a feature is safety-critical (always allowed).
 */
export function isSafetyCriticalFeature(feature: PlanFeature): boolean {
  return SAFETY_CRITICAL_FEATURES.includes(feature);
}

/**
 * Check if a feature is included in a plan's features array.
 */
export function isPlanFeatureIncluded(
  planFeatures: readonly string[],
  requiredFeature: PlanFeature,
): boolean {
  return planFeatures.includes(requiredFeature);
}
