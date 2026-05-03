/**
 * SecurityRepository — Core repository interface for security patrol
 * and incident operations.
 *
 * All methods return DomainResult to keep success/error paths explicit.
 * Infrastructure layer provides the concrete implementation.
 *
 * @see Requirements 12.1, 12.2, 12.3, 12.4
 */

import type { DomainResult } from '@core/utils';
import type {
  PatrolSchedule,
  CreatePatrolScheduleInput,
  PatrolAttendance,
  RecordAttendanceInput,
  IncidentReport,
  CreateIncidentReportInput,
} from '../entities';

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface SecurityRepository {
  /** Create a new patrol schedule within a tenant. */
  createSchedule(
    tenantId: string,
    createdBy: string,
    data: CreatePatrolScheduleInput,
  ): Promise<DomainResult<PatrolSchedule>>;

  /** Record attendance for a patrol schedule. */
  recordAttendance(
    tenantId: string,
    userId: string,
    data: RecordAttendanceInput,
  ): Promise<DomainResult<PatrolAttendance>>;

  /** Create a new incident report within a tenant. */
  createIncidentReport(
    tenantId: string,
    reportedBy: string,
    data: CreateIncidentReportInput,
  ): Promise<DomainResult<IncidentReport>>;

  /** Find all patrol schedules within a tenant. */
  findSchedulesByTenant(
    tenantId: string,
  ): Promise<DomainResult<PatrolSchedule[]>>;

  /** Find all incident reports within a tenant. */
  findIncidentsByTenant(
    tenantId: string,
  ): Promise<DomainResult<IncidentReport[]>>;
}
