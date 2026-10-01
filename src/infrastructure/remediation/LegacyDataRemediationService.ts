/**
 * Legacy Data Remediation Service
 *
 * Implements the evidence-based remediation workflow for creating Membership
 * records for users without them, while explicitly excluding quarantined
 * platform anomalies.
 *
 * **Key Responsibilities:**
 * 1. Discover users without Membership records (excluding quarantine)
 * 2. Classify candidates based on evidence patterns
 * 3. Map legacy roles to MembershipRole per L5
 * 4. Set orgUnitId based on role per L6
 * 5. Support dry-run mode for previewing changes
 * 6. Generate comprehensive before/after reports
 *
 * **Safety Guarantees:**
 * - NEVER auto-remediate PNA-01..PNA-05
 * - Verify manifest = exactly 5 users before proceeding
 * - Fail closed on unknown states
 *
 * @see Task 33: Evidence-Based Remediation Workflow
 * @see Requirement 11 (AC 1-9)
 * @see Locked Decision L3: 5 Platform anomalies quarantined
 * @see Locked Decision L5: Role mapping
 * @see Locked Decision L6: Non-admin RT users org-scoped to RT root
 */

import { randomUUID } from 'node:crypto';
import type {
  Membership,
  OrgUnit,
  PrismaClient,
  Tenant,
  User,
} from '@prisma/client';

import { createQuarantineValidator, type IQuarantineValidator } from './QuarantineValidator';
import { createRoleMappingService, type IRoleMappingService } from './RoleMappingService';
import {
  createRemediationReportGenerator,
  type IRemediationReportGenerator,
} from './RemediationReportGenerator';
import type {
  ClassifiedCandidate,
  ILegacyDataRemediationService,
  RemediationAfterState,
  RemediationBeforeState,
  RemediationCandidate,
  RemediationClassification,
  RemediationOptions,
  RemediationReport,
  RemediationResult,
} from './types';
import { DEFAULT_REMEDIATION_OPTIONS, RemediationError } from './types';

// ---------------------------------------------------------------------------
// Service Dependencies
// ---------------------------------------------------------------------------

/**
 * Dependencies for the LegacyDataRemediationService.
 */
export interface LegacyDataRemediationServiceDeps {
  /** Prisma client for database access */
  readonly prismaClient: PrismaClient;
  /** Quarantine validator (optional, creates default if not provided) */
  readonly quarantineValidator?: IQuarantineValidator;
  /** Role mapping service (optional, creates default if not provided) */
  readonly roleMappingService?: IRoleMappingService;
  /** Report generator (optional, creates default if not provided) */
  readonly reportGenerator?: IRemediationReportGenerator;
}

// ---------------------------------------------------------------------------
// Service Implementation
// ---------------------------------------------------------------------------

/**
 * Creates a LegacyDataRemediationService instance.
 *
 * Factory function pattern for DI container registration.
 *
 * @param deps - Service dependencies
 * @returns LegacyDataRemediationService instance
 *
 * @example
 * ```typescript
 * const service = createLegacyDataRemediationService({ prismaClient });
 *
 * // Preview remediation (dry-run)
 * const preview = await service.previewRemediation();
 * console.log(preview.summary);
 *
 * // Run remediation
 * const report = await service.runRemediation({ dryRun: false });
 * console.log(report.summary);
 * ```
 */
