'use client';

/**
 * useThresholdAlertNotifications — Hook for monitoring platform metrics
 * and showing toast/banner notifications when thresholds are violated.
 *
 * This hook provides automatic alert notifications for:
 * - Critical events → toast notification (immediate, high priority)
 * - High error rate (>5%) → banner notification (persistent)
 * - High usage (>90% of limits) → banner notification (persistent)
 * - Degraded system health → warning banner
 *
 * NOTIFICATION TYPES:
 * - Toast: Short-lived, auto-dismissing notifications for critical/urgent events
 * - Banner: Persistent alerts shown at top of dashboard for threshold violations
 *
 * EDGE-TRIGGERED BEHAVIOR:
 * - Notifications fire only on threshold crossing (not continuously)
 * - State resets when metrics drop below threshold
 *
 * SECURITY CONSIDERATIONS:
 * - Access restricted to PLATFORM_ADMIN role (enforced at screen level)
 * - Alert messages use i18n keys, no sensitive data exposed
 *
 * @see Requirements 21.7-21.10 (Security Event Alerts - Threshold notifications)
 * @see Design Section 11. Platform Admin Dashboard > Alert Notifications
 */

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  showErrorToast,
  showWarningToast,
  type ToastAction,
} from '@infrastructure/stateManagement/toastStore';
import type {
  PlatformMetrics,
  SystemHealthStatus,
  SystemAlert,
} from '@core/domains/platform/entities/PlatformMetrics';
import { HEALTH_THRESHOLDS } from '@core/domains/platform/entities/PlatformMetrics';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Threshold configuration for usage metrics.
 */
export interface UsageThresholds {
  /**
   * Percentage threshold for member count warning (0-100).
   * Default: 90
   */
  readonly memberUsageWarningPercent: number;

  /**
   * Percentage threshold for storage usage warning (0-100).
   * Default: 90
   */
  readonly storageUsageWarningPercent: number;

  /**
   * Percentage threshold for OrgUnit count warning (0-100).
   * Default: 90
   */
  readonly orgUnitUsageWarningPercent: number;

  /**
   * Error rate percentage threshold for high error rate alert.
   * Default: HEALTH_THRESHOLDS.ERROR_RATE_CRITICAL (5%)
   */
  readonly errorRateHighPercent: number;
}

/**
 * Threshold violation type.
 */
export type ThresholdViolationType =
  | 'member_usage_high'
  | 'storage_usage_high'
  | 'orgunit_usage_high'
  | 'error_rate_high'
  | 'api_response_degraded'
  | 'api_response_critical'
  | 'db_latency_degraded'
  | 'db_latency_critical'
  | 'system_health_degraded'
  | 'system_health_critical';

/**
 * Active threshold violation with details.
 */
export interface ThresholdViolation {
  /**
   * Type of violation.
   */
  readonly type: ThresholdViolationType;

  /**
   * Severity level: 'warning' or 'critical'.
   */
  readonly severity: 'warning' | 'critical';

  /**
   * i18n key for the alert message.
   */
  readonly messageKey: string;

  /**
   * i18n parameters for the message.
   */
  readonly messageParams?: Record<string, unknown>;

  /**
   * Current value that triggered the violation.
   */
  readonly currentValue: number;

  /**
   * Threshold value that was exceeded.
   */
  readonly threshold: number;

  /**
   * Timestamp when violation was detected.
   */
  readonly detectedAt: Date;
}

/**
 * Props for useThresholdAlertNotifications hook.
 */
export interface UseThresholdAlertNotificationsProps {
  /**
   * Platform metrics to monitor.
   */
  metrics: PlatformMetrics | null;

  /**
   * System alerts from the platform dashboard.
   */
  alerts?: SystemAlert[];

  /**
   * Usage data from the current tenant/platform.
   * Optional - if not provided, usage-based alerts are skipped.
   */
  usage?: {
    members?: { current: number; max: number };
    storage?: { current: number; max: number };
    orgUnits?: { current: number; max: number };
  };

  /**
   * Custom threshold configuration.
   * Optional - uses defaults if not provided.
   */
  thresholds?: Partial<UsageThresholds>;

