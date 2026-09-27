/**
 * RecordTransactionUseCase — Records a new income or expense transaction
 * within a tenant's community treasury (uang kas).
 *
 * Logic:
 * 1. Validate amount > 0 (fail with financeInvalidAmount())
 * 2. Record transaction via financeRepository
 * 3. Enqueue audit log (fire-and-forget)
 * 4. Return ok(transaction)
 *
 * @see Requirements 7.1, 7.2, 7.3, 7.9
 */

import type { AuditQueueProtocol } from '@core/protocols';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import { getTenantId, getUserId } from '@core/domains/authorization/types';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { FinanceRepository } from '../repositories/FinanceRepository';
import type { CreateTransactionInput, FinancialTransaction } from '../entities';
import { financeInvalidAmount } from '../errors/financeErrors';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface RecordTransactionUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    data: CreateTransactionInput;
  }): Promise<DomainResult<FinancialTransaction>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const RecordTransactionUseCaseImpl = ({
  financeRepository,
  auditQueueProtocol,
}: {
  financeRepository: FinanceRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): RecordTransactionUseCase => ({
  execute: async ({ authContext, data }) => {
    // 1. Validate amount > 0
    if (data.amount <= 0) {
      return fail(financeInvalidAmount());
    }

    const tenantId = getTenantId(authContext);
    const userId = getUserId(authContext);

    // 2. Record transaction via repository
    const result = await financeRepository.recordTransaction(
      tenantId,
      data,
      userId,
    );

    if (!result.success) {
      return fail(result.error);
    }

    const transaction = result.data;

    // 3. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId,
        actorUserId: userId,
        actionType: 'transaction_recorded',
        resourceType: 'financial_transaction',
        resourceId: transaction.id,
        details: {
          type: transaction.type,
          amount: transaction.amount,
          category: transaction.category,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 4. Return success
    return ok(transaction);
  },
});
