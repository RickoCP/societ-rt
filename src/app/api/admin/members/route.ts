/**
 * GET /api/admin/members — List members for the tenant.
 * POST /api/admin/members — Invite new member.
 *
 * BFF pattern: withPermission → execute use case → return safe response.
 *
 * @see Requirements 2.1-2.12 (Membership List Screen)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import {
  withPermission,
  resolveTargetTenantFromContainer,
  type AuthorizedRouteHandler,
} from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { ErrorResponseBody } from '@infrastructure/utils/errorMapping';
import { mapLegacyRole, mapToLegacyRole } from '@core/domains/membership/types';
import { MembershipRole, MembershipStatus } from '@core/domains/membership/types';
import { UserRole } from '@core/protocols';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Denormalize a canonical MembershipRole (what the UI sends) back to the legacy
 * UserRole enum stored in the `users` table. TENANT_OWNER has no legacy
 * equivalent → fall back to the least-privileged Warga.
 */
function toUserRole(role: MembershipRole): UserRole {
  return mapToLegacyRole(role) ?? UserRole.Warga;
}

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const createMemberSchema = z.object({
  name: z.string().min(1, 'name is required').max(120),
  email: z.string().email('invalid email'),
  role: z.nativeEnum(MembershipRole),
});

/**
 * Normalize a stored role (legacy UserRole like "Ketua_RT", or already a
 * MembershipRole) into the canonical MembershipRole the UI expects.
 */
function normalizeMemberRole(stored: string): MembershipRole {
  if ((Object.values(MembershipRole) as string[]).includes(stored)) {
    return stored as MembershipRole;
  }
  if ((Object.values(UserRole) as string[]).includes(stored)) {
    const mapped = mapLegacyRole(stored as UserRole);
    if (mapped) {
      return mapped;
    }
  }
  // Fail securely to the least-privileged role for unknown values.
  return MembershipRole.RESIDENT;
}

/**
 * Normalize the stored user status (UserStatus: active/locked/inactive) into
 * the MembershipStatus the UI expects (ACTIVE/INVITED/SUSPENDED/REVOKED).
 */
