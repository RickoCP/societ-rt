/**
 * EmergencyContactRepositoryImpl — Prisma implementation of
 * EmergencyContactRepository. Tenant-scoped via createTenantScopedRepository.
 */

import type { PrismaClient } from '@/generated/prisma/client';
import { ok, fail, technicalError, notFoundError } from '@core/utils';
import type { EmergencyContactRepository } from '@core/domains/emergencyContact/repositories';
import type {
  EmergencyContact,
  EmergencyContactCategory,
  CreateEmergencyContactInput,
  UpdateEmergencyContactInput,
} from '@core/domains/emergencyContact/entities';
import {
  createTenantScopedRepository,
  type TenantScopedRepository,
} from '@infrastructure/repositories/TenantScopedRepository';

// ---------------------------------------------------------------------------
// Prisma row shape + mapper
// ---------------------------------------------------------------------------

interface PrismaEmergencyContact {
  id: string;
  tenantId: string;
  label: string;
  phone: string;
  category: string;
  description: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

function mapContact(p: PrismaEmergencyContact): EmergencyContact {
  return {
    id: p.id,
    tenantId: p.tenantId,
    label: p.label,
    phone: p.phone,
    category: p.category as EmergencyContactCategory,
    description: p.description,
    sortOrder: p.sortOrder,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const EmergencyContactRepositoryImpl = ({
  prismaClient,
}: {
  prismaClient: PrismaClient;
}): EmergencyContactRepository => {
  const repo: TenantScopedRepository<PrismaEmergencyContact> =
    createTenantScopedRepository(
      prismaClient.emergencyContact as unknown as Parameters<
        typeof createTenantScopedRepository
      >[0],
    );

  return {
    async listByTenant(tenantId) {
      try {
        const rows = await repo.findMany(tenantId, {
          orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
        });
        return ok(rows.map(mapContact));
      } catch (error) {
        return fail(
          technicalError(
            'EMERGENCY_CONTACT_LIST_FAILED',
            'Failed to list emergency contacts',
            { cause: error },
          ),
        );
      }
    },

    async findById(tenantId, id) {
      try {
        const found = await repo.findFirst(tenantId, { where: { id } });
        return ok(found ? mapContact(found) : null);
      } catch (error) {
        return fail(
          technicalError(
            'EMERGENCY_CONTACT_FIND_FAILED',
            'Failed to find emergency contact',
            { cause: error },
          ),
        );
      }
    },

    async create(tenantId, data: CreateEmergencyContactInput) {
      try {
        const created = await repo.create(tenantId, {
          data: {
            label: data.label,
            phone: data.phone,
            category: data.category ?? 'other',
            description: data.description ?? null,
            sortOrder: data.sortOrder ?? 0,
          },
        });
        return ok(mapContact(created));
      } catch (error) {
        return fail(
          technicalError(
            'EMERGENCY_CONTACT_CREATE_FAILED',
            'Failed to create emergency contact',
            { cause: error },
          ),
        );
      }
    },

    async update(tenantId, id, data: UpdateEmergencyContactInput) {
      try {
        const existing = await repo.findFirst(tenantId, { where: { id } });
        if (!existing) {
          return fail(
            notFoundError(
              'EMERGENCY_CONTACT_NOT_FOUND',
              `Emergency contact ${id} not found`,
            ),
          );
        }
        const updated = await repo.update(tenantId, {
          where: { id },
          data: {
            ...(data.label !== undefined ? { label: data.label } : {}),
            ...(data.phone !== undefined ? { phone: data.phone } : {}),
            ...(data.category !== undefined ? { category: data.category } : {}),
            ...(data.description !== undefined
              ? { description: data.description }
              : {}),
            ...(data.sortOrder !== undefined
              ? { sortOrder: data.sortOrder }
              : {}),
          },
        });
        return ok(mapContact(updated));
      } catch (error) {
        return fail(
          technicalError(
            'EMERGENCY_CONTACT_UPDATE_FAILED',
            'Failed to update emergency contact',
            { cause: error },
          ),
        );
      }
    },

    async remove(tenantId, id) {
      try {
        const existing = await repo.findFirst(tenantId, { where: { id } });
        if (!existing) {
          return fail(
            notFoundError(
              'EMERGENCY_CONTACT_NOT_FOUND',
              `Emergency contact ${id} not found`,
            ),
          );
        }
        await repo.delete(tenantId, { where: { id } });
        return ok(undefined);
      } catch (error) {
        return fail(
          technicalError(
            'EMERGENCY_CONTACT_DELETE_FAILED',
            'Failed to delete emergency contact',
            { cause: error },
          ),
        );
      }
    },
  };
};
