'use client';

/**
 * PermissionGuard — Conditionally renders children based on user permissions.
 *
 * This component provides declarative permission-based rendering for UI elements.
 * It wraps the usePermissions hook to simplify permission checks in JSX.
 *
 * IMPORTANT: This is for UI/UX purposes only. Server-side authorization
 * is always enforced via withPermission middleware on API routes.
 *
 * Modes:
 * - `all` (default): Requires ALL specified permissions
 * - `any`: Requires at least ONE of the specified permissions
 *
 * @example
 * // Require single permission
 * <PermissionGuard permissions={['membership:read']}>
 *   <MemberList />
 * </PermissionGuard>
 *
 * @example
 * // Require all permissions
 * <PermissionGuard permissions={['membership:read', 'membership:write']} mode="all">
 *   <MemberEditor />
 * </PermissionGuard>
 *
 * @example
 * // Require any permission with fallback
 * <PermissionGuard
 *   permissions={['tenant:manage', 'orgunit:manage']}
 *   mode="any"
 *   fallback={<UnauthorizedMessage />}
 * >
 *   <AdminPanel />
 * </PermissionGuard>
 *
 * @see Requirements 22.1-22.10
 * @see Design Components > 12.1 Permission Guard
 */

import type { ReactNode } from 'react';
import { usePermissions } from '@presentation/hooks/usePermissions';
import { Spinner } from './Spinner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Permission check mode.
 * - 'all': User must have ALL specified permissions (AND logic)
 * - 'any': User must have at least ONE permission (OR logic)
 */
export type PermissionGuardMode = 'all' | 'any';

/**
 * Props for PermissionGuard component.
 */
export interface PermissionGuardProps {
  /**
   * Array of permission codes to check.
   * @example ['membership:read', 'membership:write']
   */
  permissions: string[];

  /**
   * Permission check mode.
   * - 'all' (default): Requires ALL permissions
   * - 'any': Requires at least ONE permission
   * @default 'all'
   */
  mode?: PermissionGuardMode;

  /**
   * Content to render when user has required permissions.
   */
  children: ReactNode;

  /**
   * Content to render when user lacks required permissions.
   * Defaults to null (render nothing).
   */
  fallback?: ReactNode;

  /**
   * Content to render while permissions are loading.
   * Defaults to a centered spinner.
   */
  loadingFallback?: ReactNode;

  /**
   * Whether to show the loading state.
   * Set to false to render nothing while loading.
   * @default true
   */
  showLoading?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * PermissionGuard — Conditionally renders children based on user permissions.
 *
 * @param props - Component props
 * @returns Rendered children, fallback, or null based on permission check
 */
export function PermissionGuard({
  permissions,
  mode = 'all',
  children,
  fallback = null,
  loadingFallback,
  showLoading = true,
}: PermissionGuardProps): ReactNode {
  const { hasAllPermissions, hasAnyPermission, isLoading } = usePermissions();

  // Handle loading state
  if (isLoading) {
    if (!showLoading) {
      return null;
    }

    // Return custom loading fallback or default spinner
    if (loadingFallback !== undefined) {
      return loadingFallback;
    }

    return (
      <div className="flex items-center justify-center p-4">
        <Spinner size="sm" />
      </div>
    );
  }

  // Handle empty permissions array - always grant access
  if (permissions.length === 0) {
    return children;
  }

  // Check permissions based on mode
  const hasAccess =
    mode === 'all'
      ? hasAllPermissions(permissions)
      : hasAnyPermission(permissions);

  // Render children or fallback
  return hasAccess ? children : fallback;
}

// ---------------------------------------------------------------------------
// Named Export
// ---------------------------------------------------------------------------

export default PermissionGuard;
