/**
 * RecordCheckpointVisitUseCase — Records a checkpoint visit during a patrol
 * session after validating GPS proximity.
 *
 * Logic:
 * 1. Validate GPS distance <= 50m from checkpoint using Haversine formula
 *    (PATROL_CHECKPOINT_TOO_FAR if exceeded)
 * 2. Record visit via patrolRepository.recordCheckpointVisit
 * 3. Enqueue audit log (fire-and-forget)
 * 4. Return ok(visit)
 *
 * @see Requirements 35.4, 35.5, 35.10
 */

import type { AuthContext, AuditQueueProtocol } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { fail, ok } from '@core/utils';
import type { PatrolRepository } from '../repositories/PatrolRepository';
import type { PatrolCheckpointVisit } from '../entities';
import { patrolCheckpointTooFar } from '../errors/patrolErrors';

// ---------------------------------------------------------------------------
// Haversine distance helper (pure math, no external deps)
// ---------------------------------------------------------------------------

const EARTH_RADIUS_METERS = 6371000;
const MAX_CHECKPOINT_DISTANCE_METERS = 50;

/**
 * Calculate the great-circle distance between two GPS coordinates
 * using the Haversine formula.
 *
 * @returns Distance in meters.
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

export interface RecordCheckpointVisitParams {
  sessionId: string;
  checkpointIndex: number;
  /** Guard's current GPS latitude. */
  latitude: number;
  /** Guard's current GPS longitude. */
  longitude: number;
  /** Checkpoint's expected GPS latitude. */
  checkpointLatitude: number;
  /** Checkpoint's expected GPS longitude. */
  checkpointLongitude: number;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface RecordCheckpointVisitUseCase {
  execute(params: {
    authContext: AuthContext;
    data: RecordCheckpointVisitParams;
  }): Promise<DomainResult<PatrolCheckpointVisit>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const RecordCheckpointVisitUseCaseImpl = ({
  patrolRepository,
  auditQueueProtocol,
}: {
  patrolRepository: PatrolRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): RecordCheckpointVisitUseCase => ({
  execute: async ({ authContext, data }) => {
    // 1. Validate GPS distance <= 50m from checkpoint
    const distance = haversineDistance(
      data.latitude,
      data.longitude,
      data.checkpointLatitude,
      data.checkpointLongitude,
    );

    if (distance > MAX_CHECKPOINT_DISTANCE_METERS) {
      return fail(
        patrolCheckpointTooFar(data.checkpointIndex, Math.round(distance)),
      );
    }

    // 2. Record visit via repository
    const result = await patrolRepository.recordCheckpointVisit(
      authContext.tenantId,
      data.sessionId,
      {
        checkpointIndex: data.checkpointIndex,
        latitude: data.latitude,
        longitude: data.longitude,
        distanceFromCheckpoint: Math.round(distance),
      },
    );

    if (!result.success) {
      return fail(result.error);
    }

    const visit = result.data;

    // 3. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'patrol_checkpoint_visited',
        resourceType: 'patrol_checkpoint_visit',
        resourceId: visit.id,
        details: {
          sessionId: data.sessionId,
          checkpointIndex: data.checkpointIndex,
          latitude: data.latitude,
          longitude: data.longitude,
          distanceFromCheckpoint: Math.round(distance),
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 4. Return success
    return ok(visit);
  },
});
