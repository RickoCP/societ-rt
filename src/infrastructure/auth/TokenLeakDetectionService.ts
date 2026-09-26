/**
 * TokenLeakDetectionService — Infrastructure service for detecting potential token leaks.
 *
 * Implements token leak detection mechanisms:
 * - Detect unusual access patterns
 * - Flag tokens used from suspicious IPs
 * - Track concurrent usage from multiple geolocations
 * - Monitor for anomalous token behavior
 *
 * @see Task 40: Token Security Hardening
 * @see Requirement 51: Account Recovery & Credential Security
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Information about a token usage event.
 */
export interface TokenUsageEvent {
  readonly tokenId: string;
  readonly userId: string;
  readonly tenantId?: string;
  readonly ipAddress: string;
  readonly userAgent?: string;
  readonly timestamp: Date;
  readonly endpoint?: string;
  /** Geolocation info (if available) */
  readonly geolocation?: GeolocationInfo;
}

/**
 * Geolocation information.
 */
export interface GeolocationInfo {
  readonly country?: string;
  readonly region?: string;
  readonly city?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  /** Timezone offset in minutes */
  readonly timezoneOffset?: number;
}

/**
 * Result of leak detection analysis.
 */
export interface LeakDetectionResult {
  /** Whether a potential leak was detected */
  readonly leakDetected: boolean;
  /** Confidence level of detection (0-1) */
  readonly confidence: number;
  /** Risk level */
  readonly riskLevel: RiskLevel;
  /** Detected anomalies */
  readonly anomalies: DetectedAnomaly[];
  /** Recommended actions */
  readonly recommendedActions: RecommendedAction[];
}

export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

/**
 * A detected anomaly.
 */
export interface DetectedAnomaly {
  readonly type: AnomalyType;
  readonly description: string;
  readonly severity: RiskLevel;
  readonly evidence: Record<string, unknown>;
  readonly detectedAt: Date;
}

export type AnomalyType =
  | 'concurrent_ip_usage'
  | 'geolocation_impossible_travel'
  | 'unusual_access_pattern'
  | 'suspicious_ip'
  | 'rapid_requests'
  | 'unusual_user_agent'
  | 'off_hours_access'
  | 'new_device'
  | 'vpn_tor_detected';

/**
 * Recommended action for detected anomalies.
 */
export interface RecommendedAction {
  readonly action: ActionType;
  readonly priority: 'immediate' | 'high' | 'normal' | 'low';
  readonly reason: string;
}

export type ActionType =
  | 'revoke_token'
  | 'revoke_all_tokens'
  | 'require_reauth'
  | 'alert_user'
  | 'alert_admin'
  | 'log_only'
  | 'block_ip'
  | 'require_mfa';

/**
 * Configuration for leak detection.
 */
export interface TokenLeakDetectionConfig {
  /** Maximum concurrent IPs before flagging (default: 3) */
  readonly maxConcurrentIPs: number;
  /** Time window for concurrent IP analysis in milliseconds (default: 1 hour) */
  readonly concurrentIPWindowMs: number;
  /** Maximum requests per minute before flagging (default: 60) */
  readonly maxRequestsPerMinute: number;
  /** Known suspicious IP ranges (CIDR notation) */
  readonly suspiciousIPRanges: string[];
  /** Minimum distance (km) that's impossible to travel in time window */
  readonly impossibleTravelDistanceKm: number;
  /** Time window for impossible travel detection in milliseconds (default: 1 hour) */
  readonly impossibleTravelWindowMs: number;
  /** Enable off-hours detection (default: true) */
  readonly detectOffHours: boolean;
  /** Business hours start (0-23, default: 6) */
  readonly businessHoursStart: number;
  /** Business hours end (0-23, default: 22) */
  readonly businessHoursEnd: number;
}

const DEFAULT_CONFIG: TokenLeakDetectionConfig = {
  maxConcurrentIPs: 3,
  concurrentIPWindowMs: 60 * 60 * 1000, // 1 hour
  maxRequestsPerMinute: 60,
  suspiciousIPRanges: [
    // Common VPN/proxy ranges - this should be configured externally
    // Just examples here
  ],
  impossibleTravelDistanceKm: 500, // 500 km in 1 hour is suspicious
  impossibleTravelWindowMs: 60 * 60 * 1000, // 1 hour
  detectOffHours: true,
  businessHoursStart: 6,
  businessHoursEnd: 22,
};

/**
 * Audit entry for leak detection events.
 */
