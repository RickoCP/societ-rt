/**
 * SecurityCenterRepositoryImpl — Infrastructure implementation of the
 * SecurityCenterRepository interface using Prisma.
 *
 * Aggregates data from Incident, EmergencyAlert, Gate, CctvCamera,
 * PatrolSession, and DeviceEvent models to provide unified security
 * dashboard metrics, timeline, analytics, and alert broadcasting.
 *
 * @see Requirements 31.1, 31.3, 31.4, 31.6
 */

import type { PrismaClient } from '@prisma/client';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError } from '@core/utils';
import type {
  SecurityCenterRepository,
  TimelineQuery,
  AnalyticsQuery,
} from '@core/domains/securityCenter/repositories/SecurityCenterRepository';
import type {
  SecurityDashboardMetrics,
  SecurityTimelineEvent,
  SecurityAnalytics,
  NeighborhoodAlert,
  CreateNeighborhoodAlertInput,
} from '@core/domains/securityCenter/entities';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const SecurityCenterRepositoryImpl = ({
  prismaClient,
}: {
  prismaClient: PrismaClient;
}): SecurityCenterRepository => {
  return {
    // -----------------------------------------------------------------------
    // getDashboardMetrics
    // -----------------------------------------------------------------------
    async getDashboardMetrics(
      tenantId: string,
    ): Promise<DomainResult<SecurityDashboardMetrics>> {
      try {
        // Aggregate active incidents
        const activeIncidents = await prismaClient.incident.count({
          where: {
            tenantId,
            status: { in: ['open', 'acknowledged', 'in_progress', 'escalated'] },
          },
        });

        // Aggregate active emergency alerts
        const emergencyAlerts = await prismaClient.emergencyAlert.count({
          where: {
            tenantId,
            status: { in: ['active', 'responding'] },
          },
        });

        // Gate status summary
        const gates = await prismaClient.gate.findMany({
          where: { tenantId },
          select: { status: true },
        });

        const gateStatus = {
          open: gates.filter(g => g.status === 'open').length,
          closed: gates.filter(g => g.status === 'closed').length,
          offline: gates.filter(g => g.status === 'offline').length,
        };

        // CCTV status summary
        const cameras = await prismaClient.cctvCamera.findMany({
          where: { tenantId },
          select: { status: true },
        });

        const cctvStatus = {
          online: cameras.filter(c => c.status === 'online').length,
          offline: cameras.filter(c => c.status === 'offline').length,
        };

        // Patrol status — count active sessions
        const activeSessions = await prismaClient.patrolSession.count({
          where: {
            tenantId,
            status: 'active',
          },
        });

        // Recent security events (last 20)
        const recentIncidents = await prismaClient.incident.findMany({
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            title: true,
            severity: true,
            category: true,
            createdAt: true,
          },
        });

        const recentEvents = recentIncidents.map(i => ({
          id: i.id,
          type: 'incident' as const,
          title: i.title,
          severity: i.severity,
          category: i.category,
          timestamp: i.createdAt,
        }));

        return ok({
          activeIncidents,
          emergencyAlerts,
          gateStatus,
          cctvStatus,
          patrolStatus: { activeSessions },
          recentEvents,
        });
      } catch (error) {
        return fail(
          technicalError(
            'SECURITY_DASHBOARD_FAILED',
            'Failed to retrieve security dashboard metrics',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // getIncidentTimeline
    // -----------------------------------------------------------------------
    async getIncidentTimeline(
      query: TimelineQuery,
    ): Promise<DomainResult<SecurityTimelineEvent[]>> {
      try {
        const { tenantId, startTime, endTime } = query;

        // Fetch incidents in time range
        const incidents = await prismaClient.incident.findMany({
          where: {
            tenantId,
            createdAt: { gte: startTime, lte: endTime },
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            description: true,
            severity: true,
            category: true,
            location: true,
            reportedBy: true,
            createdAt: true,
          },
        });

        const timelineEvents: SecurityTimelineEvent[] = incidents.map(i => ({
          id: i.id,
          type: 'incident' as const,
          title: i.title,
          description: i.description,
          severity: i.severity,
          category: i.category,
          location: i.location,
          actorId: i.reportedBy,
          timestamp: i.createdAt,
        }));

        return ok(timelineEvents);
      } catch (error) {
        return fail(
          technicalError(
            'SECURITY_TIMELINE_FAILED',
            'Failed to retrieve incident timeline',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // getSecurityAnalytics
    // -----------------------------------------------------------------------
    async getSecurityAnalytics(
      query: AnalyticsQuery,
    ): Promise<DomainResult<SecurityAnalytics>> {
      try {
        const { tenantId, startTime, endTime } = query;

        // Incidents by severity
        const incidents = await prismaClient.incident.findMany({
          where: {
            tenantId,
            createdAt: { gte: startTime, lte: endTime },
          },
          select: {
            severity: true,
            category: true,
            createdAt: true,
            resolvedAt: true,
          },
        });

        // Group by severity
        const severityMap = new Map<string, number>();
        for (const inc of incidents) {
          const count = severityMap.get(inc.severity) ?? 0;
          severityMap.set(inc.severity, count + 1);
        }
        const incidentsBySeverity = Array.from(severityMap.entries()).map(
          ([severity, count]) => ({
            severity: severity as SecurityAnalytics['incidentsBySeverity'][number]['severity'],
            count,
          }),
        );

        // Group by category
        const categoryMap = new Map<string, number>();
        for (const inc of incidents) {
          const count = categoryMap.get(inc.category) ?? 0;
          categoryMap.set(inc.category, count + 1);
        }
        const incidentsByCategory = Array.from(categoryMap.entries()).map(
          ([category, count]) => ({
            category: category as SecurityAnalytics['incidentsByCategory'][number]['category'],
            count,
          }),
        );

        // Average response time (resolved incidents only)
        const resolvedIncidents = incidents.filter(i => i.resolvedAt !== null);
        let averageResponseTime = 0;
        if (resolvedIncidents.length > 0) {
          const totalMinutes = resolvedIncidents.reduce((sum, i) => {
            const diff =
              (i.resolvedAt!.getTime() - i.createdAt.getTime()) / (1000 * 60);
            return sum + diff;
          }, 0);
          averageResponseTime = totalMinutes / resolvedIncidents.length;
        }

        // Patrol coverage percentage
        const totalPatrolRoutes = await prismaClient.patrolRoute.count({
          where: { tenantId },
        });
        const completedSessions = await prismaClient.patrolSession.count({
          where: {
            tenantId,
            status: 'completed',
            startedAt: { gte: startTime, lte: endTime },
          },
        });
        const patrolCoveragePercentage =
          totalPatrolRoutes > 0
            ? Math.round((completedSessions / totalPatrolRoutes) * 100)
            : 0;

        // Device event frequency
        const deviceEvents = await prismaClient.deviceEvent.findMany({
          where: {
            tenantId,
            isSharedSecurity: true,
            createdAt: { gte: startTime, lte: endTime },
          },
          select: { eventType: true },
        });

        const deviceTypeMap = new Map<string, number>();
        for (const evt of deviceEvents) {
          const count = deviceTypeMap.get(evt.eventType) ?? 0;
          deviceTypeMap.set(evt.eventType, count + 1);
        }
        const deviceEventFrequency = Array.from(deviceTypeMap.entries()).map(
          ([deviceType, count]) => ({ deviceType, count }),
        );

        return ok({
          incidentsBySeverity,
          averageResponseTime,
          incidentsByCategory,
          patrolCoveragePercentage,
          deviceEventFrequency,
          timeRange: { start: startTime, end: endTime },
        });
      } catch (error) {
        return fail(
          technicalError(
            'SECURITY_ANALYTICS_FAILED',
            'Failed to retrieve security analytics',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // broadcastAlert
    // -----------------------------------------------------------------------
    async broadcastAlert(
      tenantId: string,
      createdBy: string,
      input: CreateNeighborhoodAlertInput,
    ): Promise<DomainResult<NeighborhoodAlert>> {
      try {
        const id = crypto.randomUUID();
        const now = new Date();

        await prismaClient.$executeRawUnsafe(
          `INSERT INTO neighborhood_alerts (id, tenant_id, severity, message, created_by, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          id,
          tenantId,
          input.severity,
          input.message,
          createdBy,
          now,
        );

        return ok({
          id,
          tenantId,
          severity: input.severity,
          message: input.message,
          createdBy,
          createdAt: now,
        });
      } catch (error) {
        return fail(
          technicalError(
            'SECURITY_BROADCAST_ALERT_FAILED',
            'Failed to broadcast neighborhood alert',
            { cause: error },
          ),
        );
      }
    },
  };
};
