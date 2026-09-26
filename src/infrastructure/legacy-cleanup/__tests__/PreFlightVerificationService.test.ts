/**
 * Pre-Flight Verification Service Tests
 *
 * Tests for TPR-07 ordered verification criteria before destructive operations.
 *
 * @see Task 37: Legacy Schema Cleanup
 * @see Requirement 13 (AC 1, 7)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createPreFlightVerificationService,
  type PreFlightVerificationServiceDeps,
} from '../PreFlightVerificationService';

describe('PreFlightVerificationService', () => {
  const mockDate = new Date('2024-01-15T12:00:00Z');
  const fase114CompletedAt = new Date('2024-01-14T10:00:00Z'); // 26 hours ago

  function createMockDeps(
    overrides: Partial<PreFlightVerificationServiceDeps> = {},
  ): PreFlightVerificationServiceDeps {
    return {
      codePathAnalyzer: {
        getUsagesByClassification: vi.fn().mockReturnValue([]),
      },
      migrationStatusTracker: {
        isMigrationComplete: vi.fn().mockReturnValue(true),
        getBlockingIssues: vi.fn().mockReturnValue([]),
      },
      backupService: {
        listCheckpoints: vi.fn().mockResolvedValue([{ isValid: true }]),
      },
      approvalGate: {
        getStatus: vi.fn().mockReturnValue({
          approved: true,
          isValid: true,
          approval: {
            approvalId: 'test-approval',
            approverId: 'admin',
            expiresAt: new Date('2024-01-15T13:00:00Z'),
          },
          timeUntilExpirationSeconds: 3600,
        }),
      },
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      dateProvider: () => mockDate,
      getFase114CompletionTimestamp: vi.fn().mockResolvedValue(fase114CompletedAt),
      ...overrides,
    };
  }

  describe('verify', () => {
    it('should pass all criteria when all conditions are met', async () => {
      const deps = createMockDeps();
      const service = createPreFlightVerificationService(deps);

      const result = await service.verify();

      expect(result.verified).toBe(true);
      expect(result.blockingIssues).toHaveLength(0);
      expect(result.criteria.legacyDependencyStopped.passed).toBe(true);
      expect(result.criteria.zeroAuthorizationDependency.passed).toBe(true);
      expect(result.criteria.zeroLegacyWrites.passed).toBe(true);
      expect(result.criteria.stabilizationWindowPassed.passed).toBe(true);
      expect(result.criteria.backupCheckpointCreated.passed).toBe(true);
      expect(result.criteria.destructiveApprovalGate.passed).toBe(true);
    });

    it('should fail when FASE 1.14 is not complete', async () => {
      const deps = createMockDeps({
        migrationStatusTracker: {
          isMigrationComplete: vi.fn().mockReturnValue(false),
          getBlockingIssues: vi.fn().mockReturnValue(['Some blocking issue']),
        },
      });
      const service = createPreFlightVerificationService(deps);

      const result = await service.verify();

      expect(result.verified).toBe(false);
      expect(result.blockingIssues.length).toBeGreaterThan(0);
      expect(result.criteria.legacyDependencyStopped.passed).toBe(false);
    });

    it('should fail when authorization dependencies exist', async () => {
      const deps = createMockDeps({
        codePathAnalyzer: {
          getUsagesByClassification: vi.fn().mockReturnValue([
            { id: 'usage-1' },
            { id: 'usage-2' },
          ]),
        },
      });
      const service = createPreFlightVerificationService(deps);

      const result = await service.verify();

      expect(result.verified).toBe(false);
      expect(result.criteria.zeroAuthorizationDependency.passed).toBe(false);
      expect(result.criteria.zeroAuthorizationDependency.details).toEqual({
        authCriticalCount: 2,
        usageIds: ['usage-1', 'usage-2'],
      });
    });

    it('should fail when stabilization window has not passed', async () => {
      // Set FASE 1.14 completion to only 12 hours ago (window is 24 hours)
      const recentCompletion = new Date('2024-01-15T00:00:00Z');
      const deps = createMockDeps({
        getFase114CompletionTimestamp: vi.fn().mockResolvedValue(recentCompletion),
      });
      const service = createPreFlightVerificationService(deps);

      const result = await service.verify();

      expect(result.verified).toBe(false);
      expect(result.criteria.stabilizationWindowPassed.passed).toBe(false);
      expect(result.criteria.stabilizationWindowPassed.details?.hoursRemaining).toBeGreaterThan(0);
    });

    it('should skip stabilization check when skipStabilizationCheck is true', async () => {
      const recentCompletion = new Date('2024-01-15T11:00:00Z'); // Only 1 hour ago
      const deps = createMockDeps({
        getFase114CompletionTimestamp: vi.fn().mockResolvedValue(recentCompletion),
      });
      const service = createPreFlightVerificationService(deps);

      const result = await service.verify({ skipStabilizationCheck: true });

      expect(result.criteria.stabilizationWindowPassed.passed).toBe(true);
      expect(result.criteria.stabilizationWindowPassed.details?.skipped).toBe(true);
    });

    it('should fail when no backup checkpoint exists', async () => {
      const deps = createMockDeps({
        backupService: {
          listCheckpoints: vi.fn().mockResolvedValue([]),
        },
      });
      const service = createPreFlightVerificationService(deps);

      const result = await service.verify();

      expect(result.verified).toBe(false);
      expect(result.criteria.backupCheckpointCreated.passed).toBe(false);
    });

    it('should fail when no valid backup checkpoint exists', async () => {
      const deps = createMockDeps({
        backupService: {
          listCheckpoints: vi.fn().mockResolvedValue([
            { isValid: false }, // Expired checkpoint
          ]),
        },
      });
      const service = createPreFlightVerificationService(deps);

      const result = await service.verify();

      expect(result.verified).toBe(false);
      expect(result.criteria.backupCheckpointCreated.passed).toBe(false);
    });

    it('should fail when no approval has been granted', async () => {
      const deps = createMockDeps({
        approvalGate: {
          getStatus: vi.fn().mockReturnValue({
            approved: false,
            isValid: false,
            approval: null,
          }),
        },
      });
      const service = createPreFlightVerificationService(deps);

      const result = await service.verify();

      expect(result.verified).toBe(false);
      expect(result.criteria.destructiveApprovalGate.passed).toBe(false);
    });

    it('should fail when approval has expired', async () => {
      const deps = createMockDeps({
        approvalGate: {
          getStatus: vi.fn().mockReturnValue({
            approved: true,
            isValid: false, // Expired
            approval: {
              approvalId: 'test-approval',
              approverId: 'admin',
              expiresAt: new Date('2024-01-15T11:00:00Z'), // Expired
            },
          }),
        },
      });
      const service = createPreFlightVerificationService(deps);

      const result = await service.verify();

      expect(result.verified).toBe(false);
      expect(result.criteria.destructiveApprovalGate.passed).toBe(false);
      expect(result.criteria.destructiveApprovalGate.evidence).toContain('expired');
    });

    it('should include correlation ID in result', async () => {
      const deps = createMockDeps();
      const service = createPreFlightVerificationService(deps);

      const result = await service.verify({ correlationId: 'test-correlation-123' });

      expect(result.correlationId).toBe('test-correlation-123');
    });
  });

  describe('checkCriterion', () => {
    it('should check individual criteria', async () => {
      const deps = createMockDeps();
      const service = createPreFlightVerificationService(deps);

      const result = await service.checkCriterion('legacyDependencyStopped');

      expect(result.passed).toBe(true);
      expect(result.checkedAt).toEqual(mockDate);
    });

    it('should throw on unknown criterion', async () => {
      const deps = createMockDeps();
      const service = createPreFlightVerificationService(deps);

      await expect(
        // @ts-expect-error - Testing invalid input
        service.checkCriterion('unknownCriterion'),
      ).rejects.toThrow('Unknown criterion');
    });
  });

  describe('getStabilizationStatus', () => {
    it('should return correct stabilization status when window passed', async () => {
      const deps = createMockDeps();
      const service = createPreFlightVerificationService(deps);

      const status = await service.getStabilizationStatus();

      expect(status.windowPassed).toBe(true);
      expect(status.fase114CompletedAt).toEqual(fase114CompletedAt);
      expect(status.hoursRemaining).toBe(0);
    });

    it('should return correct status when window not passed', async () => {
      const recentCompletion = new Date('2024-01-15T00:00:00Z'); // 12 hours ago
      const deps = createMockDeps({
        getFase114CompletionTimestamp: vi.fn().mockResolvedValue(recentCompletion),
      });
      const service = createPreFlightVerificationService(deps);

      const status = await service.getStabilizationStatus();

      expect(status.windowPassed).toBe(false);
      expect(status.hoursRemaining).toBeGreaterThan(0);
      expect(status.hoursRemaining).toBeLessThanOrEqual(24);
    });

    it('should return null values when FASE 1.14 not completed', async () => {
      const deps = createMockDeps({
        getFase114CompletionTimestamp: vi.fn().mockResolvedValue(null),
      });
      const service = createPreFlightVerificationService(deps);

      const status = await service.getStabilizationStatus();

      expect(status.windowPassed).toBe(false);
      expect(status.fase114CompletedAt).toBeNull();
      expect(status.windowEndTime).toBeNull();
      expect(status.hoursRemaining).toBeNull();
    });
  });

  describe('fail-closed behavior', () => {
    it('should fail closed when no services provided', async () => {
      const service = createPreFlightVerificationService({
        dateProvider: () => mockDate,
      });

      const result = await service.verify();

      expect(result.verified).toBe(false);
      // Without services, it cannot verify criteria
      expect(result.criteria.backupCheckpointCreated.passed).toBe(false);
    });
  });
});
