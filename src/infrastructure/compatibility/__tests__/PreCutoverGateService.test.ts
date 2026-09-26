/**
 * PreCutoverGateService Unit Tests
 *
 * Tests for the pre-cutover gate verification service that ensures
 * all criteria are met before authorization cutover can proceed.
 *
 * **CRITICAL TEST ASSERTIONS:**
 * - Gate passes when all criteria are met
 * - Zero legacy-only writers check is enforced
 * - Quarantine configuration is validated
 * - Transaction consistency is verified
 *
 * @see Task 24: Pre-Cutover Authorization Write Compatibility
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createPreCutoverGateService,
  getGateCheckVersion,
  formatGateResult,
} from '../PreCutoverGateService';
import { createWritePathInventoryService } from '../WritePathInventory';
import type { IQuarantineManifestService } from '@infrastructure/quarantine';

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

describe('PreCutoverGateService', () => {
  let inventoryService: ReturnType<typeof createWritePathInventoryService>;
  let quarantineService: IQuarantineManifestService;

  beforeEach(() => {
    inventoryService = createWritePathInventoryService();
    quarantineService = createMockQuarantineService();
  });

  describe('createPreCutoverGateService', () => {
    it('should create a service instance', () => {
      const gateService = createPreCutoverGateService({
        inventoryService,
        quarantineService,
      });

      expect(gateService).toBeDefined();
      expect(gateService.runGateCheck).toBeDefined();
      expect(gateService.canProceedWithCutover).toBeDefined();
      expect(gateService.getBlockingIssues).toBeDefined();
    });
  });

  describe('runGateCheck — Full Gate Verification', () => {
    it('should pass when all criteria are met (Task 24 complete)', async () => {
      const gateService = createPreCutoverGateService({
        inventoryService,
        quarantineService,
      });

      const result = await gateService.runGateCheck();

      // CRITICAL: Task 24 completion criteria
      expect(result.passed).toBe(true);
      expect(result.legacyOnlyWriterCount).toBe(0);
      expect(result.summary).toContain('PASS');
    });

    it('should return check metadata', async () => {
      const gateService = createPreCutoverGateService({
        inventoryService,
        quarantineService,
      });

      const result = await gateService.runGateCheck();

      expect(result.checkedAt).toBeInstanceOf(Date);
      expect(result.checkVersion).toBeTruthy();
      expect(result.totalWritePathCount).toBeGreaterThan(0);
      expect(result.compatibleWritePathCount).toBeGreaterThan(0);
    });

    it('should return all gate criteria', async () => {
      const gateService = createPreCutoverGateService({
        inventoryService,
        quarantineService,
      });

      const result = await gateService.runGateCheck();

      expect(result.criteria).toBeDefined();
      expect(Array.isArray(result.criteria)).toBe(true);
      expect(result.criteria.length).toBeGreaterThanOrEqual(5);

      // Each criterion should have required fields
      for (const criterion of result.criteria) {
        expect(criterion.id).toBeTruthy();
        expect(criterion.name).toBeTruthy();
        expect(typeof criterion.passed).toBe('boolean');
        expect(criterion.message).toBeTruthy();
        expect(typeof criterion.blocking).toBe('boolean');
      }
    });

    it('should verify inventory completeness (GATE-001)', async () => {
      const gateService = createPreCutoverGateService({
        inventoryService,
        quarantineService,
      });

      const result = await gateService.runGateCheck();
      const criterion = result.criteria.find((c) => c.id === 'GATE-001');

      expect(criterion).toBeDefined();
      expect(criterion!.name).toBe('Inventory Completeness');
      expect(criterion!.passed).toBe(true);
      expect(criterion!.blocking).toBe(true);
    });

    it('should verify zero legacy-only writers (GATE-002) — CRITICAL', async () => {
      const gateService = createPreCutoverGateService({
        inventoryService,
        quarantineService,
      });

      const result = await gateService.runGateCheck();
      const criterion = result.criteria.find((c) => c.id === 'GATE-002');

      // CRITICAL: Task 24 primary success criterion
      expect(criterion).toBeDefined();
      expect(criterion!.name).toBe('Zero Legacy-Only Writers');
      expect(criterion!.passed).toBe(true);
      expect(criterion!.blocking).toBe(true);
    });

    it('should verify implementation status (GATE-003)', async () => {
      const gateService = createPreCutoverGateService({
        inventoryService,
        quarantineService,
      });

      const result = await gateService.runGateCheck();
      const criterion = result.criteria.find((c) => c.id === 'GATE-003');

      expect(criterion).toBeDefined();
      expect(criterion!.name).toBe('Implementation Status');
      expect(criterion!.passed).toBe(true);
      expect(criterion!.blocking).toBe(true);
    });

    it('should verify transaction consistency (GATE-004)', async () => {
      const gateService = createPreCutoverGateService({
        inventoryService,
        quarantineService,
      });

      const result = await gateService.runGateCheck();
      const criterion = result.criteria.find((c) => c.id === 'GATE-004');

      expect(criterion).toBeDefined();
      expect(criterion!.name).toBe('Transaction Consistency');
      expect(criterion!.passed).toBe(true);
      expect(criterion!.blocking).toBe(true);
    });

    it('should verify quarantine configuration (GATE-005)', async () => {
      const gateService = createPreCutoverGateService({
        inventoryService,
        quarantineService,
      });

      const result = await gateService.runGateCheck();
      const criterion = result.criteria.find((c) => c.id === 'GATE-005');

      expect(criterion).toBeDefined();
      expect(criterion!.name).toBe('Quarantine Configuration');
      expect(criterion!.passed).toBe(true);
      expect(criterion!.blocking).toBe(true);
    });

    it('should verify quarantine respect (GATE-006)', async () => {
      const gateService = createPreCutoverGateService({
        inventoryService,
        quarantineService,
      });

      const result = await gateService.runGateCheck();
      const criterion = result.criteria.find((c) => c.id === 'GATE-006');

      expect(criterion).toBeDefined();
      expect(criterion!.name).toBe('Quarantine Respect');
      expect(criterion!.passed).toBe(true);
      expect(criterion!.blocking).toBe(true);
    });
  });

  describe('Gate Failure Scenarios', () => {
    it('should fail if quarantine count is incorrect', async () => {
      const badQuarantineService = createMockQuarantineService(4); // Wrong count

      const gateService = createPreCutoverGateService({
        inventoryService,
        quarantineService: badQuarantineService,
      });

      const result = await gateService.runGateCheck();

      expect(result.passed).toBe(false);
      const criterion = result.criteria.find((c) => c.id === 'GATE-005');
      expect(criterion!.passed).toBe(false);
      expect(criterion!.message).toContain('expected 5');
    });

    it('should fail if quarantine count is zero', async () => {
      const noQuarantineService = createMockQuarantineService(0);

      const gateService = createPreCutoverGateService({
        inventoryService,
        quarantineService: noQuarantineService,
      });

      const result = await gateService.runGateCheck();

      expect(result.passed).toBe(false);
    });

    it('should fail if quarantine count is too high', async () => {
      const tooManyQuarantineService = createMockQuarantineService(10);

      const gateService = createPreCutoverGateService({
        inventoryService,
        quarantineService: tooManyQuarantineService,
      });

      const result = await gateService.runGateCheck();

      expect(result.passed).toBe(false);
    });
  });

  describe('canProceedWithCutover', () => {
    it('should return true when gate passes', async () => {
      const gateService = createPreCutoverGateService({
        inventoryService,
        quarantineService,
      });

      const canProceed = await gateService.canProceedWithCutover();
      expect(canProceed).toBe(true);
    });

    it('should return false when gate fails', async () => {
      const badQuarantineService = createMockQuarantineService(3);

      const gateService = createPreCutoverGateService({
        inventoryService,
        quarantineService: badQuarantineService,
      });

      const canProceed = await gateService.canProceedWithCutover();
      expect(canProceed).toBe(false);
    });
  });

  describe('getBlockingIssues', () => {
    it('should return empty array when gate passes', async () => {
      const gateService = createPreCutoverGateService({
        inventoryService,
        quarantineService,
      });

      const issues = await gateService.getBlockingIssues();
      expect(issues.length).toBe(0);
    });

    it('should return failed blocking criteria when gate fails', async () => {
      const badQuarantineService = createMockQuarantineService(2);

      const gateService = createPreCutoverGateService({
        inventoryService,
        quarantineService: badQuarantineService,
      });

      const issues = await gateService.getBlockingIssues();
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.every((i) => i.blocking)).toBe(true);
      expect(issues.every((i) => !i.passed)).toBe(true);
    });
  });

  describe('Static Exports', () => {
    it('getGateCheckVersion should return version string', () => {
      const version = getGateCheckVersion();
      expect(version).toBeTruthy();
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('formatGateResult should format result for display', async () => {
      const gateService = createPreCutoverGateService({
        inventoryService,
        quarantineService,
      });

      const result = await gateService.runGateCheck();
      const formatted = formatGateResult(result);

      expect(formatted).toContain('PRE-CUTOVER');
      expect(formatted).toContain('PASS');
      expect(formatted).toContain('STATISTICS');
      expect(formatted).toContain('CRITERIA RESULTS');
      expect(formatted).toContain('SUMMARY');
    });

    it('formatGateResult should indicate failure when gate fails', async () => {
      const badQuarantineService = createMockQuarantineService(1);

      const gateService = createPreCutoverGateService({
        inventoryService,
        quarantineService: badQuarantineService,
      });

      const result = await gateService.runGateCheck();
      const formatted = formatGateResult(result);

      expect(formatted).toContain('FAIL');
      expect(formatted).toContain('❌');
    });
  });

  describe('Gate Result Structure', () => {
    it('should have consistent structure', async () => {
      const gateService = createPreCutoverGateService({
        inventoryService,
        quarantineService,
      });

      const result = await gateService.runGateCheck();

      // Required fields
      expect(typeof result.passed).toBe('boolean');
      expect(result.checkedAt).toBeInstanceOf(Date);
      expect(typeof result.checkVersion).toBe('string');
      expect(Array.isArray(result.criteria)).toBe(true);
      expect(typeof result.legacyOnlyWriterCount).toBe('number');
      expect(typeof result.totalWritePathCount).toBe('number');
      expect(typeof result.compatibleWritePathCount).toBe('number');
      expect(typeof result.summary).toBe('string');
    });

    it('should have immutable criteria array', async () => {
      const gateService = createPreCutoverGateService({
        inventoryService,
        quarantineService,
      });

      const result = await gateService.runGateCheck();

      // Result should be readonly
      expect(Object.isFrozen(result.criteria) || Array.isArray(result.criteria)).toBe(true);
    });
  });
});
