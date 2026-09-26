/**
 * DeprecationHelper Tests — Unit tests for deprecation warning functionality.
 *
 * @see Task 35: Code Path Analysis and Update
 * @see Requirement 12 (AC 5)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DeprecationHelperImpl,
  createDeprecatedUserWrapper,
} from '../DeprecationHelper';
import type { DeprecationLocation } from '../types';

describe('DeprecationHelper', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe('DeprecationHelperImpl', () => {
    it('should create helper with default config', () => {
      const helper = DeprecationHelperImpl();
      expect(helper).toBeDefined();
      expect(helper.getWarnings()).toHaveLength(0);
    });

    it('should create helper with custom config', () => {
      const helper = DeprecationHelperImpl({
        logWarnings: false,
        throwErrors: false,
      });
      
      helper.logWarning({ filePath: 'src/test.ts', lineNumber: 10 });
      
      // Should not log when logWarnings is false
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    describe('logWarning', () => {
      it('should log warning with location info', () => {
        const helper = DeprecationHelperImpl();
        const location: DeprecationLocation = {
          filePath: 'src/route.ts',
          lineNumber: 42,
          functionName: 'myFunction',
        };

        helper.logWarning(location);

        expect(consoleWarnSpy).toHaveBeenCalled();
        const calls = consoleWarnSpy.mock.calls;
        expect(calls.length).toBeGreaterThan(0);
        const call = calls[0]?.[0];
        expect(call).toBeDefined();
        if (typeof call === 'string') {
          expect(call).toContain('[DEPRECATION WARNING]');
          expect(call).toContain('src/route.ts');
          expect(call).toContain('42');
          expect(call).toContain('myFunction');
        }
      });

      it('should store warning in history', () => {
        const helper = DeprecationHelperImpl();
        const location: DeprecationLocation = {
          filePath: 'src/route.ts',
        };

        helper.logWarning(location, { userId: 'user-123' });

        const warnings = helper.getWarnings();
        expect(warnings).toHaveLength(1);
        const warning = warnings[0];
        expect(warning).toBeDefined();
        if (warning) {
          expect(warning.location).toEqual(location);
          expect(warning.context).toEqual({ userId: 'user-123' });
          expect(warning.timestamp).toBeInstanceOf(Date);
        }
      });

      it('should rate limit warnings from same location', () => {
        const helper = DeprecationHelperImpl({
          maxWarningsPerMinute: 2,
        });
        const location: DeprecationLocation = {
          filePath: 'src/test.ts',
          lineNumber: 10,
        };

        // Log 5 warnings from same location
        for (let i = 0; i < 5; i++) {
          helper.logWarning(location);
        }

        // Should only have 2 warnings due to rate limiting
        expect(helper.getWarnings()).toHaveLength(2);
      });

      it('should not rate limit warnings from different locations', () => {
        const helper = DeprecationHelperImpl({
          maxWarningsPerMinute: 2,
        });

        // Log warnings from different locations
        helper.logWarning({ filePath: 'src/test1.ts', lineNumber: 10 });
        helper.logWarning({ filePath: 'src/test2.ts', lineNumber: 10 });
        helper.logWarning({ filePath: 'src/test3.ts', lineNumber: 10 });

        expect(helper.getWarnings()).toHaveLength(3);
      });

      it('should exclude test files by default', () => {
        const helper = DeprecationHelperImpl();

        // These paths match the exclude patterns in DEFAULT_DEPRECATION_CONFIG:
        // '**/*.test.ts', '**/*.spec.ts', '**/test/**', '**/__tests__/**'
        helper.logWarning({ filePath: 'src/components/Button.test.ts' }); // matches **/*.test.ts
        helper.logWarning({ filePath: 'src/__tests__/helper.ts' }); // matches **/__tests__/**
        helper.logWarning({ filePath: 'src/test/integration.ts' }); // matches **/test/**

        // Should not log warnings for test files
        expect(helper.getWarnings()).toHaveLength(0);
      });

      it('should throw error when throwErrors is true', () => {
        const helper = DeprecationHelperImpl({
          throwErrors: true,
        });

        expect(() => {
          helper.logWarning({ filePath: 'src/route.ts', lineNumber: 10 });
        }).toThrow('User.tenantId access is deprecated');
      });
    });

    describe('wrapTenantIdAccess', () => {
      it('should log warning and return value', () => {
        const helper = DeprecationHelperImpl();
        const location: DeprecationLocation = {
          filePath: 'src/route.ts',
          lineNumber: 50,
        };

        const result = helper.wrapTenantIdAccess(
          () => 'tenant-123',
          location,
        );

        expect(result).toBe('tenant-123');
        expect(helper.getWarnings()).toHaveLength(1);
      });

      it('should work with complex return values', () => {
        const helper = DeprecationHelperImpl();
        const complexValue = { id: 'tenant-123', name: 'Test Tenant' };

        const result = helper.wrapTenantIdAccess(
          () => complexValue,
          { filePath: 'src/route.ts' },
        );

        expect(result).toEqual(complexValue);
      });
    });

    describe('clearWarnings', () => {
      it('should clear all stored warnings', () => {
        const helper = DeprecationHelperImpl();

        helper.logWarning({ filePath: 'src/test1.ts' });
        helper.logWarning({ filePath: 'src/test2.ts' });

        expect(helper.getWarnings()).toHaveLength(2);

        helper.clearWarnings();

        expect(helper.getWarnings()).toHaveLength(0);
      });

      it('should reset rate limiters', () => {
        const helper = DeprecationHelperImpl({
          maxWarningsPerMinute: 1,
        });
        const location: DeprecationLocation = { filePath: 'src/test.ts' };

        // First warning should be logged
        helper.logWarning(location);
        expect(helper.getWarnings()).toHaveLength(1);

        // Second warning should be rate limited
        helper.logWarning(location);
        expect(helper.getWarnings()).toHaveLength(1);

        // Clear warnings and rate limiters
        helper.clearWarnings();

        // Now a new warning should be logged
        helper.logWarning(location);
        expect(helper.getWarnings()).toHaveLength(1);
      });
    });

    describe('updateConfig', () => {
      it('should update configuration', () => {
        // Clear spy before this specific test
        consoleWarnSpy.mockClear();
        
        const helper = DeprecationHelperImpl({
          logWarnings: true,
        });

        // First warning should be logged
        helper.logWarning({ filePath: 'src/route.ts' });
        
        // Note: logWarning with includeCallStack logs multiple times (main message + stack)
        // So we just check it was called at least once
        expect(consoleWarnSpy).toHaveBeenCalled();

        // Update config to not log
        helper.updateConfig({ logWarnings: false });

        // Clear and log again
        helper.clearWarnings();
        consoleWarnSpy.mockClear();
        helper.logWarning({ filePath: 'src/route2.ts' });

        // Should not have logged due to config change
        expect(consoleWarnSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('createDeprecatedUserWrapper', () => {
    it('should log warning when accessing tenantId', () => {
      const helper = DeprecationHelperImpl();
      const user = {
        id: 'user-123',
        email: 'test@example.com',
        tenantId: 'tenant-456',
      };

      const wrappedUser = createDeprecatedUserWrapper(
        user,
        helper,
        'src/route.ts',
      );

      // Access tenantId - should trigger warning
      const tenantId = wrappedUser.tenantId;

      expect(tenantId).toBe('tenant-456');
      expect(helper.getWarnings()).toHaveLength(1);
      const warning = helper.getWarnings()[0];
      expect(warning).toBeDefined();
      if (warning) {
        expect(warning.location.filePath).toBe('src/route.ts');
      }
    });

    it('should not log warning when accessing other properties', () => {
      const helper = DeprecationHelperImpl();
      const user = {
        id: 'user-123',
        email: 'test@example.com',
        tenantId: 'tenant-456',
      };

      const wrappedUser = createDeprecatedUserWrapper(
        user,
        helper,
        'src/route.ts',
      );

      // Access non-tenantId properties
      const id = wrappedUser.id;
      const email = wrappedUser.email;

      expect(id).toBe('user-123');
      expect(email).toBe('test@example.com');
      expect(helper.getWarnings()).toHaveLength(0);
    });

    it('should work with null tenantId', () => {
      const helper = DeprecationHelperImpl();
      const user = {
        id: 'user-123',
        tenantId: null,
      };

      const wrappedUser = createDeprecatedUserWrapper(
        user,
        helper,
        'src/route.ts',
      );

      const tenantId = wrappedUser.tenantId;

      expect(tenantId).toBeNull();
      expect(helper.getWarnings()).toHaveLength(1);
    });
  });
});
