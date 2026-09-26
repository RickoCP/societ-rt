/**
 * Authorization Middleware Barrel Export
 *
 * Exports the permission-based route authorization middleware and helpers.
 *
 * @see Requirements 1 (Middleware AuthorizationContext Resolution)
 * @see Requirements 5 (AC 1-7)
 * @see Requirements 19 (AC 1-7) — Entitlement Enforcement
 * @see Design Authorization Pipeline
 */

// Types
export type {
  RouteHandler,
  AuthorizedRouteHandler,
  RequirePermissionOptions,
  PermissionCheckLogContext,
  PermissionCheckResult,
  PublicRouteOptions,
  PublicRouteLogContext,
} from './types';

// Authorization Middleware Types
export type {
  AuthorizationMiddlewareConfig,
  AuthorizationResolutionLogEntry,
  AuthErrorCode,
  AuthErrorResponse,
  SerializedAuthorizationContext,
  JwtExtractionResult,
  IAuthorizationMiddleware,
  AuthorizationMiddleware,
} from './authorizationMiddleware';

// Authorization Middleware Implementation & Constants
export {
  DEFAULT_AUTHORIZATION_MIDDLEWARE_CONFIG,
  AUTH_ERROR_HTTP_STATUS,
  AUTH_ERROR_MESSAGES,
  AuthorizationMiddlewareImpl,
} from './authorizationMiddleware';

// Permission middleware
export {
  withPermission,
  requirePermissions,
  withAuthOnlyRoute,
  withPublicRoute,
} from './requirePermission';

// Permission types
export type {
  AuthOnlyRouteOptions,
} from './requirePermission';

// Permission convenience wrappers
export {
  withResidentRead,
  withResidentWrite,
  withFinanceRead,
  withFinanceWrite,
  withEmergencyCreate,
  withTenantManage,
  withMembershipDelegate,
} from './requirePermission';

// Entitlement middleware types
export type {
  RequireEntitlementOptions,
  EntitlementCheckLogContext,
} from './requireEntitlement';

// Entitlement middleware
export {
  withEntitlement,
  requireEntitlement,
} from './requireEntitlement';

// Entitlement convenience wrappers
export {
  withIoTEntitlement,
  withDoorMonitoringEntitlement,
  withAdvancedAnalyticsEntitlement,
  withSafetyCriticalEntitlement,
  withBillingFlowEntitlement,
} from './requireEntitlement';
