/**
 * RefreshTokenService — Infrastructure service for refresh token management.
 *
 * Implements secure refresh token lifecycle:
 * - Generate opaque 256-bit random tokens
 * - Hash tokens with SHA-256 for storage
 * - Validate tokens and detect reuse
 * - Rotate tokens with family tracking
 * - Revoke tokens (single, family, user, tenant)
 *
 * @see Requirements 14 (Refresh Token), 15 (Token Version), 16 (Session Revocation)
 * @see Design D2: Refresh token: opaque 256-bit, SHA-256 hashed storage
 */

import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

import type { RefreshToken, RefreshTokenAuditEntry } from '@core/domains/auth/entities/RefreshToken';
import { DEFAULT_REFRESH_TOKEN_CONFIG, getRefreshTokenStatus } from '@core/domains/auth/entities/RefreshToken';
import type { RefreshTokenRepository, CreateRefreshTokenInput as RepoCreateInput } from '@core/domains/auth/repositories/RefreshTokenRepository';
import { fail, isFail, ok, type DomainResult } from '@core/utils';
import {
  authRefreshTokenExpired,
  authRefreshTokenInvalid,
  authTokenReuseDetected,
} from '@core/domains/auth/errors/authErrors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Result of successful token validation.
 */
export interface ValidatedToken {
  readonly token: RefreshToken;
  readonly status: 'active';
}

/**
 * Result of successful token rotation.
 */
export interface TokenRotationResult {
  /** The new plaintext token (to be set in cookie) */
  readonly newToken: string;
  /** The new token record */
  readonly tokenRecord: RefreshToken;
  /** The revoked old token record */
  readonly revokedToken: RefreshToken;
}

/**
 * Input for creating a new token.
 */
export interface CreateTokenInput {
  readonly userId: string;
  readonly tenantId?: string;
  readonly userAgent?: string;
  readonly ipAddress?: string;
  /** Custom expiry in milliseconds (overrides default 30 days) */
  readonly expiresInMs?: number;
}

/**
 * Input for validating and rotating a token.
 */
export interface RotateTokenInput {
  /** The plaintext refresh token from the cookie */
  readonly currentToken: string;
  /** New client metadata */
  readonly userAgent?: string;
  readonly ipAddress?: string;
}

/**
 * Audit logger function type.
 */
export type AuditLogger = (entry: RefreshTokenAuditEntry) => void | Promise<void>;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface RefreshTokenServiceConfig {
  /** Token expiry in milliseconds (default: 30 days) */
  readonly expiryMs: number;
  /** Token byte length (default: 32 = 256 bits) */
  readonly tokenByteLength: number;
  /** Optional audit logger */
  readonly auditLogger?: AuditLogger;
}

const DEFAULT_CONFIG: RefreshTokenServiceConfig = {
  expiryMs: DEFAULT_REFRESH_TOKEN_CONFIG.expiryMs,
  tokenByteLength: DEFAULT_REFRESH_TOKEN_CONFIG.tokenByteLength,
};

// ---------------------------------------------------------------------------
// Service Implementation
// ---------------------------------------------------------------------------

export interface RefreshTokenService {
  /**
   * Generate a new refresh token for a user.
   * Creates a new token family with generation=1.
   * @returns Tuple of [plaintextToken, tokenRecord]
   */
  createToken(
    input: CreateTokenInput,
  ): Promise<DomainResult<{ token: string; record: RefreshToken }>>;

  /**
   * Validate a refresh token.
   * Returns the token record if valid and active.
   * @returns ValidatedToken if valid, error otherwise
   */
  validateToken(plaintextToken: string): Promise<DomainResult<ValidatedToken>>;

  /**
   * Rotate a refresh token.
   * Validates the current token, revokes it, and issues a new one.
   * Detects and handles token reuse.
   * @see Requirement 14 AC 5-6: Rotation with reuse detection
   */
  rotateToken(input: RotateTokenInput): Promise<DomainResult<TokenRotationResult>>;

  /**
   * Revoke a single token by its plaintext value.
   */
  revokeToken(plaintextToken: string): Promise<DomainResult<void>>;

  /**
   * Revoke all tokens in a family.
   * Called when token reuse is detected.
   * @see Requirement 14 AC 6: Family-wide revocation
   */
  revokeFamily(familyId: string): Promise<DomainResult<number>>;

  /**
   * Revoke all tokens for a user.
   * Used for "logout all devices".
   * @see Requirement 16 AC 3
   */
  revokeAllForUser(userId: string): Promise<DomainResult<number>>;

