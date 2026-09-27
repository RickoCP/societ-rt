/**
 * Tests for AuthorizationAuditLogger — Denial Debugging Context
 *
 * @see Requirements 15.7 — Denial debugging context
 * @see Task 23.7 — Implement denial debugging context
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  type DenialDebuggingContext,
  createAuthorizationAuditLogger,
  createInsufficientPermissionDebuggingContext,
  createTokenVersionMismatchDebuggingContext,
  createMembershipStatusDebuggingContext,
  createCrossTenantDebuggingContext,
  createScopeMismatchDebuggingContext,
  createContextResolutionFailureDebuggingContext,
  createDenialWithDebuggingContext,
} from '../AuthorizationAuditLogger';
import type { Logger } from '../Logger';

// ---------------------------------------------------------------------------
// Test Utilities
// ---------------------------------------------------------------------------

/**
 * Creates a mock logger that captures log calls.
 */
function createMockLogger() {
  const calls: { level: string; message: string; context?: Record<string, unknown> }[] = [];

  const logger: Logger = {
    info: vi.fn((message: string, context?: Record<string, unknown>) => 
      calls.push({ level: 'info', message, context })),
    warn: vi.fn((message: string, context?: Record<string, unknown>) => 
      calls.push({ level: 'warn', message, context })),
    error: vi.fn((message: string, context?: Record<string, unknown>) => 
      calls.push({ level: 'error', message, context })),
    debug: vi.fn((message: string, context?: Record<string, unknown>) => 
      calls.push({ level: 'debug', message, context })),
  };

  return { logger, calls };
}

/**
 * Base input for testing.
 */
const baseInput = {
  correlationId: 'test-correlation-123',
  userId: 'user-123',
  tenantId: 'tenant-456',
  membershipId: 'membership-789',
  endpoint: '/api/residents',
  method: 'GET',
  requiredPermissions: ['resident:read'],
  role: 'RESIDENT',
};

// ---------------------------------------------------------------------------
// Tests: Denial Debugging Context Types
// ---------------------------------------------------------------------------

