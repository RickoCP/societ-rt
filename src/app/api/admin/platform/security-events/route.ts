/**
 * GET /api/admin/platform/security-events — Platform Admin security events list.
 *
 * BFF boundary: this project has no external platform backend wired in, so this
 * local handler composes "security events" from the `incidents` table (the
 * tenant security incidents already stored in the DB) and maps them to the
 * SecurityEvent UI contract the platform-admin screen expects.
 *
 * Guarded by `platform:read` (PLATFORM_ADMIN only). Read-only, cross-tenant by
 * design (platform admin sees incidents across all tenants).
 *
 * @see Requirements 21.1-21.10 (Security Event Alerts)
 * @see BFF Pattern (Steering) — UI-centric contract, validation, safe errors
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import {
  withPermission,
  type AuthorizedRouteHandler,
} from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// UI-facing contract (mirrors PaginatedSecurityEvents / SecurityEvent)
// ---------------------------------------------------------------------------

interface SecurityEventResponseItem {
  id: string;
  timestamp: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  tenantId: string | null;
  tenantName: string | null;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  details: string;
  ipAddress: string;
  userAgent: string | null;
  countryCode: string | null;
  metadata: Record<string, unknown>;
  acknowledged: boolean;
  acknowledgedBy: string | null;
  acknowledgedByName: string | null;
  acknowledgedAt: string | null;
  correlationId: string | null;
  requestId: string | null;
}

interface SecurityEventsResponse {
  data: {
    events: SecurityEventResponseItem[];
    totalCount: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    unacknowledgedCount: number;
    criticalUnacknowledgedCount: number;
  };
}

// ---------------------------------------------------------------------------
// Mapping helpers (incident → security event)
// ---------------------------------------------------------------------------

/** Incident categories whose semantics are closest to an access/security event. */
function mapIncidentCategoryToEventType(category: string): string {
  switch (category) {
    case 'trespassing':
      return 'unauthorized_access';
    case 'theft':
    case 'vandalism':
    case 'suspicious_activity':
      return 'suspicious_activity';
    case 'device_alert':
      return 'api_abuse_detected';
    default:
      return 'suspicious_activity';
  }
}

/**
 * An incident is considered "acknowledged" once an admin has acted on it:
 * explicitly acknowledged, or resolved/closed.
 */
function isAcknowledgedStatus(status: string): boolean {
  return (
    status === 'acknowledged' || status === 'resolved' || status === 'closed'
  );
}

function parseIntParam(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

const handleGetSecurityEvents: AuthorizedRouteHandler<SecurityEventsResponse> = async (
  request: NextRequest,
  _authContext: AuthorizationContext,
): Promise<NextResponse<SecurityEventsResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  try {
    const { searchParams } = new URL(request.url);
    const page = parseIntParam(searchParams.get('page'), 1);
    const pageSize = Math.min(parseIntParam(searchParams.get('pageSize'), 25), 100);
    const sortDirection =
      searchParams.get('sortDirection') === 'asc' ? 'asc' : 'desc';

    const prisma = container.resolve<PrismaClient>('prismaClient');

    // Cross-tenant read: platform admin sees incidents across all tenants.
    const [incidents, totalCount, unacknowledgedCount, criticalUnacknowledgedCount] =
      await Promise.all([
        prisma.incident.findMany({
          orderBy: { createdAt: sortDirection },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { tenant: { select: { name: true } } },
        }),
        prisma.incident.count(),
        prisma.incident.count({
          where: { status: { notIn: ['acknowledged', 'resolved', 'closed'] } },
        }),
        prisma.incident.count({
          where: {
            status: { notIn: ['acknowledged', 'resolved', 'closed'] },
            severity: { in: ['critical', 'high'] },
          },
        }),
      ]);

    const events: SecurityEventResponseItem[] = incidents.map((incident) => {
      const acknowledged = isAcknowledgedStatus(incident.status);
      return {
        id: incident.id,
        timestamp: incident.createdAt.toISOString(),
        type: mapIncidentCategoryToEventType(incident.category),
        severity: incident.severity as 'critical' | 'high' | 'medium' | 'low',
        tenantId: incident.tenantId,
        tenantName: incident.tenant?.name ?? null,
        userId: incident.reportedBy,
        userName: null,
        userEmail: null,
        details: `${incident.title} — ${incident.description}`,
        ipAddress: '-',
        userAgent: null,
        countryCode: null,
        metadata: { location: incident.location, incidentStatus: incident.status },
        acknowledged,
        acknowledgedBy: null,
        acknowledgedByName: null,
        acknowledgedAt: acknowledged
          ? (incident.resolvedAt ?? incident.updatedAt).toISOString()
          : null,
        correlationId: null,
        requestId: null,
      };
    });

    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    return NextResponse.json(
      {
        data: {
          events,
          totalCount,
          page,
          pageSize,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
          unacknowledgedCount,
          criticalUnacknowledgedCount,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[admin/platform/security-events] Error:', error);
    return NextResponse.json(
      {
        code: 'COMMON_UNEXPECTED_ERROR',
        message: 'Failed to fetch security events',
        correlationId,
      },
      { status: 500 },
    ) as unknown as NextResponse<SecurityEventsResponse>;
  }
};

export const GET = withPermission(
  { permissions: ['platform:read'] },
  handleGetSecurityEvents,
);
