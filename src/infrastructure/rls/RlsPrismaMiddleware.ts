/**
 * RLS Prisma Middleware
 *
 * Provides Prisma middleware integration for Row-Level Security (RLS) tenant isolation.
 * Automatically sets `app.current_tenant_id` session variable before tenant-scoped operations.
 *
 * **CRITICAL RULES:**
 * - ALL tenant-scoped operations MUST go through this middleware
 * - Use SET LOCAL (transaction-scoped) for connection pool safety
 * - Fail-closed: deny operation if tenantId not available
 * - Privileged execution requires explicit audit logging with justification
 * - ALL RLS context changes MUST be logged for audit (Requirement 15.4)
 *
 * @see FASE 2.8 Tasks 17.1-17.6: RLS Prisma Middleware Integration
 * @see FASE 2.13 Task 23.4: RLS Context Change Logging
 * @see Requirement 9: RLS Prisma Middleware Integration
 * @see Requirement 15.4: RLS Context Change Audit Logging
 * @see Design Section 8: RLS Prisma Middleware
 */

import type { PrismaClient } from '@prisma/client';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { Logger } from '@infrastructure/logging/Logger';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';

import {
  createRlsSessionContextService,
  type IRlsSessionContextService,
} from './RlsSessionContext';
import { type RlsErrorCode } from './types';

// ---------------------------------------------------------------------------
// RLS Context Change Logging Types (Requirement 15.4)
// ---------------------------------------------------------------------------

/**
 * RLS context change operation types.
 *
 * @see Requirement 15.4: Log all RLS context changes
 */
export type RlsContextOperation =
  | 'SET_CONTEXT'
  | 'CLEAR_CONTEXT'
  | 'PRIVILEGED_EXECUTION';

/**
 * Structured audit log entry for RLS context changes.
 *
 * @see Requirement 15.4: RLS context change logging
 * @see Requirement 15.1: Include correlationId, timestamp, userId, tenantId
 */
export interface RlsContextChangeLogEntry {
  /** Log entry type identifier */
  readonly type: 'RLS_CONTEXT_CHANGE';
  /** Correlation ID for request tracing */
  readonly correlationId: string;
  /** ISO 8601 timestamp when the change occurred */
  readonly timestamp: string;
  /** User ID performing the operation (if available) */
  readonly userId?: string;
  /** Tenant ID being set/cleared (null for CLEAR_CONTEXT) */
  readonly tenantId: string | null;
  /** Type of RLS context operation */
  readonly operation: RlsContextOperation;
  /** Required justification for PRIVILEGED_EXECUTION */
  readonly justification?: string;
  /** Whether the operation succeeded */
  readonly success: boolean;
  /** Error message if operation failed */
  readonly error?: string;
  /** Additional operation context for debugging (non-sensitive) */
  readonly operationContext?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Configuration for RLS Prisma Middleware.
 *
 * @see Requirement 9.1: Interception MUST occur for every Prisma operation
 */
export interface RlsPrismaMiddlewareConfig {
  /**
   * Prisma operations that require RLS tenant context.
   * Typically all CRUD operations: findMany, findFirst, findUnique, create, update, delete, etc.
   */
  readonly tenantScopedOperations: ReadonlySet<string>;

  /**
   * Tables exempt from RLS (GLOBAL_IDENTITY, PLATFORM_SHARED).
   * Operations on these tables do NOT require tenant context.
   * Examples: 'users', 'subscription_plans', 'feature_flags'
   */
  readonly exemptTables: ReadonlySet<string>;
}

/**
 * Execution context for RLS-aware Prisma operations.
 *
 * @see Requirement 9.2: Extract tenantId from AuthorizationContext
 * @see Requirement 9.6: Fail-closed if tenantId not available
 */
export interface RlsExecutionContext {
  /**
   * Tenant ID from AuthorizationContext.
   * Required for all tenant-scoped operations.
   */
  readonly tenantId: string;

  /**
   * Correlation ID for tracing and debugging.
   */
  readonly correlationId: string;

  /**
   * User ID for audit logging.
   */
  readonly userId?: string;

  /**
   * Whether this is a privileged execution (bypasses RLS).
   * MUST be explicitly set to true AND include justification.
   */
  readonly privileged?: boolean;

