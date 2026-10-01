/**
 * ResidentRepositoryImpl — Infrastructure implementation of ResidentRepository.
 *
 * Uses TenantScopedRepository for all tenant-scoped queries on Household
 * and Resident Prisma models, ensuring multi-tenant data isolation.
 *
 * CSV export/import is handled inline (no external CSV library needed for
 * the simple semicolon-delimited format).
 *
 * @see Requirements 5.1, 5.2, 5.3, 5.7, 5.8, 5.9, 6.1
 */

import type { PrismaClient } from '@prisma/client';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError, validationError } from '@core/utils';
import type { ResidentRepository } from '@core/domains/resident/repositories/ResidentRepository';
import type {
  CreateHouseholdInput,
  CreateResidentInput,
  CsvImportResult,
  Household,
  PaginatedResult,
  Resident,
  ResidencyStatus,
  ResidentCategory,
  ResidentFilters,
} from '@core/domains/resident/entities';
import { CSV_COLUMNS } from '@core/domains/resident/entities';
import {
  createTenantScopedRepository,
  type TenantScopedRepository,
} from '@infrastructure/repositories/TenantScopedRepository';

// ---------------------------------------------------------------------------
// Prisma → Domain mappers
// ---------------------------------------------------------------------------

interface PrismaHousehold {
  id: string;
  tenantId: string;
  householdNumber: string;
  address: string;
  block: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: Date;
  updatedAt: Date;
}

