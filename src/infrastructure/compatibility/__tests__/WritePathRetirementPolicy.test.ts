/**
 * WritePathRetirementPolicy Unit Tests
 *
 * Tests for the write path retirement policy service that defines and
 * evaluates conditions for retiring dual-write paths after cutover.
 *
 * **KEY TEST SCENARIOS:**
 * - Policy configuration defaults and customization
 * - Stability window evaluation
 * - Data consistency evaluation
 * - Rollback window evaluation
 * - Write path classification evaluation
 * - Full retirement eligibility evaluation
 *
 * @see Task 28: Post-Cutover Write Path Finalization
 * @see Requirements 9 (AC 1-7), Req 48 (rollback safety)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createWritePathRetirementPolicyService,
  getDefaultRetirementPolicy,
  getRollbackWindowHours,
  DEFAULT_RETIREMENT_POLICY,
  ROLLBACK_WINDOW_HOURS,
} from '../WritePathRetirementPolicy';
import { createWritePathInventoryService } from '../WritePathInventory';
import type {
  WritePathStabilityMetrics,
  WritePathRetirementPolicyConfig,
} from '../types';
import { WritePathClassification, WritePathRetirementStatus } from '../types';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

/**
 * Create stable metrics that should pass all conditions.
 */
function createStableMetrics(
  writePathId: string,
  overrides?: Partial<WritePathStabilityMetrics>,
): WritePathStabilityMetrics {
  const cutoverAt = new Date(Date.now() - 72 * 60 * 60 * 1000); // 72 hours ago

  return {
    writePathId,
    cutoverAt,
    hoursSinceCutover: 72,
    successfulWrites: 100,
    failedWrites: 0,
    inconsistencyCount: 0,
    inconsistencyRate: 0,
    rollbackTriggered: false,
    lastSuccessfulWriteAt: new Date(),
    ...overrides,
  };
}

/**
 * Create unstable metrics (recent cutover).
 */
function createUnstableMetrics(
  writePathId: string,
  overrides?: Partial<WritePathStabilityMetrics>,
): WritePathStabilityMetrics {
  const cutoverAt = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago

  return {
    writePathId,
    cutoverAt,
    hoursSinceCutover: 2,
    successfulWrites: 5,
    failedWrites: 1,
    inconsistencyCount: 0,
    inconsistencyRate: 0,
    rollbackTriggered: false,
    ...overrides,
  };
}

