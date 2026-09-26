/**
 * Unit Tests: Quarantine Validator
 *
 * Tests for Task 33: Evidence-Based Remediation Workflow
 *
 * @see Requirement 11 AC 9: Verify manifest matches exactly 5 users
 * @see INV-QUARANTINE-001: Quarantined users cannot receive Membership
 * @see Locked Decision L3: 5 Platform anomalies quarantined (PNA-01 through PNA-05)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  createQuarantineValidator,
  verifyQuarantineManifest,
  verifyQuarantineManifestOrThrow,
  EXPECTED_QUARANTINE_COUNT,
  EXPECTED_QUARANTINE_ALIASES,
} from '../QuarantineValidator';
import { RemediationError } from '../types';
import type { IQuarantineManifestService } from '@infrastructure/quarantine';

// ---------------------------------------------------------------------------
// Test Constants
// ---------------------------------------------------------------------------

const PNA_USERS = {
  'PNA-01': '00000000-0000-0000-0000-000000000021',
  'PNA-02': '00000000-0000-0000-0000-000000000022',
  'PNA-03': '00000000-0000-0000-0000-000000000023',
  'PNA-04': '00000000-0000-0000-0000-000000000024',
  'PNA-05': '42cc1bea-9a68-44b1-aadf-1bb0bb609028',
} as const;

// ---------------------------------------------------------------------------
// Mock Quarantine Service
// ---------------------------------------------------------------------------

function createMockQuarantineService(
  options: {
    count?: number;
    version?: string;
    userIds?: string[];
    throwError?: Error;
  } = {},
): IQuarantineManifestService {
  const {
    count = 5,
    version = '1.0.0',
    userIds = Object.values(PNA_USERS).map((id) => id.toLowerCase()),
    throwError,
  } = options;

  return {
    isQuarantined: vi.fn((userId: string) => {
      if (throwError) throw throwError;
      return userIds.includes(userId.toLowerCase());
    }),
    getQuarantinedCount: vi.fn(() => {
      if (throwError) throw throwError;
      return count;
    }),
    getManifestVersion: vi.fn(() => {
      if (throwError) throw throwError;
      return version;
    }),
    getQuarantinedUserIds: vi.fn(() => {
      if (throwError) throw throwError;
      return userIds;
    }),
    getManifest: vi.fn(() => {
      if (throwError) throw throwError;
      return {
        version,
        provenance: {
          source: 'PHASE_1_2A_ANOMALY_AUDIT',
          auditDate: '2026-09-23T05:36:28Z',
          decision: 'L3',
          description: 'Test',
        },
        invariant: 'INV-QUARANTINE-001',
        invariantDescription: 'Test',
        expectedCount: 5,
        quarantinedUsers: [],
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('QuarantineValidator', () => {
  describe('constants', () => {
    it('should expect exactly 5 quarantined users per L3 decision', () => {
      expect(EXPECTED_QUARANTINE_COUNT).toBe(5);
    });

    it('should list all expected aliases', () => {
      expect(EXPECTED_QUARANTINE_ALIASES).toEqual([
        'PNA-01',
        'PNA-02',
        'PNA-03',
        'PNA-04',
        'PNA-05',
      ]);
    });
  });

  describe('verify()', () => {
    it('should return verified=true when count matches expected', () => {
      const mockService = createMockQuarantineService({ count: 5 });
      const validator = createQuarantineValidator({ quarantineService: mockService });

      const result = validator.verify();

      expect(result.verified).toBe(true);
      expect(result.expectedCount).toBe(5);
      expect(result.actualCount).toBe(5);
      expect(result.errorMessage).toBeNull();
    });

    it('should return verified=false when count is less than expected', () => {
      const mockService = createMockQuarantineService({ count: 3 });
      const validator = createQuarantineValidator({ quarantineService: mockService });

      const result = validator.verify();

      expect(result.verified).toBe(false);
      expect(result.expectedCount).toBe(5);
      expect(result.actualCount).toBe(3);
      expect(result.errorMessage).toContain('count mismatch');
      expect(result.errorMessage).toContain('expected 5');
      expect(result.errorMessage).toContain('found 3');
    });

    it('should return verified=false when count is greater than expected', () => {
      const mockService = createMockQuarantineService({ count: 7 });
      const validator = createQuarantineValidator({ quarantineService: mockService });

      const result = validator.verify();

      expect(result.verified).toBe(false);
      expect(result.actualCount).toBe(7);
      expect(result.errorMessage).toContain('L3');
    });

    it('should include manifest version in result', () => {
      const mockService = createMockQuarantineService({ version: '2.0.0' });
      const validator = createQuarantineValidator({ quarantineService: mockService });

      const result = validator.verify();

      expect(result.manifestVersion).toBe('2.0.0');
    });

    it('should handle manifest loading errors gracefully', () => {
      const mockService = createMockQuarantineService({
        throwError: new Error('Manifest not found'),
      });
      const validator = createQuarantineValidator({ quarantineService: mockService });

      const result = validator.verify();

      expect(result.verified).toBe(false);
      expect(result.actualCount).toBe(0);
      expect(result.manifestVersion).toBe('unknown');
      expect(result.errorMessage).toContain('Failed to verify');
    });
  });

  describe('isQuarantined()', () => {
    it('should return true for PNA users', () => {
      const mockService = createMockQuarantineService();
      const validator = createQuarantineValidator({ quarantineService: mockService });

      expect(validator.isQuarantined(PNA_USERS['PNA-01'])).toBe(true);
      expect(validator.isQuarantined(PNA_USERS['PNA-05'])).toBe(true);
    });

    it('should return false for normal users', () => {
      const mockService = createMockQuarantineService();
      const validator = createQuarantineValidator({ quarantineService: mockService });

      expect(validator.isQuarantined('11111111-1111-1111-1111-111111111111')).toBe(false);
    });
  });

  describe('getQuarantinedUserIds()', () => {
    it('should return all quarantined user IDs', () => {
      const mockService = createMockQuarantineService();
      const validator = createQuarantineValidator({ quarantineService: mockService });

      const userIds = validator.getQuarantinedUserIds();

      expect(userIds).toHaveLength(5);
    });
  });

  describe('verifyOrThrow()', () => {
    it('should not throw when verification passes', () => {
      const mockService = createMockQuarantineService({ count: 5 });
      const validator = createQuarantineValidator({ quarantineService: mockService });

      expect(() => validator.verifyOrThrow()).not.toThrow();
    });

    it('should throw RemediationError when verification fails', () => {
      const mockService = createMockQuarantineService({ count: 3 });
      const validator = createQuarantineValidator({ quarantineService: mockService });

      expect(() => validator.verifyOrThrow()).toThrow(RemediationError);
    });

    it('should throw with QUARANTINE_VERIFICATION_FAILED code', () => {
      const mockService = createMockQuarantineService({ count: 0 });
      const validator = createQuarantineValidator({ quarantineService: mockService });

      try {
        validator.verifyOrThrow();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(RemediationError);
        expect((error as RemediationError).code).toBe('QUARANTINE_VERIFICATION_FAILED');
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Convenience Function Tests
// ---------------------------------------------------------------------------

describe('verifyQuarantineManifest convenience function', () => {
  it('should return a verification result', () => {
    const result = verifyQuarantineManifest();

    expect(result).toHaveProperty('verified');
    expect(result).toHaveProperty('expectedCount');
    expect(result).toHaveProperty('actualCount');
    expect(result).toHaveProperty('manifestVersion');
  });
});

describe('verifyQuarantineManifestOrThrow convenience function', () => {
  it('should not throw when manifest is valid', () => {
    // This test uses the real manifest, which should have exactly 5 users
    expect(() => verifyQuarantineManifestOrThrow()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Integration Test: Manifest count ≠ 5 fails verification
// ---------------------------------------------------------------------------

describe('Requirement 11 AC 9: Manifest verification fails if anomaly count ≠ 5', () => {
  it('should fail verification if count is 4', () => {
    const mockService = createMockQuarantineService({ count: 4 });
    const validator = createQuarantineValidator({ quarantineService: mockService });

    const result = validator.verify();

    expect(result.verified).toBe(false);
  });

  it('should fail verification if count is 6', () => {
    const mockService = createMockQuarantineService({ count: 6 });
    const validator = createQuarantineValidator({ quarantineService: mockService });

    const result = validator.verify();

    expect(result.verified).toBe(false);
  });

  it('should fail verification if count is 0', () => {
    const mockService = createMockQuarantineService({ count: 0 });
    const validator = createQuarantineValidator({ quarantineService: mockService });

    const result = validator.verify();

    expect(result.verified).toBe(false);
  });

  it('should pass verification only if count is exactly 5', () => {
    const mockService = createMockQuarantineService({ count: 5 });
    const validator = createQuarantineValidator({ quarantineService: mockService });

    const result = validator.verify();

    expect(result.verified).toBe(true);
  });
});