  /**
   * Whether notifications are enabled.
   * Default: true
   */
  enabled?: boolean;

  /**
   * Callback when a violation is acknowledged via toast action.
   */
  onAcknowledge?: (violation: ThresholdViolation) => void;

  /**
   * Callback when violations change (for banner display).
   */
  onViolationsChange?: (violations: ThresholdViolation[]) => void;
}

/**
 * Return type of useThresholdAlertNotifications hook.
 */
export interface UseThresholdAlertNotificationsReturn {
  /**
   * Currently active threshold violations.
   */
  activeViolations: ThresholdViolation[];

  /**
   * Whether there are critical violations.
   */
  hasCriticalViolations: boolean;

  /**
   * Whether there are any violations (warning or critical).
   */
  hasViolations: boolean;

  /**
   * Count of critical violations.
   */
  criticalCount: number;

  /**
   * Count of warning violations.
   */
  warningCount: number;

  /**
   * Manually dismiss a violation (for banner close action).
   */
  dismissViolation: (type: ThresholdViolationType) => void;

  /**
   * Manually trigger a check for violations.
   */
  checkViolations: () => void;

  /**
   * Reset all dismissed violations (re-enable notifications).
   */
  resetDismissals: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default threshold configuration.
 */
export const DEFAULT_THRESHOLDS: UsageThresholds = {
  memberUsageWarningPercent: 90,
  storageUsageWarningPercent: 90,
  orgUnitUsageWarningPercent: 90,
  errorRateHighPercent: HEALTH_THRESHOLDS.ERROR_RATE_CRITICAL, // 5%
};

/**
 * Threshold violation configuration with i18n keys.
 */
const VIOLATION_CONFIG: Record<
  ThresholdViolationType,
  {
    severity: 'warning' | 'critical';
    messageKey: string;
    useToast: boolean;
    useBanner: boolean;
  }
> = {
  // Usage-based violations
  member_usage_high: {
    severity: 'warning',
    messageKey: 'platform.alerts.member_usage_high',
    useToast: false,
    useBanner: true,
  },
  storage_usage_high: {
    severity: 'warning',
    messageKey: 'platform.alerts.storage_usage_high',
    useToast: false,
    useBanner: true,
  },
  orgunit_usage_high: {
    severity: 'warning',
    messageKey: 'platform.alerts.orgunit_usage_high',
    useToast: false,
    useBanner: true,
  },

  // Error rate violations
  error_rate_high: {
    severity: 'critical',
    messageKey: 'platform.alerts.error_rate_high',
    useToast: true,
    useBanner: true,
  },

  // API response time violations
  api_response_degraded: {
    severity: 'warning',
    messageKey: 'platform.alerts.api_response_degraded',
    useToast: false,
    useBanner: true,
  },
  api_response_critical: {
    severity: 'critical',
    messageKey: 'platform.alerts.api_response_critical',
    useToast: true,
    useBanner: true,
  },

  // Database latency violations
  db_latency_degraded: {
    severity: 'warning',
    messageKey: 'platform.alerts.db_latency_degraded',
    useToast: false,
    useBanner: true,
  },
  db_latency_critical: {
    severity: 'critical',
    messageKey: 'platform.alerts.db_latency_critical',
    useToast: true,
    useBanner: true,
  },

  // System health violations
  system_health_degraded: {
    severity: 'warning',
    messageKey: 'platform.alerts.system_health_degraded',
    useToast: false,
    useBanner: true,
  },
  system_health_critical: {
    severity: 'critical',
    messageKey: 'platform.alerts.system_health_critical',
    useToast: true,
    useBanner: true,
  },
};

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Calculate usage percentage safely.
 */
function calculateUsagePercent(current: number, max: number): number {
  if (max <= 0) return 0;
  return (current / max) * 100;
}

/**
 * Check if a value exceeds the threshold.
 */
function exceedsThreshold(
  current: number,
  max: number,
  thresholdPercent: number,
): boolean {
  const percent = calculateUsagePercent(current, max);
  return percent >= thresholdPercent;
}

// ---------------------------------------------------------------------------
// Hook Implementation
// ---------------------------------------------------------------------------

/**
 * useThresholdAlertNotifications — Monitor platform metrics and show alerts.
 *
 * This hook implements edge-triggered notifications:
 * - Toast notifications fire once when a critical threshold is first crossed
 * - Banner state is maintained for ongoing violations
 * - Notifications reset when metrics drop below threshold
 *
 * @param props - Configuration props
 * @returns Alert notification state and actions
 *
 * @example
 * ```tsx
 * const { activeViolations, hasCriticalViolations, dismissViolation } =
 *   useThresholdAlertNotifications({
 *     metrics: platformMetrics,
 *     usage: subscriptionUsage,
 *     onViolationsChange: (violations) => setShowBanner(violations.length > 0),
 *   });
 *
 * // Render banner if violations exist
 * {activeViolations.length > 0 && (
 *   <ThresholdAlertBanner
 *     violations={activeViolations}
 *     onDismiss={dismissViolation}
 *   />
 * )}
 * ```
 */
export function useThresholdAlertNotifications({
  metrics,
  alerts,
  usage,
  thresholds: customThresholds,
  enabled = true,
  onAcknowledge,
  onViolationsChange,
}: UseThresholdAlertNotificationsProps): UseThresholdAlertNotificationsReturn {
  const { t } = useTranslation();

  // Merge default thresholds with custom
  const thresholds: UsageThresholds = useMemo(
    () => ({
      ...DEFAULT_THRESHOLDS,
      ...customThresholds,
    }),
    [customThresholds],
  );

  // Track which violations we've already shown toasts for (edge-triggered)
  const toastShownRef = useRef<Set<ThresholdViolationType>>(new Set());

  // Track dismissed violations (user can manually dismiss banners)
  const dismissedRef = useRef<Set<ThresholdViolationType>>(new Set());

  // Track previous violation state for edge detection
  const prevViolationsRef = useRef<Set<ThresholdViolationType>>(new Set());

  // Current active violations state
  const activeViolationsRef = useRef<ThresholdViolation[]>([]);

  // ---------------------------------------------------------------------------
  // Violation Detection
  // ---------------------------------------------------------------------------

  /**
   * Detect all current threshold violations based on metrics and usage.
   */
  const detectViolations = useCallback((): ThresholdViolation[] => {
    if (!metrics || !enabled) return [];

    const violations: ThresholdViolation[] = [];
    const now = new Date();

    // Check system health status
    const healthStatus: SystemHealthStatus = metrics.systemHealth.status;

    if (healthStatus === 'critical') {
      violations.push({
        type: 'system_health_critical',
        severity: 'critical',
        messageKey: VIOLATION_CONFIG.system_health_critical.messageKey,
        currentValue: 0, // N/A for categorical status
        threshold: 0,
        detectedAt: now,
      });
    } else if (healthStatus === 'degraded') {
      violations.push({
        type: 'system_health_degraded',
        severity: 'warning',
        messageKey: VIOLATION_CONFIG.system_health_degraded.messageKey,
        currentValue: 0,
        threshold: 0,
        detectedAt: now,
      });
    }

    // Check error rate
    const errorRate = metrics.systemHealth.errorRatePercent;
    if (errorRate >= thresholds.errorRateHighPercent) {
      violations.push({
        type: 'error_rate_high',
        severity: 'critical',
        messageKey: VIOLATION_CONFIG.error_rate_high.messageKey,
        messageParams: { rate: errorRate.toFixed(2) },
        currentValue: errorRate,
        threshold: thresholds.errorRateHighPercent,
        detectedAt: now,
      });
    }

    // Check API response time
    const apiResponseTime = metrics.systemHealth.apiResponseTimeMs;
    if (apiResponseTime >= HEALTH_THRESHOLDS.API_RESPONSE_CRITICAL) {
      violations.push({
        type: 'api_response_critical',
        severity: 'critical',
        messageKey: VIOLATION_CONFIG.api_response_critical.messageKey,
        messageParams: { time: apiResponseTime },
        currentValue: apiResponseTime,
        threshold: HEALTH_THRESHOLDS.API_RESPONSE_CRITICAL,
        detectedAt: now,
      });
    } else if (apiResponseTime >= HEALTH_THRESHOLDS.API_RESPONSE_DEGRADED) {
      violations.push({
        type: 'api_response_degraded',
        severity: 'warning',
        messageKey: VIOLATION_CONFIG.api_response_degraded.messageKey,
        messageParams: { time: apiResponseTime },
        currentValue: apiResponseTime,
        threshold: HEALTH_THRESHOLDS.API_RESPONSE_DEGRADED,
        detectedAt: now,
      });
    }

    // Check database latency
    const dbLatency = metrics.systemHealth.databaseLatencyMs;
    if (dbLatency >= HEALTH_THRESHOLDS.DB_LATENCY_CRITICAL) {
      violations.push({
        type: 'db_latency_critical',
        severity: 'critical',
        messageKey: VIOLATION_CONFIG.db_latency_critical.messageKey,
        messageParams: { latency: dbLatency },
        currentValue: dbLatency,
        threshold: HEALTH_THRESHOLDS.DB_LATENCY_CRITICAL,
        detectedAt: now,
      });
    } else if (dbLatency >= HEALTH_THRESHOLDS.DB_LATENCY_DEGRADED) {
      violations.push({
        type: 'db_latency_degraded',
        severity: 'warning',
        messageKey: VIOLATION_CONFIG.db_latency_degraded.messageKey,
        messageParams: { latency: dbLatency },
        currentValue: dbLatency,
        threshold: HEALTH_THRESHOLDS.DB_LATENCY_DEGRADED,
        detectedAt: now,
      });
    }

    // Check usage-based violations (if usage data provided)
    if (usage) {
      // Member usage
      if (
        usage.members &&
        exceedsThreshold(
          usage.members.current,
          usage.members.max,
          thresholds.memberUsageWarningPercent,
        )
      ) {
        const percent = calculateUsagePercent(
          usage.members.current,
          usage.members.max,
        );
        violations.push({
          type: 'member_usage_high',
          severity: 'warning',
          messageKey: VIOLATION_CONFIG.member_usage_high.messageKey,
          messageParams: {
            current: usage.members.current,
            max: usage.members.max,
            percent: percent.toFixed(1),
          },
          currentValue: percent,
          threshold: thresholds.memberUsageWarningPercent,
          detectedAt: now,
        });
      }

      // Storage usage
      if (
        usage.storage &&
        exceedsThreshold(
          usage.storage.current,
          usage.storage.max,
          thresholds.storageUsageWarningPercent,
        )
      ) {
        const percent = calculateUsagePercent(
          usage.storage.current,
          usage.storage.max,
        );
        violations.push({
          type: 'storage_usage_high',
          severity: 'warning',
          messageKey: VIOLATION_CONFIG.storage_usage_high.messageKey,
          messageParams: {
            current: usage.storage.current,
            max: usage.storage.max,
            percent: percent.toFixed(1),
          },
          currentValue: percent,
          threshold: thresholds.storageUsageWarningPercent,
          detectedAt: now,
        });
      }

      // OrgUnit usage
      if (
        usage.orgUnits &&
        exceedsThreshold(
          usage.orgUnits.current,
          usage.orgUnits.max,
          thresholds.orgUnitUsageWarningPercent,
        )
      ) {
        const percent = calculateUsagePercent(
          usage.orgUnits.current,
          usage.orgUnits.max,
        );
        violations.push({
          type: 'orgunit_usage_high',
          severity: 'warning',
          messageKey: VIOLATION_CONFIG.orgunit_usage_high.messageKey,
          messageParams: {
            current: usage.orgUnits.current,
            max: usage.orgUnits.max,
            percent: percent.toFixed(1),
          },
          currentValue: percent,
          threshold: thresholds.orgUnitUsageWarningPercent,
          detectedAt: now,
        });
      }
    }

    return violations;
  }, [metrics, usage, thresholds, enabled]);

  // ---------------------------------------------------------------------------
  // Toast Notification Logic
  // ---------------------------------------------------------------------------

  /**
   * Show toast notification for a critical violation.
   */
  const showViolationToast = useCallback(
    (violation: ThresholdViolation): void => {
      const config = VIOLATION_CONFIG[violation.type];

      if (!config.useToast) return;

      // Build toast action for acknowledgment
      const action: ToastAction | undefined = onAcknowledge
        ? {
            label: t('common.acknowledge', 'Acknowledge'),
            onClick: () => onAcknowledge(violation),
          }
        : undefined;

      // Translate the message
      const message = t(
        violation.messageKey,
        violation.messageParams as Record<string, string>,
      );

      // Show appropriate toast type
      if (violation.severity === 'critical') {
        showErrorToast(message, action);
      } else {
        showWarningToast(message, action);
      }
    },
    [t, onAcknowledge],
  );

  // ---------------------------------------------------------------------------
  // Check Violations Effect
  // ---------------------------------------------------------------------------

  const checkViolations = useCallback((): void => {
    const detected = detectViolations();
    const currentViolationTypes = new Set(detected.map(v => v.type));

    // Find newly crossed thresholds (edge-triggered)
    const newViolations = detected.filter(
      v =>
        !prevViolationsRef.current.has(v.type) &&
        !toastShownRef.current.has(v.type),
    );

    // Show toasts for new critical violations
    newViolations.forEach(violation => {
      const config = VIOLATION_CONFIG[violation.type];
      if (config.useToast) {
        showViolationToast(violation);
        toastShownRef.current.add(violation.type);
      }
    });

    // Reset toast state for violations that have cleared
    // (allow re-notification if they cross again)
    prevViolationsRef.current.forEach(type => {
      if (!currentViolationTypes.has(type)) {
        toastShownRef.current.delete(type);
        dismissedRef.current.delete(type);
      }
    });

    // Update previous violations for next comparison
    prevViolationsRef.current = currentViolationTypes;

    // Filter out dismissed violations for active list
    const activeViolations = detected.filter(
      v => !dismissedRef.current.has(v.type),
    );

    // Update refs and notify
    activeViolationsRef.current = activeViolations;
    onViolationsChange?.(activeViolations);
  }, [detectViolations, showViolationToast, onViolationsChange]);

  // Run violation check when metrics/usage change
  useEffect(() => {
    if (enabled) {
      checkViolations();
    }
  }, [metrics, usage, enabled, checkViolations]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /**
   * Dismiss a specific violation (user closes banner).
   */
  const dismissViolation = useCallback(
    (type: ThresholdViolationType): void => {
      dismissedRef.current.add(type);
      // Re-run check to update active violations
      const detected = detectViolations();
      const activeViolations = detected.filter(
        v => !dismissedRef.current.has(v.type),
      );
      activeViolationsRef.current = activeViolations;
      onViolationsChange?.(activeViolations);
    },
    [detectViolations, onViolationsChange],
  );

  /**
   * Reset all dismissals (re-enable all notifications).
   */
  const resetDismissals = useCallback((): void => {
    dismissedRef.current.clear();
    toastShownRef.current.clear();
    checkViolations();
  }, [checkViolations]);

  // ---------------------------------------------------------------------------
  // Derived State
  // ---------------------------------------------------------------------------

  const activeViolations = activeViolationsRef.current;
  const hasCriticalViolations = activeViolations.some(
    v => v.severity === 'critical',
  );
  const hasViolations = activeViolations.length > 0;
  const criticalCount = activeViolations.filter(
    v => v.severity === 'critical',
  ).length;
  const warningCount = activeViolations.filter(
    v => v.severity === 'warning',
  ).length;

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    activeViolations,
    hasCriticalViolations,
    hasViolations,
    criticalCount,
    warningCount,
    dismissViolation,
    checkViolations,
    resetDismissals,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

// NOTE: DEFAULT_THRESHOLDS is already exported inline at its declaration above,
// so it must NOT be re-exported here (would be a duplicate export error).
export {
  VIOLATION_CONFIG,
  calculateUsagePercent,
  exceedsThreshold,
};

export default useThresholdAlertNotifications;
