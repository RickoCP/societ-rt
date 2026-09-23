/**
 * EmergencyContactRepository — Core repository interface for per-tenant
 * emergency contact persistence. Infrastructure provides the Prisma impl.
 */

import type { DomainResult } from '@core/utils';
import type {
  EmergencyContact,
  CreateEmergencyContactInput,
  UpdateEmergencyContactInput,
} from '../entities';

export interface EmergencyContactRepository {
  /** List all emergency contacts for a tenant, ordered by sortOrder then label. */
  listByTenant(tenantId: string): Promise<DomainResult<EmergencyContact[]>>;

  /** Find one contact by id, tenant-scoped. */
  findById(
    tenantId: string,
    id: string,
  ): Promise<DomainResult<EmergencyContact | null>>;

  /** Create a new contact for a tenant. */
  create(
    tenantId: string,
    data: CreateEmergencyContactInput,
  ): Promise<DomainResult<EmergencyContact>>;

  /** Update an existing contact, tenant-scoped. */
  update(
    tenantId: string,
    id: string,
    data: UpdateEmergencyContactInput,
  ): Promise<DomainResult<EmergencyContact>>;

  /** Delete a contact, tenant-scoped. */
  remove(tenantId: string, id: string): Promise<DomainResult<void>>;
}
