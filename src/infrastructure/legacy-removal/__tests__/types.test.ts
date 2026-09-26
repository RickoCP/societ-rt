/**
 * Types Tests — Unit tests for legacy-removal types and constants.
 *
 * @see Task 35: Code Path Analysis and Update
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_DEPRECATION_CONFIG,
  DEFAULT_ANALYSIS_OPTIONS,
  DEFAULT_VALIDATION_OPTIONS,
  DEFAULT_REPORT_OPTIONS,
  LEGACY_REMOVAL_SERVICE_VERSION,
  LegacyRemovalError,
} from '../types';

describe('Legacy Removal Types', () => {
  describe('DEFAULT_DEPRECATION_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_DEPRECATION_CONFIG.logWarnings).toBe(true);
      expect(DEFAULT_DEPRECATION_CONFIG.throwErrors).toBe(false);
      expect(DEFAULT_DEPRECATION_CONFIG.maxWarningsPerMinute).toBe(10);
      expect(DEFAULT_DEPRECATION_CONFIG.includeCallStack).toBe(true);
    });

    it('should exclude test files by default', () => {
      expect(DEFAULT_DEPRECATION_CONFIG.excludePatterns).toContain(
        '**/*.test.ts',
      );
      expect(DEFAULT_DEPRECATION_CONFIG.excludePatterns).toContain(
        '**/*.spec.ts',
      );
      expect(DEFAULT_DEPRECATION_CONFIG.excludePatterns).toContain('**/test/**');
      expect(DEFAULT_DEPRECATION_CONFIG.excludePatterns).toContain(
        '**/__tests__/**',
      );
    });
  });

  describe('DEFAULT_ANALYSIS_OPTIONS', () => {
    it('should include src directory by default', () => {
      expect(DEFAULT_ANALYSIS_OPTIONS.includePaths).toContain('src');
    });

    it('should exclude node_modules and build artifacts', () => {
      expect(DEFAULT_ANALYSIS_OPTIONS.excludePatterns).toContain('node_modules');
      expect(DEFAULT_ANALYSIS_OPTIONS.excludePatterns).toContain('dist');
      expect(DEFAULT_ANALYSIS_OPTIONS.excludePatterns).toContain('.next');
      expect(DEFAULT_ANALYSIS_OPTIONS.excludePatterns).toContain('coverage');
    });

    it('should not include tests by default', () => {
      expect(DEFAULT_ANALYSIS_OPTIONS.includeTests).toBe(false);
    });

    it('should have reasonable max depth', () => {
      expect(DEFAULT_ANALYSIS_OPTIONS.maxDepth).toBe(10);
    });
  });

  describe('DEFAULT_VALIDATION_OPTIONS', () => {
    it('should validate API routes by default', () => {
      expect(DEFAULT_VALIDATION_OPTIONS.routeDirectories).toContain(
        'src/app/api',
      );
      expect(DEFAULT_VALIDATION_OPTIONS.apiRoutesOnly).toBe(true);
    });

    it('should exclude test files', () => {
      expect(DEFAULT_VALIDATION_OPTIONS.excludePatterns).toContain(
        '**/*.test.ts',
      );
      expect(DEFAULT_VALIDATION_OPTIONS.excludePatterns).toContain(
        '**/*.spec.ts',
      );
    });
  });

  describe('DEFAULT_REPORT_OPTIONS', () => {
    it('should include all report sections by default', () => {
      expect(DEFAULT_REPORT_OPTIONS.includeCodeSnippets).toBe(true);
      expect(DEFAULT_REPORT_OPTIONS.includeRecommendations).toBe(true);
      expect(DEFAULT_REPORT_OPTIONS.includeFileSummaries).toBe(true);
    });
  });

  describe('LEGACY_REMOVAL_SERVICE_VERSION', () => {
    it('should be a valid semver string', () => {
      expect(LEGACY_REMOVAL_SERVICE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('LegacyRemovalError', () => {
    it('should create error with code and message', () => {
      const error = new LegacyRemovalError(
        'ANALYSIS_FAILED',
        'Failed to analyze code paths',
      );

      expect(error.name).toBe('LegacyRemovalError');
      expect(error.code).toBe('ANALYSIS_FAILED');
      expect(error.message).toBe('Failed to analyze code paths');
      expect(error.details).toBeUndefined();
    });

    it('should create error with details', () => {
      const error = new LegacyRemovalError(
        'FILE_NOT_FOUND',
        'File not found',
        { filePath: '/test/file.ts' },
      );

      expect(error.code).toBe('FILE_NOT_FOUND');
      expect(error.details).toEqual({ filePath: '/test/file.ts' });
    });

    it('should be instanceof Error', () => {
      const error = new LegacyRemovalError('PARSE_ERROR', 'Parse error');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(LegacyRemovalError);
    });

    it('should support all error codes', () => {
      const codes = [
        'ANALYSIS_FAILED',
        'VALIDATION_FAILED',
        'REPORT_GENERATION_FAILED',
        'INVALID_CONFIGURATION',
        'FILE_NOT_FOUND',
        'PARSE_ERROR',
      ] as const;

      for (const code of codes) {
        const error = new LegacyRemovalError(code, `Test error: ${code}`);
        expect(error.code).toBe(code);
      }
    });
  });
});