describe('WritePathRetirementPolicy', () => {
  let inventoryService: ReturnType<typeof createWritePathInventoryService>;

  beforeEach(() => {
    inventoryService = createWritePathInventoryService();
  });

  describe('Constants and Defaults', () => {
    it('should export default policy configuration', () => {
      expect(DEFAULT_RETIREMENT_POLICY).toBeDefined();
      expect(DEFAULT_RETIREMENT_POLICY.minimumStabilityHours).toBe(24);
      expect(DEFAULT_RETIREMENT_POLICY.maxInconsistencyRate).toBe(0);
      expect(DEFAULT_RETIREMENT_POLICY.requireRollbackCapability).toBe(true);
      expect(DEFAULT_RETIREMENT_POLICY.minimumSuccessfulWrites).toBe(10);
    });

    it('should export rollback window hours', () => {
      expect(ROLLBACK_WINDOW_HOURS).toBe(48);
    });

    it('should return default policy via helper function', () => {
      const policy = getDefaultRetirementPolicy();
      expect(policy).toEqual(DEFAULT_RETIREMENT_POLICY);
    });

    it('should return rollback window hours via helper function', () => {
      const hours = getRollbackWindowHours();
      expect(hours).toBe(48);
    });
  });

  describe('createWritePathRetirementPolicyService', () => {
    it('should create a service instance with default config', () => {
      const policyService = createWritePathRetirementPolicyService({
        inventoryService,
      });

      expect(policyService).toBeDefined();
      expect(policyService.getPolicyConfig).toBeDefined();
      expect(policyService.evaluateRetirementEligibility).toBeDefined();
      expect(policyService.hasStabilityWindowPassed).toBeDefined();
      expect(policyService.isDataConsistent).toBeDefined();
      expect(policyService.isRollbackStillRequired).toBeDefined();
    });

    it('should accept custom policy configuration', () => {
      const customConfig: WritePathRetirementPolicyConfig = {
        minimumStabilityHours: 48,
        maxInconsistencyRate: 0.001,
        requireRollbackCapability: false,
        minimumSuccessfulWrites: 50,
      };

      const policyService = createWritePathRetirementPolicyService({
        inventoryService,
        policyConfig: customConfig,
      });

      const config = policyService.getPolicyConfig();
      expect(config.minimumStabilityHours).toBe(48);
      expect(config.maxInconsistencyRate).toBe(0.001);
      expect(config.requireRollbackCapability).toBe(false);
      expect(config.minimumSuccessfulWrites).toBe(50);
    });
  });

  describe('getPolicyConfig', () => {
    it('should return a copy of the policy config', () => {
      const policyService = createWritePathRetirementPolicyService({
        inventoryService,
      });

      const config1 = policyService.getPolicyConfig();
      const config2 = policyService.getPolicyConfig();

      expect(config1).not.toBe(config2); // Should be different objects
      expect(config1).toEqual(config2); // But with same values
    });
  });

  describe('hasStabilityWindowPassed', () => {
    it('should return true when stability window has passed', () => {
      const policyService = createWritePathRetirementPolicyService({
        inventoryService,
      });

      const metrics = createStableMetrics('WP-001');
      expect(policyService.hasStabilityWindowPassed(metrics)).toBe(true);
    });

    it('should return false when within stability window', () => {
      const policyService = createWritePathRetirementPolicyService({
        inventoryService,
      });

      const metrics = createUnstableMetrics('WP-001');
      expect(policyService.hasStabilityWindowPassed(metrics)).toBe(false);
    });

    it('should respect custom stability hours', () => {
      const policyService = createWritePathRetirementPolicyService({
        inventoryService,
        policyConfig: {
          ...DEFAULT_RETIREMENT_POLICY,
          minimumStabilityHours: 1, // Only 1 hour required
        },
      });

      const metrics = createUnstableMetrics('WP-001', {
        hoursSinceCutover: 2, // 2 hours since cutover
      });

      expect(policyService.hasStabilityWindowPassed(metrics)).toBe(true);
    });
  });

  describe('isDataConsistent', () => {
    it('should return true when no inconsistencies', () => {
      const policyService = createWritePathRetirementPolicyService({
        inventoryService,
      });

      const metrics = createStableMetrics('WP-001', {
        inconsistencyCount: 0,
        inconsistencyRate: 0,
      });

      expect(policyService.isDataConsistent(metrics)).toBe(true);
    });

    it('should return false when inconsistencies exceed threshold', () => {
      const policyService = createWritePathRetirementPolicyService({
        inventoryService,
      });

      const metrics = createStableMetrics('WP-001', {
        inconsistencyCount: 5,
        inconsistencyRate: 0.05, // 5%
      });

      expect(policyService.isDataConsistent(metrics)).toBe(false);
    });

    it('should allow some inconsistency with custom threshold', () => {
      const policyService = createWritePathRetirementPolicyService({
        inventoryService,
        policyConfig: {
          ...DEFAULT_RETIREMENT_POLICY,
          maxInconsistencyRate: 0.01, // 1% allowed
        },
      });

      const metrics = createStableMetrics('WP-001', {
        inconsistencyCount: 1,
        inconsistencyRate: 0.005, // 0.5%
      });

      expect(policyService.isDataConsistent(metrics)).toBe(true);
    });
  });

  describe('isRollbackStillRequired', () => {
    it('should return true when within rollback window', () => {
      const policyService = createWritePathRetirementPolicyService({
        inventoryService,
      });

      const cutoverAt = new Date(Date.now() - 12 * 60 * 60 * 1000); // 12 hours ago
      expect(policyService.isRollbackStillRequired(cutoverAt)).toBe(true);
    });

    it('should return false when rollback window has passed', () => {
      const policyService = createWritePathRetirementPolicyService({
        inventoryService,
      });

      const cutoverAt = new Date(Date.now() - 72 * 60 * 60 * 1000); // 72 hours ago
      expect(policyService.isRollbackStillRequired(cutoverAt)).toBe(false);
    });

    it('should return false when rollback not required by policy', () => {
      const policyService = createWritePathRetirementPolicyService({
        inventoryService,
        policyConfig: {
          ...DEFAULT_RETIREMENT_POLICY,
          requireRollbackCapability: false,
        },
      });

      const cutoverAt = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour ago
      expect(policyService.isRollbackStillRequired(cutoverAt)).toBe(false);
    });
  });

  describe('evaluateRetirementEligibility', () => {
    it('should return can retire for stable DUAL_WRITE path', () => {
      const policyService = createWritePathRetirementPolicyService({
        inventoryService,
      });

      const metrics = createStableMetrics('WP-001');
      const evaluation = policyService.evaluateRetirementEligibility('WP-001', metrics);

      expect(evaluation.writePathId).toBe('WP-001');
      expect(evaluation.canRetire).toBe(true);
      expect(evaluation.blockingConditions).toHaveLength(0);
      expect(evaluation.conditions.length).toBeGreaterThan(0);
      expect(evaluation.recommendation).toContain('ready for retirement');
    });

    it('should not allow retirement for unstable path', () => {
      const policyService = createWritePathRetirementPolicyService({
        inventoryService,
      });

      const metrics = createUnstableMetrics('WP-001');
      const evaluation = policyService.evaluateRetirementEligibility('WP-001', metrics);

      expect(evaluation.canRetire).toBe(false);
      expect(evaluation.blockingConditions.length).toBeGreaterThan(0);
      expect(evaluation.recommendation).toContain('cannot be retired');
    });

    it('should return not found for unknown write path', () => {
      const policyService = createWritePathRetirementPolicyService({
        inventoryService,
      });

      const metrics = createStableMetrics('WP-UNKNOWN');
      const evaluation = policyService.evaluateRetirementEligibility('WP-UNKNOWN', metrics);

      expect(evaluation.canRetire).toBe(false);
      expect(evaluation.blockingConditions).toHaveLength(1);
      expect(evaluation.blockingConditions[0].id).toBe('COND-000');
      expect(evaluation.recommendation).toContain('not found');
    });

    it('should report MEMBERSHIP_AUTHORITATIVE paths as already retired', () => {
      const policyService = createWritePathRetirementPolicyService({
        inventoryService,
      });

      // WP-003 is MEMBERSHIP_AUTHORITATIVE in the inventory
      const metrics = createStableMetrics('WP-003');
      const evaluation = policyService.evaluateRetirementEligibility('WP-003', metrics);

      expect(evaluation.canRetire).toBe(false); // No action needed
      expect(evaluation.retirementStatus).toBe(WritePathRetirementStatus.MEMBERSHIP_ONLY);
      expect(evaluation.recommendation).toContain('already Membership-authoritative');
    });

    it('should block retirement when rollback was triggered', () => {
      const policyService = createWritePathRetirementPolicyService({
        inventoryService,
      });

      const metrics = createStableMetrics('WP-001', {
        rollbackTriggered: true,
      });
      const evaluation = policyService.evaluateRetirementEligibility('WP-001', metrics);

      expect(evaluation.canRetire).toBe(false);
      const rollbackCondition = evaluation.conditions.find(c => c.id === 'COND-004');
      expect(rollbackCondition?.met).toBe(false);
      expect(rollbackCondition?.message).toContain('Rollback was triggered');
    });

    it('should block retirement when insufficient writes', () => {
      const policyService = createWritePathRetirementPolicyService({
        inventoryService,
      });

      const metrics = createStableMetrics('WP-001', {
        successfulWrites: 5, // Less than minimum 10
      });
      const evaluation = policyService.evaluateRetirementEligibility('WP-001', metrics);

      expect(evaluation.canRetire).toBe(false);
      const writesCondition = evaluation.conditions.find(c => c.id === 'COND-003');
      expect(writesCondition?.met).toBe(false);
    });

    it('should include all condition evaluations', () => {
      const policyService = createWritePathRetirementPolicyService({
        inventoryService,
      });

      const metrics = createStableMetrics('WP-001');
      const evaluation = policyService.evaluateRetirementEligibility('WP-001', metrics);

      // Should have all 5 conditions
      expect(evaluation.conditions.length).toBe(5);

      const conditionIds = evaluation.conditions.map(c => c.id);
      expect(conditionIds).toContain('COND-001'); // Stability Window
      expect(conditionIds).toContain('COND-002'); // Data Consistency
      expect(conditionIds).toContain('COND-003'); // Minimum Writes
      expect(conditionIds).toContain('COND-004'); // Rollback Window
      expect(conditionIds).toContain('COND-005'); // Classification
    });

    it('should include timestamp in evaluation', () => {
      const policyService = createWritePathRetirementPolicyService({
        inventoryService,
      });

      const beforeEval = new Date();
      const metrics = createStableMetrics('WP-001');
      const evaluation = policyService.evaluateRetirementEligibility('WP-001', metrics);
      const afterEval = new Date();

      expect(evaluation.evaluatedAt.getTime()).toBeGreaterThanOrEqual(beforeEval.getTime());
      expect(evaluation.evaluatedAt.getTime()).toBeLessThanOrEqual(afterEval.getTime());
    });
  });

  describe('Condition Evaluation Details', () => {
    it('should provide detailed stability window message', () => {
      const policyService = createWritePathRetirementPolicyService({
        inventoryService,
      });

      const metrics = createStableMetrics('WP-001', { hoursSinceCutover: 48 });
      const evaluation = policyService.evaluateRetirementEligibility('WP-001', metrics);

      const condition = evaluation.conditions.find(c => c.id === 'COND-001');
      expect(condition?.message).toContain('48.0 hours');
      expect(condition?.message).toContain('required: 24h');
    });

    it('should provide detailed data consistency message', () => {
      const policyService = createWritePathRetirementPolicyService({
        inventoryService,
      });

      const metrics = createStableMetrics('WP-001', {
        inconsistencyCount: 2,
        inconsistencyRate: 0.02,
      });
      const evaluation = policyService.evaluateRetirementEligibility('WP-001', metrics);

      const condition = evaluation.conditions.find(c => c.id === 'COND-002');
      expect(condition?.message).toContain('2 inconsistencies');
      expect(condition?.message).toContain('2.000%');
    });

    it('should provide detailed successful writes message', () => {
      const policyService = createWritePathRetirementPolicyService({
        inventoryService,
      });

      const metrics = createStableMetrics('WP-001', {
        successfulWrites: 50,
        failedWrites: 5,
      });
      const evaluation = policyService.evaluateRetirementEligibility('WP-001', metrics);

      const condition = evaluation.conditions.find(c => c.id === 'COND-003');
      expect(condition?.message).toContain('50 successful writes');
      expect(condition?.message).toContain('success rate');
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero total writes correctly', () => {
      const policyService = createWritePathRetirementPolicyService({
        inventoryService,
      });

      const metrics = createStableMetrics('WP-001', {
        successfulWrites: 0,
        failedWrites: 0,
        inconsistencyCount: 0,
        inconsistencyRate: 0,
      });

      const evaluation = policyService.evaluateRetirementEligibility('WP-001', metrics);

      // Should fail on minimum writes but not crash on division by zero
      expect(evaluation.canRetire).toBe(false);
      const consistencyCondition = evaluation.conditions.find(c => c.id === 'COND-002');
      expect(consistencyCondition?.met).toBe(true); // 0/0 should be considered consistent
    });

    it('should handle exactly at threshold values', () => {
      const policyService = createWritePathRetirementPolicyService({
        inventoryService,
      });

      const metrics = createStableMetrics('WP-001', {
        hoursSinceCutover: 24, // Exactly at threshold
        successfulWrites: 10, // Exactly at threshold
      });

      const evaluation = policyService.evaluateRetirementEligibility('WP-001', metrics);

      // Should pass when exactly at threshold (>=)
      const stabilityCondition = evaluation.conditions.find(c => c.id === 'COND-001');
      const writesCondition = evaluation.conditions.find(c => c.id === 'COND-003');

      expect(stabilityCondition?.met).toBe(true);
      expect(writesCondition?.met).toBe(true);
    });
  });
});
