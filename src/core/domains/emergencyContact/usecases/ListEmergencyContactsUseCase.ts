/**
 * ListEmergencyContactsUseCase — Returns the emergency contacts for the
 * authenticated user's tenant (RT). Available to any authenticated member of
 * the tenant, since residents need to view and call these numbers.
 *
 * @see Requirements 6.2, 6.5 (AuthorizationContext migration)
 */

import type { AuthContextCompat } from '@core/domains/authorization/types';
import type { DomainResult } from '@core/utils';
import { fail } from '@core/utils';
import type { EmergencyContactRepository } from '../repositories';
import type { EmergencyContact } from '../entities';

export interface ListEmergencyContactsUseCase {
  execute(params: {
    authContext: AuthContextCompat;
  }): Promise<DomainResult<EmergencyContact[]>>;
}

export const ListEmergencyContactsUseCaseImpl = ({
  emergencyContactRepository,
}: {
  emergencyContactRepository: EmergencyContactRepository;
}): ListEmergencyContactsUseCase => ({
  execute: async ({ authContext }) => {
    const result = await emergencyContactRepository.listByTenant(
      authContext.tenantId,
    );
    if (!result.success) {
      return fail(result.error);
    }
    return result;
  },
});