export function createLegacyDataRemediationService(
  deps: LegacyDataRemediationServiceDeps,
): ILegacyDataRemediationService {
  const {
    prismaClient,
    quarantineValidator = createQuarantineValidator(),
    roleMappingService = createRoleMappingService(),
    reportGenerator = createRemediationReportGenerator(),
  } = deps;

  // ---------------------------------------------------------------------------
  // Internal Helper Functions
  // ---------------------------------------------------------------------------

  /**
   * Fetch all users without Membership records.
   */
  async function fetchUsersWithoutMembership(limit?: number): Promise<User[]> {
    const users = await prismaClient.user.findMany({
      where: {
        deletedAt: null,
        memberships: {
          none: {},
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: limit,
    });

    return users;
  }

  /**
   * Fetch tenant by ID.
   */
  async function fetchTenant(tenantId: string): Promise<Tenant | null> {
    return prismaClient.tenant.findUnique({
      where: { id: tenantId },
    });
  }

  /**
   * Fetch RT root OrgUnit for a tenant.
   * Returns the root OrgUnit (depth=0) of type RT for the tenant.
   */
  async function fetchRtRootOrgUnit(tenantId: string): Promise<OrgUnit | null> {
    // First try to find an RT type root
    const rtRoot = await prismaClient.orgUnit.findFirst({
      where: {
        tenantId,
        type: 'RT',
        depth: 0,
      },
    });

    if (rtRoot) {
      return rtRoot;
    }

    // Fallback: find any root OrgUnit for this tenant
    const anyRoot = await prismaClient.orgUnit.findFirst({
      where: {
        tenantId,
        parentId: null,
        depth: 0,
      },
    });

    return anyRoot;
  }

  /**
   * Classify a user for remediation.
   */
  async function classifyUser(user: User): Promise<ClassifiedCandidate> {
    const userId = user.id;

    // Check quarantine first
    if (quarantineValidator.isQuarantined(userId)) {
      return {
        candidate: null,
        classification: 'quarantine-match',
        userId,
        reason: 'User is in quarantine manifest (PNA-01 through PNA-05)',
      };
    }

    // Check if tenant exists
    const tenant = await fetchTenant(user.tenantId);
    if (!tenant) {
      return {
        candidate: null,
        classification: 'missing-tenant',
        userId,
        reason: `Tenant ${user.tenantId} does not exist`,
      };
    }

    // Check if role can be mapped
    if (!roleMappingService.canMapRole(user.role)) {
      return {
        candidate: null,
        classification: 'invalid-role',
        userId,
        reason: `Cannot map role '${user.role}' to MembershipRole`,
      };
    }

    // Map role and determine OrgUnit scope
    const targetRole = roleMappingService.mapRole(user.role);

    // Determine target OrgUnit
    let targetOrgUnitId: string | null = null;
    if (roleMappingService.requiresOrgUnitScope(targetRole)) {
      const rtRoot = await fetchRtRootOrgUnit(user.tenantId);
      if (!rtRoot) {
        return {
          candidate: null,
          classification: 'ambiguous',
          userId,
          reason: `No RT root OrgUnit found for tenant ${user.tenantId}. Cannot determine org scope.`,
        };
      }
      targetOrgUnitId = rtRoot.id;
    }

    // Classification successful - create candidate
    const candidate: RemediationCandidate = {
      userId: user.id,
      email: user.email,
      name: user.name,
      legacyTenantId: user.tenantId,
      legacyTenantName: tenant.name,
      legacyRole: user.role,
      targetRole,
      targetOrgUnitId,
      createdAt: user.createdAt,
    };

    return {
      candidate,
      classification: 'known-pattern',
      userId,
      reason: 'User meets all criteria for membership creation',
    };
  }

  /**
   * Create a Membership record for a candidate.
   */
  async function createMembership(
    candidate: RemediationCandidate,
  ): Promise<Membership> {
    return prismaClient.membership.create({
      data: {
        id: randomUUID(),
        userId: candidate.userId,
        tenantId: candidate.legacyTenantId,
        orgUnitId: candidate.targetOrgUnitId,
        role: candidate.targetRole,
        status: 'ACTIVE',
      },
    });
  }

  /**
   * Process a single candidate and return the result.
   */
  async function processCandidate(
    classified: ClassifiedCandidate,
    dryRun: boolean,
  ): Promise<RemediationResult> {
    // Build before state from the classified user
    // We need to fetch the user again to get full details for the before state
    const user = await prismaClient.user.findUnique({
      where: { id: classified.userId },
    });

    if (!user) {
      throw new RemediationError(
        'DATABASE_ERROR',
        `User ${classified.userId} not found`,
        { userId: classified.userId },
      );
    }

    const beforeState: RemediationBeforeState = {
      userId: user.id,
      email: user.email,
      name: user.name,
      legacyTenantId: user.tenantId,
      legacyRole: user.role,
      hasMembership: false,
    };

    // Handle non-eligible candidates
    if (classified.classification !== 'known-pattern' || !classified.candidate) {
      const dispositionMap: Record<
        RemediationClassification,
        RemediationResult['disposition']
      > = {
        'known-pattern': 'created', // Won't reach here
        'quarantine-match': 'skipped-quarantine',
        'missing-tenant': 'skipped-missing-tenant',
        'invalid-role': 'skipped-invalid-role',
        'ambiguous': 'skipped-ambiguous',
      };

      return {
        userId: classified.userId,
        email: user.email,
        disposition: dispositionMap[classified.classification],
        membershipId: null,
        beforeState,
        afterState: null,
        reason: classified.reason,
      };
    }

    // Handle dry-run
    if (dryRun) {
      return {
        userId: classified.userId,
        email: classified.candidate.email,
        disposition: 'skipped-dry-run',
        membershipId: null,
        beforeState,
        afterState: null,
        reason: 'Dry-run mode - no changes made',
      };
    }

    // Create the membership
    const membership = await createMembership(classified.candidate);

    const afterState: RemediationAfterState = {
      userId: membership.userId,
      membershipId: membership.id,
      tenantId: membership.tenantId,
      orgUnitId: membership.orgUnitId,
      role: membership.role,
      status: membership.status,
      hasMembership: true,
    };

    return {
      userId: classified.userId,
      email: classified.candidate.email,
      disposition: 'created',
      membershipId: membership.id,
      beforeState,
      afterState,
      reason: 'Membership created successfully',
    };
  }

  // ---------------------------------------------------------------------------
  // Public Interface Implementation
  // ---------------------------------------------------------------------------

  return {
    async runRemediation(
      options?: Partial<RemediationOptions>,
    ): Promise<RemediationReport> {
      const opts: RemediationOptions = {
        ...DEFAULT_REMEDIATION_OPTIONS,
        ...options,
      };

      const correlationId = opts.correlationId ?? randomUUID();

      // Step 1: Verify quarantine manifest (unless explicitly skipped)
      let quarantineVerification = quarantineValidator.verify();

      if (!opts.skipQuarantineVerification && !quarantineVerification.verified) {
        throw new RemediationError(
          'QUARANTINE_VERIFICATION_FAILED',
          quarantineVerification.errorMessage ??
            'Quarantine manifest verification failed',
          {
            expectedCount: quarantineVerification.expectedCount,
            actualCount: quarantineVerification.actualCount,
          },
        );
      }

      // Step 2: Discover candidates
      const classified = await this.discoverCandidates(opts.limit);

      // Step 3: Process each candidate
      const results: RemediationResult[] = [];

      for (const candidate of classified) {
        const result = await processCandidate(candidate, opts.dryRun);
        results.push(result);
      }

      // Step 4: Generate report
      const report = reportGenerator.generate({
        dryRun: opts.dryRun,
        correlationId,
        quarantineVerification,
        results,
      });

      return report;
    },

    async discoverCandidates(limit?: number): Promise<readonly ClassifiedCandidate[]> {
      // Fetch users without memberships
      const users = await fetchUsersWithoutMembership(limit);

      // Classify each user
      const classified: ClassifiedCandidate[] = [];

      for (const user of users) {
        const result = await classifyUser(user);
        classified.push(result);
      }

      return classified;
    },

    async previewRemediation(limit?: number): Promise<RemediationReport> {
      return this.runRemediation({
        dryRun: true,
        limit,
      });
    },
  };
}
