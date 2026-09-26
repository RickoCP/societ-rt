/**
 * Legacy Authorization Adapter
 *
 * Wraps the legacy User.tenantId + UserRole authorization check for shadow
 * authorization validation (FASE 1.9).
 *
 * This adapter implements the legacy authorization logic that uses:
 * - User.tenantId (1:1 relationship)
 * - User.role (UserRole enum)
 *
 * The result is structured for comparison with the new Membership-based
 * authorization system in shadow mode.
 *
 * **IMPORTANT:** This adapter exists ONLY for shadow validation during migration.
 * After migration is complete (post-FASE 1.15), this adapter should be deprecated
 * alongside the legacy User.tenantId column.
 *
 * @see Requirements 7 (AC 1-3)
 * @see Design Shadow Authorization Validation section
 * @see LegacyRoleMapping for role conversion
 */

import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import { unexpectedError } from '@core/utils';
import { UserRole } from '@core/protocols';
import type { AuthorizationDecision } from '@core/domains/authorization/types';

// ---------------------------------------------------------------------------
// Legacy User Data Types
// ---------------------------------------------------------------------------

/**
 * Legacy user data structure for authorization check.
 * 
 * This represents the legacy authorization-relevant fields from the User model.
 */
export interface LegacyUserData {
  /**
   * User ID.
   */
  readonly id: string;

  /**
   * Legacy tenant ID (1:1 relationship).
   * NULL for platform anomalies or users without tenant assignment.
   */
  readonly tenantId: string | null;

  /**
   * Legacy role from UserRole enum.
   */
  readonly role: UserRole;

  /**
   * Token version for invalidation check.
   */
  readonly tokenVersion: number;
}

/**
 * Input for legacy authorization check.
 */
export interface LegacyAuthorizationInput {
  /**
   * User ID to authorize.
   */
  readonly userId: string;

  /**
   * Target tenant ID (from request context).
   */
  readonly targetTenantId: string;

  /**
   * Token version from JWT for validation.
   */
  readonly jwtTokenVersion: number;

  /**
   * Required permissions (mapped to role check).
   */
  readonly requiredPermissions: readonly string[];
}

// ---------------------------------------------------------------------------
// Legacy Permission Mapping
// ---------------------------------------------------------------------------

/**
 * Legacy role-based permission approximation.
 *
 * This is a simplified mapping for shadow comparison.
 * The new system uses explicit permission registry; this is for comparison only.
 *
 * Higher roles were assumed to have broader permissions in the legacy system.
 */
const LEGACY_ROLE_HIERARCHY: ReadonlyMap<UserRole, number> = new Map([
  [UserRole.Super_Admin, 100],
  [UserRole.Ketua_RT, 80],
  [UserRole.Pengurus, 60],
  [UserRole.Security_Guard, 40],
  [UserRole.Warga, 20],
]);

/**
 * Permission prefixes that require certain minimum role levels.
 * This approximates the implicit authorization in the legacy system.
 */
const LEGACY_PERMISSION_REQUIREMENTS: ReadonlyMap<string, number> = new Map([
  ['platform:', 100], // Super_Admin only
  ['tenant:', 80], // Ketua_RT+
  ['finance:', 80], // Ketua_RT+
  ['membership:', 60], // Pengurus+
  ['announcement:', 60], // Pengurus+
  ['resident:', 40], // Security_Guard+
  ['emergency:', 20], // All authenticated users
  ['iot:', 60], // Pengurus+
]);

/**
 * Check if a legacy role satisfies permission requirements.
 */
function legacyRoleSatisfiesPermission(
  role: UserRole,
  permission: string,
): boolean {
  const roleLevel = LEGACY_ROLE_HIERARCHY.get(role) ?? 0;

  // Find the highest requirement that matches this permission prefix
  let requiredLevel = 0;
  for (const [prefix, level] of LEGACY_PERMISSION_REQUIREMENTS) {
    if (permission.startsWith(prefix) && level > requiredLevel) {
      requiredLevel = level;
    }
  }

  // If no specific requirement found, default to allowing authenticated users
  if (requiredLevel === 0) {
    requiredLevel = 20; // Warga level
  }

  return roleLevel >= requiredLevel;
}

// ---------------------------------------------------------------------------
// Repository Interface for User Lookup
// ---------------------------------------------------------------------------

/**
 * Repository interface for legacy user lookup.
 *
 * Used by the adapter to retrieve legacy user data for authorization.
 */
export interface ILegacyUserRepository {
  /**
   * Find user by ID with legacy authorization fields.
   */
  findById(userId: string): Promise<LegacyUserData | null>;
}

// ---------------------------------------------------------------------------
// Adapter Interface
// ---------------------------------------------------------------------------

/**
 * Legacy Authorization Adapter interface.
 *
 * Provides methods to execute legacy authorization logic for shadow comparison.
 */
