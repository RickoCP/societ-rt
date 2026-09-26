/**
 * Unit Tests: Role Mapping Service
 *
 * Tests for Task 33: Evidence-Based Remediation Workflow
 *
 * @see Requirement 11 AC 3: Role mapping
 * @see Requirement 11 AC 4: OrgUnit scope for non-admin RT users
 * @see Locked Decision L5: Role mapping
 * @see Locked Decision L6: Non-admin RT users org-scoped to RT root
 */

import { describe, it, expect } from 'vitest';

import {
  createRoleMappingService,
  mapLegacyRole,
  tryMapLegacyRole,
  canMapLegacyRole,
  getTargetOrgUnitId,
  ROLE_MAPPING,
  TENANT_LEVEL_ROLES,
  ORG_SCOPED_ROLES,
} from '../RoleMappingService';
import { RemediationError } from '../types';
import type { MembershipRole, UserRole } from '@/generated/prisma/client';

// ---------------------------------------------------------------------------
// Test Constants
// ---------------------------------------------------------------------------

const RT_ROOT_ORG_UNIT_ID = '2459b0bb-115e-52ce-88cd-c176a9aa1e39';

// ---------------------------------------------------------------------------
// Tests: Locked Decision L5 Role Mapping
// ---------------------------------------------------------------------------

