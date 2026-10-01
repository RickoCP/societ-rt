/**
 * FinanceRepositoryImpl — Infrastructure implementation of FinanceRepository.
 *
 * Uses TenantScopedRepository for tenant-scoped queries on FinancialTransaction
 * and direct Prisma queries for aggregate operations (balance, report).
 *
 * Prisma stores `amount` as Decimal — all domain conversions use `Number()`.
 *
 * @see Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.7, 7.9
 */

import type { PrismaClient } from '@prisma/client';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError, notFoundError } from '@core/utils';
import type { FinanceRepository } from '@core/domains/finance/repositories/FinanceRepository';
import type {
  CreateTransactionInput,
  DateRange,
  FinancialReport,
  FinancialTransaction,
  IuranStatus,
} from '@core/domains/finance/entities';
import {
  createTenantScopedRepository,
  type TenantScopedRepository,
} from '@infrastructure/repositories/TenantScopedRepository';

// ---------------------------------------------------------------------------
// Prisma → Domain mappers
// ---------------------------------------------------------------------------

interface PrismaTransaction {
  id: string;
  tenantId: string;
  type: string;
  amount: unknown; // Prisma Decimal
  description: string;
  category: string;
  date: Date;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

function mapPrismaTransactionToDomain(
  p: PrismaTransaction,
): FinancialTransaction {
  return {
    id: p.id,
    tenantId: p.tenantId,
    type: p.type as FinancialTransaction['type'],
    amount: Number(p.amount),
    description: p.description,
    category: p.category,
    date: p.date,
    createdBy: p.createdBy,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    deletedAt: p.deletedAt,
  };
}

interface PrismaIuranStatus {
  id: string;
  tenantId: string;
  householdId: string;
  month: string;
  status: string;
  paidAt: Date | null;
  transactionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function mapPrismaIuranStatusToDomain(p: PrismaIuranStatus): IuranStatus {
  return {
    id: p.id,
    tenantId: p.tenantId,
    householdId: p.householdId,
    month: p.month,
    status: p.status as IuranStatus['status'],
    paidAt: p.paidAt,
    transactionId: p.transactionId,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Aggregate helper types
// ---------------------------------------------------------------------------

interface AggregateResult {
  _sum: { amount: unknown } | null;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const FinanceRepositoryImpl = ({
  prismaClient,
}: {
  prismaClient: PrismaClient;
}): FinanceRepository => {
  const transactionRepo: TenantScopedRepository<PrismaTransaction> =
    createTenantScopedRepository(
      prismaClient.financialTransaction as unknown as Parameters<
        typeof createTenantScopedRepository
      >[0],
    );

  const iuranRepo: TenantScopedRepository<PrismaIuranStatus> =
    createTenantScopedRepository(
      prismaClient.iuranStatus as unknown as Parameters<
        typeof createTenantScopedRepository
      >[0],
    );

  return {
    // -----------------------------------------------------------------------
    // recordTransaction
    // -----------------------------------------------------------------------
    async recordTransaction(
      tenantId: string,
      data: CreateTransactionInput,
      createdBy: string,
    ): Promise<DomainResult<FinancialTransaction>> {
      try {
        const record = await transactionRepo.create(tenantId, {
          data: {
            type: data.type,
            amount: data.amount,
            description: data.description,
            category: data.category,
            date: data.date,
            createdBy,
          },
        });

        return ok(mapPrismaTransactionToDomain(record));
      } catch (error) {
        return fail(
          technicalError(
            'FINANCE_TRANSACTION_CREATE_FAILED',
            'Failed to record financial transaction',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // getBalance
    // -----------------------------------------------------------------------
    async getBalance(tenantId: string): Promise<DomainResult<number>> {
      try {
        const [incomeAgg, expenseAgg] = await Promise.all([
          prismaClient.financialTransaction.aggregate({
            where: { tenantId, type: 'income', deletedAt: null },
            _sum: { amount: true },
          }) as Promise<AggregateResult>,
          prismaClient.financialTransaction.aggregate({
            where: { tenantId, type: 'expense', deletedAt: null },
            _sum: { amount: true },
          }) as Promise<AggregateResult>,
        ]);

        const totalIncome = Number(incomeAgg._sum?.amount ?? 0);
        const totalExpense = Number(expenseAgg._sum?.amount ?? 0);
        const balance = totalIncome - totalExpense;

        return ok(balance);
      } catch (error) {
        return fail(
          technicalError(
            'FINANCE_BALANCE_FAILED',
            'Failed to calculate balance',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // getIuranStatus
    // -----------------------------------------------------------------------
    async getIuranStatus(
      tenantId: string,
      householdId: string,
      month: string,
    ): Promise<DomainResult<IuranStatus>> {
      try {
        const record = await iuranRepo.findFirst(tenantId, {
          where: { householdId, month },
        });

        if (!record) {
          return fail(
            notFoundError(
              'FINANCE_IURAN_NOT_FOUND',
              `Iuran status not found for household ${householdId} month ${month}`,
            ),
          );
        }

        return ok(mapPrismaIuranStatusToDomain(record));
      } catch (error) {
        return fail(
          technicalError(
            'FINANCE_IURAN_STATUS_FAILED',
            'Failed to get iuran status',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // recordIuranPayment
    // -----------------------------------------------------------------------
    async recordIuranPayment(
      tenantId: string,
      householdId: string,
      month: string,
      transactionId: string,
    ): Promise<DomainResult<void>> {
      try {
        await prismaClient.iuranStatus.upsert({
          where: {
            tenantId_householdId_month: {
              tenantId,
              householdId,
              month,
            },
          },
          update: {
            status: 'paid',
            paidAt: new Date(),
            transactionId,
          },
          create: {
            tenantId,
            householdId,
            month,
            status: 'paid',
            paidAt: new Date(),
            transactionId,
          },
        });

        return ok(undefined);
      } catch (error) {
        return fail(
          technicalError(
            'FINANCE_IURAN_PAYMENT_FAILED',
            'Failed to record iuran payment',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // getReport
    // -----------------------------------------------------------------------
    async getReport(
      tenantId: string,
      dateRange: DateRange,
    ): Promise<DomainResult<FinancialReport>> {
      try {
        // 1. Fetch transactions within the date range
        const transactions = await transactionRepo.findMany(tenantId, {
          where: {
            deletedAt: null,
            date: {
              gte: dateRange.start,
              lte: dateRange.end,
            },
          },
          orderBy: { date: 'asc' },
        });

        // 2. Calculate categorized totals
        const categorizedTotals: Record<string, number> = {};
        for (const tx of transactions) {
          const amount = Number(tx.amount);
          const key = `${tx.type}:${tx.category}`;
          categorizedTotals[key] = (categorizedTotals[key] ?? 0) + amount;
        }

        // 3. Calculate opening balance (sum of all transactions before start date)
        const [openingIncomeAgg, openingExpenseAgg] = await Promise.all([
          prismaClient.financialTransaction.aggregate({
            where: {
              tenantId,
              type: 'income',
              deletedAt: null,
              date: { lt: dateRange.start },
            },
            _sum: { amount: true },
          }) as Promise<AggregateResult>,
          prismaClient.financialTransaction.aggregate({
            where: {
              tenantId,
              type: 'expense',
              deletedAt: null,
              date: { lt: dateRange.start },
            },
            _sum: { amount: true },
          }) as Promise<AggregateResult>,
        ]);

        const openingIncome = Number(openingIncomeAgg._sum?.amount ?? 0);
        const openingExpense = Number(openingExpenseAgg._sum?.amount ?? 0);
        const openingBalance = openingIncome - openingExpense;

        // 4. Calculate closing balance = opening + net transactions in range
        let netInRange = 0;
        for (const tx of transactions) {
          const amount = Number(tx.amount);
          if (tx.type === 'income') {
            netInRange += amount;
          } else {
            netInRange -= amount;
          }
        }
        const closingBalance = openingBalance + netInRange;

        // 5. Map transactions to domain entities
        const domainTransactions = transactions.map(
          mapPrismaTransactionToDomain,
        );

        return ok({
          transactions: domainTransactions,
          categorizedTotals,
          openingBalance,
          closingBalance,
          dateRange,
        });
      } catch (error) {
        return fail(
          technicalError(
            'FINANCE_REPORT_FAILED',
            'Failed to generate financial report',
            { cause: error },
          ),
        );
      }
    },
  };
};