  /**
   * Justification REQUIRED for privileged execution.
   * Must explain why cross-tenant access is necessary.
   *
   * @see Requirement 9.5: Require explicit audit logging with justification
   */
  readonly justification?: string;
}

/**
 * Options for privileged (cross-tenant) execution.
 *
 * @see Requirement 9.4: Bypass mechanism for explicit cross-tenant operations
 * @see Requirement 9.5: Require explicit audit logging with justification
 */
export interface PrivilegedExecutionOptions {
  /**
   * Required justification explaining why cross-tenant access is needed.
   * This will be logged to the audit trail.
   */
  readonly justification: string;

  /**
   * The user/actor requesting privileged access.
   * Logged for audit purposes.
   */
  readonly actorUserId: string;

  /**
   * Correlation ID for tracing.
   */
  readonly correlationId?: string;

  /**
   * Optional context about the operation being performed.
   */
  readonly operationContext?: Record<string, unknown>;
}

/**
 * Result of a privileged execution for audit trail.
 */
export interface PrivilegedExecutionAuditEntry {
  readonly type: 'PRIVILEGED_EXECUTION';
  readonly timestamp: Date;
  readonly correlationId: string;
  readonly actorUserId: string;
  readonly justification: string;
  readonly operationContext?: Record<string, unknown>;
  success: boolean;
  error?: string;
}

/**
 * RLS-specific error codes for middleware operations.
 */
export type RlsMiddlewareErrorCode =
  | 'RLS_NO_TENANT_CONTEXT'
  | 'RLS_PRIVILEGED_NO_JUSTIFICATION'
  | 'RLS_OPERATION_DENIED'
  | 'RLS_TRANSACTION_FAILED';

/**
 * Error thrown when RLS middleware denies an operation.
 */
export class RlsMiddlewareError extends Error {
  constructor(
    public readonly code: RlsMiddlewareErrorCode | RlsErrorCode,
    message: string,
    public readonly correlationId: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'RlsMiddlewareError';
    Object.setPrototypeOf(this, RlsMiddlewareError.prototype);
  }
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

/**
 * RLS Prisma Middleware Service Interface.
 *
 * Provides transaction wrappers that automatically set RLS tenant context
 * before executing Prisma operations.
 *
 * @see Requirement 9.1-9.8
 */
export interface IRlsPrismaMiddleware {
  /**
   * Execute a Prisma operation with RLS tenant context.
   *
   * Sets `app.current_tenant_id` via SET LOCAL before executing the operation
   * within a transaction. The context is automatically cleared when the
   * transaction ends (commit or rollback).
   *
   * @param context - RLS execution context with tenantId
   * @param operation - Async function receiving transaction client
   * @returns Result of the operation
   * @throws RlsMiddlewareError if tenantId not provided (fail-closed)
   *
   * @see Requirement 9.3: Use $transaction wrapper with SET LOCAL
   * @see Requirement 9.6: Deny operation if tenantId not available
   * @see Requirement 9.7: Clear context before returning connection
   */
  executeWithRlsContext<T>(
    context: RlsExecutionContext,
    operation: (tx: PrismaTransactionClient) => Promise<T>,
  ): Promise<T>;

  /**
   * Execute a Prisma operation without RLS context (privileged execution).
   *
   * This bypasses RLS tenant filtering for explicit cross-tenant operations.
   * REQUIRES explicit justification which is logged to the audit trail.
   *
   * Use cases:
   * - Platform admin viewing all tenants
   * - Cross-tenant reporting
   * - System maintenance operations
   *
   * @param options - Privileged execution options with REQUIRED justification
   * @param operation - Async function to execute
   * @returns Result of the operation
   * @throws RlsMiddlewareError if justification not provided
   *
   * @see Requirement 9.4: Bypass mechanism for cross-tenant operations
   * @see Requirement 9.5: Require explicit audit logging with justification
   */
  executePrivileged<T>(
    options: PrivilegedExecutionOptions,
    operation: () => Promise<T>,
  ): Promise<T>;

  /**
   * Create RLS execution context from AuthorizationContext.
   *
   * Extracts tenantId and other relevant fields from the authorization context
   * to create an RlsExecutionContext for use with executeWithRlsContext.
   *
   * @param authContext - The resolved AuthorizationContext from middleware
   * @param correlationId - Optional correlation ID (generated if not provided)
   * @returns RlsExecutionContext ready for use
   *
   * @see Requirement 9.2: Extract tenantId from AuthorizationContext
   */
  createContextFromAuth(
    authContext: AuthorizationContext,
    correlationId?: string,
  ): RlsExecutionContext;

