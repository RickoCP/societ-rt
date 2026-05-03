/**
 * CreateIncidentReportUseCase — Creates a new security incident report
 * within a tenant.
 *
 * Logic:
 * 1. Create incident report via securityRepository.createIncidentReport
 * 2. Enqueue audit (action: 'incident_report_created', fire-and-forget)
 * 3. Return ok(report)
 *
 * @see Requirements 12.3, 12.4
 */

import type { AuthContext, AuditQueueProtocol } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { fail, ok } from '@core/utils';
import type { SecurityRepository } from '../repositories/SecurityRepository';
import type { IncidentReport, CreateIncidentReportInput } from '../entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface CreateIncidentReportUseCase {
  execute(params: {
    authContext: AuthContext;
    data: CreateIncidentReportInput;
  }): Promise<DomainResult<IncidentReport>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const CreateIncidentReportUseCaseImpl = ({
  securityRepository,
  auditQueueProtocol,
}: {
  securityRepository: SecurityRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): CreateIncidentReportUseCase => ({
  execute: async ({ authContext, data }) => {
    // 1. Create incident report via repository
    const result = await securityRepository.createIncidentReport(
      authContext.tenantId,
      authContext.userId,
      data,
    );

    if (!result.success) {
      return fail(result.error);
    }

    const report = result.data;

    // 2. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'incident_report_created',
        resourceType: 'incident_report',
        resourceId: report.id,
        details: {
          date: data.date.toISOString(),
          time: data.time,
          location: data.location,
          severityLevel: data.severityLevel,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 3. Return success
    return ok(report);
  },
});
