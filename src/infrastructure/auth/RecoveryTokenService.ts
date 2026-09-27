/**
 * RecoveryTokenService — Infrastructure service for password recovery tokens.
 *
 * Implements secure recovery token lifecycle:
 * - Generate cryptographically random recovery tokens
 * - 1-hour expiry (per Design D8)
 * - One-time use validation
 * - Rate limiting (3 per hour per email per Req 51 AC 2)
 * - Invalidation after use or expiry
 *
 * @see Requirement 51 (Account Recovery & Credential Security)
 * @see Design D8: Recovery token expiry: 1 hour
 */

import crypto from 'crypto';

import type {
  RecoveryToken,
  RecoveryTokenAuditEntry,
} from '@core/domains/auth/entities/RecoveryToken';
import {
  DEFAULT_RECOVERY_TOKEN_CONFIG,
  getRecoveryTokenStatus,
} from '@core/domains/auth/entities/RecoveryToken';
import type { DomainResult } from '@core/utils';
import { fail, isFail, ok } from '@core/utils';
import {
  authRecoveryTokenInvalid,
  authRecoveryTokenExpired,
  authRecoveryTokenAlreadyUsed,
  authRecoveryRateLimitExceeded,
} from '@core/domains/auth/errors/authErrors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Repository interface for RecoveryToken persistence.
 * Follows the repository pattern from the codebase.
 */
export interface RecoveryTokenRepository {
  /**
   * Create a new recovery token.
   */
  create(input: {
    userId: string;
    email: string;
    tokenHash: string;
    expiresAt: Date;
    requestIpAddress?: string;
    requestUserAgent?: string;
  }): Promise<DomainResult<RecoveryToken>>;

  /**
   * Find a recovery token by its hash.
   */
  findByHash(tokenHash: string): Promise<DomainResult<RecoveryToken | null>>;

  /**
   * Find by ID.
   */
  findById(id: string): Promise<DomainResult<RecoveryToken | null>>;

  /**
   * Mark a token as used.
   */
  markAsUsed(tokenId: string): Promise<DomainResult<void>>;

  /**
   * Invalidate a token.
   */
  invalidate(
    tokenId: string,
    reason: RecoveryToken['invalidationReason'],
  ): Promise<DomainResult<void>>;

  /**
   * Invalidate all pending tokens for a user.
   */
  invalidateAllForUser(
    userId: string,
    reason: RecoveryToken['invalidationReason'],
  ): Promise<DomainResult<number>>;

  /**
   * Count recovery requests for an email within a time window.
   */
  countRecentRequests(email: string, windowMs: number): Promise<DomainResult<number>>;

  /**
   * Find all valid (non-used, non-expired) tokens for a user.
   */
  findValidForUser(userId: string): Promise<DomainResult<RecoveryToken[]>>;
}

/**
 * Result of creating a recovery token.
 */
export interface CreateRecoveryTokenResult {
  /** The plaintext token to send to the user (email link) */
  readonly token: string;
  /** The token record */
  readonly record: RecoveryToken;
}

/**
 * Result of validating a recovery token.
 */
export interface ValidatedRecoveryToken {
  readonly token: RecoveryToken;
  readonly userId: string;
  readonly email: string;
}

/**
 * Input for creating a recovery token.
 */
