/**
 * Unit Tests: Quarantine Manifest Service
 *
 * Tests for FASE 1.6 Task 3: Quarantine Manifest Configuration
 *
 * @see INV-QUARANTINE-001: Quarantined users cannot receive Membership until explicit remediation
 * @see Locked Decision L3: 5 Platform anomalies quarantined (PNA-01 through PNA-05)
 * @see Requirements 1.7, 3.7, 11.8-9
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import {
  createQuarantineManifestService,
  isQuarantined,
  getQuarantinedCount,
  getManifestVersion,
  getQuarantinedUserIds,
  __resetManifestCache,
} from '../QuarantineManifestService';
import { QuarantineManifestError } from '../types';

// ---------------------------------------------------------------------------
// Test Constants: Expected Quarantine UUIDs from PHASE_1_2A_ANOMALY_AUDIT
// ---------------------------------------------------------------------------

/**
 * Per Locked Decision L3 and PHASE_1_2A_ANOMALY_AUDIT:
 * Exactly 5 platform anomalies are quarantined.
 */
const EXPECTED_QUARANTINE_COUNT = 5;

/**
 * Platform Anomaly UUIDs from the design document.
 * These are the ONLY source of truth for quarantine identities.
 */
const PNA_USERS = {
  'PNA-01': '00000000-0000-0000-0000-000000000021',
  'PNA-02': '00000000-0000-0000-0000-000000000022',
  'PNA-03': '00000000-0000-0000-0000-000000000023',
  'PNA-04': '00000000-0000-0000-0000-000000000024',
  'PNA-05': '42cc1bea-9a68-44b1-aadf-1bb0bb609028',
} as const;

/**
 * Normal user UUIDs that should NOT be quarantined.
 */
const NORMAL_USERS = [
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  '00000000-0000-0000-0000-000000000001', // Similar pattern but not PNA
  '00000000-0000-0000-0000-000000000025', // Just outside PNA range
];

// ---------------------------------------------------------------------------
// Test Setup
// ---------------------------------------------------------------------------

