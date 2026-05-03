/**
 * OperationalRepository — Core interface for operational management.
 *
 * @see Requirements 30.3, 30.4, 30.5
 */

import type { DomainResult } from '@core/utils';
import type { ImpersonationSession, TenantHealthMetrics } from '../entities';

export interface CreateImpersonationInput {
  readonly impersonatorId: string;
  readonly impersonatedUserId: string;
  readonly tenantId: string;
  readonly token: string;
  readonly expiresAt: Date;
}

export interface OperationalRepository {
  createImpersonationSession(
    input: CreateImpersonationInput,
  ): Promise<DomainResult<ImpersonationSession>>;

  endImpersonationSession(
    sessionId: string,
  ): Promise<DomainResult<ImpersonationSession>>;

  getTenantHealth(
    tenantId: string,
  ): Promise<DomainResult<TenantHealthMetrics>>;
}
