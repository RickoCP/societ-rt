/**
 * Code Path Analyzer — Identifies User.tenantId usages in the codebase.
 *
 * This service performs static analysis to find all code paths that read
 * User.tenantId, classifies them by authorization relevance, and tracks
 * migration status.
 *
 * **IMPORTANT:** This is a development/migration tool, not a runtime service.
 * It should be run during migration planning and progress tracking.
 *
 * @see Task 35: Code Path Analysis and Update
 * @see Requirement 12 (AC 1-2)
 * @see INV-AUTH-001: JWT role/permission claims are never authorization authority
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type {
  ICodePathAnalyzer,
  CodePathUsage,
  CodePathClassification,
  CodePathMigrationStatus,
  MigrationPriority,
  UsageContext,
  DetectionPattern,
  AnalysisOptions,
} from './types';
import {
  DEFAULT_ANALYSIS_OPTIONS,
} from './types';

// ---------------------------------------------------------------------------
// Detection Patterns
// ---------------------------------------------------------------------------

/**
 * Patterns for detecting User.tenantId usages in code.
 *
 * These patterns are ordered by specificity:
 * 1. Authorization-critical patterns (highest priority)
 * 2. Database query patterns
 * 3. General access patterns
 */
const DETECTION_PATTERNS: readonly DetectionPattern[] = [
  // Authorization-critical patterns (direct authorization checks)
  {
    patternId: 'auth-tenant-check',
    name: 'Authorization Tenant Check',
    regex: /(?:user|currentUser|authUser)\.tenantId\s*(?:===|!==|==|!=)/gi,
    defaultClassification: 'authorization-critical',
    defaultPriority: 'critical',
    description: 'Direct comparison of User.tenantId for authorization decision',
  },
  {
    patternId: 'auth-context-legacy',
    name: 'Legacy Auth Context',
    regex: /(?:req|request)\.user\.tenantId/gi,
    defaultClassification: 'authorization-critical',
    defaultPriority: 'critical',
    description: 'Access to tenantId from request user object (legacy pattern)',
  },
  {
    patternId: 'middleware-tenant',
    name: 'Middleware Tenant Access',
    regex: /(?:headers|context).*tenantId.*authorization/gi,
    defaultClassification: 'authorization-critical',
    defaultPriority: 'critical',
    description: 'Middleware accessing tenantId for authorization',
  },

  // Database query patterns
  {
    patternId: 'prisma-tenant-where',
    name: 'Prisma Tenant Where Clause',
    regex: /where:\s*\{[^}]*tenantId:\s*(?:user|currentUser|req\.user)\.tenantId/gi,
    defaultClassification: 'authorization-critical',
    defaultPriority: 'high',
    description: 'Prisma query filtering by User.tenantId',
  },
  {
    patternId: 'db-tenant-filter',
    name: 'Database Tenant Filter',
    regex: /tenant_?[Ii]d:\s*(?:user|currentUser)\.tenantId/gi,
    defaultClassification: 'authorization-critical',
    defaultPriority: 'high',
    description: 'Database query using User.tenantId for filtering',
  },

  // Read-only patterns (lower priority)
  {
    patternId: 'logging-tenant',
    name: 'Logging Tenant ID',
    regex: /(?:log|logger|console)\.[a-z]+\([^)]*(?:user|currentUser)\.tenantId/gi,
    defaultClassification: 'read-only',
    defaultPriority: 'low',
    description: 'Logging User.tenantId for observability',
  },
  {
    patternId: 'audit-tenant',
    name: 'Audit Tenant ID',
    regex: /(?:audit|track|record)[^)]*(?:user|currentUser)\.tenantId/gi,
    defaultClassification: 'read-only',
    defaultPriority: 'medium',
    description: 'Recording User.tenantId in audit trail',
  },

  // General access patterns (catch-all)
  {
    patternId: 'user-tenant-access',
    name: 'User TenantId Access',
    regex: /user\.tenantId(?![A-Za-z])/gi,
    defaultClassification: 'non-authorization',
    defaultPriority: 'medium',
    description: 'General access to user.tenantId',
  },
  {
    patternId: 'current-user-tenant',
    name: 'Current User TenantId',
    regex: /currentUser\.tenantId/gi,
    defaultClassification: 'non-authorization',
    defaultPriority: 'medium',
    description: 'Access to currentUser.tenantId',
  },
  {
    patternId: 'legacy-user-tenant',
    name: 'Legacy User TenantId Field',
    regex: /User\.[^.]*tenantId|\.tenantId\s*(?:as|:)/gi,
    defaultClassification: 'non-authorization',
    defaultPriority: 'medium',
    description: 'Reference to User model tenantId field',
  },
];

