/**
 * RbacRepository — Core repository interface for RBAC operations.
 *
 * All methods return DomainResult to keep success/error paths explicit.
 * Infrastructure layer provides the concrete implementation.
 *
 * @see Requirements 4.1, 4.2, 4.3
 */

import type { UserRole } from '@core/protocols';
import type { DomainResult } from '@core/utils';

export interface RbacRepository {
  /**
   * Assign a new role to a user within a tenant.
   */
  assignRole(
    tenantId: string,
    targetUserId: string,
    newRole: UserRole,
  ): Promise<DomainResult<void>>;

  /**
   * Retrieve the current role of a user within a tenant.
   */
  getUserRole(
    tenantId: string,
    userId: string,
  ): Promise<DomainResult<UserRole>>;
}
