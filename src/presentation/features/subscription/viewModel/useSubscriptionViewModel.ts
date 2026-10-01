'use client';

/**
 * useSubscriptionViewModel — ViewModel for the Subscription Management screen.
 *
 * Provides state and actions for:
 * - Fetching subscription data with React Query (current plan, status, usage)
 * - Managing plan comparison modal state
 * - Calculating usage percentages and warnings
 * - Determining if upgrade/downgrade is available
 * - Handling upgrade/downgrade flows with confirmation dialogs
 * - Managing trial to subscription conversion
 *
 * This ViewModel follows the Clean Architecture pattern:
 * Screen → ViewModel → UseCase → Repository
 *
 * @see Requirements 14.1-14.9 (Subscription Plan Overview)
 * @see Requirements 15.5-15.9 (Plan Upgrade/Downgrade Flow)
 * @see Design Components > 9. Subscription Management
 */

import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePermissions } from '@presentation/hooks/usePermissions';
import type { AppError } from '@core/utils';
import type { SubscriptionStatus, PlanFeature } from '@core/domains/subscription/types';
import type {
  AdminSubscriptionPlan,
  PlanComparisonResult,
  BillingCycle,
} from '@core/domains/subscription/entities/AdminSubscriptionPlan';
import type {
  DowngradeValidationResult,
} from '@core/domains/subscription/repositories/SubscriptionAdminRepository';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * React Query cache key for subscription queries.
 */
export const SUBSCRIPTION_QUERY_KEY = 'subscription';

/**
 * Usage warning threshold (80%).
 * @see Requirements 14.8
 */
export const USAGE_WARNING_THRESHOLD = 0.8;

/**
 * Usage critical threshold (100%).
 */
export const USAGE_CRITICAL_THRESHOLD = 1.0;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Plan tier type.
 */
export type PlanTier = 'Basic' | 'Standard' | 'Pro';

/**
 * Plan feature with availability indicator.
 * @see Requirements 14.4
 */
export interface PlanFeatureDisplay {
  /** Feature key/identifier */
  readonly key: string;
  /** Feature display name (i18n key) */
  readonly nameKey: string;
  /** Whether the feature is included in the current plan */
  readonly included: boolean;
  /** Whether the feature is safety-critical (always available) */
  readonly safetyCritical: boolean;
}

/**
 * Usage metric with current/max values.
 * @see Requirements 14.7
 */
export interface UsageMetric {
  /** Metric key */
  readonly key: 'members' | 'orgUnits' | 'storage';
  /** Current usage value */
  readonly current: number;
  /** Maximum allowed value */
  readonly max: number | null; // null = unlimited
  /** Display unit (e.g., 'users', 'units', 'GB') */
  readonly unit: string;
  /** Usage percentage (0-1+) */
  readonly percentage: number;
  /** Whether this metric is at warning level (>= 80%) */
  readonly isWarning: boolean;
  /** Whether this metric is at critical level (>= 100%) */
  readonly isCritical: boolean;
}

/**
 * Subscription plan data.
 */
export interface SubscriptionPlanData {
  readonly id: string;
  readonly name: string;
  readonly tier: PlanTier;
  readonly price: number;
  readonly currency: string;
  readonly billingCycle: 'monthly' | 'yearly';
  readonly features: readonly string[];
  readonly limits: {
    readonly maxMembers: number | null;
    readonly maxOrgUnits: number | null;
    readonly maxStorage: number | null; // bytes
  };
  readonly description?: string;
}

/**
 * Complete subscription data from API.
 */
export interface SubscriptionData {
  readonly id: string;
  readonly tenantId: string;
  readonly plan: SubscriptionPlanData;
  readonly status: SubscriptionStatus;
  readonly billingPeriod: {
    readonly start: Date;
    readonly end: Date;
  };
  readonly trialEndsAt: Date | null;
  readonly usage: {
    readonly members: number;
    readonly orgUnits: number;
    readonly storage: number; // bytes
  };
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Return type of useSubscriptionViewModel hook.
 */
export interface SubscriptionViewModel {
  // ---------------------------------------------------------------------------
  // Data State (React Query)
  // ---------------------------------------------------------------------------

