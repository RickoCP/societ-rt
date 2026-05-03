/**
 * TenantRepository — Core repository interface for tenant operations.
 *
 * All methods return DomainResult to keep success/error paths explicit.
 * Infrastructure layer provides the concrete implementation.
 *
 * @see Requirements 1.3, 1.4, 1.5, 2.1, 2.5
 */

import type { DomainResult } from '@core/utils';
import type { CreateTenantInput, Tenant } from '../entities';

export interface TenantRepository {
  /** Register a new tenant. */
  create(data: CreateTenantInput): Promise<DomainResult<Tenant>>;

  /** Find a tenant by its unique id. */
  findById(tenantId: string): Promise<DomainResult<Tenant | null>>;

  /** Find a tenant by its subdomain slug. */
  findBySubdomain(subdomain: string): Promise<DomainResult<Tenant | null>>;

  /** Partially update a tenant record. */
  update(
    tenantId: string,
    data: Partial<Tenant>,
  ): Promise<DomainResult<Tenant>>;

  /** Set tenant status to suspended. */
  suspend(tenantId: string): Promise<DomainResult<void>>;

  /** Set tenant status back to active. */
  reactivate(tenantId: string): Promise<DomainResult<void>>;

  /**
   * Check whether a tenant with the given subdomain or the same
   * RT/RW number within the same region already exists.
   *
   * Returns `true` when a duplicate is found.
   */
  checkDuplicate(
    subdomain: string,
    rtRwNumber: string,
    region: string,
  ): Promise<DomainResult<boolean>>;
}
