/**
 * ExportPersonalDataUseCase — Exports a user's personal data.
 *
 * @see Requirements 27.5
 */

import type { DomainResult } from '@core/utils';
import type { PersonalDataExport, PrivacyRepository } from '../repositories/PrivacyRepository';

export interface ExportPersonalDataUseCase {
  execute(params: {
    tenantId: string;
    userId: string;
  }): Promise<DomainResult<PersonalDataExport>>;
}

export const ExportPersonalDataUseCaseImpl = ({
  privacyRepository,
}: {
  privacyRepository: PrivacyRepository;
}): ExportPersonalDataUseCase => ({
  execute: async ({ tenantId, userId }) => {
    return privacyRepository.exportPersonalData(tenantId, userId);
  },
});