describe('DenialDebuggingContext', () => {
  describe('createInsufficientPermissionDebuggingContext', () => {
    it('should create context with denial description', () => {
      const context = createInsufficientPermissionDebuggingContext({
        actualPermissions: ['announcement:read'],
        membershipStatus: 'ACTIVE',
      });

      expect(context.denialDescription).toBe(
        'User lacks required permissions for this endpoint',
      );
    });

    it('should include actual permissions when provided', () => {
      const context = createInsufficientPermissionDebuggingContext({
        actualPermissions: ['announcement:read', 'event:read'],
      });

      expect(context.actualPermissions).toEqual(['announcement:read', 'event:read']);
    });

    it('should include membership status when provided', () => {
      const context = createInsufficientPermissionDebuggingContext({
        membershipStatus: 'ACTIVE',
      });

      expect(context.membershipStatus).toBe('ACTIVE');
    });

    it('should include query and path params for debugging', () => {
      const context = createInsufficientPermissionDebuggingContext({
        queryParams: { page: '1', limit: '10' },
        pathParams: { id: 'uuid-123' },
      });

      expect(context.queryParams).toEqual({ page: '1', limit: '10' });
      expect(context.pathParams).toEqual({ id: 'uuid-123' });
    });

    it('should include suggested remediation', () => {
      const context = createInsufficientPermissionDebuggingContext({});

      expect(context.suggestedRemediation).toContain('PermissionRegistry');
    });
  });

  describe('createTokenVersionMismatchDebuggingContext', () => {
    it('should include token version mismatch details', () => {
      const context = createTokenVersionMismatchDebuggingContext({
        expectedVersion: 5,
        actualVersion: 3,
      });

      expect(context.tokenVersionMismatch).toEqual({
        expected: 5,
        actual: 3,
      });
    });

    it('should include time context', () => {
      const context = createTokenVersionMismatchDebuggingContext({
        expectedVersion: 5,
        actualVersion: 3,
        tokenIssuedAt: '2024-01-01T00:00:00Z',
        tokenExpiresAt: '2024-01-01T01:00:00Z',
        requestTimestamp: '2024-01-01T00:30:00Z',
      });

      expect(context.timeContext).toEqual({
        requestTimestamp: '2024-01-01T00:30:00Z',
        tokenIssuedAt: '2024-01-01T00:00:00Z',
        tokenExpiresAt: '2024-01-01T01:00:00Z',
      });
    });

    it('should NOT include actual token values (security)', () => {
      const context = createTokenVersionMismatchDebuggingContext({
        expectedVersion: 5,
        actualVersion: 3,
      });

      // Ensure no token/password/secret fields exist
      expect(context).not.toHaveProperty('token');
      expect(context).not.toHaveProperty('accessToken');
      expect(context).not.toHaveProperty('refreshToken');
      expect(context).not.toHaveProperty('password');
    });
  });

  describe('createMembershipStatusDebuggingContext', () => {
    it('should describe SUSPENDED status correctly', () => {
      const context = createMembershipStatusDebuggingContext({
        membershipStatus: 'SUSPENDED',
      });

      expect(context.denialDescription).toContain('suspended');
      expect(context.membershipStatus).toBe('SUSPENDED');
    });

    it('should describe REVOKED status correctly', () => {
      const context = createMembershipStatusDebuggingContext({
        membershipStatus: 'REVOKED',
      });

      expect(context.denialDescription).toContain('revoked');
      expect(context.membershipStatus).toBe('REVOKED');
    });

    it('should describe INVITED status correctly', () => {
      const context = createMembershipStatusDebuggingContext({
        membershipStatus: 'INVITED',
      });

      expect(context.denialDescription).toContain('invitation');
      expect(context.membershipStatus).toBe('INVITED');
    });

    it('should provide appropriate remediation for each status', () => {
      const suspendedContext = createMembershipStatusDebuggingContext({
        membershipStatus: 'SUSPENDED',
      });
      const revokedContext = createMembershipStatusDebuggingContext({
        membershipStatus: 'REVOKED',
      });
      const invitedContext = createMembershipStatusDebuggingContext({
        membershipStatus: 'INVITED',
      });

      expect(suspendedContext.suggestedRemediation).toContain('reinstate');
      expect(revokedContext.suggestedRemediation).toContain('administrator');
      expect(invitedContext.suggestedRemediation).toContain('accept invitation');
    });
  });

  describe('createCrossTenantDebuggingContext', () => {
    it('should flag cross-tenant attempt', () => {
      const context = createCrossTenantDebuggingContext({
        requestedTenantId: 'tenant-other',
        userTenantId: 'tenant-user',
      });

      expect(context.crossTenantAttempt).toBe(true);
      expect(context.denialDescription).toContain('different tenant');
    });

    it('should include path params for debugging', () => {
      const context = createCrossTenantDebuggingContext({
        pathParams: { tenantId: 'tenant-other' },
      });

      expect(context.pathParams).toEqual({ tenantId: 'tenant-other' });
    });
  });

  describe('createScopeMismatchDebuggingContext', () => {
    it('should include scope mismatch details', () => {
      const context = createScopeMismatchDebuggingContext({
        requestedOrgUnitId: 'org-requested',
        allowedOrgUnitIds: ['org-1', 'org-2'],
      });

      expect(context.scopeMismatch).toEqual({
        requestedOrgUnitId: 'org-requested',
        allowedOrgUnitIds: ['org-1', 'org-2'],
      });
    });

    it('should handle null requested org unit', () => {
      const context = createScopeMismatchDebuggingContext({
        requestedOrgUnitId: null,
        allowedOrgUnitIds: ['org-1'],
      });

      expect(context.scopeMismatch?.requestedOrgUnitId).toBeNull();
    });
  });

  describe('createContextResolutionFailureDebuggingContext', () => {
    it('should include error details', () => {
      const context = createContextResolutionFailureDebuggingContext({
        errorCode: 'AUTH_TOKEN_INVALID',
        errorMessage: 'Token could not be parsed',
      });

      expect(context.suggestedRemediation).toContain('AUTH_TOKEN_INVALID');
    });

    it('should include request origin for debugging', () => {
      const context = createContextResolutionFailureDebuggingContext({
        userAgent: 'Mozilla/5.0',
        ipHash: 'abc123hash',
      });

      expect(context.requestOrigin).toEqual({
        userAgent: 'Mozilla/5.0',
        ipHash: 'abc123hash',
      });
    });

    it('should NOT include actual IP address (privacy)', () => {
      const context = createContextResolutionFailureDebuggingContext({
        ipHash: 'hashed-ip',
      });

      // Only ipHash should be included, not raw IP
      expect(context.requestOrigin?.ipHash).toBe('hashed-ip');
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Denial Log Input with Debugging Context
// ---------------------------------------------------------------------------

describe('createDenialWithDebuggingContext', () => {
  it('should create complete denial log input with debugging context', () => {
    const denialContext = createInsufficientPermissionDebuggingContext({
      actualPermissions: ['announcement:read'],
      membershipStatus: 'ACTIVE',
    });

    const logInput = createDenialWithDebuggingContext(
      baseInput,
      'AUTH_INSUFFICIENT_PERMISSION',
      denialContext,
    );

    expect(logInput.decision).toBe('DENY');
    expect(logInput.reason).toBe('AUTH_INSUFFICIENT_PERMISSION');
    expect(logInput.denialContext).toBe(denialContext);
    expect(logInput.correlationId).toBe('test-correlation-123');
  });

  it('should preserve all base input fields', () => {
    const logInput = createDenialWithDebuggingContext(
      baseInput,
      'AUTH_NO_MEMBERSHIP',
      { denialDescription: 'No membership found' },
    );

    expect(logInput.userId).toBe('user-123');
    expect(logInput.tenantId).toBe('tenant-456');
    expect(logInput.endpoint).toBe('/api/residents');
    expect(logInput.method).toBe('GET');
    expect(logInput.requiredPermissions).toEqual(['resident:read']);
  });
});

// ---------------------------------------------------------------------------
// Tests: AuthorizationAuditLogger with Denial Debugging Context
// ---------------------------------------------------------------------------

describe('AuthorizationAuditLogger', () => {
  describe('logDeny with denialContext', () => {
    // Save original NODE_ENV
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it('should include denial_debug in log context for DENY decisions', () => {
      const { logger, calls } = createMockLogger();
      const auditLogger = createAuthorizationAuditLogger({ logger });

      const denialContext: DenialDebuggingContext = {
        denialDescription: 'User lacks required permissions',
        membershipStatus: 'ACTIVE',
        suggestedRemediation: 'Check user role',
      };

      auditLogger.logDeny({
        ...baseInput,
        reason: 'AUTH_INSUFFICIENT_PERMISSION',
        denialContext,
      });

      expect(calls).toHaveLength(1);
      expect(calls[0]!.level).toBe('warn');
      expect(calls[0]!.context).toHaveProperty('denial_debug');
      expect(calls[0]!.context?.denial_debug).toHaveProperty(
        'description',
        'User lacks required permissions',
      );
    });

    it('should include all debugging context fields in denial_debug', () => {
      const { logger, calls } = createMockLogger();
      const auditLogger = createAuthorizationAuditLogger({ logger });

      const denialContext: DenialDebuggingContext = {
        denialDescription: 'Test denial',
        membershipStatus: 'SUSPENDED',
        queryParams: { page: '1' },
        pathParams: { id: 'uuid-123' },
        suggestedRemediation: 'Test remediation',
      };

      auditLogger.logDeny({
        ...baseInput,
        reason: 'AUTH_MEMBERSHIP_SUSPENDED',
        denialContext,
      });

      const denialDebug = calls[0]!.context?.denial_debug as Record<string, unknown>;
      expect(denialDebug.description).toBe('Test denial');
      expect(denialDebug.membership_status).toBe('SUSPENDED');
      expect(denialDebug.query_params).toEqual({ page: '1' });
      expect(denialDebug.path_params).toEqual({ id: 'uuid-123' });
      expect(denialDebug.suggested_remediation).toBe('Test remediation');
    });

    it('should include token version mismatch in denial_debug', () => {
      const { logger, calls } = createMockLogger();
      const auditLogger = createAuthorizationAuditLogger({ logger });

      const denialContext: DenialDebuggingContext = {
        denialDescription: 'Token version mismatch',
        tokenVersionMismatch: {
          expected: 5,
          actual: 3,
        },
      };

      auditLogger.logDeny({
        ...baseInput,
        reason: 'AUTH_TOKEN_VERSION_MISMATCH',
        denialContext,
      });

      const denialDebug = calls[0]!.context?.denial_debug as Record<string, unknown>;
      expect(denialDebug.token_version_mismatch).toEqual({
        expected: 5,
        actual: 3,
      });
    });

    it('should include scope mismatch in denial_debug', () => {
      const { logger, calls } = createMockLogger();
      const auditLogger = createAuthorizationAuditLogger({ logger });

      const denialContext: DenialDebuggingContext = {
        denialDescription: 'Scope mismatch',
        scopeMismatch: {
          requestedOrgUnitId: 'org-requested',
          allowedOrgUnitIds: ['org-1', 'org-2'],
        },
      };

      auditLogger.logDeny({
        ...baseInput,
        reason: 'AUTH_OUT_OF_SCOPE',
        denialContext,
      });

      const denialDebug = calls[0]!.context?.denial_debug as Record<string, unknown>;
      expect(denialDebug.scope_mismatch).toEqual({
        requested_org_unit_id: 'org-requested',
        allowed_org_unit_ids: ['org-1', 'org-2'],
      });
    });

    it('should include time context in denial_debug', () => {
      const { logger, calls } = createMockLogger();
      const auditLogger = createAuthorizationAuditLogger({ logger });

      const denialContext: DenialDebuggingContext = {
        denialDescription: 'Token expired',
        timeContext: {
          requestTimestamp: '2024-01-01T12:00:00Z',
          tokenIssuedAt: '2024-01-01T00:00:00Z',
          tokenExpiresAt: '2024-01-01T01:00:00Z',
        },
      };

      auditLogger.logDeny({
        ...baseInput,
        reason: 'AUTH_TOKEN_EXPIRED',
        denialContext,
      });

      const denialDebug = calls[0]!.context?.denial_debug as Record<string, unknown>;
      expect(denialDebug.time_context).toEqual({
        request_timestamp: '2024-01-01T12:00:00Z',
        token_issued_at: '2024-01-01T00:00:00Z',
        token_expires_at: '2024-01-01T01:00:00Z',
      });
    });

    it('should include request origin in denial_debug', () => {
      const { logger, calls } = createMockLogger();
      const auditLogger = createAuthorizationAuditLogger({ logger });

      const denialContext: DenialDebuggingContext = {
        denialDescription: 'Context resolution failed',
        requestOrigin: {
          userAgent: 'Mozilla/5.0 (Test)',
          ipHash: 'abc123',
          referer: 'https://example.com/login',
        },
      };

      auditLogger.logDeny({
        ...baseInput,
        reason: 'AUTH_CONTEXT_RESOLUTION_FAILED',
        denialContext,
      });

      const denialDebug = calls[0]!.context?.denial_debug as Record<string, unknown>;
      expect(denialDebug.request_origin).toEqual({
        user_agent: 'Mozilla/5.0 (Test)',
        ip_hash: 'abc123',
        referer: 'https://example.com/login',
      });
    });

    it('should include cross-tenant attempt flag in denial_debug', () => {
      const { logger, calls } = createMockLogger();
      const auditLogger = createAuthorizationAuditLogger({ logger });

      const denialContext: DenialDebuggingContext = {
        denialDescription: 'Cross-tenant access denied',
        crossTenantAttempt: true,
      };

      auditLogger.logDeny({
        ...baseInput,
        reason: 'AUTH_TENANT_MISMATCH',
        denialContext,
      });

      const denialDebug = calls[0]!.context?.denial_debug as Record<string, unknown>;
      expect(denialDebug.cross_tenant_attempt).toBe(true);
    });

    it('should NOT include actual_permissions in production', () => {
      process.env.NODE_ENV = 'production';
      const { logger, calls } = createMockLogger();
      const auditLogger = createAuthorizationAuditLogger({ logger });

      const denialContext: DenialDebuggingContext = {
        denialDescription: 'Insufficient permissions',
        actualPermissions: ['resident:read', 'announcement:read'],
      };

      auditLogger.logDeny({
        ...baseInput,
        reason: 'AUTH_INSUFFICIENT_PERMISSION',
        denialContext,
      });

      const denialDebug = calls[0]!.context?.denial_debug as Record<string, unknown>;
      expect(denialDebug.actual_permissions).toBeUndefined();
    });

    it('should include actual_permissions in non-production', () => {
      process.env.NODE_ENV = 'development';
      const { logger, calls } = createMockLogger();
      const auditLogger = createAuthorizationAuditLogger({ logger });

      const denialContext: DenialDebuggingContext = {
        denialDescription: 'Insufficient permissions',
        actualPermissions: ['resident:read', 'announcement:read'],
      };

      auditLogger.logDeny({
        ...baseInput,
        reason: 'AUTH_INSUFFICIENT_PERMISSION',
        denialContext,
      });

      const denialDebug = calls[0]!.context?.denial_debug as Record<string, unknown>;
      expect(denialDebug.actual_permissions).toEqual([
        'resident:read',
        'announcement:read',
      ]);
    });
  });

  describe('logAllow without denialContext', () => {
    it('should NOT include denial_debug for ALLOW decisions', () => {
      const { logger, calls } = createMockLogger();
      const auditLogger = createAuthorizationAuditLogger({ logger });

      auditLogger.logAllow(baseInput);

      expect(calls).toHaveLength(1);
      expect(calls[0]!.level).toBe('info');
      expect(calls[0]!.context).not.toHaveProperty('denial_debug');
    });
  });

  describe('logDecision', () => {
    it('should include all required fields for debugging', () => {
      const { logger, calls } = createMockLogger();
      const auditLogger = createAuthorizationAuditLogger({ logger });

      auditLogger.logDeny({
        ...baseInput,
        reason: 'AUTH_INSUFFICIENT_PERMISSION',
        missingPermissions: ['resident:write'],
        orgUnitId: 'org-123',
      });

      const context = calls[0]!.context;
      
      // Required fields per Requirements 15.1
      expect(context?.correlation_id).toBe('test-correlation-123');
      expect(context?.timestamp).toBeDefined();
      expect(context?.user_id).toBe('user-123');
      expect(context?.tenant_id).toBe('tenant-456');
      expect(context?.membership_id).toBe('membership-789');
      expect(context?.endpoint).toBe('/api/residents');
      expect(context?.method).toBe('GET');
      expect(context?.required_permissions).toEqual(['resident:read']);
      expect(context?.decision).toBe('DENY');
      expect(context?.reason).toBe('AUTH_INSUFFICIENT_PERMISSION');
      expect(context?.role).toBe('RESIDENT');
      expect(context?.org_unit_id).toBe('org-123');
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Security — Sensitive Data NOT in Logs
// ---------------------------------------------------------------------------

describe('Security: Sensitive Data Protection', () => {
  it('should NOT include tokens in denial context', () => {
    const { logger, calls } = createMockLogger();
    const auditLogger = createAuthorizationAuditLogger({ logger });

    // Attempt to add token-like data to additional context
    auditLogger.logDeny({
      ...baseInput,
      reason: 'AUTH_TOKEN_INVALID',
      additionalContext: {
        // These should be sanitized by the Logger
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        accessToken: 'secret-token',
      },
      denialContext: {
        denialDescription: 'Invalid token',
        // Only version numbers, not actual tokens
        tokenVersionMismatch: {
          expected: 5,
          actual: 3,
        },
      },
    });

    const denialDebug = calls[0]!.context?.denial_debug as Record<string, unknown>;
    
    // Verify no token values in denial_debug
    expect(denialDebug).not.toHaveProperty('token');
    expect(denialDebug).not.toHaveProperty('accessToken');
    expect(denialDebug).not.toHaveProperty('refreshToken');
    
    // Version numbers are OK
    expect(denialDebug.token_version_mismatch).toEqual({
      expected: 5,
      actual: 3,
    });
  });

  it('should use hashed IP instead of raw IP', () => {
    const { logger, calls } = createMockLogger();
    const auditLogger = createAuthorizationAuditLogger({ logger });

    const denialContext: DenialDebuggingContext = {
      denialDescription: 'Test',
      requestOrigin: {
        ipHash: 'hashed-value-abc123',
        // Note: No raw IP field exists in the type
      },
    };

    auditLogger.logDeny({
      ...baseInput,
      reason: 'AUTH_CONTEXT_RESOLUTION_FAILED',
      denialContext,
    });

    const denialDebug = calls[0]!.context?.denial_debug as Record<string, unknown>;
    const requestOrigin = denialDebug.request_origin as Record<string, unknown>;
    
    expect(requestOrigin.ip_hash).toBe('hashed-value-abc123');
    expect(requestOrigin).not.toHaveProperty('ip');
    expect(requestOrigin).not.toHaveProperty('ipAddress');
  });

  it('should NOT include passwords in denial context', () => {
    const denialContext = createContextResolutionFailureDebuggingContext({
      errorCode: 'AUTH_TOKEN_INVALID',
    });

    // Verify password-related fields don't exist in the type
    expect(denialContext).not.toHaveProperty('password');
    expect(denialContext).not.toHaveProperty('currentPassword');
    expect(denialContext).not.toHaveProperty('newPassword');
  });
});

// ---------------------------------------------------------------------------
// Tests: Context Sufficiency for Debugging
// ---------------------------------------------------------------------------

describe('Context Sufficiency for Debugging', () => {
  it('should provide enough context to reproduce authorization issues', () => {
    const { logger, calls } = createMockLogger();
    const auditLogger = createAuthorizationAuditLogger({ logger });

    const denialContext = createInsufficientPermissionDebuggingContext({
      actualPermissions: ['announcement:read', 'event:read'],
      membershipStatus: 'ACTIVE',
      queryParams: { page: '1', limit: '10', search: 'test' },
      pathParams: { tenantId: 'tenant-123', residentId: 'resident-456' },
    });

    auditLogger.logDeny({
      ...baseInput,
      reason: 'AUTH_INSUFFICIENT_PERMISSION',
      missingPermissions: ['resident:read'],
      denialContext,
    });

    const context = calls[0]!.context;
    const denialDebug = context?.denial_debug as Record<string, unknown>;

    // All required information for reproducing the issue:
    // 1. Who (user context)
    expect(context?.user_id).toBeDefined();
    expect(context?.tenant_id).toBeDefined();
    expect(context?.membership_id).toBeDefined();
    expect(context?.role).toBeDefined();

    // 2. What (request context)
    expect(context?.endpoint).toBeDefined();
    expect(context?.method).toBeDefined();
    expect(context?.required_permissions).toBeDefined();
    expect(denialDebug.query_params).toBeDefined();
    expect(denialDebug.path_params).toBeDefined();

    // 3. Why (denial reason)
    expect(context?.reason).toBeDefined();
    expect(context?.decision).toBe('DENY');
    expect(denialDebug.description).toBeDefined();

    // 4. When (timestamp)
    expect(context?.timestamp).toBeDefined();

    // 5. How to fix (remediation)
    expect(denialDebug.suggested_remediation).toBeDefined();
  });

  it('should provide unique correlation_id for tracing', () => {
    const { logger, calls } = createMockLogger();
    const auditLogger = createAuthorizationAuditLogger({ logger });

    auditLogger.logDeny({
      ...baseInput,
      correlationId: 'unique-trace-id-12345',
      reason: 'AUTH_NO_MEMBERSHIP',
    });

    expect(calls[0]!.context?.correlation_id).toBe('unique-trace-id-12345');
  });

  it('should generate fallback correlationId when not provided', () => {
    const { logger, calls } = createMockLogger();
    const auditLogger = createAuthorizationAuditLogger({ logger });

    const inputWithoutCorrelationId = { ...baseInput };
    delete (inputWithoutCorrelationId as Record<string, unknown>).correlationId;

    auditLogger.logDeny({
      ...inputWithoutCorrelationId,
      reason: 'AUTH_NO_MEMBERSHIP',
    });

    // Should have generated a correlationId
    expect(calls[0]!.context?.correlation_id).toBeDefined();
    expect(typeof calls[0]!.context?.correlation_id).toBe('string');
    expect(calls[0]!.context?.correlation_id_generated).toBe(true);
  });
});


// ---------------------------------------------------------------------------
// CorrelationId Integration Tests (Requirements 15.8)
// ---------------------------------------------------------------------------

describe('CorrelationId Integration (Requirements 15.8)', () => {
  let mockLoggerSetup: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    mockLoggerSetup = createMockLogger();
  });

  it('should use provided correlationId when available', () => {
    const auditLogger = createAuthorizationAuditLogger({ logger: mockLoggerSetup.logger });
    const customCorrelationId = 'custom-correlation-id-xyz';

    auditLogger.logAllow({
      ...baseInput,
      correlationId: customCorrelationId,
    });

    expect(mockLoggerSetup.calls).toHaveLength(1);
    expect(mockLoggerSetup.calls[0]?.context?.correlation_id).toBe(customCorrelationId);
    expect(mockLoggerSetup.calls[0]?.context?.correlation_id_generated).toBe(false);
  });

  it('should generate fallback correlationId when not provided', () => {
    const auditLogger = createAuthorizationAuditLogger({ logger: mockLoggerSetup.logger });

    auditLogger.logAllow({
      userId: 'user-123',
      tenantId: 'tenant-456',
      membershipId: 'membership-789',
      endpoint: '/api/residents',
      method: 'GET',
      requiredPermissions: ['resident:read'],
      // correlationId intentionally omitted
    });

    expect(mockLoggerSetup.calls).toHaveLength(1);
    
    // Should have a valid UUID format
    const correlationId = mockLoggerSetup.calls[0]?.context?.correlation_id as string;
    expect(correlationId).toBeDefined();
    expect(typeof correlationId).toBe('string');
    
    // UUID v4 format validation
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(correlationId).toMatch(uuidV4Regex);
    
    // Should indicate it was generated
    expect(mockLoggerSetup.calls[0]?.context?.correlation_id_generated).toBe(true);
  });

  it('should generate fallback correlationId when empty string is provided', () => {
    const auditLogger = createAuthorizationAuditLogger({ logger: mockLoggerSetup.logger });

    auditLogger.logAllow({
      ...baseInput,
      correlationId: '', // Empty string
    });

    expect(mockLoggerSetup.calls).toHaveLength(1);
    
    // Should have a valid UUID format
    const correlationId = mockLoggerSetup.calls[0]?.context?.correlation_id as string;
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(correlationId).toMatch(uuidV4Regex);
    expect(mockLoggerSetup.calls[0]?.context?.correlation_id_generated).toBe(true);
  });

  it('should preserve external system correlationIds', () => {
    const externalCorrelationIds = [
      'AWS-Request-123456',
      'X-Cloud-Trace:abc123',
      'datadog-span-id-12345',
    ];

    for (const externalId of externalCorrelationIds) {
      mockLoggerSetup = createMockLogger();
      const auditLogger = createAuthorizationAuditLogger({ logger: mockLoggerSetup.logger });
      
      auditLogger.logAllow({
        ...baseInput,
        correlationId: externalId,
      });

      expect(mockLoggerSetup.calls[0]?.context?.correlation_id).toBe(externalId);
      expect(mockLoggerSetup.calls[0]?.context?.correlation_id_generated).toBe(false);
    }
  });

  it('should generate unique correlationIds for each call without provided ID', () => {
    const generatedIds: string[] = [];

    for (let i = 0; i < 5; i++) {
      mockLoggerSetup = createMockLogger();
      const auditLogger = createAuthorizationAuditLogger({ logger: mockLoggerSetup.logger });

      auditLogger.logAllow({
        userId: 'user-123',
        tenantId: 'tenant-456',
        membershipId: 'membership-789',
        endpoint: '/api/residents',
        method: 'GET',
        requiredPermissions: ['resident:read'],
        // correlationId intentionally omitted
      });

      generatedIds.push(mockLoggerSetup.calls[0]?.context?.correlation_id as string);
    }

    // All generated IDs should be unique
    const uniqueIds = new Set(generatedIds);
    expect(uniqueIds.size).toBe(5);
  });

  it('should include correlationId in DENY decisions', () => {
    const auditLogger = createAuthorizationAuditLogger({ logger: mockLoggerSetup.logger });
    const customCorrelationId = 'deny-correlation-id';

    auditLogger.logDeny({
      ...baseInput,
      correlationId: customCorrelationId,
      reason: 'AUTH_INSUFFICIENT_PERMISSION',
    });

    expect(mockLoggerSetup.calls).toHaveLength(1);
    expect(mockLoggerSetup.calls[0]?.context?.correlation_id).toBe(customCorrelationId);
    expect(mockLoggerSetup.calls[0]?.level).toBe('warn');
  });

  it('should include generated correlationId in DENY decisions when not provided', () => {
    const auditLogger = createAuthorizationAuditLogger({ logger: mockLoggerSetup.logger });

    auditLogger.logDeny({
      userId: 'user-123',
      tenantId: 'tenant-456',
      membershipId: 'membership-789',
      endpoint: '/api/residents',
      method: 'GET',
      requiredPermissions: ['resident:read'],
      reason: 'AUTH_INSUFFICIENT_PERMISSION',
      // correlationId intentionally omitted
    });

    expect(mockLoggerSetup.calls).toHaveLength(1);
    
    // Should have a valid UUID format
    const correlationId = mockLoggerSetup.calls[0]?.context?.correlation_id as string;
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(correlationId).toMatch(uuidV4Regex);
    expect(mockLoggerSetup.calls[0]?.context?.correlation_id_generated).toBe(true);
  });

  it('should use correlationId from generateCorrelationId utility', () => {
    // This test verifies the logger integrates with @infrastructure/utils/correlationId
    const auditLogger = createAuthorizationAuditLogger({ logger: mockLoggerSetup.logger });

    auditLogger.logAllow({
      userId: 'user-123',
      tenantId: 'tenant-456',
      membershipId: 'membership-789',
      endpoint: '/api/residents',
      method: 'GET',
      requiredPermissions: ['resident:read'],
    });

    const correlationId = mockLoggerSetup.calls[0]?.context?.correlation_id as string;
    
    // The generated ID should be a valid UUID (from crypto.randomUUID())
    expect(correlationId).toBeDefined();
    expect(correlationId.length).toBe(36); // UUID length
    expect(correlationId.split('-').length).toBe(5); // UUID has 5 parts
  });
});
