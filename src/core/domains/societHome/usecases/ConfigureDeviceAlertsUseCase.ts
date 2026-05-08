/**
 * ConfigureDeviceAlertsUseCase — Set notification preferences per device
 * (event filters, quiet hours).
 *
 * Logic:
 * 1. Validate that the requesting user is a Warga or Ketua_RT (Home_Owner)
 * 2. Verify the user owns the device's household
 * 3. Save alert preferences via repository
 * 4. Enqueue audit log
 * 5. Return ok(preferences)
 *
 * @see Requirements 37.7, 37.9, 41.10
 */

import type { AuthContext, AuditQueueProtocol } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { fail, ok } from '@core/utils';
import { authorizationError, validationError } from '@core/utils';
import { UserRole } from '@core/protocols';
import type { HomeRepository } from '../repositories/HomeRepository';
import type {
  ConfigureDeviceAlertsInput,
  DeviceAlertPreferences,
} from '../entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface ConfigureDeviceAlertsUseCase {
  execute(params: {
    authContext: AuthContext;
    input: ConfigureDeviceAlertsInput;
  }): Promise<DomainResult<DeviceAlertPreferences>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const ConfigureDeviceAlertsUseCaseImpl = ({
  homeRepository,
  auditQueueProtocol,
}: {
  homeRepository: HomeRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): ConfigureDeviceAlertsUseCase => ({
  execute: async ({ authContext, input }) => {
    // 1. Validate role — only Warga or Ketua_RT can configure alerts
    if (
      authContext.role !== UserRole.Warga &&
      authContext.role !== UserRole.Ketua_RT
    ) {
      return fail(
        authorizationError(
          'IOT_DEVICE_ACCESS_DENIED',
          'Only Home_Owner (Warga or Ketua_RT) can configure device alerts',
          {
            userMessage:
              'Anda tidak memiliki akses untuk mengatur notifikasi perangkat.',
          },
        ),
      );
    }

    // 2. Validate quiet hours format if provided
    if (input.quietHoursStart !== null || input.quietHoursEnd !== null) {
      const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
      if (
        (input.quietHoursStart !== null &&
          !timeRegex.test(input.quietHoursStart)) ||
        (input.quietHoursEnd !== null && !timeRegex.test(input.quietHoursEnd))
      ) {
        return fail(
          validationError(
            'HOME_INVALID_QUIET_HOURS',
            'Quiet hours must be in HH:mm format (00:00 - 23:59)',
            {
              userMessage:
                'Format jam tenang tidak valid. Gunakan format HH:mm.',
            },
          ),
        );
      }
    }

    // 3. Verify the user owns a Home (ownership check)
    const homesResult = await homeRepository.findByOwner(
      authContext.tenantId,
      authContext.userId,
    );

    if (!homesResult.success) {
      return fail(homesResult.error);
    }

    if (homesResult.data.length === 0) {
      return fail(
        authorizationError(
          'IOT_DEVICE_ACCESS_DENIED',
          'User does not own any Home',
          {
            userMessage:
              'Anda tidak memiliki rumah terdaftar untuk mengatur perangkat.',
          },
        ),
      );
    }

    // 4. Save alert preferences
    const saveResult = await homeRepository.saveDeviceAlertPreferences(
      authContext.tenantId,
      input,
    );

    if (!saveResult.success) {
      return fail(saveResult.error);
    }

    // 5. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'device_alerts_configured',
        resourceType: 'iot_device',
        resourceId: input.deviceId,
        details: {
          eventFilters: input.eventFilters,
          quietHoursStart: input.quietHoursStart,
          quietHoursEnd: input.quietHoursEnd,
          enabled: input.enabled,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    return ok(saveResult.data);
  },
});
