/**
 * Authorization Path Validator — Validates route handlers use Membership-based authorization.
 *
 * This service performs static analysis to ensure all route handlers have been
 * migrated from legacy User.tenantId-based authorization to the new
 * Membership-based AuthorizationContext pattern.
 *
 * **Key Checks:**
 * 1. Route handler uses AuthorizationContext (not User.tenantId)
 * 2. Route handler uses RequirePermission decorator or equivalent
 * 3. No direct database queries with User.tenantId filtering
 * 4. Proper tenant isolation via authContext.tenantId
 *
 * @see Task 35: Code Path Analysis and Update
 * @see Requirement 12 (AC 6)
 * @see INV-AUTH-002: Authorization fails closed
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  IAuthPathValidator,
  RouteAuthorizationValidation,
  RouteValidationStatus,
  ValidationIssue,
  ValidationIssueCode,
  ValidationOptions,
} from './types';
import { DEFAULT_VALIDATION_OPTIONS } from './types';

// ---------------------------------------------------------------------------
// Validation Patterns
// ---------------------------------------------------------------------------

/**
 * Patterns for validating authorization approaches.
 */
interface AuthorizationPattern {
  readonly name: string;
  readonly regex: RegExp;
  readonly isNew: boolean; // true = new Membership-based, false = legacy
  readonly description: string;
}

/**
 * Patterns indicating new Membership-based authorization.
 */
const NEW_AUTHORIZATION_PATTERNS: readonly AuthorizationPattern[] = [
  {
    name: 'AuthorizationContext',
    regex: /AuthorizationContext|authContext/g,
    isNew: true,
    description: 'Uses AuthorizationContext type',
  },
  {
    name: 'RequirePermission',
    regex: /RequirePermission|@RequirePermission/g,
    isNew: true,
    description: 'Uses RequirePermission decorator',
  },
  {
    name: 'resolveAuthContext',
    regex: /resolveAuthContext|resolveAuthorizationContext/g,
    isNew: true,
    description: 'Uses authorization context resolver',
  },
  {
    name: 'authContext.tenantId',
    regex: /authContext\.tenantId/g,
    isNew: true,
    description: 'Accesses tenantId from auth context',
  },
  {
    name: 'authContext.membershipId',
    regex: /authContext\.membershipId/g,
    isNew: true,
    description: 'Accesses membershipId from auth context',
  },
  {
    name: 'authContext.permissions',
    regex: /authContext\.permissions/g,
    isNew: true,
    description: 'Accesses permissions from auth context',
  },
  {
    name: 'permissionRegistry',
    regex: /permissionRegistry|PermissionRegistry/g,
    isNew: true,
    description: 'Uses permission registry',
  },
];

/**
 * Patterns indicating legacy authorization.
 */
const LEGACY_AUTHORIZATION_PATTERNS: readonly AuthorizationPattern[] = [
  {
    name: 'User.tenantId',
    regex: /user\.tenantId|currentUser\.tenantId/gi,
    isNew: false,
    description: 'Accesses User.tenantId directly',
  },
  {
    name: 'Legacy role check',
    regex: /user\.role\s*(?:===|!==|==|!=)\s*['"](?:Super_Admin|Ketua_RT|Pengurus|Warga|Security_Guard)['"]/g,
    isNew: false,
    description: 'Checks legacy UserRole enum',
  },
  {
    name: 'req.user.tenantId',
    regex: /req\.user\.tenantId|request\.user\.tenantId/g,
    isNew: false,
    description: 'Accesses tenantId from request.user',
  },
  {
    name: 'tenantId from header',
    regex: /headers.*['"']x-tenant-id['"']/gi,
    isNew: false,
    description: 'Reads tenant from header (legacy middleware pattern)',
  },
];

/**
 * Patterns that indicate potential issues.
 */
const ISSUE_PATTERNS: ReadonlyArray<{
  readonly regex: RegExp;
  readonly code: ValidationIssueCode;
  readonly severity: 'error' | 'warning' | 'info';
  readonly message: string;
  readonly suggestedFix: string;
}> = [
  {
    regex: /where:\s*\{[^}]*tenantId:\s*user\.tenantId/gi,
    code: 'DIRECT_DB_TENANT_FILTER',
    severity: 'error',
    message: 'Direct database filter using User.tenantId instead of authContext',
    suggestedFix: 'Replace user.tenantId with authContext.tenantId from the resolved authorization context',
  },
  {
    regex: /tenantId:\s*['"][0-9a-f-]{36}['"]/gi,
    code: 'HARDCODED_TENANT_ID',
    severity: 'warning',
    message: 'Hardcoded tenant ID detected',
    suggestedFix: 'Use authContext.tenantId or a configuration constant',
  },
  {
    regex: /(?:GET|POST|PUT|PATCH|DELETE)\s*.*\{(?:(?!RequirePermission|authContext|AuthorizationContext).)*\}/gi,
    code: 'MISSING_AUTH_CONTEXT',
    severity: 'warning',
    message: 'Route handler may be missing authorization context',
    suggestedFix: 'Add AuthorizationContext resolution and permission checks',
  },
];

// ---------------------------------------------------------------------------
// Route Detection
// ---------------------------------------------------------------------------

/**
 * Detect route ID from file path and content.
 */
function detectRouteId(filePath: string, content: string): string {
  const normalizedPath = filePath.replace(/\\/g, '/');

  // Extract route from Next.js App Router structure
  const appRouteMatch = normalizedPath.match(/\/app\/api\/(.+?)\/route\.tsx?$/);
  if (appRouteMatch) {
    const routePath = appRouteMatch[1].replace(/\[([^\]]+)\]/g, ':$1');
    return `/api/${routePath}`;
  }

  // Extract HTTP methods from content
  const methods: string[] = [];
  if (/export\s+(?:async\s+)?function\s+GET/i.test(content)) methods.push('GET');
  if (/export\s+(?:async\s+)?function\s+POST/i.test(content)) methods.push('POST');
  if (/export\s+(?:async\s+)?function\s+PUT/i.test(content)) methods.push('PUT');
  if (/export\s+(?:async\s+)?function\s+PATCH/i.test(content)) methods.push('PATCH');
  if (/export\s+(?:async\s+)?function\s+DELETE/i.test(content)) methods.push('DELETE');

  // Build route ID
  if (appRouteMatch && appRouteMatch[1] && methods.length > 0) {
    const routePath = appRouteMatch[1].replace(/\[([^\]]+)\]/g, ':$1');
    return `${methods.join('|')} /api/${routePath}`;
  }

  // Fallback to file path
  return normalizedPath;
}

