/**
 * Authorization types barrel export.
 *
 * @see Requirements 3, 7, 44
 */

export type {
  AuthorizationContext,
  JWTClaims,
  PartialJWTClaims,
  AuthorizationContextInput,
  AuthorizationContextMetadata,
  AuthorizationContextResult,
} from './AuthorizationContext';

// Migration Compatibility Types (FASE 2.6 - Task 14)
export type { AuthContextCompat } from './AuthContextCompat';
export {
  isAuthorizationContext,
  isLegacyAuthContext,
  getOrgUnitId,
  getPermissions,
  hasPermission,
  getMembershipId,
  getRole,
  getMembershipRole,
  isAuthoritative,
  isTenantLevel,
  getUserId,
  getTenantId,
} from './AuthContextCompat';

// Shadow Authorization Types (FASE 1.9 - Task 21)
export type {
  AuthorizationDecision,
  ShadowAuthorizationResult,
  ShadowMismatch,
  ShadowAuthorizationMetrics,
  RouteMetrics,
  ShadowAuthorizationThresholds,
  ShadowAuthorizationRequest,
  RouteShoadowConfig,
  CutoverEligibilityResult,
} from './ShadowAuthorization';

export { DEFAULT_SHADOW_THRESHOLDS } from './ShadowAuthorization';

// Shadow Mode Feature Flag Types (FASE 1.9 - Task 22)
export type {
  ShadowModeGlobalConfig,
  RouteShadowModeConfig,
  ShadowModeConfig,
  SetRouteShadowModeInput,
  ShadowModeEnvironmentConfig,
  MismatchRateDataPoint,
  RouteMismatchSummary,
  ShadowModeAlertConfig,
  ShadowModeAlert,
  ShadowModeDashboardData,
  DashboardDataOptions,
  RouteInShadowModeResult,
  ShadowModeFeatureFlagSummary,
} from './ShadowModeFeatureFlag';

export {
  DEFAULT_SHADOW_MODE_ENV_CONFIG,
  DEFAULT_DASHBOARD_OPTIONS,
} from './ShadowModeFeatureFlag';
