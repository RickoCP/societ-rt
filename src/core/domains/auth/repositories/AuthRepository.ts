/**
 * AuthRepository — Core repository interface for authentication operations.
 *
 * All methods return DomainResult to keep success/error paths explicit.
 * Infrastructure layer provides the concrete implementation.
 *
 * @see Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.7
 */

import type { AuthContext } from '@core/protocols';
import type { UserRole } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import type { InvitationToken, LoginResult, User } from '../entities';

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface RegisterInput {
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly invitationToken: string;
  readonly consentVersion: string;
}

export interface CreateInvitationInput {
  readonly email: string;
  readonly role: UserRole;
  readonly createdBy: string;
}

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface AuthRepository {
  login(
    tenantId: string,
    email: string,
    password: string,
  ): Promise<DomainResult<LoginResult>>;

  register(
    tenantId: string,
    data: RegisterInput,
  ): Promise<DomainResult<User>>;

  logout(userId: string): Promise<DomainResult<void>>;

  validateToken(token: string): Promise<DomainResult<AuthContext>>;

  createInvitation(
    tenantId: string,
    data: CreateInvitationInput,
  ): Promise<DomainResult<InvitationToken>>;

  validateInvitation(token: string): Promise<DomainResult<InvitationToken>>;

  findByEmail(
    tenantId: string,
    email: string,
  ): Promise<DomainResult<User | null>>;

  findById(
    tenantId: string,
    userId: string,
  ): Promise<DomainResult<User | null>>;

  updateFailedAttempts(
    tenantId: string,
    userId: string,
    attempts: number,
    lockedUntil: Date | null,
  ): Promise<DomainResult<void>>;

  resetFailedAttempts(
    tenantId: string,
    userId: string,
  ): Promise<DomainResult<void>>;
}
