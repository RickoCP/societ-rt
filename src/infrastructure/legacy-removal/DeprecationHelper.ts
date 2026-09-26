/**
 * Deprecation Helper — Manages deprecation warnings for User.tenantId access.
 *
 * This service provides utilities for:
 * 1. Wrapping User.tenantId accessors with deprecation warnings
 * 2. Logging deprecation events for tracking
 * 3. Rate-limiting warnings to prevent log spam
 * 4. Configuring warning behavior (log vs throw)
 *
 * **Usage:** This helper should be used during the transition period
 * (FASE 1.14-1.15) to track remaining User.tenantId accesses while
 * maintaining backward compatibility.
 *
 * @see Task 35: Code Path Analysis and Update
 * @see Requirement 12 (AC 5)
 */

import type {
  IDeprecationHelper,
  DeprecationWarning,
  DeprecationLocation,
  DeprecationConfig,
} from './types';
import { DEFAULT_DEPRECATION_CONFIG } from './types';

// ---------------------------------------------------------------------------
// Rate Limiting
// ---------------------------------------------------------------------------

/**
 * Rate limiter for deprecation warnings.
 */
interface RateLimitState {
  /** Number of warnings logged in current window */
  count: number;
  /** Start of current window (timestamp) */
  windowStart: number;
}

// ---------------------------------------------------------------------------
// Deprecation Helper Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a Deprecation Helper.
 *
 * @param initialConfig - Optional initial configuration
 * @returns Deprecation Helper implementation
 *
 * @example
 * ```typescript
 * const helper = DeprecationHelperImpl();
 *
 * // Wrap legacy accessor
 * const tenantId = helper.wrapTenantIdAccess(
 *   () => user.tenantId,
 *   { filePath: 'src/route.ts', lineNumber: 42, functionName: 'handler' }
 * );
 *
 * // Check warnings
 * const warnings = helper.getWarnings();
 * ```
 */
