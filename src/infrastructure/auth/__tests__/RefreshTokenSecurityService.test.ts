/**
 * RefreshTokenSecurityService Tests — Enhanced refresh token security controls.
 *
 * Tests cover:
 * - Device fingerprint hashing and validation
 * - Token binding creation and validation
 * - Refresh pattern anomaly detection
 * - Geographic impossibility detection
 * - Automatic revocation on suspicious activity
 * - Integration with TokenLeakDetectionService
 *
 * @see Task 42: Refresh Token Security (Req 53)
 * @see Requirement 53: Sensitive Operation Re-authentication
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  RefreshTokenSecurityServiceImpl,
  type RefreshTokenSecurityService,
  type DeviceFingerprint,
  type RefreshPatternData,
  type RefreshSecurityAuditLogger,
  type RefreshSecurityEvent,
  type RefreshTokenSecurityConfig,
} from '../RefreshTokenSecurityService';
import type { RefreshToken } from '@core/domains/auth/entities/RefreshToken';
import type {
  TokenLeakDetectionService,
  LeakDetectionResult,
  GeolocationInfo,
} from '../TokenLeakDetectionService';
import type { RefreshTokenService } from '../RefreshTokenService';
import { ok } from '@core/utils';

// ---------------------------------------------------------------------------
// Test Setup
// ---------------------------------------------------------------------------

/**
 * Create a mock RefreshToken for testing.
 */
function createMockRefreshToken(overrides?: Partial<RefreshToken>): RefreshToken {
  return {
    id: 'token-id-123',
    userId: 'user-123',
    tokenHash: 'hash-abc',
    familyId: 'family-xyz',
    generation: 1,
    createdAt: new Date('2024-01-01'),
    expiresAt: new Date('2024-01-31'),
    revokedAt: null,
    replacedBy: null,
    tenantId: 'tenant-123',
    userAgent: 'TestAgent/1.0',
    ipAddress: '192.168.1.1',
    ...overrides,
  };
}

/**
 * Create a mock DeviceFingerprint for testing.
 */
function createMockFingerprint(overrides?: Partial<DeviceFingerprint>): DeviceFingerprint {
  return {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    ipAddress: '192.168.1.1',
    screenResolution: '1920x1080',
    timezone: 'Asia/Jakarta',
    language: 'en-US',
    platform: 'Win32',
    characteristicsHash: 'characteristics-hash-123',
    ...overrides,
  };
}

/**
 * Create a mock GeolocationInfo for testing.
 */
function createMockGeolocation(overrides?: Partial<GeolocationInfo>): GeolocationInfo {
  return {
    country: 'ID',
    region: 'Jakarta',
    city: 'Jakarta',
    latitude: -6.2088,
    longitude: 106.8456,
    timezoneOffset: 420, // UTC+7
    ...overrides,
  };
}

/**
 * Create a mock RefreshPatternData for testing.
 */
function createMockRefreshPatternData(overrides?: Partial<RefreshPatternData>): RefreshPatternData {
  return {
    familyId: 'family-xyz',
    userId: 'user-123',
    refreshedAt: new Date(),
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    geolocation: createMockGeolocation(),
    ...overrides,
  };
}

/**
 * Create a mock TokenLeakDetectionService.
 */
function createMockTokenLeakDetectionService(): {
  service: TokenLeakDetectionService;
  mocks: {
    analyzeUsage: Mock;
    recordUsage: Mock;
  };
} {
  const mocks = {
    analyzeUsage: vi.fn(),
    recordUsage: vi.fn(),
  };

  const service: TokenLeakDetectionService = {
    analyzeUsage: mocks.analyzeUsage,
    recordUsage: mocks.recordUsage,
    getUsageHistory: vi.fn(),
    getRecentIPs: vi.fn(),
    isSuspiciousIP: vi.fn(),
    flagToken: vi.fn(),
    getFlaggedTokens: vi.fn(),
    clearFlag: vi.fn(),
  };

  return { service, mocks };
}

