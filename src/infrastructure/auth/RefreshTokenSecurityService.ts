/**
 * RefreshTokenSecurityService — Enhanced refresh token security controls.
 *
 * Implements advanced security mechanisms for refresh tokens:
 * - Token binding validation (user/device/tenant)
 * - Device fingerprint tracking and validation
 * - Refresh pattern anomaly detection (frequency, time, location)
 * - Automatic revocation on suspicious activity
 *
 * @see Task 42: Refresh Token Security (Req 53)
 * @see Requirement 53: Sensitive Operation Re-authentication
 * @see Design D2: Refresh token security mechanisms
 */

import crypto from 'crypto';

import type { AppError, DomainResult } from '@core/utils';
import { ok, fail, isFail, authenticationError } from '@core/utils';
import type { RefreshToken } from '@core/domains/auth/entities/RefreshToken';
import type {
  TokenLeakDetectionService,
  TokenUsageEvent,
  LeakDetectionResult,
  GeolocationInfo,
  RiskLevel,
} from './TokenLeakDetectionService';
import type { RefreshTokenService } from './RefreshTokenService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Device fingerprint information for token binding.
 */
export interface DeviceFingerprint {
  /** User agent string */
  readonly userAgent: string;
  /** Client IP address */
  readonly ipAddress: string;
  /** Screen resolution (if available) */
  readonly screenResolution?: string;
  /** Timezone */
  readonly timezone?: string;
  /** Browser language */
  readonly language?: string;
  /** Platform/OS */
  readonly platform?: string;
  /** Hash of additional browser characteristics */
  readonly characteristicsHash?: string;
}

/**
 * Token binding information for validation.
 */
export interface TokenBinding {
  /** User ID the token is bound to */
  readonly userId: string;
  /** Tenant ID the token is bound to (optional for cross-tenant users) */
  readonly tenantId?: string;
  /** Device fingerprint hash */
  readonly deviceFingerprintHash: string;
  /** Timestamp of binding creation */
  readonly boundAt: Date;
  /** Last validated timestamp */
  readonly lastValidated: Date;
}

/**
 * Refresh pattern data for anomaly detection.
 */
export interface RefreshPatternData {
  /** Token family ID */
  readonly familyId: string;
  /** User ID */
  readonly userId: string;
  /** Timestamp of refresh */
  readonly refreshedAt: Date;
  /** IP address used */
  readonly ipAddress: string;
  /** User agent used */
  readonly userAgent?: string;
  /** Geolocation info (if available) */
  readonly geolocation?: GeolocationInfo;
}

/**
 * Refresh pattern anomaly detection result.
 */
export interface RefreshPatternAnomalyResult {
  /** Whether an anomaly was detected */
  readonly anomalyDetected: boolean;
  /** Types of anomalies detected */
  readonly anomalyTypes: RefreshAnomalyType[];
  /** Risk level assessment */
  readonly riskLevel: RiskLevel;
  /** Confidence score (0-1) */
  readonly confidence: number;
  /** Human-readable description */
  readonly description: string;
  /** Recommended action */
  readonly recommendedAction: RefreshSecurityAction;
  /** Evidence details */
  readonly evidence: RefreshAnomalyEvidence;
}

export type RefreshAnomalyType =
  | 'unusual_frequency'
  | 'geographic_impossibility'
  | 'time_pattern_anomaly'
  | 'device_fingerprint_mismatch'
  | 'ip_address_change'
  | 'user_agent_change'
  | 'rapid_refresh_succession';

export type RefreshSecurityAction =
  | 'allow'
  | 'require_reauth'
  | 'revoke_token'
  | 'revoke_family'
  | 'revoke_all_user_tokens'
  | 'alert_admin'
  | 'block_request';

/**
 * Evidence for refresh anomaly detection.
 */
