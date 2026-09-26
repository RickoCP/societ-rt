/**
 * Shadow Mode Feature Flag Service Unit Tests
 *
 * Tests the shadow mode feature flag functionality including:
 * - Global shadow mode enable/disable
 * - Per-route shadow mode override
 * - Environment-based configuration
 * - Dashboard data generation
 * - Alert configuration and triggering
 * - Threshold management
 *
 * @see Requirements 7 (AC 5) - Per-route opt-in for shadow validation
 * @see Task 22 - Shadow Mode Feature Flag
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ShadowModeFeatureFlagServiceImpl,
  type IShadowModeFeatureFlagService,
} from '../services/ShadowModeFeatureFlagService';
import type {
  ShadowModeEnvironmentConfig,
  SetRouteShadowModeInput,
  ShadowModeAlertConfig,
} from '../types/ShadowModeFeatureFlag';
import type { ShadowAuthorizationMetrics, RouteMetrics } from '../types';
import { DEFAULT_SHADOW_THRESHOLDS } from '../types';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const createMockMetrics = (
  overrides: Partial<ShadowAuthorizationMetrics> = {},
): ShadowAuthorizationMetrics => ({
  totalChecks: 1000,
  mismatchCount: 5,
  falsePositives: 2,
  falseNegatives: 3,
  mismatchRate: 0.005,
  excludedCount: 0,
  warningThresholdExceeded: false,
  cutoverEligible: true,
  lastUpdated: new Date(),
  windowStart: new Date(),
  perRouteMetrics: new Map(),
  ...overrides,
});

const createMockRouteMetrics = (
  routeId: string,
  overrides: Partial<RouteMetrics> = {},
): RouteMetrics => ({
  routeId,
  totalChecks: 100,
  mismatchCount: 1,
  mismatchRate: 0.01,
  shadowEnabled: true,
  ...overrides,
});

const createMockEnvConfig = (
  overrides: Partial<ShadowModeEnvironmentConfig> = {},
): ShadowModeEnvironmentConfig => ({
  globalEnabled: false,
  defaultBehavior: 'follow_global',
  routesEnabled: [],
  routesDisabled: [],
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ShadowModeFeatureFlagService', () => {
  let service: IShadowModeFeatureFlagService;

  beforeEach(() => {
    service = ShadowModeFeatureFlagServiceImpl();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Global Shadow Mode Tests
  // -------------------------------------------------------------------------

  describe('Global Shadow Mode', () => {
    it('should be disabled by default', () => {
      expect(service.isGlobalShadowModeEnabled()).toBe(false);
    });

    it('should enable global shadow mode', () => {
      service.setGlobalShadowMode(true, 'admin-user');
      expect(service.isGlobalShadowModeEnabled()).toBe(true);
    });

    it('should disable global shadow mode', () => {
      service.setGlobalShadowMode(true);
      service.setGlobalShadowMode(false, 'admin-user');
      expect(service.isGlobalShadowModeEnabled()).toBe(false);
    });

    it('should track updatedBy when setting global mode', () => {
      service.setGlobalShadowMode(true, 'admin-user-123');
      const config = service.getConfig();
      expect(config.global.updatedBy).toBe('admin-user-123');
    });

    it('should update timestamp when setting global mode', () => {
      const before = new Date();
      service.setGlobalShadowMode(true);
      const config = service.getConfig();
      expect(config.global.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  // -------------------------------------------------------------------------
  // Route Shadow Mode Tests
  // -------------------------------------------------------------------------

  describe('Route Shadow Mode', () => {
    it('should return not active when global is disabled', () => {
      const result = service.isRouteInShadowMode('get-resident');
      expect(result.isActive).toBe(false);
      expect(result.reason).toBe('global_disabled');
    });

    it('should return active when global is enabled and route follows global', () => {
      service.setGlobalShadowMode(true);
      const result = service.isRouteInShadowMode('get-resident');
      expect(result.isActive).toBe(true);
      expect(result.reason).toBe('global_enabled');
    });

    it('should return active when route is explicitly enabled', () => {
      service.setGlobalShadowMode(true);
      service.setRouteShadowMode({
        routeId: 'get-resident',
        enabled: true,
        reason: 'Testing route',
      });
      const result = service.isRouteInShadowMode('get-resident');
      expect(result.isActive).toBe(true);
      expect(result.reason).toBe('route_enabled');
    });

    it('should return not active when route is explicitly disabled', () => {
      service.setGlobalShadowMode(true);
      service.setRouteShadowMode({
        routeId: 'get-resident',
        enabled: false,
        reason: 'Route not ready',
      });
      const result = service.isRouteInShadowMode('get-resident');
      expect(result.isActive).toBe(false);
      expect(result.reason).toBe('route_disabled');
    });

    it('should return not active when global disabled even if route enabled', () => {
      service.setRouteShadowMode({
        routeId: 'get-resident',
        enabled: true,
      });
      const result = service.isRouteInShadowMode('get-resident');
      expect(result.isActive).toBe(false);
      expect(result.reason).toBe('global_disabled');
    });

    it('should remove route override', () => {
      service.setGlobalShadowMode(true);
      service.setRouteShadowMode({
        routeId: 'get-resident',
        enabled: false,
      });
      
      expect(service.isRouteInShadowMode('get-resident').isActive).toBe(false);
      
      service.removeRouteShadowMode('get-resident');
      
      expect(service.isRouteInShadowMode('get-resident').isActive).toBe(true);
      expect(service.isRouteInShadowMode('get-resident').reason).toBe('global_enabled');
    });

    it('should track route configuration metadata', () => {
      const input: SetRouteShadowModeInput = {
        routeId: 'get-resident',
        enabled: true,
        warningThresholdOverride: 0.02,
        cutoverThresholdOverride: 0.002,
        updatedBy: 'admin-123',
        reason: 'Testing with custom thresholds',
      };
      
      service.setRouteShadowMode(input);
      
      const overrides = service.getRouteOverrides();
      const routeConfig = overrides.get('get-resident');
      
      expect(routeConfig).toBeDefined();
      expect(routeConfig?.enabled).toBe(true);
      expect(routeConfig?.warningThresholdOverride).toBe(0.02);
      expect(routeConfig?.cutoverThresholdOverride).toBe(0.002);
      expect(routeConfig?.updatedBy).toBe('admin-123');
      expect(routeConfig?.reason).toBe('Testing with custom thresholds');
    });
  });

  // -------------------------------------------------------------------------
  // Effective Thresholds Tests
  // -------------------------------------------------------------------------

  describe('Effective Thresholds', () => {
    it('should return global thresholds when no route override', () => {
      const thresholds = service.getEffectiveThresholds('get-resident');
      expect(thresholds.warningThreshold).toBe(DEFAULT_SHADOW_THRESHOLDS.warningThreshold);
      expect(thresholds.cutoverThreshold).toBe(DEFAULT_SHADOW_THRESHOLDS.cutoverThreshold);
    });

    it('should return route-specific thresholds when override exists', () => {
      service.setRouteShadowMode({
        routeId: 'get-resident',
        enabled: true,
        warningThresholdOverride: 0.05,
        cutoverThresholdOverride: 0.005,
      });
      
      const thresholds = service.getEffectiveThresholds('get-resident');
      expect(thresholds.warningThreshold).toBe(0.05);
      expect(thresholds.cutoverThreshold).toBe(0.005);
    });

    it('should partially override thresholds', () => {
      service.setRouteShadowMode({
        routeId: 'get-resident',
        enabled: true,
        warningThresholdOverride: 0.05,
        // cutoverThresholdOverride not set
      });
      
      const thresholds = service.getEffectiveThresholds('get-resident');
      expect(thresholds.warningThreshold).toBe(0.05);
      expect(thresholds.cutoverThreshold).toBe(DEFAULT_SHADOW_THRESHOLDS.cutoverThreshold);
    });

    it('should include effective thresholds in route status', () => {
      service.setGlobalShadowMode(true);
      service.setRouteShadowMode({
        routeId: 'get-resident',
        enabled: true,
        warningThresholdOverride: 0.02,
      });
      
      const result = service.isRouteInShadowMode('get-resident');
      expect(result.effectiveWarningThreshold).toBe(0.02);
      expect(result.effectiveCutoverThreshold).toBe(DEFAULT_SHADOW_THRESHOLDS.cutoverThreshold);
    });
  });

  // -------------------------------------------------------------------------
  // Environment Configuration Tests
  // -------------------------------------------------------------------------

  describe('Environment Configuration', () => {
    it('should load configuration from environment config object', () => {
      const envConfig = createMockEnvConfig({
        globalEnabled: true,
        defaultBehavior: 'disabled',
        routesEnabled: ['get-resident', 'create-announcement'],
        routesDisabled: ['delete-user'],
      });
      
      service.loadFromEnvironment(envConfig);
      
      expect(service.isGlobalShadowModeEnabled()).toBe(true);
      
      const summary = service.getSummary();
      expect(summary.defaultBehavior).toBe('disabled');
      expect(summary.routesEnabled).toBe(2);
      expect(summary.routesDisabled).toBe(1);
      expect(summary.environmentSource).toBe(true);
    });

    it('should create service with initial environment config', () => {
      const envConfig = createMockEnvConfig({
        globalEnabled: true,
        routesEnabled: ['get-resident'],
      });
      
      const serviceWithEnv = ShadowModeFeatureFlagServiceImpl({ envConfig });
      
      expect(serviceWithEnv.isGlobalShadowModeEnabled()).toBe(true);
      expect(serviceWithEnv.getSummary().routesEnabled).toBe(1);
    });

    it('should handle empty routes in environment config', () => {
      const envConfig = createMockEnvConfig({
        globalEnabled: true,
        routesEnabled: ['', '  ', 'valid-route'],
        routesDisabled: ['', 'another-route'],
      });
      
      service.loadFromEnvironment(envConfig);
      
      const summary = service.getSummary();
      expect(summary.routesEnabled).toBe(1); // Only 'valid-route'
      expect(summary.routesDisabled).toBe(1); // Only 'another-route'
    });
  });

  // -------------------------------------------------------------------------
  // Default Behavior Tests
  // -------------------------------------------------------------------------

  describe('Default Behavior', () => {
    it('should follow global when default behavior is follow_global', () => {
      const envConfig = createMockEnvConfig({
        globalEnabled: true,
        defaultBehavior: 'follow_global',
      });
      
      service.loadFromEnvironment(envConfig);
      
      const result = service.isRouteInShadowMode('unknown-route');
      expect(result.isActive).toBe(true);
      expect(result.reason).toBe('global_enabled');
    });

    it('should disable unconfigured routes when default behavior is disabled', () => {
      const envConfig = createMockEnvConfig({
        globalEnabled: true,
        defaultBehavior: 'disabled',
      });
      
      service.loadFromEnvironment(envConfig);
      
      const result = service.isRouteInShadowMode('unknown-route');
      expect(result.isActive).toBe(false);
      expect(result.reason).toBe('default_behavior');
    });

    it('should enable unconfigured routes when default behavior is enabled', () => {
      const envConfig = createMockEnvConfig({
        globalEnabled: true,
        defaultBehavior: 'enabled',
      });
      
      service.loadFromEnvironment(envConfig);
      
      const result = service.isRouteInShadowMode('unknown-route');
      expect(result.isActive).toBe(true);
      expect(result.reason).toBe('default_behavior');
    });
  });

  // -------------------------------------------------------------------------
  // Dashboard Data Tests
  // -------------------------------------------------------------------------

  describe('Dashboard Data Generation', () => {
    it('should generate dashboard data with global status', () => {
      service.setGlobalShadowMode(true);
      const metrics = createMockMetrics();
      
      const dashboard = service.generateDashboardData(metrics);
      
      expect(dashboard.globalStatus.enabled).toBe(true);
      expect(dashboard.globalStatus.mismatchRate).toBe(0.005);
      expect(dashboard.globalStatus.totalChecks).toBe(1000);
      expect(dashboard.globalStatus.cutoverEligible).toBe(true);
      expect(dashboard.generatedAt).toBeInstanceOf(Date);
    });

    it('should generate route summaries sorted by mismatch rate', () => {
      service.setGlobalShadowMode(true);
      
      const perRouteMetrics = new Map<string, RouteMetrics>();
      perRouteMetrics.set('route-high', createMockRouteMetrics('route-high', { mismatchRate: 0.05 }));
      perRouteMetrics.set('route-low', createMockRouteMetrics('route-low', { mismatchRate: 0.001 }));
      perRouteMetrics.set('route-medium', createMockRouteMetrics('route-medium', { mismatchRate: 0.01 }));
      
      const metrics = createMockMetrics({ perRouteMetrics });
      const dashboard = service.generateDashboardData(metrics);
      
      expect(dashboard.routeSummaries.length).toBe(3);
      expect(dashboard.routeSummaries[0]?.routeId).toBe('route-high');
      expect(dashboard.routeSummaries[1]?.routeId).toBe('route-medium');
      expect(dashboard.routeSummaries[2]?.routeId).toBe('route-low');
    });

    it('should calculate route status correctly', () => {
      service.setGlobalShadowMode(true);
      
      const perRouteMetrics = new Map<string, RouteMetrics>();
      perRouteMetrics.set('healthy-route', createMockRouteMetrics('healthy-route', { mismatchRate: 0.0005 }));
      perRouteMetrics.set('warning-route', createMockRouteMetrics('warning-route', { mismatchRate: 0.002 }));
      perRouteMetrics.set('critical-route', createMockRouteMetrics('critical-route', { mismatchRate: 0.02 }));
      
      const metrics = createMockMetrics({ perRouteMetrics });
      const dashboard = service.generateDashboardData(metrics);
      
      const criticalRoute = dashboard.routeSummaries.find(r => r.routeId === 'critical-route');
      const warningRoute = dashboard.routeSummaries.find(r => r.routeId === 'warning-route');
      const healthyRoute = dashboard.routeSummaries.find(r => r.routeId === 'healthy-route');
      
      expect(criticalRoute?.status).toBe('critical');
      expect(warningRoute?.status).toBe('warning');
      expect(healthyRoute?.status).toBe('healthy');
    });

    it('should generate recommendations', () => {
      const metrics = createMockMetrics({
        totalChecks: 50, // Below minimum sample size
        mismatchRate: 0.02,
        falsePositives: 5,
        falseNegatives: 3,
      });
      
      const dashboard = service.generateDashboardData(metrics);
      
      expect(dashboard.recommendations.length).toBeGreaterThan(0);
      expect(dashboard.recommendations.some(r => r.includes('sample data'))).toBe(true);
    });

    it('should limit routes in summary', () => {
      service.setGlobalShadowMode(true);
      
      const perRouteMetrics = new Map<string, RouteMetrics>();
      for (let i = 0; i < 100; i++) {
        perRouteMetrics.set(`route-${i}`, createMockRouteMetrics(`route-${i}`));
      }
      
      const metrics = createMockMetrics({ perRouteMetrics });
      const dashboard = service.generateDashboardData(metrics, { maxRoutes: 10 });
      
      expect(dashboard.routeSummaries.length).toBe(10);
    });

    it('should count route statuses correctly', () => {
      service.setGlobalShadowMode(true);
      
      const perRouteMetrics = new Map<string, RouteMetrics>();
      perRouteMetrics.set('healthy-1', createMockRouteMetrics('healthy-1', { mismatchRate: 0.0001 }));
      perRouteMetrics.set('healthy-2', createMockRouteMetrics('healthy-2', { mismatchRate: 0.0002 }));
      perRouteMetrics.set('critical-1', createMockRouteMetrics('critical-1', { mismatchRate: 0.02 }));
      
      const metrics = createMockMetrics({ perRouteMetrics });
      const dashboard = service.generateDashboardData(metrics);
      
      expect(dashboard.routeStatusCounts.healthy).toBe(2);
      expect(dashboard.routeStatusCounts.critical).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Alert Configuration Tests
  // -------------------------------------------------------------------------

  describe('Alert Configuration', () => {
    it('should configure an alert', () => {
      const alertConfig: ShadowModeAlertConfig = {
        id: 'alert-1',
        name: 'Warning Threshold Alert',
        type: 'warning_threshold',
        enabled: true,
        routes: [],
        notificationChannels: ['email', 'slack'],
      };
      
      service.configureAlert(alertConfig);
      
      const alerts = service.getAlertConfigs();
      expect(alerts.length).toBe(1);
      expect(alerts[0]?.id).toBe('alert-1');
    });

    it('should remove an alert', () => {
      service.configureAlert({
        id: 'alert-1',
        name: 'Test Alert',
        type: 'warning_threshold',
        enabled: true,
        routes: [],
        notificationChannels: [],
      });
      
      expect(service.getAlertConfigs().length).toBe(1);
      
      service.removeAlert('alert-1');
      
      expect(service.getAlertConfigs().length).toBe(0);
    });

    it('should trigger warning threshold alert', () => {
      service.configureAlert({
        id: 'warning-alert',
        name: 'Warning Alert',
        type: 'warning_threshold',
        enabled: true,
        routes: [],
        notificationChannels: [],
      });
      
      const metrics = createMockMetrics({ warningThresholdExceeded: true });
      const alerts = service.checkAlerts(metrics);
      
      expect(alerts.length).toBe(1);
      expect(alerts[0]?.config.id).toBe('warning-alert');
    });

    it('should trigger cutover blocked alert', () => {
      service.configureAlert({
        id: 'cutover-alert',
        name: 'Cutover Blocked Alert',
        type: 'cutover_blocked',
        enabled: true,
        routes: [],
        notificationChannels: [],
      });
      
      const metrics = createMockMetrics({
        cutoverEligible: false,
        totalChecks: 1000,
      });
      const alerts = service.checkAlerts(metrics);
      
      expect(alerts.length).toBe(1);
      expect(alerts[0]?.config.id).toBe('cutover-alert');
    });

    it('should trigger high false positive alert', () => {
      service.configureAlert({
        id: 'fp-alert',
        name: 'False Positive Alert',
        type: 'high_false_positive',
        enabled: true,
        threshold: 0.001, // 0.1%
        routes: [],
        notificationChannels: [],
      });
      
      const metrics = createMockMetrics({
        totalChecks: 1000,
        falsePositives: 10, // 1% > 0.1% threshold
      });
      const alerts = service.checkAlerts(metrics);
      
      expect(alerts.length).toBe(1);
      expect(alerts[0]?.config.type).toBe('high_false_positive');
    });

    it('should trigger high false negative alert', () => {
      service.configureAlert({
        id: 'fn-alert',
        name: 'False Negative Alert',
        type: 'high_false_negative',
        enabled: true,
        threshold: 0.005, // 0.5%
        routes: [],
        notificationChannels: [],
      });
      
      const metrics = createMockMetrics({
        totalChecks: 1000,
        falseNegatives: 10, // 1% > 0.5% threshold
      });
      const alerts = service.checkAlerts(metrics);
      
      expect(alerts.length).toBe(1);
      expect(alerts[0]?.config.type).toBe('high_false_negative');
    });

    it('should not trigger disabled alerts', () => {
      service.configureAlert({
        id: 'disabled-alert',
        name: 'Disabled Alert',
        type: 'warning_threshold',
        enabled: false, // Disabled
        routes: [],
        notificationChannels: [],
      });
      
      const metrics = createMockMetrics({ warningThresholdExceeded: true });
      const alerts = service.checkAlerts(metrics);
      
      expect(alerts.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Summary Tests
  // -------------------------------------------------------------------------

  describe('Summary', () => {
    it('should return correct summary', () => {
      service.setGlobalShadowMode(true);
      service.setRouteShadowMode({ routeId: 'route-1', enabled: true });
      service.setRouteShadowMode({ routeId: 'route-2', enabled: true });
      service.setRouteShadowMode({ routeId: 'route-3', enabled: false });
      
      const summary = service.getSummary();
      
      expect(summary.globalEnabled).toBe(true);
      expect(summary.totalRouteOverrides).toBe(3);
      expect(summary.routesEnabled).toBe(2);
      expect(summary.routesDisabled).toBe(1);
      expect(summary.defaultBehavior).toBe('follow_global');
    });
  });

  // -------------------------------------------------------------------------
  // Reset Tests
  // -------------------------------------------------------------------------

  describe('Reset', () => {
    it('should reset all configuration', () => {
      service.setGlobalShadowMode(true);
      service.setRouteShadowMode({ routeId: 'route-1', enabled: true });
      service.configureAlert({
        id: 'alert-1',
        name: 'Test',
        type: 'warning_threshold',
        enabled: true,
        routes: [],
        notificationChannels: [],
      });
      
      service.reset();
      
      expect(service.isGlobalShadowModeEnabled()).toBe(false);
      expect(service.getRouteOverrides().size).toBe(0);
      expect(service.getAlertConfigs().length).toBe(0);
      expect(service.getSummary().environmentSource).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Custom Thresholds Tests
  // -------------------------------------------------------------------------

  describe('Custom Thresholds Initialization', () => {
    it('should accept custom thresholds at initialization', () => {
      const customService = ShadowModeFeatureFlagServiceImpl({
        thresholds: {
          warningThreshold: 0.05,
          cutoverThreshold: 0.005,
        },
      });
      
      const thresholds = customService.getEffectiveThresholds('any-route');
      expect(thresholds.warningThreshold).toBe(0.05);
      expect(thresholds.cutoverThreshold).toBe(0.005);
    });
  });
});
