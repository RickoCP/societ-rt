/**
 * TenantScopedRepository — Base helper that enforces `tenant_id` filtering
 * on every Prisma query for multi-tenant data isolation.
 *
 * All repository implementations MUST use this helper. Direct Prisma queries
 * without a `tenant_id` filter are FORBIDDEN.
 *
 * The helper wraps common Prisma delegate operations and automatically injects
 * the `tenantId` into every query's `where` clause or `data` payload.
 *
 * @example
 * ```ts
 * import { createTenantScopedRepository } from '@infrastructure/repositories/TenantScopedRepository';
 * import { prisma } from '@infrastructure/repositories/prismaClient';
 *
 * const userRepo = createTenantScopedRepository(prisma.user);
 * const users = await userRepo.findMany('tenant-uuid', { where: { status: 'active' } });
 * ```
 *
 * ## Optional: PostgreSQL Row-Level Security (RLS)
 *
 * For an extra safety layer beyond application-level filtering, you can enable
 * RLS on tenant-scoped tables. This ensures the database itself rejects any
 * query that does not match the current tenant context, even if the application
 * code has a bug.
 *
 * ### Setup (per table):
 *
 * ```sql
 * -- 1. Enable RLS on the table
 * ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
 *
 * -- 2. Create a policy that restricts rows to the current tenant
 * CREATE POLICY tenant_isolation ON <table>
 *   USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
 *
 * -- 3. Before each request, set the tenant context in the session:
 * SET LOCAL app.current_tenant_id = '<tenant-uuid>';
 * ```
 *
 * ### Notes:
 * - RLS policies apply to ALL queries (SELECT, INSERT, UPDATE, DELETE).
 * - The `SET LOCAL` command scopes the setting to the current transaction.
 * - Superuser / table owner bypasses RLS by default; use `FORCE ROW LEVEL SECURITY`
 *   on the table if the application connects as the table owner.
 * - RLS is a defense-in-depth measure — the application MUST still filter by
 *   `tenant_id` at the repository level.
 *
 * @see Requirements 1.2, 1.3, 1.5
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Minimal shape of a Prisma model delegate that supports tenant-scoped
 * operations. We use structural typing so this works with any Prisma model
 * that exposes the standard CRUD methods.
 */
interface PrismaDelegate {
  findMany(args?: Record<string, unknown>): Promise<unknown[]>;
  findFirst(args?: Record<string, unknown>): Promise<unknown | null>;
  findUnique(args?: Record<string, unknown>): Promise<unknown | null>;
  create(args: Record<string, unknown>): Promise<unknown>;
  update(args: Record<string, unknown>): Promise<unknown>;
  delete(args: Record<string, unknown>): Promise<unknown>;
  count(args?: Record<string, unknown>): Promise<number>;
}

/** Arguments object with an optional `where` clause. */
interface WhereArgs {
  where?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Arguments object with a `data` payload. */
interface DataArgs {
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// TenantScopedRepository interface
// ---------------------------------------------------------------------------

/**
 * Public API returned by `createTenantScopedRepository`.
 *
 * Every method requires a `tenantId` as the first argument so that tenant
 * isolation is enforced at the call-site level — callers cannot accidentally
 * omit the tenant filter.
 */
export interface TenantScopedRepository<T> {
  /**
   * Find many records scoped to the given tenant.
   * Merges `tenantId` into the `where` clause.
   */
  findMany(tenantId: string, args?: WhereArgs): Promise<T[]>;

  /**
   * Find the first record matching the filter, scoped to the given tenant.
   * Merges `tenantId` into the `where` clause.
   */
  findFirst(tenantId: string, args?: WhereArgs): Promise<T | null>;

  /**
   * Find a unique record scoped to the given tenant.
   * Merges `tenantId` into the `where` clause (useful for compound unique lookups).
   */
  findUnique(tenantId: string, args?: WhereArgs): Promise<T | null>;

  /**
   * Create a new record with `tenantId` automatically set in the data payload.
   */
  create(tenantId: string, args: DataArgs): Promise<T>;

  /**
   * Update a record scoped to the given tenant.
   * Merges `tenantId` into the `where` clause to prevent cross-tenant updates.
   */
  update(tenantId: string, args: WhereArgs & DataArgs): Promise<T>;

  /**
   * Delete a record scoped to the given tenant.
   * Merges `tenantId` into the `where` clause to prevent cross-tenant deletes.
   */
  delete(tenantId: string, args: WhereArgs): Promise<T>;

  /**
   * Count records scoped to the given tenant.
   * Merges `tenantId` into the `where` clause.
   */
  count(tenantId: string, args?: WhereArgs): Promise<number>;
}

// ---------------------------------------------------------------------------
// Helper: merge tenantId into where clause
// ---------------------------------------------------------------------------

function mergeWhereWithTenantId(
  tenantId: string,
  args?: WhereArgs,
): Record<string, unknown> {
  const existing = args?.where ?? {};
  return {
    ...args,
    where: {
      ...existing,
      tenantId,
    },
  };
}

// ---------------------------------------------------------------------------
// Helper: merge tenantId into data payload
// ---------------------------------------------------------------------------

function mergeDataWithTenantId(
  tenantId: string,
  args: DataArgs,
): Record<string, unknown> {
  const existing = args.data ?? {};
  return {
    ...args,
    data: {
      ...existing,
      tenantId,
    },
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a tenant-scoped wrapper around a Prisma model delegate.
 *
 * The returned object enforces `tenant_id` filtering on every operation,
 * making it impossible to accidentally query across tenant boundaries.
 *
 * @param delegate - A Prisma model delegate (e.g. `prisma.user`, `prisma.tenant`)
 * @returns A `TenantScopedRepository<T>` with tenant-safe CRUD methods
 */
export function createTenantScopedRepository<T>(
  delegate: PrismaDelegate,
): TenantScopedRepository<T> {
  return {
    async findMany(tenantId: string, args?: WhereArgs): Promise<T[]> {
      const merged = mergeWhereWithTenantId(tenantId, args);
      return delegate.findMany(merged) as Promise<T[]>;
    },

    async findFirst(tenantId: string, args?: WhereArgs): Promise<T | null> {
      const merged = mergeWhereWithTenantId(tenantId, args);
      return delegate.findFirst(merged) as Promise<T | null>;
    },

    async findUnique(tenantId: string, args?: WhereArgs): Promise<T | null> {
      const merged = mergeWhereWithTenantId(tenantId, args);
      return delegate.findUnique(merged) as Promise<T | null>;
    },

    async create(tenantId: string, args: DataArgs): Promise<T> {
      const merged = mergeDataWithTenantId(tenantId, args);
      return delegate.create(merged) as Promise<T>;
    },

    async update(tenantId: string, args: WhereArgs & DataArgs): Promise<T> {
      const mergedWhere = mergeWhereWithTenantId(tenantId, args);
      return delegate.update(mergedWhere) as Promise<T>;
    },

    async delete(tenantId: string, args: WhereArgs): Promise<T> {
      const merged = mergeWhereWithTenantId(tenantId, args);
      return delegate.delete(merged) as Promise<T>;
    },

    async count(tenantId: string, args?: WhereArgs): Promise<number> {
      const merged = mergeWhereWithTenantId(tenantId, args);
      return delegate.count(merged);
    },
  };
}
