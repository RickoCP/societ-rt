/**
 * Quarantine Manifest Service
 *
 * Provides deterministic loading and validation of the quarantine manifest.
 * Exposes the `isQuarantined(userId)` function for use by business/domain logic.
 *
 * **Single Source of Truth:** UUIDs are defined ONLY in quarantine-manifest.json.
 * Business logic consumes the quarantine abstraction via this service, never
 * duplicating UUIDs throughout the codebase.
 *
 * **Fail-Safe Design:**
 * - Missing manifest → throws with clear error code
 * - Malformed manifest → throws with clear error code
 * - Count mismatch → throws with clear error code (enforces exactly 5 users)
 * - Invalid UUID format → throws with clear error code
 * - Duplicate UUIDs → throws with clear error code
 *
 * @see FASE 1.6 Task 3: Quarantine Manifest Configuration
 * @see INV-QUARANTINE-001: Quarantined users cannot receive Membership until explicit remediation
 * @see Locked Decision L3: 5 Platform anomalies quarantined (PNA-01 through PNA-05)
 * @see Requirements 1.7, 3.7, 11.8-9
 */

import type { QuarantineManifest, QuarantinedUser } from './types';
import { QuarantineManifestError } from './types';

// ---------------------------------------------------------------------------
// UUID validation regex (standard UUID v4 format)
// ---------------------------------------------------------------------------

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Manifest loading
// ---------------------------------------------------------------------------

/**
 * Loads the raw manifest JSON from the filesystem.
 * Throws QuarantineManifestError if file not found or unparseable.
 */
function loadManifestJson(): unknown {
  try {
    // Dynamic import would be async; use require for synchronous loading
    // This is acceptable for a configuration file loaded at startup
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('./quarantine-manifest.json');
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    throw new QuarantineManifestError(
      'MANIFEST_NOT_FOUND',
      `Quarantine manifest could not be loaded: ${errorMessage}. ` +
        'Ensure src/infrastructure/quarantine/quarantine-manifest.json exists.',
      { originalError: errorMessage },
    );
  }
}

/**
 * Validates the structure of the loaded manifest.
 * Throws QuarantineManifestError if validation fails.
 */
function validateManifestStructure(data: unknown): asserts data is QuarantineManifest {
  if (!data || typeof data !== 'object') {
    throw new QuarantineManifestError(
      'MANIFEST_MALFORMED',
      'Quarantine manifest must be a non-null object.',
    );
  }

  const manifest = data as Record<string, unknown>;

  // Required fields
  const requiredFields = [
    'version',
    'provenance',
    'invariant',
    'expectedCount',
    'quarantinedUsers',
  ] as const;

  for (const field of requiredFields) {
    if (!(field in manifest)) {
      throw new QuarantineManifestError(
        'MANIFEST_MALFORMED',
        `Quarantine manifest missing required field: ${field}`,
        { missingField: field },
      );
    }
  }

  // Validate version
  if (typeof manifest.version !== 'string' || !manifest.version.trim()) {
    throw new QuarantineManifestError(
      'MANIFEST_MALFORMED',
      'Quarantine manifest version must be a non-empty string.',
    );
  }

  // Validate expectedCount
  if (typeof manifest.expectedCount !== 'number' || manifest.expectedCount < 0) {
    throw new QuarantineManifestError(
      'MANIFEST_MALFORMED',
      'Quarantine manifest expectedCount must be a non-negative number.',
    );
  }

  // Validate quarantinedUsers is an array
  if (!Array.isArray(manifest.quarantinedUsers)) {
    throw new QuarantineManifestError(
      'MANIFEST_MALFORMED',
      'Quarantine manifest quarantinedUsers must be an array.',
    );
  }

  // Validate provenance structure
  if (!manifest.provenance || typeof manifest.provenance !== 'object') {
    throw new QuarantineManifestError(
      'MANIFEST_MALFORMED',
      'Quarantine manifest provenance must be an object.',
    );
  }
}

/**
 * Validates each quarantined user entry.
 * Throws QuarantineManifestError if any entry is invalid.
 */