export interface LeakDetectionAuditEntry {
  readonly tokenId: string;
  readonly userId: string;
  readonly result: LeakDetectionResult;
  readonly timestamp: Date;
  readonly correlationId?: string;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface TokenLeakDetectionService {
  /**
   * Analyze a token usage event for potential leak indicators.
   * @param event - The token usage event to analyze
   * @returns Detection result with anomalies and recommendations
   */
  analyzeUsage(event: TokenUsageEvent): Promise<LeakDetectionResult>;

  /**
   * Record a token usage event for future analysis.
   * @param event - The token usage event to record
   */
  recordUsage(event: TokenUsageEvent): Promise<void>;

  /**
   * Get usage history for a token.
   * @param tokenId - The token ID
   * @param limitMs - How far back to look in milliseconds
   * @returns List of usage events
   */
  getUsageHistory(tokenId: string, limitMs?: number): Promise<TokenUsageEvent[]>;

  /**
   * Get all IPs that used a token within a time window.
   * @param tokenId - The token ID
   * @param windowMs - Time window in milliseconds
   * @returns Set of IP addresses
   */
  getRecentIPs(tokenId: string, windowMs?: number): Promise<Set<string>>;

  /**
   * Check if an IP is suspicious.
   * @param ip - The IP address to check
   * @returns True if the IP is suspicious
   */
  isSuspiciousIP(ip: string): Promise<boolean>;

  /**
   * Flag a token as potentially compromised.
   * @param tokenId - The token ID
   * @param reason - Reason for flagging
   */
  flagToken(tokenId: string, reason: string): Promise<void>;

  /**
   * Get flagged tokens for a user.
   * @param userId - The user ID
   * @returns List of flagged token IDs with reasons
   */
  getFlaggedTokens(userId: string): Promise<Array<{ tokenId: string; reason: string; flaggedAt: Date }>>;

  /**
   * Clear the flag for a token.
   * @param tokenId - The token ID
   */
  clearFlag(tokenId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Service Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function for TokenLeakDetectionService.
 * Follows DI pattern.
 *
 * NOTE: This is an in-memory implementation for simplicity.
 * In production, this should be backed by Redis or a time-series database.
 */
export function TokenLeakDetectionServiceImpl(
  config: Partial<TokenLeakDetectionConfig> = {},
): TokenLeakDetectionService {
  const finalConfig: TokenLeakDetectionConfig = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  // In-memory storage (use Redis in production)
  const usageHistory = new Map<string, TokenUsageEvent[]>();
  const flaggedTokens = new Map<string, { reason: string; flaggedAt: Date }>();
  const suspiciousIPCache = new Set<string>();

  // ---------------------------------------------------------------------------
  // Helper Functions
  // ---------------------------------------------------------------------------

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
   * Check if access is outside business hours.
   */
  function isOffHours(timestamp: Date, timezoneOffset?: number): boolean {
    if (!finalConfig.detectOffHours) return false;

    // Adjust for timezone if available
    let hour = timestamp.getUTCHours();
    if (timezoneOffset !== undefined) {
      hour = (hour + Math.floor(timezoneOffset / 60)) % 24;
      if (hour < 0) hour += 24;
    }

    return hour < finalConfig.businessHoursStart || hour >= finalConfig.businessHoursEnd;
  }

  /**
   * Detect concurrent IP usage.
   */
  function detectConcurrentIPs(
    history: TokenUsageEvent[],
    currentEvent: TokenUsageEvent,
  ): DetectedAnomaly | null {
    const windowStart = new Date(
      currentEvent.timestamp.getTime() - finalConfig.concurrentIPWindowMs,
    );

    const recentIPs = new Set<string>();
    for (const event of history) {
      if (event.timestamp >= windowStart) {
        recentIPs.add(event.ipAddress);
      }
    }
    recentIPs.add(currentEvent.ipAddress);

    if (recentIPs.size > finalConfig.maxConcurrentIPs) {
      return {
        type: 'concurrent_ip_usage',
        description: `Token used from ${recentIPs.size} different IPs within ${finalConfig.concurrentIPWindowMs / 60000} minutes`,
        severity: recentIPs.size > finalConfig.maxConcurrentIPs * 2 ? 'high' : 'medium',
        evidence: {
          ips: Array.from(recentIPs),
          count: recentIPs.size,
          threshold: finalConfig.maxConcurrentIPs,
        },
        detectedAt: new Date(),
      };
    }

    return null;
  }

  /**
   * Detect impossible travel (concurrent access from distant locations).
   */
  function detectImpossibleTravel(
    history: TokenUsageEvent[],
    currentEvent: TokenUsageEvent,
  ): DetectedAnomaly | null {
    if (!currentEvent.geolocation?.latitude || !currentEvent.geolocation?.longitude) {
      return null;
    }

    const windowStart = new Date(
      currentEvent.timestamp.getTime() - finalConfig.impossibleTravelWindowMs,
    );

    for (const event of history) {
      if (
        event.timestamp >= windowStart &&
        event.geolocation?.latitude &&
        event.geolocation?.longitude &&
        event.ipAddress !== currentEvent.ipAddress
      ) {
        const distance = calculateDistanceKm(
          event.geolocation.latitude,
          event.geolocation.longitude,
          currentEvent.geolocation.latitude,
          currentEvent.geolocation.longitude,
        );

        const timeDiffHours =
          (currentEvent.timestamp.getTime() - event.timestamp.getTime()) /
          (1000 * 60 * 60);

        // Check if travel is impossible (more than threshold km per hour)
        if (timeDiffHours > 0 && distance / timeDiffHours > finalConfig.impossibleTravelDistanceKm) {
          return {
            type: 'geolocation_impossible_travel',
            description: `Token used from locations ${distance.toFixed(0)}km apart within ${timeDiffHours.toFixed(1)} hours`,
            severity: 'high',
            evidence: {
              previousLocation: event.geolocation,
              currentLocation: currentEvent.geolocation,
              distanceKm: distance,
              timeDiffHours,
            },
            detectedAt: new Date(),
          };
        }
      }
    }

    return null;
  }

  /**
   * Detect rapid requests (potential automated abuse).
   */
  function detectRapidRequests(
    history: TokenUsageEvent[],
    currentEvent: TokenUsageEvent,
  ): DetectedAnomaly | null {
    const oneMinuteAgo = new Date(currentEvent.timestamp.getTime() - 60000);
    const recentCount = history.filter(e => e.timestamp >= oneMinuteAgo).length + 1;

    if (recentCount > finalConfig.maxRequestsPerMinute) {
      return {
        type: 'rapid_requests',
        description: `${recentCount} requests in the last minute exceeds threshold of ${finalConfig.maxRequestsPerMinute}`,
        severity: recentCount > finalConfig.maxRequestsPerMinute * 2 ? 'high' : 'medium',
        evidence: {
          requestCount: recentCount,
          threshold: finalConfig.maxRequestsPerMinute,
          windowSeconds: 60,
        },
        detectedAt: new Date(),
      };
    }

    return null;
  }

  /**
   * Determine risk level from anomalies.
   */
  function calculateRiskLevel(anomalies: DetectedAnomaly[]): RiskLevel {
    if (anomalies.length === 0) return 'none';

    const severities = anomalies.map(a => a.severity);
    if (severities.includes('critical')) return 'critical';
    if (severities.includes('high')) return 'high';
    if (severities.includes('medium')) return 'medium';
    if (severities.includes('low')) return 'low';
    return 'none';
  }

  /**
   * Determine recommended actions from anomalies.
   */
  function determineActions(anomalies: DetectedAnomaly[]): RecommendedAction[] {
    const actions: RecommendedAction[] = [];

    for (const anomaly of anomalies) {
      switch (anomaly.type) {
        case 'geolocation_impossible_travel':
          actions.push({
            action: 'revoke_all_tokens',
            priority: 'immediate',
            reason: 'Impossible travel detected - likely token compromise',
          });
          actions.push({
            action: 'alert_user',
            priority: 'immediate',
            reason: 'Notify user of suspicious activity',
          });
          break;

        case 'concurrent_ip_usage':
          if (anomaly.severity === 'high') {
            actions.push({
              action: 'require_reauth',
              priority: 'high',
              reason: 'Multiple concurrent IPs detected',
            });
          }
          actions.push({
            action: 'alert_admin',
            priority: 'normal',
            reason: 'Unusual concurrent access pattern',
          });
          break;

        case 'rapid_requests':
          actions.push({
            action: 'log_only',
            priority: 'normal',
            reason: 'Monitor for continued rapid access',
          });
          if (anomaly.severity === 'high') {
            actions.push({
              action: 'alert_admin',
              priority: 'high',
              reason: 'Potential automated abuse detected',
            });
          }
          break;

        case 'suspicious_ip':
          actions.push({
            action: 'require_mfa',
            priority: 'high',
            reason: 'Access from suspicious IP',
          });
          break;

        default:
          actions.push({
            action: 'log_only',
            priority: 'low',
            reason: `Anomaly detected: ${anomaly.type}`,
          });
      }
    }

    // Deduplicate actions by action type, keeping highest priority
    const priorityOrder: Record<RecommendedAction['priority'], number> = {
      immediate: 0,
      high: 1,
      normal: 2,
      low: 3,
    };

    const actionMap = new Map<ActionType, RecommendedAction>();
    for (const action of actions) {
      const existing = actionMap.get(action.action);
      if (!existing || priorityOrder[action.priority] < priorityOrder[existing.priority]) {
        actionMap.set(action.action, action);
      }
    }

    return Array.from(actionMap.values()).sort(
      (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority],
    );
  }

  // ---------------------------------------------------------------------------
  // Service Methods
  // ---------------------------------------------------------------------------

  async function analyzeUsage(event: TokenUsageEvent): Promise<LeakDetectionResult> {
    const anomalies: DetectedAnomaly[] = [];
    const history = usageHistory.get(event.tokenId) || [];

    // Check for suspicious IP
    if (await isSuspiciousIP(event.ipAddress)) {
      anomalies.push({
        type: 'suspicious_ip',
        description: `Token used from known suspicious IP: ${event.ipAddress}`,
        severity: 'medium',
        evidence: { ipAddress: event.ipAddress },
        detectedAt: new Date(),
      });
    }

    // Detect concurrent IP usage
    const concurrentIPAnomaly = detectConcurrentIPs(history, event);
    if (concurrentIPAnomaly) {
      anomalies.push(concurrentIPAnomaly);
    }

    // Detect impossible travel
    const impossibleTravelAnomaly = detectImpossibleTravel(history, event);
    if (impossibleTravelAnomaly) {
      anomalies.push(impossibleTravelAnomaly);
    }

    // Detect rapid requests
    const rapidRequestsAnomaly = detectRapidRequests(history, event);
    if (rapidRequestsAnomaly) {
      anomalies.push(rapidRequestsAnomaly);
    }

    // Detect off-hours access
    if (isOffHours(event.timestamp, event.geolocation?.timezoneOffset)) {
      anomalies.push({
        type: 'off_hours_access',
        description: 'Token used outside normal business hours',
        severity: 'low',
        evidence: {
          timestamp: event.timestamp,
          hour: event.timestamp.getHours(),
        },
        detectedAt: new Date(),
      });
    }

    const riskLevel = calculateRiskLevel(anomalies);
    const recommendedActions = determineActions(anomalies);
    const leakDetected = riskLevel === 'high' || riskLevel === 'critical';
    const confidence = anomalies.length > 0 ? Math.min(0.3 + anomalies.length * 0.2, 0.95) : 0;

    return {
      leakDetected,
      confidence,
      riskLevel,
      anomalies,
      recommendedActions,
    };
  }

  async function recordUsage(event: TokenUsageEvent): Promise<void> {
    const history = usageHistory.get(event.tokenId) || [];
    history.push(event);

    // Keep only events within the configured window
    const cutoff = new Date(Date.now() - Math.max(
      finalConfig.concurrentIPWindowMs,
      finalConfig.impossibleTravelWindowMs,
      60 * 60 * 1000, // At least 1 hour
    ));

    const filteredHistory = history.filter(e => e.timestamp >= cutoff);
    usageHistory.set(event.tokenId, filteredHistory);
  }

  async function getUsageHistory(
    tokenId: string,
    limitMs: number = finalConfig.concurrentIPWindowMs,
  ): Promise<TokenUsageEvent[]> {
    const history = usageHistory.get(tokenId) || [];
    const cutoff = new Date(Date.now() - limitMs);
    return history.filter(e => e.timestamp >= cutoff);
  }

  async function getRecentIPs(
    tokenId: string,
    windowMs: number = finalConfig.concurrentIPWindowMs,
  ): Promise<Set<string>> {
    const history = await getUsageHistory(tokenId, windowMs);
    return new Set(history.map(e => e.ipAddress));
  }

  async function isSuspiciousIP(ip: string): Promise<boolean> {
    // Check cache first
    if (suspiciousIPCache.has(ip)) {
      return true;
    }

    // Check against configured suspicious ranges
    // Note: In production, this should check against threat intelligence feeds
    for (const range of finalConfig.suspiciousIPRanges) {
      // Simple check - in production use a proper CIDR library
      if (ip.startsWith(range.split('/')[0]?.split('.').slice(0, 2).join('.') || '')) {
        suspiciousIPCache.add(ip);
        return true;
      }
    }

    return false;
  }

  async function flagToken(tokenId: string, reason: string): Promise<void> {
    flaggedTokens.set(tokenId, {
      reason,
      flaggedAt: new Date(),
    });
  }

  async function getFlaggedTokens(
    userId: string,
  ): Promise<Array<{ tokenId: string; reason: string; flaggedAt: Date }>> {
    // In a real implementation, we'd also store the userId with the flag
    // For now, return all flagged tokens that have history for this user
    const result: Array<{ tokenId: string; reason: string; flaggedAt: Date }> = [];

    for (const [tokenId, flag] of flaggedTokens) {
      const history = usageHistory.get(tokenId);
      if (history?.some(e => e.userId === userId)) {
        result.push({ tokenId, ...flag });
      }
    }

    return result;
  }

  async function clearFlag(tokenId: string): Promise<void> {
    flaggedTokens.delete(tokenId);
  }

  return {
    analyzeUsage,
    recordUsage,
    getUsageHistory,
    getRecentIPs,
    isSuspiciousIP,
    flagToken,
    getFlaggedTokens,
    clearFlag,
  };
}
