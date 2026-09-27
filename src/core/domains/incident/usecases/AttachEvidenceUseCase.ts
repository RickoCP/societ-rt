/**
 * AttachEvidenceUseCase — Attaches evidence file URLs to an incident.
 *
 * Logic:
 * 1. Find incident by ID
 * 2. Validate evidence count limit (max 5 total including existing)
 * 3. Attach evidence URLs via incidentRepository.attachEvidence
 * 4. Enqueue audit log (fire-and-forget)
 * 5. Return ok(updatedIncident)
 *
 * @see Requirements 32.6, 32.10
 */

import type { AuditQueueProtocol } from '@core/protocols';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import type { DomainResult } from '@core/utils';
import { fail, ok } from '@core/utils';
import type { IncidentRepository } from '../repositories/IncidentRepository';
import type { Incident } from '../entities';
import { INCIDENT_MAX_EVIDENCE_FILES } from '../entities';
import { incidentNotFound, incidentEvidenceLimitExceeded } from '../errors/incidentErrors';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface AttachEvidenceUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    incidentId: string;
    evidenceUrls: string[];
  }): Promise<DomainResult<Incident>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const AttachEvidenceUseCaseImpl = ({
  incidentRepository,
  auditQueueProtocol,
}: {
  incidentRepository: IncidentRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): AttachEvidenceUseCase => ({
  execute: async ({ authContext, incidentId, evidenceUrls }) => {
    // 1. Find incident
    const findResult = await incidentRepository.findById(
      authContext.tenantId,
      incidentId,
    );

    if (!findResult.success) {
      return fail(findResult.error);
    }

    if (!findResult.data) {
      return fail(incidentNotFound(incidentId));
    }

    const incident = findResult.data;

    // 2. Validate evidence count limit
    const totalCount = incident.evidenceUrls.length + evidenceUrls.length;
    if (totalCount > INCIDENT_MAX_EVIDENCE_FILES) {
      return fail(
        incidentEvidenceLimitExceeded(
          incident.evidenceUrls.length,
          INCIDENT_MAX_EVIDENCE_FILES,
        ),
      );
    }

    // 3. Attach evidence URLs via repository
    const attachResult = await incidentRepository.attachEvidence(
      authContext.tenantId,
      incidentId,
      evidenceUrls,
    );

    if (!attachResult.success) {
      return fail(attachResult.error);
    }

    const updatedIncident = attachResult.data;

    // 4. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'incident_evidence_attached',
        resourceType: 'incident',
        resourceId: incidentId,
        details: {
          addedCount: evidenceUrls.length,
          totalCount: updatedIncident.evidenceUrls.length,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 5. Return success
    return ok(updatedIncident);
  },
});