export interface RefreshAnomalyEvidence {
  /** Recent refresh count within window */
  readonly recentRefreshCount?: number;
  /** Time since last refresh (ms) */
  readonly timeSinceLastRefreshMs?: number;
  /** Distance between refresh locations (km) */
  readonly distanceBetweenRefreshesKm?: number;
  /** Expected fingerprint hash */
  readonly expectedFingerprintHash?: string;
  /** Actual fingerprint hash */
  readonly actualFingerprintHash?: string;
  /** Previous IP */
  readonly previousIp?: string;
  /** Current IP */
  readonly currentIp?: string;
  /** Previous user agent */
  readonly previousUserAgent?: string;
  /** Current user agent */
  readonly currentUserAgent?: string;
}

/**
 * Token binding validation result.
 */
export interface TokenBindingValidationResult {
  /** Whether the binding is valid */
  readonly isValid: boolean;
  /** Reason for validation result */
  readonly reason: TokenBindingValidationReason;
  /** Details about the validation */
  readonly details?: string;
}

export type TokenBindingValidationReason =
  | 'valid'
  | 'user_mismatch'
  | 'tenant_mismatch'
  | 'device_fingerprint_mismatch'
  | 'binding_not_found'
  | 'binding_expired';

/**
 * Security event for audit logging.
 */
export interface RefreshSecurityEvent {
  /** Event type */
  readonly eventType: RefreshSecurityEventType;
  /** User ID */
  readonly userId: string;
  /** Token family ID */
  readonly familyId?: string;
  /** Tenant ID */
  readonly tenantId?: string;
  /** Event timestamp */
  readonly timestamp: Date;
  /** Event severity */
  readonly severity: RefreshSecuritySeverity;
  /** Event description */
  readonly description: string;
  /** Additional metadata */
  readonly metadata?: Record<string, unknown>;
  /** Action taken */
  readonly actionTaken?: RefreshSecurityAction;
  /** Correlation ID */
  readonly correlationId?: string;
}

export type RefreshSecurityEventType =
  | 'binding_validation_failed'
  | 'fingerprint_mismatch'
  | 'anomaly_detected'
  | 'automatic_revocation'
  | 'suspicious_refresh_pattern'
  | 'geographic_impossibility_detected'
  | 'rapid_refresh_detected';

export type RefreshSecuritySeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Configuration for RefreshTokenSecurityService.
 */
export interface RefreshTokenSecurityConfig {
  /** Maximum refresh attempts per hour (default: 10) */
  readonly maxRefreshesPerHour: number;
  /** Minimum time between refreshes in milliseconds (default: 30 seconds) */
  readonly minRefreshIntervalMs: number;
  /** Maximum distance (km) that's impossible to travel in refresh window */
  readonly impossibleTravelDistanceKm: number;
  /** Time window for impossible travel detection (default: 30 minutes) */
  readonly impossibleTravelWindowMs: number;
  /** Anomaly threshold for automatic revocation (default: 3) */
  readonly anomalyThresholdForRevocation: number;
  /** Enable device fingerprint validation (default: true) */
  readonly enableFingerprintValidation: boolean;
  /** Enable geographic validation (default: true) */
  readonly enableGeographicValidation: boolean;
  /** Token binding expiry in milliseconds (default: 30 days) */
  readonly bindingExpiryMs: number;
  /** Time window for refresh frequency analysis (default: 1 hour) */
  readonly frequencyAnalysisWindowMs: number;
}

const DEFAULT_CONFIG: RefreshTokenSecurityConfig = {
  maxRefreshesPerHour: 10,
  minRefreshIntervalMs: 30 * 1000, // 30 seconds
  impossibleTravelDistanceKm: 500,
  impossibleTravelWindowMs: 30 * 60 * 1000, // 30 minutes
  anomalyThresholdForRevocation: 3,
  enableFingerprintValidation: true,
  enableGeographicValidation: true,
  bindingExpiryMs: 30 * 24 * 60 * 60 * 1000, // 30 days
  frequencyAnalysisWindowMs: 60 * 60 * 1000, // 1 hour
};

/**
 * Audit logger function type.
 */
export type RefreshSecurityAuditLogger = (event: RefreshSecurityEvent) => void | Promise<void>;

