/**
 * SecurityRepositoryImpl — Infrastructure implementation of SecurityRepository.
 *
 * Uses TenantScopedRepository for PatrolSchedule and direct Prisma for
 * PatrolAttendance and IncidentReport.
 *
 * @see Requirements 12.1, 12.2, 12.3, 12.4
 */

import type { PrismaClient } from '@prisma/client';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError } from '@core/utils';
import type { SecurityRepository } from '@core/domains/security/repositories/SecurityRepository';
import type {
  PatrolSchedule,
  CreatePatrolScheduleInput,
  PatrolAttendance,
  RecordAttendanceInput,
  IncidentReport,
  CreateIncidentReportInput,
} from '@core/domains/security/entities';
import {
  createTenantScopedRepository,
  type TenantScopedRepository,
} from '@infrastructure/repositories/TenantScopedRepository';

// ---------------------------------------------------------------------------
// Prisma → Domain mappers
// ---------------------------------------------------------------------------

interface PrismaPatrolSchedule {
  id: string;
  tenantId: string;
  date: Date;
  timeSlot: string;
  assignedUserIds: string[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface PrismaPatrolAttendance {
  id: string;
  scheduleId: string;
  userId: string;
  checkInTimestamp: Date;
  createdAt: Date;
}

interface PrismaIncidentReport {
  id: string;
  tenantId: string;
  date: Date;
  time: string;
  description: string;
  location: string;
  severityLevel: string;
  reportedBy: string;
  createdAt: Date;
}

function mapScheduleToDomain(p: PrismaPatrolSchedule): PatrolSchedule {
  return {
    id: p.id,
    tenantId: p.tenantId,
    date: p.date,
    timeSlot: p.timeSlot,
    assignedUserIds: p.assignedUserIds,
    createdBy: p.createdBy,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function mapAttendanceToDomain(p: PrismaPatrolAttendance): PatrolAttendance {
  return {
    id: p.id,
    scheduleId: p.scheduleId,
    userId: p.userId,
    checkInTimestamp: p.checkInTimestamp,
    createdAt: p.createdAt,
  };
}

function mapIncidentToDomain(p: PrismaIncidentReport): IncidentReport {
  return {
    id: p.id,
    tenantId: p.tenantId,
    date: p.date,
    time: p.time,
    description: p.description,
    location: p.location,
    severityLevel: p.severityLevel as IncidentReport['severityLevel'],
    reportedBy: p.reportedBy,
    createdAt: p.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const SecurityRepositoryImpl = ({
  prismaClient,
}: {
  prismaClient: PrismaClient;
}): SecurityRepository => {
  const scheduleRepo: TenantScopedRepository<PrismaPatrolSchedule> =
    createTenantScopedRepository(
      prismaClient.patrolSchedule as unknown as Parameters<
        typeof createTenantScopedRepository
      >[0],
    );

  return {
    // -----------------------------------------------------------------------
    // createSchedule
    // -----------------------------------------------------------------------
    async createSchedule(
      tenantId: string,
      createdBy: string,
      data: CreatePatrolScheduleInput,
    ): Promise<DomainResult<PatrolSchedule>> {
      try {
        const schedule = await scheduleRepo.create(tenantId, {
          data: {
            date: data.date,
            timeSlot: data.timeSlot,
            assignedUserIds: data.assignedUserIds,
            createdBy,
          },
        });

        return ok(mapScheduleToDomain(schedule));
      } catch (error) {
        return fail(
          technicalError(
            'SECURITY_CREATE_SCHEDULE_FAILED',
            'Failed to create patrol schedule',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // recordAttendance
    // -----------------------------------------------------------------------
    async recordAttendance(
      _tenantId: string,
      userId: string,
      data: RecordAttendanceInput,
    ): Promise<DomainResult<PatrolAttendance>> {
      try {
        const attendance = await prismaClient.patrolAttendance.create({
          data: {
            scheduleId: data.scheduleId,
            userId,
            checkInTimestamp: data.checkInTimestamp,
          },
        });

        return ok(
          mapAttendanceToDomain(
            attendance as unknown as PrismaPatrolAttendance,
          ),
        );
      } catch (error) {
        return fail(
          technicalError(
            'SECURITY_RECORD_ATTENDANCE_FAILED',
            'Failed to record patrol attendance',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // createIncidentReport
    // -----------------------------------------------------------------------
    async createIncidentReport(
      tenantId: string,
      reportedBy: string,
      data: CreateIncidentReportInput,
    ): Promise<DomainResult<IncidentReport>> {
      try {
        const report = await prismaClient.incidentReport.create({
          data: {
            tenantId,
            date: data.date,
            time: data.time,
            description: data.description,
            location: data.location,
            severityLevel: data.severityLevel,
            reportedBy,
          },
        });

        return ok(
          mapIncidentToDomain(report as unknown as PrismaIncidentReport),
        );
      } catch (error) {
        return fail(
          technicalError(
            'SECURITY_CREATE_INCIDENT_FAILED',
            'Failed to create incident report',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // findSchedulesByTenant
    // -----------------------------------------------------------------------
    async findSchedulesByTenant(
      tenantId: string,
    ): Promise<DomainResult<PatrolSchedule[]>> {
      try {
        const schedules = await scheduleRepo.findMany(tenantId, {
          orderBy: { date: 'desc' },
        });

        return ok(schedules.map(mapScheduleToDomain));
      } catch (error) {
        return fail(
          technicalError(
            'SECURITY_FIND_SCHEDULES_FAILED',
            'Failed to find patrol schedules',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // findIncidentsByTenant
    // -----------------------------------------------------------------------
    async findIncidentsByTenant(
      tenantId: string,
    ): Promise<DomainResult<IncidentReport[]>> {
      try {
        const incidents = await prismaClient.incidentReport.findMany({
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
        });

        return ok(
          incidents.map((i) =>
            mapIncidentToDomain(i as unknown as PrismaIncidentReport),
          ),
        );
      } catch (error) {
        return fail(
          technicalError(
            'SECURITY_FIND_INCIDENTS_FAILED',
            'Failed to find incident reports',
            { cause: error },
          ),
        );
      }
    },
  };
};