  /**
   * Complete subscription data.
   */
  subscription: SubscriptionData | null;

  /**
   * Current plan info.
   */
  currentPlan: SubscriptionPlanData | null;

  /**
   * Subscription status.
   */
  status: SubscriptionStatus | null;

  /**
   * Whether data is being fetched.
   */
  isLoading: boolean;

  /**
   * Whether fetch has failed.
   */
  isError: boolean;

  /**
   * Error details if fetch failed.
   */
  error: AppError | null;

  // ---------------------------------------------------------------------------
  // Computed Data
  // ---------------------------------------------------------------------------

  /**
   * Days remaining in trial period.
   * @see Requirements 14.6
   */
  trialDaysRemaining: number | null;

  /**
   * Whether subscription is currently in trial.
   */
  isTrialActive: boolean;

  /**
   * Whether subscription is past due (payment overdue).
   * @see Requirements 14.5
   */
  isPastDue: boolean;

  /**
   * Billing period display info.
   * @see Requirements 14.3
   */
  billingPeriod: {
    readonly start: Date | null;
    readonly end: Date | null;
    readonly daysRemaining: number;
  };

  /**
   * Feature list with availability indicators.
   * @see Requirements 14.4
   */
  features: readonly PlanFeatureDisplay[];

  /**
   * Usage metrics with percentages and warnings.
   * @see Requirements 14.7, 14.8
   */
  usageMetrics: readonly UsageMetric[];

  /**
   * List of metrics that are at warning level.
   */
  usageWarnings: readonly string[];

  // ---------------------------------------------------------------------------
  // Modal State
  // ---------------------------------------------------------------------------

  /**
   * Whether plan comparison modal is open.
   */
  isPlanComparisonOpen: boolean;

  // ---------------------------------------------------------------------------
  // Permission State
  // ---------------------------------------------------------------------------

  /**
   * Whether user has tenant:manage permission.
   */
  canManage: boolean;

  /**
   * Whether upgrade is available.
   * True if not on highest tier and not in trial.
   */
  canUpgrade: boolean;

  /**
   * Whether downgrade is available.
   * True if not on lowest tier and not in trial.
   */
  canDowngrade: boolean;

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /**
   * Open the plan comparison modal.
   */
  openPlanComparison: () => void;

  /**
   * Close the plan comparison modal.
   */
  closePlanComparison: () => void;

  /**
   * Refetch subscription data.
   */
  refetch: () => void;

  // ---------------------------------------------------------------------------
  // Plan Change State (Requirements 15.5-15.9)
  // ---------------------------------------------------------------------------

  /**
   * Available subscription plans for comparison.
   */
  availablePlans: readonly AdminSubscriptionPlan[];

  /**
   * Whether plans are loading.
   */
  isPlansLoading: boolean;

  /**
   * Whether upgrade dialog is open.
   * @see Requirements 15.5
   */
  isUpgradeDialogOpen: boolean;

  /**
   * Whether downgrade dialog is open.
   * @see Requirements 15.6
   */
  isDowngradeDialogOpen: boolean;

  /**
   * Whether start subscription dialog is open (trial mode).
   * @see Requirements 15.9
   */
  isStartSubscriptionDialogOpen: boolean;

  /**
   * Currently selected plan for action.
   */
  selectedPlan: AdminSubscriptionPlan | null;

  /**
   * Current plan summary for dialog display.
   */
  currentPlanSummary: {
    readonly id: string;
    readonly name: string;
    readonly tier: string;
    readonly price: number;
    readonly currency: string;
    readonly billingCycle: 'monthly' | 'yearly';
  } | null;

