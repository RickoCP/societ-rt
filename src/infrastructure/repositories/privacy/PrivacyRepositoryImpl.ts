/**
 * PrivacyRepositoryImpl — Prisma + TenantScopedRepository for privacy operations.
 *
 * @see Requirements 27.1, 27.2, 27.3, 27.4, 27.5, 27.6
 */

import type { PrismaClient } from '@prisma/client';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError, notFoundError } from '@core/utils';
import type {
  PrivacyRepository,
  PersonalDataExport,
} from '@core/domains/privacy/repositories/PrivacyRepository';
import type { ConsentRecord } from '@core/domains/privacy/entities';

export const PrivacyRepositoryImpl = ({
  prismaClient,
}: {
  prismaClient: PrismaClient;
}): PrivacyRepository => ({
  maskNik(nik: string): string {
    if (nik.length <= 4) return nik;
    return '*'.repeat(nik.length - 4) + nik.slice(-4);
  },

  maskPhone(phone: string): string {
    if (phone.length <= 4) return phone;
    return '*'.repeat(phone.length - 4) + phone.slice(-4);
  },

  async recordConsent(
    tenantId: string,
    userId: string,
    version: string,
  ): Promise<DomainResult<ConsentRecord>> {
    try {
      const now = new Date();
      await prismaClient.user.update({
        where: { id: userId, tenantId },
        data: {
          consentTimestamp: now,
          consentVersion: version,
        },
      });

      return ok({
        userId,
        tenantId,
        consentVersion: version,
        consentTimestamp: now,
      });
    } catch (error) {
      return fail(
        technicalError(
          'PRIVACY_CONSENT_RECORD_FAILED',
          'Failed to record consent',
          { cause: error },
        ),
      );
    }
  },

  async exportPersonalData(
    tenantId: string,
    userId: string,
  ): Promise<DomainResult<PersonalDataExport>> {
    try {
      const user = await prismaClient.user.findFirst({
        where: { id: userId, tenantId, deletedAt: null },
      });

      if (!user) {
        return fail(
          notFoundError('PRIVACY_USER_NOT_FOUND', 'User not found'),
        );
      }

      // Gather all personal data
      const [notifications, auditLogs] = await Promise.all([
        prismaClient.notification.findMany({
          where: { tenantId, userId },
          select: {
            id: true,
            type: true,
            title: true,
            channel: true,
            status: true,
            createdAt: true,
          },
        }),
        prismaClient.auditLog.findMany({
          where: { tenantId, actorUserId: userId },
          select: {
            id: true,
            actionType: true,
            resourceType: true,
            resourceId: true,
            timestamp: true,
          },
          take: 100,
          orderBy: { timestamp: 'desc' },
        }),
      ]);

      return ok({
        userId,
        tenantId,
        data: {
          profile: {
            name: user.name,
            email: user.email,
            role: user.role,
            status: user.status,
            createdAt: user.createdAt.toISOString(),
          },
          notifications,
          auditLogs,
        },
        exportedAt: new Date(),
      });
    } catch (error) {
      return fail(
        technicalError(
          'PRIVACY_EXPORT_FAILED',
          'Failed to export personal data',
          { cause: error },
        ),
      );
    }
  },

  async requestDeletion(
    tenantId: string,
    userId: string,
  ): Promise<DomainResult<void>> {
    try {
      const user = await prismaClient.user.findFirst({
        where: { id: userId, tenantId, deletedAt: null },
      });

      if (!user) {
        return fail(
          notFoundError('PRIVACY_USER_NOT_FOUND', 'User not found'),
        );
      }

      // Soft delete user
      await prismaClient.user.update({
        where: { id: userId },
        data: {
          deletedAt: new Date(),
          name: '[deleted]',
          email: `deleted-${userId}@deleted.local`,
          passwordHash: '',
        },
      });

      return ok(undefined);
    } catch (error) {
      return fail(
        technicalError(
          'PRIVACY_DELETION_FAILED',
          'Failed to process data deletion request',
          { cause: error },
        ),
      );
    }
  },
});
