/**
 * AuthRepositoryImpl — Infrastructure implementation of AuthRepository.
 *
 * Uses Prisma via TenantScopedRepository for tenant-isolated queries.
 * All methods return DomainResult<T> and wrap Prisma errors in
 * technical/unexpected AppError types.
 *
 * @see Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.7
 */

import crypto from 'crypto';
import type { PrismaClient } from '@/generated/prisma/client';
import type { AuthContext } from '@core/protocols';
import { UserRole } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError, unexpectedError } from '@core/utils';
import type {
  AuthRepository,
  RegisterInput,
  CreateInvitationInput,
} from '@core/domains/auth/repositories/AuthRepository';
import type {
  InvitationToken,
  LoginResult,
  User,
} from '@core/domains/auth/entities';
import {
  authInvalidCredentials,
  authTokenInvalid,
} from '@core/domains/auth/errors/authErrors';
import { signJwt, verifyJwt } from '@infrastructure/utils/jwt';
import { hashPassword, comparePassword } from '@infrastructure/utils/password';
import {
  createTenantScopedRepository,
  type TenantScopedRepository,
} from '@infrastructure/repositories/TenantScopedRepository';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JWT_EXPIRY_SECONDS = 24 * 60 * 60; // 24 hours
const INVITATION_EXPIRY_MS = 72 * 60 * 60 * 1000; // 72 hours

// ---------------------------------------------------------------------------
// Prisma → Domain mappers
// ---------------------------------------------------------------------------

