/**
 * GET /api/admin/tenant/settings — Get tenant settings.
 * PUT /api/admin/tenant/settings — Update tenant settings.
 *
 * BFF pattern: withPermission → execute use case → return safe response.
 *
 * @see Requirements 11.1-11.10 (Tenant Settings)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import {
  withPermission,
  resolveTargetTenantFromContainer,
  type AuthorizedRouteHandler,
} from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { ErrorResponseBody } from '@infrastructure/utils/errorMapping';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

/**
 * UI-facing contract. Shaped to match the presentation layer's nested
 * `TenantSettings` (profile + configuration + lifecycle) rather than a flat
 * row — the BFF produces a UI-centric contract.
 */
interface TenantSettingsResponse {
  data: {
    id: string;
    profile: {
      name: string;
      rtRwNumber: string;
      region: string;
      address: string;
      contactPerson: string;
      logoUrl: string | null;
      primaryColor: string | null;
      secondaryColor: string | null;
      contactEmail: string | null;
      contactPhone: string | null;
    };
    configuration: {
      sirenDeviceId: string | null;
      sirenConnectionStatus: 'connected' | 'disconnected' | 'unknown';
      notificationChannels: {
        telegram: boolean;
        whatsapp: boolean;
        email: boolean;
      };
      timezone: string;
      language: string;
      emergencyEscalationTimeout: number;
      lastUpdatedAt: string | null;
      lastUpdatedBy: string | null;
    };
    lifecycleStatus:
      | 'PROVISIONING'
      | 'ACTIVE'
      | 'SUSPENDED'
      | 'CLOSING'
      | 'CLOSED'
      | 'PURGED';
    lifecycleHistory: Array<{
      id: string;
      fromStatus: string;
      toStatus: string;
      reason: string | null;
      actorName: string;
      actorEmail: string;
      timestamp: string;
    }>;
    createdAt: string;
    updatedAt: string;
  };
}

/** Map the DB tenant status (active/suspended) to the UI lifecycle status. */
function mapLifecycleStatus(
  status: string,
): 'ACTIVE' | 'SUSPENDED' {
  return status === 'suspended' ? 'SUSPENDED' : 'ACTIVE';
}

// ---------------------------------------------------------------------------
// GET handler — Get tenant settings
// ---------------------------------------------------------------------------

const handleGetTenantSettings: AuthorizedRouteHandler<TenantSettingsResponse | ErrorResponseBody> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<TenantSettingsResponse | ErrorResponseBody>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  try {
    // Resolve the tenant to scope to. PLATFORM_ADMIN may target another tenant
    // via ?tenantId=; everyone else is restricted to their own tenant.
    const targetTenant = await resolveTargetTenantFromContainer(
      request,
      authContext,
      'admin/tenant/settings',
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

    const result = await pool.query(
      `SELECT 
        id, name, subdomain, rt_rw_number, region, address, 
        contact_person, logo_url, primary_color, secondary_color,
        siren_device_id, status, created_at, updated_at
      FROM tenants 
      WHERE id = $1`,
      [targetTenant.tenantId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        {
          code: 'COMMON_NOT_FOUND',
          message: 'Tenant not found',
          correlationId,
        },
        { status: 404 },
      );
    }

    const tenant = result.rows[0];
    const createdAtIso =
      tenant.created_at?.toISOString() ?? new Date().toISOString();
    const updatedAtIso =
      tenant.updated_at?.toISOString() ?? new Date().toISOString();

    return NextResponse.json(
      {
        data: {
          id: tenant.id,
          profile: {
            name: tenant.name ?? '',
            rtRwNumber: tenant.rt_rw_number ?? '',
            region: tenant.region ?? '',
            address: tenant.address ?? '',
            contactPerson: tenant.contact_person ?? '',
            logoUrl: tenant.logo_url ?? null,
            primaryColor: tenant.primary_color ?? '#3B82F6',
            secondaryColor: tenant.secondary_color ?? '#1E40AF',
            // Not stored on the tenants table yet — safe nulls.
            contactEmail: null,
            contactPhone: null,
          },
          configuration: {
            sirenDeviceId: tenant.siren_device_id ?? null,
            sirenConnectionStatus: tenant.siren_device_id
              ? 'connected'
              : 'disconnected',
            notificationChannels: {
              telegram: true,
              whatsapp: false,
              email: true,
            },
            timezone: 'Asia/Jakarta',
            language: 'id',
            emergencyEscalationTimeout: 5,
            lastUpdatedAt: updatedAtIso,
            lastUpdatedBy: null,
          },
          lifecycleStatus: mapLifecycleStatus(tenant.status ?? 'active'),
          lifecycleHistory: [],
          createdAt: createdAtIso,
          updatedAt: updatedAtIso,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('[admin/tenant/settings] Error:', error);
    return NextResponse.json(
      {
        code: 'COMMON_UNEXPECTED_ERROR',
        message: 'Failed to fetch tenant settings',
        correlationId,
      },
      { status: 500 },
    );
  }
};

// ---------------------------------------------------------------------------
// Exported Route Handlers
// ---------------------------------------------------------------------------

export const GET = withPermission(
  { permissions: ['tenant:manage'] },
  handleGetTenantSettings,
);