describe('RoleMappingService - L5 Role Mapping', () => {
  describe('ROLE_MAPPING constant', () => {
    it('should map Super_Admin to PLATFORM_ADMIN', () => {
      expect(ROLE_MAPPING.Super_Admin).toBe('PLATFORM_ADMIN');
    });

    it('should map Ketua_RT to RT_ADMIN', () => {
      expect(ROLE_MAPPING.Ketua_RT).toBe('RT_ADMIN');
    });

    it('should map Pengurus to ORG_ADMIN', () => {
      expect(ROLE_MAPPING.Pengurus).toBe('ORG_ADMIN');
    });

    it('should map Warga to RESIDENT', () => {
      expect(ROLE_MAPPING.Warga).toBe('RESIDENT');
    });

    it('should map Security_Guard to SECURITY', () => {
      expect(ROLE_MAPPING.Security_Guard).toBe('SECURITY');
    });

    it('should have exactly 5 mappings', () => {
      expect(Object.keys(ROLE_MAPPING)).toHaveLength(5);
    });
  });

  describe('mapRole()', () => {
    const service = createRoleMappingService();

    it.each([
      ['Super_Admin', 'PLATFORM_ADMIN'],
      ['Ketua_RT', 'RT_ADMIN'],
      ['Pengurus', 'ORG_ADMIN'],
      ['Warga', 'RESIDENT'],
      ['Security_Guard', 'SECURITY'],
    ] as const)('should map %s to %s', (legacyRole, expectedRole) => {
      expect(service.mapRole(legacyRole)).toBe(expectedRole);
    });

    it('should throw RemediationError for unknown role', () => {
      expect(() => service.mapRole('Unknown_Role' as UserRole)).toThrow(RemediationError);
    });

    it('should throw with ROLE_MAPPING_FAILED code for unknown role', () => {
      try {
        service.mapRole('Invalid' as UserRole);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(RemediationError);
        expect((error as RemediationError).code).toBe('ROLE_MAPPING_FAILED');
      }
    });
  });

  describe('tryMapRole()', () => {
    const service = createRoleMappingService();

    it('should return mapped role for valid input', () => {
      expect(service.tryMapRole('Warga')).toBe('RESIDENT');
    });

    it('should return null for unknown role', () => {
      expect(service.tryMapRole('Unknown' as UserRole)).toBeNull();
    });
  });

  describe('canMapRole()', () => {
    const service = createRoleMappingService();

    it('should return true for all valid legacy roles', () => {
      expect(service.canMapRole('Super_Admin')).toBe(true);
      expect(service.canMapRole('Ketua_RT')).toBe(true);
      expect(service.canMapRole('Pengurus')).toBe(true);
      expect(service.canMapRole('Warga')).toBe(true);
      expect(service.canMapRole('Security_Guard')).toBe(true);
    });

    it('should return false for unknown roles', () => {
      expect(service.canMapRole('Unknown')).toBe(false);
      expect(service.canMapRole('')).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Locked Decision L6 OrgUnit Scope
// ---------------------------------------------------------------------------

describe('RoleMappingService - L6 OrgUnit Scope', () => {
  describe('TENANT_LEVEL_ROLES constant', () => {
    it('should include PLATFORM_ADMIN', () => {
      expect(TENANT_LEVEL_ROLES.has('PLATFORM_ADMIN')).toBe(true);
    });

    it('should include TENANT_OWNER', () => {
      expect(TENANT_LEVEL_ROLES.has('TENANT_OWNER')).toBe(true);
    });

    it('should not include org-scoped roles', () => {
      expect(TENANT_LEVEL_ROLES.has('RT_ADMIN')).toBe(false);
      expect(TENANT_LEVEL_ROLES.has('ORG_ADMIN')).toBe(false);
      expect(TENANT_LEVEL_ROLES.has('SECURITY')).toBe(false);
      expect(TENANT_LEVEL_ROLES.has('RESIDENT')).toBe(false);
    });
  });

  describe('ORG_SCOPED_ROLES constant', () => {
    it('should include all non-admin RT roles', () => {
      expect(ORG_SCOPED_ROLES.has('RT_ADMIN')).toBe(true);
      expect(ORG_SCOPED_ROLES.has('ORG_ADMIN')).toBe(true);
      expect(ORG_SCOPED_ROLES.has('SECURITY')).toBe(true);
      expect(ORG_SCOPED_ROLES.has('RESIDENT')).toBe(true);
    });

    it('should not include tenant-level roles', () => {
      expect(ORG_SCOPED_ROLES.has('PLATFORM_ADMIN')).toBe(false);
      expect(ORG_SCOPED_ROLES.has('TENANT_OWNER')).toBe(false);
    });
  });

  describe('requiresTenantLevelScope()', () => {
    const service = createRoleMappingService();

    it('should return true for PLATFORM_ADMIN', () => {
      expect(service.requiresTenantLevelScope('PLATFORM_ADMIN')).toBe(true);
    });

    it('should return true for TENANT_OWNER', () => {
      expect(service.requiresTenantLevelScope('TENANT_OWNER')).toBe(true);
    });

    it('should return false for org-scoped roles', () => {
      expect(service.requiresTenantLevelScope('RT_ADMIN')).toBe(false);
      expect(service.requiresTenantLevelScope('ORG_ADMIN')).toBe(false);
      expect(service.requiresTenantLevelScope('SECURITY')).toBe(false);
      expect(service.requiresTenantLevelScope('RESIDENT')).toBe(false);
    });
  });

  describe('requiresOrgUnitScope()', () => {
    const service = createRoleMappingService();

    it('should return true for org-scoped roles', () => {
      expect(service.requiresOrgUnitScope('RT_ADMIN')).toBe(true);
      expect(service.requiresOrgUnitScope('ORG_ADMIN')).toBe(true);
      expect(service.requiresOrgUnitScope('SECURITY')).toBe(true);
      expect(service.requiresOrgUnitScope('RESIDENT')).toBe(true);
    });

    it('should return false for tenant-level roles', () => {
      expect(service.requiresOrgUnitScope('PLATFORM_ADMIN')).toBe(false);
      expect(service.requiresOrgUnitScope('TENANT_OWNER')).toBe(false);
    });
  });

  describe('getTargetOrgUnitId()', () => {
    const service = createRoleMappingService();

    it('should return null for PLATFORM_ADMIN (tenant-level)', () => {
      expect(service.getTargetOrgUnitId('PLATFORM_ADMIN', RT_ROOT_ORG_UNIT_ID)).toBeNull();
    });

    it('should return null for TENANT_OWNER (tenant-level)', () => {
      expect(service.getTargetOrgUnitId('TENANT_OWNER', RT_ROOT_ORG_UNIT_ID)).toBeNull();
    });

    it('should return RT root for RT_ADMIN', () => {
      expect(service.getTargetOrgUnitId('RT_ADMIN', RT_ROOT_ORG_UNIT_ID)).toBe(RT_ROOT_ORG_UNIT_ID);
    });

    it('should return RT root for ORG_ADMIN', () => {
      expect(service.getTargetOrgUnitId('ORG_ADMIN', RT_ROOT_ORG_UNIT_ID)).toBe(RT_ROOT_ORG_UNIT_ID);
    });

    it('should return RT root for SECURITY', () => {
      expect(service.getTargetOrgUnitId('SECURITY', RT_ROOT_ORG_UNIT_ID)).toBe(RT_ROOT_ORG_UNIT_ID);
    });

    it('should return RT root for RESIDENT (per L6: NOT tenant-wide null)', () => {
      // This is the key L6 requirement: non-admin RT users get RT root, not null
      expect(service.getTargetOrgUnitId('RESIDENT', RT_ROOT_ORG_UNIT_ID)).toBe(RT_ROOT_ORG_UNIT_ID);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Convenience Functions
// ---------------------------------------------------------------------------

describe('RoleMappingService - Convenience Functions', () => {
  describe('mapLegacyRole()', () => {
    it('should work like service.mapRole()', () => {
      expect(mapLegacyRole('Warga')).toBe('RESIDENT');
      expect(mapLegacyRole('Ketua_RT')).toBe('RT_ADMIN');
    });
  });

  describe('tryMapLegacyRole()', () => {
    it('should work like service.tryMapRole()', () => {
      expect(tryMapLegacyRole('Warga')).toBe('RESIDENT');
      expect(tryMapLegacyRole('Unknown' as UserRole)).toBeNull();
    });
  });

  describe('canMapLegacyRole()', () => {
    it('should work like service.canMapRole()', () => {
      expect(canMapLegacyRole('Warga')).toBe(true);
      expect(canMapLegacyRole('Unknown')).toBe(false);
    });
  });

  describe('getTargetOrgUnitId()', () => {
    it('should work like service.getTargetOrgUnitId()', () => {
      expect(getTargetOrgUnitId('PLATFORM_ADMIN', RT_ROOT_ORG_UNIT_ID)).toBeNull();
      expect(getTargetOrgUnitId('RESIDENT', RT_ROOT_ORG_UNIT_ID)).toBe(RT_ROOT_ORG_UNIT_ID);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Classification
// ---------------------------------------------------------------------------

describe('RoleMappingService - Classification', () => {
  describe('getClassification()', () => {
    const service = createRoleMappingService();

    it('should return known-pattern for valid legacy roles', () => {
      expect(service.getClassification('Super_Admin')).toBe('known-pattern');
      expect(service.getClassification('Warga')).toBe('known-pattern');
    });

    it('should return invalid-role for unknown roles', () => {
      expect(service.getClassification('Unknown')).toBe('invalid-role');
      expect(service.getClassification('')).toBe('invalid-role');
    });
  });
});

// ---------------------------------------------------------------------------
// Requirement 11 AC 3: Role Mapping Verification
// ---------------------------------------------------------------------------

describe('Requirement 11 AC 3: Role Mapping per L5', () => {
  const service = createRoleMappingService();

  it('should correctly map all legacy roles as specified in L5', () => {
    // Verify each mapping matches the L5 locked decision exactly
    expect(service.mapRole('Super_Admin')).toBe('PLATFORM_ADMIN');
    expect(service.mapRole('Ketua_RT')).toBe('RT_ADMIN');
    expect(service.mapRole('Pengurus')).toBe('ORG_ADMIN');
    expect(service.mapRole('Warga')).toBe('RESIDENT');
    expect(service.mapRole('Security_Guard')).toBe('SECURITY');
  });
});

// ---------------------------------------------------------------------------
// Requirement 11 AC 4: OrgUnit Scope Verification
// ---------------------------------------------------------------------------

describe('Requirement 11 AC 4: OrgUnit scope for non-admin RT users', () => {
  const service = createRoleMappingService();

  it('should set orgUnitId to RT root for RESIDENT (not null)', () => {
    // Per L6: Non-admin RT users are org-scoped to RT root (NOT tenant-wide null)
    const orgUnitId = service.getTargetOrgUnitId('RESIDENT', RT_ROOT_ORG_UNIT_ID);
    expect(orgUnitId).not.toBeNull();
    expect(orgUnitId).toBe(RT_ROOT_ORG_UNIT_ID);
  });

  it('should set orgUnitId to RT root for SECURITY (not null)', () => {
    const orgUnitId = service.getTargetOrgUnitId('SECURITY', RT_ROOT_ORG_UNIT_ID);
    expect(orgUnitId).not.toBeNull();
    expect(orgUnitId).toBe(RT_ROOT_ORG_UNIT_ID);
  });

  it('should set orgUnitId to null only for tenant-level admin roles', () => {
    expect(service.getTargetOrgUnitId('PLATFORM_ADMIN', RT_ROOT_ORG_UNIT_ID)).toBeNull();
    expect(service.getTargetOrgUnitId('TENANT_OWNER', RT_ROOT_ORG_UNIT_ID)).toBeNull();
  });
});
