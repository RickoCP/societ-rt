/**
 * Session — Represents an active user session derived from a JWT token.
 *
 * LoginResult bundles the authenticated user data with token metadata
 * so the BFF layer can set the HTTP-only cookie correctly.
 *
 * @see Requirements 3.1, 3.7
 */

import type { UserRole } from '@core/protocols';

export interface Session {
  readonly userId: string;
  readonly tenantId: string;
  readonly role: UserRole;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

export interface LoginResult {
  readonly userId: string;
  readonly tenantId: string;
  readonly name: string;
  readonly email: string;
  readonly role: UserRole;
  readonly token: string;
  readonly expiresAt: Date;
}