  /**
   * Revoke all tokens for a user in a specific tenant.
   * Used for "logout from tenant" and membership revocation.
   * @see Requirement 16 AC 4-5
   */
  revokeForUserAndTenant(
    userId: string,
    tenantId: string,
  ): Promise<DomainResult<number>>;

  /**
   * Hash a plaintext token using SHA-256.
   * Exposed for testing and external validation.
   */
  hashToken(plaintextToken: string): string;

  /**
   * Generate a new opaque 256-bit random token.
   * Exposed for testing.
   */
  generateOpaqueToken(): string;
}

/**
 * Factory function for RefreshTokenService.
 * Follows DI pattern — receives repository as dependency.
 */
export function RefreshTokenServiceImpl({
  refreshTokenRepository,
  config = DEFAULT_CONFIG,
}: {
  refreshTokenRepository: RefreshTokenRepository;
  config?: Partial<RefreshTokenServiceConfig>;
}): RefreshTokenService {
  const finalConfig: RefreshTokenServiceConfig = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  // ---------------------------------------------------------------------------
  // Helper Functions
  // ---------------------------------------------------------------------------

  /**
   * Generate an opaque random token (URL-safe base64).
   * @see Requirement 14 AC 1: 256-bit random tokens
   */
  function generateOpaqueToken(): string {
    const bytes = crypto.randomBytes(finalConfig.tokenByteLength);
    // URL-safe base64 encoding
    return bytes.toString('base64url');
  }

  /**
   * Hash a token using SHA-256.
   * @see Requirement 14 AC 2: SHA-256 hash storage
   */
  function hashToken(plaintextToken: string): string {
    return crypto.createHash('sha256').update(plaintextToken).digest('hex');
  }

  /**
   * Generate a new familyId (UUID v4).
   * @see Requirement 14 AC 3: familyId for rotation tracking
   */
  function generateFamilyId(): string {
    return uuidv4();
  }

  /**
   * Log an audit entry if logger is configured.
   * @see Requirement 14 AC 9: Log all operations
   */
  async function logAudit(
    entry: Omit<RefreshTokenAuditEntry, 'timestamp'>,
  ): Promise<void> {
    if (finalConfig.auditLogger) {
      try {
        await finalConfig.auditLogger({
          ...entry,
          timestamp: new Date(),
        });
      } catch {
        // Audit logging should not break token operations
        console.error('Failed to log refresh token audit entry');
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Service Methods
  // ---------------------------------------------------------------------------

  async function createToken(
    input: CreateTokenInput,
  ): Promise<DomainResult<{ token: string; record: RefreshToken }>> {
    // Generate opaque token and hash
    const plaintextToken = generateOpaqueToken();
    const tokenHash = hashToken(plaintextToken);
    const familyId = generateFamilyId();
    const generation = 1;

    // Calculate expiry
    const expiresAt = new Date(
      Date.now() + (input.expiresInMs ?? finalConfig.expiryMs),
    );

    // Create repository input
    const repoInput: RepoCreateInput = {
      userId: input.userId,
      tokenHash,
      familyId,
      generation,
      expiresAt,
      tenantId: input.tenantId,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
    };

    // Persist token
    const result = await refreshTokenRepository.create(repoInput);
    if (isFail(result)) {
      return result;
    }

    // Log audit entry
    await logAudit({
      userId: input.userId,
      familyId,
      generation,
      operation: 'create',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    return ok({
      token: plaintextToken,
      record: result.data,
    });
  }

  async function validateToken(
    plaintextToken: string,
  ): Promise<DomainResult<ValidatedToken>> {
    // Hash the token to look it up
    const tokenHash = hashToken(plaintextToken);

    // Find by hash
    const findResult = await refreshTokenRepository.findByHash(tokenHash);
    if (isFail(findResult)) {
      return findResult;
    }

    const token = findResult.data;
    if (!token) {
      return fail(authRefreshTokenInvalid());
    }

    // Check status
    const status = getRefreshTokenStatus(token);

    switch (status) {
      case 'active':
        return ok({ token, status: 'active' });

      case 'expired':
        return fail(authRefreshTokenExpired());

      case 'revoked':
      case 'rotated':
        // This is a potential reuse attempt!
        // The token was already used/revoked but is being presented again.
        // Revoke the entire family as a security measure.
        await revokeFamily(token.familyId);

        await logAudit({
          userId: token.userId,
          familyId: token.familyId,
          generation: token.generation,
          operation: 'revoke_family',
          metadata: { reason: 'reuse_detected', revokedTokenId: token.id },
        });

        return fail(authTokenReuseDetected());

      default:
        // Should never happen, but fail closed
        return fail(authRefreshTokenInvalid());
    }
  }

  async function rotateToken(
    input: RotateTokenInput,
  ): Promise<DomainResult<TokenRotationResult>> {
    // Validate the current token
    const validateResult = await validateToken(input.currentToken);
    if (isFail(validateResult)) {
      return validateResult;
    }

    const currentTokenRecord = validateResult.data.token;

    // Generate new token in the same family
    const newPlaintextToken = generateOpaqueToken();
    const newTokenHash = hashToken(newPlaintextToken);
    const newGeneration = currentTokenRecord.generation + 1;

    // Calculate new expiry
    const expiresAt = new Date(Date.now() + finalConfig.expiryMs);

    // Create new token record
    const createResult = await refreshTokenRepository.create({
      userId: currentTokenRecord.userId,
      tokenHash: newTokenHash,
      familyId: currentTokenRecord.familyId, // Same family!
      generation: newGeneration,
      expiresAt,
      tenantId: currentTokenRecord.tenantId ?? undefined,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
    });

    if (isFail(createResult)) {
      return createResult;
    }

    const newTokenRecord = createResult.data;

    // Revoke the old token, marking it as replaced
    const revokeResult = await refreshTokenRepository.revokeById({
      tokenId: currentTokenRecord.id,
      replacedBy: newTokenRecord.id,
      revokedAt: new Date(),
    });

    if (isFail(revokeResult)) {
      // This is problematic — new token created but old not revoked
      // Log error but return success (new token is valid)
      console.error('Failed to revoke old token during rotation', revokeResult.error);
    }

    // Fetch the updated old token record
    const updatedOldResult = await refreshTokenRepository.findById(currentTokenRecord.id);
    const revokedToken: RefreshToken = isFail(updatedOldResult) || !updatedOldResult.data
      ? { ...currentTokenRecord, revokedAt: new Date(), replacedBy: newTokenRecord.id }
      : updatedOldResult.data;

    // Log audit entry
    await logAudit({
      userId: currentTokenRecord.userId,
      familyId: currentTokenRecord.familyId,
      generation: newGeneration,
      operation: 'refresh',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata: { previousGeneration: currentTokenRecord.generation },
    });

    return ok({
      newToken: newPlaintextToken,
      tokenRecord: newTokenRecord,
      revokedToken,
    });
  }

  async function revokeToken(plaintextToken: string): Promise<DomainResult<void>> {
    const tokenHash = hashToken(plaintextToken);
    const findResult = await refreshTokenRepository.findByHash(tokenHash);

    if (isFail(findResult)) {
      return findResult;
    }

    const token = findResult.data;
    if (!token) {
      // Token not found — idempotent success
      return ok(undefined);
    }

    // Already revoked — idempotent success
    if (token.revokedAt !== null) {
      return ok(undefined);
    }

    const revokeResult = await refreshTokenRepository.revokeById({
      tokenId: token.id,
      revokedAt: new Date(),
    });

    if (isFail(revokeResult)) {
      return revokeResult;
    }

    await logAudit({
      userId: token.userId,
      familyId: token.familyId,
      generation: token.generation,
      operation: 'revoke_single',
    });

    return ok(undefined);
  }

  async function revokeFamily(familyId: string): Promise<DomainResult<number>> {
    const result = await refreshTokenRepository.revokeByFamily(familyId);

    if (isFail(result)) {
      return result;
    }

    // Note: audit logging is done by caller with more context

    return result;
  }

  async function revokeAllForUser(userId: string): Promise<DomainResult<number>> {
    const result = await refreshTokenRepository.revokeByUserId(userId);

    if (isFail(result)) {
      return result;
    }

    await logAudit({
      userId,
      familyId: '*', // All families
      generation: 0,
      operation: 'revoke_user',
      metadata: { revokedCount: result.data },
    });

    return result;
  }

  async function revokeForUserAndTenant(
    userId: string,
    tenantId: string,
  ): Promise<DomainResult<number>> {
    const result = await refreshTokenRepository.revokeByUserAndTenant(
      userId,
      tenantId,
    );

    if (isFail(result)) {
      return result;
    }

    await logAudit({
      userId,
      familyId: '*', // All families for this tenant
      generation: 0,
      operation: 'revoke_tenant',
      metadata: { tenantId, revokedCount: result.data },
    });

    return result;
  }

  // Return service interface
  return {
    createToken,
    validateToken,
    rotateToken,
    revokeToken,
    revokeFamily,
    revokeAllForUser,
    revokeForUserAndTenant,
    hashToken,
    generateOpaqueToken,
  };
}
