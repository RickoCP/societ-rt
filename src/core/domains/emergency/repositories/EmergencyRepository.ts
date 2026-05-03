/**
 * EmergencyRepository — Core repository interface for emergency alert
 * operations.
 *
 * All methods return DomainResult to keep success/error paths explicit.
 * Infrastructure layer provides the concrete implementation.
 *
 * @see Requirements 10.1, 10.2, 10.3, 10.4
 */

import type { DomainResult } from '@core/utils';
import type {
  EmergencyAlert,
  CreateEmergencyAlertInput,
} from '../entities';

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface EmergencyRepository {
  /** Create a new emergency alert within a tenant. */
  createAlert(
    tenantId: string,
    userId: string,
    data: CreateEmergencyAlertInput,
  ): Promise<DomainResult<EmergencyAlert>>;

  /** Update the status of an existing emergency alert. */
  updateStatus(
    tenantId: string,
    alertId: string,
    status: EmergencyAlert['status'],
  ): Promise<DomainResult<EmergencyAlert>>;

  /** Find all active emergency alerts within a tenant. */
  findActiveByTenant(
    tenantId: string,
  ): Promise<DomainResult<EmergencyAlert[]>>;
}
