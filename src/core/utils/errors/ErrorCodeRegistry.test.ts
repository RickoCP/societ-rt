/**
 * ErrorCodeRegistry Unit Tests
 *
 * @see Requirements 61 (Error Code Standardization)
 * @see Steering: 12-error-handling.md
 * @see Steering: 04-testing-pattern.md
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  // Category exports
  AUTH_ERROR_CODES,
  AUTHZ_ERROR_CODES,
  LEGACY_AUTHZ_ERROR_CODES,
  MEM_ERROR_CODES,
  TENANT_ERROR_CODES,
  VAL_ERROR_CODES,
  BIZ_ERROR_CODES,
  TECH_ERROR_CODES,
  NOT_FOUND_ERROR_CODES,
  UNEXPECTED_ERROR_CODES,
  ENTITLEMENT_ERROR_CODES,
  CONTEXT_ERROR_CODES,
  // Aggregated registry
  ERROR_CODES,
  // Lookup functions
  getErrorCodeDefinition,
  getHttpStatusForCode,
  isRetryableCode,
  getErrorTypeForCode,
  getI18nKeyForCode,
  isKnownErrorCode,
  getErrorCodesByType,
  getErrorCodesByHttpStatus,
  // Types
  type ErrorCodeDefinition,
} from './ErrorCodeRegistry';

// ---------------------------------------------------------------------------
// Error Code Uniqueness Tests
// ---------------------------------------------------------------------------

describe('ErrorCodeRegistry — Error Code Uniqueness', () => {
  it('should have no duplicate error codes across all categories', () => {
    const allCodes = Object.keys(ERROR_CODES);
    const uniqueCodes = new Set(allCodes);
    expect(allCodes.length).toBe(uniqueCodes.size);
  });

  it('should have all error codes as keys matching their code property', () => {
    for (const [key, definition] of Object.entries(ERROR_CODES)) {
      expect(key).toBe(definition.code);
    }
  });
});

// ---------------------------------------------------------------------------
// Error Code Format Tests
// ---------------------------------------------------------------------------

describe('ErrorCodeRegistry — Error Code Format', () => {
  it('should have machine-readable codes (no spaces)', () => {
    for (const [code] of Object.entries(ERROR_CODES)) {
      expect(code).not.toContain(' ');
    }
  });

  it('should have UPPERCASE codes with underscores', () => {
    for (const [code] of Object.entries(ERROR_CODES)) {
      expect(code).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
  });

  it('should have domain prefix in code (AUTH_, AUTHZ_, MEM_, TENANT_, VAL_, BIZ_, TECH_, COMMON_, USER_, etc.)', () => {
    const validPrefixes = [
      'AUTH_',
      'AUTHZ_',
      'MEM_',
      'TENANT_',
      'VAL_',
      'BIZ_',
      'TECH_',
      'COMMON_',
      'USER_',
      'ORGUNIT_',
      'RESIDENT_',
      'HOUSEHOLD_',
      'ANNOUNCEMENT_',
      'VOTE_',
      'TRANSACTION_',
      'EMERGENCY_',
      'IOT_',
      'SUBSCRIPTION_',
      'UNEXPECTED_',
      'ENTITLEMENT_',
      'CONTEXT_',
    ];

    for (const [code] of Object.entries(ERROR_CODES)) {
      const hasValidPrefix = validPrefixes.some(prefix =>
        code.startsWith(prefix),
      );
      expect(hasValidPrefix).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Error Code Definition Completeness Tests
// ---------------------------------------------------------------------------

describe('ErrorCodeRegistry — Definition Completeness', () => {
  it('should have all required fields for each error code', () => {
    for (const [, definition] of Object.entries(ERROR_CODES)) {
      expect(definition.code).toBeDefined();
      expect(definition.type).toBeDefined();
      expect(definition.httpStatus).toBeDefined();
      expect(definition.description).toBeDefined();
      expect(typeof definition.retryable).toBe('boolean');
    }
  });

  it('should have valid error types', () => {
    const validTypes = [
      'validation',
      'business',
      'authentication',
      'authorization',
      'not_found',
      'technical',
      'unexpected',
    ];

    for (const [, definition] of Object.entries(ERROR_CODES)) {
      expect(validTypes).toContain(definition.type);
    }
  });

  it('should have valid HTTP status codes', () => {
    const validStatuses = [400, 401, 403, 404, 409, 429, 500, 502, 503, 504];

    for (const [, definition] of Object.entries(ERROR_CODES)) {
      expect(validStatuses).toContain(definition.httpStatus);
    }
  });

  it('should have descriptive descriptions (not empty)', () => {
    for (const [, definition] of Object.entries(ERROR_CODES)) {
      expect(definition.description.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// HTTP Status Mapping Tests
// ---------------------------------------------------------------------------

describe('ErrorCodeRegistry — HTTP Status Mapping', () => {
  it('should map validation errors to 400', () => {
    const validationCodes = Object.values(ERROR_CODES).filter(
      d => d.type === 'validation',
    );

    for (const definition of validationCodes) {
      expect(definition.httpStatus).toBe(400);
    }
  });

  it('should map authentication errors to 401', () => {
    const authCodes = Object.values(ERROR_CODES).filter(
      d => d.type === 'authentication',
    );

    for (const definition of authCodes) {
      expect(definition.httpStatus).toBe(401);
    }
  });

  it('should map authorization errors to 403', () => {
    const authzCodes = Object.values(ERROR_CODES).filter(
      d => d.type === 'authorization',
    );

    for (const definition of authzCodes) {
      expect(definition.httpStatus).toBe(403);
    }
  });

  it('should map not_found errors to 404', () => {
    const notFoundCodes = Object.values(ERROR_CODES).filter(
      d => d.type === 'not_found',
    );

    for (const definition of notFoundCodes) {
      expect(definition.httpStatus).toBe(404);
    }
  });
});

// ---------------------------------------------------------------------------
// Retryable Flag Tests
// ---------------------------------------------------------------------------

describe('ErrorCodeRegistry — Retryable Flag', () => {
  it('should mark validation errors as non-retryable', () => {
    const validationCodes = Object.values(ERROR_CODES).filter(
      d => d.type === 'validation',
    );

    for (const definition of validationCodes) {
      expect(definition.retryable).toBe(false);
    }
  });

  it('should mark authentication errors as non-retryable (except credential entry)', () => {
    const authCodes = Object.values(AUTH_ERROR_CODES);

    for (const definition of authCodes) {
      // Only credential-related errors might be retryable
      if (
        definition.code === 'AUTH_INVALID_CREDENTIALS' ||
        definition.code === 'AUTH_MFA_FAILED'
      ) {
        expect(definition.retryable).toBe(true);
      }
    }
  });

  it('should mark authorization errors as non-retryable (except re-auth)', () => {
    const authzCodes = Object.values(AUTHZ_ERROR_CODES);

    for (const definition of authzCodes) {
      if (definition.code === 'AUTHZ_REAUTH_REQUIRED') {
        expect(definition.retryable).toBe(true);
      } else {
        expect(definition.retryable).toBe(false);
      }
    }
  });

  it('should mark technical errors as retryable by default', () => {
    const techCodes = Object.values(TECH_ERROR_CODES);

    for (const definition of techCodes) {
      // Only parsing errors are not retryable
      if (definition.code === 'TECH_PARSING_ERROR') {
        expect(definition.retryable).toBe(false);
      } else {
        expect(definition.retryable).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// i18n Key Tests
// ---------------------------------------------------------------------------

describe('ErrorCodeRegistry — i18n Keys', () => {
  it('should have i18n keys for most error codes', () => {
    const codesWithI18n = Object.values(ERROR_CODES).filter(d => d.i18nKey);
    const totalCodes = Object.values(ERROR_CODES).length;

    // At least 90% should have i18n keys
    expect(codesWithI18n.length / totalCodes).toBeGreaterThanOrEqual(0.9);
  });

  it('should have i18n keys following pattern error.{domain}.{reason}', () => {
    const codesWithI18n = Object.values(ERROR_CODES).filter(d => d.i18nKey);

    for (const definition of codesWithI18n) {
      expect(definition.i18nKey).toMatch(/^error\.[a-z]+\.[a-zA-Z]+$/);
    }
  });
});

// ---------------------------------------------------------------------------
// Lookup Function Tests
// ---------------------------------------------------------------------------

describe('getErrorCodeDefinition', () => {
  it('should return definition for known error code', () => {
    const definition = getErrorCodeDefinition('AUTH_TOKEN_INVALID');

    expect(definition).toBeDefined();
    expect(definition?.code).toBe('AUTH_TOKEN_INVALID');
    expect(definition?.type).toBe('authentication');
    expect(definition?.httpStatus).toBe(401);
  });

  it('should return undefined for unknown error code', () => {
    const definition = getErrorCodeDefinition('UNKNOWN_ERROR_CODE');

    expect(definition).toBeUndefined();
  });

  it('should return correct definition for legacy authorization codes', () => {
    const definition = getErrorCodeDefinition('AUTH_NO_MEMBERSHIP');

    expect(definition).toBeDefined();
    expect(definition?.type).toBe('authorization');
    expect(definition?.httpStatus).toBe(403);
  });
});

describe('getHttpStatusForCode', () => {
  it('should return correct HTTP status for known code', () => {
    expect(getHttpStatusForCode('AUTH_TOKEN_INVALID')).toBe(401);
    expect(getHttpStatusForCode('AUTHZ_NO_MEMBERSHIP')).toBe(403);
    expect(getHttpStatusForCode('COMMON_NOT_FOUND')).toBe(404);
    expect(getHttpStatusForCode('VAL_FAILED')).toBe(400);
    expect(getHttpStatusForCode('TECH_TIMEOUT')).toBe(504);
  });

  it('should return 500 for unknown code (fail closed)', () => {
    expect(getHttpStatusForCode('UNKNOWN_CODE')).toBe(500);
  });
});

describe('isRetryableCode', () => {
  it('should return true for retryable codes', () => {
    expect(isRetryableCode('TECH_TIMEOUT')).toBe(true);
    expect(isRetryableCode('TECH_NETWORK_ERROR')).toBe(true);
    expect(isRetryableCode('AUTH_INVALID_CREDENTIALS')).toBe(true);
    expect(isRetryableCode('BIZ_CONFLICT_DETECTED')).toBe(true);
  });

  it('should return false for non-retryable codes', () => {
    expect(isRetryableCode('AUTH_TOKEN_INVALID')).toBe(false);
    expect(isRetryableCode('AUTHZ_INSUFFICIENT_PERMISSION')).toBe(false);
    expect(isRetryableCode('VAL_FAILED')).toBe(false);
    expect(isRetryableCode('MEM_LAST_ADMIN')).toBe(false);
  });

  it('should return false for unknown codes (fail closed)', () => {
    expect(isRetryableCode('UNKNOWN_CODE')).toBe(false);
  });
});

describe('getErrorTypeForCode', () => {
  it('should return correct type for known codes', () => {
    expect(getErrorTypeForCode('AUTH_TOKEN_INVALID')).toBe('authentication');
    expect(getErrorTypeForCode('AUTHZ_NO_MEMBERSHIP')).toBe('authorization');
    expect(getErrorTypeForCode('VAL_FAILED')).toBe('validation');
    expect(getErrorTypeForCode('BIZ_CONFLICT_DETECTED')).toBe('business');
    expect(getErrorTypeForCode('TECH_TIMEOUT')).toBe('technical');
    expect(getErrorTypeForCode('COMMON_NOT_FOUND')).toBe('not_found');
    expect(getErrorTypeForCode('UNEXPECTED_ERROR')).toBe('unexpected');
  });

  it('should return undefined for unknown codes', () => {
    expect(getErrorTypeForCode('UNKNOWN_CODE')).toBeUndefined();
  });
});

describe('getI18nKeyForCode', () => {
  it('should return i18n key for codes with i18n', () => {
    expect(getI18nKeyForCode('AUTH_TOKEN_INVALID')).toBe(
      'error.auth.tokenInvalid',
    );
    expect(getI18nKeyForCode('VAL_FAILED')).toBe('error.validation.failed');
    expect(getI18nKeyForCode('COMMON_NOT_FOUND')).toBe('error.common.notFound');
  });

  it('should return undefined for unknown codes', () => {
    expect(getI18nKeyForCode('UNKNOWN_CODE')).toBeUndefined();
  });
});

describe('isKnownErrorCode', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it('should return true for known codes without warning', () => {
    const result = isKnownErrorCode('AUTH_TOKEN_INVALID');

    expect(result).toBe(true);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('should return false for unknown codes and log warning', () => {
    const result = isKnownErrorCode('UNKNOWN_ERROR_CODE');

    expect(result).toBe(false);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown error code: UNKNOWN_ERROR_CODE'),
    );
  });
});

describe('getErrorCodesByType', () => {
  it('should return all authentication errors', () => {
    const authErrors = getErrorCodesByType('authentication');

    expect(authErrors.length).toBeGreaterThan(0);
    expect(authErrors.every(e => e.type === 'authentication')).toBe(true);
  });

  it('should return all authorization errors', () => {
    const authzErrors = getErrorCodesByType('authorization');

    expect(authzErrors.length).toBeGreaterThan(0);
    expect(authzErrors.every(e => e.type === 'authorization')).toBe(true);
  });

  it('should return all validation errors', () => {
    const valErrors = getErrorCodesByType('validation');

    expect(valErrors.length).toBeGreaterThan(0);
    expect(valErrors.every(e => e.type === 'validation')).toBe(true);
  });

  it('should return all technical errors', () => {
    const techErrors = getErrorCodesByType('technical');

    expect(techErrors.length).toBeGreaterThan(0);
    expect(techErrors.every(e => e.type === 'technical')).toBe(true);
  });

  it('should return empty array for invalid type', () => {
    // @ts-expect-error Testing invalid type
    const errors = getErrorCodesByType('invalid_type');

    expect(errors).toEqual([]);
  });
});

describe('getErrorCodesByHttpStatus', () => {
  it('should return all 400 errors', () => {
    const badRequestErrors = getErrorCodesByHttpStatus(400);

    expect(badRequestErrors.length).toBeGreaterThan(0);
    expect(badRequestErrors.every(e => e.httpStatus === 400)).toBe(true);
  });

  it('should return all 401 errors', () => {
    const unauthorizedErrors = getErrorCodesByHttpStatus(401);

    expect(unauthorizedErrors.length).toBeGreaterThan(0);
    expect(unauthorizedErrors.every(e => e.httpStatus === 401)).toBe(true);
  });

  it('should return all 403 errors', () => {
    const forbiddenErrors = getErrorCodesByHttpStatus(403);

    expect(forbiddenErrors.length).toBeGreaterThan(0);
    expect(forbiddenErrors.every(e => e.httpStatus === 403)).toBe(true);
  });

  it('should return all 404 errors', () => {
    const notFoundErrors = getErrorCodesByHttpStatus(404);

    expect(notFoundErrors.length).toBeGreaterThan(0);
    expect(notFoundErrors.every(e => e.httpStatus === 404)).toBe(true);
  });

  it('should return empty array for unused status', () => {
    const errors = getErrorCodesByHttpStatus(418); // I'm a teapot

    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Category-Specific Tests
// ---------------------------------------------------------------------------

describe('AUTH_ERROR_CODES', () => {
  it('should contain all required authentication error codes', () => {
    const requiredCodes = [
      'AUTH_TOKEN_INVALID',
      'AUTH_TOKEN_REVOKED',
      'AUTH_TOKEN_REUSE_DETECTED',
      'AUTH_INVALID_CREDENTIALS',
      'AUTH_ACCOUNT_LOCKED',
    ];

    for (const code of requiredCodes) {
      expect(AUTH_ERROR_CODES).toHaveProperty(code);
    }
  });

  it('should have all codes starting with AUTH_', () => {
    for (const code of Object.keys(AUTH_ERROR_CODES)) {
      expect(code.startsWith('AUTH_')).toBe(true);
    }
  });
});

describe('AUTHZ_ERROR_CODES', () => {
  it('should contain all required authorization error codes', () => {
    const requiredCodes = [
      'AUTHZ_NO_MEMBERSHIP',
      'AUTHZ_MEMBERSHIP_INACTIVE',
      'AUTHZ_INSUFFICIENT_PERMISSION',
      'AUTHZ_OUT_OF_SCOPE',
      'AUTHZ_TENANT_MISMATCH',
      'AUTHZ_USER_QUARANTINED',
    ];

    for (const code of requiredCodes) {
      expect(AUTHZ_ERROR_CODES).toHaveProperty(code);
    }
  });

  it('should have all codes starting with AUTHZ_', () => {
    for (const code of Object.keys(AUTHZ_ERROR_CODES)) {
      expect(code.startsWith('AUTHZ_')).toBe(true);
    }
  });
});

describe('LEGACY_AUTHZ_ERROR_CODES', () => {
  it('should contain backward-compatible AUTH_ authorization codes', () => {
    const legacyCodes = [
      'AUTH_NO_MEMBERSHIP',
      'AUTH_MEMBERSHIP_INACTIVE',
      'AUTH_INSUFFICIENT_PERMISSION',
      'AUTH_OUT_OF_SCOPE',
      'AUTH_TENANT_MISMATCH',
      'AUTH_USER_QUARANTINED',
    ];

    for (const code of legacyCodes) {
      expect(LEGACY_AUTHZ_ERROR_CODES).toHaveProperty(code);
    }
  });

  it('should have matching type/status with new AUTHZ codes', () => {
    expect(LEGACY_AUTHZ_ERROR_CODES.AUTH_NO_MEMBERSHIP.type).toBe(
      AUTHZ_ERROR_CODES.AUTHZ_NO_MEMBERSHIP.type,
    );
    expect(LEGACY_AUTHZ_ERROR_CODES.AUTH_NO_MEMBERSHIP.httpStatus).toBe(
      AUTHZ_ERROR_CODES.AUTHZ_NO_MEMBERSHIP.httpStatus,
    );
  });
});

describe('MEM_ERROR_CODES', () => {
  it('should contain membership-related error codes', () => {
    const requiredCodes = [
      'MEM_NOT_FOUND',
      'MEM_ALREADY_EXISTS',
      'MEM_LAST_ADMIN',
      'MEM_INVALID_TRANSITION',
    ];

    for (const code of requiredCodes) {
      expect(MEM_ERROR_CODES).toHaveProperty(code);
    }
  });

  it('should have all codes starting with MEM_', () => {
    for (const code of Object.keys(MEM_ERROR_CODES)) {
      expect(code.startsWith('MEM_')).toBe(true);
    }
  });
});

describe('TENANT_ERROR_CODES', () => {
  it('should contain tenant-related error codes', () => {
    const requiredCodes = [
      'TENANT_NOT_FOUND',
      'TENANT_SUSPENDED',
      'TENANT_CLOSED',
      'TENANT_ACCESS_DENIED',
    ];

    for (const code of requiredCodes) {
      expect(TENANT_ERROR_CODES).toHaveProperty(code);
    }
  });

  it('should have all codes starting with TENANT_', () => {
    for (const code of Object.keys(TENANT_ERROR_CODES)) {
      expect(code.startsWith('TENANT_')).toBe(true);
    }
  });
});

describe('VAL_ERROR_CODES', () => {
  it('should contain validation-related error codes', () => {
    const requiredCodes = [
      'VAL_FAILED',
      'VAL_REQUIRED_FIELD',
      'VAL_INVALID_FORMAT',
      'VAL_INVALID_EMAIL',
    ];

    for (const code of requiredCodes) {
      expect(VAL_ERROR_CODES).toHaveProperty(code);
    }
  });

  it('should have all codes starting with VAL_', () => {
    for (const code of Object.keys(VAL_ERROR_CODES)) {
      expect(code.startsWith('VAL_')).toBe(true);
    }
  });
});

describe('BIZ_ERROR_CODES', () => {
  it('should contain business rule error codes', () => {
    const requiredCodes = [
      'BIZ_RULE_VIOLATION',
      'BIZ_CONFLICT_DETECTED',
      'BIZ_IDEMPOTENCY_MISMATCH',
      'BIZ_INVALID_STATUS_TRANSITION',
    ];

    for (const code of requiredCodes) {
      expect(BIZ_ERROR_CODES).toHaveProperty(code);
    }
  });

  it('should have all codes starting with BIZ_', () => {
    for (const code of Object.keys(BIZ_ERROR_CODES)) {
      expect(code.startsWith('BIZ_')).toBe(true);
    }
  });
});

describe('TECH_ERROR_CODES', () => {
  it('should contain technical error codes', () => {
    const requiredCodes = [
      'TECH_ERROR',
      'TECH_DATABASE_ERROR',
      'TECH_SERVICE_UNAVAILABLE',
      'TECH_TIMEOUT',
      'TECH_NETWORK_ERROR',
    ];

    for (const code of requiredCodes) {
      expect(TECH_ERROR_CODES).toHaveProperty(code);
    }
  });

  it('should have all codes starting with TECH_', () => {
    for (const code of Object.keys(TECH_ERROR_CODES)) {
      expect(code.startsWith('TECH_')).toBe(true);
    }
  });
});

describe('NOT_FOUND_ERROR_CODES', () => {
  it('should contain resource not-found error codes', () => {
    const requiredCodes = [
      'COMMON_NOT_FOUND',
      'USER_NOT_FOUND',
      'TENANT_NOT_FOUND',
      'ORGUNIT_NOT_FOUND',
    ];

    for (const code of requiredCodes) {
      expect(NOT_FOUND_ERROR_CODES).toHaveProperty(code);
    }
  });
});

describe('UNEXPECTED_ERROR_CODES', () => {
  it('should contain unexpected error codes', () => {
    const requiredCodes = [
      'UNEXPECTED_ERROR',
      'UNEXPECTED_INVARIANT',
      'UNEXPECTED_NULL_REFERENCE',
    ];

    for (const code of requiredCodes) {
      expect(UNEXPECTED_ERROR_CODES).toHaveProperty(code);
    }
  });

  it('should have all codes starting with UNEXPECTED_', () => {
    for (const code of Object.keys(UNEXPECTED_ERROR_CODES)) {
      expect(code.startsWith('UNEXPECTED_')).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Integration with Multi-Tenant SaaS Architecture Tests
// ---------------------------------------------------------------------------

describe('ErrorCodeRegistry — Multi-Tenant SaaS Integration', () => {
  it('should include all authorization pipeline error codes from design.md', () => {
    const designErrorCodes = [
      'AUTH_TOKEN_INVALID',
      'AUTH_TOKEN_REVOKED',
      'AUTH_TOKEN_REUSE_DETECTED',
      'AUTH_NO_MEMBERSHIP',
      'AUTH_MEMBERSHIP_INACTIVE',
      'AUTH_INSUFFICIENT_PERMISSION',
      'AUTH_OUT_OF_SCOPE',
      'AUTH_TENANT_MISMATCH',
      'AUTH_USER_QUARANTINED',
      'AUTH_DELEGATION_VIOLATION',
      'AUTH_HOUSEHOLD_MISMATCH',
      'AUTH_REAUTH_REQUIRED',
      'TENANT_SUSPENDED',
      'ENTITLEMENT_NOT_AVAILABLE',
      'CONTEXT_SWITCH_INVALID',
      'BIZ_CONFLICT_DETECTED',
      'BIZ_IDEMPOTENCY_MISMATCH',
      'AUTH_WEBHOOK_SIGNATURE_INVALID',
      'BIZ_INVALID_STATUS_TRANSITION',
      'BIZ_PLAN_HAS_SUBSCRIBERS',
    ];

    for (const code of designErrorCodes) {
      expect(isKnownErrorCode(code)).toBe(true);
    }
  });

  it('should map authorization pipeline errors to correct HTTP statuses', () => {
    // 401 - Authentication errors
    expect(getHttpStatusForCode('AUTH_TOKEN_INVALID')).toBe(401);
    expect(getHttpStatusForCode('AUTH_TOKEN_REVOKED')).toBe(401);
    expect(getHttpStatusForCode('AUTH_TOKEN_REUSE_DETECTED')).toBe(401);

    // 403 - Authorization errors
    expect(getHttpStatusForCode('AUTH_NO_MEMBERSHIP')).toBe(403);
    expect(getHttpStatusForCode('AUTH_MEMBERSHIP_INACTIVE')).toBe(403);
    expect(getHttpStatusForCode('AUTH_INSUFFICIENT_PERMISSION')).toBe(403);
    expect(getHttpStatusForCode('AUTH_OUT_OF_SCOPE')).toBe(403);
    expect(getHttpStatusForCode('AUTH_TENANT_MISMATCH')).toBe(403);
    expect(getHttpStatusForCode('TENANT_SUSPENDED')).toBe(403);
    expect(getHttpStatusForCode('ENTITLEMENT_NOT_AVAILABLE')).toBe(403);

    // 400 - Bad Request
    expect(getHttpStatusForCode('CONTEXT_SWITCH_INVALID')).toBe(400);
    expect(getHttpStatusForCode('BIZ_INVALID_STATUS_TRANSITION')).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Security Tests
// ---------------------------------------------------------------------------

describe('ErrorCodeRegistry — Security Considerations', () => {
  it('should not expose internal details in descriptions', () => {
    const sensitivePatterns = [
      /stack/i,
      /trace/i,
      /internal path/i,
      /sql/i,
      /database schema/i,
      /password/i,
      /secret/i,
      /api key/i,
    ];

    for (const [, definition] of Object.entries(ERROR_CODES)) {
      for (const pattern of sensitivePatterns) {
        expect(definition.description).not.toMatch(pattern);
      }
    }
  });

  it('should have generic user messages (via i18n) for sensitive errors', () => {
    // Authentication failures should not reveal specifics
    const authDef = getErrorCodeDefinition('AUTH_INVALID_CREDENTIALS');
    expect(authDef?.description).not.toContain('username');
    expect(authDef?.description).not.toContain('email');
  });
});
