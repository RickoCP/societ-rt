/**
 * Quarantine Validator
 *
 * Validates that the quarantine manifest matches exactly 5 users
 * before remediation proceeds. This is a critical safety check
 * per Requirement 11 AC 9.
 *
 * @see Task 33: Evidence-Based Remediation Workflow
 * @see Requirement 11 AC 9: Verify manifest matches exactly 5 users
 * @see Locked Decision L3: 5 Platform anomalies quarantined (PNA-01 through PNA-05)
 * @see INV-QUARANTINE-001: Quarantined users cannot receive Membership until explicit remediation
 */

import {
  createQuarantineManifestService,
  type IQuarantineManifestService,
  QuarantineManifestError,
} from '@infrastructure/quarantine';

import type { QuarantineVerificationResult } from './types';
import { RemediationError } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Expected number of quarantined users per Locked Decision L3.
 */
export const EXPECTED_QUARANTINE_COUNT = 5;

/**
 * Expected quarantined user aliases per L3.
 */
export const EXPECTED_QUARANTINE_ALIASES = [
  'PNA-01',
  'PNA-02',
  'PNA-03',
  'PNA-04',
  'PNA-05',
] as const;

// ---------------------------------------------------------------------------
// Quarantine Validator Interface
// ---------------------------------------------------------------------------

/**
 * Quarantine Validator interface.
 */
export interface IQuarantineValidator {
  /**
   * Verify the quarantine manifest matches expected configuration.
   *
   * @returns Verification result with pass/fail and details
   * @throws RemediationError if manifest cannot be loaded
   */
  verify(): QuarantineVerificationResult;

  /**
   * Check if a user ID is quarantined.
   *
   * @param userId - The user UUID to check
   * @returns true if the user is quarantined
   */
  isQuarantined(userId: string): boolean;

  /**
   * Get all quarantined user IDs.
   *
   * @returns Array of quarantined user UUIDs
   */
  getQuarantinedUserIds(): readonly string[];

  /**
   * Verify and throw if verification fails.
   *
   * @throws RemediationError if verification fails
   */
  verifyOrThrow(): void;
}

// ---------------------------------------------------------------------------
// Quarantine Validator Implementation
// ---------------------------------------------------------------------------

/**
 * Creates a QuarantineValidator instance.
 *
 * Factory function pattern for DI container registration.
 *
 * @param deps - Dependencies (quarantine manifest service)
 * @returns QuarantineValidator instance
 *
 * @example
 * ```typescript
 * const validator = createQuarantineValidator();
 *
 * // Verify before remediation
 * validator.verifyOrThrow();
 *
 * // Check individual user
 * if (validator.isQuarantined(userId)) {
 *   // Skip this user
 * }
 * ```
 */
export function createQuarantineValidator(deps?: {
  quarantineService?: IQuarantineManifestService;
}): IQuarantineValidator {
  // Use provided service or create default
  const quarantineService =
    deps?.quarantineService ?? createQuarantineManifestService();

  return {
    verify(): QuarantineVerificationResult {
      try {
        // Get manifest metadata
        const actualCount = quarantineService.getQuarantinedCount();
        const manifestVersion = quarantineService.getManifestVersion();

        // Check count matches expected
        const verified = actualCount === EXPECTED_QUARANTINE_COUNT;

        // Build error message if verification failed
        let errorMessage: string | null = null;
        if (!verified) {
          errorMessage =
            `Quarantine manifest count mismatch: expected ${EXPECTED_QUARANTINE_COUNT}, ` +
            `found ${actualCount}. Per Locked Decision L3, exactly 5 platform anomalies ` +
            `(PNA-01 through PNA-05) must be quarantined.`;
        }

        return {
          verified,
          expectedCount: EXPECTED_QUARANTINE_COUNT,
          actualCount,
          manifestVersion,
          errorMessage,
        };
      } catch (error) {
        // Handle manifest loading errors
        if (error instanceof QuarantineManifestError) {
          return {
            verified: false,
            expectedCount: EXPECTED_QUARANTINE_COUNT,
            actualCount: 0,
            manifestVersion: 'unknown',
            errorMessage: `Quarantine manifest error: ${error.code} - ${error.message}`,
          };
        }

        // Unknown error
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        return {
          verified: false,
          expectedCount: EXPECTED_QUARANTINE_COUNT,
          actualCount: 0,
          manifestVersion: 'unknown',
          errorMessage: `Failed to verify quarantine manifest: ${errorMessage}`,
        };
      }
    },

    isQuarantined(userId: string): boolean {
      return quarantineService.isQuarantined(userId);
    },

    getQuarantinedUserIds(): readonly string[] {
      return quarantineService.getQuarantinedUserIds();
    },

    verifyOrThrow(): void {
      const result = this.verify();

      if (!result.verified) {
        throw new RemediationError(
          'QUARANTINE_VERIFICATION_FAILED',
          result.errorMessage ??
            'Quarantine manifest verification failed for unknown reason.',
          {
            expectedCount: result.expectedCount,
            actualCount: result.actualCount,
            manifestVersion: result.manifestVersion,
          },
        );
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Default Instance
// ---------------------------------------------------------------------------

/**
 * Default validator instance for convenience imports.
 */
const defaultValidator = createQuarantineValidator();

/**
 * Verify the quarantine manifest matches expected configuration.
 *
 * Convenience function using default validator.
 *
 * @returns Verification result
 */
export function verifyQuarantineManifest(): QuarantineVerificationResult {
  return defaultValidator.verify();
}

/**
 * Verify and throw if verification fails.
 *
 * Convenience function using default validator.
 *
 * @throws RemediationError if verification fails
 */
export function verifyQuarantineManifestOrThrow(): void {
  defaultValidator.verifyOrThrow();
}
