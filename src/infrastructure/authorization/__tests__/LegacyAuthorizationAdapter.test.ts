/**
 * Legacy Authorization Adapter Unit Tests
 *
 * Tests the legacy authorization adapter that wraps User.tenantId + UserRole
 * checks for shadow authorization validation.
 *
 * @see Requirements 7 (AC 1)
 * @see Design Shadow Authorization Validation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserRole } from '@core/protocols';
import {
  LegacyAuthorizationAdapterImpl,
  type ILegacyUserRepository,
  type LegacyUserData,
  type ILegacyAuthorizationAdapter,
} from '../LegacyAuthorizationAdapter';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const createMockLegacyUserData = (
  overrides: Partial<LegacyUserData> = {},
): LegacyUserData => ({
  id: 'user-123',
  tenantId: 'tenant-456',
  role: UserRole.Warga,
  tokenVersion: 1,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Mock Repository Factory
// ---------------------------------------------------------------------------

const createMockUserRepository = (
  user: LegacyUserData | null = createMockLegacyUserData(),
): ILegacyUserRepository => ({
  findById: vi.fn().mockResolvedValue(user),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LegacyAuthorizationAdapter', () => {
  let adapter: ILegacyAuthorizationAdapter;
  let mockUserRepo: ILegacyUserRepository;

  beforeEach(() => {
    mockUserRepo = createMockUserRepository();
    adapter = LegacyAuthorizationAdapterImpl({
      legacyUserRepository: mockUserRepo,
    });
  });

  // -------------------------------------------------------------------------
  // Basic Authorization Flow
  // -------------------------------------------------------------------------

  describe('authorize - Basic Flow', () => {
    it('should allow access for valid user with matching tenant', async () => {
      const result = await adapter.authorize({
        userId: 'user-123',
        targetTenantId: 'tenant-456',
        jwtTokenVersion: 1,
        requiredPermissions: ['emergency:create'], // Warga can do emergency
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(true);
        expect(result.data.role).toBe(UserRole.Warga);
      }
    });

    it('should deny access when user not found', async () => {
      mockUserRepo = createMockUserRepository(null);
      adapter = LegacyAuthorizationAdapterImpl({
        legacyUserRepository: mockUserRepo,
      });

      const result = await adapter.authorize({
        userId: 'non-existent',
        targetTenantId: 'tenant-456',
        jwtTokenVersion: 1,
        requiredPermissions: [],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(false);
        expect(result.data.errorCode).toBe('AUTH_NO_USER');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Token Version Validation
  // -------------------------------------------------------------------------

  describe('authorize - Token Version', () => {
    it('should deny access when token version mismatches', async () => {
      const result = await adapter.authorize({
        userId: 'user-123',
        targetTenantId: 'tenant-456',
        jwtTokenVersion: 2, // Different from user's tokenVersion (1)
        requiredPermissions: [],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(false);
        expect(result.data.errorCode).toBe('AUTH_TOKEN_REVOKED');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Tenant Validation
  // -------------------------------------------------------------------------

  describe('authorize - Tenant Check', () => {
    it('should deny access when tenant mismatches for non-Super_Admin', async () => {
      const result = await adapter.authorize({
        userId: 'user-123',
        targetTenantId: 'different-tenant',
        jwtTokenVersion: 1,
        requiredPermissions: [],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(false);
        expect(result.data.errorCode).toBe('AUTH_TENANT_MISMATCH');
      }
    });

    it('should allow Super_Admin to access different tenant', async () => {
      mockUserRepo = createMockUserRepository(
        createMockLegacyUserData({
          role: UserRole.Super_Admin,
          tenantId: 'admin-tenant',
        }),
      );
      adapter = LegacyAuthorizationAdapterImpl({
        legacyUserRepository: mockUserRepo,
      });

      const result = await adapter.authorize({
        userId: 'user-123',
        targetTenantId: 'different-tenant',
        jwtTokenVersion: 1,
        requiredPermissions: ['platform:config:read'],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(true);
      }
    });

    it('should deny access when user has no tenant (non-Super_Admin)', async () => {
      mockUserRepo = createMockUserRepository(
        createMockLegacyUserData({
          tenantId: null,
          role: UserRole.Warga,
        }),
      );
      adapter = LegacyAuthorizationAdapterImpl({
        legacyUserRepository: mockUserRepo,
      });

      const result = await adapter.authorize({
        userId: 'user-123',
        targetTenantId: 'some-tenant',
        jwtTokenVersion: 1,
        requiredPermissions: [],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(false);
        expect(result.data.errorCode).toBe('AUTH_NO_TENANT');
      }
    });

    it('should allow Super_Admin with null tenantId (platform-level)', async () => {
      mockUserRepo = createMockUserRepository(
        createMockLegacyUserData({
          tenantId: null,
          role: UserRole.Super_Admin,
        }),
      );
      adapter = LegacyAuthorizationAdapterImpl({
        legacyUserRepository: mockUserRepo,
      });

      const result = await adapter.authorize({
        userId: 'user-123',
        targetTenantId: 'any-tenant',
        jwtTokenVersion: 1,
        requiredPermissions: ['platform:config:read'],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Permission Checking (Role Hierarchy)
  // -------------------------------------------------------------------------

  describe('authorize - Permission Check', () => {
    it('should allow Warga to access emergency:create', async () => {
      const result = await adapter.authorize({
        userId: 'user-123',
        targetTenantId: 'tenant-456',
        jwtTokenVersion: 1,
        requiredPermissions: ['emergency:create'],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(true);
      }
    });

    it('should deny Warga from accessing finance:read', async () => {
      const result = await adapter.authorize({
        userId: 'user-123',
        targetTenantId: 'tenant-456',
        jwtTokenVersion: 1,
        requiredPermissions: ['finance:read'],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(false);
        expect(result.data.errorCode).toBe('AUTH_INSUFFICIENT_PERMISSION');
      }
    });

    it('should allow Ketua_RT to access finance:read', async () => {
      mockUserRepo = createMockUserRepository(
        createMockLegacyUserData({ role: UserRole.Ketua_RT }),
      );
      adapter = LegacyAuthorizationAdapterImpl({
        legacyUserRepository: mockUserRepo,
      });

      const result = await adapter.authorize({
        userId: 'user-123',
        targetTenantId: 'tenant-456',
        jwtTokenVersion: 1,
        requiredPermissions: ['finance:read'],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(true);
      }
    });

    it('should allow Security_Guard to access resident:read', async () => {
      mockUserRepo = createMockUserRepository(
        createMockLegacyUserData({ role: UserRole.Security_Guard }),
      );
      adapter = LegacyAuthorizationAdapterImpl({
        legacyUserRepository: mockUserRepo,
      });

      const result = await adapter.authorize({
        userId: 'user-123',
        targetTenantId: 'tenant-456',
        jwtTokenVersion: 1,
        requiredPermissions: ['resident:read'],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(true);
      }
    });

    it('should check all required permissions', async () => {
      const result = await adapter.authorize({
        userId: 'user-123',
        targetTenantId: 'tenant-456',
        jwtTokenVersion: 1,
        requiredPermissions: ['emergency:create', 'finance:read'], // Warga can't do finance
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allowed).toBe(false);
        expect(result.data.reason).toContain('finance:read');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Get Legacy User Data
  // -------------------------------------------------------------------------

  describe('getLegacyUserData', () => {
    it('should return legacy user data', async () => {
      const userData = await adapter.getLegacyUserData('user-123');

      expect(userData).toBeDefined();
      expect(userData?.id).toBe('user-123');
      expect(userData?.tenantId).toBe('tenant-456');
      expect(userData?.role).toBe(UserRole.Warga);
    });

    it('should return null for non-existent user', async () => {
      mockUserRepo = createMockUserRepository(null);
      adapter = LegacyAuthorizationAdapterImpl({
        legacyUserRepository: mockUserRepo,
      });

      const userData = await adapter.getLegacyUserData('non-existent');

      expect(userData).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Error Handling
  // -------------------------------------------------------------------------

  describe('Error Handling', () => {
    it('should fail gracefully when repository throws', async () => {
      mockUserRepo = {
        findById: vi.fn().mockRejectedValue(new Error('Database error')),
      };
      adapter = LegacyAuthorizationAdapterImpl({
        legacyUserRepository: mockUserRepo,
      });

      const result = await adapter.authorize({
        userId: 'user-123',
        targetTenantId: 'tenant-456',
        jwtTokenVersion: 1,
        requiredPermissions: [],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('LEGACY_AUTH_FAILED');
      }
    });
  });
});

