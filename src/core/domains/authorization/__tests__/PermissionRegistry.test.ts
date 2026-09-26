/**
 * PermissionRegistry Unit Tests
 *
 * Tests the central permission registry functionality including:
 * - Explicit role-to-permission mapping (no inheritance)
 * - SECURITY vs RESIDENT permission distinction
 * - Unknown permission fail-closed behavior
 * - Registry immutability
 *
 * @see Requirements 2.1-2.8
 */

import { describe, it, expect } from 'vitest';
import { MembershipRole } from '@core/domains/membership/types';
import {
  PERMISSIONS,
  PERMISSION_BY_CODE,
  ALL_PERMISSION_CODES,
  isValidPermissionCode,
  parsePermissionCode,
} from '../permissions/Permission';
import {
  ROLE_PERMISSIONS,
  PERMISSION_REGISTRY,
  getPermissionsForRole,
  roleHasPermission,
  roleHasAllPermissions,
  getMissingPermissions,
  validatePermissionRegistry,
} from '../permissions/PermissionRegistry';

describe('PermissionRegistry', () => {
  // =========================================================================
  // Requirement 2.1 — Permissions defined as typed constants
  // =========================================================================
  describe('Permission Constants (Req 2.1)', () => {
    it('should define all permissions with domain:action format', () => {
      for (const [key, permission] of Object.entries(PERMISSIONS)) {
        expect(permission.code).toBe(`${permission.domain}:${permission.action}`);
        expect(permission.description).toBeTruthy();
        // Verify key naming convention
        expect(key).toMatch(/^[A-Z][A-Z0-9_]*$/);
      }
    });

    it('should have unique permission codes', () => {
      const codes = Object.values(PERMISSIONS).map((p) => p.code);
      const uniqueCodes = new Set(codes);
      expect(codes.length).toBe(uniqueCodes.size);
    });

    it('should freeze all permission objects', () => {
      for (const permission of Object.values(PERMISSIONS)) {
        expect(Object.isFrozen(permission)).toBe(true);
      }
    });

    it('should provide PERMISSION_BY_CODE lookup map', () => {
      expect(PERMISSION_BY_CODE.size).toBe(Object.keys(PERMISSIONS).length);
      
      for (const permission of Object.values(PERMISSIONS)) {
        expect(PERMISSION_BY_CODE.get(permission.code)).toBe(permission);
      }
    });

    it('should provide ALL_PERMISSION_CODES array', () => {
      expect(ALL_PERMISSION_CODES.length).toBe(Object.keys(PERMISSIONS).length);
      expect(Object.isFrozen(ALL_PERMISSION_CODES)).toBe(true);
    });
  });

  // =========================================================================
  // Requirement 2.2 — Explicit role-to-permission mapping (NO inheritance)
  // =========================================================================
  describe('Role-Permission Mapping (Req 2.2)', () => {
    it('should define permissions for all MembershipRole values', () => {
      const allRoles = Object.values(MembershipRole);
      
      for (const role of allRoles) {
        expect(ROLE_PERMISSIONS[role]).toBeDefined();
        expect(Array.isArray(ROLE_PERMISSIONS[role])).toBe(true);
      }
    });

    it('should freeze all role permission arrays', () => {
      for (const permissions of Object.values(ROLE_PERMISSIONS)) {
        expect(Object.isFrozen(permissions)).toBe(true);
      }
    });

    it('should only reference valid permission codes', () => {
      const errors = validatePermissionRegistry();
      expect(errors).toHaveLength(0);
    });

    it('should have no duplicate permissions per role', () => {
      for (const permissions of Object.values(ROLE_PERMISSIONS)) {
        const uniquePermissions = new Set(permissions);
        expect(permissions.length).toBe(uniquePermissions.size);
      }
    });
  });

  // =========================================================================
  // Requirement 2.3 — SECURITY and RESIDENT are DISTINCT (not hierarchy)
  // =========================================================================
  describe('SECURITY vs RESIDENT Distinction (Req 2.3)', () => {
    const securityPermissions = new Set(ROLE_PERMISSIONS[MembershipRole.SECURITY]);
    const residentPermissions = new Set(ROLE_PERMISSIONS[MembershipRole.RESIDENT]);

    it('should have SECURITY and RESIDENT with different permission sets', () => {
      // They should not be identical
      const areIdentical =
        securityPermissions.size === residentPermissions.size &&
        [...securityPermissions].every((p) => residentPermissions.has(p));
      
      expect(areIdentical).toBe(false);
    });

    it('should give SECURITY patrol permissions that RESIDENT lacks', () => {
      expect(securityPermissions.has(PERMISSIONS.PATROL_MANAGE.code)).toBe(true);
      expect(securityPermissions.has(PERMISSIONS.PATROL_READ.code)).toBe(true);
      
      expect(residentPermissions.has(PERMISSIONS.PATROL_MANAGE.code)).toBe(false);
      expect(residentPermissions.has(PERMISSIONS.PATROL_READ.code)).toBe(false);
    });

    it('should give SECURITY incident management that RESIDENT lacks', () => {
      expect(securityPermissions.has(PERMISSIONS.INCIDENT_MANAGE.code)).toBe(true);
      expect(securityPermissions.has(PERMISSIONS.INCIDENT_REPORT.code)).toBe(true);
      
      expect(residentPermissions.has(PERMISSIONS.INCIDENT_MANAGE.code)).toBe(false);
      expect(residentPermissions.has(PERMISSIONS.INCIDENT_REPORT.code)).toBe(false);
    });

    it('should give SECURITY emergency management that RESIDENT lacks', () => {
      expect(securityPermissions.has(PERMISSIONS.EMERGENCY_MANAGE.code)).toBe(true);
      expect(residentPermissions.has(PERMISSIONS.EMERGENCY_MANAGE.code)).toBe(false);
    });

    it('should give RESIDENT voting capability that SECURITY lacks', () => {
      expect(residentPermissions.has(PERMISSIONS.VOTE_CAST.code)).toBe(true);
      expect(securityPermissions.has(PERMISSIONS.VOTE_CAST.code)).toBe(false);
    });

    it('should give both SECURITY and RESIDENT emergency create (safety-critical)', () => {
      expect(securityPermissions.has(PERMISSIONS.EMERGENCY_CREATE.code)).toBe(true);
      expect(residentPermissions.has(PERMISSIONS.EMERGENCY_CREATE.code)).toBe(true);
    });
  });

  // =========================================================================
  // Requirement 2.5 — Returns ONLY explicitly mapped permissions (no inheritance)
  // =========================================================================
  describe('Explicit Permission Resolution (Req 2.5)', () => {
    it('should return exact permissions for PLATFORM_ADMIN', () => {
      const permissions = getPermissionsForRole(MembershipRole.PLATFORM_ADMIN);
      
      // Verify it has platform permissions
      expect(permissions.has(PERMISSIONS.PLATFORM_CONFIG_READ.code)).toBe(true);
      expect(permissions.has(PERMISSIONS.PLATFORM_TENANT_PROVISION.code)).toBe(true);
      
      // Verify it does NOT have tenant-data permissions
      expect(permissions.has(PERMISSIONS.RESIDENT_READ.code)).toBe(false);
      expect(permissions.has(PERMISSIONS.FINANCE_READ.code)).toBe(false);
      expect(permissions.has(PERMISSIONS.IOT_COMMAND.code)).toBe(false);
    });

    it('should return exact permissions for TENANT_OWNER', () => {
      const permissions = getPermissionsForRole(MembershipRole.TENANT_OWNER);
      
      // Has tenant management
      expect(permissions.has(PERMISSIONS.TENANT_MANAGE.code)).toBe(true);
      
      // Has delegation
      expect(permissions.has(PERMISSIONS.MEMBERSHIP_DELEGATE.code)).toBe(true);
      
      // Does NOT have platform permissions
      expect(permissions.has(PERMISSIONS.PLATFORM_CONFIG_READ.code)).toBe(false);
      expect(permissions.has(PERMISSIONS.PLATFORM_TENANT_PROVISION.code)).toBe(false);
    });

    it('should NOT compute permissions from other roles (no inheritance)', () => {
      // RESIDENT should not have ORG_ADMIN permissions
      const residentPerms = getPermissionsForRole(MembershipRole.RESIDENT);
      const orgAdminPerms = getPermissionsForRole(MembershipRole.ORG_ADMIN);
      
      // ORG_ADMIN has finance:write, RESIDENT should not
      expect(orgAdminPerms.has(PERMISSIONS.FINANCE_WRITE.code)).toBe(true);
      expect(residentPerms.has(PERMISSIONS.FINANCE_WRITE.code)).toBe(false);
      
      // ORG_ADMIN has announcement:publish, RESIDENT should not
      expect(orgAdminPerms.has(PERMISSIONS.ANNOUNCEMENT_PUBLISH.code)).toBe(true);
      expect(residentPerms.has(PERMISSIONS.ANNOUNCEMENT_PUBLISH.code)).toBe(false);
    });
  });

  // =========================================================================
  // Requirement 2.6 — Registry is immutable at runtime
  // =========================================================================
  describe('Registry Immutability (Req 2.6)', () => {
    it('should freeze PERMISSION_REGISTRY', () => {
      expect(Object.isFrozen(PERMISSION_REGISTRY)).toBe(true);
    });

    it('should freeze rolePermissions in registry', () => {
      expect(Object.isFrozen(PERMISSION_REGISTRY.rolePermissions)).toBe(true);
    });

    it('should freeze ROLE_PERMISSIONS', () => {
      expect(Object.isFrozen(ROLE_PERMISSIONS)).toBe(true);
    });

    it('should freeze PERMISSIONS constant', () => {
      expect(Object.isFrozen(PERMISSIONS)).toBe(true);
    });
  });

  // =========================================================================
  // Requirement 2.7 — Unknown permission fails closed
  // =========================================================================
  describe('Unknown Permission Handling (Req 2.7)', () => {
    it('should return false for unknown permission in roleHasPermission', () => {
      const result = roleHasPermission(
        MembershipRole.TENANT_OWNER,
        'nonexistent:permission',
      );
      expect(result).toBe(false);
    });

    it('should return false for unknown permission in roleHasAllPermissions', () => {
      const result = roleHasAllPermissions(MembershipRole.TENANT_OWNER, [
        PERMISSIONS.RESIDENT_READ.code,
        'nonexistent:permission',
      ]);
      expect(result).toBe(false);
    });

    it('should include unknown permission in getMissingPermissions', () => {
      const missing = getMissingPermissions(MembershipRole.TENANT_OWNER, [
        PERMISSIONS.RESIDENT_READ.code,
        'nonexistent:permission',
      ]);
      expect(missing).toContain('nonexistent:permission');
    });

    it('should return false for isValidPermissionCode with unknown code', () => {
      expect(isValidPermissionCode('nonexistent:permission')).toBe(false);
      expect(isValidPermissionCode('')).toBe(false);
      expect(isValidPermissionCode('invalid')).toBe(false);
    });

    it('should return empty set for unknown role in getPermissionsForRole', () => {
      // TypeScript wouldn't allow this, but testing runtime behavior
      const permissions = getPermissionsForRole('UNKNOWN_ROLE' as MembershipRole);
      expect(permissions.size).toBe(0);
    });
  });

  // =========================================================================
  // Permission Helper Functions
  // =========================================================================
  describe('Permission Helper Functions', () => {
    describe('isValidPermissionCode', () => {
      it('should return true for valid permission codes', () => {
        expect(isValidPermissionCode(PERMISSIONS.RESIDENT_READ.code)).toBe(true);
        expect(isValidPermissionCode(PERMISSIONS.EMERGENCY_CREATE.code)).toBe(true);
        expect(isValidPermissionCode(PERMISSIONS.PLATFORM_CONFIG_READ.code)).toBe(true);
      });

      it('should return false for invalid codes', () => {
        expect(isValidPermissionCode('invalid')).toBe(false);
        expect(isValidPermissionCode('')).toBe(false);
        expect(isValidPermissionCode('a:b:c')).toBe(false);
      });
    });

    describe('parsePermissionCode', () => {
      it('should parse valid permission codes', () => {
        expect(parsePermissionCode('resident:read')).toEqual({
          domain: 'resident',
          action: 'read',
        });
        expect(parsePermissionCode('platform:provision')).toEqual({
          domain: 'platform',
          action: 'provision',
        });
      });

      it('should return null for invalid codes', () => {
        expect(parsePermissionCode('invalid')).toBeNull();
        expect(parsePermissionCode('')).toBeNull();
        expect(parsePermissionCode('a:b:c')).toBeNull();
        expect(parsePermissionCode(':action')).toBeNull();
        expect(parsePermissionCode('domain:')).toBeNull();
      });
    });

    describe('roleHasPermission', () => {
      it('should return true when role has the permission', () => {
        expect(
          roleHasPermission(MembershipRole.RESIDENT, PERMISSIONS.EMERGENCY_CREATE.code),
        ).toBe(true);
        expect(
          roleHasPermission(MembershipRole.TENANT_OWNER, PERMISSIONS.TENANT_MANAGE.code),
        ).toBe(true);
      });

      it('should return false when role lacks the permission', () => {
        expect(
          roleHasPermission(MembershipRole.RESIDENT, PERMISSIONS.TENANT_MANAGE.code),
        ).toBe(false);
        expect(
          roleHasPermission(MembershipRole.SECURITY, PERMISSIONS.VOTE_CAST.code),
        ).toBe(false);
      });
    });

    describe('roleHasAllPermissions', () => {
      it('should return true when role has all permissions', () => {
        expect(
          roleHasAllPermissions(MembershipRole.RESIDENT, [
            PERMISSIONS.EMERGENCY_CREATE.code,
            PERMISSIONS.ANNOUNCEMENT_READ.code,
          ]),
        ).toBe(true);
      });

      it('should return false when role lacks any permission', () => {
        expect(
          roleHasAllPermissions(MembershipRole.RESIDENT, [
            PERMISSIONS.EMERGENCY_CREATE.code,
            PERMISSIONS.FINANCE_WRITE.code, // RESIDENT doesn't have this
          ]),
        ).toBe(false);
      });

      it('should return true for empty permission array', () => {
        expect(roleHasAllPermissions(MembershipRole.RESIDENT, [])).toBe(true);
      });
    });

    describe('getMissingPermissions', () => {
      it('should return empty array when role has all permissions', () => {
        const missing = getMissingPermissions(MembershipRole.RESIDENT, [
          PERMISSIONS.EMERGENCY_CREATE.code,
          PERMISSIONS.ANNOUNCEMENT_READ.code,
        ]);
        expect(missing).toHaveLength(0);
      });

      it('should return missing permissions when role lacks them', () => {
        const missing = getMissingPermissions(MembershipRole.RESIDENT, [
          PERMISSIONS.EMERGENCY_CREATE.code,
          PERMISSIONS.FINANCE_WRITE.code,
          PERMISSIONS.TENANT_MANAGE.code,
        ]);
        expect(missing).toContain(PERMISSIONS.FINANCE_WRITE.code);
        expect(missing).toContain(PERMISSIONS.TENANT_MANAGE.code);
        expect(missing).not.toContain(PERMISSIONS.EMERGENCY_CREATE.code);
      });

      it('should return empty array for empty required permissions', () => {
        expect(getMissingPermissions(MembershipRole.RESIDENT, [])).toHaveLength(0);
      });
    });
  });

  // =========================================================================
  // PLATFORM_ADMIN Specific Tests (L11 — No implicit tenant access)
  // =========================================================================
  describe('PLATFORM_ADMIN Permissions (L11)', () => {
    const platformAdminPerms = getPermissionsForRole(MembershipRole.PLATFORM_ADMIN);

    it('should have platform configuration permissions', () => {
      expect(platformAdminPerms.has(PERMISSIONS.PLATFORM_CONFIG_READ.code)).toBe(true);
      expect(platformAdminPerms.has(PERMISSIONS.PLATFORM_CONFIG_WRITE.code)).toBe(true);
    });

    it('should have tenant provisioning permissions', () => {
      expect(platformAdminPerms.has(PERMISSIONS.PLATFORM_TENANT_PROVISION.code)).toBe(true);
      expect(platformAdminPerms.has(PERMISSIONS.PLATFORM_TENANT_SUSPEND.code)).toBe(true);
      expect(platformAdminPerms.has(PERMISSIONS.PLATFORM_TENANT_TERMINATE.code)).toBe(true);
    });

    it('should have anomaly management permissions', () => {
      expect(platformAdminPerms.has(PERMISSIONS.PLATFORM_ANOMALY_REVIEW.code)).toBe(true);
      expect(platformAdminPerms.has(PERMISSIONS.PLATFORM_ANOMALY_REMEDIATE.code)).toBe(true);
    });

    it('should NOT have tenant-level data permissions', () => {
      // PLATFORM_ADMIN should NOT implicitly access tenant data
      expect(platformAdminPerms.has(PERMISSIONS.RESIDENT_READ.code)).toBe(false);
      expect(platformAdminPerms.has(PERMISSIONS.RESIDENT_WRITE.code)).toBe(false);
      expect(platformAdminPerms.has(PERMISSIONS.FINANCE_READ.code)).toBe(false);
      expect(platformAdminPerms.has(PERMISSIONS.FINANCE_WRITE.code)).toBe(false);
      expect(platformAdminPerms.has(PERMISSIONS.IOT_COMMAND.code)).toBe(false);
      expect(platformAdminPerms.has(PERMISSIONS.EMERGENCY_CREATE.code)).toBe(false);
      expect(platformAdminPerms.has(PERMISSIONS.ANNOUNCEMENT_PUBLISH.code)).toBe(false);
    });

    it('should NOT have tenant management permissions', () => {
      // Tenant management is for TENANT_OWNER
      expect(platformAdminPerms.has(PERMISSIONS.TENANT_MANAGE.code)).toBe(false);
      expect(platformAdminPerms.has(PERMISSIONS.MEMBERSHIP_DELEGATE.code)).toBe(false);
    });
  });

  // =========================================================================
  // Registry Validation
  // =========================================================================
  describe('Registry Validation', () => {
    it('should pass validation with no errors', () => {
      const errors = validatePermissionRegistry();
      expect(errors).toHaveLength(0);
    });
  });
});
