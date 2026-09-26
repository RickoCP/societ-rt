/**
 * Logger Tests — Unit tests for structured JSON logger.
 *
 * Tests verify:
 * - Standard log fields are present in output
 * - Sensitive data is sanitized
 * - Log aggregation compatibility
 * - Environment-specific behavior
 *
 * @see Requirements 15.5 — Ensure no sensitive data in logs
 * @see Requirements 15.6 — Structured JSON logging for log aggregation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createLogger, type Logger, type LogContext } from '../Logger';
import { createLogSanitizer } from '../LogSanitizer';
import {
  DEFAULT_PRODUCTION_CONFIG,
  DEFAULT_DEVELOPMENT_CONFIG,
} from '../LoggingConfiguration';

describe('Logger', () => {
  let capturedOutput: string[] = [];
  const originalWrite = process.stdout.write;

  beforeEach(() => {
    capturedOutput = [];
    // Capture stdout writes
    process.stdout.write = vi.fn((chunk: string | Uint8Array) => {
      if (typeof chunk === 'string') {
        capturedOutput.push(chunk);
      }
      return true;
    }) as typeof process.stdout.write;
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
  });

  describe('createLogger', () => {
    it('should create a logger with all methods', () => {
      const logger = createLogger();

      expect(logger.info).toBeDefined();
      expect(logger.warn).toBeDefined();
      expect(logger.error).toBeDefined();
      expect(logger.debug).toBeDefined();
    });
  });

  describe('Structured JSON Output', () => {
    it('should output valid JSON', () => {
      const logger = createLogger({
        loggingConfig: DEFAULT_PRODUCTION_CONFIG,
      });

      logger.info('Test message');

      expect(capturedOutput).toHaveLength(1);
      expect(() => JSON.parse(capturedOutput[0]!)).not.toThrow();
    });

    it('should include standard fields (timestamp, level, message)', () => {
      const logger = createLogger({
        loggingConfig: DEFAULT_PRODUCTION_CONFIG,
      });

      logger.info('Test message');

      const logEntry = JSON.parse(capturedOutput[0]!) as Record<string, unknown>;

      expect(logEntry.timestamp).toBeDefined();
      expect(logEntry.level).toBe('info');
      expect(logEntry.message).toBe('Test message');
    });

    it('should include service identification fields', () => {
      const logger = createLogger({
        loggingConfig: DEFAULT_PRODUCTION_CONFIG,
      });

      logger.info('Test message');

      const logEntry = JSON.parse(capturedOutput[0]!) as Record<string, unknown>;

      expect(logEntry.service_name).toBe('societ-rt');
      expect(logEntry.service_version).toBeDefined();
      expect(logEntry.environment).toBe('production');
    });

    it('should include context fields when provided', () => {
      const logger = createLogger({
        loggingConfig: DEFAULT_PRODUCTION_CONFIG,
      });

      logger.info('Test message', {
        correlation_id: 'abc-123',
        user_id: 'user-1',
        tenant_id: 'tenant-1',
      });

      const logEntry = JSON.parse(capturedOutput[0]!) as Record<string, unknown>;

      expect(logEntry.correlation_id).toBe('abc-123');
      expect(logEntry.user_id).toBe('user-1');
      expect(logEntry.tenant_id).toBe('tenant-1');
    });

    it('should output single-line JSON in production mode', () => {
      const logger = createLogger({
        loggingConfig: DEFAULT_PRODUCTION_CONFIG,
      });

      logger.info('Test message', { key: 'value' });

      // Should be single line (ends with \n)
      expect(capturedOutput[0]!.trim().split('\n')).toHaveLength(1);
    });

    it('should output pretty-printed JSON in development mode', () => {
      const logger = createLogger({
        loggingConfig: DEFAULT_DEVELOPMENT_CONFIG,
      });

      logger.info('Test message', { key: 'value' });

      // Should be multi-line (pretty printed)
      expect(capturedOutput[0]!.trim().split('\n').length).toBeGreaterThan(1);
    });
  });

  describe('Log Level Filtering', () => {
    it('should filter logs below minimum level', () => {
      const logger = createLogger({
        loggingConfig: DEFAULT_PRODUCTION_CONFIG, // minLevel: 'info'
      });

      logger.debug('Debug message');

      // Debug should be filtered in production (minLevel: info)
      expect(capturedOutput).toHaveLength(0);
    });

    it('should output logs at or above minimum level', () => {
      const logger = createLogger({
        loggingConfig: DEFAULT_PRODUCTION_CONFIG, // minLevel: 'info'
      });

      logger.info('Info message');
      logger.warn('Warn message');
      logger.error('Error message');

      expect(capturedOutput).toHaveLength(3);
    });

    it('should output debug logs in development mode', () => {
      const logger = createLogger({
        loggingConfig: DEFAULT_DEVELOPMENT_CONFIG, // minLevel: 'debug'
      });

      logger.debug('Debug message');

      expect(capturedOutput).toHaveLength(1);
    });
  });

  describe('Sensitive Data Sanitization', () => {
    it('should redact passwords', () => {
      const logger = createLogger({
        loggingConfig: DEFAULT_PRODUCTION_CONFIG,
      });

      logger.info('User action', {
        password: 'secret123',
        user_id: 'user-1',
      });

      const logEntry = JSON.parse(capturedOutput[0]!) as Record<string, unknown>;

      expect(logEntry.password).toBe('[REDACTED]');
      expect(logEntry.user_id).toBe('user-1');
    });

    it('should redact tokens', () => {
      const logger = createLogger({
        loggingConfig: DEFAULT_PRODUCTION_CONFIG,
      });

      logger.info('Auth event', {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refreshToken: 'refresh-token-value',
      });

      const logEntry = JSON.parse(capturedOutput[0]!) as Record<string, unknown>;

      expect(logEntry.accessToken).toBe('[REDACTED]');
      expect(logEntry.refreshToken).toBe('[REDACTED]');
    });

    it('should mask email addresses', () => {
      const logger = createLogger({
        loggingConfig: DEFAULT_PRODUCTION_CONFIG,
      });

      logger.info('User registered', {
        email: 'john.doe@example.com',
      });

      const logEntry = JSON.parse(capturedOutput[0]!) as Record<string, unknown>;

      // Email should be masked, not fully visible
      expect(logEntry.email).not.toBe('john.doe@example.com');
      expect((logEntry.email as string).includes('***')).toBe(true);
    });

    it('should redact sensitive patterns in values', () => {
      const logger = createLogger({
        loggingConfig: DEFAULT_PRODUCTION_CONFIG,
      });

      logger.info('Request', {
        header: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
      });

      const logEntry = JSON.parse(capturedOutput[0]!) as Record<string, unknown>;

      // Should be redacted because it contains Bearer token pattern
      expect(logEntry.header).toBe('[REDACTED_PATTERN]');
    });
  });

  describe('Log Levels', () => {
    it('should set correct level for info', () => {
      const logger = createLogger({
        loggingConfig: DEFAULT_PRODUCTION_CONFIG,
      });

      logger.info('Info message');

      const logEntry = JSON.parse(capturedOutput[0]!) as Record<string, unknown>;
      expect(logEntry.level).toBe('info');
    });

    it('should set correct level for warn', () => {
      const logger = createLogger({
        loggingConfig: DEFAULT_PRODUCTION_CONFIG,
      });

      logger.warn('Warning message');

      const logEntry = JSON.parse(capturedOutput[0]!) as Record<string, unknown>;
      expect(logEntry.level).toBe('warn');
    });

    it('should set correct level for error', () => {
      const logger = createLogger({
        loggingConfig: DEFAULT_PRODUCTION_CONFIG,
      });

      logger.error('Error message');

      const logEntry = JSON.parse(capturedOutput[0]!) as Record<string, unknown>;
      expect(logEntry.level).toBe('error');
    });

    it('should set correct level for debug', () => {
      const logger = createLogger({
        loggingConfig: DEFAULT_DEVELOPMENT_CONFIG,
      });

      logger.debug('Debug message');

      const logEntry = JSON.parse(capturedOutput[0]!) as Record<string, unknown>;
      expect(logEntry.level).toBe('debug');
    });
  });

  describe('Custom Configuration', () => {
    it('should allow custom service name', () => {
      const logger = createLogger({
        loggingConfig: DEFAULT_PRODUCTION_CONFIG,
        serviceName: 'custom-service',
      });

      logger.info('Test');

      const logEntry = JSON.parse(capturedOutput[0]!) as Record<string, unknown>;
      expect(logEntry.service_name).toBe('custom-service');
    });

    it('should allow custom service version', () => {
      const logger = createLogger({
        loggingConfig: DEFAULT_PRODUCTION_CONFIG,
        serviceVersion: '2.0.0-custom',
      });

      logger.info('Test');

      const logEntry = JSON.parse(capturedOutput[0]!) as Record<string, unknown>;
      expect(logEntry.service_version).toBe('2.0.0-custom');
    });

    it('should allow custom sanitizer', () => {
      const customSanitizer = createLogSanitizer({
        additionalSensitiveKeys: new Set(['customSecret']),
      });

      const logger = createLogger({
        loggingConfig: DEFAULT_PRODUCTION_CONFIG,
        sanitizer: customSanitizer,
      });

      logger.info('Test', { customSecret: 'secret-value' });

      const logEntry = JSON.parse(capturedOutput[0]!) as Record<string, unknown>;
      expect(logEntry.customSecret).toBe('[REDACTED]');
    });
  });

  describe('Timestamp Format', () => {
    it('should output ISO 8601 timestamp', () => {
      const logger = createLogger({
        loggingConfig: DEFAULT_PRODUCTION_CONFIG,
      });

      logger.info('Test');

      const logEntry = JSON.parse(capturedOutput[0]!) as Record<string, unknown>;
      const timestamp = logEntry.timestamp as string;

      // Should be valid ISO 8601
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/);
    });

    it('should output UTC timestamp (ends with Z)', () => {
      const logger = createLogger({
        loggingConfig: DEFAULT_PRODUCTION_CONFIG,
      });

      logger.info('Test');

      const logEntry = JSON.parse(capturedOutput[0]!) as Record<string, unknown>;
      const timestamp = logEntry.timestamp as string;

      expect(timestamp.endsWith('Z')).toBe(true);
    });
  });
});

describe('Log Aggregation Integration', () => {
  let capturedOutput: string[] = [];
  const originalWrite = process.stdout.write;

  beforeEach(() => {
    capturedOutput = [];
    process.stdout.write = vi.fn((chunk: string | Uint8Array) => {
      if (typeof chunk === 'string') {
        capturedOutput.push(chunk);
      }
      return true;
    }) as typeof process.stdout.write;
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
  });

  describe('ELK Stack Compatibility', () => {
    it('should include all fields needed for ELK', () => {
      const logger = createLogger({
        loggingConfig: DEFAULT_PRODUCTION_CONFIG,
      });

      logger.info('Authorization decision', {
        correlation_id: 'trace-123',
        user_id: 'user-1',
        tenant_id: 'org-1',
        event_type: 'authorization_decision',
        decision: 'ALLOW',
      });

      const logEntry = JSON.parse(capturedOutput[0]!) as Record<string, unknown>;

      // Required by ELK for @timestamp
      expect(logEntry.timestamp).toBeDefined();

      // Required by ELK for log.level
      expect(logEntry.level).toBeDefined();

      // Required by ELK for message
      expect(logEntry.message).toBeDefined();

      // Useful for ELK trace.id
      expect(logEntry.correlation_id).toBeDefined();

      // Useful for ELK service identification
      expect(logEntry.service_name).toBeDefined();
    });
  });

  describe('CloudWatch Compatibility', () => {
    it('should output single-line JSON for CloudWatch ingestion', () => {
      const logger = createLogger({
        loggingConfig: DEFAULT_PRODUCTION_CONFIG,
      });

      logger.info('Event logged', {
        correlation_id: 'request-123',
        duration_ms: 42,
      });

      // CloudWatch expects single-line JSON
      const output = capturedOutput[0]!.trim();
      expect(output.split('\n')).toHaveLength(1);

      // Should parse correctly
      expect(() => JSON.parse(output)).not.toThrow();
    });
  });

  describe('General Aggregation Fields', () => {
    it('should use snake_case for all context fields', () => {
      const logger = createLogger({
        loggingConfig: DEFAULT_PRODUCTION_CONFIG,
      });

      logger.info('Test', {
        correlation_id: 'abc',
        user_id: 'u1',
        tenant_id: 't1',
        membership_id: 'm1',
        org_unit_id: 'ou1',
        event_type: 'test',
        duration_ms: 100,
        status_code: 200,
      });

      const logEntry = JSON.parse(capturedOutput[0]!) as Record<string, unknown>;

      // All field names should be snake_case
      expect(logEntry.correlation_id).toBeDefined();
      expect(logEntry.user_id).toBeDefined();
      expect(logEntry.tenant_id).toBeDefined();
      expect(logEntry.membership_id).toBeDefined();
      expect(logEntry.org_unit_id).toBeDefined();
      expect(logEntry.event_type).toBeDefined();
      expect(logEntry.duration_ms).toBeDefined();
      expect(logEntry.status_code).toBeDefined();
    });
  });
});
