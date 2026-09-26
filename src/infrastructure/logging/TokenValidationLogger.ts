/**
 * TokenValidationLogger — Audit logging for all token validation events.
 *
 * Implements Requirement 15.3:
 * - Log all token validations with correlationId, userId, tokenVersion,
 *   validationResult, and failureReason
 *
 * **Security Constraints:**
 * - MUST NOT log actual token values (only tokenVersion claimed/current)
 * - MUST use structured JSON logging format
 * - MUST integrate with existing correlationId system
 *
 * **CORRELATION ID INTEGRATION:**
 * - Uses `@infrastructure/utils/correlationId` for correlation ID generation
 * - If correlationId is not provided, a fallback value is generated automatically
 * - Ensures consistent correlationId propagation across all log entries for a request
 *
 * **Log Fields:**
 * - correlationId: string - Request correlation ID
 * - timestamp: ISO 8601 string
 * - userId: string | null - User ID from token (if available)
 * - tokenVersion: { claimed: number | null, current: number | null }
 * - validationResult: 'VALID' | 'INVALID' | 'EXPIRED' | 'VERSION_MISMATCH'
 * - failureReason: AUTH_TOKEN_INVALID | AUTH_TOKEN_EXPIRED | AUTH_TOKEN_VERSION_MISMATCH | null
 * - context: Additional audit context (route, method, etc.)
 *
 * @see Requirements 15.3
 * @see Requirements 15.8 — Integrate with correlationId system
 * @see Design: Observability and Audit Logging
 * @see Security Guideline: Logging Aman - tidak log token/secret
 */

import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import type { Logger, LogContext } from './Logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Token validation result enum.
 * Represents the outcome of a token validation attempt.
 */
export type TokenValidationResult =
  | 'VALID'
  | 'INVALID'
  | 'EXPIRED'
  | 'VERSION_MISMATCH';

/**
 * Token validation failure reason codes.
 * Maps to the authorization error codes in the system.
 */
export type TokenValidationFailureReason =
  | 'AUTH_TOKEN_INVALID'
  | 'AUTH_TOKEN_EXPIRED'
  | 'AUTH_TOKEN_VERSION_MISMATCH'
  | null;

/**
 * Token version information for audit logging.
 * Both claimed (from JWT) and current (from database) are logged
 * for debugging version mismatch issues.
 */
export interface TokenVersionInfo {
  /** Token version claimed in the JWT (null if JWT parsing failed) */
  readonly claimed: number | null;
  /** Current token version from database (null if lookup failed) */
  readonly current: number | null;
}

/**
 * Additional context for token validation logging.
 */
export interface TokenValidationContext {
  /** Request route/endpoint */
  readonly route?: string;
  /** HTTP method */
  readonly method?: string;
  /** Tenant ID (if available) */
  readonly tenantId?: string;
  /** Additional metadata */
  readonly [key: string]: unknown;
}

/**
 * Token validation log entry structure.
 * This is the complete audit record for a token validation event.
 */
export interface TokenValidationLogEntry {
  /** Request correlation ID */
  readonly correlationId: string;
  /** Whether the correlationId was generated as fallback */
  readonly correlationIdGenerated?: boolean;
  /** Timestamp of the validation */
  readonly timestamp: Date;
  /** User ID from token (null if token parsing failed) */
  readonly userId: string | null;
  /** Token version information */
  readonly tokenVersion: TokenVersionInfo;
  /** Validation result */
  readonly validationResult: TokenValidationResult;
  /** Failure reason code (null if validation succeeded) */
  readonly failureReason: TokenValidationFailureReason;
  /** Additional context */
  readonly context?: TokenValidationContext;
}

/**
 * Input parameters for logging a token validation event.
 */