function validateQuarantinedUsers(users: readonly QuarantinedUser[]): void {
  const seenUuids = new Set<string>();

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const context = { index: i, alias: user?.alias };

    // Validate required fields exist
    if (!user || typeof user !== 'object') {
      throw new QuarantineManifestError(
        'MANIFEST_MALFORMED',
        `Quarantine entry at index ${i} is not a valid object.`,
        context,
      );
    }

    if (!user.alias || typeof user.alias !== 'string') {
      throw new QuarantineManifestError(
        'MANIFEST_MALFORMED',
        `Quarantine entry at index ${i} missing required field: alias`,
        context,
      );
    }

    if (!user.userId || typeof user.userId !== 'string') {
      throw new QuarantineManifestError(
        'MANIFEST_MALFORMED',
        `Quarantine entry ${user.alias} missing required field: userId`,
        context,
      );
    }

    // Validate UUID format
    if (!UUID_REGEX.test(user.userId)) {
      throw new QuarantineManifestError(
        'MANIFEST_INVALID_UUID',
        `Quarantine entry ${user.alias} has invalid UUID format: ${user.userId}`,
        { ...context, userId: user.userId },
      );
    }

    // Check for duplicates
    const normalizedUuid = user.userId.toLowerCase();
    if (seenUuids.has(normalizedUuid)) {
      throw new QuarantineManifestError(
        'MANIFEST_DUPLICATE_UUID',
        `Quarantine entry ${user.alias} has duplicate UUID: ${user.userId}`,
        { ...context, userId: user.userId },
      );
    }
    seenUuids.add(normalizedUuid);
  }
}

/**
 * Validates the quarantine count matches expected.
 * Per Locked Decision L3: exactly 5 platform anomalies must be quarantined.
 */
function validateQuarantineCount(manifest: QuarantineManifest): void {
  const actualCount = manifest.quarantinedUsers.length;
  const expectedCount = manifest.expectedCount;

  if (actualCount !== expectedCount) {
    throw new QuarantineManifestError(
      'MANIFEST_COUNT_MISMATCH',
      `Quarantine manifest count mismatch: expected ${expectedCount}, found ${actualCount}. ` +
        'Per Locked Decision L3, exactly 5 platform anomalies must be quarantined.',
      { expectedCount, actualCount },
    );
  }
}

// ---------------------------------------------------------------------------
// Service Implementation
// ---------------------------------------------------------------------------

/**
 * Quarantine Manifest Service
 *
 * Provides the `isQuarantined` function for use by business/domain logic.
 * The manifest is loaded and validated lazily on first access, then cached.
 */
export interface IQuarantineManifestService {
  /**
   * Check if a user ID is in the quarantine manifest.
   *
   * @param userId - The user UUID to check
   * @returns true if the user is quarantined, false otherwise
   */
  isQuarantined(userId: string): boolean;

  /**
   * Get the number of quarantined users.
   *
   * @returns The count of quarantined users in the manifest
   */
  getQuarantinedCount(): number;

  /**
   * Get the manifest version.
   *
   * @returns The version string of the loaded manifest
   */
  getManifestVersion(): string;

  /**
   * Get all quarantined user IDs.
   *
   * @returns Array of quarantined user UUIDs (lowercase normalized)
   */
  getQuarantinedUserIds(): readonly string[];

  /**
   * Get the full manifest (for debugging/auditing purposes).
   *
   * @returns The complete quarantine manifest
   */
  getManifest(): QuarantineManifest;
}

// ---------------------------------------------------------------------------
// Singleton Implementation
// ---------------------------------------------------------------------------

/**
 * Internal state: cached manifest and derived lookup set.
 * Initialized on first access via ensureManifestLoaded().
 */
let cachedManifest: QuarantineManifest | null = null;
let quarantinedUserIdSet: Set<string> | null = null;

/**
 * Ensures the manifest is loaded and validated.
 * Called automatically on first service method invocation.
 *
 * @throws QuarantineManifestError if validation fails
 */
