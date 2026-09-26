/**
 * Unit tests for SecurityTestingSuite.
 *
 * Tests comprehensive security testing framework for multi-tenant SaaS architecture:
 * - Penetration testing scenarios
 * - Security regression tests
 * - Attack simulations
 * - Environment separation testing (Req 37)
 * - CI/CD integration
 * - Vulnerability scanning hooks
 *
 * @see FASE 1.21 Task 76: Security Testing Suite (Req 37)
 * @see Task 75: SecurityValidationSuite (complementary)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SecurityTestingSuiteImpl,
  type ISecurityTestingSuite,
  type SecurityTestingSuiteDependencies,
  SecurityTestCategory,
  SecurityTestStatus,
  AttackVector,
  RiskLevel,
  EnvironmentType,
  PENETRATION_TEST_SCENARIOS,
  SECURITY_REGRESSION_TESTS,
  DEFAULT_SECURITY_TESTING_CONFIG,
} from '../SecurityTestingSuite';
import { MembershipRole } from '@core/domains/membership/types';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

const createMockSecurityValidationSuite = () => ({
  validateTenantIsolation: vi.fn(async (input) => {
    const isSameTenant = input.authContext.tenantId === input.targetTenantId;
    return {
      success: true,
      data: {
        status: isSameTenant ? 'PASSED' : 'PASSED',
        message: isSameTenant
          ? 'same tenant access allowed'
          : 'Cross-tenant access correctly blocked',
      },
    };
  }),
  testTokenVersionMismatchRejection: vi.fn(async (jwtVersion, dbVersion) => {
    const matches = jwtVersion === dbVersion;
    return {
      success: true,
      data: {
        status: 'PASSED',
        details: matches ? {} : { rejected: true },
      },
    };
  }),
  testRefreshTokenReuseDetection: vi.fn(async (input) => {
    const isReuse = input.presentedGeneration < input.currentValidGeneration;
    return {
      success: true,
      data: {
        status: 'PASSED',
        details: isReuse ? { reuseDetected: true, action: 'REVOKE_FAMILY' } : {},
      },
    };
  }),
  validateMembershipResolutionSecurity: vi.fn(async (input) => ({
    success: true,
    data: {
      status: input.isQuarantined ? 'PASSED' : 'PASSED',
      details: input.isQuarantined ? { errorCode: 'AUTH_USER_QUARANTINED' } : {},
    },
  })),
});

const createMockEnvironmentConfig = (env: EnvironmentType = EnvironmentType.TESTING) => ({
  getCurrentEnvironment: vi.fn(() => env),
  getExpectedDbHost: vi.fn((e: EnvironmentType) => `db-${e.toLowerCase()}.internal`),
  getExpectedSigningKeyId: vi.fn((e: EnvironmentType) => `key-${e.toLowerCase()}-001`),
  getCurrentDbHost: vi.fn(() => `db-${env.toLowerCase()}.internal`),
  getCurrentSigningKeyId: vi.fn(() => `key-${env.toLowerCase()}-001`),
});

const createMockAuditLogger = () => ({
  logSecurityTestEvent: vi.fn(async () => {}),
});

const createMockDependencies = (
  overrides: Partial<SecurityTestingSuiteDependencies> = {},
): SecurityTestingSuiteDependencies => ({
  securityValidationSuite: createMockSecurityValidationSuite(),
  environmentConfig: createMockEnvironmentConfig(),
  auditLogger: createMockAuditLogger(),
  ...overrides,
});

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('SecurityTestingSuite', () => {
  let suite: ISecurityTestingSuite;
  let mockDeps: SecurityTestingSuiteDependencies;

  beforeEach(() => {
    mockDeps = createMockDependencies();
    suite = SecurityTestingSuiteImpl(mockDeps);
  });

  // -------------------------------------------------------------------------
  // Static Data Tests
  // -------------------------------------------------------------------------

  describe('getPenetrationTestScenarios', () => {
    it('should return all predefined penetration test scenarios', () => {
      const scenarios = suite.getPenetrationTestScenarios();

      expect(scenarios).toBeDefined();
      expect(scenarios.length).toBeGreaterThan(0);
      expect(scenarios).toEqual(PENETRATION_TEST_SCENARIOS);
    });

    it('should include scenarios for critical attack vectors', () => {
      const scenarios = suite.getPenetrationTestScenarios();
      const attackVectors = new Set(scenarios.map((s) => s.attackVector));

      expect(attackVectors.has(AttackVector.CROSS_TENANT_ACCESS)).toBe(true);
      expect(attackVectors.has(AttackVector.JWT_MANIPULATION)).toBe(true);
      expect(attackVectors.has(AttackVector.RLS_BYPASS)).toBe(true);
      expect(attackVectors.has(AttackVector.PRIVILEGE_ESCALATION)).toBe(true);
    });

    it('should include environment separation scenarios (Req 37)', () => {
      const scenarios = suite.getPenetrationTestScenarios();
      const envScenarios = scenarios.filter(
        (s) => s.category === SecurityTestCategory.ENVIRONMENT_SEPARATION,
      );

      expect(envScenarios.length).toBeGreaterThan(0);
      expect(envScenarios.some((s) => s.id.includes('env'))).toBe(true);
    });

    it('should have risk level and expected outcome for all scenarios', () => {
      const scenarios = suite.getPenetrationTestScenarios();

      for (const scenario of scenarios) {
        expect(scenario.riskLevel).toBeDefined();
        expect(scenario.expectedOutcome).toBeDefined();
        expect(['BLOCKED', 'DETECTED', 'LOGGED']).toContain(scenario.expectedOutcome);
      }
    });
  });

  describe('getRegressionTests', () => {
    it('should return all security regression tests', () => {
      const tests = suite.getRegressionTests();

      expect(tests).toBeDefined();
      expect(tests.length).toBeGreaterThan(0);
      expect(tests).toEqual(SECURITY_REGRESSION_TESTS);
    });

    it('should include tests for all critical invariants', () => {
      const tests = suite.getRegressionTests();
      const testIds = tests.map((t) => t.id);

      expect(testIds.some((id) => id.includes('tenant-isolation'))).toBe(true);
      expect(testIds.some((id) => id.includes('jwt-authority'))).toBe(true);
      expect(testIds.some((id) => id.includes('fail-closed'))).toBe(true);
      expect(testIds.some((id) => id.includes('quarantine'))).toBe(true);
    });

    it('should have expected behavior documented for all tests', () => {
      const tests = suite.getRegressionTests();

      for (const test of tests) {
        expect(test.expectedBehavior).toBeDefined();
        expect(test.expectedBehavior.length).toBeGreaterThan(0);
        expect(test.testInputs).toBeDefined();
      }
    });
  });

  describe('getDefaultCiConfig', () => {
    it('should return default CI configuration', () => {
      const config = suite.getDefaultCiConfig();

      expect(config).toEqual(DEFAULT_SECURITY_TESTING_CONFIG);
      expect(config.enablePenetrationTests).toBe(true);
      expect(config.enableRegressionTests).toBe(true);
      expect(config.ciFailureRiskLevels).toContain(RiskLevel.CRITICAL);
      expect(config.ciFailureRiskLevels).toContain(RiskLevel.HIGH);
    });
  });

  // -------------------------------------------------------------------------
  // Full Suite Execution Tests
  // -------------------------------------------------------------------------

  describe('runSecurityTestSuite', () => {
    it('should run full security test suite and return comprehensive report', async () => {
      const result = await suite.runSecurityTestSuite();

      expect(result.success).toBe(true);
      if (result.success) {
        const report = result.data;
        expect(report.reportId).toBeDefined();
        expect(report.timestamp).toBeDefined();
        expect(report.totalTests).toBeGreaterThan(0);
        expect(report.totalDurationMs).toBeGreaterThanOrEqual(0);
        expect(report.summaryByCategory).toBeDefined();
        expect(report.summaryByRisk).toBeDefined();
        expect(report.ciGateResult).toBeDefined();
      }
    });

    it('should include penetration tests when enabled', async () => {
      const result = await suite.runSecurityTestSuite({
        enablePenetrationTests: true,
        enableRegressionTests: false,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const report = result.data;
        const penTests = report.results.filter(
          (r) => r.category === SecurityTestCategory.PENETRATION_TEST ||
            r.category === SecurityTestCategory.ATTACK_SIMULATION,
        );
        expect(penTests.length).toBeGreaterThan(0);
      }
    });

    it('should include regression tests when enabled', async () => {
      const result = await suite.runSecurityTestSuite({
        enablePenetrationTests: false,
        enableRegressionTests: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const report = result.data;
        const regTests = report.results.filter(
          (r) => r.category === SecurityTestCategory.REGRESSION_TEST,
        );
        expect(regTests.length).toBeGreaterThan(0);
      }
    });

    it('should calculate correct statistics in summary', async () => {
      const result = await suite.runSecurityTestSuite();

      expect(result.success).toBe(true);
      if (result.success) {
        const report = result.data;
        const calculatedTotal =
          report.passedTests +
          report.failedTests +
          report.blockedAttacks +
          report.skippedTests;
        expect(report.totalTests).toBe(calculatedTotal);
      }
    });

    it('should log events to audit logger when provided', async () => {
      await suite.runSecurityTestSuite({ enableRegressionTests: false });

      expect(mockDeps.auditLogger?.logSecurityTestEvent).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Penetration Testing Tests
  // -------------------------------------------------------------------------

  describe('runPenetrationTest', () => {
    it('should run cross-tenant access penetration test', async () => {
      const result = await suite.runPenetrationTest(AttackVector.CROSS_TENANT_ACCESS);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.attackVector).toBe(AttackVector.CROSS_TENANT_ACCESS);
        expect([SecurityTestStatus.BLOCKED, SecurityTestStatus.PASSED]).toContain(result.data.status);
      }
    });

    it('should run JWT manipulation penetration test', async () => {
      const result = await suite.runPenetrationTest(AttackVector.JWT_MANIPULATION);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.attackVector).toBe(AttackVector.JWT_MANIPULATION);
        expect(result.data.category).toBe(SecurityTestCategory.ATTACK_SIMULATION);
      }
    });

    it('should run token replay penetration test', async () => {
      const result = await suite.runPenetrationTest(AttackVector.TOKEN_REPLAY);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.attackVector).toBe(AttackVector.TOKEN_REPLAY);
      }
    });

    it('should fail for unknown attack vector', async () => {
      const result = await suite.runPenetrationTest('UNKNOWN_VECTOR' as AttackVector);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('PENTEST_SCENARIO_NOT_FOUND');
    });
  });

  describe('runAllPenetrationTests', () => {
    it('should run all penetration tests and return results', async () => {
      const result = await suite.runAllPenetrationTests();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.length).toBe(PENETRATION_TEST_SCENARIOS.length);
      }
    });

    it('should include results for all scenarios', async () => {
      const result = await suite.runAllPenetrationTests();

      expect(result.success).toBe(true);
      if (result.success) {
        const testIds = new Set(result.data.map((r) => r.testId));
        for (const scenario of PENETRATION_TEST_SCENARIOS) {
          // Each scenario should have a result (either exact match or derived)
          expect(result.data.some((r) => r.testId.includes(scenario.attackVector.toLowerCase()) || r.testId === scenario.id)).toBe(true);
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // Security Regression Testing Tests
  // -------------------------------------------------------------------------

  describe('runRegressionTests', () => {
    it('should run all regression tests and return results', async () => {
      const result = await suite.runRegressionTests();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.length).toBe(SECURITY_REGRESSION_TESTS.length);
      }
    });

    it('should categorize results as REGRESSION_TEST', async () => {
      const result = await suite.runRegressionTests();

      expect(result.success).toBe(true);
      if (result.success) {
        for (const testResult of result.data) {
          expect(testResult.category).toBe(SecurityTestCategory.REGRESSION_TEST);
        }
      }
    });
  });

  describe('runRegressionTest', () => {
    it('should run token version regression test', async () => {
      const result = await suite.runRegressionTest('regression-token-version-001');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.testId).toBe('regression-token-version-001');
        expect(result.data.status).toBe(SecurityTestStatus.PASSED);
      }
    });

    it('should run refresh token reuse regression test', async () => {
      const result = await suite.runRegressionTest('regression-refresh-token-reuse-001');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.testId).toBe('regression-refresh-token-reuse-001');
        expect(result.data.status).toBe(SecurityTestStatus.PASSED);
      }
    });

    it('should run tenant isolation regression test', async () => {
      const result = await suite.runRegressionTest('regression-tenant-isolation-001');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.testId).toBe('regression-tenant-isolation-001');
      }
    });

    it('should fail for unknown regression test', async () => {
      const result = await suite.runRegressionTest('unknown-test-id');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('REGRESSION_TEST_NOT_FOUND');
    });
  });

  // -------------------------------------------------------------------------
  // Environment Separation Testing Tests (Req 37)
  // -------------------------------------------------------------------------

  describe('validateEnvironmentSeparation', () => {
    it('should pass when environment configuration is correct', async () => {
      const result = await suite.validateEnvironmentSeparation({
        currentEnvironment: EnvironmentType.TESTING,
        targetEnvironment: EnvironmentType.TESTING,
        currentDbHost: 'db-testing.internal',
        expectedDbHost: 'db-testing.internal',
        currentSigningKeyId: 'key-testing-001',
        expectedSigningKeyId: 'key-testing-001',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityTestStatus.PASSED);
        expect(result.data.category).toBe(SecurityTestCategory.ENVIRONMENT_SEPARATION);
      }
    });

    it('should fail when database host mismatches', async () => {
      const result = await suite.validateEnvironmentSeparation({
        currentEnvironment: EnvironmentType.STAGING,
        targetEnvironment: EnvironmentType.STAGING,
        currentDbHost: 'db-production.internal', // Wrong!
        expectedDbHost: 'db-staging.internal',
        currentSigningKeyId: 'key-staging-001',
        expectedSigningKeyId: 'key-staging-001',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityTestStatus.FAILED);
        expect(result.data.riskLevel).toBe(RiskLevel.HIGH);
        expect(result.data.details?.issues).toBeDefined();
      }
    });

    it('should fail when signing key mismatches', async () => {
      const result = await suite.validateEnvironmentSeparation({
        currentEnvironment: EnvironmentType.STAGING,
        targetEnvironment: EnvironmentType.STAGING,
        currentDbHost: 'db-staging.internal',
        expectedDbHost: 'db-staging.internal',
        currentSigningKeyId: 'key-production-001', // Wrong!
        expectedSigningKeyId: 'key-staging-001',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityTestStatus.FAILED);
      }
    });
  });

  describe('testDatabaseEnvironmentIsolation', () => {
    it('should block cross-environment database access', async () => {
      const result = await suite.testDatabaseEnvironmentIsolation(
        EnvironmentType.TESTING,
        'db-production.internal', // Target production from testing
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityTestStatus.BLOCKED);
        expect(result.data.attackVector).toBe(AttackVector.ENVIRONMENT_CONFUSION);
      }
    });
  });

  describe('testSigningKeyEnvironmentBinding', () => {
    it('should verify signing key bound to correct environment', async () => {
      const result = await suite.testSigningKeyEnvironmentBinding(
        EnvironmentType.TESTING,
        'key-testing-001',
        EnvironmentType.TESTING,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityTestStatus.BLOCKED);
        expect(result.data.message).toContain('correctly bound');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Attack Simulation Tests
  // -------------------------------------------------------------------------

  describe('simulateCrossTenantAccess', () => {
    it('should detect and block cross-tenant access attempt', async () => {
      const result = await suite.simulateCrossTenantAccess(
        'attacker-tenant',
        'victim-tenant',
        'attacker-user',
        'victim-resource',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityTestStatus.BLOCKED);
        expect(result.data.attackVector).toBe(AttackVector.CROSS_TENANT_ACCESS);
        expect(result.data.details?.attackerTenantId).toBe('attacker-tenant');
        expect(result.data.details?.targetTenantId).toBe('victim-tenant');
      }
    });
  });

  describe('simulateJwtManipulation', () => {
    it('should block role escalation via JWT manipulation', async () => {
      const result = await suite.simulateJwtManipulation(
        'mock-jwt',
        'ROLE_ESCALATION',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityTestStatus.BLOCKED);
        expect(result.data.attackVector).toBe(AttackVector.JWT_MANIPULATION);
        expect(result.data.message).toContain('server-side');
      }
    });

    it('should block tenant switch via JWT manipulation', async () => {
      const result = await suite.simulateJwtManipulation(
        'mock-jwt',
        'TENANT_SWITCH',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityTestStatus.BLOCKED);
      }
    });

    it('should block token version bypass', async () => {
      const result = await suite.simulateJwtManipulation(
        'mock-jwt',
        'TOKEN_VERSION_BYPASS',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityTestStatus.BLOCKED);
      }
    });

    it('should block signature strip attack', async () => {
      const result = await suite.simulateJwtManipulation(
        'mock-jwt',
        'SIGNATURE_STRIP',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityTestStatus.BLOCKED);
      }
    });
  });

  describe('simulatePrivilegeEscalation', () => {
    it('should block privilege escalation attempt', async () => {
      const result = await suite.simulatePrivilegeEscalation(
        'user-123',
        MembershipRole.RESIDENT,
        MembershipRole.PLATFORM_ADMIN,
        'tenant-123',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityTestStatus.BLOCKED);
        expect(result.data.attackVector).toBe(AttackVector.PRIVILEGE_ESCALATION);
      }
    });
  });

  describe('simulateRlsBypassAttempt', () => {
    it('should block session variable clear bypass', async () => {
      const result = await suite.simulateRlsBypassAttempt(
        'user-123',
        'tenant-123',
        'SESSION_VARIABLE_CLEAR',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityTestStatus.BLOCKED);
        expect(result.data.attackVector).toBe(AttackVector.RLS_BYPASS);
      }
    });

    it('should block direct query bypass', async () => {
      const result = await suite.simulateRlsBypassAttempt(
        'user-123',
        'tenant-123',
        'DIRECT_QUERY',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityTestStatus.BLOCKED);
      }
    });
  });

  describe('simulateTokenReplayAttack', () => {
    it('should detect token replay attack', async () => {
      const result = await suite.simulateTokenReplayAttack(
        'revoked-hash',
        'family-123',
        2,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(SecurityTestStatus.BLOCKED);
        expect(result.data.attackVector).toBe(AttackVector.TOKEN_REPLAY);
        expect(result.data.message).toContain('detected and blocked');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Vulnerability Scanning Tests
  // -------------------------------------------------------------------------

  describe('performVulnerabilityScan', () => {
    it('should perform dependency scan', async () => {
      const result = await suite.performVulnerabilityScan('DEPENDENCY');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.scanner).toBe('DEPENDENCY');
        expect(result.data.timestamp).toBeDefined();
        expect(result.data.totalCount).toBeDefined();
      }
    });

    it('should perform SAST scan', async () => {
      const result = await suite.performVulnerabilityScan('SAST');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.scanner).toBe('SAST');
      }
    });
  });

  describe('parseVulnerabilityScanResults', () => {
    it('should parse valid JSON scanner output', () => {
      const scannerOutput = JSON.stringify({
        total: 5,
        critical: 1,
        high: 2,
        medium: 1,
        low: 1,
        info: 0,
        findings: [],
      });

      const result = suite.parseVulnerabilityScanResults(scannerOutput, 'test-scanner');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalCount).toBe(5);
        expect(result.data.criticalCount).toBe(1);
        expect(result.data.highCount).toBe(2);
      }
    });

    it('should fail for invalid JSON', () => {
      const result = suite.parseVulnerabilityScanResults('invalid-json', 'test-scanner');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VULNERABILITY_SCAN_PARSE_ERROR');
    });
  });

  // -------------------------------------------------------------------------
  // CI/CD Integration Tests
  // -------------------------------------------------------------------------

  describe('generateCiGateDecision', () => {
    it('should pass when no critical/high failures', () => {
      const report = {
        reportId: 'test',
        timestamp: new Date(),
        environment: EnvironmentType.TESTING,
        totalTests: 10,
        passedTests: 10,
        failedTests: 0,
        blockedAttacks: 0,
        skippedTests: 0,
        overallStatus: 'PASS' as const,
        totalDurationMs: 1000,
        results: [
          {
            testId: 'test-1',
            testName: 'Test 1',
            category: SecurityTestCategory.PENETRATION_TEST,
            status: SecurityTestStatus.PASSED,
            message: 'Passed',
            durationMs: 100,
            timestamp: new Date(),
          },
        ],
        summaryByCategory: {} as Record<SecurityTestCategory, { total: number; passed: number; failed: number }>,
        summaryByRisk: {} as Record<RiskLevel, { total: number; passed: number; failed: number }>,
        ciGateResult: { pass: true, reason: '' },
      };

      const result = suite.generateCiGateDecision(report);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.pass).toBe(true);
        expect(result.data.blockingFindings).toHaveLength(0);
      }
    });

    it('should fail when critical failures exist', () => {
      const report = {
        reportId: 'test',
        timestamp: new Date(),
        environment: EnvironmentType.TESTING,
        totalTests: 10,
        passedTests: 9,
        failedTests: 1,
        blockedAttacks: 0,
        skippedTests: 0,
        overallStatus: 'FAIL' as const,
        totalDurationMs: 1000,
        results: [
          {
            testId: 'test-critical',
            testName: 'Critical Test',
            category: SecurityTestCategory.PENETRATION_TEST,
            status: SecurityTestStatus.FAILED,
            message: 'Cross-tenant access not blocked!',
            durationMs: 100,
            timestamp: new Date(),
            riskLevel: RiskLevel.CRITICAL,
          },
        ],
        summaryByCategory: {} as Record<SecurityTestCategory, { total: number; passed: number; failed: number }>,
        summaryByRisk: {} as Record<RiskLevel, { total: number; passed: number; failed: number }>,
        ciGateResult: { pass: false, reason: '' },
      };

      const result = suite.generateCiGateDecision(report);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.pass).toBe(false);
        expect(result.data.blockingFindings.length).toBeGreaterThan(0);
        expect(result.data.reason).toContain('critical/high');
      }
    });
  });

  describe('generateCiReport', () => {
    const mockReport = {
      reportId: 'test',
      timestamp: new Date(),
      environment: EnvironmentType.TESTING,
      totalTests: 5,
      passedTests: 4,
      failedTests: 1,
      blockedAttacks: 0,
      skippedTests: 0,
      overallStatus: 'PARTIAL' as const,
      totalDurationMs: 500,
      results: [
        {
          testId: 'test-1',
          testName: 'Test 1',
          category: SecurityTestCategory.PENETRATION_TEST,
          status: SecurityTestStatus.PASSED,
          message: 'Passed',
          durationMs: 100,
          timestamp: new Date(),
        },
        {
          testId: 'test-2',
          testName: 'Test 2',
          category: SecurityTestCategory.REGRESSION_TEST,
          status: SecurityTestStatus.FAILED,
          message: 'Failed',
          durationMs: 100,
          timestamp: new Date(),
          riskLevel: RiskLevel.HIGH,
        },
      ],
      summaryByCategory: {} as Record<SecurityTestCategory, { total: number; passed: number; failed: number }>,
      summaryByRisk: {} as Record<RiskLevel, { total: number; passed: number; failed: number }>,
      ciGateResult: { pass: false, reason: 'Test failure' },
    };

    it('should generate JSON report', () => {
      const result = suite.generateCiReport(mockReport, 'JSON');

      expect(result.success).toBe(true);
      if (result.success) {
        const parsed = JSON.parse(result.data);
        expect(parsed.reportId).toBe('test');
        expect(parsed.totalTests).toBe(5);
      }
    });

    it('should generate JUnit XML report', () => {
      const result = suite.generateCiReport(mockReport, 'JUNIT');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toContain('<?xml');
        expect(result.data).toContain('<testsuite');
        expect(result.data).toContain('tests="5"');
        expect(result.data).toContain('failures="1"');
      }
    });

    it('should generate SARIF report', () => {
      const result = suite.generateCiReport(mockReport, 'SARIF');

      expect(result.success).toBe(true);
      if (result.success) {
        const parsed = JSON.parse(result.data);
        expect(parsed.version).toBe('2.1.0');
        expect(parsed.runs).toBeDefined();
        expect(parsed.runs[0].tool.driver.name).toBe('SecurityTestingSuite');
      }
    });

    it('should fail for unknown format', () => {
      const result = suite.generateCiReport(mockReport, 'UNKNOWN' as 'JSON');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('UNKNOWN_REPORT_FORMAT');
    });
  });
});
