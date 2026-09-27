/**
 * TokenValidationLogger Unit Tests
 *
 * Tests for the Token Validation Audit Logger that implements Requirement 15.3:
 * - Log all token validations with correlationId, userId, tokenVersion,
 *   validationResult, and failureReason
 *
 * **Test Coverage:**
 * 1. Log successful token validation
 * 2. Log invalid token (parsing/signature failure)
 * 3. Log expired token
 * 4. Log token version mismatch
 * 5. Verify required fields are present in log context
 * 6. Verify no sensitive data (actual tokens) is logged
 *
 * @see Requirements 15.3 (Token Validation Audit Logging)
 * @see Design: Observability and Audit Logging
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import {
  TokenValidationLoggerImpl,
  type ITokenValidationLogger,
  type TokenValidationContext,
  type LogTokenValidationInput,
} from '../TokenValidationLogger';
import type { Logger } from '../Logger';

// ---------------------------------------------------------------------------
// Test Constants
// ---------------------------------------------------------------------------

const TEST_CORRELATION_ID = 'test-correlation-123';
const TEST_USER_ID = 'test-user-456';
const TEST_TENANT_ID = 'test-tenant-789';
const TEST_TOKEN_VERSION = 5;
const TEST_ROUTE = '/api/test';
const TEST_METHOD = 'GET';

// ---------------------------------------------------------------------------
// Mock Setup
// ---------------------------------------------------------------------------

interface MockLogger extends Logger {
  info: Mock<[message: string, context?: Record<string, unknown>], void>;
  warn: Mock<[message: string, context?: Record<string, unknown>], void>;
  error: Mock<[message: string, context?: Record<string, unknown>], void>;
  debug: Mock<[message: string, context?: Record<string, unknown>], void>;
}

const mockLogger: MockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createTestLogger(): ITokenValidationLogger {
  return TokenValidationLoggerImpl({ logger: mockLogger });
}

function createTestContext(): TokenValidationContext {
  return {
    route: TEST_ROUTE,
    method: TEST_METHOD,
    tenantId: TEST_TENANT_ID,
  };
}

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe('TokenValidationLogger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // logSuccess Tests
  // -------------------------------------------------------------------------

  describe('logSuccess', () => {
    it('should log successful token validation with info level', () => {
      const logger = createTestLogger();
      const context = createTestContext();

      logger.logSuccess(TEST_CORRELATION_ID, TEST_USER_ID, TEST_TOKEN_VERSION, context);

      expect(mockLogger.info).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should include all required fields in log context', () => {
      const logger = createTestLogger();
      const context = createTestContext();

      logger.logSuccess(TEST_CORRELATION_ID, TEST_USER_ID, TEST_TOKEN_VERSION, context);

      const call = mockLogger.info.mock.calls[0]!;
      const logContext = call[1] as Record<string, unknown>;

      // Verify required fields per Requirement 15.3
      expect(logContext.correlation_id).toBe(TEST_CORRELATION_ID);
      expect(logContext.user_id).toBe(TEST_USER_ID);
      expect(logContext.token_version_claimed).toBe(TEST_TOKEN_VERSION);
      expect(logContext.token_version_current).toBe(TEST_TOKEN_VERSION);
      expect(logContext.validation_result).toBe('VALID');
      expect(logContext.failure_reason).toBeUndefined();
      expect(logContext.event_type).toBe('TOKEN_VALIDATION');
    });

    it('should include context fields (route, method, tenantId)', () => {
      const logger = createTestLogger();
      const context = createTestContext();

      logger.logSuccess(TEST_CORRELATION_ID, TEST_USER_ID, TEST_TOKEN_VERSION, context);

      const call = mockLogger.info.mock.calls[0]!;
      const logContext = call[1] as Record<string, unknown>;

      expect(logContext.route).toBe(TEST_ROUTE);
      expect(logContext.method).toBe(TEST_METHOD);
      expect(logContext.tenant_id).toBe(TEST_TENANT_ID);
    });

    it('should generate appropriate log message', () => {
      const logger = createTestLogger();

      logger.logSuccess(TEST_CORRELATION_ID, TEST_USER_ID, TEST_TOKEN_VERSION);

      const call = mockLogger.info.mock.calls[0]!;
      const message = call[0];

      expect(message).toContain('Token validation successful');
      expect(message).toContain(TEST_USER_ID);
    });
  });

  // -------------------------------------------------------------------------
  // logInvalid Tests
  // -------------------------------------------------------------------------

  describe('logInvalid', () => {
    it('should log invalid token with warn level', () => {
      const logger = createTestLogger();
      const context = createTestContext();

      logger.logInvalid(TEST_CORRELATION_ID, context);

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it('should set validation result to INVALID with AUTH_TOKEN_INVALID failure reason', () => {
      const logger = createTestLogger();
      const context = createTestContext();

      logger.logInvalid(TEST_CORRELATION_ID, context);

      const call = mockLogger.warn.mock.calls[0]!;
      const logContext = call[1] as Record<string, unknown>;

      expect(logContext.validation_result).toBe('INVALID');
      expect(logContext.failure_reason).toBe('AUTH_TOKEN_INVALID');
    });

    it('should have null userId and tokenVersion when token is invalid', () => {
      const logger = createTestLogger();

      logger.logInvalid(TEST_CORRELATION_ID);

      const call = mockLogger.warn.mock.calls[0]!;
      const logContext = call[1] as Record<string, unknown>;

      expect(logContext.user_id).toBeUndefined();
      expect(logContext.token_version_claimed).toBeUndefined();
      expect(logContext.token_version_current).toBeUndefined();
    });

    it('should generate appropriate log message', () => {
      const logger = createTestLogger();

      logger.logInvalid(TEST_CORRELATION_ID);

      const call = mockLogger.warn.mock.calls[0]!;
      const message = call[0];

      expect(message).toContain('Token validation failed');
      expect(message).toContain('invalid token');
    });
  });

  // -------------------------------------------------------------------------
  // logExpired Tests
  // -------------------------------------------------------------------------

  describe('logExpired', () => {
    it('should log expired token with warn level', () => {
      const logger = createTestLogger();
      const context = createTestContext();

      logger.logExpired(TEST_CORRELATION_ID, TEST_USER_ID, TEST_TOKEN_VERSION, context);

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it('should set validation result to EXPIRED with AUTH_TOKEN_EXPIRED failure reason', () => {
      const logger = createTestLogger();

      logger.logExpired(TEST_CORRELATION_ID, TEST_USER_ID, TEST_TOKEN_VERSION);

      const call = mockLogger.warn.mock.calls[0]!;
      const logContext = call[1] as Record<string, unknown>;

      expect(logContext.validation_result).toBe('EXPIRED');
      expect(logContext.failure_reason).toBe('AUTH_TOKEN_EXPIRED');
    });

    it('should include userId and claimed tokenVersion if available', () => {
      const logger = createTestLogger();

      logger.logExpired(TEST_CORRELATION_ID, TEST_USER_ID, TEST_TOKEN_VERSION);

      const call = mockLogger.warn.mock.calls[0]!;
      const logContext = call[1] as Record<string, unknown>;

      expect(logContext.user_id).toBe(TEST_USER_ID);
      expect(logContext.token_version_claimed).toBe(TEST_TOKEN_VERSION);
      // Current version is null for expired tokens (we don't look it up)
      expect(logContext.token_version_current).toBeUndefined();
    });

    it('should handle null userId and tokenVersion', () => {
      const logger = createTestLogger();

      logger.logExpired(TEST_CORRELATION_ID, null, null);

      const call = mockLogger.warn.mock.calls[0]!;
      const message = call[0];
      const logContext = call[1] as Record<string, unknown>;

      expect(logContext.user_id).toBeUndefined();
      expect(logContext.token_version_claimed).toBeUndefined();
      expect(message).toContain('unknown');
    });
  });

  // -------------------------------------------------------------------------
  // logVersionMismatch Tests
  // -------------------------------------------------------------------------

  describe('logVersionMismatch', () => {
    it('should log version mismatch with warn level', () => {
      const logger = createTestLogger();
      const context = createTestContext();
      const currentVersion = 6;

      logger.logVersionMismatch(
        TEST_CORRELATION_ID,
        TEST_USER_ID,
        TEST_TOKEN_VERSION,
        currentVersion,
        context,
      );

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it('should set validation result to VERSION_MISMATCH with AUTH_TOKEN_VERSION_MISMATCH failure reason', () => {
      const logger = createTestLogger();
      const currentVersion = 6;

      logger.logVersionMismatch(
        TEST_CORRELATION_ID,
        TEST_USER_ID,
        TEST_TOKEN_VERSION,
        currentVersion,
      );

      const call = mockLogger.warn.mock.calls[0]!;
      const logContext = call[1] as Record<string, unknown>;

      expect(logContext.validation_result).toBe('VERSION_MISMATCH');
      expect(logContext.failure_reason).toBe('AUTH_TOKEN_VERSION_MISMATCH');
    });

    it('should include both claimed and current tokenVersion', () => {
      const logger = createTestLogger();
      const currentVersion = 6;

      logger.logVersionMismatch(
        TEST_CORRELATION_ID,
        TEST_USER_ID,
        TEST_TOKEN_VERSION,
        currentVersion,
      );

      const call = mockLogger.warn.mock.calls[0]!;
      const logContext = call[1] as Record<string, unknown>;

      expect(logContext.token_version_claimed).toBe(TEST_TOKEN_VERSION);
      expect(logContext.token_version_current).toBe(currentVersion);
    });

    it('should generate message with version details', () => {
      const logger = createTestLogger();
      const currentVersion = 6;

      logger.logVersionMismatch(
        TEST_CORRELATION_ID,
        TEST_USER_ID,
        TEST_TOKEN_VERSION,
        currentVersion,
      );

      const call = mockLogger.warn.mock.calls[0]!;
      const message = call[0];

      expect(message).toContain('version mismatch');
      expect(message).toContain(TEST_USER_ID);
      expect(message).toContain(String(TEST_TOKEN_VERSION));
      expect(message).toContain(String(currentVersion));
    });
  });

  // -------------------------------------------------------------------------
  // Generic log() Tests
  // -------------------------------------------------------------------------

  describe('log', () => {
    it('should use info level for VALID result', () => {
      const logger = createTestLogger();
      const input: LogTokenValidationInput = {
        correlationId: TEST_CORRELATION_ID,
        userId: TEST_USER_ID,
        claimedTokenVersion: TEST_TOKEN_VERSION,
        currentTokenVersion: TEST_TOKEN_VERSION,
        validationResult: 'VALID',
        failureReason: null,
      };

      logger.log(input);

      expect(mockLogger.info).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should use warn level for INVALID result', () => {
      const logger = createTestLogger();
      const input: LogTokenValidationInput = {
        correlationId: TEST_CORRELATION_ID,
        userId: null,
        claimedTokenVersion: null,
        currentTokenVersion: null,
        validationResult: 'INVALID',
        failureReason: 'AUTH_TOKEN_INVALID',
      };

      logger.log(input);

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it('should use warn level for EXPIRED result', () => {
      const logger = createTestLogger();
      const input: LogTokenValidationInput = {
        correlationId: TEST_CORRELATION_ID,
        userId: TEST_USER_ID,
        claimedTokenVersion: TEST_TOKEN_VERSION,
        currentTokenVersion: null,
        validationResult: 'EXPIRED',
        failureReason: 'AUTH_TOKEN_EXPIRED',
      };

      logger.log(input);

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    });

    it('should use warn level for VERSION_MISMATCH result', () => {
      const logger = createTestLogger();
      const input: LogTokenValidationInput = {
        correlationId: TEST_CORRELATION_ID,
        userId: TEST_USER_ID,
        claimedTokenVersion: TEST_TOKEN_VERSION,
        currentTokenVersion: TEST_TOKEN_VERSION + 1,
        validationResult: 'VERSION_MISMATCH',
        failureReason: 'AUTH_TOKEN_VERSION_MISMATCH',
      };

      logger.log(input);

      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Security Tests
  // -------------------------------------------------------------------------

  describe('Security Constraints', () => {
    it('should NOT log actual token values (only version numbers)', () => {
      const logger = createTestLogger();

      logger.logSuccess(TEST_CORRELATION_ID, TEST_USER_ID, TEST_TOKEN_VERSION);

      const call = mockLogger.info.mock.calls[0]!;
      const message = call[0];
      const logContext = call[1] as Record<string, unknown>;

      // Verify no token strings in log
      expect(message).not.toContain('Bearer');
      expect(message).not.toContain('eyJ'); // JWT prefix
      
      // Verify only version numbers, not full tokens
      expect(typeof logContext.token_version_claimed).toBe('number');
      expect(typeof logContext.token_version_current).toBe('number');
    });

    it('should include event_type field for log aggregation filtering', () => {
      const logger = createTestLogger();

      logger.logSuccess(TEST_CORRELATION_ID, TEST_USER_ID, TEST_TOKEN_VERSION);

      const call = mockLogger.info.mock.calls[0]!;
      const logContext = call[1] as Record<string, unknown>;

      expect(logContext.event_type).toBe('TOKEN_VALIDATION');
    });

    it('should always include correlationId for request tracing', () => {
      const logger = createTestLogger();

      // Test all methods include correlationId
      logger.logSuccess(TEST_CORRELATION_ID, TEST_USER_ID, TEST_TOKEN_VERSION);
      logger.logInvalid(TEST_CORRELATION_ID);
      logger.logExpired(TEST_CORRELATION_ID, null, null);
      logger.logVersionMismatch(TEST_CORRELATION_ID, TEST_USER_ID, 1, 2);

      // Verify all calls have correlationId
      const infoCall = mockLogger.info.mock.calls[0]!;
      const infoContext = infoCall[1] as Record<string, unknown>;
      expect(infoContext.correlation_id).toBe(TEST_CORRELATION_ID);

      mockLogger.warn.mock.calls.forEach((call) => {
        const context = call[1] as Record<string, unknown>;
        expect(context.correlation_id).toBe(TEST_CORRELATION_ID);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 15.3 Compliance Tests
  // -------------------------------------------------------------------------

  describe('Requirement 15.3 Compliance', () => {
    it('should include all required fields: correlationId, userId, tokenVersion, validationResult, failureReason', () => {
      const logger = createTestLogger();

      // Test failure case to verify all fields
      const currentVersion = 6;
      logger.logVersionMismatch(
        TEST_CORRELATION_ID,
        TEST_USER_ID,
        TEST_TOKEN_VERSION,
        currentVersion,
        createTestContext(),
      );

      const call = mockLogger.warn.mock.calls[0]!;
      const logContext = call[1] as Record<string, unknown>;

      // All required fields per Requirement 15.3
      expect(logContext).toHaveProperty('correlation_id', TEST_CORRELATION_ID);
      expect(logContext).toHaveProperty('user_id', TEST_USER_ID);
      expect(logContext).toHaveProperty('token_version_claimed', TEST_TOKEN_VERSION);
      expect(logContext).toHaveProperty('token_version_current', currentVersion);
      expect(logContext).toHaveProperty('validation_result', 'VERSION_MISMATCH');
      expect(logContext).toHaveProperty('failure_reason', 'AUTH_TOKEN_VERSION_MISMATCH');
    });

    it('should support structured JSON logging format', () => {
      const logger = createTestLogger();

      logger.logSuccess(TEST_CORRELATION_ID, TEST_USER_ID, TEST_TOKEN_VERSION);

      // Verify we're passing an object that can be JSON serialized
      const call = mockLogger.info.mock.calls[0]!;
      const logContext = call[1] as Record<string, unknown>;

      expect(() => JSON.stringify(logContext)).not.toThrow();
    });
  });
});


// ---------------------------------------------------------------------------
// CorrelationId Integration Tests (Requirements 15.8)
// ---------------------------------------------------------------------------

describe('CorrelationId Integration (Requirements 15.8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should use provided correlationId when available', () => {
    const logger = createTestLogger();
    const customCorrelationId = 'custom-correlation-id-xyz';

    logger.logSuccess(customCorrelationId, TEST_USER_ID, TEST_TOKEN_VERSION);

    const call = mockLogger.info.mock.calls[0]!;
    const logContext = call[1] as Record<string, unknown>;
    expect(logContext.correlation_id).toBe(customCorrelationId);
    expect(logContext.correlation_id_generated).toBe(false);
  });

  it('should generate fallback correlationId when not provided', () => {
    const logger = createTestLogger();
    const input: LogTokenValidationInput = {
      // correlationId intentionally omitted
      userId: TEST_USER_ID,
      claimedTokenVersion: TEST_TOKEN_VERSION,
      currentTokenVersion: TEST_TOKEN_VERSION,
      validationResult: 'VALID',
      failureReason: null,
    };

    logger.log(input);

    const call = mockLogger.info.mock.calls[0]!;
    const logContext = call[1] as Record<string, unknown>;
    
    // Should have a valid UUID format
    expect(logContext.correlation_id).toBeDefined();
    expect(typeof logContext.correlation_id).toBe('string');
    
    // UUID v4 format validation
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(logContext.correlation_id).toMatch(uuidV4Regex);
    
    // Should indicate it was generated
    expect(logContext.correlation_id_generated).toBe(true);
  });

  it('should generate fallback correlationId when empty string is provided', () => {
    const logger = createTestLogger();
    const input: LogTokenValidationInput = {
      correlationId: '', // Empty string
      userId: TEST_USER_ID,
      claimedTokenVersion: TEST_TOKEN_VERSION,
      currentTokenVersion: TEST_TOKEN_VERSION,
      validationResult: 'VALID',
      failureReason: null,
    };

    logger.log(input);

    const call = mockLogger.info.mock.calls[0]!;
    const logContext = call[1] as Record<string, unknown>;
    
    // Should have a valid UUID format
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(logContext.correlation_id).toMatch(uuidV4Regex);
    expect(logContext.correlation_id_generated).toBe(true);
  });

  it('should preserve external system correlationIds', () => {
    const logger = createTestLogger();
    const externalCorrelationIds = [
      'AWS-Request-123456',
      'X-Cloud-Trace:abc123',
      'datadog-span-id-12345',
    ];

    for (const externalId of externalCorrelationIds) {
      vi.clearAllMocks();
      logger.logSuccess(externalId, TEST_USER_ID, TEST_TOKEN_VERSION);

      const call = mockLogger.info.mock.calls[0]!;
      const logContext = call[1] as Record<string, unknown>;
      expect(logContext.correlation_id).toBe(externalId);
      expect(logContext.correlation_id_generated).toBe(false);
    }
  });

  it('should generate unique correlationIds for each call without provided ID', () => {
    const logger = createTestLogger();
    const generatedIds: string[] = [];

    for (let i = 0; i < 5; i++) {
      vi.clearAllMocks();
      const input: LogTokenValidationInput = {
        // correlationId intentionally omitted
        userId: TEST_USER_ID,
        claimedTokenVersion: TEST_TOKEN_VERSION,
        currentTokenVersion: TEST_TOKEN_VERSION,
        validationResult: 'VALID',
        failureReason: null,
      };

      logger.log(input);

      const call = mockLogger.info.mock.calls[0]!;
      const logContext = call[1] as Record<string, unknown>;
      generatedIds.push(logContext.correlation_id as string);
    }

    // All generated IDs should be unique
    const uniqueIds = new Set(generatedIds);
    expect(uniqueIds.size).toBe(5);
  });
});
