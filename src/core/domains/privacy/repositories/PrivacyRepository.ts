/**
 * PrivacyRepository — Core interface for privacy operations.
 *
 * @see Requirements 27.1, 27.2, 27.3, 27.4, 27.5, 27.6
 */

import type { DomainResult } from '@core/utils';
import type { ConsentRecord } from '../entities';

export interface PersonalDataExport {
  readonly userId: string;
  readonly tenantId: string;
  readonly data: Record<string, unknown>;
  readonly exportedAt: Date;
}

export interface PrivacyRepository {
  maskNik(nik: string): string;
  maskPhone(phone: string): string;

  recordConsent(
    tenantId: string,
    userId: string,
    version: string,
  ): Promise<DomainResult<ConsentRecord>>;

  exportPersonalData(
    tenantId: string,
    userId: string,
  ): Promise<DomainResult<PersonalDataExport>>;

  requestDeletion(
    tenantId: string,
    userId: string,
  ): Promise<DomainResult<void>>;
}
