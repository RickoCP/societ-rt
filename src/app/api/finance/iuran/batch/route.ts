/**
 * GET /api/finance/iuran/batch?year=2025 — Get all iuran statuses for a year.
 * POST /api/finance/iuran/batch — Toggle iuran payment status for a household/month.
 *
 * BFF pattern: withPermission → validate input → execute mutation/query → return safe response.
 *
 * @see Requirements 7.4, 7.5
 * @see Multi-Tenant Integration Cutover — Task 4.4 (Cleanup)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { withPermission } from '@infrastructure/middleware/authorization';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { PrismaClient } from '@/generated/prisma/client';

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface IuranStatusData {
  data: Array<{
    householdId: string;
    householdNumber: string;
    address: string;
    block: string;
    headName: string;
    months: Record<string, string>;
  }>;
  year: string;
}

interface IuranToggleData {
  success: boolean;
  householdId: string;
  month: string;
  paid: boolean;
}

interface ErrorResponse {
  code: string;
  message: string;
  correlationId: string;
}

type IuranStatusResponse = IuranStatusData | ErrorResponse;
type IuranToggleResponse = IuranToggleData | ErrorResponse;

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const toggleSchema = z.object({
  householdId: z.string().min(1),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  paid: z.boolean(),
  amount: z.number().positive().optional(),
  householdNumber: z.string().optional(),
});

// ---------------------------------------------------------------------------
// GET handler — Get all iuran statuses for a year with household info
// ---------------------------------------------------------------------------

const handleGetIuranStatuses: AuthorizedRouteHandler<IuranStatusResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<IuranStatusResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const year = request.nextUrl.searchParams.get('year') ?? new Date().getFullYear().toString();

  try {
    const prisma = container.resolve<PrismaClient>('prismaClient');
    const tenantId = authContext.tenantId;

    // Get all households with their first resident (head)
    const households = await prisma.household.findMany({
      where: { tenantId },
      orderBy: { householdNumber: 'asc' },
      select: {
        id: true,
        householdNumber: true,
        address: true,
        block: true,
        residents: {
          take: 1,
          orderBy: { createdAt: 'asc' },
          select: { name: true },
        },
      },
    });

    // Get all iuran statuses for this tenant and year
    const iuranStatuses = await prisma.iuranStatus.findMany({
      where: {
        tenantId,
        month: { startsWith: year },
      },
      select: {
        householdId: true,
        month: true,
        status: true,
      },
    });

    // Build a map: householdId -> { month -> status }
    const statusMap: Record<string, Record<string, string>> = {};
    for (const s of iuranStatuses) {
      const householdStatuses = (statusMap[s.householdId] ??= {});
      householdStatuses[s.month] = s.status;
    }

    // Build response
    const data = households.map(h => ({
      householdId: h.id,
      householdNumber: h.householdNumber,
      address: h.address,
      block: h.block ?? '',
      headName: h.residents[0]?.name ?? '-',
      months: statusMap[h.id] ?? {},
    }));

    return NextResponse.json({ data, year });
  } catch {
    return NextResponse.json(
      { code: 'COMMON_UNEXPECTED_ERROR', message: 'Internal server error', correlationId },
      { status: 500 },
    );
  }
};

// ---------------------------------------------------------------------------
// POST handler — Toggle iuran status for a household/month
// ---------------------------------------------------------------------------

const handleToggleIuranStatus: AuthorizedRouteHandler<IuranToggleResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<IuranToggleResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // Parse and validate input
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Invalid JSON body', correlationId },
      { status: 400 },
    );
  }

  const validation = toggleSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Invalid input', correlationId },
      { status: 400 },
    );
  }

  const { householdId, month, paid, amount, householdNumber } = validation.data;
  const tenantId = authContext.tenantId;

  try {
    const prisma = container.resolve<PrismaClient>('prismaClient');

    if (paid && amount && amount > 0) {
      // Ambil data household + kepala keluarga untuk label transaksi yang jelas.
      // Prioritaskan resident berkategori 'kepala_keluarga'; jika tidak ada,
      // pakai resident pertama sebagai fallback.
      const household = await prisma.household.findFirst({
        where: { id: householdId, tenantId },
        select: {
          householdNumber: true,
          address: true,
          residents: {
            orderBy: { createdAt: 'asc' },
            select: { name: true, categories: true },
          },
        },
      });

      const residents: Array<{ name: string; categories: string[] }> =
        household?.residents ?? [];
      const head =
        residents.find(r => r.categories.includes('kepala_keluarga')) ??
        residents[0];
      const headName = head?.name ?? null;
      const houseNumber =
        household?.householdNumber ?? householdNumber ?? householdId.slice(0, 8);

      // Contoh: "Iuran 2026-01 - Budi Santoso (No. 3276010001010001)"
      const description = headName
        ? `Iuran ${month} - ${headName} (No. ${houseNumber})`
        : `Iuran ${month} - No. ${houseNumber}`;

      // Record income transaction for iuran payment
      const tx = await prisma.financialTransaction.create({
        data: {
          tenantId,
          type: 'income',
          amount,
          description,
          category: 'iuran',
          date: new Date(),
          createdBy: authContext.userId,
        },
      });

      // Upsert iuran status with transaction reference
      await prisma.iuranStatus.upsert({
        where: {
          tenantId_householdId_month: { tenantId, householdId, month },
        },
        update: {
          status: 'paid',
          paidAt: new Date(),
          transactionId: tx.id,
        },
        create: {
          tenantId,
          householdId,
          month,
          status: 'paid',
          paidAt: new Date(),
          transactionId: tx.id,
        },
      });
    } else {
      // Uncheck = unpaid — also delete associated transaction if exists
      const existing = await prisma.iuranStatus.findUnique({
        where: {
          tenantId_householdId_month: { tenantId, householdId, month },
        },
        select: { transactionId: true },
      });

      // Delete the linked transaction if it exists
      if (existing?.transactionId) {
        await prisma.financialTransaction.delete({
          where: { id: existing.transactionId },
        }).catch(() => { /* ignore if already deleted */ });
      }

      await prisma.iuranStatus.upsert({
        where: {
          tenantId_householdId_month: { tenantId, householdId, month },
        },
        update: {
          status: 'unpaid',
          paidAt: null,
          transactionId: null,
        },
        create: {
          tenantId,
          householdId,
          month,
          status: 'unpaid',
          paidAt: null,
        },
      });
    }

    return NextResponse.json({ success: true, householdId, month, paid });
  } catch {
    return NextResponse.json(
      { code: 'COMMON_UNEXPECTED_ERROR', message: 'Internal server error', correlationId },
      { status: 500 },
    );
  }
};

// ---------------------------------------------------------------------------
// Export wrapped handlers with permission enforcement
// ---------------------------------------------------------------------------

export const GET = withPermission(
  { permissions: ['finance:read'] },
  handleGetIuranStatuses,
);

export const POST = withPermission(
  { permissions: ['finance:write'] },
  handleToggleIuranStatus,
);
