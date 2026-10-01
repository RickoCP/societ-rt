/**
 * HomeRepositoryImpl — Infrastructure implementation of the HomeRepository
 * interface using Prisma with tenant-scoped queries.
 *
 * Handles device dashboard retrieval, alert preferences, and device
 * ownership transfer for the SocieT-Home module.
 *
 * @see Requirements 37.1, 37.2, 37.5, 37.7
 */

import type { PrismaClient } from '@prisma/client';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError, notFoundError } from '@core/utils';
import type {
  HomeRepository,
} from '@core/domains/societHome/repositories/HomeRepository';
import type {
  Home,
  CreateHomeInput,
  DeviceDashboardItem,
  DeviceAlertPreferences,
  ConfigureDeviceAlertsInput,
} from '@core/domains/societHome/entities';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const HomeRepositoryImpl = ({
  prismaClient,
}: {
  prismaClient: PrismaClient;
}): HomeRepository => {
  return {
    // -----------------------------------------------------------------------
    // createHome
    // -----------------------------------------------------------------------
    async createHome(data: CreateHomeInput): Promise<DomainResult<Home>> {
      try {
        const home = await prismaClient.home.create({
          data: {
            tenantId: data.tenantId,
            householdId: data.householdId,
            ownerId: data.ownerId,
          },
        });

        return ok({
          id: home.id,
          tenantId: home.tenantId,
          householdId: home.householdId,
          ownerId: home.ownerId,
          createdAt: home.createdAt,
        });
      } catch (error) {
        return fail(
          technicalError('HOME_CREATE_FAILED', 'Failed to create Home record', {
            cause: error,
          }),
        );
      }
    },

    // -----------------------------------------------------------------------
    // findByHousehold
    // -----------------------------------------------------------------------
    async findByHousehold(
      tenantId: string,
      householdId: string,
    ): Promise<DomainResult<Home[]>> {
      try {
        const homes = await prismaClient.home.findMany({
          where: { tenantId, householdId },
        });

        return ok(
          homes.map(h => ({
            id: h.id,
            tenantId: h.tenantId,
            householdId: h.householdId,
            ownerId: h.ownerId,
            createdAt: h.createdAt,
          })),
        );
      } catch (error) {
        return fail(
          technicalError(
            'HOME_FIND_BY_HOUSEHOLD_FAILED',
            'Failed to find homes by household',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // findByOwner
    // -----------------------------------------------------------------------
    async findByOwner(
      tenantId: string,
      ownerId: string,
    ): Promise<DomainResult<Home[]>> {
      try {
        const homes = await prismaClient.home.findMany({
          where: { tenantId, ownerId },
        });

        return ok(
          homes.map(h => ({
            id: h.id,
            tenantId: h.tenantId,
            householdId: h.householdId,
            ownerId: h.ownerId,
            createdAt: h.createdAt,
          })),
        );
      } catch (error) {
        return fail(
          technicalError(
            'HOME_FIND_BY_OWNER_FAILED',
            'Failed to find homes by owner',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // getDeviceDashboard
    // -----------------------------------------------------------------------
    async getDeviceDashboard(
      tenantId: string,
      householdId: string,
    ): Promise<DomainResult<DeviceDashboardItem[]>> {
      try {
        const devices = await prismaClient.ioTDevice.findMany({
          where: { tenantId, householdId },
          orderBy: { lastSeen: 'desc' },
        });

        const items: DeviceDashboardItem[] = devices.map(d => ({
          deviceId: d.id,
          name: d.name,
          deviceType: d.deviceType,
          onlineStatus: d.onlineStatus as 'online' | 'offline',
          batteryLevel: d.batteryLevel,
          lastSeen: d.lastSeen,
          lastActivity: null,
        }));

        return ok(items);
      } catch (error) {
        return fail(
          technicalError(
            'HOME_DEVICE_DASHBOARD_FAILED',
            'Failed to retrieve device dashboard',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // getDeviceAlertPreferences
    // -----------------------------------------------------------------------
    async getDeviceAlertPreferences(
      tenantId: string,
      deviceId: string,
    ): Promise<DomainResult<DeviceAlertPreferences | null>> {
      try {
        const device = await prismaClient.ioTDevice.findFirst({
          where: { tenantId, id: deviceId },
        });

        if (!device) {
          return ok(null);
        }

        const metadata = device.metadata as Record<string, unknown> | null;
        const alertPrefs = metadata?.alertPreferences as
          | Record<string, unknown>
          | undefined;

        if (!alertPrefs) {
          return ok({
            deviceId,
            eventFilters: [],
            quietHoursStart: null,
            quietHoursEnd: null,
            enabled: true,
          });
        }

        return ok({
          deviceId,
          eventFilters: (alertPrefs.eventFilters as string[]) ?? [],
          quietHoursStart: (alertPrefs.quietHoursStart as string) ?? null,
          quietHoursEnd: (alertPrefs.quietHoursEnd as string) ?? null,
          enabled: alertPrefs.enabled !== false,
        });
      } catch (error) {
        return fail(
          technicalError(
            'HOME_GET_ALERT_PREFS_FAILED',
            'Failed to get device alert preferences',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // saveDeviceAlertPreferences
    // -----------------------------------------------------------------------
    async saveDeviceAlertPreferences(
      tenantId: string,
      data: ConfigureDeviceAlertsInput,
    ): Promise<DomainResult<DeviceAlertPreferences>> {
      try {
        const device = await prismaClient.ioTDevice.findFirst({
          where: { tenantId, id: data.deviceId },
        });

        if (!device) {
          return fail(
            notFoundError(
              'IOT_DEVICE_NOT_FOUND',
              `Device ${data.deviceId} not found`,
            ),
          );
        }

        const existingMetadata =
          (device.metadata as Record<string, unknown>) ?? {};

        const updatedMetadata = {
          ...existingMetadata,
          alertPreferences: {
            eventFilters: data.eventFilters,
            quietHoursStart: data.quietHoursStart,
            quietHoursEnd: data.quietHoursEnd,
            enabled: data.enabled,
          },
        };

        await prismaClient.ioTDevice.update({
          where: { id: data.deviceId },
          data: { metadata: updatedMetadata },
        });

        return ok({
          deviceId: data.deviceId,
          eventFilters: data.eventFilters,
          quietHoursStart: data.quietHoursStart,
          quietHoursEnd: data.quietHoursEnd,
          enabled: data.enabled,
        });
      } catch (error) {
        return fail(
          technicalError(
            'HOME_SAVE_ALERT_PREFS_FAILED',
            'Failed to save device alert preferences',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // transferDeviceOwnership
    // -----------------------------------------------------------------------
    async transferDeviceOwnership(
      tenantId: string,
      deviceId: string,
      newHouseholdId: string,
    ): Promise<DomainResult<void>> {
      try {
        const device = await prismaClient.ioTDevice.findFirst({
          where: { tenantId, id: deviceId },
        });

        if (!device) {
          return fail(
            notFoundError(
              'IOT_DEVICE_NOT_FOUND',
              `Device ${deviceId} not found`,
            ),
          );
        }

        await prismaClient.ioTDevice.update({
          where: { id: deviceId },
          data: { householdId: newHouseholdId },
        });

        return ok(undefined);
      } catch (error) {
        return fail(
          technicalError(
            'HOME_TRANSFER_OWNERSHIP_FAILED',
            'Failed to transfer device ownership',
            { cause: error },
          ),
        );
      }
    },
  };
};
