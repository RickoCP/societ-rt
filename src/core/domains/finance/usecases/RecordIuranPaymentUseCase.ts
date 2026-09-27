/**
 * RecordIuranPaymentUseCase — Records an iuran (monthly dues) payment
 * for a household, linking it to a financial transaction.
 *
 * Logic:
 * 1. Call financeRepository.recordIuranPayment
 * 2. Enqueue audit log (fire-and-forget)
 * 3. Return ok(void)
 *
 * @see Requirements 7.4, 7.5
 */

import type { AuditQueueProtocol } from '@core/protocols';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import { getTenantId, getUserId } from '@core/domains/authorization/types';
import type { DomainResult } from '@core/utils';
import { fail } from '@core/utils';
import type { FinanceRepository } from '../repositories/FinanceRepository';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface RecordIuranPaymentUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    householdId: string;
    month: string;
    transactionId: string;
  }): Promise<DomainResult<void>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const RecordIuranPaymentUseCaseImpl = ({
  financeRepository,
  auditQueueProtocol,
}: {
  financeRepository: FinanceRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): RecordIuranPaymentUseCase => ({
  execute: async ({ authContext, householdId, month, transactionId }) => {
    const tenantId = getTenantId(authContext);
    const userId = getUserId(authContext);
    
    // 1. Record iuran payment via repository
    const result = await financeRepository.recordIuranPayment(
      tenantId,
      householdId,
      month,
      transactionId,
    );

    if (!result.success) {
      return fail(result.error);
    }

    // 2. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId,
        actorUserId: userId,
        actionType: 'iuran_payment_recorded',
        resourceType: 'iuran_status',
        resourceId: householdId,
        details: { householdId, month, transactionId },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 3. Return success
    return result;
  },
});
