/**
 * LoggingConfiguration Tests — Unit tests for structured JSON logging configuration.
 *
 * Tests verify:
 * - Standard log fields are present
 * - Log format is compatible with ELK, CloudWatch, etc.
 * - Environment-based configuration works correctly
 * - Field validation and normalization functions
 *
 * @see Requirements 15.6 — Structured JSON logging for log aggregation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  LOG_LEVELS,
  LOG_LEVEL_VALUES,
  REQUIRED_LOG_FIELDS,
  DEFAULT_PRODUCTION_CONFIG,
  DEFAULT_DEVELOPMENT_CONFIG,
  DEFAULT_STAGING_CONFIG,
  getLoggingConfiguration,
  createLoggingConfiguration,
  buildStructuredLogEntry,
  flattenObject,
  normalizeKeysToSnakeCase,
  validateLogEntry,
  isValidTimestamp,
  isValidLogLevel,
  snakeToCamel,
  camelToSnake,
  type LoggingConfiguration,
} from '../LoggingConfiguration';

describe('LoggingConfiguration', () => {
  describe('LOG_LEVELS', () => {
    it('should define all standard log levels', () => {
      expect(LOG_LEVELS).toContain('debug');
      expect(LOG_LEVELS).toContain('info');
      expect(LOG_LEVELS).toContain('warn');
      expect(LOG_LEVELS).toContain('error');
      expect(LOG_LEVELS).toHaveLength(4);
    });

    it('should have numeric values for each log level', () => {
      expect(LOG_LEVEL_VALUES.debug).toBeLessThan(LOG_LEVEL_VALUES.info);
      expect(LOG_LEVEL_VALUES.info).toBeLessThan(LOG_LEVEL_VALUES.warn);
      expect(LOG_LEVEL_VALUES.warn).toBeLessThan(LOG_LEVEL_VALUES.error);
    });
  });

  describe('REQUIRED_LOG_FIELDS', () => {
    it('should include all mandatory fields for log aggregation', () => {
      expect(REQUIRED_LOG_FIELDS).toContain('timestamp');
      expect(REQUIRED_LOG_FIELDS).toContain('level');
      expect(REQUIRED_LOG_FIELDS).toContain('message');
    });
  });

  describe('DEFAULT_PRODUCTION_CONFIG', () => {
    it('should have appropriate settings for production', () => {
      expect(DEFAULT_PRODUCTION_CONFIG.minLevel).toBe('info');
      expect(DEFAULT_PRODUCTION_CONFIG.prettyPrint).toBe(false);
      expect(DEFAULT_PRODUCTION_CONFIG.includeDebugInfo).toBe(false);
      expect(DEFAULT_PRODUCTION_CONFIG.includeStackTrace).toBe(false);
      expect(DEFAULT_PRODUCTION_CONFIG.maxNestedDepth).toBe(2);
    });

    it('should have service identification', () => {
      expect(DEFAULT_PRODUCTION_CONFIG.service.name).toBe('societ-rt');
      expect(DEFAULT_PRODUCTION_CONFIG.service.environment).toBe('production');
    });
  });

  describe('DEFAULT_DEVELOPMENT_CONFIG', () => {
    it('should have appropriate settings for development', () => {
      expect(DEFAULT_DEVELOPMENT_CONFIG.minLevel).toBe('debug');
      expect(DEFAULT_DEVELOPMENT_CONFIG.prettyPrint).toBe(true);
      expect(DEFAULT_DEVELOPMENT_CONFIG.includeDebugInfo).toBe(true);
      expect(DEFAULT_DEVELOPMENT_CONFIG.includeStackTrace).toBe(true);
    });

    it('should have service identification', () => {
      expect(DEFAULT_DEVELOPMENT_CONFIG.service.name).toBe('societ-rt');
      expect(DEFAULT_DEVELOPMENT_CONFIG.service.environment).toBe('development');
    });
  });

  describe('getLoggingConfiguration', () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it('should return production config for production environment', () => {
      const config = getLoggingConfiguration('production');
      expect(config.service.environment).toBe('production');
      expect(config.minLevel).toBe('info');
      expect(config.prettyPrint).toBe(false);
    });

    it('should return development config for development environment', () => {
      const config = getLoggingConfiguration('development');
      expect(config.service.environment).toBe('development');
      expect(config.minLevel).toBe('debug');
      expect(config.prettyPrint).toBe(true);
    });

    it('should return staging config for staging environment', () => {
      const config = getLoggingConfiguration('staging');
      expect(config.service.environment).toBe('staging');
      expect(config.prettyPrint).toBe(false); // Single-line for log aggregation
    });

    it('should return staging config for test environment', () => {
      const config = getLoggingConfiguration('test');
      expect(config.service.environment).toBe('staging');
    });

    it('should default to development config for unknown environments', () => {
      const config = getLoggingConfiguration('unknown');
      expect(config.service.environment).toBe('development');
    });
  });

  describe('createLoggingConfiguration', () => {
    it('should merge overrides with base config', () => {
      const config = createLoggingConfiguration(
        { minLevel: 'warn' },
        DEFAULT_DEVELOPMENT_CONFIG,
      );
      expect(config.minLevel).toBe('warn');
      expect(config.prettyPrint).toBe(true); // From base
    });

    it('should merge service overrides', () => {
      const config = createLoggingConfiguration({
        service: { name: 'custom-service', version: '2.0.0', environment: 'custom' },
      });
      expect(config.service.name).toBe('custom-service');
      expect(config.service.version).toBe('2.0.0');
    });
  });

  describe('buildStructuredLogEntry', () => {
    it('should include all required fields', () => {
      const entry = buildStructuredLogEntry('info', 'Test message');

      expect(entry.timestamp).toBeDefined();
      expect(entry.level).toBe('info');
      expect(entry.message).toBe('Test message');
    });

    it('should include service identification', () => {
      const entry = buildStructuredLogEntry('info', 'Test message');

      expect(entry.service_name).toBeDefined();
      expect(entry.service_version).toBeDefined();
      expect(entry.environment).toBeDefined();
    });

    it('should include context fields', () => {
      const entry = buildStructuredLogEntry('info', 'Test message', {
        correlation_id: 'abc-123',
        user_id: 'user-1',
        tenant_id: 'tenant-1',
      });

      expect(entry.correlation_id).toBe('abc-123');
      expect(entry.user_id).toBe('user-1');
      expect(entry.tenant_id).toBe('tenant-1');
    });

    it('should generate valid ISO 8601 timestamp', () => {
      const entry = buildStructuredLogEntry('info', 'Test message');
      expect(isValidTimestamp(entry.timestamp)).toBe(true);
    });
  });

  describe('flattenObject', () => {
    it('should flatten nested objects', () => {
      const obj = {
        user: {
          profile: {
            name: 'John',
          },
        },
      };

      const flat = flattenObject(obj);
      expect(flat['user.profile.name']).toBe('John');
    });

    it('should respect maxDepth', () => {
      const obj = {
        level1: {
          level2: {
            level3: {
              level4: 'value',
            },
          },
        },
      };

      const flat = flattenObject(obj, '', 2);
      // At depth 2, level3 should be flattened
      expect(flat['level1.level2.level3']).toEqual({ level4: 'value' });
    });

    it('should not flatten arrays', () => {
      const obj = {
        items: ['a', 'b', 'c'],
      };

      const flat = flattenObject(obj);
      expect(flat.items).toEqual(['a', 'b', 'c']);
    });
  });

  describe('normalizeKeysToSnakeCase', () => {
    it('should convert camelCase keys to snake_case', () => {
      const obj = {
        correlationId: 'abc',
        userId: 'user-1',
        tenantId: 'tenant-1',
      };

      const normalized = normalizeKeysToSnakeCase(obj);
      expect(normalized.correlation_id).toBe('abc');
      expect(normalized.user_id).toBe('user-1');
      expect(normalized.tenant_id).toBe('tenant-1');
    });

    it('should handle nested objects', () => {
      const obj = {
        userProfile: {
          firstName: 'John',
          lastName: 'Doe',
        },
      };

      const normalized = normalizeKeysToSnakeCase(obj);
      expect((normalized.user_profile as Record<string, unknown>).first_name).toBe('John');
      expect((normalized.user_profile as Record<string, unknown>).last_name).toBe('Doe');
    });
  });

  describe('validateLogEntry', () => {
    it('should validate complete log entry', () => {
      const entry = {
        timestamp: '2024-01-15T10:30:00.000Z',
        level: 'info',
        message: 'Test message',
      };

      const result = validateLogEntry(entry);
      expect(result.valid).toBe(true);
      expect(result.missingFields).toHaveLength(0);
    });

    it('should detect missing fields', () => {
      const entry = {
        level: 'info',
        // Missing timestamp and message
      };

      const result = validateLogEntry(entry);
      expect(result.valid).toBe(false);
      expect(result.missingFields).toContain('timestamp');
      expect(result.missingFields).toContain('message');
    });

    it('should handle null values as missing', () => {
      const entry = {
        timestamp: null,
        level: 'info',
        message: 'Test',
      };

      const result = validateLogEntry(entry);
      expect(result.valid).toBe(false);
      expect(result.missingFields).toContain('timestamp');
    });

    it('should handle non-object input', () => {
      const result = validateLogEntry('not an object');
      expect(result.valid).toBe(false);
      expect(result.missingFields).toHaveLength(3);
    });
  });

  describe('isValidTimestamp', () => {
    it('should accept valid ISO 8601 timestamps', () => {
      expect(isValidTimestamp('2024-01-15T10:30:00.000Z')).toBe(true);
      expect(isValidTimestamp('2024-01-15T10:30:00Z')).toBe(true);
    });

    it('should reject invalid timestamps', () => {
      expect(isValidTimestamp('2024-01-15')).toBe(false);
      expect(isValidTimestamp('not a timestamp')).toBe(false);
      expect(isValidTimestamp('2024-01-15T10:30:00')).toBe(false); // Missing Z
    });
  });

  describe('isValidLogLevel', () => {
    it('should accept valid log levels', () => {
      expect(isValidLogLevel('debug')).toBe(true);
      expect(isValidLogLevel('info')).toBe(true);
      expect(isValidLogLevel('warn')).toBe(true);
      expect(isValidLogLevel('error')).toBe(true);
    });

    it('should reject invalid log levels', () => {
      expect(isValidLogLevel('trace')).toBe(false);
      expect(isValidLogLevel('fatal')).toBe(false);
      expect(isValidLogLevel('INFO')).toBe(false); // Case sensitive
    });
  });

  describe('snakeToCamel', () => {
    it('should convert snake_case to camelCase', () => {
      expect(snakeToCamel('correlation_id')).toBe('correlationId');
      expect(snakeToCamel('user_id')).toBe('userId');
      expect(snakeToCamel('service_name')).toBe('serviceName');
    });

    it('should handle multiple underscores', () => {
      expect(snakeToCamel('http_request_method')).toBe('httpRequestMethod');
    });

    it('should leave already camelCase unchanged', () => {
      expect(snakeToCamel('correlationId')).toBe('correlationId');
    });
  });

  describe('camelToSnake', () => {
    it('should convert camelCase to snake_case', () => {
      expect(camelToSnake('correlationId')).toBe('correlation_id');
      expect(camelToSnake('userId')).toBe('user_id');
      expect(camelToSnake('serviceName')).toBe('service_name');
    });

    it('should handle multiple capitals', () => {
      expect(camelToSnake('httpRequestMethod')).toBe('http_request_method');
    });

    it('should leave already snake_case unchanged', () => {
      expect(camelToSnake('correlation_id')).toBe('correlation_id');
    });
  });
});

describe('Log Aggregation Compatibility', () => {
  describe('ELK Stack Format', () => {
    it('should output JSON with fields compatible with ELK', () => {
      const entry = buildStructuredLogEntry('info', 'Test message', {
        correlation_id: 'trace-123',
        user_id: 'user-1',
        tenant_id: 'org-1',
      });

      // ELK uses @timestamp but we use timestamp for broader compatibility
      expect(entry.timestamp).toBeDefined();
      expect(typeof entry.timestamp).toBe('string');

      // ELK uses log.level but we use level for simplicity
      expect(entry.level).toBeDefined();

      // Correlation ID maps to trace.id in ELK
      expect(entry.correlation_id).toBeDefined();
    });
  });

  describe('CloudWatch Logs Format', () => {
    it('should output single-line JSON for CloudWatch', () => {
      const entry = buildStructuredLogEntry('info', 'Test message');
      const json = JSON.stringify(entry);

      // Should be single line (no newlines in the JSON)
      expect(json.split('\n')).toHaveLength(1);
    });

    it('should include requestId-compatible correlation_id', () => {
      const entry = buildStructuredLogEntry('info', 'Test message', {
        correlation_id: 'request-123',
      });

      expect(entry.correlation_id).toBe('request-123');
    });
  });

  describe('General Log Aggregation', () => {
    it('should use snake_case field names', () => {
      const entry = buildStructuredLogEntry('info', 'Test message', {
        correlation_id: 'abc',
        user_id: 'user-1',
        tenant_id: 'tenant-1',
        org_unit_id: 'org-1',
      });

      // All context fields should use snake_case
      expect('correlation_id' in entry).toBe(true);
      expect('user_id' in entry).toBe(true);
      expect('tenant_id' in entry).toBe(true);
      expect('org_unit_id' in entry).toBe(true);
    });

    it('should have consistent timestamp format', () => {
      const entry1 = buildStructuredLogEntry('info', 'Message 1');
      const entry2 = buildStructuredLogEntry('info', 'Message 2');

      // Both should be valid ISO 8601
      expect(isValidTimestamp(entry1.timestamp)).toBe(true);
      expect(isValidTimestamp(entry2.timestamp)).toBe(true);

      // Both should end with Z (UTC)
      expect(entry1.timestamp.endsWith('Z')).toBe(true);
      expect(entry2.timestamp.endsWith('Z')).toBe(true);
    });

    it('should support event_type for filtering', () => {
      const entry = buildStructuredLogEntry('info', 'Auth decision', {
        event_type: 'authorization_decision',
      });

      expect(entry.event_type).toBe('authorization_decision');
    });
  });
});
