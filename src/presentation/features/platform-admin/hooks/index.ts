/**
 * Platform Admin Hooks — Feature-specific hooks for platform administration.
 *
 * Exports hooks for:
 * - Threshold alert notifications (metric monitoring)
 *
 * @see Requirements 21.7-21.10 (Security Event Alerts)
 */

export {
  useThresholdAlertNotifications,
  DEFAULT_THRESHOLDS,
  VIOLATION_CONFIG,
  calculateUsagePercent,
  exceedsThreshold,
} from './useThresholdAlertNotifications';

export type {
  UseThresholdAlertNotificationsProps,
  UseThresholdAlertNotificationsReturn,
  UsageThresholds,
  ThresholdViolationType,
  ThresholdViolation,
} from './useThresholdAlertNotifications';