/**
 * Check if file is a route handler.
 */
function isRouteHandlerFile(filePath: string): boolean {
  const normalizedPath = filePath.toLowerCase().replace(/\\/g, '/');
  return (
    normalizedPath.endsWith('/route.ts') ||
    normalizedPath.endsWith('/route.tsx') ||
    normalizedPath.includes('/api/') ||
    normalizedPath.includes('/pages/api/')
  );
}

// ---------------------------------------------------------------------------
// Authorization Path Validator Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create an Authorization Path Validator.
 *
 * @returns Authorization Path Validator implementation
 *
 * @example
 * ```typescript
 * const validator = AuthPathValidatorImpl();
 * const validations = await validator.validateAllRoutes();
 * const legacyRoutes = validator.getLegacyRoutes();
 * ```
 */
export const AuthPathValidatorImpl = (): IAuthPathValidator => {
  // Internal state for tracking validations
  const validations: Map<string, RouteAuthorizationValidation> = new Map();

  /**
   * Read file content safely.
   */
  function readFileContent(filePath: string): string | null {
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * Get all route handler files recursively.
   */
  function getRouteFiles(
    dirPath: string,
    options: ValidationOptions,
  ): string[] {
    const files: string[] = [];

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        // Skip excluded patterns
        const shouldSkip = (options.excludePatterns ?? []).some(
          (pattern) =>
            entry.name.toLowerCase() === pattern.toLowerCase() ||
            fullPath.toLowerCase().includes(pattern.toLowerCase()),
        );

        if (shouldSkip) {
          continue;
        }

        if (entry.isDirectory()) {
          files.push(...getRouteFiles(fullPath, options));
        } else if (entry.isFile()) {
          // Check if it's a route handler file
          if (isRouteHandlerFile(fullPath)) {
            files.push(fullPath);
          } else if (
            !options.apiRoutesOnly &&
            (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx'))
          ) {
            files.push(fullPath);
          }
        }
      }
    } catch {
      // Skip directories we can't read
    }

    return files;
  }

  /**
   * Validate a single route handler file.
   */
  function validateFile(
    filePath: string,
    content: string,
  ): RouteAuthorizationValidation {
    const routeId = detectRouteId(filePath, content);
    const issues: ValidationIssue[] = [];

    // Check for new authorization patterns
    let newPatternCount = 0;
    for (const pattern of NEW_AUTHORIZATION_PATTERNS) {
      pattern.regex.lastIndex = 0;
      if (pattern.regex.test(content)) {
        newPatternCount++;
      }
    }

    // Check for legacy authorization patterns
    let legacyPatternCount = 0;
    for (const pattern of LEGACY_AUTHORIZATION_PATTERNS) {
      pattern.regex.lastIndex = 0;
      const matches = content.match(pattern.regex);
      if (matches && matches.length > 0) {
        legacyPatternCount++;
        issues.push({
          severity: 'error',
          code: 'LEGACY_TENANT_ID_READ',
          message: `${pattern.description}: Found ${matches.length} occurrence(s)`,
          suggestedFix: 'Replace with Membership-based authorization via AuthorizationContext',
        });
      }
    }

    // Check for other issues
    const lines = content.split('\n');
    for (const issuePattern of ISSUE_PATTERNS) {
      issuePattern.regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = issuePattern.regex.exec(content)) !== null) {
        // Find line number
        const charIndex = match.index;
        let lineNumber = 1;
        let charCount = 0;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line !== undefined) {
            charCount += line.length + 1; // +1 for newline
          }
          if (charCount > charIndex) {
            lineNumber = i + 1;
            break;
          }
        }

        // Avoid duplicating LEGACY_TENANT_ID_READ issues
        if (
          issuePattern.code !== 'DIRECT_DB_TENANT_FILTER' ||
          !content.includes('authContext.tenantId')
        ) {
          issues.push({
            severity: issuePattern.severity,
            code: issuePattern.code,
            message: issuePattern.message,
            lineNumber,
            suggestedFix: issuePattern.suggestedFix,
          });
        }
      }
    }

    // Determine validation status
    let validationStatus: RouteValidationStatus;
    const usesMembershipAuthorization = newPatternCount > 0;
    const usesLegacyTenantId = legacyPatternCount > 0;
    const usesAuthorizationContext =
      /AuthorizationContext|authContext/g.test(content);

    if (usesLegacyTenantId && usesMembershipAuthorization) {
      validationStatus = 'partial';
      issues.push({
        severity: 'warning',
        code: 'MIXED_AUTHORIZATION',
        message: 'Route uses both legacy and new authorization patterns',
        suggestedFix: 'Complete migration to Membership-based authorization',
      });
    } else if (usesLegacyTenantId) {
      validationStatus = 'legacy';
    } else if (usesMembershipAuthorization) {
      validationStatus = 'valid';
    } else {
      validationStatus = 'unknown';
      // Only flag if it looks like a real route handler
      if (
        /export\s+(?:async\s+)?function\s+(?:GET|POST|PUT|PATCH|DELETE)/i.test(
          content,
        )
      ) {
        issues.push({
          severity: 'info',
          code: 'MISSING_AUTH_CONTEXT',
          message: 'Route handler may not have proper authorization',
          suggestedFix: 'Add AuthorizationContext resolution if this route requires authorization',
        });
      }
    }

    return {
      routeId,
      filePath,
      usesMembershipAuthorization,
      usesLegacyTenantId,
      usesAuthorizationContext,
      validationStatus,
      issues,
      validatedAt: new Date(),
    };
  }

  return {
    async validateAllRoutes(
      options?: Partial<ValidationOptions>,
    ): Promise<readonly RouteAuthorizationValidation[]> {
      const mergedOptions: ValidationOptions = {
        ...DEFAULT_VALIDATION_OPTIONS,
        ...options,
      };

      // Clear existing validations for fresh analysis
      validations.clear();

      // Get all route handler files
      const allFiles: string[] = [];
      for (const routeDir of mergedOptions.routeDirectories ?? ['src/app/api']) {
        const resolvedPath = path.resolve(process.cwd(), routeDir);
        if (fs.existsSync(resolvedPath)) {
          allFiles.push(...getRouteFiles(resolvedPath, mergedOptions));
        }
      }

      // Validate each file
      for (const filePath of allFiles) {
        const content = readFileContent(filePath);
        if (content) {
          const validation = validateFile(filePath, content);
          validations.set(validation.routeId, validation);
        }
      }

      return Array.from(validations.values());
    },

    async validateRoute(
      routeId: string,
      filePath: string,
    ): Promise<RouteAuthorizationValidation> {
      const content = readFileContent(filePath);
      if (!content) {
        return {
          routeId,
          filePath,
          usesMembershipAuthorization: false,
          usesLegacyTenantId: false,
          usesAuthorizationContext: false,
          validationStatus: 'unknown',
          issues: [
            {
              severity: 'error',
              code: 'MISSING_AUTH_CONTEXT',
              message: 'Could not read file content',
            },
          ],
          validatedAt: new Date(),
        };
      }

      const validation = validateFile(filePath, content);
      validations.set(validation.routeId, validation);
      return validation;
    },

    areAllRoutesMigrated(): boolean {
      if (validations.size === 0) {
        return false; // No routes validated yet
      }

      return Array.from(validations.values()).every(
        (v) =>
          v.validationStatus === 'valid' ||
          v.validationStatus === 'unknown', // Unknown might be non-protected routes
      );
    },

    getLegacyRoutes(): readonly string[] {
      return Array.from(validations.values())
        .filter(
          (v) =>
            v.validationStatus === 'legacy' || v.validationStatus === 'partial',
        )
        .map((v) => v.routeId);
    },
  };
};

/**
 * Type alias for cleaner DI registration.
 */
export type AuthPathValidator = IAuthPathValidator;