export interface ILegacyAuthorizationAdapter {
  /**
   * Execute legacy authorization check.
   *
   * @param input - Legacy authorization input
   * @returns Authorization decision based on legacy logic
   */
  authorize(
    input: LegacyAuthorizationInput,
  ): Promise<DomainResult<AuthorizationDecision>>;

  /**
   * Get legacy user data for comparison context.
   *
   * @param userId - User ID to look up
   * @returns Legacy user data or null if not found
   */
  getLegacyUserData(userId: string): Promise<LegacyUserData | null>;
}

// ---------------------------------------------------------------------------
// Adapter Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a Legacy Authorization Adapter.
 *
 * Follows Clean Architecture DI pattern — dependencies are injected.
 *
 * @param legacyUserRepository - Repository for legacy user lookup
 * @returns Legacy Authorization Adapter implementation
 *
 * @example
 * ```typescript
 * // DI Registration
 * container.register({
 *   legacyAuthorizationAdapter: asFunction(LegacyAuthorizationAdapterImpl).singleton(),
 * });
 *
 * // Usage in shadow authorization
 * const legacyResult = await adapter.authorize({
 *   userId: 'user-123',
 *   targetTenantId: 'tenant-456',
 *   jwtTokenVersion: 1,
 *   requiredPermissions: ['resident:read'],
 * });
 * ```
 */
export const LegacyAuthorizationAdapterImpl = ({
  legacyUserRepository,
}: {
  legacyUserRepository: ILegacyUserRepository;
}): ILegacyAuthorizationAdapter => {
  return {
    async authorize(
      input: LegacyAuthorizationInput,
    ): Promise<DomainResult<AuthorizationDecision>> {
      try {
        const { userId, targetTenantId, jwtTokenVersion, requiredPermissions } = input;

        // Step 1: Look up legacy user data
        const user = await legacyUserRepository.findById(userId);

        if (!user) {
          return ok({
            allowed: false,
            reason: 'User not found',
            errorCode: 'AUTH_NO_USER',
            tenantId: targetTenantId,
          });
        }

        // Step 2: Token version check (legacy also had this)
        if (user.tokenVersion !== jwtTokenVersion) {
          return ok({
            allowed: false,
            reason: 'Token version mismatch',
            errorCode: 'AUTH_TOKEN_REVOKED',
            role: user.role,
            tenantId: user.tenantId ?? undefined,
          });
        }

        // Step 3: Tenant check (legacy 1:1 relationship)
        // In legacy system, User.tenantId must match target
        if (user.tenantId === null) {
          // User without tenant — only Super_Admin could operate cross-tenant
          if (user.role !== UserRole.Super_Admin) {
            return ok({
              allowed: false,
              reason: 'User has no tenant assignment',
              errorCode: 'AUTH_NO_TENANT',
              role: user.role,
              tenantId: undefined,
            });
          }
          // Super_Admin without tenantId was allowed in legacy (platform-level)
        } else if (user.tenantId !== targetTenantId) {
          // Tenant mismatch — legacy did not support multi-tenant users
          // Exception: Super_Admin could sometimes access other tenants
          if (user.role !== UserRole.Super_Admin) {
            return ok({
              allowed: false,
              reason: 'Tenant mismatch (legacy 1:1 tenancy)',
              errorCode: 'AUTH_TENANT_MISMATCH',
              role: user.role,
              tenantId: user.tenantId,
            });
          }
        }

        // Step 4: Permission check (legacy role-based)
        // Legacy system used implicit role hierarchy for permissions
        const insufficientPermissions: string[] = [];

        for (const permission of requiredPermissions) {
          if (!legacyRoleSatisfiesPermission(user.role, permission)) {
            insufficientPermissions.push(permission);
          }
        }

        if (insufficientPermissions.length > 0) {
          return ok({
            allowed: false,
            reason: `Insufficient permissions: ${insufficientPermissions.join(', ')}`,
            errorCode: 'AUTH_INSUFFICIENT_PERMISSION',
            role: user.role,
            tenantId: user.tenantId ?? undefined,
          });
        }

        // Step 5: Success
        return ok({
          allowed: true,
          reason: 'Legacy authorization passed',
          role: user.role,
          tenantId: user.tenantId ?? undefined,
        });
      } catch (error) {
        // Fail closed on unexpected errors
        return fail(
          unexpectedError(
            'LEGACY_AUTH_FAILED',
            `Legacy authorization failed unexpectedly: ${error instanceof Error ? error.message : 'Unknown error'}`,
            { cause: error },
          ),
        );
      }
    },

    async getLegacyUserData(userId: string): Promise<LegacyUserData | null> {
      return legacyUserRepository.findById(userId);
    },
  };
};

/**
 * Type alias for cleaner DI registration.
 */
export type LegacyAuthorizationAdapter = ILegacyAuthorizationAdapter;

