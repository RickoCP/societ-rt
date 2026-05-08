/**
 * Automation-specific error factory functions.
 *
 * Each function returns a typed AppError with a stable, searchable code.
 * Uses the factory helpers from AppError.ts to ensure consistency.
 *
 * @see Requirements 39.6, 39.11, 39.12
 */

import type { AppError } from '@core/utils';
import { businessError } from '@core/utils';

// ---------------------------------------------------------------------------
// Error factories
// ---------------------------------------------------------------------------

/**
 * Rule definition is invalid — trigger event, conditions, or actions
 * reference invalid types or parameters.
 *
 * @see Requirement 39.12
 */
export function automationRuleInvalid(reason: string): AppError {
  return businessError(
    'AUTOMATION_RULE_INVALID',
    `Automation rule definition is invalid: ${reason}`,
    {
      userMessage: 'Definisi aturan otomasi tidak valid.',
      retryable: false,
    },
  );
}

/**
 * Maximum active rules per tenant exceeded (50 active rules limit).
 *
 * @see Requirement 39.11
 */
export function automationRuleLimitExceeded(
  currentCount: number,
  maxCount: number,
): AppError {
  return businessError(
    'AUTOMATION_RULE_LIMIT_EXCEEDED',
    `Active automation rule limit exceeded: ${currentCount} active rules, max is ${maxCount}`,
    {
      userMessage: `Batas aturan otomasi aktif tercapai (maksimal ${maxCount} aturan).`,
      retryable: false,
    },
  );
}

/**
 * Rule chain depth exceeded the maximum allowed depth (5 levels).
 * Prevents infinite loops from circular rule dependencies.
 *
 * @see Requirement 39.6
 */
export function automationChainDepthExceeded(
  currentDepth: number,
  maxDepth: number,
): AppError {
  return businessError(
    'AUTOMATION_CHAIN_DEPTH_EXCEEDED',
    `Automation rule chain depth exceeded: depth ${currentDepth}, max is ${maxDepth}`,
    {
      userMessage: 'Kedalaman rantai aturan otomasi melebihi batas maksimum.',
      retryable: false,
    },
  );
}

/** Automation rule not found for the given tenant and ID. */
export function automationRuleNotFound(ruleId: string): AppError {
  return businessError(
    'AUTOMATION_RULE_NOT_FOUND',
    `Automation rule ${ruleId} not found`,
    {
      userMessage: 'Aturan otomasi tidak ditemukan.',
      retryable: false,
    },
  );
}