// ---------------------------------------------------------------------------
// Context Classification
// ---------------------------------------------------------------------------

/**
 * Determine the usage context for a code path.
 */
function determineUsageContext(
  filePath: string,
  codeSnippet: string,
  surroundingCode: string,
): UsageContext {
  const normalizedPath = filePath.toLowerCase().replace(/\\/g, '/');

  // Check file type
  const isTestFile =
    normalizedPath.includes('.test.') ||
    normalizedPath.includes('.spec.') ||
    normalizedPath.includes('__tests__') ||
    normalizedPath.includes('/test/');

  const isRouteHandler =
    normalizedPath.includes('/api/') ||
    normalizedPath.includes('/app/api/') ||
    normalizedPath.includes('route.ts');

  const isMiddleware =
    normalizedPath.includes('middleware') ||
    normalizedPath.includes('/middleware/');

  const isWorker =
    normalizedPath.includes('worker') ||
    normalizedPath.includes('/workers/') ||
    normalizedPath.includes('/jobs/');

  // Check code patterns
  const combinedCode = `${codeSnippet}\n${surroundingCode}`;

  const isAuthorizationCheck =
    /(?:authorize|permission|access|grant|deny|allow|reject)/i.test(combinedCode) ||
    /(?:auth|AuthorizationContext|RequirePermission)/i.test(combinedCode);

  const isDatabaseQuery =
    /(?:prisma|findMany|findFirst|findUnique|create|update|delete|where)/i.test(
      combinedCode,
    );

  // Try to extract function name
  const functionMatch = combinedCode.match(
    /(?:async\s+)?(?:function\s+)?(\w+)\s*[=(]/,
  );
  const functionName = functionMatch?.[1];

  // Try to extract class name
  const classMatch = surroundingCode.match(/class\s+(\w+)/);
  const className = classMatch?.[1];

  return {
    isAuthorizationCheck,
    isDatabaseQuery,
    isRouteHandler,
    isMiddleware,
    isWorker,
    isTestFile,
    functionName,
    className,
  };
}

/**
 * Refine classification based on context.
 */
function refineClassification(
  initialClassification: CodePathClassification,
  context: UsageContext,
): CodePathClassification {
  // Test files are always non-authorization
  if (context.isTestFile) {
    return 'non-authorization';
  }

  // Route handlers with authorization checks are critical
  if (context.isRouteHandler && context.isAuthorizationCheck) {
    return 'authorization-critical';
  }

  // Middleware with authorization is critical
  if (context.isMiddleware && context.isAuthorizationCheck) {
    return 'authorization-critical';
  }

  // Database queries in route handlers need attention
  if (context.isRouteHandler && context.isDatabaseQuery) {
    return initialClassification === 'non-authorization'
      ? 'authorization-critical'
      : initialClassification;
  }

  return initialClassification;
}

/**
 * Determine suggested action based on classification and context.
 */
function getSuggestedAction(
  classification: CodePathClassification,
  context: UsageContext,
): string {
  switch (classification) {
    case 'authorization-critical':
      if (context.isRouteHandler) {
        return 'Replace with authContext.tenantId from AuthorizationContext. Update route handler to use RequirePermission decorator.';
      }
      if (context.isMiddleware) {
        return 'Remove tenantId check from middleware. Authorization should be handled by AuthorizationContextResolver.';
      }
      if (context.isDatabaseQuery) {
        return 'Use authContext.tenantId from the resolved AuthorizationContext instead of User.tenantId.';
      }
      return 'Replace with Membership-based tenant resolution via AuthorizationContext.';

    case 'read-only':
      return 'Add deprecation warning wrapper. Plan to migrate to authContext.tenantId.';

    case 'backward-compat':
      return 'Document external integration dependency. Create migration plan with transition period.';

    case 'non-authorization':
      return 'Low priority. Can be migrated during cleanup phase or left with deprecation warning.';

    default:
      return 'Review and classify manually.';
  }
}

/**
 * Calculate migration priority based on context.
 */
function calculatePriority(
  classification: CodePathClassification,
  context: UsageContext,
): MigrationPriority {
  // Authorization-critical in route handlers is highest priority
  if (classification === 'authorization-critical') {
    if (context.isRouteHandler || context.isMiddleware) {
      return 'critical';
    }
    return 'high';
  }

  // Workers might have async/background authorization needs
  if (context.isWorker && classification !== 'non-authorization') {
    return 'high';
  }

  // Read-only for logging/audit is lower priority
  if (classification === 'read-only') {
    return 'low';
  }

  // Backward compatibility needs planning
  if (classification === 'backward-compat') {
    return 'medium';
  }

  return 'low';
}

// ---------------------------------------------------------------------------
// Code Path Analyzer Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a Code Path Analyzer.
 *
 * @returns Code Path Analyzer implementation
 *
 * @example
 * ```typescript
 * const analyzer = CodePathAnalyzerImpl();
 * const usages = await analyzer.analyzeCodePaths({
 *   includePaths: ['src'],
 *   excludePatterns: ['node_modules'],
 * });
 * ```
 */
export const CodePathAnalyzerImpl = (): ICodePathAnalyzer => {
  // Internal state for tracking usages
  const usages: Map<string, CodePathUsage> = new Map();

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
   * Get surrounding lines for context.
   */
  function getSurroundingLines(
    lines: readonly string[],
    lineIndex: number,
    contextLines: number = 5,
  ): string {
    const start = Math.max(0, lineIndex - contextLines);
    const end = Math.min(lines.length, lineIndex + contextLines + 1);
    return lines.slice(start, end).join('\n');
  }

  /**
   * Check if file should be included in analysis.
   */
  function shouldIncludeFile(
    filePath: string,
    options: AnalysisOptions,
  ): boolean {
    const normalizedPath = filePath.toLowerCase().replace(/\\/g, '/');

    // Check exclude patterns
    for (const pattern of options.excludePatterns ?? []) {
      if (normalizedPath.includes(pattern.toLowerCase())) {
        return false;
      }
    }

    // Check if it's a TypeScript/JavaScript file
    if (
      !normalizedPath.endsWith('.ts') &&
      !normalizedPath.endsWith('.tsx') &&
      !normalizedPath.endsWith('.js') &&
      !normalizedPath.endsWith('.jsx')
    ) {
      return false;
    }

    // Exclude test files unless specified
    if (!options.includeTests) {
      if (
        normalizedPath.includes('.test.') ||
        normalizedPath.includes('.spec.') ||
        normalizedPath.includes('__tests__')
      ) {
        return false;
      }
    }

    return true;
  }

  /**
   * Recursively get all files in a directory.
   */
  function getFilesRecursively(
    dirPath: string,
    options: AnalysisOptions,
    currentDepth: number = 0,
  ): string[] {
    if (currentDepth > (options.maxDepth ?? 10)) {
      return [];
    }

    const files: string[] = [];

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        // Skip excluded directories
        const shouldSkip = (options.excludePatterns ?? []).some(
          (pattern) =>
            entry.name.toLowerCase() === pattern.toLowerCase() ||
            fullPath.toLowerCase().includes(pattern.toLowerCase()),
        );

        if (shouldSkip) {
          continue;
        }

        if (entry.isDirectory()) {
          files.push(...getFilesRecursively(fullPath, options, currentDepth + 1));
        } else if (entry.isFile() && shouldIncludeFile(fullPath, options)) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }

    return files;
  }

  /**
   * Analyze a single file for User.tenantId usages.
   */
  function analyzeFile(filePath: string): CodePathUsage[] {
    const content = readFileContent(filePath);
    if (!content) {
      return [];
    }

    const fileUsages: CodePathUsage[] = [];
    const lines = content.split('\n');

    // Check each line against detection patterns
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const lineNumber = lineIndex + 1;

      for (const pattern of DETECTION_PATTERNS) {
        // Reset regex lastIndex for global patterns
        pattern.regex.lastIndex = 0;

        let match: RegExpExecArray | null;
        while (line !== undefined && (match = pattern.regex.exec(line)) !== null) {
          const columnNumber = match.index + 1;
          const surroundingCode = getSurroundingLines(lines, lineIndex);

          // Determine context
          const context = determineUsageContext(
            filePath,
            line ?? '',
            surroundingCode,
          );

          // Refine classification based on context
          const classification = refineClassification(
            pattern.defaultClassification,
            context,
          );

          // Calculate priority
          const priority = calculatePriority(classification, context);

          // Get suggested action
          const suggestedAction = getSuggestedAction(classification, context);

          // Create usage entry
          const usage: CodePathUsage = {
            id: randomUUID(),
            filePath,
            lineNumber,
            columnNumber,
            codeSnippet: line?.trim() ?? '',
            classification,
            priority,
            status: 'pending',
            usageContext: context,
            suggestedAction,
            notes: `Detected by pattern: ${pattern.name}`,
          };

          fileUsages.push(usage);

          // Break to avoid duplicate matches on same line for similar patterns
          break;
        }
      }
    }

    return fileUsages;
  }

  return {
    async analyzeCodePaths(
      options?: Partial<AnalysisOptions>,
    ): Promise<readonly CodePathUsage[]> {
      const mergedOptions: AnalysisOptions = {
        ...DEFAULT_ANALYSIS_OPTIONS,
        ...options,
      };

      // Clear existing usages for fresh analysis
      usages.clear();

      // Get all files to analyze
      const allFiles: string[] = [];
      for (const includePath of mergedOptions.includePaths ?? ['src']) {
        const resolvedPath = path.resolve(process.cwd(), includePath);
        if (fs.existsSync(resolvedPath)) {
          if (fs.statSync(resolvedPath).isDirectory()) {
            allFiles.push(...getFilesRecursively(resolvedPath, mergedOptions));
          } else {
            allFiles.push(resolvedPath);
          }
        }
      }

      // Analyze each file
      for (const filePath of allFiles) {
        const fileUsages = analyzeFile(filePath);
        for (const usage of fileUsages) {
          usages.set(usage.id, usage);
        }
      }

      return Array.from(usages.values());
    },

    getUsagesByClassification(
      classification: CodePathClassification,
    ): readonly CodePathUsage[] {
      return Array.from(usages.values()).filter(
        (u) => u.classification === classification,
      );
    },

    getUsagesByStatus(status: CodePathMigrationStatus): readonly CodePathUsage[] {
      return Array.from(usages.values()).filter((u) => u.status === status);
    },

    updateMigrationStatus(
      usageId: string,
      status: CodePathMigrationStatus,
      notes?: string,
    ): void {
      const usage = usages.get(usageId);
      if (usage) {
        // Create updated usage (immutable pattern)
        const updatedUsage: CodePathUsage = {
          ...usage,
          status,
          notes: notes ?? usage.notes,
        };
        usages.set(usageId, updatedUsage);
      }
    },
  };
};

/**
 * Type alias for cleaner DI registration.
 */
export type CodePathAnalyzer = ICodePathAnalyzer;
