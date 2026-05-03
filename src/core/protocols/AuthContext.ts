/**
 * AuthContext — Represents the authenticated user context resolved from
 * the JWT token by middleware.
 *
 * Passed into use cases so business logic can make tenant-scoped and
 * role-aware decisions without knowing about HTTP or cookies.
 *
 * @see Requirements 4.1
 */

export enum UserRole {
  Super_Admin = 'Super_Admin',
  Ketua_RT = 'Ketua_RT',
  Pengurus = 'Pengurus',
  Warga = 'Warga',
  Security_Guard = 'Security_Guard',
}

export interface AuthContext {
  readonly userId: string;
  readonly tenantId: string;
  readonly role: UserRole;
  readonly isImpersonating?: boolean;
  readonly impersonatorId?: string;
}
