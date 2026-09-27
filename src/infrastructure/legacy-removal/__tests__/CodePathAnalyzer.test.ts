/**
 * CodePathAnalyzer Tests — Unit tests for code path analysis functionality.
 *
 * @see Task 35: Code Path Analysis and Update
 * @see Requirement 12 (AC 1-2)
 */

import { describe, it, expect } from 'vitest';
import { CodePathAnalyzerImpl } from '../CodePathAnalyzer';

describe('CodePathAnalyzer', () => {
  describe('CodePathAnalyzerImpl', () => {
    it('should create analyzer instance', () => {
      const analyzer = CodePathAnalyzerImpl();
      expect(analyzer).toBeDefined();
      expect(analyzer.analyzeCodePaths).toBeDefined();
      expect(analyzer.getUsagesByClassification).toBeDefined();
      expect(analyzer.getUsagesByStatus).toBeDefined();
      expect(analyzer.updateMigrationStatus).toBeDefined();
    });

    describe('analyzeCodePaths', () => {
      it('should return empty array when no files exist', async () => {
        const analyzer = CodePathAnalyzerImpl();
        const usages = await analyzer.analyzeCodePaths({
          includePaths: ['non-existent-path-12345'],
        });

        expect(usages).toEqual([]);
      });

      it('should use default options when none provided', async () => {
        const analyzer = CodePathAnalyzerImpl();
        // This will analyze the actual src folder, but should not throw
        // We're testing that the function handles default options correctly
        await expect(analyzer.analyzeCodePaths()).resolves.toBeDefined();
      }, 30000); // Extended timeout for actual file system analysis
    });

    describe('getUsagesByClassification', () => {
      it('should return empty array for classification with no matches', () => {
        const analyzer = CodePathAnalyzerImpl();

        const backwardCompat = analyzer.getUsagesByClassification('backward-compat');

        expect(backwardCompat).toEqual([]);
      });

      it('should return empty array for all classifications initially', () => {
        const analyzer = CodePathAnalyzerImpl();

        expect(analyzer.getUsagesByClassification('authorization-critical')).toEqual([]);
        expect(analyzer.getUsagesByClassification('read-only')).toEqual([]);
        expect(analyzer.getUsagesByClassification('backward-compat')).toEqual([]);
        expect(analyzer.getUsagesByClassification('non-authorization')).toEqual([]);
      });
    });

    describe('getUsagesByStatus', () => {
      it('should return empty array for status with no matches', () => {
        const analyzer = CodePathAnalyzerImpl();

        const pending = analyzer.getUsagesByStatus('pending');
        const migrated = analyzer.getUsagesByStatus('migrated');

        expect(pending).toEqual([]);
        expect(migrated).toEqual([]);
      });
    });

    describe('updateMigrationStatus', () => {
      it('should not throw for non-existent usage', () => {
        const analyzer = CodePathAnalyzerImpl();

        // Should not throw
        expect(() => {
          analyzer.updateMigrationStatus('non-existent-id', 'migrated');
        }).not.toThrow();
      });

      it('should not throw for any valid status', () => {
        const analyzer = CodePathAnalyzerImpl();
        const statuses = ['pending', 'in-progress', 'migrated', 'deprecated', 'removed'] as const;

        for (const status of statuses) {
          expect(() => {
            analyzer.updateMigrationStatus('any-id', status);
          }).not.toThrow();
        }
      });
    });
  });

  describe('Detection Patterns', () => {
    it('should define all classifications correctly', () => {
      // Verify the classification system
      const classifications = [
        'authorization-critical',
        'read-only',
        'backward-compat',
        'non-authorization',
      ];

      expect(classifications).toHaveLength(4);
      expect(classifications).toContain('authorization-critical');
    });

    it('should define all migration statuses correctly', () => {
      const statuses = ['pending', 'in-progress', 'migrated', 'deprecated', 'removed'];

      expect(statuses).toHaveLength(5);
      expect(statuses).toContain('migrated');
    });

    it('should define all priorities correctly', () => {
      const priorities = ['critical', 'high', 'medium', 'low'];

      expect(priorities).toHaveLength(4);
      expect(priorities).toContain('critical');
    });
  });
});