function ensureManifestLoaded(): void {
  if (cachedManifest !== null && quarantinedUserIdSet !== null) {
    return; // Already loaded and validated
  }

  // Step 1: Load raw JSON
  const rawData = loadManifestJson();

  // Step 2: Validate structure
  validateManifestStructure(rawData);

  // Step 3: Validate user entries
  validateQuarantinedUsers(rawData.quarantinedUsers);

  // Step 4: Validate count matches expected
  validateQuarantineCount(rawData);

  // Step 5: Build lookup set (normalized to lowercase for case-insensitive matching)
  const idSet = new Set<string>();
  for (const user of rawData.quarantinedUsers) {
    idSet.add(user.userId.toLowerCase());
  }

  // Step 6: Cache results
  cachedManifest = rawData;
  quarantinedUserIdSet = idSet;
}

/**
 * Creates a QuarantineManifestService instance.
 *
 * Factory function pattern for DI container registration.
 * The manifest is loaded lazily on first method call.
 *
 * @example
 * ```typescript
 * import { createQuarantineManifestService } from '@infrastructure/quarantine';
 *
 * // Create service (lazy loading)
 * const quarantineService = createQuarantineManifestService();
 *
 * // Check if user is quarantined
 * if (quarantineService.isQuarantined(userId)) {
 *   throw new AuthorizationError('AUTH_USER_QUARANTINED');
 * }
 * ```
 */
export function createQuarantineManifestService(): IQuarantineManifestService {
  return {
    isQuarantined(userId: string): boolean {
      ensureManifestLoaded();
      // Normalize input for case-insensitive comparison
      return quarantinedUserIdSet!.has(userId.toLowerCase());
    },

    getQuarantinedCount(): number {
      ensureManifestLoaded();
      return cachedManifest!.quarantinedUsers.length;
    },

    getManifestVersion(): string {
      ensureManifestLoaded();
      return cachedManifest!.version;
    },

    getQuarantinedUserIds(): readonly string[] {
      ensureManifestLoaded();
      return cachedManifest!.quarantinedUsers.map((u) => u.userId.toLowerCase());
    },

    getManifest(): QuarantineManifest {
      ensureManifestLoaded();
      return cachedManifest!;
    },
  };
}

// ---------------------------------------------------------------------------
// Convenience Functions (for simpler imports)
// ---------------------------------------------------------------------------

/**
 * Default service instance for convenience imports.
 *
 * @example
 * ```typescript
 * import { isQuarantined } from '@infrastructure/quarantine';
 *
 * if (isQuarantined(userId)) {
 *   // Handle quarantined user
 * }
 * ```
 */
const defaultService = createQuarantineManifestService();

/**
 * Check if a user ID is in the quarantine manifest.
 *
 * Convenience function that uses the default service instance.
 * For DI scenarios, use createQuarantineManifestService() instead.
 *
 * @param userId - The user UUID to check
 * @returns true if the user is quarantined, false otherwise
 * @throws QuarantineManifestError if manifest is missing or invalid
 */
export function isQuarantined(userId: string): boolean {
  return defaultService.isQuarantined(userId);
}

/**
 * Get the number of quarantined users.
 *
 * Convenience function that uses the default service instance.
 *
 * @returns The count of quarantined users in the manifest
 * @throws QuarantineManifestError if manifest is missing or invalid
 */
export function getQuarantinedCount(): number {
  return defaultService.getQuarantinedCount();
}

/**
 * Get the manifest version.
 *
 * Convenience function that uses the default service instance.
 *
 * @returns The version string of the loaded manifest
 * @throws QuarantineManifestError if manifest is missing or invalid
 */
export function getManifestVersion(): string {
  return defaultService.getManifestVersion();
}

/**
 * Get all quarantined user IDs.
 *
 * Convenience function that uses the default service instance.
 *
 * @returns Array of quarantined user UUIDs (lowercase normalized)
 * @throws QuarantineManifestError if manifest is missing or invalid
 */
export function getQuarantinedUserIds(): readonly string[] {
  return defaultService.getQuarantinedUserIds();
}

// ---------------------------------------------------------------------------
// Test Utilities (for resetting cached state in tests)
// ---------------------------------------------------------------------------

/**
 * Resets the cached manifest state.
 *
 * **FOR TESTING ONLY** — Do not use in production code.
 * This allows tests to reload the manifest after modifying it.
 */
export function __resetManifestCache(): void {
  cachedManifest = null;
  quarantinedUserIdSet = null;
}
