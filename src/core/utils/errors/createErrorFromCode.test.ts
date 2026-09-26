/**
 * createErrorFromCode Unit Tests
 *
 * @see Requirements 61 (Error Code Standardization)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createErrorFromCode,
  createErrorFromDefinition,
  isErrorCode,
  isAnyErrorCode,
} from './createErrorFromCode';
import { AUTH_ERROR_CODES, AUTHZ_ERROR_CODES } from './ErrorCodeRegistry';

// ---------------------------------------------------------------------------
// createErrorFromCode Tests
// ---------------------------------------------------------------------------

describe('createErrorFromCode', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe('authentication errors', () => {
    it('should create authentication error from AUTH_TOKEN_INVALID', () => {
      const error = createErrorFromCode('AUTH_TOKEN_INVALID');

      expect(error.type).toBe('authentication');
      expect(error.code).toBe('AUTH_TOKEN_INVALID');
      expect(error.message).toBe('JWT missing, malformed, or expired');
      expect(error.retryable).toBe(false);
      expect(error.userMessage).toBe('error.auth.tokenInvalid');
    });

    it('should allow message override', () => {
      const error = createErrorFromCode('AUTH_TOKEN_INVALID', {
        message: 'Custom message for logging',
      });

      expect(error.type).toBe('authentication');
      expect(error.code).toBe('AUTH_TOKEN_INVALID');
      expect(error.message).toBe('Custom message for logging');
    });

    it('should allow userMessage override', () => {
      const error = createErrorFromCode('AUTH_TOKEN_INVALID', {
        userMessage: 'custom.i18n.key',
      });

      expect(error.userMessage).toBe('custom.i18n.key');
    });

    it('should include cause when provided', () => {
      const originalError = new Error('Original error');
      const error = createErrorFromCode('AUTH_TOKEN_INVALID', {
        cause: originalError,
      });

      expect(error.cause).toBe(originalError);
    });
  });

  describe('authorization errors', () => {
    it('should create authorization error from AUTHZ_NO_MEMBERSHIP', () => {
      const error = createErrorFromCode('AUTHZ_NO_MEMBERSHIP');

      expect(error.type).toBe('authorization');
      expect(error.code).toBe('AUTHZ_NO_MEMBERSHIP');
      expect(error.retryable).toBe(false);
    });

    it('should create authorization error from legacy AUTH_NO_MEMBERSHIP', () => {
      const error = createErrorFromCode('AUTH_NO_MEMBERSHIP');

      expect(error.type).toBe('authorization');
      expect(error.code).toBe('AUTH_NO_MEMBERSHIP');
    });

    it('should create authorization error with custom context', () => {
      const error = createErrorFromCode('AUTHZ_TENANT_MISMATCH', {
        message: 'User tenant abc-123 does not match resource tenant xyz-789',
      });

      expect(error.type).toBe('authorization');
      expect(error.code).toBe('AUTHZ_TENANT_MISMATCH');
      expect(error.message).toContain('abc-123');
    });
  });

  describe('validation errors', () => {
    it('should create validation error from VAL_FAILED', () => {
      const error = createErrorFromCode('VAL_FAILED');

      expect(error.type).toBe('validation');
      expect(error.code).toBe('VAL_FAILED');
      expect(error.retryable).toBe(false);
    });

    it('should create validation error from VAL_INVALID_EMAIL', () => {
      const error = createErrorFromCode('VAL_INVALID_EMAIL', {
        message: 'Invalid email: not-an-email',
      });

      expect(error.type).toBe('validation');
      expect(error.code).toBe('VAL_INVALID_EMAIL');
    });
  });

  describe('business errors', () => {
    it('should create business error from BIZ_CONFLICT_DETECTED', () => {
      const error = createErrorFromCode('BIZ_CONFLICT_DETECTED');

      expect(error.type).toBe('business');
      expect(error.code).toBe('BIZ_CONFLICT_DETECTED');
      expect(error.retryable).toBe(true); // Conflict is retryable
    });

    it('should create business error from MEM_LAST_ADMIN', () => {
      const error = createErrorFromCode('MEM_LAST_ADMIN');

      expect(error.type).toBe('business');
      expect(error.code).toBe('MEM_LAST_ADMIN');
      expect(error.retryable).toBe(false);
    });
  });

  describe('technical errors', () => {
    it('should create technical error from TECH_TIMEOUT', () => {
      const error = createErrorFromCode('TECH_TIMEOUT');

      expect(error.type).toBe('technical');
      expect(error.code).toBe('TECH_TIMEOUT');
      expect(error.retryable).toBe(true);
    });

    it('should create technical error from TECH_DATABASE_ERROR', () => {
      const dbError = new Error('Connection refused');
      const error = createErrorFromCode('TECH_DATABASE_ERROR', {
        cause: dbError,
      });

      expect(error.type).toBe('technical');
      expect(error.code).toBe('TECH_DATABASE_ERROR');
      expect(error.cause).toBe(dbError);
    });
  });

  describe('not_found errors', () => {
    it('should create not_found error from COMMON_NOT_FOUND', () => {
      const error = createErrorFromCode('COMMON_NOT_FOUND');

      expect(error.type).toBe('not_found');
      expect(error.code).toBe('COMMON_NOT_FOUND');
      expect(error.retryable).toBe(false);
    });

    it('should create not_found error from USER_NOT_FOUND', () => {
      const error = createErrorFromCode('USER_NOT_FOUND', {
        message: 'User with ID abc-123 not found',
      });

      expect(error.type).toBe('not_found');
      expect(error.code).toBe('USER_NOT_FOUND');
      expect(error.message).toContain('abc-123');
    });
  });

  describe('unexpected errors', () => {
    it('should create unexpected error from UNEXPECTED_ERROR', () => {
      const error = createErrorFromCode('UNEXPECTED_ERROR');

      expect(error.type).toBe('unexpected');
      expect(error.code).toBe('UNEXPECTED_ERROR');
      expect(error.retryable).toBe(false);
    });

    it('should create unexpected error from UNEXPECTED_INVARIANT', () => {
      const error = createErrorFromCode('UNEXPECTED_INVARIANT', {
        message: 'Invariant violation: user.tenantId should not be null',
      });

      expect(error.type).toBe('unexpected');
      expect(error.code).toBe('UNEXPECTED_INVARIANT');
    });
  });

  describe('unknown error codes', () => {
    it('should create unexpected error for unknown code and log warning', () => {
      const error = createErrorFromCode('UNKNOWN_ERROR_CODE');

      expect(error.type).toBe('unexpected');
      expect(error.code).toBe('UNKNOWN_ERROR_CODE');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown error code: UNKNOWN_ERROR_CODE'),
      );
    });

    it('should use custom message for unknown code', () => {
      const error = createErrorFromCode('UNKNOWN_ERROR_CODE', {
        message: 'Something went wrong',
      });

      expect(error.message).toBe('Something went wrong');
    });
  });

  describe('retryable override', () => {
    it('should allow overriding retryable to true', () => {
      const error = createErrorFromCode('AUTH_TOKEN_INVALID', {
        retryable: true,
      });

      expect(error.retryable).toBe(true);
    });

    it('should allow overriding retryable to false', () => {
      const error = createErrorFromCode('TECH_TIMEOUT', {
        retryable: false,
      });

      expect(error.retryable).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// createErrorFromDefinition Tests
// ---------------------------------------------------------------------------

describe('createErrorFromDefinition', () => {
  it('should create error from AUTH_TOKEN_INVALID definition', () => {
    const definition = AUTH_ERROR_CODES.AUTH_TOKEN_INVALID;
    const error = createErrorFromDefinition(definition);

    expect(error.type).toBe('authentication');
    expect(error.code).toBe('AUTH_TOKEN_INVALID');
    expect(error.message).toBe(definition.description);
  });

  it('should create error from AUTHZ_NO_MEMBERSHIP definition', () => {
    const definition = AUTHZ_ERROR_CODES.AUTHZ_NO_MEMBERSHIP;
    const error = createErrorFromDefinition(definition);

    expect(error.type).toBe('authorization');
    expect(error.code).toBe('AUTHZ_NO_MEMBERSHIP');
  });

  it('should allow message override', () => {
    const definition = AUTH_ERROR_CODES.AUTH_TOKEN_INVALID;
    const error = createErrorFromDefinition(definition, {
      message: 'Token invalid for user xyz',
    });

    expect(error.message).toBe('Token invalid for user xyz');
  });

  it('should include cause', () => {
    const definition = AUTH_ERROR_CODES.AUTH_TOKEN_INVALID;
    const cause = new Error('JWT verification failed');
    const error = createErrorFromDefinition(definition, { cause });

    expect(error.cause).toBe(cause);
  });
});

// ---------------------------------------------------------------------------
// isErrorCode Tests
// ---------------------------------------------------------------------------

describe('isErrorCode', () => {
  it('should return true when code matches', () => {
    const error = createErrorFromCode('AUTH_TOKEN_INVALID');

    expect(isErrorCode(error, 'AUTH_TOKEN_INVALID')).toBe(true);
  });

  it('should return false when code does not match', () => {
    const error = createErrorFromCode('AUTH_TOKEN_INVALID');

    expect(isErrorCode(error, 'AUTH_TOKEN_REVOKED')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isAnyErrorCode Tests
// ---------------------------------------------------------------------------

describe('isAnyErrorCode', () => {
  it('should return true when code is in list', () => {
    const error = createErrorFromCode('AUTH_TOKEN_INVALID');

    expect(
      isAnyErrorCode(error, ['AUTH_TOKEN_INVALID', 'AUTH_TOKEN_REVOKED']),
    ).toBe(true);
  });

  it('should return true for second code in list', () => {
    const error = createErrorFromCode('AUTH_TOKEN_REVOKED');

    expect(
      isAnyErrorCode(error, ['AUTH_TOKEN_INVALID', 'AUTH_TOKEN_REVOKED']),
    ).toBe(true);
  });

  it('should return false when code is not in list', () => {
    const error = createErrorFromCode('AUTHZ_NO_MEMBERSHIP');

    expect(
      isAnyErrorCode(error, ['AUTH_TOKEN_INVALID', 'AUTH_TOKEN_REVOKED']),
    ).toBe(false);
  });

  it('should return false for empty list', () => {
    const error = createErrorFromCode('AUTH_TOKEN_INVALID');

    expect(isAnyErrorCode(error, [])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integration Tests
// ---------------------------------------------------------------------------

describe('Error Creation Integration', () => {
  it('should create errors that work with DomainResult pattern', () => {
    const error = createErrorFromCode('AUTH_TOKEN_INVALID');

    // Verify all AppError fields are present
    expect(error).toHaveProperty('type');
    expect(error).toHaveProperty('code');
    expect(error).toHaveProperty('message');
    expect(error).toHaveProperty('retryable');

    // These are optional but should be defined when present
    expect(typeof error.userMessage === 'string' || error.userMessage === undefined).toBe(true);
  });

  it('should create errors suitable for HTTP response mapping', () => {
    const authError = createErrorFromCode('AUTH_TOKEN_INVALID');
    const authzError = createErrorFromCode('AUTHZ_NO_MEMBERSHIP');
    const notFoundError = createErrorFromCode('COMMON_NOT_FOUND');

    // Authentication -> 401
    expect(authError.type).toBe('authentication');
    // Authorization -> 403
    expect(authzError.type).toBe('authorization');
    // Not Found -> 404
    expect(notFoundError.type).toBe('not_found');
  });

  it('should support chaining error creation for nested errors', () => {
    const dbError = new Error('Connection refused');
    const techError = createErrorFromCode('TECH_DATABASE_ERROR', {
      cause: dbError,
      message: 'Failed to query memberships table',
    });
    const authzError = createErrorFromCode('AUTHZ_NO_MEMBERSHIP', {
      cause: techError,
      message: 'Could not resolve membership due to database error',
    });

    expect(authzError.type).toBe('authorization');
    expect(authzError.cause).toBe(techError);
    expect((authzError.cause as typeof techError).cause).toBe(dbError);
  });
});
