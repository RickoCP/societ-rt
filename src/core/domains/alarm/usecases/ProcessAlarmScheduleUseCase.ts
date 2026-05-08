/**
 * ProcessAlarmScheduleUseCase — Processes alarm schedules to arm/disarm
 * sirens based on their configured schedule times.
 *
 * This use case is invoked by a BullMQ cron job. It checks the current
 * time against each device's scheduleArm and scheduleDisarm times and
 * sends the appropriate IoT command.
 *
 * Logic:
 * 1. Get all alarm schedules for the tenant
 * 2. For each device with a schedule, compare current time (HH:mm)
 * 3. If current time matches scheduleArm, send arm command
 * 4. If current time matches scheduleDisarm, send disarm command
 * 5. If IoT command fails, log ALARM_DEVICE_UNRESPONSIVE
 * 6. Return ok with summary of processed devices
 *
 * @see Requirements 36.7, 36.8, 36.9
 */

import type { IoTGatewayProtocol, AuditQueueProtocol } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok } from '@core/utils';
import type { AlarmRepository } from '../repositories/AlarmRepository';

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface ProcessAlarmScheduleResult {
  readonly armed: string[];
  readonly disarmed: string[];
  readonly unresponsive: string[];
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface ProcessAlarmScheduleUseCase {
  execute(params: {
    tenantId: string;
    currentTime: string;
  }): Promise<DomainResult<ProcessAlarmScheduleResult>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const ProcessAlarmScheduleUseCaseImpl = ({
  alarmRepository,
  iotGatewayProtocol,
  auditQueueProtocol,
}: {
  alarmRepository: AlarmRepository;
  iotGatewayProtocol: IoTGatewayProtocol;
  auditQueueProtocol: AuditQueueProtocol;
}): ProcessAlarmScheduleUseCase => ({
  execute: async ({ tenantId, currentTime }) => {
    const armed: string[] = [];
    const disarmed: string[] = [];
    const unresponsive: string[] = [];

    // 1. Get all alarm schedules for the tenant
    const schedulesResult = await alarmRepository.getSchedule(tenantId);

    if (!schedulesResult.success) {
      // If we can't fetch schedules, return empty result
      return ok({ armed, disarmed, unresponsive });
    }

    const schedules = schedulesResult.data;

    // 2. Process each device schedule
    for (const schedule of schedules) {
      // 3. Check if current time matches scheduleArm
      if (schedule.scheduleArm && schedule.scheduleArm === currentTime) {
        const commandResult = await iotGatewayProtocol.sendCommand(
          schedule.deviceId,
          {
            deviceId: schedule.deviceId,
            commandType: 'siren_arm',
            params: {},
            requestedBy: 'system_scheduler',
          },
        );

        if (!commandResult.success) {
          // 5. Log unresponsive device
          unresponsive.push(schedule.deviceId);

          auditQueueProtocol
            .enqueueAudit({
              tenantId,
              actorUserId: 'system_scheduler',
              actionType: 'alarm_schedule_arm_failed',
              resourceType: 'alarm_device',
              resourceId: schedule.deviceId,
              details: {
                scheduledTime: currentTime,
                error: 'ALARM_DEVICE_UNRESPONSIVE',
                deviceName: schedule.deviceName,
              },
            })
            .catch(() => {
              /* audit must not block the response */
            });

          continue;
        }

        // Activate (arm) in repository
        await alarmRepository.activateSiren(tenantId, schedule.deviceId);
        armed.push(schedule.deviceId);

        auditQueueProtocol
          .enqueueAudit({
            tenantId,
            actorUserId: 'system_scheduler',
            actionType: 'alarm_schedule_armed',
            resourceType: 'alarm_device',
            resourceId: schedule.deviceId,
            details: {
              scheduledTime: currentTime,
              deviceName: schedule.deviceName,
            },
          })
          .catch(() => {
            /* audit must not block the response */
          });
      }

      // 4. Check if current time matches scheduleDisarm
      if (schedule.scheduleDisarm && schedule.scheduleDisarm === currentTime) {
        const commandResult = await iotGatewayProtocol.sendCommand(
          schedule.deviceId,
          {
            deviceId: schedule.deviceId,
            commandType: 'siren_disarm',
            params: {},
            requestedBy: 'system_scheduler',
          },
        );

        if (!commandResult.success) {
          // 5. Log unresponsive device
          unresponsive.push(schedule.deviceId);

          auditQueueProtocol
            .enqueueAudit({
              tenantId,
              actorUserId: 'system_scheduler',
              actionType: 'alarm_schedule_disarm_failed',
              resourceType: 'alarm_device',
              resourceId: schedule.deviceId,
              details: {
                scheduledTime: currentTime,
                error: 'ALARM_DEVICE_UNRESPONSIVE',
                deviceName: schedule.deviceName,
              },
            })
            .catch(() => {
              /* audit must not block the response */
            });

          continue;
        }

        // Deactivate (disarm) in repository
        await alarmRepository.deactivateSiren(tenantId, schedule.deviceId);
        disarmed.push(schedule.deviceId);

        auditQueueProtocol
          .enqueueAudit({
            tenantId,
            actorUserId: 'system_scheduler',
            actionType: 'alarm_schedule_disarmed',
            resourceType: 'alarm_device',
            resourceId: schedule.deviceId,
            details: {
              scheduledTime: currentTime,
              deviceName: schedule.deviceName,
            },
          })
          .catch(() => {
            /* audit must not block the response */
          });
      }
    }

    // 6. Return summary
    return ok({ armed, disarmed, unresponsive });
  },
});
