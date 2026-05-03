/**
 * ConsentRecord — Domain entity for user consent tracking.
 *
 * @see Requirements 27.3, 27.4
 */

export interface ConsentRecord {
  readonly userId: string;
  readonly tenantId: string;
  readonly consentVersion: string;
  readonly consentTimestamp: Date;
}
