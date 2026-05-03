/**
 * InvitationToken — Represents a time-limited invitation for user registration.
 *
 * Created by Ketua_RT or Pengurus to invite new users into a tenant.
 *
 * @see Requirements 3.3, 4.6
 */

import type { UserRole } from '@core/protocols';

export interface InvitationToken {
  readonly id: string;
  readonly tenantId: string;
  readonly email: string;
  readonly role: UserRole;
  readonly token: string;
  readonly expiresAt: Date;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly usedAt: Date | null;
}
