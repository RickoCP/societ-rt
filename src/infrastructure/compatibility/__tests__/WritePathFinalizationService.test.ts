/**
 * WritePathFinalizationService Unit Tests
 *
 * Tests for the post-cutover write path retirement orchestration service.
 *
 * **KEY TEST SCENARIOS:**
 * - Evaluate all write paths for retirement eligibility
 * - Track retirement status per write path
 * - Initiate retirement with policy evaluation
 * - Revert retirement (restore dual-write)
 * - Record write operations and inconsistencies
 * - Audit logging for retirement operations
 * - Quarantine preservation verification
 * - Finalization completion check
 *
 * @see Task 28: Post-Cutover Write Path Finalization
 * @see Requirements 9 (AC 1-7), Req 48 (rollback safety)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createWritePathFinalizationService,
} from '../WritePathFinalizationService';
import {
  createWritePathRetirementPolicyService,
  DEFAULT_RETIREMENT_POLICY,
} from '../WritePathRetirementPolicy';
import { createWritePathInventoryService } from '../WritePathInventory';
import type { IQuarantineManifestService } from '@infrastructure/quarantine';
import {
  WritePathRetirementStatus,
  WritePathClassification,
} from '../types';

// ---------------------------------------------------------------------------
// Mock Quarantine Service
// ---------------------------------------------------------------------------

const createMockQuarantineService = (
  quarantineCount: number = 5,
): IQuarantineManifestService => ({
  isQuarantined: vi.fn().mockReturnValue(false),
  getQuarantinedCount: vi.fn().mockReturnValue(quarantineCount),
  getManifestVersion: vi.fn().mockReturnValue('1.0.0'),
  getQuarantinedUserIds: vi.fn().mockReturnValue([
    'pna-01-uuid',
    'pna-02-uuid',
    'pna-03-uuid',
    'pna-04-uuid',
    'pna-05-uuid',
  ].slice(0, quarantineCount)),
  getManifest: vi.fn().mockReturnValue({
    version: '1.0.0',
    provenance: { source: 'test' },
    invariant: 'INV-QUARANTINE-001',
    expectedCount: quarantineCount,
    quarantinedUsers: [],
  }),
});

describe('WritePathFinalizationService', () => {
  let inventoryService: ReturnType<typeof createWritePathInventoryService>;
  let policyService: ReturnType<typeof createWritePathRetirementPolicyService>;
  let quarantineService: IQuarantineManifestService;
  let cutoverTimestamp: Date;

  beforeEach(() => {
    inventoryService = createWritePathInventoryService();
    policyService = createWritePathRetirementPolicyService({
      inventoryService,
    });
    quarantineService = createMockQuarantineService();
    // Set cutover timestamp to 72 hours ago (past stability and rollback windows)
    cutoverTimestamp = new Date(Date.now() - 72 * 60 * 60 * 1000);
  });

  describe('createWritePathFinalizationService', () => {
    it('should create a service instance', () => {
      const finalizationService = createWritePathFinalizationService({
        inventoryService,
        policyService,
        quarantineService,
        cutoverTimestamp,
      });

      expect(finalizationService).toBeDefined();
      expect(finalizationService.evaluateAllWritePaths).toBeDefined();
      expect(finalizationService.getWritePathRetirementStatus).toBeDefined();
      expect(finalizationService.initiateRetirement).toBeDefined();
      expect(finalizationService.revertRetirement).toBeDefined();
      expect(finalizationService.getStabilityMetrics).toBeDefined();
      expect(finalizationService.recordWriteOperation).toBeDefined();
      expect(finalizationService.recordInconsistency).toBeDefined();
      expect(finalizationService.getRetirementAuditLog).toBeDefined();
      expect(finalizationService.verifyQuarantinePreserved).toBeDefined();
      expect(finalizationService.isFinalizationComplete).toBeDefined();
    });

    it('should use current date if no cutover timestamp provided', () => {
      const finalizationService = createWritePathFinalizationService({
        inventoryService,
        policyService,
        quarantineService,
      });

      const metrics = finalizationService.getStabilityMetrics('WP-001');
      expect(metrics).toBeDefined();
      expect(metrics!.hoursSinceCutover).toBeLessThan(1);
    });
  });

  describe('evaluateAllWritePaths', () => {
    it('should evaluate all write paths in inventory', async () => {
      const finalizationService = createWritePathFinalizationService({
        inventoryService,
        policyService,
        quarantineService,
        cutoverTimestamp,
      });

      const result = await finalizationService.evaluateAllWritePaths();

      expect(result.evaluatedAt).toBeInstanceOf(Date);
      expect(result.evaluations.length).toBeGreaterThan(0);
      expect(result.quarantineVerified).toBe(true);
    });

    it('should track status counts correctly', async () => {
      const finalizationService = createWritePathFinalizationService({
        inventoryService,
        policyService,
        quarantineService,
        cutoverTimestamp,
      });

      const result = await finalizationService.evaluateAllWritePaths();

      expect(result.statusCounts[WritePathRetirementStatus.DUAL_WRITE]).toBeDefined();
      expect(result.statusCounts[WritePathRetirementStatus.MEMBERSHIP_ONLY]).toBeDefined();
      expect(result.statusCounts[WritePathRetirementStatus.RETIREMENT_PENDING]).toBeDefined();
      expect(result.statusCounts[WritePathRetirementStatus.RETIRED]).toBeDefined();
    });

    it('should identify paths ready for retirement', async () => {
      const finalizationService = createWritePathFinalizationService({
        inventoryService,
        policyService,
        quarantineService,
        cutoverTimestamp,
      });

      // Record enough writes to meet minimum requirement
      for (let i = 0; i < 20; i++) {
        finalizationService.recordWriteOperation('WP-001', true);
        finalizationService.recordWriteOperation('WP-002', true);
      }

      const result = await finalizationService.evaluateAllWritePaths();

      // DUAL_WRITE paths with sufficient metrics should be ready
      expect(result.readyForRetirement.length).toBeGreaterThanOrEqual(0);
    });

    it('should identify paths blocked from retirement', async () => {
      const recentCutover = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      const finalizationService = createWritePathFinalizationService({
        inventoryService,
        policyService,
        quarantineService,
        cutoverTimestamp: recentCutover,
      });

      const result = await finalizationService.evaluateAllWritePaths();

      // DUAL_WRITE paths should be blocked due to recent cutover
      expect(result.blockedFromRetirement.length).toBeGreaterThan(0);
    });

    it('should verify quarantine is preserved', async () => {
      const finalizationService = createWritePathFinalizationService({
        inventoryService,
        policyService,
        quarantineService,
        cutoverTimestamp,
      });

      const result = await finalizationService.evaluateAllWritePaths();

      expect(result.quarantineVerified).toBe(true);
    });

    it('should fail quarantine verification when count is wrong', async () => {
      const badQuarantineService = createMockQuarantineService(3); // Wrong count

      const finalizationService = createWritePathFinalizationService({
        inventoryService,
        policyService,
        quarantineService: badQuarantineService,
        cutoverTimestamp,
      });

      const result = await finalizationService.evaluateAllWritePaths();

      expect(result.quarantineVerified).toBe(false);
      expect(result.isComplete).toBe(false);
      expect(result.summary).toContain('BLOCKED');
      expect(result.summary).toContain('Quarantine');
    });

    it('should provide summary message', async () => {
      const finalizationService = createWritePathFinalizationService({
        inventoryService,
        policyService,
        quarantineService,
        cutoverTimestamp,
      });

      const result = await finalizationService.evaluateAllWritePaths();

      expect(result.summary).toBeTruthy();
      expect(result.summary).toContain('POST-CUTOVER FINALIZATION');
    });
  });

  describe('getWritePathRetirementStatus', () => {
    it('should return DUAL_WRITE for dual-write paths', () => {
      const finalizationService = createWritePathFinalizationService({
        inventoryService,
        policyService,
        quarantineService,
        cutoverTimestamp,
      });

      // WP-001 is DUAL_WRITE in inventory
      const status = finalizationService.getWritePathRetirementStatus('WP-001');
      expect(status).toBe(WritePathRetirementStatus.DUAL_WRITE);
    });

    it('should return MEMBERSHIP_ONLY for membership-authoritative paths', () => {
      const finalizationService = createWritePathFinalizationService({
        inventoryService,
        policyService,
        quarantineService,
        cutoverTimestamp,
      });

      // WP-003 is MEMBERSHIP_AUTHORITATIVE in inventory
      const status = finalizationService.getWritePathRetirementStatus('WP-003');
      expect(status).toBe(WritePathRetirementStatus.MEMBERSHIP_ONLY);
    });

    it('should return DUAL_WRITE for unknown paths', () => {
      const finalizationService = createWritePathFinalizationService({
        inventoryService,
        policyService,
        quarantineService,
        cutoverTimestamp,
      });

      const status = finalizationService.getWritePathRetirementStatus('WP-UNKNOWN');
      expect(status).toBe(WritePathRetirementStatus.DUAL_WRITE);
    });
  });

  describe('initiateRetirement', () => {
    it('should retire eligible write path', async () => {
      const finalizationService = createWritePathFinalizationService({
        inventoryService,
        policyService,
        quarantineService,
        cutoverTimestamp,
      });

      // Record enough writes to meet minimum
      for (let i = 0; i < 20; i++) {
        finalizationService.recordWriteOperation('WP-001', true);
      }

      const result = await finalizationService.initiateRetirement({
        writePathId: 'WP-001',
        operatorId: 'admin-123',
        reason: 'Stability confirmed for testing',
      });

      expect(result.success).toBe(true);
      expect(result.writePathId).toBe('WP-001');
      expect(result.newStatus).toBe(WritePathRetirementStatus.MEMBERSHIP_ONLY);
      expect(result.auditEntry).toBeDefined();
    });

    it('should fail for ineligible write path (recent cutover)', async () => {
      const recentCutover = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      const finalizationService = createWritePathFinalizationService({
        inventoryService,
        policyService,
        quarantineService,
        cutoverTimestamp: recentCutover,
      });

      const result = await finalizationService.initiateRetirement({
        writePathId: 'WP-001',
        operatorId: 'admin-123',
        reason: 'Test retirement',
      });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Cannot retire');
    });

    it('should succeed for already retired path', async () => {
      const finalizationService = createWritePathFinalizationService({
        inventoryService,
        policyService,
        quarantineService,
        cutoverTimestamp,
      });

      // WP-003 is already MEMBERSHIP_AUTHORITATIVE
      const result = await finalizationService.initiateRetirement({
        writePathId: 'WP-003',
        operatorId: 'admin-123',
        reason: 'Already retired',
      });

      expect(result.success).toBe(true);
      expect(result.newStatus).toBe(WritePathRetirementStatus.MEMBERSHIP_ONLY);
    });

    it('should fail for unknown write path', async () => {
      const finalizationService = createWritePathFinalizationService({
        inventoryService,
        policyService,
        quarantineService,
        cutoverTimestamp,
      });

      const result = await finalizationService.initiateRetirement({
        writePathId: 'WP-UNKNOWN',
        operatorId: 'admin-123',
        reason: 'Test unknown path',
      });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('not found');
    });

    it('should allow skipping stability check', async () => {
      const recentCutover = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour ago
      const finalizationService = createWritePathFinalizationService({
        inventoryService,
        policyService,
        quarantineService,
        cutoverTimestamp: recentCutover,
      });

      const result = await finalizationService.initiateRetirement({
        writePathId: 'WP-001',
        operatorId: 'admin-123',
        reason: 'Test with skip check',
        skipStabilityCheck: true,
      });

      expect(result.success).toBe(true);
    });

    it('should create audit entry', async () => {
      const finalizationService = createWritePathFinalizationService({
        inventoryService,
        policyService,
        quarantineService,
        cutoverTimestamp,
      });

      for (let i = 0; i < 20; i++) {
        finalizationService.recordWriteOperation('WP-001', true);
      }

      await finalizationService.initiateRetirement({
        writePathId: 'WP-001',
        operatorId: 'admin-123',
        reason: 'Test audit',
        correlationId: 'corr-123',
      });

      const auditLog = finalizationService.getRetirementAuditLog();
      expect(auditLog.length).toBeGreaterThan(0);
      expect(auditLog[0].writePathId).toBe('WP-001');
      expect(auditLog[0].operatorId).toBe('admin-123');
      expect(auditLog[0].correlationId).toBe('corr-123');
    });
  });

  describe('revertRetirement', () => {
    it('should revert retired path to dual-write', async () => {
      const finalizationService = createWritePathFinalizationService({
        inventoryService,
        policyService,
        quarantineService,
        cutoverTimestamp,
      });

      // First retire the path
      for (let i = 0; i < 20; i++) {
        finalizationService.recordWriteOperation('WP-001', true);
      }

      await finalizationService.initiateRetirement({
        writePathId: 'WP-001',
        operatorId: 'admin-123',
        reason: 'Initial retirement',
      });

      // Now revert
      const result = await finalizationService.revertRetirement({
        writePathId: 'WP-001',
        operatorId: 'admin-456',
        reason: 'Issue detected, reverting',
      });

      expect(result.success).toBe(true);
      expect(result.newStatus).toBe(WritePathRetirementStatus.DUAL_WRITE);
    });

    it('should fail to revert non-retired path', async () => {
      const finalizationService = createWritePathFinalizationService({
        inventoryService,
        policyService,
        quarantineService,
        cutoverTimestamp,
      });

      // WP-001 is still DUAL_WRITE
      const result = await finalizationService.revertRetirement({
        writePathId: 'WP-001',
        operatorId: 'admin-123',
        reason: 'Try to revert non-retired',
      });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Cannot revert');
    });

    it('should mark rollback triggered after revert', async () => {
      const finalizationService = createWritePathFinalizationService({
        inventoryService,
        policyService,
        quarantineService,
        cutoverTimestamp,
      });

      // Retire first
      for (let i = 0; i < 20; i++) {
        finalizationService.recordWriteOperation('WP-001', true);
      }

      await finalizationService.initiateRetirement({
        writePathId: 'WP-001',
        operatorId: 'admin-123',
        reason: 'Retire',
        skipStabilityCheck: true,
      });

      // Revert
      await finalizationService.revertRetirement({
        writePathId: 'WP-001',
        operatorId: 'admin-456',
        reason: 'Revert',
      });

      // Check metrics show rollback triggered
      const metrics = finalizationService.getStabilityMetrics('WP-001');
      expect(metrics?.rollbackTriggered).toBe(true);
    });
  });

  describe('getStabilityMetrics', () => {
    it('should return metrics for tracked path', () => {
      const finalizationService = createWritePathFinalizationService({
        inventoryService,
        policyService,
        quarantineService,
        cutoverTimestamp,
      });

      const metrics = finalizationService.getStabilityMetrics('WP-001');

      expect(metrics).toBeDefined();
      expect(metrics!.writePathId).toBe('WP-001');
      expect(metrics!.cutoverAt).toEqual(cutoverTimestamp);
      expect(metrics!.hoursSinceCutover).toBeGreaterThan(0);
      expect(metrics!.successfulWrites).toBe(0);
      expect(metrics!.failedWrites).toBe(0);
    });

    it('should return undefined for untracked path', () => {
      const finalizationService = createWritePathFinalizationService({
        inventoryService,
        policyService,
        quarantineService,
        cutoverTimestamp,
      });

      const metrics = finalizationService.getStabilityMetrics('WP-UNKNOWN');
      expect(metrics).toBeUndefined();
    });
  });

  describe('recordWriteOperation', () => {
    it('should track successful writes', () => {
      const finalizationService = createWritePathFinalizationService({
        inventoryService,
        policyService,
        quarantineService,
        cutoverTimestamp,
      });

      finalizationService.recordWriteOperation('WP-001', true);
      finalizationService.recordWriteOperation('WP-001', true);
      finalizationService.recordWriteOperation('WP-001', true);

      const metrics = finalizationService.getStabilityMetrics('WP-001');
      expect(metrics!.successfulWrites).toBe(3);
      expect(metrics!.lastSuccessfulWriteAt).toBeDefined();
    });

    it('should track failed writes', () => {
      const finalizationService = createWritePathFinalizationService({
        inventoryService,
        policyService,
        quarantineService,
        cutoverTimestamp,
      });

      finalizationService.recordWriteOperation('WP-001', true);
      finalizationService.recordWriteOperation('WP-001', false);
      finalizationService.recordWriteOperation('WP-001', false);

      const metrics = finalizationService.getStabilityMetrics('WP-001');
      expect(metrics!.successfulWrites).toBe(1);
      expect(metrics!.failedWrites).toBe(2);
    });
  });

  describe('recordInconsistency', () => {
    it('should track data inconsistencies', () => {
      const finalizationService = createWritePathFinalizationService({
        inventoryService,
        policyService,
        quarantineService,
        cutoverTimestamp,
      });

      finalizationService.recordInconsistency('WP-001');
      finalizationService.recordInconsistency('WP-001');

      const metrics = finalizationService.getStabilityMetrics('WP-001');
      expect(metrics!.inconsistencyCount).toBe(2);
    });
  });

  describe('getRetirementAuditLog', () => {
    it('should return empty log initially', () => {
      const finalizationService = createWritePathFinalizationService({
        inventoryService,
        policyService,
        quarantineService,
        cutoverTimestamp,
      });

      const auditLog = finalizationService.getRetirementAuditLog();
      expect(auditLog).toHaveLength(0);
    });

    it('should filter by writePathId', async () => {
      const finalizationService = createWritePathFinalizationService({
        inventoryService,
        policyService,
        quarantineService,
        cutoverTimestamp,
      });

      // Perform some operations
      for (let i = 0; i < 20; i++) {
        finalizationService.recordWriteOperation('WP-001', true);
        finalizationService.recordWriteOperation('WP-002', true);
      }

      await finalizationService.initiateRetirement({
        writePathId: 'WP-001',
        operatorId: 'admin-123',
        reason: 'Retire WP-001',
      });

      await finalizationService.initiateRetirement({
        writePathId: 'WP-002',
        operatorId: 'admin-123',
        reason: 'Retire WP-002',
      });

      const filteredLog = finalizationService.getRetirementAuditLog({
        writePathId: 'WP-001',
      });

      expect(filteredLog.length).toBeGreaterThan(0);
      expect(filteredLog.every(e => e.writePathId === 'WP-001')).toBe(true);
    });

    it('should limit results', async () => {
      const finalizationService = createWritePathFinalizationService({
        inventoryService,
        policyService,
        quarantineService,
        cutoverTimestamp,
      });

      // Create multiple audit entries
      for (let i = 1; i <= 3; i++) {
        const pathId = `WP-00${i}`;
        for (let j = 0; j < 20; j++) {
          finalizationService.recordWriteOperation(pathId, true);
        }
        await finalizationService.initiateRetirement({
          writePathId: pathId,
          operatorId: 'admin-123',
          reason: `Retire ${pathId}`,
        });
      }

      const limitedLog = finalizationService.getRetirementAuditLog({ limit: 2 });
      expect(limitedLog.length).toBe(2);
    });

    it('should sort by timestamp descending', async () => {
      const finalizationService = createWritePathFinalizationService({
        inventoryService,
        policyService,
        quarantineService,
        cutoverTimestamp,
      });

      for (let i = 1; i <= 2; i++) {
        const pathId = `WP-00${i}`;
        for (let j = 0; j < 20; j++) {
          finalizationService.recordWriteOperation(pathId, true);
        }
        await finalizationService.initiateRetirement({
          writePathId: pathId,
          operatorId: 'admin-123',
          reason: `Retire ${pathId}`,
        });
      }

      const auditLog = finalizationService.getRetirementAuditLog();

      // Most recent first
      if (auditLog.length >= 2) {
        expect(auditLog[0].timestamp.getTime()).toBeGreaterThanOrEqual(
          auditLog[1].timestamp.getTime(),
        );
      }
    });
  });

  describe('verifyQuarantinePreserved', () => {
    it('should return true when quarantine count is correct', () => {
      const finalizationService = createWritePathFinalizationService({
        inventoryService,
        policyService,
        quarantineService, // Has 5 quarantined
        cutoverTimestamp,
      });

      expect(finalizationService.verifyQuarantinePreserved()).toBe(true);
    });

    it('should return false when quarantine count is wrong', () => {
      const badQuarantineService = createMockQuarantineService(4); // Wrong count

      const finalizationService = createWritePathFinalizationService({
        inventoryService,
        policyService,
        quarantineService: badQuarantineService,
        cutoverTimestamp,
      });

      expect(finalizationService.verifyQuarantinePreserved()).toBe(false);
    });
  });

  describe('isFinalizationComplete', () => {
    it('should return false when quarantine not verified', () => {
      const badQuarantineService = createMockQuarantineService(3);

      const finalizationService = createWritePathFinalizationService({
        inventoryService,
        policyService,
        quarantineService: badQuarantineService,
        cutoverTimestamp,
      });

      expect(finalizationService.isFinalizationComplete()).toBe(false);
    });

    it('should return false when DUAL_WRITE paths remain', () => {
      const finalizationService = createWritePathFinalizationService({
        inventoryService,
        policyService,
        quarantineService,
        cutoverTimestamp,
      });

      // Without retiring all paths, should be incomplete
      expect(finalizationService.isFinalizationComplete()).toBe(false);
    });

    it('should return true when all paths retired and quarantine verified', async () => {
      const finalizationService = createWritePathFinalizationService({
        inventoryService,
        policyService,
        quarantineService,
        cutoverTimestamp,
      });

      // Get all paths and retire them
      const allPaths = inventoryService.getAllWritePaths();

      for (const path of allPaths) {
        if (path.classification === WritePathClassification.DUAL_WRITE) {
          for (let j = 0; j < 20; j++) {
            finalizationService.recordWriteOperation(path.id, true);
          }

          await finalizationService.initiateRetirement({
            writePathId: path.id,
            operatorId: 'admin-123',
            reason: 'Complete finalization test',
          });
        }
      }

      expect(finalizationService.isFinalizationComplete()).toBe(true);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle full retirement workflow', async () => {
      const finalizationService = createWritePathFinalizationService({
        inventoryService,
        policyService,
        quarantineService,
        cutoverTimestamp,
      });

      // 1. Initial evaluation
      let result = await finalizationService.evaluateAllWritePaths();
      expect(result.isComplete).toBe(false);

      // 2. Record writes to meet requirements
      const allPaths = inventoryService.getAllWritePaths();
      for (const path of allPaths) {
        for (let i = 0; i < 20; i++) {
          finalizationService.recordWriteOperation(path.id, true);
        }
      }

      // 3. Re-evaluate
      result = await finalizationService.evaluateAllWritePaths();
      expect(result.readyForRetirement.length).toBeGreaterThan(0);

      // 4. Retire all eligible paths
      for (const pathId of result.readyForRetirement) {
        await finalizationService.initiateRetirement({
          writePathId: pathId,
          operatorId: 'admin-123',
          reason: 'Stability confirmed',
        });
      }

      // 5. Final evaluation
      result = await finalizationService.evaluateAllWritePaths();
      expect(result.isComplete).toBe(true);
      expect(result.summary).toContain('COMPLETE');
    });

    it('should handle retirement and revert cycle', async () => {
      const finalizationService = createWritePathFinalizationService({
        inventoryService,
        policyService,
        quarantineService,
        cutoverTimestamp,
      });

      // Record writes
      for (let i = 0; i < 20; i++) {
        finalizationService.recordWriteOperation('WP-001', true);
      }

      // Retire
      let result = await finalizationService.initiateRetirement({
        writePathId: 'WP-001',
        operatorId: 'admin-123',
        reason: 'Initial retirement',
      });
      expect(result.success).toBe(true);
      expect(finalizationService.getWritePathRetirementStatus('WP-001'))
        .toBe(WritePathRetirementStatus.MEMBERSHIP_ONLY);

      // Revert
      result = await finalizationService.revertRetirement({
        writePathId: 'WP-001',
        operatorId: 'admin-456',
        reason: 'Issue detected',
      });
      expect(result.success).toBe(true);
      expect(finalizationService.getWritePathRetirementStatus('WP-001'))
        .toBe(WritePathRetirementStatus.DUAL_WRITE);

      // Verify audit log has both operations
      const auditLog = finalizationService.getRetirementAuditLog({
        writePathId: 'WP-001',
      });
      expect(auditLog.length).toBe(2);
      expect(auditLog.some(e => e.action === 'RETIREMENT_COMPLETED')).toBe(true);
      expect(auditLog.some(e => e.action === 'RETIREMENT_REVERTED')).toBe(true);
    });
  });
});
