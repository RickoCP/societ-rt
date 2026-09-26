/**
 * GET /api/files/[key] — Get signed URL for a file.
 * DELETE /api/files/[key] — Delete a file.
 *
 * BFF pattern: withPermission → execute repository → return safe response.
 *
 * Migrated to withPermission pattern per Requirements 2.1, 2.2, 2.3.
 *
 * @see Requirements 26.4
 * @see Requirements 2.1 — withPermission pattern
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { FileStorageRepository } from '@core/domains/fileStorage/repositories/FileStorageRepository';

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface FileUrlSuccessResponse {
  data: { url: string };
}

interface FileDeleteSuccessResponse {
  data: null;
}

interface FileErrorResponse {
  code: string;
  message: string;
  correlationId: string;
}

// ---------------------------------------------------------------------------
// GET handler — Get signed URL for a file
// ---------------------------------------------------------------------------

/**
 * Handler for getting a signed URL for file download.
 *
 * AuthorizationContext is guaranteed to have resident:read permission
 * after withPermission validation.
 *
 * @see Permission Mapping: GET /api/files/[key] → resident:read
 */
const handleGetFileUrl: AuthorizedRouteHandler<FileUrlSuccessResponse | FileErrorResponse> = async (
  request: NextRequest,
  _authContext: AuthorizationContext,
  context?: { params?: Promise<Record<string, string>> },
): Promise<NextResponse<FileUrlSuccessResponse | FileErrorResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const { key } = (await context?.params) ?? {};
  if (!key) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'File key is required',
        correlationId,
      },
      { status: 400 },
    );
  }

  const decodedKey = decodeURIComponent(key);

  const repo = container.resolve<FileStorageRepository>(
    'fileStorageRepository',
  );
  const result = await repo.getSignedUrl(decodedKey, 3600);

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId) as NextResponse<FileErrorResponse>;
  }

  return NextResponse.json({ data: { url: result.data } }, { status: 200 });
};

// ---------------------------------------------------------------------------
// DELETE handler — Delete a file
// ---------------------------------------------------------------------------

/**
 * Handler for deleting a file.
 *
 * AuthorizationContext is guaranteed to have resident:write permission
 * after withPermission validation.
 *
 * @see Permission Mapping: DELETE /api/files/[key] → resident:write
 */
const handleDeleteFile: AuthorizedRouteHandler<FileDeleteSuccessResponse | FileErrorResponse> = async (
  request: NextRequest,
  _authContext: AuthorizationContext,
  context?: { params?: Promise<Record<string, string>> },
): Promise<NextResponse<FileDeleteSuccessResponse | FileErrorResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const { key } = (await context?.params) ?? {};
  if (!key) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'File key is required',
        correlationId,
      },
      { status: 400 },
    );
  }

  const decodedKey = decodeURIComponent(key);

  const repo = container.resolve<FileStorageRepository>(
    'fileStorageRepository',
  );
  const result = await repo.delete(decodedKey);

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId) as NextResponse<FileErrorResponse>;
  }

  return NextResponse.json({ data: null }, { status: 200 });
};

// ---------------------------------------------------------------------------
// Export route handlers with permission wrappers
// ---------------------------------------------------------------------------

/**
 * GET /api/files/[key] — Get signed URL for file download (requires resident:read)
 *
 * Users with resident:read permission can download files.
 * This includes: TENANT_OWNER, ORG_ADMIN, RT_ADMIN, SECURITY, RESIDENT roles.
 *
 * @see Permission Mapping: /api/files/[key] GET → resident:read
 */
export const GET = withPermission(
  { permissions: ['resident:read'] },
  handleGetFileUrl,
);

/**
 * DELETE /api/files/[key] — Delete a file (requires resident:write)
 *
 * Users with resident:write permission can delete files.
 * This includes: TENANT_OWNER, ORG_ADMIN, RT_ADMIN roles.
 *
 * @see Permission Mapping: /api/files/[key] DELETE → resident:write
 */
export const DELETE = withPermission(
  { permissions: ['resident:write'] },
  handleDeleteFile,
);