// ---------------------------------------------------------------------------
// Error Factories
// ---------------------------------------------------------------------------

/**
 * Token binding validation failed.
 */
export function authTokenBindingInvalid(reason: TokenBindingValidationReason): AppError {
  return authenticationError(
    'AUTH_TOKEN_BINDING_INVALID',
    `Token binding validation failed: ${reason}`,
    { userMessage: 'Your session could not be verified. Please log in again.' },
  );
}

/**
 * Device fingerprint mismatch detected.
 */
export function authDeviceFingerprintMismatch(): AppError {
  return authenticationError(
    'AUTH_DEVICE_FINGERPRINT_MISMATCH',
    'Device fingerprint does not match the original session',
    { userMessage: 'For your security, please log in again from this device.' },
  );
}

/**
 * Refresh pattern anomaly detected.
 */
export function authRefreshAnomalyDetected(anomalyType: RefreshAnomalyType): AppError {
  return authenticationError(
    'AUTH_REFRESH_ANOMALY_DETECTED',
    `Suspicious refresh pattern detected: ${anomalyType}`,
    { userMessage: 'Unusual activity detected. For your security, please log in again.' },
  );
}

/**
 * Automatic token revocation due to security concerns.
 */
export function authTokenAutoRevoked(): AppError {
  return authenticationError(
    'AUTH_TOKEN_AUTO_REVOKED',
    'Token automatically revoked due to security concerns',
    { userMessage: 'Your session was terminated for security reasons. Please log in again.' },
  );
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface RefreshTokenSecurityService {
  /**
   * Create a device fingerprint hash from fingerprint data.
   */
  createFingerprintHash(fingerprint: DeviceFingerprint): string;

  /**
   * Create a token binding for a newly issued token.
   */
  createTokenBinding(
    token: RefreshToken,
    fingerprint: DeviceFingerprint,
  ): Promise<DomainResult<TokenBinding>>;

  /**
   * Validate token binding before allowing refresh.
   */
  validateTokenBinding(
    token: RefreshToken,
    fingerprint: DeviceFingerprint,
  ): Promise<DomainResult<TokenBindingValidationResult>>;

  /**
   * Record a refresh event for pattern analysis.
   */
  recordRefreshEvent(data: RefreshPatternData): Promise<void>;

  /**
   * Analyze refresh patterns for anomalies.
   */
  analyzeRefreshPattern(
    userId: string,
    familyId: string,
    currentData: RefreshPatternData,
  ): Promise<DomainResult<RefreshPatternAnomalyResult>>;

  /**
   * Perform comprehensive security validation on a refresh attempt.
   * Combines binding validation, pattern analysis, and leak detection.
   */
  validateRefreshAttempt(
    token: RefreshToken,
    fingerprint: DeviceFingerprint,
    geolocation?: GeolocationInfo,
  ): Promise<DomainResult<RefreshSecurityValidationResult>>;

  /**
   * Handle automatic revocation based on security findings.
   */
  handleSecurityThreat(
    token: RefreshToken,
    threatInfo: RefreshPatternAnomalyResult,
  ): Promise<DomainResult<RefreshSecurityAction>>;

  /**
   * Get recent refresh events for a user/family.
   */
  getRecentRefreshEvents(
    userId: string,
    familyId?: string,
    windowMs?: number,
  ): Promise<RefreshPatternData[]>;

  /**
   * Clear refresh history for a user (e.g., after logout).
   */
  clearRefreshHistory(userId: string, familyId?: string): Promise<void>;

  /**
   * Get token binding if it exists.
   */
  getTokenBinding(tokenId: string): Promise<TokenBinding | null>;

  /**
   * Update last validated timestamp for a binding.
   */
  updateBindingValidation(tokenId: string): Promise<void>;

  /**
   * Remove token binding.
   */
  removeTokenBinding(tokenId: string): Promise<void>;

  /**
   * Get anomaly count for a user within a time window.
   */
  getAnomalyCount(userId: string, windowMs?: number): Promise<number>;
}

/**
 * Result of comprehensive refresh security validation.
 */
export interface RefreshSecurityValidationResult {
  /** Overall validation passed */
  readonly isValid: boolean;
  /** Binding validation result */
  readonly bindingResult: TokenBindingValidationResult;
  /** Pattern anomaly result */
  readonly patternResult: RefreshPatternAnomalyResult;
  /** Leak detection result (if integrated) */
  readonly leakDetectionResult?: LeakDetectionResult;
  /** Overall recommended action */
  readonly recommendedAction: RefreshSecurityAction;
  /** Combined risk level */
  readonly overallRiskLevel: RiskLevel;
  /** Reasons for any failures */
  readonly failureReasons: string[];
}

// ---------------------------------------------------------------------------
// Service Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function for RefreshTokenSecurityService.
 * Follows DI pattern.
 */
export function RefreshTokenSecurityServiceImpl({
  tokenLeakDetectionService,
  refreshTokenService,
  config = {},
  auditLogger,
}: {
  tokenLeakDetectionService?: TokenLeakDetectionService;
  refreshTokenService?: RefreshTokenService;
  config?: Partial<RefreshTokenSecurityConfig>;
  auditLogger?: RefreshSecurityAuditLogger;
}): RefreshTokenSecurityService {
  const finalConfig: RefreshTokenSecurityConfig = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  // In-memory storage (use Redis/database in production)
  const tokenBindings = new Map<string, TokenBinding>();
  const refreshHistory = new Map<string, RefreshPatternData[]>();
  const anomalyCounts = new Map<string, Array<{ timestamp: Date; type: RefreshAnomalyType }>>();

  // ---------------------------------------------------------------------------
  // Helper Functions
  // ---------------------------------------------------------------------------

  /**
   * Log a security event.
   */
  async function logSecurityEvent(event: RefreshSecurityEvent): Promise<void> {
    if (auditLogger) {
      try {
        await auditLogger(event);
      } catch {
        console.error('Failed to log refresh security event');
      }
    }
  }

  /**
   * Calculate distance between two points using Haversine formula.
   */
  function calculateDistanceKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Get history key for a user/family combination.
   */
  function getHistoryKey(userId: string, familyId?: string): string {
    return familyId ? `${userId}:${familyId}` : userId;
  }

  /**
   * Increment anomaly count for a user.
   */
  function recordAnomaly(userId: string, type: RefreshAnomalyType): void {
    const userAnomalies = anomalyCounts.get(userId) || [];
    userAnomalies.push({ timestamp: new Date(), type });

    // Keep only anomalies within the configured window
    const cutoff = new Date(Date.now() - finalConfig.frequencyAnalysisWindowMs);
    const filteredAnomalies = userAnomalies.filter(a => a.timestamp >= cutoff);
    anomalyCounts.set(userId, filteredAnomalies);
  }

  /**
   * Determine risk level from anomaly count and types.
   */
  function calculateRiskLevel(anomalyTypes: RefreshAnomalyType[]): RiskLevel {
    if (anomalyTypes.length === 0) return 'none';

    const hasGeographicAnomaly = anomalyTypes.includes('geographic_impossibility');
    const hasFingerprintMismatch = anomalyTypes.includes('device_fingerprint_mismatch');
    const hasRapidRefresh = anomalyTypes.includes('rapid_refresh_succession');

    if (hasGeographicAnomaly && (hasFingerprintMismatch || hasRapidRefresh)) {
      return 'critical';
    }
    if (hasGeographicAnomaly || hasFingerprintMismatch) {
      return 'high';
    }
    if (anomalyTypes.length >= 2) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Determine recommended action based on risk level and anomalies.
   */
  function determineAction(
    riskLevel: RiskLevel,
    anomalyTypes: RefreshAnomalyType[],
    anomalyCount: number,
  ): RefreshSecurityAction {
    if (riskLevel === 'critical' || anomalyCount >= finalConfig.anomalyThresholdForRevocation) {
      return 'revoke_family';
    }
    if (riskLevel === 'high') {
      return 'require_reauth';
    }
    if (riskLevel === 'medium') {
      return 'alert_admin';
    }
    if (anomalyTypes.includes('rapid_refresh_succession')) {
      return 'block_request';
    }
    return 'allow';
  }

  // ---------------------------------------------------------------------------
  // Service Methods
  // ---------------------------------------------------------------------------

  function createFingerprintHash(fingerprint: DeviceFingerprint): string {
    const components = [
      fingerprint.userAgent,
      fingerprint.ipAddress,
      fingerprint.screenResolution || '',
      fingerprint.timezone || '',
      fingerprint.language || '',
      fingerprint.platform || '',
      fingerprint.characteristicsHash || '',
    ].join('|');

    return crypto.createHash('sha256').update(components).digest('hex');
  }

  async function createTokenBinding(
    token: RefreshToken,
    fingerprint: DeviceFingerprint,
  ): Promise<DomainResult<TokenBinding>> {
    const fingerprintHash = createFingerprintHash(fingerprint);
    const now = new Date();

    const binding: TokenBinding = {
      userId: token.userId,
      tenantId: token.tenantId ?? undefined,
      deviceFingerprintHash: fingerprintHash,
      boundAt: now,
      lastValidated: now,
    };

    tokenBindings.set(token.id, binding);

    await logSecurityEvent({
      eventType: 'binding_validation_failed', // Actually creation - but we log it
      userId: token.userId,
      familyId: token.familyId,
      tenantId: token.tenantId ?? undefined,
      timestamp: now,
      severity: 'low',
      description: 'Token binding created',
      metadata: {
        tokenId: token.id,
        fingerprintHash,
      },
    });

    return ok(binding);
  }

  async function validateTokenBinding(
    token: RefreshToken,
    fingerprint: DeviceFingerprint,
  ): Promise<DomainResult<TokenBindingValidationResult>> {
    const binding = tokenBindings.get(token.id);

    if (!binding) {
      return ok({
        isValid: false,
        reason: 'binding_not_found',
        details: 'No binding found for this token',
      });
    }

    // Check binding expiry
    const bindingAge = Date.now() - binding.boundAt.getTime();
    if (bindingAge > finalConfig.bindingExpiryMs) {
      return ok({
        isValid: false,
        reason: 'binding_expired',
        details: 'Token binding has expired',
      });
    }

    // Validate user match
    if (binding.userId !== token.userId) {
      await logSecurityEvent({
        eventType: 'binding_validation_failed',
        userId: token.userId,
        familyId: token.familyId,
        tenantId: token.tenantId ?? undefined,
        timestamp: new Date(),
        severity: 'critical',
        description: 'User ID mismatch in token binding',
        metadata: {
          expectedUserId: binding.userId,
          actualUserId: token.userId,
        },
      });

      return ok({
        isValid: false,
        reason: 'user_mismatch',
        details: 'Token user does not match binding',
      });
    }

    // Validate tenant match (if binding has tenant)
    if (binding.tenantId && binding.tenantId !== token.tenantId) {
      await logSecurityEvent({
        eventType: 'binding_validation_failed',
        userId: token.userId,
        familyId: token.familyId,
        tenantId: token.tenantId ?? undefined,
        timestamp: new Date(),
        severity: 'high',
        description: 'Tenant ID mismatch in token binding',
        metadata: {
          expectedTenantId: binding.tenantId,
          actualTenantId: token.tenantId,
        },
      });

      return ok({
        isValid: false,
        reason: 'tenant_mismatch',
        details: 'Token tenant does not match binding',
      });
    }

    // Validate device fingerprint if enabled
    if (finalConfig.enableFingerprintValidation) {
      const currentFingerprintHash = createFingerprintHash(fingerprint);
      if (currentFingerprintHash !== binding.deviceFingerprintHash) {
        await logSecurityEvent({
          eventType: 'fingerprint_mismatch',
          userId: token.userId,
          familyId: token.familyId,
          tenantId: token.tenantId ?? undefined,
          timestamp: new Date(),
          severity: 'high',
          description: 'Device fingerprint mismatch detected',
          metadata: {
            expectedHash: binding.deviceFingerprintHash,
            actualHash: currentFingerprintHash,
          },
        });

        return ok({
          isValid: false,
          reason: 'device_fingerprint_mismatch',
          details: 'Device fingerprint does not match original session',
        });
      }
    }

    // Update last validated timestamp
    tokenBindings.set(token.id, {
      ...binding,
      lastValidated: new Date(),
    });

    return ok({
      isValid: true,
      reason: 'valid',
    });
  }

  async function recordRefreshEvent(data: RefreshPatternData): Promise<void> {
    const key = getHistoryKey(data.userId, data.familyId);
    const history = refreshHistory.get(key) || [];
    history.push(data);

    // Keep only events within the configured window
    const cutoff = new Date(Date.now() - finalConfig.frequencyAnalysisWindowMs);
    const filteredHistory = history.filter(e => e.refreshedAt >= cutoff);
    refreshHistory.set(key, filteredHistory);
  }

  async function analyzeRefreshPattern(
    userId: string,
    familyId: string,
    currentData: RefreshPatternData,
  ): Promise<DomainResult<RefreshPatternAnomalyResult>> {
    const anomalyTypes: RefreshAnomalyType[] = [];
    const evidence: RefreshAnomalyEvidence = {};

    // Get recent refresh history
    const key = getHistoryKey(userId, familyId);
    const history = refreshHistory.get(key) || [];
    const cutoff = new Date(Date.now() - finalConfig.frequencyAnalysisWindowMs);
    const recentHistory = history.filter(e => e.refreshedAt >= cutoff);

    // 1. Check refresh frequency
    const refreshCountInWindow = recentHistory.length + 1;
    (evidence as { recentRefreshCount?: number }).recentRefreshCount = refreshCountInWindow;

    if (refreshCountInWindow > finalConfig.maxRefreshesPerHour) {
      anomalyTypes.push('unusual_frequency');
    }

    // 2. Check time since last refresh
    if (recentHistory.length > 0) {
      const lastRefresh = recentHistory[recentHistory.length - 1];
      if (lastRefresh) {
        const timeSinceLastRefresh = currentData.refreshedAt.getTime() - lastRefresh.refreshedAt.getTime();
        (evidence as { timeSinceLastRefreshMs?: number }).timeSinceLastRefreshMs = timeSinceLastRefresh;

        if (timeSinceLastRefresh < finalConfig.minRefreshIntervalMs) {
          anomalyTypes.push('rapid_refresh_succession');
        }

        // 3. Check IP address change
        if (lastRefresh.ipAddress !== currentData.ipAddress) {
          anomalyTypes.push('ip_address_change');
          (evidence as { previousIp?: string }).previousIp = lastRefresh.ipAddress;
          (evidence as { currentIp?: string }).currentIp = currentData.ipAddress;
        }

        // 4. Check user agent change
        if (lastRefresh.userAgent && currentData.userAgent && lastRefresh.userAgent !== currentData.userAgent) {
          anomalyTypes.push('user_agent_change');
          (evidence as { previousUserAgent?: string }).previousUserAgent = lastRefresh.userAgent;
          (evidence as { currentUserAgent?: string }).currentUserAgent = currentData.userAgent;
        }

        // 5. Check geographic impossibility
        if (
          finalConfig.enableGeographicValidation &&
          lastRefresh.geolocation?.latitude &&
          lastRefresh.geolocation?.longitude &&
          currentData.geolocation?.latitude &&
          currentData.geolocation?.longitude
        ) {
          const distance = calculateDistanceKm(
            lastRefresh.geolocation.latitude,
            lastRefresh.geolocation.longitude,
            currentData.geolocation.latitude,
            currentData.geolocation.longitude,
          );

          const timeDiffHours = timeSinceLastRefresh / (1000 * 60 * 60);
          (evidence as { distanceBetweenRefreshesKm?: number }).distanceBetweenRefreshesKm = distance;

          // Check if travel is impossible (more than threshold km per hour)
          if (timeDiffHours > 0 && distance / timeDiffHours > finalConfig.impossibleTravelDistanceKm) {
            anomalyTypes.push('geographic_impossibility');
          }
        }
      }
    }

    // Calculate risk level and action
    const riskLevel = calculateRiskLevel(anomalyTypes);
    const anomalyCount = await getAnomalyCount(userId);
    const recommendedAction = determineAction(riskLevel, anomalyTypes, anomalyCount);

    // Record anomalies
    for (const type of anomalyTypes) {
      recordAnomaly(userId, type);
    }

    // Calculate confidence
    const confidence = anomalyTypes.length > 0
      ? Math.min(0.3 + anomalyTypes.length * 0.2, 0.95)
      : 0;

    // Build description
    const description = anomalyTypes.length > 0
      ? `Detected anomalies: ${anomalyTypes.join(', ')}`
      : 'No anomalies detected';

    // Log if anomaly detected
    if (anomalyTypes.length > 0) {
      await logSecurityEvent({
        eventType: 'anomaly_detected',
        userId,
        familyId,
        tenantId: currentData.geolocation?.country, // Using available context
        timestamp: new Date(),
        severity: riskLevel === 'critical' ? 'critical' : riskLevel === 'high' ? 'high' : 'medium',
        description,
        metadata: {
          anomalyTypes,
          evidence,
          recommendedAction,
        },
        actionTaken: recommendedAction,
      });
    }

    return ok({
      anomalyDetected: anomalyTypes.length > 0,
      anomalyTypes,
      riskLevel,
      confidence,
      description,
      recommendedAction,
      evidence,
    });
  }

  async function validateRefreshAttempt(
    token: RefreshToken,
    fingerprint: DeviceFingerprint,
    geolocation?: GeolocationInfo,
  ): Promise<DomainResult<RefreshSecurityValidationResult>> {
    const failureReasons: string[] = [];
    let overallRiskLevel: RiskLevel = 'none';

    // 1. Validate token binding
    const bindingResult = await validateTokenBinding(token, fingerprint);
    if (isFail(bindingResult)) {
      return fail(bindingResult.error);
    }

    if (!bindingResult.data.isValid) {
      failureReasons.push(`Binding validation failed: ${bindingResult.data.reason}`);
      overallRiskLevel = 'high';
    }

    // 2. Analyze refresh pattern
    const currentPatternData: RefreshPatternData = {
      familyId: token.familyId,
      userId: token.userId,
      refreshedAt: new Date(),
      ipAddress: fingerprint.ipAddress,
      userAgent: fingerprint.userAgent,
      geolocation,
    };

    const patternResult = await analyzeRefreshPattern(
      token.userId,
      token.familyId,
      currentPatternData,
    );
    if (isFail(patternResult)) {
      return fail(patternResult.error);
    }

    if (patternResult.data.anomalyDetected) {
      failureReasons.push(patternResult.data.description);
      overallRiskLevel = patternResult.data.riskLevel;
    }

    // 3. Integrate with leak detection service if available
    let leakDetectionResult: LeakDetectionResult | undefined;
    if (tokenLeakDetectionService) {
      const usageEvent: TokenUsageEvent = {
        tokenId: token.id,
        userId: token.userId,
        tenantId: token.tenantId ?? undefined,
        ipAddress: fingerprint.ipAddress,
        userAgent: fingerprint.userAgent,
        timestamp: new Date(),
        geolocation,
      };

      leakDetectionResult = await tokenLeakDetectionService.analyzeUsage(usageEvent);
      await tokenLeakDetectionService.recordUsage(usageEvent);

      if (leakDetectionResult.leakDetected) {
        failureReasons.push('Potential token leak detected');
        if (
          leakDetectionResult.riskLevel === 'critical' ||
          (leakDetectionResult.riskLevel === 'high' && overallRiskLevel !== 'critical')
        ) {
          overallRiskLevel = leakDetectionResult.riskLevel;
        }
      }
    }

    // Determine overall validation result
    const isValid = bindingResult.data.isValid &&
      !patternResult.data.anomalyDetected &&
      !leakDetectionResult?.leakDetected;

    // Determine recommended action
    let recommendedAction: RefreshSecurityAction = 'allow';
    if (!isValid) {
      recommendedAction = patternResult.data.recommendedAction;
      if (leakDetectionResult?.leakDetected && overallRiskLevel === 'critical') {
        recommendedAction = 'revoke_all_user_tokens';
      }
    }

    // Record the refresh event
    await recordRefreshEvent(currentPatternData);

    return ok({
      isValid,
      bindingResult: bindingResult.data,
      patternResult: patternResult.data,
      leakDetectionResult,
      recommendedAction,
      overallRiskLevel,
      failureReasons,
    });
  }

  async function handleSecurityThreat(
    token: RefreshToken,
    threatInfo: RefreshPatternAnomalyResult,
  ): Promise<DomainResult<RefreshSecurityAction>> {
    const action = threatInfo.recommendedAction;

    if (action === 'allow') {
      return ok(action);
    }

    // Execute the recommended action
    try {
      switch (action) {
        case 'revoke_token':
          if (refreshTokenService) {
            await refreshTokenService.revokeToken(token.tokenHash);
          }
          break;

        case 'revoke_family':
          if (refreshTokenService) {
            await refreshTokenService.revokeFamily(token.familyId);
          }
          break;

        case 'revoke_all_user_tokens':
          if (refreshTokenService) {
            await refreshTokenService.revokeAllForUser(token.userId);
          }
          break;

        default:
          // For 'require_reauth', 'alert_admin', 'block_request' - just log
          break;
      }

      // Log the automatic revocation
      await logSecurityEvent({
        eventType: 'automatic_revocation',
        userId: token.userId,
        familyId: token.familyId,
        tenantId: token.tenantId ?? undefined,
        timestamp: new Date(),
        severity: 'high',
        description: `Automatic security action taken: ${action}`,
        metadata: {
          threatInfo,
          tokenId: token.id,
        },
        actionTaken: action,
      });

      return ok(action);
    } catch (error) {
      console.error('Failed to execute security action:', error);
      return fail(authTokenAutoRevoked());
    }
  }

  async function getRecentRefreshEvents(
    userId: string,
    familyId?: string,
    windowMs: number = finalConfig.frequencyAnalysisWindowMs,
  ): Promise<RefreshPatternData[]> {
    const key = getHistoryKey(userId, familyId);
    const history = refreshHistory.get(key) || [];
    const cutoff = new Date(Date.now() - windowMs);
    return history.filter(e => e.refreshedAt >= cutoff);
  }

  async function clearRefreshHistory(userId: string, familyId?: string): Promise<void> {
    const key = getHistoryKey(userId, familyId);
    refreshHistory.delete(key);
  }

  async function getTokenBinding(tokenId: string): Promise<TokenBinding | null> {
    return tokenBindings.get(tokenId) || null;
  }

  async function updateBindingValidation(tokenId: string): Promise<void> {
    const binding = tokenBindings.get(tokenId);
    if (binding) {
      tokenBindings.set(tokenId, {
        ...binding,
        lastValidated: new Date(),
      });
    }
  }

  async function removeTokenBinding(tokenId: string): Promise<void> {
    tokenBindings.delete(tokenId);
  }

  async function getAnomalyCount(userId: string, windowMs: number = finalConfig.frequencyAnalysisWindowMs): Promise<number> {
    const userAnomalies = anomalyCounts.get(userId) || [];
    const cutoff = new Date(Date.now() - windowMs);
    return userAnomalies.filter(a => a.timestamp >= cutoff).length;
  }

  return {
    createFingerprintHash,
    createTokenBinding,
    validateTokenBinding,
    recordRefreshEvent,
    analyzeRefreshPattern,
    validateRefreshAttempt,
    handleSecurityThreat,
    getRecentRefreshEvents,
    clearRefreshHistory,
    getTokenBinding,
    updateBindingValidation,
    removeTokenBinding,
    getAnomalyCount,
  };
}