/**
 * Create a mock RefreshTokenService.
 */
function createMockRefreshTokenService(): {
  service: RefreshTokenService;
  mocks: {
    revokeToken: Mock;
    revokeFamily: Mock;
    revokeAllForUser: Mock;
  };
} {
  const mocks = {
    revokeToken: vi.fn(),
    revokeFamily: vi.fn(),
    revokeAllForUser: vi.fn(),
  };

  const service: RefreshTokenService = {
    createToken: vi.fn(),
    validateToken: vi.fn(),
    rotateToken: vi.fn(),
    revokeToken: mocks.revokeToken,
    revokeFamily: mocks.revokeFamily,
    revokeAllForUser: mocks.revokeAllForUser,
    revokeForUserAndTenant: vi.fn(),
    hashToken: vi.fn(),
    generateOpaqueToken: vi.fn(),
  };

  return { service, mocks };
}

/**
 * Create a mock audit logger.
 */
function createMockAuditLogger(): {
  logger: RefreshSecurityAuditLogger;
  events: RefreshSecurityEvent[];
} {
  const events: RefreshSecurityEvent[] = [];
  const logger: RefreshSecurityAuditLogger = (event) => {
    events.push(event);
  };
  return { logger, events };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RefreshTokenSecurityService', () => {
  let service: RefreshTokenSecurityService;
  let auditLogger: { logger: RefreshSecurityAuditLogger; events: RefreshSecurityEvent[] };

  beforeEach(() => {
    auditLogger = createMockAuditLogger();
    service = RefreshTokenSecurityServiceImpl({
      auditLogger: auditLogger.logger,
    });
  });

  describe('createFingerprintHash', () => {
    it('should create a consistent hash for the same fingerprint', () => {
      const fingerprint = createMockFingerprint();

      const hash1 = service.createFingerprintHash(fingerprint);
      const hash2 = service.createFingerprintHash(fingerprint);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex output
    });

    it('should create different hashes for different fingerprints', () => {
      const fingerprint1 = createMockFingerprint({ ipAddress: '192.168.1.1' });
      const fingerprint2 = createMockFingerprint({ ipAddress: '192.168.1.2' });

      const hash1 = service.createFingerprintHash(fingerprint1);
      const hash2 = service.createFingerprintHash(fingerprint2);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle optional fields gracefully', () => {
      const minimalFingerprint: DeviceFingerprint = {
        userAgent: 'TestAgent',
        ipAddress: '127.0.0.1',
      };

      const hash = service.createFingerprintHash(minimalFingerprint);

      expect(hash).toBeDefined();
      expect(hash).toHaveLength(64);
    });
  });

  describe('createTokenBinding', () => {
    it('should create a token binding with correct properties', async () => {
      const token = createMockRefreshToken();
      const fingerprint = createMockFingerprint();

      const result = await service.createTokenBinding(token, fingerprint);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeDefined();
        expect(result.data.userId).toBe(token.userId);
        expect(result.data.tenantId).toBe(token.tenantId);
        expect(result.data.deviceFingerprintHash).toBe(service.createFingerprintHash(fingerprint));
        expect(result.data.boundAt).toBeInstanceOf(Date);
        expect(result.data.lastValidated).toBeInstanceOf(Date);
      }
    });

    it('should store the binding for later retrieval', async () => {
      const token = createMockRefreshToken();
      const fingerprint = createMockFingerprint();

      await service.createTokenBinding(token, fingerprint);
      const binding = await service.getTokenBinding(token.id);

      expect(binding).not.toBeNull();
      expect(binding!.userId).toBe(token.userId);
    });
  });

  describe('validateTokenBinding', () => {
    it('should validate a matching token binding', async () => {
      const token = createMockRefreshToken();
      const fingerprint = createMockFingerprint();

      await service.createTokenBinding(token, fingerprint);
      const result = await service.validateTokenBinding(token, fingerprint);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeDefined();
        expect(result.data.isValid).toBe(true);
        expect(result.data.reason).toBe('valid');
      }
    });

    it('should fail validation when binding not found', async () => {
      const token = createMockRefreshToken();
      const fingerprint = createMockFingerprint();

      const result = await service.validateTokenBinding(token, fingerprint);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeDefined();
        expect(result.data.isValid).toBe(false);
        expect(result.data.reason).toBe('binding_not_found');
      }
    });

    it('should fail validation on user mismatch', async () => {
      const token = createMockRefreshToken({ userId: 'user-123' });
      const fingerprint = createMockFingerprint();

      await service.createTokenBinding(token, fingerprint);

      const differentUserToken = createMockRefreshToken({
        id: token.id,
        userId: 'user-456',
      });

      const result = await service.validateTokenBinding(differentUserToken, fingerprint);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeDefined();
        expect(result.data.isValid).toBe(false);
        expect(result.data.reason).toBe('user_mismatch');
      }
    });

    it('should fail validation on device fingerprint mismatch', async () => {
      const token = createMockRefreshToken();
      const originalFingerprint = createMockFingerprint({ ipAddress: '192.168.1.1' });

      await service.createTokenBinding(token, originalFingerprint);

      const differentFingerprint = createMockFingerprint({ ipAddress: '10.0.0.1' });
      const result = await service.validateTokenBinding(token, differentFingerprint);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeDefined();
        expect(result.data.isValid).toBe(false);
        expect(result.data.reason).toBe('device_fingerprint_mismatch');
      }
    });

    it('should fail validation on tenant mismatch', async () => {
      const token = createMockRefreshToken({ tenantId: 'tenant-123' });
      const fingerprint = createMockFingerprint();

      await service.createTokenBinding(token, fingerprint);

      const differentTenantToken = createMockRefreshToken({
        id: token.id,
        userId: token.userId,
        tenantId: 'tenant-456',
      });

      const result = await service.validateTokenBinding(differentTenantToken, fingerprint);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeDefined();
        expect(result.data.isValid).toBe(false);
        expect(result.data.reason).toBe('tenant_mismatch');
      }
    });
  });

  describe('analyzeRefreshPattern', () => {
    it('should detect no anomalies for normal refresh pattern', async () => {
      const currentData = createMockRefreshPatternData();

      const result = await service.analyzeRefreshPattern(
        currentData.userId,
        currentData.familyId,
        currentData,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeDefined();
        expect(result.data.anomalyDetected).toBe(false);
        expect(result.data.anomalyTypes).toHaveLength(0);
        expect(result.data.riskLevel).toBe('none');
        expect(result.data.recommendedAction).toBe('allow');
      }
    });

    it('should detect unusual frequency anomaly', async () => {
      // Create service with low threshold for testing
      const testService = RefreshTokenSecurityServiceImpl({
        config: { maxRefreshesPerHour: 2 },
        auditLogger: auditLogger.logger,
      });

      const baseData = createMockRefreshPatternData();

      // Record multiple refresh events
      for (let i = 0; i < 3; i++) {
        await testService.recordRefreshEvent({
          ...baseData,
          refreshedAt: new Date(Date.now() - i * 60000), // 1 minute apart
        });
      }

      const result = await testService.analyzeRefreshPattern(
        baseData.userId,
        baseData.familyId,
        baseData,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeDefined();
        expect(result.data.anomalyDetected).toBe(true);
        expect(result.data.anomalyTypes).toContain('unusual_frequency');
      }
    });

    it('should detect rapid refresh succession', async () => {
      const testService = RefreshTokenSecurityServiceImpl({
        config: { minRefreshIntervalMs: 60000 }, // 1 minute minimum
        auditLogger: auditLogger.logger,
      });

      const baseData = createMockRefreshPatternData();

      // Record a refresh event
      await testService.recordRefreshEvent({
        ...baseData,
        refreshedAt: new Date(Date.now() - 10000), // 10 seconds ago
      });

      // Try to refresh immediately
      const result = await testService.analyzeRefreshPattern(
        baseData.userId,
        baseData.familyId,
        {
          ...baseData,
          refreshedAt: new Date(),
        },
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeDefined();
        expect(result.data.anomalyDetected).toBe(true);
        expect(result.data.anomalyTypes).toContain('rapid_refresh_succession');
      }
    });

    it('should detect IP address change', async () => {
      const baseData = createMockRefreshPatternData({ ipAddress: '192.168.1.1' });

      // Record a refresh event
      await service.recordRefreshEvent(baseData);

      // Refresh from different IP
      const result = await service.analyzeRefreshPattern(
        baseData.userId,
        baseData.familyId,
        {
          ...baseData,
          ipAddress: '10.0.0.1',
          refreshedAt: new Date(),
        },
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeDefined();
        expect(result.data.anomalyDetected).toBe(true);
        expect(result.data.anomalyTypes).toContain('ip_address_change');
      }
    });

    it('should detect geographic impossibility', async () => {
      const jakartaLocation = createMockGeolocation({
        latitude: -6.2088,
        longitude: 106.8456,
        city: 'Jakarta',
      });

      const londonLocation = createMockGeolocation({
        latitude: 51.5074,
        longitude: -0.1278,
        city: 'London',
      });

      const baseData = createMockRefreshPatternData({
        geolocation: jakartaLocation,
      });

      // Record a refresh event from Jakarta
      await service.recordRefreshEvent({
        ...baseData,
        refreshedAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
      });

      // Try to refresh from London (impossible travel)
      const result = await service.analyzeRefreshPattern(
        baseData.userId,
        baseData.familyId,
        {
          ...baseData,
          geolocation: londonLocation,
          refreshedAt: new Date(),
        },
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeDefined();
        expect(result.data.anomalyDetected).toBe(true);
        expect(result.data.anomalyTypes).toContain('geographic_impossibility');
        expect(result.data.riskLevel).toBe('high');
      }
    });

    it('should detect user agent change', async () => {
      const baseData = createMockRefreshPatternData({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
      });

      // Record a refresh event
      await service.recordRefreshEvent(baseData);

      // Refresh with different user agent
      const result = await service.analyzeRefreshPattern(
        baseData.userId,
        baseData.familyId,
        {
          ...baseData,
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)',
          refreshedAt: new Date(),
        },
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeDefined();
        expect(result.data.anomalyDetected).toBe(true);
        expect(result.data.anomalyTypes).toContain('user_agent_change');
      }
    });
  });

  describe('validateRefreshAttempt', () => {
    it('should pass validation for valid refresh attempt', async () => {
      const token = createMockRefreshToken();
      const fingerprint = createMockFingerprint();

      // Create binding first
      await service.createTokenBinding(token, fingerprint);

      const result = await service.validateRefreshAttempt(token, fingerprint);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeDefined();
        expect(result.data.isValid).toBe(true);
        expect(result.data.recommendedAction).toBe('allow');
        expect(result.data.overallRiskLevel).toBe('none');
        expect(result.data.failureReasons).toHaveLength(0);
      }
    });

    it('should fail validation when binding is invalid', async () => {
      const token = createMockRefreshToken();
      const fingerprint = createMockFingerprint();
      // No binding created

      const result = await service.validateRefreshAttempt(token, fingerprint);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeDefined();
        expect(result.data.isValid).toBe(false);
        expect(result.data.failureReasons.length).toBeGreaterThan(0);
      }
    });

    it('should integrate with leak detection service', async () => {
      const { service: leakService, mocks } = createMockTokenLeakDetectionService();

      const leakResult: LeakDetectionResult = {
        leakDetected: false,
        confidence: 0,
        riskLevel: 'none',
        anomalies: [],
        recommendedActions: [],
      };

      mocks.analyzeUsage.mockResolvedValue(leakResult);
      mocks.recordUsage.mockResolvedValue(undefined);

      const serviceWithLeak = RefreshTokenSecurityServiceImpl({
        tokenLeakDetectionService: leakService,
        auditLogger: auditLogger.logger,
      });

      const token = createMockRefreshToken();
      const fingerprint = createMockFingerprint();

      await serviceWithLeak.createTokenBinding(token, fingerprint);
      await serviceWithLeak.validateRefreshAttempt(token, fingerprint);

      expect(mocks.analyzeUsage).toHaveBeenCalled();
      expect(mocks.recordUsage).toHaveBeenCalled();
    });

    it('should detect leak and escalate risk level', async () => {
      const { service: leakService, mocks } = createMockTokenLeakDetectionService();

      const leakResult: LeakDetectionResult = {
        leakDetected: true,
        confidence: 0.9,
        riskLevel: 'high',
        anomalies: [
          {
            type: 'geolocation_impossible_travel',
            description: 'Impossible travel detected',
            severity: 'high',
            evidence: {},
            detectedAt: new Date(),
          },
        ],
        recommendedActions: [
          {
            action: 'revoke_all_tokens',
            priority: 'immediate',
            reason: 'Token leak detected',
          },
        ],
      };

      mocks.analyzeUsage.mockResolvedValue(leakResult);
      mocks.recordUsage.mockResolvedValue(undefined);

      const serviceWithLeak = RefreshTokenSecurityServiceImpl({
        tokenLeakDetectionService: leakService,
        auditLogger: auditLogger.logger,
      });

      const token = createMockRefreshToken();
      const fingerprint = createMockFingerprint();

      await serviceWithLeak.createTokenBinding(token, fingerprint);
      const result = await serviceWithLeak.validateRefreshAttempt(token, fingerprint);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeDefined();
        expect(result.data.isValid).toBe(false);
        expect(result.data.leakDetectionResult).toBeDefined();
        expect(result.data.leakDetectionResult!.leakDetected).toBe(true);
        expect(result.data.failureReasons).toContain('Potential token leak detected');
      }
    });
  });

  describe('handleSecurityThreat', () => {
    it('should allow when no threat', async () => {
      const token = createMockRefreshToken();
      const threatInfo = {
        anomalyDetected: false,
        anomalyTypes: [],
        riskLevel: 'none' as const,
        confidence: 0,
        description: 'No anomalies',
        recommendedAction: 'allow' as const,
        evidence: {},
      };

      const result = await service.handleSecurityThreat(token, threatInfo);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('allow');
      }
    });

    it('should revoke family on high risk', async () => {
      const { service: refreshService, mocks } = createMockRefreshTokenService();

      mocks.revokeFamily.mockResolvedValue(ok(5));

      const serviceWithRevoke = RefreshTokenSecurityServiceImpl({
        refreshTokenService: refreshService,
        auditLogger: auditLogger.logger,
      });

      const token = createMockRefreshToken();
      const threatInfo = {
        anomalyDetected: true,
        anomalyTypes: ['geographic_impossibility' as const],
        riskLevel: 'high' as const,
        confidence: 0.9,
        description: 'Geographic impossibility detected',
        recommendedAction: 'revoke_family' as const,
        evidence: {},
      };

      const result = await serviceWithRevoke.handleSecurityThreat(token, threatInfo);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('revoke_family');
      }
      expect(mocks.revokeFamily).toHaveBeenCalledWith(token.familyId);
    });

    it('should revoke all user tokens on critical threat', async () => {
      const { service: refreshService, mocks } = createMockRefreshTokenService();

      mocks.revokeAllForUser.mockResolvedValue(ok(10));

      const serviceWithRevoke = RefreshTokenSecurityServiceImpl({
        refreshTokenService: refreshService,
        auditLogger: auditLogger.logger,
      });

      const token = createMockRefreshToken();
      const threatInfo = {
        anomalyDetected: true,
        anomalyTypes: ['geographic_impossibility' as const, 'device_fingerprint_mismatch' as const],
        riskLevel: 'critical' as const,
        confidence: 0.95,
        description: 'Critical security threat',
        recommendedAction: 'revoke_all_user_tokens' as const,
        evidence: {},
      };

      const result = await serviceWithRevoke.handleSecurityThreat(token, threatInfo);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('revoke_all_user_tokens');
      }
      expect(mocks.revokeAllForUser).toHaveBeenCalledWith(token.userId);
    });

    it('should log automatic revocation events', async () => {
      const { service: refreshService, mocks } = createMockRefreshTokenService();

      mocks.revokeFamily.mockResolvedValue(ok(5));

      const serviceWithAudit = RefreshTokenSecurityServiceImpl({
        refreshTokenService: refreshService,
        auditLogger: auditLogger.logger,
      });

      const token = createMockRefreshToken();
      const threatInfo = {
        anomalyDetected: true,
        anomalyTypes: ['geographic_impossibility' as const],
        riskLevel: 'high' as const,
        confidence: 0.9,
        description: 'Geographic impossibility detected',
        recommendedAction: 'revoke_family' as const,
        evidence: {},
      };

      await serviceWithAudit.handleSecurityThreat(token, threatInfo);

      const revocationEvent = auditLogger.events.find(
        e => e.eventType === 'automatic_revocation',
      );
      expect(revocationEvent).toBeDefined();
      expect(revocationEvent!.userId).toBe(token.userId);
      expect(revocationEvent!.actionTaken).toBe('revoke_family');
    });
  });

  describe('getRecentRefreshEvents', () => {
    it('should return empty array when no events', async () => {
      const events = await service.getRecentRefreshEvents('user-123');

      expect(events).toHaveLength(0);
    });

    it('should return recorded events', async () => {
      const data1 = createMockRefreshPatternData({ refreshedAt: new Date() });
      const data2 = createMockRefreshPatternData({ refreshedAt: new Date() });

      await service.recordRefreshEvent(data1);
      await service.recordRefreshEvent(data2);

      const events = await service.getRecentRefreshEvents(data1.userId, data1.familyId);

      expect(events.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by time window', async () => {
      const oldData = createMockRefreshPatternData({
        refreshedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      });
      const recentData = createMockRefreshPatternData({
        refreshedAt: new Date(),
      });

      await service.recordRefreshEvent(oldData);
      await service.recordRefreshEvent(recentData);

      // Get events from last 30 minutes
      const events = await service.getRecentRefreshEvents(
        recentData.userId,
        recentData.familyId,
        30 * 60 * 1000,
      );

      expect(events.length).toBe(1);
    });
  });

  describe('clearRefreshHistory', () => {
    it('should clear history for user/family', async () => {
      const data = createMockRefreshPatternData();

      await service.recordRefreshEvent(data);
      let events = await service.getRecentRefreshEvents(data.userId, data.familyId);
      expect(events.length).toBeGreaterThan(0);

      await service.clearRefreshHistory(data.userId, data.familyId);
      events = await service.getRecentRefreshEvents(data.userId, data.familyId);
      expect(events).toHaveLength(0);
    });
  });

  describe('getAnomalyCount', () => {
    it('should return 0 when no anomalies', async () => {
      const count = await service.getAnomalyCount('user-123');

      expect(count).toBe(0);
    });

    it('should count anomalies from pattern analysis', async () => {
      const testService = RefreshTokenSecurityServiceImpl({
        config: { maxRefreshesPerHour: 1 },
        auditLogger: auditLogger.logger,
      });

      const baseData = createMockRefreshPatternData();

      // Record events to trigger anomaly
      await testService.recordRefreshEvent({
        ...baseData,
        refreshedAt: new Date(Date.now() - 60000),
      });
      await testService.recordRefreshEvent({
        ...baseData,
        refreshedAt: new Date(Date.now() - 30000),
      });

      // Analyze pattern (triggers anomaly detection)
      await testService.analyzeRefreshPattern(
        baseData.userId,
        baseData.familyId,
        baseData,
      );

      const count = await testService.getAnomalyCount(baseData.userId);

      expect(count).toBeGreaterThan(0);
    });
  });

  describe('token binding lifecycle', () => {
    it('should update binding validation timestamp', async () => {
      const token = createMockRefreshToken();
      const fingerprint = createMockFingerprint();

      await service.createTokenBinding(token, fingerprint);
      const originalBinding = await service.getTokenBinding(token.id);

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      await service.updateBindingValidation(token.id);
      const updatedBinding = await service.getTokenBinding(token.id);

      expect(updatedBinding!.lastValidated.getTime()).toBeGreaterThanOrEqual(
        originalBinding!.lastValidated.getTime(),
      );
    });

    it('should remove token binding', async () => {
      const token = createMockRefreshToken();
      const fingerprint = createMockFingerprint();

      await service.createTokenBinding(token, fingerprint);
      let binding = await service.getTokenBinding(token.id);
      expect(binding).not.toBeNull();

      await service.removeTokenBinding(token.id);
      binding = await service.getTokenBinding(token.id);
      expect(binding).toBeNull();
    });
  });

  describe('configuration', () => {
    it('should use custom configuration', async () => {
      const customConfig: Partial<RefreshTokenSecurityConfig> = {
        maxRefreshesPerHour: 5,
        minRefreshIntervalMs: 10000,
        anomalyThresholdForRevocation: 2,
      };

      const customService = RefreshTokenSecurityServiceImpl({
        config: customConfig,
        auditLogger: auditLogger.logger,
      });

      // Verify service works with custom config
      const fingerprint = createMockFingerprint();
      const hash = customService.createFingerprintHash(fingerprint);
      expect(hash).toBeDefined();
    });

    it('should disable fingerprint validation when configured', async () => {
      const customService = RefreshTokenSecurityServiceImpl({
        config: { enableFingerprintValidation: false },
        auditLogger: auditLogger.logger,
      });

      const token = createMockRefreshToken();
      const originalFingerprint = createMockFingerprint({ ipAddress: '192.168.1.1' });

      await customService.createTokenBinding(token, originalFingerprint);

      // Different fingerprint should pass when validation disabled
      const differentFingerprint = createMockFingerprint({ ipAddress: '10.0.0.1' });
      const result = await customService.validateTokenBinding(token, differentFingerprint);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeDefined();
        expect(result.data.isValid).toBe(true);
      }
    });
  });

  describe('audit logging', () => {
    it('should log fingerprint mismatch events', async () => {
      const token = createMockRefreshToken();
      const originalFingerprint = createMockFingerprint({ ipAddress: '192.168.1.1' });

      await service.createTokenBinding(token, originalFingerprint);

      const differentFingerprint = createMockFingerprint({ ipAddress: '10.0.0.1' });
      await service.validateTokenBinding(token, differentFingerprint);

      const mismatchEvent = auditLogger.events.find(
        e => e.eventType === 'fingerprint_mismatch',
      );
      expect(mismatchEvent).toBeDefined();
      expect(mismatchEvent!.severity).toBe('high');
    });

    it('should log anomaly detection events', async () => {
      const testService = RefreshTokenSecurityServiceImpl({
        config: { maxRefreshesPerHour: 1 },
        auditLogger: auditLogger.logger,
      });

      const baseData = createMockRefreshPatternData();

      // Trigger frequency anomaly
      await testService.recordRefreshEvent({
        ...baseData,
        refreshedAt: new Date(Date.now() - 60000),
      });
      await testService.recordRefreshEvent({
        ...baseData,
        refreshedAt: new Date(Date.now() - 30000),
      });

      await testService.analyzeRefreshPattern(
        baseData.userId,
        baseData.familyId,
        baseData,
      );

      const anomalyEvent = auditLogger.events.find(
        e => e.eventType === 'anomaly_detected',
      );
      expect(anomalyEvent).toBeDefined();
    });
  });
});