function mapPrismaHouseholdToDomain(p: PrismaHousehold): Household {
  return {
    id: p.id,
    tenantId: p.tenantId,
    householdNumber: p.householdNumber,
    address: p.address,
    block: p.block,
    latitude: p.latitude,
    longitude: p.longitude,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

interface PrismaResident {
  id: string;
  tenantId: string;
  householdId: string;
  name: string;
  nik: string;
  dateOfBirth: Date;
  gender: string;
  phone: string | null;
  status: string;
  categories: string[];
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

function mapPrismaResidentToDomain(p: PrismaResident): Resident {
  return {
    id: p.id,
    tenantId: p.tenantId,
    householdId: p.householdId,
    name: p.name,
    nik: p.nik,
    dateOfBirth: p.dateOfBirth,
    gender: p.gender as Resident['gender'],
    phone: p.phone,
    status: p.status as ResidencyStatus,
    categories: p.categories as ResidentCategory[],
    emergencyContactName: p.emergencyContactName,
    emergencyContactPhone: p.emergencyContactPhone,
    emergencyContactRelationship: p.emergencyContactRelationship,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    deletedAt: p.deletedAt,
  };
}

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

const VALID_STATUSES = new Set<string>(['tetap', 'kontrak', 'kos', 'pindah']);
const VALID_GENDERS = new Set<string>(['male', 'female']);
const VALID_CATEGORIES = new Set<string>([
  'lansia',
  'balita',
  'disabilitas',
]);

function escapeCsvField(value: string): string {
  if (
    value.includes(',') ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r')
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        fields.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }

  fields.push(current);
  return fields;
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const ResidentRepositoryImpl = ({
  prismaClient,
}: {
  prismaClient: PrismaClient;
}): ResidentRepository => {
  const householdRepo: TenantScopedRepository<PrismaHousehold> =
    createTenantScopedRepository(
      prismaClient.household as unknown as Parameters<
        typeof createTenantScopedRepository
      >[0],
    );

  const residentRepo: TenantScopedRepository<PrismaResident> =
    createTenantScopedRepository(
      prismaClient.resident as unknown as Parameters<
        typeof createTenantScopedRepository
      >[0],
    );

  return {
    // -----------------------------------------------------------------------
    // createHousehold
    // -----------------------------------------------------------------------
    async createHousehold(
      tenantId: string,
      data: CreateHouseholdInput,
    ): Promise<DomainResult<Household>> {
      try {
        const household = await householdRepo.create(tenantId, {
          data: {
            householdNumber: data.householdNumber,
            address: data.address,
            block: data.block ?? null,
          },
        });

        return ok(mapPrismaHouseholdToDomain(household));
      } catch (error) {
        return fail(
          technicalError(
            'RESIDENT_HOUSEHOLD_CREATE_FAILED',
            'Failed to create household',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // addResident
    // -----------------------------------------------------------------------
    async addResident(
      tenantId: string,
      data: CreateResidentInput,
    ): Promise<DomainResult<Resident>> {
      try {
        const resident = await residentRepo.create(tenantId, {
          data: {
            householdId: data.householdId,
            name: data.name,
            nik: data.nik,
            dateOfBirth: data.dateOfBirth,
            gender: data.gender,
            phone: data.phone ?? null,
            status: data.status,
            categories: data.categories ?? [],
            emergencyContactName: data.emergencyContactName ?? null,
            emergencyContactPhone: data.emergencyContactPhone ?? null,
            emergencyContactRelationship:
              data.emergencyContactRelationship ?? null,
          },
        });

        return ok(mapPrismaResidentToDomain(resident));
      } catch (error) {
        return fail(
          technicalError(
            'RESIDENT_ADD_FAILED',
            'Failed to add resident',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // updateResidentStatus
    // -----------------------------------------------------------------------
    async updateResidentStatus(
      tenantId: string,
      residentId: string,
      status: ResidencyStatus,
    ): Promise<DomainResult<Resident>> {
      try {
        const resident = await residentRepo.update(tenantId, {
          where: { id: residentId },
          data: { status },
        });

        return ok(mapPrismaResidentToDomain(resident));
      } catch (error) {
        return fail(
          technicalError(
            'RESIDENT_STATUS_UPDATE_FAILED',
            'Failed to update resident status',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // findByTenant
    // -----------------------------------------------------------------------
    async findByTenant(
      tenantId: string,
      filters: ResidentFilters,
    ): Promise<DomainResult<PaginatedResult<Resident>>> {
      try {
        const page = filters.page ?? 1;
        const pageSize = filters.pageSize ?? 20;
        const skip = (page - 1) * pageSize;

        // Build where clause
        const where: Record<string, unknown> = {
          deletedAt: null,
        };

        if (filters.householdId) {
          where.householdId = filters.householdId;
        }

        if (filters.status) {
          where.status = filters.status;
        }

        if (filters.categories && filters.categories.length > 0) {
          where.categories = { hasSome: filters.categories };
        }

        if (filters.search) {
          where.OR = [
            { name: { contains: filters.search, mode: 'insensitive' } },
            { nik: { contains: filters.search, mode: 'insensitive' } },
          ];
        }

        const [residents, total] = await Promise.all([
          residentRepo.findMany(tenantId, {
            where,
            skip,
            take: pageSize,
            orderBy: { createdAt: 'desc' },
          }),
          residentRepo.count(tenantId, { where }),
        ]);

        return ok({
          data: residents.map(mapPrismaResidentToDomain),
          total,
          page,
          pageSize,
        });
      } catch (error) {
        return fail(
          technicalError(
            'RESIDENT_FIND_FAILED',
            'Failed to find residents',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // exportToCsv
    // -----------------------------------------------------------------------
    async exportToCsv(tenantId: string): Promise<DomainResult<string>> {
      try {
        const residents = await residentRepo.findMany(tenantId, {
          where: { deletedAt: null },
          include: { household: true },
          orderBy: { createdAt: 'asc' },
        });

        // Header row
        const header = CSV_COLUMNS.join(',');

        // Data rows
        const rows = residents.map((r) => {
          const resident = r as PrismaResident & {
            household: PrismaHousehold;
          };
          const fields = [
            resident.household.householdNumber,
            resident.name,
            resident.nik,
            formatDate(resident.dateOfBirth),
            resident.gender,
            resident.phone ?? '',
            resident.status,
            resident.categories.join(';'),
            resident.emergencyContactName ?? '',
            resident.emergencyContactPhone ?? '',
            resident.emergencyContactRelationship ?? '',
          ];
          return fields.map(escapeCsvField).join(',');
        });

        const csv = [header, ...rows].join('\n');
        return ok(csv);
      } catch (error) {
        return fail(
          technicalError(
            'RESIDENT_EXPORT_CSV_FAILED',
            'Failed to export residents to CSV',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // importFromCsv
    // -----------------------------------------------------------------------
    async importFromCsv(
      tenantId: string,
      csvContent: string,
    ): Promise<DomainResult<CsvImportResult>> {
      try {
        const lines = csvContent
          .split('\n')
          .map((l) => l.replace(/\r$/, ''))
          .filter((l) => l.trim().length > 0);

        if (lines.length < 2) {
          return fail(
            validationError(
              'RESIDENT_CSV_EMPTY',
              'CSV must contain a header row and at least one data row',
            ),
          );
        }

        // Skip header row
        const dataLines = lines.slice(1);

        let createdCount = 0;
        const skippedRows: Array<{ row: number; errors: string[] }> = [];

        for (let i = 0; i < dataLines.length; i++) {
          const line = dataLines[i]!;
          const rowNumber = i + 2; // 1-indexed, accounting for header
          const fields = parseCsvLine(line);

          // Validate field count
          if (fields.length < CSV_COLUMNS.length) {
            skippedRows.push({
              row: rowNumber,
              errors: [
                `Expected ${CSV_COLUMNS.length} fields, got ${fields.length}`,
              ],
            });
            continue;
          }

          const [
            householdNumber,
            name,
            nik,
            dateOfBirth,
            gender,
            phone,
            status,
            categoriesStr,
            emergencyContactName,
            emergencyContactPhone,
            emergencyContactRelationship,
          ] = fields;

          // Validate required fields
          const errors: string[] = [];

          if (!householdNumber?.trim()) {
            errors.push('household_number is required');
          }
          if (!name?.trim()) {
            errors.push('name is required');
          }
          if (!nik?.trim()) {
            errors.push('nik is required');
          }
          if (!dateOfBirth?.trim()) {
            errors.push('date_of_birth is required');
          }
          if (!gender?.trim()) {
            errors.push('gender is required');
          }
          if (!status?.trim()) {
            errors.push('status is required');
          }

          // Validate date format
          let parsedDate: Date | null = null;
          if (dateOfBirth?.trim()) {
            parsedDate = new Date(dateOfBirth.trim());
            if (isNaN(parsedDate.getTime())) {
              errors.push('date_of_birth is not a valid date');
            }
          }

          // Validate gender
          if (gender?.trim() && !VALID_GENDERS.has(gender.trim())) {
            errors.push(
              `gender must be one of: male, female (got "${gender.trim()}")`,
            );
          }

          // Validate status
          if (status?.trim() && !VALID_STATUSES.has(status.trim())) {
            errors.push(
              `status must be one of: tetap, kontrak, kos, pindah (got "${status.trim()}")`,
            );
          }

          // Validate categories
          const categories: ResidentCategory[] = [];
          if (categoriesStr?.trim()) {
            const cats = categoriesStr
              .trim()
              .split(';')
              .map((c) => c.trim())
              .filter((c) => c.length > 0);
            for (const cat of cats) {
              if (!VALID_CATEGORIES.has(cat)) {
                errors.push(`invalid category: "${cat}"`);
              } else {
                categories.push(cat as ResidentCategory);
              }
            }
          }

          if (errors.length > 0) {
            skippedRows.push({ row: rowNumber, errors });
            continue;
          }

          // Look up household by number within tenant
          const household = await householdRepo.findFirst(tenantId, {
            where: { householdNumber: householdNumber!.trim() },
          });

          if (!household) {
            skippedRows.push({
              row: rowNumber,
              errors: [
                `Household with number "${householdNumber!.trim()}" not found`,
              ],
            });
            continue;
          }

          // Create resident
          try {
            await residentRepo.create(tenantId, {
              data: {
                householdId: household.id,
                name: name!.trim(),
                nik: nik!.trim(),
                dateOfBirth: parsedDate!,
                gender: gender!.trim(),
                phone: phone?.trim() || null,
                status: status!.trim(),
                categories,
                emergencyContactName:
                  emergencyContactName?.trim() || null,
                emergencyContactPhone:
                  emergencyContactPhone?.trim() || null,
                emergencyContactRelationship:
                  emergencyContactRelationship?.trim() || null,
              },
            });
            createdCount++;
          } catch (createError) {
            skippedRows.push({
              row: rowNumber,
              errors: [
                `Failed to create resident: ${createError instanceof Error ? createError.message : 'Unknown error'}`,
              ],
            });
          }
        }

        return ok({ createdCount, skippedRows });
      } catch (error) {
        return fail(
          technicalError(
            'RESIDENT_IMPORT_CSV_FAILED',
            'Failed to import residents from CSV',
            { cause: error },
          ),
        );
      }
    },
  };
};
