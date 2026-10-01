'use client';

/**
 * usePermissions — Hook for permission-based authorization in UI components.
 *
 * Fetches user permissions from the API and provides utility functions
 * to check if the user has required permissions.
 *
 * IMPORTANT: UI permission checks are for UX purposes only.
 * Server-side authorization is always enforced via withPermission middleware.
 *
 * @see Requirements 22.1-22.10
 * @see Design Components > 12.1 Permission Guard
 */

import { useEffect, useState, useCallback, useMemo } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * User context returned from /api/auth/me
 */
export interface UserContext {
  userId: string;
  name: string | null;
  email: string;
  role: string;
  tenantId: string;
  membershipId: string;
  orgUnitId: string | null;
  permissions: string[];
}

/**
 * Return type of usePermissions hook
 */
export interface UsePermissionsResult {
  /**
   * Check if user has a specific permission.
   * @param permission - Permission code (e.g., 'membership:read')
   * @returns true if user has the permission, false otherwise
   */
  hasPermission: (permission: string) => boolean;

  /**
   * Check if user has ALL specified permissions.
   * @param permissions - Array of permission codes
   * @returns true if user has ALL permissions, false otherwise
   */
  hasAllPermissions: (permissions: string[]) => boolean;

  /**
   * Check if user has ANY of the specified permissions.
   * @param permissions - Array of permission codes
   * @returns true if user has at least ONE permission, false otherwise
   */
  hasAnyPermission: (permissions: string[]) => boolean;

  /**
   * Whether permissions are currently being loaded.
   */
  isLoading: boolean;

  /**
   * Whether permission loading has failed.
   */
  isError: boolean;

  /**
   * Error message if loading failed.
   */
  error: string | null;

  /**
   * The user's role (from server-resolved context).
   */
  role: string | null;

  /**
   * The complete set of user permissions.
   */
  permissions: ReadonlySet<string>;

  /**
   * The full user context (if loaded).
   */
  userContext: UserContext | null;
}

// ---------------------------------------------------------------------------
// Cache for user context (simple singleton to avoid redundant fetches)
// ---------------------------------------------------------------------------

interface CacheState {
  data: UserContext | null;
  isLoading: boolean;
  error: string | null;
  fetchPromise: Promise<UserContext | null> | null;
}

const cache: CacheState = {
  data: null,
  isLoading: false,
  error: null,
  fetchPromise: null,
};

const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach(listener => listener());
}

async function fetchUserContext(): Promise<UserContext | null> {
  // If already fetching, return the existing promise
  if (cache.fetchPromise) {
    return cache.fetchPromise;
  }

  // If already loaded successfully, return cached data
  if (cache.data && !cache.error) {
    return cache.data;
  }

  cache.isLoading = true;
  cache.error = null;
  notifyListeners();

  cache.fetchPromise = (async () => {
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          // User not authenticated - this is expected for unauthenticated pages
          cache.data = null;
          cache.error = null;
          return null;
        }
        throw new Error(`Failed to fetch user context: ${response.status}`);
      }

      const json = await response.json();

      if (json?.data) {
        cache.data = json.data as UserContext;
        cache.error = null;
        return cache.data;
      }

      throw new Error('Invalid response format');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      cache.error = message;
      cache.data = null;
      return null;
    } finally {
      cache.isLoading = false;
      cache.fetchPromise = null;
      notifyListeners();
    }
  })();

  return cache.fetchPromise;
}

/**
 * Invalidate the permission cache.
 * Call this after context switch or logout.
 */
export function invalidatePermissionsCache(): void {
  cache.data = null;
  cache.error = null;
  cache.isLoading = false;
  cache.fetchPromise = null;
  notifyListeners();
}

// ---------------------------------------------------------------------------
// Hook Implementation
// ---------------------------------------------------------------------------

/**
 * usePermissions — React hook for permission-based UI authorization.
 *
 * Usage:
 * ```tsx
 * const { hasPermission, hasAllPermissions, isLoading } = usePermissions();
 *
 * if (isLoading) return <Spinner />;
 * if (!hasPermission('membership:read')) return <Unauthorized />;
 * return <MemberList />;
 * ```
 *
 * @returns UsePermissionsResult with permission check utilities
 */
export function usePermissions(): UsePermissionsResult {
  const [, forceUpdate] = useState({});

  // Subscribe to cache changes
  useEffect(() => {
    const listener = () => forceUpdate({});
    listeners.add(listener);

    // Trigger initial fetch if not already loaded
    if (!cache.data && !cache.isLoading && !cache.error) {
      fetchUserContext();
    }

    return () => {
      listeners.delete(listener);
    };
  }, []);

  // Convert permissions array to Set for O(1) lookups (memoized)
  const permissionsSet = useMemo(() => {
    if (!cache.data?.permissions) {
      return new Set<string>();
    }
    return new Set(cache.data.permissions);
  }, [cache.data?.permissions]);

  // Check if user has a specific permission
  const hasPermission = useCallback(
    (permission: string): boolean => {
      if (!cache.data) return false;
      return permissionsSet.has(permission);
    },
    [permissionsSet],
  );

  // Check if user has ALL specified permissions
  const hasAllPermissions = useCallback(
    (permissions: string[]): boolean => {
      if (!cache.data) return false;
      if (permissions.length === 0) return true;
      return permissions.every(p => permissionsSet.has(p));
    },
    [permissionsSet],
  );

  // Check if user has ANY of the specified permissions
  const hasAnyPermission = useCallback(
    (permissions: string[]): boolean => {
      if (!cache.data) return false;
      if (permissions.length === 0) return true;
      return permissions.some(p => permissionsSet.has(p));
    },
    [permissionsSet],
  );

  return {
    hasPermission,
    hasAllPermissions,
    hasAnyPermission,
    isLoading: cache.isLoading,
    isError: cache.error !== null,
    error: cache.error,
    role: cache.data?.role ?? null,
    permissions: permissionsSet,
    userContext: cache.data,
  };
}

export default usePermissions;
