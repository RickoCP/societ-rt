/**
 * WritePathInventory Unit Tests
 *
 * Tests for the write path inventory service that tracks all
 * authorization-affecting write operations.
 *
 * **CRITICAL TEST ASSERTIONS:**
 * - All write paths are inventoried
 * - Zero legacy-only writers exist
 * - All paths have complete information
 * - Summary statistics are accurate
 *
 * @see Task 24: Pre-Cutover Authorization Write Compatibility
 */

import { describe, it, expect } from 'vitest';
import {
  createWritePathInventoryService,
  getWritePathInventory,
  WRITE_PATH_COUNT,
} from '../WritePathInventory';
import {
  WritePathClassification,
  AuthWriteCategory,
  WritePathStatus,
} from '../types';

describe('WritePathInventory', () => {
  describe('createWritePathInventoryService', () => {
    it('should create a service instance', () => {
      const service = createWritePathInventoryService();
      expect(service).toBeDefined();
      expect(service.getAllWritePaths).toBeDefined();
      expect(service.getLegacyOnlyWritePaths).toBeDefined();
      expect(service.hasLegacyOnlyWritePaths).toBeDefined();
      expect(service.getInventorySummary).toBeDefined();
    });
  });

  describe('getAllWritePaths', () => {
    const service = createWritePathInventoryService();

    it('should return all inventoried write paths', () => {
      const paths = service.getAllWritePaths();
      expect(paths).toBeDefined();
      expect(Array.isArray(paths)).toBe(true);
      expect(paths.length).toBeGreaterThan(0);
    });

    it('should return immutable array', () => {
      const paths1 = service.getAllWritePaths();
      const paths2 = service.getAllWritePaths();
      expect(paths1).toBe(paths2); // Same reference
    });

    it('should include all required categories', () => {
      const paths = service.getAllWritePaths();
      const categories = new Set(paths.map((p) => p.category));

      // At minimum, should have user creation and role assignment
      expect(categories.has(AuthWriteCategory.USER_CREATION)).toBe(true);
      expect(categories.has(AuthWriteCategory.ROLE_ASSIGNMENT)).toBe(true);
    });

    it('should have complete information for each path', () => {
      const paths = service.getAllWritePaths();

      for (const path of paths) {
        expect(path.id).toBeTruthy();
        expect(path.name).toBeTruthy();
        expect(path.location).toBeTruthy();
        expect(path.category).toBeDefined();
        expect(path.classification).toBeDefined();
        expect(path.status).toBeDefined();
        expect(path.affectedFields).toBeDefined();
        expect(Array.isArray(path.affectedFields)).toBe(true);
        expect(typeof path.respectsQuarantine).toBe('boolean');
        expect(typeof path.usesAtomicTransaction).toBe('boolean');
      }
    });
  });

  describe('getLegacyOnlyWritePaths — CRITICAL', () => {
    const service = createWritePathInventoryService();

    it('should return ZERO legacy-only write paths (Task 24 requirement)', () => {
      const legacyOnly = service.getLegacyOnlyWritePaths();

      // CRITICAL: This assertion enforces Task 24 completion criteria
      expect(legacyOnly.length).toBe(0);
    });

    it('should return empty array when no legacy-only paths exist', () => {
      const legacyOnly = service.getLegacyOnlyWritePaths();
      expect(Array.isArray(legacyOnly)).toBe(true);
    });
  });

  describe('hasLegacyOnlyWritePaths — CRITICAL', () => {
    const service = createWritePathInventoryService();

    it('should return false when Task 24 is complete', () => {
      // CRITICAL: This assertion enforces Task 24 completion criteria
      expect(service.hasLegacyOnlyWritePaths()).toBe(false);
    });
  });

  describe('getWritePathsByCategory', () => {
    const service = createWritePathInventoryService();

    it('should filter paths by USER_CREATION category', () => {
      const paths = service.getWritePathsByCategory(AuthWriteCategory.USER_CREATION);
      expect(paths.length).toBeGreaterThan(0);
      expect(paths.every((p) => p.category === AuthWriteCategory.USER_CREATION)).toBe(
        true,
      );
    });

    it('should filter paths by ROLE_ASSIGNMENT category', () => {
      const paths = service.getWritePathsByCategory(AuthWriteCategory.ROLE_ASSIGNMENT);
      expect(paths.length).toBeGreaterThan(0);
      expect(paths.every((p) => p.category === AuthWriteCategory.ROLE_ASSIGNMENT)).toBe(
        true,
      );
    });

    it('should filter paths by MEMBERSHIP_CRUD category', () => {
      const paths = service.getWritePathsByCategory(AuthWriteCategory.MEMBERSHIP_CRUD);
      expect(paths.length).toBeGreaterThan(0);
      expect(paths.every((p) => p.category === AuthWriteCategory.MEMBERSHIP_CRUD)).toBe(
        true,
      );
    });

    it('should return empty array for non-existent category', () => {
      const paths = service.getWritePathsByCategory(
        AuthWriteCategory.USER_TENANTID_WRITE,
      );
      // May be empty if no direct tenantId writes exist
      expect(Array.isArray(paths)).toBe(true);
    });
  });

  describe('getWritePathsByClassification', () => {
    const service = createWritePathInventoryService();

    it('should filter paths by MEMBERSHIP_AUTHORITATIVE classification', () => {
      const paths = service.getWritePathsByClassification(
        WritePathClassification.MEMBERSHIP_AUTHORITATIVE,
      );
      expect(paths.every((p) => p.classification === WritePathClassification.MEMBERSHIP_AUTHORITATIVE)).toBe(
        true,
      );
    });

    it('should filter paths by DUAL_WRITE classification', () => {
      const paths = service.getWritePathsByClassification(WritePathClassification.DUAL_WRITE);
      expect(paths.length).toBeGreaterThan(0);
      expect(paths.every((p) => p.classification === WritePathClassification.DUAL_WRITE)).toBe(
        true,
      );
    });

    it('should return empty array for LEGACY_ONLY classification (Task 24 complete)', () => {
      const paths = service.getWritePathsByClassification(WritePathClassification.LEGACY_ONLY);
      // CRITICAL: Should be empty when Task 24 is complete
      expect(paths.length).toBe(0);
    });
  });

  describe('getInventorySummary', () => {
    const service = createWritePathInventoryService();

    it('should return summary with correct total count', () => {
      const summary = service.getInventorySummary();
      const allPaths = service.getAllWritePaths();
      expect(summary.total).toBe(allPaths.length);
    });

    it('should return summary with zero legacy-only count', () => {
      const summary = service.getInventorySummary();
      // CRITICAL: Task 24 completion criteria
      expect(summary.legacyOnlyCount).toBe(0);
    });

    it('should indicate cutover ready status', () => {
      const summary = service.getInventorySummary();
      // CRITICAL: Task 24 completion criteria
      expect(summary.cutoverReady).toBe(true);
    });

    it('should have valid byClassification counts', () => {
      const summary = service.getInventorySummary();
      const total =
        summary.byClassification[WritePathClassification.MEMBERSHIP_AUTHORITATIVE] +
        summary.byClassification[WritePathClassification.DUAL_WRITE] +
        summary.byClassification[WritePathClassification.LEGACY_ONLY] +
        summary.byClassification[WritePathClassification.DISABLED];
      expect(total).toBe(summary.total);
    });

    it('should have valid byCategory counts', () => {
      const summary = service.getInventorySummary();
      let total = 0;
      for (const category of Object.values(AuthWriteCategory)) {
        total += summary.byCategory[category] || 0;
      }
      expect(total).toBe(summary.total);
    });

    it('should have valid byStatus counts', () => {
      const summary = service.getInventorySummary();
      let total = 0;
      for (const status of Object.values(WritePathStatus)) {
        total += summary.byStatus[status] || 0;
      }
      expect(total).toBe(summary.total);
    });
  });

  describe('Static Exports', () => {
    it('getWritePathInventory should return same data as service', () => {
      const staticPaths = getWritePathInventory();
      const service = createWritePathInventoryService();
      const servicePaths = service.getAllWritePaths();
      expect(staticPaths).toEqual(servicePaths);
    });

    it('WRITE_PATH_COUNT should match inventory length', () => {
      const paths = getWritePathInventory();
      expect(WRITE_PATH_COUNT).toBe(paths.length);
    });
  });

  describe('Write Path Data Integrity', () => {
    const paths = getWritePathInventory();

    it('should have unique IDs for all paths', () => {
      const ids = paths.map((p) => p.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have WP-prefixed IDs', () => {
      for (const path of paths) {
        expect(path.id).toMatch(/^WP-\d{3}$/);
      }
    });

    it('all DUAL_WRITE paths should use atomic transactions', () => {
      const dualWrite = paths.filter(
        (p) => p.classification === WritePathClassification.DUAL_WRITE,
      );
      expect(dualWrite.length).toBeGreaterThan(0);
      expect(dualWrite.every((p) => p.usesAtomicTransaction)).toBe(true);
    });

    it('all paths modifying Membership should respect quarantine', () => {
      const membershipPaths = paths.filter(
        (p) =>
          p.category === AuthWriteCategory.MEMBERSHIP_CRUD ||
          p.category === AuthWriteCategory.ROLE_ASSIGNMENT,
      );
      expect(membershipPaths.every((p) => p.respectsQuarantine)).toBe(true);
    });

    it('all paths should have at least one affected field', () => {
      for (const path of paths) {
        expect(path.affectedFields.length).toBeGreaterThan(0);
      }
    });
  });
});