function normalizeMemberStatus(stored: string): MembershipStatus {
  // Already a MembershipStatus → use as-is.
  if ((Object.values(MembershipStatus) as string[]).includes(stored)) {
    return stored as MembershipStatus;
  }
  switch (stored) {
    case 'active':
      return MembershipStatus.ACTIVE;
    case 'locked':
      return MembershipStatus.SUSPENDED;
    case 'inactive':
      return MembershipStatus.REVOKED;
    default:
      return MembershipStatus.ACTIVE;
  }
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface MemberListResponse {
  data: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    orgUnitId: string | null;
    orgUnitName: string | null;
    createdAt: string;
  }>;
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

// ---------------------------------------------------------------------------
// GET handler — List members
// ---------------------------------------------------------------------------

const handleListMembers: AuthorizedRouteHandler<MemberListResponse | ErrorResponseBody> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<MemberListResponse | ErrorResponseBody>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  try {
    // Resolve the tenant to scope to. PLATFORM_ADMIN may target another tenant
    // via ?tenantId=; everyone else is restricted to their own tenant.
    const targetTenant = await resolveTargetTenantFromContainer(
      request,
      authContext,
      'admin/members',
      container,
    );
    if (!targetTenant.ok) {
      return NextResponse.json(
        {
          code: targetTenant.code,
          message: targetTenant.message,
          correlationId,
        },
        { status: targetTenant.status },
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') ?? '25', 10);
    const sortColumn = searchParams.get('sortColumn') ?? 'name';
    const sortDirection = searchParams.get('sortDirection') ?? 'asc';
    const search = searchParams.get('search') ?? '';
    const role = searchParams.get('role');
    const status = searchParams.get('status');

    // Build query
    const offset = (page - 1) * pageSize;
    const validSortColumns = ['name', 'email', 'role', 'status', 'created_at'];
    const validSortColumn = validSortColumns.includes(sortColumn) ? sortColumn : 'name';
    const validSortDirection = sortDirection === 'desc' ? 'DESC' : 'ASC';

    // Query users for the tenant
    let query = `
      SELECT 
        u.id, 
        u.name, 
        u.email, 
        u.role, 
        u.status,
        u.created_at,
        NULL as org_unit_id,
        NULL as org_unit_name
      FROM users u
      WHERE u.tenant_id = $1 AND u.deleted_at IS NULL
    `;
    const params: (string | number)[] = [targetTenant.tenantId];
    let paramIndex = 2;

    if (search) {
      query += ` AND (u.name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (role) {
      query += ` AND u.role = $${paramIndex}`;
      params.push(role);
      paramIndex++;
    }

    if (status) {
      query += ` AND u.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    // Get total count
    const countQuery = query.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as count FROM');
    const countResult = await pool.query(countQuery, params);
    const totalCount = parseInt(countResult.rows[0]?.count ?? '0', 10);

    // Add sorting and pagination
    query += ` ORDER BY u.${validSortColumn} ${validSortDirection} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(pageSize, offset);

    const result = await pool.query(query, params);

    const members = result.rows.map((row) => ({
      id: row.id,
      name: row.name ?? '',
      email: row.email,
      // Normalize legacy DB role/status to the canonical MembershipRole/
      // MembershipStatus the UI renders (prevents StatusBadge crashes on
      // lowercase 'active' or legacy 'Ketua_RT').
      role: normalizeMemberRole(row.role),
      status: normalizeMemberStatus(row.status ?? 'active'),
      orgUnitId: row.org_unit_id,
      orgUnitName: row.org_unit_name,
      createdAt: row.created_at?.toISOString() ?? new Date().toISOString(),
    }));

    return NextResponse.json(
      {
        data: members,
        pagination: {
          page,
          pageSize,
          totalCount,
          totalPages: Math.ceil(totalCount / pageSize),
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('[admin/members] Error:', error);
    return NextResponse.json(
      {
        code: 'COMMON_UNEXPECTED_ERROR',
        message: 'Failed to fetch members',
        correlationId,
      },
      { status: 500 },
    );
  }
};

// ---------------------------------------------------------------------------
// POST handler — Create (invite) a member
// ---------------------------------------------------------------------------

const handleCreateMember: AuthorizedRouteHandler<unknown> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // Resolve target tenant (PLATFORM_ADMIN may create in another tenant).
  const targetTenant = await resolveTargetTenantFromContainer(
    request,
    authContext,
    'admin/members:create',
    container,
  );
  if (!targetTenant.ok) {
    return NextResponse.json(
      { code: targetTenant.code, message: targetTenant.message, correlationId },
      { status: targetTenant.status },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Invalid JSON body', correlationId },
      { status: 400 },
    );
  }

  const validation = createMemberSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        fields: formatZodErrors(validation.error),
        correlationId,
      },
      { status: 400 },
    );
  }

  const { name, email, role } = validation.data;

  try {
    // Uniqueness is enforced by UNIQUE(tenant_id, email); check first for a
    // friendly 409 instead of a raw constraint error.
    const existing = await pool.query(
      `SELECT id FROM users WHERE tenant_id = $1 AND email = $2 AND deleted_at IS NULL LIMIT 1`,
      [targetTenant.tenantId, email],
    );
    if (existing.rows.length > 0) {
      return NextResponse.json(
        {
          code: 'MEMBER_EMAIL_EXISTS',
          message: 'A member with this email already exists in the tenant',
          correlationId,
        },
        { status: 409 },
      );
    }

    // The user sets a real password via a reset flow; store a random,
    // non-guessable placeholder hash so the account cannot be used until then.
    const placeholderHash = await bcrypt.hash(randomBytes(32).toString('hex'), 12);

    const insert = await pool.query(
      `INSERT INTO users (tenant_id, name, email, password_hash, role, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       RETURNING id, name, email, role, status, created_at`,
      [targetTenant.tenantId, name, email, placeholderHash, toUserRole(role)],
    );

    const row = insert.rows[0];
    return NextResponse.json(
      {
        data: {
          id: row.id,
          name: row.name ?? '',
          email: row.email,
          role: normalizeMemberRole(row.role),
          status: normalizeMemberStatus(row.status ?? 'active'),
          orgUnitId: null,
          orgUnitName: null,
          createdAt: row.created_at?.toISOString() ?? new Date().toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('[admin/members] Create error:', error);
    return NextResponse.json(
      {
        code: 'COMMON_UNEXPECTED_ERROR',
        message: 'Failed to create member',
        correlationId,
      },
      { status: 500 },
    );
  }
};

// ---------------------------------------------------------------------------
// Exported Route Handlers
// ---------------------------------------------------------------------------

export const GET = withPermission(
  { permissions: ['membership:read'] },
  handleListMembers,
);

export const POST = withPermission(
  { permissions: ['membership:delegate'] },
  handleCreateMember,
);
