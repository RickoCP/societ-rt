/**
 * Unit Tests: RLS Session Context Service
 *
 * Tests for FASE 1.12 Task 30: RLS Policy Implementation
 *
 * @see Requirement 10: PostgreSQL Row-Level Security Foundation (AC 2, 7)
 * @see Requirement 60: RLS Connection Pool Safety & Coverage Enforcement (AC 1-3)
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  createRlsSessionContextService,
  getSetRlsContextSql,
  getClearRlsContextSql,
  getCurrentRlsContextSql,
  validateRlsTenantId,
  getRlsSessionVariableName,
} from '../RlsSessionContext';
import { RlsError, RLS_SESSION_VARIABLE } from '../types';

// ---------------------------------------------------------------------------
// Test Constants
// ---------------------------------------------------------------------------

const VALID_TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_TENANT_ID_UPPERCASE = '550E8400-E29B-41D4-A716-446655440000';

const INVALID_TENANT_IDS = [
  '',
  '   ',
  'not-a-uuid',
  '550e8400-e29b-41d4-a716',  // Too short
  '550e8400-e29b-41d4-a716-4466554400000',  // Too long
  '550e8400-e29b-41d4-a716-44665544000g',  // Invalid character
  'null',
  'undefined',
];

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('RlsSessionContextService', () => {
  let service: ReturnType<typeof createRlsSessionContextService>;

  beforeEach(() => {
    service = createRlsSessionContextService();
  });

  // -------------------------------------------------------------------------
  // Set Context SQL Tests
  // -------------------------------------------------------------------------

  describe('getSetContextSql', () => {
    it('should generate SET LOCAL SQL for valid tenant ID', () => {
      const sql = service.getSetContextSql(VALID_TENANT_ID);

      expect(sql).toContain('SET LOCAL');
      expect(sql).toContain(RLS_SESSION_VARIABLE);
      expect(sql).toContain(VALID_TENANT_ID);
    });

    it('should use SET LOCAL (not SET) for transaction scoping', () => {
      const sql = service.getSetContextSql(VALID_TENANT_ID);

      // Must be SET LOCAL, not just SET
      expect(sql).toMatch(/SET LOCAL/);
    });

    it('should quote the session variable name', () => {
      const sql = service.getSetContextSql(VALID_TENANT_ID);

      expect(sql).toContain(`"${RLS_SESSION_VARIABLE}"`);
    });

    it('should quote the tenant ID value', () => {
      const sql = service.getSetContextSql(VALID_TENANT_ID);

      expect(sql).toContain(`'${VALID_TENANT_ID}'`);
    });

    it('should accept uppercase UUIDs', () => {
      const sql = service.getSetContextSql(VALID_TENANT_ID_UPPERCASE);

      expect(sql).toContain(VALID_TENANT_ID_UPPERCASE);
    });

    it.each(INVALID_TENANT_IDS)(
      'should throw RlsError for invalid tenant ID: %s',
      (invalidId) => {
        expect(() => service.getSetContextSql(invalidId)).toThrow(RlsError);

        try {
          service.getSetContextSql(invalidId);
        } catch (error) {
          expect((error as RlsError).code).toBe('RLS_INVALID_TENANT_ID');
        }
      },
    );

    it('should end with semicolon', () => {
      const sql = service.getSetContextSql(VALID_TENANT_ID);

      expect(sql).toMatch(/;$/);
    });
  });

  // -------------------------------------------------------------------------
  // Clear Context SQL Tests
  // -------------------------------------------------------------------------

  describe('getClearContextSql', () => {
    it('should generate RESET SQL', () => {
      const sql = service.getClearContextSql();

      expect(sql).toContain('RESET');
      expect(sql).toContain(RLS_SESSION_VARIABLE);
    });

    it('should end with semicolon', () => {
      const sql = service.getClearContextSql();

      expect(sql).toMatch(/;$/);
    });
  });

  // -------------------------------------------------------------------------
  // Get Context SQL Tests
  // -------------------------------------------------------------------------

  describe('getContextSql', () => {
    it('should generate SELECT with current_setting', () => {
      const sql = service.getContextSql();

      expect(sql).toContain('SELECT');
      expect(sql).toContain('current_setting');
      expect(sql).toContain(RLS_SESSION_VARIABLE);
    });

    it('should use missing_ok parameter', () => {
      const sql = service.getContextSql();

      // current_setting('name', true) - second param is missing_ok
      expect(sql).toContain(', true');
    });

    it('should alias result as current_tenant_id', () => {
      const sql = service.getContextSql();

      expect(sql).toContain('AS current_tenant_id');
    });
  });

  // -------------------------------------------------------------------------
  // Validate Tenant ID Tests
  // -------------------------------------------------------------------------

  describe('validateTenantId', () => {
    it('should return true for valid UUID', () => {
      expect(service.validateTenantId(VALID_TENANT_ID)).toBe(true);
    });

    it('should return true for uppercase UUID', () => {
      expect(service.validateTenantId(VALID_TENANT_ID_UPPERCASE)).toBe(true);
    });

    it.each(INVALID_TENANT_IDS)(
      'should return false for invalid tenant ID: %s',
      (invalidId) => {
        expect(service.validateTenantId(invalidId)).toBe(false);
      },
    );

    it('should validate different UUID versions', () => {
      // UUID v1
      expect(service.validateTenantId('f47ac10b-58cc-11e8-b8e0-0800200c9a66')).toBe(true);
      // UUID v4
      expect(service.validateTenantId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      // UUID v5
      expect(service.validateTenantId('f0e1d2c3-b4a5-5968-8776-655443322110')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Session Variable Name Tests
  // -------------------------------------------------------------------------

  describe('getSessionVariableName', () => {
    it('should return the standard session variable name', () => {
      const name = service.getSessionVariableName();

      expect(name).toBe('app.current_tenant_id');
      expect(name).toBe(RLS_SESSION_VARIABLE);
    });
  });

  // -------------------------------------------------------------------------
  // Wrap Query Tests
  // -------------------------------------------------------------------------

  describe('wrapQueryWithContext', () => {
    it('should wrap query in transaction with SET LOCAL', () => {
      const query = 'SELECT * FROM memberships';
      const wrapped = service.wrapQueryWithContext(VALID_TENANT_ID, query);

      expect(wrapped).toContain('BEGIN');
      expect(wrapped).toContain('SET LOCAL');
      expect(wrapped).toContain(query);
      expect(wrapped).toContain('COMMIT');
    });

    it('should set context before query', () => {
      const query = 'SELECT * FROM memberships';
      const wrapped = service.wrapQueryWithContext(VALID_TENANT_ID, query);

      const setIndex = wrapped.indexOf('SET LOCAL');
      const queryIndex = wrapped.indexOf(query);

      expect(setIndex).toBeLessThan(queryIndex);
    });

    it('should throw for invalid tenant ID', () => {
      expect(() =>
        service.wrapQueryWithContext('invalid', 'SELECT 1'),
      ).toThrow(RlsError);
    });
  });

  // -------------------------------------------------------------------------
  // Convenience Function Tests
  // -------------------------------------------------------------------------

  describe('convenience functions', () => {
    it('getSetRlsContextSql should work', () => {
      const sql = getSetRlsContextSql(VALID_TENANT_ID);
      expect(sql).toContain('SET LOCAL');
    });

    it('getClearRlsContextSql should work', () => {
      const sql = getClearRlsContextSql();
      expect(sql).toContain('RESET');
    });

    it('getCurrentRlsContextSql should work', () => {
      const sql = getCurrentRlsContextSql();
      expect(sql).toContain('current_setting');
    });

    it('validateRlsTenantId should work', () => {
      expect(validateRlsTenantId(VALID_TENANT_ID)).toBe(true);
      expect(validateRlsTenantId('invalid')).toBe(false);
    });

    it('getRlsSessionVariableName should work', () => {
      expect(getRlsSessionVariableName()).toBe(RLS_SESSION_VARIABLE);
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 10 Compliance Tests
  // -------------------------------------------------------------------------

  describe('Requirement 10 compliance', () => {
    it('AC 2: Uses session variable app.current_tenant_id', () => {
      expect(service.getSessionVariableName()).toBe('app.current_tenant_id');
    });

    it('AC 7: Fail closed design (validates tenant ID)', () => {
      // Empty/invalid tenant ID throws error
      expect(() => service.getSetContextSql('')).toThrow();
      expect(() => service.getSetContextSql('invalid')).toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 60 Compliance Tests
  // -------------------------------------------------------------------------

  describe('Requirement 60 compliance', () => {
    it('AC 1: Uses SET LOCAL (transaction-scoped)', () => {
      const sql = service.getSetContextSql(VALID_TENANT_ID);

      // MUST use SET LOCAL, not SET
      expect(sql).toMatch(/SET LOCAL/);
      expect(sql).not.toMatch(/^SET\s+"/);  // Should not be just SET "
    });

    it('AC 2: Provides clear context SQL', () => {
      const sql = service.getClearContextSql();

      expect(sql).toContain('RESET');
    });

    it('generates SQL suitable for Prisma $executeRawUnsafe', () => {
      const setSql = service.getSetContextSql(VALID_TENANT_ID);
      const clearSql = service.getClearContextSql();

      // Should be single statements executable with $executeRawUnsafe
      expect(setSql.split(';').filter((s) => s.trim()).length).toBe(1);
      expect(clearSql.split(';').filter((s) => s.trim()).length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // SQL Injection Prevention Tests
  // -------------------------------------------------------------------------

  describe('SQL injection prevention', () => {
    it('should only accept valid UUIDs (no injection possible)', () => {
      const maliciousInputs = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "550e8400-e29b-41d4-a716-446655440000'; --",
        '\'; DELETE FROM memberships; --',
      ];

      for (const input of maliciousInputs) {
        expect(() => service.getSetContextSql(input)).toThrow(RlsError);
      }
    });

    it('valid UUID format strictly enforced', () => {
      // The UUID regex is strict - no extra characters allowed
      expect(service.validateTenantId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(service.validateTenantId('550e8400-e29b-41d4-a716-446655440000 ')).toBe(false);
      expect(service.validateTenantId(' 550e8400-e29b-41d4-a716-446655440000')).toBe(false);
    });
  });
});