  /**
   * Check if a table is exempt from RLS (GLOBAL_IDENTITY or PLATFORM_SHARED).
   *
   * @param tableName - PostgreSQL table name
   * @returns true if table does not require RLS context
   */
  isTableExempt(tableName: string): boolean;

  /**
   * Get the current middleware configuration.
   */
  getConfig(): RlsPrismaMiddlewareConfig;
}

// ---------------------------------------------------------------------------
// Prisma Transaction Client Type
// ---------------------------------------------------------------------------

/**
 * Prisma transaction client type.
 *
 * This is the client type provided by Prisma's $transaction callback.
 * We use a generic type that extends PrismaClient to support the transaction API.
 */
export type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

// ---------------------------------------------------------------------------
// Default Configuration
// ---------------------------------------------------------------------------

/**
 * Default tenant-scoped Prisma operations.
 *
 * These operations will have RLS context set before execution.
 */
export const DEFAULT_TENANT_SCOPED_OPERATIONS: ReadonlySet<string> = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
]);

/**
 * Default exempt tables (GLOBAL_IDENTITY, PLATFORM_SHARED).
 *
 * These tables do NOT have RLS policies and do not require tenant context.
 *
 * @see TableClassificationRegistry for full classification
 */
export const DEFAULT_EXEMPT_TABLES: ReadonlySet<string> = new Set([
  // GLOBAL_IDENTITY - No tenant RLS
  'users',
  'User',

  // PLATFORM_SHARED - Read-all for authenticated users
  'subscription_plans',
  'SubscriptionPlan',
  'feature_flags',
  'FeatureFlag',
]);

// ---------------------------------------------------------------------------
// Service Dependencies
// ---------------------------------------------------------------------------

/**
 * Dependencies for RlsPrismaMiddleware service.
 */
export interface RlsPrismaMiddlewareDeps {
  /**
   * Prisma client instance.
   */
  readonly prisma: PrismaClient;

  /**
   * Logger for audit and diagnostic logging.
   */
  readonly logger: Logger;

  /**
   * RLS Session Context service for SQL generation.
   */
  readonly rlsSessionContext?: IRlsSessionContextService;

  /**
   * Optional configuration overrides.
   */
  readonly config?: Partial<RlsPrismaMiddlewareConfig>;
}

// ---------------------------------------------------------------------------
// Service Implementation
// ---------------------------------------------------------------------------

/**
 * Creates an RlsPrismaMiddleware service instance.
 *
 * Factory function pattern for DI container registration.
 *
 * @param deps - Service dependencies
 * @returns IRlsPrismaMiddleware instance
 *
 * @example
 * ```typescript
 * import { createRlsPrismaMiddleware } from '@infrastructure/rls';
 * import { getPrismaClient } from '@infrastructure/repositories/prismaClient';
 * import { createLogger } from '@infrastructure/logging/Logger';
 *
 * const rlsMiddleware = createRlsPrismaMiddleware({
 *   prisma: getPrismaClient(),
 *   logger: createLogger(),
 * });
 *
 * // Execute with RLS context
 * const context = rlsMiddleware.createContextFromAuth(authContext);
 * const residents = await rlsMiddleware.executeWithRlsContext(
 *   context,
 *   async (tx) => tx.resident.findMany(),
 * );
 *
 * // Privileged execution (cross-tenant)
 * const allTenants = await rlsMiddleware.executePrivileged(
 *   {
 *     justification: 'Platform admin viewing tenant list for audit',
 *     actorUserId: adminUserId,
 *   },
 *   async () => prisma.tenant.findMany(),
 * );
 * ```
 *
 * @see Requirement 9.8: Integrate with existing RlsSessionContext service
 * @see Requirement 15.4: Log all RLS context changes
 */
