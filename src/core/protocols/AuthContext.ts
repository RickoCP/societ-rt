/**
 * AuthContext — Represents the authenticated user context resolved from
 * the JWT token by middleware.
 *
 * Passed into use cases so business logic can make tenant-scoped and
 * role-aware decisions without knowing about HTTP or cookies.
 *
 * @see Requirements 4.1
 */

/**
 * @deprecated **This enum is deprecated and will be removed 30 days after migration completion validation.**
 *
 * Use `MembershipRole` from `@infrastructure/middleware/authorization` instead.
 * The new role system is permission-based rather than role-based.
 *
 * @see {@link MembershipRole} from `@infrastructure/middleware/authorization`
 * @see Requirements 18.2
 */
export enum UserRole {
  Super_Admin = 'Super_Admin',
  Ketua_RT = 'Ketua_RT',
  Pengurus = 'Pengurus',
  Warga = 'Warga',
  Security_Guard = 'Security_Guard',
}

/**
 * @deprecated **This type is deprecated and will be removed 30 days after migration completion validation.**
 *
 * **Migration Guide:**
 * Use `AuthorizationContext` from `@infrastructure/middleware/authorization` instead.
 *
 * `AuthorizationContext` is the new authorization type with enhanced security features including:
 * - Full tenant and organization unit scoping
 * - Permission-based access control
 * - Membership lifecycle management
 * - Token version validation
 * - RLS database integration
 *
 * **Example migration:**
 * ```typescript
 * // Before (deprecated):
 * import { AuthContext } from '@core/protocols';
 *
 * // After:
 * import { AuthorizationContext } from '@infrastructure/middleware/authorization';
 * ```
 *
 * @see {@link AuthorizationContext} from `@infrastructure/middleware/authorization`
 * @see Requirements 18.2
 */
export interface AuthContext {
  readonly userId: string;
  readonly tenantId: string;
  readonly role: UserRole;
  readonly isImpersonating?: boolean;
  readonly impersonatorId?: string;
}