export interface CreateRecoveryTokenInput {
  readonly userId: string;
  readonly email: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

/**
 * Input for using/consuming a recovery token.
 */
export interface UseRecoveryTokenInput {
  /** The plaintext token from the recovery link */
  readonly token: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

/**
 * Audit logger for recovery token operations.
 */
export type RecoveryTokenAuditLogger = (
  entry: RecoveryTokenAuditEntry,
) => void | Promise<void>;

/**
 * Configuration for RecoveryTokenService.
 */
export interface RecoveryTokenServiceConfig {
  /** Token expiry in milliseconds (default: 1 hour) */
  readonly expiryMs: number;
  /** Token byte length (default: 32 = 256 bits) */
  readonly tokenByteLength: number;
  /** Max recovery requests per email per hour (default: 3) */
  readonly maxRequestsPerHour: number;
  /** Rate limit window in milliseconds (default: 1 hour) */
  readonly rateLimitWindowMs: number;
  /** Optional audit logger */
  readonly auditLogger?: RecoveryTokenAuditLogger;
}

const DEFAULT_CONFIG: RecoveryTokenServiceConfig = {
  expiryMs: DEFAULT_RECOVERY_TOKEN_CONFIG.expiryMs,
  tokenByteLength: DEFAULT_RECOVERY_TOKEN_CONFIG.tokenByteLength,
  maxRequestsPerHour: DEFAULT_RECOVERY_TOKEN_CONFIG.maxRequestsPerHour,
  rateLimitWindowMs: 60 * 60 * 1000, // 1 hour
};

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface RecoveryTokenService {
  /**
   * Create a new recovery token for a user.
   * Invalidates any existing recovery tokens for the user.
   * Rate-limited to 3 requests per hour per email.
   *
   * @see Requirement 51 AC 2-3
   */
  createToken(
    input: CreateRecoveryTokenInput,
  ): Promise<DomainResult<CreateRecoveryTokenResult>>;

  /**
   * Validate a recovery token without consuming it.
   * Returns the token record if valid.
   *
   * @see Requirement 51 AC 3: One-time use validation
   */
  validateToken(
    plaintextToken: string,
  ): Promise<DomainResult<ValidatedRecoveryToken>>;

  /**
   * Use (consume) a recovery token.
   * Marks the token as used and invalidates it.
   * Returns the token record for the caller to complete the password reset.
   *
   * @see Requirement 51 AC 3: One-time use, invalidated after use
   */
  useToken(input: UseRecoveryTokenInput): Promise<DomainResult<ValidatedRecoveryToken>>;

  /**
   * Invalidate a recovery token manually.
   * Can be called when the user cancels recovery or admin resets.
   */
  invalidateToken(
    tokenId: string,
    reason: RecoveryToken['invalidationReason'],
  ): Promise<DomainResult<void>>;

  /**
   * Invalidate all recovery tokens for a user.
   * Called when password is changed through other means.
   *
   * @see Requirement 51 AC 4: Password reset invalidates sessions
   */
  invalidateAllForUser(
    userId: string,
    reason: RecoveryToken['invalidationReason'],
  ): Promise<DomainResult<number>>;

  /**
   * Check if a user has reached the rate limit for recovery requests.
   *
   * @see Requirement 51 AC 2: Rate-limit 3 per hour per email
   */
  checkRateLimit(email: string): Promise<DomainResult<boolean>>;

  /**
   * Hash a plaintext token using SHA-256.
   */
  hashToken(plaintextToken: string): string;

  /**
   * Generate a new opaque 256-bit random token.
   */
  generateOpaqueToken(): string;
}

// ---------------------------------------------------------------------------
// Service Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function for RecoveryTokenService.
 * Follows DI pattern.
 */
export function RecoveryTokenServiceImpl({
  recoveryTokenRepository,
  config = {},
}: {
  recoveryTokenRepository: RecoveryTokenRepository;
  config?: Partial<RecoveryTokenServiceConfig>;
}): RecoveryTokenService {
  const finalConfig: RecoveryTokenServiceConfig = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  // ---------------------------------------------------------------------------
  // Helper Functions
  // ---------------------------------------------------------------------------

  /**
   * Generate an opaque random token (URL-safe base64).
   * @see Requirement 51 AC 3: Cryptographically random tokens
   */
  function generateOpaqueToken(): string {
    const bytes = crypto.randomBytes(finalConfig.tokenByteLength);
    return bytes.toString('base64url');
  }

  /**
   * Hash a token using SHA-256.
   */
  function hashToken(plaintextToken: string): string {
    return crypto.createHash('sha256').update(plaintextToken).digest('hex');
  }

  /**
   * Log an audit entry if logger is configured.
   */
  async function logAudit(
    entry: Omit<RecoveryTokenAuditEntry, 'timestamp'>,
  ): Promise<void> {
    if (finalConfig.auditLogger) {
      try {
        await finalConfig.auditLogger({
          ...entry,
          timestamp: new Date(),
        });
      } catch {
        console.error('Failed to log recovery token audit entry');
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Service Methods
  // ---------------------------------------------------------------------------

  async function createToken(
    input: CreateRecoveryTokenInput,
  ): Promise<DomainResult<CreateRecoveryTokenResult>> {
    // Check rate limit
    const rateLimitResult = await checkRateLimit(input.email);
    if (isFail(rateLimitResult)) {
      return rateLimitResult;
    }

    if (!rateLimitResult.data) {
      await logAudit({
        userId: input.userId,
        tokenId: '',
        operation: 'create',
        success: false,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        metadata: { reason: 'rate_limit_exceeded', email: input.email },
      });
      return fail(authRecoveryRateLimitExceeded());
    }

    // Invalidate any existing recovery tokens for this user
    // This ensures only the latest token is valid
    await recoveryTokenRepository.invalidateAllForUser(input.userId, 'superseded');

    // Generate new token
    const plaintextToken = generateOpaqueToken();
    const tokenHash = hashToken(plaintextToken);
    const expiresAt = new Date(Date.now() + finalConfig.expiryMs);

    // Create token record
    const createResult = await recoveryTokenRepository.create({
      userId: input.userId,
      email: input.email,
      tokenHash,
      expiresAt,
      requestIpAddress: input.ipAddress,
      requestUserAgent: input.userAgent,
    });

    if (isFail(createResult)) {
      return createResult;
    }

    await logAudit({
      userId: input.userId,
      tokenId: createResult.data.id,
      operation: 'create',
      success: true,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    return ok({
      token: plaintextToken,
      record: createResult.data,
    });
  }

  async function validateToken(
    plaintextToken: string,
  ): Promise<DomainResult<ValidatedRecoveryToken>> {
    const tokenHash = hashToken(plaintextToken);
    const findResult = await recoveryTokenRepository.findByHash(tokenHash);

    if (isFail(findResult)) {
      return findResult;
    }

    const token = findResult.data;
    if (!token) {
      return fail(authRecoveryTokenInvalid());
    }

    // Check status
    const status = getRecoveryTokenStatus(token);

    switch (status) {
      case 'valid':
        return ok({
          token,
          userId: token.userId,
          email: token.email,
        });

      case 'used':
        return fail(authRecoveryTokenAlreadyUsed());

      case 'expired':
        return fail(authRecoveryTokenExpired());

      case 'invalidated':
        return fail(authRecoveryTokenInvalid());

      default:
        return fail(authRecoveryTokenInvalid());
    }
  }

  async function useToken(
    input: UseRecoveryTokenInput,
  ): Promise<DomainResult<ValidatedRecoveryToken>> {
    // Validate first
    const validateResult = await validateToken(input.token);
    if (isFail(validateResult)) {
      await logAudit({
        userId: '',
        tokenId: '',
        operation: 'use',
        success: false,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        metadata: { error: validateResult.error.code },
      });
      return validateResult;
    }

    const { token } = validateResult.data;

    // Mark as used (atomic operation to prevent race conditions)
    const markResult = await recoveryTokenRepository.markAsUsed(token.id);
    if (isFail(markResult)) {
      // Could be a race condition - another request used the token
      await logAudit({
        userId: token.userId,
        tokenId: token.id,
        operation: 'use',
        success: false,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        metadata: { error: 'mark_as_used_failed' },
      });
      return fail(authRecoveryTokenAlreadyUsed());
    }

    await logAudit({
      userId: token.userId,
      tokenId: token.id,
      operation: 'use',
      success: true,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    return ok({
      token,
      userId: token.userId,
      email: token.email,
    });
  }

  async function invalidateToken(
    tokenId: string,
    reason: RecoveryToken['invalidationReason'],
  ): Promise<DomainResult<void>> {
    const result = await recoveryTokenRepository.invalidate(tokenId, reason);

    if (!isFail(result)) {
      await logAudit({
        userId: '',
        tokenId,
        operation: 'invalidate',
        success: true,
        metadata: { reason },
      });
    }

    return result;
  }

  async function invalidateAllForUser(
    userId: string,
    reason: RecoveryToken['invalidationReason'],
  ): Promise<DomainResult<number>> {
    const result = await recoveryTokenRepository.invalidateAllForUser(userId, reason);

    if (!isFail(result)) {
      await logAudit({
        userId,
        tokenId: '*',
        operation: 'invalidate',
        success: true,
        metadata: { reason, count: result.data },
      });
    }

    return result;
  }

  async function checkRateLimit(email: string): Promise<DomainResult<boolean>> {
    const countResult = await recoveryTokenRepository.countRecentRequests(
      email,
      finalConfig.rateLimitWindowMs,
    );

    if (isFail(countResult)) {
      // On error, be conservative and allow (don't block recovery)
      return ok(true);
    }

    // Return true if under the limit
    return ok(countResult.data < finalConfig.maxRequestsPerHour);
  }

  return {
    createToken,
    validateToken,
    useToken,
    invalidateToken,
    invalidateAllForUser,
    checkRateLimit,
    hashToken,
    generateOpaqueToken,
  };
}
