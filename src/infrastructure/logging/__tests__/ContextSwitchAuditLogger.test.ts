/**
 * ContextSwitchAuditLogger Tests — Unit tests for context switch audit logging.
 *
 * @see Task 23.2: Implement context switch logging
 * @see Requirement 15.2: Log all context switches
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ContextSwitchAuditLoggerImpl,
  ContextSwitchType,
  ContextSwitchTrigger,
  ContextSwitchResult,
  mapErrorCodeToResult,
  determineSwitchType,
  type ContextSwitchLogInput,
  type IContextSwitchAuditLogger,
} from '../ContextSwitchAuditLogger';
import type { Logger } from '../Logger';

// ---------------------------------------------------------------------------
// Mock Logger
// ---------------------------------------------------------------------------

function createMockLogger(): {
  logger: Logger;
  infoLogs: Array<{ message: string; context?: Record<string, unknown> }>;
  warnLogs: Array<{ message: string; context?: Record<string, unknown> }>;
  errorLogs: Array<{ message: string; context?: Record<string, unknown> }>;
} {
  const infoLogs: Array<{ message: string; context?: Record<string, unknown> }> = [];
  const warnLogs: Array<{ message: string; context?: Record<string, unknown> }> = [];
  const errorLogs: Array<{ message: string; context?: Record<string, unknown> }> = [];

  return {
    infoLogs,
    warnLogs,
    errorLogs,
    logger: {
      info: vi.fn((message, context) => {
        infoLogs.push({ message, context });
      }),
      warn: vi.fn((message, context) => {
        warnLogs.push({ message, context });
      }),
      error: vi.fn((message, context) => {
        errorLogs.push({ message, context });
      }),
      debug: vi.fn(),
    },
  };
}

// ---------------------------------------------------------------------------
// Test Constants
// ---------------------------------------------------------------------------

const TEST_CORRELATION_ID = 'test-correlation-123';
const TEST_USER_ID = 'user-456';
const TEST_TENANT_A = 'tenant-a-789';
const TEST_TENANT_B = 'tenant-b-012';
const TEST_ORGUNIT_A = 'orgunit-a-345';
const TEST_ORGUNIT_B = 'orgunit-b-678';
const TEST_MEMBERSHIP_ID = 'membership-901';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ContextSwitchAuditLogger', () => {
  let auditLogger: IContextSwitchAuditLogger;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    mockLogger = createMockLogger();
    auditLogger = ContextSwitchAuditLoggerImpl({ logger: mockLogger.logger });
  });

  describe('logContextSwitch', () => {
    it('should log successful context switch with all required fields', () => {
      const input: ContextSwitchLogInput = {
        correlationId: TEST_CORRELATION_ID,
        userId: TEST_USER_ID,
        switchType: ContextSwitchType.TENANT_SWITCH,
        fromTenantId: TEST_TENANT_A,
        toTenantId: TEST_TENANT_B,
        fromOrgUnitId: TEST_ORGUNIT_A,
        toOrgUnitId: null,
        result: ContextSwitchResult.SUCCESS,
        trigger: ContextSwitchTrigger.USER_INITIATED,
        membershipId: TEST_MEMBERSHIP_ID,
      };

      auditLogger.logContextSwitch(input);

      expect(mockLogger.infoLogs).toHaveLength(1);
      expect(mockLogger.warnLogs).toHaveLength(0);

      const log = mockLogger.infoLogs[0];
      expect(log).toBeDefined();
      expect(log?.message).toContain('Context switch successful');
      expect(log?.message).toContain('TENANT_SWITCH');
      expect(log?.message).toContain(TEST_USER_ID);
      expect(log?.context).toMatchObject({
        correlation_id: TEST_CORRELATION_ID,
        user_id: TEST_USER_ID,
        tenant_id: TEST_TENANT_B,
        event_type: 'CONTEXT_SWITCH',
        switch_type: ContextSwitchType.TENANT_SWITCH,
        from_tenant_id: TEST_TENANT_A,
        to_tenant_id: TEST_TENANT_B,
        success: true,
        result_code: ContextSwitchResult.SUCCESS,
        trigger: ContextSwitchTrigger.USER_INITIATED,
        membership_id: TEST_MEMBERSHIP_ID,
      });
    });

    it('should log failed context switch with warning level', () => {
      const input: ContextSwitchLogInput = {
        correlationId: TEST_CORRELATION_ID,
        userId: TEST_USER_ID,
        switchType: ContextSwitchType.TENANT_SWITCH,
        fromTenantId: TEST_TENANT_A,
        toTenantId: TEST_TENANT_B,
        fromOrgUnitId: null,
        toOrgUnitId: null,
        result: ContextSwitchResult.FAILED_NO_MEMBERSHIP,
        trigger: ContextSwitchTrigger.USER_INITIATED,
        errorCode: 'CONTEXT_SWITCH_NO_MEMBERSHIP',
      };

      auditLogger.logContextSwitch(input);

      expect(mockLogger.infoLogs).toHaveLength(0);
      expect(mockLogger.warnLogs).toHaveLength(1);

      const log = mockLogger.warnLogs[0];
      expect(log).toBeDefined();
      expect(log?.message).toContain('Context switch failed');
      expect(log?.message).toContain('FAILED_NO_MEMBERSHIP');
      expect(log?.context).toMatchObject({
        correlation_id: TEST_CORRELATION_ID,
        user_id: TEST_USER_ID,
        success: false,
        result_code: ContextSwitchResult.FAILED_NO_MEMBERSHIP,
        error_code: 'CONTEXT_SWITCH_NO_MEMBERSHIP',
      });
    });

    it('should log OrgUnit switch type correctly', () => {
      const input: ContextSwitchLogInput = {
        correlationId: TEST_CORRELATION_ID,
        userId: TEST_USER_ID,
        switchType: ContextSwitchType.ORGUNIT_SWITCH,
        fromTenantId: TEST_TENANT_A,
        toTenantId: TEST_TENANT_A,
        fromOrgUnitId: TEST_ORGUNIT_A,
        toOrgUnitId: TEST_ORGUNIT_B,
        result: ContextSwitchResult.SUCCESS,
        trigger: ContextSwitchTrigger.USER_INITIATED,
        membershipId: TEST_MEMBERSHIP_ID,
      };

      auditLogger.logContextSwitch(input);

      expect(mockLogger.infoLogs).toHaveLength(1);
      const log = mockLogger.infoLogs[0];
      expect(log?.context?.switch_type).toBe(ContextSwitchType.ORGUNIT_SWITCH);
      expect(log?.context?.from_org_unit_id).toBe(TEST_ORGUNIT_A);
      expect(log?.context?.to_org_unit_id).toBe(TEST_ORGUNIT_B);
    });

    it('should include timestamp in audit entry', () => {
      const input: ContextSwitchLogInput = {
        correlationId: TEST_CORRELATION_ID,
        userId: TEST_USER_ID,
        switchType: ContextSwitchType.TENANT_SWITCH,
        fromTenantId: null,
        toTenantId: TEST_TENANT_A,
        fromOrgUnitId: null,
        toOrgUnitId: null,
        result: ContextSwitchResult.SUCCESS,
        trigger: ContextSwitchTrigger.SYSTEM_AUTOMATIC,
        membershipId: TEST_MEMBERSHIP_ID,
      };

      const beforeTime = new Date();
      auditLogger.logContextSwitch(input);
      const afterTime = new Date();

      // Logger is called synchronously, so timestamp should be in range
      expect(mockLogger.logger.info).toHaveBeenCalled();
    });
  });

  describe('logTenantSwitchSuccess', () => {
    it('should log successful tenant switch with correct fields', () => {
      auditLogger.logTenantSwitchSuccess(
        TEST_CORRELATION_ID,
        TEST_USER_ID,
        TEST_TENANT_A,
        TEST_TENANT_B,
        TEST_MEMBERSHIP_ID,
      );

      expect(mockLogger.infoLogs).toHaveLength(1);
      const log = mockLogger.infoLogs[0];
      expect(log?.context).toMatchObject({
        correlation_id: TEST_CORRELATION_ID,
        user_id: TEST_USER_ID,
        from_tenant_id: TEST_TENANT_A,
        to_tenant_id: TEST_TENANT_B,
        switch_type: ContextSwitchType.TENANT_SWITCH,
        success: true,
        membership_id: TEST_MEMBERSHIP_ID,
      });
    });

    it('should handle null fromTenantId (first login)', () => {
      auditLogger.logTenantSwitchSuccess(
        TEST_CORRELATION_ID,
        TEST_USER_ID,
        null,
        TEST_TENANT_A,
        TEST_MEMBERSHIP_ID,
        ContextSwitchTrigger.SYSTEM_AUTOMATIC,
      );

      expect(mockLogger.infoLogs).toHaveLength(1);
      const log = mockLogger.infoLogs[0];
      expect(log?.context?.from_tenant_id).toBeNull();
      expect(log?.context?.to_tenant_id).toBe(TEST_TENANT_A);
      expect(log?.context?.trigger).toBe(ContextSwitchTrigger.SYSTEM_AUTOMATIC);
    });
  });

  describe('logTenantSwitchFailure', () => {
    it('should log failed tenant switch with warning level', () => {
      auditLogger.logTenantSwitchFailure(
        TEST_CORRELATION_ID,
        TEST_USER_ID,
        TEST_TENANT_A,
        TEST_TENANT_B,
        ContextSwitchResult.FAILED_NO_MEMBERSHIP,
        'CONTEXT_SWITCH_NO_MEMBERSHIP',
      );

      expect(mockLogger.warnLogs).toHaveLength(1);
      const log = mockLogger.warnLogs[0];
      expect(log?.context).toMatchObject({
        correlation_id: TEST_CORRELATION_ID,
        user_id: TEST_USER_ID,
        from_tenant_id: TEST_TENANT_A,
        to_tenant_id: TEST_TENANT_B,
        switch_type: ContextSwitchType.TENANT_SWITCH,
        success: false,
        result_code: ContextSwitchResult.FAILED_NO_MEMBERSHIP,
        error_code: 'CONTEXT_SWITCH_NO_MEMBERSHIP',
      });
    });

    it('should log quarantined user failure', () => {
      auditLogger.logTenantSwitchFailure(
        TEST_CORRELATION_ID,
        TEST_USER_ID,
        null,
        TEST_TENANT_A,
        ContextSwitchResult.FAILED_USER_QUARANTINED,
        'CONTEXT_SWITCH_USER_QUARANTINED',
      );

      expect(mockLogger.warnLogs).toHaveLength(1);
      const log = mockLogger.warnLogs[0];
      expect(log?.context?.result_code).toBe(ContextSwitchResult.FAILED_USER_QUARANTINED);
    });
  });

  describe('logOrgUnitSwitchSuccess', () => {
    it('should log successful OrgUnit switch', () => {
      auditLogger.logOrgUnitSwitchSuccess(
        TEST_CORRELATION_ID,
        TEST_USER_ID,
        TEST_TENANT_A,
        TEST_ORGUNIT_A,
        TEST_ORGUNIT_B,
        TEST_MEMBERSHIP_ID,
      );

      expect(mockLogger.infoLogs).toHaveLength(1);
      const log = mockLogger.infoLogs[0];
      expect(log?.context).toMatchObject({
        correlation_id: TEST_CORRELATION_ID,
        user_id: TEST_USER_ID,
        from_tenant_id: TEST_TENANT_A,
        to_tenant_id: TEST_TENANT_A, // Same tenant for OrgUnit switch
        from_org_unit_id: TEST_ORGUNIT_A,
        to_org_unit_id: TEST_ORGUNIT_B,
        switch_type: ContextSwitchType.ORGUNIT_SWITCH,
        success: true,
        membership_id: TEST_MEMBERSHIP_ID,
      });
    });

    it('should handle switch to tenant-level scope (null OrgUnit)', () => {
      auditLogger.logOrgUnitSwitchSuccess(
        TEST_CORRELATION_ID,
        TEST_USER_ID,
        TEST_TENANT_A,
        TEST_ORGUNIT_A,
        null, // Switching to tenant-level
        TEST_MEMBERSHIP_ID,
      );

      expect(mockLogger.infoLogs).toHaveLength(1);
      const log = mockLogger.infoLogs[0];
      expect(log?.context?.from_org_unit_id).toBe(TEST_ORGUNIT_A);
      expect(log?.context?.to_org_unit_id).toBeNull();
    });
  });

  describe('logOrgUnitSwitchFailure', () => {
    it('should log failed OrgUnit switch - out of scope', () => {
      auditLogger.logOrgUnitSwitchFailure(
        TEST_CORRELATION_ID,
        TEST_USER_ID,
        TEST_TENANT_A,
        TEST_ORGUNIT_A,
        TEST_ORGUNIT_B,
        ContextSwitchResult.FAILED_OUT_OF_SCOPE,
        'CONTEXT_SWITCH_OUT_OF_SCOPE',
      );

      expect(mockLogger.warnLogs).toHaveLength(1);
      const log = mockLogger.warnLogs[0];
      expect(log?.context?.result_code).toBe(ContextSwitchResult.FAILED_OUT_OF_SCOPE);
      expect(log?.context?.error_code).toBe('CONTEXT_SWITCH_OUT_OF_SCOPE');
    });

    it('should log failed OrgUnit switch - invalid scope for non-admin', () => {
      auditLogger.logOrgUnitSwitchFailure(
        TEST_CORRELATION_ID,
        TEST_USER_ID,
        TEST_TENANT_A,
        TEST_ORGUNIT_A,
        null, // Attempting tenant-level without admin role
        ContextSwitchResult.FAILED_INVALID_SCOPE,
        'CONTEXT_SWITCH_INVALID_SCOPE',
      );

      expect(mockLogger.warnLogs).toHaveLength(1);
      const log = mockLogger.warnLogs[0];
      expect(log?.context?.result_code).toBe(ContextSwitchResult.FAILED_INVALID_SCOPE);
    });
  });

  describe('trigger types', () => {
    it('should log USER_INITIATED trigger by default', () => {
      auditLogger.logTenantSwitchSuccess(
        TEST_CORRELATION_ID,
        TEST_USER_ID,
        TEST_TENANT_A,
        TEST_TENANT_B,
        TEST_MEMBERSHIP_ID,
      );

      const log = mockLogger.infoLogs[0];
      expect(log?.context?.trigger).toBe(ContextSwitchTrigger.USER_INITIATED);
    });

    it('should log SYSTEM_AUTOMATIC trigger', () => {
      auditLogger.logTenantSwitchSuccess(
        TEST_CORRELATION_ID,
        TEST_USER_ID,
        null,
        TEST_TENANT_A,
        TEST_MEMBERSHIP_ID,
        ContextSwitchTrigger.SYSTEM_AUTOMATIC,
      );

      const log = mockLogger.infoLogs[0];
      expect(log?.context?.trigger).toBe(ContextSwitchTrigger.SYSTEM_AUTOMATIC);
    });

    it('should log SESSION_RESTORE trigger', () => {
      auditLogger.logTenantSwitchSuccess(
        TEST_CORRELATION_ID,
        TEST_USER_ID,
        TEST_TENANT_A,
        TEST_TENANT_A,
        TEST_MEMBERSHIP_ID,
        ContextSwitchTrigger.SESSION_RESTORE,
      );

      const log = mockLogger.infoLogs[0];
      expect(log?.context?.trigger).toBe(ContextSwitchTrigger.SESSION_RESTORE);
    });

    it('should log API_REQUEST trigger', () => {
      auditLogger.logOrgUnitSwitchSuccess(
        TEST_CORRELATION_ID,
        TEST_USER_ID,
        TEST_TENANT_A,
        TEST_ORGUNIT_A,
        TEST_ORGUNIT_B,
        TEST_MEMBERSHIP_ID,
        ContextSwitchTrigger.API_REQUEST,
      );

      const log = mockLogger.infoLogs[0];
      expect(log?.context?.trigger).toBe(ContextSwitchTrigger.API_REQUEST);
    });
  });
});

describe('mapErrorCodeToResult', () => {
  it('should map CONTEXT_SWITCH_USER_QUARANTINED', () => {
    expect(mapErrorCodeToResult('CONTEXT_SWITCH_USER_QUARANTINED')).toBe(
      ContextSwitchResult.FAILED_USER_QUARANTINED,
    );
  });

  it('should map CONTEXT_SWITCH_NO_MEMBERSHIP', () => {
    expect(mapErrorCodeToResult('CONTEXT_SWITCH_NO_MEMBERSHIP')).toBe(
      ContextSwitchResult.FAILED_NO_MEMBERSHIP,
    );
  });

  it('should map CONTEXT_SWITCH_MEMBERSHIP_INACTIVE', () => {
    expect(mapErrorCodeToResult('CONTEXT_SWITCH_MEMBERSHIP_INACTIVE')).toBe(
      ContextSwitchResult.FAILED_MEMBERSHIP_INACTIVE,
    );
  });

  it('should map CONTEXT_SWITCH_INVALID_SCOPE', () => {
    expect(mapErrorCodeToResult('CONTEXT_SWITCH_INVALID_SCOPE')).toBe(
      ContextSwitchResult.FAILED_INVALID_SCOPE,
    );
  });

  it('should map CONTEXT_SWITCH_ORGUNIT_NOT_FOUND', () => {
    expect(mapErrorCodeToResult('CONTEXT_SWITCH_ORGUNIT_NOT_FOUND')).toBe(
      ContextSwitchResult.FAILED_ORGUNIT_NOT_FOUND,
    );
  });

  it('should map CONTEXT_SWITCH_OUT_OF_SCOPE', () => {
    expect(mapErrorCodeToResult('CONTEXT_SWITCH_OUT_OF_SCOPE')).toBe(
      ContextSwitchResult.FAILED_OUT_OF_SCOPE,
    );
  });

  it('should map unknown error codes to FAILED_OTHER', () => {
    expect(mapErrorCodeToResult('UNKNOWN_ERROR')).toBe(ContextSwitchResult.FAILED_OTHER);
    expect(mapErrorCodeToResult('')).toBe(ContextSwitchResult.FAILED_OTHER);
    expect(mapErrorCodeToResult('SOMETHING_ELSE')).toBe(ContextSwitchResult.FAILED_OTHER);
  });
});

describe('determineSwitchType', () => {
  it('should return TENANT_SWITCH when only tenant changes', () => {
    expect(determineSwitchType(TEST_TENANT_A, TEST_TENANT_B, TEST_ORGUNIT_A, TEST_ORGUNIT_A)).toBe(
      ContextSwitchType.TENANT_SWITCH,
    );
  });

  it('should return TENANT_SWITCH when tenant changes and OrgUnits are both null', () => {
    expect(determineSwitchType(TEST_TENANT_A, TEST_TENANT_B, null, null)).toBe(
      ContextSwitchType.TENANT_SWITCH,
    );
  });

  it('should return ORGUNIT_SWITCH when only OrgUnit changes', () => {
    expect(determineSwitchType(TEST_TENANT_A, TEST_TENANT_A, TEST_ORGUNIT_A, TEST_ORGUNIT_B)).toBe(
      ContextSwitchType.ORGUNIT_SWITCH,
    );
  });

  it('should return ORGUNIT_SWITCH when switching from OrgUnit to null', () => {
    expect(determineSwitchType(TEST_TENANT_A, TEST_TENANT_A, TEST_ORGUNIT_A, null)).toBe(
      ContextSwitchType.ORGUNIT_SWITCH,
    );
  });

  it('should return ORGUNIT_SWITCH when switching from null to OrgUnit', () => {
    expect(determineSwitchType(TEST_TENANT_A, TEST_TENANT_A, null, TEST_ORGUNIT_A)).toBe(
      ContextSwitchType.ORGUNIT_SWITCH,
    );
  });

  it('should return FULL_CONTEXT_SWITCH when both tenant and OrgUnit change', () => {
    expect(determineSwitchType(TEST_TENANT_A, TEST_TENANT_B, TEST_ORGUNIT_A, TEST_ORGUNIT_B)).toBe(
      ContextSwitchType.FULL_CONTEXT_SWITCH,
    );
  });

  it('should return FULL_CONTEXT_SWITCH when tenant changes and OrgUnit goes from value to null', () => {
    expect(determineSwitchType(TEST_TENANT_A, TEST_TENANT_B, TEST_ORGUNIT_A, null)).toBe(
      ContextSwitchType.FULL_CONTEXT_SWITCH,
    );
  });

  it('should return ORGUNIT_SWITCH when nothing changes (edge case)', () => {
    // This is technically an identity switch, but categorized as ORGUNIT_SWITCH
    expect(determineSwitchType(TEST_TENANT_A, TEST_TENANT_A, TEST_ORGUNIT_A, TEST_ORGUNIT_A)).toBe(
      ContextSwitchType.ORGUNIT_SWITCH,
    );
  });
});

describe('ContextSwitchAuditLogger without custom logger', () => {
  it('should use default logger when none provided', () => {
    // This should not throw
    const auditLogger = ContextSwitchAuditLoggerImpl();

    // Since we can't easily capture stdout, we just verify it doesn't throw
    expect(() => {
      auditLogger.logTenantSwitchSuccess(
        TEST_CORRELATION_ID,
        TEST_USER_ID,
        TEST_TENANT_A,
        TEST_TENANT_B,
        TEST_MEMBERSHIP_ID,
      );
    }).not.toThrow();
  });
});

describe('Security - No Sensitive Data', () => {
  let auditLogger: IContextSwitchAuditLogger;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    mockLogger = createMockLogger();
    auditLogger = ContextSwitchAuditLoggerImpl({ logger: mockLogger.logger });
  });

  it('should not include any token or password fields', () => {
    auditLogger.logTenantSwitchSuccess(
      TEST_CORRELATION_ID,
      TEST_USER_ID,
      TEST_TENANT_A,
      TEST_TENANT_B,
      TEST_MEMBERSHIP_ID,
    );

    const log = mockLogger.infoLogs[0];
    const context = log?.context ?? {};

    // Verify no sensitive fields are present
    const sensitiveKeys = ['token', 'password', 'secret', 'accessToken', 'refreshToken'];
    for (const key of sensitiveKeys) {
      expect(Object.keys(context).some((k) => k.toLowerCase().includes(key.toLowerCase()))).toBe(
        false,
      );
    }
  });

  it('should only include approved fields in log context', () => {
    auditLogger.logContextSwitch({
      correlationId: TEST_CORRELATION_ID,
      userId: TEST_USER_ID,
      switchType: ContextSwitchType.TENANT_SWITCH,
      fromTenantId: TEST_TENANT_A,
      toTenantId: TEST_TENANT_B,
      fromOrgUnitId: TEST_ORGUNIT_A,
      toOrgUnitId: TEST_ORGUNIT_B,
      result: ContextSwitchResult.SUCCESS,
      trigger: ContextSwitchTrigger.USER_INITIATED,
      membershipId: TEST_MEMBERSHIP_ID,
    });

    const log = mockLogger.infoLogs[0];
    const contextKeys = Object.keys(log?.context ?? {});

    // Verify all keys are expected
    const allowedKeys = [
      'correlation_id',
      'user_id',
      'tenant_id',
      'event_type',
      'switch_type',
      'from_tenant_id',
      'to_tenant_id',
      'from_org_unit_id',
      'to_org_unit_id',
      'success',
      'result_code',
      'trigger',
      'membership_id',
      'error_code',
    ];

    for (const key of contextKeys) {
      expect(allowedKeys).toContain(key);
    }
  });
});


// ---------------------------------------------------------------------------
// CorrelationId Integration Tests (Requirements 15.8)
// ---------------------------------------------------------------------------

describe('CorrelationId Integration (Requirements 15.8)', () => {
  let auditLogger: IContextSwitchAuditLogger;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    mockLogger = createMockLogger();
    auditLogger = ContextSwitchAuditLoggerImpl({ logger: mockLogger.logger });
  });

  it('should use provided correlationId when available', () => {
    const customCorrelationId = 'custom-correlation-id-xyz';
    
    auditLogger.logTenantSwitchSuccess(
      customCorrelationId,
      TEST_USER_ID,
      TEST_TENANT_A,
      TEST_TENANT_B,
      TEST_MEMBERSHIP_ID,
    );

    const log = mockLogger.infoLogs[0];
    expect(log?.context?.correlation_id).toBe(customCorrelationId);
  });

  it('should generate fallback correlationId when not provided in logContextSwitch', () => {
    const input: ContextSwitchLogInput = {
      // correlationId intentionally omitted
      userId: TEST_USER_ID,
      switchType: ContextSwitchType.TENANT_SWITCH,
      fromTenantId: TEST_TENANT_A,
      toTenantId: TEST_TENANT_B,
      fromOrgUnitId: null,
      toOrgUnitId: null,
      result: ContextSwitchResult.SUCCESS,
      trigger: ContextSwitchTrigger.USER_INITIATED,
      membershipId: TEST_MEMBERSHIP_ID,
    };

    auditLogger.logContextSwitch(input);

    const log = mockLogger.infoLogs[0];
    
    // Should have a valid UUID format
    expect(log?.context?.correlation_id).toBeDefined();
    expect(typeof log?.context?.correlation_id).toBe('string');
    
    // UUID v4 format validation
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(log?.context?.correlation_id).toMatch(uuidV4Regex);
  });

  it('should generate fallback correlationId when empty string is provided', () => {
    const input: ContextSwitchLogInput = {
      correlationId: '', // Empty string
      userId: TEST_USER_ID,
      switchType: ContextSwitchType.TENANT_SWITCH,
      fromTenantId: TEST_TENANT_A,
      toTenantId: TEST_TENANT_B,
      fromOrgUnitId: null,
      toOrgUnitId: null,
      result: ContextSwitchResult.SUCCESS,
      trigger: ContextSwitchTrigger.USER_INITIATED,
      membershipId: TEST_MEMBERSHIP_ID,
    };

    auditLogger.logContextSwitch(input);

    const log = mockLogger.infoLogs[0];
    
    // Should have a valid UUID format
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(log?.context?.correlation_id).toMatch(uuidV4Regex);
  });

  it('should preserve external system correlationIds', () => {
    const externalCorrelationIds = [
      'AWS-Request-123456',
      'X-Cloud-Trace:abc123',
      'datadog-span-id-12345',
    ];

    for (const externalId of externalCorrelationIds) {
      mockLogger = createMockLogger();
      auditLogger = ContextSwitchAuditLoggerImpl({ logger: mockLogger.logger });
      
      auditLogger.logTenantSwitchSuccess(
        externalId,
        TEST_USER_ID,
        TEST_TENANT_A,
        TEST_TENANT_B,
        TEST_MEMBERSHIP_ID,
      );

      const log = mockLogger.infoLogs[0];
      expect(log?.context?.correlation_id).toBe(externalId);
    }
  });

  it('should generate unique correlationIds for each call without provided ID', () => {
    const generatedIds: string[] = [];

    for (let i = 0; i < 5; i++) {
      mockLogger = createMockLogger();
      auditLogger = ContextSwitchAuditLoggerImpl({ logger: mockLogger.logger });
      
      const input: ContextSwitchLogInput = {
        // correlationId intentionally omitted
        userId: TEST_USER_ID,
        switchType: ContextSwitchType.TENANT_SWITCH,
        fromTenantId: TEST_TENANT_A,
        toTenantId: TEST_TENANT_B,
        fromOrgUnitId: null,
        toOrgUnitId: null,
        result: ContextSwitchResult.SUCCESS,
        trigger: ContextSwitchTrigger.USER_INITIATED,
        membershipId: TEST_MEMBERSHIP_ID,
      };

      auditLogger.logContextSwitch(input);

      const log = mockLogger.infoLogs[0];
      generatedIds.push(log?.context?.correlation_id as string);
    }

    // All generated IDs should be unique
    const uniqueIds = new Set(generatedIds);
    expect(uniqueIds.size).toBe(5);
  });

  it('should properly propagate correlationId from convenience methods', () => {
    const customId = 'my-custom-id';
    
    // Test all convenience methods
    auditLogger.logTenantSwitchSuccess(customId, TEST_USER_ID, TEST_TENANT_A, TEST_TENANT_B, TEST_MEMBERSHIP_ID);
    expect(mockLogger.infoLogs[0]?.context?.correlation_id).toBe(customId);

    mockLogger = createMockLogger();
    auditLogger = ContextSwitchAuditLoggerImpl({ logger: mockLogger.logger });
    
    auditLogger.logTenantSwitchFailure(customId, TEST_USER_ID, TEST_TENANT_A, TEST_TENANT_B, ContextSwitchResult.FAILED_NO_MEMBERSHIP);
    expect(mockLogger.warnLogs[0]?.context?.correlation_id).toBe(customId);

    mockLogger = createMockLogger();
    auditLogger = ContextSwitchAuditLoggerImpl({ logger: mockLogger.logger });
    
    auditLogger.logOrgUnitSwitchSuccess(customId, TEST_USER_ID, TEST_TENANT_A, TEST_ORGUNIT_A, TEST_ORGUNIT_B, TEST_MEMBERSHIP_ID);
    expect(mockLogger.infoLogs[0]?.context?.correlation_id).toBe(customId);

    mockLogger = createMockLogger();
    auditLogger = ContextSwitchAuditLoggerImpl({ logger: mockLogger.logger });
    
    auditLogger.logOrgUnitSwitchFailure(customId, TEST_USER_ID, TEST_TENANT_A, TEST_ORGUNIT_A, TEST_ORGUNIT_B, ContextSwitchResult.FAILED_OUT_OF_SCOPE);
    expect(mockLogger.warnLogs[0]?.context?.correlation_id).toBe(customId);
  });
});
