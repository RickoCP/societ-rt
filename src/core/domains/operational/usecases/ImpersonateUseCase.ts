/**
 * ImpersonateUseCase — Creates a time-limited impersonation session.
 *
 * Max 60 minutes. Tags audit with both impersonator and impersonated IDs.
 *
 * @see Requirements 30.3, 30.4
 */

import type { DomainResult } from '@core/utils';
import { ok, fail, businessError } from '@core/utils';
import type { AuditQueueProtocol } from '@core/protocols';
import type { ImpersonationSession } from '../entities';
import type { OperationalRepository } from '../repositories/OperationalRepository';

const MAX_IMPERSONATION_MINUTES = 60;

export interface ImpersonateInput {
  readonly impersonatorId: string;
  readonly impersonatedUserId: string;
  readonly tenantId: string;
  readonly durationMinutes?: number;
}

export interface ImpersonateUseCase {
  execute(input: ImpersonateInput): Promise<DomainResult<ImpersonationSession>>;
}

function generateToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 64; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

export const ImpersonateUseCaseImpl = ({
  operationalRepository,
  auditQueueProtocol,
}: {
  operationalRepository: OperationalRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): ImpersonateUseCase => ({
  execute: async (input) => {
    const durationMinutes = input.durationMinutes ?? MAX_IMPERSONATION_MINUTES;

    if (durationMinutes > MAX_IMPERSONATION_MINUTES || durationMinutes <= 0) {
      return fail(
        businessError(
          'IMPERSONATION_INVALID_DURATION',
          `Impersonation duration must be between 1 and ${MAX_IMPERSONATION_MINUTES} minutes`,
        ),
      );
    }

    if (input.impersonatorId === input.impersonatedUserId) {
      return fail(
        businessError(
          'IMPERSONATION_SELF_NOT_ALLOWED',
          'Cannot impersonate yourself',
        ),
      );
    }

    const token = generateToken();
    const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);

    const result = await operationalRepository.createImpersonationSession({
      impersonatorId: input.impersonatorId,
      impersonatedUserId: input.impersonatedUserId,
      tenantId: input.tenantId,
      token,
      expiresAt,
    });

    if (result.success) {
      await auditQueueProtocol.enqueueAudit({
        tenantId: input.tenantId,
        actorUserId: input.impersonatorId,
        actionType: 'impersonation_started',
        resourceType: 'user',
        resourceId: input.impersonatedUserId,
        impersonatorId: input.impersonatorId,
        details: {
          impersonatedUserId: input.impersonatedUserId,
          durationMinutes,
          sessionId: result.data.id,
        },
      });
    }

    return result.success ? ok(result.data) : result;
  },
});