export interface LogTokenValidationInput {
  /** 
   * Request correlation ID.
   * If not provided, a fallback ID is generated using `@infrastructure/utils/correlationId`.
   * @see Requirements 15.8 — Integrate with correlationId system
   */
  readonly correlationId?: string;
  /** User ID from token (null if token parsing failed) */
  readonly userId: string | null;
  /** Token version claimed in JWT (null if parsing failed) */
  readonly claimedTokenVersion: number | null;
  /** Current token version from database (null if lookup failed) */
  readonly currentTokenVersion: number | null;
  /** Validation result */
  readonly validationResult: TokenValidationResult;
  /** Failure reason code (null if validation succeeded) */
  readonly failureReason: TokenValidationFailureReason;
  /** Additional context (route, method, tenantId, etc.) */
  readonly context?: TokenValidationContext;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * TokenValidationLogger interface.
 *
 * Provides structured audit logging for all token validation events.
 * Integrates with the existing Logger infrastructure.
 */
export interface ITokenValidationLogger {
  /**
   * Log a token validation event.
   *
   * This method should be called after every token validation attempt,
   * whether successful or not. It creates a structured audit log entry
   * containing all required fields per Requirement 15.3.
   *
   * @param input - Token validation log input
   */
  log(input: LogTokenValidationInput): void;

  /**
   * Log a successful token validation.
   *
   * Convenience method for logging successful validations.
   *
   * @param correlationId - Request correlation ID
   * @param userId - User ID from the token
   * @param tokenVersion - Token version (both claimed and current should match)
   * @param context - Additional context
   */
  logSuccess(
    correlationId: string,
    userId: string,
    tokenVersion: number,
    context?: TokenValidationContext,
  ): void;

  /**
   * Log an invalid token (parsing or signature failure).
   *
   * Convenience method for logging AUTH_TOKEN_INVALID failures.
   *
   * @param correlationId - Request correlation ID
   * @param context - Additional context
   */
  logInvalid(
    correlationId: string,
    context?: TokenValidationContext,
  ): void;

  /**
   * Log an expired token.
   *
   * Convenience method for logging AUTH_TOKEN_EXPIRED failures.
   *
   * @param correlationId - Request correlation ID
   * @param userId - User ID from the token (if parsed)
   * @param claimedTokenVersion - Token version from JWT (if parsed)
   * @param context - Additional context
   */
  logExpired(
    correlationId: string,
    userId: string | null,
    claimedTokenVersion: number | null,
    context?: TokenValidationContext,
  ): void;