interface PrismaUser {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  passwordHash: string;
  role: string;
  status: string;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  consentTimestamp: Date | null;
  consentVersion: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface PrismaInvitationToken {
  id: string;
  tenantId: string;
  email: string;
  role: string;
  token: string;
  expiresAt: Date;
  createdBy: string;
  createdAt: Date;
  usedAt: Date | null;
}

function mapPrismaUserToDomain(prismaUser: PrismaUser): User {
  return {
    id: prismaUser.id,
    tenantId: prismaUser.tenantId,
    name: prismaUser.name,
    email: prismaUser.email,
    passwordHash: prismaUser.passwordHash,
    role: prismaUser.role as UserRole,
    status: prismaUser.status as User['status'],
    failedLoginAttempts: prismaUser.failedLoginAttempts,
    lockedUntil: prismaUser.lockedUntil,
    consentTimestamp: prismaUser.consentTimestamp,
    consentVersion: prismaUser.consentVersion,
    createdAt: prismaUser.createdAt,
    updatedAt: prismaUser.updatedAt,
    deletedAt: prismaUser.deletedAt,
  };
}

function mapPrismaInvitationToDomain(
  prismaInvitation: PrismaInvitationToken,
): InvitationToken {
  return {
    id: prismaInvitation.id,
    tenantId: prismaInvitation.tenantId,
    email: prismaInvitation.email,
    role: prismaInvitation.role as UserRole,
    token: prismaInvitation.token,
    expiresAt: prismaInvitation.expiresAt,
    createdBy: prismaInvitation.createdBy,
    createdAt: prismaInvitation.createdAt,
    usedAt: prismaInvitation.usedAt,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const AuthRepositoryImpl = ({
  prismaClient,
}: {
  prismaClient: PrismaClient;
}): AuthRepository => {
  const userRepo: TenantScopedRepository<PrismaUser> =
    createTenantScopedRepository(
      prismaClient.user as unknown as Parameters<
        typeof createTenantScopedRepository
      >[0],
    );

  const invitationRepo: TenantScopedRepository<PrismaInvitationToken> =
    createTenantScopedRepository(
      prismaClient.invitationToken as unknown as Parameters<
        typeof createTenantScopedRepository
      >[0],
    );

  return {
    // -----------------------------------------------------------------------
    // login
    // -----------------------------------------------------------------------
    async login(
      tenantId: string,
      email: string,
      password: string,
    ): Promise<DomainResult<LoginResult>> {
      try {
        const user = await userRepo.findFirst(tenantId, {
          where: { email, deletedAt: null },
        });

        if (!user) {
          return fail(authInvalidCredentials());
        }

        const passwordMatch = await comparePassword(
          password,
          user.passwordHash,
        );
        if (!passwordMatch) {
          return fail(authInvalidCredentials());
        }

        const token = signJwt(
          {
            userId: user.id,
            tenantId: user.tenantId,
            role: user.role as UserRole,
          },
          JWT_EXPIRY_SECONDS,
        );

        const expiresAt = new Date(Date.now() + JWT_EXPIRY_SECONDS * 1000);

        const loginResult: LoginResult = {
          userId: user.id,
          tenantId: user.tenantId,
          name: user.name,
          email: user.email,
          role: user.role as UserRole,
          token,
          expiresAt,
        };

        return ok(loginResult);
      } catch (error) {
        return fail(
          technicalError('AUTH_LOGIN_FAILED', 'Failed to process login', {
            cause: error,
          }),
        );
      }
    },

    // -----------------------------------------------------------------------
    // register
    // -----------------------------------------------------------------------
    async register(
      tenantId: string,
      data: RegisterInput,
    ): Promise<DomainResult<User>> {
      try {
        // Find and validate invitation
        const invitation =
          await prismaClient.invitationToken.findFirst({
            where: {
              token: data.invitationToken,
              usedAt: null,
              expiresAt: { gt: new Date() },
            },
          });

        if (!invitation) {
          return fail(
            authTokenInvalid(),
          );
        }

        // Hash password
        const passwordHash = await hashPassword(data.password);

        // Create user with tenant scope
        const prismaUser = await userRepo.create(tenantId, {
          data: {
            name: data.name,
            email: data.email,
            passwordHash,
            role: invitation.role,
            status: 'active',
            consentTimestamp: new Date(),
            consentVersion: data.consentVersion,
          },
        });

        // Mark invitation as used
        await prismaClient.invitationToken.update({
          where: { id: invitation.id },
          data: { usedAt: new Date() },
        });

        return ok(mapPrismaUserToDomain(prismaUser));
      } catch (error) {
        return fail(
          unexpectedError(
            'AUTH_REGISTER_FAILED',
            'Failed to register user',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // logout
    // -----------------------------------------------------------------------
    async logout(_userId: string): Promise<DomainResult<void>> {
      // JWT is stateless — cookie clearing is handled by the route handler.
      // No server-side session to invalidate.
      return ok(undefined);
    },

    // -----------------------------------------------------------------------
    // validateToken
    // -----------------------------------------------------------------------
    async validateToken(token: string): Promise<DomainResult<AuthContext>> {
      try {
        const payload = verifyJwt(token);
        if (!payload) {
          return fail(authTokenInvalid());
        }

        const authContext: AuthContext = {
          userId: payload.userId,
          tenantId: payload.tenantId,
          role: payload.role as UserRole,
        };

        return ok(authContext);
      } catch {
        return fail(authTokenInvalid());
      }
    },

    // -----------------------------------------------------------------------
    // createInvitation
    // -----------------------------------------------------------------------
    async createInvitation(
      tenantId: string,
      data: CreateInvitationInput,
    ): Promise<DomainResult<InvitationToken>> {
      try {
        const token = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_MS);

        const prismaInvitation = await invitationRepo.create(tenantId, {
          data: {
            email: data.email,
            role: data.role,
            token,
            expiresAt,
            createdBy: data.createdBy,
          },
        });

        return ok(mapPrismaInvitationToDomain(prismaInvitation));
      } catch (error) {
        return fail(
          technicalError(
            'AUTH_CREATE_INVITATION_FAILED',
            'Failed to create invitation',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // validateInvitation
    // -----------------------------------------------------------------------
    async validateInvitation(
      token: string,
    ): Promise<DomainResult<InvitationToken>> {
      try {
        const invitation =
          await prismaClient.invitationToken.findFirst({
            where: {
              token,
              usedAt: null,
              expiresAt: { gt: new Date() },
            },
          });

        if (!invitation) {
          return fail(
            authTokenInvalid(),
          );
        }

        return ok(
          mapPrismaInvitationToDomain(
            invitation as unknown as PrismaInvitationToken,
          ),
        );
      } catch (error) {
        return fail(
          technicalError(
            'AUTH_VALIDATE_INVITATION_FAILED',
            'Failed to validate invitation',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // findByEmail
    // -----------------------------------------------------------------------
    async findByEmail(
      tenantId: string,
      email: string,
    ): Promise<DomainResult<User | null>> {
      try {
        const user = await userRepo.findFirst(tenantId, {
          where: { email, deletedAt: null },
        });

        if (!user) {
          return ok(null);
        }

        return ok(mapPrismaUserToDomain(user));
      } catch (error) {
        return fail(
          technicalError(
            'AUTH_FIND_BY_EMAIL_FAILED',
            'Failed to find user by email',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // findById
    // -----------------------------------------------------------------------
    async findById(
      tenantId: string,
      userId: string,
    ): Promise<DomainResult<User | null>> {
      try {
        const user = await userRepo.findFirst(tenantId, {
          where: { id: userId, deletedAt: null },
        });

        if (!user) {
          return ok(null);
        }

        return ok(mapPrismaUserToDomain(user));
      } catch (error) {
        return fail(
          technicalError(
            'AUTH_FIND_BY_ID_FAILED',
            'Failed to find user by ID',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // updateFailedAttempts
    // -----------------------------------------------------------------------
    async updateFailedAttempts(
      tenantId: string,
      userId: string,
      attempts: number,
      lockedUntil: Date | null,
    ): Promise<DomainResult<void>> {
      try {
        await userRepo.update(tenantId, {
          where: { id: userId },
          data: {
            failedLoginAttempts: attempts,
            lockedUntil,
          },
        });

        return ok(undefined);
      } catch (error) {
        return fail(
          technicalError(
            'AUTH_UPDATE_FAILED_ATTEMPTS_FAILED',
            'Failed to update failed login attempts',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // resetFailedAttempts
    // -----------------------------------------------------------------------
    async resetFailedAttempts(
      tenantId: string,
      userId: string,
    ): Promise<DomainResult<void>> {
      try {
        await userRepo.update(tenantId, {
          where: { id: userId },
          data: {
            failedLoginAttempts: 0,
            lockedUntil: null,
          },
        });

        return ok(undefined);
      } catch (error) {
        return fail(
          technicalError(
            'AUTH_RESET_FAILED_ATTEMPTS_FAILED',
            'Failed to reset failed login attempts',
            { cause: error },
          ),
        );
      }
    },
  };
};