  /**
   * Target plan summary for dialog display.
   */
  targetPlanSummary: {
    readonly id: string;
    readonly name: string;
    readonly tier: string;
    readonly price: number;
    readonly currency: string;
    readonly billingCycle: 'monthly' | 'yearly';
  } | null;

  /**
   * Plan comparison result for upgrade/downgrade dialogs.
   */
  planComparison: PlanComparisonResult | null;

  /**
   * Downgrade validation result.
   * @see Requirements 15.6
   */
  downgradeValidation: DowngradeValidationResult | null;

  /**
   * Current usage for downgrade comparison.
   */
  currentUsage: {
    readonly members: number;
    readonly orgUnits: number;
    readonly storage: number;
  } | null;

  /**
   * New plan limits for downgrade comparison.
   */
  newPlanLimits: {
    readonly maxMembers: number | null;
    readonly maxOrgUnits: number | null;
    readonly maxStorageBytes: number | null;
  } | null;

  /**
   * Whether plans are being compared.
   */
  isComparingPlans: boolean;

  /**
   * Whether downgrade is being validated.
   */
  isValidatingDowngrade: boolean;

  /**
   * Whether plan change is in progress.
   */
  isChangingPlan: boolean;

  /**
   * Error from plan change operation.
   */
  changePlanError: AppError | null;

  // ---------------------------------------------------------------------------
  // Plan Change Actions
  // ---------------------------------------------------------------------------

  /**
   * Handle upgrade action - opens upgrade dialog.
   * @see Requirements 15.5
   */
  handleUpgrade: (targetPlanId: string) => Promise<void>;

  /**
   * Handle downgrade action - validates and opens downgrade dialog.
   * @see Requirements 15.6
   */
  handleDowngrade: (targetPlanId: string) => Promise<void>;

  /**
   * Handle start subscription action for trial mode.
   * @see Requirements 15.9
   */
  handleStartSubscription: () => void;

  /**
   * Confirm the upgrade to selected plan.
   * @see Requirements 15.5
   */
  confirmUpgrade: () => Promise<void>;

  /**
   * Confirm the downgrade to selected plan.
   * @see Requirements 15.6
   */
  confirmDowngrade: () => Promise<void>;

  /**
   * Confirm starting subscription with selected plan (trial mode).
   * @see Requirements 15.9
   */
  confirmStartSubscription: (planId: string, billingCycle: BillingCycle) => Promise<void>;

  /**
   * Close upgrade dialog.
   */
  closeUpgradeDialog: () => void;

  /**
   * Close downgrade dialog.
   */
  closeDowngradeDialog: () => void;

