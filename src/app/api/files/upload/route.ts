/**
 * POST /api/files/upload — Upload a file.
 *
 * BFF pattern: withPermission → parse multipart → execute use case → return safe response.
 * Validates file size (max 10MB) and MIME type in use case.
 *
 * Migrated to withPermission pattern per Requirements 2.1, 2.2, 2.3.
 *
 * @see Requirements 26.2, 26.3, 26.5
 * @see Requirements 2.1 — withPermission pattern
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { UploadFileUseCase } from '@core/domains/fileStorage/usecases';

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface UploadFileSuccessResponse {
  data: {
    key: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
  };
}

interface UploadFileErrorResponse {
  code: string;
  message: string;
  correlationId: string;
}

// ---------------------------------------------------------------------------
// POST handler — Upload file
// ---------------------------------------------------------------------------

/**
 * Handler for uploading a file.
 *
 * AuthorizationContext is guaranteed to have resident:write permission
 * after withPermission validation.
 *
 * @see Permission Mapping: POST /api/files/upload → resident:write
 */
const handleUploadFile: AuthorizedRouteHandler<UploadFileSuccessResponse | UploadFileErrorResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<UploadFileSuccessResponse | UploadFileErrorResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Invalid multipart form data',
        correlationId,
      },
      { status: 400 },
    );
  }

  const file = formData.get('file');
  const domain = formData.get('domain');

  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'File is required',
        correlationId,
      },
      { status: 400 },
    );
  }

  if (!domain || typeof domain !== 'string') {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Domain is required',
        correlationId,
      },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const useCase = container.resolve<UploadFileUseCase>('uploadFileUseCase');
  const result = await useCase.execute({
    tenantId: authContext.tenantId,
    domain,
    buffer,
    originalFilename: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId) as NextResponse<UploadFileErrorResponse>;
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
};

// ---------------------------------------------------------------------------
// Export route handler with permission wrapper
// ---------------------------------------------------------------------------

/**
 * POST /api/files/upload — Upload a file (requires resident:write)
 *
 * Users with resident:write permission can upload files.
 * This includes: TENANT_OWNER, ORG_ADMIN, RT_ADMIN roles.
 *
 * @see Permission Mapping: /api/files/upload → resident:write
 */
export const POST = withPermission(
  { permissions: ['resident:write'] },
  handleUploadFile,
);
