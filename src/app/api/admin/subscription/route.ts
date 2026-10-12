/**
 * GET /api/admin/subscription — Get the current tenant's subscription info
 * (plan-enriched view).
 *
 * BFF boundary ONLY: resolve correlationId → resolve use case via DI →
 * branch on DomainResult → map domain entity to a safe UI contract.
 * No business logic, no data access, no raw SQL here.
 *
 * @see Requirements 18 (Subscription Status Management)
 * @see Error Handling Guideline (Steering)
 * @see BFF Pattern (Steering)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import {
  mapAppErrorToHttpResponse,
  type ErrorResponseBody,
} from '@infrastructure/utils/errorMapping';
import {
  withPermission,
  resolveTargetTenantFromContainer,
  type AuthorizedRouteHandler,
} from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { GetTenantSubscriptionUseCase } from '@core/domains/subscription/usecases';

// ---------------------------------------------------------------------------
// UI-facing response contract
// ---------------------------------------------------------------------------

/**
 * UI-facing subscription contract. Shaped to match the presentation layer's
 * `SubscriptionData` (plan + billingPeriod + usage) rather than the raw domain
 * view — the BFF's job is to produce a UI-centric contract.
 */
interface SubscriptionResponse {
  data: {
    id: string;
    tenantId: string;
    plan: {
      id: string;
      name: string;
      tier: string;
      price: number;
      currency: string;
      billingCycle: 'monthly' | 'yearly';
      features: string[];
      limits: {
        maxMembers: number | null;
        maxOrgUnits: number | null;
        maxStorage: number | null;
      };
    };
    status: string;
    billingPeriod: {
      start: string;
      end: string;
    };
    trialEndsAt: string | null;
    usage: {
      members: number;
      orgUnits: number;
      storage: number;
    };
    createdAt: string;
    updatedAt: string;
  } | null;
}

// ---------------------------------------------------------------------------
// GET handler — Get current subscription
// ---------------------------------------------------------------------------

const handleGetSubscription: AuthorizedRouteHandler<
  SubscriptionResponse | ErrorResponseBody
> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<SubscriptionResponse | ErrorResponseBody>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // Resolve the tenant to scope to. PLATFORM_ADMIN may target another tenant
  // via ?tenantId=; everyone else is restricted to their own tenant.
  const targetTenant = await resolveTargetTenantFromContainer(
    request,
    authContext,
    'admin/subscription',
    container,
  );
  if (!targetTenant.ok) {
    return NextResponse.json(
      {
        code: targetTenant.code,
        message: targetTenant.message,
        correlationId,
      },
      { status: targetTenant.status },
    );
  }

  const useCase = container.resolve<GetTenantSubscriptionUseCase>(
    'getTenantSubscriptionUseCase',
  );

  const result = await useCase.execute({
    tenantId: targetTenant.tenantId,
    hasManagePermission: authContext.permissions.has('tenant:manage'),
  });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  // No subscription is a valid state — return null data with 200.
  if (!result.data) {
    return NextResponse.json({ data: null }, { status: 200 });
  }

  const view = result.data;

  // Shape the domain view into the UI-facing SubscriptionData contract.
  // Some fields the UI models (price/currency/usage) are not part of this
  // domain view; provide safe defaults so the screen renders without errors.
  const startedAtIso = view.startedAt.toISOString();
  const periodEndIso = view.currentPeriodEnd?.toISOString() ?? startedAtIso;

  return NextResponse.json(
    {
      data: {
        id: view.id,
        tenantId: view.tenantId,
        plan: {
          id: view.planId,
          name: view.planName,
          tier: view.planName.toLowerCase(),
          price: 0,
          currency: 'IDR',
          billingCycle: 'monthly',
          features: [...view.features],
          limits: {
            maxMembers: view.maxUsers,
            maxOrgUnits: null,
            maxStorage: null,
          },
        },
        status: view.status,
        billingPeriod: {
          start: startedAtIso,
          end: periodEndIso,
        },
        trialEndsAt: view.trialEndsAt?.toISOString() ?? null,
        usage: {
          members: 0,
          orgUnits: 0,
          storage: 0,
        },
        createdAt: startedAtIso,
        updatedAt: startedAtIso,
      },
    },
    { status: 200 },
  );
};

// ---------------------------------------------------------------------------
// Exported Route Handlers
// ---------------------------------------------------------------------------

export const GET = withPermission(
  { permissions: ['tenant:manage'] },
  handleGetSubscription,
);
