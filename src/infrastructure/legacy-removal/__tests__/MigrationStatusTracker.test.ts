/**
 * MigrationStatusTracker Tests — Unit tests for migration status tracking.
 *
 * @see Task 35: Code Path Analysis and Update
 * @see Requirement 12 (AC 1-6)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MigrationStatusTrackerImpl,
  createStandaloneMigrationStatusTracker,
} from '../MigrationStatusTracker';
import type {
  CodePathUsage,
  RouteAuthorizationValidation,
} from '../types';

describe('MigrationStatusTracker', () => {
  // Test data factories
  function createMockUsage(
    overrides: Partial<CodePathUsage> = {},
  ): CodePathUsage {
    return {
      id: `usage-${Math.random().toString(36).slice(2)}`,
      filePath: 'src/test.ts',
      lineNumber: 1,
      codeSnippet: 'user.tenantId',
      classification: 'authorization-critical',
      priority: 'high',
      status: 'pending',
      usageContext: {
        isAuthorizationCheck: true,
        isDatabaseQuery: false,
        isRouteHandler: true,
        isMiddleware: false,
        isWorker: false,
        isTestFile: false,
      },
      suggestedAction: 'Replace with authContext.tenantId',
      ...overrides,
    };
  }

  function createMockRouteValidation(
    overrides: Partial<RouteAuthorizationValidation> = {},
  ): RouteAuthorizationValidation {
    return {
      routeId: 'GET /api/test',
      filePath: 'src/app/api/test/route.ts',
      usesMembershipAuthorization: true,
      usesLegacyTenantId: false,
      usesAuthorizationContext: true,
      validationStatus: 'valid',
      issues: [],
      validatedAt: new Date(),
      ...overrides,
    };
  }

  describe('MigrationStatusTrackerImpl', () => {
    it('should return empty status when no data', () => {
      const tracker = MigrationStatusTrackerImpl({
        getCodePathUsages: () => [],
        getRouteValidations: () => [],
        updateCodePathStatus: () => {},
      });

      const status = tracker.getStatus();

      expect(status.totalPaths).toBe(0);
      expect(status.progressPercentage).toBe(100); // 0/0 = complete
      expect(status.isComplete).toBe(true);
      expect(status.blockingIssues).toHaveLength(0);
    });

    it('should calculate correct totals', () => {
      const usages: CodePathUsage[] = [
        createMockUsage({ classification: 'authorization-critical' }),
        createMockUsage({ classification: 'authorization-critical' }),
        createMockUsage({ classification: 'read-only' }),
        createMockUsage({ classification: 'backward-compat' }),
        createMockUsage({ classification: 'non-authorization' }),
      ];

      const tracker = MigrationStatusTrackerImpl({
        getCodePathUsages: () => usages,
        getRouteValidations: () => [],
        updateCodePathStatus: () => {},
      });

      const status = tracker.getStatus();

      expect(status.totalPaths).toBe(5);
      expect(status.byClassification['authorization-critical']).toBe(2);
      expect(status.byClassification['read-only']).toBe(1);
      expect(status.byClassification['backward-compat']).toBe(1);
      expect(status.byClassification['non-authorization']).toBe(1);
    });

    it('should calculate progress percentage correctly', () => {
      const usages: CodePathUsage[] = [
        createMockUsage({ status: 'migrated' }),
        createMockUsage({ status: 'migrated' }),
        createMockUsage({ status: 'deprecated' }),
        createMockUsage({ status: 'pending' }),
        createMockUsage({ status: 'in-progress' }),
      ];

      const tracker = MigrationStatusTrackerImpl({
        getCodePathUsages: () => usages,
        getRouteValidations: () => [],
        updateCodePathStatus: () => {},
      });

      const status = tracker.getStatus();

      // 3 out of 5 are migrated/deprecated = 60%
      expect(status.progressPercentage).toBe(60);
    });

    it('should detect incomplete migration', () => {
      const usages: CodePathUsage[] = [
        createMockUsage({
          classification: 'authorization-critical',
          status: 'pending',
        }),
        createMockUsage({
          classification: 'authorization-critical',
          status: 'migrated',
        }),
      ];

      const tracker = MigrationStatusTrackerImpl({
        getCodePathUsages: () => usages,
        getRouteValidations: () => [],
        updateCodePathStatus: () => {},
      });

      const status = tracker.getStatus();

      expect(status.isComplete).toBe(false);
      expect(status.blockingIssues).toContain(
        '1 authorization-critical code paths not yet migrated',
      );
    });

    it('should detect complete migration', () => {
      const usages: CodePathUsage[] = [
        createMockUsage({
          classification: 'authorization-critical',
          status: 'migrated',
        }),
        createMockUsage({
          classification: 'read-only',
          status: 'pending',
        }),
      ];

      const tracker = MigrationStatusTrackerImpl({
        getCodePathUsages: () => usages,
        getRouteValidations: () => [],
        updateCodePathStatus: () => {},
      });

      const status = tracker.getStatus();

      // Complete when all authorization-critical paths are migrated
      expect(status.isComplete).toBe(true);
    });

    it('should detect legacy routes as blocking issues', () => {
      const routeValidations: RouteAuthorizationValidation[] = [
        createMockRouteValidation({ validationStatus: 'valid' }),
        createMockRouteValidation({ validationStatus: 'legacy' }),
        createMockRouteValidation({ validationStatus: 'partial' }),
      ];

      const tracker = MigrationStatusTrackerImpl({
        getCodePathUsages: () => [],
        getRouteValidations: () => routeValidations,
        updateCodePathStatus: () => {},
      });

      const status = tracker.getStatus();

      expect(status.blockingIssues).toContain(
        '2 route handlers still using legacy authorization',
      );
    });

    describe('getProgress', () => {
      it('should return progress for classification category', () => {
        const usages: CodePathUsage[] = [
          createMockUsage({
            classification: 'authorization-critical',
            status: 'migrated',
          }),
          createMockUsage({
            classification: 'authorization-critical',
            status: 'pending',
          }),
          createMockUsage({
            classification: 'read-only',
            status: 'pending',
          }),
        ];

        const tracker = MigrationStatusTrackerImpl({
          getCodePathUsages: () => usages,
          getRouteValidations: () => [],
          updateCodePathStatus: () => {},
        });

        const progress = tracker.getProgress('authorization-critical');

        expect(progress.category).toBe('authorization-critical');
        expect(progress.total).toBe(2);
        expect(progress.completed).toBe(1);
        expect(progress.pending).toBe(1);
        expect(progress.percentage).toBe(50);
      });

      it('should return progress for priority category', () => {
        const usages: CodePathUsage[] = [
          createMockUsage({ priority: 'critical', status: 'migrated' }),
          createMockUsage({ priority: 'critical', status: 'migrated' }),
          createMockUsage({ priority: 'critical', status: 'pending' }),
          createMockUsage({ priority: 'high', status: 'pending' }),
        ];

        const tracker = MigrationStatusTrackerImpl({
          getCodePathUsages: () => usages,
          getRouteValidations: () => [],
          updateCodePathStatus: () => {},
        });

        const progress = tracker.getProgress('critical');

        expect(progress.category).toBe('critical');
        expect(progress.total).toBe(3);
        expect(progress.completed).toBe(2);
        expect(progress.percentage).toBe(67); // 2/3 = 66.67 rounded
      });

      it('should return empty progress for unknown category', () => {
        const tracker = MigrationStatusTrackerImpl({
          getCodePathUsages: () => [],
          getRouteValidations: () => [],
          updateCodePathStatus: () => {},
        });

        const progress = tracker.getProgress('unknown-category');

        expect(progress.total).toBe(0);
        expect(progress.percentage).toBe(100);
      });
    });

    describe('recordMigrated', () => {
      it('should call updateCodePathStatus with migrated status', () => {
        let calledWith: { usageId: string; status: string } | null = null;

        const tracker = MigrationStatusTrackerImpl({
          getCodePathUsages: () => [],
          getRouteValidations: () => [],
          updateCodePathStatus: (usageId, status) => {
            calledWith = { usageId, status };
          },
        });

        tracker.recordMigrated('usage-123');

        expect(calledWith).toEqual({
          usageId: 'usage-123',
          status: 'migrated',
        });
      });
    });

    describe('isMigrationComplete', () => {
      it('should return true when all authorization-critical paths are migrated', () => {
        const usages: CodePathUsage[] = [
          createMockUsage({
            classification: 'authorization-critical',
            status: 'migrated',
          }),
          createMockUsage({
            classification: 'read-only',
            status: 'pending',
          }),
        ];

        const tracker = MigrationStatusTrackerImpl({
          getCodePathUsages: () => usages,
          getRouteValidations: () => [],
          updateCodePathStatus: () => {},
        });

        expect(tracker.isMigrationComplete()).toBe(true);
      });

      it('should return false when blocking issues exist', () => {
        const usages: CodePathUsage[] = [
          createMockUsage({
            classification: 'authorization-critical',
            status: 'migrated',
          }),
        ];
        const routeValidations: RouteAuthorizationValidation[] = [
          createMockRouteValidation({ validationStatus: 'legacy' }),
        ];

        const tracker = MigrationStatusTrackerImpl({
          getCodePathUsages: () => usages,
          getRouteValidations: () => routeValidations,
          updateCodePathStatus: () => {},
        });

        // Even though auth-critical paths are done, legacy routes block completion
        expect(tracker.isMigrationComplete()).toBe(false);
      });
    });

    describe('getBlockingIssues', () => {
      it('should return all blocking issues', () => {
        const usages: CodePathUsage[] = [
          createMockUsage({
            classification: 'authorization-critical',
            status: 'pending',
            priority: 'critical',
          }),
        ];
        const routeValidations: RouteAuthorizationValidation[] = [
          createMockRouteValidation({ validationStatus: 'legacy' }),
        ];

        const tracker = MigrationStatusTrackerImpl({
          getCodePathUsages: () => usages,
          getRouteValidations: () => routeValidations,
          updateCodePathStatus: () => {},
        });

        const issues = tracker.getBlockingIssues();

        expect(issues.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  describe('createStandaloneMigrationStatusTracker', () => {
    let tracker: ReturnType<typeof createStandaloneMigrationStatusTracker>;

    beforeEach(() => {
      tracker = createStandaloneMigrationStatusTracker();
    });

    it('should create empty tracker', () => {
      const status = tracker.getStatus();
      expect(status.totalPaths).toBe(0);
    });

    it('should allow adding usages', () => {
      tracker.addUsages([
        createMockUsage({ id: 'usage-1' }),
        createMockUsage({ id: 'usage-2' }),
      ]);

      const status = tracker.getStatus();
      expect(status.totalPaths).toBe(2);
    });

    it('should allow adding route validations', () => {
      tracker.addUsages([createMockUsage({ id: 'usage-1' })]);
      tracker.addRouteValidations([
        createMockRouteValidation({ validationStatus: 'legacy' }),
      ]);

      const status = tracker.getStatus();
      expect(status.blockingIssues).toContain(
        '1 route handlers still using legacy authorization',
      );
    });

    it('should allow clearing data', () => {
      tracker.addUsages([createMockUsage()]);
      expect(tracker.getStatus().totalPaths).toBe(1);

      tracker.clear();
      expect(tracker.getStatus().totalPaths).toBe(0);
    });

    it('should update status correctly when recording migrated', () => {
      const usage = createMockUsage({ id: 'usage-1', status: 'pending' });
      tracker.addUsages([usage]);

      expect(tracker.getStatus().byStatus['pending']).toBe(1);

      tracker.recordMigrated('usage-1');

      expect(tracker.getStatus().byStatus['migrated']).toBe(1);
      expect(tracker.getStatus().byStatus['pending']).toBe(0);
    });
  });
});
