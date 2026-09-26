/**
 * Quarantine Module Barrel Export
 *
 * This module provides the quarantine manifest functionality for excluding
 * the 5 platform anomaly users (PNA-01 through PNA-05) from authorization queries.
 *
 * **Primary Exports:**
 * - `isQuarantined(userId)` — Check if a user is quarantined
 * - `getQuarantinedCount()` — Get the count of quarantined users
 * - `createQuarantineManifestService()` — Factory for DI registration
 *
 * **Invariant:** INV-QUARANTINE-001
 * Quarantined users cannot receive Membership until explicit remediation.
 *
 * @see FASE 1.6 Task 3: Quarantine Manifest Configuration
 * @see Locked Decision L3: 5 Platform anomalies quarantined
 * @see Requirements 1.7, 3.7, 11.8-9
 *
 * @example
 * ```typescript
 * import { isQuarantined } from '@infrastructure/quarantine';
 *
 * // Check if user is quarantined before authorization
 * if (isQuarantined(userId)) {
 *   throw authUserQuarantined(userId);
 * }
 * ```
 */

// Types
export type {
  QuarantineManifest,
  QuarantineProvenance,
  QuarantinedUser,
  QuarantineManifestErrorCode,
} from './types';

export { QuarantineManifestError } from './types';

// Service interface and factory
export type { IQuarantineManifestService } from './QuarantineManifestService';

export { createQuarantineManifestService } from './QuarantineManifestService';

// Convenience functions
export {
  isQuarantined,
  getQuarantinedCount,
  getManifestVersion,
  getQuarantinedUserIds,
} from './QuarantineManifestService';

// Test utilities (exported for test files only)
export { __resetManifestCache } from './QuarantineManifestService';
