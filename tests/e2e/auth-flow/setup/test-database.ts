/**
 * Test Database Utilities — E2E Auth Flow Tests
 *
 * Provides utilities for setting up and tearing down test data
 * in the database for E2E auth flow tests.
 *
 * CRITICAL: All test data uses `test-e2e-` prefix for isolation.
 * Tests MUST clean up their data after execution.
 *
 * @see Requirements 13.1 — E2E test infrastructure setup
 * @see Design Integration Test Suite for Auth Flow
 */

import { PrismaClient, TenantStatus, OrgUnitType, UserRole as PrismaUserRole } from '../../../../src/generated/prisma/client';
import { MembershipRole, MembershipStatus } from '@core/domains/membership/types';

// ---------------------------------------------------------------------------
// Test Database Client
// ---------------------------------------------------------------------------

/**
 * Singleton Prisma client for E2E tests.
 * Uses test database connection from environment.
 */
let testPrismaClient: PrismaClient | null = null;

/**
 * Get or create the test Prisma client.
 */
export function getTestPrismaClient(): PrismaClient {
  if (!testPrismaClient) {
    testPrismaClient = new PrismaClient({
      log: process.env.DEBUG_PRISMA === 'true' ? ['query', 'error', 'warn'] : ['error'],
    } as Parameters<typeof PrismaClient>[0]);
  }
  return testPrismaClient;
}

/**
 * Disconnect the test Prisma client.
 * Call this after all tests complete.
 */
export async function disconnectTestDatabase(): Promise<void> {
  if (testPrismaClient) {
    await testPrismaClient.$disconnect();
    testPrismaClient = null;
  }
}

// ---------------------------------------------------------------------------
// Test Data IDs — Deterministic for consistency
// ---------------------------------------------------------------------------

/**
 * Test data ID prefix for isolation.
 * All test entities use this prefix to avoid conflicts with real data.
 */
export const TEST_ID_PREFIX = 'test-e2e-';

/**
 * Generate a deterministic test ID.
 * @param entityType - Type of entity (user, tenant, membership, etc.)
 * @param identifier - Unique identifier within the entity type
 */
export function generateTestId(entityType: string, identifier: string): string {
  return `${TEST_ID_PREFIX}${entityType}-${identifier}`;
}

// ---------------------------------------------------------------------------
// Test Tenant Setup
// ---------------------------------------------------------------------------

/**
 * Test tenant configuration.
 */
export interface TestTenantConfig {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly subscriptionStatus?: TenantStatus;
}

/**
 * Create a test tenant with realistic data.
 */
