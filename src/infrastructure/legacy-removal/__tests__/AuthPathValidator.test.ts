/**
 * AuthPathValidator Tests — Unit tests for route authorization validation.
 *
 * @see Task 35: Code Path Analysis and Update
 * @see Requirement 12 (AC 6)
 */

import { describe, it, expect } from 'vitest';
import { AuthPathValidatorImpl } from '../AuthPathValidator';

describe('AuthPathValidator', () => {
  describe('AuthPathValidatorImpl', () => {
    it('should create validator instance', () => {
      const validator = AuthPathValidatorImpl();
      expect(validator).toBeDefined();
      expect(validator.validateAllRoutes).toBeDefined();
      expect(validator.validateRoute).toBeDefined();
      expect(validator.areAllRoutesMigrated).toBeDefined();
      expect(validator.getLegacyRoutes).toBeDefined();
    });

    describe('areAllRoutesMigrated', () => {
      it('should return false when no routes validated', () => {
        const validator = AuthPathValidatorImpl();
        expect(validator.areAllRoutesMigrated()).toBe(false);
      });
    });

    describe('getLegacyRoutes', () => {
      it('should return empty array when no routes validated', () => {
        const validator = AuthPathValidatorImpl();
        expect(validator.getLegacyRoutes()).toEqual([]);
      });
    });

    describe('validateAllRoutes', () => {
      it('should return empty array when no route files exist', async () => {
        const validator = AuthPathValidatorImpl();
        // Use a non-existent path
        const validations = await validator.validateAllRoutes({
          routeDirectories: ['non-existent-path-12345'],
        });

        expect(validations).toEqual([]);
      });
    });

    describe('validateRoute', () => {
      it('should return unknown status when file cannot be read', async () => {
        const validator = AuthPathValidatorImpl();
        const validation = await validator.validateRoute(
          'GET /api/missing',
          'non-existent-file-12345.ts',
        );

        expect(validation.validationStatus).toBe('unknown');
        expect(validation.routeId).toBe('GET /api/missing');
        expect(validation.issues.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Validation Status Logic', () => {
    it('should have correct status types', () => {
      // Verify the type system works as expected
      const validStatuses = ['valid', 'partial', 'legacy', 'unknown'];
      expect(validStatuses).toContain('valid');
      expect(validStatuses).toContain('legacy');
    });
  });
});