  /**
   * Close start subscription dialog.
   */
  closeStartSubscriptionDialog: () => void;
}

// ---------------------------------------------------------------------------
// Feature Display Mapping
// ---------------------------------------------------------------------------

/**
 * Map of feature keys to display names (i18n keys).
 */
const FEATURE_DISPLAY_NAMES: Record<string, string> = {
  resident_management: 'subscription.features.resident_management',
  household_management: 'subscription.features.household_management',
  announcement_basic: 'subscription.features.announcement_basic',
  emergency_alert: 'subscription.features.emergency_alert',
  panic_button: 'subscription.features.panic_button',
  emergency_siren: 'subscription.features.emergency_siren',
  finance_basic: 'subscription.features.finance_basic',
  finance_advanced: 'subscription.features.finance_advanced',
  voting: 'subscription.features.voting',
  event_management: 'subscription.features.event_management',
  visitor_log: 'subscription.features.visitor_log',
  patrol_schedule: 'subscription.features.patrol_schedule',
  iot_integration: 'subscription.features.iot_integration',
  door_monitoring: 'subscription.features.door_monitoring',
  cctv_integration: 'subscription.features.cctv_integration',
  automation_rules: 'subscription.features.automation_rules',
  advanced_analytics: 'subscription.features.advanced_analytics',
  custom_branding: 'subscription.features.custom_branding',
  multi_cluster: 'subscription.features.multi_cluster',
  api_access: 'subscription.features.api_access',
  custom_integrations: 'subscription.features.custom_integrations',
  priority_support: 'subscription.features.priority_support',
  sla_guarantee: 'subscription.features.sla_guarantee',
  audit_log_export: 'subscription.features.audit_log_export',
  sso_integration: 'subscription.features.sso_integration',
};

/**
 * Safety-critical features that are always available.
 */
const SAFETY_CRITICAL_FEATURES: readonly string[] = [
  'panic_button',
  'emergency_siren',
  'emergency_alert',
];

/**
 * All displayable features in order.
 */
const ALL_FEATURES_ORDERED: readonly string[] = [
  // Core features
  'resident_management',
  'household_management',
  'announcement_basic',
  'emergency_alert',
  'panic_button',
  'emergency_siren',
  // Standard features
  'finance_basic',
  'voting',
  'event_management',
  'visitor_log',
  'patrol_schedule',
  // Pro features
  'finance_advanced',
  'iot_integration',
  'door_monitoring',
  'cctv_integration',
  'automation_rules',
  'advanced_analytics',
  'custom_branding',
];

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Calculate days remaining until a date.
 */
function calculateDaysRemaining(targetDate: Date | null): number {
  if (!targetDate) return 0;
  const now = new Date();
  const diff = targetDate.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

/**
 * Calculate usage percentage.
 */
function calculateUsagePercentage(current: number, max: number | null): number {
  if (max === null || max === 0) return 0; // Unlimited
  return current / max;
}

/**
 * Format storage value from bytes to GB.
 */
function formatStorageGB(bytes: number): number {
  return Math.round((bytes / (1024 * 1024 * 1024)) * 100) / 100;
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

/**
 * Fetch subscription data from the API.
 */
async function fetchSubscription(): Promise<SubscriptionData> {
  const response = await fetch('/api/admin/subscription', {
    credentials: 'include',
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
    };
    const error: AppError = {
      type:
        response.status === 401
          ? 'authentication'
          : response.status === 403
            ? 'authorization'
            : 'technical',
      code: errorData.code ?? 'SUBSCRIPTION_FETCH_ERROR',
      message:
        errorData.message ?? `Failed to fetch subscription: ${response.status}`,
    };
    throw error;
  }

  const json = (await response.json()) as { data?: SubscriptionData };

  if (!json.data) {
    throw {
      type: 'technical',
      code: 'SUBSCRIPTION_INVALID_RESPONSE',
      message: 'Invalid response format from subscription API',
    } as AppError;
  }

  // Parse date fields
  return {
    ...json.data,
    billingPeriod: {
      start: new Date(json.data.billingPeriod.start),
      end: new Date(json.data.billingPeriod.end),
    },
    trialEndsAt: json.data.trialEndsAt ? new Date(json.data.trialEndsAt) : null,
    createdAt: new Date(json.data.createdAt),
    updatedAt: new Date(json.data.updatedAt),
  };
}

// ---------------------------------------------------------------------------
// Hook Implementation
// ---------------------------------------------------------------------------

/**
 * useSubscriptionViewModel — React hook for the Subscription Management screen.
 *
 * @returns SubscriptionViewModel with state and actions
 *
 * @example
 * ```tsx
 * const vm = useSubscriptionViewModel();
 *
 * return (
 *   <SubscriptionOverview
 *     plan={vm.currentPlan}
 *     status={vm.status}
 *     usage={vm.usageMetrics}
 *     isLoading={vm.isLoading}
 *   />
 * );
 * ```
 */
export function useSubscriptionViewModel(): SubscriptionViewModel {
  // ---------------------------------------------------------------------------
  // Permissions
  // ---------------------------------------------------------------------------

  const { hasPermission, isLoading: isPermissionsLoading } = usePermissions();
  const canManage = hasPermission('tenant:manage');

  // ---------------------------------------------------------------------------
  // Modal State
  // ---------------------------------------------------------------------------

  const [isPlanComparisonOpen, setIsPlanComparisonOpen] = useState<boolean>(false);

  // ---------------------------------------------------------------------------
  // React Query
  // ---------------------------------------------------------------------------

  const {
    data,
    isLoading: isQueryLoading,
    isError,
    error: queryError,
    refetch,
  } = useQuery<SubscriptionData, AppError>({
    queryKey: [SUBSCRIPTION_QUERY_KEY],
    queryFn: fetchSubscription,
    enabled: canManage && !isPermissionsLoading,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // ---------------------------------------------------------------------------
  // Derived State
  // ---------------------------------------------------------------------------

  const subscription = data ?? null;
  const currentPlan = data?.plan ?? null;
  const status = data?.status ?? null;
  const isLoading = isPermissionsLoading || isQueryLoading;

  const error = useMemo<AppError | null>(() => {
    if (!queryError) return null;
    return queryError;
  }, [queryError]);

  // Trial calculations
  const isTrialActive = status === 'TRIAL';
  const trialDaysRemaining = useMemo(() => {
    if (!isTrialActive || !data?.trialEndsAt) return null;
    return calculateDaysRemaining(data.trialEndsAt);
  }, [isTrialActive, data?.trialEndsAt]);

  // Past due check
  const isPastDue = status === 'PAST_DUE';

  // Billing period
  const billingPeriod = useMemo(() => {
    if (!data?.billingPeriod) {
      return { start: null, end: null, daysRemaining: 0 };
    }
    return {
      start: data.billingPeriod.start,
      end: data.billingPeriod.end,
      daysRemaining: calculateDaysRemaining(data.billingPeriod.end),
    };
  }, [data?.billingPeriod]);

  // Feature list with availability indicators
  const features = useMemo<readonly PlanFeatureDisplay[]>(() => {
    const planFeatures = new Set(currentPlan?.features ?? []);

    return ALL_FEATURES_ORDERED.map(key => ({
      key,
      nameKey: FEATURE_DISPLAY_NAMES[key] ?? `subscription.features.${key}`,
      included: planFeatures.has(key),
      safetyCritical: SAFETY_CRITICAL_FEATURES.includes(key),
    }));
  }, [currentPlan?.features]);

  // Usage metrics with warnings
  const usageMetrics = useMemo<readonly UsageMetric[]>(() => {
    if (!data || !currentPlan) return [];

    const metrics: UsageMetric[] = [
      {
        key: 'members',
        current: data.usage.members,
        max: currentPlan.limits.maxMembers,
        unit: 'users',
        percentage: calculateUsagePercentage(
          data.usage.members,
          currentPlan.limits.maxMembers,
        ),
        isWarning: false,
        isCritical: false,
      },
      {
        key: 'orgUnits',
        current: data.usage.orgUnits,
        max: currentPlan.limits.maxOrgUnits,
        unit: 'units',
        percentage: calculateUsagePercentage(
          data.usage.orgUnits,
          currentPlan.limits.maxOrgUnits,
        ),
        isWarning: false,
        isCritical: false,
      },
      {
        key: 'storage',
        current: formatStorageGB(data.usage.storage),
        max:
          currentPlan.limits.maxStorage !== null
            ? formatStorageGB(currentPlan.limits.maxStorage)
            : null,
        unit: 'GB',
        percentage: calculateUsagePercentage(
          data.usage.storage,
          currentPlan.limits.maxStorage,
        ),
        isWarning: false,
        isCritical: false,
      },
    ];

    // Calculate warning/critical flags
    return metrics.map(metric => ({
      ...metric,
      isWarning: metric.percentage >= USAGE_WARNING_THRESHOLD && metric.percentage < USAGE_CRITICAL_THRESHOLD,
      isCritical: metric.percentage >= USAGE_CRITICAL_THRESHOLD,
    }));
  }, [data, currentPlan]);

  // Usage warnings list
  const usageWarnings = useMemo(() => {
    return usageMetrics
      .filter(m => m.isWarning || m.isCritical)
      .map(m => m.key);
  }, [usageMetrics]);

  // Upgrade/downgrade availability
  const canUpgrade = useMemo(() => {
    if (!currentPlan || isTrialActive) return false;
    // Can upgrade if not on Pro tier
    return currentPlan.tier !== 'Pro';
  }, [currentPlan, isTrialActive]);

  const canDowngrade = useMemo(() => {
    if (!currentPlan || isTrialActive) return false;
    // Can downgrade if not on Basic tier
    return currentPlan.tier !== 'Basic';
  }, [currentPlan, isTrialActive]);

  // ---------------------------------------------------------------------------
  // Plan Change State
  // ---------------------------------------------------------------------------

  const [selectedPlanForAction, setSelectedPlanForAction] = useState<string | null>(null);
  const [isUpgradeDialogOpen, setIsUpgradeDialogOpen] = useState<boolean>(false);
  const [isDowngradeDialogOpen, setIsDowngradeDialogOpen] = useState<boolean>(false);
  const [isStartSubscriptionDialogOpen, setIsStartSubscriptionDialogOpen] = useState<boolean>(false);
  const [planComparison, setPlanComparison] = useState<PlanComparisonResult | null>(null);
  const [downgradeValidation, setDowngradeValidation] = useState<DowngradeValidationResult | null>(null);

  const queryClient = useQueryClient();

  // ---------------------------------------------------------------------------
  // Available Plans Query
  // ---------------------------------------------------------------------------

  const {
    data: availablePlans,
    isLoading: isPlansLoading,
  } = useQuery<AdminSubscriptionPlan[], AppError>({
    queryKey: [SUBSCRIPTION_QUERY_KEY, 'plans'],
    queryFn: fetchAvailablePlans,
    enabled: canManage && !isPermissionsLoading && isPlanComparisonOpen,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // ---------------------------------------------------------------------------
  // Plan Comparison Mutation
  // ---------------------------------------------------------------------------

  const comparePlansMutation = useMutation<
    PlanComparisonResult,
    AppError,
    { targetPlanId: string }
  >({
    mutationFn: async ({ targetPlanId }) => {
      const response = await fetch(`/api/admin/subscription/compare/${targetPlanId}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw {
          type: 'technical',
          code: errorData.code ?? 'COMPARISON_FAILED',
          message: errorData.message ?? 'Failed to compare plans',
        } as AppError;
      }
      const json = await response.json();
      return json.data as PlanComparisonResult;
    },
    onSuccess: (data) => {
      setPlanComparison(data);
    },
  });

  // ---------------------------------------------------------------------------
  // Downgrade Validation Mutation
  // ---------------------------------------------------------------------------

  const validateDowngradeMutation = useMutation<
    DowngradeValidationResult,
    AppError,
    { targetPlanId: string }
  >({
    mutationFn: async ({ targetPlanId }) => {
      const response = await fetch(`/api/admin/subscription/validate-downgrade/${targetPlanId}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw {
          type: 'technical',
          code: errorData.code ?? 'VALIDATION_FAILED',
          message: errorData.message ?? 'Failed to validate downgrade',
        } as AppError;
      }
      const json = await response.json();
      return json.data as DowngradeValidationResult;
    },
    onSuccess: (data) => {
      setDowngradeValidation(data);
    },
  });

  // ---------------------------------------------------------------------------
  // Plan Change Mutation
  // ---------------------------------------------------------------------------

  const changePlanMutation = useMutation<
    { success: boolean; message: string },
    AppError,
    { targetPlanId: string; billingCycle?: BillingCycle }
  >({
    mutationFn: async ({ targetPlanId, billingCycle = 'monthly' }) => {
      const response = await fetch('/api/admin/subscription/change-plan', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPlanId, billingCycle }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw {
          type: errorData.type ?? 'technical',
          code: errorData.code ?? 'PLAN_CHANGE_FAILED',
          message: errorData.message ?? 'Failed to change plan',
          userMessage: errorData.userMessage,
        } as AppError;
      }
      const json = await response.json();
      return json;
    },
    onSuccess: () => {
      // Invalidate and refetch subscription data
      queryClient.invalidateQueries({ queryKey: [SUBSCRIPTION_QUERY_KEY] });
      // Close dialogs
      setIsUpgradeDialogOpen(false);
      setIsDowngradeDialogOpen(false);
      setIsStartSubscriptionDialogOpen(false);
      setSelectedPlanForAction(null);
      setPlanComparison(null);
      setDowngradeValidation(null);
    },
  });

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const openPlanComparison = useCallback(() => {
    setIsPlanComparisonOpen(true);
  }, []);

  const closePlanComparison = useCallback(() => {
    setIsPlanComparisonOpen(false);
    setSelectedPlanForAction(null);
    setPlanComparison(null);
    setDowngradeValidation(null);
  }, []);

  /**
   * Handle upgrade action for a plan.
   * @see Requirements 15.5
   */
  const handleUpgrade = useCallback(async (targetPlanId: string) => {
    setSelectedPlanForAction(targetPlanId);
    // Fetch plan comparison
    await comparePlansMutation.mutateAsync({ targetPlanId });
    setIsUpgradeDialogOpen(true);
  }, [comparePlansMutation]);

  /**
   * Handle downgrade action for a plan.
   * @see Requirements 15.6
   */
  const handleDowngrade = useCallback(async (targetPlanId: string) => {
    setSelectedPlanForAction(targetPlanId);
    // Fetch plan comparison and validate downgrade
    await Promise.all([
      comparePlansMutation.mutateAsync({ targetPlanId }),
      validateDowngradeMutation.mutateAsync({ targetPlanId }),
    ]);
    setIsDowngradeDialogOpen(true);
  }, [comparePlansMutation, validateDowngradeMutation]);

  /**
   * Handle start subscription action (for trial mode).
   * @see Requirements 15.9
   */
  const handleStartSubscription = useCallback(() => {
    setIsStartSubscriptionDialogOpen(true);
  }, []);

  /**
   * Confirm upgrade to the selected plan.
   * @see Requirements 15.5
   */
  const confirmUpgrade = useCallback(async () => {
    if (!selectedPlanForAction) return;
    await changePlanMutation.mutateAsync({ targetPlanId: selectedPlanForAction });
  }, [selectedPlanForAction, changePlanMutation]);

  /**
   * Confirm downgrade to the selected plan.
   * @see Requirements 15.6
   */
  const confirmDowngrade = useCallback(async () => {
    if (!selectedPlanForAction) return;
    await changePlanMutation.mutateAsync({ targetPlanId: selectedPlanForAction });
  }, [selectedPlanForAction, changePlanMutation]);

  /**
   * Confirm starting subscription with selected plan (trial mode).
   * @see Requirements 15.9
   */
  const confirmStartSubscription = useCallback(async (planId: string, billingCycle: BillingCycle) => {
    await changePlanMutation.mutateAsync({ targetPlanId: planId, billingCycle });
  }, [changePlanMutation]);

  /**
   * Close upgrade dialog.
   */
  const closeUpgradeDialog = useCallback(() => {
    setIsUpgradeDialogOpen(false);
    setSelectedPlanForAction(null);
    setPlanComparison(null);
  }, []);

  /**
   * Close downgrade dialog.
   */
  const closeDowngradeDialog = useCallback(() => {
    setIsDowngradeDialogOpen(false);
    setSelectedPlanForAction(null);
    setPlanComparison(null);
    setDowngradeValidation(null);
  }, []);

  /**
   * Close start subscription dialog.
   */
  const closeStartSubscriptionDialog = useCallback(() => {
    setIsStartSubscriptionDialogOpen(false);
  }, []);

  const handleRefetch = useCallback(() => {
    refetch();
  }, [refetch]);

  // ---------------------------------------------------------------------------
  // Selected Plan Info for Dialogs
  // ---------------------------------------------------------------------------

  const selectedPlan = useMemo(() => {
    if (!selectedPlanForAction || !availablePlans) return null;
    return availablePlans.find(p => p.id === selectedPlanForAction) ?? null;
  }, [selectedPlanForAction, availablePlans]);

  const currentPlanSummary = useMemo(() => {
    if (!currentPlan) return null;
    return {
      id: currentPlan.id,
      name: currentPlan.name,
      tier: currentPlan.tier,
      price: currentPlan.price,
      currency: currentPlan.currency,
      billingCycle: currentPlan.billingCycle as 'monthly' | 'yearly',
    };
  }, [currentPlan]);

  const targetPlanSummary = useMemo(() => {
    if (!selectedPlan) return null;
    return {
      id: selectedPlan.id,
      name: selectedPlan.name,
      tier: selectedPlan.tier,
      price: selectedPlan.pricing.monthlyPrice,
      currency: selectedPlan.pricing.currency,
      billingCycle: 'monthly' as const,
    };
  }, [selectedPlan]);

  const currentUsage = useMemo(() => {
    if (!data) return null;
    return {
      members: data.usage.members,
      orgUnits: data.usage.orgUnits,
      storage: data.usage.storage,
    };
  }, [data]);

  const newPlanLimits = useMemo(() => {
    if (!selectedPlan) return null;
    return {
      maxMembers: selectedPlan.limits.maxMembers,
      maxOrgUnits: selectedPlan.limits.maxOrgUnits,
      maxStorageBytes: selectedPlan.limits.maxStorageBytes,
    };
  }, [selectedPlan]);

  // ---------------------------------------------------------------------------
  // Return ViewModel
  // ---------------------------------------------------------------------------

  return {
    // Data
    subscription,
    currentPlan,
    status,
    isLoading,
    isError,
    error,

    // Computed
    trialDaysRemaining,
    isTrialActive,
    isPastDue,
    billingPeriod,
    features,
    usageMetrics,
    usageWarnings,

    // Modal
    isPlanComparisonOpen,

    // Permissions
    canManage,
    canUpgrade,
    canDowngrade,

    // Basic Actions
    openPlanComparison,
    closePlanComparison,
    refetch: handleRefetch,

    // Plan Change State (Requirements 15.5-15.9)
    availablePlans: availablePlans ?? [],
    isPlansLoading,
    isUpgradeDialogOpen,
    isDowngradeDialogOpen,
    isStartSubscriptionDialogOpen,
    selectedPlan,
    currentPlanSummary,
    targetPlanSummary,
    planComparison,
    downgradeValidation,
    currentUsage,
    newPlanLimits,
    isComparingPlans: comparePlansMutation.isPending,
    isValidatingDowngrade: validateDowngradeMutation.isPending,
    isChangingPlan: changePlanMutation.isPending,
    changePlanError: changePlanMutation.error ?? null,

    // Plan Change Actions
    handleUpgrade,
    handleDowngrade,
    handleStartSubscription,
    confirmUpgrade,
    confirmDowngrade,
    confirmStartSubscription,
    closeUpgradeDialog,
    closeDowngradeDialog,
    closeStartSubscriptionDialog,
  };
}

// ---------------------------------------------------------------------------
// API Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch available plans from the API.
 */
async function fetchAvailablePlans(): Promise<AdminSubscriptionPlan[]> {
  const response = await fetch('/api/admin/subscription/plans', {
    credentials: 'include',
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
    };
    throw {
      type: 'technical',
      code: errorData.code ?? 'PLANS_FETCH_ERROR',
      message: errorData.message ?? `Failed to fetch plans: ${response.status}`,
    } as AppError;
  }

  const json = await response.json();
  return (json.data ?? []) as AdminSubscriptionPlan[];
}

export default useSubscriptionViewModel;
