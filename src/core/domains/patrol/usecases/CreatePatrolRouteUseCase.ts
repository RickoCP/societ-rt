/**
 * CreatePatrolRouteUseCase — Creates a new patrol route with ordered
 * checkpoints within a tenant.
 *
 * Logic:
 * 1. Validate caller has Ketua_RT or Pengurus role
 * 2. Create route via patrolRepository.createRoute
 * 3. Enqueue audit log (fire-and-forget)
 * 4. Return ok(route)
 *
 * @see Requirements 35.1, 35.10
 */

import type { AuthContext, AuditQueueProtocol } from '@core/protocols';
import { UserRole } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { fail, ok, authorizationError } from '@core/utils';
import type { PatrolRepository } from '../repositories/PatrolRepository';
import type { PatrolRoute, CreatePatrolRouteInput } from '../entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface CreatePatrolRouteUseCase {
  execute(params: {
    authContext: AuthContext;
    data: CreatePatrolRouteInput;
  }): Promise<DomainResult<PatrolRoute>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const CreatePatrolRouteUseCaseImpl = ({
  patrolRepository,
  auditQueueProtocol,
}: {
  patrolRepository: PatrolRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): CreatePatrolRouteUseCase => ({
  execute: async ({ authContext, data }) => {
    // 1. Validate role: only Ketua_RT or Pengurus may create patrol routes
    if (
      authContext.role !== UserRole.Ketua_RT &&
      authContext.role !== UserRole.Pengurus
    ) {
      return fail(
        authorizationError(
          'AUTH_INSUFFICIENT_ROLE',
          'Only Ketua_RT or Pengurus can create patrol routes',
          {
            userMessage:
              'Anda tidak memiliki izin untuk membuat rute patroli.',
          },
        ),
      );
    }

    // 2. Create route via repository
    const result = await patrolRepository.createRoute(
      authContext.tenantId,
      authContext.userId,
      data,
    );

    if (!result.success) {
      return fail(result.error);
    }

    const route = result.data;

    // 3. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'patrol_route_created',
        resourceType: 'patrol_route',
        resourceId: route.id,
        details: {
          name: route.name,
          checkpointCount: route.checkpoints.length,
          estimatedDuration: route.estimatedDuration,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 4. Return success
    return ok(route);
  },
});
