/**
 * TenantRepositoryImpl — Infrastructure implementation of TenantRepository.
 *
 * Uses prismaClient.tenant directly (NOT TenantScopedRepository) because
 * the Tenant model IS the tenant table — it is not tenant-scoped data.
 *
 * All methods return DomainResult<T> and wrap Prisma errors in
 * technical AppError types.
 *
 * @see Requirements 1.3, 1.4, 1.5, 2.1, 2.5
 */

import type { PrismaClient } from '@/generated/prisma/client';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError } from '@core/utils';
import type { TenantRepository } from '@core/domains/tenant/repositories/TenantRepository';
import type { CreateTenantInput, Tenant } from '@core/domains/tenant/entities';

// ---------------------------------------------------------------------------
// Prisma → Domain mapper
// ---------------------------------------------------------------------------

interface PrismaTenant {
  id: string;
  name: string;
  subdomain: string;
  rtRwNumber: string;
  region: string;
  address: string;
  contactPerson: string;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  status: string;
  subscriptionPlanId: string;
  createdAt: Date;
  updatedAt: Date;
}

function mapPrismaTenantToDomain(prisma: PrismaTenant): Tenant {
  return {
    id: prisma.id,
    name: prisma.name,
    subdomain: prisma.subdomain,
    rtRwNumber: prisma.rtRwNumber,
    region: prisma.region,
    address: prisma.address,
    contactPerson: prisma.contactPerson,
    logoUrl: prisma.logoUrl,
    primaryColor: prisma.primaryColor,
    secondaryColor: prisma.secondaryColor,
    status: prisma.status as Tenant['status'],
    subscriptionPlanId: prisma.subscriptionPlanId,
    createdAt: prisma.createdAt,
    updatedAt: prisma.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Subdomain helper (mirrors use case logic)
// ---------------------------------------------------------------------------

function generateSubdomain(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const TenantRepositoryImpl = ({
  prismaClient,
}: {
  prismaClient: PrismaClient;
}): TenantRepository => ({
  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------
  async create(data: CreateTenantInput): Promise<DomainResult<Tenant>> {
    try {
      // Generate subdomain from name
      const subdomain = generateSubdomain(data.name);

      // Find the Free plan
      const freePlan = await prismaClient.subscriptionPlan.findFirst({
        where: { name: 'Free' },
      });

      if (!freePlan) {
        return fail(
          technicalError(
            'TENANT_FREE_PLAN_NOT_FOUND',
            'Free subscription plan not found in database',
          ),
        );
      }

      // Create tenant with Free plan
      const tenant = await prismaClient.tenant.create({
        data: {
          name: data.name,
          subdomain,
          rtRwNumber: data.rtRwNumber,
          region: data.region,
          address: data.address,
          contactPerson: data.contactPerson,
          subscriptionPlanId: freePlan.id,
        },
      });

      return ok(mapPrismaTenantToDomain(tenant as unknown as PrismaTenant));
    } catch (error) {
      return fail(
        technicalError('TENANT_CREATE_FAILED', 'Failed to create tenant', {
          cause: error,
        }),
      );
    }
  },

  // -------------------------------------------------------------------------
  // findById
  // -------------------------------------------------------------------------
  async findById(tenantId: string): Promise<DomainResult<Tenant | null>> {
    try {
      const tenant = await prismaClient.tenant.findUnique({
        where: { id: tenantId },
      });

      if (!tenant) {
        return ok(null);
      }

      return ok(mapPrismaTenantToDomain(tenant as unknown as PrismaTenant));
    } catch (error) {
      return fail(
        technicalError(
          'TENANT_FIND_BY_ID_FAILED',
          'Failed to find tenant by ID',
          { cause: error },
        ),
      );
    }
  },

  // -------------------------------------------------------------------------
  // findBySubdomain
  // -------------------------------------------------------------------------
  async findBySubdomain(
    subdomain: string,
  ): Promise<DomainResult<Tenant | null>> {
    try {
      const tenant = await prismaClient.tenant.findUnique({
        where: { subdomain },
      });

      if (!tenant) {
        return ok(null);
      }

      return ok(mapPrismaTenantToDomain(tenant as unknown as PrismaTenant));
    } catch (error) {
      return fail(
        technicalError(
          'TENANT_FIND_BY_SUBDOMAIN_FAILED',
          'Failed to find tenant by subdomain',
          { cause: error },
        ),
      );
    }
  },

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------
  async update(
    tenantId: string,
    data: Partial<Tenant>,
  ): Promise<DomainResult<Tenant>> {
    try {
      // Only allow safe fields to be updated
      const updateData: Record<string, unknown> = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.address !== undefined) updateData.address = data.address;
      if (data.contactPerson !== undefined)
        updateData.contactPerson = data.contactPerson;
      if (data.logoUrl !== undefined) updateData.logoUrl = data.logoUrl;
      if (data.primaryColor !== undefined)
        updateData.primaryColor = data.primaryColor;
      if (data.secondaryColor !== undefined)
        updateData.secondaryColor = data.secondaryColor;

      const tenant = await prismaClient.tenant.update({
        where: { id: tenantId },
        data: updateData,
      });

      return ok(mapPrismaTenantToDomain(tenant as unknown as PrismaTenant));
    } catch (error) {
      return fail(
        technicalError('TENANT_UPDATE_FAILED', 'Failed to update tenant', {
          cause: error,
        }),
      );
    }
  },

  // -------------------------------------------------------------------------
  // suspend
  // -------------------------------------------------------------------------
  async suspend(tenantId: string): Promise<DomainResult<void>> {
    try {
      await prismaClient.tenant.update({
        where: { id: tenantId },
        data: { status: 'suspended' },
      });

      return ok(undefined);
    } catch (error) {
      return fail(
        technicalError('TENANT_SUSPEND_FAILED', 'Failed to suspend tenant', {
          cause: error,
        }),
      );
    }
  },

  // -------------------------------------------------------------------------
  // reactivate
  // -------------------------------------------------------------------------
  async reactivate(tenantId: string): Promise<DomainResult<void>> {
    try {
      await prismaClient.tenant.update({
        where: { id: tenantId },
        data: { status: 'active' },
      });

      return ok(undefined);
    } catch (error) {
      return fail(
        technicalError(
          'TENANT_REACTIVATE_FAILED',
          'Failed to reactivate tenant',
          { cause: error },
        ),
      );
    }
  },

  // -------------------------------------------------------------------------
  // checkDuplicate
  // -------------------------------------------------------------------------
  async checkDuplicate(
    subdomain: string,
    rtRwNumber: string,
    region: string,
  ): Promise<DomainResult<boolean>> {
    try {
      const existing = await prismaClient.tenant.findFirst({
        where: {
          OR: [{ subdomain }, { rtRwNumber, region }],
        },
        select: { id: true },
      });

      return ok(existing !== null);
    } catch (error) {
      return fail(
        technicalError(
          'TENANT_CHECK_DUPLICATE_FAILED',
          'Failed to check for duplicate tenant',
          { cause: error },
        ),
      );
    }
  },
});