export function createRlsPrismaMiddleware(
  deps: RlsPrismaMiddlewareDeps,
): IRlsPrismaMiddleware {
  const { prisma, logger, config } = deps;

  // Use provided RlsSessionContext or create default
  const rlsSessionContext =
    deps.rlsSessionContext ?? createRlsSessionContextService();

  // Merge configuration with defaults
  const finalConfig: RlsPrismaMiddlewareConfig = {
    tenantScopedOperations:
      config?.tenantScopedOperations ?? DEFAULT_TENANT_SCOPED_OPERATIONS,
    exemptTables: config?.exemptTables ?? DEFAULT_EXEMPT_TABLES,
  };

  /**
   * Log RLS context change for audit trail.
   *
   * @see Requirement 15.4: Log all RLS context changes with correlationId, tenantId, operation, timestamp
   */
  const logRlsContextChange = (
    operation: RlsContextOperation,
    correlationId: string,
    tenantId: string | null,
    success: boolean,
    options?: {
      userId?: string;
      justification?: string;
      error?: string;
      operationContext?: Record<string, unknown>;
    },
  ): void => {
    const logEntry: RlsContextChangeLogEntry = {
      type: 'RLS_CONTEXT_CHANGE',
      correlationId,
      timestamp: new Date().toISOString(),
      userId: options?.userId,
      tenantId,
      operation,
      justification: options?.justification,
      success,
      error: options?.error,
      operationContext: options?.operationContext,
    };

    // Use appropriate log level based on operation and success
    const logLevel = success ? 'info' : 'warn';
    const message = `RLS context ${operation.toLowerCase()}: ${success ? 'success' : 'failed'}`;

    // Log structured entry
    // Requirement 15.6: Structured JSON logging format
    logger[logLevel](message, {
      correlation_id: correlationId,
      tenant_id: tenantId ?? undefined,
      user_id: options?.userId,
      code: `RLS_${operation}`,
      rls_operation: operation,
      rls_context_change: logEntry,
    });
  };

  return {
    async executeWithRlsContext<T>(
      context: RlsExecutionContext,
      operation: (tx: PrismaTransactionClient) => Promise<T>,
    ): Promise<T> {
      // Requirement 9.6: Fail-closed behavior - deny if tenantId not available
      if (!context.tenantId) {
        const error = new RlsMiddlewareError(
          'RLS_NO_TENANT_CONTEXT',
          'Tenant ID required for RLS operation. Operation denied (fail-closed).',
          context.correlationId,
          { userId: context.userId },
        );

        logger.error('RLS operation denied: missing tenant context', {
          correlation_id: context.correlationId,
          user_id: context.userId,
          code: 'RLS_NO_TENANT_CONTEXT',
        });

        // Requirement 15.4: Log failed RLS context change attempt
        logRlsContextChange(
          'SET_CONTEXT',
          context.correlationId,
          null,
          false,
          {
            userId: context.userId,
            error: 'Missing tenant context',
          },
        );

        throw error;
      }

      // Validate tenant ID format
      if (!rlsSessionContext.validateTenantId(context.tenantId)) {
        const error = new RlsMiddlewareError(
          'RLS_INVALID_TENANT_ID' as RlsMiddlewareErrorCode,
          `Invalid tenant ID format: '${context.tenantId}'. Must be a valid UUID.`,
          context.correlationId,
          { tenantId: context.tenantId, userId: context.userId },
        );

        logger.error('RLS operation denied: invalid tenant ID format', {
          correlation_id: context.correlationId,
          user_id: context.userId,
          tenant_id: context.tenantId,
          code: 'RLS_INVALID_TENANT_ID',
        });

        // Requirement 15.4: Log failed RLS context change attempt
        logRlsContextChange(
          'SET_CONTEXT',
          context.correlationId,
          context.tenantId,
          false,
          {
            userId: context.userId,
            error: 'Invalid tenant ID format',
          },
        );

        throw error;
      }

      // Requirement 15.4: Log RLS context SET_CONTEXT before transaction
      logRlsContextChange(
        'SET_CONTEXT',
        context.correlationId,
        context.tenantId,
        true,
        {
          userId: context.userId,
          operationContext: { phase: 'before_transaction' },
        },
      );

      try {
        // Requirement 9.3: Use $transaction wrapper with SET LOCAL
        // SET LOCAL is transaction-scoped, so context is automatically cleared
        // when transaction ends (commit or rollback)
        const result = await prisma.$transaction(async (tx) => {
          // Set tenant context (transaction-scoped via SET LOCAL)
          const setContextSql = rlsSessionContext.getSetContextSql(
            context.tenantId,
          );
          await (tx as unknown as { $executeRawUnsafe: (sql: string) => Promise<unknown> }).$executeRawUnsafe(setContextSql);

          // Execute the operation - RLS policies will filter by tenant
          const operationResult = await operation(tx as PrismaTransactionClient);

          // Requirement 9.7: Defense-in-depth - explicitly reset before returning
          // Note: SET LOCAL already clears when transaction ends, but this adds safety
          const clearContextSql = rlsSessionContext.getClearContextSql();
          await (tx as unknown as { $executeRawUnsafe: (sql: string) => Promise<unknown> }).$executeRawUnsafe(clearContextSql);

          // Requirement 15.4: Log RLS context CLEAR_CONTEXT within transaction
          logRlsContextChange(
            'CLEAR_CONTEXT',
            context.correlationId,
            context.tenantId,
            true,
            {
              userId: context.userId,
              operationContext: { phase: 'within_transaction', defenseInDepth: true },
            },
          );

          return operationResult;
        });

        logger.debug('RLS transaction completed successfully', {
          correlation_id: context.correlationId,
          tenant_id: context.tenantId,
          user_id: context.userId,
        });

        return result;
      } catch (error) {
        // Log transaction failure
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        // Don't re-wrap RlsMiddlewareError
        if (error instanceof RlsMiddlewareError) {
          throw error;
        }

        logger.error('RLS transaction failed', {
          correlation_id: context.correlationId,
          tenant_id: context.tenantId,
          user_id: context.userId,
          error: errorMessage,
          code: 'RLS_TRANSACTION_FAILED',
        });

        // Requirement 15.4: Log failed RLS context change
        logRlsContextChange(
          'SET_CONTEXT',
          context.correlationId,
          context.tenantId,
          false,
          {
            userId: context.userId,
            error: `Transaction failed: ${errorMessage}`,
            operationContext: { phase: 'transaction_error' },
          },
        );

        throw new RlsMiddlewareError(
          'RLS_TRANSACTION_FAILED',
          `RLS transaction failed: ${errorMessage}`,
          context.correlationId,
          {
            tenantId: context.tenantId,
            userId: context.userId,
            originalError: errorMessage,
          },
        );
      }
    },

    async executePrivileged<T>(
      options: PrivilegedExecutionOptions,
      operation: () => Promise<T>,
    ): Promise<T> {
      const correlationId = options.correlationId ?? generateCorrelationId();

      // Requirement 9.5: Require explicit justification for privileged execution
      if (!options.justification || options.justification.trim() === '') {
        const error = new RlsMiddlewareError(
          'RLS_PRIVILEGED_NO_JUSTIFICATION',
          'Privileged execution requires explicit justification for audit trail.',
          correlationId,
          { actorUserId: options.actorUserId },
        );

        logger.error('Privileged execution denied: missing justification', {
          correlation_id: correlationId,
          user_id: options.actorUserId,
          code: 'RLS_PRIVILEGED_NO_JUSTIFICATION',
        });

        // Requirement 15.4: Log failed privileged execution attempt
        logRlsContextChange(
          'PRIVILEGED_EXECUTION',
          correlationId,
          null,
          false,
          {
            userId: options.actorUserId,
            error: 'Missing justification for privileged execution',
          },
        );

        throw error;
      }

      // Requirement 9.5: Log privileged execution with justification
      const auditEntry: PrivilegedExecutionAuditEntry = {
        type: 'PRIVILEGED_EXECUTION',
        timestamp: new Date(),
        correlationId,
        actorUserId: options.actorUserId,
        justification: options.justification,
        operationContext: options.operationContext,
        success: false, // Will update on success
      };

      logger.warn('Privileged execution starting - RLS bypass', {
        correlation_id: correlationId,
        user_id: options.actorUserId,
        justification: options.justification,
        operation_context: options.operationContext,
        code: 'RLS_PRIVILEGED_EXECUTION_START',
      });

      // Requirement 15.4: Log PRIVILEGED_EXECUTION start
      logRlsContextChange(
        'PRIVILEGED_EXECUTION',
        correlationId,
        null, // No specific tenant - privileged execution bypasses RLS
        true,
        {
          userId: options.actorUserId,
          justification: options.justification,
          operationContext: {
            ...options.operationContext,
            phase: 'start',
          },
        },
      );

      try {
        // Execute without RLS context (no SET LOCAL)
        const result = await operation();

        // Update audit entry and log success
        auditEntry.success = true;

        logger.warn('Privileged execution completed successfully', {
          correlation_id: correlationId,
          user_id: options.actorUserId,
          justification: options.justification,
          code: 'RLS_PRIVILEGED_EXECUTION_SUCCESS',
        });

        // Requirement 15.4: Log PRIVILEGED_EXECUTION completion
        logRlsContextChange(
          'PRIVILEGED_EXECUTION',
          correlationId,
          null,
          true,
          {
            userId: options.actorUserId,
            justification: options.justification,
            operationContext: {
              ...options.operationContext,
              phase: 'completed',
            },
          },
        );

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        // Update audit entry with error
        auditEntry.error = errorMessage;

        logger.error('Privileged execution failed', {
          correlation_id: correlationId,
          user_id: options.actorUserId,
          justification: options.justification,
          error: errorMessage,
          code: 'RLS_PRIVILEGED_EXECUTION_FAILED',
        });

        // Requirement 15.4: Log failed PRIVILEGED_EXECUTION
        logRlsContextChange(
          'PRIVILEGED_EXECUTION',
          correlationId,
          null,
          false,
          {
            userId: options.actorUserId,
            justification: options.justification,
            error: errorMessage,
            operationContext: {
              ...options.operationContext,
              phase: 'failed',
            },
          },
        );

        throw error;
      }
    },

    createContextFromAuth(
      authContext: AuthorizationContext,
      correlationId?: string,
    ): RlsExecutionContext {
      // Requirement 9.2: Extract tenantId from AuthorizationContext
      return {
        tenantId: authContext.tenantId,
        correlationId: correlationId ?? generateCorrelationId(),
        userId: authContext.userId,
        privileged: false,
      };
    },

    isTableExempt(tableName: string): boolean {
      return finalConfig.exemptTables.has(tableName);
    },

    getConfig(): RlsPrismaMiddlewareConfig {
      return finalConfig;
    },
  };
}

