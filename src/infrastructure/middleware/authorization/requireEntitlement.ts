/**
 * RequireEntitlement — Route Entitlement Authorization Middleware
 *
 * Provides entitlement-based route authorization for Next.js App Router.
 * This implements Authorization Pipeline Step 8: Entitlement Check.
 *
 * This module implements:
 * 1. Higher-order function wrapper for route handlers (`withEntitlement`)
 * 2. Server-side entitlement check helper (`requireEntitlement`)
 *
 * Entitlement Flow:
 * 1. Extract tenant ID from AuthorizationContext
 * 2. Resolve tenant's subscription and plan via EntitlementService
 * 3. Check subscription status (CLOSED → deny all, SUSPENDED → emergency only)
 * 4. Check if required feature is in plan's features array
 * 5. Safety-critical operations bypass status/feature checks
 * 6. Log all denials with tenantId, feature, plan, and status
 *
 * SECURITY CONSIDERATIONS:
 * - Emergency/panic operations are NEVER denied (Req 19 AC 6, Req 20)
 * - SUSPENDED tenants can only perform safety-critical/billing operations
 * - CLOSED tenants are completely blocked (terminal state)
 * - Fail closed on unknown errors (INV-AUTH-002)
 *
 * @see Requirements 19 (AC 1-7) — Entitlement Enforcement
 * @see Requirements 20 (AC 1-11) — Safety-Critical Operation Protection
 * @see Design Components > Three Authorization Axes > Entitlement Check
 */

import { NextResponse, type NextRequest } from 'next/server';
import type { DomainResult } from '@core/utils';
import { fail } from '@core/utils';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { PlanFeature } from '@core/domains/subscription/types';
import { isSafetyCriticalFeature } from '@core/domains/subscription/types';
import type { IEntitlementService, EntitlementCheckResult } from '@core/domains/subscription/services';
import { entitlementNotAvailable, tenantSuspended, tenantClosed } from '@core/domains/subscription/errors';
import { container } from '@infrastructure/di/container';
import type { Logger } from '@infrastructure/logging/Logger';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import type { AuthorizedRouteHandler } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Options for the requireEntitlement middleware.
 */
export interface RequireEntitlementOptions {
  /**
   * The required feature/entitlement for the route.
   * Must be a valid PlanFeature value.
   */
  readonly requiredFeature: PlanFeature;

  /**
   * Mark this operation as safety-critical.
   * Safety-critical operations bypass subscription status checks.
   * Use only for emergency/panic operations per Requirement 20.
   *
   * @default false - Automatically detected from SAFETY_CRITICAL_FEATURES
   */
  readonly isSafetyCritical?: boolean;

  /**
   * Mark this as a billing/recovery flow.
   * Billing flows are allowed even during SUSPENDED status.
   *
   * @default false
   */
  readonly isBillingFlow?: boolean;

  /**
   * Optional flag to log successful entitlement checks.
   * @default false (only denials are logged)
   */
  readonly logSuccess?: boolean;
}

/**
 * Context for logging entitlement check results.
 */
