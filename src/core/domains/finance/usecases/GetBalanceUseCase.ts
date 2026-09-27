/**
 * GetBalanceUseCase — Retrieves the current running balance for a tenant.
 *
 * Logic:
 * 1. Call financeRepository.getBalance(tenantId)
 * 2. Return the balance
 *
 * @see Requirements 7.2, 7.3
 */

import type { AuthContextCompat } from '@core/domains/authorization/types';
import { getTenantId } from '@core/domains/authorization/types';
import type { DomainResult } from '@core/utils';
import type { FinanceRepository } from '../repositories/FinanceRepository';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface GetBalanceUseCase {
  execute(params: {
    authContext: AuthContextCompat;
  }): Promise<DomainResult<number>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const GetBalanceUseCaseImpl = ({
  financeRepository,
}: {
  financeRepository: FinanceRepository;
}): GetBalanceUseCase => ({
  execute: async ({ authContext }) => {
    // 1. Get balance via repository
    return financeRepository.getBalance(getTenantId(authContext));
  },
});