// ---------------------------------------------------------------------------
// Convenience Functions
// ---------------------------------------------------------------------------

/**
 * Default service instance holder for convenience imports.
 * Must be initialized via initRlsPrismaMiddleware before use.
 */
let defaultMiddleware: IRlsPrismaMiddleware | null = null;

/**
 * Initialize the default RLS Prisma Middleware instance.
 *
 * Should be called once at application startup after Prisma client is initialized.
 *
 * @param deps - Service dependencies
 * @returns The initialized middleware instance
 */
export function initRlsPrismaMiddleware(
  deps: RlsPrismaMiddlewareDeps,
): IRlsPrismaMiddleware {
  defaultMiddleware = createRlsPrismaMiddleware(deps);
  return defaultMiddleware;
}

/**
 * Get the default RLS Prisma Middleware instance.
 *
 * @throws Error if middleware has not been initialized
 */
export function getRlsPrismaMiddleware(): IRlsPrismaMiddleware {
  if (!defaultMiddleware) {
    throw new Error(
      'RLS Prisma Middleware has not been initialized. Call initRlsPrismaMiddleware() first.',
    );
  }
  return defaultMiddleware;
}

/**
 * Execute a Prisma operation with RLS tenant context using the default middleware.
 *
 * @param context - RLS execution context
 * @param operation - Async function receiving transaction client
 * @returns Result of the operation
 */
export async function executeWithRlsContext<T>(
  context: RlsExecutionContext,
  operation: (tx: PrismaTransactionClient) => Promise<T>,
): Promise<T> {
  return getRlsPrismaMiddleware().executeWithRlsContext(context, operation);
}

/**
 * Execute a privileged (cross-tenant) operation using the default middleware.
 *
 * @param options - Privileged execution options
 * @param operation - Async function to execute
 * @returns Result of the operation
 */
export async function executePrivileged<T>(
  options: PrivilegedExecutionOptions,
  operation: () => Promise<T>,
): Promise<T> {
  return getRlsPrismaMiddleware().executePrivileged(options, operation);
}

/**
 * Create RLS execution context from AuthorizationContext using the default middleware.
 *
 * @param authContext - The resolved AuthorizationContext
 * @param correlationId - Optional correlation ID
 * @returns RlsExecutionContext
 */
export function createRlsContextFromAuth(
  authContext: AuthorizationContext,
  correlationId?: string,
): RlsExecutionContext {
  return getRlsPrismaMiddleware().createContextFromAuth(
    authContext,
    correlationId,
  );
}