export async function createTestTenant(
  config: TestTenantConfig,
): Promise<void> {
  const prisma = getTestPrismaClient();

  // Check if tenant already exists (idempotent)
  const existing = await prisma.tenant.findUnique({
    where: { id: config.id },
  });

  if (existing) {
    return;
  }

  await prisma.tenant.create({
    data: {
      id: config.id,
      name: config.name,
      slug: config.slug,
      email: `${config.slug}@test.societ-rt.local`,
      phone: '+62-000-0000-0000',
      address: 'Test Address',
      status: config.subscriptionStatus ?? TenantStatus.active,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

/**
 * Delete a test tenant and all associated data.
 */
export async function deleteTestTenant(tenantId: string): Promise<void> {
  const prisma = getTestPrismaClient();

  // Delete in reverse dependency order
  await prisma.membership.deleteMany({ where: { tenantId } });
  await prisma.orgUnit.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
}

// ---------------------------------------------------------------------------
// Test OrgUnit Setup
// ---------------------------------------------------------------------------

/**
 * Test OrgUnit configuration.
 */
export interface TestOrgUnitConfig {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly type: OrgUnitType;
  readonly parentId?: string | null;
  readonly code?: string;
}

/**
 * Create a test OrgUnit.
 */
export async function createTestOrgUnit(
  config: TestOrgUnitConfig,
): Promise<void> {
  const prisma = getTestPrismaClient();

  // Check if OrgUnit already exists (idempotent)
  const existing = await prisma.orgUnit.findUnique({
    where: { id: config.id },
  });

  if (existing) {
    return;
  }

  await prisma.orgUnit.create({
    data: {
      id: config.id,
      tenantId: config.tenantId,
      name: config.name,
      type: config.type,
      code: config.code ?? config.name.toUpperCase().replace(/\s/g, '_'),
      parentId: config.parentId ?? undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

// ---------------------------------------------------------------------------
// Test User Setup
// ---------------------------------------------------------------------------

/**
 * Test user configuration.
 */
export interface TestUserConfig {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly tokenVersion?: number;
  readonly legacyRole?: PrismaUserRole;
  readonly legacyTenantId?: string | null;
}

/**
 * Create a test user.
 */
export async function createTestUser(
  config: TestUserConfig,
): Promise<void> {
  const prisma = getTestPrismaClient();

  // Check if user already exists (idempotent)
  const existing = await prisma.user.findUnique({
    where: { id: config.id },
  });

  if (existing) {
    return;
  }

  await prisma.user.create({
    data: {
      id: config.id,
      email: config.email,
      passwordHash: '$2b$10$test-password-hash', // Placeholder for tests
      name: config.name,
      phone: '+62-000-0000-0001',
      role: config.legacyRole ?? PrismaUserRole.Warga,
      tenantId: config.legacyTenantId ?? undefined,
      tokenVersion: config.tokenVersion ?? 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

/**
 * Delete a test user and associated data.
 */
export async function deleteTestUser(userId: string): Promise<void> {
  const prisma = getTestPrismaClient();

  // Delete memberships first
  await prisma.membership.deleteMany({ where: { userId } });
  // Delete user
  await prisma.user.deleteMany({ where: { id: userId } });
}

/**
 * Update user's token version (for invalidation tests).
 */
export async function updateUserTokenVersion(
  userId: string,
  newVersion: number,
): Promise<void> {
  const prisma = getTestPrismaClient();

  await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: newVersion },
  });
}

/**
 * Get user's current token version.
 */
export async function getUserTokenVersion(userId: string): Promise<number> {
  const prisma = getTestPrismaClient();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tokenVersion: true },
  });

  return user?.tokenVersion ?? 1;
}

// ---------------------------------------------------------------------------
// Test Membership Setup
// ---------------------------------------------------------------------------

/**
 * Test membership configuration.
 */
export interface TestMembershipConfig {
  readonly id: string;
  readonly userId: string;
  readonly tenantId: string;
  readonly orgUnitId: string | null;
  readonly role: MembershipRole;
  readonly status?: MembershipStatus;
}

/**
 * Create a test membership.
 */
export async function createTestMembership(
  config: TestMembershipConfig,
): Promise<void> {
  const prisma = getTestPrismaClient();

  // Check if membership already exists (idempotent)
  const existing = await prisma.membership.findUnique({
    where: { id: config.id },
  });

  if (existing) {
    return;
  }

  await prisma.membership.create({
    data: {
      id: config.id,
      userId: config.userId,
      tenantId: config.tenantId,
      orgUnitId: config.orgUnitId,
      role: config.role,
      status: config.status ?? MembershipStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
      revokedAt: config.status === MembershipStatus.REVOKED ? new Date() : null,
    },
  });
}

/**
 * Update membership status.
 */
export async function updateMembershipStatus(
  membershipId: string,
  status: MembershipStatus,
): Promise<void> {
  const prisma = getTestPrismaClient();

  await prisma.membership.update({
    where: { id: membershipId },
    data: {
      status,
      revokedAt: status === MembershipStatus.REVOKED ? new Date() : null,
      updatedAt: new Date(),
    },
  });
}

/**
 * Delete a test membership.
 */
export async function deleteTestMembership(membershipId: string): Promise<void> {
  const prisma = getTestPrismaClient();

  await prisma.membership.deleteMany({ where: { id: membershipId } });
}

// ---------------------------------------------------------------------------
// Bulk Setup / Teardown
// ---------------------------------------------------------------------------

/**
 * Complete test data setup configuration.
 */
export interface TestDataSetup {
  readonly tenants: readonly TestTenantConfig[];
  readonly orgUnits: readonly TestOrgUnitConfig[];
  readonly users: readonly TestUserConfig[];
  readonly memberships: readonly TestMembershipConfig[];
}

/**
 * Set up complete test data in correct order.
 */
export async function setupTestData(config: TestDataSetup): Promise<void> {
  // Create in dependency order
  for (const tenant of config.tenants) {
    await createTestTenant(tenant);
  }

  for (const orgUnit of config.orgUnits) {
    await createTestOrgUnit(orgUnit);
  }

  for (const user of config.users) {
    await createTestUser(user);
  }

  for (const membership of config.memberships) {
    await createTestMembership(membership);
  }
}

/**
 * Tear down all test data matching the prefix.
 */
export async function teardownAllTestData(): Promise<void> {
  const prisma = getTestPrismaClient();

  // Delete in reverse dependency order
  await prisma.membership.deleteMany({
    where: { id: { startsWith: TEST_ID_PREFIX } },
  });

  await prisma.user.deleteMany({
    where: { id: { startsWith: TEST_ID_PREFIX } },
  });

  await prisma.orgUnit.deleteMany({
    where: { id: { startsWith: TEST_ID_PREFIX } },
  });

  await prisma.tenant.deleteMany({
    where: { id: { startsWith: TEST_ID_PREFIX } },
  });
}

// ---------------------------------------------------------------------------
// Test Data Verification
// ---------------------------------------------------------------------------

/**
 * Verify test tenant exists.
 */
export async function verifyTestTenantExists(tenantId: string): Promise<boolean> {
  const prisma = getTestPrismaClient();
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  return tenant !== null;
}

/**
 * Verify test user exists.
 */
export async function verifyTestUserExists(userId: string): Promise<boolean> {
  const prisma = getTestPrismaClient();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return user !== null;
}

/**
 * Verify test membership exists with expected status.
 */
export async function verifyTestMembershipStatus(
  membershipId: string,
  expectedStatus: MembershipStatus,
): Promise<boolean> {
  const prisma = getTestPrismaClient();
  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
    select: { status: true },
  });
  return membership?.status === expectedStatus;
}