  /**
   * Log a token version mismatch.
   *
   * Convenience method for logging AUTH_TOKEN_VERSION_MISMATCH failures.
   *
   * @param correlationId - Request correlation ID
   * @param userId - User ID from the token
   * @param claimedTokenVersion - Token version claimed in JWT
   * @param currentTokenVersion - Current token version from database
   * @param context - Additional context
   */
  logVersionMismatch(
    correlationId: string,
    userId: string,
    claimedTokenVersion: number,
    currentTokenVersion: number,
    context?: TokenValidationContext,
  ): void;
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a TokenValidationLogger instance.
 *
 * Follows DI pattern — the Logger is injected as a dependency.
 *
 * @param logger - Logger instance for output
 * @returns An implementation of ITokenValidationLogger
 *
 * @example
 * ```typescript
 * // DI Registration (in container setup)
 * container.register({
 *   tokenValidationLogger: asFunction(TokenValidationLoggerImpl).singleton(),
 * });
 *
 * // Usage in middleware
 * const tokenLogger = DI.resolve('tokenValidationLogger');
 * tokenLogger.logSuccess(correlationId, userId, tokenVersion, { route, method });
 * ```
 */
export function TokenValidationLoggerImpl({
  logger,
}: {
  logger: Logger;
}): ITokenValidationLogger {
  /**
   * Build a LogContext from TokenValidationLogEntry for the Logger.
   * Uses fallback correlationId if not provided (per Requirements 15.8).
   */
  const buildLogContext = (entry: TokenValidationLogEntry): LogContext => ({
    correlation_id: entry.correlationId,
    user_id: entry.userId ?? undefined,
    tenant_id: entry.context?.tenantId,
    route: entry.context?.route,
    event_type: 'TOKEN_VALIDATION',
    validation_result: entry.validationResult,
    failure_reason: entry.failureReason ?? undefined,
    token_version_claimed: entry.tokenVersion.claimed ?? undefined,
    token_version_current: entry.tokenVersion.current ?? undefined,
    method: entry.context?.method,
    // Indicate if fallback correlationId was used (useful for debugging)
    correlation_id_generated: entry.correlationIdGenerated,
  });

  /**
   * Build the log message based on validation result.
   */
  const buildLogMessage = (entry: TokenValidationLogEntry): string => {
    switch (entry.validationResult) {
      case 'VALID':
        return `Token validation successful for user ${entry.userId}`;
      case 'INVALID':
        return 'Token validation failed: invalid token';
      case 'EXPIRED':
        return `Token validation failed: expired token for user ${entry.userId ?? 'unknown'}`;
      case 'VERSION_MISMATCH':
        return `Token validation failed: version mismatch for user ${entry.userId} (claimed: ${entry.tokenVersion.claimed}, current: ${entry.tokenVersion.current})`;
      default:
        return 'Token validation completed';
    }
  };

  return {
    log(input: LogTokenValidationInput): void {
      // Use provided correlationId or generate a fallback (Requirements 15.8)
      const effectiveCorrelationId = input.correlationId || generateCorrelationId();
      const correlationIdGenerated = !input.correlationId;
      
      const entry: TokenValidationLogEntry = {
        correlationId: effectiveCorrelationId,
        correlationIdGenerated,
        timestamp: new Date(),
        userId: input.userId,
        tokenVersion: {
          claimed: input.claimedTokenVersion,
          current: input.currentTokenVersion,
        },
        validationResult: input.validationResult,
        failureReason: input.failureReason,
        context: input.context,
      };

      const logContext = buildLogContext(entry);
      const message = buildLogMessage(entry);

      // Use info level for successful validations, warn for failures
      if (entry.validationResult === 'VALID') {
        logger.info(message, logContext);
      } else {
        logger.warn(message, logContext);
      }
    },

    logSuccess(
      correlationId: string,
      userId: string,
      tokenVersion: number,
      context?: TokenValidationContext,
    ): void {
      this.log({
        correlationId,
        userId,
        claimedTokenVersion: tokenVersion,
        currentTokenVersion: tokenVersion,
        validationResult: 'VALID',
        failureReason: null,
        context,
      });
    },

    logInvalid(
      correlationId: string,
      context?: TokenValidationContext,
    ): void {
      this.log({
        correlationId,
        userId: null,
        claimedTokenVersion: null,
        currentTokenVersion: null,
        validationResult: 'INVALID',
        failureReason: 'AUTH_TOKEN_INVALID',
        context,
      });
    },

    logExpired(
      correlationId: string,
      userId: string | null,
      claimedTokenVersion: number | null,
      context?: TokenValidationContext,
    ): void {
      this.log({
        correlationId,
        userId,
        claimedTokenVersion,
        currentTokenVersion: null, // We don't look up current version for expired tokens
        validationResult: 'EXPIRED',
        failureReason: 'AUTH_TOKEN_EXPIRED',
        context,
      });
    },

    logVersionMismatch(
      correlationId: string,
      userId: string,
      claimedTokenVersion: number,
      currentTokenVersion: number,
      context?: TokenValidationContext,
    ): void {
      this.log({
        correlationId,
        userId,
        claimedTokenVersion,
        currentTokenVersion,
        validationResult: 'VERSION_MISMATCH',
        failureReason: 'AUTH_TOKEN_VERSION_MISMATCH',
        context,
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Export Types
// ---------------------------------------------------------------------------

export type TokenValidationLogger = ITokenValidationLogger;
