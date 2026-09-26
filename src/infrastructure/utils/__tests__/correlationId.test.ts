/**
 * CorrelationId Utility Tests
 *
 * Tests for the correlation ID generator and helper functions.
 * These utilities are used across all audit loggers for request tracing.
 *
 * @see Requirements 15.8 — Integrate with correlationId system
 * @see Requirements 25.1, 25.2 — Logging and Observability
 */

import { describe, it, expect, vi } from 'vitest';
import {
  generateCorrelationId,
  getOrGenerateCorrelationId,
  isValidCorrelationId,
} from '../correlationId';

describe('correlationId utilities', () => {
  describe('generateCorrelationId', () => {
    it('should generate a valid UUID v4 string', () => {
      const correlationId = generateCorrelationId();

      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(correlationId).toMatch(uuidV4Regex);
    });

    it('should generate unique IDs on each call', () => {
      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();
      const id3 = generateCorrelationId();

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });

    it('should generate IDs of consistent length (36 characters for UUID)', () => {
      const correlationId = generateCorrelationId();

      expect(correlationId.length).toBe(36);
    });
  });

  describe('getOrGenerateCorrelationId', () => {
    it('should return provided correlationId when given a valid string', () => {
      const existingId = 'existing-correlation-id-123';
      const result = getOrGenerateCorrelationId(existingId);

      expect(result).toBe(existingId);
    });

    it('should generate a new ID when correlationId is undefined', () => {
      const result = getOrGenerateCorrelationId(undefined);

      // Should be a valid UUID
      const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(result).toMatch(uuidV4Regex);
    });

    it('should generate a new ID when correlationId is null', () => {
      const result = getOrGenerateCorrelationId(null);

      // Should be a valid UUID
      const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(result).toMatch(uuidV4Regex);
    });

    it('should generate a new ID when correlationId is empty string', () => {
      const result = getOrGenerateCorrelationId('');

      // Empty string is falsy, so should generate a new ID
      const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(result).toMatch(uuidV4Regex);
    });

    it('should preserve external system correlation IDs', () => {
      // Some external systems might use different ID formats
      const externalIds = [
        'AWS-Request-123456',
        'X-Cloud-Trace-Context:abc123',
        'span-12345-trace-67890',
      ];

      for (const externalId of externalIds) {
        const result = getOrGenerateCorrelationId(externalId);
        expect(result).toBe(externalId);
      }
    });
  });

  describe('isValidCorrelationId', () => {
    it('should return true for valid UUID correlation ID', () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      expect(isValidCorrelationId(validUuid)).toBe(true);
    });

    it('should return true for custom string correlation ID', () => {
      const customId = 'custom-correlation-123';
      expect(isValidCorrelationId(customId)).toBe(true);
    });

    it('should return true for external system correlation IDs', () => {
      expect(isValidCorrelationId('AWS-Request-123456')).toBe(true);
      expect(isValidCorrelationId('X-Cloud-Trace-Context:abc123')).toBe(true);
    });

    it('should return false for null', () => {
      expect(isValidCorrelationId(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isValidCorrelationId(undefined)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidCorrelationId('')).toBe(false);
    });

    it('should return false for strings longer than 128 characters', () => {
      const longString = 'a'.repeat(129);
      expect(isValidCorrelationId(longString)).toBe(false);
    });

    it('should return true for strings up to 128 characters', () => {
      const maxLengthString = 'a'.repeat(128);
      expect(isValidCorrelationId(maxLengthString)).toBe(true);
    });
  });

  describe('type narrowing', () => {
    it('should work as type guard for isValidCorrelationId', () => {
      const maybeId: string | null | undefined = 'valid-id';

      if (isValidCorrelationId(maybeId)) {
        // TypeScript should know maybeId is string here
        const id: string = maybeId;
        expect(typeof id).toBe('string');
      }
    });
  });
});

describe('correlationId integration with audit loggers', () => {
  it('should provide consistent fallback behavior', () => {
    // Simulating what audit loggers do internally
    const inputWithId = 'provided-id';
    const inputWithoutId = undefined;

    const effectiveId1 = inputWithId || generateCorrelationId();
    const effectiveId2 = inputWithoutId || generateCorrelationId();

    expect(effectiveId1).toBe('provided-id');
    expect(effectiveId2).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('should support the pattern used in all audit loggers', () => {
    // This is the pattern used in AuthorizationAuditLogger, ContextSwitchAuditLogger, TokenValidationLogger
    const testCases = [
      { input: 'existing-id', expectedGenerated: false },
      { input: '', expectedGenerated: true },
      { input: undefined, expectedGenerated: true },
      { input: null, expectedGenerated: true },
    ];

    for (const { input, expectedGenerated } of testCases) {
      const effectiveId = input || generateCorrelationId();
      const wasGenerated = !input;

      expect(wasGenerated).toBe(expectedGenerated);
      expect(typeof effectiveId).toBe('string');
      expect(effectiveId.length).toBeGreaterThan(0);
    }
  });
});