export const DeprecationHelperImpl = (
  initialConfig?: Partial<DeprecationConfig>,
): IDeprecationHelper => {
  // Internal state
  const warnings: DeprecationWarning[] = [];
  let config: DeprecationConfig = {
    ...DEFAULT_DEPRECATION_CONFIG,
    ...initialConfig,
  };

  // Rate limiting state per location
  const rateLimiters: Map<string, RateLimitState> = new Map();

  /**
   * Get a unique key for a location.
   */
  function getLocationKey(location: DeprecationLocation): string {
    return `${location.filePath}:${location.lineNumber ?? 0}:${location.functionName ?? ''}`;
  }

  /**
   * Check if a warning should be rate-limited.
   */
  function isRateLimited(location: DeprecationLocation): boolean {
    if (config.maxWarningsPerMinute <= 0) {
      return false;
    }

    const key = getLocationKey(location);
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute

    let state = rateLimiters.get(key);
    if (!state) {
      state = { count: 0, windowStart: now };
      rateLimiters.set(key, state);
    }

    // Reset window if expired
    if (now - state.windowStart > windowMs) {
      state.count = 0;
      state.windowStart = now;
    }

    // Check if rate limited
    if (state.count >= config.maxWarningsPerMinute) {
      return true;
    }

    state.count++;
    return false;
  }

  /**
   * Check if location should be excluded.
   */
  function isExcluded(location: DeprecationLocation): boolean {
    const normalizedPath = location.filePath.toLowerCase().replace(/\\/g, '/');

    for (const pattern of config.excludePatterns) {
      // Simple glob matching
      const regexPattern = pattern
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*')
        .replace(/\//g, '\\/');
      const regex = new RegExp(regexPattern, 'i');

      if (regex.test(normalizedPath)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get call stack if enabled.
   */
  function getCallStack(): string | undefined {
    if (!config.includeCallStack) {
      return undefined;
    }

    try {
      const error = new Error();
      const stack = error.stack;
      if (stack) {
        // Remove first 3 lines (Error + getCallStack + caller)
        const lines = stack.split('\n');
        return lines.slice(3).join('\n');
      }
    } catch {
      // Ignore errors getting stack
    }

    return undefined;
  }

  /**
   * Format warning message.
   */
  function formatWarningMessage(
    location: DeprecationLocation,
    additionalContext?: Record<string, unknown>,
  ): string {
    const parts = [
      '[DEPRECATION WARNING] User.tenantId access detected',
      `  Location: ${location.filePath}${location.lineNumber ? `:${location.lineNumber}` : ''}`,
    ];

    if (location.functionName) {
      parts.push(`  Function: ${location.functionName}`);
    }

    parts.push(
      '  Migration: Replace with authContext.tenantId from AuthorizationContext',
    );
    parts.push(
      '  See: FASE 1.14 migration guide for details',
    );

    if (additionalContext && Object.keys(additionalContext).length > 0) {
      parts.push(`  Context: ${JSON.stringify(additionalContext)}`);
    }

    return parts.join('\n');
  }

  return {
    wrapTenantIdAccess<T>(accessor: () => T, context: DeprecationLocation): T {
      // Log the deprecation warning
      this.logWarning(context);

      // Execute the original accessor
      return accessor();
    },

    logWarning(
      location: DeprecationLocation,
      additionalContext?: Record<string, unknown>,
    ): void {
      // Check exclusions
      if (isExcluded(location)) {
        return;
      }

      // Check rate limiting
      if (isRateLimited(location)) {
        return;
      }

      // Create warning record
      const warning: DeprecationWarning = {
        timestamp: new Date(),
        location,
        callStack: getCallStack(),
        context: additionalContext ?? {},
      };

      // Store warning
      warnings.push(warning);

      // Log if enabled
      if (config.logWarnings) {
        const message = formatWarningMessage(location, additionalContext);
        console.warn(message);

        if (config.includeCallStack && warning.callStack) {
          console.warn('  Call Stack:');
          console.warn(warning.callStack);
        }
      }

      // Throw if strict mode
      if (config.throwErrors) {
        throw new Error(
          `User.tenantId access is deprecated. ` +
            `Location: ${location.filePath}:${location.lineNumber ?? 'unknown'}. ` +
            `Use authContext.tenantId instead.`,
        );
      }
    },

    getWarnings(): readonly DeprecationWarning[] {
      return [...warnings];
    },

    clearWarnings(): void {
      warnings.length = 0;
      rateLimiters.clear();
    },

    updateConfig(newConfig: Partial<DeprecationConfig>): void {
      config = { ...config, ...newConfig };
    },
  };
};

/**
 * Type alias for cleaner DI registration.
 */
export type DeprecationHelper = IDeprecationHelper;

// ---------------------------------------------------------------------------
// Utility Functions for External Use
// ---------------------------------------------------------------------------

/**
 * Create a deprecated property accessor that logs warnings.
 *
 * This can be used to wrap User objects to add deprecation warnings
 * when tenantId is accessed.
 *
 * @example
 * ```typescript
 * const user = {
 *   id: 'user-123',
 *   email: 'test@example.com',
 *   tenantId: 'tenant-456', // Legacy field
 * };
 *
 * const deprecatedUser = createDeprecatedUserWrapper(user, helper, 'src/route.ts');
 * const tenantId = deprecatedUser.tenantId; // Logs warning
 * ```
 */
export function createDeprecatedUserWrapper<T extends { tenantId?: string | null }>(
  user: T,
  helper: IDeprecationHelper,
  sourceFile: string,
): T {
  return new Proxy(user, {
    get(target, prop) {
      if (prop === 'tenantId') {
        helper.logWarning({
          filePath: sourceFile,
          functionName: 'tenantId getter',
        });
      }
      return target[prop as keyof T];
    },
  });
}

/**
 * Create a deprecation logging decorator for methods that access tenantId.
 *
 * @example
 * ```typescript
 * class UserService {
 *   @deprecateTenantIdAccess(helper, 'UserService.ts')
 *   getUserTenant(userId: string): string | null {
 *     return this.user.tenantId;
 *   }
 * }
 * ```
 */
export function deprecateTenantIdAccess(
  helper: IDeprecationHelper,
  sourceFile: string,
) {
  return function (
    _target: unknown,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: unknown[]) {
      helper.logWarning({
        filePath: sourceFile,
        functionName: propertyKey,
      });
      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}