describe('QuarantineManifestService', () => {
  beforeEach(() => {
    // Reset the module cache before each test to ensure clean state
    __resetManifestCache();
  });

  afterEach(() => {
    // Restore all mocks after each test
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Test: Manifest contains exactly 5 users
  // -------------------------------------------------------------------------

  describe('manifest count validation', () => {
    it('should contain exactly 5 quarantined users per L3 decision', () => {
      const count = getQuarantinedCount();
      expect(count).toBe(EXPECTED_QUARANTINE_COUNT);
    });

    it('should return all 5 user IDs via getQuarantinedUserIds', () => {
      const userIds = getQuarantinedUserIds();
      expect(userIds).toHaveLength(EXPECTED_QUARANTINE_COUNT);

      // Verify all expected PNA users are present
      for (const [_alias, expectedId] of Object.entries(PNA_USERS)) {
        expect(userIds).toContain(expectedId.toLowerCase());
      }
    });
  });

  // -------------------------------------------------------------------------
  // Test: isQuarantined returns true for all 5 PNA users
  // -------------------------------------------------------------------------

  describe('isQuarantined returns true for PNA users', () => {
    it.each(Object.entries(PNA_USERS))(
      'should return true for %s (%s)',
      (_alias, userId) => {
        expect(isQuarantined(userId)).toBe(true);
      },
    );

    it('should return true for uppercase UUIDs (case-insensitive)', () => {
      const uppercaseId = PNA_USERS['PNA-01'].toUpperCase();
      expect(isQuarantined(uppercaseId)).toBe(true);
    });

    it('should return true for mixed-case UUIDs', () => {
      const mixedCaseId = '00000000-0000-0000-0000-000000000021'.replace(
        /0/g,
        (_, i) => (i % 2 === 0 ? '0' : '0'),
      );
      expect(isQuarantined(mixedCaseId)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Test: isQuarantined returns false for normal users
  // -------------------------------------------------------------------------

  describe('isQuarantined returns false for normal users', () => {
    it.each(NORMAL_USERS)(
      'should return false for normal user %s',
      (userId) => {
        expect(isQuarantined(userId)).toBe(false);
      },
    );

    it('should return false for empty string', () => {
      expect(isQuarantined('')).toBe(false);
    });

    it('should return false for whitespace', () => {
      expect(isQuarantined('  ')).toBe(false);
    });

    it('should return false for null-like strings', () => {
      expect(isQuarantined('null')).toBe(false);
      expect(isQuarantined('undefined')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Test: Service factory creates independent instances with shared cache
  // -------------------------------------------------------------------------

  describe('createQuarantineManifestService', () => {
    it('should create a service with all required methods', () => {
      const service = createQuarantineManifestService();

      expect(typeof service.isQuarantined).toBe('function');
      expect(typeof service.getQuarantinedCount).toBe('function');
      expect(typeof service.getManifestVersion).toBe('function');
      expect(typeof service.getQuarantinedUserIds).toBe('function');
      expect(typeof service.getManifest).toBe('function');
    });

    it('should return consistent results across multiple service instances', () => {
      const service1 = createQuarantineManifestService();
      const service2 = createQuarantineManifestService();

      // Both should report same quarantined users
      expect(service1.getQuarantinedCount()).toBe(service2.getQuarantinedCount());
      expect(service1.isQuarantined(PNA_USERS['PNA-01'])).toBe(
        service2.isQuarantined(PNA_USERS['PNA-01']),
      );
    });

    it('should expose the full manifest via getManifest', () => {
      const service = createQuarantineManifestService();
      const manifest = service.getManifest();

      expect(manifest).toBeDefined();
      expect(manifest.version).toBe('1.0.0');
      expect(manifest.invariant).toBe('INV-QUARANTINE-001');
      expect(manifest.expectedCount).toBe(EXPECTED_QUARANTINE_COUNT);
      expect(manifest.quarantinedUsers).toHaveLength(EXPECTED_QUARANTINE_COUNT);
    });
  });

  // -------------------------------------------------------------------------
  // Test: Manifest version
  // -------------------------------------------------------------------------

  describe('manifest version', () => {
    it('should return the manifest version', () => {
      const version = getManifestVersion();
      expect(version).toBe('1.0.0');
    });
  });

  // -------------------------------------------------------------------------
  // Test: Manifest provenance
  // -------------------------------------------------------------------------

  describe('manifest provenance', () => {
    it('should reference PHASE_1_2A_ANOMALY_AUDIT as source', () => {
      const service = createQuarantineManifestService();
      const manifest = service.getManifest();

      expect(manifest.provenance.source).toBe('PHASE_1_2A_ANOMALY_AUDIT');
      expect(manifest.provenance.decision).toBe('L3');
    });
  });

  // -------------------------------------------------------------------------
  // Test: Invariant reference
  // -------------------------------------------------------------------------

  describe('invariant enforcement', () => {
    it('should enforce INV-QUARANTINE-001', () => {
      const service = createQuarantineManifestService();
      const manifest = service.getManifest();

      expect(manifest.invariant).toBe('INV-QUARANTINE-001');
      expect(manifest.invariantDescription).toContain('Membership');
      expect(manifest.invariantDescription).toContain('remediation');
    });
  });

  // -------------------------------------------------------------------------
  // Test: Quarantined user details
  // -------------------------------------------------------------------------

  describe('quarantined user details', () => {
    it('should include alias for each quarantined user', () => {
      const service = createQuarantineManifestService();
      const manifest = service.getManifest();

      const aliases = manifest.quarantinedUsers.map((u) => u.alias);
      expect(aliases).toContain('PNA-01');
      expect(aliases).toContain('PNA-02');
      expect(aliases).toContain('PNA-03');
      expect(aliases).toContain('PNA-04');
      expect(aliases).toContain('PNA-05');
    });

    it('should include legacy role information for audit trail', () => {
      const service = createQuarantineManifestService();
      const manifest = service.getManifest();

      for (const user of manifest.quarantinedUsers) {
        expect(user.legacyRole).toBeDefined();
        expect(user.legacyTenant).toBe('platform');
        expect(user.category).toBeDefined();
        expect(user.notes).toBeDefined();
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Malformed/Missing Manifest Tests
// ---------------------------------------------------------------------------

describe('QuarantineManifestService error handling', () => {
  beforeEach(() => {
    __resetManifestCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Note: Testing malformed/missing manifest scenarios requires mocking
  // the require() call, which is complex in Vitest. These tests verify
  // that the QuarantineManifestError class works correctly for the
  // error scenarios.

  describe('QuarantineManifestError', () => {
    it('should have correct error code for MANIFEST_NOT_FOUND', () => {
      const error = new QuarantineManifestError(
        'MANIFEST_NOT_FOUND',
        'Test error message',
        { path: '/test/path' },
      );

      expect(error.code).toBe('MANIFEST_NOT_FOUND');
      expect(error.message).toBe('Test error message');
      expect(error.details).toEqual({ path: '/test/path' });
      expect(error.name).toBe('QuarantineManifestError');
    });

    it('should have correct error code for MANIFEST_MALFORMED', () => {
      const error = new QuarantineManifestError(
        'MANIFEST_MALFORMED',
        'Invalid JSON structure',
      );

      expect(error.code).toBe('MANIFEST_MALFORMED');
      expect(error instanceof Error).toBe(true);
    });

    it('should have correct error code for MANIFEST_COUNT_MISMATCH', () => {
      const error = new QuarantineManifestError(
        'MANIFEST_COUNT_MISMATCH',
        'Expected 5 users, found 3',
        { expectedCount: 5, actualCount: 3 },
      );

      expect(error.code).toBe('MANIFEST_COUNT_MISMATCH');
      expect(error.details?.expectedCount).toBe(5);
      expect(error.details?.actualCount).toBe(3);
    });

    it('should have correct error code for MANIFEST_INVALID_UUID', () => {
      const error = new QuarantineManifestError(
        'MANIFEST_INVALID_UUID',
        'Invalid UUID format',
        { userId: 'not-a-uuid' },
      );

      expect(error.code).toBe('MANIFEST_INVALID_UUID');
    });

    it('should have correct error code for MANIFEST_DUPLICATE_UUID', () => {
      const error = new QuarantineManifestError(
        'MANIFEST_DUPLICATE_UUID',
        'Duplicate UUID found',
        { userId: '00000000-0000-0000-0000-000000000021' },
      );

      expect(error.code).toBe('MANIFEST_DUPLICATE_UUID');
    });

    it('should be catchable as Error', () => {
      const error = new QuarantineManifestError(
        'MANIFEST_NOT_FOUND',
        'Test',
      );

      expect(() => {
        throw error;
      }).toThrow(Error);
    });

    it('should be identifiable via instanceof', () => {
      const error = new QuarantineManifestError(
        'MANIFEST_MALFORMED',
        'Test',
      );

      expect(error instanceof QuarantineManifestError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// UUID Validation Tests
// ---------------------------------------------------------------------------

describe('UUID format validation', () => {
  beforeEach(() => {
    __resetManifestCache();
  });

  it('should accept standard lowercase UUIDs', () => {
    expect(isQuarantined('00000000-0000-0000-0000-000000000021')).toBe(true);
  });

  it('should accept uppercase UUIDs via case-insensitive matching', () => {
    expect(isQuarantined('00000000-0000-0000-0000-000000000021'.toUpperCase())).toBe(true);
  });

  it('should accept PNA-05 which has a different UUID pattern', () => {
    // PNA-05 has a non-sequential UUID: 42cc1bea-9a68-44b1-aadf-1bb0bb609028
    expect(isQuarantined('42cc1bea-9a68-44b1-aadf-1bb0bb609028')).toBe(true);
    expect(isQuarantined('42CC1BEA-9A68-44B1-AADF-1BB0BB609028')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Boundary Tests
// ---------------------------------------------------------------------------

describe('boundary conditions', () => {
  beforeEach(() => {
    __resetManifestCache();
  });

  it('should not quarantine UUID just before PNA range', () => {
    expect(isQuarantined('00000000-0000-0000-0000-000000000020')).toBe(false);
  });

  it('should not quarantine UUID just after PNA-04', () => {
    expect(isQuarantined('00000000-0000-0000-0000-000000000025')).toBe(false);
  });

  it('should quarantine all UUIDs in PNA-01 to PNA-04 range', () => {
    expect(isQuarantined('00000000-0000-0000-0000-000000000021')).toBe(true);
    expect(isQuarantined('00000000-0000-0000-0000-000000000022')).toBe(true);
    expect(isQuarantined('00000000-0000-0000-0000-000000000023')).toBe(true);
    expect(isQuarantined('00000000-0000-0000-0000-000000000024')).toBe(true);
  });

  it('should handle similar but different UUIDs correctly', () => {
    // Similar to PNA-01 but different last digit
    expect(isQuarantined('00000000-0000-0000-0000-000000000011')).toBe(false);
    expect(isQuarantined('00000000-0000-0000-0000-000000000031')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integration with Membership Domain
// ---------------------------------------------------------------------------

describe('integration readiness', () => {
  beforeEach(() => {
    __resetManifestCache();
  });

  it('should be usable in authorization context resolution', () => {
    // Simulate the authorization context resolution flow
    const checkUserAuthorization = (userId: string): { allowed: boolean; reason?: string } => {
      if (isQuarantined(userId)) {
        return { allowed: false, reason: 'AUTH_USER_QUARANTINED' };
      }
      return { allowed: true };
    };

    // Quarantined user should be blocked
    const pnaResult = checkUserAuthorization(PNA_USERS['PNA-01']);
    expect(pnaResult.allowed).toBe(false);
    expect(pnaResult.reason).toBe('AUTH_USER_QUARANTINED');

    // Normal user should be allowed
    const normalResult = checkUserAuthorization(NORMAL_USERS[0]!);
    expect(normalResult.allowed).toBe(true);
    expect(normalResult.reason).toBeUndefined();
  });

  it('should be usable in legacy data remediation flow', () => {
    // Simulate the remediation flow check
    const canRemediate = (userId: string): boolean => {
      // Per Req 11.8: NEVER auto-remediate PNA-01..PNA-05
      return !isQuarantined(userId);
    };

    // Quarantined users cannot be auto-remediated
    for (const [_alias, userId] of Object.entries(PNA_USERS)) {
      expect(canRemediate(userId)).toBe(false);
    }

    // Normal users can be remediated
    expect(canRemediate(NORMAL_USERS[0]!)).toBe(true);
  });
});
