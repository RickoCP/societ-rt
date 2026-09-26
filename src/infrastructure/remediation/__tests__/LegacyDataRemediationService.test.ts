/**
 * Unit Tests: Legacy Data Remediation Service
 *
 * Tests for Task 33: Evidence-Based Remediation Workflow
 *
 * @see Requirement 11 (AC 1-9)
 * @see INV-QUARANTINE-001: Quarantined users cannot receive Membership
 * @see Locked Decision L3, L5, L6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  createLegacyDataRemediationService,
  type LegacyDataRemediationServiceDeps,
} from '../LegacyDataRemediationService';
import type { IQuarantineValidator } from '../QuarantineValidator';
import type { IRoleMappingService } from '../RoleMappingService';
import type { IRemediationReportGenerator } from '../RemediationReportGenerator';
import { RemediationError } from '../types';
import type { PrismaClient } from '@/generated/prisma/client';

// ---------------------------------------------------------------------------
// Test Constants
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-001';
const RT_ROOT_ORG_UNIT_ID = '2459b0bb-115e-52ce-88cd-c176a9aa1e39';

const PNA_USERS = {
  'PNA-01': '00000000-0000-0000-0000-000000000021',
  'PNA-02': '00000000-0000-0000-0000-000000000022',
  'PNA-03': '00000000-0000-0000-0000-000000000023',
  'PNA-04': '00000000-0000-0000-0000-000000000024',
  'PNA-05': '42cc1bea-9a68-44b1-aadf-1bb0bb609028',
} as const;

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockUser(overrides: Partial<{
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: string;
  createdAt: Date;
}> = {}) {
  return {
    id: overrides.id ?? '11111111-1111-1111-1111-111111111111',
    tenantId: overrides.tenantId ?? TENANT_ID,
    email: overrides.email ?? 'user@example.com',
    name: overrides.name ?? 'Test User',
    role: overrides.role ?? 'Warga',
    status: 'active',
    passwordHash: 'hash',
    failedLoginAttempts: 0,
    lockedUntil: null,
    consentTimestamp: null,
    consentVersion: null,
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };
}

function createMockTenant(id: string = TENANT_ID) {
  return {
    id,
    name: 'Test Tenant',
    subdomain: 'test',
    rtRwNumber: 'RT01',
    region: 'Jakarta',
    address: 'Test Address',
    contactPerson: 'Test Contact',
    status: 'active',
    subscriptionPlanId: 'plan-001',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createMockOrgUnit(tenantId: string = TENANT_ID) {
  return {
    id: RT_ROOT_ORG_UNIT_ID,
    tenantId,
    parentId: null,
    type: 'RT',
    name: 'RT 001',
    path: [RT_ROOT_ORG_UNIT_ID],
    depth: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createMockMembership(userId: string, tenantId: string = TENANT_ID) {
  return {
    id: `mem-${userId.slice(0, 8)}`,
    userId,
    tenantId,
    orgUnitId: RT_ROOT_ORG_UNIT_ID,
    role: 'RESIDENT',
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    revokedAt: null,
  };
}

function createMockPrismaClient(options: {
  usersWithoutMembership?: ReturnType<typeof createMockUser>[];
  tenant?: ReturnType<typeof createMockTenant> | null;
  orgUnit?: ReturnType<typeof createMockOrgUnit> | null;
}): PrismaClient {
  const {
    usersWithoutMembership = [],
    tenant = createMockTenant(),
    orgUnit = createMockOrgUnit(),
  } = options;

  return {
    user: {
      findMany: vi.fn().mockResolvedValue(usersWithoutMembership),
      findUnique: vi.fn().mockImplementation(({ where }: { where: { id: string } }) => {
        return Promise.resolve(
          usersWithoutMembership.find((u) => u.id === where.id) ?? null
        );
      }),
    },
    tenant: {
      findUnique: vi.fn().mockResolvedValue(tenant),
    },
    orgUnit: {
      findFirst: vi.fn().mockResolvedValue(orgUnit),
    },
    membership: {
      create: vi.fn().mockImplementation(({ data }) => {
        return Promise.resolve({
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
          revokedAt: null,
        });
      }),
    },
  } as unknown as PrismaClient;
}

function createMockQuarantineValidator(options: {
  verified?: boolean;
  count?: number;
  quarantinedIds?: string[];
} = {}): IQuarantineValidator {
  const {
    verified = true,
    count = 5,
    quarantinedIds = Object.values(PNA_USERS),
  } = options;

  return {
    verify: vi.fn().mockReturnValue({
      verified,
      expectedCount: 5,
      actualCount: count,
      manifestVersion: '1.0.0',
      errorMessage: verified ? null : 'Verification failed',
    }),
    isQuarantined: vi.fn((userId: string) =>
      quarantinedIds.map((id) => id.toLowerCase()).includes(userId.toLowerCase())
    ),
    getQuarantinedUserIds: vi.fn().mockReturnValue(quarantinedIds),
    verifyOrThrow: vi.fn(() => {
      if (!verified) {
        throw new RemediationError('QUARANTINE_VERIFICATION_FAILED', 'Verification failed');
      }
    }),
  };
}

function createMockRoleMappingService(): IRoleMappingService {
  const roleMap: Record<string, string> = {
    Super_Admin: 'PLATFORM_ADMIN',
    Ketua_RT: 'RT_ADMIN',
    Pengurus: 'ORG_ADMIN',
    Warga: 'RESIDENT',
    Security_Guard: 'SECURITY',
  };

  const tenantLevelRoles = new Set(['PLATFORM_ADMIN', 'TENANT_OWNER']);

  return {
    mapRole: vi.fn((role: string) => roleMap[role] ?? null) as any,
    tryMapRole: vi.fn((role: string) => roleMap[role] ?? null) as any,
    canMapRole: vi.fn((role: string) => role in roleMap),
    requiresTenantLevelScope: vi.fn((role: string) => tenantLevelRoles.has(role)),
    requiresOrgUnitScope: vi.fn((role: string) => !tenantLevelRoles.has(role)),
    getTargetOrgUnitId: vi.fn((role: string, rtRootId: string) =>
      tenantLevelRoles.has(role) ? null : rtRootId
    ),
    getClassification: vi.fn((role: string) =>
      role in roleMap ? 'known-pattern' : 'invalid-role'
    ),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LegacyDataRemediationService', () => {
  describe('runRemediation()', () => {
    it('should throw if quarantine verification fails', async () => {
      const prismaClient = createMockPrismaClient({ usersWithoutMembership: [] });
      const quarantineValidator = createMockQuarantineValidator({ verified: false });

      const service = createLegacyDataRemediationService({
        prismaClient,
        quarantineValidator,
      });

      await expect(service.runRemediation({ dryRun: true })).rejects.toThrow(
        RemediationError
      );
    });

    it('should allow skipping quarantine verification (dangerous)', async () => {
      const prismaClient = createMockPrismaClient({ usersWithoutMembership: [] });
      const quarantineValidator = createMockQuarantineValidator({ verified: false });

      const service = createLegacyDataRemediationService({
        prismaClient,
        quarantineValidator,
      });

      // Should not throw when verification is skipped
      const report = await service.runRemediation({
        dryRun: true,
        skipQuarantineVerification: true,
      });

      expect(report).toBeDefined();
    });

    it('should return a report with metadata', async () => {
      const prismaClient = createMockPrismaClient({ usersWithoutMembership: [] });

      const service = createLegacyDataRemediationService({ prismaClient });

      const report = await service.runRemediation({ dryRun: true });

      expect(report.metadata).toBeDefined();
      expect(report.metadata.dryRun).toBe(true);
      expect(report.metadata.generatedAt).toBeDefined();
    });

    it('should include quarantine verification in report', async () => {
      const prismaClient = createMockPrismaClient({ usersWithoutMembership: [] });
      const quarantineValidator = createMockQuarantineValidator({ verified: true });

      const service = createLegacyDataRemediationService({
        prismaClient,
        quarantineValidator,
      });

      const report = await service.runRemediation({ dryRun: true });

      expect(report.quarantineVerification).toBeDefined();
      expect(report.quarantineVerification.verified).toBe(true);
    });
  });

  describe('discoverCandidates()', () => {
    it('should discover users without memberships', async () => {
      const users = [
        createMockUser({ id: 'user-001', email: 'user1@test.com' }),
        createMockUser({ id: 'user-002', email: 'user2@test.com' }),
      ];
      const prismaClient = createMockPrismaClient({ usersWithoutMembership: users });

      const service = createLegacyDataRemediationService({ prismaClient });

      const candidates = await service.discoverCandidates();

      expect(candidates).toHaveLength(2);
    });

    it('should classify quarantined users as quarantine-match', async () => {
      const users = [createMockUser({ id: PNA_USERS['PNA-01'] })];
      const prismaClient = createMockPrismaClient({ usersWithoutMembership: users });
      const quarantineValidator = createMockQuarantineValidator();

      const service = createLegacyDataRemediationService({
        prismaClient,
        quarantineValidator,
      });

      const candidates = await service.discoverCandidates();

      expect(candidates[0]?.classification).toBe('quarantine-match');
      expect(candidates[0]?.candidate).toBeNull();
    });

    it('should classify users with missing tenants as missing-tenant', async () => {
      const users = [createMockUser({ tenantId: 'nonexistent-tenant' })];
      const prismaClient = createMockPrismaClient({
        usersWithoutMembership: users,
        tenant: null,
      });

      const service = createLegacyDataRemediationService({ prismaClient });

      const candidates = await service.discoverCandidates();

      expect(candidates[0]?.classification).toBe('missing-tenant');
    });

    it('should classify valid users as known-pattern', async () => {
      const users = [createMockUser()];
      const prismaClient = createMockPrismaClient({ usersWithoutMembership: users });

      const service = createLegacyDataRemediationService({ prismaClient });

      const candidates = await service.discoverCandidates();

      expect(candidates[0]?.classification).toBe('known-pattern');
      expect(candidates[0]?.candidate).not.toBeNull();
    });

    it('should respect limit parameter', async () => {
      const users = [
        createMockUser({ id: 'user-001' }),
        createMockUser({ id: 'user-002' }),
        createMockUser({ id: 'user-003' }),
      ];
      const prismaClient = createMockPrismaClient({ usersWithoutMembership: users });

      const service = createLegacyDataRemediationService({ prismaClient });

      // Note: The limit is applied to the Prisma query, so we need to check the mock call
      await service.discoverCandidates(2);

      expect(prismaClient.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 2 })
      );
    });
  });

  describe('previewRemediation()', () => {
    it('should always run in dry-run mode', async () => {
      const users = [createMockUser()];
      const prismaClient = createMockPrismaClient({ usersWithoutMembership: users });

      const service = createLegacyDataRemediationService({ prismaClient });

      const report = await service.previewRemediation();

      expect(report.metadata.dryRun).toBe(true);
    });

    it('should not create any memberships', async () => {
      const users = [createMockUser()];
      const prismaClient = createMockPrismaClient({ usersWithoutMembership: users });

      const service = createLegacyDataRemediationService({ prismaClient });

      await service.previewRemediation();

      expect(prismaClient.membership.create).not.toHaveBeenCalled();
    });
  });

  describe('actual remediation (dryRun=false)', () => {
    it('should create memberships for eligible users', async () => {
      const users = [createMockUser({ id: 'eligible-user' })];
      const prismaClient = createMockPrismaClient({ usersWithoutMembership: users });

      const service = createLegacyDataRemediationService({ prismaClient });

      const report = await service.runRemediation({ dryRun: false });

      expect(prismaClient.membership.create).toHaveBeenCalled();
      expect(report.summary.created).toBe(1);
    });

    it('should NOT create memberships for quarantined users', async () => {
      const users = [createMockUser({ id: PNA_USERS['PNA-01'] })];
      const prismaClient = createMockPrismaClient({ usersWithoutMembership: users });

      const service = createLegacyDataRemediationService({ prismaClient });

      const report = await service.runRemediation({ dryRun: false });

      expect(report.summary.skippedQuarantine).toBe(1);
      expect(report.summary.created).toBe(0);
    });

    it('should NOT create memberships for users with missing tenants', async () => {
      const users = [createMockUser({ tenantId: 'missing' })];
      const prismaClient = createMockPrismaClient({
        usersWithoutMembership: users,
        tenant: null,
      });

      const service = createLegacyDataRemediationService({ prismaClient });

      const report = await service.runRemediation({ dryRun: false });

      expect(report.summary.skippedMissingTenant).toBe(1);
      expect(report.summary.created).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Requirement 11 Acceptance Criteria Tests
// ---------------------------------------------------------------------------

describe('Requirement 11: Legacy Data Remediation', () => {
  describe('AC 1: Identify users without Membership excluding quarantine', () => {
    it('should identify all users without Membership records', async () => {
      const users = [
        createMockUser({ id: 'user-001' }),
        createMockUser({ id: 'user-002' }),
      ];
      const prismaClient = createMockPrismaClient({ usersWithoutMembership: users });

      const service = createLegacyDataRemediationService({ prismaClient });
      const candidates = await service.discoverCandidates();

      expect(candidates).toHaveLength(2);
    });

    it('should exclude quarantined users from eligible candidates', async () => {
      const users = [
        createMockUser({ id: 'normal-user' }),
        createMockUser({ id: PNA_USERS['PNA-01'] }),
      ];
      const prismaClient = createMockPrismaClient({ usersWithoutMembership: users });

      const service = createLegacyDataRemediationService({ prismaClient });
      const candidates = await service.discoverCandidates();

      const eligible = candidates.filter((c) => c.classification === 'known-pattern');
      const quarantined = candidates.filter((c) => c.classification === 'quarantine-match');

      expect(eligible).toHaveLength(1);
      expect(quarantined).toHaveLength(1);
    });
  });

  describe('AC 2: Create Membership based on User.tenantId and User.role', () => {
    it('should create membership with correct tenantId', async () => {
      const users = [createMockUser({ tenantId: 'specific-tenant' })];
      const prismaClient = createMockPrismaClient({
        usersWithoutMembership: users,
        tenant: createMockTenant('specific-tenant'),
      });

      const service = createLegacyDataRemediationService({ prismaClient });
      await service.runRemediation({ dryRun: false });

      expect(prismaClient.membership.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'specific-tenant',
          }),
        })
      );
    });
  });

  describe('AC 3: Map legacy UserRole to MembershipRole per L5', () => {
    it('should map Warga to RESIDENT', async () => {
      const users = [createMockUser({ role: 'Warga' })];
      const prismaClient = createMockPrismaClient({ usersWithoutMembership: users });

      const service = createLegacyDataRemediationService({ prismaClient });
      await service.runRemediation({ dryRun: false });

      expect(prismaClient.membership.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: 'RESIDENT',
          }),
        })
      );
    });
  });

  describe('AC 4: Set orgUnitId to RT root for non-admin RT users', () => {
    it('should set orgUnitId to RT root for RESIDENT', async () => {
      const users = [createMockUser({ role: 'Warga' })];
      const prismaClient = createMockPrismaClient({ usersWithoutMembership: users });

      const service = createLegacyDataRemediationService({ prismaClient });
      await service.runRemediation({ dryRun: false });

      expect(prismaClient.membership.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orgUnitId: RT_ROOT_ORG_UNIT_ID,
          }),
        })
      );
    });

    it('should set orgUnitId to null for PLATFORM_ADMIN', async () => {
      const users = [createMockUser({ role: 'Super_Admin' })];
      const prismaClient = createMockPrismaClient({ usersWithoutMembership: users });

      const service = createLegacyDataRemediationService({ prismaClient });
      await service.runRemediation({ dryRun: false });

      expect(prismaClient.membership.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orgUnitId: null,
          }),
        })
      );
    });
  });

  describe('AC 5: Generate report with before/after state', () => {
    it('should include before state in report', async () => {
      const users = [createMockUser()];
      const prismaClient = createMockPrismaClient({ usersWithoutMembership: users });

      const service = createLegacyDataRemediationService({ prismaClient });
      const report = await service.runRemediation({ dryRun: false });

      expect(report.results[0]?.beforeState).toBeDefined();
      expect(report.results[0]?.beforeState.hasMembership).toBe(false);
    });

    it('should include after state for created memberships', async () => {
      const users = [createMockUser()];
      const prismaClient = createMockPrismaClient({ usersWithoutMembership: users });

      const service = createLegacyDataRemediationService({ prismaClient });
      const report = await service.runRemediation({ dryRun: false });

      expect(report.results[0]?.afterState).toBeDefined();
      expect(report.results[0]?.afterState?.hasMembership).toBe(true);
    });
  });

  describe('AC 6: Support dry-run mode', () => {
    it('should not make database changes in dry-run mode', async () => {
      const users = [createMockUser()];
      const prismaClient = createMockPrismaClient({ usersWithoutMembership: users });

      const service = createLegacyDataRemediationService({ prismaClient });
      await service.runRemediation({ dryRun: true });

      expect(prismaClient.membership.create).not.toHaveBeenCalled();
    });

    it('should still generate report in dry-run mode', async () => {
      const users = [createMockUser()];
      const prismaClient = createMockPrismaClient({ usersWithoutMembership: users });

      const service = createLegacyDataRemediationService({ prismaClient });
      const report = await service.runRemediation({ dryRun: true });

      expect(report.summary.skippedDryRun).toBe(1);
    });
  });

  describe('AC 7: Log warning and skip if tenant does not exist', () => {
    it('should skip user if tenant does not exist', async () => {
      const users = [createMockUser({ tenantId: 'nonexistent' })];
      const prismaClient = createMockPrismaClient({
        usersWithoutMembership: users,
        tenant: null,
      });

      const service = createLegacyDataRemediationService({ prismaClient });
      const report = await service.runRemediation({ dryRun: false });

      expect(report.summary.skippedMissingTenant).toBe(1);
      expect(prismaClient.membership.create).not.toHaveBeenCalled();
    });
  });

  describe('AC 8: NEVER auto-remediate quarantined anomalies', () => {
    it.each(Object.entries(PNA_USERS))(
      'should NEVER create membership for %s (%s)',
      async (_alias, userId) => {
        const users = [createMockUser({ id: userId })];
        const prismaClient = createMockPrismaClient({ usersWithoutMembership: users });

        const service = createLegacyDataRemediationService({ prismaClient });
        const report = await service.runRemediation({ dryRun: false });

        expect(report.summary.skippedQuarantine).toBe(1);
        expect(report.summary.created).toBe(0);
        expect(prismaClient.membership.create).not.toHaveBeenCalled();
      }
    );
  });

  describe('AC 9: Verify quarantine manifest has exactly 5 users', () => {
    it('should fail if manifest has less than 5 users', async () => {
      const prismaClient = createMockPrismaClient({ usersWithoutMembership: [] });
      const quarantineValidator = createMockQuarantineValidator({
        verified: false,
        count: 3,
      });

      const service = createLegacyDataRemediationService({
        prismaClient,
        quarantineValidator,
      });

      await expect(service.runRemediation({ dryRun: true })).rejects.toThrow(
        RemediationError
      );
    });

    it('should fail if manifest has more than 5 users', async () => {
      const prismaClient = createMockPrismaClient({ usersWithoutMembership: [] });
      const quarantineValidator = createMockQuarantineValidator({
        verified: false,
        count: 7,
      });

      const service = createLegacyDataRemediationService({
        prismaClient,
        quarantineValidator,
      });

      await expect(service.runRemediation({ dryRun: true })).rejects.toThrow(
        RemediationError
      );
    });

    it('should pass if manifest has exactly 5 users', async () => {
      const prismaClient = createMockPrismaClient({ usersWithoutMembership: [] });
      const quarantineValidator = createMockQuarantineValidator({
        verified: true,
        count: 5,
      });

      const service = createLegacyDataRemediationService({
        prismaClient,
        quarantineValidator,
      });

      const report = await service.runRemediation({ dryRun: true });
      expect(report.quarantineVerification.verified).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Property-Based Test: Eligible User Count Invariant
// ---------------------------------------------------------------------------

describe('Property: After remediation, non-quarantined user count with memberships = total eligible', () => {
  it('should remediate all eligible users (non-quarantined, valid tenant)', async () => {
    const eligibleUsers = [
      createMockUser({ id: 'eligible-001' }),
      createMockUser({ id: 'eligible-002' }),
      createMockUser({ id: 'eligible-003' }),
    ];
    const quarantinedUsers = [
      createMockUser({ id: PNA_USERS['PNA-01'] }),
    ];
    const allUsers = [...eligibleUsers, ...quarantinedUsers];

    const prismaClient = createMockPrismaClient({ usersWithoutMembership: allUsers });

    const service = createLegacyDataRemediationService({ prismaClient });
    const report = await service.runRemediation({ dryRun: false });

    // Property: created count = eligible count
    expect(report.summary.created).toBe(eligibleUsers.length);

    // Property: skipped quarantine = quarantined count
    expect(report.summary.skippedQuarantine).toBe(quarantinedUsers.length);

    // Property: total discovered = all users
    expect(report.summary.totalDiscovered).toBe(allUsers.length);
  });
});
