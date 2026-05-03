/**
 * User — Domain entity representing an authenticated user within a tenant.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 3.1, 4.1
 */

import type { UserRole } from '@core/protocols';

export interface User {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly role: UserRole;
  readonly status: 'active' | 'locked' | 'inactive';
  readonly failedLoginAttempts: number;
  readonly lockedUntil: Date | null;
  readonly consentTimestamp: Date | null;
  readonly consentVersion: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}
