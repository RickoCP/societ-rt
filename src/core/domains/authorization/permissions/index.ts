/**
 * Permissions barrel export.
 */

export {
  // Permission types
  type Permission,
  type PermissionAction,
  type PermissionDomain,
  type PermissionCode,
  // Permission constants
  PERMISSIONS,
  PERMISSION_BY_CODE,
  ALL_PERMISSION_CODES,
  // Permission helpers
  createPermission,
  parsePermissionCode,
  isValidPermissionCode,
} from './Permission';

export {
  // Role-Permission mapping
  ROLE_PERMISSIONS,
  getPermissionsForRole,
  roleHasPermission,
  roleHasAllPermissions,
  getMissingPermissions,
  validatePermissionRegistry,
  // Frozen registry
  PERMISSION_REGISTRY,
  type PermissionRegistry,
} from './PermissionRegistry';