export interface EntitlementCheckLogContext {
  readonly correlationId: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly feature: PlanFeature;
  readonly planName: string;
  readonly subscriptionStatus: string;
  readonly isSafetyCritical: boolean;
  readonly route: string;
  readonly method: string;
  readonly decision: 'ALLOW' | 'DENY';
  readonly reason?: string;
  readonly errorCode?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HEADER_CORRELATION_ID = 'x-correlation-id';

// ---------------------------------------------------------------------------
// Server-Side Entitlement Check Helper
// ---------------------------------------------------------------------------

/**
 * Validates that an AuthorizationContext's tenant has entitlement to a feature.
 *
 * This is a standalone helper function for server-side entitlement checks.
 * Use this when you already have an AuthorizationContext and need to validate
 * entitlements in a use case or service.
 *
 * @param authContext - The resolved authorization context
 * @param requiredFeature - The required feature/entitlement
 * @param options - Additional check options
 * @returns DomainResult<EntitlementCheckResult>
 *
 * @example
 * ```typescript
 * // In a use case
 * const result = await requireEntitlement(
 *   authContext,
 *   PlanFeature.IOT_INTEGRATION,
 * );
 * if (!result.success || !result.data.allowed) {
 *   return mapAppErrorToHttpResponse(result.error ?? tenantSuspended(), correlationId);
 * }
 * // Proceed with operation
 * ```
 *
 * @see Requirements 19.1 — Resolve tenant's subscription plan and status
 * @see Requirements 19.2 — Deny access if feature not in plan
 * @see Requirements 19.6 — Never deny emergency/panic operations
 */
export async function requireEntitlement(
  authContext: AuthorizationContext,
  requiredFeature: PlanFeature,
  options?: Omit<RequireEntitlementOptions, 'requiredFeature'>,
): Promise<DomainResult<EntitlementCheckResult>> {
  const { isSafetyCritical = false, isBillingFlow = false } = options ?? {};

  // Get EntitlementService from DI container
  let entitlementService: IEntitlementService;
  try {
    entitlementService = container.resolve<IEntitlementService>('entitlementService');
  } catch (error) {
    // Service not available - fail closed
    return fail({
      type: 'technical',
      code: 'ENTITLEMENT_SERVICE_UNAVAILABLE',
      message: 'Entitlement service is not available',
      userMessage: 'Service temporarily unavailable. Please try again.',
      retryable: true,
    });
  }

  // Perform entitlement check
  return entitlementService.checkEntitlement({
    tenantId: authContext.tenantId,
    requiredFeature,
    isSafetyCritical: isSafetyCritical || isSafetyCriticalFeature(requiredFeature),
    isBillingFlow,
  });
}

// ---------------------------------------------------------------------------
// Higher-Order Function Wrapper
// ---------------------------------------------------------------------------

/**
 * Creates an entitlement-protected route handler wrapper.
 *
 * This higher-order function wraps a route handler and enforces entitlement
 * checks before the handler is executed. It integrates with the authorization
 * pipeline (Step 8: Entitlement Check) to:
 *
 * 1. Extract tenant ID from the AuthorizationContext
 * 2. Resolve subscription plan and status
 * 3. Check subscription status restrictions (CLOSED/SUSPENDED)
 * 4. Verify feature is included in tenant's plan
 * 5. Bypass checks for safety-critical operations
 * 6. Log denials for audit purposes
 *
 * IMPORTANT: This wrapper MUST be used AFTER authentication and permission
 * middleware. It expects the AuthorizationContext to be available.
 *
 * @param options - Configuration options including required feature
 * @param handler - The route handler to wrap
 * @returns A wrapped route handler that enforces entitlements
 *
 * @example
 * ```typescript
 * // In a route handler file (e.g., app/api/iot/commands/route.ts)
 * import { withEntitlement } from '@infrastructure/middleware/authorization';
 * import { PlanFeature } from '@core/domains/subscription/types';
 *
 * async function handleIoTCommand(
 *   request: NextRequest,
 *   authContext: AuthorizationContext,
 * ): Promise<NextResponse> {
 *   // authContext is guaranteed to have IOT_INTEGRATION entitlement
 *   const result = await iotService.sendCommand(...);
 *   return NextResponse.json({ data: result });
 * }
 *
 * export const POST = withPermission(
 *   { permissions: ['iot:command'] },
 *   withEntitlement(
 *     { requiredFeature: PlanFeature.IOT_INTEGRATION },
 *     handleIoTCommand,
 *   ),
 * );
 * ```
 *
 * @see Requirements 19.1 — Resolve tenant's subscription plan and status
 * @see Requirements 19.2 — Deny access if feature not in plan
 * @see Requirements 19.3 — Decorator/middleware pattern
 * @see Requirements 19.4-5 — SUSPENDED tenant handling
 * @see Requirements 19.6 — Safety-critical operations bypass
 * @see Requirements 19.7 — Log all entitlement denials
 */
export function withEntitlement<T = unknown>(
  options: RequireEntitlementOptions,
  handler: AuthorizedRouteHandler<T>,
): AuthorizedRouteHandler<T> {
  const {
    requiredFeature,
    isSafetyCritical = false,
    isBillingFlow = false,
    logSuccess = false,
  } = options;

  return async (
    request: NextRequest,
    authContext: AuthorizationContext,
    context?: { params?: Promise<Record<string, string>> },
  ): Promise<NextResponse<T>> => {
    const correlationId =
      request.headers.get(HEADER_CORRELATION_ID) ?? generateCorrelationId();
    const route = request.nextUrl.pathname;
    const method = request.method;

    // Get logger from DI container
    let logger: Logger;
    try {
      logger = container.resolve<Logger>('logger');
    } catch {
      // Fallback to console if logger not available
      logger = {
        info: console.info,
        warn: console.warn,
        error: console.error,
        debug: console.debug,
      };
    }

    try {
      // Perform entitlement check
      const checkResult = await requireEntitlement(
        authContext,
        requiredFeature,
        { isSafetyCritical, isBillingFlow },
      );

      // Handle service errors
      if (!checkResult.success) {
        logger.error('Entitlement check failed: Service error', {
          correlation_id: correlationId,
          tenant_id: authContext.tenantId,
          user_id: authContext.userId,
          feature: requiredFeature,
          route,
          method,
          error_code: checkResult.error.code,
        });

        return mapAppErrorToHttpResponse(checkResult.error, correlationId) as NextResponse<T>;
      }

      const result = checkResult.data;

      // Handle denial
      if (!result.allowed) {
        const logContext: EntitlementCheckLogContext = {
          correlationId,
          tenantId: authContext.tenantId,
          userId: authContext.userId,
          feature: requiredFeature,
          planName: result.planName,
          subscriptionStatus: result.subscriptionStatus,
          isSafetyCritical: result.isSafetyCritical,
          route,
          method,
          decision: 'DENY',
          reason: result.denialReason,
          errorCode: result.errorCode,
        };

        // Log the denial (Requirements 19.7)
        logger.warn('Entitlement denied', {
          correlation_id: logContext.correlationId,
          tenant_id: logContext.tenantId,
          user_id: logContext.userId,
          feature: logContext.feature,
          plan: logContext.planName,
          status: logContext.subscriptionStatus,
          is_safety_critical: logContext.isSafetyCritical,
          route: logContext.route,
          method: logContext.method,
          decision: logContext.decision,
          reason: logContext.reason,
          error_code: logContext.errorCode,
        });

        // Return appropriate error response
        let error;
        switch (result.errorCode) {
          case 'TENANT_CLOSED':
            error = tenantClosed();
            break;
          case 'TENANT_SUSPENDED':
            error = tenantSuspended();
            break;
          case 'ENTITLEMENT_NOT_AVAILABLE':
          default:
            error = entitlementNotAvailable(requiredFeature, result.planName);
            break;
        }

        return mapAppErrorToHttpResponse(error, correlationId) as NextResponse<T>;
      }

      // Log success if configured
      if (logSuccess) {
        logger.info('Entitlement granted', {
          correlation_id: correlationId,
          tenant_id: authContext.tenantId,
          user_id: authContext.userId,
          feature: requiredFeature,
          plan: result.planName,
          status: result.subscriptionStatus,
          is_safety_critical: result.isSafetyCritical,
          route,
          method,
          decision: 'ALLOW',
        });
      }

      // Execute the handler with the authorization context
      return await handler(request, authContext, context);
    } catch (error) {
      // Fail closed on unknown errors (INV-AUTH-002)
      logger.error('Entitlement check failed: Unexpected error', {
        correlation_id: correlationId,
        tenant_id: authContext.tenantId,
        route,
        method,
        error_type: error instanceof Error ? error.name : 'Unknown',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });

      return NextResponse.json(
        {
          code: 'ENTITLEMENT_CHECK_FAILED',
          message: 'An error occurred checking your subscription. Please try again.',
          correlationId,
        },
        { status: 500 },
      ) as NextResponse<T>;
    }
  };
}

// ---------------------------------------------------------------------------
// Convenience Wrappers for Common Entitlements
// ---------------------------------------------------------------------------

/**
 * Creates a route handler that requires IoT integration entitlement.
 *
 * @example
 * export const POST = withIoTEntitlement(handleIoTCommand);
 */
export function withIoTEntitlement<T = unknown>(
  handler: AuthorizedRouteHandler<T>,
): AuthorizedRouteHandler<T> {
  return withEntitlement(
    { requiredFeature: 'iot_integration' as PlanFeature },
    handler,
  );
}

/**
 * Creates a route handler that requires door monitoring entitlement.
 *
 * @example
 * export const GET = withDoorMonitoringEntitlement(handleDoorStatus);
 */
export function withDoorMonitoringEntitlement<T = unknown>(
  handler: AuthorizedRouteHandler<T>,
): AuthorizedRouteHandler<T> {
  return withEntitlement(
    { requiredFeature: 'door_monitoring' as PlanFeature },
    handler,
  );
}

/**
 * Creates a route handler that requires advanced analytics entitlement.
 *
 * @example
 * export const GET = withAdvancedAnalyticsEntitlement(handleAnalyticsDashboard);
 */
export function withAdvancedAnalyticsEntitlement<T = unknown>(
  handler: AuthorizedRouteHandler<T>,
): AuthorizedRouteHandler<T> {
  return withEntitlement(
    { requiredFeature: 'advanced_analytics' as PlanFeature },
    handler,
  );
}

/**
 * Creates a route handler for safety-critical operations.
 * Safety-critical operations bypass subscription status checks.
 *
 * @example
 * export const POST = withSafetyCriticalEntitlement(
 *   PlanFeature.EMERGENCY_ALERT,
 *   handleEmergencyAlert,
 * );
 */
export function withSafetyCriticalEntitlement<T = unknown>(
  feature: PlanFeature,
  handler: AuthorizedRouteHandler<T>,
): AuthorizedRouteHandler<T> {
  return withEntitlement(
    { requiredFeature: feature, isSafetyCritical: true },
    handler,
  );
}

/**
 * Creates a route handler for billing/recovery flows.
 * Billing flows are allowed even during SUSPENDED status.
 *
 * @example
 * export const POST = withBillingFlowEntitlement(
 *   PlanFeature.FINANCE_BASIC,
 *   handlePaymentUpdate,
 * );
 */
export function withBillingFlowEntitlement<T = unknown>(
  feature: PlanFeature,
  handler: AuthorizedRouteHandler<T>,
): AuthorizedRouteHandler<T> {
  return withEntitlement(
    { requiredFeature: feature, isBillingFlow: true },
    handler,
  );
}
